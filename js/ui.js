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
  let noteTimer = null;

  const buttons = {}; // one button per upgrade, found by id

  // Build the menu once. `onBuy(id)` is called when a button is pressed.
  function build(onBuy) {
    for (const id of Upgrades.ids) {
      const u = CONFIG.upgrades[id];
      const button = document.createElement('button');
      button.className = 'upgrade';
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

    // On phones, the tab opens and closes the sliding menu.
    tab.addEventListener('click', () => {
      const open = panel.classList.toggle('open');
      tab.setAttribute('aria-expanded', String(open));
    });
  }

  // Bring everything on screen up to date with the game state.
  function refresh(state, showCounter) {
    if (showCounter) {
      countEl.textContent = state.bits.toLocaleString();
      unitEl.textContent = state.bits === 1 ? 'bit' : 'bits';
      const rate = Upgrades.bitsPerSecond(state);
      rateEl.textContent = rate > 0 ? `+${rate.toLocaleString()} per second` : '';
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
      if (!button.disabled) anyAffordable = true;
    }

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

  // Briefly show what the oscillators earned while the player was gone.
  function showAway(seconds, bits, capped) {
    let text = `Welcome back. While you were away (${formatDuration(seconds)}), ` +
      `your oscillators kept flipping: +${bits.toLocaleString()} bits.`;
    if (capped) text += ` They rest after ${CONFIG.offlineMaxHours} hours.`;
    showNote(text, CONFIG.offlineMessageSeconds);
  }

  return { build, refresh, skyCentre, showNote, showAway };
})();
