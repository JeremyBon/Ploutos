"""Fixtures partagées pour les tests."""
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from ploutos.api.main import app


@pytest.fixture
def mock_db(monkeypatch):
    """Mock de get_db pour éviter d'appeler la vraie BDD Supabase."""
    mock = MagicMock()
    # Patch dans tous les modules qui utilisent get_db
    monkeypatch.setattr("ploutos.api.deps.get_db", lambda: mock)
    return mock


@pytest.fixture
def test_client():
    """Client de test FastAPI."""
    return TestClient(app)


@pytest.fixture
def sample_accounts():
    """Deux comptes bancaires réels pour les tests de transfert."""
    return [
        {
            "accountId": "11111111-1111-1111-1111-111111111111",
            "name": "Banque A",
            "category": "Banking",
            "sub_category": "Checking",
            "is_real": True,
            "original_amount": 1000.0,
            "created_at": "2025-01-01T00:00:00",
            "updated_at": "2025-01-01T00:00:00",
        },
        {
            "accountId": "22222222-2222-2222-2222-222222222222",
            "name": "Banque B",
            "category": "Banking",
            "sub_category": "Checking",
            "is_real": True,
            "original_amount": 500.0,
            "created_at": "2025-01-01T00:00:00",
            "updated_at": "2025-01-01T00:00:00",
        },
    ]


@pytest.fixture
def sample_unknown_account():
    """Compte virtuel 'Unknown' pour les transactions non catégorisées."""
    return {
        "accountId": "99999999-9999-9999-9999-999999999999",
        "name": "Unknown",
        "category": "Virtual",
        "sub_category": "Uncategorized",
        "is_real": False,
        "original_amount": 0.0,
        "created_at": "2025-01-01T00:00:00",
        "updated_at": "2025-01-01T00:00:00",
    }


@pytest.fixture
def sample_transfer_pair(sample_accounts, sample_unknown_account):
    """Paire de transactions valides représentant un transfert.

    Transaction 1 (crédit/sortie) : Banque A, -100€
    Transaction 2 (débit/entrée) : Banque B, +100€
    Les deux ont des slaves vers Unknown.
    """
    return {
        "negative": {
            "transactionId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "description": "Virement vers Banque B",
            "date": "2025-01-15T00:00:00",
            "type": "credit",  # Sortie d'argent
            "amount": 100.0,
            "accountId": sample_accounts[0]["accountId"],  # Banque A
            "created_at": "2025-01-15T00:00:00",
            "updated_at": "2025-01-15T00:00:00",
            "TransactionsSlaves": [
                {
                    "slaveId": "slave-aaa",
                    "type": "debit",  # Type inversé
                    "amount": -100.0,  # Montant négatif
                    "date": "2025-01-15T00:00:00",
                    "accountId": sample_unknown_account["accountId"],
                    "masterId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                    "slaveAccountIsReal": False,
                }
            ],
        },
        "positive": {
            "transactionId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "description": "Virement depuis Banque A",
            "date": "2025-01-15T00:00:00",
            "type": "debit",  # Entrée d'argent
            "amount": 100.0,
            "accountId": sample_accounts[1]["accountId"],  # Banque B
            "created_at": "2025-01-15T00:00:00",
            "updated_at": "2025-01-15T00:00:00",
            "TransactionsSlaves": [
                {
                    "slaveId": "slave-bbb",
                    "type": "credit",  # Type inversé
                    "amount": -100.0,  # Montant négatif
                    "date": "2025-01-15T00:00:00",
                    "accountId": sample_unknown_account["accountId"],
                    "masterId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                    "slaveAccountIsReal": False,
                }
            ],
        },
    }


@pytest.fixture
def sample_merged_transaction(sample_accounts):
    """Transaction déjà mergée avec un slave vers un compte réel.

    Représente un transfert déjà traité :
    - Master : Banque A, -100€ (crédit/sortie)
    - Slave : Banque B, +100€ (compte réel)
    """
    return {
        "transactionId": "cccccccc-cccc-cccc-cccc-cccccccccccc",
        "description": "Transfert vers Banque B",
        "date": "2025-01-10T00:00:00",
        "type": "credit",
        "amount": 100.0,
        "accountId": sample_accounts[0]["accountId"],  # Banque A
        "created_at": "2025-01-10T00:00:00",
        "updated_at": "2025-01-10T00:00:00",
        "TransactionsSlaves": [
            {
                "slaveId": "slave-ccc",
                "type": "debit",
                "amount": 100.0,  # Montant positif pour le slave
                "date": "2025-01-10T00:00:00",
                "accountId": sample_accounts[1]["accountId"],  # Banque B (compte réel!)
                "masterId": "cccccccc-cccc-cccc-cccc-cccccccccccc",
                "slaveAccountIsReal": True,  # Indicateur de transfert
                "slaveAccountName": "Banque B",
            }
        ],
    }


@pytest.fixture
def mock_supabase_response():
    """Helper pour créer des réponses Supabase mockées."""

    def _create_response(data, count=None):
        """Crée un objet de réponse Supabase mocké.

        Args:
            data: Les données à retourner (list ou dict)
            count: Nombre optionnel de résultats

        Returns:
            SimpleNamespace avec .data et optionnellement .count
        """
        response = SimpleNamespace(data=data)
        if count is not None:
            response.count = count
        return response

    return _create_response