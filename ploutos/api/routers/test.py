from fastapi import APIRouter

router = APIRouter()


@router.get("/test")
async def test_endpoint():
    return {"message": "Hello from Python API!", "status": "success"}
