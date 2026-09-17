import net from "node:net";

const TARGET_HOST = process.env.BAMBU_PRINTER_IP || "192.168.0.101";
const MQTT_PORT = Number(process.env.BAMBU_BRIDGE_PORT || 8883);
const CAM_PORT = Number(process.env.BAMBU_CAM_BRIDGE_PORT || 6000);

// Forward MQTT (8883)
const mqttServer = net.createServer((socket) => {
  const target = net.connect(MQTT_PORT, TARGET_HOST);
  socket.pipe(target);
  target.pipe(socket);
  socket.on("error", () => target.destroy());
  target.on("error", () => socket.destroy());
});

mqttServer.listen(MQTT_PORT, "0.0.0.0", () => {
  console.log(`[Bambu Bridge] Forwarding 0.0.0.0:${MQTT_PORT} -> ${TARGET_HOST}:${MQTT_PORT}`);
});

// Forward Camera (6000)
const camServer = net.createServer((socket) => {
  const target = net.connect(CAM_PORT, TARGET_HOST);
  socket.pipe(target);
  target.pipe(socket);
  socket.on("error", () => target.destroy());
  target.on("error", () => socket.destroy());
});

mqttServer.on("error", (err) => {
  console.error("[Bambu Bridge] MQTT Server error:", err.message);
});

camServer.listen(CAM_PORT, "0.0.0.0", () => {
  console.log(`[Bambu Bridge] Forwarding 0.0.0.0:${CAM_PORT} -> ${TARGET_HOST}:${CAM_PORT}`);
});

camServer.on("error", (err) => {
  console.error("[Bambu Bridge] Cam Server error:", err.message);
});

export { mqttServer, camServer };

