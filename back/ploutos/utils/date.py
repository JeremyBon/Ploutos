from datetime import datetime


def calculate_percent_year_elapsed(year: int) -> float:
    """Calculate percentage of year elapsed."""
    now = datetime.now()
    start_of_year = datetime(year, 1, 1)
    end_of_year = datetime(year, 12, 31)
    total_days = (end_of_year - start_of_year).days + 1

    if year == now.year:
        days_elapsed = (now - start_of_year).days + 1
    elif year < now.year:
        days_elapsed = total_days
    else:
        days_elapsed = 0

    return round((days_elapsed / total_days) * 100, 1)
