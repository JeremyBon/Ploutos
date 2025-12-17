"""Tests pour le service de matching des transactions."""

import pytest
from unittest.mock import MagicMock
from types import SimpleNamespace

from ploutos.services.matching_service import (
    _apply_condition_filter,
    _filter_single_slave,
    _match_and_conditions,
    _match_or_conditions,
    find_matching_transactions,
)
from ploutos.db.models import MatchType, LogicalOperator


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_query():
    """Mock d'un query builder Supabase."""
    query = MagicMock()
    # Chaîne fluide: chaque méthode retourne self
    query.ilike.return_value = query
    query.filter.return_value = query
    query.gt.return_value = query
    query.lt.return_value = query
    query.gte.return_value = query
    query.lte.return_value = query
    query.eq.return_value = query
    return query


@pytest.fixture
def sample_transaction():
    """Transaction de base pour les tests."""
    return {
        "transactionId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "description": "AMAZON MARKETPLACE",
        "date": "2025-01-15T00:00:00",
        "type": "credit",
        "amount": 50.0,
        "accountId": "11111111-1111-1111-1111-111111111111",
        "TransactionsSlaves": [
            {
                "slaveId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                "type": "debit",
                "amount": 50.0,
                "Accounts": {
                    "name": "Unknown",
                    "category": "Unknown",
                    "sub_category": "Unknown",
                    "is_real": False,
                },
            }
        ],
    }


@pytest.fixture
def mock_db_with_transactions():
    """Crée un mock DB qui retourne les transactions configurées."""

    def _create_mock(transactions_list):
        """
        Args:
            transactions_list: Liste de transactions à retourner
        """
        mock_db = MagicMock()
        mock_table = MagicMock()
        mock_select = MagicMock()

        # Configuration de la chaîne fluide
        mock_db.table.return_value = mock_table
        mock_table.select.return_value = mock_select

        # Chaque méthode de filtre retourne self
        for method in [
            "eq",
            "in_",
            "ilike",
            "filter",
            "gt",
            "lt",
            "gte",
            "lte",
            "range",
        ]:
            setattr(mock_select, method, MagicMock(return_value=mock_select))

        # Configure execute pour retourner les transactions
        mock_select.execute.return_value = SimpleNamespace(data=transactions_list)

        return mock_db

    return _create_mock


# =============================================================================
# Tests pour _apply_condition_filter - Description Matching
# =============================================================================


class TestApplyConditionFilterDescription:
    """Tests pour les conditions de matching sur la description."""

    def test_contains_builds_ilike_query(self, mock_query):
        """CONTAINS doit générer un ilike avec %value%."""
        condition = {"match_type": MatchType.CONTAINS.value, "match_value": "AMAZON"}

        result = _apply_condition_filter(mock_query, condition)

        mock_query.ilike.assert_called_once_with("description", "%AMAZON%")
        assert result == mock_query

    def test_starts_with_builds_ilike_query(self, mock_query):
        """STARTS_WITH doit générer un ilike avec value%."""
        condition = {
            "match_type": MatchType.STARTS_WITH.value,
            "match_value": "VIREMENT",
        }

        result = _apply_condition_filter(mock_query, condition)

        mock_query.ilike.assert_called_once_with("description", "VIREMENT%")
        assert result == mock_query

    def test_exact_builds_ilike_query(self, mock_query):
        """EXACT doit générer un ilike exact (case insensitive)."""
        condition = {
            "match_type": MatchType.EXACT.value,
            "match_value": "PAIEMENT CB CARREFOUR",
        }

        result = _apply_condition_filter(mock_query, condition)

        mock_query.ilike.assert_called_once_with("description", "PAIEMENT CB CARREFOUR")
        assert result == mock_query

    def test_regex_returns_none_handled_via_rpc(self, mock_query):
        """REGEX retourne None car géré séparément via RPC."""
        condition = {
            "match_type": MatchType.REGEX.value,
            "match_value": r"PAIEMENT.*CB.*\d{4}",
        }

        result = _apply_condition_filter(mock_query, condition)

        # Regex conditions are handled via RPC, not query filter
        mock_query.filter.assert_not_called()
        assert result is None


# =============================================================================
# Tests pour _apply_condition_filter - Amount Matching
# =============================================================================


