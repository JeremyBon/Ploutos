"""Matching Service - Business logic for automatic transaction categorization."""

from datetime import datetime
from typing import List

from loguru import logger

from ploutos.db.models import TransactionWithSlaves, TransactionSlaveCreate
from ploutos.processors.base import get_processor


class MatchType:
    CONTAINS = "contains"
    STARTS_WITH = "starts_with"
    EXACT = "exact"
    REGEX = "regex"


async def apply_processor_to_transaction(
    db,
    transaction: TransactionWithSlaves,
    processor_type: str,
    processor_config: dict,
) -> dict:
    """Apply a processor to a transaction and persist the result to database.

    This function:
    1. Gets the processor instance
    2. Runs the processor to generate new slaves
    3. Deletes old Unknown slave
    4. Inserts new categorized slaves to database

    Args:
        db: Supabase client
        transaction: Transaction to process
        processor_type: Type of processor to use (e.g., "simple_split")
        processor_config: Configuration for the processor

    Returns:
        Processor result dict with success status and slaves
    """
    try:
        # Get processor instance
        processor_class = get_processor(processor_type)
        processor = processor_class()

        # Validate and process transaction
        validated_config = processor.validate_config(processor_config)
        result = processor.process(transaction, validated_config)

        if not result["success"]:
            return result

        # Apply to database: delete old slave, insert new ones
        # Delete existing Unknown slave
        for slave in transaction.TransactionsSlaves:
            db.table("TransactionsSlaves").delete().eq(
                "slaveId", str(slave.slaveId)
            ).execute()

        # Insert new categorized slaves
        new_slaves: List[TransactionSlaveCreate] = result["slaves"]
        for slave in new_slaves:
            db.table("TransactionsSlaves").insert(
                {
                    **slave.model_dump(mode="json"),
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat(),
                }
            ).execute()

        return result

    except Exception as e:
        logger.error(f"Error applying processor to transaction: {e}")
        return {
            "success": False,
            "slaves": [],
            "error_message": str(e),
        }


async def find_matching_transactions(
    db, rule: dict, page_size: int = 1000
) -> List[dict]:
    """Find transactions matching a specific rule using SQL filters.

    This function performs the MATCHING part by filtering directly in PostgreSQL.
    Uses appropriate SQL operators based on match_type:
    - contains: ILIKE '%pattern%'
    - starts_with: ILIKE 'pattern%'
    - exact: ILIKE 'pattern'
    - regex: ~ or ~* (case insensitive)

    Args:
        db: Supabase client
        rule: Categorization rule with match_type, pattern, account_filter
        page_size: Number of results per page

    Returns:
        List of transactions matching the rule
    """
    all_matched = []
    offset = 0
    match_type = rule["match_type"]
    pattern = rule["match_value"]
    account_filter = rule.get("account_filter")
    transaction_type_filter = rule["processor_config"].get("transaction_filter")
    while True:
        # Base query for Unknown transactions
        query = (
            db.table("Transactions")
            .select(
                """
                *,
                TransactionsSlaves!inner (
                    *,
                    Accounts!inner (*)
                )
            """
            )
            # Filter for slaves with Unknown account
            .eq("TransactionsSlaves.Accounts.name", "Unknown")
            .eq("TransactionsSlaves.Accounts.category", "Unknown")
            .eq("TransactionsSlaves.Accounts.sub_category", "Unknown")
            .eq("TransactionsSlaves.Accounts.is_real", False)
        )

        # Apply description matching based on match_type
        if match_type == MatchType.CONTAINS.value:
            # Case-insensitive LIKE: WHERE description ILIKE '%pattern%'
            query = query.like("description", f"%{pattern}%")

        elif match_type == MatchType.STARTS_WITH.value:
            # Case-insensitive LIKE: WHERE description ILIKE 'pattern%'
            query = query.like("description", f"{pattern}%")

        elif match_type == MatchType.EXACT.value:
            # Case-insensitive exact match: WHERE description ILIKE 'pattern'
            query = query.like("description", pattern)

        elif match_type == MatchType.REGEX.value:
            # Case-insensitive regex: WHERE description ~* 'pattern'
            # Note: Supabase uses ~ for case-sensitive, ~* for case-insensitive
            query = query.filter("description", "~*", pattern)

        # Apply account filter if specified
        if account_filter:
            query = query.in_("accountId", account_filter)

        # Apply transaction type filter if specified
        if transaction_type_filter and transaction_type_filter != "all":
            query = query.eq("type", transaction_type_filter)

        # Apply pagination
        response = query.range(offset, offset + page_size - 1).execute()

        if not response.data:
            break

        # Filter to ensure exactly 1 slave
        filtered = [
            tx for tx in response.data if len(tx.get("TransactionsSlaves", [])) == 1
        ]
        all_matched.extend(filtered)

        # If we got less than page_size, we've reached the end
        if len(response.data) < page_size:
            break

        offset += page_size
        logger.debug(
            f"Matched {offset} transactions for rule '{rule['description']}'..."
        )

    return all_matched


async def count_uncategorized_transactions(db) -> int:
    """Count total uncategorized transactions.

    Args:
        db: Supabase client

    Returns:
        Total count of uncategorized transactions
    """
    response = (
        db.table("Transactions")
        .select(
            """
            transactionId,
            TransactionsSlaves!inner (
                Accounts!inner (*)
            )
        """
        )
        .eq("TransactionsSlaves.Accounts.name", "Unknown")
        .eq("TransactionsSlaves.Accounts.category", "Unknown")
        .eq("TransactionsSlaves.Accounts.sub_category", "Unknown")
        .eq("TransactionsSlaves.Accounts.is_real", False)
        .execute()
    )

    # Filter to ensure exactly 1 slave
    if response.data:
        filtered = [
            tx for tx in response.data if len(tx.get("TransactionsSlaves", [])) == 1
        ]
        return len(filtered)
    return 0
