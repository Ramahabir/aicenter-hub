import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import express from "express";
import multer from "multer";
import { createProxyMiddleware } from "http-proxy-middleware";
import printerTools from "pdf-to-printer";
import {
  initBambuMqtt,
  getBambuTelemetry,
  create3DJob,
  list3DJobs,
  update3DJobStatus,
  update3DJobPayment,
  get3DJob,
  launchBambuStudio,
  UPLOAD_DIR,
} from "./bambu-service.mjs";
import {
  initBambuCamera,
  handleCameraStream,
  handleCameraSnapshot,
} from "./bambu-camera.mjs";

const { print } = printerTools;
const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PRINTER_SERVICE_PORT || 3000);
const HOST = process.env.PRINTER_SERVICE_HOST || "0.0.0.0";
const WEB_SERVICE_PORT = Number(process.env.WEB_SERVICE_PORT || 3001);
const WEB_SERVICE_URL = process.env.WEB_SERVICE_URL || `http://localhost:${WEB_SERVICE_PORT}`;
const CONFIGURED_PRINTER = process.env.PRINTER_NAME || "EPSON L3110";
const SERVICE_PIN = process.env.SERVICE_HUB_PIN || "aicenter88gacor";
const BASE_PATH = "/service-hub";
const tempDir = path.join(os.tmpdir(), "ai-center-service-hub");
const clientAssetsDir = path.join(process.cwd(), "dist", "client", "service-hub", "_next");
const testPagePath = path.join(process.cwd(), "output", "pdf", "ai-center-printer-test-page.pdf");
await fs.mkdir(tempDir, { recursive: true });

const allowedExtensions = new Set([".pdf", ".png", ".jpg", ".jpeg"]);
const upload = multer({
  storage: multer.diskStorage({
    destination: tempDir,
    filename: (_request, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => callback(null, allowedExtensions.has(path.extname(file.originalname).toLowerCase())),
});

const allowed3DExtensions = new Set([".stl", ".3mf", ".obj", ".step", ".stp"]);
const upload3D = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_request, file, callback) =>
      callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) =>
    callback(null, allowed3DExtensions.has(path.extname(file.originalname).toLowerCase())),
});

const jobs = new Map();
let queue = Promise.resolve();

function isAllowedOrigin(origin, requestHost) {
  if (!origin) return true;
  try {
    const parsedOrigin = new URL(origin);
    const { hostname } = parsedOrigin;
    if (requestHost && parsedOrigin.host === requestHost) return true;
    if (hostname.endsWith(".ub.ac.id") || hostname === "ub.ac.id") return true;
    return ["localhost", "127.0.0.1", "::1"].includes(hostname) || !hostname.includes(".");
  } catch { return false; }
}

async function findPrinter() {
  if (process.platform !== "win32") {
    return { printers: [], selected: null };
  }
  const command = "Get-CimInstance Win32_Printer -Property DeviceID,Name,PrinterPaperNames | Select-Object DeviceID,Name,PrinterPaperNames | ConvertTo-Json -Compress -Depth 4";
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  const parsed = stdout.trim() ? JSON.parse(stdout) : [];
  const printers = (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({ deviceId: item.DeviceID, name: item.Name, paperSizes: item.PrinterPaperNames || [] }));
  const exact = printers.find((printer) => printer.name.toLowerCase() === CONFIGURED_PRINTER.toLowerCase());
  const epson = printers.find((printer) => /epson.*l3110|l3110.*epson/i.test(printer.name));
  return { printers, selected: exact || epson || null };
}

let remoteAgentState = {
  online: false,
  printerName: null,
  availablePrinters: 0,
  paperSizes: [],
  lastHeartbeat: 0,
};

function isRemoteAgentOnline() {
  return Date.now() - remoteAgentState.lastHeartbeat < 30000;
}

function publicJob(job) {
  const { tempPath, ...safe } = job;
  return safe;
}

