import uuid
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Response
from pydantic import BaseModel
import fitz
from app.core.config import settings
from app.core.auth import get_current_user
from app.core.session_manager import renamer_sessions
from app.core.renamer import (
    analyze_renamer_page,
    validate_renamer_pages,
    generate_renamer_zip,
    split_single_page_pdf,
    generate_renamer_csv_report
)

router = APIRouter(prefix="/api/renamer", tags=["PDF Renamer"])

class RenamerRevalidateRequest(BaseModel):
    session_id: str
    pages: List[Dict[str, Any]]

class RenamerExportRequest(BaseModel):
    session_id: str
    is_partial: bool = False

@router.post("/analyze")
async def analyze_renamer_documents(
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Menganalisis berkas PDF Surat Jalan dengan proteksi batas ukuran & batas halaman.
    """
    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="Tidak ada berkas PDF yang diunggah.")

    all_pages = []
    source_files_map: Dict[str, bytes] = {}
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024

    for file in files:
        file_bytes = await file.read()
        if len(file_bytes) > max_bytes:
            raise HTTPException(
                status_code=400,
                detail=f"Berkas '{file.filename}' melebihi batas {settings.MAX_FILE_SIZE_MB} MB."
            )

        filename = file.filename or "Dokumen_SJ.pdf"
        source_files_map[filename] = file_bytes

        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            for page_idx in range(len(doc)):
                page = doc[page_idx]
                page_data = analyze_renamer_page(page, filename, page_idx + 1)
                all_pages.append(page_data)
            doc.close()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Gagal membaca berkas '{filename}': {str(e)}")

    if len(all_pages) > settings.MAX_PAGES_PER_DOCUMENT:
        raise HTTPException(
            status_code=400,
            detail=f"Total halaman yang diunggah ({len(all_pages)}) melebihi batas {settings.MAX_PAGES_PER_DOCUMENT} halaman per proses."
        )

    # Jalankan validasi awal
    validation_res = validate_renamer_pages(all_pages)

    # Simpan dalam session manager memori (Zero-Retention otomatis bersih)
    session_id = str(uuid.uuid4())
    renamer_sessions.set(session_id, {
        "source_files_map": source_files_map,
        "pages": validation_res["pages"],
        "validation": validation_res
    })

    return {
        "session_id": session_id,
        "total_files": len(files),
        "total_pages": len(all_pages),
        "validation": validation_res
    }

@router.post("/revalidate")
def revalidate_renamer_pages_endpoint(
    request: RenamerRevalidateRequest,
    current_user: dict = Depends(get_current_user)
):
    session = renamer_sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesi kerja tidak ditemukan atau telah kedaluwarsa.")

    validation_res = validate_renamer_pages(request.pages)
    session["pages"] = validation_res["pages"]
    session["validation"] = validation_res

    return {
        "status": "success",
        "validation": validation_res
    }

@router.post("/download-zip")
def download_renamer_zip(
    request: RenamerExportRequest,
    current_user: dict = Depends(get_current_user)
):
    session = renamer_sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesi kerja tidak ditemukan. Silakan upload ulang dokumen.")

    validation = session.get("validation", {})
    if not request.is_partial and not validation.get("is_fully_valid"):
        raise HTTPException(
            status_code=400,
            detail="Terdapat halaman dengan status belum valid. Selesaikan koreksi atau pilih ekspor sebagian."
        )

    zip_bytes = generate_renamer_zip(
        session["source_files_map"],
        session["pages"]
    )

    filename = f"Surat_Jalan_Separated{'_PARTIAL' if request.is_partial else ''}.zip"

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/download-single/{session_id}/{page_id}")
def download_single_renamed_pdf(
    session_id: str,
    page_id: str,
    current_user: dict = Depends(get_current_user)
):
    session = renamer_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesi kerja tidak ditemukan.")

    target_page = None
    for p in session.get("pages", []):
        if p["page_id"] == page_id:
            target_page = p
            break

    if not target_page:
        raise HTTPException(status_code=404, detail="Halaman tidak ditemukan.")

    doc_bytes = session["source_files_map"].get(target_page["source_filename"])
    if not doc_bytes:
        raise HTTPException(status_code=404, detail="Berkas sumber tidak ditemukan.")

    single_bytes = split_single_page_pdf(doc_bytes, target_page["page_number"])
    filename = target_page.get("final_filename") or f"SJ_hal_{target_page['page_number']}.pdf"

    return Response(
        content=single_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.post("/report")
def download_renamer_csv_report_endpoint(
    request: RenamerExportRequest,
    current_user: dict = Depends(get_current_user)
):
    session = renamer_sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesi kerja tidak ditemukan.")

    csv_content = generate_renamer_csv_report(session.get("validation", {}))
    filename = "Laporan_Renamer_Surat_Jalan.csv"

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
