import uvicorn
from api.routers import bank, test
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Ploutos API",
    description="API pour la gestion des transactions financières",
    version="1.0.0",
)

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # URL de votre frontend Next.js
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inclusion des routeurs
app.include_router(test.router, prefix="/api", tags=["test"])
app.include_router(bank.router, prefix="/api/bank", tags=["bank"])


@app.get("/")
async def root():
    return {
        "message": "Bienvenue sur l'API Ploutos",
        "version": "1.0.0",
        "status": "online",
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
