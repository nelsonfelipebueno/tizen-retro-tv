# Tizen Retro TV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tizen web app (.wgt) that emulates SNES games (priority: Super Mario World) and NES games on a Samsung Smart TV 2020 (Tizen 5.5), with USB ROM loading, gamepad/keyboard input, and save states.

**Architecture:** Single-page app with state machine (MENU→ROM_LIST→LOADING→PLAYING↔PAUSED). Emulator engines (xnes asm.js for SNES, JSNES for NES) wrapped behind a common abstraction layer. Canvas 2D rendering, ScriptProcessorNode audio. All files loaded via script tags (no ES modules — Chromium 69 target). ROMs loaded from USB via Tizen filesystem API, with file input fallback for desktop dev.

**Tech Stack:** Vanilla JS (ES6 basic), xnes/snes9x (asm.js), JSNES, fflate (ZIP), Tizen Web API, Canvas 2D, Web Audio API, Gamepad API.

**Critical constraint — xnes input model:** The snes9x asm.js build uses Emscripten's SDL layer which captures DOM keyboard events automatically. Key mappings are compiled into C++ (D=A, C=B, S=X, X=Y, A=L, Z=R, Enter=Start, Space=Select, Arrows=D-pad). Gamepad support requires dispatching synthetic KeyboardEvent objects that Emscripten's SDL shim intercepts.

