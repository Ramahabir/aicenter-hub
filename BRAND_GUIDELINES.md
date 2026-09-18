# AI Center Universitas Brawijaya — Brand Guidelines & Design System

> **Official Brand & UI Specification**  
> **Reference Implementation:** AI Center Service Hub ([https://devel-ai.ub.ac.id/service-hub](https://devel-ai.ub.ac.id/service-hub))  
> **Version:** 1.0 (September 2026)  
> **Author:** AI Center UB Digital Team

---

## 1. Brand Essence & Philosophy

The **AI Center Universitas Brawijaya** design system embodies the union of **academic excellence**, **technological rigor**, and **utilitarian elegance**. Inspired by industrial computing, scientific instrumentation, and architectural blueprints, the interface avoids decorative clutter in favor of high-contrast hierarchy, structural geometry, and tactile feedback.

### Core Brand Attributes
1. **Precision & Rigor:** Sharp lines, hairline borders (`1px solid #dfe6eb`), and disciplined data alignment.
2. **Utilitarian Elegance:** Every element serves an operational purpose. Real-time telemetry, device statuses, and clear call-to-actions take precedence.
3. **Academic Prestige:** Grounded in Universitas Brawijaya's distinguished Deep Navy, elevated by vibrant technological gold/orange accents.
4. **Architectural Geometry:** Heavy rectangular blocks, bold offset drop-borders, and disciplined monospaced readouts evoke physical hardware engineering.

---

## 2. Logo & Emblem Specification

### 2.1 The Slanted Parallelogram Emblem
The AI Center symbol consists of **three forward-slanted geometric bars** angled at **-28 degrees**, ascending and descending with deliberate mathematical rhythm.

```
      /|   
  /| / |   
 / |/  |/| 
|  /|  | | 
| / |  |/  
|/  |  /   
    | /    
    |/     
```

- **Primary Color:** Gold / Orange (`#ed8b00`)
- **Slant Angle:** `-28°` (`transform: skew(-28deg)`)
- **Corner Radius:** `1px` (sharp, micro-rounded)

#### Vector Specification (`viewBox="0 0 48 48"`)
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" fill="none">
  <!-- Bar 1: Left (Medium) -->
  <polygon points="15.8,14 24.8,14 10.0,42 1.0,42" fill="#ed8b00" stroke="#ed8b00" stroke-width="1.5" stroke-linejoin="round" />
  <!-- Bar 2: Center (Tallest) -->
  <polygon points="30.0,6 39.0,6 19.8,42 10.8,42" fill="#ed8b00" stroke="#ed8b00" stroke-width="1.5" stroke-linejoin="round" />
  <!-- Bar 3: Right (Shortest) -->
  <polygon points="38.5,19 47.5,19 35.3,42 26.3,42" fill="#ed8b00" stroke="#ed8b00" stroke-width="1.5" stroke-linejoin="round" />
</svg>
```

#### Pure CSS Implementation
```css
.brand-mark {
  width: 40px;
  height: 40px;
  position: relative;
  display: block;
}
.brand-mark i {
  position: absolute;
  display: block;
  width: 9px;
  background: #ed8b00;
  transform: skew(-28deg);
  border-radius: 1px;
}
.brand-mark i:nth-child(1) { height: 28px; left: 4px; top: 8px; }
.brand-mark i:nth-child(2) { height: 36px; left: 16px; top: 0; }
.brand-mark i:nth-child(3) { height: 23px; left: 28px; top: 13px; }
```

### 2.2 Wordmark & Lockup
The wordmark accompanies the mark in a stacked 2-tier lockup:

- **Top Line:** `AI CENTER`
  - Font: **Schibsted Grotesk**, Weight: **900 (Black)**
  - Size: `17px`
  - Letter-Spacing: `0.08em`
  - Color: `#ffffff` on dark, `#003153` on light
- **Bottom Line:** `UNIVERSITAS BRAWIJAYA`
  - Font: **Schibsted Grotesk**, Weight: **700 (Bold)**
  - Size: `8px`
  - Letter-Spacing: `0.16em`
  - Opacity / Tone: `rgba(255, 255, 255, 0.82)` on dark, `#687786` on light
  - Top Margin: `6px`

---

## 3. Color Palette & Design Tokens

```
+-------------------------------------------------------------------------------+
|  DEEP NAVY        BRIGHT BLUE      ACCENT ORANGE    DARK INK       PAPER      |
|  #003153          #004f86          #ed8b00          #183043        #fafbfc    |
+-------------------------------------------------------------------------------+
```

### 3.1 Core Palette

| Token | CSS Variable | Hex Code | Role & Usage |
| :--- | :--- | :--- | :--- |
| **Deep Navy** | `--blue` | `#003153` | Primary institutional color. Hero backgrounds, featured service cards, main accents. |
| **Bright Blue** | `--bright` | `#004f86` | Active interactive states, links, secondary action buttons, focused inputs. |
| **Accent Orange** | `--orange` | `#ed8b00` | Primary action buttons, active navigation indicator, brand mark, badges, highlights. |
| **Dark Ink** | `--ink` | `#183043` | High-contrast body copy and headings on light backgrounds. |
| **Muted Slate** | `--muted` | `#687786` | Secondary text, field labels, table headers, breadcrumbs, timestamps. |
| **Paper** | `--paper` | `#fafbfc` | Page canvas, soft alternating backgrounds, input backgrounds. |
| **Hairline Line** | `--line` | `#dfe6eb` | Card borders, dividers, subtle structural frames. |

### 3.2 Semantic Status & Hardware Indicators

| State | Text Color | Dot / Indicator | Background Pill | Meaning / Context |
| :--- | :--- | :--- | :--- | :--- |
| **Online / Ready** | `#168557` | `#4edb9b` | `#eaf8f1` | Printer ready, connection verified, job completed |
| **Active / Printing** | `#004f86` | `#004f86` | `#eaf2f8` | Hardware running, spooling, active job in progress |
| **Queued / Pending** | `#a26108` | `#ed8b00` | `#fff5e5` | Waiting in queue, admin review pending |
| **Offline / Failed** | `#b3403a` | `#d85d55` | `#fff0ef` | Device disconnected, job cancelled or error |

### 3.3 Hardware Visualization Tones (Industrial Slate)
- **Bambu Lab Chassis:** `#1a2530`
- **Chamber Interior:** `#0b131a`
- **Camera Frame Viewport:** `#080f14` / `#0e1922`
- **Bed & PEI Plate Accent:** `#caa038` / `#f6d365`

---

## 4. Typography System

The primary typeface is **Schibsted Grotesk**, a high-readability Scandinavian grotesk that balances editorial personality with computational clarity.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
```

### 4.1 Type Hierarchy

| Level | Size | Weight | Line Height | Letter Spacing | Styling / Rules |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hero Display H1** | `clamp(52px, 6.6vw, 94px)` | 900 (Black) | `0.93` | `-0.055em` | Tight, monumental. Uses hollow stroke `span` accent: `-webkit-text-stroke: 1px rgba(255,255,255,0.48)`. |
| **Section H2** | `46px` (`38px` mobile) | 900 (Black) | `1.0` | `-0.04em` | Solid, impactful, zero margin bottom. |
| **Panel / Modal H2** | `34px` | 800 (ExtraBold) | `1.1` | `-0.04em` | Direct modal header. |
| **Card H3** | `28px` | 800 (ExtraBold) | `1.2` | `-0.025em` | Service card and feature titles. |
| **Eyebrow Label** | `11px - 12px` | 800 (ExtraBold) | `1.0` | `+0.20em` | All-caps, gold (`#ed8b00`), tracking wide. |
| **Hero Intro Body** | `18px` (`16px` mobile) | 400 (Regular) | `1.7` | normal | Soft blue-gray (`#c5d1da`), max width 610px. |
| **Standard Body** | `14px` | 400 / 600 | `1.6` | normal | High-contrast `#183043`. |
| **Table Header** | `10px` | 800 (ExtraBold) | `1.0` | `+0.12em` | All-caps, muted slate (`#687786`). |
| **Code / Micro Pill** | `9px - 10px` | 800 (ExtraBold) | `1.0` | `+0.05em` | Monospace or Grotesk in `#eaf2f8` container. |

---

## 5. Architectural Layout & Grid

### 5.1 Grid Containers
- **Site Header Max Width:** `1360px`
- **Main Section Max Width:** `1220px`
- **Fluid Horizontal Padding:** `padding: 0 max(5vw, calc((100vw - 1220px)/2))`

### 5.2 Hero Split Grid
- **Columns:** `1.08fr 0.92fr` (Desktop) -> `1fr` (Mobile `< 900px`)
- **Blueprint Rings:** Subtle concentric circular vector in hero background:
  ```css
  .hero:after {
    content: "";
    position: absolute;
    right: -110px;
    top: 70px;
    width: 520px;
    height: 520px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 50%;
    box-shadow: 0 0 0 70px rgba(255, 255, 255, 0.025),
                0 0 0 140px rgba(255, 255, 255, 0.02);
  }
  ```

### 5.3 Signature Design Element: The Architectural Offset Bracket
All primary status cards and featured widgets use an **architectural offset backing border**:

```css
.status-card {
  position: relative;
  background: #ffffff;
  color: var(--ink);
  padding: 24px;
  box-shadow: 0 28px 80px rgba(0, 18, 31, 0.35);
}

/* Offset orange architectural bracket */
.status-card:before {
  content: "";
  position: absolute;
  left: -12px;
  bottom: -12px;
  width: 100%;
  height: 100%;
  border-left: 12px solid var(--orange);
  border-bottom: 12px solid var(--orange);
  z-index: -1;
}
```

---

## 6. Component Library & UI Patterns

### 6.1 Buttons
Buttons feature **sharp rectangular edges** (no heavy pill rounding) for an industrial, engineered feel.

#### Primary Action Button
```css
.primary-button {
  display: inline-flex;
  align-items: center;
  gap: 34px;
  background: #ed8b00;
  color: #101b24;
  border: 0;
  padding: 15px 20px;
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
  border-radius: 0;
  transition: transform 0.15s ease, background 0.15s ease;
}
.primary-button:hover {
  background: #f7991b;
  transform: translateY(-1px);
}
.primary-button span {
  font-size: 20px;
  line-height: 1;
}
```

#### Secondary Brand Button
```css
.secondary-button {
  background: #004f86;
  color: #ffffff;
  border: 0;
  padding: 15px 20px;
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
}
```

### 6.2 Pulsing Live Status Dot
```css
.live-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #4edb9b;
  box-shadow: 0 0 0 4px rgba(78, 219, 155, 0.15);
  animation: livePulse 2s infinite ease-in-out;
}

@keyframes livePulse {
  0%   { box-shadow: 0 0 0 2px rgba(78, 219, 155, 0.3); }
  50%  { box-shadow: 0 0 0 6px rgba(78, 219, 155, 0.05); }
  100% { box-shadow: 0 0 0 2px rgba(78, 219, 155, 0.3); }
}
```

### 6.3 Segmented Device / Tab Switcher
```css
.device-switcher {
  display: flex;
  background: #edf2f7;
  padding: 3px;
  border-radius: 4px;
  gap: 4px;
}
.switcher-btn {
  flex: 1;
  background: transparent;
  border: 0;
  padding: 7px 10px;
  font-size: 11px;
  font-weight: 800;
  color: #687786;
  cursor: pointer;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s ease;
}
.switcher-btn.active {
  background: #ffffff;
  color: #003153;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}
```

### 6.4 Service Grid Cards & Oversized Numbers
Service cards use asymmetric weighting. The featured service uses Deep Navy with an oversized translucent index number (`01`).

```css
.service-card {
  min-height: 345px;
  border: 1px solid #dfe6eb;
  padding: 30px;
  position: relative;
  background: #ffffff;
}
.service-card.featured {
  background: #003153;
  color: #ffffff;
  padding-right: 45%;
}
.service-number {
  position: absolute;
  right: 25px;
  top: 20px;
  font-weight: 900;
  font-size: 72px;
  color: rgba(0, 49, 83, 0.06);
  line-height: 1;
}
.service-card.featured .service-number {
  color: rgba(255, 255, 255, 0.07);
}
```

### 6.5 Modal Panels
Modals feature a top **7px solid orange accent bar** and dark backdrop blur:

```css
.modal-backdrop {
  position: fixed;
  z-index: 50;
  inset: 0;
  background: rgba(0, 24, 42, 0.72);
  backdrop-filter: blur(5px);
  display: grid;
  place-items: center;
  padding: 24px;
}
.print-panel {
  width: min(780px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  background: #ffffff;
  color: #183043;
  box-shadow: 0 40px 100px rgba(0, 15, 25, 0.45);
  border-top: 7px solid #ed8b00;
}
```

### 6.6 Drag-and-Drop File Upload Area
```css
.drop-zone {
  border: 2px dashed #bdc9d1;
  min-height: 170px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  cursor: pointer;
  background: #fafbfc;
  padding: 22px;
  transition: all 0.16s ease;
}
.drop-zone:hover, .drop-zone.dragging {
  border-color: #ed8b00;
  background: #fff9f0;
}
.drop-zone.has-file {
  border-style: solid;
  border-color: #9cc9b5;
  background: #f4fbf7;
}
```

---

## 7. Data Visualization & Hardware Monitors

### 7.1 Temperature Dual-Gauges
Nozzle and Bed temperatures are communicated with compact status cards featuring progress bars:

- **Nozzle Gradient:** `linear-gradient(90deg, #ed8b00, #e53e3e)` (Golden Orange to Fiery Red)
- **Bed Gradient:** `linear-gradient(90deg, #3182ce, #dd6b20)` (Cyan Blue to Warm Amber)
- **Progress Track:** `#e2e8f0`, height `6px`, `border-radius: 3px`

### 7.2 3D Model Specimen & Filament Color Sync
When visualizing 3D print tasks, the virtual printed model actively adopts the exact hex color of the AMS filament spool loaded in the machine (e.g. `#ffffff`, `#ed8b00`, `#168557`), with faceted ambient light shading:
- **Left Facet:** `filter: brightness(0.85)`
- **Right Facet:** `filter: brightness(0.65)`
- **Top Facet:** `filter: brightness(1.15)`

---

## 8. Tone of Voice & Copywriting

| Context | Recommended Copy | Discouraged Copy |
| :--- | :--- | :--- |
| **Eyebrows** | `AI CENTER · INTERNAL SERVICES` | `Welcome to our platform` |
| **Call to Action** | `Print document →` / `Submit 3D model →` | `Click here` / `Submit` |
| **Hardware State** | `Bambu Lab P1S · RUNNING (68%)` | `We are currently printing` |
| **Empty State** | `No active jobs in the queue.` | `Nothing here yet :(` |
| **Validation** | `Requires valid STL mesh ≤ 50 MB` | `Oops! That file is wrong` |

---

## 9. Quick Reference Tokens for Developers

```css
:root {
  /* Brand Core */
  --blue:   #003153; /* Universitas Brawijaya Deep Navy */
  --bright: #004f86; /* Tech Accent Blue */
  --orange: #ed8b00; /* AI Center Signature Gold / Orange */
  
  /* Neutrals */
  --ink:    #183043; /* Primary Body Copy */
  --muted:  #687786; /* Secondary Metadata */
  --paper:  #fafbfc; /* Clean Background Canvas */
  --line:   #dfe6eb; /* Structural Hairline Border */
  
  /* Status Indicators */
  --success: #168557;
  --warning: #a26108;
  --danger:  #b3403a;
  
  /* Typography */
  --font-primary: 'Schibsted Grotesk', -apple-system, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
```

---
*End of Brand Guidelines — AI Center Universitas Brawijaya*