class TestApplyConditionFilterAmount:
    """Tests pour les conditions de matching sur le montant."""

    def test_amount_gt_builds_gt_query(self, mock_query):
        """AMOUNT_GT doit générer une comparaison >."""
        condition = {"match_type": MatchType.AMOUNT_GT.value, "match_value": "100"}

        result = _apply_condition_filter(mock_query, condition)

        mock_query.gt.assert_called_once_with("amount", 100.0)
        assert result == mock_query

    def test_amount_lt_builds_lt_query(self, mock_query):
        """AMOUNT_LT doit générer une comparaison <."""
        condition = {"match_type": MatchType.AMOUNT_LT.value, "match_value": "50.5"}

        result = _apply_condition_filter(mock_query, condition)

        mock_query.lt.assert_called_once_with("amount", 50.5)
        assert result == mock_query

    def test_amount_gte_builds_gte_query(self, mock_query):
        """AMOUNT_GTE doit générer une comparaison >=."""
        condition = {"match_type": MatchType.AMOUNT_GTE.value, "match_value": "200"}

        result = _apply_condition_filter(mock_query, condition)

        mock_query.gte.assert_called_once_with("amount", 200.0)
        assert result == mock_query

    def test_amount_lte_builds_lte_query(self, mock_query):
        """AMOUNT_LTE doit générer une comparaison <=."""
        condition = {"match_type": MatchType.AMOUNT_LTE.value, "match_value": "99.99"}

        result = _apply_condition_filter(mock_query, condition)

        mock_query.lte.assert_called_once_with("amount", 99.99)
        assert result == mock_query

    def test_amount_eq_builds_eq_query(self, mock_query):
        """AMOUNT_EQ doit générer une comparaison =."""
        condition = {"match_type": MatchType.AMOUNT_EQ.value, "match_value": "42.0"}

        result = _apply_condition_filter(mock_query, condition)

        mock_query.eq.assert_called_once_with("amount", 42.0)
        assert result == mock_query

    def test_amount_with_string_value_converts_to_float(self, mock_query):
        """Les valeurs de montant string doivent être converties en float."""
        condition = {"match_type": MatchType.AMOUNT_GT.value, "match_value": "123.45"}

        _apply_condition_filter(mock_query, condition)

        mock_query.gt.assert_called_once_with("amount", 123.45)


# =============================================================================
# Tests pour _apply_condition_filter - Edge Cases
# =============================================================================


class TestApplyConditionFilterEdgeCases:
    """Tests pour les cas limites du filtre de conditions."""

    def test_unknown_match_type_raises_error(self, mock_query):
        """Un type de match inconnu doit lever une erreur."""
        condition = {"match_type": "unknown_type", "match_value": "test"}

        with pytest.raises(ValueError, match="Unknown match type"):
            _apply_condition_filter(mock_query, condition)

    def test_special_characters_in_value(self, mock_query):
        """Les caractères spéciaux doivent être passés tels quels."""
        condition = {
            "match_type": MatchType.CONTAINS.value,
            "match_value": "PAIEMENT 50%",
        }

        _apply_condition_filter(mock_query, condition)

        mock_query.ilike.assert_called_once_with("description", "%PAIEMENT 50%%")


# =============================================================================
# Tests pour _filter_single_slave
# =============================================================================


class TestFilterSingleSlave:
    """Tests pour le filtre de transactions à slave unique."""

    def test_keeps_transactions_with_one_slave(self, sample_transaction):
        """Transactions avec 1 slave sont conservées."""
        transactions = [sample_transaction]

        result = _filter_single_slave(transactions)

        assert len(result) == 1
        assert result[0] == sample_transaction

    def test_filters_transactions_with_multiple_slaves(self, sample_transaction):
        """Transactions avec plusieurs slaves sont filtrées."""
        tx_with_multiple_slaves = {
            **sample_transaction,
            "TransactionsSlaves": [
                {"slaveId": "slave1"},
                {"slaveId": "slave2"},
            ],
        }
        transactions = [tx_with_multiple_slaves]

        result = _filter_single_slave(transactions)

        assert len(result) == 0

    def test_filters_transactions_with_no_slaves(self, sample_transaction):
        """Transactions sans slave sont filtrées."""
        tx_no_slaves = {**sample_transaction, "TransactionsSlaves": []}
        transactions = [tx_no_slaves]

        result = _filter_single_slave(transactions)

        assert len(result) == 0

    def test_mixed_transactions(self, sample_transaction):
        """Seules les transactions avec 1 slave sont conservées."""
        tx_one_slave = sample_transaction
        tx_two_slaves = {
            **sample_transaction,
            "transactionId": "tx2",
            "TransactionsSlaves": [{"slaveId": "s1"}, {"slaveId": "s2"}],
        }
        tx_no_slaves = {
            **sample_transaction,
            "transactionId": "tx3",
            "TransactionsSlaves": [],
        }

        result = _filter_single_slave([tx_one_slave, tx_two_slaves, tx_no_slaves])

        assert len(result) == 1
        assert result[0]["transactionId"] == sample_transaction["transactionId"]


