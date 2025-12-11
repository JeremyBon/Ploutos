"""Categorization Rules API Router - CRUD operations for managing rules."""

from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, HTTPException
from loguru import logger

from ploutos.api.deps import SessionDep
from ploutos.db.models import CategorizationRule, CategorizationRuleCreate

router = APIRouter()


@router.get("/categorization-rules", response_model=List[CategorizationRule])
async def get_categorization_rules(db: SessionDep):
    """Get all categorization rules ordered by priority (descending).

    Returns:
        List of all categorization rules
    """
    try:
        response = (
            db.table("CategorizationRules")
            .select("*")
            .order("priority", desc=True)
            .execute()
        )

        return response.data

    except Exception as e:
        logger.error(f"Error fetching categorization rules: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/categorization-rules", response_model=CategorizationRule, status_code=201
)
async def create_categorization_rule(rule: CategorizationRuleCreate, db: SessionDep):
    """Create a new categorization rule.

    Args:
        rule: Rule data to create

    Returns:
        Created categorization rule with metadata
    """
    try:
        # Prepare rule data
        logger.debug(f"Creating categorization rule: {rule}")
        rule_data = rule.model_dump()
        rule_data["created_at"] = datetime.now().isoformat()
        rule_data["updated_at"] = datetime.now().isoformat()

        response = db.table("CategorizationRules").insert(rule_data).execute()

        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create rule")

        logger.info(
            f"Created categorization rule: {rule.description} (priority: {rule.priority})"
        )

        return response.data[0]

    except Exception as e:
        logger.error(f"Error creating categorization rule: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/categorization-rules/{rule_id}", response_model=CategorizationRule)
async def update_categorization_rule(
    rule_id: UUID, rule: CategorizationRuleCreate, db: SessionDep
):
    """Update an existing categorization rule.

    Args:
        rule_id: UUID of the rule to update
        rule: New rule data

    Returns:
        Updated categorization rule
    """
    try:
        # Check if rule exists
        existing = (
            db.table("CategorizationRules")
            .select("*")
            .eq("ruleId", str(rule_id))
            .execute()
        )

        if not existing.data:
            raise HTTPException(status_code=404, detail="Rule not found")

        # Prepare update data
        rule_data = rule.model_dump()
        rule_data["updated_at"] = datetime.now().isoformat()

        # Convert account_ids UUIDs to strings for jsonb
        if rule_data.get("account_ids"):
            rule_data["account_ids"] = [
                str(acc_id) for acc_id in rule_data["account_ids"]
            ]

        response = (
            db.table("CategorizationRules")
            .update(rule_data)
            .eq("ruleId", str(rule_id))
            .execute()
        )

        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to update rule")

        logger.info(f"Updated categorization rule: {rule_id}")

        return response.data[0]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating categorization rule {rule_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/categorization-rules/{rule_id}", status_code=204)
async def delete_categorization_rule(rule_id: UUID, db: SessionDep):
    """Delete a categorization rule.

    Args:
        rule_id: UUID of the rule to delete

    Returns:
        No content on success
    """
    try:
        # Check if rule exists
        existing = (
            db.table("CategorizationRules")
            .select("*")
            .eq("ruleId", str(rule_id))
            .execute()
        )

        if not existing.data:
            raise HTTPException(status_code=404, detail="Rule not found")

        # Delete the rule
        db.table("CategorizationRules").delete().eq("ruleId", str(rule_id)).execute()

        logger.info(f"Deleted categorization rule: {rule_id}")
        return None

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting categorization rule {rule_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch(
    "/categorization-rules/{rule_id}/toggle", response_model=CategorizationRule
)
async def toggle_categorization_rule(rule_id: UUID, db: SessionDep):
    """Toggle a categorization rule's enabled status.

    Args:
        rule_id: UUID of the rule to toggle

    Returns:
        Updated categorization rule
    """
    try:
        # Get current rule
        existing = (
            db.table("CategorizationRules")
            .select("*")
            .eq("ruleId", str(rule_id))
            .execute()
        )

        if not existing.data:
            raise HTTPException(status_code=404, detail="Rule not found")

        current_enabled = existing.data[0]["enabled"]
        new_enabled = not current_enabled

        # Update enabled status
        response = (
            db.table("CategorizationRules")
            .update({"enabled": new_enabled, "updated_at": datetime.now().isoformat()})
            .eq("ruleId", str(rule_id))
            .execute()
        )

        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to toggle rule")

        logger.info(
            f"Toggled rule {rule_id} enabled: {current_enabled} → {new_enabled}"
        )

        return response.data[0]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling categorization rule {rule_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
