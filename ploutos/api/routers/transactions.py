from datetime import datetime
from typing import List, Optional
from uuid import UUID

from api.deps import SessionDep
from api.routers.utils import extract_nested_field
from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from pydantic import BaseModel

router = APIRouter()


# Models
class TransactionSlaveFront(BaseModel):
    slaveId: UUID
    type: str
    amount: float
    date: datetime
    accountId: UUID
    masterId: UUID
    slaveAccountName: str


class TransactionFront(BaseModel):
    transactionId: UUID
    created_at: datetime
    updated_at: datetime
    description: str
    date: datetime
    type: str
    amount: float
    accountId: UUID
    masterAccountName: str
    TransactionsSlaves: List[TransactionSlaveFront] = []


class TransactionUpdate(BaseModel):
    description: str
    date: datetime


@router.get("/transactions", response_model=List[TransactionFront])
async def get_transactions(
    db: SessionDep,
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
):
    """Get transactions with optional date filtering"""
    query = db.table("Transactions").select(
        """
        *,
        Accounts (
            name
        ),
        TransactionsSlaves (
            masterId,
            slaveId,
            type,
            amount,
            date,
            accountId,
            Accounts (
                name
            )
        )
    """
    )

    if date_from and date_to:
        # Pour Supabase, on utilise la syntaxe de filtrage par mois
        query = query.filter("date", "gte", date_from).filter("date", "lte", date_to)

    transactions_resp = query.execute()

    if not transactions_resp.data:
        return []
    transactions_resp.data = extract_nested_field(
        data=transactions_resp.data,
        nested_key="Accounts",
        field_keys=["name"],
        new_keys=["masterAccountName"],
    )
    for transaction in transactions_resp.data:
        transaction["TransactionsSlaves"] = extract_nested_field(
            data=transaction["TransactionsSlaves"],
            nested_key="Accounts",
            field_keys=["name"],
            new_keys=["slaveAccountName"],
        )
    logger.debug(transactions_resp.data[0])
    logger.info(f"{len(transactions_resp.data)} transactions found")
    return transactions_resp.data


@router.put("/transactions/{transaction_id}", response_model=TransactionUpdate)
async def update_transaction(
    transaction_id: UUID,
    transaction_update: TransactionUpdate,
    db: SessionDep,
):
    """Update a transaction's description and date"""
    try:
        # Vérifier si la transaction existe
        transaction = (
            db.table("Transactions")
            .select("*")
            .eq("transactionId", str(transaction_id))
            .execute()
        )
        if not transaction.data:
            raise HTTPException(status_code=404, detail="Transaction not found")

        # Mettre à jour la transaction
        updated_transaction = (
            db.table("Transactions")
            .update(
                {
                    "description": transaction_update.description,
                    "date": transaction_update.date.isoformat(),
                    "updated_at": datetime.now().isoformat(),
                }
            )
            .eq("transactionId", str(transaction_id))
            .execute()
        )

        if not updated_transaction.data:
            raise HTTPException(status_code=500, detail="Failed to update transaction")

        logger.info(f"Transaction {transaction_id} updated successfully")
        return updated_transaction.data[0]

    except Exception as e:
        logger.error(f"Error updating transaction {transaction_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