# =============================================================================
# Tests pour _match_and_conditions
# =============================================================================


class TestMatchAndConditions:
    """Tests pour la logique AND de matching."""

    @pytest.mark.asyncio
    async def test_and_with_single_condition_matches(self, mock_db_with_transactions):
        """AND avec une seule condition doit matcher."""
        tx = {
            "transactionId": "tx1",
            "description": "AMAZON ORDER",
            "amount": 50.0,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {}
        conditions = [{"match_type": MatchType.CONTAINS.value, "match_value": "AMAZON"}]

        result = await _match_and_conditions(mock_db, rule, conditions, page_size=100)

        assert len(result) == 1
        assert result[0]["transactionId"] == "tx1"

    @pytest.mark.asyncio
    async def test_and_with_multiple_description_conditions(
        self, mock_db_with_transactions
    ):
        """AND avec plusieurs conditions de description."""
        tx = {
            "transactionId": "tx1",
            "description": "AMAZON PRIME SUBSCRIPTION",
            "amount": 9.99,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {}
        conditions = [
            {"match_type": MatchType.CONTAINS.value, "match_value": "AMAZON"},
            {"match_type": MatchType.CONTAINS.value, "match_value": "PRIME"},
        ]

        result = await _match_and_conditions(mock_db, rule, conditions, page_size=100)

        # Les deux conditions sont chaînées dans la query
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_and_with_description_and_amount(self, mock_db_with_transactions):
        """AND avec condition description + montant."""
        tx = {
            "transactionId": "tx1",
            "description": "AMAZON ORDER",
            "amount": 150.0,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {}
        conditions = [
            {"match_type": MatchType.CONTAINS.value, "match_value": "AMAZON"},
            {"match_type": MatchType.AMOUNT_GT.value, "match_value": "100"},
        ]

        result = await _match_and_conditions(mock_db, rule, conditions, page_size=100)

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_and_with_amount_range(self, mock_db_with_transactions):
        """AND avec deux conditions de montant (range)."""
        tx = {
            "transactionId": "tx1",
            "description": "Test",
            "amount": 75.0,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {}
        conditions = [
            {"match_type": MatchType.AMOUNT_GTE.value, "match_value": "50"},
            {"match_type": MatchType.AMOUNT_LTE.value, "match_value": "100"},
        ]

        result = await _match_and_conditions(mock_db, rule, conditions, page_size=100)

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_and_with_empty_conditions_returns_empty(
        self, mock_db_with_transactions
    ):
        """AND avec conditions vides retourne une liste vide."""
        mock_db = mock_db_with_transactions([])
        rule = {}
        conditions = []

        result = await _match_and_conditions(mock_db, rule, conditions, page_size=100)

        assert result == []

    @pytest.mark.asyncio
    async def test_and_no_matches_returns_empty(self, mock_db_with_transactions):
        """AND sans correspondance retourne une liste vide."""
        mock_db = mock_db_with_transactions([])  # Pas de transactions
        rule = {}
        conditions = [
            {"match_type": MatchType.CONTAINS.value, "match_value": "NONEXISTENT"}
        ]

        result = await _match_and_conditions(mock_db, rule, conditions, page_size=100)

        assert result == []


# =============================================================================
# Tests pour _match_or_conditions
# =============================================================================


class TestMatchOrConditions:
    """Tests pour la logique OR de matching."""

    @pytest.mark.asyncio
    async def test_or_with_single_condition(self, mock_db_with_transactions):
        """OR avec une seule condition."""
        tx = {
            "transactionId": "tx1",
            "description": "CARREFOUR",
            "amount": 30.0,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {}
        conditions = [
            {"match_type": MatchType.CONTAINS.value, "match_value": "CARREFOUR"}
        ]

        result = await _match_or_conditions(mock_db, rule, conditions, page_size=100)

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_or_matches_first_condition_only(self, mock_db_with_transactions):
        """OR matche si première condition seulement est vraie."""
        tx = {
            "transactionId": "tx1",
            "description": "CARREFOUR CITY",
            "amount": 25.0,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {}
        conditions = [
            {"match_type": MatchType.CONTAINS.value, "match_value": "CARREFOUR"},
            {"match_type": MatchType.CONTAINS.value, "match_value": "LECLERC"},
        ]

        result = await _match_or_conditions(mock_db, rule, conditions, page_size=100)

        assert len(result) == 1
        assert result[0]["transactionId"] == "tx1"

    @pytest.mark.asyncio
    async def test_or_matches_second_condition_only(self, mock_db_with_transactions):
        """OR matche si seconde condition seulement est vraie."""
        tx = {
            "transactionId": "tx1",
            "description": "E.LECLERC",
            "amount": 45.0,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {}
        conditions = [
            {"match_type": MatchType.CONTAINS.value, "match_value": "CARREFOUR"},
            {"match_type": MatchType.CONTAINS.value, "match_value": "LECLERC"},
        ]

        result = await _match_or_conditions(mock_db, rule, conditions, page_size=100)

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_or_with_description_and_amount_conditions(
        self, mock_db_with_transactions
    ):
        """OR avec conditions mixtes description et montant."""
        tx1 = {
            "transactionId": "tx1",
            "description": "AMAZON",
            "amount": 50.0,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        tx2 = {
            "transactionId": "tx2",
            "description": "OTHER",
            "amount": 200.0,
            "TransactionsSlaves": [{"slaveId": "s2"}],
        }
        mock_db = mock_db_with_transactions([tx1, tx2])
        rule = {}
        conditions = [
            {"match_type": MatchType.CONTAINS.value, "match_value": "AMAZON"},
            {"match_type": MatchType.AMOUNT_GT.value, "match_value": "150"},
        ]

        result = await _match_or_conditions(mock_db, rule, conditions, page_size=100)

        # Les deux transactions matchent (une par condition)
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_or_deduplicates_results(self, mock_db_with_transactions):
        """OR déduplique les résultats si une transaction matche plusieurs conditions."""
        # Transaction qui matche les deux conditions
        tx = {
            "transactionId": "tx1",
            "description": "AMAZON PRIME",
            "amount": 9.99,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {}
        conditions = [
            {"match_type": MatchType.CONTAINS.value, "match_value": "AMAZON"},
            {"match_type": MatchType.CONTAINS.value, "match_value": "PRIME"},
        ]

        result = await _match_or_conditions(mock_db, rule, conditions, page_size=100)

        # Transaction apparaît une seule fois
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_or_with_empty_conditions(self, mock_db_with_transactions):
        """OR avec conditions vides retourne liste vide."""
        mock_db = mock_db_with_transactions([])
        rule = {}
        conditions = []

        result = await _match_or_conditions(mock_db, rule, conditions, page_size=100)

        assert result == []


# =============================================================================
# Tests pour find_matching_transactions
# =============================================================================


class TestFindMatchingTransactions:
    """Tests pour la fonction principale de recherche."""

    @pytest.mark.asyncio
    async def test_single_group_with_and_operator(self, mock_db_with_transactions):
        """Un seul groupe avec opérateur AND."""
        tx = {
            "transactionId": "tx1",
            "description": "AMAZON PRIME SUBSCRIPTION",
            "amount": 9.99,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {
            "description": "Amazon Prime",
            "condition_groups": [
                {
                    "operator": LogicalOperator.AND.value,
                    "conditions": [
                        {
                            "match_type": MatchType.CONTAINS.value,
                            "match_value": "AMAZON",
                        },
                        {
                            "match_type": MatchType.CONTAINS.value,
                            "match_value": "PRIME",
                        },
                    ],
                }
            ],
        }

        result = await find_matching_transactions(mock_db, rule)

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_single_group_with_or_operator(self, mock_db_with_transactions):
        """Un seul groupe avec opérateur OR."""
        tx = {
            "transactionId": "tx1",
            "description": "CARREFOUR MARKET",
            "amount": 55.0,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {
            "description": "Supermarché",
            "condition_groups": [
                {
                    "operator": LogicalOperator.OR.value,
                    "conditions": [
                        {
                            "match_type": MatchType.CONTAINS.value,
                            "match_value": "CARREFOUR",
                        },
                        {
                            "match_type": MatchType.CONTAINS.value,
                            "match_value": "LECLERC",
                        },
                        {
                            "match_type": MatchType.CONTAINS.value,
                            "match_value": "AUCHAN",
                        },
                    ],
                }
            ],
        }

        result = await find_matching_transactions(mock_db, rule)

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_multiple_groups_are_ored(self, mock_db_with_transactions):
        """Plusieurs groupes sont combinés avec OR."""
        tx1 = {
            "transactionId": "tx1",
            "description": "NETFLIX",
            "amount": 15.99,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        tx2 = {
            "transactionId": "tx2",
            "description": "SPOTIFY",
            "amount": 9.99,
            "TransactionsSlaves": [{"slaveId": "s2"}],
        }
        mock_db = mock_db_with_transactions([tx1, tx2])
        rule = {
            "description": "Abonnements",
            "condition_groups": [
                {
                    "operator": LogicalOperator.AND.value,
                    "conditions": [
                        {
                            "match_type": MatchType.CONTAINS.value,
                            "match_value": "NETFLIX",
                        },
                    ],
                },
                {
                    "operator": LogicalOperator.AND.value,
                    "conditions": [
                        {
                            "match_type": MatchType.CONTAINS.value,
                            "match_value": "SPOTIFY",
                        },
                    ],
                },
            ],
        }

        result = await find_matching_transactions(mock_db, rule)

        # Les deux groupes sont OR'd, donc les deux transactions matchent
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_group_with_description_and_amount(self, mock_db_with_transactions):
        """Groupe combinant description et montant."""
        tx = {
            "transactionId": "tx1",
            "description": "VIREMENT SALAIRE",
            "amount": 2500.0,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {
            "description": "Salaire",
            "condition_groups": [
                {
                    "operator": LogicalOperator.AND.value,
                    "conditions": [
                        {
                            "match_type": MatchType.STARTS_WITH.value,
                            "match_value": "VIREMENT",
                        },
                        {
                            "match_type": MatchType.CONTAINS.value,
                            "match_value": "SALAIRE",
                        },
                        {
                            "match_type": MatchType.AMOUNT_GTE.value,
                            "match_value": "1000",
                        },
                    ],
                }
            ],
        }

        result = await find_matching_transactions(mock_db, rule)

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_empty_condition_groups_returns_empty(
        self, mock_db_with_transactions
    ):
        """Règle sans condition_groups retourne liste vide."""
        mock_db = mock_db_with_transactions([])
        rule = {"description": "No conditions", "condition_groups": []}

        result = await find_matching_transactions(mock_db, rule)

        assert result == []

    @pytest.mark.asyncio
    async def test_missing_condition_groups_returns_empty(
        self, mock_db_with_transactions
    ):
        """Règle sans clé condition_groups retourne liste vide."""
        mock_db = mock_db_with_transactions([])
        rule = {"description": "Missing key"}

        result = await find_matching_transactions(mock_db, rule)

        assert result == []

    @pytest.mark.asyncio
    async def test_group_with_empty_conditions_skipped(self, mock_db_with_transactions):
        """Groupe avec conditions vides est ignoré."""
        tx = {
            "transactionId": "tx1",
            "description": "AMAZON",
            "amount": 50.0,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {
            "description": "Test",
            "condition_groups": [
                {"operator": LogicalOperator.AND.value, "conditions": []},  # Ignoré
                {
                    "operator": LogicalOperator.AND.value,
                    "conditions": [
                        {
                            "match_type": MatchType.CONTAINS.value,
                            "match_value": "AMAZON",
                        },
                    ],
                },
            ],
        }

        result = await find_matching_transactions(mock_db, rule)

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_default_operator_is_and(self, mock_db_with_transactions):
        """L'opérateur par défaut est AND."""
        tx = {
            "transactionId": "tx1",
            "description": "AMAZON MARKETPLACE",
            "amount": 75.0,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {
            "description": "Test",
            "condition_groups": [
                {
                    # Pas d'opérateur spécifié -> AND par défaut
                    "conditions": [
                        {
                            "match_type": MatchType.CONTAINS.value,
                            "match_value": "AMAZON",
                        },
                        {
                            "match_type": MatchType.CONTAINS.value,
                            "match_value": "MARKETPLACE",
                        },
                    ],
                }
            ],
        }

        result = await find_matching_transactions(mock_db, rule)

        assert len(result) == 1


# =============================================================================
# Tests pour les cas complexes
# =============================================================================


class TestComplexMatchingScenarios:
    """Tests pour des scénarios de matching complexes."""

    @pytest.mark.asyncio
    async def test_regex_with_amount_range(self, mock_db_with_transactions):
        """Regex combiné avec range de montant."""
        tx = {
            "transactionId": "tx1",
            "description": "PAIEMENT CB 1234 AMAZON",
            "amount": 42.50,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {
            "description": "CB avec montant modéré",
            "condition_groups": [
                {
                    "operator": LogicalOperator.AND.value,
                    "conditions": [
                        {
                            "match_type": MatchType.REGEX.value,
                            "match_value": r"PAIEMENT CB \d{4}",
                        },
                        {"match_type": MatchType.AMOUNT_GTE.value, "match_value": "20"},
                        {
                            "match_type": MatchType.AMOUNT_LTE.value,
                            "match_value": "100",
                        },
                    ],
                }
            ],
        }

        result = await find_matching_transactions(mock_db, rule)

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_or_group_with_exact_match(self, mock_db_with_transactions):
        """Groupe OR avec match exact."""
        tx = {
            "transactionId": "tx1",
            "description": "LOYER JANVIER",
            "amount": 800.0,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {
            "description": "Loyer mensuel",
            "condition_groups": [
                {
                    "operator": LogicalOperator.OR.value,
                    "conditions": [
                        {
                            "match_type": MatchType.EXACT.value,
                            "match_value": "LOYER JANVIER",
                        },
                        {
                            "match_type": MatchType.EXACT.value,
                            "match_value": "LOYER FEVRIER",
                        },
                        {
                            "match_type": MatchType.EXACT.value,
                            "match_value": "LOYER MARS",
                        },
                    ],
                }
            ],
        }

        result = await find_matching_transactions(mock_db, rule)

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_multiple_groups_mixed_operators(self, mock_db_with_transactions):
        """Plusieurs groupes avec opérateurs différents."""
        tx = {
            "transactionId": "tx1",
            "description": "CARTE 4567 FNAC",
            "amount": 250.0,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {
            "description": "Gros achats électronique",
            "condition_groups": [
                # Groupe 1: CB + montant > 200
                {
                    "operator": LogicalOperator.AND.value,
                    "conditions": [
                        {
                            "match_type": MatchType.CONTAINS.value,
                            "match_value": "CARTE",
                        },
                        {
                            "match_type": MatchType.AMOUNT_GT.value,
                            "match_value": "200",
                        },
                    ],
                },
                # Groupe 2: Enseignes électronique (OR)
                {
                    "operator": LogicalOperator.OR.value,
                    "conditions": [
                        {"match_type": MatchType.CONTAINS.value, "match_value": "FNAC"},
                        {
                            "match_type": MatchType.CONTAINS.value,
                            "match_value": "DARTY",
                        },
                        {
                            "match_type": MatchType.CONTAINS.value,
                            "match_value": "BOULANGER",
                        },
                    ],
                },
            ],
        }

        result = await find_matching_transactions(mock_db, rule)

        # Transaction matche les deux groupes
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_exact_amount_match(self, mock_db_with_transactions):
        """Match exact sur le montant."""
        tx = {
            "transactionId": "tx1",
            "description": "ABONNEMENT MENSUEL",
            "amount": 9.99,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {
            "description": "Abonnement fixe",
            "condition_groups": [
                {
                    "operator": LogicalOperator.AND.value,
                    "conditions": [
                        {
                            "match_type": MatchType.CONTAINS.value,
                            "match_value": "ABONNEMENT",
                        },
                        {
                            "match_type": MatchType.AMOUNT_EQ.value,
                            "match_value": "9.99",
                        },
                    ],
                }
            ],
        }

        result = await find_matching_transactions(mock_db, rule)

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_starts_with_and_not_exact(self, mock_db_with_transactions):
        """STARTS_WITH matche le préfixe (pas tout le texte)."""
        tx = {
            "transactionId": "tx1",
            "description": "VIR SEPA RECU DE EMPLOYEUR",
            "amount": 2000.0,
            "TransactionsSlaves": [{"slaveId": "s1"}],
        }
        mock_db = mock_db_with_transactions([tx])
        rule = {
            "description": "Virements reçus",
            "condition_groups": [
                {
                    "operator": LogicalOperator.AND.value,
                    "conditions": [
                        {
                            "match_type": MatchType.STARTS_WITH.value,
                            "match_value": "VIR SEPA",
                        },
                    ],
                }
            ],
        }

        result = await find_matching_transactions(mock_db, rule)

        assert len(result) == 1
