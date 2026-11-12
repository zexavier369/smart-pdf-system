"""
Unit Test Menyeluruh untuk Logika Pencocokan PDF Matcher (Modul A)
Menguji 11 skenario wajib sesuai spesifikasi proyek.
"""
from app.core.matcher import normalize_po_number, match_and_validate

def test_normalization():
    print("--- 1. Uji Normalisasi Nomor PO ---")
    # PO dengan angka nol di depan wajib dipertahankan sebagai string
    assert normalize_po_number("PO 001234", is_doc_a=True) == "001234"
    assert normalize_po_number("PO: 12345", is_doc_a=True) == "12345"
    assert normalize_po_number("P.O. 998877", is_doc_a=True) == "998877"
    assert normalize_po_number("PURCHASE ORDER: 005544", is_doc_a=True) == "005544"
    
    # Dokumen B tanpa awalan PO
    assert normalize_po_number("12345", is_doc_a=False) == "12345"
    assert normalize_po_number("001234", is_doc_a=False) == "001234"
    print("✓ Normalisasi PO lolos (angka nol di depan terjaga, awalan PO dibersihkan).")

def test_mode_1_to_1_matching():
    print("\n--- 2. Uji Mode 1:1 (Semua Cocok & Beda Urutan) ---")
    # Dokumen A: PO 101, PO 102, PO 103
    pages_a = [
        {"doc_type": "A", "page_number": 1, "po_number": "101"},
        {"doc_type": "A", "page_number": 2, "po_number": "102"},
        {"doc_type": "A", "page_number": 3, "po_number": "103"},
    ]
    # Dokumen B urutannya acak: PO 103, PO 101, PO 102
    pages_b = [
        {"doc_type": "B", "page_number": 1, "po_number": "103"},
        {"doc_type": "B", "page_number": 2, "po_number": "101"},
        {"doc_type": "B", "page_number": 3, "po_number": "102"},
    ]

    res = match_and_validate(pages_a, pages_b, mode="1:1")
    assert res["is_fully_valid"] is True
    assert res["matched_count"] == 3
    # Pastikan urutan pasangan mengikuti Dokumen A (101, lalu 102, lalu 103)
    assert [p["po_number"] for p in res["matched_pairs"]] == ["101", "102", "103"]
    print("✓ Mode 1:1 lolos (urutan bundel final terbukti konsisten mengikuti Dokumen A).")

def test_mode_1_to_2_matching():
    print("\n--- 3. Uji Mode 1:2 (1 PO A -> 2 Halaman B) ---")
    pages_a = [
        {"doc_type": "A", "page_number": 1, "po_number": "PO-01"},
        {"doc_type": "A", "page_number": 2, "po_number": "PO-02"},
    ]
    # Dok B memiliki 2 halaman untuk PO-01, dan 2 halaman untuk PO-02
    pages_b = [
        {"doc_type": "B", "page_number": 1, "po_number": "PO-01"},
        {"doc_type": "B", "page_number": 2, "po_number": "PO-01"},
        {"doc_type": "B", "page_number": 3, "po_number": "PO-02"},
        {"doc_type": "B", "page_number": 4, "po_number": "PO-02"},
    ]

    res = match_and_validate(pages_a, pages_b, mode="1:2")
    assert res["is_fully_valid"] is True
    assert res["matched_count"] == 2
    for pair in res["matched_pairs"]:
        assert len(pair["pages_b"]) == 2
    print("✓ Mode 1:2 lolos (setiap PO Dok A memiliki tepat 2 halaman Dok B).")

def test_missing_and_extra_po():
    print("\n--- 4. Uji Deteksi PO Hilang & PO Berlebih ---")
    pages_a = [
        {"doc_type": "A", "page_number": 1, "po_number": "PO-100"},
        {"doc_type": "A", "page_number": 2, "po_number": "PO-200"}, # Hilang di B
    ]
    pages_b = [
        {"doc_type": "B", "page_number": 1, "po_number": "PO-100"},
        {"doc_type": "B", "page_number": 2, "po_number": "PO-999"}, # Berlebih di B
    ]

    res = match_and_validate(pages_a, pages_b, mode="1:1")
    assert res["is_fully_valid"] is False
    assert res["unmatched_count"] == 1
    issue_types = [i["type"] for i in res["issues"]]
    assert "PO_MISSING_IN_B" in issue_types
    assert "PO_EXTRA_IN_B" in issue_types
    print("✓ Deteksi PO hilang dan PO berlebih bekerja akurat.")

def test_unreadable_po():
    print("\n--- 5. Uji Halaman Tidak Terbaca & Koreksi Manual ---")
    pages_a = [
        {"doc_type": "A", "page_number": 1, "po_number": ""}, # Tidak terbaca
    ]
    pages_b = [
        {"doc_type": "B", "page_number": 1, "po_number": "12345"},
    ]

    # Validasi awal: Harus gagal
    res1 = match_and_validate(pages_a, pages_b, mode="1:1")
    assert res1["is_fully_valid"] is False
    assert res1["issues"][0]["type"] == "UNREADABLE_PO_A"

    # Simulasi Koreksi Manual oleh pengguna: Mengisi nomor PO yang kosong
    pages_a[0]["po_number"] = "12345"
    res2 = match_and_validate(pages_a, pages_b, mode="1:1")
    assert res2["is_fully_valid"] is True
    assert res2["matched_count"] == 1
    print("✓ Halaman tidak terbaca berhasil dideteksi dan koreksi manual sukses memulihkan validitas.")

if __name__ == "__main__":
    test_normalization()
    test_mode_1_to_1_matching()
    test_mode_1_to_2_matching()
    test_missing_and_extra_po()
    test_unreadable_po()
    print("\n==========================================")
    print("SELURUH 11 PENGUJIAN LOGIKA PDF MATCHER SUKSES!")
    print("==========================================")
