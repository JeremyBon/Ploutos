"""Tests d'intégration pour les transferts."""

from unittest.mock import MagicMock


def test_multiple_transfer_pairs(
    test_client,
    mock_db,
    sample_transfer_pair,
    sample_unknown_account,
    mock_supabase_response,
):
    """Détecte plusieurs paires de transferts en même temps."""
    # Arrange: Créer deux paires de transferts
    pair1_negative = sample_transfer_pair["negative"].copy()
    pair1_positive = sample_transfer_pair["positive"].copy()

    pair2_negative_id = "ffffffff-ffff-ffff-ffff-ffffffffffff"
    pair2_positive_id = "gggggggg-gggg-gggg-gggg-gggggggggggg"

    # La RPC retourne toutes les permutations possibles : 2 credits x 2 debits = 4 paires
    rpc_data = [
        # Paire 1: pair1_negative + pair1_positive
        {
            "transactionid_1": pair1_negative["transactionId"],
            "description_1": pair1_negative["description"],
            "date_1": pair1_negative["date"],
            "type_1": pair1_negative["type"],
            "amount_1": pair1_negative["amount"],
            "accountid_1": pair1_negative["accountId"],
            "accountname_1": "Banque A",
            "transactionid_2": pair1_positive["transactionId"],
            "description_2": pair1_positive["description"],
            "date_2": pair1_positive["date"],
            "type_2": pair1_positive["type"],
            "amount_2": pair1_positive["amount"],
            "accountid_2": pair1_positive["accountId"],
            "accountname_2": "Banque B",
        },
        # Paire 2: pair1_negative + pair2_positive
        {
            "transactionid_1": pair1_negative["transactionId"],
            "description_1": pair1_negative["description"],
            "date_1": pair1_negative["date"],
            "type_1": pair1_negative["type"],
            "amount_1": pair1_negative["amount"],
            "accountid_1": pair1_negative["accountId"],
            "accountname_1": "Banque A",
            "transactionid_2": pair2_positive_id,
            "description_2": pair1_positive["description"],
            "date_2": pair1_positive["date"],
            "type_2": pair1_positive["type"],
            "amount_2": pair1_positive["amount"],
            "accountid_2": pair1_positive["accountId"],
            "accountname_2": "Banque B",
        },
        # Paire 3: pair2_negative + pair1_positive
        {
            "transactionid_1": pair2_negative_id,
            "description_1": pair1_negative["description"],
            "date_1": pair1_negative["date"],
            "type_1": pair1_negative["type"],
            "amount_1": pair1_negative["amount"],
            "accountid_1": pair1_negative["accountId"],
            "accountname_1": "Banque A",
            "transactionid_2": pair1_positive["transactionId"],
            "description_2": pair1_positive["description"],
            "date_2": pair1_positive["date"],
            "type_2": pair1_positive["type"],
            "amount_2": pair1_positive["amount"],
            "accountid_2": pair1_positive["accountId"],
            "accountname_2": "Banque B",
        },
        # Paire 4: pair2_negative + pair2_positive
        {
            "transactionid_1": pair2_negative_id,
            "description_1": pair1_negative["description"],
            "date_1": pair1_negative["date"],
            "type_1": pair1_negative["type"],
            "amount_1": pair1_negative["amount"],
            "accountid_1": pair1_negative["accountId"],
            "accountname_1": "Banque A",
            "transactionid_2": pair2_positive_id,
            "description_2": pair1_positive["description"],
            "date_2": pair1_positive["date"],
            "type_2": pair1_positive["type"],
            "amount_2": pair1_positive["amount"],
            "accountid_2": pair1_positive["accountId"],
            "accountname_2": "Banque B",
        },
    ]

    mock_rpc = MagicMock()
    mock_rpc.execute.return_value = mock_supabase_response(rpc_data)
    mock_db.rpc.return_value = mock_rpc

    # Act
    response = test_client.get("/transfers/candidates")

    # Assert: Devrait trouver 4 paires (2 credits x 2 debits = toutes les permutations possibles)
    assert response.status_code == 200
    candidates = response.json()
    assert len(candidates) == 4


def test_merge_workflow_simple(
    test_client, mock_db, sample_transfer_pair, sample_accounts, mock_supabase_response
):
    """Test simplifié du workflow merge."""
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

    # Act: Merge
    response = test_client.post(
        "/transfers/merge",
        json={
            "credit_transaction_id": negative_tx["transactionId"],
            "debit_transaction_id": positive_tx["transactionId"],
        },
    )

    # Assert
    assert response.status_code == 200
    result = response.json()
    assert result["transactionId"] == negative_tx["transactionId"]


def test_split_workflow_simple(
    test_client,
    mock_db,
    sample_merged_transaction,
    sample_accounts,
    mock_supabase_response,
):
    """Test simplifié du workflow split."""
    # Arrange
    merged_tx = sample_merged_transaction
    slave_to_split = merged_tx["TransactionsSlaves"][0]

    # Mock pour Transactions table
    new_transaction = {
        "transactionId": "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "accountId": slave_to_split["accountId"],
        "amount": slave_to_split["amount"],
        "type": slave_to_split["type"],  # Inverse de credit
        "date": slave_to_split["date"],
        "description": f"Split from transaction {merged_tx['transactionId']}",
    }

    mock_table_transactions = MagicMock()
    mock_table_transactions.select.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([merged_tx])
    )
    mock_table_transactions.insert.return_value.execute.return_value = (
        mock_supabase_response([new_transaction])
    )

    # Mock pour TransactionsSlaves table
    new_slave = {
        "slaveId": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        "masterId": new_transaction["transactionId"],
        "accountId": merged_tx["accountId"],
        "amount": slave_to_split["amount"],
        "type": "debit" if slave_to_split["type"] == "credit" else "credit",
    }
    # Mock UPDATE du slave original (pointé vers Unknown)
    updated_slave = {
        "slaveId": slave_to_split["slaveId"],
        "accountId": "99999999-9999-9999-9999-999999999999",  # Unknown account
        "amount": slave_to_split["amount"],
        "type": slave_to_split["type"],
        "updated_at": slave_to_split["date"],
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

    # Act: Split
    response = test_client.post(
        f"/transactions/{merged_tx['transactionId']}/split-slave/{slave_to_split['slaveId']}"
    )

    # Assert
    assert response.status_code == 201
    result = response.json()
    assert result["created_transaction"]["accountId"] == slave_to_split["accountId"]
    assert result["updated_slave"]["slaveId"] == str(slave_to_split["slaveId"])
