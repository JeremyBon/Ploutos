from datetime import datetime
from typing import List, Optional
from uuid import UUID

from ploutos.api.deps import SessionDep
from ploutos.api.routers.utils import extract_nested_field
from fastapi import APIRouter, HTTPException, Query
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
    slaveAccountIsReal: bool


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
    masterAccountIsReal: bool
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
    account_id: Optional[str] = Query(None, description="Filter by account ID"),
):
    """Get transactions with optional date filtering"""
    try:
        query = db.table("Transactions").select(
            """
            *,
            Accounts!left (
                name,
                is_real
            ),
            TransactionsSlaves (
                masterId,
                slaveId,
                type,
                amount,
                date,
                accountId,
                Accounts (
                    name,
                    is_real
                )
            )
        """
        )

        if date_from and date_to:
            # Pour Supabase, on utilise la syntaxe de filtrage par mois
            query = query.filter("date", "gte", date_from).filter(
                "date", "lte", date_to
            )
        if account_id:
            logger.info(f"Account ID: {account_id}")
            query = query.or_(
                f"accountId.eq.{account_id}",
                f"TransactionsSlaves.accountId.eq.{account_id}",
            )
        logger.info(f"Query: {query}")

        transactions_resp = query.execute()

        if not transactions_resp.data:
            return []
        transactions_resp.data = extract_nested_field(
            data=transactions_resp.data,
            nested_key="Accounts",
            field_keys=["name", "is_real"],
            new_keys=["masterAccountName", "masterAccountIsReal"],
        )
        for transaction in transactions_resp.data:
            transaction["TransactionsSlaves"] = extract_nested_field(
                data=transaction["TransactionsSlaves"],
                nested_key="Accounts",
                field_keys=["name", "is_real"],
                new_keys=["slaveAccountName", "slaveAccountIsReal"],
            )
        logger.info(f"{len(transactions_resp.data)} transactions found")

        # Debug: Log first transaction to check date format
        if transactions_resp.data:
            logger.info(f"🔍 First transaction sample: {transactions_resp.data[0]}")
            if transactions_resp.data[0].get("TransactionsSlaves"):
                logger.info(
                    f"🔍 First slave sample: {transactions_resp.data[0]['TransactionsSlaves'][0]}"
                )

        return transactions_resp.data
    except Exception as e:
        logger.error(f"Error getting transactions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


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


@router.post("/transactions/{transaction_id}/split-slave/{slave_id}", status_code=201)
async def split_slave(transaction_id: UUID, slave_id: UUID, db: SessionDep):
    """Split un slave pointant vers un compte réel en une nouvelle transaction.

    Utilisé pour dé-merger un transfert (réversibilité).

    Logique :
    1. Trouve le slave à splitter
    2. Vérifie qu'il pointe vers un compte réel
    3. Prépare la nouvelle transaction master sur le compte du slave
    4. Prépare un slave inverse pointant vers le compte d'origine
    5. Prépare la mise à jour du slave original vers le compte Unknown
    6. Vérifie l'équilibre débits/crédits sur chaque compte
    7. Effectue toutes les modifications en base de données

    Args:
        transaction_id: ID de la transaction parente
        slave_id: ID du slave à splitter

    Returns:
        Détails de la transaction créée, du slave créé et du slave mis à jour
    """
    try:
        # Récupérer le compte Unknown
        unknown_account_response = (
            db.table("Accounts")
            .select("accountId")
            .eq("name", "Unknown")
            .eq("category", "Unknown")
            .eq("sub_category", "Unknown")
            .eq("is_real", False)
            .execute()
        )

        if not unknown_account_response.data:
            raise HTTPException(
                status_code=500, detail="Unknown account not found in database"
            )

        unknown_account_id = unknown_account_response.data[0]["accountId"]
        logger.info(f"Found Unknown account: {unknown_account_id}")

        # 1. Récupérer la transaction avec tous ses slaves
        logger.debug(
            f"[SPLIT_SLAVE] Starting split for transaction {transaction_id}, slave {slave_id}"
        )
        tx_response = (
            db.table("Transactions")
            .select("""
            *,
            TransactionsSlaves (
                *,
                Accounts (
                    is_real,
                    name
                )
            )
        """)
            .eq("transactionId", str(transaction_id))
            .execute()
        )

        if not tx_response.data:
            raise HTTPException(status_code=404, detail="Transaction not found")

        transaction = tx_response.data[0]
        slaves = transaction.get("TransactionsSlaves", [])
        logger.debug(
            f"[SPLIT_SLAVE] Found transaction {transaction['transactionId']} with {len(slaves)} slaves"
        )

        slave_to_split = None
        for slave in slaves:
            if str(slave["slaveId"]) == str(slave_id):
                slave_to_split = slave
                break

        if not slave_to_split:
            available_slave_ids = [str(s["slaveId"]) for s in slaves]
            raise HTTPException(
                status_code=404,
                detail=f"Slave {slave_id} not found. Available slaves: {available_slave_ids}",
            )

        logger.debug(
            f"[SPLIT_SLAVE] Slave to split: accountId={slave_to_split['accountId']}, "
            f"type={slave_to_split['type']}, amount={slave_to_split['amount']}"
        )

        # 2. Vérifier que le slave pointe vers un compte réel
        slave_account = slave_to_split.get("Accounts", {})
        if not slave_account.get("is_real", False):
            raise HTTPException(
                status_code=400,
                detail="Can only split slaves pointing to real accounts",
            )

        master_type = transaction["type"].lower()

        # 3. Préparer la nouvelle transaction master sur le compte du slave
        current_time = datetime.now().isoformat()
        new_transaction = {
            "accountId": slave_to_split["accountId"],
            "amount": slave_to_split["amount"],
            "type": "credit" if slave_to_split["type"] == "credit" else "debit",
            "date": slave_to_split["date"],
            "description": f"Split from transaction {transaction_id}",
            "created_at": current_time,
            "updated_at": current_time,
        }

        # 4. Préparer le slave inverse pointant vers le compte d'origine
        new_slave = {
            "accountId": transaction["accountId"],
            "amount": slave_to_split["amount"],
            "type": "debit" if slave_to_split["type"] == "credit" else "credit",
            "date": slave_to_split["date"],
            "created_at": current_time,
            "updated_at": current_time,
        }
        logger.debug(
            f"[SPLIT_SLAVE] Master type: {master_type}, New transaction type: {new_transaction['type']}, New slave type: {new_slave['type']}"
        )

        # 5. Préparer la mise à jour du slave original vers Unknown
        updated_slave_data = {
            "accountId": unknown_account_id,
            "updated_at": current_time,
        }

        # 6. Vérifier l'équilibre débits/crédits sur chaque compte
        assert new_transaction["amount"] >= 0, "Transaction amount must be non-negative"
        assert new_transaction["type"] in [
            "debit",
            "credit",
        ], "Transaction type must be 'debit' or 'credit'"
        assert (
            new_transaction["accountId"] is not None
        ), "Transaction accountId cannot be None"

        # Compte master original
        master_debits_before = transaction["amount"] if master_type == "debit" else 0
        master_debits_before += (
            slave_to_split["amount"] if slave_to_split["type"] == "debit" else 0
        )
        master_credits_before = transaction["amount"] if master_type == "credit" else 0
        master_credits_before += (
            slave_to_split["amount"] if slave_to_split["type"] == "credit" else 0
        )

        # Check created transaction is the same as the old slave
        master_debits_after = (
            new_transaction["amount"] if new_transaction["type"] == "debit" else 0
        )
        master_debits_after += (
            new_slave["amount"] if new_slave["type"] == "debit" else 0
        )

        master_credits_after = (
            new_transaction["amount"] if new_transaction["type"] == "credit" else 0
        )
        master_credits_after += (
            new_slave["amount"] if new_slave["type"] == "credit" else 0
        )

        assert (
            master_debits_before == master_debits_after
        ), f"Accounts debits mismatch: before={master_debits_before}, after={master_debits_after}"
        assert (
            master_credits_before == master_credits_after
        ), f"Accounts credits mismatch: before={master_credits_before}, after={master_credits_after}"

        logger.info("All balance assertions passed successfully")

        # 7. Modifications en base de données
        created_tx_response = db.table("Transactions").insert(new_transaction).execute()
        created_transaction = created_tx_response.data[0]
        logger.info(f"Created new transaction: {created_transaction['transactionId']}")

        new_slave["masterId"] = created_transaction["transactionId"]
        created_slave_response = (
            db.table("TransactionsSlaves").insert(new_slave).execute()
        )
        created_slave = created_slave_response.data[0]
        logger.info(f"Created inverse slave: {created_slave['slaveId']}")

        updated_slave_response = (
            db.table("TransactionsSlaves")
            .update(updated_slave_data)
            .eq("slaveId", str(slave_id))
            .execute()
        )
        updated_slave = updated_slave_response.data[0]
        logger.info(f"Updated original slave {slave_id} to point to Unknown account")

        return {
            "created_transaction": created_transaction,
            "created_slave": created_slave,
            "updated_slave": updated_slave,
        }

    except HTTPException:
        raise
    except AssertionError as e:
        logger.error(f"Assertion failed during slave split: {str(e)}")
        raise HTTPException(
            status_code=400, detail=f"Balance validation failed: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error splitting slave {slave_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
