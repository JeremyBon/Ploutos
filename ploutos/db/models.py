from datetime import datetime
from uuid import UUID
from pydantic import SecretStr
from pydantic import BaseModel, Field


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
    account_id: UUID
    secretId: str
    bankId: str

class AccountsSecretsCreate(AccountsSecretsBase):
    pass

class AccountsSecrets(AccountsSecretsBase):
    id: UUID