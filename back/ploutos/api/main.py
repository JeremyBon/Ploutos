import uvicorn
from ploutos.api.routers import (
    accounts,
    categorization_rules,
    matching,
    test,
    transactions,
    transfers,
)
from ploutos.config.settings import get_settings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

settings = get_settings()
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API pour la gestion des transactions financières",
    version="1.0.0",
)

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inclusion des routeurs
app.include_router(test.router, tags=["test"])
app.include_router(accounts.router, tags=["accounts"])
app.include_router(transactions.router, tags=["transactions"])
app.include_router(transfers.router, tags=["transfers"])
app.include_router(matching.router, tags=["matching"])
app.include_router(categorization_rules.router, tags=["categorization-rules"])


@app.get("/")
async def root():
    logger.info(f"API {settings.PROJECT_NAME} is running on {settings.API_V1_STR}")
    return {
        "message": f"Bienvenue sur l'API {settings.PROJECT_NAME}",
        "status": "online",
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
