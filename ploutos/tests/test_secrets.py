from utils.secrets import encrypt, decrypt, save_secret, get_secret
import pytest
from unittest.mock import MagicMock
from db.models import AccountsSecretsCreate # ou AccountsSecretsCreate selon ton code
from types import SimpleNamespace

@pytest.fixture
def mock_db(monkeypatch):
    """Mock de get_db pour éviter d'appeler la vraie BDD."""
    mock = MagicMock()
    monkeypatch.setattr("utils.secrets.get_db", mock)
    return mock

@pytest.fixture
def sample_account():
    """Compte de test avec secret clair."""
    return AccountsSecretsCreate(
        updated_at="2025-10-15T12:00:00",
        account_id="123e4567-e89b-12d3-a456-426614174000",
        secretId="mon_super_secret",
        bankId="bank_001"
    )

def test_crypto():
    secret = "motdepasse_super_secret"

    # 🔐 Chiffrement
    encrypted = encrypt(secret)
    print("Secret chiffré :", encrypted)

    # 🔓 Déchiffrement
    decrypted = decrypt(encrypted)
    print("Secret déchiffré :", decrypted)

    assert decrypted == secret, "❌ Le déchiffrement ne correspond pas au texte d’origine"
    print("✅ Test de chiffrement/déchiffrement réussi !")
    
def test_save_secret_encrypts_before_inserting(mock_db, sample_account):
    """Vérifie que le secret est chiffré avant insertion."""
    
    save_secret(sample_account)

    # On récupère ce qui a été inséré
    inserted_account_dict = mock_db.table().insert.call_args[0][0]
    inserted_account = AccountsSecretsCreate(**inserted_account_dict)
    print("Données insérées :", inserted_account)
    # Le secret ne doit plus être égal à la valeur en clair
    assert inserted_account.secretId != "mon_super_secret"

    # Déchiffrement doit correspondre au texte original
    decrypted = decrypt(inserted_account.secretId)
    assert decrypted == "mon_super_secret"

def test_get_secret_decrypts_and_returns_correct_values(monkeypatch):
    """Vérifie que get_secret renvoie le secret déchiffré et le bankId."""

    # Secret chiffré
    encrypted_secret = encrypt("mon_super_secret")
    fake_data = [{"secretId": encrypted_secret, "bankId": "bank_001"}]

    # Créer un faux retour de execute() avec .data
    fake_execute_result = SimpleNamespace(data=fake_data)

    # Mock table().select().eq().execute() pour retourner l'objet ci-dessus
    mock_table = MagicMock()
    mock_table.select.return_value.eq.return_value.execute.return_value = fake_execute_result

    # Mock get_db.table()
    mock_get_db = MagicMock()
    mock_get_db.table.return_value = mock_table

    # Patch get_db dans le module utils.secrets
    import utils.secrets as secrets_module
    monkeypatch.setattr(secrets_module, "get_db", mock_get_db)

    # Appel de la fonction
    result = secrets_module.get_secret("123e4567-e89b-12d3-a456-426614174000")
    secret, bank_id = result

    assert secret == "mon_super_secret"
    assert bank_id == "bank_001"

from types import SimpleNamespace
from unittest.mock import MagicMock
import utils.secrets as secrets_module

def test_get_secret_returns_none_if_not_found(monkeypatch):
    """Vérifie que get_secret renvoie None si aucun résultat."""

    # Crée un faux retour de execute() avec .data = []
    fake_execute_result = SimpleNamespace(data=[])

    # Mock table().select().eq().execute() pour retourner l'objet ci-dessus
    mock_table = MagicMock()
    mock_table.select.return_value.eq.return_value.execute.return_value = fake_execute_result

    # Mock get_db.table()
    mock_get_db = MagicMock()
    mock_get_db.table.return_value = mock_table

    # Patch get_db dans le module secrets
    monkeypatch.setattr(secrets_module, "get_db", mock_get_db)

    # Appel de la fonction
    result = secrets_module.get_secret("nonexistent_id")
    assert result is None
