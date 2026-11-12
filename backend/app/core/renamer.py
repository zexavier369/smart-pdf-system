import re
import csv
import io
import zipfile
import datetime
import logging
from typing import List, Dict, Any, Optional, Tuple
import fitz  # PyMuPDF
from app.core.ocr import extract_text_from_page, generate_page_thumbnail

logger = logging.getLogger("smart_pdf_renamer")

# Pemetaan 12 nama bulan bahasa Indonesia ke nomor bulan (1-12)
BULAN_INDONESIA = {
    "januari": 1, "jan": 1,
    "februari": 2, "feb": 2,
    "maret": 3, "mar": 3,
    "april": 4, "apr": 4,
    "mei": 5,
    "juni": 6, "jun": 6,
    "juli": 7, "jul": 7,
    "agustus": 8, "agt": 8, "agu": 8,
    "september": 9, "sep": 9,
    "oktober": 10, "okt": 10,
    "november": 11, "nov": 11,
    "desember": 12, "des": 12
}

def parse_indonesian_date(text: str) -> Tuple[Optional[int], Optional[str], Optional[str]]:
    """
    Mencari dan memvalidasi tanggal dokumen berbahasa Indonesia.
    Mendukung format nama bulan: "1 Januari 2026", "15 Februari 2026", dsb.
    
    Returns:
        (day_number, full_date_str, error_reason)
        day_number: angka hari (1-31) untuk format penamaan file SJ_[NomorSJ]-[Tanggal].pdf
    """
    if not text:
        return None, None, "Teks dokumen kosong"

    # 1. Pola tanggal bahasa Indonesia: AngkaHari + NamaBulan + Tahun
    # Contoh: "1 Januari 2026", "15 Februari 2026", "02 Maret 2025"
    pattern_indo = r'\b([0-9]{1,2})\s+([A-Za-z]+)\s+([0-9]{4})\b'
    matches = re.findall(pattern_indo, text)

    for match in matches:
        raw_day, raw_month, raw_year = match
        day_int = int(raw_day)
        month_name = raw_month.lower()
        year_int = int(raw_year)

        month_int = BULAN_INDONESIA.get(month_name)
        if not month_int:
            continue

        # Validasi kalender sah menggunakan datetime.date
        # Menolak tanggal mustahil seperti 30 Februari, 32 Januari, 31 April
        try:
            valid_date = datetime.date(year_int, month_int, day_int)
            full_str = f"{valid_date.day} {raw_month.capitalize()} {valid_date.year}"
            return valid_date.day, full_str, None
        except ValueError as ve:
            return None, f"{raw_day} {raw_month} {raw_year}", f"Tanggal kalender tidak sah: {ve}"

    # 2. Pola tanggal angka numerik: DD/MM/YYYY atau DD-MM-YYYY
    pattern_num = r'\b([0-9]{1,2})[\/\-]([0-9]{1,2})[\/\-]([0-9]{4})\b'
    matches_num = re.findall(pattern_num, text)
    for match in matches_num:
        raw_day, raw_month, raw_year = match
        try:
            valid_date = datetime.date(int(raw_year), int(raw_month), int(raw_day))
            full_str = f"{valid_date.day}/{valid_date.month}/{valid_date.year}"
            return valid_date.day, full_str, None
        except ValueError as ve:
            return None, f"{raw_day}/{raw_month}/{raw_year}", f"Tanggal kalender tidak sah: {ve}"

    return None, None, "Format tanggal tidak ditemukan"

