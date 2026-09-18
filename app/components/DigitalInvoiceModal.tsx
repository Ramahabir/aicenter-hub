"use client";

import { useMemo, useState } from "react";

export type Bambu3DJob = {
  id: string;
  trackingCode: string;
  invoiceNumber?: string;
  fileName: string;
  fileSize: number;
  filePath?: string;
  customerName: string;
  customerPhone: string;
  customerDept: string;
  customerNotes: string;
  filamentType: string;
  color: string;
  infill: number;
  quality: string;
  supports: string;
  dimensions: { x: number; y: number; z: number };
  volumeCm3: number;
  estimatedWeightGrams: number;
  estimatedHours?: number;
  actualHours?: number;
  bambuPrintTimeHours?: number;
  estimatedPriceRp: number;
  status: "pending_review" | "approved" | "printing" | "completed" | "cancelled";
  paymentStatus?: "unpaid" | "paid" | "waived";
  paymentMethod?: string | null;
  paidAt?: string | null;
  createdAt: string;
  completedAt?: string;
};

interface DigitalInvoiceModalProps {
  job: Bambu3DJob | null;
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  adminPin?: string;
  onPaymentUpdated?: (updatedJob: Bambu3DJob) => void;
}

/**
 * Converts integer numbers to Indonesian words (Terbilang)
 */
function angkaKeKata(n: number): string {
  if (n === 0) return "Nol";
  const satuan = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];

  function sebut(x: number): string {
    if (x < 12) return satuan[x];
    if (x < 20) return `${sebut(x - 10)} Belas`;
    if (x < 100) return `${sebut(Math.floor(x / 10))} Puluh ${sebut(x % 10)}`.trim();
    if (x < 200) return `Seratus ${sebut(x - 100)}`.trim();
    if (x < 1000) return `${sebut(Math.floor(x / 100))} Ratus ${sebut(x % 100)}`.trim();
    if (x < 2000) return `Seribu ${sebut(x - 1000)}`.trim();
    if (x < 1000000) return `${sebut(Math.floor(x / 1000))} Ribu ${sebut(x % 1000)}`.trim();
    if (x < 1000000000) return `${sebut(Math.floor(x / 1000000))} Juta ${sebut(x % 1000000)}`.trim();
    return `${sebut(Math.floor(x / 1000000000))} Milyar ${sebut(x % 1000000000)}`.trim();
  }

  const result = sebut(Math.round(n));
  return `${result} Rupiah`;
}

function formatDateIndo(dateStr?: string | null): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return dateStr;
  }
}

