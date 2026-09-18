"use client";

import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeSTL, STLAnalysisResult } from "./lib/stl-analyzer";
import ModelViewer3D from "./components/ModelViewer3D";

type HubStatus = { online: boolean; printer: string | null; availablePrinters: number; message?: string };
type PrintJob = { id: string; fileName: string; status: "queued" | "printing" | "completed" | "failed"; createdAt: string; copies: number; error?: string };

type FilamentTray = {
  id: string;
  type: string;
  color: string;
  colorName?: string;
  remain?: number;
  source: string;
};

type BambuTelemetry = {
  connected: boolean;
  model: string;
  gcodeState: string;
  progressPercent: number;
  remainingMinutes: number;
  currentLayer: number;
  totalLayers: number;
  nozzleTemp: number;
  nozzleTargetTemp: number;
  bedTemp: number;
  bedTargetTemp: number;
  subtaskName?: string;
  activeTray?: FilamentTray | null;
  amsTrays?: FilamentTray[];
  cameraUrl?: string;
  isConfigured: boolean;
};

type Bambu3DJob = {
  id: string;
  trackingCode: string;
  fileName: string;
  fileSize: number;
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
  estimatedPriceRp: number;
  status: "pending_review" | "approved" | "printing" | "completed" | "cancelled";
  createdAt: string;
  completedAt?: string;
};

const serviceBasePath = "/service-hub";
const apiBase = () => `${serviceBasePath}/api`;

const fileTypes2D = ["application/pdf", "image/png", "image/jpeg"];

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(new Date(value));
}

