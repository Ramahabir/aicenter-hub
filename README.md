# AI Center Service Hub

A private, extensible internal service portal styled after the AI Center Universitas Brawijaya website. Remote Printing is the first service.

## What it does

- Accepts PDF, PNG, and JPG files up to 25 MB.
- Sends jobs to the Windows printer named `EPSON L3110`.
- Supports A4, Letter, Legal, portrait/landscape, 1–20 copies, and monochrome.
- Processes jobs one at a time and shows recent in-memory activity.
- Exposes one local gateway on port `8788`, suitable for access through Tailscale.
- Can optionally require an access PIN.

## First-time setup

1. Install the Epson L3110 Windows driver and confirm a normal Windows test page prints successfully.
2. Install Node.js 22 or newer and Tailscale on the printer PC.
3. In this folder, run `npm install` and then `npm run build`.
4. Copy `.env.example` to `.env` if the Windows printer name differs or you want an access PIN.
5. Double-click `start-service-hub.cmd`.

From another device signed into the same Tailscale network, open:

`http://<printer-pc-tailscale-ip>:8788`

Run `tailscale ip -4` on the printer PC to find its Tailscale address.

## Configuration

Edit `.env` when needed:

```env
PRINTER_NAME=EPSON L3110
SERVICE_HUB_PIN=
PRINTER_SERVICE_HOST=0.0.0.0
PRINTER_SERVICE_PORT=8788
```

Set a PIN when the tailnet includes users who should not be able to print. Tailscale ACLs can further restrict which users or devices can reach port 8788.

## Development

- `npm run hub:dev` starts the web interface and printer service.
- `npm run build` creates a production build.
- `npm run hub` starts the production build and printer gateway.
- `npm test` verifies the rendered hub and local print-service safeguards.

Uploaded files are placed in the Windows temporary directory only while queued or printing, then deleted. Print history is intentionally kept only in memory and resets whenever the service restarts.