function queueJob(job, options) {
  if (process.platform === "win32") {
    queue = queue.then(async () => {
      job.status = "printing";
      try {
        const { selected } = await findPrinter();
        if (!selected) {
          if (isRemoteAgentOnline()) {
            job.status = "queued";
            return;
          }
          throw new Error(`${CONFIGURED_PRINTER} was not found on this PC`);
        }
        await print(job.tempPath, { printer: selected.name, copies: options.copies, paperSize: options.paperSize, orientation: options.orientation, monochrome: options.monochrome, scale: "fit", silent: true });
        job.status = "completed";
        job.completedAt = new Date().toISOString();
        await fs.unlink(job.tempPath).catch(() => {});
      } catch (error) {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : "Printing failed";
        await fs.unlink(job.tempPath).catch(() => {});
      }
    });
  } else {
    // Running on Linux (Hermes server):
    // If the AIO agent is online, the job remains in "queued" status for the agent to pick up!
    if (!isRemoteAgentOnline()) {
      job.status = "failed";
      job.error = "Epson L3110 print agent on AIO PC is currently offline";
      fs.unlink(job.tempPath).catch(() => {});
    }
  }
}

const app = express();
app.disable("x-powered-by");
app.use((request, response, next) => {
  const origin = request.headers.origin;
  const requestHost = request.headers.host;
  if (origin && isAllowedOrigin(origin, requestHost)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Service-Pin, X-Agent-Secret");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (request.method === "OPTIONS") return isAllowedOrigin(origin, requestHost) ? response.sendStatus(204) : response.sendStatus(403);
  if (!isAllowedOrigin(origin, requestHost)) return response.status(403).json({ error: "This origin is not allowed" });
  next();
});
app.use(express.json());

app.use(
  [BASE_PATH + "/_next", "/_next"],
  express.static(clientAssetsDir, { fallthrough: true, immutable: true, maxAge: "1y" }),
);

const faviconPath = path.join(process.cwd(), "public", "favicon.svg");
app.get(["/favicon.svg", BASE_PATH + "/favicon.svg", "/favicon.ico", BASE_PATH + "/favicon.ico"], (_request, response) => {
  response.type("image/svg+xml").sendFile(faviconPath);
});

app.get(["/api/status", BASE_PATH + "/api/status"], async (_request, response) => {
  try {
    let selected = null;
    let printers = [];
    if (process.platform === "win32") {
      const res = await findPrinter();
      printers = res.printers;
      selected = res.selected;
    }
    if (!selected && isRemoteAgentOnline()) {
      selected = { name: remoteAgentState.printerName || CONFIGURED_PRINTER };
      printers = [{ name: remoteAgentState.printerName || CONFIGURED_PRINTER, paperSizes: remoteAgentState.paperSizes }];
    }
    response.json({
      online: Boolean(selected),
      printer: selected?.name || null,
      availablePrinters: printers.length,
      pinRequired: Boolean(SERVICE_PIN),
      agentMode: isRemoteAgentOnline() ? "remote-aio" : "local",
    });
  } catch (error) {
    response.status(503).json({ online: false, printer: null, availablePrinters: 0, message: error instanceof Error ? error.message : "Printer check failed" });
  }
});

app.get(["/api/jobs", BASE_PATH + "/api/jobs"], (_request, response) => {
  response.json({ jobs: Array.from(jobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12).map(publicJob) });
});

app.post(["/api/print", BASE_PATH + "/api/print"], (request, response, next) => upload.single("document")(request, response, (error) => error ? next(error) : next()), (request, response) => {
  if (SERVICE_PIN && request.headers["x-service-pin"] !== SERVICE_PIN) {
    if (request.file?.path) fs.unlink(request.file.path).catch(() => {});
    return response.status(401).json({ error: "Incorrect access PIN" });
  }
  if (!request.file) return response.status(400).json({ error: "Select a PDF, PNG, or JPG file" });
  const copies = Math.min(20, Math.max(1, Number(request.body.copies) || 1));
  const paperSize = ["A4", "Letter", "Legal"].includes(request.body.paperSize) ? request.body.paperSize : "A4";
  const orientation = request.body.orientation === "landscape" ? "landscape" : "portrait";
  const monochrome = request.body.monochrome === "true";
  const job = { id: crypto.randomUUID(), fileName: path.basename(request.file.originalname), tempPath: request.file.path, status: "queued", copies, paperSize, orientation, monochrome, createdAt: new Date().toISOString() };
  jobs.set(job.id, job);
  queueJob(job, { copies, paperSize, orientation, monochrome });
  response.status(202).json({ jobId: job.id, status: job.status });
});

app.post(["/api/test-print", BASE_PATH + "/api/test-print"], async (request, response) => {
  if (SERVICE_PIN && request.headers["x-service-pin"] !== SERVICE_PIN) {
    return response.status(401).json({ error: "Incorrect access PIN" });
  }
  try {
    await fs.access(testPagePath);
    const id = crypto.randomUUID();
    const tempPath = path.join(tempDir, `${id}.pdf`);
    await fs.copyFile(testPagePath, tempPath);
    const job = { id, fileName: "AI-Center-Printer-Test-Page.pdf", tempPath, status: "queued", copies: 1, paperSize: "A4", orientation: "portrait", monochrome: false, createdAt: new Date().toISOString() };
    jobs.set(job.id, job);
    queueJob(job, { copies: 1, paperSize: "A4", orientation: "portrait", monochrome: false });
    response.status(202).json({ jobId: job.id, status: job.status });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "The built-in test page is unavailable" });
  }
});

