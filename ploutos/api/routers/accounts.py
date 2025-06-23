from datetime import datetime
from typing import Optional

from api.deps import SessionDep
from api.routers.utils import extract_nested_field
from db.models import *
from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel, Field

router = APIRouter()


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


@router.post("/create-account", response_model=AccountResponse)
async def create_account(account: AccountCreate, db: SessionDep):
    # Check if account with same name already exists
    existing_account = (
        db.table("Accounts")
        .select("*")
        .eq("name", account.name)
        .eq("category", account.category)
        .eq("sub_category", account.sub_category)
        .eq("is_real", account.is_real)
        .eq("original_amount", account.original_amount)
        .execute()
    )

    if existing_account.data and len(existing_account.data) > 0:
        raise HTTPException(
            status_code=400, detail=f"Account with name '{account.name}' already exists"
        )

    current_time = datetime.now().isoformat()

    # Create the Account
    account_resp = (
        db.table("Accounts")
        .insert(
            {
                "name": account.name,
                "category": account.category,
                "sub_category": account.sub_category,
                "is_real": account.is_real,
                "original_amount": account.original_amount,
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
    current_time = datetime.now().isoformat()

    # Update the Account
    account_resp = (
        db.table("Accounts")
        .update(
            {
                "name": account.name,
                "category": account.category,
                "sub_category": account.sub_category,
                "is_real": account.is_real,
                "original_amount": account.original_amount,
                "updated_at": current_time,
            }
        )
        .eq("accountId", account_id)
        .execute()
    )

    if not account_resp.data:
        raise HTTPException(status_code=404, detail="Account not found")

    logger.debug(f"Updated account: {account_resp}")
    return account_resp.data[0]


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, db: SessionDep):
    # Delete the account
    response = db.table("Accounts").delete().eq("accountId", account_id).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Account not found")

    logger.debug(f"Deleted account: {response}")
    return {"message": "Account deleted successfully"}


@router.get("/accounts/current-amounts", response_model=list[AccountAmount])
async def get_current_amounts(db: SessionDep):
    # Get all real accounts
    accounts_response = db.table("Accounts").select("*").execute()

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
            current_amount=amounts.get(account["accountId"], 0)
            + account["original_amount"],
            is_real=account["is_real"],
        )
        for account in accounts_response.data
    ]
