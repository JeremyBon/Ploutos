from datetime import datetime
from typing import List, Optional

from ploutos.api.deps import SessionDep
from ploutos.db.models import AccountCreate, AccountResponse, AccountUpdate
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
    active: bool
    max_date: Optional[datetime] = None


class DeferredDetail(BaseModel):
    """Detail of a deferred transaction."""

    slave_id: str
    master_id: str
    amount: float
    master_date: datetime = Field(..., description="Master transaction date (payment)")
    slave_date: datetime = Field(..., description="Slave date (consumption)")
    description: str
    account_name: str


class DeferredBalance(BaseModel):
    """Deferred account balance with details."""

    total: float = Field(..., description="Total amount")
    details: List[DeferredDetail] = Field(default_factory=list)


class DeferredAccountsResponse(BaseModel):
    """Response for /accounts/deferred endpoint."""

    prepaid_expenses: DeferredBalance = Field(..., description="Prepaid Expenses")
    deferred_revenue: DeferredBalance = Field(..., description="Deferred Revenue")


@router.get("/accounts", response_model=list[AccountResponse])
async def get_accounts(db: SessionDep, include_archived: bool = False):
    query = db.table("Accounts").select("*")
    if not include_archived:
        query = query.eq("active", True)
    response = query.execute()
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
                "active": account.active,
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
                "active": account.active,
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
    # Check if account exists
    account = db.table("Accounts").select("*").eq("accountId", account_id).execute()
    if not account.data:
        raise HTTPException(status_code=404, detail="Account not found")

    # Check for linked transactions
    transactions = (
        db.table("Transactions")
        .select("transactionId")
        .eq("accountId", account_id)
        .limit(1)
        .execute()
    )
    if transactions.data:
        raise HTTPException(
            status_code=400,
            detail="Ce compte possède des transactions associées. Veuillez l'archiver au lieu de le supprimer.",
        )

    # Check for linked slave transactions
    slave_transactions = (
        db.table("TransactionsSlaves")
        .select("slaveId")
        .eq("accountId", account_id)
        .limit(1)
        .execute()
    )
    if slave_transactions.data:
        raise HTTPException(
            status_code=400,
            detail="Ce compte possède des transactions associées. Veuillez l'archiver au lieu de le supprimer.",
        )

    # Delete the account
    response = db.table("Accounts").delete().eq("accountId", account_id).execute()

    logger.debug(f"Deleted account: {response}")
    return {"message": "Account deleted successfully"}


@router.patch("/accounts/{account_id}/archive", response_model=AccountResponse)
async def toggle_archive_account(account_id: str, db: SessionDep):
    # Get current account state
    current = (
        db.table("Accounts").select("active").eq("accountId", account_id).execute()
    )

    if not current.data:
        raise HTTPException(status_code=404, detail="Account not found")

    current_active = current.data[0]["active"]
    current_time = datetime.now().isoformat()

    # Toggle active state
    response = (
        db.table("Accounts")
        .update({"active": not current_active, "updated_at": current_time})
        .eq("accountId", account_id)
        .execute()
    )

    logger.debug(f"Toggled archive for account: {response}")
    return response.data[0]


@router.get("/accounts/current-amounts", response_model=list[AccountAmount])
async def get_current_amounts(db: SessionDep, include_archived: bool = False):
    # Get all real accounts
    accounts_response = db.table("Accounts").select("*").execute()

    if not accounts_response.data:
        return []

    accounts_response.data = [
        account
        for account in accounts_response.data
        if account["is_real"] and (include_archived or account["active"])
    ]

    amount_response = (
        db.rpc(
            "get_total_amount_by_account_ids",
            {
                "account_ids": [
                    account["accountId"] for account in accounts_response.data
                ]
            },
        )
        .execute()
        .data
    )

    amounts = {
        account["accountId"]: account["total_amount"] for account in amount_response
    }
    max_dates = {
        account["accountId"]: account["max_date"] for account in amount_response
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
            active=account["active"],
            max_date=max_dates.get(account["accountId"], None),
        )
        for account in accounts_response.data
    ]


@router.get("/accounts/deferred", response_model=DeferredAccountsResponse)
async def get_deferred_accounts(db: SessionDep):
    """Get prepaid expenses (CCA) and deferred revenue (PCA) balances.

    Prepaid Expenses (CCA): credit slaves where master date <= NOW and slave date > NOW
    Deferred Revenue (PCA): debit slaves where master date <= NOW and slave date > NOW
    Both only consider virtual accounts (is_real = false).
    """
    now = datetime.now().isoformat()

    # Query slaves with master transaction and account info
    response = (
        db.table("TransactionsSlaves")
        .select(
            """
            slaveId,
            masterId,
            amount,
            type,
            date,
            accountId,
            Transactions!inner (
                transactionId,
                date,
                description
            ),
            Accounts!inner (
                accountId,
                name,
                is_real
            )
            """
        )
        .eq("Accounts.is_real", False)
        .lte("Transactions.date", now)
        .gt("date", now)
        .execute()
    )

    prepaid_details: List[DeferredDetail] = []
    deferred_details: List[DeferredDetail] = []
    prepaid_total = 0.0
    deferred_total = 0.0

    for slave in response.data:
        master = slave.get("Transactions", {})
        account = slave.get("Accounts", {})

        detail = DeferredDetail(
            slave_id=slave["slaveId"],
            master_id=slave["masterId"],
            amount=slave["amount"],
            master_date=master.get("date"),
            slave_date=slave["date"],
            description=master.get("description", ""),
            account_name=account.get("name", ""),
        )

        if slave["type"] == "credit":
            prepaid_details.append(detail)
            prepaid_total += slave["amount"]
        elif slave["type"] == "debit":
            deferred_details.append(detail)
            deferred_total += slave["amount"]

    return DeferredAccountsResponse(
        prepaid_expenses=DeferredBalance(total=prepaid_total, details=prepaid_details),
        deferred_revenue=DeferredBalance(
            total=deferred_total, details=deferred_details
        ),
    )


class PatrimonyTimelineEntry(BaseModel):
    """Single entry in patrimony timeline."""

    month_date: str
    bank_patrimony: float
    accounting_patrimony: float
    cca_amount: float
    pca_amount: float


@router.get("/accounts/patrimony-timeline", response_model=List[PatrimonyTimelineEntry])
async def get_patrimony_timeline(
    db: SessionDep,
    start_date: str,  # YYYY-MM-DD
    end_date: str,  # YYYY-MM-DD
):
    """Get patrimony timeline for a date range.

    Returns monthly patrimony values (bancaire and comptable) with CCA/PCA breakdown.
    - bank_patrimony: Sum of real account balances at end of each month
    - accounting_patrimony: bank_patrimony + CCA - PCA
    - cca_amount: Prepaid expenses (charges paid but not yet consumed)
    - pca_amount: Deferred revenue (revenue received but not yet earned)
    """
    response = db.rpc(
        "get_patrimony_timeline",
        {"p_start_date": start_date, "p_end_date": end_date},
    ).execute()

    if not response.data:
        return []

    return response.data
