"""Tests pour TransactionProcessor._validate_transaction.

Ce module teste la méthode _validate_transaction de la classe TransactionProcessor
qui effectue 3 validations critiques :
1. Nombre de slaves : exactement 1 requis
2. Compte Unknown : le slave doit pointer vers le compte Unknown
3. Balance : formule master_amount = -(slave_credit - slave_debit)
"""

from datetime import datetime
from typing import List
from uuid import UUID

import pytest

from ploutos.db.models import (
    Account,
    TransactionSlaveCreate,
    TransactionSlaveWithAccount,
    TransactionWithSlaves,
)
from ploutos.processors.base import ProcessorConfigBase, TransactionProcessor


# =============================================================================
# Fixtures Locales
# =============================================================================


@pytest.fixture
def mock_processor():
    """Processeur concret pour tester la méthode de la classe de base.

    TransactionProcessor est une classe abstraite, donc on crée une
    implémentation minimale pour les tests.
    """

    class TestProcessor(TransactionProcessor):
        @property
        def processor_type(self) -> str:
            return "test_processor"

        @property
        def config_class(self) -> type[ProcessorConfigBase]:
            return ProcessorConfigBase

        def process(
            self, transaction: TransactionWithSlaves, config: ProcessorConfigBase
        ) -> dict:
            return {"success": True, "slaves": [], "error_message": None}

    return TestProcessor()


@pytest.fixture
def base_transaction(sample_accounts, correct_unknown_account):
    """Transaction de référence avec exactement 1 slave vers Unknown.

    Type: debit (sortie d'argent)
    Montant: 100.0
    Slave: pointe vers correct_unknown_account
    """
    account_id = (
        UUID(sample_accounts[0]["accountId"])
        if isinstance(sample_accounts[0]["accountId"], str)
        else sample_accounts[0]["accountId"]
    )

    unknown_account_id = (
        UUID(correct_unknown_account["accountId"])
        if isinstance(correct_unknown_account["accountId"], str)
        else correct_unknown_account["accountId"]
    )

    # Créer l'objet Account pour le slave
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
        description="Test transaction",
        date=datetime(2025, 1, 15),
        type="debit",
        amount=100.0,
        accountId=account_id,
        created_at=datetime(2025, 1, 15),
        updated_at=datetime(2025, 1, 15),
        TransactionsSlaves=[
            TransactionSlaveWithAccount(
                slaveId=UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
                type="credit",
                amount=100.0,
                date=datetime(2025, 1, 15),
                accountId=unknown_account_id,
                masterId=master_id,
                created_at=datetime(2025, 1, 15),
                updated_at=datetime(2025, 1, 15),
                Accounts=unknown_account_obj,
            )
        ],
    )


@pytest.fixture
def make_transaction_slave():
    """Factory fixture pour créer des TransactionSlaveCreate.

    Usage:
        slave = make_transaction_slave(type="credit", amount=50.0)
    """

    def _create(
        type: str, amount: float, account_id: UUID = None
    ) -> TransactionSlaveCreate:
        if account_id is None:
            account_id = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")

        return TransactionSlaveCreate(
            type=type,
            amount=amount,
            date=datetime(2025, 1, 15),
            accountId=account_id,
            masterId=UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
        )

    return _create


# =============================================================================
# Fonctions Helpers
# =============================================================================


