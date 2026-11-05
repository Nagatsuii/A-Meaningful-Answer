// ui.js — the upgrade menu and the counter. These are normal page elements
// (not canvas drawings) so the text stays sharp and the buttons work with keyboards and screen readers.
// On wide screens the menu sits to the right of the sky; on phones it slides up from the bottom.

const UI = (function () {
  const panel = document.getElementById('panel');
  const tab = document.getElementById('panel-tab');
  const list = document.getElementById('upgrade-list');
  const counterEl = document.getElementById('counter');
  const countEl = document.getElementById('count');
  const unitEl = document.getElementById('unit');
  const rateEl = document.getElementById('rate');
  const noteEl = document.getElementById('note');
  const choiceEl = document.getElementById('choice');
  let noteTimer = null;

  const buttons = {}; // one button per upgrade, found by id
  const cued = new Set(); // upgrades that have already had their "now affordable" cue
  let firstRefresh = true;
  let onAffordable = null;

  // While testing at a higher speed, show a small badge so it's never mistaken for normal play.
  if (TEST_SPEED > 1) {
    const badge = document.getElementById('test-badge');
    badge.textContent = `TEST ×${TEST_SPEED}`;
    badge.hidden = false;
  }

  // Build the menu once. `onBuy(id)` is called when an upgrade is pressed,
  // `onChoose(track)` when one of the two paths is picked, and `whenAffordable()` the first time
  // each upgrade becomes affordable (for a little sound cue).
  function build(onBuy, onChoose, whenAffordable) {
    onAffordable = whenAffordable;
    buildSoundControls();
    for (const id of Upgrades.ids) {
      const u = CONFIG.upgrades[id];
      const button = document.createElement('button');
      button.className = 'upgrade' + (u.track ? ` track-${u.track}` : ''); // track upgrades get their colour
      button.hidden = true; // stays hidden until the upgrade is revealed
      button.innerHTML = `
        <span class="upgrade-top">
          <span class="upgrade-name">${u.name}</span>
          <span class="upgrade-owned"></span>
        </span>
        <span class="upgrade-effect">${u.effect}</span>
        <span class="upgrade-lesson">${u.lesson}</span>
        <span class="upgrade-cost"></span>`;
      button.addEventListener('click', () => onBuy(id));
      list.appendChild(button);
      buttons[id] = button;
    }

    for (const button of choiceEl.querySelectorAll('button')) {
      button.addEventListener('click', () => onChoose(button.dataset.track));
    }

    // On phones, the tab opens and closes the sliding menu.
    tab.addEventListener('click', () => {
      const open = panel.classList.toggle('open');
      tab.setAttribute('aria-expanded', String(open));
    });
  }

  // Bring everything on screen up to date with the game state.
  function refresh(state, showCounter) {
    if (showCounter) {
      // Bits can include fractions (from boosts and memory cells), so show whole bits only.
      const whole = Math.floor(state.bits);
      countEl.textContent = whole.toLocaleString();
      unitEl.textContent = whole === 1 ? 'bit' : 'bits';
      const rate = Upgrades.bitsPerSecond(state) * TEST_SPEED;
      const shown = rate < 10 ? Math.round(rate * 10) / 10 : Math.round(rate); // one decimal when small
      rateEl.textContent = rate > 0 ? `+${shown.toLocaleString()} per second` : '';
      counterEl.classList.add('visible');
    }

    let anyRevealed = false;
    let anyAffordable = false;
    for (const id of Upgrades.ids) {
      const button = buttons[id];
      const revealed = showCounter && Upgrades.isRevealed(state, id);
      button.hidden = !revealed;
      if (!revealed) continue;
      anyRevealed = true;
      const cost = Upgrades.cost(state, id);
      const owned = Upgrades.owned(state, id);
      button.querySelector('.upgrade-owned').textContent = owned > 0 ? `× ${owned}` : '';
      button.querySelector('.upgrade-cost').textContent = `${cost.toLocaleString()} bits`;
      button.disabled = !Upgrades.canAfford(state, id);
      if (!button.disabled) {
        anyAffordable = true;
        // The first time an upgrade becomes affordable, give a tiny cue (not for ones affordable at load).
        if (!cued.has(id)) {
          cued.add(id);
          if (!firstRefresh && onAffordable) onAffordable();
        }
      }
    }
    if (showCounter) firstRefresh = false;

    // The menu itself fades in when its first upgrade is revealed.
    panel.classList.toggle('revealed', anyRevealed);
    document.body.classList.toggle('menu-revealed', anyRevealed);
    // On phones, the closed menu's tab glows softly when there's something you can buy.
    tab.classList.toggle('glow', anyAffordable);
  }

  // Where should the bit sit so it isn't hidden behind the menu?
  // Returns the middle of the open sky as { x, y }.
  function skyCentre(width, height) {
    if (!panel.classList.contains('revealed')) return { x: width / 2, y: height / 2 };
    const box = panel.getBoundingClientRect();
    if (box.left > width / 2) return { x: box.left / 2, y: height / 2 }; // menu on the right
    return { x: width / 2, y: Math.min(box.top, height) / 2 };          // menu along the bottom
  }

  // Turn a number of seconds into friendly words, like "2h 14m" or "5 min".
  function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    // "\u00a0" is a space that never breaks, so "2h 14m" always stays on one line.
    if (hours > 0) return minutes > 0 ? `${hours}h\u00a0${minutes}m` : `${hours}h`;
    if (minutes > 0) return `${minutes}\u00a0min`;
    return `${Math.floor(seconds)}\u00a0sec`;
  }

  // Show a short note under the counter for a few seconds.
  function showNote(text, seconds) {
    noteEl.textContent = text;
    noteEl.classList.add('show');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => noteEl.classList.remove('show'), seconds * 1000);
  }

  // Briefly show what was earned while the player was gone.
  // hours: how long away time counts for; memory: true if memory cells helped.
  function showAway(seconds, bits, capped, hours, memory) {
    const who = memory ? 'your byte kept working' : 'your oscillators kept flipping';
    let text = `Welcome back. While you were away (${formatDuration(seconds)}), ` +
      `${who}: +${bits.toLocaleString()} bits.`;
    if (capped) text += ` Away time counts for up to ${hours} hours.`;
    showNote(text, CONFIG.offlineMessageSeconds);
  }

  // Show or hide the two path buttons (Storage and Logic).
  function showChoice(open) {
    choiceEl.hidden = false;
    // Wait a frame so the fade-in transition runs.
    requestAnimationFrame(() => choiceEl.classList.toggle('open', open));
    if (!open) setTimeout(() => { if (!choiceEl.classList.contains('open')) choiceEl.hidden = true; }, 1200);
  }

  // Keep each path button sitting on its doorway of light.
  function placeChoice(points) {
    for (const button of choiceEl.querySelectorAll('button')) {
      const p = points[button.dataset.track];
      button.style.left = `${p.x}px`;
      button.style.top = `${p.y}px`;
    }
  }

  // ---------- sound controls ----------

  // The mute button and volume slider in the top corner. Settings are remembered between visits.
  function buildSoundControls() {
    const mute = document.getElementById('mute');
    const volume = document.getElementById('volume');
    const s = Sound.getSettings();
    volume.value = Math.round(s.volume * 100);
    const showMuted = muted => {
      mute.classList.toggle('muted', muted);
      mute.setAttribute('aria-pressed', String(muted));
      mute.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    };
    showMuted(s.muted);
    mute.addEventListener('click', () => {
      const muted = !Sound.getSettings().muted;
      Sound.setMuted(muted);
      showMuted(muted);
    });
    volume.addEventListener('input', () => {
      Sound.setVolume(volume.value / 100);
      if (Sound.getSettings().muted && volume.value > 0) { // moving the slider unmutes
        Sound.setMuted(false);
        showMuted(false);
      }
    });
  }

  // ---------- achievements ----------

  const achEl = document.getElementById('achievement');
  const achQueue = [];
  let achShowing = false;

  // Announce an achievement. If several arrive at once, they're shown one after another.
  function showAchievement(a, onShow) {
    achQueue.push({ a: a, onShow: onShow });
    if (!achShowing) nextAchievement();
  }

  function nextAchievement() {
    const item = achQueue.shift();
    if (!item) { achShowing = false; return; }
    achShowing = true;
    document.getElementById('ach-name').textContent = item.a.name;
    document.getElementById('ach-text').textContent = item.a.text;
    achEl.classList.add('show');
    if (item.onShow) item.onShow();
    setTimeout(() => {
      achEl.classList.remove('show');
      setTimeout(nextAchievement, 900);
    }, 4500);
  }

  return { build, refresh, skyCentre, showNote, showAway, showChoice, placeChoice, showAchievement };
})();
