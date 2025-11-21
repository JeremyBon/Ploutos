from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field
from pydantic import field_serializer


class Account(BaseModel):
    accountId: UUID
    created_at: datetime
    updated_at: datetime
    name: str
    category: str
    sub_category: str
    is_real: bool
    original_amount: float


class AccountBase(BaseModel):
    name: str = Field(
        ..., min_length=1, max_length=100, description="Name of the account"
    )
    category: str = Field(..., min_length=1, description="Category of the account")
    sub_category: str = Field(
        ..., min_length=1, description="Sub-category of the account"
    )
    is_real: bool = Field(..., description="Whether this is a real account")
    original_amount: float = Field(..., description="Original amount of the account")


class AccountCreate(AccountBase):
    pass


class AccountUpdate(AccountBase):
    pass


class AccountResponse(AccountBase):
    accountId: str
    created_at: datetime
    updated_at: datetime


class AccountAmount(BaseModel):
    account_id: str
    name: str
    category: str
    sub_category: str
    current_amount: float
    is_real: bool
    max_date: datetime


class TransactionBase(BaseModel):
    description: str
    date: datetime
    amount: float
    type: str
    accountId: UUID


class TransactionCreate(TransactionBase):
    pass


class Transaction(TransactionBase):
    transactionId: UUID
    created_at: datetime
    updated_at: datetime


class TransactionSlaveBase(BaseModel):
    type: str
    amount: float
    date: datetime
    accountId: UUID
    masterId: UUID


class TransactionSlaveCreate(TransactionSlaveBase):
    pass


class TransactionSlave(TransactionSlaveBase):
    slaveId: UUID
    created_at: datetime
    updated_at: datetime


class AccountsSecretsBase(BaseModel):
    updated_at: datetime
    accountId: UUID
    secretId: str
    bankId: str

    @field_serializer("updated_at")
    def serialize_datetime(self, dt: datetime) -> str:
        return dt.isoformat()

    @field_serializer("accountId")
    def serialize_uuid(self, id: UUID) -> str:
        return str(id)


class AccountsSecretsCreate(AccountsSecretsBase):
    pass


class AccountsSecrets(AccountsSecretsBase):
    id: UUID


# =============================================================================
# Transfer Models
# =============================================================================


class TransferCandidate(BaseModel):
    """Paire de transactions détectées comme candidats pour un transfert."""

    credit_transaction: dict = Field(
        ..., description="Transaction crédit (sortie/négative)"
    )
    debit_transaction: dict = Field(
        ..., description="Transaction débit (entrée/positive)"
    )
    amount: float = Field(..., description="Montant du transfert")
    date: str = Field(..., description="Date du transfert")
    match_confidence: float = Field(
        default=1.0, description="Score de confiance du matching"
    )


class TransferMergeRequest(BaseModel):
    """Request pour merger deux transactions en un transfert."""

    credit_transaction_id: UUID = Field(
        ..., description="ID de la transaction crédit (sortie/négative)"
    )
    debit_transaction_id: UUID = Field(
        ..., description="ID de la transaction débit (entrée/positive)"
    )


class SlaveSplitResponse(BaseModel):
    """Response après le split d'un slave en nouvelle transaction."""

    created_transaction: dict = Field(..., description="Nouvelle transaction créée")
    created_slave: dict = Field(..., description="Slave inverse créé")
    updated_slave: dict = Field(
        ..., description="Slave original mis à jour pour pointer vers Unknown"
    )


class RejectedTransferPairCreate(BaseModel):
    """Request pour rejeter une paire de candidats."""

    credit_transaction_id: UUID = Field(..., description="ID de la transaction crédit")
    debit_transaction_id: UUID = Field(..., description="ID de la transaction débit")
    rejected_reason: str | None = Field(None, description="Raison du rejet (optionnel)")


class RejectedTransferPair(BaseModel):
    """Paire de transactions rejetée."""

    pair_id: UUID = Field(..., description="ID unique de la paire rejetée")
    transaction_id_1: UUID = Field(
        ..., description="ID de la première transaction (plus petit)"
    )
    transaction_id_2: UUID = Field(
        ..., description="ID de la deuxième transaction (plus grand)"
    )
    rejected_at: datetime = Field(..., description="Date et heure du rejet")
    rejected_reason: str | None = Field(None, description="Raison du rejet")
