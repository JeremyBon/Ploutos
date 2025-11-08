from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from ploutos.db.models import AccountsSecretsCreate
from ploutos.utils.secrets import encrypt, decrypt, save_secret
import ploutos.utils.secrets as secrets_module

@pytest.fixture
def mock_db(monkeypatch):
    """Mock de get_db pour éviter d'appeler la vraie BDD."""
    mock = MagicMock()
    monkeypatch.setattr("ploutos.utils.secrets.get_db", mock)
    return mock

@pytest.fixture
def sample_account():
    """Compte de test avec secret clair."""
    from datetime import datetime
    from uuid import UUID
    return AccountsSecretsCreate(
        updated_at=datetime.fromisoformat("2025-10-15T12:00:00"),
        accountId=UUID("123e4567-e89b-12d3-a456-426614174000"),
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

    # Patch get_db dans le module ploutos.utils.secrets
    import ploutos.utils.secrets as secrets_module
    monkeypatch.setattr(secrets_module, "get_db", mock_get_db)

    # Appel de la fonction
    result = secrets_module.get_secret("123e4567-e89b-12d3-a456-426614174000")
    secret, bank_id = result

    assert secret == "mon_super_secret"
    assert bank_id == "bank_001"

def test_get_secret_returns_none_if_not_found(monkeypatch):
    """Vérifie que get_secret lève une ValueError si aucun résultat."""

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

    # Vérifie qu'une ValueError est levée
    with pytest.raises(ValueError, match="No secret found for account ID: nonexistent_id"):
        secrets_module.get_secret("nonexistent_id")
    
    


def test_save_secret_deletes_existing_then_inserts(monkeypatch):
    """Vérifie que save_secret supprime l'ancien secret avant d'insérer le nouveau."""

    # --- Préparation des mocks ---
    mock_delete_execute = MagicMock()
    mock_insert_execute = MagicMock()

    # Mock du comportement de table().delete().eq().execute()
    mock_table = MagicMock()
    mock_table.delete.return_value.eq.return_value.execute = mock_delete_execute
    mock_table.insert.return_value.execute = mock_insert_execute

    # Mock de get_db.table()
    mock_get_db = MagicMock()
    mock_get_db.table.return_value = mock_table

    # Patch get_db et encrypt dans utils.secrets
    monkeypatch.setattr(secrets_module, "get_db", mock_get_db)
    monkeypatch.setattr(secrets_module, "encrypt", lambda s: f"encrypted_{s}")

    # Simule un objet AccountsSecretsCreate
    from datetime import datetime
    from uuid import UUID
    fake_account = AccountsSecretsCreate(
        updated_at=datetime.now(),
        accountId=UUID("123e4567-e89b-12d3-a456-426614174000"),
        secretId="my_secret",
        bankId="bank_test"
    )

    # --- Appel de la fonction ---
    secrets_module.save_secret(fake_account)

    # --- Vérifications ---
    # 1️⃣ Vérifie que delete() est appelé correctement
    mock_table.delete.return_value.eq.assert_called_once_with(
        "accountId", UUID("123e4567-e89b-12d3-a456-426614174000")
    )
    mock_delete_execute.assert_called_once()

    # 2️⃣ Vérifie que insert() est appelé avec model_dump()
    mock_table.insert.assert_called_once()
    mock_insert_execute.assert_called_once()

    # 3️⃣ Vérifie que le secret a été modifié avant l'insertion
    assert fake_account.secretId == "encrypted_my_secret"

