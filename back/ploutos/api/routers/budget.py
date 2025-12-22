from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from ploutos.api.deps import SessionDep

router = APIRouter()


class BudgetResponse(BaseModel):
    account_id: str
    account_name: str
    year: int
    annual_budget: Optional[float]
    monthly_budget: Optional[float]


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