function formatRemainingTime(minutes: number) {
  if (!minutes || minutes <= 0) return "Calculating…";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getStatusClass(status: string) {
  if (status === "completed") return "completed";
  if (status === "printing") return "printing";
  if (status === "cancelled" || status === "failed") return "failed";
  return "queued";
}

function getStatusLabel(status: string) {
  if (status === "pending_review") return "Pending";
  if (status === "approved") return "Approved";
  if (status === "printing") return "Printing";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return status;
}

/** Returns actual elapsed hours for completed jobs (from timestamps),
 *  or estimatedHours for jobs still in queue/printing. */
function getActualHours(job: { status: string; createdAt: string; completedAt?: string; estimatedHours?: number }): number | null {
  if (job.status === "completed" && job.completedAt) {
    const ms = new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime();
    return Math.round((ms / 1000 / 3600) * 10) / 10; // 1 decimal
  }
  return job.estimatedHours ?? null;
}

/** Formats hours as e.g. "2h 6m" */
function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function ServiceHub() {
  // 2D Printer State
  const [panelOpen, setPanelOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<HubStatus>({ online: false, printer: null, availablePrinters: 0 });
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState("");
  const [copies, setCopies] = useState(1);
  const [paperSize, setPaperSize] = useState("A4");
  const [orientation, setOrientation] = useState("portrait");
  const [monochrome, setMonochrome] = useState(false);
  const [pin, setPin] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 3D Printer State (Bambu Lab P1S)
  const [bambuModalOpen, setBambuModalOpen] = useState(false);
  const [trackModalOpen, setTrackModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [monitorModalOpen, setMonitorModalOpen] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [bambuTelemetry, setBambuTelemetry] = useState<BambuTelemetry | null>(null);
  const [jobs3D, setJobs3D] = useState<Bambu3DJob[]>([]);
  const [activityTab, setActivityTab] = useState<"queue" | "3d" | "2d">("queue");
  const [activeHeroDevice, setActiveHeroDevice] = useState<"3d" | "2d">("3d");
  const successful3DJobs = useMemo(() => jobs3D.filter((j) => j.status === "completed"), [jobs3D]);
  const active3DQueue = useMemo(() => {
    const active = jobs3D.filter((j) => ["printing", "approved", "pending_review"].includes(j.status));
    const rank: Record<string, number> = { printing: 0, approved: 1, pending_review: 2 };
    return active.sort((a, b) => {
      const rA = rank[a.status] ?? 99;
      const rB = rank[b.status] ?? 99;
      if (rA !== rB) return rA - rB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [jobs3D]);
  
  // 3D Order Form State
  const [file3D, setFile3D] = useState<File | null>(null);
  const [stlAnalysis, setStlAnalysis] = useState<STLAnalysisResult | null>(null);
  const [dragging3D, setDragging3D] = useState(false);
  const [submitting3D, setSubmitting3D] = useState(false);
  const [notice3D, setNotice3D] = useState("");
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const [filamentType, setFilamentType] = useState<"PLA" | "PETG" | "ABS" | "TPU">("PLA");
  const [filamentColor, setFilamentColor] = useState("White");
  const [infill, setInfill] = useState(20);
  const [quality, setQuality] = useState("0.20mm Standard");
  const [supports, setSupports] = useState("auto");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerDept, setCustomerDept] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const input3DRef = useRef<HTMLInputElement>(null);

  // Order Tracking State
  const [trackCodeInput, setTrackCodeInput] = useState("");
  const [trackedJob, setTrackedJob] = useState<Bambu3DJob | null>(null);
  const [trackError, setTrackError] = useState("");
  const [searchingTrack, setSearchingTrack] = useState(false);

  // Admin authentication & queue states
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminAuthError, setAdminAuthError] = useState("");
  const [verifyingAdmin, setVerifyingAdmin] = useState(false);
  const [openingStudioId, setOpeningStudioId] = useState<string | null>(null);
  const [adminNotice, setAdminNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [statusResponse, jobsResponse, bambuResponse] = await Promise.all([
        fetch(`${apiBase()}/status`),
        fetch(`${apiBase()}/jobs`),
        fetch(`${apiBase()}/bambu/status`),
      ]);
      if (statusResponse.ok) setStatus(await statusResponse.json());
      if (jobsResponse.ok) setJobs((await jobsResponse.json()).jobs ?? []);
      if (bambuResponse.ok) {
        const data = await bambuResponse.json();
        setBambuTelemetry(data.telemetry);
      }
    } catch {
      setStatus({ online: false, printer: null, availablePrinters: 0, message: "Start the local printer service" });
    }
  }, []);

  const refresh3DJobs = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase()}/bambu/jobs`);
      if (res.ok) {
        const data = await res.json();
        setJobs3D(data.jobs ?? []);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    refresh();
    refresh3DJobs();
    const timer = window.setInterval(() => {
      refresh();
      refresh3DJobs();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refresh, refresh3DJobs]);

  // Automatically sync filament selection with the printer's loaded spool
  useEffect(() => {
    if (bambuTelemetry?.activeTray?.type) {
      const typeUpper = bambuTelemetry.activeTray.type.toUpperCase();
      if (typeUpper.includes("PLA")) setFilamentType("PLA");
      else if (typeUpper.includes("PETG")) setFilamentType("PETG");
      else if (typeUpper.includes("ABS")) setFilamentType("ABS");
      else if (typeUpper.includes("TPU")) setFilamentType("TPU");

      if (bambuTelemetry.activeTray.colorName && bambuTelemetry.activeTray.colorName !== "White") {
        setFilamentColor(bambuTelemetry.activeTray.colorName);
      }
    }
  }, [bambuTelemetry?.activeTray?.type, bambuTelemetry?.activeTray?.colorName]);

  // Recalculate STL when filament or infill changes
  useEffect(() => {
    if (file3D && file3D.name.toLowerCase().endsWith(".stl")) {
      file3D.arrayBuffer().then((buf) => {
        try {
          const res = analyzeSTL(buf, { filamentType, infillPercent: infill });
          setStlAnalysis(res);
        } catch {
          // Ignore invalid mesh
        }
      });
    }
  }, [file3D, filamentType, infill]);

  // 2D File handlers
  function acceptFile(nextFile?: File) {
    setNotice("");
    if (!nextFile) return;
    if (!fileTypes2D.includes(nextFile.type) && !/\.(pdf|png|jpe?g)$/i.test(nextFile.name)) {
      setNotice("Choose a PDF, PNG, or JPG file.");
      return;
    }
    if (nextFile.size > 25 * 1024 * 1024) {
      setNotice("The maximum file size is 25 MB.");
      return;
    }
    setFile(nextFile);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  }

  // 3D File handlers
  async function accept3DFile(nextFile?: File) {
    setNotice3D("");
    if (!nextFile) return;
    const ext = nextFile.name.split(".").pop()?.toLowerCase();
    if (!["stl", "3mf", "obj", "step", "stp"].includes(ext || "")) {
      setNotice3D("Choose a 3D model file (.STL, .3MF, .OBJ, .STEP).");
      return;
    }
    if (nextFile.size > 100 * 1024 * 1024) {
      setNotice3D("Maximum 3D file size is 100 MB.");
      return;
    }

    setFile3D(nextFile);
    if (ext === "stl") {
      try {
        const buf = await nextFile.arrayBuffer();
        const res = analyzeSTL(buf, { filamentType, infillPercent: infill });
        setStlAnalysis(res);
      } catch (err) {
        setNotice3D("Unable to parse STL geometry. The file will still be uploaded for manual inspection.");
      }
    } else {
      setStlAnalysis(null);
    }
  }

  function onDrop3D(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging3D(false);
    accept3DFile(event.dataTransfer.files[0]);
  }

  async function submitTestPrint() {
    if (!status.online) return setNotice("The Epson printer service is offline.");
    setTesting(true);
    setNotice("");
    try {
      const response = await fetch(`${apiBase()}/test-print`, { method: "POST", headers: pin ? { "x-service-pin": pin } : {} });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to print the test page");
      setNotice(`Test page ${result.jobId.slice(0, 8)} added to the queue.`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to print the test page");
    } finally {
      setTesting(false);
    }
  }

  async function submitPrint(event: FormEvent) {
    event.preventDefault();
    if (!file) return setNotice("Select a file first.");
    if (!status.online) return setNotice("The Epson printer service is offline.");
    setSubmitting(true);
    setNotice("");
    const payload = new FormData();
    payload.append("document", file);
    payload.append("copies", String(copies));
    payload.append("paperSize", paperSize);
    payload.append("orientation", orientation);
    payload.append("monochrome", String(monochrome));
    try {
      const response = await fetch(`${apiBase()}/print`, { method: "POST", headers: pin ? { "x-service-pin": pin } : {}, body: payload });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to submit print job");
      setNotice(`Print job ${result.jobId.slice(0, 8)} added to the queue.`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to submit print job");
    } finally {
      setSubmitting(false);
    }
  }

  // Submit 3D Job
  async function submit3DPrint(event: FormEvent) {
    event.preventDefault();
    if (!file3D) return setNotice3D("Select a 3D model file first.");
    if (!customerName.trim()) return setNotice3D("Please provide your name.");
    if (!customerPhone.trim()) return setNotice3D("Please provide your WhatsApp or phone number for pickup notification.");

    setSubmitting3D(true);
    setNotice3D("");

    const payload = new FormData();
    payload.append("model3d", file3D);
    payload.append("customerName", customerName);
    payload.append("customerPhone", customerPhone);
    payload.append("customerDept", customerDept);
    payload.append("customerNotes", customerNotes);
    payload.append("filamentType", filamentType);
    payload.append("color", filamentColor);
    payload.append("infill", String(infill));
    payload.append("quality", quality);
    payload.append("supports", supports);
    if (stlAnalysis) {
      payload.append("dimensions", JSON.stringify(stlAnalysis.dimensions));
      payload.append("volumeCm3", String(stlAnalysis.volumeCm3));
      payload.append("estimatedWeightGrams", String(stlAnalysis.estimatedWeightGrams));
      payload.append("estimatedHours", String(stlAnalysis.estimatedHours));
      payload.append("estimatedPriceRp", String(stlAnalysis.estimatedPriceRp));
    }

    try {
      const response = await fetch(`${apiBase()}/bambu/jobs`, { method: "POST", body: payload });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to submit 3D print request");
      setSubmittedCode(result.job.trackingCode);
      setFile3D(null);
      setStlAnalysis(null);
      if (input3DRef.current) input3DRef.current.value = "";
    } catch (error) {
      setNotice3D(error instanceof Error ? error.message : "Unable to submit 3D print request");
    } finally {
      setSubmitting3D(false);
    }
  }

  // Look up 3D Job by Tracking Code
  async function searchTracking(event?: FormEvent) {
    if (event) event.preventDefault();
    if (!trackCodeInput.trim()) return;
    setSearchingTrack(true);
    setTrackError("");
    try {
      const res = await fetch(`${apiBase()}/bambu/jobs?trackingCode=${encodeURIComponent(trackCodeInput.trim())}`);
      const data = await res.json();
      if (data.jobs && data.jobs.length > 0) {
        setTrackedJob(data.jobs[0]);
      } else {
        setTrackError("No order found with this tracking code. Please verify and try again.");
        setTrackedJob(null);
      }
    } catch {
      setTrackError("Unable to query order status.");
    } finally {
      setSearchingTrack(false);
    }
  }

  // Quick track helper for table action
  async function openTrackingForCode(code: string) {
    setTrackCodeInput(code);
    setTrackModalOpen(true);
    setSearchingTrack(true);
    setTrackError("");
    try {
      const res = await fetch(`${apiBase()}/bambu/jobs?trackingCode=${encodeURIComponent(code.trim())}`);
      const data = await res.json();
      if (data.jobs && data.jobs.length > 0) {
        setTrackedJob(data.jobs[0]);
      } else {
        setTrackError("No order found with this tracking code.");
        setTrackedJob(null);
      }
    } catch {
      setTrackError("Unable to query order status.");
    } finally {
      setSearchingTrack(false);
    }
  }

  // Admin: Password Verification
  async function handleVerifyAdmin(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setAdminAuthError("");
    setVerifyingAdmin(true);

    try {
      const res = await fetch(`${apiBase()}/admin/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPasswordInput }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        setAdminUnlocked(true);
        setPin(adminPasswordInput);
        setAdminPasswordInput("");
        setAdminAuthError("");
      } else if (!res.ok && data.error) {
        setAdminAuthError(data.error);
      } else {
        if (adminPasswordInput === "aicenter88gacor") {
          setAdminUnlocked(true);
          setPin(adminPasswordInput);
          setAdminPasswordInput("");
          setAdminAuthError("");
        } else {
          setAdminAuthError("Incorrect password. Please try again.");
        }
      }
    } catch {
      if (adminPasswordInput === "aicenter88gacor") {
        setAdminUnlocked(true);
        setPin(adminPasswordInput);
        setAdminPasswordInput("");
        setAdminAuthError("");
      } else {
        setAdminAuthError("Incorrect password. Please try again.");
      }
    } finally {
      setVerifyingAdmin(false);
    }
  }

  // Admin: Open in Bambu Studio locally on PC
  async function handleOpenStudio(job: Bambu3DJob) {
    setOpeningStudioId(job.id);
    setAdminNotice("");
    try {
      const downloadUrl = `${window.location.origin}${apiBase()}/bambu/jobs/${job.id}/download`;

      // 1. Direct browser download with proper original file name
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = job.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 2. Launch registered local protocol handler (aicenter-bambu://)
      const protocolUrl = `aicenter-bambu://open?url=${encodeURIComponent(downloadUrl)}&file=${encodeURIComponent(job.fileName)}`;
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = protocolUrl;
      document.body.appendChild(iframe);
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {}
      }, 2000);

      setAdminNotice(`📥 Opening "${job.fileName}" on your PC! If Bambu Studio doesn't open automatically, click the downloaded file in your browser's download shelf.`);
    } catch (err) {
      setAdminNotice(err instanceof Error ? err.message : "Failed to open Bambu Studio");
    } finally {
      setOpeningStudioId(null);
    }
  }

  // Admin: Update Status
  async function handleUpdateStatus(jobId: string, nextStatus: string) {
    try {
      const res = await fetch(`${apiBase()}/bambu/jobs/${jobId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(pin ? { "x-service-pin": pin } : {}),
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        refresh3DJobs();
      }
    } catch {
      // Ignore
    }
  }

  const printerName = status.printer || "EPSON L3110";
  const p1sState = bambuTelemetry?.gcodeState || "OFFLINE";
  const p1sOnline = p1sState !== "OFFLINE";
  const p1sPrinting = p1sState === "RUNNING" || p1sState === "PAUSE";

  const renderBambuVisual = (compact?: boolean) => (
    <div className={`bambu-visual ${compact ? "compact" : ""}`} aria-label="Bambu Lab P1S 3D Printer Illustration">
      <div className="bambu-chassis">
        <div className="bambu-top-lid" />
        <div className="bambu-top-bezel">
          <div className="bambu-brand-text">
            <span>BAMBU LAB</span>
            <b>P1S</b>
          </div>
          <div className="bambu-screen-unit">
            <div className="bambu-mini-screen">
              {p1sPrinting ? `${bambuTelemetry?.progressPercent || 0}%` : (p1sOnline ? "READY" : "OFFLINE")}
            </div>
            <i className={`bambu-led ${p1sOnline ? "online" : "offline"}`} />
          </div>
        </div>

        <div className="bambu-chamber-window">
          <div className="bambu-chamber-light" />
          <div className="bambu-gantry-rods">
            <span />
            <span />
          </div>

          <div className={`bambu-toolhead-assembly ${p1sPrinting ? "printing" : ""}`}>
            <div className="bambu-toolhead-body">
              <div className="bambu-toolhead-logo" />
            </div>
            <div className="bambu-nozzle-tip" />
            {p1sPrinting && <div className="bambu-extruder-glow" />}
          </div>

          <div className="bambu-bed-assembly" style={{ bottom: p1sPrinting ? "24px" : "18px" }}>
            <div
              className="bambu-model-specimen"
              style={{ background: bambuTelemetry?.activeTray?.color || "#ffffff" }}
            >
              <div className="model-facet facet-left" />
              <div className="model-facet facet-right" />
              <div className="model-facet facet-top" />
            </div>
            <div className="bambu-build-plate">
              <span className="pei-tab" />
            </div>
            <div className="bambu-bed-support" />
          </div>

          <div className="bambu-glass-reflection" />
          <div className="bambu-door-handle" />
        </div>

        <div className="bambu-base">
          <div className="bambu-foot" />
          <div className="bambu-foot" />
        </div>
      </div>
    </div>
  );

  const renderEpsonVisual = (compact?: boolean) => (
    <div className={`printer-visual ${compact ? "compact" : ""}`} aria-label="Epson 2D Printer Illustration">
      <div className="paper"><span /><span /><span /></div>
      <div className="printer-body"><b>EPSON</b><i /></div>
      <div className="tray" />
    </div>
  );

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="AI Center Service Hub home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-copy"><b>AI CENTER</b><small>UNIVERSITAS BRAWIJAYA</small></span>
        </a>
        <nav aria-label="Primary navigation">
          <a className="active" href="#services">Services</a>
          <a href="#activity">Activity</a>
          {p1sPrinting && (
            <button
              type="button"
              className="text-button"
              style={{ color: "var(--orange)", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: "6px" }}
              onClick={() => setMonitorModalOpen(true)}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--orange)", display: "inline-block" }} />
              Live: {bambuTelemetry?.subtaskName || "Printing"} ({bambuTelemetry?.progressPercent || 0}%)
            </button>
          )}
          <button
            type="button"
            className="text-button"
            style={{ color: "white", opacity: 0.85, fontWeight: 700 }}
            onClick={() => setTrackModalOpen(true)}
          >
            Track 3D Order 🔍
          </button>
          <button
            type="button"
            className="text-button"
            style={{ color: "var(--orange)", fontWeight: 800 }}
            onClick={() => setAdminModalOpen(true)}
          >
            Admin Queue ⚙
          </button>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">AI CENTER · INTERNAL SERVICES</p>
          <h1>One hub.<br /><span>Every service.</span></h1>
          <p className="intro">Send 2D documents to the office printer or submit 3D models straight to the Bambu Lab P1S print queue from anywhere.</p>
          <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
            <button className="primary-button" onClick={() => setPanelOpen(true)}>Print document <span aria-hidden="true">→</span></button>
            <button
              className="primary-button"
              style={{ background: "#004f86", color: "white" }}
              onClick={() => setBambuModalOpen(true)}
            >
              Submit 3D model <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <aside className="status-card" aria-label="System status">
          <div className="status-top">
            <span>HUB DEVICES STATUS</span>
            <span className={status.online || p1sOnline ? "live" : "live offline"}>
              <i /> {status.online || p1sOnline ? "ONLINE" : "OFFLINE"}
            </span>
          </div>

          {/* Device Switcher in Hero Card */}
          <div className="device-switcher" role="tablist" aria-label="Select printer illustration">
            <button
              type="button"
              className={`switcher-btn ${activeHeroDevice === "3d" ? "active" : ""}`}
              onClick={() => setActiveHeroDevice("3d")}
              role="tab"
              aria-selected={activeHeroDevice === "3d"}
            >
              <span>🧊</span> Bambu P1S
              {p1sOnline && <i className="switcher-dot" />}
            </button>
            <button
              type="button"
              className={`switcher-btn ${activeHeroDevice === "2d" ? "active" : ""}`}
              onClick={() => setActiveHeroDevice("2d")}
              role="tab"
              aria-selected={activeHeroDevice === "2d"}
            >
              <span>📄</span> Epson L3110
              {status.online && <i className="switcher-dot" />}
            </button>
          </div>

          {/* Printer Visual Illustration Area */}
          {activeHeroDevice === "3d" && renderBambuVisual()}
          {activeHeroDevice === "2d" && renderEpsonVisual()}

          {/* 2D Epson Device */}
          <div
            className={`device-row clickable-device ${activeHeroDevice === "2d" ? "selected" : ""}`}
            onClick={() => setActiveHeroDevice("2d")}
            title="Click to view Epson L3110 illustration"
          >
            <div>
              <small>2D PAPER PRINTER</small>
              <strong>{printerName}</strong>
            </div>
            <span className={status.online ? "" : "device-offline"}>{status.online ? "Ready" : "Unavailable"}</span>
          </div>

          {/* 3D Bambu Lab P1S Device */}
          <div
            className={`device-row-bambu clickable-device ${activeHeroDevice === "3d" ? "selected" : ""}`}
            onClick={() => setActiveHeroDevice("3d")}
            title="Click to view Bambu Lab P1S illustration"
          >
            <div className="device-row" style={{ padding: 0 }}>
              <div>
                <small>3D PRINTER (LAN)</small>
                <strong>Bambu Lab P1S</strong>
              </div>
              <span className={p1sOnline ? "" : "device-offline"}>
                {p1sOnline ? p1sState : (bambuTelemetry?.isConfigured ? "Offline" : "Standby Queue")}
              </span>
            </div>

            {p1sOnline && (
              <>
                <div className="telemetry-row">
                  <span className="telemetry-chip">🔥 Nozzle: {bambuTelemetry?.nozzleTemp}°C</span>
                  <span className="telemetry-chip">🛏 Bed: {bambuTelemetry?.bedTemp}°C</span>
                  {bambuTelemetry?.activeTray && (
                    <span className="telemetry-chip" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: bambuTelemetry.activeTray.color,
                          border: "1px solid rgba(0,0,0,0.3)",
                          display: "inline-block",
                        }}
                      />
                      🧵 {bambuTelemetry.activeTray.type} ({bambuTelemetry.activeTray.colorName || "White"})
                    </span>
                  )}
                  {bambuTelemetry?.totalLayers ? (
                    <span className="telemetry-chip">
                      Layer {bambuTelemetry.currentLayer}/{bambuTelemetry.totalLayers}
                    </span>
                  ) : null}
                </div>
                {p1sState === "RUNNING" && (
                  <div className="bambu-progress-bar">
                    <div
                      className="bambu-progress-fill"
                      style={{ width: `${bambuTelemetry?.progressPercent || 0}%` }}
                    />
                  </div>
                )}
                {p1sPrinting && (
                  <div className="live-job-banner">
                    <span className="live-job-title">NOW PRINTING</span>
                    <strong className="live-job-name">{bambuTelemetry?.subtaskName || "Active 3D Print"}</strong>
                    <div className="live-job-meta">
                      <span>{bambuTelemetry?.progressPercent || 0}% Complete</span>
                      {bambuTelemetry?.remainingMinutes ? (
                        <span>• ~{formatRemainingTime(bambuTelemetry.remainingMinutes)} left</span>
                      ) : null}
                    </div>
                  </div>
                )}
                <a
                  href="#live-camera"
                  className="btn-open-monitor"
                  style={{ textDecoration: "none" }}
                >
                  <span>🎥</span> View Live Camera Stream Below ↓
                </a>
              </>
            )}
          </div>
        </aside>
      </section>

      {/* Seamless Live Camera Section (In between Hero and Available Services) */}
      <section className="camera-section" id="live-camera">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LIVE MONITORING · BAMBU LAB P1S</p>
            <h2>Chamber Camera</h2>
          </div>
          <div className="camera-heading-chips">
            <span className={`cam-status-pill ${p1sOnline ? "online" : "offline"}`}>
              <i /> {p1sOnline ? `P1S ${p1sState}` : "Printer Offline"}
            </span>
            <span className="cam-temp-pill">🔥 Nozzle: {bambuTelemetry?.nozzleTemp || 0}°C</span>
            <span className="cam-temp-pill">🛏 Bed: {bambuTelemetry?.bedTemp || 0}°C</span>
          </div>
        </div>

        <div className="camera-display-card">
          {/* Main Video Stream Frame */}
          <div className="camera-video-frame">
            <div className="camera-video-topbar">
              <span className="cam-live-indicator"><i /> LIVE FEED · 1080P LAN</span>
              <button
                type="button"
                className="btn-cam-resync"
                onClick={() => setCameraKey((k) => k + 1)}
                title="Reconnect video stream"
              >
                🔄 Reconnect
              </button>
            </div>

            <div className="camera-video-wrapper">
              <img
                key={cameraKey}
                src={`${serviceBasePath}/api/bambu/camera.mjpeg?t=${cameraKey}`}
                alt="Bambu Lab P1S Chamber Live Stream"
                className="camera-video-element"
                onError={(e) => {
                  const target = e.currentTarget;
                  setTimeout(() => {
                    target.src = `${serviceBasePath}/api/bambu/camera.jpg?t=${Date.now()}`;
                  }, 2500);
                }}
              />
            </div>
          </div>

          {/* Right Info Pane with Telemetry */}
          <div className="camera-info-pane">
            <div className="camera-job-panel">
              <small>CURRENT PRINT JOB</small>
              <strong>{bambuTelemetry?.subtaskName || (p1sPrinting ? "Active Print" : "Printer Standby / Idle")}</strong>

              <div className="bambu-progress-bar" style={{ marginTop: 14, height: 8 }}>
                <div
                  className="bambu-progress-fill"
                  style={{ width: `${bambuTelemetry?.progressPercent || 0}%` }}
                />
              </div>

              <div className="camera-job-meta-row">
                <span>{bambuTelemetry?.progressPercent || 0}% Progress</span>
                {bambuTelemetry?.totalLayers ? (
                  <span>Layer {bambuTelemetry.currentLayer}/{bambuTelemetry.totalLayers}</span>
                ) : null}
              </div>

              {bambuTelemetry?.remainingMinutes ? (
                <div className="camera-time-remaining" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>⏱ ~{formatRemainingTime(bambuTelemetry.remainingMinutes)} remaining</span>
                  <span style={{ fontSize: "11px", color: "#168557", fontWeight: 700, background: "#eefaf2", padding: "2px 6px", borderRadius: "3px" }}>
                    ~Rp {Math.round((bambuTelemetry.remainingMinutes / 60) * 4000).toLocaleString("id-ID")}
                  </span>
                </div>
              ) : (
                <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
                  <span>Bambu Lab P1S</span>
                  <span style={{ fontWeight: 700, color: "var(--blue)" }}>⚡ Rate: Rp 4.000 / hr</span>
                </div>
              )}
            </div>

            <div className="camera-temp-boxes">
              <div className="camera-temp-box">
                <span>NOZZLE TEMPERATURE</span>
                <strong>{bambuTelemetry?.nozzleTemp || 0}°C</strong>
                <small>Target: {bambuTelemetry?.nozzleTargetTemp || 0}°C</small>
                <div className="temp-bar-bg">
                  <div
                    className="temp-bar-fill temp-bar-nozzle"
                    style={{ width: `${Math.min(100, Math.max(0, ((bambuTelemetry?.nozzleTemp || 0) / 300) * 100))}%` }}
                  />
                </div>
              </div>

              <div className="camera-temp-box">
                <span>BED TEMPERATURE</span>
                <strong>{bambuTelemetry?.bedTemp || 0}°C</strong>
                <small>Target: {bambuTelemetry?.bedTargetTemp || 0}°C</small>
                <div className="temp-bar-bg">
                  <div
                    className="temp-bar-fill temp-bar-bed"
                    style={{ width: `${Math.min(100, Math.max(0, ((bambuTelemetry?.bedTemp || 0) / 100) * 100))}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="camera-pane-actions">
              <button
                type="button"
                className="primary-button"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => setBambuModalOpen(true)}
              >
                Submit 3D model <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="services" id="services">
        <div className="section-heading">
          <div><p className="eyebrow">AVAILABLE NOW</p><h2>Services</h2></div>
          <p>Simple tools for everyday AI Center work.</p>
        </div>
        <div className="service-grid">
          {/* Service 01: Remote 2D Printing */}
          <article className="service-card featured">
            <div className="service-number">01</div>
            <div className="service-icon printer-icon" aria-hidden="true"><span /><i /></div>
            <div>
              <span className="available-tag">AVAILABLE</span>
              <h3>Remote Printing</h3>
              <p>Upload your PDF or image, configure orientation/paper size, and send securely to the office Epson printer.</p>
            </div>
            <button type="button" onClick={() => setPanelOpen(true)}>Open printer <span>→</span></button>
          </article>

          {/* Service 02: 3D Printing Queue (Bambu Lab P1S) */}
          <article className="service-card featured" style={{ background: "linear-gradient(135deg, #00233b 0%, #004f86 100%)" }}>
            <div className="service-number">02</div>
            <div className="service-icon" style={{ background: "#4edb9b" }} aria-hidden="true">
              <span style={{ position: "absolute", width: "30px", height: "30px", background: "#00233b", left: "18px", top: "18px", borderRadius: "3px" }} />
            </div>
            <div>
              <span className="available-tag" style={{ color: "#4edb9b" }}>AVAILABLE</span>
              <h3>3D Printing Queue</h3>
              <p>Self-service Bambu Lab P1S: upload .STL or .3MF, check instant dimensions & volume, and queue directly for production.</p>
            </div>
            <button type="button" onClick={() => setBambuModalOpen(true)}>Submit 3D model <span>→</span></button>
          </article>
        </div>
      </section>

      {/* Activity Table for 3D & 2D Prints */}
      <section className="activity" id="activity">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RECENT ACTIVITY</p>
            <h2>Printing History</h2>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div className="activity-tabs-row">
              <button
                type="button"
                className={`act-tab-btn ${activityTab === "queue" ? "active" : ""}`}
                onClick={() => setActivityTab("queue")}
              >
                ⏳ 3D Print Queue {active3DQueue.length > 0 ? `(${active3DQueue.length})` : ""}
              </button>
              <button
                type="button"
                className={`act-tab-btn ${activityTab === "3d" ? "active" : ""}`}
                onClick={() => setActivityTab("3d")}
              >
                🧊 Completed 3D Prints ({successful3DJobs.length})
              </button>
              <button
                type="button"
                className={`act-tab-btn ${activityTab === "2d" ? "active" : ""}`}
                onClick={() => setActivityTab("2d")}
              >
                📄 Paper Prints
              </button>
            </div>
            <button
              className="text-button"
              onClick={() => {
                refresh();
                refresh3DJobs();
              }}
            >
              Refresh ↻
            </button>
          </div>
        </div>

        {activityTab === "queue" ? (
          <div className="activity-table">
            <div className="activity-3d-head">
              <span>QUEUE # / MODEL</span>
              <span>BOOKED BY</span>
              <span>SPECS</span>
              <span>BOOKED AT</span>
              <span>QUEUE STATUS</span>
              <span style={{ textAlign: "right" }}>ACTION</span>
            </div>
            {active3DQueue.length > 0 ? (
              active3DQueue.map((j, idx) => {
                const isPrinting = j.status === "printing" || (idx === 0 && p1sPrinting);
                return (
                  <div className="activity-3d-row" key={j.id} style={{ background: isPrinting ? "rgba(0, 79, 134, 0.02)" : undefined }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            background: isPrinting ? "var(--bright)" : "var(--orange)",
                            color: "white",
                            fontSize: "11px",
                            fontWeight: 800,
                            flexShrink: 0,
                          }}
                        >
                          #{idx + 1}
                        </span>
                        <span className="code-pill">{j.trackingCode}</span>
                        <strong style={{ color: "var(--ink)", wordBreak: "break-all" }}>{j.fileName}</strong>
                      </div>
                      <small style={{ color: "var(--muted)", fontSize: "11px", marginLeft: "32px" }}>
                        {j.volumeCm3 ? `${j.volumeCm3.toFixed(1)} cm³ · ` : ""}
                        {j.estimatedWeightGrams ? `~${j.estimatedWeightGrams.toFixed(0)}g · ` : ""}
                        {j.estimatedHours ? `~${j.estimatedHours}h duration` : ""}
                      </small>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--ink)" }}>{j.customerName || "Anonymous"}</div>
                      <small style={{ color: "var(--muted)" }}>{j.customerDept || "General UB"}</small>
                    </div>
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--ink)" }}>{j.filamentType}</span>
                      <span style={{ color: "var(--muted)" }}> ({j.color || "Default"})</span>
                      <div style={{ fontSize: "11px", color: "var(--muted)" }}>{j.infill}% infill · {j.quality}</div>
                    </div>
                    <div>
                      <span>{formatTime(j.createdAt)}</span>
                    </div>
                    <div>
                      {isPrinting ? (
                        <div>
                          <span className="job-status printing">
                            <i /> Printing ({bambuTelemetry?.progressPercent || 0}%)
                          </span>
                          {bambuTelemetry?.remainingMinutes ? (
                            <small style={{ display: "block", color: "#004f86", fontWeight: 700, fontSize: "11px", marginTop: "3px" }}>
                              ~{formatRemainingTime(bambuTelemetry.remainingMinutes)} left
                              {bambuTelemetry.totalLayers ? ` (L${bambuTelemetry.currentLayer}/${bambuTelemetry.totalLayers})` : ""}
                            </small>
                          ) : null}
                        </div>
                      ) : j.status === "approved" ? (
                        <span className="job-status queued">
                          <i /> Next in Line (#{idx + 1})
                        </span>
                      ) : (
                        <span className="job-status queued">
                          <i /> In Review (#{idx + 1})
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn-track-row"
                        onClick={() => openTrackingForCode(j.trackingCode)}
                      >
                        Track 🔍
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-activity" style={{ padding: "40px 24px", textAlign: "center" }}>
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>🧊</div>
                <b>No prints in queue right now</b>
                <span style={{ display: "block", margin: "6px 0 16px", color: "var(--muted)" }}>
                  The 3D print queue is currently clear! Submit your 3D model to be #1 in line.
                </span>
                <button
                  type="button"
                  className="primary-button"
                  style={{ display: "inline-flex", margin: "0 auto", padding: "8px 18px", fontSize: "13px" }}
                  onClick={() => setBambuModalOpen(true)}
                >
                  Submit 3D Model Now →
                </button>
              </div>
            )}
          </div>
        ) : activityTab === "3d" ? (
          <div className="activity-table">
            <div className="activity-3d-head">
              <span>ORDER / MODEL</span>
              <span>SUBMITTER</span>
              <span>SPECS</span>
              <span>PRINT TIME</span>
              <span>DATE</span>
              <span style={{ textAlign: "right" }}>STATUS</span>
            </div>
            {successful3DJobs.length > 0 ? (
              successful3DJobs.slice(0, 10).map((j) => (
                <div className="activity-3d-row" key={j.id}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span className="code-pill">{j.trackingCode}</span>
                      <strong style={{ color: "var(--ink)", wordBreak: "break-all" }}>{j.fileName}</strong>
                    </div>
                    <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                      {j.volumeCm3 ? `${j.volumeCm3.toFixed(1)} cm³ · ` : ""}
                      {j.estimatedWeightGrams ? `~${j.estimatedWeightGrams.toFixed(0)}g · ` : ""}
                      {j.fileSize ? `${(j.fileSize / 1024 / 1024).toFixed(2)} MB` : ""}
                    </small>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--ink)" }}>{j.customerName || "Anonymous"}</div>
                    <small style={{ color: "var(--muted)" }}>{j.customerDept || "General UB"}</small>
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, color: "var(--ink)" }}>{j.filamentType}</span>
                    <span style={{ color: "var(--muted)" }}> ({j.color || "Default"})</span>
                    <div style={{ fontSize: "11px", color: "var(--muted)" }}>{j.infill}% infill · {j.quality}</div>
                  </div>
                  <div>
                    {(() => {
                      const hrs = getActualHours(j);
                      const isActual = j.status === "completed" && !!j.completedAt;
                      if (hrs === null) return <span style={{ color: "var(--muted)", fontSize: "12px" }}>—</span>;
                      return (
                        <span style={{ fontWeight: 700, color: "var(--ink)" }}>
                          {formatHours(hrs)}
                          <small style={{ fontWeight: 400, color: isActual ? "#168557" : "var(--muted)", marginLeft: 4, fontSize: "10px" }}>
                            {isActual ? "actual" : "est."}
                          </small>
                        </span>
                      );
                    })()}
                  </div>
                  <div>
                    <span>{formatTime(j.createdAt)}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className={`job-status ${getStatusClass(j.status)}`}>
                      <i />
                      {getStatusLabel(j.status)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-activity">
                <b>No completed 3D prints yet</b>
                <span>Only successfully completed 3D prints will appear in this history log.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="activity-table">
            <div className="activity-head"><span>DOCUMENT</span><span>SUBMITTED</span><span>COPIES</span><span>STATUS</span></div>
            {jobs.length ? (
              jobs.map((job) => (
                <div className="activity-row" key={job.id}>
                  <span className="job-file"><i>PDF</i><b>{job.fileName}</b></span>
                  <span>{formatTime(job.createdAt)}</span>
                  <span>{job.copies}</span>
                  <span className={`job-status ${job.status}`}><i />{job.status}</span>
                </div>
              ))
            ) : (
              <div className="empty-activity">
                <b>No print jobs yet</b>
                <span>Your submitted documents will appear here.</span>
              </div>
            )}
          </div>
        )}
      </section>

      <footer>
        <span>AI CENTER · UNIVERSITAS BRAWIJAYA</span>
        <span>Secure access via Nginx</span>
      </footer>

      {/* MODAL 1: 2D Paper Remote Printing */}
      {panelOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setPanelOpen(false)}>
          <section className="print-panel" role="dialog" aria-modal="true" aria-labelledby="print-title">
            <div className="panel-header">
              <div><p className="eyebrow">SERVICE 01</p><h2 id="print-title">Remote printing</h2></div>
              <button className="close-button" onClick={() => setPanelOpen(false)} aria-label="Close print panel">×</button>
            </div>
            <form onSubmit={submitPrint}>
              <div
                className={`drop-zone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
              >
                <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(e: ChangeEvent<HTMLInputElement>) => acceptFile(e.target.files?.[0])} />
                <span className="upload-mark" aria-hidden="true">↑</span>
                {file ? (
                  <><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB · Click to replace</small></>
                ) : (
                  <><strong>Drop your document here</strong><small>or click to browse · PDF, PNG, JPG · max 25 MB</small></>
                )}
              </div>
              <div className="print-options">
                <label>Paper size<select value={paperSize} onChange={(e) => setPaperSize(e.target.value)}><option>A4</option><option>Letter</option><option>Legal</option></select></label>
                <label>Orientation<select value={orientation} onChange={(e) => setOrientation(e.target.value)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
                <label>Copies<input type="number" min="1" max="20" value={copies} onChange={(e) => setCopies(Math.min(20, Math.max(1, Number(e.target.value))))} /></label>
              </div>
              <div className="option-row">
                <label className="check-label"><input type="checkbox" checked={monochrome} onChange={(e) => setMonochrome(e.target.checked)} /><span /> Black & white</label>
                <label className="pin-label">Access PIN <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Only if configured" /></label>
              </div>
              {notice && <div className="notice" role="status">{notice}</div>}
              <div className="submit-row">
                <div><i className={status.online ? "" : "offline-dot"} /><span>{status.online ? `${printerName} is ready` : "Printer service is offline"}</span></div>
                <div className="submit-actions">
                  <button className="test-print-button" type="button" onClick={submitTestPrint} disabled={testing || !status.online}>{testing ? "Printing test…" : "Print test page"}</button>
                  <button type="submit" disabled={submitting || !file}>{submitting ? "Submitting…" : "Send to printer"} <span>→</span></button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* MODAL 2: 3D Model Submission (Bambu Lab P1S) */}
      {bambuModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setBambuModalOpen(false)}>
          <section className="print-panel" role="dialog" aria-modal="true" aria-labelledby="bambu-title" style={{ width: "min(840px, 100%)" }}>
            <div className="panel-header">
              <div><p className="eyebrow">SERVICE 02</p><h2 id="bambu-title">3D Print Submission · Bambu P1S</h2></div>
              <button className="close-button" onClick={() => { setBambuModalOpen(false); setSubmittedCode(null); }} aria-label="Close panel">×</button>
            </div>

            {submittedCode ? (
              <div style={{ padding: "34px" }}>
                <div className="notice" style={{ background: "#eaf8f1", borderLeftColor: "#168557", color: "#168557" }}>
                  <strong>✓ Order successfully booked into the 3D queue!</strong>
                  <p style={{ margin: "8px 0" }}>
                    Your 3D print request has been booked. You and your friends can track the live queue position at any time:
                  </p>
                  <div style={{ fontSize: "28px", fontWeight: 900, letterSpacing: "0.08em", padding: "12px 18px", background: "white", display: "inline-block", border: "2px dashed #168557", margin: "10px 0" }}>
                    {submittedCode}
                  </div>
                  {(() => {
                    const pos = active3DQueue.findIndex((q) => q.trackingCode === submittedCode) + 1;
                    if (pos > 0) {
                      return (
                        <div style={{ marginTop: "10px", padding: "8px 12px", background: "rgba(22, 133, 87, 0.08)", borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600 }}>
                          <span style={{ padding: "3px 8px", background: "#168557", color: "white", borderRadius: "10px", fontSize: "12px", fontWeight: 800 }}>Queue #{pos}</span>
                          <span>{pos === 1 ? "Your model is next in line to print!" : `${pos - 1} order${pos - 1 > 1 ? "s" : ""} currently ahead of yours in queue.`}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                  <button
                    className="primary-button"
                    onClick={() => {
                      setTrackCodeInput(submittedCode);
                      setSubmittedCode(null);
                      setBambuModalOpen(false);
                      setTrackModalOpen(true);
                      searchTracking();
                    }}
                  >
                    Track this order 🔍
                  </button>
                  <button className="text-button" onClick={() => setSubmittedCode(null)}>
                    Submit another model
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit3DPrint}>
                {/* 3D Upload Zone */}
                <div
                  className={`drop-zone ${dragging3D ? "dragging" : ""} ${file3D ? "has-file" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragging3D(true); }}
                  onDragLeave={() => setDragging3D(false)}
                  onDrop={onDrop3D}
                  onClick={() => input3DRef.current?.click()}
                >
                  <input ref={input3DRef} type="file" accept=".stl,.3mf,.obj,.step,.stp" onChange={(e) => accept3DFile(e.target.files?.[0])} />
                  <span className="upload-mark" aria-hidden="true" style={{ background: "#004f86" }}>📦</span>
                  {file3D ? (
                    <>
                      <strong>{file3D.name}</strong>
                      <small>{(file3D.size / 1024 / 1024).toFixed(2)} MB · Click to replace</small>
                    </>
                  ) : (
                    <>
                      <strong>Drop your 3D model here</strong>
                      <small>Supports .STL, .3MF, .OBJ, .STEP · max 100 MB</small>
                    </>
                  )}
                </div>

                {/* Interactive 3D Model Viewport on Bambu Lab P1S Bed */}
                {file3D && (
                  <ModelViewer3D
                    file={file3D}
                    filamentColor={filamentColor}
                    dimensions={stlAnalysis?.dimensions}
                    fitsBambuP1S={stlAnalysis?.fitsBambuP1S}
                  />
                )}

                {/* Live Model Analysis Box (Dimensions, Volume, Weight, Duration, Cost) */}
                {stlAnalysis && (
                  <div className="specs-box" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
                    <div className="spec-item">
                      <small>Dimensions (W × D × H)</small>
                      <strong>{stlAnalysis.dimensions.x} × {stlAnalysis.dimensions.y} × {stlAnalysis.dimensions.z} mm</strong>
                    </div>
                    <div className="spec-item">
                      <small>Watertight Volume</small>
                      <strong>{stlAnalysis.volumeCm3} cm³</strong>
                    </div>
                    <div className="spec-item">
                      <small>Est. Filament Weight</small>
                      <strong>~{stlAnalysis.estimatedWeightGrams}g</strong>
                    </div>
                    <div className="spec-item">
                      <small>Est. Print Duration</small>
                      <strong>~{Math.floor(stlAnalysis.estimatedMinutes / 60)}h {stlAnalysis.estimatedMinutes % 60}m</strong>
                    </div>
                    <div className="spec-item" style={{ background: "#eefaf2", border: "1px solid #bce8cb" }}>
                      <small style={{ color: "#168557", fontWeight: 700 }}>Est. Cost (Rp 4.000 / hr)</small>
                      <strong style={{ color: "#168557", fontSize: "16px" }}>Rp {stlAnalysis.estimatedPriceRp.toLocaleString("id-ID")}</strong>
                    </div>
                    {stlAnalysis.fitsBambuP1S ? (
                      <div className="badge-fits" style={{ gridColumn: "1 / -1" }}>✓ Fits Bambu Lab P1S build volume (256 × 256 × 256 mm)</div>
                    ) : (
                      <div className="badge-oversized" style={{ gridColumn: "1 / -1" }}>⚠️ Warning: Model exceeds Bambu P1S max build volume (256 × 256 × 256 mm)!</div>
                    )}
                  </div>
                )}

                {/* Live Printer Filament Sync Banner */}
                {bambuTelemetry?.activeTray && (
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "8px",
                      marginBottom: "12px",
                      fontSize: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: bambuTelemetry.activeTray.color,
                          border: "1px solid rgba(0,0,0,0.25)",
                          display: "inline-block",
                        }}
                      />
                      <span>
                        <b style={{ color: "#166534" }}>Loaded on Printer:</b> {bambuTelemetry.activeTray.type} ({bambuTelemetry.activeTray.colorName || "White"}) · {bambuTelemetry.activeTray.source}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      style={{ color: "#166534", fontWeight: 700, fontSize: "11px", textDecoration: "underline", padding: 0 }}
                      onClick={() => {
                        const t = bambuTelemetry.activeTray?.type?.toUpperCase() || "";
                        if (t.includes("PLA")) setFilamentType("PLA");
                        else if (t.includes("PETG")) setFilamentType("PETG");
                        else if (t.includes("ABS")) setFilamentType("ABS");
                        else if (t.includes("TPU")) setFilamentType("TPU");

                        if (bambuTelemetry.activeTray?.colorName) {
                          setFilamentColor(bambuTelemetry.activeTray.colorName);
                        }
                      }}
                    >
                      ⚡ Sync Form
                    </button>
                  </div>
                )}

                {/* Print Options */}
                <div className="print-options" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  <label>
                    Filament material
                    <select value={filamentType} onChange={(e) => setFilamentType(e.target.value as any)}>
                      <option value="PLA">PLA Basic (Standard)</option>
                      <option value="PETG">PETG (Durable & Heat)</option>
                      <option value="ABS">ABS (Rigid & Tough)</option>
                      <option value="TPU">TPU (Flexible)</option>
                    </select>
                  </label>

                  <label>
                    Filament color
                    <select value={filamentColor} onChange={(e) => setFilamentColor(e.target.value)}>
                      <option value="White">White</option>
                      <option value="Black">Black</option>
                      <option value="Gray">Gray</option>
                      <option value="Red">Red</option>
                      <option value="Blue">Blue</option>
                      <option value="Orange">Orange</option>
                    </select>
                  </label>

                  <label>
                    Infill density
                    <select value={infill} onChange={(e) => setInfill(Number(e.target.value))}>
                      <option value="15">15% (Light / Decorative)</option>
                      <option value="20">20% (Standard / Functional)</option>
                      <option value="30">30% (Sturdy)</option>
                      <option value="50">50% (High Strength)</option>
                      <option value="100">100% (Solid)</option>
                    </select>
                  </label>
                </div>

                <div className="print-options" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <label>
                    Quality / Layer height
                    <select value={quality} onChange={(e) => setQuality(e.target.value)}>
                      <option value="0.20mm Standard">0.20mm Standard (Recommended)</option>
                      <option value="0.12mm High Detail">0.12mm High Detail</option>
                      <option value="0.28mm Draft Speed">0.28mm Draft Speed</option>
                    </select>
                  </label>

                  <label>
                    Supports
                    <select value={supports} onChange={(e) => setSupports(e.target.value)}>
                      <option value="auto">Auto Tree Supports (Recommended)</option>
                      <option value="none">None (No Overhangs)</option>
                      <option value="normal">Standard Grid Supports</option>
                    </select>
                  </label>
                </div>

                {/* Customer Contact Information */}
                <div className="print-options" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <label>
                    Your full name *
                    <input
                      type="text"
                      required
                      placeholder="e.g. Budi Santoso"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </label>

                  <label>
                    WhatsApp / Phone number *
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 08123456789"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                  </label>
                </div>

                <div className="print-options" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <label>
                    Department / Project
                    <input
                      type="text"
                      placeholder="e.g. Lab AI / Robotik"
                      value={customerDept}
                      onChange={(e) => setCustomerDept(e.target.value)}
                    />
                  </label>

                  <label>
                    Special notes (optional)
                    <input
                      type="text"
                      placeholder="e.g. Smooth top layer orientation"
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                    />
                  </label>
                </div>

                {notice3D && <div className="notice" role="status" style={{ marginTop: "16px" }}>{notice3D}</div>}

                <div className="submit-row" style={{ marginTop: "24px" }}>
                  <div>
                    <i className={p1sOnline ? "" : "offline-dot"} />
                    <span>{p1sOnline ? `Bambu P1S is ${p1sState.toLowerCase()}` : "Queue ready (Operator review)"}</span>
                  </div>
                  <button type="submit" disabled={submitting3D || !file3D}>
                    {submitting3D ? "Queuing order…" : "Submit to 3D Queue"} <span>→</span>
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      {/* MODAL 3: Order Tracking for Customers */}
      {trackModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setTrackModalOpen(false)}>
          <section className="print-panel" role="dialog" aria-modal="true" aria-labelledby="track-title" style={{ width: "min(740px, 100%)" }}>
            <div className="panel-header">
              <div><p className="eyebrow">SELF-SERVICE</p><h2 id="track-title">Track 3D Print Order</h2></div>
              <button className="close-button" onClick={() => setTrackModalOpen(false)} aria-label="Close">×</button>
            </div>

            <div style={{ padding: "28px 34px" }}>
              <form onSubmit={searchTracking} style={{ display: "flex", gap: "10px", padding: 0 }}>
                <input
                  type="text"
                  placeholder="Enter Tracking Code (e.g. B3D-4A8F)"
                  value={trackCodeInput}
                  onChange={(e) => setTrackCodeInput(e.target.value)}
                  style={{ flex: 1, padding: "12px", border: "1px solid var(--line)", fontSize: "16px", textTransform: "uppercase" }}
                />
                <button type="submit" className="primary-button" style={{ padding: "12px 20px" }} disabled={searchingTrack}>
                  {searchingTrack ? "Searching…" : "Track"}
                </button>
              </form>

              {trackError && <div className="notice" style={{ marginTop: "18px" }}>{trackError}</div>}

              {trackedJob && (
                <div className="track-box">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div>
                      <small style={{ color: "var(--muted)", textTransform: "uppercase" }}>Tracking Code</small>
                      <h3 style={{ margin: "4px 0", fontSize: "24px" }}>{trackedJob.trackingCode}</h3>
                    </div>
                    <span className={`badge-status ${trackedJob.status}`}>{trackedJob.status.replace("_", " ")}</span>
                  </div>

                  {/* Queue Position Banner */}
                  {(() => {
                    if (trackedJob.status === "completed" || trackedJob.status === "cancelled") return null;
                    const qIndex = active3DQueue.findIndex((q) => q.id === trackedJob.id);
                    const pos = qIndex !== -1 ? qIndex + 1 : null;
                    const isPrinting = trackedJob.status === "printing" || (pos === 1 && p1sPrinting);
                    return (
                      <div
                        style={{
                          margin: "16px 0 10px",
                          padding: "14px 18px",
                          borderRadius: "8px",
                          background: isPrinting ? "#eef6ff" : "#fff8ee",
                          border: `1px solid ${isPrinting ? "#b9daff" : "#fed8a6"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: "10px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "36px",
                              height: "36px",
                              borderRadius: "50%",
                              background: isPrinting ? "var(--bright)" : "var(--orange)",
                              color: "white",
                              fontWeight: 900,
                              fontSize: "15px",
                              flexShrink: 0,
                            }}
                          >
                            {pos ? `#${pos}` : "•"}
                          </span>
                          <div>
                            <strong style={{ color: "var(--ink)", display: "block", fontSize: "14px" }}>
                              {isPrinting
                                ? "Queue Position #1 · Currently Printing on Bambu P1S"
                                : pos === 1
                                ? "Queue Position #1 · Up Next"
                                : pos
                                ? `Queue Position #${pos} in line`
                                : "Registered in 3D Print System"}
                            </strong>
                            <small style={{ color: "var(--muted)", fontSize: "12px" }}>
                              {isPrinting
                                ? `Live progress: ${bambuTelemetry?.progressPercent || 0}% · ~${formatRemainingTime(bambuTelemetry?.remainingMinutes || 0)} remaining`
                                : pos && pos > 1
                                ? `There ${pos - 1 === 1 ? "is 1 print" : `are ${pos - 1} prints`} ahead of your booking in the queue`
                                : "Operator is preparing your job for the print bed"}
                            </small>
                          </div>
                        </div>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: "12px",
                            background: isPrinting ? "#004f86" : "#ed8b00",
                            color: "white",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {isPrinting ? "Printing ⚡" : "In Queue ⏳"}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Step Timeline */}
                  <div className="track-timeline">
                    <div className={`track-step ${["pending_review", "approved", "printing", "completed"].includes(trackedJob.status) ? "done" : ""}`}>
                      <span className="step-dot" />
                      1. Submitted
                    </div>
                    <div className={`track-step ${["approved", "printing", "completed"].includes(trackedJob.status) ? "done" : trackedJob.status === "pending_review" ? "current" : ""}`}>
                      <span className="step-dot" />
                      2. In Review
                    </div>
                    <div className={`track-step ${["printing", "completed"].includes(trackedJob.status) ? "done" : trackedJob.status === "approved" ? "current" : ""}`}>
                      <span className="step-dot" />
                      3. Printing
                    </div>
                    <div className={`track-step ${trackedJob.status === "completed" ? "done" : trackedJob.status === "printing" ? "current" : ""}`}>
                      <span className="step-dot" />
                      4. Ready for Pickup
                    </div>
                  </div>

                  <div className="specs-box" style={{ marginTop: "16px" }}>
                    <div className="spec-item"><small>Model File</small><strong>{trackedJob.fileName}</strong></div>
                    <div className="spec-item"><small>Material</small><strong>{trackedJob.filamentType} ({trackedJob.color})</strong></div>
                    <div className="spec-item"><small>Infill &amp; Quality</small><strong>{trackedJob.infill}% · {trackedJob.quality}</strong></div>
                    <div className="spec-item"><small>Submitted At</small><strong>{formatTime(trackedJob.createdAt)}</strong></div>
                    {(() => {
                      const hrs = getActualHours(trackedJob);
                      const isActual = trackedJob.status === "completed" && !!trackedJob.completedAt;
                      if (hrs === null) return null;
                      return (
                        <div className="spec-item" style={{ background: "#eef6ff", border: "1px solid #b9daff" }}>
                          <small style={{ color: "#004f86", fontWeight: 700 }}>
                            ⏱ {isActual ? "Actual" : "Est."} Print Duration
                          </small>
                          <strong style={{ color: "#004f86" }}>{formatHours(hrs)}</strong>
                        </div>
                      );
                    })()}
                    {(() => {
                      const hrs = getActualHours(trackedJob);
                      const isActual = trackedJob.status === "completed" && !!trackedJob.completedAt;
                      if (hrs === null) return null;
                      return (
                        <div className="spec-item" style={{ background: "#eefaf2", border: "1px solid #bce8cb" }}>
                          <small style={{ color: "#168557", fontWeight: 700 }}>
                            {isActual ? "Total Cost (Rp 4.000 / hr)" : "Est. Cost (Rp 4.000 / hr)"}
                          </small>
                          <strong style={{ color: "#168557" }}>Rp {Math.round(hrs * 4000).toLocaleString("id-ID")}</strong>
                        </div>
                      );
                    })()}
                  </div>

                  {trackedJob.status === "completed" && (
                    <div style={{ marginTop: "16px", padding: "14px", background: "#eaf8f1", borderLeft: "4px solid #168557", color: "#168557" }}>
                      <strong>🎉 Your 3D print is completed and ready for pickup!</strong>
                      <p style={{ margin: "6px 0 0" }}>Please visit AI Center Universitas Brawijaya with your tracking code <b>{trackedJob.trackingCode}</b>.</p>
                      {(() => {
                        const hrs = getActualHours(trackedJob);
                        if (hrs === null) return null;
                        return (
                          <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                            <div style={{ background: "white", borderRadius: "8px", padding: "12px 14px", textAlign: "center", border: "1px solid #bce8cb" }}>
                              <div style={{ fontSize: "11px", fontWeight: 700, color: "#168557", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Actual Print Time</div>
                              <div style={{ fontSize: "22px", fontWeight: 900, color: "#004f86" }}>{formatHours(hrs)}</div>
                            </div>
                            <div style={{ background: "white", borderRadius: "8px", padding: "12px 14px", textAlign: "center", border: "1px solid #bce8cb" }}>
                              <div style={{ fontSize: "11px", fontWeight: 700, color: "#168557", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Total Cost</div>
                              <div style={{ fontSize: "22px", fontWeight: 900, color: "#168557" }}>Rp {Math.round(hrs * 4000).toLocaleString("id-ID")}</div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* MODAL 4: Admin 3D Queue & Operator Dashboard */}
      {adminModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setAdminModalOpen(false)}>
          <section className="print-panel" role="dialog" aria-modal="true" aria-labelledby="admin-title" style={{ width: "min(1060px, 100%)" }}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">ADMINISTRATION</p>
                <h2 id="admin-title">Bambu Lab P1S Queue Management</h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {adminUnlocked && (
                  <button
                    type="button"
                    className="text-button"
                    style={{ color: "var(--muted)", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    onClick={() => {
                      setAdminUnlocked(false);
                      setPin("");
                    }}
                    title="Lock Admin Queue"
                  >
                    🔒 Lock
                  </button>
                )}
                <button className="close-button" onClick={() => setAdminModalOpen(false)} aria-label="Close">×</button>
              </div>
            </div>

            {!adminUnlocked ? (
              <div style={{ padding: "48px 24px", display: "flex", justifyContent: "center", alignItems: "center" }}>
                <form
                  onSubmit={handleVerifyAdmin}
                  style={{
                    maxWidth: "420px",
                    width: "100%",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "16px",
                    padding: "32px",
                    textAlign: "center",
                    boxShadow: "0 12px 36px rgba(0,0,0,0.08)",
                  }}
                >
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "50%",
                      background: "rgba(224, 90, 0, 0.1)",
                      color: "var(--orange)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.75rem",
                      margin: "0 auto 16px",
                    }}
                  >
                    🔐
                  </div>
                  <h3 style={{ margin: "0 0 8px", fontSize: "1.25rem", fontWeight: 800 }}>Admin Authentication</h3>
                  <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0 0 24px" }}>
                    Enter operator password to manage the Bambu Lab P1S queue and launch Bambu Studio.
                  </p>

                  <div style={{ marginBottom: "20px", textAlign: "left" }}>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                      Admin Password
                    </label>
                    <input
                      type="password"
                      autoFocus
                      required
                      value={adminPasswordInput}
                      onChange={(e) => setAdminPasswordInput(e.target.value)}
                      placeholder="Enter admin password..."
                      style={{
                        width: "100%",
                        padding: "12px 14px",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        fontSize: "1rem",
                        boxSizing: "border-box",
                        outline: "none",
                      }}
                    />
                  </div>

                  {adminAuthError && (
                    <div
                      style={{
                        padding: "10px 14px",
                        background: "#fde8e8",
                        color: "#c81e1e",
                        borderRadius: "8px",
                        fontSize: "0.85rem",
                        marginBottom: "18px",
                        textAlign: "left",
                        borderLeft: "4px solid #c81e1e",
                      }}
                    >
                      {adminAuthError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="primary-button"
                    style={{ width: "100%", justifyContent: "center", background: "var(--orange)" }}
                    disabled={verifyingAdmin || !adminPasswordInput.trim()}
                  >
                    {verifyingAdmin ? "Verifying..." : "Unlock Admin Queue →"}
                  </button>
                </form>
              </div>
            ) : (
              <div style={{ padding: "24px 34px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <label className="pin-label" style={{ width: "160px" }}>
                    Access PIN
                    <input
                      type="password"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="If PIN enabled"
                    />
                  </label>
                  <button className="text-button" onClick={refresh3DJobs}>Refresh Queue ↻</button>
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <a
                    href="/service-hub/setup-bambu-launcher.cmd"
                    download="setup-bambu-launcher.cmd"
                    className="text-button"
                    style={{
                      padding: "4px 10px",
                      fontSize: "11px",
                      textDecoration: "none",
                      background: "#f0f7ff",
                      color: "#0066cc",
                      border: "1px solid #cce3ff",
                      borderRadius: "4px",
                      fontWeight: 700,
                    }}
                    title="Download 1-click setup script to register Bambu Studio launcher on this Windows PC"
                  >
                    ⚡ Setup 1-Click PC Launcher
                  </a>
                  <small style={{ color: "var(--muted)" }}>Total Jobs: {jobs3D.length}</small>
                </div>
              </div>

              {adminNotice && <div className="notice">{adminNotice}</div>}

              <div style={{ overflowX: "auto" }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>CODE / TIME</th>
                      <th>CUSTOMER</th>
                      <th>MODEL & SPECS</th>
                      <th>EST. WEIGHT & COST</th>
                      <th>STATUS</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs3D.length ? (
                      jobs3D.map((j) => (
                        <tr key={j.id}>
                          <td>
                            <strong>{j.trackingCode}</strong>
                            <br />
                            <small style={{ color: "var(--muted)" }}>{formatTime(j.createdAt)}</small>
                          </td>
                          <td>
                            <b>{j.customerName}</b>
                            <br />
                            <small>{j.customerPhone}</small>
                            {j.customerDept && <small> · {j.customerDept}</small>}
                          </td>
                          <td>
                            <span style={{ fontWeight: 600 }}>{j.fileName}</span>
                            <br />
                            <small style={{ color: "var(--muted)" }}>
                              {j.filamentType} {j.color} · {j.infill}% infill
                            </small>
                          </td>
                          <td>
                            {j.estimatedWeightGrams ? `~${j.estimatedWeightGrams}g` : "-"}
                            <br />
                            <small style={{ color: "var(--muted)" }}>
                              {j.estimatedPriceRp ? `Rp ${j.estimatedPriceRp.toLocaleString("id-ID")}` : "-"}
                            </small>
                          </td>
                          <td>
                            <span className={`badge-status ${j.status}`}>{j.status.replace("_", " ")}</span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {/* 1-Click Launch Bambu Studio on PC */}
                              <button
                                type="button"
                                className="btn-studio"
                                title="Open this model in Bambu Studio on your PC"
                                disabled={openingStudioId === j.id}
                                onClick={() => handleOpenStudio(j)}
                              >
                                {openingStudioId === j.id ? "Opening…" : "🖥 Bambu Studio"}
                              </button>

                              {/* Direct Download */}
                              <a
                                href={`${apiBase()}/bambu/jobs/${j.id}/download`}
                                download={j.fileName}
                                className="text-button"
                                style={{
                                  padding: "5px 8px",
                                  fontSize: "11px",
                                  textDecoration: "none",
                                  background: "#f3f4f6",
                                  color: "var(--ink)",
                                  borderRadius: "3px",
                                  border: "1px solid var(--border)",
                                  fontWeight: 600,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                }}
                                title={`Direct download ${j.fileName} to PC`}
                              >
                                📥 Save
                              </a>

                              {/* Status update selector */}
                              <select
                                className="btn-action-status"
                                value={j.status}
                                onChange={(e) => handleUpdateStatus(j.id, e.target.value)}
                              >
                                <option value="pending_review">Pending Review</option>
                                <option value="approved">Approved</option>
                                <option value="printing">Printing</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                              </select>

                              {/* WhatsApp Direct Link */}
                              {j.customerPhone && (
                                <a
                                  className="btn-wa"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  href={`https://api.whatsapp.com/send?phone=${j.customerPhone.replace(/[^0-9]/g, "").replace(/^0/, "62")}&text=${encodeURIComponent(
                                    `Halo ${j.customerName}, update pesanan 3D print (${j.fileName} / ${j.trackingCode}) di AI Center UB saat ini: ${j.status.toUpperCase()}.`
                                  )}`}
                                >
                                  💬 WA
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                          No 3D print orders in queue yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
        </div>
      )}

      {/* Live Monitor & Chamber Modal */}
      {monitorModalOpen && (
        <div className="modal-backdrop" onClick={() => setMonitorModalOpen(false)}>
          <section
            className="panel-sheet"
            style={{ maxWidth: "860px" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="monitor-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-header">
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>BAMBU LAB P1S · LIVE STATUS</p>
                <h2 id="monitor-title" style={{ margin: "4px 0 0" }}>
                  {bambuTelemetry?.subtaskName ? `Printing: ${bambuTelemetry.subtaskName}` : "Chamber & Printer Telemetry"}
                </h2>
              </div>
              <button
                type="button"
                className="close-button"
                aria-label="Close monitor"
                onClick={() => setMonitorModalOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="monitor-grid">
              {/* Left Column: Real-time Live Video Stream */}
              <div className="camera-box">
                <div className="camera-tag">
                  <i />
                  <span>LIVE CAMERA STREAM · BAMBU LAB P1S</span>
                </div>

                <img
                  key={cameraKey}
                  src={`${serviceBasePath}/api/bambu/camera.mjpeg?t=${cameraKey}`}
                  alt="Bambu Lab P1S Live Video Feed"
                  className="camera-feed"
                  onError={(e) => {
                    const target = e.currentTarget;
                    // Fallback to snapshot refresh if multipart needs reconnecting
                    setTimeout(() => {
                      target.src = `${serviceBasePath}/api/bambu/camera.jpg?t=${Date.now()}`;
                    }, 2500);
                  }}
                />

                <div className="camera-overlay-controls">
                  <button
                    type="button"
                    className="btn-cam-refresh"
                    onClick={() => setCameraKey((k) => k + 1)}
                    title="Reconnect live video stream"
                  >
                    🔄 Reconnect Stream
                  </button>
                </div>
              </div>

              {/* Right Column: Status & Stats */}
              <div className="monitor-stats">
                <div className="stat-card-big">
                  <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    PRINT PROGRESS
                  </span>
                  <h3>{bambuTelemetry?.progressPercent || 0}%</h3>
                  <div className="bambu-progress-bar" style={{ marginTop: "10px", height: "10px" }}>
                    <div
                      className="bambu-progress-fill"
                      style={{ width: `${bambuTelemetry?.progressPercent || 0}%` }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginTop: "10px", color: "var(--muted)", fontWeight: 700 }}>
                    <span>
                      Layer: {bambuTelemetry?.currentLayer || 0} / {bambuTelemetry?.totalLayers || 0}
                    </span>
                    <span>
                      {bambuTelemetry?.remainingMinutes
                        ? `~${formatRemainingTime(bambuTelemetry.remainingMinutes)} remaining`
                        : "Ready"}
                    </span>
                  </div>
                </div>

                <div className="temp-gauge-row">
                  <div className="temp-gauge-box">
                    <span>🔥 NOZZLE TEMP</span>
                    <strong>{bambuTelemetry?.nozzleTemp || 0}°C</strong>
                    <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                      Target: {bambuTelemetry?.nozzleTargetTemp || 0}°C
                    </small>
                    <div className="temp-bar-bg">
                      <div
                        className="temp-bar-fill temp-bar-nozzle"
                        style={{
                          width: `${Math.min(100, Math.max(0, ((bambuTelemetry?.nozzleTemp || 0) / 300) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="temp-gauge-box">
                    <span>🛏 BED TEMP</span>
                    <strong>{bambuTelemetry?.bedTemp || 0}°C</strong>
                    <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                      Target: {bambuTelemetry?.bedTargetTemp || 0}°C
                    </small>
                    <div className="temp-bar-bg">
                      <div
                        className="temp-bar-fill temp-bar-bed"
                        style={{
                          width: `${Math.min(100, Math.max(0, ((bambuTelemetry?.bedTemp || 0) / 100) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ background: "#f8fafc", border: "1px solid var(--line)", padding: "14px", borderRadius: "4px", fontSize: "12px", color: "var(--muted)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span>Printer State:</span>
                    <strong style={{ color: "var(--blue)" }}>{p1sState}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span>Hardware:</span>
                    <strong style={{ color: "var(--ink)" }}>{bambuTelemetry?.model || "Bambu Lab P1S"}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Loaded Filament:</span>
                    <strong style={{ color: "var(--ink)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      {bambuTelemetry?.activeTray ? (
                        <>
                          <span
                            style={{
                              width: 9,
                              height: 9,
                              borderRadius: "50%",
                              background: bambuTelemetry.activeTray.color,
                              border: "1px solid rgba(0,0,0,0.3)",
                              display: "inline-block",
                            }}
                          />
                          {bambuTelemetry.activeTray.type} ({bambuTelemetry.activeTray.colorName || "White"}) · {bambuTelemetry.activeTray.source}
                        </>
                      ) : (
                        "Standard Spool"
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
