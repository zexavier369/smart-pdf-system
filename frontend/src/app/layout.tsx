import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Multi-Mode Smart PDF Processing System",
  description: "Sistem Pemrosesan PDF Cerdas: PDF Matcher & PDF Renamer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="antialiased min-h-screen flex flex-col bg-slate-50 text-slate-800">
        <header className="bg-slate-900 text-white shadow-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-slate-950 text-xl shadow">
                PDF
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight">
                  Multi-Mode Smart PDF System
                </h1>
                <p className="text-xs text-slate-400 hidden sm:block">
                  Akurasi Tinggi • Validasi Ketat • Privasi Dokumen Terjamin
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800">
                <span className="w-2 h-2 mr-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                Sistem Aktif
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>

        <footer className="bg-white border-t border-slate-200 py-6 mt-auto text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4">
            <p>© 2026 Multi-Mode Smart PDF Processing System. Memproses dokumen secara lokal dan aman tanpa AI pihak ketiga.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
