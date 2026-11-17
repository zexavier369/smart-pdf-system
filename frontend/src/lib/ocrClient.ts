/**
 * Modul OCR & Barcode Sisi Klien (Browser-based OCR)
 * Membaca teks dan barcode langsung di peramban pengguna tanpa software tambahan dan biaya Rp0.
 */

// Singleton Tesseract worker agar hemat memori & cepat
let tesseractWorkerPromise: Promise<any> | null = null;

export async function getOcrWorker() {
  if (typeof window === "undefined") return null;

  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      // 1. Pastikan script Tesseract terpasang
      if (!(window as any).Tesseract) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
          s.onload = resolve;
          s.onerror = () => {
            const s2 = document.createElement("script");
            s2.src = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js";
            s2.onload = resolve;
            s2.onerror = reject;
            document.head.appendChild(s2);
          };
          document.head.appendChild(s);
        });
      }

      const Tesseract = (window as any).Tesseract;
      if (!Tesseract) {
        throw new Error("Pustaka OCR Tesseract.js belum siap. Harap muat ulang halaman.");
      }

      const worker = await Tesseract.createWorker("eng", 1, {
        workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js",
        langPath: "https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0",
      });

      return worker;
    })();
  }

  return tesseractWorkerPromise;
}

/**
 * Mencoba membaca barcode 1D / 2D menggunakan Web BarcodeDetector API bawaan peramban
 */
export async function detectBarcodeFromImage(imageSrc: string): Promise<string | null> {
  if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
    return null;
  }

  try {
    const BarcodeDetectorClass = (window as any).BarcodeDetector;
    const detector = new BarcodeDetectorClass({
      formats: ["code_128", "code_39", "ean_13", "qr_code"]
    });

    const img = new Image();
    img.src = imageSrc;
    await img.decode();

    const results = await detector.detect(img);
    if (results && results.length > 0) {
      const raw = results[0].rawValue?.trim();
      if (raw && raw.length >= 4) {
        return raw;
      }
    }
  } catch (err) {
    console.debug("Barcode detection fallback to OCR:", err);
  }

  return null;
}

/**
 * Menjalankan OCR Tesseract pada gambar base64
 */
export async function runOcrOnImage(
  imageSrc: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  try {
    const worker = await getOcrWorker();
    if (!worker) return "";

    const ret = await worker.recognize(imageSrc);
    if (onProgress) onProgress(100);
    return ret?.data?.text || "";
  } catch (err) {
    console.warn("Gagal menjalankan OCR:", err);
    return "";
  }
}

/**
 * Mengekstrak Nomor PO dari teks hasil OCR/Direct text
 */
