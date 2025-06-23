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


class TransactionSlaveUpdate(BaseModel):
    slaveId: UUID
    type: str
    amount: float
    date: datetime
    accountId: UUID


class TransactionSlavesUpdate(BaseModel):
    slaves: List[TransactionSlaveUpdate]


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


@router.put(
    "/transactions/{transaction_id}/slaves", response_model=List[TransactionSlaveUpdate]
)
async def update_transaction_slaves(
    transaction_id: UUID,
    slaves_update: TransactionSlavesUpdate,
    db: SessionDep,
):
    """Update the slaves of a transaction"""
    logger.info(f"Updating slaves for transaction {transaction_id}")
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
        elif transaction.data[0]["amount"] != sum(
            [slave.amount for slave in slaves_update.slaves]
        ):
            raise HTTPException(
                status_code=400,
                detail="Transaction amount does not match slaves amounts",
            )

        # Supprimer tous les slaves existants pour cette transaction
        # Récupérer les slaves existants
        existing_slaves = (
            db.table("TransactionsSlaves")
            .select("slaveId")
            .eq("masterId", str(transaction_id))
            .execute()
        )

        existing_slave_ids = {slave["slaveId"] for slave in existing_slaves.data}
        new_slave_ids = {str(slave.slaveId) for slave in slaves_update.slaves}

        # Supprimer les slaves qui n'existent plus
        slaves_to_delete = existing_slave_ids - new_slave_ids
        if slaves_to_delete:
            (
                db.table("TransactionsSlaves")
                .delete()
                .in_("slaveId", list(slaves_to_delete))
                .execute()
            )

        # Insérer ou mettre à jour les nouveaux slaves
        updated_slaves = []
        for slave in slaves_update.slaves:
            slave_data = {
                "slaveId": str(slave.slaveId),
                "type": slave.type,
                "amount": slave.amount,
                "date": slave.date.isoformat(),
                "accountId": str(slave.accountId),
                "masterId": str(transaction_id),
                "updated_at": datetime.now().isoformat(),
            }

            if str(slave.slaveId) in existing_slave_ids:
                # Mettre à jour l'existant
                new_slave = (
                    db.table("TransactionsSlaves")
                    .update(slave_data)
                    .eq("slaveId", str(slave.slaveId))
                    .execute()
                )
            else:
                # Insérer le nouveau
                slave_data["created_at"] = datetime.now().isoformat()
                new_slave = db.table("TransactionsSlaves").insert(slave_data).execute()

            if new_slave.data:
                updated_slaves.append(slave)
            else:
                logger.error(f"Failed to insert slave {slave.slaveId}")

        # Mettre à jour le timestamp de la transaction principale
        (
            db.table("Transactions")
            .update({"updated_at": datetime.now().isoformat()})
            .eq("transactionId", str(transaction_id))
            .execute()
        )

        logger.info(
            f"Updated {len(updated_slaves)} slaves for transaction {transaction_id}"
        )
        return updated_slaves

    except Exception as e:
        logger.error(
            f"Error updating transaction slaves for {transaction_id}: {str(e)}"
        )
        raise HTTPException(status_code=500, detail=str(e))
