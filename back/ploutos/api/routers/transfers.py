"""Router pour la gestion des transferts entre comptes."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from loguru import logger

from ploutos.api.deps import SessionDep
from ploutos.db.models import (
    RejectedTransferPairCreate,
    TransferCandidate,
    TransferMergeRequest,
)

router = APIRouter()


@router.get("/transfers/candidates", response_model=list[TransferCandidate])
async def get_transfer_candidates(db: SessionDep):
    """Détecte automatiquement les paires de transactions candidates pour un transfert.

    Utilise la fonction RPC `get_transfer_candidates` qui applique les critères :
    - Montants strictement identiques
    - Même jour exact
    - Types opposés (credit/debit)
    - Aucun slave pointant vers un compte réel (transactions "propres")

    Returns:
        Liste de paires candidates avec leurs détails
    """
    try:
        # Appeler la RPC qui retourne les paires candidates
        response = db.rpc("get_transfer_candidates").execute()

        if not response.data:
            return []

        candidates = []
        for row in response.data:
            # Construire les objets transaction à partir des résultats RPC
            tx1 = {
                "transactionId": row["transactionid_1"],
                "description": row["description_1"],
                "date": row["date_1"],
                "type": row["type_1"],
                "amount": float(row["amount_1"]),
                "accountId": row["accountid_1"],
                "accountName": row["accountname_1"],
            }
            tx2 = {
                "transactionId": row["transactionid_2"],
                "description": row["description_2"],
                "date": row["date_2"],
                "type": row["type_2"],
                "amount": float(row["amount_2"]),
                "accountId": row["accountid_2"],
                "accountName": row["accountname_2"],
            }

            # Identifier quelle transaction est credit et laquelle est debit
            if tx1["type"].lower() == "credit":
                credit_tx = tx1
                debit_tx = tx2
            else:
                credit_tx = tx2
                debit_tx = tx1

            # Extraire la date (format ISO, prendre juste la partie date)
            date_str = credit_tx["date"]
            if isinstance(date_str, str):
                date_only = date_str.split("T")[0] if "T" in date_str else date_str
            else:
                # Si c'est un objet datetime, le convertir en string
                date_only = date_str.strftime("%Y-%m-%d")

            candidate = TransferCandidate(
                credit_transaction=credit_tx,
                debit_transaction=debit_tx,
                amount=float(credit_tx["amount"]),
                date=date_only,
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
    1. Garde la transaction crédit (positive/entrée)
    2. Crée un slave vers le compte de la transaction débit
    3. Supprime la transaction débit (négative/sortie)

    Args:
        request: IDs des transactions à merger

    Returns:
        Transaction crédit mise à jour avec le nouveau slave
    """
    try:
        # Récupérer les deux transactions
        credit_response = (
            db.table("Transactions")
            .select("""
            *,
            TransactionsSlaves (*)
        """)
            .eq("transactionId", request.credit_transaction_id)
            .execute()
        )

        if not credit_response.data:
            raise HTTPException(status_code=404, detail="Credit transaction not found")

        debit_response = (
            db.table("Transactions")
            .select("*")
            .eq("transactionId", request.debit_transaction_id)
            .execute()
        )

        if not debit_response.data:
            raise HTTPException(status_code=404, detail="Debit transaction not found")

        credit_tx = credit_response.data[0]
        debit_tx = debit_response.data[0]

        # Validations
        if credit_tx["amount"] != debit_tx["amount"]:
            logger.error(
                f"BAD REQUEST: Amounts do not match - credit={credit_tx['amount']}, debit={debit_tx['amount']}"
            )
            raise HTTPException(
                status_code=400,
                detail=f"Amounts do not match: {credit_tx['amount']} != {debit_tx['amount']}",
            )

        credit_date = (
            credit_tx["date"].split("T")[0]
            if "T" in credit_tx["date"]
            else credit_tx["date"]
        )
        debit_date = (
            debit_tx["date"].split("T")[0]
            if "T" in debit_tx["date"]
            else debit_tx["date"]
        )

        if credit_date != debit_date:
            logger.error(
                f"BAD REQUEST: Dates do not match - credit={credit_date}, debit={debit_date}"
            )
            raise HTTPException(
                status_code=400,
                detail=f"Dates do not match: {credit_date} != {debit_date}",
            )

        if credit_tx["type"].lower() != "credit":
            logger.error(
                f"BAD REQUEST: Credit transaction {credit_tx['transactionId']} has wrong type: '{credit_tx['type']}' (expected 'credit')"
            )
            raise HTTPException(
                status_code=400,
                detail=f"Credit transaction must have type 'credit', got '{credit_tx['type']}'",
            )

        if debit_tx["type"].lower() != "debit":
            logger.error(
                f"BAD REQUEST: Debit transaction {debit_tx['transactionId']} has wrong type: '{debit_tx['type']}' (expected 'debit')"
            )
            raise HTTPException(
                status_code=400,
                detail=f"Debit transaction must have type 'debit', got '{debit_tx['type']}'",
            )

        # Supprimer les slaves existants de la transaction crédit
        existing_slaves = credit_tx.get("TransactionsSlaves", [])
        for slave in existing_slaves:
            db.table("TransactionsSlaves").delete().eq(
                "slaveId", slave["slaveId"]
            ).execute()

        logger.info(
            f"Deleted {len(existing_slaves)} existing slaves from credit transaction"
        )

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
        db.table("Transactions").delete().eq(
            "transactionId", debit_tx["transactionId"]
        ).execute()
        logger.info(f"Deleted debit transaction: {debit_tx['transactionId']}")

        # Supprimer les slaves de la transaction débit également
        db.table("TransactionsSlaves").delete().eq(
            "masterId", debit_tx["transactionId"]
        ).execute()

        # Récupérer la transaction mise à jour avec le nouveau slave
        updated_response = (
            db.table("Transactions")
            .select("""
            *,
            TransactionsSlaves (
                *,
                Accounts (
                    name,
                    is_real
                )
            )
        """)
            .eq("transactionId", credit_tx["transactionId"])
            .execute()
        )

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
        response = (
            db.table("Transactions")
            .select("""
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
        """)
            .execute()
        )

        if not response.data:
            return []

        # Filtrer pour ne garder que celles avec au moins un slave vers un compte réel
        transfers = []
        for tx in response.data:
            slaves = tx.get("TransactionsSlaves", [])
            has_real_slave = any(
                slave.get("Accounts", {}).get("is_real", False) for slave in slaves
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


# =============================================================================
# Endpoints pour gérer les rejets de paires candidates
# =============================================================================


@router.post("/transfers/candidates/reject", status_code=201)
async def reject_transfer_candidate(
    request: RejectedTransferPairCreate, db: SessionDep
) -> dict[str, Any]:
    """Rejeter une paire de transactions candidates.

    Marque une paire comme "non-transfert" pour qu'elle n'apparaisse plus
    dans les candidats détectés automatiquement.

    Args:
        request: IDs des transactions à rejeter + raison optionnelle

    Returns:
        Détails de la paire rejetée

    Raises:
        409: Si la paire a déjà été rejetée
        500: En cas d'erreur serveur
    """
    try:
        # Ordonner les IDs (le plus petit en premier)
        tx_id_1 = min(request.credit_transaction_id, request.debit_transaction_id)
        tx_id_2 = max(request.credit_transaction_id, request.debit_transaction_id)

        # Vérifier si la paire n'a pas déjà été rejetée
        existing = (
            db.table("RejectedTransferPairs")
            .select("*")
            .eq("transaction_id_1", str(tx_id_1))
            .eq("transaction_id_2", str(tx_id_2))
            .execute()
        )

        if existing.data:
            raise HTTPException(
                status_code=409,
                detail="This pair has already been rejected",
            )

        # Insérer le rejet
        current_time = datetime.now().isoformat()
        rejection_data = {
            "transaction_id_1": str(tx_id_1),
            "transaction_id_2": str(tx_id_2),
            "rejected_at": current_time,
            "rejected_reason": request.rejected_reason,
        }

        response = db.table("RejectedTransferPairs").insert(rejection_data).execute()

        logger.info(
            f"Rejected transfer pair: {tx_id_1} <-> {tx_id_2}"
            f" (reason: {request.rejected_reason or 'None'})"
        )

        return response.data[0]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting transfer candidate: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/transfers/candidates/reject/{tx1_id}/{tx2_id}", status_code=204)
async def unreject_transfer_candidate(tx1_id: str, tx2_id: str, db: SessionDep):
    """Annuler le rejet d'une paire de transactions.

    Supprime le rejet pour que la paire réapparaisse dans les candidats.

    Args:
        tx1_id: ID de la première transaction
        tx2_id: ID de la deuxième transaction

    Returns:
        204 No Content si succès

    Raises:
        404: Si la paire n'a pas été trouvée dans les rejets
        500: En cas d'erreur serveur
    """
    try:
        # Ordonner les IDs pour la recherche
        ordered_tx1 = min(tx1_id, tx2_id)
        ordered_tx2 = max(tx1_id, tx2_id)

        # Supprimer le rejet
        response = (
            db.table("RejectedTransferPairs")
            .delete()
            .eq("transaction_id_1", ordered_tx1)
            .eq("transaction_id_2", ordered_tx2)
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=404,
                detail="Rejected pair not found",
            )

        logger.info(f"Unrejected transfer pair: {ordered_tx1} <-> {ordered_tx2}")
        return None

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unrejecting transfer candidate: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/transfers/candidates/rejected", response_model=list[dict[str, Any]])
async def get_rejected_transfer_candidates(db: SessionDep):
    """Lister toutes les paires de transferts rejetées.

    Returns:
        Liste des paires rejetées avec leurs détails

    Raises:
        500: En cas d'erreur serveur
    """
    try:
        response = db.table("RejectedTransferPairs").select("*").execute()

        if not response.data:
            return []

        logger.info(f"Found {len(response.data)} rejected transfer pairs")
        return response.data

    except Exception as e:
        logger.error(f"Error getting rejected transfer candidates: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
