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

        // === PERFORMANCE: Kill audio BEFORE Emscripten loads ===
        // SDL audio is the biggest CPU drain on TV hardware.
        // Stub AudioContext so Emscripten SDL gets silence with zero CPU cost.
        var Noop = function() { return this; };
        var NoopPromise = function() { return { then: Noop, catch: Noop }; };
        var FakeCtx = function() {
            this.sampleRate = 22050;
            this.state = 'running';
            this.destination = {};
            this.currentTime = 0;
        };
        FakeCtx.prototype.createScriptProcessor = function() {
            return { connect: Noop, disconnect: Noop, onaudioprocess: null, bufferSize: 4096 };
        };
        FakeCtx.prototype.createGain = function() {
            return { connect: Noop, gain: { value: 0, setValueAtTime: Noop } };
        };
        FakeCtx.prototype.createOscillator = function() {
            return { connect: Noop, start: Noop, stop: Noop, frequency: { value: 0 } };
        };
        FakeCtx.prototype.createBuffer = function(ch, len, rate) {
            var b = [];
            for (var i = 0; i < ch; i++) b.push(new Float32Array(len));
            return { getChannelData: function(c) { return b[c]; }, numberOfChannels: ch, length: len, sampleRate: rate };
        };
        FakeCtx.prototype.createBufferSource = function() {
            return { connect: Noop, start: Noop, stop: Noop, buffer: null };
        };
        FakeCtx.prototype.resume = NoopPromise;
        FakeCtx.prototype.suspend = NoopPromise;
        FakeCtx.prototype.close = NoopPromise;
        FakeCtx.prototype.decodeAudioData = function(buf, ok) { if (ok) ok(this.createBuffer(2, 1, 22050)); };
        window.AudioContext = FakeCtx;
        window.webkitAudioContext = FakeCtx;

        // Configure Emscripten Module
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
            // Frameskip: auto (0xFFFFFFFF) lets snes9x decide based on performance
            if (Module._set_frameskip) Module._set_frameskip(0xFFFFFFFF);
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
