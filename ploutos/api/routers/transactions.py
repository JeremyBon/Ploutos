from datetime import datetime
from typing import List, Optional
from uuid import UUID

from api.deps import SessionDep
from fastapi import APIRouter, Depends, Query
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
async def get_transactions(
    db: SessionDep,
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
):
    """Get transactions with optional date filtering"""
    query = db.table("Transactions").select("*")

    if date_from and date_to:
        # Pour Supabase, on utilise la syntaxe de filtrage par mois
        query = query.filter("date", "gte", date_from).filter("date", "lte", date_to)

    transactions_resp = query.execute()
    if not transactions_resp.data:
        return []
    logger.info(f"{len(transactions_resp.data)} transactions found")
    return transactions_resp.data
