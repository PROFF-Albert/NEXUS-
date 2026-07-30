"""Authentication, session handling and AES-256 vault cryptography.

Design notes
------------
* Login password  -> bcrypt hash, never stored in clear.
* Vault master password -> PBKDF2-HMAC-SHA256 (200k rounds, per-user salt)
  derives a 256-bit key.  The key is held **only in server memory** inside a
  short lived "vault session"; it is never written to disk and never sent to
  the frontend.  Secrets are sealed with AES-256-GCM (authenticated).
* 2FA uses RFC-6238 TOTP implemented on the standard library.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import struct
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import ACCESS_TOKEN_MINUTES, ALGORITHM, PBKDF2_ROUNDS, SECRET_KEY, VAULT_SESSION_MINUTES

# --------------------------------------------------------------------------- #
# passwords
# --------------------------------------------------------------------------- #
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 260000)
    return f"pbkdf2_sha256$260000${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt_b64, hash_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(),
                                 base64.b64decode(salt_b64), int(rounds))
        return hmac.compare_digest(dk, base64.b64decode(hash_b64))
    except Exception:
        return False


# --------------------------------------------------------------------------- #
# JWT sessions
# --------------------------------------------------------------------------- #
def create_access_token(user_id: int, session_id: str, minutes: int = ACCESS_TOKEN_MINUTES) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "sid": session_id,
               "iat": int(now.timestamp()),
               "exp": int((now + timedelta(minutes=minutes)).timestamp())}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


# --------------------------------------------------------------------------- #
# TOTP (2FA)
# --------------------------------------------------------------------------- #
def new_totp_secret() -> str:
    return base64.b32encode(os.urandom(20)).decode().rstrip("=")


def totp_now(secret: str, at: Optional[int] = None, step: int = 30, digits: int = 6) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    counter = int((at or time.time()) // step)
    mac = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    off = mac[-1] & 0x0F
    code = (struct.unpack(">I", mac[off:off + 4])[0] & 0x7FFFFFFF) % (10 ** digits)
    return str(code).zfill(digits)


def totp_verify(secret: str, code: str, window: int = 1) -> bool:
    code = (code or "").strip().replace(" ", "")
    now = time.time()
    return any(hmac.compare_digest(totp_now(secret, now + drift * 30), code)
               for drift in range(-window, window + 1))


def totp_uri(secret: str, email: str, issuer: str = "NEXUS") -> str:
    return f"otpauth://totp/{issuer}:{email}?secret={secret}&issuer={issuer}&digits=6&period=30"


# --------------------------------------------------------------------------- #
# Vault: AES-256-GCM
# --------------------------------------------------------------------------- #
VAULT_CANARY = b"NEXUS::VAULT::OK"


def new_salt() -> str:
    return base64.b64encode(os.urandom(16)).decode()


def derive_key(master_password: str, salt_b64: str) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", master_password.encode(),
                               base64.b64decode(salt_b64), PBKDF2_ROUNDS, dklen=32)


def seal(key: bytes, plaintext: str) -> str:
    nonce = os.urandom(12)
    ct = AESGCM(key).encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ct).decode()


def unseal(key: bytes, blob_b64: str) -> str:
    raw = base64.b64decode(blob_b64)
    return AESGCM(key).decrypt(raw[:12], raw[12:], None).decode()


class VaultSessions:
    """In-memory registry of unlocked vault keys (never persisted)."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[int, bytes, float]] = {}

    def open(self, user_id: int, key: bytes) -> tuple[str, int]:
        self.sweep()
        token = secrets.token_urlsafe(24)
        expires = time.time() + VAULT_SESSION_MINUTES * 60
        self._store[token] = (user_id, key, expires)
        return token, VAULT_SESSION_MINUTES * 60

    def key_for(self, token: str, user_id: int) -> Optional[bytes]:
        self.sweep()
        rec = self._store.get(token or "")
        if not rec or rec[0] != user_id:
            return None
        # sliding expiry: touching the vault keeps it open
        self._store[token] = (rec[0], rec[1], time.time() + VAULT_SESSION_MINUTES * 60)
        return rec[1]

    def close(self, token: str) -> None:
        self._store.pop(token or "", None)

    def close_user(self, user_id: int) -> None:
        for tok in [t for t, v in self._store.items() if v[0] == user_id]:
            self._store.pop(tok, None)

    def sweep(self) -> None:
        now = time.time()
        for tok in [t for t, v in self._store.items() if v[2] < now]:
            self._store.pop(tok, None)


vault_sessions = VaultSessions()


def new_session_id() -> str:
    return uuid.uuid4().hex
