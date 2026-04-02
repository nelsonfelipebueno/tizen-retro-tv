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

    var buttonMap = {
        'up': 4,
        'down': 5,
        'left': 6,
        'right': 7,
        'a': 0,
        'b': 1,
        'start': 3,
        'select': 2
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
                if (audioBufferLeft.length > 16384) {
                    audioBufferLeft.splice(0, 8192);
                    audioBufferRight.splice(0, 8192);
                }
            },
            emulateSound: true,
            sampleRate: audioCtx.sampleRate
        });

        var romData = new Uint8Array(arrayBuffer);
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
        if (nesButton === undefined) return;
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
