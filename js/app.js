var App = (function() {
    'use strict';

    var state = 'ROM_LIST';
    var currentRoms = [];
    var currentRom = null;
    var emulator = EmulatorNES;
    var canvas = document.getElementById('game-canvas');

    function init() {
        Input.init();
        Input.setMenuCallback(handleRomListInput);

        // Dev mode: file input
        var fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.addEventListener('change', function(e) {
                var file = e.target.files[0];
                if (!file) return;
                currentRom = { name: file.name };
                setState('LOADING');
                var reader = new FileReader();
                reader.onload = function(ev) {
                    startEmulator(ev.target.result, file.name);
                };
                reader.readAsArrayBuffer(file);
            });
        }

        // Load ROM list immediately
        setState('ROM_LIST');
    }

    function setState(newState) {
        state = newState;

        switch (state) {
            case 'ROM_LIST':
                UI.showScreen('romlist');
                Input.setMenuCallback(handleRomListInput);
                Input.setGameCallback(null);
                Input.setPauseCallback(null);
                RomLoader.scanRoms(false, function(roms) {
                    currentRoms = roms.nes || [];
                    UI.renderRomList(currentRoms, 'nes');
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
                break;
        }
    }

    function resizeCanvas() {
        var w = window.innerWidth;
        var h = window.innerHeight;
        var ratio = 256 / 240; // NES aspect ratio
        var cw, ch;
        if (w / h > ratio) {
            ch = h;
            cw = ch * ratio;
        } else {
            cw = w;
            ch = cw / ratio;
        }
        canvas.style.width = Math.floor(cw) + 'px';
        canvas.style.height = Math.floor(ch) + 'px';
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
                var act = UI.getSelectedData('.pause-item', 'action');
                executePauseAction(act);
                break;
            case 'back':
                resumeGame();
                break;
        }
    }

    function handleGameInput(button, pressed) {
        if (state !== 'PLAYING') return;
        emulator.setInput(button, pressed);
    }

    function loadAndStartRom(rom) {
        if (rom.bundled) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', rom.path, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function() {
                if (xhr.status === 200 || xhr.status === 0) {
                    startEmulator(xhr.response, rom.name);
                } else {
                    UI.toast('Failed to load ROM');
                    setState('ROM_LIST');
                }
            };
            xhr.onerror = function() {
                UI.toast('Failed to load ROM');
                setState('ROM_LIST');
            };
            xhr.send();
        } else if (window.tizen && tizen.filesystem) {
            tizen.filesystem.resolve(rom.path, function(file) {
                file.readAsArrayBuffer(function(buffer) {
                    startEmulator(buffer, rom.name);
                }, function() {
                    UI.toast('Failed to read ROM');
                    setState('ROM_LIST');
                });
            }, function() {
                UI.toast('ROM not found');
                setState('ROM_LIST');
            }, 'r');
        } else {
            UI.toast('Use file picker in dev mode');
            setState('ROM_LIST');
        }
    }

    function startEmulator(romBuffer, name) {
        if (emulator.destroy) emulator.destroy();
        emulator.init(canvas, function() {
            emulator.loadROM(romBuffer, name);
            emulator.start();
            setState('PLAYING');
        });
    }

    function pauseGame() {
        emulator.pause();
        // Update save slot availability
        var slots = SaveManager.getSlotInfo(currentRom.name);
        UI.updateSaveSlots({
            1: slots[1].exists,
            2: slots[2].exists,
            3: slots[3].exists
        });
        setState('PAUSED');
    }

    function resumeGame() {
        UI.hidePause();
        emulator.resume();
        setState('PLAYING');
    }

    function executePauseAction(action) {
        if (!action) return;
        switch (action) {
            case 'resume':
                resumeGame();
                break;
            case 'reset':
                emulator.reset();
                resumeGame();
                break;
            case 'save1': case 'save2': case 'save3':
                var saveSlot = parseInt(action.replace('save', ''));
                var stateData = emulator.saveState();
                if (stateData) {
                    var ok = SaveManager.save(currentRom.name, saveSlot, stateData);
                    UI.toast(ok ? 'Saved slot ' + saveSlot : 'Save failed');
                }
                break;
            case 'load1': case 'load2': case 'load3':
                var loadSlot = parseInt(action.replace('load', ''));
                var loadData = SaveManager.load(currentRom.name, loadSlot);
                if (loadData) {
                    var ok = emulator.loadState(loadData);
                    UI.toast(ok ? 'Loaded slot ' + loadSlot : 'Load failed');
                    if (ok) resumeGame();
                } else {
                    UI.toast('Slot ' + loadSlot + ' empty');
                }
                break;
            case 'quit':
                emulator.destroy();
                window.removeEventListener('resize', resizeCanvas);
                setState('ROM_LIST');
                break;
        }
    }

    return { init: init };
})();

document.addEventListener('DOMContentLoaded', function() {
    App.init();
});