def create_transaction_with_slaves(
    tx_type: str,
    tx_amount: float,
    slave_accounts: List[Account],
    account_id: UUID = None,
) -> TransactionWithSlaves:
    """Crée une transaction avec N slaves vers les comptes spécifiés.

    Args:
        tx_type: Type de transaction ("debit" ou "credit")
        tx_amount: Montant de la transaction
        slave_accounts: Liste des comptes vers lesquels les slaves pointent
        account_id: ID du compte master (optionnel)

    Returns:
        TransactionWithSlaves avec len(slave_accounts) slaves
    """
    if account_id is None:
        account_id = UUID("11111111-1111-1111-1111-111111111111")

    master_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

    slaves = []
    for i, acc in enumerate(slave_accounts):
        slave_type = "credit" if tx_type == "debit" else "debit"
        slaves.append(
            TransactionSlaveWithAccount(
                slaveId=UUID(f"bbbbbbbb-bbbb-bbbb-bbbb-{i:012d}"),
                type=slave_type,
                amount=tx_amount / len(slave_accounts),
                date=datetime(2025, 1, 15),
                accountId=acc.accountId,
                masterId=master_id,
                created_at=datetime(2025, 1, 15),
                updated_at=datetime(2025, 1, 15),
                Accounts=acc,
            )
        )

    return TransactionWithSlaves(
        transactionId=master_id,
        description="Test transaction",
        date=datetime(2025, 1, 15),
        type=tx_type,
        amount=tx_amount,
        accountId=account_id,
        created_at=datetime(2025, 1, 15),
        updated_at=datetime(2025, 1, 15),
        TransactionsSlaves=slaves,
    )


def create_balanced_slaves(
    master_type: str,
    master_amount: float,
    master_id: UUID,
    credit_amount: float = None,
    debit_amount: float = None,
) -> List[TransactionSlaveCreate]:
    """Génère des slaves équilibrés pour un master donné.

    Formule: master_amount = -(slave_credit - slave_debit)
    avec signed_master = -master_amount si type="debit", sinon master_amount

    Args:
        master_type: "debit" ou "credit"
        master_amount: Montant du master
        master_id: UUID du master
        credit_amount: Montant total des credits (optionnel)
        debit_amount: Montant total des debits (optionnel)

    Returns:
        Liste de TransactionSlaveCreate équilibrés

    Examples:
        Master debit 100 → slaves credit 100, debit 0
        Master credit 100 → slaves credit 0, debit 100
    """
    slaves = []

    # Si pas spécifié, utiliser des valeurs par défaut équilibrées
    if credit_amount is None and debit_amount is None:
        if master_type == "debit":
            # debit master → signed_master = -100
            # besoin: -(credit - debit) = -100 → credit - debit = 100
            credit_amount = master_amount
            debit_amount = 0
        else:  # credit
            # credit master → signed_master = 100
            # besoin: -(credit - debit) = 100 → credit - debit = -100
            credit_amount = 0
            debit_amount = master_amount

    if credit_amount > 0:
        slaves.append(
            TransactionSlaveCreate(
                type="credit",
                amount=credit_amount,
                date=datetime(2025, 1, 15),
                accountId=UUID("cccccccc-cccc-cccc-cccc-cccccccccccc"),
                masterId=master_id,
            )
        )

    if debit_amount > 0:
        slaves.append(
            TransactionSlaveCreate(
                type="debit",
                amount=debit_amount,
                date=datetime(2025, 1, 15),
                accountId=UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
                masterId=master_id,
            )
        )

    return slaves


# =============================================================================
# Check 1: Validation du Nombre de Slaves
# =============================================================================


def test_validate_transaction_with_exactly_one_slave(
    mock_processor, base_transaction, make_transaction_slave
):
    """Transaction avec exactement 1 slave doit passer la validation."""
    # Arrange: Transaction avec 1 slave vers Unknown, slaves équilibrés
    new_slaves = [make_transaction_slave(type="credit", amount=100.0)]

    # Act & Assert: La validation ne doit pas lever d'exception
    mock_processor._validate_transaction(base_transaction, new_slaves)