**Critical constraint — xnes save states:** The snes9x build exports `_S9xAutoSaveSRAM()` for SRAM saves (game-internal saves like Super Mario World's star save). Full freeze/unfreeze save states may not be exported. Save states for SNES will use SRAM persistence; full state snapshots are a stretch goal.

**Critical constraint — xnes .mem file:** The `snes9x.js` file hardcodes the string `snes9x.html.mem` for its memory initialization data. We must set `Module.memoryInitializerPrefixURL = 'lib/xnes/'` before loading the script so it fetches from the correct path.

---

## File Structure

```
tizen-retro-tv/
├── config.xml                  # Tizen manifest with privileges
├── index.html                  # SPA entry point, all script tags
├── css/
│   └── styles.css              # Dark theme, TV-optimized, responsive
├── js/
│   ├── app.js                  # State machine, initialization, screen management
│   ├── emulator-snes.js        # xnes/snes9x wrapper (Module setup, ROM loading, input translation)
│   ├── emulator-nes.js         # JSNES wrapper (NES class, canvas rendering, audio buffering)
│   ├── rom-loader.js           # Tizen filesystem USB scan + file input fallback
│   ├── input.js                # Gamepad polling, keyboard events, Samsung remote registration
│   ├── save-manager.js         # SRAM/state persistence (localStorage + filesystem fallback)
│   └── ui.js                   # DOM manipulation for menus, overlays, notifications
├── lib/
│   ├── xnes/
│   │   ├── snes9x.js           # snes9x asm.js engine (4.19MB, vendored from tjwei/xnes)
│   │   └── snes9x.html.mem     # Memory init data (337KB, vendored)
│   ├── jsnes.min.js            # NES engine (~122KB, vendored from npm jsnes@2)
│   └── fflate.min.js           # ZIP decompression (~3KB, vendored)
├── assets/
│   ├── icons/
│   │   ├── icon-117.png        # Tizen app icon 117x117
│   │   └── icon-512.png        # Tizen app icon 512x512
│   └── img/                    # (empty initially, for future UI assets)
├── build.sh                    # Package as .wgt
├── dist/                       # (gitignored) build output
└── README.md                   # Build, install, and usage instructions
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `config.xml`
- Create: `index.html`
- Create: `css/styles.css`
- Create: `build.sh`
- Create: `.gitignore`
- Create: `assets/icons/icon-117.png`
- Create: `assets/icons/icon-512.png`

- [ ] **Step 1: Create .gitignore**

```
dist/
*.DS_Store
__MACOSX/
node_modules/
```

- [ ] **Step 2: Create config.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets"
        xmlns:tizen="http://tizen.org/ns/widgets"
        id="http://retrotv.app/TizenRetroTV"
        version="1.0.0">
    <tizen:application id="rEtr0tvApp.TizenRetroTV"
                       package="rEtr0tvApp"
                       required_version="5.5"/>
    <content src="index.html"/>
    <name>Retro TV</name>
    <icon src="assets/icons/icon-117.png"/>
    <tizen:privilege name="http://tizen.org/privilege/filesystem.read"/>
    <tizen:privilege name="http://tizen.org/privilege/filesystem.write"/>
    <tizen:privilege name="http://tizen.org/privilege/externalstorage"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
    <feature name="http://tizen.org/feature/screen.size.all"/>
    <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable"/>
</widget>
```

- [ ] **Step 3: Create placeholder icons**

Generate simple 117x117 and 512x512 PNG icons using an inline canvas-to-PNG script (solid color with "R" letter), or use ImageMagick if available:

```bash
# If ImageMagick is installed:
convert -size 117x117 xc:'#1a1a2e' -fill '#e94560' -gravity center -pointsize 60 -annotate 0 'R' assets/icons/icon-117.png
convert -size 512x512 xc:'#1a1a2e' -fill '#e94560' -gravity center -pointsize 260 -annotate 0 'R' assets/icons/icon-512.png

# If not, create minimal valid PNGs programmatically in a node script or use any placeholder PNG
```

- [ ] **Step 4: Create css/styles.css with base dark theme**

```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

:root {
    --bg: #0a0a0a;
    --card-bg: #1a1a2e;
    --accent: #e94560;
    --text: #eaeaea;
    --text-dim: #888;
}

html, body {
    width: 100%;
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 2vmin;
    overflow: hidden;
    -webkit-user-select: none;
    user-select: none;
}

/* Screens */
.screen {
    display: none;
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
}

.screen.active {
    display: flex;
}

/* Menu screen */
#menu-screen {
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4vh;
}

#menu-screen h1 {
    font-size: 6vmin;
    color: var(--accent);
    margin-bottom: 4vh;
}

.system-cards {
    display: flex;
    gap: 4vw;
}

.system-card {
    width: 28vw;
    height: 28vh;
    background: var(--card-bg);
    border: 0.4vmin solid transparent;
    border-radius: 2vmin;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: border-color 0.2s, transform 0.2s;
}

.system-card.selected {
    border-color: var(--accent);
    transform: scale(1.05);
}

.system-card .system-name {
    font-size: 5vmin;
    font-weight: bold;
}

.system-card .system-desc {
    font-size: 2.2vmin;
    color: var(--text-dim);
    margin-top: 1vh;
}

/* ROM list screen */
#romlist-screen {
    flex-direction: column;
    padding: 4vh 6vw;
}

#romlist-screen h2 {
    font-size: 4vmin;
    margin-bottom: 3vh;
}

.rom-list {
    flex: 1;
    overflow-y: auto;
    list-style: none;
}

.rom-item {
    padding: 2vh 2vw;
    font-size: 3vmin;
    border-bottom: 1px solid #222;
    cursor: pointer;
    transition: background 0.15s;
}

.rom-item.selected {
    background: var(--card-bg);
    border-left: 0.5vmin solid var(--accent);
}

.rom-empty {
    color: var(--text-dim);
    font-size: 3vmin;
    text-align: center;
    margin-top: 10vh;
}

/* Game screen */
#game-screen {
    align-items: center;
    justify-content: center;
    background: #000;
}

#game-canvas {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
}

/* Pause overlay */
#pause-overlay {
    display: none;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2vh;
    z-index: 100;
}

#pause-overlay.active {
    display: flex;
}

#pause-overlay h2 {
    font-size: 5vmin;
    margin-bottom: 3vh;
    color: var(--accent);
}

.pause-item {
    font-size: 3.5vmin;
    padding: 2vh 6vw;
    cursor: pointer;
    border-radius: 1vmin;
    transition: background 0.15s;
    min-width: 30vw;
    text-align: center;
}

.pause-item.selected {
    background: var(--card-bg);
    color: var(--accent);
}

.pause-item.disabled {
    color: #444;
    pointer-events: none;
}

/* Loading screen */
#loading-screen {
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 3vh;
}

#loading-screen .spinner {
    width: 8vmin;
    height: 8vmin;
    border: 0.6vmin solid #333;
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

#loading-screen .loading-text {
    font-size: 3vmin;
    color: var(--text-dim);
}

/* Toast notification */
.toast {
    position: fixed;
    bottom: 6vh;
    left: 50%;
    transform: translateX(-50%);
    background: var(--card-bg);
    color: var(--text);
    padding: 1.5vh 4vw;
    border-radius: 1vmin;
    font-size: 2.5vmin;
    z-index: 200;
    opacity: 0;
    transition: opacity 0.3s;
}

.toast.show {
    opacity: 1;
}
```

- [ ] **Step 5: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Retro TV</title>
    <link rel="stylesheet" href="css/styles.css">
</head>
<body>
    <!-- Menu Screen -->
    <div id="menu-screen" class="screen active">
        <h1>RETRO TV</h1>
        <div class="system-cards">
            <div class="system-card selected" data-system="snes">
                <span class="system-name">SNES</span>
                <span class="system-desc">Super Nintendo</span>
            </div>
            <div class="system-card" data-system="nes">
                <span class="system-name">NES</span>
                <span class="system-desc">Nintendo</span>
            </div>
        </div>
    </div>

    <!-- ROM List Screen -->
    <div id="romlist-screen" class="screen">
        <h2 id="romlist-title">SNES ROMs</h2>
        <ul class="rom-list" id="rom-list"></ul>
        <!-- Dev mode file input (hidden on Tizen) -->
        <input type="file" id="file-input" accept=".smc,.sfc,.fig,.nes,.zip" style="display:none">
    </div>

    <!-- Loading Screen -->
    <div id="loading-screen" class="screen">
        <div class="spinner"></div>
        <div class="loading-text">Loading ROM...</div>
    </div>

    <!-- Game Screen -->
    <div id="game-screen" class="screen">
        <canvas id="game-canvas"></canvas>
        <!-- Pause Overlay -->
        <div id="pause-overlay">
            <h2>PAUSED</h2>
            <div class="pause-item selected" data-action="resume">Resume</div>
            <div class="pause-item" data-action="reset">Reset</div>
            <div class="pause-item" data-action="save1">Save State 1</div>
            <div class="pause-item" data-action="save2">Save State 2</div>
            <div class="pause-item" data-action="save3">Save State 3</div>
            <div class="pause-item" data-action="load1">Load State 1</div>
            <div class="pause-item" data-action="load2">Load State 2</div>
            <div class="pause-item" data-action="load3">Load State 3</div>
            <div class="pause-item" data-action="quit">Back to Menu</div>
        </div>
    </div>

    <!-- Toast -->
    <div class="toast" id="toast"></div>

    <!-- globalThis polyfill for Chromium 69 -->
    <script>if(typeof globalThis==='undefined'){window.globalThis=window;}</script>

    <!-- Libraries -->
    <script src="lib/fflate.min.js"></script>
    <!-- SNES engine loaded dynamically by emulator-snes.js -->
    <!-- NES engine loaded dynamically by emulator-nes.js -->

    <!-- App scripts -->
    <script src="js/ui.js"></script>
    <script src="js/input.js"></script>
    <script src="js/rom-loader.js"></script>
    <script src="js/save-manager.js"></script>
    <script src="js/emulator-snes.js"></script>
    <script src="js/emulator-nes.js"></script>
    <script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 6: Create build.sh**

```bash
#!/bin/bash
set -e

DIST_DIR="dist"
WGT_NAME="TizenRetroTV.wgt"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

zip -r "$DIST_DIR/$WGT_NAME" \
  config.xml \
  index.html \
  css/ \
  js/ \
  lib/ \
  assets/ \
  -x "*.DS_Store" "*__MACOSX*" "*.git*" "*.md"

echo ""
echo "========================================="
echo "  Built: $DIST_DIR/$WGT_NAME"
SIZE=$(du -h "$DIST_DIR/$WGT_NAME" | cut -f1)
echo "  Size: $SIZE"
echo "========================================="
echo ""
echo "Deploy to TV:"
echo "  tizen-app-installer -t <TV_IP> $DIST_DIR/$WGT_NAME"
```

- [ ] **Step 7: Make build.sh executable and commit**

```bash
chmod +x build.sh
git add -A
git commit -m "feat: project scaffold — config.xml, index.html, styles, build script"
```

---

## Task 2: Vendor Libraries

**Files:**
- Create: `lib/xnes/snes9x.js` (download)
- Create: `lib/xnes/snes9x.html.mem` (download)
- Create: `lib/jsnes.min.js` (download)
- Create: `lib/fflate.min.js` (download)

- [ ] **Step 1: Download xnes snes9x asm.js engine**

```bash
mkdir -p lib/xnes
curl -L -o lib/xnes/snes9x.js https://tjwei.github.io/xnes/snes9x.js
curl -L -o lib/xnes/snes9x.html.mem https://tjwei.github.io/xnes/snes9x.html.mem
```

Verify sizes:
```bash
ls -lh lib/xnes/
# snes9x.js should be ~4.2MB
# snes9x.html.mem should be ~337KB
```

- [ ] **Step 2: Download JSNES**

```bash
curl -L -o lib/jsnes.min.js https://unpkg.com/jsnes@2/dist/jsnes.min.js
```

Verify:
```bash
ls -lh lib/jsnes.min.js
# Should be ~122KB
```

- [ ] **Step 3: Download fflate**

```bash
curl -L -o lib/fflate.min.js https://unpkg.com/fflate@0.8.2/umd/index.js
```

Verify:
```bash
ls -lh lib/fflate.min.js
# Should be ~30KB (UMD bundle)
```

- [ ] **Step 4: Commit vendored libraries**

```bash
git add lib/
git commit -m "feat: vendor xnes snes9x, jsnes, fflate libraries"
```

---

## Task 3: UI Module

**Files:**
- Create: `js/ui.js`

This module handles all DOM manipulation: showing/hiding screens, updating lists, toast notifications, and menu navigation state.

- [ ] **Step 1: Create js/ui.js**

```javascript
var UI = (function() {
    'use strict';

    var screens = {
        menu: document.getElementById('menu-screen'),
        romlist: document.getElementById('romlist-screen'),
        loading: document.getElementById('loading-screen'),
        game: document.getElementById('game-screen')
    };

    var pauseOverlay = document.getElementById('pause-overlay');
    var toastEl = document.getElementById('toast');
    var romListEl = document.getElementById('rom-list');
    var romListTitle = document.getElementById('romlist-title');
    var toastTimeout = null;

    function showScreen(name) {
        Object.keys(screens).forEach(function(key) {
            screens[key].classList.remove('active');
        });
        if (screens[name]) {
            screens[name].classList.add('active');
        }
        if (name !== 'game') {
            hidePause();
        }
    }

    function showPause() {
        pauseOverlay.classList.add('active');
        var items = pauseOverlay.querySelectorAll('.pause-item');
        items.forEach(function(item) { item.classList.remove('selected'); });
        items[0].classList.add('selected');
    }

    function hidePause() {
        pauseOverlay.classList.remove('active');
    }

    function isPauseVisible() {
        return pauseOverlay.classList.contains('active');
    }

    function toast(message, durationMs) {
        durationMs = durationMs || 2000;
        toastEl.textContent = message;
        toastEl.classList.add('show');
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(function() {
            toastEl.classList.remove('show');
        }, durationMs);
    }

    function renderRomList(roms, system) {
        romListTitle.textContent = system.toUpperCase() + ' ROMs';
        romListEl.innerHTML = '';

        if (roms.length === 0) {
            var emptyDiv = document.createElement('div');
            emptyDiv.className = 'rom-empty';
            emptyDiv.textContent = 'No ROMs found. Plug in a USB drive with .' +
                (system === 'snes' ? 'smc/.sfc' : 'nes') + ' files.';

            // Dev mode: show file picker button
            if (!window.tizen) {
                var btn = document.createElement('div');
                btn.className = 'pause-item';
                btn.style.marginTop = '4vh';
                btn.textContent = 'Load ROM from file...';
                btn.onclick = function() {
                    document.getElementById('file-input').click();
                };
                emptyDiv.appendChild(btn);
            }

            romListEl.appendChild(emptyDiv);
            return;
        }

        roms.forEach(function(rom, index) {
            var li = document.createElement('li');
            li.className = 'rom-item' + (index === 0 ? ' selected' : '');
            li.textContent = rom.name;
            li.dataset.index = index;
            romListEl.appendChild(li);
        });
    }

    // Generic list navigation (works for menu cards, rom list, pause items)
    function navigateList(containerSelector, direction) {
        var items = document.querySelectorAll(containerSelector);
        if (items.length === 0) return -1;

        var currentIndex = -1;
        items.forEach(function(item, i) {
            if (item.classList.contains('selected')) currentIndex = i;
        });

        var newIndex = currentIndex;
        if (direction === 'down' || direction === 'right') {
            newIndex = Math.min(currentIndex + 1, items.length - 1);
        } else if (direction === 'up' || direction === 'left') {
            newIndex = Math.max(currentIndex - 1, 0);
        }

        if (newIndex !== currentIndex) {
            items[currentIndex].classList.remove('selected');
            items[newIndex].classList.add('selected');
            // Scroll into view for long lists
            if (items[newIndex].scrollIntoView) {
                items[newIndex].scrollIntoView({ block: 'nearest' });
            }
        }

        return newIndex;
    }

    function getSelectedIndex(containerSelector) {
        var items = document.querySelectorAll(containerSelector);
        for (var i = 0; i < items.length; i++) {
            if (items[i].classList.contains('selected')) return i;
        }
        return 0;
    }

    function getSelectedData(containerSelector, dataKey) {
        var items = document.querySelectorAll(containerSelector);
        for (var i = 0; i < items.length; i++) {
            if (items[i].classList.contains('selected')) {
                return items[i].dataset[dataKey];
            }
        }
        return null;
    }

    function updateSaveSlots(slots) {
        // slots = { 1: true/false, 2: true/false, 3: true/false }
        var items = pauseOverlay.querySelectorAll('.pause-item');
        items.forEach(function(item) {
            var action = item.dataset.action;
            if (action && action.indexOf('load') === 0) {
                var slot = parseInt(action.replace('load', ''));
                if (slots[slot]) {
                    item.classList.remove('disabled');
                } else {
                    item.classList.add('disabled');
                }
            }
        });
    }

    function resizeCanvas(canvas, nativeWidth, nativeHeight) {
        var windowW = window.innerWidth;
        var windowH = window.innerHeight;
        var aspectRatio = nativeWidth / nativeHeight;
        var canvasW, canvasH;

        if (windowW / windowH > aspectRatio) {
            canvasH = windowH;
            canvasW = canvasH * aspectRatio;
        } else {
            canvasW = windowW;
            canvasH = canvasW / aspectRatio;
        }

        canvas.style.width = Math.floor(canvasW) + 'px';
        canvas.style.height = Math.floor(canvasH) + 'px';
    }

    return {
        showScreen: showScreen,
        showPause: showPause,
        hidePause: hidePause,
        isPauseVisible: isPauseVisible,
        toast: toast,
        renderRomList: renderRomList,
        navigateList: navigateList,
        getSelectedIndex: getSelectedIndex,
        getSelectedData: getSelectedData,
        updateSaveSlots: updateSaveSlots,
        resizeCanvas: resizeCanvas
    };
})();
```

- [ ] **Step 2: Verify in Chrome**

Open `index.html` in Chrome. You should see the dark menu screen with SNES and NES cards. Open the browser console and test:
```javascript
UI.showScreen('romlist');  // should show ROM list
UI.showScreen('loading');  // should show spinner
UI.showScreen('game');     // should show black game screen
UI.showScreen('menu');     // back to menu
UI.toast('Hello!');        // toast should appear and fade
```

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "feat: UI module — screens, navigation, toast, canvas resize"
```

---

## Task 4: Input Module

**Files:**
- Create: `js/input.js`

Handles keyboard events, Gamepad API polling, Samsung TV remote registration, and translates all input sources into a unified callback system.

- [ ] **Step 1: Create js/input.js**

```javascript
var Input = (function() {
    'use strict';

    // SNES button names (used as common language across the app)
    var BUTTONS = {
        UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right',
        A: 'a', B: 'b', X: 'x', Y: 'y',
        L: 'l', R: 'r',
        START: 'start', SELECT: 'select'
    };

    // Default keyboard mapping (SNES-oriented)
    var defaultKeyMap = {
        'ArrowUp': BUTTONS.UP,
        'ArrowDown': BUTTONS.DOWN,
        'ArrowLeft': BUTTONS.LEFT,
        'ArrowRight': BUTTONS.RIGHT,
        'f': BUTTONS.A,
        'd': BUTTONS.B,
        's': BUTTONS.X,
        'a': BUTTONS.Y,
        'q': BUTTONS.L,
        'w': BUTTONS.R,
        'Enter': BUTTONS.START,
        'Shift': BUTTONS.SELECT
    };

    // xnes snes9x SDL key mappings (what Emscripten expects)
    // These are the DOM key values that SDL maps to SNES buttons
    var snesKeyMap = {
        'up': 'ArrowUp',
        'down': 'ArrowDown',
        'left': 'ArrowLeft',
        'right': 'ArrowRight',
        'a': 'd',         // SNES A = keyboard D in xnes
        'b': 'c',         // SNES B = keyboard C in xnes
        'x': 's',         // SNES X = keyboard S in xnes
        'y': 'x',         // SNES Y = keyboard X in xnes
        'l': 'a',         // SNES L = keyboard A in xnes
        'r': 'z',         // SNES R = keyboard Z in xnes
        'start': 'Enter',
        'select': ' '     // Space
    };

    var keyMap = {};
    var callbacks = { menu: null, game: null };
    var gamepadPollInterval = null;
    var prevGamepadState = {};

    // Gamepad button mapping (Xbox layout)
    var gamepadMap = {
        0: BUTTONS.A,      // A
        1: BUTTONS.B,      // B
        2: BUTTONS.X,      // X
        3: BUTTONS.Y,      // Y
        4: BUTTONS.L,      // LB
        5: BUTTONS.R,      // RB
        8: BUTTONS.SELECT, // Back/View
        9: BUTTONS.START   // Start/Menu
    };

    function init() {
        loadKeyMap();
        setupKeyboard();
        setupTVRemote();
        startGamepadPolling();
    }

    function loadKeyMap() {
        var saved = localStorage.getItem('input_config');
        if (saved) {
            try { keyMap = JSON.parse(saved); } catch(e) { keyMap = defaultKeyMap; }
        } else {
            keyMap = defaultKeyMap;
        }
    }

    function saveKeyMap(newMap) {
        keyMap = newMap;
        localStorage.setItem('input_config', JSON.stringify(keyMap));
    }

    function setMenuCallback(cb) {
        callbacks.menu = cb;  // cb(action: 'up'|'down'|'left'|'right'|'enter'|'back')
    }

    function setGameCallback(cb) {
        callbacks.game = cb;  // cb(button, pressed)
    }

    // Dispatch synthetic keyboard event for xnes SDL layer
    function dispatchSnesKey(snesButton, pressed) {
        var keyValue = snesKeyMap[snesButton];
        if (!keyValue) return;

        var eventType = pressed ? 'keydown' : 'keyup';
        var event = new KeyboardEvent(eventType, {
            key: keyValue,
            code: keyValue === ' ' ? 'Space' : 'Key' + keyValue.toUpperCase(),
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);
    }

    function setupKeyboard() {
        document.addEventListener('keydown', function(e) {
            var button = keyMap[e.key];
            if (!button) {
                // Menu-specific keys
                if (e.key === 'Escape' || e.key === 'Backspace') {
                    if (callbacks.menu) callbacks.menu('back');
                    e.preventDefault();
                    return;
                }
                return;
            }
            e.preventDefault();

            if (callbacks.game) {
                callbacks.game(button, true);
            }
            if (callbacks.menu) {
                if (button === BUTTONS.UP) callbacks.menu('up');
                else if (button === BUTTONS.DOWN) callbacks.menu('down');
                else if (button === BUTTONS.LEFT) callbacks.menu('left');
                else if (button === BUTTONS.RIGHT) callbacks.menu('right');
                else if (button === BUTTONS.START || button === BUTTONS.A) callbacks.menu('enter');
                else if (button === BUTTONS.B) callbacks.menu('back');
            }
        });

        document.addEventListener('keyup', function(e) {
            var button = keyMap[e.key];
            if (!button) return;
            e.preventDefault();
            if (callbacks.game) {
                callbacks.game(button, false);
            }
        });
    }

    function setupTVRemote() {
        if (!window.tizen || !tizen.tvinputdevice) return;

        var keysToRegister = [
            'MediaPlay', 'MediaPause', 'MediaPlayPause',
            'MediaStop', 'MediaRewind', 'MediaFastForward',
            'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'
        ];

        keysToRegister.forEach(function(keyName) {
            try {
                tizen.tvinputdevice.registerKey(keyName);
            } catch(e) {
                // Key may not be available on all remotes
            }
        });
    }

    function startGamepadPolling() {
        gamepadPollInterval = setInterval(pollGamepads, 16); // ~60fps
    }

    function stopGamepadPolling() {
        if (gamepadPollInterval) {
            clearInterval(gamepadPollInterval);
            gamepadPollInterval = null;
        }
    }

    function pollGamepads() {
        var gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (var gi = 0; gi < gamepads.length; gi++) {
            var gp = gamepads[gi];
            if (!gp) continue;

            var id = gp.index;
            if (!prevGamepadState[id]) prevGamepadState[id] = { buttons: {}, axes: {} };
            var prev = prevGamepadState[id];

            // Buttons
            for (var bi = 0; bi < gp.buttons.length; bi++) {
                var pressed = gp.buttons[bi].pressed;
                var wasPressed = prev.buttons[bi] || false;

                if (pressed !== wasPressed) {
                    prev.buttons[bi] = pressed;
                    var button = gamepadMap[bi];
                    if (button) {
                        if (callbacks.game) callbacks.game(button, pressed);
                        if (pressed && callbacks.menu) {
                            if (button === BUTTONS.A || button === BUTTONS.START) callbacks.menu('enter');
                            else if (button === BUTTONS.B) callbacks.menu('back');
                        }
                    }
                }
            }

            // D-pad via axes (axis 0 = horizontal, axis 1 = vertical)
            if (gp.axes.length >= 2) {
                var axisX = gp.axes[0];
                var axisY = gp.axes[1];
                var threshold = 0.5;

                var left = axisX < -threshold;
                var right = axisX > threshold;
                var up = axisY < -threshold;
                var down = axisY > threshold;

                if (left !== (prev.axes.left || false)) {
                    prev.axes.left = left;
                    if (callbacks.game) callbacks.game(BUTTONS.LEFT, left);
                    if (left && callbacks.menu) callbacks.menu('left');
                }
                if (right !== (prev.axes.right || false)) {
                    prev.axes.right = right;
                    if (callbacks.game) callbacks.game(BUTTONS.RIGHT, right);
                    if (right && callbacks.menu) callbacks.menu('right');
                }
                if (up !== (prev.axes.up || false)) {
                    prev.axes.up = up;
                    if (callbacks.game) callbacks.game(BUTTONS.UP, up);
                    if (up && callbacks.menu) callbacks.menu('up');
                }
                if (down !== (prev.axes.down || false)) {
                    prev.axes.down = down;
                    if (callbacks.game) callbacks.game(BUTTONS.DOWN, down);
                    if (down && callbacks.menu) callbacks.menu('down');
                }
            }

            // Check Start+Select combo for pause
            var startPressed = gp.buttons[9] && gp.buttons[9].pressed;
            var selectPressed = gp.buttons[8] && gp.buttons[8].pressed;
            var combo = startPressed && selectPressed;
            if (combo && !prev.pauseCombo) {
                if (callbacks.menu) callbacks.menu('back');
            }
            prev.pauseCombo = combo;
        }
    }

    return {
        BUTTONS: BUTTONS,
        init: init,
        setMenuCallback: setMenuCallback,
        setGameCallback: setGameCallback,
        dispatchSnesKey: dispatchSnesKey,
        snesKeyMap: snesKeyMap,
        loadKeyMap: loadKeyMap,
        saveKeyMap: saveKeyMap,
        stopGamepadPolling: stopGamepadPolling
    };
})();
```

- [ ] **Step 2: Verify in Chrome**

Open `index.html`, open console, test:
```javascript
Input.init();
Input.setMenuCallback(function(action) { console.log('Menu:', action); });
// Press arrow keys — should log "Menu: up/down/left/right"
// Press Enter — should log "Menu: enter"
// Connect a gamepad and press buttons
```

- [ ] **Step 3: Commit**

```bash
git add js/input.js
git commit -m "feat: input module — keyboard, gamepad polling, TV remote, SNES key dispatch"
```

---

## Task 5: ROM Loader Module

**Files:**
- Create: `js/rom-loader.js`

Handles scanning USB paths on Tizen and falling back to file input on desktop.

- [ ] **Step 1: Create js/rom-loader.js**

```javascript
var RomLoader = (function() {
    'use strict';

    var SNES_EXTENSIONS = ['.smc', '.sfc', '.fig'];
    var NES_EXTENSIONS = ['.nes'];
    var ZIP_EXTENSION = '.zip';

    var USB_PATHS = [
        'removable_usb1', 'removable_usb2',
        'removable_usb3', 'removable_usb4'
    ];

    // Cached ROM list: { snes: [{name, path, system}], nes: [...] }
    var cachedRoms = null;

    function getExtension(filename) {
        var idx = filename.lastIndexOf('.');
        if (idx === -1) return '';
        return filename.substring(idx).toLowerCase();
    }

    function getSystem(filename) {
        var ext = getExtension(filename);
        if (SNES_EXTENSIONS.indexOf(ext) !== -1) return 'snes';
        if (NES_EXTENSIONS.indexOf(ext) !== -1) return 'nes';
        return null;
    }

    function cleanName(filename) {
        var idx = filename.lastIndexOf('.');
        if (idx === -1) return filename;
        return filename.substring(0, idx);
    }

    // Tizen filesystem scan
    function scanTizen(callback) {
        if (!window.tizen || !tizen.filesystem) {
            callback([]);
            return;
        }

        var allRoms = [];
        var pendingPaths = USB_PATHS.length;

        USB_PATHS.forEach(function(storageName) {
            try {
                tizen.filesystem.resolve(storageName, function(dir) {
                    scanDirectory(dir, allRoms, function() {
                        pendingPaths--;
                        if (pendingPaths <= 0) callback(allRoms);
                    });
                }, function(err) {
                    // Storage not mounted — skip
                    pendingPaths--;
                    if (pendingPaths <= 0) callback(allRoms);
                }, 'r');
            } catch(e) {
                pendingPaths--;
                if (pendingPaths <= 0) callback(allRoms);
            }
        });
    }

    function scanDirectory(dir, results, done) {
        try {
            dir.listFiles(function(files) {
                var pending = files.length;
                if (pending === 0) { done(); return; }

                files.forEach(function(file) {
                    if (file.isDirectory) {
                        scanDirectory(file, results, function() {
                            pending--;
                            if (pending <= 0) done();
                        });
                    } else {
                        var system = getSystem(file.name);
                        var ext = getExtension(file.name);
                        if (system || ext === ZIP_EXTENSION) {
                            results.push({
                                name: cleanName(file.name),
                                fullName: file.name,
                                path: file.fullPath,
                                system: system || 'zip'
                            });
                        }
                        pending--;
                        if (pending <= 0) done();
                    }
                });
            }, function(err) {
                done();
            });
        } catch(e) {
            done();
        }
    }

    function loadRomTizen(romInfo, callback) {
        tizen.filesystem.resolve(romInfo.path, function(file) {
            file.readAsArrayBuffer(function(buffer) {
                var ext = getExtension(romInfo.fullName);
                if (ext === ZIP_EXTENSION) {
                    extractZip(buffer, callback);
                } else {
                    callback(null, buffer, romInfo.system);
                }
            }, function(err) {
                callback(new Error('Failed to read ROM: ' + err.message));
            });
        }, function(err) {
            callback(new Error('Failed to resolve ROM path: ' + err.message));
        }, 'r');
    }

    function loadRomFile(file, callback) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var buffer = e.target.result;
            var ext = getExtension(file.name);
            var system = getSystem(file.name);

            if (ext === ZIP_EXTENSION) {
                extractZip(buffer, callback);
            } else if (system) {
                callback(null, buffer, system);
            } else {
                callback(new Error('Unsupported file type: ' + file.name));
            }
        };
        reader.onerror = function() {
            callback(new Error('Failed to read file'));
        };
        reader.readAsArrayBuffer(file);
    }

    function extractZip(buffer, callback) {
        try {
            var data = new Uint8Array(buffer);
            var unzipped = fflate.unzipSync(data);
            var romFile = null;
            var romName = null;

            Object.keys(unzipped).forEach(function(name) {
                if (romFile) return; // take first match
                var system = getSystem(name);
                if (system) {
                    romFile = unzipped[name];
                    romName = name;
                }
            });

            if (romFile) {
                callback(null, romFile.buffer, getSystem(romName));
            } else {
                callback(new Error('No ROM found inside ZIP'));
            }
        } catch(e) {
            callback(new Error('Failed to extract ZIP: ' + e.message));
        }
    }

    function scanRoms(forceRefresh, callback) {
        if (cachedRoms && !forceRefresh) {
            callback(cachedRoms);
            return;
        }

        // Try loading from localStorage cache
        if (!forceRefresh) {
            var cached = localStorage.getItem('rom_list_cache');
            if (cached) {
                try {
                    cachedRoms = JSON.parse(cached);
                    callback(cachedRoms);
                    return;
                } catch(e) { /* fall through */ }
            }
        }

        if (!window.tizen) {
            // Dev mode — no scanning, show file picker
            cachedRoms = { snes: [], nes: [] };
            callback(cachedRoms);
            return;
        }

        scanTizen(function(allRoms) {
            cachedRoms = { snes: [], nes: [] };
            allRoms.forEach(function(rom) {
                if (rom.system === 'snes') cachedRoms.snes.push(rom);
                else if (rom.system === 'nes') cachedRoms.nes.push(rom);
                // ZIPs: we'd need to peek inside to categorize — skip for now
            });

            // Sort alphabetically
            cachedRoms.snes.sort(function(a, b) { return a.name.localeCompare(b.name); });
            cachedRoms.nes.sort(function(a, b) { return a.name.localeCompare(b.name); });

            // Cache
            try {
                localStorage.setItem('rom_list_cache', JSON.stringify(cachedRoms));
            } catch(e) { /* localStorage full — ignore */ }

            callback(cachedRoms);
        });
    }

    return {
        scanRoms: scanRoms,
        loadRomTizen: loadRomTizen,
        loadRomFile: loadRomFile,
        getSystem: getSystem
    };
})();
```

- [ ] **Step 2: Commit**

```bash
git add js/rom-loader.js
git commit -m "feat: ROM loader — Tizen USB scan, file input fallback, ZIP extraction"
```

---

## Task 6: Save Manager Module

**Files:**
- Create: `js/save-manager.js`

- [ ] **Step 1: Create js/save-manager.js**

```javascript
var SaveManager = (function() {
    'use strict';

    function romKey(romName) {
        // Simple hash of ROM name
        var hash = 0;
        for (var i = 0; i < romName.length; i++) {
            var chr = romName.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0; // 32bit int
        }
        return 'save_' + Math.abs(hash).toString(36);
    }

    function save(romName, slot, stateData) {
        var key = romKey(romName) + '_' + slot;
        var entry = {
            romName: romName,
            slot: slot,
            timestamp: Date.now(),
            data: stateData
        };

        try {
            localStorage.setItem(key, JSON.stringify(entry));
            return true;
        } catch(e) {
            // localStorage full — try clearing old saves or report error
            console.warn('Save failed (localStorage full?):', e.message);
            return false;
        }
    }

    function load(romName, slot) {
        var key = romKey(romName) + '_' + slot;
        var raw = localStorage.getItem(key);
        if (!raw) return null;
        try {
            var entry = JSON.parse(raw);
            return entry.data;
        } catch(e) {
            return null;
        }
    }

    function getSlotInfo(romName) {
        var slots = {};
        for (var s = 1; s <= 3; s++) {
            var key = romKey(romName) + '_' + s;
            var raw = localStorage.getItem(key);
            if (raw) {
                try {
                    var entry = JSON.parse(raw);
                    slots[s] = {
                        exists: true,
                        timestamp: entry.timestamp,
                        date: new Date(entry.timestamp).toLocaleString()
                    };
                } catch(e) {
                    slots[s] = { exists: false };
                }
            } else {
                slots[s] = { exists: false };
            }
        }
        return slots;
    }

    function deleteSave(romName, slot) {
        var key = romKey(romName) + '_' + slot;
        localStorage.removeItem(key);
    }

    return {
        save: save,
        load: load,
        getSlotInfo: getSlotInfo,
        deleteSave: deleteSave
    };
})();
```

- [ ] **Step 2: Commit**

```bash
git add js/save-manager.js
git commit -m "feat: save manager — localStorage save/load with 3 slots per ROM"
```

---

## Task 7: SNES Emulator Wrapper

**Files:**
- Create: `js/emulator-snes.js`

This is the critical module. Wraps xnes/snes9x asm.js behind the common emulator interface.

- [ ] **Step 1: Create js/emulator-snes.js**

```javascript
var EmulatorSNES = (function() {
    'use strict';

    var canvas = null;
    var isRunning = false;
    var isLoaded = false;
    var romName = '';

    function init(canvasEl, onReady) {
        canvas = canvasEl;

        // Set canvas size to SNES native resolution
        canvas.width = 256;
        canvas.height = 224;

        // Configure Emscripten Module BEFORE loading snes9x.js
        window.Module = {
            canvas: canvas,
            memoryInitializerPrefixURL: 'lib/xnes/',
            preRun: [],
            postRun: [function() {
                isLoaded = true;
                if (onReady) onReady();
            }],
            print: function(text) {
                console.log('[SNES]', text);
            },
            printErr: function(text) {
                console.warn('[SNES]', text);
            },
            setStatus: function(text) {
                if (text) console.log('[SNES Status]', text);
            },
            totalDependencies: 0,
            monitorRunDependencies: function(left) {
                this.totalDependencies = Math.max(this.totalDependencies, left);
            },
            noExitRuntime: true
        };

        // Dynamically load snes9x.js
        var script = document.createElement('script');
        script.src = 'lib/xnes/snes9x.js';
        script.async = true;
        script.onerror = function() {
            console.error('Failed to load snes9x.js');
        };
        document.body.appendChild(script);
    }

    function loadROM(arrayBuffer, name) {
        if (!isLoaded) {
            console.error('SNES engine not loaded yet');
            return false;
        }

        romName = name || 'unknown';

        // Remove old ROM if exists
        try {
            Module.FS_unlink('/_.smc');
        } catch(e) { /* file doesn't exist — ok */ }

        // Write ROM to Emscripten virtual filesystem
        var data = new Uint8Array(arrayBuffer);
        Module.FS_createDataFile('/', '_.smc', data, true, true);

        return true;
    }

    function start() {
        if (!isLoaded) return;
        try {
            Module._run();
            isRunning = true;
        } catch(e) {
            console.error('Failed to start SNES emulation:', e);
        }
    }

    function pause() {
        // Emscripten main loop: pause by setting frame rate to 0
        if (isRunning && Module && Module.pauseMainLoop) {
            Module.pauseMainLoop();
        }
        isRunning = false;
    }

    function resume() {
        if (!isRunning && Module && Module.resumeMainLoop) {
            Module.resumeMainLoop();
        }
        isRunning = true;
    }

    function reset() {
        // Reload ROM: remove and re-add, then re-run
        // This is the simplest approach given xnes's API constraints
        console.warn('SNES reset: reloading page may be required for full reset');
    }

    function setInput(button, pressed) {
        // Dispatch synthetic keyboard events for xnes SDL layer
        Input.dispatchSnesKey(button, pressed);
    }

    function saveSRAM() {
        if (Module && Module._S9xAutoSaveSRAM) {
            Module._S9xAutoSaveSRAM();
            // Read SRAM data from virtual filesystem
            try {
                var sramData = Module.FS_readFile('/_.srm');
                return Array.from(sramData); // Convert to serializable array
            } catch(e) {
                return null; // No SRAM file = game doesn't use battery saves
            }
        }
        return null;
    }

    function loadSRAM(data) {
        if (!Module) return false;
        try {
            Module.FS_unlink('/_.srm');
        } catch(e) { /* doesn't exist */ }

        try {
            var arr = new Uint8Array(data);
            Module.FS_createDataFile('/', '_.srm', arr, true, true);
            return true;
        } catch(e) {
            console.error('Failed to load SRAM:', e);
            return false;
        }
    }

    function setFrameskip(n) {
        if (Module && Module._set_frameskip) {
            Module._set_frameskip(n);
        }
    }

    function destroy() {
        isRunning = false;
        isLoaded = false;
        // Emscripten doesn't cleanly support destroying the Module
        // The safest approach for ROM switching is to reload the page
    }

    return {
        init: init,
        loadROM: loadROM,
        start: start,
        pause: pause,
        resume: resume,
        reset: reset,
        setInput: setInput,
        saveSRAM: saveSRAM,
        loadSRAM: loadSRAM,
        setFrameskip: setFrameskip,
        destroy: destroy,
        isRunning: function() { return isRunning; }
    };
})();
```

- [ ] **Step 2: Commit**

```bash
git add js/emulator-snes.js
git commit -m "feat: SNES emulator wrapper — xnes Module setup, ROM loading, SRAM saves"
```

---

## Task 8: NES Emulator Wrapper

**Files:**
- Create: `js/emulator-nes.js`

- [ ] **Step 1: Create js/emulator-nes.js**

```javascript
var EmulatorNES = (function() {
    'use strict';

    var nes = null;
    var canvas = null;
    var ctx = null;
    var imageData = null;
    var frameBuf32 = null;
    var frameBuf8 = null;
    var audioCtx = null;
    var scriptNode = null;
    var audioBufferLeft = [];
    var audioBufferRight = [];
    var animFrameId = null;
    var isRunning = false;
    var romName = '';

    // JSNES button mapping
    var buttonMap = {
        'up': 4,    // jsnes.Controller.BUTTON_UP
        'down': 5,  // jsnes.Controller.BUTTON_DOWN
        'left': 6,  // jsnes.Controller.BUTTON_LEFT
        'right': 7, // jsnes.Controller.BUTTON_RIGHT
        'a': 0,     // jsnes.Controller.BUTTON_A
        'b': 1,     // jsnes.Controller.BUTTON_B
        'start': 3, // jsnes.Controller.BUTTON_START
        'select': 2 // jsnes.Controller.BUTTON_SELECT
    };

    var engineLoaded = false;

    function init(canvasEl, onReady) {
        canvas = canvasEl;
        canvas.width = 256;
        canvas.height = 240;
        ctx = canvas.getContext('2d');
        imageData = ctx.createImageData(256, 240);

        var buf = new ArrayBuffer(imageData.data.length);
        frameBuf8 = new Uint8ClampedArray(buf);
        frameBuf32 = new Uint32Array(buf);

        // Dynamically load jsnes if not already loaded
        if (window.jsnes) {
            engineLoaded = true;
            if (onReady) onReady();
            return;
        }

        var script = document.createElement('script');
        script.src = 'lib/jsnes.min.js';
        script.onload = function() {
            engineLoaded = true;
            if (onReady) onReady();
        };
        script.onerror = function() {
            console.error('Failed to load jsnes.min.js');
        };
        document.body.appendChild(script);
    }

    function loadROM(arrayBuffer, name) {
        if (!engineLoaded || !window.jsnes) {
            console.error('JSNES not loaded yet');
            return false;
        }

        romName = name || 'unknown';

        // Setup audio
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        scriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
        audioBufferLeft = [];
        audioBufferRight = [];

        scriptNode.onaudioprocess = function(e) {
            var outL = e.outputBuffer.getChannelData(0);
            var outR = e.outputBuffer.getChannelData(1);
            for (var i = 0; i < outL.length; i++) {
                if (audioBufferLeft.length > 0) {
                    outL[i] = audioBufferLeft.shift();
                    outR[i] = audioBufferRight.shift();
                } else {
                    outL[i] = 0;
                    outR[i] = 0;
                }
            }
        };
        scriptNode.connect(audioCtx.destination);

        // Create NES instance
        nes = new jsnes.NES({
            onFrame: function(buffer) {
                for (var i = 0; i < 256 * 240; i++) {
                    frameBuf32[i] = 0xFF000000 | buffer[i];
                }
                imageData.data.set(frameBuf8);
                ctx.putImageData(imageData, 0, 0);
            },
            onAudioSample: function(left, right) {
                audioBufferLeft.push(left);
                audioBufferRight.push(right);
                // Prevent buffer from growing too large
                if (audioBufferLeft.length > 16384) {
                    audioBufferLeft.splice(0, 8192);
                    audioBufferRight.splice(0, 8192);
                }
            },
            emulateSound: true,
            sampleRate: audioCtx.sampleRate
        });

        // Convert ArrayBuffer to Uint8Array for JSNES
        var romData = new Uint8Array(arrayBuffer);
        // JSNES expects a binary string or typed array
        var romStr = '';
        for (var i = 0; i < romData.length; i++) {
            romStr += String.fromCharCode(romData[i]);
        }
        nes.loadROM(romStr);

        return true;
    }

    function start() {
        if (!nes) return;
        isRunning = true;
        gameLoop();
    }

    function gameLoop() {
        if (!isRunning) return;
        nes.frame();
        animFrameId = requestAnimationFrame(gameLoop);
    }

    function pause() {
        isRunning = false;
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
    }

    function resume() {
        if (isRunning) return;
        isRunning = true;
        gameLoop();
    }

    function reset() {
        if (nes) nes.reset();
    }

    function setInput(button, pressed) {
        if (!nes) return;
        var nesButton = buttonMap[button];
        if (nesButton === undefined) return; // X, Y, L, R not used in NES
        if (pressed) {
            nes.buttonDown(1, nesButton);
        } else {
            nes.buttonUp(1, nesButton);
        }
    }

    function saveState() {
        if (!nes) return null;
        return nes.toJSON();
    }

    function loadState(state) {
        if (!nes || !state) return false;
        try {
            nes.fromJSON(state);
            return true;
        } catch(e) {
            console.error('Failed to load NES state:', e);
            return false;
        }
    }

    function destroy() {
        pause();
        if (scriptNode) {
            scriptNode.disconnect();
            scriptNode = null;
        }
        if (audioCtx) {
            audioCtx.close();
            audioCtx = null;
        }
        nes = null;
        isRunning = false;
    }

    return {
        init: init,
        loadROM: loadROM,
        start: start,
        pause: pause,
        resume: resume,
        reset: reset,
        setInput: setInput,
        saveState: saveState,
        loadState: loadState,
        destroy: destroy,
        isRunning: function() { return isRunning; }
    };
})();
```

- [ ] **Step 2: Commit**

```bash
git add js/emulator-nes.js
git commit -m "feat: NES emulator wrapper — JSNES with canvas rendering, audio, save states"
```

---

## Task 9: App Controller (State Machine)

**Files:**
- Create: `js/app.js`

The main controller that wires everything together: state machine, screen transitions, emulator lifecycle.

- [ ] **Step 1: Create js/app.js**

```javascript
var App = (function() {
    'use strict';

    // App state
    var state = 'MENU';  // MENU, ROM_LIST, LOADING, PLAYING, PAUSED
    var currentSystem = 'snes';
    var currentRoms = [];
    var currentRom = null;
    var emulator = null; // EmulatorSNES or EmulatorNES
    var canvas = document.getElementById('game-canvas');

    function init() {
        Input.init();
        Input.setMenuCallback(handleMenuInput);

        // Dev mode: file input handler
        var fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.addEventListener('change', function(e) {
                var file = e.target.files[0];
                if (!file) return;
                var system = RomLoader.getSystem(file.name);
                if (!system) {
                    UI.toast('Unsupported file type');
                    return;
                }
                currentSystem = system;
                currentRom = { name: file.name, system: system };
                setState('LOADING');
                RomLoader.loadRomFile(file, function(err, buffer, sys) {
                    if (err) {
                        UI.toast('Error: ' + err.message);
                        setState('MENU');
                        return;
                    }
                    startEmulator(buffer, file.name);
                });
            });
        }

        // Handle window resize for canvas
        window.addEventListener('resize', function() {
            if (state === 'PLAYING' || state === 'PAUSED') {
                var nativeW = currentSystem === 'snes' ? 256 : 256;
                var nativeH = currentSystem === 'snes' ? 224 : 240;
                UI.resizeCanvas(canvas, nativeW, nativeH);
            }
        });

        setState('MENU');
    }

    function setState(newState) {
        state = newState;

        switch (state) {
            case 'MENU':
                UI.showScreen('menu');
                Input.setMenuCallback(handleMenuInput);
                Input.setGameCallback(null);
                break;

            case 'ROM_LIST':
                UI.showScreen('romlist');
                Input.setMenuCallback(handleRomListInput);
                Input.setGameCallback(null);
                RomLoader.scanRoms(false, function(roms) {
                    currentRoms = roms[currentSystem] || [];
                    UI.renderRomList(currentRoms, currentSystem);
                });
                break;

            case 'LOADING':
                UI.showScreen('loading');
                Input.setMenuCallback(null);
                Input.setGameCallback(null);
                break;

            case 'PLAYING':
                UI.showScreen('game');
                Input.setMenuCallback(handleGameMenuInput);
                Input.setGameCallback(handleGameInput);
                var nativeW = currentSystem === 'snes' ? 256 : 256;
                var nativeH = currentSystem === 'snes' ? 224 : 240;
                UI.resizeCanvas(canvas, nativeW, nativeH);
                break;

            case 'PAUSED':
                UI.showPause();
                Input.setMenuCallback(handlePauseInput);
                if (currentSystem === 'nes') {
                    // NES has full save state support
                    // Check which slots have saves
                    var slots = SaveManager.getSlotInfo(currentRom.name);
                    UI.updateSaveSlots({
                        1: slots[1].exists,
                        2: slots[2].exists,
                        3: slots[3].exists
                    });
                } else {
                    // SNES: SRAM only — hide save state slots or label differently
                    UI.updateSaveSlots({ 1: false, 2: false, 3: false });
                }
                break;
        }
    }

    function handleMenuInput(action) {
        if (state !== 'MENU') return;
        switch (action) {
            case 'left':
            case 'right':
                UI.navigateList('.system-card', action);
                break;
            case 'enter':
                currentSystem = UI.getSelectedData('.system-card', 'system') || 'snes';
                setState('ROM_LIST');
                break;
        }
    }

    function handleRomListInput(action) {
        if (state !== 'ROM_LIST') return;
        switch (action) {
            case 'up':
            case 'down':
                UI.navigateList('.rom-item', action);
                break;
            case 'enter':
                var index = UI.getSelectedIndex('.rom-item');
                if (index >= 0 && index < currentRoms.length) {
                    currentRom = currentRoms[index];
                    setState('LOADING');
                    loadAndStartRom(currentRom);
                }
                break;
            case 'back':
                setState('MENU');
                break;
        }
    }

    function handleGameMenuInput(action) {
        if (state !== 'PLAYING') return;
        if (action === 'back') {
            pauseGame();
        }
    }

    function handlePauseInput(action) {
        if (state !== 'PAUSED') return;
        switch (action) {
            case 'up':
            case 'down':
                UI.navigateList('.pause-item:not(.disabled)', action);
                break;
            case 'enter':
                var pauseAction = UI.getSelectedData('.pause-item', 'action');
                executePauseAction(pauseAction);
                break;
            case 'back':
                resumeGame();
                break;
        }
    }

    function handleGameInput(button, pressed) {
        if (state !== 'PLAYING' || !emulator) return;
        emulator.setInput(button, pressed);
    }

    function loadAndStartRom(rom) {
        if (window.tizen) {
            RomLoader.loadRomTizen(rom, function(err, buffer, system) {
                if (err) {
                    UI.toast('Error: ' + err.message);
                    setState('ROM_LIST');
                    return;
                }
                startEmulator(buffer, rom.name);
            });
        } else {
            // Dev mode — should not reach here normally (file input handles it)
            UI.toast('Use file picker in dev mode');
            setState('ROM_LIST');
        }
    }

    function startEmulator(romBuffer, name) {
        // Clean up previous emulator
        if (emulator && emulator.destroy) {
            emulator.destroy();
        }

        if (currentSystem === 'snes') {
            emulator = EmulatorSNES;
            emulator.init(canvas, function() {
                // Load SRAM if exists
                var sramData = SaveManager.load(name, 'sram');
                if (sramData) {
                    emulator.loadSRAM(sramData);
                }

                emulator.loadROM(romBuffer, name);
                emulator.start();
                setState('PLAYING');
            });
        } else {
            emulator = EmulatorNES;
            emulator.init(canvas, function() {
                emulator.loadROM(romBuffer, name);
                emulator.start();
                setState('PLAYING');
            });
        }
    }

    function pauseGame() {
        if (emulator && emulator.pause) {
            emulator.pause();
        }
        setState('PAUSED');
    }

    function resumeGame() {
        UI.hidePause();
        if (emulator) {
            if (currentSystem === 'snes' && emulator.resume) {
                emulator.resume();
            } else if (emulator.resume) {
                emulator.resume();
            }
        }
        setState('PLAYING');
    }

    function executePauseAction(action) {
        if (!action) return;

        switch (action) {
            case 'resume':
                resumeGame();
                break;
            case 'reset':
                if (emulator && emulator.reset) emulator.reset();
                resumeGame();
                break;
            case 'save1':
            case 'save2':
            case 'save3':
                var saveSlot = parseInt(action.replace('save', ''));
                doSave(saveSlot);
                break;
            case 'load1':
            case 'load2':
            case 'load3':
                var loadSlot = parseInt(action.replace('load', ''));
                doLoad(loadSlot);
                break;
            case 'quit':
                if (emulator && emulator.destroy) emulator.destroy();
                emulator = null;
                setState('MENU');
                break;
        }
    }

    function doSave(slot) {
        if (!emulator || !currentRom) return;

        if (currentSystem === 'nes' && emulator.saveState) {
            var stateData = emulator.saveState();
            if (stateData) {
                var ok = SaveManager.save(currentRom.name, slot, stateData);
                UI.toast(ok ? 'Saved to slot ' + slot : 'Save failed (storage full?)');
            }
        } else if (currentSystem === 'snes' && emulator.saveSRAM) {
            var sram = emulator.saveSRAM();
            if (sram) {
                SaveManager.save(currentRom.name, 'sram', sram);
                UI.toast('SRAM saved');
            } else {
                UI.toast('No SRAM data (game may not support saves)');
            }
        }
    }

    function doLoad(slot) {
        if (!emulator || !currentRom) return;

        if (currentSystem === 'nes' && emulator.loadState) {
            var stateData = SaveManager.load(currentRom.name, slot);
            if (stateData) {
                var ok = emulator.loadState(stateData);
                UI.toast(ok ? 'Loaded slot ' + slot : 'Load failed');
                if (ok) resumeGame();
            } else {
                UI.toast('Slot ' + slot + ' is empty');
            }
        }
    }

    return {
        init: init
    };
})();

