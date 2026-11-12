"use client";

import React, { useState } from "react";
import { API_BASE_URL, fetchWithAuth } from "@/lib/api";

interface RenamerPage {
  page_id: string;
  source_filename: string;
  page_number: number;
  sj_number: string;
  day_number: number | null;
  full_date_str: string;
  date_error: string | null;
  proposed_filename: string;
  final_filename: string;
  extraction_method: string;
  thumbnail: string;
  status: "VALID" | "INVALID" | "PENDING";
  validation_errors: string[];
}

interface RenamerValidation {
  is_fully_valid: boolean;
  total_pages: number;
  valid_count: number;
  invalid_count: number;
  issue_count: number;
  issues: { type: string; message: string; page_id?: string; sj_number?: string; filename?: string }[];
  pages: RenamerPage[];
}

export default function RenamerModule() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [validation, setValidation] = useState<RenamerValidation | null>(null);
  const [pages, setPages] = useState<RenamerPage[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles(filesArray);
      setErrorMsg(null);
    }
  };

  const handleStartAnalysis = async () => {
    if (selectedFiles.length === 0) {
      setErrorMsg("Harap pilih setidaknya satu berkas PDF Surat Jalan.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setStatusText("Menganalisis setiap halaman Surat Jalan...");

    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append("files", file);
      });

      const res = await fetchWithAuth("/api/renamer/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setSessionId(data.session_id);
      setValidation(data.validation);
      setPages(data.validation.pages);
      setStatusText("");
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memproses berkas Surat Jalan.");
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (index: number, field: "sj_number" | "final_filename", value: string) => {
    const updated = [...pages];
    updated[index][field] = value;
    
    // Jika nomor SJ diubah, perbarui juga usulan nama file otomatis jika ada angka hari
    if (field === "sj_number" && updated[index].day_number !== null) {
      updated[index].final_filename = `SJ_${value.trim()}-${updated[index].day_number}.pdf`;
    }
    
    setPages(updated);
  };

  const handleRevalidate = async () => {
    if (!sessionId) return;
    setLoading(true);
    setStatusText("Menjalankan validasi ulang kalender dan duplikasi...");
    setErrorMsg(null);

    try {
      const res = await fetchWithAuth("/api/renamer/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          pages: pages,
        }),
      });

      const data = await res.json();
      setValidation(data.validation);
      setPages(data.validation.pages);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memvalidasi ulang.");
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  const handleDownloadZip = async (isPartial: boolean = false) => {
    if (!sessionId) return;
    if (!isPartial && !validation?.is_fully_valid) {
      const confirmPartial = window.confirm(
        "Masih ada halaman Surat Jalan yang belum valid. Apakah Anda ingin mengekspor SEBAGIAN (hanya halaman yang berstatus VALID) ke dalam ZIP?"
      );
      if (!confirmPartial) return;
      isPartial = true;
    }

    try {
      setLoading(true);
      setStatusText("Memisahkan halaman dan membuat file ZIP...");

      const res = await fetchWithAuth("/api/renamer/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          is_partial: isPartial,
        }),
      });

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `Surat_Jalan_Separated${isPartial ? "_PARTIAL" : ""}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengunduh arsip ZIP.");
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  const handleDownloadSingle = async (pageId: string, filename: string) => {
    if (!sessionId) return;
    try {
      setLoading(true);
      setStatusText("Mengunduh halaman PDF satuan...");

      const res = await fetchWithAuth(`/api/renamer/download-single/${sessionId}/${encodeURIComponent(pageId)}`);
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename || "Surat_Jalan.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengunduh file satuan.");
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  const handleDownloadCsv = async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      setStatusText("Menghasilkan laporan CSV...");

      const res = await fetchWithAuth("/api/renamer/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "Laporan_Renamer_Surat_Jalan.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengunduh laporan CSV.");
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Kotak Unggah Berkas */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-bold text-slate-900">
            Langkah 1: Unggah Berkas PDF Surat Jalan (Bisa Lebih dari Satu)
          </h4>
          <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2.5 py-1 rounded">
            1 Halaman = 1 File Surat Jalan
          </span>
        </div>

        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-blue-500 transition bg-slate-50">
          <p className="text-xs text-slate-500 mb-4">
            Pilih satu atau beberapa berkas PDF sekaligus. Sistem akan mengekstrak nomor SJ dan tanggal (Januari–Desember).
          </p>
          <input
            type="file"
            accept=".pdf"
            multiple
            id="upload-renamer-files"
            className="hidden"
            onChange={handleFileChange}
          />
          <label
            htmlFor="upload-renamer-files"
            className="cursor-pointer inline-flex items-center px-5 py-2.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 shadow-sm hover:bg-slate-100"
          >
            {selectedFiles.length > 0
              ? `📁 ${selectedFiles.length} Berkas PDF Dipilih`
              : "Pilih Satu atau Beberapa Berkas PDF (.pdf)"}
          </label>

          {selectedFiles.length > 0 && (
            <div className="mt-4 max-w-lg mx-auto text-left bg-white p-3 rounded border border-slate-200 max-h-32 overflow-y-auto text-xs text-slate-600 space-y-1">
              {selectedFiles.map((f, i) => (
                <div key={i} className="flex justify-between">
                  <span className="truncate pr-2">{f.name}</span>
                  <span className="text-slate-400">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="bg-red-50 border-l-4 border-red-500 p-3 text-xs text-red-700 rounded-r">
            {errorMsg}
          </div>
        )}

        <div className="pt-2 flex items-center justify-between">
          <button
            onClick={handleStartAnalysis}
            disabled={selectedFiles.length === 0 || loading}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow transition disabled:opacity-50"
          >
            {loading ? statusText || "Memproses Seluruh Halaman..." : "Mulai Analisis & Penamaan Surat Jalan"}
          </button>
        </div>
      </div>

      {/* 2. Ringkasan & Hasil Validasi */}
      {validation && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h4 className="text-lg font-bold text-slate-900">Hasil Analisis Pemisahan & Penamaan</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Format Standar: <span className="font-mono text-blue-700 font-bold">SJ_[NomorSJ]-[Tanggal].pdf</span> (Tanggal = Angka Hari)
              </p>
            </div>

            <div className="flex items-center space-x-2">
              {validation.is_fully_valid ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  ✓ Semua Halaman Valid & Siap Unduh
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  ⚠ Terdapat {validation.issue_count} Isu Validasi
                </span>
              )}
            </div>
          </div>

          {/* Kartu Metrik */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500">Total Halaman</span>
              <p className="text-xl font-bold text-slate-900 mt-1">{validation.total_pages}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500">Halaman Valid</span>
              <p className="text-xl font-bold text-emerald-600 mt-1">{validation.valid_count}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500">Perlu Perhatian</span>
              <p className="text-xl font-bold text-amber-600 mt-1">{validation.invalid_count}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500">Tabrakan / Duplikasi</span>
              <p className="text-xl font-bold text-red-600 mt-1">{validation.issue_count}</p>
            </div>
          </div>

          {/* Daftar Isu jika ada */}
          {validation.issues.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
              <h5 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                Isu Validasi & Peringatan Sistem:
              </h5>
              <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
                {validation.issues.map((issue, idx) => (
                  <li key={idx}>{issue.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 3. Tabel Koreksi Manual Surat Jalan */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h5 className="font-bold text-sm text-slate-900">
                Rincian Halaman Surat Jalan & Koreksi Manual
              </h5>
              <button
                onClick={handleRevalidate}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow transition"
              >
                🔄 Jalankan Validasi Ulang
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold">
                  <tr>
                    <th className="px-4 py-3 text-left">Sumber PDF & Hal</th>
                    <th className="px-4 py-3 text-left">Nomor SJ (Dapat Diedit)</th>
                    <th className="px-4 py-3 text-left">Tanggal Terbaca</th>
                    <th className="px-4 py-3 text-left">Nama File Final</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {pages.map((p, idx) => (
                    <tr key={p.page_id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-700">
                        <div className="font-semibold truncate max-w-xs">{p.source_filename}</div>
                        <div className="text-[10px] text-slate-400">Halaman {p.page_number}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          value={p.sj_number}
                          onChange={(e) => handleFieldChange(idx, "sj_number", e.target.value)}
                          placeholder="Nomor SJ..."
                          className="font-mono text-xs px-2.5 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 w-36"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {p.full_date_str ? (
                          <div>
                            <span className="font-medium text-slate-900">{p.full_date_str}</span>
                            <span className="ml-1 text-slate-400 text-[10px]">(Hari: {p.day_number})</span>
                          </div>
                        ) : (
                          <span className="text-red-600 italic">Tidak Terbaca</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          value={p.final_filename}
                          onChange={(e) => handleFieldChange(idx, "final_filename", e.target.value)}
                          className="font-mono text-xs px-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 w-48 text-blue-700 font-semibold"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        {p.status === "VALID" ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">
                            Valid
                          </span>
                        ) : (
                          <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded font-bold" title={p.validation_errors.join(", ")}>
                            Perlu Perhatian
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right space-x-2">
                        {p.thumbnail && (
                          <button
                            onClick={() => setPreviewImage(p.thumbnail)}
                            className="text-xs text-blue-600 hover:text-blue-800 underline font-medium"
                          >
                            Lihat Halaman
                          </button>
                        )}
                        <button
                          onClick={() => handleDownloadSingle(p.page_id, p.final_filename)}
                          className="text-xs text-slate-700 hover:text-slate-900 font-semibold bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded"
                        >
                          Unduh Satuan
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. Aksi Unduh */}
          <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={handleDownloadCsv}
              className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
            >
              📥 Unduh Laporan CSV
            </button>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => handleDownloadZip(false)}
                className={`px-5 py-2.5 rounded-lg text-white font-bold text-xs shadow transition ${
                  validation.is_fully_valid
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {validation.is_fully_valid
                  ? "📦 Unduh Seluruh Hasil (.ZIP)"
                  : "⚠ Unduh Arsip ZIP (Ekspor Sebagian)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pratinjau Dokumen Asli */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-4 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h5 className="font-bold text-sm text-slate-900">Pratinjau Surat Jalan Asli</h5>
              <button
                onClick={() => setPreviewImage(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕ Tutup
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto flex justify-center bg-slate-100 p-2 rounded">
              <img src={previewImage} alt="Halaman Surat Jalan" className="max-w-full h-auto shadow rounded" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
