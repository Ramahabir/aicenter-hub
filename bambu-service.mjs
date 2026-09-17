import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const BAMBU_IP = process.env.BAMBU_PRINTER_IP || "";
const BAMBU_ACCESS_CODE = process.env.BAMBU_ACCESS_CODE || "";
const BAMBU_SERIAL = process.env.BAMBU_SERIAL || "";
const BAMBU_STUDIO_PATH =
  process.env.BAMBU_STUDIO_PATH ||
  "C:\\Program Files\\Bambu Studio\\bambu-studio.exe";

const DATA_DIR = path.join(process.cwd(), "data");
const JOBS_FILE = path.join(DATA_DIR, "bambu-3d-jobs.json");
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "3d-prints");

await fs.mkdir(DATA_DIR, { recursive: true });
await fs.mkdir(UPLOAD_DIR, { recursive: true });

// Live telemetry cached from Bambu Lab P1S MQTT
let printerTelemetry = {
  connected: false,
  model: "Bambu Lab P1S",
  serial: BAMBU_SERIAL,
  ip: BAMBU_IP,
  gcodeState: "OFFLINE", // IDLE, RUNNING, PAUSE, FINISH, FAILED, OFFLINE
  progressPercent: 0,
  remainingMinutes: 0,
  currentLayer: 0,
  totalLayers: 0,
  nozzleTemp: 0,
  nozzleTargetTemp: 0,
  bedTemp: 0,
  bedTargetTemp: 0,
  subtaskName: "",
  amsTrays: [],
  activeTray: null,
  lastUpdated: null,
};

function getFilamentColorName(hex) {
  if (!hex) return "White";
  const clean = hex.replace("#", "").toUpperCase().slice(0, 6);
  if (clean === "FFFFFF") return "White";
  if (clean === "000000") return "Black";
  if (clean === "FF0000") return "Red";
  if (clean === "00FF00" || clean === "008000") return "Green";
  if (clean === "0000FF") return "Blue";
  if (clean === "FFA500" || clean === "FF7F00") return "Orange";
  if (clean === "FFFF00") return "Yellow";
  if (clean === "808080" || clean === "A0A0A0") return "Gray";
  if (clean === "00FFFF") return "Cyan";
  if (clean === "FFC0CB") return "Pink";
  if (clean === "800080") return "Purple";
  return `#${clean}`;
}

let mqttClient = null;

