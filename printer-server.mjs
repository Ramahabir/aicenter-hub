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

const { print } = printerTools;
const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PRINTER_SERVICE_PORT || 8788);
const HOST = process.env.PRINTER_SERVICE_HOST || "0.0.0.0";
const CONFIGURED_PRINTER = process.env.PRINTER_NAME || "EPSON L3110";
const SERVICE_PIN = process.env.SERVICE_HUB_PIN || "";
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

const jobs = new Map();
let queue = Promise.resolve();

function isAllowedOrigin(origin, requestHost) {
  if (!origin) return true;
  try {
    const parsedOrigin = new URL(origin);
    const { hostname } = parsedOrigin;
    if (requestHost && parsedOrigin.host === requestHost) return true;
    return ["localhost", "127.0.0.1", "::1"].includes(hostname) || !hostname.includes(".");
  } catch { return false; }
}

async function findPrinter() {
  const command = "Get-CimInstance Win32_Printer -Property DeviceID,Name,PrinterPaperNames | Select-Object DeviceID,Name,PrinterPaperNames | ConvertTo-Json -Compress -Depth 4";
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  const parsed = stdout.trim() ? JSON.parse(stdout) : [];
  const printers = (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({ deviceId: item.DeviceID, name: item.Name, paperSizes: item.PrinterPaperNames || [] }));
  const exact = printers.find((printer) => printer.name.toLowerCase() === CONFIGURED_PRINTER.toLowerCase());
  const epson = printers.find((printer) => /epson.*l3110|l3110.*epson/i.test(printer.name));
  return { printers, selected: exact || epson || null };
}

function publicJob(job) {
  const { tempPath, ...safe } = job;
  return safe;
}

function queueJob(job, options) {
  queue = queue.then(async () => {
    job.status = "printing";
    try {
      const { selected } = await findPrinter();
      if (!selected) throw new Error(`${CONFIGURED_PRINTER} was not found on this PC`);
      await print(job.tempPath, { printer: selected.name, copies: options.copies, paperSize: options.paperSize, orientation: options.orientation, monochrome: options.monochrome, scale: "fit", silent: true });
      job.status = "completed";
      job.completedAt = new Date().toISOString();
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Printing failed";
    } finally {
      await fs.unlink(job.tempPath).catch(() => {});
    }
  });
}

const app = express();
app.disable("x-powered-by");
app.use((request, response, next) => {
  const origin = request.headers.origin;
  const requestHost = request.headers.host;
  if (origin && isAllowedOrigin(origin, requestHost)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Service-Pin");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (request.method === "OPTIONS") return isAllowedOrigin(origin, requestHost) ? response.sendStatus(204) : response.sendStatus(403);
  if (!isAllowedOrigin(origin, requestHost)) return response.status(403).json({ error: "This origin is not allowed" });
  next();
});

app.use(
  [BASE_PATH + "/_next", "/_next"],
  express.static(clientAssetsDir, { fallthrough: true, immutable: true, maxAge: "1y" }),
);

app.get(["/api/status", BASE_PATH + "/api/status"], async (_request, response) => {
  try {
    const { printers, selected } = await findPrinter();
    response.json({ online: Boolean(selected), printer: selected?.name || null, availablePrinters: printers.length, pinRequired: Boolean(SERVICE_PIN) });
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
app.use(createProxyMiddleware({ target: process.env.WEB_SERVICE_URL || "http://localhost:3000", changeOrigin: true, ws: true }));

app.listen(PORT, HOST, () => console.log(`Service Hub ready on http://${HOST}:${PORT} using ${CONFIGURED_PRINTER}`));
