// upgrades.js — the rules for buying upgrades and what they do.
// The numbers themselves (costs, effects) live in config.js.

const Upgrades = {
  // The order upgrades are listed in the menu.
  ids: ['amplifier', 'oscillator', 'secondBit',
    'latch', 'register', 'memoryCell',     // Storage track
    'notGate', 'andGate', 'orGate'],       // Logic track

  // How many of this upgrade the player owns.
  owned(state, id) {
    return state.upgrades[id] || 0;
  },

  // The price of the next one. Each purchase makes the next a little dearer.
  cost(state, id) {
    const u = CONFIG.upgrades[id];
    return Math.ceil(u.baseCost * Math.pow(u.costGrowth, this.owned(state, id)));
  },

  // Some upgrades (like the second bit) can only be bought a set number of times.
  isMaxed(state, id) {
    const max = CONFIG.upgrades[id].maxOwned;
    return max !== undefined && this.owned(state, id) >= max;
  },

  canAfford(state, id) {
    return !this.isMaxed(state, id) && state.bits >= this.cost(state, id);
  },

  // Should this upgrade show in the menu? (Once-only upgrades disappear after you buy them.)
  isRevealed(state, id) {
    if (this.isMaxed(state, id)) return false;
    // Track upgrades only show for the track you chose.
    const track = CONFIG.upgrades[id].track;
    if (track && state.track !== track) return false;
    return this.owned(state, id) > 0 || state.lifetimeBits >= CONFIG.upgrades[id].revealAt;
  },

  // Try to buy one. Returns true if it worked.
  buy(state, id) {
    if (!this.canAfford(state, id)) return false;
    state.bits -= this.cost(state, id);
    state.upgrades[id] = this.owned(state, id) + 1;
    return true;
  },

  // ---------- what upgrades add up to ----------

  // How many bits are in the sky.
  bitCount(state) {
    return 1 + this.owned(state, 'secondBit') + (state.joinedBits || 0);
  },

  // How many bits *should* be in the sky by now? The 3rd bit onward joins by itself
  // when lifetime bits pass each total in CONFIG.joinAt (but only after you own the second bit).
  bitsEarned(state) {
    let n = 1 + this.owned(state, 'secondBit');
    if (n < 2) return n;
    for (const total of CONFIG.joinAt) {
      if (state.lifetimeBits >= total) n++;
    }
    return n;
  },

  // Counting up in binary, how many bits flip per step on average?
  // With 1 bit it's always 1. With 2 bits: 1, 2, 1, 2... so 1.5. (The pattern is 2 - 2^(1 - bits).)
  averageFlipsPerStep(state) {
    return 2 - Math.pow(2, 1 - this.bitCount(state));
  },

  // Bits earned for each bit a tap flips.
  bitsPerTap(state) {
    return CONFIG.bitsPerTap + this.owned(state, 'amplifier') * CONFIG.upgrades.amplifier.bitsPerTapEach;
  },

  // How many times per second the oscillators step the counter forward.
  flipsPerSecond(state) {
    return this.owned(state, 'oscillator') * CONFIG.upgrades.oscillator.flipsPerSecondEach;
  },

  // ---------- Logic track: what one counting step earns ----------

  // How much a carried flip is worth compared with an ordinary one (the NOT gate doubles it).
  carryMultiplier(state) {
    return 1 + this.owned(state, 'notGate') * CONFIG.upgrades.notGate.carryBonusEach;
  },

  // Extra reward from AND and OR gates, judged on the two rightmost bits after a step.
  // source is 'tap' (AND applies) or 'osc' (OR applies).
  gateBonus(state, source, value) {
    const bit0 = value % 2;
    const bit1 = Math.floor(value / 2) % 2;
    if (source === 'tap' && bit0 && bit1) {
      return 1 + this.owned(state, 'andGate') * CONFIG.upgrades.andGate.bonusEach;
    }
    if (source === 'osc' && (bit0 || bit1)) {
      return 1 + this.owned(state, 'orGate') * CONFIG.upgrades.orGate.bonusEach;
    }
    return 1;
  },

  // What one step earns on average, for when there are too many steps to count one by one.
  // (Counting up, both rightmost bits are 1 a quarter of the time; at least one is 1 three quarters of the time.)
  averageStepEarning(state, perFlip, source) {
    const carries = this.averageFlipsPerStep(state) - 1;
    const base = (1 + carries * this.carryMultiplier(state)) * perFlip;
    const bonus = source === 'tap'
      ? 1 + 0.25 * this.owned(state, 'andGate') * CONFIG.upgrades.andGate.bonusEach
      : 1 + 0.75 * this.owned(state, 'orGate') * CONFIG.upgrades.orGate.bonusEach;
    return base * bonus;
  },

  // ---------- Storage track ----------

  // Bits per second from memory cells: earned always, even while away.
  trickle(state) {
    return this.owned(state, 'memoryCell') * CONFIG.upgrades.memoryCell.bitsPerSecondEach;
  },

  // How many hours away still count.
  offlineHours(state) {
    return CONFIG.offlineMaxHours + this.owned(state, 'latch') * CONFIG.upgrades.latch.hoursEach;
  },

  // How much of the normal rate you earn while away.
  offlineMultiplier(state) {
    return CONFIG.offlineEfficiency * (1 + this.owned(state, 'register') * CONFIG.upgrades.register.bonusEach);
  },

  // Bits per second earned without tapping.
  bitsPerSecond(state) {
    const perFlip = CONFIG.upgrades.oscillator.bitsPerFlip;
    return this.flipsPerSecond(state) * this.averageStepEarning(state, perFlip, 'osc') + this.trickle(state);
  }
};
