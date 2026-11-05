// upgrades.js — the rules for buying upgrades and what they do.
// The numbers themselves (costs, effects) live in config.js.

const Upgrades = {
  // The order upgrades are listed in the menu.
  ids: ['amplifier', 'oscillator', 'resonance', 'secondBit', 'nextBit',
    'latch', 'register', 'memoryCell',     // Storage track
    'notGate', 'andGate', 'orGate', 'ifThenElse'], // Logic track

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
    const u = CONFIG.upgrades[id];
    if (u.track && state.track !== u.track) return false;
    if (u.requires && this.owned(state, u.requires) === 0) return false;  // e.g. Next Bit needs the second bit
    if (u.requiresBits && this.bitCount(state) < u.requiresBits) return false; // e.g. Resonance needs 5 bits
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

  // How many bits are in the sky: the first, the second, and however many Next Bits are owned.
  bitCount(state) {
    return 1 + this.owned(state, 'secondBit') + this.owned(state, 'nextBit');
  },

  // A card's name, effect and lesson. Next Bit changes them with each bit bought (Third Bit, Fourth Bit...).
  text(state, id, field) {
    const u = CONFIG.upgrades[id];
    const list = u[field + 's'];   // e.g. "names", "effects", "lessons"
    const text = list ? list[Math.min(this.owned(state, id), list.length - 1)] : u[field];
    // Numbers in the text come from config, so a card always matches the rules:
    //   {bonus} = the bits' bonus, {pct:field} = a field as a percentage, {x:field} = a field as it is.
    return text
      .replace('{bonus}', Math.round(CONFIG.bitBonusEach * 100))
      .replace(/\{pct:(\w+)\}/g, (m, f) => Math.round(u[f] * 100))
      .replace(/\{x:(\w+)\}/g, (m, f) => u[f]);
  },

  // Every bit beyond the first makes all earning a little more than before (15% each: two bits ×1.15,
  // three bits ×1.32, and so on), for the rest of the universe. Multiplying keeps each new bit feeling as big.
  bitBonus(state) {
    return Math.pow(1 + CONFIG.bitBonusEach, this.bitCount(state) - 1);
  },

  // Everything earned is multiplied by this: Knowledge from earlier universes, and the bits' bonus.
  productionMultiplier(state) {
    return this.knowledgeMultiplier(state) * this.bitBonus(state);
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
    const resonance = 1 + this.owned(state, 'resonance') * CONFIG.upgrades.resonance.speedEach;
    return this.owned(state, 'oscillator') * CONFIG.upgrades.oscillator.flipsPerSecondEach * resonance;
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

  // The IF · THEN · ELSE rule: every step checks one condition and takes exactly one path.
  //   IF the step carried  THEN multiply by thenMultiplier  ELSE multiply by elseMultiplier
  // Without the upgrade, both paths are simply ×1.
  branchMultiplier(state, carried) {
    if (this.owned(state, 'ifThenElse') === 0) return 1;
    const u = CONFIG.upgrades.ifThenElse;
    if (carried) {
      return u.thenMultiplier;
    } else {
      return u.elseMultiplier;
    }
  },

  // One counting step, starting from `value`: what it earns, whether it carried, and the new value.
  // This is the single place that decides what a step is worth.
  // perFlip: bits per bit flipped. source: 'tap' or 'osc' (the AND gate boosts taps, OR boosts oscillators).
  step(state, value, perFlip, source) {
    const n = this.bitCount(state);
    // Adding 1 flips every 1 at the right-hand end to 0, then flips the next 0 to 1.
    // So the flips = (number of 1s in a row at the right) + 1, but never more than n.
    // Every flip after the first is a carry.
    let ones = 0;
    while (ones < n && Math.floor(value / Math.pow(2, ones)) % 2 === 1) ones++;
    const flips = Math.min(ones + 1, n);
    const carried = flips > 1;
    const next = (value + 1) % Math.pow(2, n);

    let gain = (1 + (flips - 1) * this.carryMultiplier(state)) * perFlip; // NOT gate: carries worth more
    gain *= this.branchMultiplier(state, carried);                         // IF carried THEN ×3 ELSE ×1.5
    gain *= this.gateBonus(state, source, next);                           // AND / OR gates
    return { gain: gain, carried: carried, next: next };
  },

  // What one step earns on average, for when there are too many steps to count one by one
  // (like hours away). Counting goes round in a loop through every value the bits can show,
  // so we walk that loop once (at most 256 steps for a byte) and take the average.
  averageStepEarning(state, perFlip, source) {
    const size = Math.pow(2, this.bitCount(state));
    let total = 0;
    for (let v = 0; v < size; v++) total += this.step(state, v, perFlip, source).gain;
    return total / size;
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

  // ---------- Knowledge (carried between universes) ----------

  // Everything earned is multiplied by this: 1 + 10% per point of Knowledge.
  knowledgeMultiplier(state) {
    return 1 + (state.knowledge || 0) * CONFIG.knowledge.bonusEach;
  },

  // How much Knowledge falling into the black hole now would give.
  // A square root means more bits always give more, but each extra point takes longer.
  knowledgeFromFall(state) {
    return Math.floor(Math.sqrt(state.lifetimeBits / CONFIG.knowledge.divisor));
  },

  // Bits per second earned without tapping.
  bitsPerSecond(state) {
    const perFlip = CONFIG.upgrades.oscillator.bitsPerFlip;
    return this.flipsPerSecond(state) * this.averageStepEarning(state, perFlip, 'osc') + this.trickle(state);
  }
};