// Start the app
document.addEventListener('DOMContentLoaded', function() {
    App.init();
});
```

- [ ] **Step 2: Verify in Chrome**

Open `index.html` in Chrome:
1. Menu screen should appear with SNES and NES cards
2. Arrow keys should navigate between cards (highlight changes)
3. Press Enter on SNES → should go to ROM list screen (empty, with file picker in dev mode)
4. Press Escape → should go back to menu
5. All screen transitions should work

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: app controller — state machine, screen transitions, emulator lifecycle"
```

---

## Task 10: Build, Test on TV, and README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README.md**

```markdown
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
# Clone this repo
cd tizen-retro-tv

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
```

- [ ] **Step 2: Test build**

```bash
chmod +x build.sh
./build.sh
# Should output: dist/TizenRetroTV.wgt with file size
ls -lh dist/TizenRetroTV.wgt
```

- [ ] **Step 3: Test in Chrome**

Open `index.html` in Chrome. Complete flow test:
1. Menu → select SNES → ROM list (empty, dev mode)
2. Use file picker to load a .smc ROM
3. Loading screen → Game screen (canvas should show emulation)
4. Press Escape → Pause overlay should appear
5. Resume → back to game
6. Back to Menu → select NES → same flow with .nes ROM

- [ ] **Step 4: Commit everything**

