"use client";

import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";

type HubStatus = { online: boolean; printer: string | null; availablePrinters: number; message?: string };
type PrintJob = { id: string; fileName: string; status: "queued" | "printing" | "completed" | "failed"; createdAt: string; copies: number; error?: string };

const apiBase = () => window.location.port === "8788" ? window.location.origin : `${window.location.protocol}//${window.location.hostname}:8788`;
const fileTypes = ["application/pdf", "image/png", "image/jpeg"];

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(new Date(value));
}

export default function ServiceHub() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<HubStatus>({ online: false, printer: null, availablePrinters: 0 });
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [copies, setCopies] = useState(1);
  const [paperSize, setPaperSize] = useState("A4");
  const [orientation, setOrientation] = useState("portrait");
  const [monochrome, setMonochrome] = useState(false);
  const [pin, setPin] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [statusResponse, jobsResponse] = await Promise.all([
        fetch(`${apiBase()}/api/status`),
        fetch(`${apiBase()}/api/jobs`),
      ]);
      if (!statusResponse.ok) throw new Error("Printer service unavailable");
      setStatus(await statusResponse.json());
      if (jobsResponse.ok) setJobs((await jobsResponse.json()).jobs ?? []);
    } catch {
      setStatus({ online: false, printer: null, availablePrinters: 0, message: "Start the local printer service" });
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!panelOpen) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setPanelOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [panelOpen]);

  function acceptFile(nextFile?: File) {
    setNotice("");
    if (!nextFile) return;
    if (!fileTypes.includes(nextFile.type) && !/\.(pdf|png|jpe?g)$/i.test(nextFile.name)) {
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
      const response = await fetch(`${apiBase()}/api/print`, { method: "POST", headers: pin ? { "x-service-pin": pin } : {}, body: payload });
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

  const printerName = status.printer || "EPSON L3110";

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
          <span className="network-pill"><i /> Tailscale network</span>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">AI CENTER · INTERNAL SERVICES</p>
          <h1>One hub.<br /><span>Every service.</span></h1>
          <p className="intro">Send a file to the office printer from wherever you are. More AI Center services can join the same secure hub as your needs grow.</p>
          <button className="primary-button" onClick={() => setPanelOpen(true)}>Print a document <span aria-hidden="true">→</span></button>
        </div>
        <aside className="status-card" aria-label="System status">
          <div className="status-top"><span>HUB STATUS</span><span className={status.online ? "live" : "live offline"}><i /> {status.online ? "ONLINE" : "OFFLINE"}</span></div>
          <div className="printer-visual" aria-hidden="true">
            <div className="paper"><span /><span /><span /></div>
            <div className="printer-body"><b>EPSON</b><i /></div>
            <div className="tray" />
          </div>
          <div className="device-row"><div><small>CONNECTED DEVICE</small><strong>{printerName}</strong></div><span className={status.online ? "" : "device-offline"}>{status.online ? "Ready" : "Unavailable"}</span></div>
        </aside>
      </section>

      <section className="services" id="services">
        <div className="section-heading"><div><p className="eyebrow">AVAILABLE NOW</p><h2>Services</h2></div><p>Simple tools for everyday AI Center work.</p></div>
        <div className="service-grid">
          <article className="service-card featured">
            <div className="service-number">01</div>
            <div className="service-icon printer-icon" aria-hidden="true"><span /><i /></div>
            <div><span className="available-tag">AVAILABLE</span><h3>Remote Printing</h3><p>Upload your document, choose the print settings, and send it securely to the office printer.</p></div>
            <button type="button" onClick={() => setPanelOpen(true)}>Open printer <span>→</span></button>
          </article>
          <article className="service-card coming">
            <div className="service-number">02</div>
            <div className="plus" aria-hidden="true">+</div>
            <div><span className="soon-tag">COMING NEXT</span><h3>Your next service</h3><p>This space is ready for another internal workflow whenever the team needs it.</p></div>
          </article>
        </div>
      </section>

      <section className="activity" id="activity">
        <div className="section-heading"><div><p className="eyebrow">RECENT JOBS</p><h2>Print activity</h2></div><button className="text-button" onClick={refresh}>Refresh ↻</button></div>
        <div className="activity-table">
          <div className="activity-head"><span>DOCUMENT</span><span>SUBMITTED</span><span>COPIES</span><span>STATUS</span></div>
          {jobs.length ? jobs.map((job) => <div className="activity-row" key={job.id}><span className="job-file"><i>PDF</i><b>{job.fileName}</b></span><span>{formatTime(job.createdAt)}</span><span>{job.copies}</span><span className={`job-status ${job.status}`}><i />{job.status}</span></div>) : <div className="empty-activity"><b>No print jobs yet</b><span>Your submitted documents will appear here.</span></div>}
        </div>
      </section>

      <footer><span>AI CENTER · UNIVERSITAS BRAWIJAYA</span><span>Private access via Tailscale</span></footer>

      {panelOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPanelOpen(false)}>
        <section className="print-panel" role="dialog" aria-modal="true" aria-labelledby="print-title">
          <div className="panel-header"><div><p className="eyebrow">SERVICE 01</p><h2 id="print-title">Remote printing</h2></div><button className="close-button" onClick={() => setPanelOpen(false)} aria-label="Close print panel">×</button></div>
          <form onSubmit={submitPrint}>
            <div className={`drop-zone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()}>
              <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event: ChangeEvent<HTMLInputElement>) => acceptFile(event.target.files?.[0])} />
              <span className="upload-mark" aria-hidden="true">↑</span>
              {file ? <><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB · Click to replace</small></> : <><strong>Drop your document here</strong><small>or click to browse · PDF, PNG, JPG · max 25 MB</small></>}
            </div>
            <div className="print-options">
              <label>Paper size<select value={paperSize} onChange={(e) => setPaperSize(e.target.value)}><option>A4</option><option>Letter</option><option>Legal</option></select></label>
              <label>Orientation<select value={orientation} onChange={(e) => setOrientation(e.target.value)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
              <label>Copies<input type="number" min="1" max="20" value={copies} onChange={(e) => setCopies(Math.min(20, Math.max(1, Number(e.target.value))))} /></label>
            </div>
            <div className="option-row"><label className="check-label"><input type="checkbox" checked={monochrome} onChange={(e) => setMonochrome(e.target.checked)} /><span /> Black & white</label><label className="pin-label">Access PIN <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Only if configured" /></label></div>
            {notice && <div className="notice" role="status">{notice}</div>}
            <div className="submit-row"><div><i className={status.online ? "" : "offline-dot"} /><span>{status.online ? `${printerName} is ready` : "Printer service is offline"}</span></div><button type="submit" disabled={submitting || !file}>{submitting ? "Submitting…" : "Send to printer"} <span>→</span></button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}
