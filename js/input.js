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

    var gamepadMap = {
        0: BUTTONS.A,
        1: BUTTONS.B,
        2: BUTTONS.X,
        3: BUTTONS.Y,
        4: BUTTONS.L,
        5: BUTTONS.R,
        8: BUTTONS.SELECT,
        9: BUTTONS.START
    };

    function init() {
        loadKeyMap();
        setupKeyboard();
        setupTVRemote();
        startGamepadPolling();
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
        var event = new KeyboardEvent(eventType, {
            key: keyValue,
            code: keyValue === ' ' ? 'Space' : 'Key' + keyValue.toUpperCase(),
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);
    }

    function setupKeyboard() {
        document.addEventListener('keydown', function(e) {
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

    function startGamepadPolling() {
        gamepadPollInterval = setInterval(pollGamepads, 16);
    }

    function stopGamepadPolling() {
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

            var id = gp.index;
            if (!prevGamepadState[id]) prevGamepadState[id] = { buttons: {}, axes: {} };
            var prev = prevGamepadState[id];

            for (var bi = 0; bi < gp.buttons.length; bi++) {
                var pressed = gp.buttons[bi].pressed;
                var wasPressed = prev.buttons[bi] || false;

                if (pressed !== wasPressed) {
                    prev.buttons[bi] = pressed;
                    var button = gamepadMap[bi];
                    if (button) {
                        if (callbacks.game) callbacks.game(button, pressed);
                        if (pressed && callbacks.menu) {
                            if (button === BUTTONS.A || button === BUTTONS.START) callbacks.menu('enter');
                            else if (button === BUTTONS.B) callbacks.menu('back');
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
                    if (callbacks.game) callbacks.game(BUTTONS.LEFT, left);
                    if (left && callbacks.menu) callbacks.menu('left');
                }
                if (right !== (prev.axes.right || false)) {
                    prev.axes.right = right;
                    if (callbacks.game) callbacks.game(BUTTONS.RIGHT, right);
                    if (right && callbacks.menu) callbacks.menu('right');
                }
                if (up !== (prev.axes.up || false)) {
                    prev.axes.up = up;
                    if (callbacks.game) callbacks.game(BUTTONS.UP, up);
                    if (up && callbacks.menu) callbacks.menu('up');
                }
                if (down !== (prev.axes.down || false)) {
                    prev.axes.down = down;
                    if (callbacks.game) callbacks.game(BUTTONS.DOWN, down);
                    if (down && callbacks.menu) callbacks.menu('down');
                }
            }

            var startPressed = gp.buttons[9] && gp.buttons[9].pressed;
            var selectPressed = gp.buttons[8] && gp.buttons[8].pressed;
            var combo = startPressed && selectPressed;
            if (combo && !prev.pauseCombo) {
                if (callbacks.menu) callbacks.menu('back');
            }
            prev.pauseCombo = combo;
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
