"""Router pour la gestion des transferts entre comptes."""
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from loguru import logger

from ploutos.api.deps import SessionDep
from ploutos.db.models import TransferCandidate, TransferMergeRequest

router = APIRouter()


@router.get("/transfers/candidates", response_model=list[TransferCandidate])
async def get_transfer_candidates(db: SessionDep):
    """Détecte automatiquement les paires de transactions candidates pour un transfert.

    Critères de matching stricts :
    - Montants strictement identiques
    - Même jour exact
    - Types opposés (credit/debit)
    - Aucun slave pointant vers un compte réel (transactions "propres")

    Returns:
        Liste de paires candidates avec leurs détails
    """
    try:
        # Récupérer toutes les transactions avec leurs slaves et les infos de compte
        response = db.table("Transactions").select("""
            *,
            TransactionsSlaves (
                *,
                Accounts (
                    is_real
                )
            )
        """).execute()

        if not response.data:
            return []

        transactions = response.data

        # Filtrer les transactions qui ont déjà des slaves vers des comptes réels
        clean_transactions = []
        for tx in transactions:
            slaves = tx.get("TransactionsSlaves", [])
            # Vérifier qu'aucun slave ne pointe vers un compte réel
            has_real_slave = any(
                slave.get("Accounts", {}).get("is_real", False)
                for slave in slaves
            )
            if not has_real_slave:
                clean_transactions.append(tx)

        logger.debug(f"Total transactions: {len(transactions)}, Clean transactions: {len(clean_transactions)}")

        # Grouper par (date, montant) pour trouver les paires potentielles
        groups: dict[tuple[str, float], list[dict]] = {}
        for tx in clean_transactions:
            # Extraire la date (format ISO, prendre juste la partie date)
            tx_date = tx["date"].split("T")[0] if "T" in tx["date"] else tx["date"]
            key = (tx_date, tx["amount"])
            if key not in groups:
                groups[key] = []
            groups[key].append(tx)

        logger.debug(f"Groups created: {len(groups)}")

        # Identifier les paires avec types opposés
        candidates = []
        for (date, amount), txs in groups.items():
            # Séparer credit et debit
            credits = [t for t in txs if t["type"].lower() == "credit"]
            debits = [t for t in txs if t["type"].lower() == "debit"]

            logger.debug(f"Group ({date}, {amount}): {len(credits)} credits, {len(debits)} debits")

            # Créer des paires
            for credit_tx in credits:
                for debit_tx in debits:
                    # Vérifier que ce sont des transactions différentes
                    if credit_tx["transactionId"] != debit_tx["transactionId"]:
                        logger.debug(f"Creating candidate: {credit_tx['transactionId']} + {debit_tx['transactionId']}")
                        candidate = TransferCandidate(
                            credit_transaction=credit_tx,
                            debit_transaction=debit_tx,
                            amount=amount,
                            date=date,
                            match_confidence=1.0,  # Matching strict = confiance 100%
                        )
                        candidates.append(candidate)

        logger.info(f"Found {len(candidates)} transfer candidates")
        return candidates

    except Exception as e:
        logger.error(f"Error getting transfer candidates: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transfers/merge")
