from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AccountType(BaseModel):
    id: UUID
    created_at: datetime
    updated_at: datetime
    is_real: bool
    category: str
    sub_category: str


class Account(BaseModel):
    accountId: UUID
    created_at: datetime
    updated_at: datetime
    name: str
    account_type: UUID


class AccountBase(BaseModel):
    name: str = Field(
        ..., min_length=1, max_length=100, description="Name of the account"
    )


class AccountCreate(AccountBase):
    category: str = Field(..., min_length=1, description="Category of the account")
    sub_category: str = Field(
        ..., min_length=1, description="Sub-category of the account"
    )
    is_real: bool = Field(..., description="Whether this is a real account")


class AccountUpdate(AccountCreate):
    pass


class AccountResponse(AccountBase):
    accountId: str
    name: str
    account_type: str
    created_at: datetime
    updated_at: datetime


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


class TransactionSlave(TransactionSlaveBase):
    slaveId: UUID
    created_at: datetime
    updated_at: datetime
