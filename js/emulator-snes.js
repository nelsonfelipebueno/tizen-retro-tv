var EmulatorSNES = (function() {
    'use strict';

    var canvas = null;
    var isRunning = false;
    var isLoaded = false;
    var romName = '';

    function init(canvasEl, onReady) {
        canvas = canvasEl;

        // Set canvas to SNES native resolution — no upscaling in canvas
        // CSS handles the display scaling (much cheaper)
        canvas.width = 256;
        canvas.height = 224;

        // Configure Emscripten Module BEFORE loading snes9x.js
        window.Module = {
            canvas: canvas,
            memoryInitializerPrefixURL: 'lib/xnes/',
            preRun: [],
            postRun: [function() {
                isLoaded = true;
                // Give the canvas focus so SDL keyboard events work
                canvas.setAttribute('tabindex', '0');
                canvas.focus();
                if (onReady) onReady();
            }],
            print: function(text) {
                console.log('[SNES]', text);
            },
            printErr: function(text) {
                // Suppress noisy warnings
            },
            setStatus: function() {},
            totalDependencies: 0,
            monitorRunDependencies: function(left) {
                this.totalDependencies = Math.max(this.totalDependencies, left);
            },
            noExitRuntime: true,
            // Performance: disable Emscripten's automatic canvas resize
            doNotCaptureKeyboard: false
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
            // Enable frameskip on Tizen TVs for better performance
            // Frameskip 1 = render every other frame (30fps visual, full-speed logic)
            if (window.tizen) {
                setFrameskip(1);
            }
        } catch(e) {
            console.error('Failed to start SNES emulation:', e);
        }
    }

    function pause() {
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
        console.warn('SNES reset: reloading page may be required for full reset');
    }

    function setInput(button, pressed) {
        Input.dispatchSnesKey(button, pressed);
    }

    function saveSRAM() {
        if (Module && Module._S9xAutoSaveSRAM) {
            Module._S9xAutoSaveSRAM();
            try {
                var sramData = Module.FS_readFile('/_.srm');
                return Array.from(sramData);
            } catch(e) {
                return null;
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
