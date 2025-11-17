"""Tests pour l'endpoint de split de slaves (réversibilité des transferts)."""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


def setup_split_mocks(mock_db, merged_tx, mock_supabase_response):
    """Helper pour configurer les mocks pour le split endpoint."""
    slave_to_split = merged_tx["TransactionsSlaves"][0]

    # Mock pour Transactions table
    new_transaction = {
        "transactionId": "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "accountId": slave_to_split["accountId"],
        "amount": slave_to_split["amount"],
        "type": "debit",  # Inverse de credit
        "date": slave_to_split["date"],
        "description": f"Split from transaction {merged_tx['transactionId']}",
    }

    mock_table_transactions = MagicMock()
    mock_table_transactions.select.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([merged_tx])
    )
    mock_table_transactions.insert.return_value.execute.return_value = mock_supabase_response(
        [new_transaction]
    )

    # Mock pour TransactionsSlaves table
    new_slave = {
        "slaveId": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        "masterId": new_transaction["transactionId"],
        "accountId": merged_tx["accountId"],
        "amount": slave_to_split["amount"],
        "type": "credit",
    }
    # Mock UPDATE du slave original (pointé vers Unknown)
    updated_slave = {
        "slaveId": slave_to_split["slaveId"],
        "accountId": "99999999-9999-9999-9999-999999999999",  # Unknown account
        "amount": slave_to_split["amount"],
        "type": slave_to_split["type"],
        "updated_at": slave_to_split["date"]
    }

    mock_table_slaves = MagicMock()
    mock_table_slaves.insert.return_value.execute.return_value = mock_supabase_response(
        [new_slave]
    )
    mock_table_slaves.update.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([updated_slave])
    )

    def table_router(table_name):
        if table_name == "Transactions":
            return mock_table_transactions
        elif table_name == "TransactionsSlaves":
            return mock_table_slaves
        return MagicMock()

    mock_db.table.side_effect = table_router

    return mock_table_transactions, mock_table_slaves, new_transaction, new_slave


def test_split_creates_new_transaction(
    test_client, mock_db, sample_merged_transaction, sample_accounts, mock_supabase_response
):
    """Le split crée une nouvelle transaction master sur le compte du slave."""
    # Arrange
    merged_tx = sample_merged_transaction
    slave_to_split = merged_tx["TransactionsSlaves"][0]

    mock_transactions, mock_slaves, new_transaction, new_slave = setup_split_mocks(
        mock_db, merged_tx, mock_supabase_response
    )

    # Act
    response = test_client.post(
        f"/transactions/{merged_tx['transactionId']}/split-slave/{slave_to_split['slaveId']}"
    )

    # Assert
    assert response.status_code == 201
    result = response.json()
    assert result["created_transaction"]["accountId"] == slave_to_split["accountId"]
    mock_transactions.insert.assert_called()


def test_split_new_transaction_on_slave_account(
    test_client, mock_db, sample_merged_transaction, sample_accounts, mock_supabase_response
):
    """La nouvelle transaction est créée sur le compte du slave (destination)."""
    # Arrange
    merged_tx = sample_merged_transaction
    slave_to_split = merged_tx["TransactionsSlaves"][0]

    mock_transactions, mock_slaves, new_transaction, new_slave = setup_split_mocks(
        mock_db, merged_tx, mock_supabase_response
    )

    # Act
    response = test_client.post(
        f"/transactions/{merged_tx['transactionId']}/split-slave/{slave_to_split['slaveId']}"
    )

    # Assert
    assert response.status_code == 201
    result = response.json()
    # La nouvelle transaction doit être sur le compte de Banque B (le slave)
    assert result["created_transaction"]["accountId"] == sample_accounts[1]["accountId"]


def test_split_creates_inverse_slave(
    test_client, mock_db, sample_merged_transaction, sample_accounts, mock_supabase_response
):
    """Le split crée un slave inverse pointant vers le compte d'origine."""
    # Arrange
    merged_tx = sample_merged_transaction

    mock_transactions, mock_slaves, new_transaction, new_slave = setup_split_mocks(
        mock_db, merged_tx, mock_supabase_response
    )

    # Act
    response = test_client.post(
        f"/transactions/{merged_tx['transactionId']}/split-slave/{merged_tx['TransactionsSlaves'][0]['slaveId']}"
    )

    # Assert
    assert response.status_code == 201
    result = response.json()
    # Le slave inverse doit pointer vers Banque A (compte d'origine)
    assert result["created_slave"]["accountId"] == sample_accounts[0]["accountId"]
    mock_slaves.insert.assert_called()


