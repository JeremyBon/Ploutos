from ploutos.api.deps import SessionDep
from ploutos.db.models import Transaction, TransactionSlave
import pandas as pd
from tqdm import tqdm
from datetime import datetime


def create_transactions(
    df: pd.DataFrame,
) -> tuple[list[Transaction], list[TransactionSlave]]:
    """
    Create master and slave transactions from a DataFrame

    Args:
        df: DataFrame containing transaction data

    Returns:
        A tuple containing two lists: master transactions and slave transactions
    """
    master_transactions = []
    slave_transactions = []
    date = pd.Timestamp(datetime.now())
    for _, row in df.iterrows():
        if row["amount"] < 0:
            raise ValueError(f"Montant négatif pour la transaction {row}")
        master_transactions.append(
            Transaction(
                transactionId=row["masterId"],
                created_at=date,
                updated_at=date,
                description=row["description"],
                date=pd.Timestamp(row["Date"]),
                type=row["type"],
                amount=row["amount"],
                accountId=row["real_account"],
            )
        )

        # Create slave transaction
        slave_transactions.append(
            TransactionSlave(
                slaveId=row["slaveId"],
                created_at=date,
                updated_at=date,
                type="debit" if row["type"] == "credit" else "credit",
                amount=row["amount"],
                date=pd.Timestamp(row["Date"]),
                accountId=row["slave_account"],
                masterId=row["masterId"],
            )
        )

    return master_transactions, slave_transactions


def upload_transactions(
    db: SessionDep,
    master_transactions: list[Transaction],
    slave_transactions: list[TransactionSlave],
):
    """
    Upload master and slave transactions to their respective tables in the database

    Args:
        db: Database session
        master_transactions: List of Transaction objects
        slave_transactions: List of TransactionSlave objects
    """
    try:
        # Upload master transactions first to ensure foreign key constraints are met
        for transaction in tqdm(master_transactions):
            transaction_data = {
                "transactionId": str(transaction.transactionId),
                "created_at": transaction.created_at.isoformat(),
                "updated_at": transaction.updated_at.isoformat(),
                "description": str(transaction.description),
                "date": transaction.date.isoformat(),
                "type": str(transaction.type),
                "amount": float(transaction.amount),
                "accountId": str(transaction.accountId),
            }
            db.table("Transactions").insert(transaction_data).execute()

        # Upload slave transactions after master transactions are inserted
        for slave in tqdm(slave_transactions):
            # Verify master transaction exists before inserting slave
            master_exists = (
                db.table("Transactions")
                .select("transactionId")
                .eq("transactionId", str(slave.masterId))
                .execute()
            )

            if not master_exists.data:
                print(
                    f"Warning: Master transaction {slave.masterId} not found, skipping slave transaction {slave.slaveId}"
                )
                continue

            slave_data = {
                "slaveId": str(slave.slaveId),
                "created_at": slave.created_at.isoformat(),
                "updated_at": slave.updated_at.isoformat(),
                "type": str(slave.type),
                "amount": float(slave.amount),
                "date": slave.date.isoformat(),
                "accountId": str(slave.accountId),
                "masterId": str(slave.masterId),
            }
            db.table("TransactionsSlaves").insert(slave_data).execute()

    except Exception as e:
        print(f"Error uploading transactions: {e}")