export async function initBambuMqtt() {
  if (!BAMBU_IP || !BAMBU_ACCESS_CODE) {
    console.log(
      "[Bambu Service] BAMBU_PRINTER_IP or BAMBU_ACCESS_CODE not configured in .env. Running in standalone queue mode."
    );
    return;
  }

  try {
    const mqtt = await import("mqtt");
    const brokerUrl = `mqtts://${BAMBU_IP}:8883`;

    console.log(`[Bambu Service] Connecting to Bambu P1S at ${brokerUrl}...`);
    mqttClient = mqtt.connect(brokerUrl, {
      username: "bblp",
      password: BAMBU_ACCESS_CODE,
      rejectUnauthorized: false, // Bambu uses a self-signed certificate in LAN mode
      reconnectPeriod: 10000,
      connectTimeout: 5000,
    });

    mqttClient.on("connect", () => {
      console.log("[Bambu Service] Connected to Bambu P1S over LAN MQTT.");
      printerTelemetry.connected = true;
      printerTelemetry.gcodeState = "IDLE";
      const topic = BAMBU_SERIAL ? `device/${BAMBU_SERIAL}/report` : "device/+/report";
      mqttClient.subscribe(topic);
      if (BAMBU_SERIAL) {
        mqttClient.publish(
          `device/${BAMBU_SERIAL}/request`,
          JSON.stringify({ pushing: { sequence_id: "0", command: "pushall" } })
        );
      }
    });

    setInterval(() => {
      if (mqttClient && printerTelemetry.connected && BAMBU_SERIAL) {
        mqttClient.publish(
          `device/${BAMBU_SERIAL}/request`,
          JSON.stringify({ pushing: { sequence_id: "0", command: "pushall" } })
        );
      }
    }, 20000);

    mqttClient.on("message", (_topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        const printData = payload.print;
        if (!printData) return;

        printerTelemetry.lastUpdated = new Date().toISOString();
        if (printData.gcode_state) {
          printerTelemetry.gcodeState = printData.gcode_state;
        }
        if (typeof printData.mc_percent === "number") {
          printerTelemetry.progressPercent = printData.mc_percent;
        }
        if (typeof printData.mc_remaining_time === "number") {
          printerTelemetry.remainingMinutes = printData.mc_remaining_time;
        }
        if (typeof printData.layer_num === "number") {
          printerTelemetry.currentLayer = printData.layer_num;
        }
        if (typeof printData.total_layer_num === "number") {
          printerTelemetry.totalLayers = printData.total_layer_num;
        }
        if (typeof printData.nozzle_temper === "number") {
          printerTelemetry.nozzleTemp = Math.round(printData.nozzle_temper);
        }
        if (typeof printData.nozzle_target_temper === "number") {
          printerTelemetry.nozzleTargetTemp = Math.round(printData.nozzle_target_temper);
        }
        if (typeof printData.bed_temper === "number") {
          printerTelemetry.bedTemp = Math.round(printData.bed_temper);
        }
        if (typeof printData.bed_target_temper === "number") {
          printerTelemetry.bedTargetTemp = Math.round(printData.bed_target_temper);
        }
        if (printData.subtask_name) {
          printerTelemetry.subtaskName = printData.subtask_name;
        }

        // Parse AMS and Spool Holder (vt_tray) filament information
        const trays = [];
        if (printData.ams && Array.isArray(printData.ams.ams)) {
          for (const unit of printData.ams.ams) {
            if (Array.isArray(unit.tray)) {
              for (const t of unit.tray) {
                if (t.tray_type) {
                  const hex = t.tray_color ? `#${t.tray_color.slice(0, 6)}` : "#ffffff";
                  trays.push({
                    id: String(t.id),
                    type: t.tray_type,
                    color: hex,
                    colorName: getFilamentColorName(hex),
                    remain: t.remain,
                    source: `AMS Slot ${Number(t.id) + 1}`,
                  });
                }
              }
            }
          }
        }

        // Parse external spool holder (vt_tray)
        if (printData.vt_tray && printData.vt_tray.tray_type) {
          const vt = printData.vt_tray;
          const hex = vt.tray_color ? `#${vt.tray_color.slice(0, 6)}` : "#ffffff";
          trays.push({
            id: "254",
            type: vt.tray_type,
            color: hex,
            colorName: getFilamentColorName(hex),
            remain: vt.remain,
            source: "Spool Holder",
          });
        }

        if (trays.length > 0) {
          printerTelemetry.amsTrays = trays;

          // Determine currently selected/loaded tray
          const trayNow = printData.ams?.tray_now;
          if (trayNow !== undefined && trayNow !== "255") {
            printerTelemetry.activeTray = trays.find((t) => t.id === String(trayNow)) || trays[0];
          } else {
            printerTelemetry.activeTray = trays[0];
          }
        }

        if (printerTelemetry.gcodeState === "FINISH" && printerTelemetry.subtaskName) {
          recordFinishedPrint(printerTelemetry.subtaskName).catch(() => {});
        }
      } catch (err) {
        // Ignore message parse errors
      }
    });

    mqttClient.on("error", (err) => {
      printerTelemetry.connected = false;
      printerTelemetry.gcodeState = "OFFLINE";
    });

    mqttClient.on("close", () => {
      printerTelemetry.connected = false;
      printerTelemetry.gcodeState = "OFFLINE";
    });
  } catch (error) {
    console.warn("[Bambu Service] MQTT client initialization deferred:", error.message);
  }
}

export function getBambuTelemetry() {
  return {
    ...printerTelemetry,
    cameraUrl: process.env.BAMBU_CAMERA_URL || "/service-hub/api/bambu/camera.mjpeg",
    isConfigured: Boolean(BAMBU_IP && BAMBU_ACCESS_CODE),
    studioPathConfigured: Boolean(BAMBU_STUDIO_PATH),
  };
}

/**
 * Load jobs from JSON database
 */
