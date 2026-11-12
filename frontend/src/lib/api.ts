import { auth } from "./firebase";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://zexavier-smart-pdf-backend.hf.space";

/**
 * Melakukan panggilan API terautentikasi ke backend FastAPI di cloud.
 * Menyertakan Firebase ID Token pengguna yang aktif di header Authorization.
 */
export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const user = auth.currentUser;
  const headers = new Headers(options.headers || {});

  if (user) {
    try {
      const token = await user.getIdToken();
      headers.set("Authorization", `Bearer ${token}`);
    } catch (err) {
      console.warn("Gagal mendapatkan token Firebase:", err);
    }
  }

  const url = `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = "Terjadi kesalahan pada server.";
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errorDetail;
    } catch (_) {}
    throw new Error(errorDetail);
  }

  return response;
}
