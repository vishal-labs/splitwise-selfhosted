import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_db
from app.config import settings
from app.models import Expense, User
from app.routers.comments import get_expense_member

router = APIRouter(prefix="/api", tags=["uploads"])

ALLOWED_EXTS = {"png", "jpg", "jpeg", "webp", "pdf"}
MAX_SIZE = 5 * 1024 * 1024


@router.post("/expenses/{expense_id}/receipt")
async def upload_receipt(
    expense_id: int,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    expense: Expense = Depends(get_expense_member),
):
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else ""
    if ext not in ALLOWED_EXTS:
        raise HTTPException(422, "Allowed: png/jpg/jpeg/webp/pdf")
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(413, "Max 5MB")

    directory = Path(settings.upload_dir)
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{ext}"
    (directory / name).write_bytes(data)
    expense.receipt_path = name
    await db.commit()
    return {"receipt_path": name}


@router.get("/expenses/{expense_id}/receipt")
async def get_receipt(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    expense: Expense = Depends(get_expense_member),
):
    if not expense.receipt_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No receipt")
    path = Path(settings.upload_dir) / expense.receipt_path
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No receipt")
    return FileResponse(path)
