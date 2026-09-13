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
