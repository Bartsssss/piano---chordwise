/* Simple access code screen. A casual deterrent, not real security: the site and its code are public.
   The code itself is not stored here, only a salted hash. Once entered, the device remembers it. */
(function () {
  'use strict';
  var SALT = 'chordwise-gate-v1:';
  var HASH = '1d535a29'; // hash of the access code
  var KEY = 'chordwise:unlocked';

  function hash(s) {
    var x = 0x811c9dc5;
    for (var r = 0; r < 1000; r++) {
      var t = SALT + s + r;
      for (var i = 0; i < t.length; i++) { x ^= t.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
    }
    return x.toString(16);
  }
  function remembered() { try { return localStorage.getItem(KEY) === HASH; } catch (e) { return false; } }
  if (remembered()) return;

  var root = document.documentElement;
  root.classList.add('locked');

  function show() {
    var wrap = document.createElement('div');
    wrap.className = 'gate';
    wrap.innerHTML =
      '<form class="gate-card" autocomplete="off">' +
        '<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>' +
        '<h1>Chordwise</h1>' +
        '<label for="gate-code" class="muted">Enter the access code</label>' +
        '<input id="gate-code" type="password" inputmode="numeric" maxlength="12" autocomplete="off" required>' +
        '<p class="gate-error" role="alert"></p>' +
        '<button class="btn primary" type="submit">Open</button>' +
      '</form>';
    document.body.appendChild(wrap);
    var input = wrap.querySelector('input'), err = wrap.querySelector('.gate-error');
    input.focus();
    wrap.querySelector('form').onsubmit = function (e) {
      e.preventDefault();
      if (hash(input.value.trim()) === HASH) {
        try { localStorage.setItem(KEY, HASH); } catch (x) { /* ignore */ }
        root.classList.remove('locked');
        wrap.remove();
      } else {
        err.textContent = 'That code is not right. Try again.';
        input.value = '';
        input.focus();
      }
    };
  }
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
