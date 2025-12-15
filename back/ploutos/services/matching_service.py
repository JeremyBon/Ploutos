"""Matching Service - Business logic for automatic transaction categorization."""

from datetime import datetime
from typing import List

from loguru import logger

from ploutos.db.models import (
    TransactionWithSlaves,
    TransactionSlaveCreate,
    MatchType,
    LogicalOperator,
)
from ploutos.processors.base import get_processor


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


def _build_base_query(db, rule: dict):
    """Build base query for Unknown transactions.

    Args:
        db: Supabase client
        rule: Rule containing account_ids and processor_config

    Returns:
        Base query with Unknown account filter applied
    """
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
        .eq("TransactionsSlaves.Accounts.name", "Unknown")
        .eq("TransactionsSlaves.Accounts.category", "Unknown")
        .eq("TransactionsSlaves.Accounts.sub_category", "Unknown")
        .eq("TransactionsSlaves.Accounts.is_real", False)
    )

    # Apply account filter if specified
    account_filter = rule.get("account_ids")
    if account_filter:
        query = query.in_("accountId", account_filter)

    # Apply transaction type filter if specified
    transaction_type_filter = rule.get("processor_config", {}).get("transaction_filter")
    if transaction_type_filter and transaction_type_filter != "all":
        query = query.eq("type", transaction_type_filter)

    return query


def _apply_condition_filter(query, condition: dict):
    """Apply a single condition filter to a query.

    Args:
        query: Supabase query builder
        condition: Dict with match_type and match_value

    Returns:
        Query with condition filter applied
    """
    match_type = condition["match_type"]
    value = condition["match_value"]

    # Description matching
    if match_type == MatchType.CONTAINS.value:
        return query.ilike("description", f"%{value}%")
    elif match_type == MatchType.STARTS_WITH.value:
        return query.ilike("description", f"{value}%")
    elif match_type == MatchType.EXACT.value:
        return query.ilike("description", value)
    elif match_type == MatchType.REGEX.value:
        return query.filter("description", "~*", value)

    # Amount matching
    elif match_type == MatchType.AMOUNT_GT.value:
        return query.gt("amount", float(value))
    elif match_type == MatchType.AMOUNT_LT.value:
        return query.lt("amount", float(value))
    elif match_type == MatchType.AMOUNT_GTE.value:
        return query.gte("amount", float(value))
    elif match_type == MatchType.AMOUNT_LTE.value:
        return query.lte("amount", float(value))
    elif match_type == MatchType.AMOUNT_EQ.value:
        return query.eq("amount", float(value))

    else:
        raise ValueError(f"Unknown match type: {match_type}")


def _filter_single_slave(transactions: List[dict]) -> List[dict]:
    """Filter to ensure exactly 1 slave per transaction."""
    return [tx for tx in transactions if len(tx.get("TransactionsSlaves", [])) == 1]


async def _match_and_conditions(
    db, rule: dict, conditions: List[dict], page_size: int
) -> List[dict]:
    """Match transactions where ALL conditions are true (AND logic).

    Chains all condition filters in a single query.

    Args:
        db: Supabase client
        rule: Rule for base query filters
        conditions: List of conditions to AND together
        page_size: Max results to return

    Returns:
        List of matching transactions
    """
    if not conditions:
        return []

    all_matched = []
    offset = 0

    while True:
        query = _build_base_query(db, rule)

        # Chain all conditions (AND logic)
        for condition in conditions:
            query = _apply_condition_filter(query, condition)

        response = query.range(offset, offset + page_size - 1).execute()

        if not response.data:
            break

        filtered = _filter_single_slave(response.data)
        all_matched.extend(filtered)

        if len(response.data) < page_size:
            break

        offset += page_size

    return all_matched


async def _match_or_conditions(
    db, rule: dict, conditions: List[dict], page_size: int
) -> List[dict]:
    """Match transactions where ANY condition is true (OR logic).

    Executes separate queries for each condition and unions results.

    Args:
        db: Supabase client
        rule: Rule for base query filters
        conditions: List of conditions to OR together
        page_size: Max results per condition

    Returns:
        List of matching transactions (deduplicated)
    """
    all_matched = {}

    for condition in conditions:
        offset = 0
        while True:
            query = _build_base_query(db, rule)
            query = _apply_condition_filter(query, condition)
            response = query.range(offset, offset + page_size - 1).execute()

            if not response.data:
                break

            for tx in _filter_single_slave(response.data):
                tx_id = tx["transactionId"]
                if tx_id not in all_matched:
                    all_matched[tx_id] = tx

            if len(response.data) < page_size:
                break

            offset += page_size

    return list(all_matched.values())


async def find_matching_transactions(
    db, rule: dict, page_size: int = 1000
) -> List[dict]:
    """Find transactions matching a rule with compound conditions.

    Supports condition_groups with AND/OR logic:
    - Groups are OR'd together (union of results)
    - Conditions within a group use the group's operator

    Args:
        db: Supabase client
        rule: Categorization rule with condition_groups
        page_size: Number of results per page

    Returns:
        List of transactions matching the rule
    """
    condition_groups = rule.get("condition_groups", [])

    if not condition_groups:
        logger.warning(f"Rule '{rule.get('description')}' has no condition_groups")
        return []

    all_matched = {}

    # Groups are OR'd together
    for group in condition_groups:
        operator = group.get("operator", LogicalOperator.AND.value)
        conditions = group.get("conditions", [])

        if not conditions:
            continue

        if operator == LogicalOperator.AND.value:
            matched = await _match_and_conditions(db, rule, conditions, page_size)
        else:  # OR
            matched = await _match_or_conditions(db, rule, conditions, page_size)

        # Union results from all groups
        for tx in matched:
            tx_id = tx["transactionId"]
            if tx_id not in all_matched:
                all_matched[tx_id] = tx

    logger.debug(
        f"Matched {len(all_matched)} transactions for rule '{rule.get('description')}'"
    )

    return list(all_matched.values())


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
