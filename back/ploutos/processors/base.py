"""Base transaction processor interface."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Type, TypeVar, Generic
from loguru import logger
from pydantic import BaseModel
from enum import Enum

from ploutos.db.models import TransactionWithSlaves, TransactionSlaveCreate


class TransactionFilter(Enum):
    DEBIT = "debit"
    CREDIT = "credit"
    ALL = "all"


class ProcessorConfigBase(BaseModel):
    """Base configuration class for all processors."""

    transaction_filter: TransactionFilter = TransactionFilter.ALL


# TypeVar for processor-specific configuration
ConfigT = TypeVar("ConfigT", bound=ProcessorConfigBase)


# Global registry for all processors
_PROCESSOR_REGISTRY: Dict[str, Type["TransactionProcessor[Any]"]] = {}


def register_processor(
    processor_class: Type["TransactionProcessor[Any]"],
) -> Type["TransactionProcessor[Any]"]:
    """Register a processor class in the global registry.

    Usage as decorator:
        @register_processor
        class MyProcessor(TransactionProcessor):
            ...

    Args:
        processor_class: Processor class to register

    Returns:
        The processor class (for decorator usage)

    Raises:
        ValueError: If processor_type is already registered
    """
    instance = processor_class()
    processor_type = instance.processor_type

    if processor_type in _PROCESSOR_REGISTRY:
        raise ValueError(
            f"Processor type '{processor_type}' is already registered by "
            f"{_PROCESSOR_REGISTRY[processor_type].__name__}"
        )

    _PROCESSOR_REGISTRY[processor_type] = processor_class
    logger.info(f"Registered processor: {processor_type} ({processor_class.__name__})")
    return processor_class


def get_processor(processor_type: str) -> Type["TransactionProcessor[Any]"]:
    """Get a processor class by type.

    Args:
        processor_type: Type identifier of the processor

    Returns:
        Processor class

    Raises:
        KeyError: If processor type is not registered
    """
    if processor_type not in _PROCESSOR_REGISTRY:
        available = ", ".join(_PROCESSOR_REGISTRY.keys()) or "none"
        raise KeyError(
            f"Processor type '{processor_type}' not found. "
            f"Available processors: {available}"
        )
    return _PROCESSOR_REGISTRY[processor_type]


def list_processors() -> List[str]:
    """List all registered processor types.

    Returns:
        List of processor type identifiers
    """
    return list(_PROCESSOR_REGISTRY.keys())


class TransactionProcessor(ABC, Generic[ConfigT]):
    """Abstract base class for transaction processors.

    All processors must implement:
    - processor_type: Property for processor type identifier
    - config_class: Pydantic model class for configuration
    - process(): Generate slave transactions from master
    - can_process(): Check if transaction is processable
    """

    @property
    @abstractmethod
    def processor_type(self) -> str:
        """Return processor type identifier.

        Returns:
            str: Processor type (e.g., 'simple_split', 'loan', 'salary')
        """
        ...

    @property
    @abstractmethod
    def config_class(self) -> type[ConfigT]:
        """Return the Pydantic config class for this processor.

        Returns:
            type[ConfigT]: Pydantic model class for configuration
        """
        ...

    def validate_config(self, config: dict) -> ConfigT:
        """Validate and return typed processor configuration.

        Args:
            config: Raw configuration dictionary

        Returns:
            Validated configuration object (Pydantic model specific to processor)

        Raises:
            ValidationError: If configuration is invalid
        """
        return self.config_class(**config)

    @abstractmethod
    def process(self, transaction: TransactionWithSlaves, config: ConfigT) -> dict:
        """Process transaction and generate slave transactions.

        Args:
            transaction: Transaction with slaves (Pydantic model)
            config: Validated processor configuration (Pydantic model)

        Returns:
            ProcessorResult dict with structure:
                {
                    "success": bool,
                    "slaves": List[TransactionSlaveCreate],
                    "error_message": Optional[str]
                }
        """
        ...

    def _validate_transaction(
        self,
        transaction: TransactionWithSlaves,
        new_slaves: List[TransactionSlaveCreate],
    ) -> None:
        """Validate transaction can be processed and balance is correct.

        Checks:
        1. Transaction has exactly 1 slave pointing to Unknown account
        2. New slaves balance equals master transaction amount

        Args:
            transaction: Master transaction with current slaves
            new_slaves: New slave transactions to create

        Raises:
            ValueError: If transaction cannot be processed or balance is incorrect
        """
        # Check 1: Must have exactly 1 slave
        if len(transaction.TransactionsSlaves) != 1:
            raise ValueError(
                f"Transaction {transaction.transactionId} has {len(transaction.TransactionsSlaves)} slaves, "
                f"expected 1"
            )

        # Check 2: Slave must point to Unknown account
        slave = transaction.TransactionsSlaves[0]
        slave_account = slave.Accounts

        is_unknown = (
            slave_account.name == "Unknown"
            and slave_account.category == "Unknown"
            and slave_account.sub_category == "Unknown"
            and slave_account.is_real is False
        )

        if not is_unknown:
            raise ValueError(
                f"Transaction {transaction.transactionId} slave points to "
                f"{slave_account.name}, not Unknown"
            )

        # Check 3: Validate balance
        master_amount = transaction.amount
        master_type = transaction.type.lower()

        # Calculate totals by type (amounts are absolute values)
        total_credit = sum(s.amount for s in new_slaves if s.type == "credit")
        total_debit = sum(s.amount for s in new_slaves if s.type == "debit")

        # Apply signs: debit = -, credit = +
        # Round to 2 decimals to avoid floating point precision errors
        signed_master = round(
            -master_amount if master_type == "debit" else master_amount, 2
        )

        # Formula: master_amount = -(slave_credit - slave_debit)
        # Round to 2 decimals to avoid floating point precision errors
        signed_slaves = round(-(total_credit - total_debit), 2)

        # Strict balance validation (comparing rounded values)
        if signed_master != signed_slaves:
            raise ValueError(
                f"Balance mismatch: master {master_type} {master_amount} (signed: {signed_master}), "
                f"slaves credit {total_credit}, debit {total_debit} (signed sum: {signed_slaves}). "
                f"Formula: master_amount = -(slave_credit - slave_debit)"
            )

        logger.debug(
            f"Transaction {transaction.transactionId} validated: "
            f"master {master_type} {master_amount} = "
            f"-(slaves credit {total_credit} - debit {total_debit})"
        )
