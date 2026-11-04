// upgrades.js — the rules for buying upgrades and what they do.
// The numbers themselves (costs, effects) live in config.js.

const Upgrades = {
  // The order upgrades are listed in the menu.
  ids: ['amplifier', 'oscillator'],

  // How many of this upgrade the player owns.
  owned(state, id) {
    return state.upgrades[id] || 0;
  },

  // The price of the next one. Each purchase makes the next a little dearer.
  cost(state, id) {
    const u = CONFIG.upgrades[id];
    return Math.ceil(u.baseCost * Math.pow(u.costGrowth, this.owned(state, id)));
  },

  canAfford(state, id) {
    return state.bits >= this.cost(state, id);
  },

  // Should this upgrade show in the menu yet?
  isRevealed(state, id) {
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

  // Bits earned by one tap.
  bitsPerTap(state) {
    return CONFIG.bitsPerTap + this.owned(state, 'amplifier') * CONFIG.upgrades.amplifier.bitsPerTapEach;
  },

  // How many times per second the oscillators flip the bit.
  flipsPerSecond(state) {
    return this.owned(state, 'oscillator') * CONFIG.upgrades.oscillator.flipsPerSecondEach;
  },

  // Bits per second earned without tapping.
  bitsPerSecond(state) {
    return this.flipsPerSecond(state) * CONFIG.upgrades.oscillator.bitsPerFlip;
  }
};
