from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.auth.schemas import (
    RegisterRequest, LoginRequest, WalletAuthRequest,
    NonceResponse, TokenResponse, UserResponse,
)
from app.auth.jwt_handler import create_access_token
from app.auth.password_auth import hash_password, verify_password
from app.auth.wallet_auth import generate_nonce, build_sign_message, verify_wallet_signature
from app.auth.dependencies import get_current_user
from app.redis_client import get_redis

router = APIRouter()

LOGIN_MAX_ATTEMPTS = 8       # per IP+email pair, per window
LOGIN_WINDOW_SECS = 300      # 5-minute sliding window
REGISTER_MAX_PER_IP = 5      # per IP, per window
REGISTER_WINDOW_SECS = 3600  # 1-hour sliding window


def _client_ip(request: Request) -> str:
    # Trust X-Forwarded-For when behind nginx; fall back to socket peer.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _check_login_rate_limit(request: Request, email: str) -> None:
    """Raise 429 if too many failed login attempts from (ip, email) recently."""
    ip = _client_ip(request)
    key = f"login_fail:{ip}:{email.lower()}"
    try:
        r = await get_redis()
        count = await r.get(key)
        if count is not None and int(count) >= LOGIN_MAX_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed login attempts. Try again later.",
            )
    except HTTPException:
        raise
    except Exception:
        # Redis down — fail open rather than block all logins.
        pass


async def _record_login_failure(request: Request, email: str) -> None:
    ip = _client_ip(request)
    key = f"login_fail:{ip}:{email.lower()}"
    try:
        r = await get_redis()
        n = await r.incr(key)
        if n == 1:
            await r.expire(key, LOGIN_WINDOW_SECS)
    except Exception:
        pass


async def _clear_login_failures(request: Request, email: str) -> None:
    ip = _client_ip(request)
    key = f"login_fail:{ip}:{email.lower()}"
    try:
        r = await get_redis()
        await r.delete(key)
    except Exception:
        pass


async def _check_register_rate_limit(request: Request) -> None:
    """Throttle account creation per IP to deter bot signups."""
    ip = _client_ip(request)
    key = f"register:{ip}"
    try:
        r = await get_redis()
        count = await r.get(key)
        if count is not None and int(count) >= REGISTER_MAX_PER_IP:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Registration limit reached. Try again later.",
            )
        n = await r.incr(key)
        if n == 1:
            await r.expire(key, REGISTER_WINDOW_SECS)
    except HTTPException:
        raise
    except Exception:
        # Fail open if Redis is unreachable.
        pass


@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await _check_register_rate_limit(request)

    # Check existing
    existing = await db.execute(
        select(User).where((User.email == req.email) | (User.username == req.username))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email or username already registered")

    user = User(
        email=req.email,
        username=req.username,
        password_hash=hash_password(req.password),
        auth_method="email",
    )
    db.add(user)
    await db.flush()

    token = create_access_token({"user_id": user.id, "role": user.role})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await _check_login_rate_limit(request, req.email)

    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash or not verify_password(req.password, user.password_hash):
        await _record_login_failure(request, req.email)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    await _clear_login_failures(request, req.email)
    user.last_login = datetime.now(timezone.utc)
    token = create_access_token({"user_id": user.id, "role": user.role})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/nonce", response_model=NonceResponse)
async def get_nonce(wallet: str = Query(pattern=r"^0x[a-fA-F0-9]{40}$"), db: AsyncSession = Depends(get_db)):
    nonce = generate_nonce()

    result = await db.execute(select(User).where(User.wallet_address == wallet.lower()))
    user = result.scalar_one_or_none()

    if user:
        user.wallet_nonce = nonce
    else:
        # Store nonce temporarily — user will be created on wallet auth
        user = User(
            wallet_address=wallet.lower(),
            username=f"wallet_{wallet[:8].lower()}",
            wallet_nonce=nonce,
            auth_method="wallet",
        )
        db.add(user)

    message = build_sign_message(nonce)
    return NonceResponse(nonce=nonce, message=message)


@router.post("/wallet", response_model=TokenResponse)
async def wallet_auth(req: WalletAuthRequest, db: AsyncSession = Depends(get_db)):
    wallet = req.wallet_address.lower()
    result = await db.execute(select(User).where(User.wallet_address == wallet))
    user = result.scalar_one_or_none()

    if not user or not user.wallet_nonce:
        raise HTTPException(status_code=400, detail="Request a nonce first")

    if not verify_wallet_signature(wallet, req.signature, user.wallet_nonce):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Clear nonce after use
    user.wallet_nonce = None
    user.last_login = datetime.now(timezone.utc)

    token = create_access_token({
        "user_id": user.id,
        "wallet_address": wallet,
        "role": user.role,
    })
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse.model_validate(user)
