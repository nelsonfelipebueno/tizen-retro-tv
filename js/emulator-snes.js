var EmulatorSNES = (function() {
    'use strict';

    function launch(romPath) {
        // webretro supports ?core=X&rom=URL
        // ROM path is relative to webretro/index.html, so go up 2 dirs
        var relPath = '../../' + romPath;
        window.location.href = 'lib/webretro/index.html?core=snes9x&rom=' + encodeURIComponent(relPath);
    }

    return {
        launch: launch
    };
})();
