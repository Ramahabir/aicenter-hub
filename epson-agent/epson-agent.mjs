import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import printerTools from "pdf-to-printer";

// Load .env file automatically if present
try {
  const envPath = path.join(process.cwd(), ".env");
  if (fsSync.existsSync(envPath)) {
    const envRaw = fsSync.readFileSync(envPath, "utf8");
    for (const rawLine of envRaw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq > 0) {
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (_) {}

const { print } = printerTools;
const execFileAsync = promisify(execFile);

const HERMES_URL = (process.env.HERMES_URL || "https://devel-ai.ub.ac.id/service-hub").replace(/\/$/, "");
const CONFIGURED_PRINTER = process.env.PRINTER_NAME || "EPSON L3110";
const AGENT_SECRET = process.env.SERVICE_PIN || process.env.AGENT_SECRET || "aicenter88gacor";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 2500);
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || 8000);

const tempDir = path.join(os.tmpdir(), "ai-center-epson-agent");
await fs.mkdir(tempDir, { recursive: true });

function log(msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [Epson Agent] ${msg}`);
}

async function findLocalPrinter() {
  if (process.platform !== "win32") {
    return { printers: [], selected: null };
  }
  try {
    const command =
      "Get-CimInstance Win32_Printer -Property DeviceID,Name,PrinterPaperNames | Select-Object DeviceID,Name,PrinterPaperNames | ConvertTo-Json -Compress -Depth 4";
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    const parsed = stdout.trim() ? JSON.parse(stdout) : [];
    const printers = (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
      deviceId: item.DeviceID,
      name: item.Name,
      paperSizes: item.PrinterPaperNames || [],
    }));
    const exact = printers.find((p) => p.name.toLowerCase() === CONFIGURED_PRINTER.toLowerCase());
    const epson = printers.find((p) => /epson.*l3110|l3110.*epson/i.test(p.name));
    return { printers, selected: exact || epson || null };
  } catch (err) {
    log(`Warning: Failed to query Windows printers: ${err.message}`);
    return { printers: [], selected: null };
  }
}

let activePrinter = null;
let isCurrentlyPrinting = false;

async function sendHeartbeat() {
  try {
    const { selected, printers } = await findLocalPrinter();
    activePrinter = selected;

    const body = {
      printerName: selected?.name || CONFIGURED_PRINTER,
      availablePrinters: printers.length,
      paperSizes: selected?.paperSizes || ["A4", "Letter"],
      secret: AGENT_SECRET,
    };

    const res = await fetch(`${HERMES_URL}/api/agent/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      if (selected) {
        // Heartbeat ok
      } else {
        log(`⚠️ Warning: "${CONFIGURED_PRINTER}" is not currently plugged in via USB on this PC.`);
      }
    } else {
      log(`⚠️ Heartbeat rejected by server (HTTP ${res.status}). Check SERVICE_PIN/AGENT_SECRET.`);
    }
  } catch (err) {
    log(`⚠️ Cannot reach server at ${HERMES_URL}: ${err.message}`);
  }
}

async function reportJobStatus(jobId, status, error = null) {
  try {
    await fetch(`${HERMES_URL}/api/agent/jobs/${jobId}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Secret": AGENT_SECRET,
      },
      body: JSON.stringify({ status, error }),
    });
  } catch (err) {
    log(`Failed to update job status on server: ${err.message}`);
  }
}

async function pollAndPrint() {
  if (isCurrentlyPrinting) return;

  try {
    const res = await fetch(`${HERMES_URL}/api/agent/poll`, {
      headers: { "X-Agent-Secret": AGENT_SECRET },
    });
    if (!res.ok) return;

    const data = await res.json();
    const jobs = data.jobs || [];
    if (jobs.length === 0) return;

    const job = jobs[0];
    isCurrentlyPrinting = true;
    log(`📥 New print job received: "${job.fileName}" (${job.copies} copy/copies, ${job.paperSize})`);

    await reportJobStatus(job.id, "printing");

    // Ensure printer is connected
    const { selected } = await findLocalPrinter();
    if (!selected) {
      const errMsg = `Printer "${CONFIGURED_PRINTER}" was not found on this AIO PC. Please check the USB cable.`;
      log(`❌ ${errMsg}`);
      await reportJobStatus(job.id, "failed", errMsg);
      isCurrentlyPrinting = false;
      return;
    }

    // Download document from server
    log(`⬇️ Downloading file for job ${job.id}...`);
    const fileRes = await fetch(`${HERMES_URL}/api/agent/jobs/${job.id}/file`, {
      headers: { "X-Agent-Secret": AGENT_SECRET },
    });
    if (!fileRes.ok) {
      log(`❌ Failed to download file from server (HTTP ${fileRes.status})`);
      await reportJobStatus(job.id, "failed", "Failed to download document from server");
      isCurrentlyPrinting = false;
      return;
    }

    const localTempPath = path.join(tempDir, `${job.id}-${job.fileName}`);
    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
    await fs.writeFile(localTempPath, fileBuffer);

    // Print to local USB Epson L3110
    log(`🖨 Sending to "${selected.name}" via Windows Print Spooler...`);
    await print(localTempPath, {
      printer: selected.name,
      copies: job.copies || 1,
      paperSize: job.paperSize || "A4",
      orientation: job.orientation || "portrait",
      monochrome: Boolean(job.monochrome),
      scale: "fit",
      silent: true,
    });

    log(`✅ Printed successfully: "${job.fileName}"`);
    await reportJobStatus(job.id, "completed");

    await fs.unlink(localTempPath).catch(() => {});
  } catch (err) {
    log(`❌ Printing error: ${err.message}`);
  } finally {
    isCurrentlyPrinting = false;
  }
}

log("==================================================");
log("  AI Center UB - Epson L3110 Print Agent");
log("==================================================");
log(`Target Hub: ${HERMES_URL}`);
log(`Target Printer: ${CONFIGURED_PRINTER}`);

const initial = await findLocalPrinter();
if (initial.selected) {
  log(`✓ Local printer detected: "${initial.selected.name}"`);
} else {
  log(`ℹ️ "${CONFIGURED_PRINTER}" not yet detected. Make sure the USB cable is connected and powered on.`);
}

// Send initial heartbeat
await sendHeartbeat();

// Periodic heartbeat & poll loops
setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
setInterval(pollAndPrint, POLL_INTERVAL_MS);
log(`🚀 Agent is running! Polling for 2D print jobs every ${POLL_INTERVAL_MS / 1000}s...`);
