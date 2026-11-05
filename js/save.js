// save.js — remembers the game between visits using the browser's localStorage.
// Tip: add ?reset to the end of the page address to wipe the save and start over.

const Save = {
  // A brand-new game: nothing has happened yet.
  fresh() {
    return {
      version: 1,
      sparked: false, // has the first bit been born?
      value: 0,       // the number the bits currently show, e.g. 2 = binary 10
      bits: 0,        // the bit counter (our currency)
      lifetimeBits: 0, // every bit ever earned, even ones spent; used to reveal upgrades
      upgrades: {},   // how many of each upgrade you own, e.g. { amplifier: 2 }
      joinedBits: 0,  // how many constellation bits (3rd onward) have joined by themselves
      byteFormed: false, // have all eight bits come together as a byte?
      track: null,    // which path was chosen first: 'storage', 'logic', or null (not yet)
      hookSeen: false, // has the locked path and the distant dark shimmer appeared yet?
      achievements: {}, // achievements earned, e.g. { carry: true }
      stats: { taps: 0, carries: 0, wraps: 0 }, // counts that some achievements look at
      // How many universes have ended in a black-hole reset. The reset isn't built yet; when it is,
      // it must carry this number over into the new game. Above 0, the drone turns warm.
      universesCompleted: 0,
      knowledge: 0,   // carried from universe to universe: each point boosts all earning (see CONFIG.knowledge)
      lastSeen: null  // the clock time (in milliseconds) the game was last running
    };
  },

  // Read the save, or start fresh if there isn't one.
  // localStorage can be blocked (private windows, strict settings), so we never let it crash the game.
  load() {
    try {
      const text = localStorage.getItem(CONFIG.saveKey);
      if (!text) return this.fresh();
      // Start from a fresh game and copy the saved values over it,
      // so a save from an older version still gets any new fields.
      return Object.assign(this.fresh(), JSON.parse(text));
    } catch (error) {
      return this.fresh();
    }
  },

  // Write the current game to the save slot.
  save(state) {
    try {
      localStorage.setItem(CONFIG.saveKey, JSON.stringify(state));
    } catch (error) {
      // Can't save here (for example in a private window). The game still plays.
    }
  },

  // Delete the save entirely.
  clear() {
    try {
      localStorage.removeItem(CONFIG.saveKey);
    } catch (error) {
      // Nothing to clear.
    }
  }
};
