import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

// Auto-load .env from current directory or parent directory if present
function loadEnv() {
  const possiblePaths = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "..", ".env"),
  ];
  for (const p of possiblePaths) {
    if (fsSync.existsSync(p)) {
      try {
        const raw = fsSync.readFileSync(p, "utf8");
        for (const rawLine of raw.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line || line.startsWith("#")) continue;
          const eq = line.indexOf("=");
          if (eq > 0) {
            const k = line.slice(0, eq).trim();
            let v = line.slice(eq + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1);
            }
            if (process.env[k] === undefined) process.env[k] = v;
          }
        }
      } catch {}
      break;
    }
  }
}
loadEnv();

const HERMES_URL = (process.env.HERMES_URL || "https://devel-ai.ub.ac.id/service-hub").replace(/\/$/, "");
const AGENT_SECRET = process.env.SERVICE_PIN || process.env.AGENT_SECRET || "aicenter88gacor";
const BAMBU_STUDIO_PATH =
  process.env.BAMBU_STUDIO_PATH ||
  "C:\\Program Files\\Bambu Studio\\bambu-studio.exe";
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || 8000);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 3000);

const tempDir = path.join(os.tmpdir(), "AICenter3D");
await fs.mkdir(tempDir, { recursive: true });

function log(msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [Bambu AIO Bridge] ${msg}`);
}

function checkStudioInstalled() {
  if (process.platform === "win32") {
    return fsSync.existsSync(BAMBU_STUDIO_PATH);
  }
  return false;
}

const studioAvailable = checkStudioInstalled();
log(`Target Hermes Server: ${HERMES_URL}`);
log(`Bambu Studio Path: ${BAMBU_STUDIO_PATH} (Installed: ${studioAvailable ? "YES" : "NO"})`);

async function sendHeartbeat() {
  try {
    const res = await fetch(`${HERMES_URL}/api/bambu/bridge/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Secret": AGENT_SECRET,
      },
      body: JSON.stringify({
        hostname: os.hostname(),
        platform: process.platform,
        studioInstalled: checkStudioInstalled(),
        studioPath: BAMBU_STUDIO_PATH,
        secret: AGENT_SECRET,
      }),
    });
    if (!res.ok) {
      log(`Heartbeat warning: HTTP ${res.status}`);
    }
  } catch (err) {
    log(`Heartbeat error: ${err.message}`);
  }
}

async function pollTasks() {
  try {
    const res = await fetch(`${HERMES_URL}/api/bambu/bridge/tasks`, {
      headers: {
        "X-Agent-Secret": AGENT_SECRET,
      },
    });
    if (!res.ok) return;
    const data = await res.json();
    const tasks = data.tasks || [];

    for (const task of tasks) {
      await handleTask(task);
    }
  } catch (err) {
    // Silent fail on network glitches
  }
}

async function handleTask(task) {
  const { id, jobId, fileName, downloadUrl } = task;
  log(`Received task ${id}: Open "${fileName}" in Bambu Studio...`);

  const safeFileName = path.basename(fileName || "model.3mf");
  const destPath = path.join(tempDir, `${Date.now()}_${safeFileName}`);

  try {
    const fullDownloadUrl = downloadUrl.startsWith("http")
      ? downloadUrl
      : `${HERMES_URL}${downloadUrl.startsWith("/") ? "" : "/"}${downloadUrl}`;

    log(`Downloading model from ${fullDownloadUrl}...`);
    const fileRes = await fetch(fullDownloadUrl);
    if (!fileRes.ok) throw new Error(`Download failed: HTTP ${fileRes.status}`);

    const arrayBuffer = await fileRes.arrayBuffer();
    await fs.writeFile(destPath, Buffer.from(arrayBuffer));
    log(`File saved to ${destPath} (${arrayBuffer.byteLength} bytes)`);

    // Launch in Bambu Studio
    if (checkStudioInstalled()) {
      log(`Launching Bambu Studio with: ${destPath}`);
      const child = spawn(BAMBU_STUDIO_PATH, [destPath], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      log(`Bambu Studio process dispatched successfully.`);
    } else {
      log(`Bambu Studio not found at default path, launching default shell association...`);
      const cmd = process.platform === "win32" ? "explorer.exe" : "open";
      spawn(cmd, [destPath], { detached: true, stdio: "ignore" }).unref();
    }

    // Report task completion to Hermes
    await fetch(`${HERMES_URL}/api/bambu/bridge/tasks/${id}/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Secret": AGENT_SECRET,
      },
      body: JSON.stringify({
        success: true,
        openedPath: destPath,
      }),
    }).catch(() => {});
  } catch (err) {
    log(`Error handling task ${id}: ${err.message}`);
    await fetch(`${HERMES_URL}/api/bambu/bridge/tasks/${id}/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Secret": AGENT_SECRET,
      },
      body: JSON.stringify({
        success: false,
        error: err.message,
      }),
    }).catch(() => {});
  }
}

// Initial heartbeat
await sendHeartbeat();
log("Bambu AIO Bridge Agent is running. Listening for dispatch commands...");

// Heartbeat interval
setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

// Task polling interval
setInterval(pollTasks, POLL_INTERVAL_MS);
