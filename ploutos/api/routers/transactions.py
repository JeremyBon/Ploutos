from datetime import datetime
from typing import List
from uuid import UUID

from api.deps import SessionDep
from fastapi import APIRouter, Depends
from loguru import logger
from pydantic import BaseModel

router = APIRouter()


# Models
class Transaction(BaseModel):
    transactionId: UUID
    created_at: datetime
    updated_at: datetime
    description: str
    date: datetime
    type: str
    amount: float
    accountId: UUID


@router.get("/transactions", response_model=List[Transaction])
async def get_transactions(db: SessionDep):
    """Get all transactions"""
    transactions_resp = db.table("Transactions").select("*").execute()
    if not transactions_resp.data:
        return []
    logger.info(f"{len(transactions_resp.data)} transactions found")
    return transactions_resp.data