@pytest.mark.parametrize(
    "num_slaves,expected_error",
    [
        (0, "0 slaves"),
        (2, "2 slaves"),
        (3, "3 slaves"),
        (5, "5 slaves"),
    ],
)
def test_validate_transaction_invalid_slave_counts(
    num_slaves, expected_error, mock_processor, correct_unknown_account, sample_accounts
):
    """Transaction avec != 1 slave doit échouer avec le bon message."""
    # Arrange: Créer un compte Unknown valide
    unknown_account_id = (
        UUID(correct_unknown_account["accountId"])
        if isinstance(correct_unknown_account["accountId"], str)
        else correct_unknown_account["accountId"]
    )

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

    # Créer une transaction avec N slaves
    accounts_for_slaves = [unknown_account_obj] * num_slaves
    transaction = create_transaction_with_slaves(
        tx_type="debit", tx_amount=100.0, slave_accounts=accounts_for_slaves
    )

    new_slaves = create_balanced_slaves(
        master_type="debit",
        master_amount=100.0,
        master_id=transaction.transactionId,
    )

    # Act & Assert: Doit lever ValueError avec le message attendu
    with pytest.raises(ValueError, match=expected_error):
        mock_processor._validate_transaction(transaction, new_slaves)


# =============================================================================
# Check 2: Validation du Compte Unknown
# =============================================================================


def test_validate_transaction_with_correct_unknown_account(
    mock_processor, base_transaction, make_transaction_slave
):
    """Slave pointant vers le compte Unknown correct doit passer."""
    # Arrange: base_transaction utilise déjà correct_unknown_account
    new_slaves = [make_transaction_slave(type="credit", amount=100.0)]

    # Act & Assert: La validation ne doit pas lever d'exception
    mock_processor._validate_transaction(base_transaction, new_slaves)


@pytest.mark.parametrize(
    "name,category,sub_category,is_real",
    [
        ("WrongName", "Unknown", "Unknown", False),
        ("Unknown", "Virtual", "Unknown", False),
        ("Unknown", "Unknown", "Uncategorized", False),
        ("Unknown", "Unknown", "Unknown", True),
        ("Banque A", "Banking", "Checking", True),
    ],
)
def test_validate_transaction_invalid_unknown_account_fields(
    name, category, sub_category, is_real, mock_processor, sample_accounts
):
    """Slave avec n'importe quel champ incorrect doit échouer."""
    # Arrange: Créer un compte avec les champs spécifiés
    invalid_account = Account(
        accountId=UUID("99999999-9999-9999-9999-999999999999"),
        name=name,
        category=category,
        sub_category=sub_category,
        is_real=is_real,
        original_amount=0.0,
        created_at=datetime(2025, 1, 1),
        updated_at=datetime(2025, 1, 1),
    )

    transaction = create_transaction_with_slaves(
        tx_type="debit", tx_amount=100.0, slave_accounts=[invalid_account]
    )

    new_slaves = create_balanced_slaves(
        master_type="debit",
        master_amount=100.0,
        master_id=transaction.transactionId,
    )

    # Act & Assert: Doit lever ValueError avec mention du compte
    with pytest.raises(ValueError, match="not Unknown"):
        mock_processor._validate_transaction(transaction, new_slaves)


def test_validate_transaction_with_real_bank_account(
    mock_processor, sample_accounts, make_transaction_slave
):
    """Slave pointant vers un compte bancaire réel doit échouer."""
    # Arrange: Créer un compte bancaire réel
    real_account = Account(
        accountId=UUID(sample_accounts[0]["accountId"]),
        name=sample_accounts[0]["name"],
        category=sample_accounts[0]["category"],
        sub_category=sample_accounts[0]["sub_category"],
        is_real=sample_accounts[0]["is_real"],
        original_amount=sample_accounts[0]["original_amount"],
        created_at=datetime.fromisoformat(
            sample_accounts[0]["created_at"].replace("Z", "+00:00")
        ),
        updated_at=datetime.fromisoformat(
            sample_accounts[0]["updated_at"].replace("Z", "+00:00")
        ),
    )

    transaction = create_transaction_with_slaves(
        tx_type="debit", tx_amount=100.0, slave_accounts=[real_account]
    )

    new_slaves = create_balanced_slaves(
        master_type="debit",
        master_amount=100.0,
        master_id=transaction.transactionId,
    )

    # Act & Assert: Doit lever ValueError mentionnant le nom du compte réel
    with pytest.raises(ValueError, match="Banque A"):
        mock_processor._validate_transaction(transaction, new_slaves)