async function loadJobs() {
  try {
    const data = await fs.readFile(JOBS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Save jobs to JSON database
 */
async function saveJobs(jobs) {
  await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2), "utf-8");
}

/**
 * Generate human-friendly tracking code (e.g. B3D-9F2A)
 */
function generateTrackingCode() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "B3D-";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

let lastRecordedFinishTask = "";

async function recordFinishedPrint(subtaskName) {
  if (!subtaskName || subtaskName === lastRecordedFinishTask) return;
  try {
    const jobs = await loadJobs();
    const existing = jobs.find(
      (j) => j.fileName.toLowerCase().includes(subtaskName.toLowerCase()) || subtaskName.toLowerCase().includes(j.fileName.toLowerCase())
    );
    if (existing) {
      if (existing.status !== "completed") {
        existing.status = "completed";
        existing.completedAt = new Date().toISOString();
        existing.updatedAt = new Date().toISOString();
        await saveJobs(jobs);
        lastRecordedFinishTask = subtaskName;
      }
    } else {
      const activeFilament = printerTelemetry.activeTray?.type || "ABS";
      const activeColor = printerTelemetry.activeTray?.colorName || "White";
      const newJob = {
        id: crypto.randomUUID(),
        trackingCode: generateTrackingCode(),
        fileName: subtaskName.endsWith(".3mf") || subtaskName.endsWith(".stl") ? subtaskName : `${subtaskName}.3mf`,
        fileSize: 0,
        filePath: "",
        customerName: "AICENTER",
        customerPhone: "",
        customerDept: "AI Center UB",
        customerNotes: "Completed direct print on Bambu Lab P1S",
        filamentType: activeFilament,
        color: activeColor,
        infill: 20,
        quality: "0.20mm Standard",
        supports: "auto",
        dimensions: { x: 0, y: 0, z: 0 },
        volumeCm3: 26.0,
        estimatedWeightGrams: 32.0,
        estimatedHours: 2.1,
        estimatedPriceRp: 8400,
        status: "completed",
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      jobs.unshift(newJob);
      await saveJobs(jobs);
      lastRecordedFinishTask = subtaskName;
    }
  } catch (err) {
    console.warn("[Bambu Service] Failed to record finished print:", err.message);
  }
}

export async function create3DJob(jobInput) {
  const jobs = await loadJobs();
  const id = crypto.randomUUID();
  const trackingCode = generateTrackingCode();

  const newJob = {
    id,
    trackingCode,
    fileName: jobInput.fileName,
    fileSize: jobInput.fileSize,
    filePath: jobInput.filePath,
    customerName: jobInput.customerName || "Anonymous",
    customerPhone: jobInput.customerPhone || "",
    customerDept: jobInput.customerDept || "",
    customerNotes: jobInput.customerNotes || "",
    filamentType: jobInput.filamentType || "PLA",
    color: jobInput.color || "White",
    infill: jobInput.infill || 20,
    quality: jobInput.quality || "0.20mm Standard",
    supports: jobInput.supports || "auto",
    dimensions: jobInput.dimensions || { x: 0, y: 0, z: 0 },
    volumeCm3: jobInput.volumeCm3 || 0,
    estimatedWeightGrams: jobInput.estimatedWeightGrams || 0,
    estimatedHours: jobInput.estimatedHours || 0,
    estimatedPriceRp: jobInput.estimatedPriceRp || 0,
    status: "pending_review", // pending_review, approved, printing, completed, cancelled
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  jobs.unshift(newJob);
  await saveJobs(jobs);
  return newJob;
}

export async function list3DJobs(filters = {}) {
  const jobs = await loadJobs();
  if (filters.trackingCode) {
    return jobs.filter(
      (j) => j.trackingCode.toUpperCase() === filters.trackingCode.toUpperCase()
    );
  }
  if (filters.status) {
    return jobs.filter((j) => j.status === filters.status);
  }
  return jobs;
}

export async function update3DJobStatus(id, newStatus, adminNote = "") {
  const jobs = await loadJobs();
  const job = jobs.find((j) => j.id === id);
  if (!job) throw new Error("Job not found");

  job.status = newStatus;
  job.updatedAt = new Date().toISOString();
  if (adminNote) job.adminNote = adminNote;
  if (newStatus === "completed") {
    job.completedAt = new Date().toISOString();
  }

  await saveJobs(jobs);
  return job;
}

export async function get3DJob(id) {
  const jobs = await loadJobs();
  return jobs.find((j) => j.id === id || j.trackingCode === id);
}

export async function launchBambuStudio(jobId) {
  const jobs = await loadJobs();
  const job = jobs.find((j) => j.id === jobId);
  if (!job) throw new Error("Job not found");

  try {
    await fs.access(job.filePath);
  } catch {
    throw new Error(`Model file not found at ${job.filePath}`);
  }

  try {
    await fs.access(BAMBU_STUDIO_PATH);
    console.log(`[Bambu Service] Opening ${job.filePath} in Bambu Studio...`);
    const child = spawn(BAMBU_STUDIO_PATH, [job.filePath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return { success: true, localLaunched: true, fileName: job.fileName, message: "Bambu Studio launched successfully with 3D model" };
  } catch {
    throw new Error(
      `Bambu Studio executable not found at "${BAMBU_STUDIO_PATH}". Please set BAMBU_STUDIO_PATH in .env.`
    );
    return { success: true, localLaunched: false, fileName: job.fileName, message: "Server is remote (Hermes). File ready for client-side Bambu Studio." };
  }

  console.log(`[Bambu Service] Opening ${job.filePath} in Bambu Studio...`);
  const child = spawn(BAMBU_STUDIO_PATH, [job.filePath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return { success: true, message: "Bambu Studio launched successfully with 3D model" };
}

export { UPLOAD_DIR };

