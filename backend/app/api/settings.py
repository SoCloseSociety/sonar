from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.auth.dependencies import get_current_user

router = APIRouter()


@router.get("")
async def get_settings(user: User = Depends(get_current_user)):
    return user.preferences or {}


@router.put("")
async def update_settings(
    preferences: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.preferences = {**(user.preferences or {}), **preferences}
    await db.merge(user)
    await db.commit()
    return user.preferences
