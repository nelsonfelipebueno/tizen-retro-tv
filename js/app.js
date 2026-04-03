var App = (function() {
    'use strict';

    var state = 'MENU';
    var currentSystem = 'snes';
    var currentRoms = [];
    var currentRom = null;
    var canvas = document.getElementById('game-canvas');

    function init() {
        Input.init();
        Input.setMenuCallback(handleMenuInput);

        // Dev mode: file input
        var fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.addEventListener('change', function(e) {
                var file = e.target.files[0];
                if (!file) return;
                var system = RomLoader.getSystem(file.name);
                if (!system) { UI.toast('Unsupported file'); return; }
                currentSystem = system;
                currentRom = { name: file.name, system: system };
                setState('LOADING');
                var reader = new FileReader();
                reader.onload = function(ev) {
                    if (system === 'snes') startSNES(ev.target.result, file.name);
                    else startNES(ev.target.result, file.name);
                };
                reader.readAsArrayBuffer(file);
            });
        }

        setState('MENU');
    }

    function setState(newState) {
        state = newState;
        switch (state) {
            case 'MENU':
                UI.showScreen('menu');
                Input.setMenuCallback(handleMenuInput);
                Input.setGameCallback(null);
                Input.setPauseCallback(null);
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
                break;

            case 'PLAYING':
                UI.showScreen('game');
                Input.setMenuCallback(null);
                Input.setGameCallback(handleGameInput);
                Input.setPauseCallback(function() { pauseGame(); });
                resizeCanvas();
                window.addEventListener('resize', resizeCanvas);
                break;

            case 'PAUSED':
                UI.showPause();
                Input.setGameCallback(null);
                Input.setPauseCallback(null);
                Input.setMenuCallback(handlePauseInput);
                var slots = SaveManager.getSlotInfo(currentRom.name);
                UI.updateSaveSlots({
                    1: slots[1].exists,
                    2: slots[2].exists,
                    3: slots[3].exists
                });
                break;
        }
    }

    function resizeCanvas() {
        var w = window.innerWidth, h = window.innerHeight;
        var ratio = currentSystem === 'nes' ? 256 / 240 : 256 / 224;
        var cw, ch;
        if (w / h > ratio) { ch = h; cw = ch * ratio; }
        else { cw = w; ch = cw / ratio; }
        canvas.style.width = Math.floor(cw) + 'px';
        canvas.style.height = Math.floor(ch) + 'px';
    }

    function handleMenuInput(action) {
        if (state !== 'MENU') return;
        switch (action) {
            case 'left': case 'right':
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
            case 'up': case 'down':
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

    function handlePauseInput(action) {
        if (state !== 'PAUSED') return;
        switch (action) {
            case 'up': case 'down':
                UI.navigateList('.pause-item:not(.disabled)', action);
                break;
            case 'enter':
                executePauseAction(UI.getSelectedData('.pause-item', 'action'));
                break;
            case 'back':
                resumeGame();
                break;
        }
    }

    // SNES gamepad → bitmask conversion
    var snesJoypad = 0;
    var snesButtonBits = {
        'a': 7, 'b': 15, 'x': 6, 'y': 14,
        'l': 5, 'r': 4, 'start': 12, 'select': 13,
        'up': 11, 'down': 10, 'left': 9, 'right': 8
    };

    function handleGameInput(button, pressed) {
        if (state !== 'PLAYING') return;
        if (currentSystem === 'snes') {
            var bit = snesButtonBits[button];
            if (bit !== undefined) {
                if (pressed) snesJoypad |= (1 << bit);
                else snesJoypad &= ~(1 << bit);
                EmulatorSNES.setInput(snesJoypad);
            }
        } else {
            EmulatorNES.setInput(button, pressed);
        }
    }

    function loadAndStartRom(rom) {
        if (currentSystem === 'snes') {
            // SNES NaCl: pass ROM path directly — NaCl URLLoader fetches it
            startSNES(rom.path, rom.name);
            return;
        }

        // NES: load and run inline
        if (rom.bundled) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', rom.path, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function() {
                if (xhr.status === 200 || xhr.status === 0) startNES(xhr.response, rom.name);
                else { UI.toast('Failed to load ROM'); setState('ROM_LIST'); }
            };
            xhr.onerror = function() { UI.toast('Failed to load ROM'); setState('ROM_LIST'); };
            xhr.send();
        } else if (window.tizen && tizen.filesystem) {
            tizen.filesystem.resolve(rom.path, function(file) {
                file.readAsArrayBuffer(function(buffer) {
                    startNES(buffer, rom.name);
                }, function() { UI.toast('Failed to read ROM'); setState('ROM_LIST'); });
            }, function() { UI.toast('ROM not found'); setState('ROM_LIST'); }, 'r');
        } else {
            UI.toast('Use file picker in dev mode');
            setState('ROM_LIST');
        }
    }

    function loadRomBuffer(rom, callback) {
        if (rom.bundled) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', rom.path, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function() {
                if (xhr.status === 200 || xhr.status === 0) callback(xhr.response);
                else { UI.toast('Failed to load ROM'); setState('ROM_LIST'); }
            };
            xhr.onerror = function() { UI.toast('Failed to load ROM'); setState('ROM_LIST'); };
            xhr.send();
        } else if (window.tizen && tizen.filesystem) {
            tizen.filesystem.resolve(rom.path, function(file) {
                file.readAsArrayBuffer(function(buffer) {
                    callback(buffer);
                }, function() { UI.toast('Failed to read ROM'); setState('ROM_LIST'); });
            }, function() { UI.toast('ROM not found'); setState('ROM_LIST'); }, 'r');
        }
    }

    function startSNES(romPath, name) {
        var naclContainer = document.getElementById('nacl-container');
        canvas.style.display = 'none';
        naclContainer.style.display = 'block';
        snesJoypad = 0;

        EmulatorSNES.init(naclContainer, function() {
            EmulatorSNES.loadROM(romPath);
            setState('PLAYING');
        });
    }

    function startNES(romBuffer, name) {
        var naclContainer = document.getElementById('nacl-container');
        naclContainer.style.display = 'none';
        canvas.style.display = 'block';

        EmulatorNES.destroy();
        EmulatorNES.init(canvas, function() {
            EmulatorNES.loadROM(romBuffer, name);
            EmulatorNES.start();
            setState('PLAYING');
        });
    }

    function pauseGame() {
        if (currentSystem === 'snes') EmulatorSNES.pause();
        else EmulatorNES.pause();
        setState('PAUSED');
    }

    function resumeGame() {
        UI.hidePause();
        if (currentSystem === 'snes') EmulatorSNES.resume();
        else EmulatorNES.resume();
        setState('PLAYING');
    }

    function executePauseAction(action) {
        if (!action) return;
        switch (action) {
            case 'resume': resumeGame(); break;
            case 'reset':
                if (currentSystem === 'nes') EmulatorNES.reset();
                resumeGame();
                break;
            case 'save1': case 'save2': case 'save3':
                if (currentSystem === 'nes') {
                    var ss = parseInt(action.replace('save', ''));
                    var sd = EmulatorNES.saveState();
                    if (sd) { var ok = SaveManager.save(currentRom.name, ss, sd); UI.toast(ok ? 'Saved slot ' + ss : 'Save failed'); }
                } else {
                    UI.toast('SNES save states not available');
                }
                break;
            case 'load1': case 'load2': case 'load3':
                if (currentSystem === 'nes') {
                    var ls = parseInt(action.replace('load', ''));
                    var ld = SaveManager.load(currentRom.name, ls);
                    if (ld) { var ok = EmulatorNES.loadState(ld); UI.toast(ok ? 'Loaded slot ' + ls : 'Load failed'); if (ok) resumeGame(); }
                    else UI.toast('Slot ' + ls + ' empty');
                }
                break;
            case 'quit':
                if (currentSystem === 'snes') EmulatorSNES.destroy();
                else EmulatorNES.destroy();
                document.getElementById('nacl-container').style.display = 'none';
                canvas.style.display = 'none';
                window.removeEventListener('resize', resizeCanvas);
                setState('MENU');
                break;
        }
    }

    return { init: init };
})();

document.addEventListener('DOMContentLoaded', function() {
    App.init();
});
