var EmulatorSNES = (function() {
    'use strict';

    var canvas = null;
    var isRunning = false;
    var isLoaded = false;
    var romName = '';

    function init(canvasEl, onReady) {
        canvas = canvasEl;
        canvas.width = 256;
        canvas.height = 224;

        // PERFORMANCE: Intercept AudioContext to mute output but keep timing alive
        // Emscripten SDL needs onaudioprocess callbacks for its clock,
        // but we redirect audio to a zero-gain node (no speaker output, less CPU)
        var OrigAC = window.AudioContext || window.webkitAudioContext;
        if (OrigAC) {
            var MutedAC = function() {
                var ctx = new OrigAC();
                var origCreateScriptProcessor = ctx.createScriptProcessor.bind(ctx);
                ctx.createScriptProcessor = function(bufSize, inCh, outCh) {
                    var node = origCreateScriptProcessor(bufSize, inCh, outCh);
                    var origConnect = node.connect.bind(node);
                    // Override connect: route through a zero-gain node (muted)
                    node.connect = function(dest) {
                        var gain = ctx.createGain();
                        gain.gain.value = 0;
                        origConnect(gain);
                        gain.connect(dest);
                    };
                    return node;
                };
                return ctx;
            };
            window.AudioContext = MutedAC;
            window.webkitAudioContext = MutedAC;
        }

        window.Module = {
            canvas: canvas,
            memoryInitializerPrefixURL: 'lib/xnes/',
            preRun: [],
            postRun: [function() {
                isLoaded = true;
                canvas.setAttribute('tabindex', '0');
                canvas.focus();
                if (onReady) onReady();
            }],
            print: function() {},
            printErr: function() {},
            setStatus: function() {},
            totalDependencies: 0,
            monitorRunDependencies: function() {},
            noExitRuntime: true,
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
            // Cap at 30fps — reduces CPU load by half
            if (Module.setMainLoopTimingMode) {
                Module.setMainLoopTimingMode(0, 1000/30);
            }
            // Frameskip 1 = render every other frame (matches 30fps cap)
            if (Module._set_frameskip) Module._set_frameskip(1);
        } catch(e) {}
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
