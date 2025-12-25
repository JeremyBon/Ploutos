from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ploutos.api.deps import SessionDep
from ploutos.utils.date import calculate_percent_year_elapsed

router = APIRouter()

POSITION_TOLERANCE = 5.0


# ============================================================================
# Models
# ============================================================================


class BudgetResponse(BaseModel):
    account_id: str
    account_name: str
    category: str
    year: int
    annual_budget: Optional[float]
    monthly_budget: Optional[float]


class BudgetConsumptionResponse(BaseModel):
    account_id: str
    account_name: str
    category: str
    annual_budget: Optional[float]
    monthly_budget: Optional[float]
    spent_month: float
    remaining_month: Optional[float]
    percent_month: Optional[float]
    spent_ytd: float
    remaining_ytd: Optional[float]
    percent_ytd: Optional[float]
    percent_year_elapsed: float
    position_indicator: Optional[Literal["ahead", "behind", "on_track"]]


class BudgetUpsert(BaseModel):
    account_id: str
    year: int
    annual_budget: float = Field(..., ge=0)


class BudgetComparisonResponse(BaseModel):
    account_id: str
    account_name: str
    category: str
    spent_current: float
    spent_previous: float
    difference: float
    percent_change: Optional[float]


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/budget/{year}", response_model=list[BudgetResponse])
async def get_budgets_by_year(year: int, db: SessionDep):
    """Get all budgets for a given year.

    Returns all virtual accounts (is_real = false) with their budget for the year.
    Budget is null if not defined for the account/year.
    monthly_budget is calculated as annual_budget / 12.
    """
    response = (
        db.table("Accounts")
        .select("accountId, name, category, Budget(annual_budget)")
        .eq("is_real", False)
        .eq("active", True)
        .eq("Budget.year", year)
        .execute()
    )

    return [
        BudgetResponse(
            account_id=row["accountId"],
            account_name=row["name"],
            category=row["category"],
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

    results = []
    for row in response.data:
        annual = row["annual_budget"]
        spent_m = round(row["spending_month"] or 0, 2)
        spent_y = round(row["spending_ytd"] or 0, 2)

        # Calculs conditionnels selon présence du budget
        if annual is not None:
            monthly = round(annual / 12, 2)
            remaining_month = round(monthly - spent_m, 2)
            percent_month = _calculate_percent(spent_m, monthly)
            remaining_ytd = round(annual - spent_y, 2)
            pct_y = _calculate_percent(spent_y, annual)
            position = _determine_position_indicator(pct_y, pct_year)
        else:
            monthly = None
            remaining_month = None
            percent_month = None
            remaining_ytd = None
            pct_y = None
            position = None

        results.append(
            BudgetConsumptionResponse(
                account_id=row["accountId"],
                account_name=row["account_name"],
                category=row["category"],
                annual_budget=annual,
                monthly_budget=monthly,
                spent_month=spent_m,
                remaining_month=remaining_month,
                percent_month=percent_month,
                spent_ytd=spent_y,
                remaining_ytd=remaining_ytd,
                percent_ytd=pct_y,
                percent_year_elapsed=pct_year,
                position_indicator=position,
            )
        )
    return results


@router.get(
    "/budget-comparison/{year}/{month}",
    response_model=list[BudgetComparisonResponse],
)
async def get_budget_comparison(year: int, month: int, db: SessionDep):
    """Compare spending between the same month in current year and previous year.

    Returns spending comparison for each virtual account that has spending
    in either year.
    """
    response = db.rpc(
        "get_budget_comparison",
        {"p_year": year, "p_month": month},
    ).execute()

    return [
        BudgetComparisonResponse(
            account_id=row["accountId"],
            account_name=row["account_name"],
            category=row["category"],
            spent_current=(current := round(row["spent_current"] or 0, 2)),
            spent_previous=(previous := round(row["spent_previous"] or 0, 2)),
            difference=round(current - previous, 2),
            percent_change=_calculate_percent_change(current, previous),
        )
        for row in response.data
    ]


# ============================================================================
# Utils
# ============================================================================


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


def _calculate_percent_change(current: float, previous: float) -> Optional[float]:
    """Calculate percent change from previous to current."""
    if previous == 0:
        return None
    return round(((current - previous) / previous) * 100, 1)
