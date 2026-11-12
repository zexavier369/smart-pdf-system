import re
import base64
import logging
from typing import Tuple, Optional
import fitz  # PyMuPDF

logger = logging.getLogger("smart_pdf_ocr")

def extract_text_from_page(page: fitz.Page) -> Tuple[str, str]:
    """
    Mengekstrak teks dari satu halaman PDF.
    Urutan:
    1. Coba ekstraksi teks langsung via PyMuPDF (Sangat cepat dan akurat untuk PDF digital).
    2. Jika teks kosong atau terlalu sedikit, coba fallback ke Tesseract OCR (untuk PDF hasil scan).
    
    Returns:
        (text, extraction_method): teks hasil ekstraksi dan metode yang berhasil ("direct" / "ocr" / "none")
    """
    # 1. Ekstraksi langsung (Direct extraction)
    direct_text = page.get_text("text")
    if direct_text and len(direct_text.strip()) > 3:
        return direct_text.strip(), "direct"

    # 2. Fallback ke Tesseract OCR jika ada modul pytesseract & tesseract terpasang
    try:
        import pytesseract
        import numpy as np
        import cv2

        # Render halaman PDF menjadi gambar pixmap
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("png")
        
        # Konversi byte gambar ke numpy array untuk OpenCV
        nparr = np.frombuffer(img_bytes, np.uint8)
        img_cv = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # Preprocessing gambar dengan OpenCV untuk meningkatkan akurasi OCR
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        # Binarization / Otsu Thresholding
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
        
        # Jalankan Tesseract OCR dengan bahasa Indonesia + Inggris
        ocr_text = pytesseract.image_to_string(thresh, lang="ind+eng", config="--psm 6")
        if ocr_text and len(ocr_text.strip()) > 2:
            return ocr_text.strip(), "ocr"
    except Exception as e:
        logger.debug(f"Tesseract OCR fallback tidak tersedia atau gagal: {e}")

    # Jika direct text ada sedikit meskipun pendek
    if direct_text:
        return direct_text.strip(), "direct"

    return "", "none"

def generate_page_thumbnail(page: fitz.Page, max_dim: int = 600) -> str:
    """
    Menghasilkan gambar pratinjau halaman PDF dalam format base64 PNG.
    Digunakan di antarmuka web agar pengguna bisa melihat dokumen asli saat koreksi manual.
    """
    try:
        # Hitung skala agar ukuran efisien dan hemat memori
        rect = page.rect
        scale = max_dim / max(rect.width, rect.height)
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img_bytes = pix.tobytes("png")
        b64_str = base64.b64encode(img_bytes).decode("utf-8")
        return f"data:image/png;base64,{b64_str}"
    except Exception as e:
        logger.error(f"Gagal membuat thumbnail halaman: {e}")
        return ""