```bash
git add -A
git commit -m "feat: README, build script — app ready for TV testing"
```

- [ ] **Step 5: Deploy to TV**

```bash
# Make sure TV is in developer mode and on the same network
# Replace IP with your TV's IP address
tizen-app-installer -t <TV_IP> dist/TizenRetroTV.wgt
```

Validate on TV:
1. App launches from TV app list
2. Navigate menus with remote/gamepad
3. Load Super Mario World from USB
4. Game runs (check FPS, audio, input)
5. If SNES doesn't work → pivot to EmulatorJS WASM (documented in spec as fallback)

---

## Task Summary

| Task | Description | Key Output |
|------|-------------|------------|
| 1 | Project scaffold | config.xml, index.html, styles.css, build.sh |
| 2 | Vendor libraries | lib/xnes/, lib/jsnes.min.js, lib/fflate.min.js |
| 3 | UI module | js/ui.js — screens, navigation, toast |
| 4 | Input module | js/input.js — keyboard, gamepad, TV remote |
| 5 | ROM loader | js/rom-loader.js — Tizen USB scan, ZIP, file input |
| 6 | Save manager | js/save-manager.js — localStorage save/load |
| 7 | SNES wrapper | js/emulator-snes.js — xnes Module setup |
| 8 | NES wrapper | js/emulator-nes.js — JSNES canvas/audio |
| 9 | App controller | js/app.js — state machine, wires everything |
| 10 | Build & deploy | README.md, build, test on TV |
