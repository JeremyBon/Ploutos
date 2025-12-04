"""Tests for LoanProcessor - Loan repayment decomposition into principal and interest."""

from datetime import date, datetime
from uuid import UUID

import pytest
from pydantic import ValidationError

from ploutos.db.models import (
    Account,
    TransactionSlaveWithAccount,
    TransactionWithSlaves,
)
from ploutos.processors.loan import (
    LoanConfig,
    LoanProcessor,
    calculate_monthly_payment,
    calculate_payment_breakdown,
    get_payment_number,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def loan_processor():
    """Instance of LoanProcessor for testing."""
    return LoanProcessor()


@pytest.fixture
def valid_loan_config():
    """Valid loan configuration for testing."""
    return {
        "loan_amount": 200000.0,
        "annual_rate": 1.5,
        "duration_months": 240,
        "start_date": "2024-01-01",
        "capital_account_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
        "interest_account_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
    }


@pytest.fixture
def loan_transaction(correct_unknown_account, sample_accounts):
    """Transaction representing a loan payment.

    - Type: debit (money leaving account)
    - Amount: 850.00
    - Date: 2024-02-15 (2nd month)
    - Has 1 slave to Unknown account
    """
    account_id = UUID(sample_accounts[0]["accountId"])
    unknown_account_id = UUID(correct_unknown_account["accountId"])

    unknown_account_obj = Account(
        accountId=unknown_account_id,
        name=correct_unknown_account["name"],
        category=correct_unknown_account["category"],
        sub_category=correct_unknown_account["sub_category"],
        is_real=correct_unknown_account["is_real"],
        original_amount=correct_unknown_account["original_amount"],
        created_at=datetime.fromisoformat(
            correct_unknown_account["created_at"].replace("Z", "+00:00")
        ),
        updated_at=datetime.fromisoformat(
            correct_unknown_account["updated_at"].replace("Z", "+00:00")
        ),
    )

    master_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

    return TransactionWithSlaves(
        transactionId=master_id,
        description="Loan payment",
        date=datetime(2024, 2, 15),
        type="debit",
        amount=850.00,
        accountId=account_id,
        created_at=datetime(2024, 2, 15),
        updated_at=datetime(2024, 2, 15),
        TransactionsSlaves=[
            TransactionSlaveWithAccount(
                slaveId=UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
                type="credit",
                amount=850.00,
                date=datetime(2024, 2, 15),
                accountId=unknown_account_id,
                masterId=master_id,
                created_at=datetime(2024, 2, 15),
                updated_at=datetime(2024, 2, 15),
                Accounts=unknown_account_obj,
            )
        ],
    )


# =============================================================================
# Configuration Validation Tests
# =============================================================================


def test_loan_config_valid():
    """Valid loan configuration should pass validation."""
    config = LoanConfig(
        loan_amount=200000.0,
        annual_rate=1.5,
        duration_months=240,
        start_date=date(2024, 1, 1),
        capital_account_id=UUID("cccccccc-cccc-cccc-cccc-cccccccccccc"),
        interest_account_id=UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
    )

    assert config.loan_amount == 200000.0
    assert config.annual_rate == 1.5
    assert config.duration_months == 240


@pytest.mark.parametrize(
    "loan_amount,expected_error",
    [
        (0, "Input should be greater than 0"),
        (-100000, "Input should be greater than 0"),
        (-0.01, "Input should be greater than 0"),
    ],
)
def test_loan_config_invalid_loan_amount(loan_amount, expected_error):
    """Loan amount must be positive."""
    with pytest.raises(ValidationError, match=expected_error):
        LoanConfig(
            loan_amount=loan_amount,
            annual_rate=1.5,
            duration_months=240,
            start_date=date(2024, 1, 1),
            capital_account_id=UUID("cccccccc-cccc-cccc-cccc-cccccccccccc"),
            interest_account_id=UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
        )


@pytest.mark.parametrize(
    "annual_rate,expected_error",
    [
        (-1, "Input should be greater than or equal to 0"),
        (-0.5, "Input should be greater than or equal to 0"),
        (101, "Input should be less than or equal to 100"),
        (150, "Input should be less than or equal to 100"),
    ],
)
def test_loan_config_invalid_annual_rate(annual_rate, expected_error):
    """Annual rate must be between 0 and 100."""
    with pytest.raises(ValidationError, match=expected_error):
        LoanConfig(
            loan_amount=200000.0,
            annual_rate=annual_rate,
            duration_months=240,
            start_date=date(2024, 1, 1),
            capital_account_id=UUID("cccccccc-cccc-cccc-cccc-cccccccccccc"),
            interest_account_id=UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
        )


def test_loan_config_high_annual_rate_warning():
    """Annual rate > 50% should not fail (warning logged separately)."""
    config = LoanConfig(
        loan_amount=10000.0,
        annual_rate=60.0,  # Very high rate
        duration_months=12,
        start_date=date(2024, 1, 1),
        capital_account_id=UUID("cccccccc-cccc-cccc-cccc-cccccccccccc"),
        interest_account_id=UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
    )

    assert config.annual_rate == 60.0
    # Config should be valid even with high rate (warning logged via loguru)


@pytest.mark.parametrize(
    "duration_months,expected_error",
    [
        (0, "Input should be greater than 0"),
        (-12, "Input should be greater than 0"),
        (-1, "Input should be greater than 0"),
    ],
)
def test_loan_config_invalid_duration_months(duration_months, expected_error):
    """Duration must be positive."""
    with pytest.raises(ValidationError, match=expected_error):
        LoanConfig(
            loan_amount=200000.0,
            annual_rate=1.5,
            duration_months=duration_months,
            start_date=date(2024, 1, 1),
            capital_account_id=UUID("cccccccc-cccc-cccc-cccc-cccccccccccc"),
            interest_account_id=UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
        )


# =============================================================================
# Helper Function Tests - calculate_monthly_payment
# =============================================================================


def test_calculate_monthly_payment_standard_loan():
    """Test monthly payment calculation for standard loan."""
    # 200k at 1.5% for 240 months
    payment = calculate_monthly_payment(200000.0, 1.5, 240)

    # Expected: approximately 965.09€ per month
    assert 960 < payment < 970
    assert round(payment, 2) == 965.09


def test_calculate_monthly_payment_zero_interest():
    """Zero interest loan should be simple division."""
    payment = calculate_monthly_payment(12000.0, 0.0, 12)

    assert payment == 1000.0  # 12000 / 12


def test_calculate_monthly_payment_short_term():
    """Test short-term loan calculation."""
    # 10k at 3% for 12 months
    payment = calculate_monthly_payment(10000.0, 3.0, 12)

    # Expected: approximately 846.94€ per month
    assert 840 < payment < 850
    assert round(payment, 2) == 846.94


def test_calculate_monthly_payment_high_rate():
    """Test high interest rate loan."""
    # 5k at 10% for 24 months
    payment = calculate_monthly_payment(5000.0, 10.0, 24)

    # Expected: approximately 230.72€ per month
    assert 225 < payment < 235
    assert round(payment, 2) == 230.72


# =============================================================================
# Helper Function Tests - get_payment_number
# =============================================================================


def test_get_payment_number_first_month():
    """First month should return payment #1."""
    payment_num = get_payment_number(datetime(2024, 1, 15), date(2024, 1, 1))
    assert payment_num == 1


def test_get_payment_number_same_month_different_day():
    """Different days in same month should return same payment number."""
    start = date(2024, 1, 1)

    assert get_payment_number(datetime(2024, 1, 1), start) == 1
    assert get_payment_number(datetime(2024, 1, 15), start) == 1
    assert get_payment_number(datetime(2024, 1, 31), start) == 1


def test_get_payment_number_second_month():
    """Second month should return payment #2."""
    payment_num = get_payment_number(datetime(2024, 2, 15), date(2024, 1, 1))
    assert payment_num == 2


def test_get_payment_number_one_year_later():
    """12 months later should return payment #13."""
    payment_num = get_payment_number(datetime(2025, 1, 15), date(2024, 1, 1))
    assert payment_num == 13


def test_get_payment_number_last_payment():
    """240th month should return payment #240."""
    # Start 2024-01-01, 240 months = 20 years = 2044-01-01
    payment_num = get_payment_number(datetime(2044, 1, 15), date(2024, 1, 1))
    assert payment_num == 241  # 241st payment (20 years + 1 month)


def test_get_payment_number_before_start_date():
    """Transaction before start date should raise ValueError."""
    with pytest.raises(ValueError, match="before loan start date"):
        get_payment_number(datetime(2023, 12, 15), date(2024, 1, 1))


# =============================================================================
# Helper Function Tests - calculate_payment_breakdown
# =============================================================================


def test_calculate_payment_breakdown_first_payment():
    """First payment breakdown should be correct."""
    config = LoanConfig(
        loan_amount=200000.0,
        annual_rate=1.5,
        duration_months=240,
        start_date=date(2024, 1, 1),
        capital_account_id=UUID("cccccccc-cccc-cccc-cccc-cccccccccccc"),
        interest_account_id=UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
    )

    principal, interest, remaining = calculate_payment_breakdown(1, config)

    # First payment: interest = 200000 * 0.00125 = 250€, principal = 965.09 - 250 = 715.09€
    assert interest == pytest.approx(250.0, abs=0.01)
    assert principal == pytest.approx(715.09, abs=0.01)
    assert principal + interest == pytest.approx(965.09, abs=0.01)
    assert remaining == pytest.approx(200000.0 - principal, abs=0.01)


def test_calculate_payment_breakdown_last_payment():
    """Last payment should use exact remaining balance."""
    config = LoanConfig(
        loan_amount=200000.0,
        annual_rate=1.5,
        duration_months=240,
        start_date=date(2024, 1, 1),
        capital_account_id=UUID("cccccccc-cccc-cccc-cccc-cccccccccccc"),
        interest_account_id=UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
    )

    principal, interest, remaining = calculate_payment_breakdown(240, config)

    # Last payment: remaining balance should be 0
    assert remaining == 0.0
    # Principal should be much higher than interest
    assert principal > interest


def test_calculate_payment_breakdown_mid_term():
    """Mid-term payment (month 120) should be balanced."""
    config = LoanConfig(
        loan_amount=200000.0,
        annual_rate=1.5,
        duration_months=240,
        start_date=date(2024, 1, 1),
        capital_account_id=UUID("cccccccc-cccc-cccc-cccc-cccccccccccc"),
        interest_account_id=UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
    )

    principal, interest, remaining = calculate_payment_breakdown(120, config)

    # Mid-term: principal and interest more balanced
    assert principal + interest == pytest.approx(965.08, abs=0.01)
    # Remaining should be approximately half of original
    assert 90000 < remaining < 110000


def test_calculate_payment_breakdown_zero_interest():
    """Zero interest loan should have no interest component."""
    config = LoanConfig(
        loan_amount=12000.0,
        annual_rate=0.0,
        duration_months=12,
        start_date=date(2024, 1, 1),
        capital_account_id=UUID("cccccccc-cccc-cccc-cccc-cccccccccccc"),
        interest_account_id=UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
    )

    principal, interest, remaining = calculate_payment_breakdown(1, config)

    assert principal == 1000.0
    assert interest == 0.0
    assert remaining == 11000.0


# =============================================================================
# Processor Tests - process() method
# =============================================================================


def test_loan_processor_type():
    """Processor type should be 'loan'."""
    processor = LoanProcessor()
    assert processor.processor_type == "loan"


def test_loan_processor_config_class():
    """Config class should be LoanConfig."""
    processor = LoanProcessor()
    assert processor.config_class == LoanConfig


def test_loan_processor_successful_processing(
    loan_processor, valid_loan_config, correct_unknown_account, sample_accounts
):
    """Successful loan processing should return 2 slaves (principal + interest) when amount matches."""
    # Create transaction with exact expected amount for payment #2
    config_obj = LoanConfig(**valid_loan_config)
    principal, interest, _ = calculate_payment_breakdown(2, config_obj)
    exact_amount = principal + interest  # 965.09€

    account_id = UUID(sample_accounts[0]["accountId"])
    unknown_account_id = UUID(correct_unknown_account["accountId"])
    unknown_account_obj = Account(
        accountId=unknown_account_id,
        name=correct_unknown_account["name"],
        category=correct_unknown_account["category"],
        sub_category=correct_unknown_account["sub_category"],
        is_real=correct_unknown_account["is_real"],
        original_amount=correct_unknown_account["original_amount"],
        created_at=datetime.fromisoformat(
            correct_unknown_account["created_at"].replace("Z", "+00:00")
        ),
        updated_at=datetime.fromisoformat(
            correct_unknown_account["updated_at"].replace("Z", "+00:00")
        ),
    )
    master_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

    transaction = TransactionWithSlaves(
        transactionId=master_id,
        description="Loan payment",
        date=datetime(2024, 2, 15),
        type="debit",
        amount=exact_amount,
        accountId=account_id,
        created_at=datetime(2024, 2, 15),
        updated_at=datetime(2024, 2, 15),
        TransactionsSlaves=[
            TransactionSlaveWithAccount(
                slaveId=UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
                type="credit",
                amount=exact_amount,
                date=datetime(2024, 2, 15),
                accountId=unknown_account_id,
                masterId=master_id,
                created_at=datetime(2024, 2, 15),
                updated_at=datetime(2024, 2, 15),
                Accounts=unknown_account_obj,
            )
        ],
    )

    config = loan_processor.validate_config(valid_loan_config)
    result = loan_processor.process(transaction, config)

    assert result["success"] is True
    assert result["error_message"] is None
    assert len(result["slaves"]) == 2  # Only principal + interest (no unknown)

    # Check slaves have correct type (credit, inverse of debit master)
    assert all(slave.type == "credit" for slave in result["slaves"])

    # Check amounts sum to transaction amount
    total_credit = sum(s.amount for s in result["slaves"] if s.type == "credit")
    assert total_credit == pytest.approx(exact_amount, abs=0.01)


def test_loan_processor_credit_transaction_fails(
    loan_processor, loan_transaction, valid_loan_config
):
    """Credit transaction should fail (loan payments must be debit)."""
    loan_transaction.type = "credit"  # Change to credit
    config = loan_processor.validate_config(valid_loan_config)

    result = loan_processor.process(loan_transaction, config)

    assert result["success"] is False
    assert "must be debit type" in result["error_message"]
    assert result["slaves"] == []


def test_loan_processor_before_start_date(
    loan_processor, loan_transaction, valid_loan_config
):
    """Transaction before loan start date should fail."""
    loan_transaction.date = datetime(2023, 12, 15)  # Before 2024-01-01
    config = loan_processor.validate_config(valid_loan_config)

    result = loan_processor.process(loan_transaction, config)

    assert result["success"] is False
    assert "before loan start date" in result["error_message"]
    assert result["slaves"] == []


def test_loan_processor_after_loan_term(
    loan_processor, loan_transaction, valid_loan_config
):
    """Transaction after loan term should fail."""
    # 240 months = 20 years, so 2044-02-01 is payment #241 (beyond term)
    loan_transaction.date = datetime(2044, 2, 1)
    config = loan_processor.validate_config(valid_loan_config)

    result = loan_processor.process(loan_transaction, config)

    assert result["success"] is False
    assert "exceeds loan term" in result["error_message"]
    assert result["slaves"] == []


def test_loan_processor_amount_mismatch_creates_unknown_slave(
    loan_processor, loan_transaction, valid_loan_config
):
    """When amount differs from expected, capital absorbs the difference."""
    # Change transaction amount to create mismatch
    loan_transaction.amount = 860.00  # Expected ~965.09

    config = loan_processor.validate_config(valid_loan_config)
    result = loan_processor.process(loan_transaction, config)

    assert result["success"] is True
    assert len(result["slaves"]) == 2  # interest + capital

    # Interest is always theoretical (from amortization)
    interest_account_id = UUID(valid_loan_config["interest_account_id"])
    interest_slaves = [
        s for s in result["slaves"] if s.accountId == interest_account_id
    ]
    assert len(interest_slaves) == 1
    assert interest_slaves[0].amount == pytest.approx(249.11, abs=0.01)

    # Capital absorbs the difference (actual - interest)
    capital_account_id = UUID(valid_loan_config["capital_account_id"])
    capital_slaves = [s for s in result["slaves"] if s.accountId == capital_account_id]
    assert len(capital_slaves) == 1
    # Capital = 860 - 249.11 = 610.89
    assert capital_slaves[0].amount == pytest.approx(610.89, abs=0.01)

    # Balance check: master debit 860 = -(credit - debit)
    total_credit = sum(s.amount for s in result["slaves"] if s.type == "credit")
    assert abs(loan_transaction.amount) == pytest.approx(total_credit, abs=0.01)


def test_loan_processor_exact_amount_no_unknown_slave(
    loan_processor, loan_transaction, valid_loan_config
):
    """Exact amount match should create only 2 slaves (no unknown)."""
    # Calculate expected amount for payment #2
    config_obj = LoanConfig(**valid_loan_config)
    principal, interest, _ = calculate_payment_breakdown(2, config_obj)
    expected_amount = principal + interest

    # Set transaction to exact expected amount
    loan_transaction.amount = expected_amount
    loan_transaction.TransactionsSlaves[0].amount = expected_amount

    config = loan_processor.validate_config(valid_loan_config)
    result = loan_processor.process(loan_transaction, config)

    assert result["success"] is True
    assert len(result["slaves"]) == 2  # Only principal + interest

    # Verify no slave goes to Unknown account
    unknown_account_id = loan_transaction.TransactionsSlaves[0].accountId
    unknown_slaves = [s for s in result["slaves"] if s.accountId == unknown_account_id]
    assert len(unknown_slaves) == 0


def test_loan_processor_slaves_have_correct_accounts(
    loan_processor, loan_transaction, valid_loan_config
):
    """Slaves should go to correct capital and interest accounts."""
    config = loan_processor.validate_config(valid_loan_config)
    result = loan_processor.process(loan_transaction, config)

    assert result["success"] is True

    # Find capital and interest slaves
    capital_account_id = UUID(valid_loan_config["capital_account_id"])
    interest_account_id = UUID(valid_loan_config["interest_account_id"])

    capital_slaves = [s for s in result["slaves"] if s.accountId == capital_account_id]
    interest_slaves = [
        s for s in result["slaves"] if s.accountId == interest_account_id
    ]

    assert len(capital_slaves) == 1
    assert len(interest_slaves) == 1

    # Capital should be larger than interest for most payments
    # (not true for first few payments, but true for payment #2)
    assert capital_slaves[0].amount > 0
    assert interest_slaves[0].amount > 0


def test_loan_processor_slaves_have_correct_dates(
    loan_processor, loan_transaction, valid_loan_config
):
    """Slave dates should match master transaction date."""
    config = loan_processor.validate_config(valid_loan_config)
    result = loan_processor.process(loan_transaction, config)

    assert result["success"] is True

    for slave in result["slaves"]:
        assert slave.date == loan_transaction.date


def test_loan_processor_last_payment_exact_balance(loan_processor, valid_loan_config):
    """Last payment (month 240) should have remaining balance = 0."""
    # Create transaction for last payment
    config_obj = LoanConfig(**valid_loan_config)
    principal, interest, remaining = calculate_payment_breakdown(240, config_obj)

    assert remaining == 0.0

    # Verify total equals expected monthly payment
    monthly_payment = calculate_monthly_payment(
        config_obj.loan_amount, config_obj.annual_rate, config_obj.duration_months
    )
    assert principal + interest == pytest.approx(monthly_payment, abs=0.01)


# =============================================================================
# Integration Tests
# =============================================================================


def test_loan_processor_end_to_end(
    loan_processor, loan_transaction, valid_loan_config, correct_unknown_account
):
    """End-to-end test of loan processing."""
    # Setup
    config = loan_processor.validate_config(valid_loan_config)

    # Process
    result = loan_processor.process(loan_transaction, config)

    # Verify success
    assert result["success"] is True
    assert result["error_message"] is None

    # Verify slaves
    slaves = result["slaves"]
    assert len(slaves) >= 2  # At least principal + interest

    # Verify master ID
    assert all(slave.masterId == loan_transaction.transactionId for slave in slaves)

    # Verify balance: master debit = -(credit - debit)
    total_credit = sum(s.amount for s in slaves if s.type == "credit")
    total_debit = sum(s.amount for s in slaves if s.type == "debit")
    assert abs(loan_transaction.amount) == pytest.approx(
        total_credit - total_debit, abs=0.01
    )

    # Check that there are principal and interest slaves
    capital_account_id = UUID(valid_loan_config["capital_account_id"])
    interest_account_id = UUID(valid_loan_config["interest_account_id"])

    capital_slaves = [s for s in slaves if s.accountId == capital_account_id]
    interest_slaves = [s for s in slaves if s.accountId == interest_account_id]

    assert len(capital_slaves) == 1
    assert len(interest_slaves) == 1