# =============================================================================
# Check 3: Balance Validation - Cas Valides
# =============================================================================


@pytest.mark.parametrize(
    "master_type,master_amount,credit_total,debit_total",
    [
        ("debit", 100, 150, 50),  # debit 100 = -(150-50) = -100
        ("credit", 100, 50, 150),  # credit 100 = -(50-150) = 100
        ("debit", 100, 100, 0),  # seulement credits
        ("credit", 100, 0, 100),  # seulement debits
        ("debit", 200.50, 250.50, 50),  # avec décimales
    ],
)
def test_validate_balance_valid_combinations(
    master_type,
    master_amount,
    credit_total,
    debit_total,
    mock_processor,
    base_transaction,
):
    """Combinaisons de balance valides doivent passer."""
    # Arrange: Modifier le type et montant du master
    base_transaction.type = master_type
    base_transaction.amount = master_amount

    # Créer les slaves équilibrés
    new_slaves = create_balanced_slaves(
        master_type=master_type,
        master_amount=master_amount,
        master_id=base_transaction.transactionId,
        credit_amount=credit_total,
        debit_amount=debit_total,
    )

    # Act & Assert: La validation ne doit pas lever d'exception
    mock_processor._validate_transaction(base_transaction, new_slaves)


def test_validate_balance_multiple_slaves_balanced(
    mock_processor, base_transaction, make_transaction_slave
):
    """Master avec plusieurs slaves équilibrés doit passer."""
    # Arrange: Master debit 200
    base_transaction.type = "debit"
    base_transaction.amount = 200.0

    # Slaves: credit 100, credit 150, debit 50 → -(250-50) = -200 ✓
    new_slaves = [
        make_transaction_slave(type="credit", amount=100.0),
        make_transaction_slave(type="credit", amount=150.0),
        make_transaction_slave(type="debit", amount=50.0),
    ]

    # Act & Assert: La validation ne doit pas lever d'exception
    mock_processor._validate_transaction(base_transaction, new_slaves)


@pytest.mark.parametrize(
    "master_amount,slave_amount,should_pass",
    [
        (100.00, 100.00, True),  # exact match
        (100.00, 100.005, True),  # dans la tolérance
        (100.00, 100.009, True),  # très proche de la limite
        (100.00, 100.011, False),  # dépasse la tolérance
        (100.00, 100.02, False),  # clairement au-dessus
    ],
)
def test_validate_balance_floating_point_tolerance(
    master_amount, slave_amount, should_pass, mock_processor, base_transaction
):
    """Tolérance de floating point doit être exactement 0.01."""
    # Arrange: Master debit avec montant spécifié
    base_transaction.type = "debit"
    base_transaction.amount = master_amount

    # Slaves: credit avec montant spécifié, debit 0
    new_slaves = create_balanced_slaves(
        master_type="debit",
        master_amount=master_amount,
        master_id=base_transaction.transactionId,
        credit_amount=slave_amount,
        debit_amount=0,
    )

    # Act & Assert
    if should_pass:
        mock_processor._validate_transaction(base_transaction, new_slaves)
    else:
        with pytest.raises(ValueError, match="Balance mismatch"):
            mock_processor._validate_transaction(base_transaction, new_slaves)


# =============================================================================
# Check 3: Balance Validation - Cas Invalides
# =============================================================================