def test_split_updates_original_slave_to_unknown(
    test_client, mock_db, sample_merged_transaction, sample_accounts, mock_supabase_response
):
    """Le split modifie le slave original pour pointer vers Unknown."""
    # Arrange
    merged_tx = sample_merged_transaction
    slave_id = merged_tx["TransactionsSlaves"][0]["slaveId"]

    mock_transactions, mock_slaves, new_transaction, new_slave = setup_split_mocks(
        mock_db, merged_tx, mock_supabase_response
    )

    # Act
    response = test_client.post(
        f"/transactions/{merged_tx['transactionId']}/split-slave/{slave_id}"
    )

    # Assert
    assert response.status_code == 201
    result = response.json()
    assert result["updated_slave"]["slaveId"] == str(slave_id)
    mock_slaves.update.assert_called()


def test_split_reverses_transaction_type(
    test_client, mock_db, sample_merged_transaction, sample_accounts, mock_supabase_response
):
    """Le split crée une transaction avec le type inversé (credit → debit)."""
    # Arrange
    merged_tx = sample_merged_transaction

    mock_transactions, mock_slaves, new_transaction, new_slave = setup_split_mocks(
        mock_db, merged_tx, mock_supabase_response
    )

    # Act
    response = test_client.post(
        f"/transactions/{merged_tx['transactionId']}/split-slave/{merged_tx['TransactionsSlaves'][0]['slaveId']}"
    )

    # Assert
    assert response.status_code == 201
    result = response.json()
    # Master original : credit → Nouvelle transaction : debit
    assert merged_tx["type"] == "credit"
    assert result["created_transaction"]["type"] == "debit"


def test_split_uses_absolute_amount(
    test_client, mock_db, sample_merged_transaction, sample_accounts, mock_supabase_response
):
    """Le split utilise la valeur absolue du montant du slave."""
    # Arrange
    merged_tx = sample_merged_transaction
    slave_to_split = merged_tx["TransactionsSlaves"][0]

    mock_transactions, mock_slaves, new_transaction, new_slave = setup_split_mocks(
        mock_db, merged_tx, mock_supabase_response
    )

    # Act
    response = test_client.post(
        f"/transactions/{merged_tx['transactionId']}/split-slave/{slave_to_split['slaveId']}"
    )

    # Assert
    assert response.status_code == 201
    result = response.json()

    assert result["created_transaction"]["amount"] == slave_to_split["amount"]


def test_split_invalid_slave_id(
    test_client, mock_db, sample_merged_transaction, mock_supabase_response
):
    """Erreur 404 si le slave n'existe pas."""
    # Arrange
    merged_tx = sample_merged_transaction.copy()
    merged_tx["TransactionsSlaves"] = []  # Aucun slave

    mock_table_transactions = MagicMock()
    mock_table_transactions.select.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([merged_tx])
    )

    def table_router(table_name):
        if table_name == "Transactions":
            return mock_table_transactions
        return MagicMock()

    mock_db.table.side_effect = table_router

    # Act
    response = test_client.post(
        f"/transactions/{merged_tx['transactionId']}/split-slave/cccccccc-cccc-cccc-cccc-dddddddddddd"
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
    # Modifier le slave pour qu'il pointe vers un compte virtuel
    slave_to_split["Accounts"]["is_real"] = False

    merged_tx["TransactionsSlaves"] = [slave_to_split]

    mock_table_transactions = MagicMock()
    mock_table_transactions.select.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([merged_tx])
    )

    def table_router(table_name):
        if table_name == "Transactions":
            return mock_table_transactions
        return MagicMock()

    mock_db.table.side_effect = table_router

    # Act
    response = test_client.post(
        f"/transactions/{merged_tx['transactionId']}/split-slave/{slave_to_split['slaveId']}"
    )

    # Assert
    assert response.status_code == 400
    assert "real" in response.json()["detail"].lower()
