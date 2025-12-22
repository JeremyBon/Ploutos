"""Tests pour le router /budget."""

from unittest.mock import MagicMock, patch

import pytest

from ploutos.api.routers.budget import (
    _calculate_percent,
    _calculate_percent_change,
    _determine_position_indicator,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def sample_virtual_accounts():
    """Comptes virtuels pour les tests de budget."""
    return [
        {
            "accountId": "11111111-1111-1111-1111-111111111111",
            "name": "Alimentation",
            "is_real": False,
            "active": True,
        },
        {
            "accountId": "22222222-2222-2222-2222-222222222222",
            "name": "Transport",
            "is_real": False,
            "active": True,
        },
    ]


@pytest.fixture
def sample_real_account():
    """Compte réel (ne peut pas avoir de budget)."""
    return {
        "accountId": "33333333-3333-3333-3333-333333333333",
        "name": "Banque A",
        "is_real": True,
        "active": True,
    }


@pytest.fixture
def sample_budgets():
    """Budgets pour les tests."""
    return [
        {
            "accountId": "11111111-1111-1111-1111-111111111111",
            "year": 2025,
            "annual_budget": 6000.0,
        },
        {
            "accountId": "22222222-2222-2222-2222-222222222222",
            "year": 2025,
            "annual_budget": 2400.0,
        },
    ]


# =============================================================================
# Tests pour les fonctions utilitaires
# =============================================================================


class TestDeterminePositionIndicator:
    """Tests pour _determine_position_indicator."""

    def test_ahead_when_spending_below_threshold(self):
        """Retourne 'ahead' si dépenses < temps écoulé - tolérance."""
        # 30% dépensé, 50% de l'année écoulée, tolérance 5%
        # 30 < 50 - 5 = 45, donc ahead
        result = _determine_position_indicator(30.0, 50.0)
        assert result == "ahead"

    def test_behind_when_spending_above_threshold(self):
        """Retourne 'behind' si dépenses > temps écoulé + tolérance."""
        # 60% dépensé, 50% de l'année écoulée, tolérance 5%
        # 60 > 50 + 5 = 55, donc behind
        result = _determine_position_indicator(60.0, 50.0)
        assert result == "behind"

    def test_on_track_when_within_tolerance(self):
        """Retourne 'on_track' si dépenses dans la tolérance."""
        # 52% dépensé, 50% de l'année écoulée, tolérance 5%
        # 45 <= 52 <= 55, donc on_track
        result = _determine_position_indicator(52.0, 50.0)
        assert result == "on_track"

    def test_on_track_at_lower_boundary(self):
        """Retourne 'on_track' à la limite basse de la tolérance."""
        # 45% dépensé, 50% de l'année écoulée
        # 45 = 50 - 5, donc on_track (pas ahead)
        result = _determine_position_indicator(45.0, 50.0)
        assert result == "on_track"

    def test_on_track_at_upper_boundary(self):
        """Retourne 'on_track' à la limite haute de la tolérance."""
        # 55% dépensé, 50% de l'année écoulée
        # 55 = 50 + 5, donc on_track (pas behind)
        result = _determine_position_indicator(55.0, 50.0)
        assert result == "on_track"


class TestCalculatePercent:
    """Tests pour _calculate_percent."""

    def test_calculate_percent_normal(self):
        """Calcule correctement le pourcentage."""
        result = _calculate_percent(250.0, 1000.0)
        assert result == 25.0

    def test_calculate_percent_zero_budget(self):
        """Retourne 0 si le budget est 0."""
        result = _calculate_percent(100.0, 0.0)
        assert result == 0.0

    def test_calculate_percent_rounds_to_one_decimal(self):
        """Arrondit à une décimale."""
        result = _calculate_percent(333.33, 1000.0)
        assert result == 33.3

    def test_calculate_percent_over_100(self):
        """Peut retourner plus de 100% si dépassement."""
        result = _calculate_percent(1500.0, 1000.0)
        assert result == 150.0


# =============================================================================
# Tests pour GET /budget/{year}
# =============================================================================


def test_get_budgets_by_year_returns_all_virtual_accounts(
    test_client,
    mock_db,
    sample_virtual_accounts,
    sample_budgets,
    mock_supabase_response,
):
    """Retourne tous les comptes virtuels avec leurs budgets."""
    # Arrange
    db_response = [
        {
            "accountId": sample_virtual_accounts[0]["accountId"],
            "name": sample_virtual_accounts[0]["name"],
            "Budget": [{"annual_budget": sample_budgets[0]["annual_budget"]}],
        },
        {
            "accountId": sample_virtual_accounts[1]["accountId"],
            "name": sample_virtual_accounts[1]["name"],
            "Budget": [{"annual_budget": sample_budgets[1]["annual_budget"]}],
        },
    ]

    mock_table = MagicMock()
    mock_table.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = mock_supabase_response(
        db_response
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.get("/budget/2025")

    # Assert
    assert response.status_code == 200
    budgets = response.json()
    assert len(budgets) == 2
    assert budgets[0]["account_id"] == sample_virtual_accounts[0]["accountId"]
    assert budgets[0]["annual_budget"] == 6000.0
    assert budgets[0]["monthly_budget"] == 500.0  # 6000 / 12
    assert budgets[1]["account_id"] == sample_virtual_accounts[1]["accountId"]
    assert budgets[1]["annual_budget"] == 2400.0
    assert budgets[1]["monthly_budget"] == 200.0  # 2400 / 12


def test_get_budgets_by_year_with_null_budget(
    test_client, mock_db, sample_virtual_accounts, mock_supabase_response
):
    """Retourne null pour les comptes sans budget défini."""
    # Arrange
    db_response = [
        {
            "accountId": sample_virtual_accounts[0]["accountId"],
            "name": sample_virtual_accounts[0]["name"],
            "Budget": [],  # Pas de budget défini
        },
    ]

    mock_table = MagicMock()
    mock_table.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = mock_supabase_response(
        db_response
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.get("/budget/2025")

    # Assert
    assert response.status_code == 200
    budgets = response.json()
    assert len(budgets) == 1
    assert budgets[0]["annual_budget"] is None
    assert budgets[0]["monthly_budget"] is None


def test_get_budgets_by_year_empty(test_client, mock_db, mock_supabase_response):
    """Retourne une liste vide si aucun compte virtuel."""
    # Arrange
    mock_table = MagicMock()
    mock_table.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = mock_supabase_response(
        []
    )
    mock_db.table.return_value = mock_table

    # Act
    response = test_client.get("/budget/2025")

    # Assert
    assert response.status_code == 200
    assert response.json() == []


# =============================================================================
# Tests pour PUT /budget
# =============================================================================


def test_upsert_budget_creates_new_budget(
    test_client, mock_db, sample_virtual_accounts, mock_supabase_response
):
    """Crée un nouveau budget pour un compte virtuel."""
    # Arrange
    account = sample_virtual_accounts[0]

    # Mock pour la vérification du compte
    mock_table_accounts = MagicMock()
    mock_table_accounts.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_supabase_response(
        {"is_real": False}
    )

    # Mock pour l'upsert du budget
    mock_table_budget = MagicMock()
    upsert_result = {
        "accountId": account["accountId"],
        "year": 2025,
        "annual_budget": 6000.0,
    }
    mock_table_budget.upsert.return_value.execute.return_value = mock_supabase_response(
        [upsert_result]
    )

    def table_router(table_name):
        if table_name == "Accounts":
            return mock_table_accounts
        elif table_name == "Budget":
            return mock_table_budget
        return MagicMock()

    mock_db.table.side_effect = table_router

    # Act
    response = test_client.put(
        "/budget",
        json={
            "account_id": account["accountId"],
            "year": 2025,
            "annual_budget": 6000.0,
        },
    )

    # Assert
    assert response.status_code == 200
    result = response.json()
    assert result["accountId"] == account["accountId"]
    assert result["annual_budget"] == 6000.0


def test_upsert_budget_updates_existing_budget(
    test_client, mock_db, sample_virtual_accounts, mock_supabase_response
):
    """Met à jour un budget existant."""
    # Arrange
    account = sample_virtual_accounts[0]

    mock_table_accounts = MagicMock()
    mock_table_accounts.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_supabase_response(
        {"is_real": False}
    )

    mock_table_budget = MagicMock()
    upsert_result = {
        "accountId": account["accountId"],
        "year": 2025,
        "annual_budget": 7200.0,  # Nouveau montant
    }
    mock_table_budget.upsert.return_value.execute.return_value = mock_supabase_response(
        [upsert_result]
    )

    def table_router(table_name):
        if table_name == "Accounts":
            return mock_table_accounts
        elif table_name == "Budget":
            return mock_table_budget
        return MagicMock()

    mock_db.table.side_effect = table_router

    # Act
    response = test_client.put(
        "/budget",
        json={
            "account_id": account["accountId"],
            "year": 2025,
            "annual_budget": 7200.0,
        },
    )

    # Assert
    assert response.status_code == 200
    result = response.json()
    assert result["annual_budget"] == 7200.0


def test_upsert_budget_rejects_real_account(
    test_client, mock_db, sample_real_account, mock_supabase_response
):
    """Rejette la création de budget sur un compte réel."""
    # Arrange
    mock_table_accounts = MagicMock()
    mock_table_accounts.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_supabase_response(
        {"is_real": True}
    )

    mock_db.table.return_value = mock_table_accounts

    # Act
    response = test_client.put(
        "/budget",
        json={
            "account_id": sample_real_account["accountId"],
            "year": 2025,
            "annual_budget": 6000.0,
        },
    )

    # Assert
    assert response.status_code == 400
    assert "virtuel" in response.json()["detail"].lower()


def test_upsert_budget_rejects_unknown_account(
    test_client, mock_db, mock_supabase_response
):
    """Erreur 404 si le compte n'existe pas."""
    # Arrange
    mock_table_accounts = MagicMock()
    mock_table_accounts.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_supabase_response(
        None
    )

    mock_db.table.return_value = mock_table_accounts

    # Act
    response = test_client.put(
        "/budget",
        json={
            "account_id": "00000000-0000-0000-0000-000000000000",
            "year": 2025,
            "annual_budget": 6000.0,
        },
    )

    # Assert
    assert response.status_code == 404
    assert "non trouvé" in response.json()["detail"].lower()


def test_upsert_budget_rejects_negative_amount(test_client, mock_db):
    """Erreur 422 si le montant est négatif."""
    # Act
    response = test_client.put(
        "/budget",
        json={
            "account_id": "11111111-1111-1111-1111-111111111111",
            "year": 2025,
            "annual_budget": -1000.0,
        },
    )

    # Assert
    assert response.status_code == 422


# =============================================================================
# Tests pour GET /budget/{year}/consumption
# =============================================================================


def test_get_budget_consumption_returns_spending_stats(
    test_client, mock_db, mock_supabase_response
):
    """Retourne les statistiques de consommation du budget."""
    # Arrange
    rpc_data = [
        {
            "accountId": "11111111-1111-1111-1111-111111111111",
            "account_name": "Alimentation",
            "annual_budget": 6000.0,
            "spending_month": 450.0,
            "spending_ytd": 2800.0,
        },
    ]

    mock_rpc = MagicMock()
    mock_rpc.execute.return_value = mock_supabase_response(rpc_data)
    mock_db.rpc.return_value = mock_rpc

    # Act
    with patch(
        "ploutos.api.routers.budget.calculate_percent_year_elapsed", return_value=50.0
    ):
        response = test_client.get("/budget/2025/consumption")

    # Assert
    assert response.status_code == 200
    consumption = response.json()
    assert len(consumption) == 1

    item = consumption[0]
    assert item["account_id"] == "11111111-1111-1111-1111-111111111111"
    assert item["account_name"] == "Alimentation"
    assert item["annual_budget"] == 6000.0
    assert item["monthly_budget"] == 500.0  # 6000 / 12
    assert item["spent_month"] == 450.0
    assert item["remaining_month"] == 50.0  # 500 - 450
    assert item["percent_month"] == 90.0  # 450 / 500 * 100
    assert item["spent_ytd"] == 2800.0
    assert item["remaining_ytd"] == 3200.0  # 6000 - 2800
    assert item["percent_ytd"] == 46.7  # 2800 / 6000 * 100
    assert item["percent_year_elapsed"] == 50.0


def test_get_budget_consumption_position_ahead(
    test_client, mock_db, mock_supabase_response
):
    """Position 'ahead' quand dépenses bien inférieures au temps écoulé."""
    # Arrange
    rpc_data = [
        {
            "accountId": "11111111-1111-1111-1111-111111111111",
            "account_name": "Alimentation",
            "annual_budget": 6000.0,
            "spending_month": 200.0,
            "spending_ytd": 1800.0,  # 30% du budget
        },
    ]

    mock_rpc = MagicMock()
    mock_rpc.execute.return_value = mock_supabase_response(rpc_data)
    mock_db.rpc.return_value = mock_rpc

    # Act
    with patch(
        "ploutos.api.routers.budget.calculate_percent_year_elapsed", return_value=50.0
    ):
        response = test_client.get("/budget/2025/consumption")

    # Assert
    assert response.status_code == 200
    assert response.json()[0]["position_indicator"] == "ahead"


def test_get_budget_consumption_position_behind(
    test_client, mock_db, mock_supabase_response
):
    """Position 'behind' quand dépenses bien supérieures au temps écoulé."""
    # Arrange
    rpc_data = [
        {
            "accountId": "11111111-1111-1111-1111-111111111111",
            "account_name": "Alimentation",
            "annual_budget": 6000.0,
            "spending_month": 800.0,
            "spending_ytd": 4200.0,  # 70% du budget
        },
    ]

    mock_rpc = MagicMock()
    mock_rpc.execute.return_value = mock_supabase_response(rpc_data)
    mock_db.rpc.return_value = mock_rpc

    # Act
    with patch(
        "ploutos.api.routers.budget.calculate_percent_year_elapsed", return_value=50.0
    ):
        response = test_client.get("/budget/2025/consumption")

    # Assert
    assert response.status_code == 200
    assert response.json()[0]["position_indicator"] == "behind"


def test_get_budget_consumption_position_on_track(
    test_client, mock_db, mock_supabase_response
):
    """Position 'on_track' quand dépenses dans la tolérance."""
    # Arrange
    rpc_data = [
        {
            "accountId": "11111111-1111-1111-1111-111111111111",
            "account_name": "Alimentation",
            "annual_budget": 6000.0,
            "spending_month": 500.0,
            "spending_ytd": 3000.0,  # 50% du budget
        },
    ]

    mock_rpc = MagicMock()
    mock_rpc.execute.return_value = mock_supabase_response(rpc_data)
    mock_db.rpc.return_value = mock_rpc

    # Act
    with patch(
        "ploutos.api.routers.budget.calculate_percent_year_elapsed", return_value=50.0
    ):
        response = test_client.get("/budget/2025/consumption")

    # Assert
    assert response.status_code == 200
    assert response.json()[0]["position_indicator"] == "on_track"


def test_get_budget_consumption_handles_null_spending(
    test_client, mock_db, mock_supabase_response
):
    """Gère correctement les dépenses nulles (None)."""
    # Arrange
    rpc_data = [
        {
            "accountId": "11111111-1111-1111-1111-111111111111",
            "account_name": "Alimentation",
            "annual_budget": 6000.0,
            "spending_month": None,  # Pas de dépenses ce mois
            "spending_ytd": None,  # Pas de dépenses cette année
        },
    ]

    mock_rpc = MagicMock()
    mock_rpc.execute.return_value = mock_supabase_response(rpc_data)
    mock_db.rpc.return_value = mock_rpc

    # Act
    with patch(
        "ploutos.api.routers.budget.calculate_percent_year_elapsed", return_value=50.0
    ):
        response = test_client.get("/budget/2025/consumption")

    # Assert
    assert response.status_code == 200
    item = response.json()[0]
    assert item["spent_month"] == 0.0
    assert item["spent_ytd"] == 0.0
    assert item["remaining_month"] == 500.0
    assert item["remaining_ytd"] == 6000.0
    assert item["position_indicator"] == "ahead"


def test_get_budget_consumption_empty(test_client, mock_db, mock_supabase_response):
    """Retourne une liste vide si aucun budget défini."""
    # Arrange
    mock_rpc = MagicMock()
    mock_rpc.execute.return_value = mock_supabase_response([])
    mock_db.rpc.return_value = mock_rpc

    # Act
    with patch(
        "ploutos.api.routers.budget.calculate_percent_year_elapsed", return_value=50.0
    ):
        response = test_client.get("/budget/2025/consumption")

    # Assert
    assert response.status_code == 200
    assert response.json() == []


# =============================================================================
# Tests pour _calculate_percent_change
# =============================================================================


class TestCalculatePercentChange:
    """Tests pour _calculate_percent_change."""

    def test_positive_change(self):
        """Calcule une augmentation positive."""
        result = _calculate_percent_change(320.0, 280.0)
        assert result == 14.3

    def test_negative_change(self):
        """Calcule une diminution."""
        result = _calculate_percent_change(200.0, 400.0)
        assert result == -50.0

    def test_zero_previous_returns_none(self):
        """Retourne None si l'année précédente est 0."""
        result = _calculate_percent_change(100.0, 0.0)
        assert result is None

    def test_no_change(self):
        """Retourne 0 si pas de changement."""
        result = _calculate_percent_change(300.0, 300.0)
        assert result == 0.0


# =============================================================================
# Tests pour GET /budget-comparison/{year}/{month}
# =============================================================================


def test_get_budget_comparison_returns_comparison(
    test_client, mock_db, mock_supabase_response
):
    """Retourne la comparaison des dépenses entre deux années."""
    # Arrange
    rpc_data = [
        {
            "accountId": "11111111-1111-1111-1111-111111111111",
            "account_name": "Alimentation",
            "spent_current": 320.0,
            "spent_previous": 280.0,
        },
        {
            "accountId": "22222222-2222-2222-2222-222222222222",
            "account_name": "Transport",
            "spent_current": 150.0,
            "spent_previous": 200.0,
        },
    ]

    mock_rpc = MagicMock()
    mock_rpc.execute.return_value = mock_supabase_response(rpc_data)
    mock_db.rpc.return_value = mock_rpc

    # Act
    response = test_client.get("/budget-comparison/2025/6")

    # Assert
    assert response.status_code == 200
    comparison = response.json()
    assert len(comparison) == 2

    assert comparison[0]["account_id"] == "11111111-1111-1111-1111-111111111111"
    assert comparison[0]["account_name"] == "Alimentation"
    assert comparison[0]["spent_current"] == 320.0
    assert comparison[0]["spent_previous"] == 280.0
    assert comparison[0]["difference"] == 40.0
    assert comparison[0]["percent_change"] == 14.3

    assert comparison[1]["account_id"] == "22222222-2222-2222-2222-222222222222"
    assert comparison[1]["difference"] == -50.0
    assert comparison[1]["percent_change"] == -25.0


def test_get_budget_comparison_with_zero_previous(
    test_client, mock_db, mock_supabase_response
):
    """percent_change est null si pas de dépenses l'année précédente."""
    # Arrange
    rpc_data = [
        {
            "accountId": "11111111-1111-1111-1111-111111111111",
            "account_name": "Alimentation",
            "spent_current": 320.0,
            "spent_previous": 0.0,
        },
    ]

    mock_rpc = MagicMock()
    mock_rpc.execute.return_value = mock_supabase_response(rpc_data)
    mock_db.rpc.return_value = mock_rpc

    # Act
    response = test_client.get("/budget-comparison/2025/6")

    # Assert
    assert response.status_code == 200
    comparison = response.json()
    assert comparison[0]["percent_change"] is None
    assert comparison[0]["difference"] == 320.0


def test_get_budget_comparison_empty(test_client, mock_db, mock_supabase_response):
    """Retourne une liste vide si aucune donnée."""
    # Arrange
    mock_rpc = MagicMock()
    mock_rpc.execute.return_value = mock_supabase_response([])
    mock_db.rpc.return_value = mock_rpc

    # Act
    response = test_client.get("/budget-comparison/2025/6")

    # Assert
    assert response.status_code == 200
    assert response.json() == []


def test_get_budget_comparison_handles_null_values(
    test_client, mock_db, mock_supabase_response
):
    """Gère les valeurs null retournées par la base."""
    # Arrange
    rpc_data = [
        {
            "accountId": "11111111-1111-1111-1111-111111111111",
            "account_name": "Alimentation",
            "spent_current": None,
            "spent_previous": 280.0,
        },
    ]

    mock_rpc = MagicMock()
    mock_rpc.execute.return_value = mock_supabase_response(rpc_data)
    mock_db.rpc.return_value = mock_rpc

    # Act
    response = test_client.get("/budget-comparison/2025/6")

    # Assert
    assert response.status_code == 200
    comparison = response.json()
    assert comparison[0]["spent_current"] == 0.0
    assert comparison[0]["spent_previous"] == 280.0
    assert comparison[0]["difference"] == -280.0