async def merge_transfer(request: TransferMergeRequest, db: SessionDep):
    """Merge deux transactions en un transfert.

    Logique :
    1. Garde la transaction crédit (négative/sortie)
    2. Crée un slave vers le compte de la transaction débit
    3. Supprime la transaction débit (positive/entrée)

    Args:
        request: IDs des transactions à merger

    Returns:
        Transaction crédit mise à jour avec le nouveau slave
    """
    try:
        # Récupérer les deux transactions
        credit_response = db.table("Transactions").select("""
            *,
            TransactionsSlaves (*)
        """).eq("transactionId", request.credit_transaction_id).execute()

        if not credit_response.data:
            raise HTTPException(status_code=404, detail="Credit transaction not found")

        debit_response = db.table("Transactions").select("*").eq(
            "transactionId", request.debit_transaction_id
        ).execute()

        if not debit_response.data:
            raise HTTPException(status_code=404, detail="Debit transaction not found")

        credit_tx = credit_response.data[0]
        debit_tx = debit_response.data[0]

        # Validations
        if credit_tx["amount"] != debit_tx["amount"]:
            raise HTTPException(
                status_code=400,
                detail=f"Amounts do not match: {credit_tx['amount']} != {debit_tx['amount']}"
            )

        credit_date = credit_tx["date"].split("T")[0] if "T" in credit_tx["date"] else credit_tx["date"]
        debit_date = debit_tx["date"].split("T")[0] if "T" in debit_tx["date"] else debit_tx["date"]

        if credit_date != debit_date:
            raise HTTPException(
                status_code=400,
                detail=f"Dates do not match: {credit_date} != {debit_date}"
            )

        if credit_tx["type"].lower() != "credit":
            raise HTTPException(
                status_code=400,
                detail=f"Credit transaction must have type 'credit', got '{credit_tx['type']}'"
            )

        if debit_tx["type"].lower() != "debit":
            raise HTTPException(
                status_code=400,
                detail=f"Debit transaction must have type 'debit', got '{debit_tx['type']}'"
            )

        # Supprimer les slaves existants de la transaction crédit
        existing_slaves = credit_tx.get("TransactionsSlaves", [])
        for slave in existing_slaves:
            db.table("TransactionsSlaves").delete().eq("slaveId", slave["slaveId"]).execute()

        logger.info(f"Deleted {len(existing_slaves)} existing slaves from credit transaction")

        # Créer un nouveau slave pointant vers le compte de la transaction débit
        current_time = datetime.now().isoformat()
        new_slave = {
            "masterId": credit_tx["transactionId"],
            "accountId": debit_tx["accountId"],  # Compte de destination (Banque B)
            "amount": debit_tx["amount"],  # Montant positif
            "type": "debit",  # Type inverse du master (credit -> debit)
            "date": credit_tx["date"],
            "created_at": current_time,
            "updated_at": current_time,
        }

        slave_response = db.table("TransactionsSlaves").insert(new_slave).execute()
        logger.info(f"Created new slave: {slave_response.data}")

        # Supprimer la transaction débit
        db.table("Transactions").delete().eq("transactionId", debit_tx["transactionId"]).execute()
        logger.info(f"Deleted debit transaction: {debit_tx['transactionId']}")

        # Supprimer les slaves de la transaction débit également
        db.table("TransactionsSlaves").delete().eq("masterId", debit_tx["transactionId"]).execute()

        # Récupérer la transaction mise à jour avec le nouveau slave
        updated_response = db.table("Transactions").select("""
            *,
            TransactionsSlaves (
                *,
                Accounts (
                    name,
                    is_real
                )
            )
        """).eq("transactionId", credit_tx["transactionId"]).execute()

        return updated_response.data[0]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error merging transfer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/transfers", response_model=list[dict[str, Any]])
async def get_transfers(db: SessionDep):
    """Liste tous les transferts confirmés.

    Un transfert = une transaction avec au moins un slave pointant vers un compte réel.

    Returns:
        Liste des transactions de transfert avec leurs slaves et noms de comptes
    """
    try:
        # Récupérer toutes les transactions avec leurs slaves
        response = db.table("Transactions").select("""
            *,
            Accounts!left (
                name,
                is_real
            ),
            TransactionsSlaves (
                *,
                Accounts (
                    name,
                    is_real
                )
            )
        """).execute()

        if not response.data:
            return []

        # Filtrer pour ne garder que celles avec au moins un slave vers un compte réel
        transfers = []
        for tx in response.data:
            slaves = tx.get("TransactionsSlaves", [])
            has_real_slave = any(
                slave.get("Accounts", {}).get("is_real", False)
                for slave in slaves
            )

            if has_real_slave:
                # Aplatir les données des comptes slaves
                for slave in tx["TransactionsSlaves"]:
                    account_data = slave.pop("Accounts", {})
                    slave["slaveAccountName"] = account_data.get("name", "Unknown")
                    slave["slaveAccountIsReal"] = account_data.get("is_real", False)

                # Aplatir les données du compte master
                master_account = tx.pop("Accounts", {})
                if master_account:
                    tx["masterAccountName"] = master_account.get("name", "Unknown")
                    tx["masterAccountIsReal"] = master_account.get("is_real", False)

                transfers.append(tx)

        logger.info(f"Found {len(transfers)} confirmed transfers")
        return transfers

    except Exception as e:
        logger.error(f"Error getting transfers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
