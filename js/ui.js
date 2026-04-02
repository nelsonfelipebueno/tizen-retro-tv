var UI = (function() {
    'use strict';

    var screens = {
        menu: document.getElementById('menu-screen'),
        romlist: document.getElementById('romlist-screen'),
        loading: document.getElementById('loading-screen'),
        game: document.getElementById('game-screen')
    };

    var pauseOverlay = document.getElementById('pause-overlay');
    var toastEl = document.getElementById('toast');
    var romListEl = document.getElementById('rom-list');
    var romListTitle = document.getElementById('romlist-title');
    var toastTimeout = null;

    function showScreen(name) {
        Object.keys(screens).forEach(function(key) {
            screens[key].classList.remove('active');
        });
        if (screens[name]) {
            screens[name].classList.add('active');
        }
        if (name !== 'game') {
            hidePause();
        }
    }

    function showPause() {
        pauseOverlay.classList.add('active');
        var items = pauseOverlay.querySelectorAll('.pause-item');
        items.forEach(function(item) { item.classList.remove('selected'); });
        items[0].classList.add('selected');
    }

    function hidePause() {
        pauseOverlay.classList.remove('active');
    }

    function isPauseVisible() {
        return pauseOverlay.classList.contains('active');
    }

    function toast(message, durationMs) {
        durationMs = durationMs || 2000;
        toastEl.textContent = message;
        toastEl.classList.add('show');
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(function() {
            toastEl.classList.remove('show');
        }, durationMs);
    }

    function renderRomList(roms, system) {
        romListTitle.textContent = system.toUpperCase() + ' ROMs';
        romListEl.innerHTML = '';

        if (roms.length === 0) {
            var emptyDiv = document.createElement('div');
            emptyDiv.className = 'rom-empty';
            emptyDiv.textContent = 'No ROMs found. Plug in a USB drive with .' +
                (system === 'snes' ? 'smc/.sfc' : 'nes') + ' files.';

            if (!window.tizen) {
                var btn = document.createElement('div');
                btn.className = 'pause-item';
                btn.style.marginTop = '4vh';
                btn.textContent = 'Load ROM from file...';
                btn.onclick = function() {
                    document.getElementById('file-input').click();
                };
                emptyDiv.appendChild(btn);
            }

            romListEl.appendChild(emptyDiv);
            return;
        }

        roms.forEach(function(rom, index) {
            var li = document.createElement('li');
            li.className = 'rom-item' + (index === 0 ? ' selected' : '');
            li.textContent = rom.name;
            li.dataset.index = index;
            romListEl.appendChild(li);
        });
    }

    function navigateList(containerSelector, direction) {
        var items = document.querySelectorAll(containerSelector);
        if (items.length === 0) return -1;

        var currentIndex = -1;
        items.forEach(function(item, i) {
            if (item.classList.contains('selected')) currentIndex = i;
        });

        var newIndex = currentIndex;
        if (direction === 'down' || direction === 'right') {
            newIndex = Math.min(currentIndex + 1, items.length - 1);
        } else if (direction === 'up' || direction === 'left') {
            newIndex = Math.max(currentIndex - 1, 0);
        }

        if (newIndex !== currentIndex) {
            items[currentIndex].classList.remove('selected');
            items[newIndex].classList.add('selected');
            if (items[newIndex].scrollIntoView) {
                items[newIndex].scrollIntoView({ block: 'nearest' });
            }
        }

        return newIndex;
    }

    function getSelectedIndex(containerSelector) {
        var items = document.querySelectorAll(containerSelector);
        for (var i = 0; i < items.length; i++) {
            if (items[i].classList.contains('selected')) return i;
        }
        return 0;
    }

    function getSelectedData(containerSelector, dataKey) {
        var items = document.querySelectorAll(containerSelector);
        for (var i = 0; i < items.length; i++) {
            if (items[i].classList.contains('selected')) {
                return items[i].dataset[dataKey];
            }
        }
        return null;
    }

    function updateSaveSlots(slots) {
        var items = pauseOverlay.querySelectorAll('.pause-item');
        items.forEach(function(item) {
            var action = item.dataset.action;
            if (action && action.indexOf('load') === 0) {
                var slot = parseInt(action.replace('load', ''));
                if (slots[slot]) {
                    item.classList.remove('disabled');
                } else {
                    item.classList.add('disabled');
                }
            }
        });
    }

    function resizeCanvas(canvas, nativeWidth, nativeHeight) {
        var windowW = window.innerWidth;
        var windowH = window.innerHeight;
        var aspectRatio = nativeWidth / nativeHeight;
        var canvasW, canvasH;

        if (windowW / windowH > aspectRatio) {
            canvasH = windowH;
            canvasW = canvasH * aspectRatio;
        } else {
            canvasW = windowW;
            canvasH = canvasW / aspectRatio;
        }

        canvas.style.width = Math.floor(canvasW) + 'px';
        canvas.style.height = Math.floor(canvasH) + 'px';
    }

    return {
        showScreen: showScreen,
        showPause: showPause,
        hidePause: hidePause,
        isPauseVisible: isPauseVisible,
        toast: toast,
        renderRomList: renderRomList,
        navigateList: navigateList,
        getSelectedIndex: getSelectedIndex,
        getSelectedData: getSelectedData,
        updateSaveSlots: updateSaveSlots,
        resizeCanvas: resizeCanvas
    };
})();
