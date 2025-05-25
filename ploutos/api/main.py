import uvicorn
from api.routers import accounts, test
from config.settings import get_settings
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


@app.get("/")
async def root():
    logger.info(f"API {settings.PROJECT_NAME} is running on {settings.API_V1_STR}")
    return {
        "message": f"Bienvenue sur l'API {settings.PROJECT_NAME}",
        "status": "online",
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
