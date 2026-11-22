"use client";

import React, { useState } from "react";
import { API_BASE_URL, fetchWithAuth } from "@/lib/api";
import { detectBarcodeFromImage, runOcrOnImage, extractPoFromText } from "@/lib/ocrClient";

interface PageData {
  doc_type: "A" | "B";
  filename: string;
  page_number: number;
  po_number: string;
  is_readable: boolean;
  thumbnail: string;
}

interface Issue {
  type: string;
  message: string;
  page_a?: number;
  page_b?: number;
  pages_b?: number[];
  po_number?: string;
}

interface MatchedPair {
  po_number: string;
  page_a: PageData;
  pages_b: PageData[];
  status: string;
}

interface AnalysisResult {
  mode: string;
  is_fully_valid: boolean;
  total_pages_a: number;
  total_pages_b: number;
  total_po_a: number;
  matched_count: number;
  unmatched_count: number;
  issue_count: number;
  issues: Issue[];
  matched_pairs: MatchedPair[];
}

export default function MatcherModule() {
  const [mode, setMode] = useState<"1:1" | "1:2">("1:1");
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pagesA, setPagesA] = useState<PageData[]>([]);
  const [pagesB, setPagesB] = useState<PageData[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "issues">("all");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleStartAnalysis = async () => {
    if (!fileA || !fileB) {
      setErrorMsg("Harap pilih kedua dokumen PDF (Dokumen A dan Dokumen B) terlebih dahulu.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setStatusText("Mengunggah dan menyiapkan halaman dokumen...");

    try {
      const formData = new FormData();
      formData.append("doc_a", fileA);
      formData.append("doc_b", fileB);
      formData.append("mode", mode);

      const res = await fetchWithAuth("/api/matcher/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setSessionId(data.session_id);

      let currentPagesA: PageData[] = [...data.pages_a];
      let currentPagesB: PageData[] = [...data.pages_b];
      setPagesA(currentPagesA);
      setPagesB(currentPagesB);
      setAnalysis(data.analysis);

      // Periksa apakah dokumen merupakan hasil scan (gambar) yang nomor PO-nya belum terbaca
      const needsOcrA = currentPagesA.some((p) => !p.po_number);
      const needsOcrB = currentPagesB.some((p) => !p.po_number);

      if (needsOcrA || needsOcrB) {
        setStatusText("Mendeteksi PDF scan gambar. Membaca teks otomatis di peramban (OCR)...");

        // 1. Ekstraksi Dokumen A (Goods Receipt / PO)
        for (let i = 0; i < currentPagesA.length; i++) {
          if (!currentPagesA[i].po_number && currentPagesA[i].thumbnail) {
            setStatusText(`Membaca Dokumen A Halaman ${i + 1} dari ${currentPagesA.length}...`);
            // Coba deteksi barcode terlebih dahulu
            let detectedPo = await detectBarcodeFromImage(currentPagesA[i].thumbnail);
            if (!detectedPo) {
              const text = await runOcrOnImage(currentPagesA[i].thumbnail);
              detectedPo = extractPoFromText(text, true);
            }
            if (detectedPo) {
              currentPagesA[i].po_number = detectedPo;
              currentPagesA[i].is_readable = true;
            }
          }
        }

        // 2. Ekstraksi Dokumen B (Surat Jalan - kolom No PO di tabel)
        for (let j = 0; j < currentPagesB.length; j++) {
          if (!currentPagesB[j].po_number && currentPagesB[j].thumbnail) {
            setStatusText(`Membaca Dokumen B Halaman ${j + 1} dari ${currentPagesB.length}...`);
            const text = await runOcrOnImage(currentPagesB[j].thumbnail);
            const detectedPo = extractPoFromText(text, false);
            if (detectedPo) {
              currentPagesB[j].po_number = detectedPo;
              currentPagesB[j].is_readable = true;
            }
          }
        }

        setPagesA([...currentPagesA]);
        setPagesB([...currentPagesB]);

        // 3. Validasi ulang otomatis ke backend dengan nomor PO yang baru terbaca
        setStatusText("Menyelaraskan pasangan dokumen...");
        const revalRes = await fetchWithAuth("/api/matcher/revalidate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: data.session_id,
            mode: mode,
            pages_a: currentPagesA,
            pages_b: currentPagesB,
          }),
        });
        const revalData = await revalRes.json();
        setAnalysis(revalData.analysis);
      }

      setStatusText("");
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memproses dokumen.");
    } finally {
      setLoading(false);
    }
  };

  const handleSingleOcr = async (type: "A" | "B", index: number) => {
    setLoading(true);
    setStatusText(`Memindai ulang OCR Dokumen ${type} Halaman ${index + 1}...`);
    try {
      if (type === "A") {
        const target = pagesA[index];
        if (target && target.thumbnail) {
          let po = await detectBarcodeFromImage(target.thumbnail);
          if (!po) {
            const text = await runOcrOnImage(target.thumbnail);
            po = extractPoFromText(text, true);
          }
          if (po) {
            handlePoChangeA(index, po);
          }
        }
      } else {
        const target = pagesB[index];
        if (target && target.thumbnail) {
          const text = await runOcrOnImage(target.thumbnail);
          const po = extractPoFromText(text, false);
          if (po) {
            handlePoChangeB(index, po);
          }
        }
      }
    } catch (e: any) {
      console.warn("Gagal OCR:", e);
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  const handlePoChangeA = (index: number, newPo: string) => {
    const updated = [...pagesA];
    updated[index].po_number = newPo;
    setPagesA(updated);
  };

  const handlePoChangeB = (index: number, newPo: string) => {
    const updated = [...pagesB];
    updated[index].po_number = newPo;
    setPagesB(updated);
  };

  const handleAutoPair = () => {
    if (pagesA.length === 0 || pagesB.length === 0) return;

    const newPagesB = [...pagesB];
    const poListA = pagesA.map((p) => p.po_number.trim()).filter(Boolean);

    if (poListA.length === 0) {
      alert("Nomor PO pada Dokumen A belum terisi. Harap isi nomor PO Dokumen A terlebih dahulu.");
      return;
    }

    if (mode === "1:2") {
      // 1 PO Dokumen A dipasangkan ke 2 Halaman Dokumen B berurutan
      for (let j = 0; j < newPagesB.length; j++) {
        const poIndex = Math.floor(j / 2);
        if (poIndex < poListA.length) {
          newPagesB[j].po_number = poListA[poIndex];
        }
      }
    } else {
      // Mode 1:1: 1 PO Dokumen A ke 1 Halaman Dokumen B
      for (let j = 0; j < newPagesB.length; j++) {
        if (j < poListA.length) {
          newPagesB[j].po_number = poListA[j];
        }
      }
    }

    setPagesB(newPagesB);
  };

  const handleQuickFillSample = () => {
    const updatedA = [...pagesA];
    const updatedB = [...pagesB];

    if (updatedA.length >= 2) {
      updatedA[0].po_number = "2004595909";
      updatedA[1].po_number = "2004603824";
    }
    if (updatedB.length >= 4) {
      updatedB[0].po_number = "2004595909";
      updatedB[1].po_number = "2004595909";
      updatedB[2].po_number = "2004603824";
      updatedB[3].po_number = "2004603824";
    }

    setPagesA(updatedA);
    setPagesB(updatedB);
  };

  const handleRevalidate = async () => {
    if (!sessionId) return;
    setLoading(true);
    setStatusText("Menjalankan validasi ulang...");
    setErrorMsg(null);

    try {
      const res = await fetchWithAuth("/api/matcher/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          mode: mode,
          pages_a: pagesA,
          pages_b: pagesB,
        }),
      });

      const data = await res.json();
      setAnalysis(data.analysis);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal melakukan validasi ulang.");
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  const handleDownloadZip = async (isPartial: boolean = false) => {
    if (!sessionId) return;
    if (!isPartial && !analysis?.is_fully_valid) {
      const confirmPartial = window.confirm(
        "Masih ada kesalahan atau nomor PO yang belum cocok sempurna. Apakah Anda ingin mengekspor SEBAGIAN (hanya PO yang cocok) ke dalam ZIP file terpisah per nomor PO?"
      );
      if (!confirmPartial) return;
      isPartial = true;
    }

    try {
      setLoading(true);
      setStatusText("Memisahkan PDF per nomor PO dan menyusun arsip ZIP...");

      const res = await fetchWithAuth("/api/matcher/download-zip", {
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
      const cleanMode = mode.replace(":", "-");
      link.download = `Hasil_Split_PO_${cleanMode}${isPartial ? "_PARTIAL" : ""}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengunduh arsip ZIP per nomor PO.");
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  const handleDownloadSinglePair = async (poNumber: string) => {
    if (!sessionId || !poNumber) return;
    try {
      setLoading(true);
      setStatusText(`Mengunduh berkas PDF terpisah untuk PO ${poNumber}...`);

      const res = await fetchWithAuth("/api/matcher/download-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          po_number: poNumber,
        }),
      });

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${poNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      setErrorMsg(err.message || `Gagal mengunduh berkas PDF untuk PO ${poNumber}.`);
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  const handleDownloadMerged = async (isPartial: boolean = false) => {
    if (!sessionId) return;
    if (!isPartial && !analysis?.is_fully_valid) {
      const confirmPartial = window.confirm(
        "Masih ada kesalahan atau PO yang belum cocok. Apakah Anda yakin ingin mengekspor SEBAGIAN (hanya PO yang cocok)?"
      );
      if (!confirmPartial) return;
      isPartial = true;
    }

    try {
      setLoading(true);
      setStatusText("Menggabungkan file PDF...");

      const res = await fetchWithAuth("/api/matcher/merge", {
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
      link.download = `Merged_PO_${mode}${isPartial ? "_PARTIAL" : ""}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengunduh file hasil.");
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

      const res = await fetchWithAuth("/api/matcher/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `Laporan_Matcher_${mode}.csv`;
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
      {/* 1. Pengaturan Mode */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <h4 className="text-base font-bold text-slate-900">
          Langkah 1: Pilih Mode Pencocokan
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label
            onClick={() => setMode("1:1")}
            className={`border rounded-xl p-4 flex items-start space-x-3 cursor-pointer transition ${
              mode === "1:1"
                ? "border-emerald-600 bg-emerald-50/50 shadow-sm"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <input
              type="radio"
              name="matcher-mode"
              checked={mode === "1:1"}
              onChange={() => setMode("1:1")}
              className="mt-1 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <span className="font-bold text-sm text-slate-900">Mode 1:1 (Satu ke Satu)</span>
              <p className="text-xs text-slate-500 mt-1">
                1 Halaman Dokumen A dipasangkan dengan 1 Halaman Dokumen B. Hasil: 2 Halaman per PO (Urutan: Hal A lalu Hal B).
              </p>
            </div>
          </label>

          <label
            onClick={() => setMode("1:2")}
            className={`border rounded-xl p-4 flex items-start space-x-3 cursor-pointer transition ${
              mode === "1:2"
                ? "border-emerald-600 bg-emerald-50/50 shadow-sm"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <input
              type="radio"
              name="matcher-mode"
              checked={mode === "1:2"}
              onChange={() => setMode("1:2")}
              className="mt-1 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <span className="font-bold text-sm text-slate-900">Mode 1:2 (Satu ke Dua)</span>
              <p className="text-xs text-slate-500 mt-1">
                1 Halaman Dokumen A dipasangkan dengan 2 Halaman Dokumen B. Hasil: 3 Halaman per PO (Urutan: Hal A, B1, lalu B2).
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* 2. Upload Dokumen A dan Dokumen B */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <h4 className="text-base font-bold text-slate-900">
          Langkah 2: Unggah Dokumen PDF
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Dokumen A */}
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-emerald-500 transition bg-slate-50">
            <div className="text-xs font-bold uppercase text-emerald-700 bg-emerald-100 inline-block px-2 py-0.5 rounded mb-2">
              Dokumen A (Sumber PO Utama)
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Format: 1 Halaman = 1 PO (misal: "PO 12345")
            </p>
            <input
              type="file"
              accept=".pdf"
              id="upload-doc-a"
              className="hidden"
              onChange={(e) => setFileA(e.target.files?.[0] || null)}
            />
            <label
              htmlFor="upload-doc-a"
              className="cursor-pointer inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 shadow-sm hover:bg-slate-100"
            >
              {fileA ? fileA.name : "Pilih File Dokumen A (.pdf)"}
            </label>
            {fileA && (
              <p className="text-xs text-emerald-600 mt-2 font-medium">
                ✓ Siap diproses ({(fileA.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {/* Dokumen B */}
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-emerald-500 transition bg-slate-50">
            <div className="text-xs font-bold uppercase text-blue-700 bg-blue-100 inline-block px-2 py-0.5 rounded mb-2">
              Dokumen B (Dokumen Pasangan)
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Format: 1 atau 2 Halaman per PO (misal: "12345")
            </p>
            <input
              type="file"
              accept=".pdf"
              id="upload-doc-b"
              className="hidden"
              onChange={(e) => setFileB(e.target.files?.[0] || null)}
            />
            <label
              htmlFor="upload-doc-b"
              className="cursor-pointer inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 shadow-sm hover:bg-slate-100"
            >
              {fileB ? fileB.name : "Pilih File Dokumen B (.pdf)"}
            </label>
            {fileB && (
              <p className="text-xs text-blue-600 mt-2 font-medium">
                ✓ Siap diproses ({(fileB.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border-l-4 border-red-500 p-3 text-xs text-red-700 rounded-r">
            {errorMsg}
          </div>
        )}

        <div className="pt-2 flex items-center justify-between">
          <button
            onClick={handleStartAnalysis}
            disabled={!fileA || !fileB || loading}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow transition disabled:opacity-50"
          >
            {loading ? statusText || "Memproses Dokumen..." : "Mulai Analisis & Pencocokan"}
          </button>
        </div>
      </div>

      {/* 3. Ringkasan & Hasil Validasi */}
      {analysis && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h4 className="text-lg font-bold text-slate-900">Hasil Analisis & Status Validasi</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Mode: <span className="font-semibold">{analysis.mode}</span> • Urutan bundel mengikuti Dokumen A
              </p>
            </div>

            <div className="flex items-center space-x-2">
              {analysis.is_fully_valid ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  ✓ Semua PO Lengkap & Cocok
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  ⚠ Terdapat {analysis.issue_count} Isu Validasi
                </span>
              )}
            </div>
          </div>

          {/* Kartu Metrik */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500">Total PO Dok A</span>
              <p className="text-xl font-bold text-slate-900 mt-1">{analysis.total_po_a}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500">PO Cocok Sempurna</span>
              <p className="text-xl font-bold text-emerald-600 mt-1">{analysis.matched_count}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500">PO Hilang di Dok B</span>
              <p className="text-xl font-bold text-red-600 mt-1">{analysis.unmatched_count}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500">Jumlah Isu / Error</span>
              <p className="text-xl font-bold text-amber-600 mt-1">{analysis.issue_count}</p>
            </div>
          </div>

          {/* Daftar Isu jika ada */}
          {analysis.issues.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
              <h5 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                Daftar Masalah yang Memerlukan Perhatian:
              </h5>
              <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
                {analysis.issues.map((issue, idx) => (
                  <li key={idx}>{issue.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 4. Tabel Koreksi Manual */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h5 className="font-bold text-sm text-slate-900">
                  Tabel Koreksi Manual & Pratinjau Halaman
                </h5>
                <p className="text-xs text-slate-500">
                  Ketik nomor PO langsung di kolom input di bawah, atau gunakan tombol bantuan cepat di samping:
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleQuickFillSample}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 transition"
                  title="Otomatis isi nomor PO sesuai berkas contoh Anda (2004595909 & 2004603824)"
                >
                  📋 Contoh Isi Otomatis
                </button>
                <button
                  type="button"
                  onClick={handleAutoPair}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 transition"
                  title="Salin nomor PO Dokumen A ke Dokumen B berurutan sesuai mode"
                >
                  ⚡ Pasangkan Otomatis (Mode {mode})
                </button>
                <button
                  onClick={handleRevalidate}
                  disabled={loading}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow transition"
                >
                  🔄 Jalankan Validasi Ulang
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold">
                  <tr>
                    <th className="px-4 py-3 text-left">Dokumen</th>
                    <th className="px-4 py-3 text-left">Halaman</th>
                    <th className="px-4 py-3 text-left">Nomor PO (Dapat Diedit)</th>
                    <th className="px-4 py-3 text-left">Status Pembacaan</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {/* Halaman Dokumen A */}
                  {pagesA.map((page, idx) => (
                    <tr key={`a-${idx}`} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-bold text-emerald-700">Dokumen A</td>
                      <td className="px-4 py-2.5 text-slate-600">Hal {page.page_number}</td>
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          value={page.po_number}
                          onChange={(e) => handlePoChangeA(idx, e.target.value)}
                          placeholder="Ketik nomor PO..."
                          className="font-mono text-xs px-2.5 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 w-44"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        {page.po_number ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Terbaca</span>
                        ) : (
                          <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded">Tidak Terbaca</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right space-x-3">
                        {page.thumbnail && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSingleOcr("A", idx)}
                              disabled={loading}
                              className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold transition"
                              title="Pindai ulang halaman ini dengan OCR"
                            >
                              🔍 Pindai OCR
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreviewImage(page.thumbnail)}
                              className="text-xs text-blue-600 hover:text-blue-800 underline font-medium"
                            >
                              Lihat Halaman
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}

                  {/* Halaman Dokumen B */}
                  {pagesB.map((page, idx) => (
                    <tr key={`b-${idx}`} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-bold text-blue-700">Dokumen B</td>
                      <td className="px-4 py-2.5 text-slate-600">Hal {page.page_number}</td>
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          value={page.po_number}
                          onChange={(e) => handlePoChangeB(idx, e.target.value)}
                          placeholder="Ketik nomor PO..."
                          className="font-mono text-xs px-2.5 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 w-44"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        {page.po_number ? (
                          <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded">Terbaca</span>
                        ) : (
                          <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded">Tidak Terbaca</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right space-x-3">
                        {page.thumbnail && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSingleOcr("B", idx)}
                              disabled={loading}
                              className="text-xs text-blue-600 hover:text-blue-800 font-semibold transition"
                              title="Pindai ulang halaman ini dengan OCR"
                            >
                              🔍 Pindai OCR
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreviewImage(page.thumbnail)}
                              className="text-xs text-blue-600 hover:text-blue-800 underline font-medium"
                            >
                              Lihat Halaman
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabel Berkas PDF Terpisah per Nomor PO */}
          {analysis.matched_pairs && analysis.matched_pairs.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h5 className="font-bold text-sm text-slate-900">
                    Daftar Berkas Terpisah per Nomor PO (Split Output)
                  </h5>
                  <p className="text-xs text-slate-500">
                    Setiap nomor PO akan diekspor sebagai 1 berkas PDF terpisah bernama <span className="font-mono font-bold text-emerald-700">[Nomor_PO].pdf</span>:
                  </p>
                </div>
                <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-semibold">
                  Total: {analysis.matched_pairs.length} Berkas PO
                </span>
              </div>

              <div className="overflow-x-auto border border-emerald-200 bg-emerald-50/20 rounded-lg">
                <table className="min-w-full divide-y divide-emerald-200 text-xs">
                  <thead className="bg-emerald-100/60 text-emerald-900 font-bold">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Nama Berkas Target</th>
                      <th className="px-4 py-2.5 text-left">Nomor PO</th>
                      <th className="px-4 py-2.5 text-left">Dokumen A (Goods Receipt)</th>
                      <th className="px-4 py-2.5 text-left">Dokumen B (Surat Jalan)</th>
                      <th className="px-4 py-2.5 text-left">Status</th>
                      <th className="px-4 py-2.5 text-right">Unduh Satuan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-100 bg-white">
                    {analysis.matched_pairs.map((pair, idx) => (
                      <tr key={idx} className="hover:bg-emerald-50/40">
                        <td className="px-4 py-2.5 font-mono font-bold text-emerald-800">
                          {pair.po_number}.pdf
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-slate-700">
                          {pair.po_number}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          Halaman {pair.page_a.page_number}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {pair.pages_b.map((pb) => `Halaman ${pb.page_number}`).join(", ")}
                        </td>
                        <td className="px-4 py-2.5">
                          {pair.status === "VALID" ? (
                            <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-medium">
                              ✓ Cocok (Mode {mode})
                            </span>
                          ) : (
                            <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-medium">
                              ⚠ Halaman B Tidak Sesuai
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDownloadSinglePair(pair.po_number)}
                            disabled={loading}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded bg-slate-100 hover:bg-emerald-100 text-slate-800 hover:text-emerald-900 border border-slate-300 transition"
                            title={`Unduh berkas ${pair.po_number}.pdf`}
                          >
                            ⬇️ Unduh PDF Ini
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. Aksi Unduh */}
          <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={handleDownloadCsv}
              className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
            >
              📥 Unduh Laporan CSV
            </button>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => handleDownloadMerged(false)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-sm transition"
                title="Mengunduh seluruh PO yang digabung ke dalam 1 file PDF panjang"
              >
                📄 Unduh PDF Gabungan Tunggal
              </button>

              <button
                onClick={() => handleDownloadZip(false)}
                className={`px-5 py-2.5 rounded-lg text-white font-bold text-xs shadow transition ${
                  analysis.is_fully_valid
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
                title="Mengunduh berkas ZIP berisi PDF yang sudah displit per nomor PO ([PO].pdf)"
              >
                {analysis.is_fully_valid
                  ? "📦 Unduh ZIP File Terpisah per No. PO ([PO].pdf)"
                  : "⚠ Unduh ZIP Split (Ekspor Sebagian)"}
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
              <h5 className="font-bold text-sm text-slate-900">Pratinjau Dokumen Asli</h5>
              <button
                onClick={() => setPreviewImage(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕ Tutup
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto flex justify-center bg-slate-100 p-2 rounded">
              <img src={previewImage} alt="Halaman Dokumen" className="max-w-full h-auto shadow rounded" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
