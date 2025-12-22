from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ploutos.api.deps import SessionDep

router = APIRouter()


class BudgetResponse(BaseModel):
    account_id: str
    account_name: str
    year: int
    annual_budget: Optional[float]
    monthly_budget: Optional[float]


class BudgetUpsert(BaseModel):
    account_id: str
    year: int
    annual_budget: float = Field(..., ge=0)


@router.get("/budget/{year}", response_model=list[BudgetResponse])
async def get_budgets_by_year(year: int, db: SessionDep):
    """Get all budgets for a given year.

    Returns all virtual accounts (is_real = false) with their budget for the year.
    Budget is null if not defined for the account/year.
    monthly_budget is calculated as annual_budget / 12.
    """
    response = (
        db.table("Accounts")
        .select("accountId, name, Budget(annual_budget)")
        .eq("is_real", False)
        .eq("active", True)
        .eq("Budget.year", year)
        .execute()
    )

    return [
        BudgetResponse(
            account_id=row["accountId"],
            account_name=row["name"],
            year=year,
            annual_budget=(
                row["Budget"][0]["annual_budget"] if row["Budget"] else None
            ),
            monthly_budget=(
                round(row["Budget"][0]["annual_budget"] / 12, 2)
                if row["Budget"]
                else None
            ),
        )
        for row in response.data
    ]


@router.put("/budget")
async def upsert_budget(budget: BudgetUpsert, db: SessionDep):
    """Create or update a budget.

    Validates that the account is a virtual account (is_real = false).
    """

    # Validate account is virtual
    account = (
        db.table("Accounts")
        .select("is_real")
        .eq("accountId", budget.account_id)
        .single()
        .execute()
    )

    if not account.data:
        raise HTTPException(status_code=404, detail="Compte non trouvé")

    if account.data["is_real"]:
        raise HTTPException(
            status_code=400,
            detail="Le budget ne peut être défini que sur un compte virtuel",
        )

    # Upsert budget
    response = (
        db.table("Budget")
        .upsert(
            {
                "accountId": budget.account_id,
                "year": budget.year,
                "annual_budget": budget.annual_budget,
                "updated_at": datetime.now().isoformat(),
            },
            on_conflict="accountId,year",
        )
        .execute()
    )

    return response.data[0]
