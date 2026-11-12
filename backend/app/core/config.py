import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

env_path = Path(__file__).resolve().parent.parent.parent / ".env"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(env_path) if env_path.exists() else None,
        env_file_encoding="utf-8",
        extra="ignore"
    )

    APP_NAME: str = "Multi-Mode Smart PDF Processing System"
    ENV: str = "production"
    PORT: int = 7860
    
    # Keamanan: Daftar email terdaftar yang diizinkan (Allowlist)
    # Mencakup kedua akun email Anda
    ALLOWED_EMAILS: str = "accnidzaenal@gmail.com,zexavier369@gmail.com"
    
    # Pengaturan Jaringan & Akses CORS
    CORS_ORIGINS: str = "*"
    
    # Konfigurasi Firebase Admin
    FIREBASE_PROJECT_ID: str = "zepdf-smart"
    FIREBASE_CREDENTIALS_PATH: str = ""

    # Proteksi Memori RAM & Batasan Berkas
    MAX_FILE_SIZE_MB: int = 25              # Maksimal 25 MB per berkas PDF
    MAX_PAGES_PER_DOCUMENT: int = 200       # Maksimal 200 halaman per proses
    SESSION_TTL_MINUTES: int = 30           # Sesi otomatis dibersihkan setelah 30 menit

    @property
    def allowed_emails(self) -> List[str]:
        if not self.ALLOWED_EMAILS:
            return []
        return [email.strip().lower() for email in self.ALLOWED_EMAILS.split(",") if email.strip()]

    @property
    def cors_origins(self) -> List[str]:
        if self.CORS_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

settings = Settings()
