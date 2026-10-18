import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from pwdlib import PasswordHash
from sqlalchemy.orm import Session
from .database import get_db
from .models import User

env_file = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_file)

JWT_SECRET = os.getenv("JWT_SECRET", "")
if len(JWT_SECRET) < 32:
    # A short exported value otherwise prevents dotenv from loading the local secret.
    load_dotenv(env_file, override=True)
    JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
TOKEN_MINUTES = int(os.getenv("TOKEN_MINUTES", "10080"))
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)

def require_secret():
    if len(JWT_SECRET) < 32:
        raise HTTPException(503, "Server auth is not configured. Set a strong JWT_SECRET (32+ characters).")

def make_token(user: User):
    require_secret()
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user.id), "iat": now, "exp": now + timedelta(minutes=TOKEN_MINUTES)},
        JWT_SECRET, algorithm=JWT_ALGORITHM
    )

def user_payload(user: User):
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "avatar_data": getattr(user, "avatar_data", None),
        "role": user.role,
    }


def require_roles(*roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "You do not have permission to perform this action")
        return user

    return dependency

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db)
) -> User:
    require_secret()
    if not credentials:
        raise HTTPException(401, "Please log in to continue")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise HTTPException(401, "Session expired or invalid. Please log in again.")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(401, "User account is not available")
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User | None:
    if not credentials or len(JWT_SECRET) < 32:
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        return None
    return db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()


def verify_google_credential(credential: str):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(503, "Google sign-in is not configured yet. Set GOOGLE_CLIENT_ID.")
    try:
        info = id_token.verify_oauth2_token(credential, google_requests.Request(), GOOGLE_CLIENT_ID)
    except Exception:
        raise HTTPException(401, "Google sign-in could not be verified")
    if not info.get("email") or not info.get("email_verified"):
        raise HTTPException(401, "Google account email must be verified")
    return info
