"""Base transaction processor interface."""

from abc import ABC, abstractmethod
from typing import List
from loguru import logger


class TransactionProcessor(ABC):
    """Abstract base class for transaction processors.

    All processors must implement:
    - validate_config(): Validate processor configuration schema
    - process(): Generate slave transactions from master
    - can_process(): Check if transaction is processable
    """

    @abstractmethod
    def processor_type(self) -> str:
        """Return processor type identifier.

        Returns:
            str: Processor type (e.g., 'simple_split', 'loan', 'salary')
        """
        ...

    @abstractmethod
    def validate_config(self, config: dict):
        """Validate and return typed processor configuration.

        Args:
            config: Raw configuration dictionary

        Returns:
            Validated configuration object (Pydantic model)

        Raises:
            ValidationError: If configuration is invalid
        """
        ...

    @abstractmethod
    def process(self, transaction: dict, config: dict) -> dict:
        """Process transaction and generate slave transactions.

        Args:
            transaction: Master transaction dict with structure:
                {
                    "transactionId": UUID,
                    "description": str,
                    "date": str (ISO format),
                    "amount": float,
                    "type": str ("credit" or "debit"),
                    "accountId": UUID,
                    "TransactionsSlaves": [...]
                }
            config: Processor configuration dict

        Returns:
            ProcessorResult dict with structure:
                {
                    "success": bool,
                    "slaves": List[TransactionSlaveCreate],
                    "error_message": Optional[str]
                }
        """
        ...

    def can_process(self, transaction: dict) -> bool:
        """Check if transaction is processable.

        A transaction is processable if:
        - It has exactly 1 slave transaction
        - The slave points to the "Unknown" account

        Args:
            transaction: Transaction dict with TransactionsSlaves

        Returns:
            bool: True if transaction can be processed
        """
        slaves = transaction.get("TransactionsSlaves", [])

        # Must have exactly 1 slave
        if len(slaves) != 1:
            logger.debug(
                f"Transaction {transaction.get('transactionId')} has {len(slaves)} slaves, "
                f"expected 1"
            )
            return False

        slave = slaves[0]
        slave_account = slave.get("Accounts", {})

        # Slave must point to Unknown account
        is_unknown = (
            slave_account.get("name") == "Unknown"
            and slave_account.get("category") == "Unknown"
            and slave_account.get("sub_category") == "Unknown"
            and slave_account.get("is_real") is False
        )

        if not is_unknown:
            logger.debug(
                f"Transaction {transaction.get('transactionId')} slave points to "
                f"{slave_account.get('name')}, not Unknown"
            )
            return False

        return True

    def _validate_balance(self, transaction: dict, slaves: List) -> None:
        """Validate that slaves balance equals master transaction amount.

        The sum of slave amounts must equal the master transaction amount.
        Slaves must have the opposite type of the master transaction.

        Args:
            transaction: Master transaction dict
            slaves: List of TransactionSlaveCreate objects

        Raises:
            ValueError: If balance doesn't match
        """
        master_amount = transaction["amount"]
        master_type = transaction["type"].lower()

        # Calculate totals by type
        total_debit = sum(s.amount for s in slaves if s.type == "debit")
        total_credit = sum(s.amount for s in slaves if s.type == "credit")

        # Expected: slaves have opposite type of master
        if master_type == "debit":
            expected = master_amount
            actual = total_credit
            expected_slave_type = "credit"
        else:
            expected = master_amount
            actual = total_debit
            expected_slave_type = "debit"

        # Allow small floating point errors (1 cent)
        if abs(expected - actual) > 0.01:
            raise ValueError(
                f"Balance mismatch: master {master_type} {master_amount}, "
                f"but slaves {expected_slave_type} total {actual}. "
                f"Expected {expected}, got {actual}"
            )

        logger.debug(
            f"Balance validated: master {master_type} {master_amount} = "
            f"slaves {expected_slave_type} {actual}"
        )