app.post(["/api/admin/verify", BASE_PATH + "/api/admin/verify"], (request, response) => {
  const { password } = request.body || {};
  if (password === SERVICE_PIN) {
    return response.json({ ok: true, message: "Admin access granted" });
  }
  return response.status(401).json({ ok: false, error: "Incorrect admin password" });
});

// ==========================================
// REMOTE AIO PRINT AGENT API (EPSON L3110)
// ==========================================

// Agent heartbeat
app.post(["/api/agent/heartbeat", BASE_PATH + "/api/agent/heartbeat"], (request, response) => {
  const { printerName, availablePrinters, paperSizes, secret } = request.body || {};
  if (SERVICE_PIN && secret && secret !== SERVICE_PIN) {
    return response.status(401).json({ error: "Invalid agent secret" });
  }
  remoteAgentState = {
    online: true,
    printerName: printerName || CONFIGURED_PRINTER,
    availablePrinters: Number(availablePrinters) || 1,
    paperSizes: paperSizes || ["A4", "Letter"],
    lastHeartbeat: Date.now(),
  };
  response.json({ ok: true, serverTime: new Date().toISOString() });
});

// Agent poll for queued jobs
app.get(["/api/agent/poll", BASE_PATH + "/api/agent/poll"], (request, response) => {
  const secret = request.headers["x-agent-secret"] || request.query.secret;
  if (SERVICE_PIN && secret && secret !== SERVICE_PIN) {
    return response.status(401).json({ error: "Invalid agent secret" });
  }
  remoteAgentState.lastHeartbeat = Date.now();

  const pending = Array.from(jobs.values())
    .filter((j) => j.status === "queued")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  response.json({
    jobs: pending.map((j) => ({
      id: j.id,
      fileName: j.fileName,
      copies: j.copies,
      paperSize: j.paperSize,
      orientation: j.orientation,
      monochrome: j.monochrome,
      createdAt: j.createdAt,
    })),
  });
});

// Agent download file for a job
app.get(["/api/agent/jobs/:id/file", BASE_PATH + "/api/agent/jobs/:id/file"], async (request, response) => {
  const job = jobs.get(request.params.id);
  if (!job || !job.tempPath) {
    return response.status(404).json({ error: "Job or file not found" });
  }
  try {
    await fs.access(job.tempPath);
    response.download(job.tempPath, job.fileName);
  } catch {
    response.status(404).json({ error: "Print file missing on server" });
  }
});

