from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.auth import get_current_user
from app.api.routes_matcher import router as matcher_router
from app.api.routes_renamer import router as renamer_router

app = FastAPI(
    title=settings.APP_NAME,
    description="Backend API untuk Multi-Mode Smart PDF Processing System (PDF Matcher & PDF Renamer)",
    version="1.0.0"
)

# Konfigurasi CORS agar frontend (Next.js di Cloudflare / localhost) dapat berkomunikasi
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Daftarkan router API Modul A dan Modul B
app.include_router(matcher_router)
app.include_router(renamer_router)

@app.get("/")
def root():
    return {
        "status": "online",
        "app": settings.APP_NAME,
        "message": "Backend Multi-Mode Smart PDF Processing System siap digunakan."
    }

@app.get("/api/health")
def health_check():
    """Endpoint untuk memeriksa kesehatan server dan status kesiapan API."""
    return {
        "status": "healthy",
        "environment": settings.ENV,
        "allowlist_active": len(settings.allowed_emails) > 0,
        "allowed_email_count": len(settings.allowed_emails)
    }

@app.get("/api/auth/me")
def check_user_access(current_user: dict = Depends(get_current_user)):
    """Memverifikasi bahwa pengguna berhasil login dan diizinkan dalam allowlist."""
    return {
        "authorized": True,
        "user": current_user,
        "message": f"Selamat datang, {current_user.get('name', 'Pengguna')}! Akses Anda diverifikasi."
    }
