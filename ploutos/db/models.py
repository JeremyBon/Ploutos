from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


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


class Credit(BaseModel):
    transactionId: UUID
    created_at: datetime
    updated_at: datetime
    description: str
    date: datetime
    amount: float
    accountId: UUID


class Debit(BaseModel):
    id: UUID
    created_at: datetime
    updated_at: datetime
    creditId: UUID
    amount: float
    accountId: UUID
