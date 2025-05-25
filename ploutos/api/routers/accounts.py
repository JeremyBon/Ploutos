from api.deps import SessionDep
from db.models import Account, AccountType
from fastapi import APIRouter, HTTPException
from loguru import logger

router = APIRouter()


@router.get("/accounts")
async def get_accounts(db: SessionDep):
    response = db.table("Accounts").select("*").execute()
    logger.debug(f"Response: {response}")
    return response.data


@router.get("/account-types")
async def get_account_types(db: SessionDep):
    response = db.table("Account-types").select("*").execute()
    logger.debug(f"Response: {response}")
    return response.data


@router.post("/create-account")
async def create_account(payload: dict, db: SessionDep):
    name = payload.get("name")
    category = payload.get("category")
    sub_category = payload.get("sub_category")
    is_real = payload.get("is_real")
    if not all([name, category, sub_category]) or is_real is None:
        raise HTTPException(status_code=400, detail="Missing required fields")
    # Chercher Account-type existant
    account_type_resp = (
        db.table("Account-types")
        .select("*")
        .eq("category", category)
        .eq("sub_category", sub_category)
        .eq("is_real", is_real)
        .execute()
    )
    if account_type_resp.data and len(account_type_resp.data) > 0:
        account_type_id = account_type_resp.data[0]["id"]
    else:
        # Créer un nouveau Account-type
        new_type_resp = (
            db.table("Account-types")
            .insert(
                {"category": category, "sub_category": sub_category, "is_real": is_real}
            )
            .execute()
        )
        account_type_id = new_type_resp.data[0]["id"]
    # Créer l'Account
    account_resp = (
        db.table("Accounts")
        .insert({"name": name, "account_type": account_type_id})
        .execute()
    )
    logger.debug(f"Created account: {account_resp}")
    return account_resp.data[0]


@router.put("/accounts/{account_id}")
async def update_account(account_id: str, payload: dict, db: SessionDep):
    name = payload.get("name")
    category = payload.get("category")
    sub_category = payload.get("sub_category")
    is_real = payload.get("is_real")

    if not all([name, category, sub_category]) or is_real is None:
        raise HTTPException(status_code=400, detail="Missing required fields")

    # Récupérer l'ancien type de compte avant la mise à jour
    old_account = db.table("Accounts").select("*").eq("accountId", account_id).execute()

    if not old_account.data:
        raise HTTPException(status_code=404, detail="Account not found")

    old_account_type_id = old_account.data[0]["account_type"]

    # Chercher Account-type existant
    account_type_resp = (
        db.table("Account-types")
        .select("*")
        .eq("category", category)
        .eq("sub_category", sub_category)
        .eq("is_real", is_real)
        .execute()
    )

    if account_type_resp.data and len(account_type_resp.data) > 0:
        account_type_id = account_type_resp.data[0]["id"]
    else:
        # Créer un nouveau Account-type
        new_type_resp = (
            db.table("Account-types")
            .insert(
                {"category": category, "sub_category": sub_category, "is_real": is_real}
            )
            .execute()
        )
        account_type_id = new_type_resp.data[0]["id"]

    # Mettre à jour l'Account
    account_resp = (
        db.table("Accounts")
        .update({"name": name, "account_type": account_type_id})
        .eq("accountId", account_id)
        .execute()
    )

    if not account_resp.data:
        raise HTTPException(status_code=404, detail="Account not found")

    # Vérifier si l'ancien type de compte est toujours utilisé
    if old_account_type_id != account_type_id:
        accounts_with_old_type = (
            db.table("Accounts")
            .select("*")
            .eq("account_type", old_account_type_id)
            .execute()
        )

        # Si aucun compte n'utilise plus ce type, le supprimer
        if not accounts_with_old_type.data:
            (db.table("Account-types").delete().eq("id", old_account_type_id).execute())
            logger.debug(f"Deleted unused account type: {old_account_type_id}")

    logger.debug(f"Updated account: {account_resp}")
    return account_resp.data[0]


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, db: SessionDep):
    response = db.table("Accounts").delete().eq("accountId", account_id).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Account not found")

    logger.debug(f"Deleted account: {response}")
    return {"message": "Account deleted successfully"}
