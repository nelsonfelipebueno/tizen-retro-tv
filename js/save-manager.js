var SaveManager = (function() {
    'use strict';

    function romKey(romName) {
        var hash = 0;
        for (var i = 0; i < romName.length; i++) {
            var chr = romName.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return 'save_' + Math.abs(hash).toString(36);
    }

    function save(romName, slot, stateData) {
        var key = romKey(romName) + '_' + slot;
        var entry = {
            romName: romName,
            slot: slot,
            timestamp: Date.now(),
            data: stateData
        };

        try {
            localStorage.setItem(key, JSON.stringify(entry));
            return true;
        } catch(e) {
            console.warn('Save failed (localStorage full?):', e.message);
            return false;
        }
    }

    function load(romName, slot) {
        var key = romKey(romName) + '_' + slot;
        var raw = localStorage.getItem(key);
        if (!raw) return null;
        try {
            var entry = JSON.parse(raw);
            return entry.data;
        } catch(e) {
            return null;
        }
    }

    function getSlotInfo(romName) {
        var slots = {};
        for (var s = 1; s <= 3; s++) {
            var key = romKey(romName) + '_' + s;
            var raw = localStorage.getItem(key);
            if (raw) {
                try {
                    var entry = JSON.parse(raw);
                    slots[s] = {
                        exists: true,
                        timestamp: entry.timestamp,
                        date: new Date(entry.timestamp).toLocaleString()
                    };
                } catch(e) {
                    slots[s] = { exists: false };
                }
            } else {
                slots[s] = { exists: false };
            }
        }
        return slots;
    }

    function deleteSave(romName, slot) {
        var key = romKey(romName) + '_' + slot;
        localStorage.removeItem(key);
    }

    return {
        save: save,
        load: load,
        getSlotInfo: getSlotInfo,
        deleteSave: deleteSave
    };
})();
