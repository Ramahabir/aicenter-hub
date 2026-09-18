# AI Center UB - Epson L3110 Print Agent

Lightweight Windows background service for the All-in-One (AIO) PC connected to the **Epson L3110** via USB.

---

## 🚀 Quick Setup on AIO PC (Takes 2 Minutes)

### 1. Prerequisites
- **Windows 10 / 11** on the AIO PC
- **Epson L3110 USB driver installed** (make sure you can print a Windows test page)
- **Node.js (LTS version)** installed from [https://nodejs.org](https://nodejs.org)

### 2. Run the Agent
1. Copy this `epson-agent` folder to the AIO PC (e.g. `C:\epson-agent`).
2. Double-click **`start-agent.cmd`**.
   - It will automatically run `npm install` on first launch.
   - It will detect the local USB printer and connect to `https://devel-ai.ub.ac.id/service-hub`.
   - The website will immediately show:
     ```
     📄 Epson L3110: ONLINE
     ```

---

## ⚡ Start Automatically on Windows Boot (Silent)

To have the agent run automatically whenever the AIO PC turns on without opening a command prompt window:

1. Press `Win + R`, type `shell:startup`, and press **Enter**.
2. Right-click **`run-silent.vbs`** in this folder $\rightarrow$ **Create shortcut**.
3. Move that shortcut into the `Startup` folder.
4. Done! The agent will now run silently in the background whenever Windows starts.

---

## ⚙️ Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `HERMES_URL` | `https://devel-ai.ub.ac.id/service-hub` | The live service hub endpoint |
| `PRINTER_NAME` | `EPSON L3110` | Exact or partial name of printer in Windows |
| `SERVICE_PIN` | `aicenter88gacor` | PIN to authenticate with the server |
| `POLL_INTERVAL_MS` | `2500` | How often to check for new print jobs (2.5s) |
| `HEARTBEAT_INTERVAL_MS` | `8000` | How often to report online status (8s) |
