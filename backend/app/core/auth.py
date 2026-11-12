import logging
from typing import Optional, Dict, Any
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from app.core.config import settings

logger = logging.getLogger("smart_pdf_auth")
security = HTTPBearer(auto_error=False)

# Inisialisasi Firebase Admin SDK secara aman (hanya sekali)
_firebase_initialized = False

def init_firebase():
    global _firebase_initialized
    if not _firebase_initialized and not firebase_admin._apps:
        try:
            if settings.FIREBASE_CREDENTIALS_PATH and settings.FIREBASE_CREDENTIALS_PATH != "":
                cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
                firebase_admin.initialize_app(cred)
                logger.info("Firebase Admin initialized using service account file.")
            elif settings.FIREBASE_PROJECT_ID:
                firebase_admin.initialize_app(options={"projectId": settings.FIREBASE_PROJECT_ID})
                logger.info(f"Firebase Admin initialized for project: {settings.FIREBASE_PROJECT_ID}")
            else:
                # Inisialisasi default aplikasi (jika jalan di GCP / Cloud Run)
                firebase_admin.initialize_app()
                logger.info("Firebase Admin initialized with default credentials.")
            _firebase_initialized = True
        except Exception as e:
            logger.warning(f"Firebase Admin belum aktif: {e}. Menggunakan mode dev/fallback.")

# Panggil inisialisasi saat modul dimuat
init_firebase()

async def get_current_user(
    credentials_auth: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> Dict[str, Any]:
    """
    Middleware keamanan FastAPI:
    1. Membaca Bearer Token dari Header Authorization request.
    2. Memverifikasi token ke Firebase Authentication.
    3. Memeriksa apakah email pengguna terdaftar di ALLOWED_EMAILS.
    4. Menolak dengan HTTP 401 jika token salah / tidak ada.
    5. Menolak dengan HTTP 403 jika email tidak diizinkan.
    """
    if not credentials_auth or not credentials_auth.credentials:
        # Jika dalam mode dev dan belum ada allowlist yang diset sama sekali, kita izinkan mode tamu untuk pengujian awal
        if settings.ENV == "development" and not settings.allowed_emails:
            return {
                "uid": "dev_test_user",
                "email": "developer@local.test",
                "name": "Developer Mode (Antigravity)",
                "is_dev": True
            }
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token autentikasi tidak ditemukan. Silakan login terlebih dahulu.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials_auth.credentials
    
    # Verifikasi token melalui Firebase Admin SDK
    try:
        decoded_token = firebase_auth.verify_id_token(token)
        email = decoded_token.get("email", "").lower()
        uid = decoded_token.get("uid")
        name = decoded_token.get("name", email.split("@")[0] if email else "Pengguna")

        if not email:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Akun Anda tidak memiliki alamat email yang valid."
            )

        # Pemeriksaan Allowlist Email (Hanya email terdaftar yang boleh lewat)
        allowed_list = settings.allowed_emails
        if allowed_list and email not in allowed_list:
            logger.warning(f"Akses ditolak untuk email tidak terdaftar: {email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Akses Ditolak: Alamat email '{email}' belum terdaftar di izin sistem. Hubungi administrator."
            )

        return {
            "uid": uid,
            "email": email,
            "name": name,
            "picture": decoded_token.get("picture", "")
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gagal memverifikasi Firebase Token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token autentikasi tidak valid atau telah kedaluwarsa. Silakan login ulang.",
            headers={"WWW-Authenticate": "Bearer"},
        )
