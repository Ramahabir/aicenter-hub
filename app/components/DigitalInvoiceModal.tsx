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

function formatDateShortIndo(dateStr?: string | null): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
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
  const isCompleted = job.status === "completed";

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
      className="modal-backdrop formal-doc-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="formal-doc-viewport"
        role="dialog"
        aria-modal="true"
        aria-labelledby="formal-doc-title"
      >
        {/* PDF Reader / Document Top Toolbar */}
        <div className="formal-toolbar no-print">
          <div className="toolbar-meta">
            <span className="doc-icon">📄</span>
            <div className="doc-title-group">
              <span className="doc-filename">Kwitansi-3D-{job.trackingCode}.pdf</span>
              <span className="doc-pages-badge">Halaman 1 dari 1 · Format Resmi UB</span>
            </div>
          </div>

          <div className="toolbar-controls">
            <label className="formal-mode-checkbox" title="Tampilkan format resmi LPPM/PKM">
              <input
                type="checkbox"
                checked={academicMode}
                onChange={(e) => setAcademicMode(e.target.checked)}
              />
              <span>Format LPPM / PKM</span>
            </label>

            <button
              type="button"
              className="formal-btn btn-secondary"
              onClick={handleCopyLink}
              title="Salin tautan invoice digital"
            >
              {copied ? "✓ Tautan Disalin" : "🔗 Salin Tautan"}
            </button>

            <button
              type="button"
              className="formal-btn btn-primary"
              onClick={handlePrint}
              title="Cetak kwitansi atau simpan sebagai dokumen PDF A4"
            >
              🖨️ Cetak / Unduh PDF (A4)
            </button>

            <button
              type="button"
              className="formal-close-btn"
              onClick={onClose}
              aria-label="Tutup Pratinjau Dokumen"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Paper Container simulating Microsoft Word / Adobe Acrobat Page */}
        <div className="formal-paper-wrapper">
          <div className="formal-a4-page" id="printable-invoice">
            {/* Kop Surat Resmi Universitas Brawijaya */}
            <header className="formal-kop">
              <div className="kop-layout">
                {/* Official University Emblem Vector */}
                <div className="kop-logo-box">
                  <svg viewBox="0 0 100 100" width="76" height="76" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="46" stroke="#002b49" strokeWidth="3" fill="#ffffff" />
                    <circle cx="50" cy="50" r="41" stroke="#ed8b00" strokeWidth="1.5" />
                    <path
                      d="M26 30 C26 25, 50 20, 50 20 C50 20, 74 25, 74 30 C74 54, 58 72, 50 78 C42 72, 26 54, 26 30 Z"
                      fill="#002b49"
                    />
                    <path
                      d="M32 34 C32 30, 50 26, 50 26 C50 26, 68 30, 68 34 C68 52, 56 66, 50 71 C44 66, 32 52, 32 34 Z"
                      fill="#ed8b00"
                    />
                    <path
                      d="M50 33 L54 44 L64 40 L57 49 L66 56 L54 55 L50 67 L46 55 L34 56 L43 49 L36 40 L46 44 Z"
                      fill="#ffffff"
                    />
                    <circle cx="50" cy="46" r="3.5" fill="#002b49" />
                  </svg>
                </div>

                {/* Kop Text */}
                <div className="kop-text">
                  <h4 className="kop-line-kementerian">KEMENTERIAN PENDIDIKAN TINGGI, SAINS, DAN TEKNOLOGI</h4>
                  <h2 className="kop-line-univ">UNIVERSITAS BRAWIJAYA</h2>
                  <h3 className="kop-line-unit">PUSAT KECERDASAN ARTIFISIAL (AI CENTER)</h3>
                  <p className="kop-line-address">
                    Gedung AI Center UB, Jalan Veteran, Kota Malang 65145, Jawa Timur, Indonesia
                  </p>
                  <p className="kop-line-contact">
                    Laman: <u>https://ai.ub.ac.id</u> · Surel: <u>aicenter@ub.ac.id</u> · Telepon: (0341) 551611
                  </p>
                </div>
              </div>

              {/* Official Double Rule / Garis Ganda Kop Surat */}
              <div className="kop-double-rule">
                <div className="kop-rule-thick" />
                <div className="kop-rule-thin" />
              </div>
            </header>

            {/* Document Title & Reference Block */}
            <section className="formal-doc-header">
              <h1 className="formal-doc-title" id="formal-doc-title">
                {academicMode ? "BUKTI PEMBAYARAN & REKAPITULASI BIAYA FABRIKASI" : "KUITANSI PEMBAYARAN & BUKTI PENCETAKAN 3D"}
              </h1>
              <div className="formal-doc-number">
                <span>Nomor : <b>{invoiceNo}</b></span>
                <span className="formal-doc-date">Tanggal : {formatDateShortIndo(job.createdAt)}</span>
              </div>
            </section>

            {/* Telah Diterima Dari (Classic Formal Indonesian Kuitansi Layout) */}
            <section className="formal-received-section">
              <table className="formal-meta-table">
                <tbody>
                  <tr>
                    <td className="meta-label">Sudah Terima Dari</td>
                    <td className="meta-colon">:</td>
                    <td className="meta-value">
                      <b>{job.customerName || "Mahasiswa / Peneliti Universitas Brawijaya"}</b>
                    </td>
                  </tr>
                  <tr>
                    <td className="meta-label">Fakultas / Unit / Instansi</td>
                    <td className="meta-colon">:</td>
                    <td className="meta-value">{job.customerDept || "Universitas Brawijaya"}</td>
                  </tr>
                  <tr>
                    <td className="meta-label">Nomor Kontak / WhatsApp</td>
                    <td className="meta-colon">:</td>
                    <td className="meta-value">{job.customerPhone || "-"}</td>
                  </tr>
                  <tr>
                    <td className="meta-label">Kode Pelacakan (Order ID)</td>
                    <td className="meta-colon">:</td>
                    <td className="meta-value">
                      <code className="formal-order-id">{job.trackingCode}</code>
                    </td>
                  </tr>
                  <tr>
                    <td className="meta-label">Uang Sejumlah</td>
                    <td className="meta-colon">:</td>
                    <td className="meta-value">
                      <b className="meta-amount">Rp {finalPrice.toLocaleString("id-ID")},-</b>
                    </td>
                  </tr>
                  <tr>
                    <td className="meta-label">Terbilang</td>
                    <td className="meta-colon">:</td>
                    <td className="meta-value">
                      <div className="formal-terbilang-box">
                        # {angkaKeKata(finalPrice).toUpperCase()} #
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="meta-label">Untuk Pembayaran</td>
                    <td className="meta-colon">:</td>
                    <td className="meta-value">
                      Jasa Pencetakan Prototipe 3D Presisi pada Laboratorium Fabrikasi AI Center UB
                      menggunakan mesin Bambu Lab P1S High-Speed CoreXY.
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* Word / Formal Table: Itemized Cost Breakdown */}
            <section className="formal-table-section">
              <div className="formal-section-caption">I. RINCIAN BIAYA PENGGUNAAN PERALATAN &amp; MATERIAL</div>
              <table className="formal-word-table">
                <thead>
                  <tr>
                    <th style={{ width: "5%" }}>No.</th>
                    <th style={{ width: "50%" }}>Uraian Layanan &amp; Spesifikasi Teknis</th>
                    <th style={{ width: "15%" }}>Volume / Waktu</th>
                    <th style={{ width: "15%" }}>Tarif Satuan</th>
                    <th style={{ width: "15%" }}>Jumlah (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ textAlign: "center" }}>1</td>
                    <td>
                      <div className="item-title">Jasa Pengoperasian Mesin Bambu Lab P1S</div>
                      <div className="item-details">
                        • Berkas Model: <i>{job.fileName}</i><br />
                        • Material Filament: {job.filamentType} ({job.color})<br />
                        • Pengaturan: Infill {job.infill}% · Layer {job.quality}<br />
                        • Dimensi: {job.dimensions?.x || 0} × {job.dimensions?.y || 0} × {job.dimensions?.z || 0} mm
                        {job.volumeCm3 > 0 ? ` (~${job.volumeCm3.toFixed(1)} cm³)` : ""}
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <b>{printHours.toFixed(1)} Jam</b>
                      <div className="sub-unit">
                        {isCompleted ? "(Durasi Aktual)" : "(Estimasi Slicing)"}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>Rp 4.000 / jam</td>
                    <td style={{ textAlign: "right" }}>
                      Rp {(Math.round(printHours * 4000)).toLocaleString("id-ID")}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: "center" }}>2</td>
                    <td>
                      <div className="item-title">Penyiapan Material &amp; Penanganan Operator Lab</div>
                      <div className="item-details">
                        Slicing CAD, kalibrasi build plate, penanganan tree support, dan inspeksi hasil akhir.
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {job.estimatedWeightGrams > 0 ? `~${job.estimatedWeightGrams.toFixed(0)} gr` : "1 unit"}
                    </td>
                    <td style={{ textAlign: "right" }}>Termasuk</td>
                    <td style={{ textAlign: "right" }}>Rp 0</td>
                  </tr>

                  {job.paymentStatus === "waived" && (
                    <tr className="waived-discount-row">
                      <td colSpan={4} style={{ textAlign: "right" }}>
                        <b>Pembebasan Tarif (Hibah Internal / Riset Kolaboratif AI Center UB) :</b>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        - Rp {(Math.round(printHours * 4000)).toLocaleString("id-ID")}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="formal-total-row">
                    <td colSpan={4} style={{ textAlign: "right" }}>
                      <b>TOTAL AKHIR PEMBAYARAN :</b>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <b className="formal-total-figure">Rp {finalPrice.toLocaleString("id-ID")}</b>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>

            {/* Section II: Keterangan Hasil Pencetakan (The Print Completion Proof) */}
            <section className="formal-cert-section">
              <div className="formal-section-caption">II. SURAT KETERANGAN &amp; STATUS FABRIKASI CETAK 3D</div>
              <div className={`formal-cert-box ${isCompleted ? "cert-success" : "cert-pending"}`}>
                <div className="cert-header-row">
                  <div className="cert-status-title">
                    {isCompleted ? (
                      <span className="cert-status-badge success-badge">
                        ✓ STATUS : SELESAI DICETAK SECARA UTUH (SUCCESS COMPLETE)
                      </span>
                    ) : job.status === "printing" ? (
                      <span className="cert-status-badge printing-badge">
                        ⚡ STATUS : SEDANG DALAM PROSES PENGERJAAN MESIN (PRINTING)
                      </span>
                    ) : (
                      <span className="cert-status-badge pending-badge">
                        ⏳ STATUS : DALAM ANTRIAN WORKSHOP ({job.status.toUpperCase().replace("_", " ")})
                      </span>
                    )}
                  </div>
                  <div className="cert-machine-tag">
                    Bambu Lab P1S · AI Center Workshop
                  </div>
                </div>

                <div className="cert-body-table">
                  <div className="cert-row">
                    <span className="cert-cell-label">Pernyataan Operator</span>
                    <span className="cert-cell-content">
                      {isCompleted ? (
                        <span>
                          Model 3D berkas <b>{job.fileName}</b> telah <b>selesai dicetak 100% tanpa kendala</b> pada mesin Bambu Lab P1S.
                          Hasil cetak telah melalui pemeriksaan fisik teknis dan telah memenuhi standar toleransi cetak laboratorium.
                        </span>
                      ) : (
                        <span>
                          Pekerjaan saat ini berada dalam tahapan pengerjaan workshop. Dokumen ini merupakan bukti pendaftaran awal (proforma).
                          Hasil selesai final diverifikasi setelah mesin menuntaskan layer 100%.
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="cert-row">
                    <span className="cert-cell-label">Waktu Selesai</span>
                    <span className="cert-cell-content">
                      {job.completedAt ? (
                        <b>{formatDateIndo(job.completedAt)}</b>
                      ) : (
                        <i>Menunggu penyelesaian mesin</i>
                      )}
                    </span>
                  </div>
                  <div className="cert-row">
                    <span className="cert-cell-label">Durasi Kerja Mesin</span>
                    <span className="cert-cell-content">
                      <b>{printHours.toFixed(1)} Jam Kerja</b>
                    </span>
                  </div>
                  <div className="cert-row">
                    <span className="cert-cell-label">Status Transaksi</span>
                    <span className="cert-cell-content">
                      {job.paymentStatus === "paid" ? (
                        <b style={{ color: "#065f46" }}>
                          LUNAS ({job.paymentMethod || "QRIS / Kas Lab"} — {formatDateIndo(job.paidAt || job.completedAt || job.createdAt)})
                        </b>
                      ) : job.paymentStatus === "waived" ? (
                        <b style={{ color: "#0369a1" }}>DIBEBASKAN DARI BIAYA (HIBAH RISET LAB)</b>
                      ) : (
                        <span style={{ color: "#9a3412" }}>
                          <b>MENUNGGU PELUNASAN</b> (Dapat dibayarkan saat serah terima barang di Gedung AI Center Lt. 2)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Official Closing & Signature Block (Word / Indonesian Document Standard) */}
            <section className="formal-signature-section">
              <div className="signature-columns">
                {/* Left Side: Pemesan / Penerima */}
                <div className="sig-column sig-left">
                  <p className="sig-place-date">&nbsp;</p>
                  <p className="sig-role">Penerima / Pemesan,</p>
                  <div className="sig-space" />
                  <p className="sig-name">
                    ( <u>{job.customerName || "................................................"}</u> )
                  </p>
                  <p className="sig-id">Unit: {job.customerDept || "Universitas Brawijaya"}</p>
                </div>

                {/* Middle: Official Rubber Stamp (Stempel Cap Basah LUNAS) */}
                <div className="sig-column sig-center">
                  {job.paymentStatus === "paid" ? (
                    <div className="rubber-stamp paid-stamp">
                      <div className="stamp-border-outer">
                        <div className="stamp-border-inner">
                          <div className="stamp-org">UNIVERSITAS BRAWIJAYA</div>
                          <div className="stamp-main">★ L U N A S ★</div>
                          <div className="stamp-unit">PUSAT KECERDASAN ARTIFISIAL</div>
                          <div className="stamp-date">
                            {formatDateShortIndo(job.paidAt || job.completedAt || job.createdAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : job.paymentStatus === "waived" ? (
                    <div className="rubber-stamp waived-stamp">
                      <div className="stamp-border-outer">
                        <div className="stamp-border-inner">
                          <div className="stamp-org">UNIVERSITAS BRAWIJAYA</div>
                          <div className="stamp-main">HIBAH LAB</div>
                          <div className="stamp-unit">AI CENTER RESEARCH</div>
                          <div className="stamp-date">{formatDateShortIndo(job.createdAt)}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rubber-stamp pending-stamp">
                      <div className="stamp-border-outer">
                        <div className="stamp-border-inner">
                          <div className="stamp-org">AI CENTER UB</div>
                          <div className="stamp-main">PENDING</div>
                          <div className="stamp-unit">BAYAR DI FRONT DESK</div>
                          <div className="stamp-date">{job.trackingCode}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="formal-qr-block">
                    <svg viewBox="0 0 100 100" width="62" height="62">
                      <rect width="100" height="100" fill="#ffffff" />
                      {/* Corner 1 */}
                      <rect x="8" y="8" width="26" height="26" fill="#002b49" />
                      <rect x="13" y="13" width="16" height="16" fill="#ffffff" />
                      <rect x="16" y="16" width="10" height="10" fill="#002b49" />
                      {/* Corner 2 */}
                      <rect x="66" y="8" width="26" height="26" fill="#002b49" />
                      <rect x="71" y="13" width="16" height="16" fill="#ffffff" />
                      <rect x="74" y="16" width="10" height="10" fill="#002b49" />
                      {/* Corner 3 */}
                      <rect x="8" y="66" width="26" height="26" fill="#002b49" />
                      <rect x="13" y="71" width="16" height="16" fill="#ffffff" />
                      <rect x="16" y="74" width="10" height="10" fill="#002b49" />
                      {/* Data dots */}
                      <rect x="42" y="12" width="6" height="6" fill="#ed8b00" />
                      <rect x="52" y="22" width="6" height="6" fill="#002b49" />
                      <rect x="42" y="32" width="6" height="6" fill="#002b49" />
                      <rect x="22" y="44" width="6" height="6" fill="#002b49" />
                      <rect x="36" y="52" width="6" height="6" fill="#ed8b00" />
                      <rect x="46" y="44" width="12" height="12" fill="#002b49" />
                      <rect x="66" y="44" width="6" height="6" fill="#ed8b00" />
                      <rect x="76" y="54" width="6" height="6" fill="#002b49" />
                      <rect x="44" y="66" width="6" height="6" fill="#002b49" />
                      <rect x="56" y="76" width="6" height="6" fill="#002b49" />
                      <rect x="68" y="66" width="6" height="6" fill="#002b49" />
                      <rect x="78" y="78" width="8" height="8" fill="#ed8b00" />
                    </svg>
                    <span className="qr-caption">Pindai Verifikasi Keaslian</span>
                  </div>
                </div>

                {/* Right Side: Laboran / AI Center UB */}
                <div className="sig-column sig-right">
                  <p className="sig-place-date">
                    Malang, {formatDateShortIndo(job.completedAt || job.createdAt)}
                  </p>
                  <p className="sig-role">
                    Pengelola / Teknisi Laboratorium,<br />
                    <b>Pusat Kecerdasan Artifisial UB</b>
                  </p>
                  <div className="sig-space">
                    <svg viewBox="0 0 160 50" width="130" height="42" style={{ opacity: 0.85 }}>
                      <path
                        d="M10 38 Q 30 10, 50 25 T 90 20 T 130 35 Q 145 15, 150 40"
                        stroke="#002b49"
                        strokeWidth="2.2"
                        fill="none"
                        strokeLinecap="round"
                      />
                      <path
                        d="M35 22 Q 55 42, 85 15"
                        stroke="#002b49"
                        strokeWidth="1.8"
                        fill="none"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <p className="sig-name">
                    ( <u>Tim Teknis Fabrikasi AI Center</u> )
                  </p>
                  <p className="sig-id">NIP/PBLUB. 2026-AIC-UB</p>
                </div>
              </div>
            </section>

            {/* Official Document Footer */}
            <footer className="formal-doc-footer">
              <div className="footer-rule" />
              <div className="footer-content">
                <span>Dokumen ini diterbitkan secara sah oleh Sistem Layanan AI Center Universitas Brawijaya.</span>
                <span>Halaman 1 / 1</span>
              </div>
            </footer>
          </div>
        </div>

        {/* Admin Quick Action Footer (Only visible when logged in as admin) */}
        {isAdmin && (
          <div className="admin-formal-actions no-print">
            <span className="admin-actions-title">⚙️ Operator Lab Controls:</span>
            <div className="admin-btn-group">
              <button
                type="button"
                className="admin-pill-btn btn-mark-qris"
                disabled={updatingPayment}
                onClick={() => handleUpdatePayment("paid", "QRIS")}
              >
                Tandai Lunas (QRIS)
              </button>
              <button
                type="button"
                className="admin-pill-btn btn-mark-cash"
                disabled={updatingPayment}
                onClick={() => handleUpdatePayment("paid", "Kas Lab / Tunai")}
              >
                Tandai Lunas (Tunai)
              </button>
              <button
                type="button"
                className="admin-pill-btn btn-mark-waived"
                disabled={updatingPayment}
                onClick={() => handleUpdatePayment("waived", "Hibah Internal")}
              >
                Bebaskan Biaya (Hibah Lab)
              </button>
              <button
                type="button"
                className="admin-pill-btn btn-mark-unpaid"
                disabled={updatingPayment}
                onClick={() => handleUpdatePayment("unpaid")}
              >
                Reset Belum Bayar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
