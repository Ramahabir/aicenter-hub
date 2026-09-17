import tls from "node:tls";
import { EventEmitter } from "node:events";

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

let cameraSocket = null;
let reconnectTimer = null;
let latestFrame = null;
let lastFrameTimestamp = 0;
let isConnected = false;
let config = {
  host: process.env.BAMBU_PRINTER_IP || "127.0.0.1",
  port: Number(process.env.BAMBU_CAMERA_PORT || 6000),
  accessCode: process.env.BAMBU_ACCESS_CODE || "",
};

export function initBambuCamera(opts = {}) {
  if (opts.host) config.host = opts.host;
  if (opts.port) config.port = Number(opts.port);
  if (opts.accessCode) config.accessCode = opts.accessCode;

  if (config.accessCode && config.host) {
    connectCamera();
  }
}

function connectCamera() {
  if (cameraSocket) return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const { host, port, accessCode } = config;
  if (!host || !accessCode) return;

  console.log(`[Bambu Camera] Connecting to ${host}:${port}...`);

  try {
    const socket = tls.connect({ host, port, rejectUnauthorized: false }, () => {
      console.log(`[Bambu Camera] TLS connection established with ${host}:${port}. Sending auth handshake...`);
      isConnected = true;

      const authBuf = Buffer.alloc(80);
      authBuf.writeUInt32LE(0x40, 0);
      authBuf.writeUInt32LE(0x3000, 4);
      authBuf.write("bblp", 16, "utf8");
      authBuf.write(accessCode, 48, "utf8");
      socket.write(authBuf);
    });

    let buffer = Buffer.alloc(0);

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= 16) {
        const payloadSize = buffer.readUInt32LE(0);

        if (payloadSize === 0 || payloadSize > 2_000_000) {
          const nextSOI = buffer.indexOf(Buffer.from([0xff, 0xd8]));
          if (nextSOI > 0) {
            buffer = buffer.subarray(nextSOI >= 16 ? nextSOI - 16 : nextSOI);
            continue;
          } else {
            buffer = buffer.subarray(1);
            continue;
          }
        }

        if (buffer.length < 16 + payloadSize) {
          break;
        }

        const frame = buffer.subarray(16, 16 + payloadSize);
        buffer = buffer.subarray(16 + payloadSize);

        if (frame[0] === 0xff && frame[1] === 0xd8) {
          latestFrame = frame;
          lastFrameTimestamp = Date.now();
          emitter.emit("frame", frame);
        }
      }
    });

    socket.on("error", (err) => {
      console.warn("[Bambu Camera] Socket error:", err.message);
    });

    socket.on("close", () => {
      console.log("[Bambu Camera] Connection closed. Will reconnect in 3 seconds...");
      isConnected = false;
      cameraSocket = null;
      reconnectTimer = setTimeout(connectCamera, 3000);
    });

    cameraSocket = socket;
  } catch (err) {
    console.error("[Bambu Camera] Failed to connect:", err.message);
    cameraSocket = null;
    reconnectTimer = setTimeout(connectCamera, 5000);
  }
}

export function isCameraOnline() {
  return isConnected && latestFrame !== null && Date.now() - lastFrameTimestamp < 10000;
}

export function getLatestFrame() {
  return latestFrame;
}

export function handleCameraStream(req, res) {
  if (!cameraSocket) {
    connectCamera();
  }

  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=--bambulabframe",
    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    Connection: "close",
    "Access-Control-Allow-Origin": "*",
  });

  if (latestFrame) {
    res.write(`--bambulabframe\r\nContent-Type: image/jpeg\r\nContent-Length: ${latestFrame.length}\r\n\r\n`);
    res.write(latestFrame);
    res.write("\r\n");
  }

  const sendFrame = (frame) => {
    try {
      res.write(`--bambulabframe\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
      res.write(frame);
      res.write("\r\n");
    } catch {
      cleanup();
    }
  };

  emitter.on("frame", sendFrame);

  const cleanup = () => {
    emitter.off("frame", sendFrame);
    try {
      res.end();
    } catch {}
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
  res.on("close", cleanup);
  res.on("error", cleanup);
}

export function handleCameraSnapshot(req, res) {
  if (!cameraSocket) {
    connectCamera();
  }

  if (latestFrame) {
    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Content-Length": latestFrame.length,
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "Access-Control-Allow-Origin": "*",
    });
    return res.end(latestFrame);
  }

  const timer = setTimeout(() => {
    emitter.off("frame", onFirstFrame);
    res.status(503).json({ error: "Camera stream initializing, please retry shortly" });
  }, 4000);

  const onFirstFrame = (frame) => {
    clearTimeout(timer);
    emitter.off("frame", onFirstFrame);
    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Content-Length": frame.length,
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(frame);
  };

  emitter.once("frame", onFirstFrame);
}
