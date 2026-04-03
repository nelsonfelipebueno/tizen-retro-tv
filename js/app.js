var App = (function() {
    'use strict';

    var state = 'MENU';
    var currentSystem = 'snes';
    var currentRoms = [];
    var currentRom = null;
    var emulator = null;
    var canvas = document.getElementById('game-canvas');

    function init() {
        Input.init();
        Input.setMenuCallback(handleMenuInput);

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

        window.addEventListener('resize', function() {
            if (state === 'PLAYING' || state === 'PAUSED') {
                var nativeH = currentSystem === 'snes' ? 224 : 240;
                UI.resizeCanvas(canvas, 256, nativeH);
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
                Input.setMenuCallback(null);
                Input.setGameCallback(handleGameInput);
                Input.setPauseCallback(function() { pauseGame(); });
                var nativeH = currentSystem === 'snes' ? 224 : 240;
                UI.resizeCanvas(canvas, 256, nativeH);
                canvas.setAttribute('tabindex', '0');
                canvas.focus();
                // Resume AudioContext (needs user gesture on Tizen)
                try {
                    var ac = window.AudioContext || window.webkitAudioContext;
                    if (ac && ac.prototype && ac.prototype.resume) {
                        var ctx = new ac();
                        ctx.resume();
                    }
                } catch(e) {}
                break;

            case 'PAUSED':
                UI.showPause();
                Input.setGameCallback(null);
                Input.setPauseCallback(null);
                Input.setMenuCallback(handlePauseInput);
                if (currentSystem === 'nes') {
                    var slots = SaveManager.getSlotInfo(currentRom.name);
                    UI.updateSaveSlots({
                        1: slots[1].exists,
                        2: slots[2].exists,
                        3: slots[3].exists
                    });
                } else {
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
        if (rom.bundled) {
            RomLoader.loadBundledRom(rom, function(err, buffer, system) {
                if (err) {
                    UI.toast('Error: ' + err.message);
                    setState('ROM_LIST');
                    return;
                }
                startEmulator(buffer, rom.name);
            });
        } else if (window.tizen) {
            RomLoader.loadRomTizen(rom, function(err, buffer, system) {
                if (err) {
                    UI.toast('Error: ' + err.message);
                    setState('ROM_LIST');
                    return;
                }
                startEmulator(buffer, rom.name);
            });
        } else {
            UI.toast('Use file picker in dev mode');
            setState('ROM_LIST');
        }
    }

    function startEmulator(romBuffer, name) {
        if (emulator && emulator.destroy) {
            emulator.destroy();
        }

        if (currentSystem === 'snes') {
            emulator = EmulatorSNES;
            emulator.init(canvas, function() {
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
        if (emulator && emulator.resume) {
            emulator.resume();
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

document.addEventListener('DOMContentLoaded', function() {
    App.init();
});
