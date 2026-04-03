var RomLoader = (function() {
    'use strict';

    var SNES_EXTENSIONS = ['.smc', '.sfc', '.fig'];
    var NES_EXTENSIONS = ['.nes'];
    var ZIP_EXTENSION = '.zip';

    var BUNDLED_ROMS = [
        { name: 'Super Mario World (US)', fullName: 'smw.smc', path: 'roms/smw.smc', system: 'snes', bundled: true },
        { name: 'SMW All-Stars No Music (leve)', fullName: 'smw-nomusic.sfc', path: 'roms/smw-nomusic.sfc', system: 'snes', bundled: true },
        { name: 'Super Mario World (PT-BR)', fullName: 'smw-ptbr.sfc', path: 'roms/smw-ptbr.sfc', system: 'snes', bundled: true },
        { name: 'Super Mario All-Stars + SMW', fullName: 'smw-allstars.sfc', path: 'roms/smw-allstars.sfc', system: 'snes', bundled: true }
    ];

    var USB_PATHS = [
        'removable_usb1', 'removable_usb2',
        'removable_usb3', 'removable_usb4'
    ];

    var cachedRoms = null;

    function getExtension(filename) {
        var idx = filename.lastIndexOf('.');
        if (idx === -1) return '';
        return filename.substring(idx).toLowerCase();
    }

    function getSystem(filename) {
        var ext = getExtension(filename);
        if (SNES_EXTENSIONS.indexOf(ext) !== -1) return 'snes';
        if (NES_EXTENSIONS.indexOf(ext) !== -1) return 'nes';
        return null;
    }

    function cleanName(filename) {
        var idx = filename.lastIndexOf('.');
        if (idx === -1) return filename;
        return filename.substring(0, idx);
    }

    function scanTizen(callback) {
        if (!window.tizen || !tizen.filesystem) {
            callback([]);
            return;
        }

        var allRoms = [];
        var pendingPaths = USB_PATHS.length;

        USB_PATHS.forEach(function(storageName) {
            try {
                tizen.filesystem.resolve(storageName, function(dir) {
                    scanDirectory(dir, allRoms, function() {
                        pendingPaths--;
                        if (pendingPaths <= 0) callback(allRoms);
                    });
                }, function(err) {
                    pendingPaths--;
                    if (pendingPaths <= 0) callback(allRoms);
                }, 'r');
            } catch(e) {
                pendingPaths--;
                if (pendingPaths <= 0) callback(allRoms);
            }
        });
    }

    function scanDirectory(dir, results, done) {
        try {
            dir.listFiles(function(files) {
                var pending = files.length;
                if (pending === 0) { done(); return; }

                files.forEach(function(file) {
                    if (file.isDirectory) {
                        scanDirectory(file, results, function() {
                            pending--;
                            if (pending <= 0) done();
                        });
                    } else {
                        var system = getSystem(file.name);
                        var ext = getExtension(file.name);
                        if (system || ext === ZIP_EXTENSION) {
                            results.push({
                                name: cleanName(file.name),
                                fullName: file.name,
                                path: file.fullPath,
                                system: system || 'zip'
                            });
                        }
                        pending--;
                        if (pending <= 0) done();
                    }
                });
            }, function(err) {
                done();
            });
        } catch(e) {
            done();
        }
    }

    function loadRomTizen(romInfo, callback) {
        tizen.filesystem.resolve(romInfo.path, function(file) {
            file.readAsArrayBuffer(function(buffer) {
                var ext = getExtension(romInfo.fullName);
                if (ext === ZIP_EXTENSION) {
                    extractZip(buffer, callback);
                } else {
                    callback(null, buffer, romInfo.system);
                }
            }, function(err) {
                callback(new Error('Failed to read ROM: ' + err.message));
            });
        }, function(err) {
            callback(new Error('Failed to resolve ROM path: ' + err.message));
        }, 'r');
    }

    function loadRomFile(file, callback) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var buffer = e.target.result;
            var ext = getExtension(file.name);
            var system = getSystem(file.name);

            if (ext === ZIP_EXTENSION) {
                extractZip(buffer, callback);
            } else if (system) {
                callback(null, buffer, system);
            } else {
                callback(new Error('Unsupported file type: ' + file.name));
            }
        };
        reader.onerror = function() {
            callback(new Error('Failed to read file'));
        };
        reader.readAsArrayBuffer(file);
    }

    function extractZip(buffer, callback) {
        try {
            var data = new Uint8Array(buffer);
            var unzipped = fflate.unzipSync(data);
            var romFile = null;
            var romName = null;

            Object.keys(unzipped).forEach(function(name) {
                if (romFile) return;
                var system = getSystem(name);
                if (system) {
                    romFile = unzipped[name];
                    romName = name;
                }
            });

            if (romFile) {
                callback(null, romFile.buffer, getSystem(romName));
            } else {
                callback(new Error('No ROM found inside ZIP'));
            }
        } catch(e) {
            callback(new Error('Failed to extract ZIP: ' + e.message));
        }
    }

    function loadBundledRom(romInfo, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', romInfo.path, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function() {
            if (xhr.status === 200 || xhr.status === 0) {
                callback(null, xhr.response, romInfo.system);
            } else {
                callback(new Error('Failed to load ROM: HTTP ' + xhr.status));
            }
        };
        xhr.onerror = function() {
            callback(new Error('Failed to load ROM'));
        };
        xhr.send();
    }

    function scanRoms(forceRefresh, callback) {
        // Always include bundled ROMs
        cachedRoms = { snes: [], nes: [] };
        BUNDLED_ROMS.forEach(function(rom) {
            if (rom.system === 'snes') cachedRoms.snes.push(rom);
            else if (rom.system === 'nes') cachedRoms.nes.push(rom);
        });

        if (!window.tizen) {
            callback(cachedRoms);
            return;
        }

        // Also scan USB
        scanTizen(function(allRoms) {
            allRoms.forEach(function(rom) {
                if (rom.system === 'snes') cachedRoms.snes.push(rom);
                else if (rom.system === 'nes') cachedRoms.nes.push(rom);
            });
            callback(cachedRoms);
        });
    }

    return {
        scanRoms: scanRoms,
        loadRomTizen: loadRomTizen,
        loadRomFile: loadRomFile,
        loadBundledRom: loadBundledRom,
        getSystem: getSystem
    };
})();
