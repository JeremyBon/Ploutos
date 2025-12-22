from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ploutos.api.deps import SessionDep
from ploutos.utils.date import calculate_percent_year_elapsed

router = APIRouter()

POSITION_TOLERANCE = 5.0


def _determine_position_indicator(
    percent_ytd: float, percent_year_elapsed: float
) -> Literal["ahead", "behind", "on_track"]:
    """Determine if spending is ahead, behind, or on track compared to elapsed time."""
    if percent_ytd < percent_year_elapsed - POSITION_TOLERANCE:
        return "ahead"
    if percent_ytd > percent_year_elapsed + POSITION_TOLERANCE:
        return "behind"
    return "on_track"


def _calculate_percent(spent: float, budget: float) -> float:
    """Calculate percentage of budget spent."""
    return round((spent / budget) * 100, 1) if budget > 0 else 0.0


class BudgetResponse(BaseModel):
    account_id: str
    account_name: str
    year: int
    annual_budget: Optional[float]
    monthly_budget: Optional[float]


class BudgetConsumptionResponse(BaseModel):
    account_id: str
    account_name: str
    annual_budget: float
    monthly_budget: float
    spent_month: float
    remaining_month: float
    percent_month: float
    spent_ytd: float
    remaining_ytd: float
    percent_ytd: float
    percent_year_elapsed: float
    position_indicator: Literal["ahead", "behind", "on_track"]


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


@router.get(
    "/budget/{year}/consumption", response_model=list[BudgetConsumptionResponse]
)
async def get_budget_consumption(year: int, db: SessionDep):
    """Get budget consumption status for a given year.

    Calculates spending from TransactionsSlaves for each virtual account
    with a defined budget.

    Returns spending statistics for the current month and year-to-date,
    along with a position indicator (ahead/behind/on_track).
    """
    pct_year = calculate_percent_year_elapsed(year)

    response = db.rpc(
        "get_budget_consumption",
        {"p_year": year, "p_current_month": datetime.now().month},
    ).execute()

    return [
        BudgetConsumptionResponse(
            account_id=row["accountId"],
            account_name=row["account_name"],
            annual_budget=(annual := row["annual_budget"]),
            monthly_budget=(monthly := round(annual / 12, 2)),
            spent_month=(spent_m := round(row["spending_month"] or 0, 2)),
            remaining_month=round(monthly - spent_m, 2),
            percent_month=_calculate_percent(spent_m, monthly),
            spent_ytd=(spent_y := round(row["spending_ytd"] or 0, 2)),
            remaining_ytd=round(annual - spent_y, 2),
            percent_ytd=(pct_y := _calculate_percent(spent_y, annual)),
            percent_year_elapsed=pct_year,
            position_indicator=_determine_position_indicator(pct_y, pct_year),
        )
        for row in response.data
    ]
