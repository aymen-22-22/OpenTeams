from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "error"]


@router.get("/health", response_model=Health)
async def health(session: Annotated[AsyncSession, Depends(get_session)]) -> JSONResponse:
    try:
        await session.execute(text("SELECT 1"))
        result = Health(status="ok", database="ok")
    except Exception:
        result = Health(status="degraded", database="error")
    code = 200 if result.status == "ok" else 503
    return JSONResponse(status_code=code, content=result.model_dump())
