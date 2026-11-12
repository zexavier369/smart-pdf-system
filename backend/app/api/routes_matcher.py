import uuid
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Response
from pydantic import BaseModel
from app.core.config import settings
from app.core.auth import get_current_user
from app.core.session_manager import matcher_sessions
from app.core.matcher import (
    analyze_document_pages,
    match_and_validate,
    merge_matched_pdf,
    generate_matcher_csv_report
)

router = APIRouter(prefix="/api/matcher", tags=["PDF Matcher"])

class RevalidateRequest(BaseModel):
    session_id: str
    mode: str
    pages_a: List[Dict[str, Any]]
    pages_b: List[Dict[str, Any]]

class MergeRequest(BaseModel):
    session_id: str
    is_partial: bool = False
    matched_pairs: Optional[List[Dict[str, Any]]] = None

@router.post("/analyze")
async def analyze_matcher_documents(
    doc_a: UploadFile = File(...),
    doc_b: UploadFile = File(...),
    mode: str = Form("1:1"),
    current_user: dict = Depends(get_current_user)
):
    """
    Menganalisis Dokumen A dan B dengan proteksi batas ukuran & batas halaman.
    """
    if mode not in ["1:1", "1:2"]:
        raise HTTPException(status_code=400, detail="Mode tidak valid. Pilih '1:1' atau '1:2'.")

    # Baca byte file PDF ke dalam memori
    bytes_a = await doc_a.read()
    bytes_b = await doc_b.read()

    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if len(bytes_a) > max_bytes or len(bytes_b) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Ukuran berkas melebihi batas maksimal {settings.MAX_FILE_SIZE_MB} MB untuk keamanan server."
        )

    if not bytes_a or not bytes_b:
        raise HTTPException(status_code=400, detail="Salah satu atau kedua berkas PDF kosong.")

    # Analisis halaman masing-masing dokumen
    pages_a = analyze_document_pages(bytes_a, doc_a.filename or "Dokumen_A.pdf", is_doc_a=True)
    pages_b = analyze_document_pages(bytes_b, doc_b.filename or "Dokumen_B.pdf", is_doc_a=False)

    if len(pages_a) > settings.MAX_PAGES_PER_DOCUMENT or len(pages_b) > settings.MAX_PAGES_PER_DOCUMENT:
        raise HTTPException(
            status_code=400,
            detail=f"Jumlah halaman melebihi batas {settings.MAX_PAGES_PER_DOCUMENT} halaman per dokumen."
        )

    # Jalankan pencocokan dan validasi
    analysis = match_and_validate(pages_a, pages_b, mode=mode)

    # Simpan dalam session manager memori (Zero-Retention otomatis bersih)
    session_id = str(uuid.uuid4())
    matcher_sessions.set(session_id, {
        "doc_a_name": doc_a.filename or "Dokumen_A.pdf",
        "doc_b_name": doc_b.filename or "Dokumen_B.pdf",
        "doc_a_bytes": bytes_a,
        "doc_b_bytes": bytes_b,
        "pages_a": pages_a,
        "pages_b": pages_b,
        "mode": mode,
        "analysis": analysis
    })

    return {
        "session_id": session_id,
        "doc_a_name": doc_a.filename,
        "doc_b_name": doc_b.filename,
        "mode": mode,
        "pages_a": pages_a,
        "pages_b": pages_b,
        "analysis": analysis
    }

@router.post("/revalidate")
def revalidate_after_correction(
    request: RevalidateRequest,
    current_user: dict = Depends(get_current_user)
):
    session = matcher_sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesi kerja tidak ditemukan atau telah kedaluwarsa.")

    new_analysis = match_and_validate(request.pages_a, request.pages_b, mode=request.mode)

    session["pages_a"] = request.pages_a
    session["pages_b"] = request.pages_b
    session["mode"] = request.mode
    session["analysis"] = new_analysis

    return {
        "status": "success",
        "analysis": new_analysis
    }

@router.post("/merge")
def merge_and_download(
    request: MergeRequest,
    current_user: dict = Depends(get_current_user)
):
    session = matcher_sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesi kerja tidak ditemukan atau telah kedaluwarsa. Silakan upload ulang.")

    analysis = session.get("analysis", {})
    matched_pairs = request.matched_pairs or analysis.get("matched_pairs", [])

    if not request.is_partial and not analysis.get("is_fully_valid"):
        raise HTTPException(
            status_code=400,
            detail="Masih terdapat kesalahan validasi yang belum diselesaikan. Gunakan ekspor sebagian jika ingin melanjutkan."
        )

    merged_bytes = merge_matched_pdf(
        session["doc_a_bytes"],
        session["doc_b_bytes"],
        matched_pairs,
        is_partial=request.is_partial
    )

    filename = f"Merged_PO_{session.get('mode', '1-1')}{'_PARTIAL' if request.is_partial else ''}.pdf"

    return Response(
        content=merged_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.post("/report")
def download_csv_report(
    request: MergeRequest,
    current_user: dict = Depends(get_current_user)
):
    session = matcher_sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesi kerja tidak ditemukan.")

    analysis = session.get("analysis", {})
    csv_content = generate_matcher_csv_report(
        analysis,
        session.get("doc_a_name", "Dokumen_A.pdf"),
        session.get("doc_b_name", "Dokumen_B.pdf")
    )

    filename = f"Laporan_Matcher_{session.get('mode', '1-1')}.csv"

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
