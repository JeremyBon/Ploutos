from api.deps import SessionDep
from fastapi import APIRouter
from loguru import logger

router = APIRouter()


@router.get("/accounts")
async def get_accounts(db: SessionDep):
    response = db.table("Accounts").select("*").execute()
    logger.debug(f"Response: {response}")
    return response.data
