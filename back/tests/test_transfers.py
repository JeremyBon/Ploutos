"""Tests pour le router /transfers."""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


# =============================================================================
# Tests pour GET /transfers/candidates
# =============================================================================


def test_get_candidates_valid_pair(
    test_client, mock_db, sample_transfer_pair, sample_accounts, mock_supabase_response
):
    """Détecte une paire valide de transactions formant un transfert."""
    # Arrange: Mock la réponse de la DB avec nos transactions
    transactions_data = [
        sample_transfer_pair["negative"],
        sample_transfer_pair["positive"],
    ]

    mock_table = MagicMock()
    mock_table.select.return_value.execute.return_value = mock_supabase_response(
        transactions_data
    )
    mock_db.table.return_value = mock_table

    # Act: Appel de l'endpoint
    response = test_client.get("/transfers/candidates")

    # Assert: Doit retourner 1 paire de candidats
    assert response.status_code == 200
    candidates = response.json()
    assert len(candidates) == 1
    assert candidates[0]["credit_transaction"]["transactionId"] == sample_transfer_pair["negative"]["transactionId"]
    assert candidates[0]["debit_transaction"]["transactionId"] == sample_transfer_pair["positive"]["transactionId"]
    assert candidates[0]["amount"] == 100.0
    assert candidates[0]["date"] == "2025-01-15"


