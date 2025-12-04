"""Loan Processor - Decompose loan repayments into principal and interest."""

from datetime import date, datetime
from typing import List, Tuple
from uuid import UUID
from pydantic import Field, field_validator
from loguru import logger

from ploutos.db.models import TransactionWithSlaves, TransactionSlaveCreate
from ploutos.processors.base import (
    ProcessorConfigBase,
    TransactionProcessor,
    register_processor,
)


class LoanConfig(ProcessorConfigBase):
    """Configuration for LoanProcessor.

    Example:
        {
            "loan_amount": 200000.00,
            "annual_rate": 1.5,
            "duration_months": 240,
            "start_date": "2024-01-01",
            "capital_account_id": "uuid-capital",
            "interest_account_id": "uuid-interest"
        }
    """

    loan_amount: float = Field(..., description="Total loan principal amount", gt=0)
    annual_rate: float = Field(
        ...,
        description="Annual interest rate as percentage (e.g., 1.5 for 1.5%)",
        ge=0,
        le=100,
    )
    duration_months: int = Field(..., description="Total loan duration in months", gt=0)
    start_date: date = Field(..., description="Loan start date (first payment date)")
    capital_account_id: UUID = Field(
        ..., description="Account UUID for principal/capital component"
    )
    interest_account_id: UUID = Field(
        ..., description="Account UUID for interest component"
    )

    @field_validator("annual_rate")
    @classmethod
    def validate_rate(cls, v: float) -> float:
        """Ensure rate is reasonable."""
        if v > 50:
            # Warn but don't fail for very high rates (payday loans, etc.)
            logger.warning(f"Very high interest rate: {v}%")
        return v


def calculate_monthly_payment(
    principal: float, annual_rate: float, months: int
) -> float:
    """Calculate fixed monthly payment using amortization formula.

    Formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
    Where:
        M = monthly payment
        P = principal
        r = monthly interest rate
        n = number of months

    Args:
        principal: Loan amount
        annual_rate: Annual interest rate as percentage (e.g., 1.5)
        months: Loan duration in months

    Returns:
        Monthly payment amount
    """
    if annual_rate == 0:
        # No interest - simple division
        return principal / months

    monthly_rate = (annual_rate / 100) / 12

    # Amortization formula
    numerator = monthly_rate * pow(1 + monthly_rate, months)
    denominator = pow(1 + monthly_rate, months) - 1

    return principal * (numerator / denominator)


def get_payment_number(transaction_date: datetime, start_date: date) -> int:
    """Map transaction date to payment number.

    Only year and month matter - day is ignored.

    Args:
        transaction_date: Date of the transaction
        start_date: Loan start date

    Returns:
        Payment number (1-indexed)

    Raises:
        ValueError: If transaction date is before start date
    """
    tx_date = (
        transaction_date.date()
        if isinstance(transaction_date, datetime)
        else transaction_date
    )

    # Calculate month difference
    months_diff = (tx_date.year - start_date.year) * 12 + (
        tx_date.month - start_date.month
    )

    if months_diff < 0:
        raise ValueError(
            f"Transaction date {tx_date} is before loan start date {start_date}"
        )

    # Payment numbers are 1-indexed (first payment is payment #1)
    return months_diff + 1


def calculate_payment_breakdown(
    payment_number: int, config: LoanConfig
) -> Tuple[float, float, float]:
    """Calculate principal and interest for a specific payment period.

    Uses iterative approach to handle compound interest correctly.

    Args:
        payment_number: Payment number (1-indexed)
        config: Loan configuration

    Returns:
        Tuple of (principal_payment, interest_payment, remaining_balance)
    """
    monthly_payment = calculate_monthly_payment(
        config.loan_amount, config.annual_rate, config.duration_months
    )

    monthly_rate = (config.annual_rate / 100) / 12
    remaining_balance = config.loan_amount

    principal_payment = 0.0
    interest_payment = 0.0

    # Iterate through each payment up to the target payment
    for period in range(1, payment_number + 1):
        # Interest on remaining balance
        interest_payment = remaining_balance * monthly_rate

        # Principal is the remainder
        principal_payment = monthly_payment - interest_payment

        # Handle last payment
        if period == config.duration_months:
            # Last payment: use exact remaining balance
            principal_payment = remaining_balance
            interest_payment = monthly_payment - principal_payment
            remaining_balance = 0
        else:
            # Update remaining balance
            remaining_balance -= principal_payment

    return (
        round(principal_payment, 2),
        round(interest_payment, 2),
        round(remaining_balance, 2),
    )


