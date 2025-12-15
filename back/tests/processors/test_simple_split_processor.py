"""Tests for SimpleSplitProcessor.

This module tests the SimpleSplitProcessor which splits transactions by fixed
percentages across multiple accounts.
"""

from datetime import datetime
from uuid import UUID

import pytest
from pydantic import ValidationError

from ploutos.db.models import (
    Account,
    TransactionSlaveCreate,
    TransactionSlaveWithAccount,
    TransactionWithSlaves,
)
from ploutos.processors.simple_split import (
    SimpleSplitConfig,
    SimpleSplitProcessor,
    SplitItem,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def simple_split_processor():
    """SimpleSplitProcessor instance for testing."""
    return SimpleSplitProcessor()


@pytest.fixture
def base_split_transaction(correct_unknown_account):
    """Base transaction ready for splitting.

    Creates a debit transaction of 100.0 with exactly 1 slave pointing to
    the Unknown account, ready to be processed by SimpleSplitProcessor.
    """
    master_id = UUID("aaaaaaaa-1111-2222-3333-444444444444")
    slave_id = UUID("bbbbbbbb-1111-2222-3333-444444444444")
    test_date = datetime(2025, 6, 15, 14, 30, 0)

    # Create Unknown account
    unknown_account = Account(
        accountId=UUID(correct_unknown_account["accountId"]),
        name=correct_unknown_account["name"],
        category=correct_unknown_account["category"],
        sub_category=correct_unknown_account["sub_category"],
        is_real=correct_unknown_account["is_real"],
        original_amount=correct_unknown_account["original_amount"],
        active=correct_unknown_account["active"],
        created_at=datetime.fromisoformat(
            correct_unknown_account["created_at"].replace("Z", "+00:00")
        ),
        updated_at=datetime.fromisoformat(
            correct_unknown_account["updated_at"].replace("Z", "+00:00")
        ),
    )

    # Create slave pointing to Unknown
    slave = TransactionSlaveWithAccount(
        slaveId=slave_id,
        type="credit",
        amount=100.0,
        date=test_date,
        accountId=unknown_account.accountId,
        masterId=master_id,
        created_at=test_date,
        updated_at=test_date,
        Accounts=unknown_account,
    )

    # Create master transaction
    transaction = TransactionWithSlaves(
        transactionId=master_id,
        type="debit",
        amount=100.0,
        date=test_date,
        description="Test transaction",
        accountId=unknown_account.accountId,
        created_at=test_date,
        updated_at=test_date,
        TransactionsSlaves=[slave],
    )

    return transaction


@pytest.fixture
def make_split_config():
    """Factory fixture for creating SimpleSplitConfig objects.

    Usage:
        config = make_split_config([
            {"account_id": uuid1, "percentage": 70},
            {"account_id": uuid2, "percentage": 30}
        ])
    """

    def _create(splits: list[dict]) -> SimpleSplitConfig:
        return SimpleSplitConfig(splits=[SplitItem(**s) for s in splits])

    return _create


@pytest.fixture
def two_account_ids():
    """Two valid account UUIDs for split testing."""
    return [
        UUID("aaaaaaaa-aaaa-aaaa-aaaa-111111111111"),
        UUID("bbbbbbbb-bbbb-bbbb-bbbb-222222222222"),
    ]


@pytest.fixture
def three_account_ids():
    """Three valid account UUIDs for split testing."""
    return [
        UUID("aaaaaaaa-aaaa-aaaa-aaaa-111111111111"),
        UUID("bbbbbbbb-bbbb-bbbb-bbbb-222222222222"),
        UUID("cccccccc-cccc-cccc-cccc-333333333333"),
    ]


@pytest.fixture
def five_account_ids():
    """Five valid account UUIDs for split testing."""
    return [
        UUID("aaaaaaaa-aaaa-aaaa-aaaa-111111111111"),
        UUID("bbbbbbbb-bbbb-bbbb-bbbb-222222222222"),
        UUID("cccccccc-cccc-cccc-cccc-333333333333"),
        UUID("dddddddd-dddd-dddd-dddd-444444444444"),
        UUID("eeeeeeee-eeee-eeee-eeee-555555555555"),
    ]


# =============================================================================
# Helper Functions
# =============================================================================


def assert_slaves_sum_to_master(
    master_amount: float, slaves: list[TransactionSlaveCreate]
):
    """Assert that slave amounts sum exactly to master amount.

    Verifies that rounding adjustment is correct.

    Args:
        master_amount: Expected total amount
        slaves: List of slave transactions to sum
    """
    total = sum(s.amount for s in slaves)
    assert (
        abs(total - abs(master_amount)) < 0.01
    ), f"Slaves sum {total} doesn't match master {abs(master_amount)}"


# =============================================================================
# Section 1: SimpleSplitConfig Validation Tests
# =============================================================================


def test_config_valid_two_splits(make_split_config, two_account_ids):
    """Valid config with 2 splits summing to 100% should pass."""
    # Arrange: 70% + 30% = 100%
    config = make_split_config(
        [
            {"account_id": two_account_ids[0], "percentage": 70},
            {"account_id": two_account_ids[1], "percentage": 30},
        ]
    )

    # Act & Assert: Config created successfully
    assert len(config.splits) == 2
    assert config.splits[0].percentage == 70
    assert config.splits[1].percentage == 30


@pytest.mark.parametrize(
    "percentages",
    [
        [50, 50],
        [33.33, 33.33, 33.34],
        [25, 25, 25, 25],
        [10, 20, 30, 40],
        [1, 1, 1, 97],  # Edge case: tiny percentages
    ],
)
def test_config_valid_multiple_splits(percentages, three_account_ids):
    """Various valid percentage combinations should pass validation."""
    # Arrange: Create splits that sum to 100%
    splits = [
        {"account_id": three_account_ids[i % 3], "percentage": p}
        for i, p in enumerate(percentages)
    ]

    # Act: Create config
    config = SimpleSplitConfig(splits=[SplitItem(**s) for s in splits])

    # Assert: No validation error
    assert len(config.splits) == len(percentages)
    total = sum(s.percentage for s in config.splits)
    assert abs(total - 100.0) < 0.01


@pytest.mark.parametrize(
    "percentages,expected_sum",
    [
        ([50, 40], 90.0),
        ([30, 30], 60.0),
        ([99], 99.0),
        ([25, 25, 25], 75.0),
    ],
)
def test_config_invalid_percentage_sum_too_low(
    percentages, expected_sum, two_account_ids
):
    """Percentages summing to less than 100% should raise ValueError."""
    # Arrange: Splits that don't sum to 100%
    splits = [
        {"account_id": two_account_ids[i % 2], "percentage": p}
        for i, p in enumerate(percentages)
    ]

    # Act & Assert: Should raise ValueError with specific message
    with pytest.raises(
        ValueError, match=f"Split percentages must sum to 100%, got {expected_sum}%"
    ):
        SimpleSplitConfig(splits=[SplitItem(**s) for s in splits])


@pytest.mark.parametrize(
    "percentages,expected_sum",
    [
        ([60, 50], 110.0),
        ([100, 1], 101.0),
        ([50, 50, 5], 105.0),
    ],
)
def test_config_invalid_percentage_sum_too_high(
    percentages, expected_sum, two_account_ids
):
    """Percentages summing to more than 100% should raise ValueError."""
    # Arrange: Splits that exceed 100%
    splits = [
        {"account_id": two_account_ids[i % 2], "percentage": p}
        for i, p in enumerate(percentages)
    ]

    # Act & Assert: Should raise ValueError
    with pytest.raises(
        ValueError, match=f"Split percentages must sum to 100%, got {expected_sum}%"
    ):
        SimpleSplitConfig(splits=[SplitItem(**s) for s in splits])


def test_config_invalid_percentage_zero(two_account_ids):
    """Split with 0% percentage should fail (gt=0 constraint)."""
    # Arrange: One split at 0%
    splits = [
        {"account_id": two_account_ids[0], "percentage": 0},
        {"account_id": two_account_ids[1], "percentage": 100},
    ]

    # Act & Assert: Should raise ValidationError from Pydantic
    with pytest.raises(ValidationError, match="greater than 0"):
        SimpleSplitConfig(splits=[SplitItem(**s) for s in splits])


def test_config_invalid_percentage_negative(two_account_ids):
    """Split with negative percentage should fail."""
    # Arrange: One split with negative percentage
    splits = [
        {"account_id": two_account_ids[0], "percentage": -10},
        {"account_id": two_account_ids[1], "percentage": 110},
    ]

    # Act & Assert: Should raise ValidationError
    with pytest.raises(ValidationError, match="greater than 0"):
        SimpleSplitConfig(splits=[SplitItem(**s) for s in splits])


def test_config_invalid_percentage_over_100(two_account_ids):
    """Single split with >100% should fail (le=100 constraint)."""
    # Arrange: One split at 150%
    splits = [{"account_id": two_account_ids[0], "percentage": 150}]

    # Act & Assert: Should raise ValidationError
    with pytest.raises(ValidationError, match="less than or equal to 100"):
        SimpleSplitConfig(splits=[SplitItem(**s) for s in splits])


def test_config_empty_splits_list():
    """Empty splits list should fail (min_length=1)."""
    # Arrange: Empty splits

    # Act & Assert: Should raise ValidationError
    with pytest.raises(ValidationError, match="at least 1"):
        SimpleSplitConfig(splits=[])


def test_config_missing_splits_field():
    """Config without splits field should fail."""
    # Act & Assert: Should raise ValidationError
    with pytest.raises(ValidationError):
        SimpleSplitConfig()  # type: ignore


def test_config_invalid_account_id_type():
    """Non-UUID account_id should fail validation."""
    # Arrange: String instead of UUID
    splits = [{"account_id": "not-a-uuid", "percentage": 100}]

    # Act & Assert: Should raise ValidationError
    with pytest.raises(ValidationError):
        SimpleSplitConfig(splits=[SplitItem(**s) for s in splits])


def test_config_missing_account_id():
    """Split without account_id should fail."""
    # Arrange: Only percentage provided
    splits = [{"percentage": 100}]

    # Act & Assert: Should raise ValidationError
    with pytest.raises(ValidationError):
        SimpleSplitConfig(splits=[SplitItem(**s) for s in splits])  # type: ignore


# =============================================================================
# Section 2: SimpleSplitProcessor.process() - Success Cases
# =============================================================================


def test_process_debit_two_splits_simple(
    simple_split_processor, base_split_transaction, make_split_config, two_account_ids
):
    """Debit transaction split 70/30 should generate correct slaves."""
    # Arrange: Master debit 100, splits 70/30
    base_split_transaction.type = "debit"
    base_split_transaction.amount = 100.0

    config = make_split_config(
        [
            {"account_id": two_account_ids[0], "percentage": 70},
            {"account_id": two_account_ids[1], "percentage": 30},
        ]
    )

    # Act: Process transaction
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Success
    assert result["success"] is True
    assert result["error_message"] is None
    assert len(result["slaves"]) == 2

    # Assert: Amounts correct (70.0 and 30.0)
    slaves = result["slaves"]
    assert slaves[0].amount == 70.0
    assert slaves[1].amount == 30.0

    # Assert: Types inverted (master debit → slaves credit)
    assert slaves[0].type == "credit"
    assert slaves[1].type == "credit"

    # Assert: Account IDs correct
    assert slaves[0].accountId == two_account_ids[0]
    assert slaves[1].accountId == two_account_ids[1]

    # Assert: Sum equals master
    assert_slaves_sum_to_master(100.0, slaves)


def test_process_credit_two_splits_simple(
    simple_split_processor, base_split_transaction, make_split_config, two_account_ids
):
    """Credit transaction split 60/40 should generate correct slaves."""
    # Arrange: Master credit 100, splits 60/40
    base_split_transaction.type = "credit"
    base_split_transaction.amount = 100.0

    config = make_split_config(
        [
            {"account_id": two_account_ids[0], "percentage": 60},
            {"account_id": two_account_ids[1], "percentage": 40},
        ]
    )

    # Act: Process transaction
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Success
    assert result["success"] is True

    # Assert: Types inverted (master credit → slaves debit)
    slaves = result["slaves"]
    assert slaves[0].type == "debit"
    assert slaves[1].type == "debit"

    # Assert: Amounts correct
    assert slaves[0].amount == 60.0
    assert slaves[1].amount == 40.0


@pytest.mark.parametrize(
    "master_type,expected_slave_type",
    [
        ("debit", "credit"),
        ("credit", "debit"),
        ("DEBIT", "credit"),  # Case insensitive
        ("CrEdIt", "debit"),  # Mixed case
    ],
)
def test_process_type_inversion(
    master_type,
    expected_slave_type,
    simple_split_processor,
    base_split_transaction,
    make_split_config,
    two_account_ids,
):
    """Master type should be correctly inverted for slaves."""
    # Arrange: Master with specified type
    base_split_transaction.type = master_type
    config = make_split_config([{"account_id": two_account_ids[0], "percentage": 100}])

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Slave has inverted type
    assert result["slaves"][0].type == expected_slave_type


def test_process_three_way_split(
    simple_split_processor,
    base_split_transaction,
    make_split_config,
    three_account_ids,
):
    """Three-way split should generate 3 correct slaves."""
    # Arrange: 50/30/20 split
    config = make_split_config(
        [
            {"account_id": three_account_ids[0], "percentage": 50},
            {"account_id": three_account_ids[1], "percentage": 30},
            {"account_id": three_account_ids[2], "percentage": 20},
        ]
    )

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: 3 slaves with correct amounts
    assert len(result["slaves"]) == 3
    assert result["slaves"][0].amount == 50.0
    assert result["slaves"][1].amount == 30.0
    assert result["slaves"][2].amount == 20.0


def test_process_five_way_split(
    simple_split_processor, base_split_transaction, five_account_ids
):
    """Five-way equal split should work correctly."""
    # Arrange: 20% each × 5
    splits = [{"account_id": aid, "percentage": 20} for aid in five_account_ids]
    config = SimpleSplitConfig(splits=[SplitItem(**s) for s in splits])

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: 5 slaves, each 20.0
    assert len(result["slaves"]) == 5
    for slave in result["slaves"]:
        assert slave.amount == 20.0


def test_process_single_split_100_percent(
    simple_split_processor, base_split_transaction, make_split_config, two_account_ids
):
    """Single split at 100% should work (edge case)."""
    # Arrange: One split getting 100%
    config = make_split_config([{"account_id": two_account_ids[0], "percentage": 100}])

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: 1 slave with full amount
    assert len(result["slaves"]) == 1
    assert result["slaves"][0].amount == 100.0


# =============================================================================
# Section 3: Rounding Behavior Tests
# =============================================================================


def test_process_rounding_last_split_adjusted(
    simple_split_processor,
    base_split_transaction,
    make_split_config,
    three_account_ids,
):
    """Last split should be adjusted to compensate for rounding errors."""
    # Arrange: 33.33/33.33/33.34 split on 100.0
    # After rounding: 33.33 + 33.33 = 66.66
    # Last should get: 100.0 - 66.66 = 33.34
    base_split_transaction.amount = 100.0

    config = make_split_config(
        [
            {"account_id": three_account_ids[0], "percentage": 33.33},
            {"account_id": three_account_ids[1], "percentage": 33.33},
            {"account_id": three_account_ids[2], "percentage": 33.34},
        ]
    )

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: First two splits rounded normally
    slaves = result["slaves"]
    assert slaves[0].amount == 33.33  # round(100 * 0.3333, 2)
    assert slaves[1].amount == 33.33  # round(100 * 0.3333, 2)

    # Assert: Last split adjusted
    assert slaves[2].amount == 33.34  # 100.0 - 66.66

    # Assert: Sum exactly equals master
    total = sum(s.amount for s in slaves)
    assert total == 100.0


@pytest.mark.parametrize(
    "amount,percentages,expected_last",
    [
        (100.0, [33.33, 33.33, 33.34], 33.34),  # Standard case
        (100.0, [30, 30, 40], 40.0),  # No rounding needed
        (123.45, [50, 50], 61.72),  # 123.45 * 0.5 = 61.725 → 61.73, last = 61.72
        (99.99, [33.33, 33.33, 33.34], 33.33),  # Different master amount
        (1000.0, [33.33, 33.33, 33.34], 333.40),  # Larger amounts
    ],
)
def test_process_rounding_ensures_exact_total(
    amount,
    percentages,
    expected_last,
    simple_split_processor,
    base_split_transaction,
    three_account_ids,
):
    """Various amounts should always sum exactly to master via last adjustment."""
    # Arrange: Transaction with specified amount
    base_split_transaction.amount = amount

    config = SimpleSplitConfig(
        splits=[
            SplitItem(account_id=three_account_ids[i], percentage=p)
            for i, p in enumerate(percentages)
        ]
    )

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Last split has expected adjusted value (with tolerance for floating point)
    assert abs(result["slaves"][-1].amount - expected_last) < 0.01

    # Assert: Total exactly equals master
    total = sum(s.amount for s in result["slaves"])
    assert abs(total - amount) < 0.01  # Floating point tolerance


def test_process_decimal_amounts_two_decimals(
    simple_split_processor, base_split_transaction, make_split_config, two_account_ids
):
    """Split amounts should be rounded to exactly 2 decimal places."""
    # Arrange: Amount that creates rounding situations
    base_split_transaction.amount = 10.00

    config = make_split_config(
        [
            {"account_id": two_account_ids[0], "percentage": 33.33},  # 3.333 → 3.33
            {"account_id": two_account_ids[1], "percentage": 66.67},  # adjusted
        ]
    )

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: First split rounded to 2 decimals
    assert result["slaves"][0].amount == 3.33

    # Assert: Last split adjusted
    assert result["slaves"][1].amount == 6.67  # 10.00 - 3.33

    # Assert: No more than 2 decimal places
    for slave in result["slaves"]:
        # Check that amount * 100 is an integer (i.e., max 2 decimals)
        assert (slave.amount * 100) % 1 == 0


def test_process_tiny_percentages_with_rounding(
    simple_split_processor,
    base_split_transaction,
    make_split_config,
    three_account_ids,
):
    """Very small percentages should be handled correctly."""
    # Arrange: 1% + 1% + 98% on 100.0
    config = make_split_config(
        [
            {"account_id": three_account_ids[0], "percentage": 1},
            {"account_id": three_account_ids[1], "percentage": 1},
            {"account_id": three_account_ids[2], "percentage": 98},
        ]
    )

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Correct amounts
    assert result["slaves"][0].amount == 1.0
    assert result["slaves"][1].amount == 1.0
    assert result["slaves"][2].amount == 98.0


def test_process_rounding_with_odd_amount(
    simple_split_processor, base_split_transaction, make_split_config, two_account_ids
):
    """Odd amounts should still sum correctly with rounding."""
    # Arrange: 7.77 split 50/50
    base_split_transaction.amount = 7.77

    config = make_split_config(
        [
            {"account_id": two_account_ids[0], "percentage": 50},
            {"account_id": two_account_ids[1], "percentage": 50},
        ]
    )

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: First split = round(7.77 * 0.5, 2) = 3.88 (banker's rounding)
    assert result["slaves"][0].amount == 3.88

    # Assert: Last split adjusted = 7.77 - 3.88 ≈ 3.89 (with floating point tolerance)
    assert abs(result["slaves"][1].amount - 3.89) < 0.01

    # Assert: Sum exact
    total = sum(s.amount for s in result["slaves"])
    assert abs(total - 7.77) < 0.01


# =============================================================================
# Section 4: Slave Metadata Tests
# =============================================================================


def test_process_slaves_have_correct_master_id(
    simple_split_processor, base_split_transaction, make_split_config, two_account_ids
):
    """Generated slaves should reference correct master ID."""
    # Arrange: Config
    config = make_split_config([{"account_id": two_account_ids[0], "percentage": 100}])

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Slave has correct masterId
    assert result["slaves"][0].masterId == base_split_transaction.transactionId


def test_process_slaves_have_correct_date(
    simple_split_processor, base_split_transaction, make_split_config, two_account_ids
):
    """Slaves should inherit master transaction date."""
    # Arrange: Master with specific date
    test_date = datetime(2025, 6, 15, 14, 30, 0)
    base_split_transaction.date = test_date

    config = make_split_config([{"account_id": two_account_ids[0], "percentage": 100}])

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: All slaves have same date as master
    for slave in result["slaves"]:
        assert slave.date == test_date


def test_process_slaves_have_correct_account_ids(
    simple_split_processor,
    base_split_transaction,
    make_split_config,
    three_account_ids,
):
    """Each slave should point to its configured account."""
    # Arrange: 3-way split with distinct accounts
    config = make_split_config(
        [
            {"account_id": three_account_ids[0], "percentage": 50},
            {"account_id": three_account_ids[1], "percentage": 30},
            {"account_id": three_account_ids[2], "percentage": 20},
        ]
    )

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Account IDs match config order
    assert result["slaves"][0].accountId == three_account_ids[0]
    assert result["slaves"][1].accountId == three_account_ids[1]
    assert result["slaves"][2].accountId == three_account_ids[2]


# =============================================================================
# Section 5: Validation Integration Tests
# =============================================================================


def test_process_calls_validate_transaction(
    simple_split_processor,
    base_split_transaction,
    make_split_config,
    two_account_ids,
    monkeypatch,
):
    """process() should call _validate_transaction internally."""
    # Arrange: Track validation calls
    validate_called = []

    original_validate = simple_split_processor._validate_transaction

    def mock_validate(tx, slaves):
        validate_called.append((tx, slaves))
        return original_validate(tx, slaves)

    monkeypatch.setattr(simple_split_processor, "_validate_transaction", mock_validate)

    config = make_split_config([{"account_id": two_account_ids[0], "percentage": 100}])

    # Act: Process
    simple_split_processor.process(base_split_transaction, config)

    # Assert: Validation was called once
    assert len(validate_called) == 1
    assert validate_called[0][0] == base_split_transaction


def test_process_fails_validation_multiple_slaves(
    simple_split_processor,
    base_split_transaction,
    make_split_config,
    two_account_ids,
    correct_unknown_account,
):
    """Transaction with multiple slaves should fail validation."""
    # Arrange: Add extra slave to base transaction
    extra_slave = TransactionSlaveWithAccount(
        slaveId=UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"),
        type="credit",
        amount=50.0,
        date=base_split_transaction.date,
        accountId=UUID(correct_unknown_account["accountId"]),
        masterId=base_split_transaction.transactionId,
        created_at=datetime.now(),
        updated_at=datetime.now(),
        Accounts=Account(
            accountId=UUID(correct_unknown_account["accountId"]),
            name=correct_unknown_account["name"],
            category=correct_unknown_account["category"],
            sub_category=correct_unknown_account["sub_category"],
            is_real=correct_unknown_account["is_real"],
            original_amount=correct_unknown_account["original_amount"],
            active=correct_unknown_account["active"],
            created_at=datetime.fromisoformat(
                correct_unknown_account["created_at"].replace("Z", "+00:00")
            ),
            updated_at=datetime.fromisoformat(
                correct_unknown_account["updated_at"].replace("Z", "+00:00")
            ),
        ),
    )
    base_split_transaction.TransactionsSlaves.append(extra_slave)

    config = make_split_config([{"account_id": two_account_ids[0], "percentage": 100}])

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Fails with error message
    assert result["success"] is False
    assert "2 slaves" in result["error_message"]
    assert result["slaves"] == []


def test_process_fails_validation_no_slaves(
    simple_split_processor, base_split_transaction, make_split_config, two_account_ids
):
    """Transaction with no slaves should fail validation."""
    # Arrange: Remove all slaves
    base_split_transaction.TransactionsSlaves = []

    config = make_split_config([{"account_id": two_account_ids[0], "percentage": 100}])

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Fails
    assert result["success"] is False
    assert "0 slaves" in result["error_message"]


def test_process_fails_validation_real_account_slave(
    simple_split_processor,
    base_split_transaction,
    make_split_config,
    two_account_ids,
    sample_accounts,
):
    """Transaction with slave to real account should fail validation."""
    # Arrange: Replace slave's account with real bank account
    real_account = Account(
        accountId=UUID(sample_accounts[0]["accountId"]),
        name=sample_accounts[0]["name"],
        category=sample_accounts[0]["category"],
        sub_category=sample_accounts[0]["sub_category"],
        is_real=True,
        original_amount=sample_accounts[0]["original_amount"],
        active=sample_accounts[0]["active"],
        created_at=datetime.fromisoformat(
            sample_accounts[0]["created_at"].replace("Z", "+00:00")
        ),
        updated_at=datetime.fromisoformat(
            sample_accounts[0]["updated_at"].replace("Z", "+00:00")
        ),
    )
    base_split_transaction.TransactionsSlaves[0].Accounts = real_account

    config = make_split_config([{"account_id": two_account_ids[0], "percentage": 100}])

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Fails with Unknown account error
    assert result["success"] is False
    assert "Unknown" in result["error_message"]


# =============================================================================
# Section 6: Error Handling Tests
# =============================================================================


def test_process_success_result_structure(
    simple_split_processor, base_split_transaction, make_split_config, two_account_ids
):
    """Success result should have correct structure."""
    # Arrange: Valid config
    config = make_split_config([{"account_id": two_account_ids[0], "percentage": 100}])

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Has required keys
    assert "success" in result
    assert "slaves" in result
    assert "error_message" in result

    # Assert: Success values correct
    assert result["success"] is True
    assert isinstance(result["slaves"], list)
    assert result["error_message"] is None


def test_process_failure_result_structure(
    simple_split_processor, base_split_transaction, make_split_config, two_account_ids
):
    """Failure result should have correct structure."""
    # Arrange: Invalid transaction (no slaves)
    base_split_transaction.TransactionsSlaves = []

    config = make_split_config([{"account_id": two_account_ids[0], "percentage": 100}])

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Has required keys
    assert "success" in result
    assert "slaves" in result
    assert "error_message" in result

    # Assert: Failure values correct
    assert result["success"] is False
    assert result["slaves"] == []
    assert isinstance(result["error_message"], str)
    assert len(result["error_message"]) > 0


def test_process_handles_unexpected_exceptions(
    simple_split_processor,
    base_split_transaction,
    make_split_config,
    two_account_ids,
    monkeypatch,
):
    """Unexpected exceptions should be caught and returned as errors."""

    # Arrange: Mock _validate_transaction to raise unexpected error
    def mock_validate(tx, slaves):
        raise RuntimeError("Unexpected error")

    monkeypatch.setattr(simple_split_processor, "_validate_transaction", mock_validate)

    config = make_split_config([{"account_id": two_account_ids[0], "percentage": 100}])

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Returns failure result, not exception
    assert result["success"] is False
    assert "Unexpected error" in result["error_message"]
    assert result["slaves"] == []


# =============================================================================
# Section 7: Edge Cases and Boundary Tests
# =============================================================================


def test_process_zero_master_amount(
    simple_split_processor, base_split_transaction, make_split_config, two_account_ids
):
    """Master amount of 0 should generate 0-amount slaves."""
    # Arrange: Master with 0 amount
    base_split_transaction.amount = 0.0

    config = make_split_config(
        [
            {"account_id": two_account_ids[0], "percentage": 50},
            {"account_id": two_account_ids[1], "percentage": 50},
        ]
    )

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Success with 0-amount slaves
    assert result["success"] is True
    assert result["slaves"][0].amount == 0.0
    assert result["slaves"][1].amount == 0.0


def test_process_large_amounts(
    simple_split_processor, base_split_transaction, make_split_config, two_account_ids
):
    """Very large amounts should be handled correctly."""
    # Arrange: Master with large amount
    base_split_transaction.amount = 999999.99

    config = make_split_config(
        [
            {"account_id": two_account_ids[0], "percentage": 50},
            {"account_id": two_account_ids[1], "percentage": 50},
        ]
    )

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Success
    assert result["success"] is True

    # Assert: Sum still exact
    total = sum(s.amount for s in result["slaves"])
    assert abs(total - 999999.99) < 0.01


def test_process_very_small_amounts(
    simple_split_processor, base_split_transaction, make_split_config, two_account_ids
):
    """Very small amounts (cents) should be handled correctly."""
    # Arrange: Master with 0.03
    base_split_transaction.amount = 0.03

    config = make_split_config(
        [
            {"account_id": two_account_ids[0], "percentage": 50},
            {"account_id": two_account_ids[1], "percentage": 50},
        ]
    )

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Success
    assert result["success"] is True

    # Assert: First split = round(0.03 * 0.5, 2) = 0.01 (banker's rounding: 0.015 → 0.01)
    assert result["slaves"][0].amount == 0.01

    # Assert: Last split adjusted = 0.03 - 0.01 ≈ 0.02 (with floating point tolerance)
    assert abs(result["slaves"][1].amount - 0.02) < 0.01


def test_process_negative_amount(
    simple_split_processor, base_split_transaction, make_split_config, two_account_ids
):
    """Negative master amounts should fail validation gracefully."""
    # Arrange: Master with negative amount (which causes validation failure)
    base_split_transaction.amount = -100.0

    config = make_split_config(
        [
            {"account_id": two_account_ids[0], "percentage": 50},
            {"account_id": two_account_ids[1], "percentage": 50},
        ]
    )

    # Act: Process
    result = simple_split_processor.process(base_split_transaction, config)

    # Assert: Should fail gracefully due to balance validation mismatch
    assert result["success"] is False
    assert result["slaves"] == []
    assert "Balance mismatch" in result["error_message"]


# =============================================================================
# Section 8: Integration with ProcessorConfigBase
# =============================================================================


def test_processor_config_class_property(simple_split_processor):
    """Processor should return correct config class."""
    # Act: Get config class
    config_class = simple_split_processor.config_class

    # Assert: Is SimpleSplitConfig
    assert config_class is SimpleSplitConfig


def test_processor_validate_config_success(simple_split_processor, two_account_ids):
    """validate_config should parse and validate raw dict."""
    # Arrange: Raw config dict
    raw_config = {
        "splits": [
            {"account_id": str(two_account_ids[0]), "percentage": 70},
            {"account_id": str(two_account_ids[1]), "percentage": 30},
        ]
    }

    # Act: Validate
    config = simple_split_processor.validate_config(raw_config)

    # Assert: Returns typed config
    assert isinstance(config, SimpleSplitConfig)
    assert len(config.splits) == 2
    assert config.splits[0].percentage == 70


def test_processor_validate_config_invalid(simple_split_processor, two_account_ids):
    """validate_config should raise ValidationError for invalid config."""
    # Arrange: Invalid config (percentages don't sum to 100)
    raw_config = {
        "splits": [
            {"account_id": str(two_account_ids[0]), "percentage": 60},
            {"account_id": str(two_account_ids[1]), "percentage": 30},
        ]
    }

    # Act & Assert: Should raise ValidationError
    with pytest.raises(ValidationError):
        simple_split_processor.validate_config(raw_config)


def test_processor_type_property(simple_split_processor):
    """Processor should return correct type identifier."""
    # Act & Assert
    assert simple_split_processor.processor_type == "simple_split"
