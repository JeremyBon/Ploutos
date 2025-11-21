"""Fixtures partagées pour les tests."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from ploutos.api.main import app


@pytest.fixture
def mock_db():
    """Mock de get_db pour éviter d'appeler la vraie BDD Supabase."""
    return MagicMock()


@pytest.fixture
def test_client(mock_db, monkeypatch):
    """Client de test FastAPI avec mock DB."""
    # Patcher directement l'objet get_db dans le module ploutos.db
    import ploutos.db

    monkeypatch.setattr(ploutos.db, "get_db", mock_db)

    # Créer le client de test
    with TestClient(app) as client:
        yield client


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
                    "slaveId": "aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb",
                    "type": "debit",  # Type inversé
                    "amount": 100.0,  # Montant négatif
                    "date": "2025-01-15T00:00:00",
                    "accountId": sample_unknown_account["accountId"],
                    "masterId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                    "Accounts": {"is_real": False, "name": "Unknown"},
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
                    "slaveId": "bbbbbbbb-bbbb-bbbb-bbbb-cccccccccccc",
                    "type": "credit",  # Type inversé
                    "amount": 100.0,  # Montant négatif
                    "date": "2025-01-15T00:00:00",
                    "accountId": sample_unknown_account["accountId"],
                    "masterId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                    "Accounts": {"is_real": False, "name": "Unknown"},
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
                "slaveId": "cccccccc-cccc-cccc-cccc-dddddddddddd",
                "type": "debit",
                "amount": 100.0,  # Montant positif pour le slave
                "date": "2025-01-10T00:00:00",
                "accountId": sample_accounts[1]["accountId"],  # Banque B (compte réel!)
                "masterId": "cccccccc-cccc-cccc-cccc-cccccccccccc",
                "Accounts": {
                    "is_real": True,  # Compte réel = indicateur de transfert
                    "name": "Banque B",
                },
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