def test_get_candidates_different_amounts(
    test_client, mock_db, sample_transfer_pair, mock_supabase_response
):
    """Ignore les paires avec des montants différents."""
    # Arrange: Modifier le montant d'une transaction
    negative_tx = sample_transfer_pair["negative"].copy()
    positive_tx = sample_transfer_pair["positive"].copy()
    positive_tx["amount"] = 150.0  # Montant différent

    mock_table = MagicMock()
    mock_table.select.return_value.execute.return_value = mock_supabase_response(
        [negative_tx, positive_tx]
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.get("/transfers/candidates")

    # Assert: Aucun candidat détecté
    assert response.status_code == 200
    candidates = response.json()
    assert len(candidates) == 0


def test_get_candidates_different_dates(
    test_client, mock_db, sample_transfer_pair, mock_supabase_response
):
    """Ignore les paires avec des dates différentes."""
    # Arrange: Modifier la date d'une transaction
    negative_tx = sample_transfer_pair["negative"].copy()
    positive_tx = sample_transfer_pair["positive"].copy()
    positive_tx["date"] = "2025-01-16T00:00:00"  # Jour différent

    mock_table = MagicMock()
    mock_table.select.return_value.execute.return_value = mock_supabase_response(
        [negative_tx, positive_tx]
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.get("/transfers/candidates")

    # Assert: Aucun candidat détecté
    assert response.status_code == 200
    candidates = response.json()
    assert len(candidates) == 0


def test_get_candidates_same_type(
    test_client, mock_db, sample_transfer_pair, mock_supabase_response
):
    """Ignore les paires avec le même type (credit/credit ou debit/debit)."""
    # Arrange: Mettre le même type sur les deux transactions
    negative_tx = sample_transfer_pair["negative"].copy()
    positive_tx = sample_transfer_pair["positive"].copy()
    positive_tx["type"] = "credit"  # Même type que negative

    mock_table = MagicMock()
    mock_table.select.return_value.execute.return_value = mock_supabase_response(
        [negative_tx, positive_tx]
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.get("/transfers/candidates")

    # Assert: Aucun candidat détecté
    assert response.status_code == 200
    candidates = response.json()
    assert len(candidates) == 0


def test_get_candidates_has_real_slave(
    test_client, mock_db, sample_transfer_pair, mock_supabase_response
):
    """Ignore les transactions qui ont déjà un slave vers un compte réel."""
    # Arrange: Ajouter un slave vers compte réel sur une transaction
    negative_tx = sample_transfer_pair["negative"].copy()
    negative_tx["TransactionsSlaves"][0]["Accounts"]["is_real"] = True  # Déjà un transfert

    positive_tx = sample_transfer_pair["positive"]

    mock_table = MagicMock()
    mock_table.select.return_value.execute.return_value = mock_supabase_response(
        [negative_tx, positive_tx]
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.get("/transfers/candidates")

    # Assert: Aucun candidat (transaction déjà mergée)
    assert response.status_code == 200
    candidates = response.json()
    assert len(candidates) == 0


def test_get_candidates_empty(test_client, mock_db, mock_supabase_response):
    """Retourne une liste vide quand aucune paire n'est détectée."""
    # Arrange: Aucune transaction
    mock_table = MagicMock()
    mock_table.select.return_value.execute.return_value = mock_supabase_response([])
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.get("/transfers/candidates")

    # Assert
    assert response.status_code == 200
    assert response.json() == []


# =============================================================================
# Tests pour POST /transfers/merge
# =============================================================================


def test_merge_keeps_negative_transaction(
    test_client, mock_db, sample_transfer_pair, sample_accounts, mock_supabase_response
):
    """Le merge garde la transaction négative (credit/sortie)."""
    # Arrange: Mock les appels DB
    negative_tx = sample_transfer_pair["negative"]
    positive_tx = sample_transfer_pair["positive"]

    # Track which select call we're on
    select_call_count = [0]

    def mock_select_eq(*args):
        """Mock pour retourner la bonne transaction selon l'ID demandé."""
        select_call_count[0] += 1
        if select_call_count[0] == 1:
            # Premier appel: credit transaction
            return MagicMock(execute=lambda: mock_supabase_response([negative_tx]))
        elif select_call_count[0] == 2:
            # Deuxième appel: debit transaction
            return MagicMock(execute=lambda: mock_supabase_response([positive_tx]))
        else:
            # Troisième appel: récupération de la transaction mise à jour (credit)
            return MagicMock(execute=lambda: mock_supabase_response([negative_tx]))

    # Mock pour les transactions
    mock_table_transactions = MagicMock()
    mock_table_transactions.select.return_value.eq.side_effect = mock_select_eq

    # Mock pour TransactionsSlaves (insert et delete)
    mock_table_slaves = MagicMock()
    mock_table_slaves.insert.return_value.execute.return_value = mock_supabase_response(
        [{"slaveId": "new-slave"}]
    )
    mock_table_slaves.delete.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([])
    )

    def table_router(table_name):
        if table_name == "Transactions":
            return mock_table_transactions
        elif table_name == "TransactionsSlaves":
            return mock_table_slaves
        return MagicMock()

    mock_db.table.side_effect = table_router

    # Act: Merge les deux transactions
    response = test_client.post(
        "/transfers/merge",
        json={
            "credit_transaction_id": negative_tx["transactionId"],
            "debit_transaction_id": positive_tx["transactionId"],
        },
    )

    # Assert: La transaction négative doit être conservée
    assert response.status_code == 200
    result = response.json()
    assert result["transactionId"] == negative_tx["transactionId"]
    assert result["type"] == "credit"


def test_merge_deletes_positive_transaction(
    test_client, mock_db, sample_transfer_pair, mock_supabase_response
):
    """Le merge supprime la transaction positive (debit/entrée)."""
    # Arrange
    negative_tx = sample_transfer_pair["negative"]
    positive_tx = sample_transfer_pair["positive"]

    # Track which select call we're on
    select_call_count = [0]

    def mock_select_eq(*args):
        """Mock pour retourner la bonne transaction selon l'ID demandé."""
        select_call_count[0] += 1
        if select_call_count[0] == 1:
            return MagicMock(execute=lambda: mock_supabase_response([negative_tx]))
        elif select_call_count[0] == 2:
            return MagicMock(execute=lambda: mock_supabase_response([positive_tx]))
        else:
            return MagicMock(execute=lambda: mock_supabase_response([negative_tx]))

    # Mock pour les transactions
    mock_table_transactions = MagicMock()
    mock_table_transactions.select.return_value.eq.side_effect = mock_select_eq
    mock_table_transactions.delete.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([positive_tx])
    )

    # Mock pour TransactionsSlaves
    mock_table_slaves = MagicMock()
    mock_table_slaves.insert.return_value.execute.return_value = mock_supabase_response([])
    mock_table_slaves.delete.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([])
    )

    def table_router(table_name):
        if table_name == "Transactions":
            return mock_table_transactions
        elif table_name == "TransactionsSlaves":
            return mock_table_slaves
        return MagicMock()

    mock_db.table.side_effect = table_router

    # Act
    response = test_client.post(
        "/transfers/merge",
        json={
            "credit_transaction_id": negative_tx["transactionId"],
            "debit_transaction_id": positive_tx["transactionId"],
        },
    )

    # Assert: Vérifier que delete a été appelé pour la transaction positive
    assert response.status_code == 200
    # Le mock devrait avoir été appelé pour supprimer la transaction debit
    mock_table_transactions.delete.assert_called()


def test_merge_creates_real_slave(
    test_client, mock_db, sample_transfer_pair, sample_accounts, mock_supabase_response
):
    """Le merge crée un slave vers le compte réel de destination."""
    # Arrange
    negative_tx = sample_transfer_pair["negative"]
    positive_tx = sample_transfer_pair["positive"]

    # Track which select call we're on
    select_call_count = [0]

    def mock_select_eq(*args):
        select_call_count[0] += 1
        if select_call_count[0] == 1:
            return MagicMock(execute=lambda: mock_supabase_response([negative_tx]))
        elif select_call_count[0] == 2:
            return MagicMock(execute=lambda: mock_supabase_response([positive_tx]))
        else:
            return MagicMock(execute=lambda: mock_supabase_response([negative_tx]))

    mock_table_transactions = MagicMock()
    mock_table_transactions.select.return_value.eq.side_effect = mock_select_eq
    mock_table_transactions.delete.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([])
    )

    mock_table_slaves = MagicMock()
    mock_table_slaves.insert.return_value.execute.return_value = mock_supabase_response(
        [{"slaveId": "new-slave-id"}]
    )
    mock_table_slaves.delete.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([])
    )

    def table_router(table_name):
        if table_name == "Transactions":
            return mock_table_transactions
        elif table_name == "TransactionsSlaves":
            return mock_table_slaves
        return MagicMock()

    mock_db.table.side_effect = table_router

    # Act
    response = test_client.post(
        "/transfers/merge",
        json={
            "credit_transaction_id": negative_tx["transactionId"],
            "debit_transaction_id": positive_tx["transactionId"],
        },
    )

    # Assert: Vérifier qu'un slave a été inséré
    assert response.status_code == 200
    # Le mock devrait avoir été appelé pour insérer un slave vers Banque B
    mock_table_slaves.insert.assert_called()
    # Récupérer l'appel d'insertion
    insert_call_args = mock_table_slaves.insert.call_args[0][0]
    assert insert_call_args["accountId"] == sample_accounts[1]["accountId"]  # Banque B
    assert insert_call_args["amount"] == 100.0


