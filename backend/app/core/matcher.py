import re
import csv
import io
import logging
from typing import List, Dict, Any, Optional, Tuple
import fitz  # PyMuPDF
from app.core.ocr import extract_text_from_page, generate_page_thumbnail

logger = logging.getLogger("smart_pdf_matcher")

def normalize_po_number(raw_text: str, is_doc_a: bool = True) -> Optional[str]:
    """
    Normalisasi nomor PO:
    - Disimpan sebagai string, BUKAN integer (mempertahankan angka nol di depan: "001234").
    - Pada Dokumen A: mencari format seperti "PO 12345", "PO: 001234", "PO# 12345", "P.O. 12345", atau label PO.
    - Pada Dokumen B: mencari nomor PO seperti "12345" atau "001234".
    """
    if not raw_text:
        return None

    text = raw_text.strip()

    if is_doc_a:
        # Dokumen A: Cari pola PO dengan awalan label
        # Contoh: "PO 12345", "PO: 001234", "PO# 12345", "P.O. 12345", "PURCHASE ORDER: 12345"
        patterns = [
            r'(?:PO|P\.O\.|PURCHASE\s+ORDER)[\s\:\#\.\-]+([A-Za-z0-9\-]+)',
            r'\bPO\s*([A-Za-z0-9\-]+)',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                po = match.group(1).strip()
                # Bersihkan karakter pemisah berlebih di ujung jika ada
                po = po.strip(".:-#")
                if len(po) >= 2:
                    return po

        # Fallback Dokumen A jika awalan tidak tertangkap tapi ada angka PO di baris awal
        match_digits = re.search(r'\b([0-9]{4,12})\b', text)
        if match_digits:
            return match_digits.group(1).strip()

    else:
        # Dokumen B: Nomor PO biasanya tercetak langsung seperti "12345" atau "001234"
        # Coba periksa apakah ada label PO terlebih dahulu
        match_labeled = re.search(r'(?:PO|P\.O\.)[\s\:\#\.\-]+([A-Za-z0-9\-]+)', text, re.IGNORECASE)
        if match_labeled:
            po = match_labeled.group(1).strip().strip(".:-#")
            if len(po) >= 2:
                return po

        # Jika tanpa label, cari urutan angka 4-12 digit (format umum nomor PO)
        matches = re.findall(r'\b([0-9]{4,12})\b', text)
        if matches:
            # Ambil kemunculan angka yang paling relevan
            return matches[0].strip()

    return None

def analyze_document_pages(doc_bytes: bytes, filename: str, is_doc_a: bool = True) -> List[Dict[str, Any]]:
    """
    Membaca setiap halaman dari dokumen PDF, mengekstrak teks & nomor PO,
    serta menghasilkan thumbnail gambar untuk verifikasi pengguna.
    """
    doc = fitz.open(stream=doc_bytes, filetype="pdf")
    pages_data = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        page_num = page_idx + 1
        
        # Ekstraksi teks & metode (direct atau OCR)
        text, method = extract_text_from_page(page)
        extracted_po = normalize_po_number(text, is_doc_a=is_doc_a)
        thumbnail = generate_page_thumbnail(page, max_dim=500)

        pages_data.append({
            "doc_type": "A" if is_doc_a else "B",
            "filename": filename,
            "page_number": page_num,
            "raw_text_snippet": text[:150] if text else "",
            "extraction_method": method,
            "po_number": extracted_po or "",
            "is_readable": bool(extracted_po),
            "thumbnail": thumbnail,
            "manual_corrected": False
        })

    doc.close()
    return pages_data

def match_and_validate(
    pages_a: List[Dict[str, Any]],
    pages_b: List[Dict[str, Any]],
    mode: str = "1:1"
) -> Dict[str, Any]:
    """
    Mencocokkan Dokumen A dan Dokumen B berdasarkan nomor PO sesuai Mode (1:1 atau 1:2).
    Menghasilkan status validasi ketat, daftar kecocokan, dan daftar masalah.
    """
    expected_b_pages = 1 if mode == "1:1" else 2

    # Petakan Dokumen B berdasarkan nomor PO
    b_po_map: Dict[str, List[Dict[str, Any]]] = {}
    for pb in pages_b:
        po = pb.get("po_number", "").strip()
        if po:
            if po not in b_po_map:
                b_po_map[po] = []
            b_po_map[po].append(pb)

    matched_pairs = []
    unmatched_a = []
    issues = []
    used_b_pages = set()

    # Periksa Dokumen A berurutan (urutan hasil akhir wajib mengikuti urutan Dokumen A)
    for pa in pages_a:
        po_a = pa.get("po_number", "").strip()
        
        if not po_a:
            issues.append({
                "type": "UNREADABLE_PO_A",
                "message": f"Dokumen A Halaman {pa['page_number']}: Nomor PO tidak terbaca.",
                "page_a": pa["page_number"],
                "po_number": ""
            })
            continue

        # Cari pasangan di Dokumen B
        b_pages = b_po_map.get(po_a, [])

        if not b_pages:
            unmatched_a.append(po_a)
            issues.append({
                "type": "PO_MISSING_IN_B",
                "message": f"Nomor PO '{po_a}' (Dokumen A Halaman {pa['page_number']}) tidak ditemukan pada Dokumen B.",
                "page_a": pa["page_number"],
                "po_number": po_a
            })
            continue

        # Periksa kesesuaian jumlah halaman Dokumen B sesuai mode
        if len(b_pages) != expected_b_pages:
            issues.append({
                "type": "B_PAGE_COUNT_MISMATCH",
                "message": f"Nomor PO '{po_a}': Mode {mode} membutuhkan {expected_b_pages} halaman di Dokumen B, namun ditemukan {len(b_pages)} halaman.",
                "page_a": pa["page_number"],
                "pages_b": [p["page_number"] for p in b_pages],
                "po_number": po_a
            })

        # Catat halaman B yang terpakai
        for pb in b_pages:
            used_b_pages.add(pb["page_number"])

        matched_pairs.append({
            "po_number": po_a,
            "page_a": pa,
            "pages_b": b_pages,
            "status": "VALID" if len(b_pages) == expected_b_pages else "INVALID_PAGE_COUNT"
        })

    # Periksa apakah ada halaman Dokumen B yang tidak memiliki nomor PO atau tidak cocok dengan Dokumen A
    for pb in pages_b:
        po_b = pb.get("po_number", "").strip()
        if not po_b:
            issues.append({
                "type": "UNREADABLE_PO_B",
                "message": f"Dokumen B Halaman {pb['page_number']}: Nomor PO tidak terbaca.",
                "page_b": pb["page_number"],
                "po_number": ""
            })
        elif pb["page_number"] not in used_b_pages:
            issues.append({
                "type": "PO_EXTRA_IN_B",
                "message": f"Nomor PO '{po_b}' pada Dokumen B Halaman {pb['page_number']} tidak memiliki pasangan di Dokumen A.",
                "page_b": pb["page_number"],
                "po_number": po_b
            })

    total_po_a = len([p for p in pages_a if p.get("po_number")])
    valid_count = len([m for m in matched_pairs if m["status"] == "VALID"])
    is_fully_valid = len(issues) == 0 and valid_count > 0

    return {
        "mode": mode,
        "is_fully_valid": is_fully_valid,
        "total_pages_a": len(pages_a),
        "total_pages_b": len(pages_b),
        "total_po_a": total_po_a,
        "matched_count": valid_count,
        "unmatched_count": len(unmatched_a),
        "issue_count": len(issues),
        "issues": issues,
        "matched_pairs": matched_pairs
    }

def merge_matched_pdf(
    doc_a_bytes: bytes,
    doc_b_bytes: bytes,
    matched_pairs: List[Dict[str, Any]],
    is_partial: bool = False
) -> bytes:
    """
    Menggabungkan halaman-halaman PDF yang telah dicocokkan sesuai urutan resmi:
    - Mengikuti urutan Dokumen A.
    - Untuk setiap PO: Halaman A, kemudian Halaman B (halaman pertama lalu halaman kedua jika mode 1:2).
    - Mempertahankan kualitas visual asli, ukuran, dan orientasi halaman sumber.
    """
    doc_a = fitz.open(stream=doc_a_bytes, filetype="pdf")
    doc_b = fitz.open(stream=doc_b_bytes, filetype="pdf")
    output_doc = fitz.open()

    for pair in matched_pairs:
        # Jika bukan partial export, hanya masukkan yang berstatus VALID
        if not is_partial and pair.get("status") != "VALID":
            continue

        # 1. Sisipkan Halaman dari Dokumen A (0-based index)
        page_a_idx = pair["page_a"]["page_number"] - 1
        output_doc.insert_pdf(doc_a, from_page=page_a_idx, to_page=page_a_idx)

        # 2. Sisipkan Halaman-halaman dari Dokumen B
        for pb in pair["pages_b"]:
            page_b_idx = pb["page_number"] - 1
            output_doc.insert_pdf(doc_b, from_page=page_b_idx, to_page=page_b_idx)

    output_bytes = output_doc.tobytes(garbage=3, deflate=True)
    doc_a.close()
    doc_b.close()
    output_doc.close()

    return output_bytes

def generate_matcher_csv_report(
    analysis_result: Dict[str, Any],
    doc_a_name: str,
    doc_b_name: str
) -> str:
    """
    Menghasilkan laporan CSV komprehensif berisi ringkasan, daftar pasangan,
    nomor halaman sumber asli, dan daftar kesalahan/isu.
    """
    output = io.StringIO()
    writer = csv.writer(output)

    # Header Ringkasan
    writer.writerow(["=== LAPORAN PEMROSESAN PDF MATCHER ==="])
    writer.writerow(["Nama Dokumen A", doc_a_name])
    writer.writerow(["Nama Dokumen B", doc_b_name])
    writer.writerow(["Mode Operasi", analysis_result.get("mode", "1:1")])
    writer.writerow(["Status Keseluruhan", "LENGKAP & VALID" if analysis_result.get("is_fully_valid") else "PERLU TINJAUAN / SEBAGIAN"])
    writer.writerow(["Total PO Dokumen A", analysis_result.get("total_po_a", 0)])
    writer.writerow(["Jumlah PO Cocok", analysis_result.get("matched_count", 0)])
    writer.writerow(["Jumlah PO Bermasalah", analysis_result.get("issue_count", 0)])
    writer.writerow([])

    # Tabel Rincian Pasangan
    writer.writerow(["RINCIAN PASANGAN NOMOR PO"])
    writer.writerow(["Nomor PO", "Halaman Dok A", "Halaman Dok B", "Status Pasangan", "Catatan"])

    for pair in analysis_result.get("matched_pairs", []):
        po = pair.get("po_number", "")
        hal_a = pair.get("page_a", {}).get("page_number", "")
        hal_b = ", ".join([str(p.get("page_number", "")) for p in pair.get("pages_b", [])])
        status = pair.get("status", "")
        note = "Sesuai" if status == "VALID" else "Jumlah halaman B tidak sesuai mode"
        writer.writerow([po, hal_a, hal_b, status, note])

    writer.writerow([])

    # Tabel Daftar Masalah / Error
    writer.writerow(["DAFTAR KESALAHAN & ISU VALIDASI"])
    writer.writerow(["Jenis Masalah", "Nomor PO", "Halaman Dokumen Terkait", "Keterangan"])

    for issue in analysis_result.get("issues", []):
        tipe = issue.get("type", "")
        po = issue.get("po_number", "-")
        halaman = issue.get("page_a") or issue.get("page_b") or str(issue.get("pages_b", "-"))
        pesan = issue.get("message", "")
        writer.writerow([tipe, po, halaman, pesan])

    return output.getvalue()
