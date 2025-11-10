"""Tests d'intégration pour les workflows complets de transferts."""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


def test_full_merge_workflow(
    test_client, mock_db, sample_transfer_pair, sample_accounts, mock_supabase_response
):
    """Test du workflow complet : Détection → Merge → Vérification.

    Simule le cas d'usage utilisateur complet :
    1. Détecte des candidats de transfert
    2. Merge la paire détectée
    3. Vérifie que le transfert apparaît dans la liste
    """
    # Arrange
    negative_tx = sample_transfer_pair["negative"]
    positive_tx = sample_transfer_pair["positive"]

    # Mock pour GET /candidates
    mock_table_candidates = MagicMock()
    mock_table_candidates.select.return_value.execute.return_value = (
        mock_supabase_response([negative_tx, positive_tx])
    )

    # Mock pour POST /merge
    merged_tx = negative_tx.copy()
    merged_tx["TransactionsSlaves"] = [
        {
            "slaveId": "new-slave-id",
            "accountId": sample_accounts[1]["accountId"],  # Banque B
            "amount": 100.0,
            "type": "debit",
            "slaveAccountIsReal": True,
            "slaveAccountName": "Banque B",
        }
    ]

    mock_table_merge = MagicMock()
    mock_table_merge.select.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([negative_tx])
    )
    mock_table_merge.insert.return_value.execute.return_value = mock_supabase_response(
        [merged_tx["TransactionsSlaves"][0]]
    )
    mock_table_merge.delete.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([])
    )

    # Mock pour GET /transfers
    mock_table_transfers = MagicMock()
    mock_table_transfers.select.return_value.execute.return_value = (
        mock_supabase_response([merged_tx])
    )

    call_count = [0]

    def table_router(table_name):
        call_count[0] += 1
        if call_count[0] == 1:
            return mock_table_candidates  # Premier appel: GET candidates
        elif call_count[0] <= 4:
            return mock_table_merge  # Appels merge
        return mock_table_transfers  # Dernier appel: GET transfers

    mock_db.table.side_effect = table_router

    # Act & Assert

    # Étape 1: Détection des candidats
    response_candidates = test_client.get("/api/v1/transfers/candidates")
    assert response_candidates.status_code == 200
    candidates = response_candidates.json()
    assert len(candidates) == 1

    # Étape 2: Merge du transfert
    response_merge = test_client.post(
        "/api/v1/transfers/merge",
        json={
            "credit_transaction_id": negative_tx["transactionId"],
            "debit_transaction_id": positive_tx["transactionId"],
        },
    )
    assert response_merge.status_code == 200
    merge_result = response_merge.json()
    assert merge_result["transactionId"] == negative_tx["transactionId"]

    # Étape 3: Vérification dans la liste des transferts
    response_transfers = test_client.get("/api/v1/transfers")
    assert response_transfers.status_code == 200
    transfers = response_transfers.json()
    assert len(transfers) == 1
    assert transfers[0]["TransactionsSlaves"][0]["slaveAccountIsReal"] is True


def test_merge_then_split_restores_original(
    test_client, mock_db, sample_transfer_pair, sample_accounts, mock_supabase_response
):
    """Test de réversibilité : Merge → Split → État original.

    Vérifie qu'après un merge suivi d'un split, on retrouve
    une structure similaire à l'état initial.
    """
    # Arrange
    negative_tx = sample_transfer_pair["negative"]
    positive_tx = sample_transfer_pair["positive"]

    # Transaction après merge
    merged_tx = negative_tx.copy()
    merged_tx["TransactionsSlaves"] = [
        {
            "slaveId": "merged-slave-id",
            "accountId": sample_accounts[1]["accountId"],
            "amount": 100.0,
            "type": "debit",
            "slaveAccountIsReal": True,
            "slaveAccountName": "Banque B",
            "date": "2025-01-15T00:00:00",
            "masterId": negative_tx["transactionId"],
        }
    ]

    # Nouvelle transaction créée par le split
    recreated_tx = {
        "transactionId": "recreated-tx-id",
        "accountId": sample_accounts[1]["accountId"],
        "amount": 100.0,
        "type": "debit",
        "date": "2025-01-15T00:00:00",
        "description": "Split from transfer",
        "TransactionsSlaves": [
            {
                "slaveId": "recreated-slave-id",
                "accountId": sample_accounts[0]["accountId"],  # Retour vers Banque A
                "amount": -100.0,
                "type": "credit",
                "slaveAccountIsReal": True,
                "slaveAccountName": "Banque A",
            }
        ],
    }

    # Mock pour le split
    mock_table = MagicMock()
    mock_table.select.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([merged_tx])
    )
    mock_table.insert.return_value.execute.return_value = mock_supabase_response(
        [recreated_tx]
    )
    mock_table.delete.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([merged_tx["TransactionsSlaves"][0]])
    )

    mock_db.table.return_value = mock_table

    # Act: Split le transfert
    response_split = test_client.post(
        f"/api/v1/transactions/{merged_tx['transactionId']}/split-slave/merged-slave-id"
    )

    # Assert: Vérifier que le split a recréé une structure similaire
    assert response_split.status_code == 201
    result = response_split.json()

    # La nouvelle transaction existe
    assert "created_transaction" in result
    assert result["created_transaction"]["accountId"] == sample_accounts[1]["accountId"]

    # Un slave a été créé vers le compte d'origine
    assert "created_slave" in result
    assert result["created_slave"]["accountId"] == sample_accounts[0]["accountId"]

    # Le slave original a été supprimé
    assert "deleted_slave_id" in result
    assert result["deleted_slave_id"] == "merged-slave-id"