def test_merge_removes_unknown_slaves(
    test_client, mock_db, sample_transfer_pair, mock_supabase_response
):
    """Le merge supprime les slaves Unknown existants."""
    # Arrange
    negative_tx = sample_transfer_pair["negative"]
    positive_tx = sample_transfer_pair["positive"]

    # Track which select call we're on
    select_call_count = [0]

    def mock_select_eq(*args):
        select_call_count[0] += 1
        if select_call_count[0] == 1:
            return MagicMock(execute=lambda: mock_supabase_response([negative_tx]))
        elif select_call_count[0] == 2:
            return MagicMock(execute=lambda: mock_supabase_response([positive_tx]))
        else:
            return MagicMock(execute=lambda: mock_supabase_response([negative_tx]))

    mock_table_transactions = MagicMock()
    mock_table_transactions.select.return_value.eq.side_effect = mock_select_eq
    mock_table_transactions.delete.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([])
    )

    mock_table_slaves = MagicMock()
    mock_table_slaves.insert.return_value.execute.return_value = mock_supabase_response([])
    mock_table_slaves.delete.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([{"slaveId": "aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb"}])  # Slave supprimé
    )

    def table_router(table_name):
        if table_name == "Transactions":
            return mock_table_transactions
        elif table_name == "TransactionsSlaves":
            return mock_table_slaves
        return MagicMock()

    mock_db.table.side_effect = table_router

    # Act
    response = test_client.post(
        "/transfers/merge",
        json={
            "credit_transaction_id": negative_tx["transactionId"],
            "debit_transaction_id": positive_tx["transactionId"],
        },
    )

    # Assert: Vérifier que delete a été appelé pour les slaves
    assert response.status_code == 200
    mock_table_slaves.delete.assert_called()