@register_processor
class LoanProcessor(TransactionProcessor[LoanConfig]):
    """Processor for loan repayment decomposition.

    Decomposes loan payments into principal and interest components
    based on amortization schedule.

    Usage: Monthly loan payment → capital account + interest account

    Example: 850€ payment → 800€ capital + 50€ interest (varies by month)
    """

    @property
    def processor_type(self) -> str:
        """Return processor type identifier."""
        return "loan"

    @property
    def config_class(self) -> type[LoanConfig]:
        """Return configuration class."""
        return LoanConfig

    def process(  # type: ignore[override]
        self, transaction: TransactionWithSlaves, config: LoanConfig
    ) -> dict:
        """Process loan payment transaction.

        Steps:
        1. Validate transaction type is debit
        2. Determine payment number from transaction date
        3. Calculate expected principal/interest split
        4. Handle amount mismatches (difference to Unknown)
        5. Generate slaves (principal + interest + optional unknown)
        6. Validate balance

        Args:
            transaction: Master transaction (loan payment)
            config: Validated loan configuration

        Returns:
            ProcessorResult with success status and slave transactions
        """
        try:
            # Step 1: Validation préliminaire - master must be debit
            if transaction.type.lower() != "debit":
                raise ValueError(
                    f"Loan payment must be debit type, got {transaction.type}"
                )

            # Step 2: Get payment number from date
            payment_number = get_payment_number(transaction.date, config.start_date)

            # Step 3: Validate within loan term
            if payment_number > config.duration_months:
                raise ValueError(
                    f"Payment #{payment_number} exceeds loan term "
                    f"({config.duration_months} months)"
                )

            # Step 4: Calculate interest from amortization schedule
            _, interest, remaining_balance = calculate_payment_breakdown(
                payment_number, config
            )

            actual_amount = abs(transaction.amount)

            # Step 5: Generate slaves
            # Interest is always the theoretical amount from amortization
            # Capital absorbs any difference (actual_amount - interest)
            new_slaves: List[TransactionSlaveCreate] = []

            # Slave 1: Interest (theoretical from amortization)
            interest_slave = TransactionSlaveCreate(
                masterId=transaction.transactionId,
                accountId=config.interest_account_id,
                amount=interest,
                type="credit",
                date=transaction.date,
            )
            new_slaves.append(interest_slave)

            # Slave 2: Capital (actual amount minus interest)
            capital_amount = round(actual_amount - interest, 2)
            capital_slave = TransactionSlaveCreate(
                masterId=transaction.transactionId,
                accountId=config.capital_account_id,
                amount=capital_amount,
                type="credit",  # Inverse du master debit
                date=transaction.date,
            )
            new_slaves.append(capital_slave)

            # Log payment details
            logger.info(
                f"Loan payment #{payment_number}/{config.duration_months}: "
                f"Interest {interest}€, Capital {capital_amount}€, "
                f"Remaining balance {remaining_balance}€"
            )

            # Step 6: Validate transaction balance
            self._validate_transaction(transaction, new_slaves)

            return {
                "success": True,
                "slaves": new_slaves,
                "error_message": None,
            }

        except ValueError as e:
            logger.error(f"Loan processor validation error: {e}")
            return {
                "success": False,
                "slaves": [],
                "error_message": str(e),
            }

        except Exception as e:
            logger.exception(f"Unexpected error in loan processor: {e}")
            return {
                "success": False,
                "slaves": [],
                "error_message": str(e),
            }