def extract_sj_number(text: str) -> Optional[str]:
    """
    Mengekstrak nomor Surat Jalan dari teks halaman.
    Mendukung pola seperti:
    - "No. Surat Jalan : 260100001"
    - "No. SJ : 260100002"
    - "SURAT JALAN NO: 260100003"
    - Nomor urut angka 6-15 digit
    """
    if not text:
        return None

    # Pola dengan label eksplisit
    patterns = [
        r'(?:SURAT\s+JALAN|NO\.?\s*SURAT\s+JALAN|NO\.?\s*SJ|SJ\s*NO)[\s\:\#\.\-]+([A-Za-z0-9\/\.\-_]+)',
        r'(?:NO\.?\s*DOKUMEN|NO\.?\s*PENGIRIMAN)[\s\:\#\.\-]+([A-Za-z0-9\/\.\-_]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            candidate = match.group(1).strip().strip(".:-#")
            # Pastikan bukan sekadar kata umum
            if len(candidate) >= 3:
                return candidate

    # Fallback: Cari urutan angka 6-12 digit (format khas nomor SJ modern)
    digits = re.findall(r'\b([0-9]{6,12})\b', text)
    if digits:
        return digits[0].strip()

    return None

def analyze_renamer_page(
    page: fitz.Page,
    source_filename: str,
    page_number: int
) -> Dict[str, Any]:
    """
    Menganalisis 1 halaman Surat Jalan:
    - Ekstraksi teks & OCR jika perlu.
    - Ekstraksi Nomor SJ & Tanggal.
    - Pembuatan thumbnail pratinjau halaman.
    """
    text, method = extract_text_from_page(page)
    sj_num = extract_sj_number(text)
    day_num, full_date_str, date_error = parse_indonesian_date(text)
    thumbnail = generate_page_thumbnail(page, max_dim=500)

    # Susun usulan nama file jika nomor SJ dan tanggal berhasil diekstrak
    proposed_filename = None
    if sj_num and day_num is not None:
        proposed_filename = f"SJ_{sj_num}-{day_num}.pdf"

    return {
        "page_id": f"{source_filename}_p{page_number}",
        "source_filename": source_filename,
        "page_number": page_number,
        "sj_number": sj_num or "",
        "day_number": day_num,
        "full_date_str": full_date_str or "",
        "date_error": date_error,
        "proposed_filename": proposed_filename or "",
        "final_filename": proposed_filename or "",
        "extraction_method": method,
        "thumbnail": thumbnail,
        "status": "PENDING"
    }

def validate_renamer_pages(pages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Validasi ketat daftar halaman Surat Jalan:
    1. Nomor SJ kosong / tidak terbaca.
    2. Tanggal kosong / tidak valid.
    3. Duplikasi Nomor SJ.
    4. Tabrakan nama file final (Collision).
    """
    issues = []
    seen_sj: Dict[str, List[Dict[str, Any]]] = {}
    seen_filenames: Dict[str, List[Dict[str, Any]]] = {}

    for p in pages:
        page_issues = []
        sj = p.get("sj_number", "").strip()
        day = p.get("day_number")
        final_name = p.get("final_filename", "").strip()

        # 1. Periksa Nomor SJ
        if not sj:
            page_issues.append("Nomor SJ tidak terbaca atau kosong")
            issues.append({
                "type": "EMPTY_SJ",
                "message": f"Berkas '{p['source_filename']}' Hal {p['page_number']}: Nomor Surat Jalan tidak terbaca.",
                "page_id": p["page_id"]
            })
        else:
            if sj not in seen_sj:
                seen_sj[sj] = []
            seen_sj[sj].append(p)

        # 2. Periksa Tanggal
        if day is None:
            err = p.get("date_error") or "Tanggal tidak ditemukan"
            page_issues.append(err)
            issues.append({
                "type": "INVALID_DATE",
                "message": f"Berkas '{p['source_filename']}' Hal {p['page_number']}: {err}.",
                "page_id": p["page_id"]
            })

        # 3. Periksa Nama File Final
        if not final_name or not final_name.endswith(".pdf"):
            page_issues.append("Nama file final tidak valid")
        else:
            if final_name not in seen_filenames:
                seen_filenames[final_name] = []
            seen_filenames[final_name].append(p)

        p["status"] = "VALID" if len(page_issues) == 0 else "INVALID"
        p["validation_errors"] = page_issues

    # Periksa Duplikasi Nomor SJ
    for sj, occurrence in seen_sj.items():
        if len(occurrence) > 1:
            locs = ", ".join([f"{item['source_filename']} (Hal {item['page_number']})" for item in occurrence])
            issues.append({
                "type": "DUPLICATE_SJ",
                "message": f"Nomor SJ '{sj}' ditemukan berulang di {len(occurrence)} tempat: {locs}.",
                "sj_number": sj
            })
            for item in occurrence:
                if "Nomor SJ Duplikat" not in item["validation_errors"]:
                    item["validation_errors"].append("Nomor SJ Duplikat")
                    item["status"] = "INVALID"

    # Periksa Tabrakan Nama File (Collision)
    for fname, occurrence in seen_filenames.items():
        if len(occurrence) > 1:
            locs = ", ".join([f"{item['source_filename']} (Hal {item['page_number']})" for item in occurrence])
            issues.append({
                "type": "FILENAME_COLLISION",
                "message": f"Tabrakan nama file! Nama '{fname}' dihasilkan oleh {len(occurrence)} halaman: {locs}.",
                "filename": fname
            })
            for item in occurrence:
                if "Tabrakan Nama File" not in item["validation_errors"]:
                    item["validation_errors"].append("Tabrakan Nama File")
                    item["status"] = "INVALID"

    valid_count = len([p for p in pages if p["status"] == "VALID"])
    is_fully_valid = len(issues) == 0 and len(pages) > 0

    return {
        "is_fully_valid": is_fully_valid,
        "total_pages": len(pages),
        "valid_count": valid_count,
        "invalid_count": len(pages) - valid_count,
        "issue_count": len(issues),
        "issues": issues,
        "pages": pages
    }

def split_single_page_pdf(doc_bytes: bytes, page_number: int) -> bytes:
    """
    Memisahkan tepat 1 halaman dari PDF menjadi 1 berkas PDF baru mandiri.
    Mempertahankan 100% ukuran asli, orientasi, dan resolusi vektor dokumen.
    """
    src_doc = fitz.open(stream=doc_bytes, filetype="pdf")
    new_doc = fitz.open()
    
    # page_number adalah 1-based index
    new_doc.insert_pdf(src_doc, from_page=page_number - 1, to_page=page_number - 1)
    
    output_bytes = new_doc.tobytes(garbage=3, deflate=True)
    src_doc.close()
    new_doc.close()
    return output_bytes

def generate_renamer_zip(
    source_files_map: Dict[str, bytes],
    pages_data: List[Dict[str, Any]]
) -> bytes:
    """
    Menggabungkan seluruh halaman Surat Jalan yang telah dipisahkan ke dalam 1 arsip ZIP.
    Setiap halaman menjadi file tersendiri dengan nama SJ_[NomorSJ]-[Tanggal].pdf.
    """
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for p in pages_data:
            # Lewati jika status belum valid
            if p.get("status") != "VALID":
                continue

            src_filename = p["source_filename"]
            page_num = p["page_number"]
            final_name = p["final_filename"]

            doc_bytes = source_files_map.get(src_filename)
            if not doc_bytes:
                continue

            single_pdf_bytes = split_single_page_pdf(doc_bytes, page_num)
            zip_file.writestr(final_name, single_pdf_bytes)

    return zip_buffer.getvalue()

def generate_renamer_csv_report(
    analysis_result: Dict[str, Any]
) -> str:
    """
    Menghasilkan laporan CSV komprehensif untuk modul PDF Renamer.
    """
    output = io.StringIO()
    writer = csv.writer(output)

    # Header Ringkasan
    writer.writerow(["=== LAPORAN PEMROSESAN PDF RENAMER (SURAT JALAN) ==="])
    writer.writerow(["Total Halaman Diproses", analysis_result.get("total_pages", 0)])
    writer.writerow(["Halaman Valid & Siap Ekspor", analysis_result.get("valid_count", 0)])
    writer.writerow(["Halaman Bermasalah", analysis_result.get("invalid_count", 0)])
    writer.writerow(["Status Keseluruhan", "LENGKAP & VALID" if analysis_result.get("is_fully_valid") else "PERLU TINJAUAN KOREKSI"])
    writer.writerow([])

    # Rincian Halaman
    writer.writerow([
        "Nama PDF Sumber",
        "Halaman Asli",
        "Nomor Surat Jalan",
        "Tanggal Dokumen",
        "Nama File Diusulkan",
        "Nama File Final",
        "Metode OCR",
        "Status Validasi",
        "Catatan / Kesalahan"
    ])

    for p in analysis_result.get("pages", []):
        writer.writerow([
            p.get("source_filename", ""),
            p.get("page_number", ""),
            p.get("sj_number", ""),
            p.get("full_date_str", ""),
            p.get("proposed_filename", ""),
            p.get("final_filename", ""),
            p.get("extraction_method", ""),
            p.get("status", ""),
            "; ".join(p.get("validation_errors", []))
        ])

    return output.getvalue()
