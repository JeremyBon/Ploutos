from datetime import datetime
from typing import Optional

from api.deps import SessionDep
from api.routers.utils import extract_nested_field
from db.models import *
from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel, Field

router = APIRouter()


class AccountTypeBase(BaseModel):
    category: str = Field(..., min_length=1, description="Category of the account type")
    sub_category: str = Field(
        ..., min_length=1, description="Sub-category of the account type"
    )
    is_real: bool = Field(..., description="Whether this is a real account type")


class AccountTypeCreate(AccountTypeBase):
    pass


class AccountTypeResponse(AccountTypeBase):
    id: str
    created_at: datetime
    updated_at: datetime
    category: str
    sub_category: str
    is_real: bool


class AccountAmount(BaseModel):
    account_id: str
    name: str
    category: str
    sub_category: str
    current_amount: float
    is_real: bool


@router.get("/accounts", response_model=list[AccountResponse])
async def get_accounts(db: SessionDep):
    response = db.table("Accounts").select("*").execute()
    return response.data


@router.get("/account-types", response_model=list[AccountTypeResponse])
async def get_account_types(db: SessionDep):
    response = db.table("Account-types").select("*").execute()
    return response.data


@router.post("/create-account", response_model=AccountResponse)
async def create_account(account: AccountCreate, db: SessionDep):
    # Chercher Account-type existant
    account_type_resp = (
        db.table("Account-types")
        .select("*")
        .eq("category", account.category)
        .eq("sub_category", account.sub_category)
        .eq("is_real", account.is_real)
        .execute()
    )
    current_time = datetime.now().isoformat()
    if account_type_resp.data and len(account_type_resp.data) > 0:
        account_type_id = account_type_resp.data[0]["id"]
    else:
        # Créer un nouveau Account-type
        new_type_resp = (
            db.table("Account-types")
            .insert(
                {
                    "category": account.category,
                    "sub_category": account.sub_category,
                    "is_real": account.is_real,
                    "created_at": current_time,
                    "updated_at": current_time,
                }
            )
            .execute()
        )
        account_type_id = new_type_resp.data[0]["id"]

    # Créer l'Account
    account_resp = (
        db.table("Accounts")
        .insert(
            {
                "name": account.name,
                "account_type": account_type_id,
                "created_at": current_time,
                "updated_at": current_time,
            }
        )
        .execute()
    )
    logger.debug(f"Created account: {account_resp}")
    return account_resp.data[0]


@router.put("/accounts/{account_id}", response_model=AccountResponse)
async def update_account(account_id: str, account: AccountUpdate, db: SessionDep):
    # Récupérer l'ancien type de compte avant la mise à jour
    old_account = db.table("Accounts").select("*").eq("accountId", account_id).execute()

    if not old_account.data:
        raise HTTPException(status_code=404, detail="Account not found")

    old_account_type_id = old_account.data[0]["account_type"]

    # Chercher Account-type existant
    account_type_resp = (
        db.table("Account-types")
        .select("*")
        .eq("category", account.category)
        .eq("sub_category", account.sub_category)
        .eq("is_real", account.is_real)
        .execute()
    )
    current_time = datetime.now().isoformat()
    if account_type_resp.data and len(account_type_resp.data) > 0:
        account_type_id = account_type_resp.data[0]["id"]
    else:
        # Créer un nouveau Account-type
        new_type_resp = (
            db.table("Account-types")
            .insert(
                {
                    "category": account.category,
                    "sub_category": account.sub_category,
                    "is_real": account.is_real,
                    "created_at": current_time,
                    "updated_at": current_time,
                }
            )
            .execute()
        )
        account_type_id = new_type_resp.data[0]["id"]

    # Mettre à jour l'Account avec updated_at
    account_resp = (
        db.table("Accounts")
        .update(
            {
                "name": account.name,
                "account_type": account_type_id,
                "updated_at": current_time,
            }
        )
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
    # Récupérer le compte avant de le supprimer pour avoir son type
    account = db.table("Accounts").select("*").eq("accountId", account_id).execute()

    if not account.data:
        raise HTTPException(status_code=404, detail="Account not found")

    account_type_id = account.data[0]["account_type"]

    # Supprimer le compte
    response = db.table("Accounts").delete().eq("accountId", account_id).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Account not found")

    # Vérifier si d'autres comptes utilisent ce type
    remaining_accounts = (
        db.table("Accounts").select("*").eq("account_type", account_type_id).execute()
    )

    # Si aucun autre compte n'utilise ce type, le supprimer
    if not remaining_accounts.data:
        db.table("Account-types").delete().eq("id", account_type_id).execute()
        logger.debug(f"Deleted unused account type: {account_type_id}")

    logger.debug(f"Deleted account: {response}")
    return {"message": "Account deleted successfully"}


@router.get("/accounts/current-amounts", response_model=list[AccountAmount])
async def get_current_amounts(db: SessionDep):
    # Récupérer tous les comptes réels avec leurs types
    accounts_response = (
        db.table("Accounts")
        .select(
            """
            accountId,
            name,
            account_type,
            original_amount,
            Account-types!account_type (
                category,
                sub_category,
                is_real
            )
        """
        )
        .execute()
    )
    accounts_response.data = extract_nested_field(
        accounts_response.data, "Account-types", ["category", "sub_category", "is_real"]
    )
    if not accounts_response.data:
        return []
    accounts_response.data = [
        account for account in accounts_response.data if account["is_real"]
    ]
    amount_response = (
        db.rpc(
            "get_total_amount_by_account_ids",
            {
                "account_ids": [
                    account['accountId'] for account in accounts_response.data
                ]
            },
        )
        .execute()
        .data
    )
    amounts = {
        account['accountid']: account['total_amount'] for account in amount_response
    }

    return [
        AccountAmount(
            account_id=account["accountId"],
            name=account["name"],
            category=account["category"],
            sub_category=account["sub_category"],
            current_amount=amounts[account["accountId"]] + account["original_amount"],
            is_real=account["is_real"],
        )
        for account in accounts_response.data
    ]