// Agent report job status
app.post(["/api/agent/jobs/:id/status", BASE_PATH + "/api/agent/jobs/:id/status"], async (request, response) => {
  const job = jobs.get(request.params.id);
  if (!job) {
    return response.status(404).json({ error: "Job not found" });
  }
  const { status, error } = request.body || {};
  if (status) job.status = status;
  if (error) job.error = error;
  job.updatedAt = new Date().toISOString();

  if (status === "completed") {
    job.completedAt = new Date().toISOString();
    if (job.tempPath) await fs.unlink(job.tempPath).catch(() => {});
  } else if (status === "failed") {
    if (job.tempPath) await fs.unlink(job.tempPath).catch(() => {});
  }

  response.json({ ok: true, job: publicJob(job) });
});

app.get(["/api/bambu/status", BASE_PATH + "/api/bambu/status"], (_request, response) => {
  response.json({ telemetry: getBambuTelemetry() });
});

app.get(["/api/bambu/camera.mjpeg", BASE_PATH + "/api/bambu/camera.mjpeg"], (request, response) => {
  handleCameraStream(request, response);
});

app.get(["/api/bambu/camera.jpg", BASE_PATH + "/api/bambu/camera.jpg"], (request, response) => {
  handleCameraSnapshot(request, response);
});

app.post(
  ["/api/bambu/jobs", BASE_PATH + "/api/bambu/jobs"],
  (request, response, next) =>
    upload3D.single("model3d")(request, response, (err) => (err ? next(err) : next())),
  async (request, response) => {
    if (!request.file) {
      return response.status(400).json({ error: "Select a 3D model file (.stl, .3mf, .obj, .step)" });
    }
    try {
      let dimensions = { x: 0, y: 0, z: 0 };
      try {
        if (request.body.dimensions) dimensions = JSON.parse(request.body.dimensions);
      } catch {}

      const job = await create3DJob({
        fileName: path.basename(request.file.originalname),
        fileSize: request.file.size,
        filePath: request.file.path,
        customerName: request.body.customerName || "Anonymous",
        customerPhone: request.body.customerPhone || "",
        customerDept: request.body.customerDept || "",
        customerNotes: request.body.customerNotes || "",
        filamentType: request.body.filamentType || "PLA",
        color: request.body.color || "White",
        infill: Number(request.body.infill) || 20,
        quality: request.body.quality || "0.20mm Standard",
        supports: request.body.supports || "auto",
        dimensions,
        volumeCm3: Number(request.body.volumeCm3) || 0,
        estimatedWeightGrams: Number(request.body.estimatedWeightGrams) || 0,
        estimatedHours: Number(request.body.estimatedHours) || 0,
        estimatedPriceRp: Number(request.body.estimatedPriceRp) || 0,
      });

      response.status(201).json({ job });
    } catch (err) {
      response.status(500).json({ error: err instanceof Error ? err.message : "Failed to create 3D job" });
    }
  }
);

app.get(["/api/bambu/jobs", BASE_PATH + "/api/bambu/jobs"], async (request, response) => {
  try {
    const trackingCode = typeof request.query.trackingCode === "string" ? request.query.trackingCode : undefined;
    const status = typeof request.query.status === "string" ? request.query.status : undefined;
    const jobs = await list3DJobs({ trackingCode, status });
    response.json({ jobs });
  } catch (err) {
    response.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch 3D jobs" });
  }
});

app.post(["/api/admin/verify", BASE_PATH + "/api/admin/verify"], (request, response) => {
  const { password } = request.body || {};
  if (!password) {
    return response.status(400).json({ ok: false, error: "Password is required" });
  }
  if (password === SERVICE_PIN) {
    return response.json({ ok: true });
  }
  return response.status(401).json({ ok: false, error: "Incorrect admin password" });
});

app.get(
  ["/api/bambu/jobs/:id/download", BASE_PATH + "/api/bambu/jobs/:id/download"],
  async (request, response) => {
    try {
      const job = await get3DJob(request.params.id);
      if (!job) return response.status(404).json({ error: "Job not found" });
      if (!job.filePath) return response.status(404).json({ error: "Job has no associated file" });

      let filePath = job.filePath;
      if (!path.isAbsolute(filePath)) {
        filePath = path.join(process.cwd(), filePath);
      }

      try {
        await fs.access(filePath);
      } catch {
        return response.status(404).json({ error: "File not found on storage" });
      }

      response.download(filePath, job.fileName);
    } catch (err) {
      response.status(500).json({ error: err instanceof Error ? err.message : "Download failed" });
    }
  }
);

