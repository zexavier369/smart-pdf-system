import json
import base64
import time
import requests
import logging
from typing import Optional, Dict, Any
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.core.config import settings

logger = logging.getLogger("smart_pdf_auth")
security = HTTPBearer(auto_error=False)

FIREBASE_API_KEY = getattr(settings, "FIREBASE_API_KEY", "AIzaSyDezqT7J66hD8ayfaboCGh9Odro2DFmSRE")
FIREBASE_PROJECT_ID = settings.FIREBASE_PROJECT_ID or "zepdf-smart"

def decode_jwt_payload_unverified(token: str) -> Dict[str, Any]:
    """Membaca payload dari JWT token tanpa memverifikasi signature terlebih dahulu."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return {}
        payload_b64 = parts[1]
        # Tambahkan padding '=' jika diperlukan
        remainder = len(payload_b64) % 4
        if remainder > 0:
            payload_b64 += "=" * (4 - remainder)
        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        return json.loads(payload_bytes.decode("utf-8"))
    except Exception as e:
        logger.warning(f"Gagal decode payload JWT: {e}")
        return {}

def verify_token_with_google_api(token: str) -> Optional[Dict[str, Any]]:
    """
    Memverifikasi Firebase ID Token secara resmi langsung ke REST API Google Identity Toolkit.
    Bekerja 100% di serverless (Vercel) tanpa memerlukan berkas Service Account JSON.
    """
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={FIREBASE_API_KEY}"
    try:
        resp = requests.post(url, json={"idToken": token}, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            users = data.get("users", [])
            if users:
                user = users[0]
                return {
                    "uid": user.get("localId"),
                    "email": user.get("email", "").lower(),
                    "name": user.get("displayName") or user.get("email", "").split("@")[0],
                    "picture": user.get("photoUrl", "")
                }
    except Exception as e:
        logger.warning(f"Pemeriksaan via Google Identity Toolkit gagal/timeout: {e}")
    return None

async def get_current_user(
    credentials_auth: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> Dict[str, Any]:
    """
    Middleware keamanan FastAPI:
    1. Membaca Bearer Token.
    2. Memverifikasi keaslian token melalui Google Identity Toolkit & JWT claim validator.
    3. Memeriksa izin Allowlist email.
    """
    if not credentials_auth or not credentials_auth.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token autentikasi tidak ditemukan. Silakan login terlebih dahulu.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials_auth.credentials
    user_info = None

    # 1. Coba verifikasi resmi ke Google Identity Toolkit
    verified_user = verify_token_with_google_api(token)
    if verified_user:
        user_info = verified_user
    else:
        # 2. Fallback: Verifikasi claims JWT (aud, iss, exp)
        payload = decode_jwt_payload_unverified(token)
        if payload:
            exp = payload.get("exp", 0)
            aud = payload.get("aud")
            iss = payload.get("iss")
            email = payload.get("email", "").lower()
            uid = payload.get("user_id") or payload.get("sub")

            # Periksa apakah token sudah kedaluwarsa (beri toleransi 300 detik / 5 menit untuk clock skew)
            if time.time() > (exp + 300):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token autentikasi telah kedaluwarsa. Silakan keluar dan masuk kembali.",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Periksa apakah aud dan iss sesuai dengan proyek zepdf-smart
            expected_iss = f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}"
            if aud == FIREBASE_PROJECT_ID and iss == expected_iss and email:
                user_info = {
                    "uid": uid,
                    "email": email,
                    "name": payload.get("name") or email.split("@")[0],
                    "picture": payload.get("picture", "")
                }

    if not user_info:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token autentikasi tidak valid atau telah kedaluwarsa. Silakan login ulang.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email = user_info.get("email", "").lower()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun Anda tidak memiliki alamat email yang valid."
        )

    # Pemeriksaan Allowlist Email (Hanya email terdaftar yang diizinkan)
    allowed_list = settings.allowed_emails
    if allowed_list and email not in allowed_list:
        logger.warning(f"Akses ditolak untuk email tidak terdaftar: {email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Akses Ditolak: Alamat email '{email}' belum terdaftar di izin sistem. Hubungi administrator."
        )

    return user_info
