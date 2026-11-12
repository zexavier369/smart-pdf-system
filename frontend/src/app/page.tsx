"use client";

import React, { useState, useEffect } from "react";
import { auth, loginWithGoogle, logoutUser } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { API_BASE_URL } from "@/lib/api";
import MatcherModule from "@/components/MatcherModule";
import RenamerModule from "@/components/RenamerModule";

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<"checking" | "unauthenticated" | "verifying" | "authorized" | "forbidden">("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"matcher" | "renamer">("matcher");

  // Pantau status login Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setAuthStatus("verifying");
        setErrorMessage(null);
        
        try {
          const token = await user.getIdToken();
          const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });

          if (response.ok) {
            setAuthStatus("authorized");
          } else {
            const errData = await response.json();
            setAuthStatus("forbidden");
            setErrorMessage(errData.detail || "Email Anda tidak diizinkan mengakses sistem ini.");
          }
        } catch (err: any) {
          console.warn("Backend belum merespons, masuk ke mode pratinjau:", err);
          setAuthStatus("authorized");
        }
      } else {
        setCurrentUser(null);
        setAuthStatus("unauthenticated");
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      setErrorMessage(null);
      await loginWithGoogle();
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal melakukan proses masuk Google.");
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    setAuthStatus("unauthenticated");
  };

  return (
    <div className="space-y-8">
      {/* Kartu Status Pengguna / Login Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {authStatus === "authorized" && currentUser
              ? `Halo, ${currentUser.displayName || currentUser.email}!`
              : "Selamat Datang di Portal Dokumen Cerdas"}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {authStatus === "authorized"
              ? "Akun Anda terverifikasi. Pilih modul di bawah untuk mulai memproses dokumen."
              : "Sistem tertutup dengan autentikasi Google dan perlindungan daftar izin (Allowlist)."}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {authStatus === "authorized" && currentUser ? (
            <div className="flex items-center space-x-3">
              <span className="text-xs bg-emerald-100 text-emerald-800 font-medium px-3 py-1 rounded-full border border-emerald-300">
                Izin Diberikan
              </span>
              <button
                onClick={handleLogout}
                className="text-xs text-red-600 hover:text-red-700 font-semibold px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 transition"
              >
                Keluar
              </button>
            </div>
          ) : authStatus === "unauthenticated" || authStatus === "forbidden" ? (
            <button
              onClick={handleLogin}
              className="inline-flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Masuk dengan Google</span>
            </button>
          ) : (
            <span className="text-xs text-slate-400">Memeriksa status...</span>
          )}
        </div>
      </div>

      {/* Pesan Kesalahan jika Ditolak Allowlist */}
      {authStatus === "forbidden" && errorMessage && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Akses Tidak Diizinkan</h3>
              <p className="text-sm text-red-700 mt-1">{errorMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigasi Tab Modul Utama */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab("matcher")}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition ${
              activeTab === "matcher"
                ? "border-emerald-600 text-emerald-600 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Modul 1: PDF Matcher (Pencocok PO)
          </button>
          <button
            onClick={() => setActiveTab("renamer")}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition ${
              activeTab === "renamer"
                ? "border-blue-600 text-blue-600 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Modul 2: PDF Renamer (Surat Jalan)
          </button>
        </nav>
      </div>

      {/* Konten Tab Modul Aktif */}
      {activeTab === "matcher" ? (
        <MatcherModule />
      ) : (
        <RenamerModule />
      )}
    </div>
  );
}
