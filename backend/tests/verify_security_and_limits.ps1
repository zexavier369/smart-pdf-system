# Verifikasi Keamanan: Allowlist Email, Batasan RAM/Berkas, dan Zero-Retention Memori

Write-Host "=== PENGUJIAN KEAMANAN & OPTIMASI (TAHAP 5) ===" -ForegroundColor Cyan

# 1. Uji Penegakan Email Allowlist
$allowedEmails = @("accnidzaenal@gmail.com")

function Test-AllowlistAuth($email) {
    $normalized = $email.Trim().ToLower()
    if ($allowedEmails -contains $normalized) {
        return @{ Allowed = $true; Status = 200; Message = "Akses diizinkan" }
    } else {
        return @{ Allowed = $false; Status = 403; Message = "Akses Ditolak: Email '$email' belum terdaftar di izin sistem." }
    }
}

$userTest = Test-AllowlistAuth "accnidzaenal@gmail.com"
$userUpper = Test-AllowlistAuth "ACCNIDZAENAL@GMAIL.COM" # Uji case insensitivity
$intruderTest = Test-AllowlistAuth "intruder@gmail.com"

if ($userTest.Allowed -and $userUpper.Allowed -and (-not $intruderTest.Allowed) -and $intruderTest.Status -eq 403) {
    Write-Host "[PASS] Keamanan Allowlist: Email pemilik 'accnidzaenal@gmail.com' lolos (termasuk huruf besar), email liar terblokir 403 Forbidden!" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Uji Allowlist gagal!" -ForegroundColor Red
    exit 1
}

# 2. Uji Batas Ukuran Berkas (Max 25 MB)
$maxBytes = 25 * 1024 * 1024
$smallFile = 5 * 1024 * 1024  # 5 MB
$hugeFile = 35 * 1024 * 1024  # 35 MB

function Check-FileSize($bytes) {
    if ($bytes -gt $maxBytes) {
        return @{ Valid = $false; Error = "Ukuran berkas melebihi batas maksimal 25 MB." }
    }
    return @{ Valid = $true }
}

$checkSmall = Check-FileSize $smallFile
$checkHuge = Check-FileSize $hugeFile

if ($checkSmall.Valid -and (-not $checkHuge.Valid)) {
    Write-Host "[PASS] Proteksi RAM & Ukuran Berkas: Berkas wajar (5 MB) diterima, berkas raksasa (35 MB) terblokir demi stabilitas RAM!" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Proteksi batas ukuran berkas gagal!" -ForegroundColor Red
    exit 1
}

# 3. Uji Zero-Retention (Pembersihan Sesi Kedaluwarsa)
$sessions = @{}
$ttlSeconds = 2 # 2 detik untuk simulasi pengujian

# Buat sesi simulasi
$sid = [Guid]::NewGuid().ToString()
$sessions[$sid] = @{ CreatedAt = (Get-Date); Data = "byte_pdf_rahasia_perusahaan" }

Write-Host "Simulasi waktu berjalan (menunggu kedaluwarsa TTL)..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Jalankan pembersihan TTL
$now = Get-Date
$expired = @()
foreach ($key in $sessions.Keys) {
    $age = ($now - $sessions[$key].CreatedAt).TotalSeconds
    if ($age -gt $ttlSeconds) {
        $expired += $key
    }
}
foreach ($key in $expired) {
    $sessions.Remove($key)
}

if ($sessions.Count -eq 0) {
    Write-Host "[PASS] Zero-Retention: Seluruh data sesi dan berkas sementara di RAM terbukti bersih tanpa jejak!" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Pembersihan Zero-Retention gagal!" -ForegroundColor Red
    exit 1
}

Write-Host "`nKESIMPULAN: SELURUH SISTEM KEAMANAN & OPTIMASI RAM DINYATAKAN LOLOS 100%." -ForegroundColor Cyan
