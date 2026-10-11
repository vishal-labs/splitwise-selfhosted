from datetime import date as Date
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import Settlement, User

# password_hash for a member invited by email who hasn't registered yet —
# not a valid argon2 hash, so no password can ever verify against it
PENDING_HASH = "!pending"


def is_pending(user: User) -> bool:
    return user.password_hash == PENDING_HASH


class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    upi_id: str | None = Field(default=None, max_length=256)

    @field_validator("name", "upi_id", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    email: str
    name: str
    upi_id: str | None = None
    has_upi_qr: bool = False
    # invited by email but hasn't registered yet (can't log in)
    pending: bool = False


def user_out(user: User) -> UserOut:
    out = UserOut.model_validate(user)
    out.has_upi_qr = bool(user.upi_qr_path)
    out.pending = is_pending(user)
    return out


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
    simplify_debts: bool = True


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    simplify_debts: bool | None = None


class MemberOut(UserOut):
    role: str


class GroupDetail(GroupOut):
    members: list[MemberOut]


class MemberAdd(BaseModel):
    email: EmailStr
    # set = invite: an unknown email becomes a pending member with this name
    name: str | None = Field(default=None, min_length=1, max_length=255)


class SplitInput(BaseModel):
    user_id: int
    # itemized: value = that person's items; the rest of the total is split equally
    mode: Literal["equal", "amounts", "percent", "shares", "itemized"]
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
    notes: str | None = Field(default=None, max_length=2000)
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
    receipt_path: str | None = None
    notes: str | None = None
    created_at: datetime | None = None


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
    proof_path: str | None = None


def settlement_out(settlement: Settlement) -> SettlementOut:
    return SettlementOut(
        id=settlement.id,
        group_id=settlement.group_id,
        payer_id=settlement.payer_id,
        payee_id=settlement.payee_id,
        amount_minor=settlement.amount_minor,
        currency=settlement.currency,
        rate=settlement.rate,
        date=settlement.date,
        proof_path=settlement.proof_path,
    )


class DebtOut(BaseModel):
    from_user: int = Field(serialization_alias="from")
    to_user: int = Field(serialization_alias="to")
    amount_minor: int = Field(serialization_alias="amount")


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class CommentOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    user_id: int
    body: str
    created_at: datetime
    updated_at: datetime | None = None
