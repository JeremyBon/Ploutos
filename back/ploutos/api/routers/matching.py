"""Matching API Router - Automatic transaction categorization."""

from typing import List

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel, Field

from ploutos.api.deps import SessionDep
from ploutos.db.models import MatchType, TransactionWithSlaves
from ploutos.services.matching_service import (
    apply_processor_to_transaction,
    count_uncategorized_transactions,
    find_matching_transactions,
)

router = APIRouter()


# Response Models
class CategorizationDetail(BaseModel):
    """Detail of a single categorization."""

    transaction_id: str
    description: str
    matched_rule: str | None
    match_type: MatchType | None


class MatchingProcessResult(BaseModel):
    """Result of the matching process."""

    success: bool
    message: str | None = None
    processed: int
    categorized: int
    failed: int
    details: List[CategorizationDetail] = Field(default_factory=list)


class MatchingStats(BaseModel):
    """Statistics about matching rules and transactions."""

    total_enabled_rules: int
    total_uncategorized_transactions: int
    rules: List[dict] = Field(default_factory=list)


class PreviewMatch(BaseModel):
    """Details of a single transaction match in preview mode."""

    transaction_id: str
    description: str
    amount: float
    date: str


class MatchingPreviewResult(BaseModel):
    """Result of the matching preview for a specific rule (dry-run)."""

    success: bool
    message: str | None = None
    rule_id: str
    rule_description: str
    total_matches: int
    matches: List[PreviewMatch] = Field(default_factory=list)


@router.post("/matching/process", response_model=MatchingProcessResult)
async def process_matching(db: SessionDep):
    """Apply all enabled categorization rules to uncategorized transactions.

    NEW ARCHITECTURE:
    Separates MATCHING (SQL filters) from PROCESSING (slave updates):

    for each rule:
        matched_transactions = SQL_FILTER(description WHERE LIKE/REGEX pattern)
        for each matched_transaction:
            UPDATE slaves (delete Unknown, insert categorized)

    Workflow:
    1. Load all enabled rules from CategorizationRules table (ordered by priority desc)
    2. For each rule, find matching transactions using SQL filters (ILIKE/REGEX)
    3. For each matched transaction, update slaves in database
    4. Return summary with details of all categorizations

    Returns:
        MatchingProcessResult with summary and details of categorizations
    """
    try:
        # 1. Load enabled rules from database (ordered by priority)
        rules_response = (
            db.table("CategorizationRules")
            .select("*")
            .eq("enabled", True)
            .order("priority", desc=True)
            .execute()
        )

        if not rules_response.data:
            logger.info("No enabled rules found")
            return MatchingProcessResult(
                success=True,
                message="No enabled rules found",
                processed=0,
                categorized=0,
                failed=0,
                details=[],
            )

        logger.info(f"Loaded {len(rules_response.data)} enabled rules")

        # 2. Process each rule: MATCHING + PROCESSING
        results = {"processed": 0, "categorized": 0, "failed": 0, "details": []}
        processed_transaction_ids = set()  # Track to avoid duplicates
        for rule in rules_response.data:
            logger.info(
                f"Processing rule: '{rule['description']}' (priority {rule['priority']})"
            )

            # MATCHING: Find transactions matching this rule using SQL filters
            matched_txs = await find_matching_transactions(db, rule)

            if not matched_txs:
                logger.debug(f"No matches found for rule '{rule['description']}'")
                continue

            # PROCESSING: Update slaves for each matched transaction
            for tx_dict in matched_txs:
                transaction_id = tx_dict["transactionId"]

                # Skip if already processed (higher priority rule already matched)
                if transaction_id in processed_transaction_ids:
                    logger.debug(
                        f"Transaction {transaction_id} already processed, skipping"
                    )
                    continue

                results["processed"] += 1

                try:
                    # Convert to Pydantic model
                    tx = TransactionWithSlaves(**tx_dict)

                    # Get processor config from rule
                    processor_type = rule.get("processor_type", "simple_split")
                    processor_config = rule.get("processor_config", {})

                    # Apply processor to transaction (handles DB updates)
                    processor_result = await apply_processor_to_transaction(
                        db, tx, processor_type, processor_config
                    )
                    if processor_result["success"]:
                        results["categorized"] += 1
                        processed_transaction_ids.add(transaction_id)

                        results["details"].append(
                            {
                                "transaction_id": str(tx.transactionId),
                                "description": tx.description,
                                "matched_rule": rule["description"],
                                "match_type": None,
                            }
                        )

                        logger.debug(
                            f"Categorized transaction {tx.transactionId} "
                            f"using rule '{rule['description']}'"
                        )
                    else:
                        error_msg = processor_result.get(
                            "error_message", "Unknown error"
                        )
                        raise RuntimeError(
                            f"Failed to process transaction {transaction_id} "
                            f"with rule '{rule['description']}': {error_msg}"
                        )

                except Exception as e:
                    logger.error(
                        f"Error processing transaction {transaction_id}: {e}",
                    )

                    results["failed"] += 1

        logger.info(
            f"Matching complete: {results['categorized']}/{results['processed']} "
            f"transactions categorized using {len(rules_response.data)} rules"
        )

        return MatchingProcessResult(
            success=True,
            message=f"Processed {results['processed']} transactions",
            processed=results["processed"],
            categorized=results["categorized"],
            failed=results["failed"],
            details=results["details"],
        )

    except Exception as e:
        logger.error(f"Error in matching process: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/matching/stats", response_model=MatchingStats)