def test_multiple_transfer_pairs(
    test_client, mock_db, sample_transfer_pair, sample_accounts, mock_supabase_response
):
    """Détecte correctement plusieurs paires de transferts."""
    # Arrange: Créer 2 paires de transferts valides
    pair1_negative = sample_transfer_pair["negative"].copy()
    pair1_positive = sample_transfer_pair["positive"].copy()

    pair2_negative = sample_transfer_pair["negative"].copy()
    pair2_negative["transactionId"] = "pair2-negative-id"
    pair2_negative["date"] = "2025-01-20T00:00:00"
    pair2_negative["amount"] = 200.0
    pair2_negative["TransactionsSlaves"][0]["amount"] = -200.0

    pair2_positive = sample_transfer_pair["positive"].copy()
    pair2_positive["transactionId"] = "pair2-positive-id"
    pair2_positive["date"] = "2025-01-20T00:00:00"
    pair2_positive["amount"] = 200.0
    pair2_positive["TransactionsSlaves"][0]["amount"] = -200.0

    # Mock DB avec 4 transactions (2 paires)
    mock_table = MagicMock()
    mock_table.select.return_value.execute.return_value = mock_supabase_response(
        [pair1_negative, pair1_positive, pair2_negative, pair2_positive]
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.get("/api/v1/transfers/candidates")

    # Assert: Doit détecter 2 paires
    assert response.status_code == 200
    candidates = response.json()
    assert len(candidates) == 2

    # Vérifier que les montants correspondent
    amounts = [c["amount"] for c in candidates]
    assert 100.0 in amounts
    assert 200.0 in amounts


def test_patrimony_with_transfer(
    test_client, mock_db, sample_merged_transaction, sample_accounts, mock_supabase_response
):
    """Vérifie que les transferts s'annulent dans le calcul de patrimoine.

    Simule le calcul de patrimoine avec un transfert :
    - Banque A : -100€ (master)
    - Banque B : +100€ (slave)
    - Total patrimoine devrait être neutre (transfert interne)
    """
    # Arrange
    merged_tx = sample_merged_transaction

    # Simuler les soldes de comptes
    account_a_balance = {
        "accountId": sample_accounts[0]["accountId"],
        "name": "Banque A",
        "current_amount": 900.0,  # 1000 (initial) - 100 (transfert)
    }

    account_b_balance = {
        "accountId": sample_accounts[1]["accountId"],
        "name": "Banque B",
        "current_amount": 600.0,  # 500 (initial) + 100 (transfert)
    }

    # Mock pour récupérer les comptes et transactions
    mock_table = MagicMock()

    call_count = [0]

    def execute_side_effect():
        call_count[0] += 1
        if call_count[0] == 1:
            # Premier appel: récupérer les comptes
            return mock_supabase_response(sample_accounts)
        elif call_count[0] == 2:
            # Deuxième appel: récupérer la transaction merged
            return mock_supabase_response([merged_tx])
        # Appels suivants: balances
        return mock_supabase_response([account_a_balance, account_b_balance])

    mock_table.select.return_value.execute.side_effect = execute_side_effect
    mock_db.table.return_value = mock_table

    # Mock RPC pour les montants
    mock_db.rpc.return_value.execute.return_value = mock_supabase_response(
        [
            {"accountId": sample_accounts[0]["accountId"], "total_amount": -100.0},
            {"accountId": sample_accounts[1]["accountId"], "total_amount": 100.0},
        ]
    )

    # Act: Récupérer les comptes et leurs balances
    response_accounts = test_client.get("/api/v1/accounts/current-amounts")

    # Assert: Le total devrait refléter le transfert interne
    assert response_accounts.status_code == 200
    accounts = response_accounts.json()

    # Calculer le total du patrimoine
    total_patrimony = sum(acc["current_amount"] for acc in accounts)

    # Le patrimoine total devrait être 1500€ (1000 + 500 initial)
    # Le transfert interne n'ajoute ni ne retire d'argent
    assert total_patrimony == 1500.0

    # Vérifier les balances individuelles
    banque_a = next(a for a in accounts if a["name"] == "Banque A")
    banque_b = next(a for a in accounts if a["name"] == "Banque B")

    assert banque_a["current_amount"] == 900.0  # 1000 - 100
    assert banque_b["current_amount"] == 600.0  # 500 + 100
