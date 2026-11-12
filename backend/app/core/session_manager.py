import time
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("smart_pdf_session")

class EphemeralSessionManager:
    """
    Pengelola Sesi Memori Sementara (Zero-Retention):
    1. Menyimpan data dokumen sementara HANYA di RAM selama proses berlangsung.
    2. Menghapus sesi secara otomatis jika telah melebihi batas waktu (TTL / Time To Live).
    3. Membatasi jumlah sesi aktif agar RAM server tetap stabil dan tidak crash.
    4. Menyediakan metode penghapusan instan setelah unduhan selesai.
    """
    def __init__(self, ttl_seconds: int = 1800, max_active_sessions: int = 20):
        self.ttl_seconds = ttl_seconds
        self.max_active_sessions = max_active_sessions
        self._sessions: Dict[str, Dict[str, Any]] = {}

    def cleanup_expired(self):
        """Menghapus seluruh sesi yang sudah kedaluwarsa."""
        now = time.time()
        expired_keys = [
            sid for sid, data in self._sessions.items()
            if now - data.get("created_at", 0) > self.ttl_seconds
        ]
        for sid in expired_keys:
            logger.info(f"Membersihkan sesi kedaluwarsa dari memori: {sid}")
            # Hapus referensi data byte untuk membebaskan RAM seketika
            session_data = self._sessions.pop(sid, None)
            if session_data:
                session_data.clear()

    def set(self, session_id: str, data: Dict[str, Any]):
        """Menyimpan sesi baru dengan timestamp penciptaan."""
        self.cleanup_expired()

        # Jika kapasitas memori sesi penuh, hapus sesi yang paling lama
        if len(self._sessions) >= self.max_active_sessions:
            oldest_sid = min(self._sessions.keys(), key=lambda k: self._sessions[k].get("created_at", 0))
            logger.warning(f"Kapasitas sesi penuh. Menghapus sesi tertua: {oldest_sid}")
            self.delete(oldest_sid)

        data["created_at"] = time.time()
        self._sessions[session_id] = data

    def get(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Mengambil data sesi jika belum kedaluwarsa."""
        self.cleanup_expired()
        session = self._sessions.get(session_id)
        if session:
            # Perbarui waktu akses terakhir
            session["last_accessed"] = time.time()
        return session

    def delete(self, session_id: str):
        """Menghapus sesi secara permanen dari RAM seketika."""
        session_data = self._sessions.pop(session_id, None)
        if session_data:
            session_data.clear()
            logger.info(f"Sesi {session_id} telah dihapus bersih dari RAM.")

# Instance singleton untuk Matcher dan Renamer
matcher_sessions = EphemeralSessionManager(ttl_seconds=1800, max_active_sessions=15)
renamer_sessions = EphemeralSessionManager(ttl_seconds=1800, max_active_sessions=15)