@pytest.mark.parametrize(
    "master_type,master_amount,credit_total,debit_total,description",
    [
        ("debit", 100, 150, 0, "unbalanced_credit_only"),
        ("credit", 100, 100, 0, "wrong_sign_combo"),
        ("debit", 100, 50, 50, "zero_net_slaves"),
        ("debit", 100.00, 100.02, 0, "exceeds_tolerance"),
    ],
)
def test_validate_balance_invalid_combinations(
    master_type,
    master_amount,
    credit_total,
    debit_total,
    description,
    mock_processor,
    base_transaction,
):
    """Combinaisons de balance invalides doivent échouer."""
    # Arrange: Modifier le type et montant du master
    base_transaction.type = master_type
    base_transaction.amount = master_amount

    # Créer les slaves déséquilibrés
    new_slaves = create_balanced_slaves(
        master_type=master_type,
        master_amount=master_amount,
        master_id=base_transaction.transactionId,
        credit_amount=credit_total,
        debit_amount=debit_total,
    )

    # Act & Assert: Doit lever ValueError avec message de balance
    with pytest.raises(ValueError, match="Balance mismatch"):
        mock_processor._validate_transaction(base_transaction, new_slaves)


def test_validate_balance_empty_new_slaves(mock_processor, base_transaction):
    """Liste vide de new_slaves doit échouer la validation de balance."""
    # Arrange: Master avec montant, mais aucun nouveau slave
    new_slaves = []

    # Act & Assert: Doit lever ValueError pour balance incorrecte
    with pytest.raises(ValueError, match="Balance mismatch"):
        mock_processor._validate_transaction(base_transaction, new_slaves)


def test_validate_balance_zero_master_with_nonzero_slaves(
    mock_processor, base_transaction, make_transaction_slave
):
    """Master à 0 avec slaves non nuls doit échouer."""
    # Arrange: Master avec montant 0
    base_transaction.amount = 0.0

    # Slaves avec montant non nul
    new_slaves = [make_transaction_slave(type="credit", amount=50.0)]

    # Act & Assert: Doit lever ValueError pour balance incorrecte
    with pytest.raises(ValueError, match="Balance mismatch"):
        mock_processor._validate_transaction(base_transaction, new_slaves)


# =============================================================================
# Cas Limites et Priorité des Erreurs
# =============================================================================


def test_validate_transaction_fails_on_first_check_ignores_others(
    mock_processor, correct_unknown_account, make_transaction_slave
):
    """Validation doit échouer sur le nombre de slaves avant de vérifier la balance."""
    # Arrange: Transaction avec 0 slaves ET balance incorrecte
    transaction = create_transaction_with_slaves(
        tx_type="debit",
        tx_amount=100.0,
        slave_accounts=[],  # 0 slaves
    )

    # Slaves déséquilibrés (mais peu importe, on échoue avant)
    new_slaves = [make_transaction_slave(type="credit", amount=50.0)]

    # Act & Assert: Doit lever ValueError sur le nombre de slaves, pas la balance
    with pytest.raises(ValueError, match="0 slaves"):
        mock_processor._validate_transaction(transaction, new_slaves)


def test_validate_transaction_fails_on_second_check_ignores_balance(
    mock_processor, sample_accounts, make_transaction_slave
):
    """Validation doit vérifier Unknown account avant la balance."""
    # Arrange: Transaction avec 1 slave vers compte réel (pas Unknown)
    real_account = Account(
        accountId=UUID(sample_accounts[0]["accountId"]),
        name=sample_accounts[0]["name"],
        category=sample_accounts[0]["category"],
        sub_category=sample_accounts[0]["sub_category"],
        is_real=sample_accounts[0]["is_real"],
        original_amount=sample_accounts[0]["original_amount"],
        created_at=datetime.fromisoformat(
            sample_accounts[0]["created_at"].replace("Z", "+00:00")
        ),
        updated_at=datetime.fromisoformat(
            sample_accounts[0]["updated_at"].replace("Z", "+00:00")
        ),
    )

    transaction = create_transaction_with_slaves(
        tx_type="debit", tx_amount=100.0, slave_accounts=[real_account]
    )

    # Balance correcte (mais peu importe, on échoue avant)
    new_slaves = create_balanced_slaves(
        master_type="debit",
        master_amount=100.0,
        master_id=transaction.transactionId,
    )

    # Act & Assert: Doit lever ValueError sur Unknown account, pas la balance
    with pytest.raises(ValueError, match="not Unknown"):
        mock_processor._validate_transaction(transaction, new_slaves)
