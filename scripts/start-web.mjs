import { spawn } from "node:child_process";

const port = process.env.WEB_SERVICE_PORT || "3001";
const host = process.env.WEB_SERVICE_HOST || "0.0.0.0";
process.env.PORT = port;

console.log(`[Web Launcher] Starting vinext production server on ${host}:${port}...`);
const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vinext", "start", "-p", port, "-H", host],
  {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, PORT: port },
  }
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

