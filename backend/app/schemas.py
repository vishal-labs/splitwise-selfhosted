from datetime import date as Date
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.models import User


class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    email: str
    name: str


def user_out(user: User) -> UserOut:
    return UserOut.model_validate(user)


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    currency: str = Field(min_length=3, max_length=3)


class GroupOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    currency: str
    created_by: int
    invite_code: str
    member_count: int = 0


class MemberOut(UserOut):
    role: str


class GroupDetail(GroupOut):
    members: list[MemberOut]


class MemberAdd(BaseModel):
    email: EmailStr


class SplitInput(BaseModel):
    user_id: int
    mode: Literal["equal", "amounts", "percent", "shares"]
    value: float | None = None


class RecurringInput(BaseModel):
    freq: Literal["weekly", "monthly", "yearly"]
    day: int = Field(ge=1, le=31)


class ExpenseCreate(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    amount_minor: int = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)
    payer_id: int
    splits: list[SplitInput] = Field(min_length=1)
    date: Date | None = None
    category: str | None = None
    recurring: RecurringInput | None = None


class SplitOut(BaseModel):
    user_id: int
    amount_minor: int


class ExpenseOut(BaseModel):
    id: int
    group_id: int
    created_by: int
    payer_id: int
    description: str
    amount_minor: int
    currency: str
    converted_amount_minor: int | None
    rate: float | None
    date: Date
    category: str | None
    splits: list[SplitOut]
    recurring_rule_id: int | None = None


class SettlementCreate(BaseModel):
    payer_id: int
    payee_id: int
    amount_minor: int = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)


class SettlementOut(BaseModel):
    id: int
    group_id: int
    payer_id: int
    payee_id: int
    amount_minor: int
    currency: str
    rate: float | None
    date: Date


class DebtOut(BaseModel):
    from_user: int = Field(serialization_alias="from")
    to_user: int = Field(serialization_alias="to")
    amount_minor: int = Field(serialization_alias="amount")


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class CommentOut(BaseModel):
    id: int
    user_id: int
    body: str
    created_at: datetime
