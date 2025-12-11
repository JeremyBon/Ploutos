"""Simple Split Processor - Split transaction by fixed percentages."""

from typing import List
from uuid import UUID
from pydantic import BaseModel, Field, field_validator

from ploutos.db.models import TransactionWithSlaves, TransactionSlaveCreate
from ploutos.processors.base import (
    ProcessorConfigBase,
    TransactionProcessor,
    register_processor,
)


class SplitItem(BaseModel):
    """Configuration for a single split item."""

    account_id: UUID = Field(..., description="Target account UUID")
    percentage: float = Field(
        ..., description="Percentage of master amount", gt=0, le=100
    )


class SimpleSplitConfig(ProcessorConfigBase):
    """Configuration for SimpleSplitProcessor.

    Example:
        {
            "splits": [
                {"account_id": "uuid-alim", "percentage": 70},
                {"account_id": "uuid-menage", "percentage": 30}
            ]
        }
    """

    splits: List[SplitItem] = Field(..., description="List of splits", min_length=1)

    @field_validator("splits")
    @classmethod
    def validate_percentages(cls, v: List[SplitItem]) -> List[SplitItem]:
        """Validate that percentages sum to 100."""
        total = sum(item.percentage for item in v)
        if abs(total - 100.0) != 0:
            raise ValueError(f"Split percentages must sum to 100%, got {total}%")
        return v


@register_processor
class SimpleSplitProcessor(TransactionProcessor[SimpleSplitConfig]):
    """Processor for splitting transactions by fixed percentages.

    Usage: Split a transaction across multiple categories with fixed percentages.

    Example: Carrefour groceries = 70% Food + 30% Household products
    """

    @property
    def processor_type(self) -> str:
        """Return processor type identifier."""
        return "simple_split"

    @property
    def config_class(self) -> type[SimpleSplitConfig]:
        """Return configuration class."""
        return SimpleSplitConfig

    def process(  # type: ignore[override]
        self, transaction: TransactionWithSlaves, config: SimpleSplitConfig
    ) -> dict:
        """Process transaction and generate slave transactions.

        Args:
            transaction: Master transaction with slaves
            config: Validated processor configuration

        Returns:
            ProcessorResult dict with success status and generated slaves
        """
        try:
            # Determine inverted type for slaves
            slave_type = "debit" if transaction.type.lower() == "credit" else "credit"

            # Generate slave transactions
            new_slaves: List[TransactionSlaveCreate] = []
            master_amount_abs = abs(transaction.amount)

            # Process all splits except the last one
            for split in config.splits[:-1]:
                # Calculate amount with rounding
                split_amount = round(master_amount_abs * split.percentage / 100.0, 2)

                # Create slave transaction
                slave = TransactionSlaveCreate(
                    masterId=transaction.transactionId,
                    accountId=split.account_id,
                    amount=split_amount,
                    type=slave_type,
                    date=transaction.date,
                )
                new_slaves.append(slave)

            # Last split: adjust for rounding errors
            # Calculate remaining amount to ensure total equals master exactly
            sum_previous = sum(s.amount for s in new_slaves)
            last_amount = master_amount_abs - sum_previous

            last_split = config.splits[-1]
            last_slave = TransactionSlaveCreate(
                masterId=transaction.transactionId,
                accountId=last_split.account_id,
                amount=last_amount,
                type=slave_type,
                date=transaction.date,
            )
            new_slaves.append(last_slave)

            # Validate transaction balance
            self._validate_transaction(transaction, new_slaves)

            return {
                "success": True,
                "slaves": new_slaves,
                "error_message": None,
            }

        except Exception as e:
            return {
                "success": False,
                "slaves": [],
                "error_message": str(e),
            }
