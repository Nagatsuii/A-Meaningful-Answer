// dev.js — a hidden dev tools menu for testing. Normal players never see it.
//
// How to open it:
//   - add ?dev=1 to the page address (remembered until you visit with ?dev=0); a small DEV button appears
//   - on a keyboard, type the letters  d e v m o d e  quickly
//   - on a phone, tap the top-left corner of the screen 5 times quickly
//
// Its main tool is the game speed: one central time scale (Dev.timeScale()) that the whole game reads.
// main.js multiplies every frame's time step by it, so oscillators, animations, births, the byte
// ceremony, pulses and the clock's ticking all speed up together. Things tied to real life stay real:
// your own tapping, how long notes stay on screen to read, and time away from the game.
//
// More helpers can be added from anywhere with Dev.addTool(group, label, run) (main.js adds some).

const Dev = (function () {
  const KEY = 'a-meaningful-answer-dev';
  const SPEEDS = [1, 2, 5, 10, 100];

  let settings = load();     // { enabled, timeScale }
  const tools = [];          // helpers: { group, label, run }
  let panel = null;          // the menu, built the first time it opens
  let devButton = null;

  // ---------- settings (remembered on this device only) ----------

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s) return { enabled: !!s.enabled, timeScale: SPEEDS.includes(s.timeScale) ? s.timeScale : 1 };
    } catch (error) { /* none saved */ }
    return { enabled: false, timeScale: 1 };
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (error) { /* fine */ }
  }

  // ?dev=1 turns dev mode on (and remembers it); ?dev=0 turns it off and puts the speed back to normal.
  const asked = new URLSearchParams(location.search).get('dev');
  if (asked === '1') settings.enabled = true;
  if (asked === '0') settings = { enabled: false, timeScale: 1 };
  save();

  // ---------- the central time scale ----------

  function timeScale() {
    return settings.timeScale;
  }

  function setTimeScale(s) {
    settings.timeScale = s;
    save();
    updateBadge();
    if (panel) refreshSpeedButtons();
  }

  // ---------- the indicator badge ----------

  // Top left, whenever the game isn't at normal speed (or ?speed= is boosting bits earned).
  function updateBadge() {
    const badge = document.getElementById('test-badge');
    if (!badge) return;
    const parts = [];
    if (settings.timeScale !== 1) parts.push(`TIME ×${settings.timeScale}`);
    if (TEST_SPEED > 1) parts.push(`BITS ×${TEST_SPEED}`);
    badge.textContent = parts.join(' · ');
    badge.hidden = parts.length === 0;
  }

  // ---------- helpers ----------

  // Add a button to the menu. `group` is the heading it sits under; `run` is called when pressed.
  function addTool(group, label, run) {
    tools.push({ group: group, label: label, run: run });
    if (panel) buildTools();
  }

  // ---------- the menu ----------

  function build() {
    panel = document.createElement('div');
    panel.id = 'dev-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Dev tools');
    panel.innerHTML = `
      <div class="dev-head">
        <span>Dev tools</span>
        <button type="button" class="dev-close" aria-label="Close dev tools">×</button>
      </div>
      <div class="dev-section">
        <div class="dev-title">Game speed</div>
        <div class="dev-row" id="dev-speeds"></div>
      </div>
      <div id="dev-tools"></div>`;
    document.body.appendChild(panel);
    panel.querySelector('.dev-close').addEventListener('click', close);

    const speeds = panel.querySelector('#dev-speeds');
    for (const s of SPEEDS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${s}×`;
      b.dataset.speed = s;
      b.addEventListener('click', () => setTimeScale(s));
      speeds.appendChild(b);
    }
    refreshSpeedButtons();
    buildTools();
  }

  function refreshSpeedButtons() {
    for (const b of panel.querySelectorAll('#dev-speeds button')) {
      b.classList.toggle('on', Number(b.dataset.speed) === settings.timeScale);
      b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === settings.timeScale));
    }
  }

  // One section per group of helpers.
  function buildTools() {
    const box = panel.querySelector('#dev-tools');
    box.innerHTML = '';
    const groups = [...new Set(tools.map(t => t.group))];
    for (const g of groups) {
      const section = document.createElement('div');
      section.className = 'dev-section';
      section.innerHTML = `<div class="dev-title"></div><div class="dev-row"></div>`;
      section.querySelector('.dev-title').textContent = g;
      const row = section.querySelector('.dev-row');
      for (const t of tools.filter(x => x.group === g)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = t.label;
        b.addEventListener('click', () => t.run());
        row.appendChild(b);
      }
      box.appendChild(section);
    }
  }

  function open() {
    if (!panel) build();
    panel.hidden = false;
    panel.querySelector('.dev-close').focus();
  }

  function close() {
    if (panel) panel.hidden = true;
  }

  function isOpen() {
    return !!panel && !panel.hidden;
  }

  function toggle() {
    if (isOpen()) close(); else open();
  }

  // The small DEV button (only in dev mode).
  function showDevButton() {
    if (devButton) return;
    devButton = document.createElement('button');
    devButton.id = 'dev-button';
    devButton.type = 'button';
    devButton.textContent = 'DEV';
    devButton.setAttribute('aria-label', 'Open dev tools');
    devButton.addEventListener('click', toggle);
    document.body.appendChild(devButton);
  }

  // ---------- secret ways in ----------

  // Typing "devmode" (letters only, within a couple of seconds).
  let typed = '';
  let typedAt = 0;
  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && isOpen()) { close(); return; }
    if (event.key.length !== 1) return;
    const now = Date.now();
    if (now - typedAt > 2000) typed = '';
    typedAt = now;
    typed = (typed + event.key.toLowerCase()).slice(-7);
    if (typed === 'devmode') {
      typed = '';
      showDevButton();
      open();
    }
  });

  // Five quick taps in the top-left corner (within 2.5 seconds).
  let cornerTaps = [];
  window.addEventListener('pointerdown', function (event) {
    if (event.clientX > 60 || event.clientY > 60) return;
    const now = Date.now();
    cornerTaps = cornerTaps.filter(t => now - t < 2500);
    cornerTaps.push(now);
    if (cornerTaps.length >= 5) {
      cornerTaps = [];
      showDevButton();
      open();
    }
  }, { capture: true });

  // ---------- start ----------

  function start() {
    updateBadge();
    if (settings.enabled) showDevButton();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  return { timeScale, setTimeScale, addTool, open, close, toggle };
})();
