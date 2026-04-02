var Input = (function() {
    'use strict';

    var BUTTONS = {
        UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right',
        A: 'a', B: 'b', X: 'x', Y: 'y',
        L: 'l', R: 'r',
        START: 'start', SELECT: 'select'
    };

    var defaultKeyMap = {
        'ArrowUp': BUTTONS.UP,
        'ArrowDown': BUTTONS.DOWN,
        'ArrowLeft': BUTTONS.LEFT,
        'ArrowRight': BUTTONS.RIGHT,
        'f': BUTTONS.A,
        'd': BUTTONS.B,
        's': BUTTONS.X,
        'a': BUTTONS.Y,
        'q': BUTTONS.L,
        'w': BUTTONS.R,
        'Enter': BUTTONS.START,
        'Shift': BUTTONS.SELECT
    };

    var snesKeyMap = {
        'up': 'ArrowUp',
        'down': 'ArrowDown',
        'left': 'ArrowLeft',
        'right': 'ArrowRight',
        'a': 'd',
        'b': 'c',
        'x': 's',
        'y': 'x',
        'l': 'a',
        'r': 'z',
        'start': 'Enter',
        'select': ' '
    };

    var keyMap = {};
    var callbacks = { menu: null, game: null };
    var gamepadPollInterval = null;
    var prevGamepadState = {};

    // Buttons that trigger pause menu (Xbox Guide / PS button)
    var MENU_BUTTONS = { 16: true, 17: true };

    var gamepadMap = {
        0: BUTTONS.A,
        1: BUTTONS.B,
        2: BUTTONS.X,
        3: BUTTONS.Y,
        4: BUTTONS.L,
        5: BUTTONS.R,
        8: BUTTONS.SELECT,
        9: BUTTONS.START,
        12: BUTTONS.UP,
        13: BUTTONS.DOWN,
        14: BUTTONS.LEFT,
        15: BUTTONS.RIGHT
    };

    var psAlternateMap = {
        0: BUTTONS.B,       // Cross → B
        1: BUTTONS.A,       // Circle → A
        2: BUTTONS.Y,       // Square → Y
        3: BUTTONS.X,       // Triangle → X
        4: BUTTONS.L,
        5: BUTTONS.R,
        8: BUTTONS.SELECT,  // Share
        9: BUTTONS.START,   // Options
        12: BUTTONS.UP,
        13: BUTTONS.DOWN,
        14: BUTTONS.LEFT,
        15: BUTTONS.RIGHT
    };

    var activeGamepadMap = gamepadMap;
    var detectedGamepadType = null;

    function detectGamepadType(gp) {
        if (detectedGamepadType) return;
        var id = (gp.id || '').toLowerCase();
        if (id.indexOf('playstation') !== -1 || id.indexOf('dualshock') !== -1 ||
            id.indexOf('dualsense') !== -1 || id.indexOf('054c') !== -1 ||
            id.indexOf('ps3') !== -1 || id.indexOf('ps4') !== -1 || id.indexOf('ps5') !== -1 ||
            id.indexOf('sony') !== -1 || id.indexOf('wireless controller') !== -1) {
            activeGamepadMap = psAlternateMap;
            detectedGamepadType = 'playstation';
            console.log('[Input] Detected PlayStation controller:', gp.id);
        } else {
            activeGamepadMap = gamepadMap;
            detectedGamepadType = 'standard';
            console.log('[Input] Detected standard controller:', gp.id);
        }
    }

    function init() {
        loadKeyMap();
        setupKeyboard();
        setupTVRemote();
        setupGamepadEvents();
        startGamepadPolling();
    }

    function setupGamepadEvents() {
        window.addEventListener('gamepadconnected', function(e) {
            console.log('[Input] Gamepad connected:', e.gamepad.id, 'index:', e.gamepad.index);
            detectGamepadType(e.gamepad);
        });
        window.addEventListener('gamepaddisconnected', function(e) {
            console.log('[Input] Gamepad disconnected:', e.gamepad.id);
            detectedGamepadType = null;
            activeGamepadMap = gamepadMap;
        });
    }

    function loadKeyMap() {
        var saved = localStorage.getItem('input_config');
        if (saved) {
            try { keyMap = JSON.parse(saved); } catch(e) { keyMap = defaultKeyMap; }
        } else {
            keyMap = defaultKeyMap;
        }
    }

    function saveKeyMap(newMap) {
        keyMap = newMap;
        localStorage.setItem('input_config', JSON.stringify(keyMap));
    }

    function setMenuCallback(cb) {
        callbacks.menu = cb;
    }

    function setGameCallback(cb) {
        callbacks.game = cb;
    }

    function dispatchSnesKey(snesButton, pressed) {
        var keyValue = snesKeyMap[snesButton];
        if (!keyValue) return;

        var eventType = pressed ? 'keydown' : 'keyup';

        // Emscripten SDL listens on window, document, and canvas
        // We need keyCode for SDL to recognize the key
        var keyCode = 0;
        var code = '';
        if (keyValue === 'ArrowUp') { keyCode = 38; code = 'ArrowUp'; }
        else if (keyValue === 'ArrowDown') { keyCode = 40; code = 'ArrowDown'; }
        else if (keyValue === 'ArrowLeft') { keyCode = 37; code = 'ArrowLeft'; }
        else if (keyValue === 'ArrowRight') { keyCode = 39; code = 'ArrowRight'; }
        else if (keyValue === 'Enter') { keyCode = 13; code = 'Enter'; }
        else if (keyValue === ' ') { keyCode = 32; code = 'Space'; }
        else { keyCode = keyValue.toUpperCase().charCodeAt(0); code = 'Key' + keyValue.toUpperCase(); }

        var event = new KeyboardEvent(eventType, {
            key: keyValue,
            code: code,
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
        });

        // Mark as synthetic so our keyboard handler ignores it
        event._synthetic = true;

        // Dispatch on canvas (where Emscripten SDL listens)
        var canvas = document.getElementById('game-canvas');
        if (canvas) canvas.dispatchEvent(event);
        // Also dispatch on document and window for Emscripten compatibility
        document.dispatchEvent(event);
        window.dispatchEvent(event);
    }

    function setupKeyboard() {
        document.addEventListener('keydown', function(e) {
            // Ignore synthetic events from gamepad→SNES dispatch
            if (e._synthetic) return;

            var button = keyMap[e.key];
            if (!button) {
                if (e.key === 'Escape' || e.key === 'Backspace') {
                    if (callbacks.menu) callbacks.menu('back');
                    e.preventDefault();
                    return;
                }
                return;
            }
            e.preventDefault();

            if (callbacks.game) {
                callbacks.game(button, true);
            }
            if (callbacks.menu) {
                if (button === BUTTONS.UP) callbacks.menu('up');
                else if (button === BUTTONS.DOWN) callbacks.menu('down');
                else if (button === BUTTONS.LEFT) callbacks.menu('left');
                else if (button === BUTTONS.RIGHT) callbacks.menu('right');
                else if (button === BUTTONS.START || button === BUTTONS.A) callbacks.menu('enter');
                else if (button === BUTTONS.B) callbacks.menu('back');
            }
        });

        document.addEventListener('keyup', function(e) {
            if (e._synthetic) return;
            var button = keyMap[e.key];
            if (!button) return;
            e.preventDefault();
            if (callbacks.game) {
                callbacks.game(button, false);
            }
        });
    }

    function setupTVRemote() {
        if (!window.tizen || !tizen.tvinputdevice) return;

        var keysToRegister = [
            'MediaPlay', 'MediaPause', 'MediaPlayPause',
            'MediaStop', 'MediaRewind', 'MediaFastForward',
            'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'
        ];

        keysToRegister.forEach(function(keyName) {
            try {
                tizen.tvinputdevice.registerKey(keyName);
            } catch(e) {}
        });
    }

    var useRAFPolling = false;
    var rafPollId = null;

    function startGamepadPolling() {
        // Use rAF-based polling for better sync with render loop and lower overhead
        useRAFPolling = true;
        rafPollLoop();
    }

    function rafPollLoop() {
        if (!useRAFPolling) return;
        pollGamepads();
        rafPollId = requestAnimationFrame(rafPollLoop);
    }

    function stopGamepadPolling() {
        useRAFPolling = false;
        if (rafPollId) {
            cancelAnimationFrame(rafPollId);
            rafPollId = null;
        }
        if (gamepadPollInterval) {
            clearInterval(gamepadPollInterval);
            gamepadPollInterval = null;
        }
    }

    function pollGamepads() {
        var gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (var gi = 0; gi < gamepads.length; gi++) {
            var gp = gamepads[gi];
            if (!gp) continue;

            // Auto-detect controller type on first poll
            if (!detectedGamepadType) detectGamepadType(gp);

            var id = gp.index;
            if (!prevGamepadState[id]) prevGamepadState[id] = { buttons: {}, axes: {} };
            var prev = prevGamepadState[id];

            // During gameplay: buttons go ONLY to game callback
            // During menus: buttons go ONLY to menu callback
            // Start+Select combo always triggers pause (via menu 'back')
            var inGame = !!callbacks.game;

            for (var bi = 0; bi < gp.buttons.length; bi++) {
                var pressed = gp.buttons[bi].pressed;
                var wasPressed = prev.buttons[bi] || false;

                if (pressed !== wasPressed) {
                    prev.buttons[bi] = pressed;
                    var button = activeGamepadMap[bi];
                    if (button) {
                        if (inGame) {
                            // During gameplay: send to game only
                            callbacks.game(button, pressed);
                        } else if (pressed && callbacks.menu) {
                            // During menus: send to menu only
                            if (button === BUTTONS.A || button === BUTTONS.START) callbacks.menu('enter');
                            else if (button === BUTTONS.B) callbacks.menu('back');
                            else if (button === BUTTONS.UP) callbacks.menu('up');
                            else if (button === BUTTONS.DOWN) callbacks.menu('down');
                            else if (button === BUTTONS.LEFT) callbacks.menu('left');
                            else if (button === BUTTONS.RIGHT) callbacks.menu('right');
                        }
                    }
                }
            }

            if (gp.axes.length >= 2) {
                var axisX = gp.axes[0];
                var axisY = gp.axes[1];
                var threshold = 0.5;

                var left = axisX < -threshold;
                var right = axisX > threshold;
                var up = axisY < -threshold;
                var down = axisY > threshold;

                if (left !== (prev.axes.left || false)) {
                    prev.axes.left = left;
                    if (inGame) callbacks.game(BUTTONS.LEFT, left);
                    else if (left && callbacks.menu) callbacks.menu('left');
                }
                if (right !== (prev.axes.right || false)) {
                    prev.axes.right = right;
                    if (inGame) callbacks.game(BUTTONS.RIGHT, right);
                    else if (right && callbacks.menu) callbacks.menu('right');
                }
                if (up !== (prev.axes.up || false)) {
                    prev.axes.up = up;
                    if (inGame) callbacks.game(BUTTONS.UP, up);
                    else if (up && callbacks.menu) callbacks.menu('up');
                }
                if (down !== (prev.axes.down || false)) {
                    prev.axes.down = down;
                    if (inGame) callbacks.game(BUTTONS.DOWN, down);
                    else if (down && callbacks.menu) callbacks.menu('down');
                }
            }

            // Pause triggers: Start+Select combo OR Menu/Guide button (16/17)
            var startPressed = gp.buttons[9] && gp.buttons[9].pressed;
            var selectPressed = gp.buttons[8] && gp.buttons[8].pressed;
            var combo = startPressed && selectPressed;
            var menuBtn = (gp.buttons[16] && gp.buttons[16].pressed) ||
                          (gp.buttons[17] && gp.buttons[17].pressed);
            var pauseTrigger = combo || menuBtn;
            if (pauseTrigger && !prev.pauseCombo) {
                if (callbacks.menu) callbacks.menu('back');
            }
            prev.pauseCombo = pauseTrigger;
        }
    }

    return {
        BUTTONS: BUTTONS,
        init: init,
        setMenuCallback: setMenuCallback,
        setGameCallback: setGameCallback,
        dispatchSnesKey: dispatchSnesKey,
        snesKeyMap: snesKeyMap,
        loadKeyMap: loadKeyMap,
        saveKeyMap: saveKeyMap,
        stopGamepadPolling: stopGamepadPolling
    };
})();
