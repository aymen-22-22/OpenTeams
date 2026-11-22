"""Public organization logo: mail clients load it without signing in."""

from fastapi import APIRouter
from fastapi.responses import Response
from sqlalchemy import select

from app.admin.models import OrgSettings
from app.auth.deps import DB
from app.core.errors import AppError

router = APIRouter(tags=["branding"])


@router.get("/branding/logo")
async def logo(db: DB) -> Response:
    org = await db.scalar(select(OrgSettings).limit(1))
    if org is None or org.logo is None:
        raise AppError("not_found", "No logo", 404)
    return Response(
        content=org.logo,
        media_type=org.logo_type,
        headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )
