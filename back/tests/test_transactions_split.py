"""Tests pour l'endpoint de split de slaves (réversibilité des transferts)."""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


def test_split_creates_new_transaction(
    test_client, mock_db, sample_merged_transaction, sample_accounts, mock_supabase_response
):
    """Le split crée une nouvelle transaction master sur le compte du slave."""
    # Arrange
    merged_tx = sample_merged_transaction
    slave_to_split = merged_tx["TransactionsSlaves"][0]

    # Mock select pour récupérer la transaction et le slave
    mock_table_select = MagicMock()
    mock_table_select.select.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([merged_tx])
    )

    # Mock insert pour la nouvelle transaction
    new_transaction = {
        "transactionId": "new-trans-id",
        "accountId": slave_to_split["accountId"],
        "amount": abs(slave_to_split["amount"]),
        "type": "debit",  # Inverse de credit
    }
    mock_table_insert = MagicMock()
    mock_table_insert.insert.return_value.execute.return_value = mock_supabase_response(
        [new_transaction]
    )

    # Mock delete pour supprimer le slave original
    mock_table_delete = MagicMock()
    mock_table_delete.delete.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([slave_to_split])
    )

    def table_router(table_name):
        if table_name == "Transactions":
            if "insert" in str(mock_db.table.call_count):
                return mock_table_insert
            return mock_table_select
        return mock_table_delete

    mock_db.table.side_effect = table_router

    # Act
    response = test_client.post(
        f"/api/v1/transactions/{merged_tx['transactionId']}/split-slave/{slave_to_split['slaveId']}"
    )

    # Assert
    assert response.status_code == 201
    result = response.json()
    assert result["created_transaction"]["accountId"] == slave_to_split["accountId"]
    mock_table_insert.insert.assert_called()


def test_split_new_transaction_on_slave_account(
    test_client, mock_db, sample_merged_transaction, sample_accounts, mock_supabase_response
):
    """La nouvelle transaction est créée sur le compte du slave."""
    # Arrange
    merged_tx = sample_merged_transaction
    slave_to_split = merged_tx["TransactionsSlaves"][0]

    mock_table = MagicMock()
    mock_table.select.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([merged_tx])
    )
    mock_table.insert.return_value.execute.return_value = mock_supabase_response(
        [{"transactionId": "new-id", "accountId": slave_to_split["accountId"]}]
    )
    mock_table.delete.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([])
    )

    mock_db.table.return_value = mock_table

    # Act
    response = test_client.post(
        f"/api/v1/transactions/{merged_tx['transactionId']}/split-slave/{slave_to_split['slaveId']}"
    )

    # Assert
    assert response.status_code == 201
    # Vérifier que l'insertion a utilisé le bon accountId
    insert_call = mock_table.insert.call_args[0][0]
    assert insert_call["accountId"] == sample_accounts[1]["accountId"]  # Banque B


def test_split_creates_inverse_slave(
    test_client, mock_db, sample_merged_transaction, mock_supabase_response
):
    """Le split crée un slave inverse sur le compte d'origine."""
    # Arrange
    merged_tx = sample_merged_transaction
    slave_to_split = merged_tx["TransactionsSlaves"][0]

    mock_table = MagicMock()
    mock_table.select.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([merged_tx])
    )

    # Capturer les appels insert (transaction + slave)
    inserted_items = []

    def capture_insert(data):
        inserted_items.append(data)
        return MagicMock(execute=lambda: mock_supabase_response([data]))

    mock_table.insert.side_effect = capture_insert
    mock_table.delete.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([])
    )

    mock_db.table.return_value = mock_table

    # Act
    response = test_client.post(
        f"/api/v1/transactions/{merged_tx['transactionId']}/split-slave/{slave_to_split['slaveId']}"
    )

    # Assert
    assert response.status_code == 201
    # Vérifier qu'un slave a été créé pointant vers le compte d'origine
    assert len(inserted_items) >= 2  # Transaction + au moins 1 slave
    slave_created = [item for item in inserted_items if "masterId" in item][0]
    assert slave_created["accountId"] == merged_tx["accountId"]  # Retour vers Banque A


