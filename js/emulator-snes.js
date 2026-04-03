var EmulatorSNES = (function() {
    'use strict';

    var naclModule = null;
    var isLoaded = false;
    var frameLoopId = null;
    var prevBitmask = 0;
    var onReadyCallback = null;

    // Button name mapping for snes4nacl keyEvent bridge
    var bitToButton = {
        7: 'J1_A', 15: 'J1_B', 6: 'J1_X', 14: 'J1_Y',
        5: 'J1_L', 4: 'J1_R', 12: 'J1_START', 13: 'J1_SELECT',
        11: 'J1_UP', 10: 'J1_DOWN', 9: 'J1_LEFT', 8: 'J1_RIGHT'
    };

    function init(container, onReady) {
        onReadyCallback = onReady;
        prevBitmask = 0;

        var embed = document.createElement('embed');
        embed.id = 'nacl-snes';
        embed.setAttribute('type', 'application/x-nacl');
        embed.setAttribute('src', 'nacl_app/app.nmf');
        embed.style.width = '100%';
        embed.style.height = '100%';
        container.innerHTML = '';
        container.appendChild(embed);
        naclModule = embed;

        naclModule.addEventListener('load', function() {
            isLoaded = true;
            naclModule.postMessage('init');
        });

        naclModule.addEventListener('message', function(e) {
            var data = String(e.data);
            if (data === 'initFinished') {
                if (onReadyCallback) onReadyCallback();
            }
        });

        naclModule.addEventListener('error', function() {
            UI.toast('NaCl failed to load');
        });

        naclModule.addEventListener('crash', function() {
            UI.toast('Emulator crashed');
        });
    }

    function loadROM(arrayBuffer) {
        if (!isLoaded) return;

        // NaCl URLLoader can't handle blob URLs.
        // Instead, send ROM data directly via postMessage as ArrayBuffer.
        // snes4nacl uses downloadThenLoadRom with URL, but we need to
        // write to virtual FS via postMessage.
        // For now, use a data: URL which URLLoader CAN fetch.
        var bytes = new Uint8Array(arrayBuffer);
        var binary = '';
        for (var i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        var b64 = btoa(binary);
        var dataUrl = 'data:application/octet-stream;base64,' + b64;
        naclModule.postMessage('downloadThenLoadRom url:' + dataUrl);

        // Start frame loop after a short delay for ROM loading
        setTimeout(function() {
            naclModule.postMessage('play');
            startFrameLoop();
        }, 2000);
    }

    function startFrameLoop() {
        function tick() {
            naclModule.postMessage('frame');
            frameLoopId = requestAnimationFrame(tick);
        }
        tick();
    }

    function stopFrameLoop() {
        if (frameLoopId) {
            cancelAnimationFrame(frameLoopId);
            frameLoopId = null;
        }
    }

    function setInput(bitmask) {
        if (!isLoaded || !naclModule) return;
        // Only send messages for buttons that CHANGED (delta encoding)
        var changed = bitmask ^ prevBitmask;
        if (!changed) return;
        for (var bit in bitToButton) {
            var b = parseInt(bit);
            if (changed & (1 << b)) {
                var state = (bitmask & (1 << b)) ? 'down' : 'up';
                naclModule.postMessage('keyEvent c:' + bitToButton[bit] + ' d:' + state);
            }
        }
        prevBitmask = bitmask;
    }

    function pause() {
        stopFrameLoop();
        if (naclModule) naclModule.postMessage('pause');
    }

    function resume() {
        if (naclModule) naclModule.postMessage('play');
        startFrameLoop();
    }

    function destroy() {
        stopFrameLoop();
        if (naclModule && naclModule.parentNode) {
            naclModule.parentNode.removeChild(naclModule);
        }
        isLoaded = false;
        naclModule = null;
        prevBitmask = 0;
    }

    return {
        init: init,
        loadROM: loadROM,
        setInput: setInput,
        pause: pause,
        resume: resume,
        destroy: destroy
    };
})();