def test_merge_invalid_ids(test_client, mock_db, mock_supabase_response):
    """Erreur 422 si les IDs de transactions ne sont pas des UUIDs valides."""
    # Act: Envoyer des IDs invalides (pas des UUIDs)
    response = test_client.post(
        "/transfers/merge",
        json={
            "credit_transaction_id": "invalid-id-1",
            "debit_transaction_id": "invalid-id-2",
        },
    )

    # Assert: FastAPI retourne 422 pour validation Pydantic
    assert response.status_code == 422


def test_merge_mismatched_amounts(
    test_client, mock_db, sample_transfer_pair, mock_supabase_response
):
    """Erreur 400 si les montants ne correspondent pas."""
    # Arrange: Transactions avec montants différents
    negative_tx = sample_transfer_pair["negative"].copy()
    positive_tx = sample_transfer_pair["positive"].copy()
    positive_tx["amount"] = 150.0  # Montant différent

    # Track which select call we're on
    select_call_count = [0]

    def mock_select_eq(*args):
        select_call_count[0] += 1
        if select_call_count[0] == 1:
            return MagicMock(execute=lambda: mock_supabase_response([negative_tx]))
        else:
            return MagicMock(execute=lambda: mock_supabase_response([positive_tx]))

    mock_table_transactions = MagicMock()
    mock_table_transactions.select.return_value.eq.side_effect = mock_select_eq

    def table_router(table_name):
        if table_name == "Transactions":
            return mock_table_transactions
        return MagicMock()

    mock_db.table.side_effect = table_router

    # Act
    response = test_client.post(
        "/transfers/merge",
        json={
            "credit_transaction_id": negative_tx["transactionId"],
            "debit_transaction_id": positive_tx["transactionId"],
        },
    )

    # Assert
    assert response.status_code == 400
    assert "amount" in response.json()["detail"].lower()


# =============================================================================
# Tests pour GET /transfers
# =============================================================================


def test_get_transfers_list(
    test_client, mock_db, sample_merged_transaction, mock_supabase_response
):
    """Liste les transferts existants (transactions avec slaves réels)."""
    # Arrange
    mock_table = MagicMock()
    mock_table.select.return_value.execute.return_value = mock_supabase_response(
        [sample_merged_transaction]
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.get("/transfers")

    # Assert
    assert response.status_code == 200
    transfers = response.json()
    assert len(transfers) == 1
    assert transfers[0]["transactionId"] == sample_merged_transaction["transactionId"]
    assert len(transfers[0]["TransactionsSlaves"]) > 0
    assert transfers[0]["TransactionsSlaves"][0]["slaveAccountIsReal"] is True


def test_get_transfers_includes_destination_name(
    test_client, mock_db, sample_merged_transaction, mock_supabase_response
):
    """Les transferts incluent le nom du compte de destination."""
    # Arrange
    mock_table = MagicMock()
    mock_table.select.return_value.execute.return_value = mock_supabase_response(
        [sample_merged_transaction]
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.get("/transfers")

    # Assert
    assert response.status_code == 200
    transfers = response.json()
    assert "slaveAccountName" in transfers[0]["TransactionsSlaves"][0]
    assert transfers[0]["TransactionsSlaves"][0]["slaveAccountName"] == "Banque B"


def test_get_transfers_empty(test_client, mock_db, mock_supabase_response):
    """Retourne une liste vide si aucun transfert n'existe."""
    # Arrange
    mock_table = MagicMock()
    mock_table.select.return_value.execute.return_value = mock_supabase_response([])
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.get("/transfers")

    # Assert
    assert response.status_code == 200
    assert response.json() == []
