import mqtt from "mqtt";

console.log("Connecting to Bambu P1S at 192.168.0.101:8883...");
const client = mqtt.connect("mqtts://192.168.0.101:8883", {
  username: "bblp",
  password: "8a026cb8",
  rejectUnauthorized: false,
  connectTimeout: 5000,
});

client.on("connect", () => {
  console.log("SUCCESS: Connected to Bambu P1S over TLS MQTT!");
  client.subscribe("device/01P00C590901639/report", (err) => {
    if (err) console.error("Subscribe error:", err);
    else console.log("Subscribed to device/01P00C590901639/report. Waiting for telemetry packet...");
  });
});

client.on("message", (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    const print = data.print;
    if (print) {
      console.log("TELEMETRY RECEIVED:");
      console.log("- Gcode State:", print.gcode_state);
      console.log("- Nozzle Temp:", print.nozzle_temper, "Target:", print.nozzle_target_temper);
      console.log("- Bed Temp:", print.bed_temper, "Target:", print.bed_target_temper);
      console.log("- Progress %:", print.mc_percent);
      console.log("- Subtask Name:", print.subtask_name);
      client.end();
      process.exit(0);
    }
  } catch (err) {
    console.error("Parse error:", err);
  }
});

client.on("error", (err) => {
  console.error("MQTT Error:", err.message);
  client.end();
});

setTimeout(() => {
  console.log("Test finished waiting for packet.");
  client.end();
  process.exit(0);
}, 6000);
