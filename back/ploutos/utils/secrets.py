# crypto_utils.py
from Crypto.Cipher import AES
import base64
from ploutos.config.settings import get_settings
from ploutos.db import get_db
from ploutos.db.models import AccountsSecretsCreate

settings = get_settings()


def encrypt(text: str) -> str:
    """
    Chiffre un texte en utilisant AES-256 (mode EAX).
    Retourne une chaîne base64 contenant nonce + ciphertext + tag.
    """
    key = settings.get_encryption_key_bytes()
    cipher = AES.new(key, AES.MODE_EAX)
    ciphertext, tag = cipher.encrypt_and_digest(text.encode())

    # Concatène le nonce, le tag et le ciphertext
    combined = cipher.nonce + tag + ciphertext

    return base64.b64encode(combined).decode()


def decrypt(encoded: str) -> str:
    """
    Déchiffre une chaîne base64 issue de encrypt().
    """
    key = settings.get_encryption_key_bytes()
    data = base64.b64decode(encoded)

    # Découpe les différentes parties
    nonce, tag, ciphertext = data[:16], data[16:32], data[32:]

    cipher = AES.new(key, AES.MODE_EAX, nonce=nonce)
    plaintext = cipher.decrypt_and_verify(ciphertext, tag)

    return plaintext.decode()


def save_secret(account: AccountsSecretsCreate):
    """Sauvegarde le secret chiffré dans la base de données AccountSecrets."""
    account.secretId = encrypt(account.secretId)
    get_db.table("AccountSecrets").delete().eq("accountId", account.accountId).execute()
    get_db.table("AccountSecrets").insert(account.model_dump()).execute()


def get_secret(accountId: str) -> tuple[str, str]:
    """Récupère et déchiffre le secret pour un accountId donné. Renvoie (secret, bankId) ou None si non trouvé."""
    data = (
        get_db.table("AccountSecrets")
        .select("secretId,bankId")
        .eq("accountId", accountId)
        .execute()
    )
    if data.data:
        encrypted_secret = data.data[0]["secretId"]
        decrypted_secret = decrypt(encrypted_secret)
        return decrypted_secret, data.data[0]["bankId"]
    else:
        raise ValueError(f"No secret found for account ID: {accountId}")