async def get_matching_stats(db: SessionDep):
    """Get statistics about categorization rules and uncategorized transactions.

    Returns:
        MatchingStats with counts and rule details
    """
    try:
        # Get enabled rules
        rules_response = (
            db.table("CategorizationRules")
            .select("*")
            .eq("enabled", True)
            .order("priority", desc=True)
            .execute()
        )

        # Get uncategorized transactions count
        uncategorized_count = await count_uncategorized_transactions(db)

        return MatchingStats(
            total_enabled_rules=len(rules_response.data),
            total_uncategorized_transactions=uncategorized_count,
            rules=rules_response.data,
        )

    except Exception as e:
        logger.error(f"Error getting matching stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/matching/preview/{rule_id}", response_model=MatchingPreviewResult)
async def preview_rule_matching(rule_id: str, db: SessionDep):
    """Preview which transactions would match a specific rule (dry-run).

    This endpoint shows which transactions would be affected by a rule
    WITHOUT actually applying any changes to the database.

    Args:
        rule_id: UUID of the categorization rule to preview

    Returns:
        MatchingPreviewResult with list of matching transactions
    """
    try:
        # Load the specific rule
        rule_response = (
            db.table("CategorizationRules").select("*").eq("ruleId", rule_id).execute()
        )

        if not rule_response.data:
            raise HTTPException(status_code=404, detail=f"Rule {rule_id} not found")

        rule = rule_response.data[0]

        logger.info(f"Previewing rule: '{rule['description']}'")

        # Find matching transactions using existing logic
        matched_txs = await find_matching_transactions(db, rule)

        # Convert to preview matches
        matches = []
        for tx_dict in matched_txs:
            matches.append(
                PreviewMatch(
                    transaction_id=str(tx_dict["transactionId"]),
                    description=tx_dict["description"],
                    amount=tx_dict["amount"],
                    date=tx_dict["date"],
                )
            )

        logger.info(
            f"Preview complete for rule '{rule['description']}': "
            f"{len(matches)} transactions would match"
        )

        return MatchingPreviewResult(
            success=True,
            message=f"Found {len(matches)} matching transactions",
            rule_id=str(rule["ruleId"]),
            rule_description=rule["description"],
            total_matches=len(matches),
            matches=matches,
        )

    except Exception as e:
        logger.error(f"Error in matching preview: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
