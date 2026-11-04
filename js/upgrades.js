// upgrades.js — the rules for buying upgrades and what they do.
// The numbers themselves (costs, effects) live in config.js.

const Upgrades = {
  // The order upgrades are listed in the menu.
  ids: ['amplifier', 'oscillator', 'secondBit'],

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
    return 1 + this.owned(state, 'secondBit');
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

  // Bits per second earned without tapping.
  bitsPerSecond(state) {
    return this.flipsPerSecond(state) * this.averageFlipsPerStep(state) * CONFIG.upgrades.oscillator.bitsPerFlip;
  }
};