def test_split_removes_original_slave(
    test_client, mock_db, sample_merged_transaction, mock_supabase_response
):
    """Le split supprime le slave original de la transaction parente."""
    # Arrange
    merged_tx = sample_merged_transaction
    slave_to_split = merged_tx["TransactionsSlaves"][0]

    mock_table = MagicMock()
    mock_table.select.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([merged_tx])
    )
    mock_table.insert.return_value.execute.return_value = mock_supabase_response([{}])
    mock_table.delete.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([slave_to_split])
    )

    mock_db.table.return_value = mock_table

    # Act
    response = test_client.post(
        f"/api/v1/transactions/{merged_tx['transactionId']}/split-slave/{slave_to_split['slaveId']}"
    )

    # Assert
    assert response.status_code == 201
    # Vérifier que delete a été appelé avec le slaveId
    mock_table.delete.assert_called()
    delete_call = mock_table.delete.return_value.eq.call_args[0][1]
    assert delete_call == slave_to_split["slaveId"]


def test_split_reverses_transaction_type(
    test_client, mock_db, sample_merged_transaction, mock_supabase_response
):
    """Le split inverse le type de transaction (credit → debit, debit → credit)."""
    # Arrange
    merged_tx = sample_merged_transaction.copy()
    merged_tx["type"] = "credit"  # Transaction sortie
    slave_to_split = merged_tx["TransactionsSlaves"][0].copy()
    slave_to_split["type"] = "debit"  # Slave entrée

    mock_table = MagicMock()
    mock_table.select.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([merged_tx])
    )

    created_transaction = None

    def capture_transaction_insert(data):
        nonlocal created_transaction
        if "transactionId" in data:
            created_transaction = data
        return MagicMock(execute=lambda: mock_supabase_response([data]))

    mock_table.insert.side_effect = capture_transaction_insert
    mock_table.delete.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([])
    )

    mock_db.table.return_value = mock_table

    # Act
    response = test_client.post(
        f"/api/v1/transactions/{merged_tx['transactionId']}/split-slave/{slave_to_split['slaveId']}"
    )

    # Assert
    assert response.status_code == 201
    # La nouvelle transaction doit avoir le type inversé
    assert created_transaction is not None
    assert created_transaction["type"] == "debit"  # Inverse de credit


def test_split_uses_absolute_amount(
    test_client, mock_db, sample_merged_transaction, mock_supabase_response
):
    """Le split utilise la valeur absolue du montant du slave."""
    # Arrange
    merged_tx = sample_merged_transaction.copy()
    slave_to_split = merged_tx["TransactionsSlaves"][0].copy()
    slave_to_split["amount"] = -100.0  # Montant négatif

    mock_table = MagicMock()
    mock_table.select.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([merged_tx])
    )

    created_transaction = None

    def capture_transaction_insert(data):
        nonlocal created_transaction
        if "amount" in data and "transactionId" in data:
            created_transaction = data
        return MagicMock(execute=lambda: mock_supabase_response([data]))

    mock_table.insert.side_effect = capture_transaction_insert
    mock_table.delete.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([])
    )

    mock_db.table.return_value = mock_table

    # Act
    response = test_client.post(
        f"/api/v1/transactions/{merged_tx['transactionId']}/split-slave/{slave_to_split['slaveId']}"
    )

    # Assert
    assert response.status_code == 201
    # Le montant doit être positif
    assert created_transaction is not None
    assert created_transaction["amount"] == 100.0  # Valeur absolue


def test_split_invalid_slave_id(
    test_client, mock_db, sample_merged_transaction, mock_supabase_response
):
    """Erreur 404 si le slave n'existe pas."""
    # Arrange
    merged_tx = sample_merged_transaction.copy()
    merged_tx["TransactionsSlaves"] = []  # Aucun slave

    mock_table = MagicMock()
    mock_table.select.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([merged_tx])
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.post(
        f"/api/v1/transactions/{merged_tx['transactionId']}/split-slave/invalid-slave-id"
    )

    # Assert
    assert response.status_code == 404
    assert "slave" in response.json()["detail"].lower()


def test_split_non_real_account_slave(
    test_client, mock_db, sample_merged_transaction, mock_supabase_response
):
    """Erreur 400 si le slave pointe vers un compte virtuel (non réel)."""
    # Arrange
    merged_tx = sample_merged_transaction.copy()
    slave_to_split = merged_tx["TransactionsSlaves"][0].copy()
    slave_to_split["slaveAccountIsReal"] = False  # Compte virtuel

    merged_tx["TransactionsSlaves"] = [slave_to_split]

    mock_table = MagicMock()
    mock_table.select.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([merged_tx])
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.post(
        f"/api/v1/transactions/{merged_tx['transactionId']}/split-slave/{slave_to_split['slaveId']}"
    )

    # Assert
    assert response.status_code == 400
    assert "real account" in response.json()["detail"].lower()