export default function DigitalInvoiceModal({
  job,
  isOpen,
  onClose,
  isAdmin = false,
  adminPin = "",
  onPaymentUpdated,
}: DigitalInvoiceModalProps) {
  const [academicMode, setAcademicMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [updatingPayment, setUpdatingPayment] = useState(false);

  // Print Duration & Financial calculation
  const printHours = useMemo(() => {
    if (!job) return 1.0;
    if (job.status === "completed" && job.completedAt) {
      if (job.actualHours && job.actualHours > 0) return job.actualHours;
      const ms = new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime();
      return Math.max(0.2, Math.round((ms / 1000 / 3600) * 10) / 10);
    }
    return job.estimatedHours || 1.0;
  }, [job]);

  if (!isOpen || !job) return null;

  const invoiceNo = job.invoiceNumber || `INV/AIC/${new Date(job.createdAt).getFullYear()}/${String(new Date(job.createdAt).getMonth() + 1).padStart(2, "0")}/${job.trackingCode}`;

  const totalCalculatedRp = Math.round(printHours * 4000);
  const finalPrice = job.paymentStatus === "waived" ? 0 : (job.estimatedPriceRp > 0 ? job.estimatedPriceRp : totalCalculatedRp);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = async () => {
    try {
      const url = `${window.location.origin}/service-hub?invoice=${job.trackingCode}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleUpdatePayment = async (status: "unpaid" | "paid" | "waived", method?: string) => {
    setUpdatingPayment(true);
    try {
      const res = await fetch(`/service-hub/api/bambu/jobs/${job.id}/payment`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(adminPin ? { "x-service-pin": adminPin } : {}),
        },
        body: JSON.stringify({
          paymentStatus: status,
          paymentMethod: method || (status === "paid" ? "QRIS" : status === "waived" ? "Hibah Lab" : null),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.job && onPaymentUpdated) {
          onPaymentUpdated(data.job);
        }
      }
    } catch (err) {
      console.error("Failed to update payment status:", err);
    } finally {
      setUpdatingPayment(false);
    }
  };

  return (
    <div
      className="modal-backdrop digital-invoice-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="digital-invoice-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-title"
      >
        {/* Top Control Bar (Hidden when printed) */}
        <div className="invoice-control-bar no-print">
          <div className="control-left">
            <label className="academic-toggle-label" title="Format surat keterangan resmi untuk LPPM / PKM / Skripsi">
              <input
                type="checkbox"
                checked={academicMode}
                onChange={(e) => setAcademicMode(e.target.checked)}
              />
              <span className="toggle-switch" />
              <span>Format Bukti Reimbursement UB (LPPM / PKM)</span>
            </label>
          </div>

          <div className="control-right">
            <button
              type="button"
              className="action-btn secondary-btn"
              onClick={handleCopyLink}
              title="Salin tautan invoice digital"
            >
              {copied ? "✓ Tautan Disalin!" : "🔗 Salin Tautan"}
            </button>
            <button
              type="button"
              className="action-btn primary-btn"
              onClick={handlePrint}
              title="Cetak kwitansi atau simpan sebagai PDF"
            >
              🖨️ Cetak / Unduh PDF
            </button>
            <button
              type="button"
              className="close-button"
              onClick={onClose}
              aria-label="Tutup"
            >
              ×
            </button>
          </div>
        </div>

        {/* The Printable Invoice Sheet */}
        <div className="invoice-sheet" id="printable-invoice">
          {/* Header Section */}
          <header className="invoice-header">
            {academicMode ? (
              <div className="academic-header">
                <div className="academic-logos">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="46" height="46" fill="none">
                    <polygon points="15.8,14 24.8,14 10.0,42 1.0,42" fill="#ed8b00" stroke="#ed8b00" strokeWidth="1.5" strokeLinejoin="round" />
                    <polygon points="30.0,6 39.0,6 19.8,42 10.8,42" fill="#ed8b00" stroke="#ed8b00" strokeWidth="1.5" strokeLinejoin="round" />
                    <polygon points="38.5,19 47.5,19 35.3,42 26.3,42" fill="#ed8b00" stroke="#ed8b00" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="academic-titles">
                  <h4>KEMENTERIAN PENDIDIKAN TINGGI, SAINS, DAN TEKNOLOGI</h4>
                  <h3>UNIVERSITAS BRAWIJAYA</h3>
                  <h2>PUSAT KECERDASAN ARTIFISIAL (AI CENTER)</h2>
                  <p>Gedung AI Center UB, Jalan Veteran, Malang 65145 · Email: aicenter@ub.ac.id · Web: https://ai.ub.ac.id</p>
                </div>
              </div>
            ) : (
              <div className="standard-header">
                <div className="brand-badge-group">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="42" height="42" fill="none">
                    <polygon points="15.8,14 24.8,14 10.0,42 1.0,42" fill="#ed8b00" stroke="#ed8b00" strokeWidth="1.5" strokeLinejoin="round" />
                    <polygon points="30.0,6 39.0,6 19.8,42 10.8,42" fill="#ed8b00" stroke="#ed8b00" strokeWidth="1.5" strokeLinejoin="round" />
                    <polygon points="38.5,19 47.5,19 35.3,42 26.3,42" fill="#ed8b00" stroke="#ed8b00" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                  <div>
                    <div className="institution-tag">UNIVERSITAS BRAWIJAYA</div>
                    <h1 className="brand-title" id="invoice-title">AI CENTER SERVICE HUB</h1>
                    <div className="unit-tag">Laboratorium Fabrikasi Komputasi &amp; 3D Printing</div>
                  </div>
                </div>

                <div className="invoice-meta-header">
                  <div className="meta-tag">INVOICE &amp; KWITANSI RESMI</div>
                  <div className="invoice-number">{invoiceNo}</div>
                  <div className="meta-date">Diterbitkan: {formatDateIndo(job.createdAt)}</div>
                </div>
              </div>
            )}
            <div className="header-divider" />
          </header>

          {/* Document Title for Academic Mode */}
          {academicMode && (
            <div className="academic-doc-title">
              <h3>BUKTI PEMBAYARAN &amp; REKAPITULASI BIAYA FABRIKASI 3D PRINTING</h3>
              <p>Nomor Registrasi Laboratorium: <b>{invoiceNo}</b></p>
            </div>
          )}

          {/* Status and Info Banner */}
          <div className="invoice-status-banner">
            <div className="status-badge-container">
              <span className="status-label">STATUS CETAK:</span>
              {job.status === "completed" ? (
                <span className="status-pill status-paid" style={{ fontWeight: 900 }}>
                  ✓ SELESAI DICETAK (SUCCESS)
                </span>
              ) : job.status === "printing" ? (
                <span className="status-pill" style={{ background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd", fontWeight: 800 }}>
                  ⚡ SEDANG DICETAK (PRINTING)
                </span>
              ) : (
                <span className="status-pill status-pending" style={{ fontWeight: 800 }}>
                  ⏳ DALAM ANTRIAN ({job.status.toUpperCase().replace("_", " ")})
                </span>
              )}
            </div>

            <div className="status-badge-container">
              <span className="status-label">PEMBAYARAN:</span>
              {job.paymentStatus === "paid" ? (
                <span className="status-pill status-paid">
                  ✓ LUNAS ({job.paymentMethod || "QRIS"})
                </span>
              ) : job.paymentStatus === "waived" ? (
                <span className="status-pill status-waived">
                  ⭐ BEBAS BIAYA (HIBAH)
                </span>
              ) : (
                <span className="status-pill status-pending">
                  ⏳ MENUNGGU PEMBAYARAN
                </span>
              )}
            </div>

            <div className="tracking-ref-container">
              <span className="tracking-label">ORDER ID:</span>
              <span className="tracking-code-pill">{job.trackingCode}</span>
            </div>
          </div>

          {/* Customer & Job Info Section */}
          <section className="invoice-grid-section">
            <div className="info-column">
              <h3 className="section-heading">DATA PEMESAN</h3>
              <table className="info-table">
                <tbody>
                  <tr>
                    <th>Nama Pemesan</th>
                    <td>: <b>{job.customerName || "Mahasiswa / Peneliti UB"}</b></td>
                  </tr>
                  <tr>
                    <th>Unit / Fakultas</th>
                    <td>: {job.customerDept || "Universitas Brawijaya"}</td>
                  </tr>
                  <tr>
                    <th>Kontak / WA</th>
                    <td>: {job.customerPhone || "-"}</td>
                  </tr>
                  {job.customerNotes && (
                    <tr>
                      <th>Catatan Khusus</th>
                      <td>: <i>{job.customerNotes}</i></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="info-column">
              <h3 className="section-heading">SPESIFIKASI TEKNIS CETAK</h3>
              <table className="info-table">
                <tbody>
                  <tr>
                    <th>Model File</th>
                    <td>: <span className="mono-file">{job.fileName}</span></td>
                  </tr>
                  <tr>
                    <th>Filament &amp; Warna</th>
                    <td>: {job.filamentType} — {job.color}</td>
                  </tr>
                  <tr>
                    <th>Infill &amp; Resolusi</th>
                    <td>: {job.infill}% · {job.quality}</td>
                  </tr>
                  <tr>
                    <th>Dimensi Model</th>
                    <td>
                      : {job.dimensions?.x || 0} × {job.dimensions?.y || 0} × {job.dimensions?.z || 0} mm
                      {job.volumeCm3 > 0 && ` (~${job.volumeCm3.toFixed(1)} cm³)`}
                    </td>
                  </tr>
                  <tr>
                    <th>Mesin Cetak</th>
                    <td>: Bambu Lab P1S High-Speed CoreXY (AI Center)</td>
                  </tr>
                  <tr>
                    <th>Hasil Fabrikasi</th>
                    <td>
                      : {job.status === "completed" ? (
                        <span style={{ color: "#166534", fontWeight: 800 }}>
                          ✓ Sukses Selesai Dicetak (100% Complete)
                        </span>
                      ) : job.status === "printing" ? (
                        <span style={{ color: "#004f86", fontWeight: 800 }}>
                          ⚡ Sedang Diproses Mesin (In Progress)
                        </span>
                      ) : (
                        <span style={{ color: "#b45309", fontWeight: 700 }}>
                          ⏳ Antrian Workshop ({job.status.replace("_", " ")})
                        </span>
                      )}
                    </td>
                  </tr>
                  {job.status === "completed" && job.completedAt && (
                    <tr>
                      <th>Waktu Selesai</th>
                      <td>: <b style={{ color: "#166534" }}>{formatDateIndo(job.completedAt)}</b></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Itemized Calculation Table */}
          <section className="invoice-table-section">
            <h3 className="section-heading">RINCIAN BIAYA FABRIKASI</h3>
            <table className="itemized-table">
              <thead>
                <tr>
                  <th style={{ width: "45%" }}>Deskripsi Layanan</th>
                  <th style={{ width: "20%", textAlign: "center" }}>Durasi / Satuan</th>
                  <th style={{ width: "15%", textAlign: "right" }}>Tarif Lab</th>
                  <th style={{ width: "20%", textAlign: "right" }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Jasa Cetak 3D Presisi (Bambu Lab P1S)</strong>
                    <div className="sub-desc">
                      Pembuatan prototipe model 3D menggunakan nozzle 0.4mm, material {job.filamentType} {job.color}.
                      {job.status === "completed" ? " (Durasi Aktual Mesin)" : " (Estimasi Waktu Slicing)"}
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <b>{printHours.toFixed(1)} Jam</b>
                  </td>
                  <td style={{ textAlign: "right" }}>Rp 4.000 / jam</td>
                  <td style={{ textAlign: "right" }}>
                    Rp {(Math.round(printHours * 4000)).toLocaleString("id-ID")}
                  </td>
                </tr>

                <tr>
                  <td>
                    <strong>Filament &amp; Prep Penanganan Operator</strong>
                    <div className="sub-desc">
                      Infill {job.infill}%, {job.quality}, pembersihan support, dan pemeriksaan kalibrasi bed.
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {job.estimatedWeightGrams > 0 ? `~${job.estimatedWeightGrams.toFixed(0)} gram` : "1 unit"}
                  </td>
                  <td style={{ textAlign: "right" }}>Termasuk</td>
                  <td style={{ textAlign: "right" }}>Rp 0</td>
                </tr>

                {job.paymentStatus === "waived" && (
                  <tr className="discount-row">
                    <td colSpan={3} style={{ textAlign: "right" }}>
                      <strong>Pembebasan Biaya (Internal AI Center / Hibah Riset UB):</strong>
                    </td>
                    <td style={{ textAlign: "right", color: "#004f86" }}>
                      - Rp {(Math.round(printHours * 4000)).toLocaleString("id-ID")}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td colSpan={3} style={{ textAlign: "right" }}>
                    <div className="total-label">TOTAL AKHIR :</div>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="total-amount">
                      Rp {finalPrice.toLocaleString("id-ID")}
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Spelled-out Indonesian Words */}
            <div className="words-box">
              <span className="words-label">Terbilang :</span>{" "}
              <span className="words-text">{angkaKeKata(finalPrice)}</span>
            </div>
          </section>

          {/* Payment Instructions or Settlement Proof */}
          <section className="settlement-section">
            <div className="settlement-left">
              {/* Print Success Confirmation Card */}
              {job.status === "completed" ? (
                <div style={{ marginBottom: "12px", padding: "10px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "6px", fontSize: "12px", color: "#166534" }}>
                  <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px" }}>
                    <span>✅</span> <span>STATUS FABRIKASI: SELESAI DENGAN SUKSES</span>
                  </strong>
                  <p style={{ margin: "4px 0 0", color: "#15803d", fontSize: "11px", lineHeight: "1.4" }}>
                    Model telah selesai dicetak secara utuh pada Bambu Lab P1S dan telah lolos uji visual operator. Barang siap diserahkan kepada pemesan.
                  </p>
                </div>
              ) : (
                <div style={{ marginBottom: "12px", padding: "10px 14px", background: "#fffbeb", border: "1px dashed #fde68a", borderRadius: "6px", fontSize: "12px", color: "#92400e" }}>
                  <strong style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>⏳</span> <span>STATUS FABRIKASI: DALAM PROSES PENGERJAAN</span>
                  </strong>
                  <p style={{ margin: "4px 0 0", color: "#b45309", fontSize: "11px", lineHeight: "1.4" }}>
                    Dokumen ini adalah rincian pra-cetak (proforma). Bukti selesai final diverifikasi setelah mesin menyelesaikan seluruh layer.
                  </p>
                </div>
              )}

              {job.paymentStatus === "paid" ? (
                <div className="paid-box">
                  <div className="paid-stamp">
                    <div className="stamp-inner">
                      <span>LUNAS</span>
                      <small>AI CENTER UB</small>
                      <time>{job.paidAt ? formatDateIndo(job.paidAt) : formatDateIndo(job.completedAt || job.createdAt)}</time>
                    </div>
                  </div>
                  <div className="paid-details">
                    <p><b>Pembayaran Telah Diterima</b></p>
                    <p>Metode: {job.paymentMethod || "QRIS / Cash"}</p>
                    <p className="trans-id">Ref ID: {job.id.slice(0, 13)}</p>
                  </div>
                </div>
              ) : job.paymentStatus === "waived" ? (
                <div className="waived-box">
                  <p><b>Keringanan / Hibah Operasional</b></p>
                  <p>Pekerjaan ini didanai oleh program internal Riset &amp; Pengabdian AI Center Universitas Brawijaya.</p>
                </div>
              ) : (
                <div className="payment-guide-box">
                  <h4>PETUNJUK PEMBAYARAN:</h4>
                  <ol>
                    <li>Pembayaran dapat dilakukan langsung di <b>Front Desk Lab AI Center (Gedung AI Center UB Lt. 2)</b> via QRIS atau Tunai.</li>
                    <li>Tunjukkan Kode Tracking <b>{job.trackingCode}</b> atau invoice ini saat melakukan pelunasan dan pengambilan barang.</li>
                    <li>Simpan bukti invoice ini untuk kebutuhan pelaporan LPPM/PKM.</li>
                  </ol>
                </div>
              )}
            </div>

            {/* Verification / Signature Box */}
            <div className="settlement-right">
              {academicMode ? (
                <div className="signature-box">
                  <p>Malang, {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
                  <p className="signature-title">Mengetahui,<br /><b>Laboran / Operator AI Center UB</b></p>
                  <div className="signature-space" />
                  <p className="signature-name">( Tim Teknis AI Center UB )</p>
                  <p className="signature-nip">NIP/PBLUB. 2026-AIC-UB</p>
                </div>
              ) : (
                <div className="verification-qr-box">
                  <div className="qr-placeholder">
                    {/* Simulated SVG QR code representation for official verification */}
                    <svg viewBox="0 0 100 100" width="80" height="80">
                      <rect width="100" height="100" fill="#ffffff" />
                      {/* Corner 1 */}
                      <rect x="10" y="10" width="26" height="26" fill="#004f86" />
                      <rect x="15" y="15" width="16" height="16" fill="#ffffff" />
                      <rect x="18" y="18" width="10" height="10" fill="#004f86" />
                      {/* Corner 2 */}
                      <rect x="64" y="10" width="26" height="26" fill="#004f86" />
                      <rect x="69" y="15" width="16" height="16" fill="#ffffff" />
                      <rect x="72" y="18" width="10" height="10" fill="#004f86" />
                      {/* Corner 3 */}
                      <rect x="10" y="64" width="26" height="26" fill="#004f86" />
                      <rect x="15" y="69" width="16" height="16" fill="#ffffff" />
                      <rect x="18" y="72" width="10" height="10" fill="#004f86" />
                      {/* Pattern dots */}
                      <rect x="42" y="14" width="6" height="6" fill="#ed8b00" />
                      <rect x="52" y="24" width="6" height="6" fill="#004f86" />
                      <rect x="42" y="34" width="6" height="6" fill="#004f86" />
                      <rect x="22" y="44" width="6" height="6" fill="#004f86" />
                      <rect x="34" y="52" width="6" height="6" fill="#ed8b00" />
                      <rect x="44" y="44" width="12" height="12" fill="#004f86" />
                      <rect x="64" y="44" width="6" height="6" fill="#ed8b00" />
                      <rect x="76" y="54" width="6" height="6" fill="#004f86" />
                      <rect x="44" y="64" width="6" height="6" fill="#004f86" />
                      <rect x="56" y="74" width="6" height="6" fill="#004f86" />
                      <rect x="68" y="64" width="6" height="6" fill="#004f86" />
                      <rect x="78" y="78" width="8" height="8" fill="#ed8b00" />
                    </svg>
                  </div>
                  <div className="verification-text">
                    <p className="vt-title">VERIFIKASI SISTEM RESMI</p>
                    <p className="vt-sub">Pindai atau akses tautan untuk memeriksa keaslian kwitansi ini pada pangkalan data AI Center UB.</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Footer Note */}
          <footer className="invoice-footer">
            <p>Dokumen ini diterbitkan secara elektronik oleh AI Center Universitas Brawijaya Service Hub dan sah sebagai bukti transaksi internal serta reimbursement akademik.</p>
          </footer>
        </div>

        {/* Admin Operator Quick Actions (Only shown if admin is logged in) */}
        {isAdmin && (
          <div className="admin-invoice-actions no-print">
            <div className="admin-actions-title">⚙️ Operator Lab Controls:</div>
            <div className="admin-actions-buttons">
              <button
                type="button"
                className="admin-btn btn-paid-qris"
                disabled={updatingPayment}
                onClick={() => handleUpdatePayment("paid", "QRIS")}
              >
                Mark Lunas (QRIS)
              </button>
              <button
                type="button"
                className="admin-btn btn-paid-cash"
                disabled={updatingPayment}
                onClick={() => handleUpdatePayment("paid", "Cash / Kas Lab")}
              >
                Mark Lunas (Tunai)
              </button>
              <button
                type="button"
                className="admin-btn btn-waive"
                disabled={updatingPayment}
                onClick={() => handleUpdatePayment("waived", "Hibah Internal")}
              >
                Bebaskan Biaya (Hibah Lab)
              </button>
              <button
                type="button"
                className="admin-btn btn-unpaid"
                disabled={updatingPayment}
                onClick={() => handleUpdatePayment("unpaid")}
              >
                Reset ke Belum Bayar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