app.post(
  ["/api/bambu/jobs/:id/open-studio", BASE_PATH + "/api/bambu/jobs/:id/open-studio"],
  async (request, response) => {
    if (SERVICE_PIN && request.headers["x-service-pin"] !== SERVICE_PIN) {
      return response.status(401).json({ error: "Incorrect access PIN" });
    }
    try {
      const result = await launchBambuStudio(request.params.id);
      const downloadUrl = `${BASE_PATH}/api/bambu/jobs/${request.params.id}/download`;
      response.json({ ...result, downloadUrl });
    } catch (err) {
      response.status(500).json({ error: err instanceof Error ? err.message : "Failed to prepare Bambu Studio file" });
    }
  }
);

app.get(
  ["/api/bambu/jobs/:id", BASE_PATH + "/api/bambu/jobs/:id"],
  async (request, response) => {
    try {
      const job = await get3DJob(request.params.id);
      if (!job) return response.status(404).json({ error: "Job not found" });
      response.json({ job });
    } catch (err) {
      response.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch job" });
    }
  }
);

app.patch(
  ["/api/bambu/jobs/:id/payment", BASE_PATH + "/api/bambu/jobs/:id/payment"],
  async (request, response) => {
    if (SERVICE_PIN && request.headers["x-service-pin"] !== SERVICE_PIN) {
      return response.status(401).json({ error: "Incorrect access PIN" });
    }
    try {
      const { paymentStatus, paymentMethod, paidAt } = request.body || {};
      if (!paymentStatus) return response.status(400).json({ error: "Missing paymentStatus" });
      const job = await update3DJobPayment(request.params.id, { paymentStatus, paymentMethod, paidAt });
      response.json({ job });
    } catch (err) {
      response.status(500).json({ error: err instanceof Error ? err.message : "Failed to update payment" });
    }
  }
);

app.patch(
  ["/api/bambu/jobs/:id/status", BASE_PATH + "/api/bambu/jobs/:id/status"],
  async (request, response) => {
    if (SERVICE_PIN && request.headers["x-service-pin"] !== SERVICE_PIN) {
      return response.status(401).json({ error: "Incorrect access PIN" });
    }
    try {
      const { status, adminNote } = request.body || {};
      if (!status) return response.status(400).json({ error: "Missing status" });
      const job = await update3DJobStatus(request.params.id, status, adminNote);
      response.json({ job });
    } catch (err) {
      response.status(500).json({ error: err instanceof Error ? err.message : "Failed to update status" });
    }
  }
);

app.use(["/api", BASE_PATH + "/api"], (_request, response) => response.status(404).json({ error: "Unknown API route" }));

app.use((error, _request, response, _next) => {
  const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? "The maximum file size is 25 MB" : "The upload could not be processed";
  response.status(400).json({ error: message });
});

app.use((request, _response, next) => {
  if (request.url === BASE_PATH || request.url.startsWith(BASE_PATH + "?")) {
    request.url = BASE_PATH + "/" + request.url.slice(BASE_PATH.length);
  } else if (!request.url.startsWith(BASE_PATH + "/")) {
    request.url = BASE_PATH + (request.url.startsWith("/") ? request.url : "/" + request.url);
  }
  next();
});
app.use(createProxyMiddleware({ target: WEB_SERVICE_URL, changeOrigin: true, ws: true }));

if (process.platform === "win32") {
  import("./scripts/bambu-bridge.mjs").catch(() => {});
}

initBambuMqtt().catch(console.error);
initBambuCamera();

app.listen(PORT, HOST, () => console.log(`Service Hub ready on http://${HOST}:${PORT} using ${CONFIGURED_PRINTER}`));
if (PORT !== 8788) {
  try {
    app.listen(8788, HOST, () => console.log(`Service Hub gateway also listening on http://${HOST}:8788`));
  } catch (err) {
    console.warn("Could not bind secondary port 8788:", err.message);
  }
}
