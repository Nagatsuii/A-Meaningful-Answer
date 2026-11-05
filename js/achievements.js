// achievements.js — small milestones worth celebrating, each with a one-line lesson.
// Each one has a test (`done`) that looks at the game state. Once earned, it stays earned.

const Achievements = {
  list: [
    {
      id: 'carry',
      name: 'Carry the One',
      text: 'Your first carry: a 1 passed along to the next bit.',
      done: state => state.stats.carries >= 1
    },
    {
      id: 'taps100',
      name: 'Persistent Signal',
      text: '100 flips by hand.',
      done: state => state.stats.taps >= 100
    },
    {
      id: 'kilobit',
      name: 'Kilobit',
      text: '1,024 bits earned. In computing, a "kilo" is 1,024, not 1,000.',
      done: state => state.lifetimeBits >= 1024
    },
    {
      id: 'clockwork',
      name: 'Clockwork',
      text: 'Five oscillators, ticking together.',
      done: state => (state.upgrades.oscillator || 0) >= 5
    },
    {
      id: 'overflow',
      name: 'Overflow',
      text: 'Your byte counted past 255 and wrapped back round to 0.',
      done: state => state.stats.wraps >= 1
    },
    {
      id: 'fork',
      name: 'A Fork in the Light',
      text: 'You chose your first path.',
      done: state => !!state.track
    },
    {
      id: 'megabit',
      name: 'Megabit',
      text: '1,048,576 bits earned: 1,024 × 1,024.',
      done: state => state.lifetimeBits >= 1048576
    }
  ],

  // Mark any newly earned achievements, and return them (so they can be announced).
  check(state) {
    const fresh = [];
    for (const a of this.list) {
      if (!state.achievements[a.id] && a.done(state)) {
        state.achievements[a.id] = true;
        fresh.push(a);
      }
    }
    return fresh;
  }
};
