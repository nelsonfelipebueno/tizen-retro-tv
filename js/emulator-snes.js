var EmulatorSNES = (function() {
    'use strict';

    var naclModule = null;
    var isLoaded = false;
    var frameLoopId = null;

    function init(container, onReady) {
        // Create embed element for NaCl
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
            if (onReady) onReady();
        });

        naclModule.addEventListener('message', function(e) {
            if (e.data === 'rom_loaded') {
                naclModule.postMessage('play');
                startFrameLoop();
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
        var blob = new Blob([arrayBuffer]);
        var url = URL.createObjectURL(blob);
        naclModule.postMessage('downloadThenLoadRom url:' + url);
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
        naclModule.postMessage('keyEvent c:J1_A d:' + (bitmask & (1 << 7) ? 'down' : 'up'));
        naclModule.postMessage('keyEvent c:J1_B d:' + (bitmask & (1 << 15) ? 'down' : 'up'));
        naclModule.postMessage('keyEvent c:J1_X d:' + (bitmask & (1 << 6) ? 'down' : 'up'));
        naclModule.postMessage('keyEvent c:J1_Y d:' + (bitmask & (1 << 14) ? 'down' : 'up'));
        naclModule.postMessage('keyEvent c:J1_L d:' + (bitmask & (1 << 5) ? 'down' : 'up'));
        naclModule.postMessage('keyEvent c:J1_R d:' + (bitmask & (1 << 4) ? 'down' : 'up'));
        naclModule.postMessage('keyEvent c:J1_START d:' + (bitmask & (1 << 12) ? 'down' : 'up'));
        naclModule.postMessage('keyEvent c:J1_SELECT d:' + (bitmask & (1 << 13) ? 'down' : 'up'));
        naclModule.postMessage('keyEvent c:J1_UP d:' + (bitmask & (1 << 11) ? 'down' : 'up'));
        naclModule.postMessage('keyEvent c:J1_DOWN d:' + (bitmask & (1 << 10) ? 'down' : 'up'));
        naclModule.postMessage('keyEvent c:J1_LEFT d:' + (bitmask & (1 << 9) ? 'down' : 'up'));
        naclModule.postMessage('keyEvent c:J1_RIGHT d:' + (bitmask & (1 << 8) ? 'down' : 'up'));
    }

    function pause() {
        stopFrameLoop();
        naclModule.postMessage('pause');
    }

    function resume() {
        naclModule.postMessage('play');
        startFrameLoop();
    }

    function destroy() {
        stopFrameLoop();
        isLoaded = false;
        naclModule = null;
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