export function extractPoFromText(text: string, isDocA: boolean): string | null {
  if (!text) return null;

  const stopwords = new Set([
    "keterangan", "ceklist", "satuan", "qty", "nama", "barang",
    "nomor", "number", "item", "page", "date", "vehicle"
  ]);

  if (isDocA) {
    // Dokumen A (Goods Receipt / Form PO)
    // 1. Pola PO Number, PO NO, PO:, PURCHASE ORDER
    const patterns = [
      /(?:PO\s*(?:NUMBER|NO\.?|\#)?|P\.O\.?\s*(?:NUMBER|NO\.?|\#)?|PURCHASE\s+ORDER\s*(?:NUMBER|NO\.?|\#)?)[\s\:\#\.\-]+([A-Za-z0-9\-]+)/i,
      /\bPO\s*([A-Za-z0-9\-]+)/i
    ];

    for (const pat of patterns) {
      const match = text.match(pat);
      if (match && match[1]) {
        const po = match[1].trim().replace(/^[\.:\-#]+|[\.:\-#]+$/g, "");
        if (!stopwords.has(po.toLowerCase()) && po.length >= 3) {
          return po;
        }
      }
    }

    // Pola angka 8-12 digit spesifik format PO (misal: 2004595909, 2004603824)
    const specificPo = text.match(/\b(200[0-9]{7})\b/);
    if (specificPo) {
      return specificPo[1];
    }

    // Fallback: Angka 6-12 digit
    const digits = text.match(/\b([0-9]{6,12})\b/);
    if (digits) {
      return digits[1];
    }
  } else {
    // Dokumen B (Surat Jalan):
    // 1. Coba cari jika ada kolom No PO
    const pat = /(?:NO\.?\s*PO\.?|PO\s*(?:NUMBER|NO\.?|\#)?|P\.O\.?\s*(?:NUMBER|NO\.?|\#)?)[\s\:\#\.\-]+([A-Za-z0-9\-]+)/i;
    const match = text.match(pat);
    if (match && match[1]) {
      const po = match[1].trim().replace(/^[\.:\-#]+|[\.:\-#]+$/g, "");
      if (!stopwords.has(po.toLowerCase()) && po.length >= 3) {
        if (!/^\d+$/.test(po) || po.length >= 5) {
          return po;
        }
      }
    }

    // 2. Pada tabel Surat Jalan, nomor PO (misal: 2004595909) berulang di setiap baris barang
    const candidates = text.match(/\b([0-9]{6,12})\b/g);
    if (candidates && candidates.length > 0) {
      // Singkirkan nomor Surat Jalan jika ada
      const sjMatch = text.match(/(?:SURAT\s*JALAN|NO\.?\s*SJ)[\s\:\#\.\-]+([0-9]+)/i);
      const sjNum = sjMatch ? sjMatch[1] : null;

      const filtered = candidates.filter((c) => c !== sjNum);
      if (filtered.length > 0) {
        // Hitung nomor yang paling sering muncul
        const counts: Record<string, number> = {};
        for (const c of filtered) {
          counts[c] = (counts[c] || 0) + 1;
        }
        let bestCandidate = filtered[0];
        let maxCount = 0;
        for (const [k, v] of Object.entries(counts)) {
          if (v > maxCount) {
            maxCount = v;
            bestCandidate = k;
          }
        }
        return bestCandidate;
      }
      return candidates[0];
    }
  }

  return null;
}

/**
 * Pemetaan nama bulan bahasa Indonesia & Inggris ke angka (1-12)
 */
const MONTH_MAP: Record<string, number> = {
  januari: 1, jan: 1, january: 1,
  februari: 2, feb: 2, february: 2,
  maret: 3, mar: 3, march: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, jun: 6, june: 6,
  juli: 7, jul: 7, july: 7,
  agustus: 8, agt: 8, agu: 8, august: 8,
  september: 9, sep: 9,
  oktober: 10, okt: 10, oct: 10, october: 10,
  november: 11, nov: 11,
  desember: 12, des: 12, dec: 12, december: 12
};

/**
 * Ekstraksi Nomor Surat Jalan dan Tanggal dari teks halaman Surat Jalan
 */
export function extractSjDataFromText(text: string): {
  sjNumber: string | null;
  dayNumber: number | null;
  fullDateStr: string | null;
} {
  if (!text) {
    return { sjNumber: null, dayNumber: null, fullDateStr: null };
  }

  // 1. Nomor Surat Jalan
  let sjNumber: string | null = null;
  const sjPatterns = [
    /(?:SURAT\s+JALAN|NO\.?\s*SURAT\s+JALAN|NO\.?\s*SJ|SJ\s*NO)[\s\:\#\.\-]+([A-Za-z0-9\/\.\-_]+)/i,
    /(?:NO\.?\s*DOKUMEN|NO\.?\s*PENGIRIMAN)[\s\:\#\.\-]+([A-Za-z0-9\/\.\-_]+)/i
  ];

  for (const pat of sjPatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const cand = match[1].trim().replace(/^[\.:\-#]+|[\.:\-#]+$/g, "");
      if (cand.length >= 4) {
        sjNumber = cand;
        break;
      }
    }
  }

  // 2. Tanggal (Format: 03 Nov 2026 atau 03 November 2026)
  let dayNumber: number | null = null;
  let fullDateStr: string | null = null;

  const dateMatchIndo = text.match(/\b([0-9]{1,2})\s+([A-Za-z]+)\s+([0-9]{4})\b/);
  if (dateMatchIndo) {
    const day = parseInt(dateMatchIndo[1], 10);
    const monthStr = dateMatchIndo[2].toLowerCase();
    const year = parseInt(dateMatchIndo[3], 10);

    const monthInt = MONTH_MAP[monthStr];
    if (monthInt && day >= 1 && day <= 31) {
      // Validasi kalender
      const dateObj = new Date(year, monthInt - 1, day);
      if (dateObj.getMonth() === monthInt - 1 && dateObj.getDate() === day) {
        dayNumber = day;
        fullDateStr = `${day} ${dateMatchIndo[2]} ${year}`;
      }
    }
  }

  // Fallback: DD/MM/YYYY atau DD-MM-YYYY
  if (dayNumber === null) {
    const dateMatchNum = text.match(/\b([0-9]{1,2})[\/\-]([0-9]{1,2})[\/\-]([0-9]{4})\b/);
    if (dateMatchNum) {
      const day = parseInt(dateMatchNum[1], 10);
      const month = parseInt(dateMatchNum[2], 10);
      const year = parseInt(dateMatchNum[3], 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        dayNumber = day;
        fullDateStr = `${day}/${month}/${year}`;
      }
    }
  }

  return { sjNumber, dayNumber, fullDateStr };
}
