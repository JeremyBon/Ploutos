"""Tests pour le rejet de paires de transferts candidates."""
from unittest.mock import MagicMock


def test_reject_transfer_candidate_success(
    test_client, mock_db, sample_transfer_pair, mock_supabase_response
):
    """Rejette une paire de candidats avec succès."""
    # Arrange: Mock la vérification d'existence (aucune) et l'insertion
    mock_table = MagicMock()

    # Premier appel: vérifier si déjà rejeté (non)
    mock_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([])
    )

    # Deuxième appel: insérer le rejet
    rejected_pair = {
        "pair_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
        "transaction_id_1": sample_transfer_pair["negative"]["transactionId"],
        "transaction_id_2": sample_transfer_pair["positive"]["transactionId"],
        "rejected_at": "2025-01-15T10:00:00",
        "rejected_reason": "Not a real transfer",
    }
    mock_table.insert.return_value.execute.return_value = mock_supabase_response(
        [rejected_pair]
    )

    mock_db.table.return_value = mock_table

    # Act
    response = test_client.post(
        "/transfers/candidates/reject",
        json={
            "credit_transaction_id": sample_transfer_pair["negative"]["transactionId"],
            "debit_transaction_id": sample_transfer_pair["positive"]["transactionId"],
            "rejected_reason": "Not a real transfer",
        },
    )

    # Assert
    assert response.status_code == 201
    result = response.json()
    assert result["pair_id"] == rejected_pair["pair_id"]
    assert result["rejected_reason"] == "Not a real transfer"


def test_reject_hides_from_candidates(
    test_client, mock_db, mock_supabase_response
):
    """Une paire rejetée n'apparaît plus dans les candidats."""
    # Arrange: La RPC retourne une liste vide (paire filtrée)
    mock_rpc = MagicMock()
    mock_rpc.execute.return_value = mock_supabase_response([])
    mock_db.rpc.return_value = mock_rpc

    # Act: Récupérer les candidats après rejet
    response = test_client.get("/transfers/candidates")

    # Assert: Aucun candidat
    assert response.status_code == 200
    candidates = response.json()
    assert len(candidates) == 0


def test_unreject_transfer_candidate(
    test_client, mock_db, sample_transfer_pair, mock_supabase_response
):
    """Annule le rejet d'une paire avec succès."""
    # Arrange: Mock la suppression
    mock_table = MagicMock()
    deleted_pair = {
        "pair_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
        "transaction_id_1": sample_transfer_pair["negative"]["transactionId"],
        "transaction_id_2": sample_transfer_pair["positive"]["transactionId"],
    }
    mock_table.delete.return_value.eq.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([deleted_pair])
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.delete(
        f"/transfers/candidates/reject/"
        f"{sample_transfer_pair['negative']['transactionId']}/"
        f"{sample_transfer_pair['positive']['transactionId']}"
    )

    # Assert
    assert response.status_code == 204


def test_unreject_shows_in_candidates(
    test_client, mock_db, sample_transfer_pair, mock_supabase_response
):
    """Une paire dont le rejet est annulé réapparaît dans les candidats."""
    # Arrange: La RPC retourne la paire (plus dans rejected)
    rpc_data = [
        {
            "transactionid_1": sample_transfer_pair["negative"]["transactionId"],
            "description_1": sample_transfer_pair["negative"]["description"],
            "date_1": sample_transfer_pair["negative"]["date"],
            "type_1": sample_transfer_pair["negative"]["type"],
            "amount_1": sample_transfer_pair["negative"]["amount"],
            "accountid_1": sample_transfer_pair["negative"]["accountId"],
            "accountname_1": "Banque A",
            "transactionid_2": sample_transfer_pair["positive"]["transactionId"],
            "description_2": sample_transfer_pair["positive"]["description"],
            "date_2": sample_transfer_pair["positive"]["date"],
            "type_2": sample_transfer_pair["positive"]["type"],
            "amount_2": sample_transfer_pair["positive"]["amount"],
            "accountid_2": sample_transfer_pair["positive"]["accountId"],
            "accountname_2": "Banque B",
        }
    ]

    mock_rpc = MagicMock()
    mock_rpc.execute.return_value = mock_supabase_response(rpc_data)
    mock_db.rpc.return_value = mock_rpc

    # Act
    response = test_client.get("/transfers/candidates")

    # Assert: La paire est de retour
    assert response.status_code == 200
    candidates = response.json()
    assert len(candidates) == 1


def test_reject_duplicate_returns_conflict(
    test_client, mock_db, sample_transfer_pair, mock_supabase_response
):
    """Rejeter une paire déjà rejetée retourne 409 Conflict."""
    # Arrange: Mock la vérification d'existence (existe déjà)
    mock_table = MagicMock()
    existing_rejection = {
        "pair_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
        "transaction_id_1": sample_transfer_pair["negative"]["transactionId"],
        "transaction_id_2": sample_transfer_pair["positive"]["transactionId"],
        "rejected_at": "2025-01-15T10:00:00",
        "rejected_reason": "Already rejected",
    }
    mock_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([existing_rejection])
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.post(
        "/transfers/candidates/reject",
        json={
            "credit_transaction_id": sample_transfer_pair["negative"]["transactionId"],
            "debit_transaction_id": sample_transfer_pair["positive"]["transactionId"],
            "rejected_reason": "Duplicate attempt",
        },
    )

    # Assert
    assert response.status_code == 409
    assert "already been rejected" in response.json()["detail"]


def test_unreject_not_found_returns_404(
    test_client, mock_db, mock_supabase_response
):
    """Annuler un rejet inexistant retourne 404."""
    # Arrange: Mock la suppression (rien trouvé)
    mock_table = MagicMock()
    mock_table.delete.return_value.eq.return_value.eq.return_value.execute.return_value = (
        mock_supabase_response([])
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.delete(
        "/transfers/candidates/reject/"
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/"
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    )

    # Assert
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


def test_get_rejected_pairs_empty(test_client, mock_db, mock_supabase_response):
    """Liste vide si aucune paire rejetée."""
    # Arrange
    mock_table = MagicMock()
    mock_table.select.return_value.execute.return_value = mock_supabase_response([])
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.get("/transfers/candidates/rejected")

    # Assert
    assert response.status_code == 200
    assert response.json() == []


def test_get_rejected_pairs_list(
    test_client, mock_db, sample_transfer_pair, mock_supabase_response
):
    """Liste toutes les paires rejetées avec leurs détails."""
    # Arrange
    rejected_pairs = [
        {
            "pair_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
            "transaction_id_1": sample_transfer_pair["negative"]["transactionId"],
            "transaction_id_2": sample_transfer_pair["positive"]["transactionId"],
            "rejected_at": "2025-01-15T10:00:00",
            "rejected_reason": "Not a transfer",
        },
        {
            "pair_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
            "transaction_id_1": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
            "transaction_id_2": "ffffffff-ffff-ffff-ffff-ffffffffffff",
            "rejected_at": "2025-01-16T11:00:00",
            "rejected_reason": "False positive",
        },
    ]

    mock_table = MagicMock()
    mock_table.select.return_value.execute.return_value = mock_supabase_response(
        rejected_pairs
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.get("/transfers/candidates/rejected")

    # Assert
    assert response.status_code == 200
    result = response.json()
    assert len(result) == 2
    assert result[0]["rejected_reason"] == "Not a transfer"
    assert result[1]["rejected_reason"] == "False positive"
