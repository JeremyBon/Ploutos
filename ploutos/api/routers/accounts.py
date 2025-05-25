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
