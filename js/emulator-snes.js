var EmulatorSNES = (function() {
    'use strict';

    function launch(romPath) {
        // snes9x-2005-wasm: 604KB WASM, designed for PSP hardware
        // ROM path relative to snes9x2005/index.html
        var relPath = '../../' + romPath;
        window.location.href = 'lib/snes9x2005/index.html?rom=' + encodeURIComponent(relPath);
    }

    return {
        launch: launch
    };
})();
