# Retro TV — NES/SNES Emulator for Samsung Smart TV

Tizen web app (.wgt) that emulates SNES and NES games on Samsung Smart TVs (2020+, Tizen 5.5).

## Quick Start

### Prerequisites

- **MacBook** with Node.js installed
- **Samsung Smart TV** (2020 or newer) on the same Wi-Fi network
- **USB drive** with ROM files (.smc, .sfc, .nes)
- **USB gamepad** plugged into the TV (Xbox layout recommended)

### Install tizen-app-installer-cli

```bash
npm install -g @nicecactus/tizen-app-installer-cli
```

### Enable Developer Mode on TV

1. Open the **Apps** panel on your TV
2. Press **12345** on the remote control
3. Toggle **Developer Mode** to ON
4. Enter your Mac's IP address
5. Restart the TV

### Build and Deploy

```bash
# Build the .wgt package
./build.sh

# Deploy to TV (replace with your TV's IP)
tizen-app-installer -t 192.168.1.XXX dist/TizenRetroTV.wgt
```

### Prepare ROMs

Put ROM files on a USB drive:

```
USB/
├── roms/
│   ├── snes/
│   │   └── Super Mario World.smc
│   └── nes/
│       └── Super Mario Bros.nes
```

Plug the USB into your TV before launching the app.

## Controls

### USB Gamepad (Xbox layout)

| SNES | Gamepad |
|------|---------|
| D-pad | D-pad or Left Stick |
| A | A button |
| B | B button |
| X | X button |
| Y | Y button |
| L | LB |
| R | RB |
| Start | Menu/Start |
| Select | View/Back |
| **Pause** | **Start + Select** |

### Keyboard

| SNES | Key |
|------|-----|
| D-pad | Arrow keys |
| A | F |
| B | D |
| X | S |
| Y | A |
| L | Q |
| R | W |
| Start | Enter |
| Select | Shift |

### TV Remote

- **Arrows**: Navigate menus
- **OK/Enter**: Select
- **Back**: Go back / Pause game

## Development

Open `index.html` directly in Chrome for rapid iteration. The app detects desktop mode and shows a file picker instead of scanning USB drives.

## Engines

- **SNES**: [xnes](https://github.com/tjwei/xnes) (snes9x via Emscripten asm.js) — Snes9x License (non-commercial)
- **NES**: [JSNES](https://github.com/bfirsh/jsnes) — Apache 2.0
- **ZIP**: [fflate](https://github.com/101arrowz/fflate) — MIT

## Known Limitations

- SNES save states are SRAM-only (game's internal saves). Full save state snapshots are not available.
- Switching SNES ROMs may require restarting the app (Emscripten Module limitation).
- NES has full save state support (3 slots per ROM).
- SNES key mappings are hardcoded in the engine — gamepad works via synthetic keyboard events.
