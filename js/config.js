// config.js — every number you might want to tweak lives here.
// Change a value, save, and refresh the page to see the effect.

const CONFIG = {
  // --- Economy ---
  bitsPerTap: 1,             // bits earned for each bit your tap flips (a carry can flip more than one)

  // --- Saving ---
  saveKey: 'a-meaningful-answer-save-v1', // name of the save slot in the browser's localStorage

  // --- The faint glow before the first tap ---
  darknessSeconds: 6,        // how long the screen stays dark (while "insufficient data" flickers) before the glow fades in
  hintPulseSeconds: 4,       // one slow "breath" of the glow, in seconds
  hintRadius: 46,            // size of the glow, in screen pixels

  // --- The first bit being born ---
  birthSeconds: 2.6,         // length of the birth animation
  birthParticles: 28,        // sparks thrown out when the bit ignites

  // --- The bit itself ---
  bitCoreRadius: 4,          // the bright centre of the star
  bitHaloRadius: 34,         // the soft light around it
  offBrightness: 0.35,       // how bright the bit is when it reads 0 (1 = fully on)
  toggleEaseSpeed: 6,        // how quickly the bit fades between 0 and 1 (higher = faster)

  // --- Tapping ---
  tapRadiusMin: 64,          // you can tap this many pixels from the bit and still hit it
  tapRadiusScreenShare: 0.16, // ...or this share of the screen's short side, whichever is bigger

  // --- Upgrades ---
  // cost of the next one = baseCost × costGrowth ^ (how many you already own), rounded up.
  // revealAt: the upgrade appears in the menu once you've earned this many bits in total.
  upgrades: {
    amplifier: {
      name: 'Amplifier',
      effect: '+1 bit for every flip you make',
      lesson: 'An amplifier makes a weak signal stronger.',
      baseCost: 15,
      costGrowth: 2.1,
      revealAt: 5,
      bitsPerTapEach: 1      // extra bits per tap, for each amplifier owned
    },
    oscillator: {
      name: 'Oscillator',
      effect: 'flips the bit on its own',
      lesson: 'A circuit that switches itself on and off: the heartbeat inside every computer.',
      baseCost: 40,
      costGrowth: 1.6,
      revealAt: 12,
      flipsPerSecondEach: 1,   // each oscillator flips the bit once a second
      bitsPerFlip: 1           // bits earned for each bit an automatic tick flips
    },
    secondBit: {
      name: 'Second Bit',
      effect: 'a second bit joins the first',
      lesson: 'Two bits can hold four states: 00, 01, 10, 11. Each bit you add doubles what can be stored.',
      baseCost: 9000,
      costGrowth: 1,
      revealAt: 5000,
      maxOwned: 1              // you can only buy this once
    },

    // ----- Storage track (teal): keeping information. Helps you earn while away. -----
    latch: {
      track: 'storage',
      name: 'Latch',
      effect: 'time away counts for 4 more hours',
      lesson: 'The simplest memory: it holds a 1 or a 0 until it is told to change.',
      baseCost: 9000,
      costGrowth: 2.2,
      revealAt: 125000,
      maxOwned: 3,
      hoursEach: 4             // extra offline hours per latch
    },
    register: {
      track: 'storage',
      name: 'Register',
      effect: '+50% bits earned while away',
      lesson: 'A register holds a whole byte right inside the processor, ready to use.',
      baseCost: 14000,
      costGrowth: 1.9,
      revealAt: 140000,
      bonusEach: 0.5           // +50% offline earnings per register
    },
    memoryCell: {
      track: 'storage',
      name: 'Memory Cell',
      effect: '+35 bits per second, always',
      lesson: 'Memory keeps information from being lost. Your computer\'s RAM is billions of tiny cells like this.',
      baseCost: 18000,
      costGrowth: 1.55,
      revealAt: 125000,       // at the fork, with the Latch: it's the Storage upgrade that helps while you play
      bitsPerSecondEach: 35    // earned every second, even while away and with no oscillators
    },

    // ----- Logic track (violet): transforming information. Makes flips worth more. -----
    notGate: {
      track: 'logic',
      name: 'NOT Gate',
      effect: 'carries earn double',
      lesson: 'NOT turns 1 into 0 and 0 into 1. A carry is exactly that: a run of 1s flipping to 0.',
      baseCost: 9000,
      costGrowth: 1,
      revealAt: 125000,
      maxOwned: 1,
      carryBonusEach: 1        // each carried flip earns this much extra (1 = double)
    },
    andGate: {
      track: 'logic',
      name: 'AND Gate',
      effect: '+100% on taps that leave the two rightmost bits both 1',
      lesson: 'AND outputs 1 only when both of its inputs are 1.',
      baseCost: 14000,
      costGrowth: 1.7,
      revealAt: 140000,
      bonusEach: 1
    },
    orGate: {
      track: 'logic',
      name: 'OR Gate',
      effect: '+50% on oscillator steps that leave either rightmost bit on',
      lesson: 'OR outputs 1 when either input is 1, or both.',
      baseCost: 18000,
      costGrowth: 1.65,
      revealAt: 160000,
      bonusEach: 0.5
    },
    ifThenElse: {
      track: 'logic',
      name: 'IF · THEN · ELSE',
      effect: 'IF a step carries, THEN it earns ×1.75, ELSE it earns ×1.3',
      lesson: 'Programs make choices: check a condition, then take one path or the other. Every app you use is full of IF, THEN and ELSE.',
      baseCost: 30000,
      costGrowth: 1,
      revealAt: 180000,
      maxOwned: 1,
      thenMultiplier: 1.75,    // a step that carries earns this many times as much
      elseMultiplier: 1.3      // a step that doesn't carry earns this many times as much
    }
  },

  // --- Choosing Storage or Logic (after the byte forms) ---
  trackChoiceAt: 125000,       // the two paths open once lifetime bits reach this (about 42 minutes in)
  choiceOpenSeconds: 2,        // how long the paths take to draw themselves out of the byte
  choiceSettleSeconds: 3.2,    // after choosing: the chosen light flows into the byte, the other fades

  // --- The hook (end of the first hour) ---
  // The path you didn't choose glows faintly again, and far off a dark shimmer appears: a black hole.
  hookAt: 230000,              // lifetime bits needed (after choosing a track; about 55 minutes in)
  hookDoorSeconds: 6,          // the locked doorway fades back in over this long
  hookShimmerDelay: 10,        // seconds later, the dark shimmer starts to appear...
  hookShimmerSeconds: 20,      // ...and takes this long to fully fade in, because it's far away
  blackHoleRadius: 11,         // size of the dark centre, in screen pixels
  blackHoleSpecks: 14,         // specks of light slowly spiralling in

  // --- Bits side by side ---
  // Bits count together in binary. When the rightmost bit rolls over from 1 to 0,
  // a "carry" pulse travels to its neighbour and flips it, just like a real counter.
  bitSpacing: 110,             // distance between neighbouring bits, in screen pixels
  carryPulseSeconds: 0.45,     // how long a carry takes to travel from one bit to the next
  ambientPulseSeconds: 6,      // a slow, quiet pulse drifts between the bits this often
  ambientPulseTravel: 2.6,     // ...and takes this long to travel the whole chain of bits

  // --- The constellation (bits 3 to 7) ---
  // Once you own the second bit, more bits join by themselves as your lifetime bits pass these totals.
  // One number per bit: 3rd, 4th, 5th, 6th, 7th, and the 8th, which completes the byte.
  joinAt: [25000, 37000, 52000, 68000, 85000, 103000], // about 16, 21, 25, 29, 33 and 37 minutes in
  // How far each bit sits above (-) or below (+) the middle line, as a share of the spacing.
  // Bit 0 (the ones place, on the right) comes first. This is what makes a row into a constellation.
  constellationShape: [0, 0, -0.55, -0.1, 0.45, 0.05, -0.5, 0.3],
  starScaleAt: 90,             // when bits are packed closer than this (on phones) the stars shrink to fit

  // --- The byte forming (when the 8th bit has joined) ---
  byteDelaySeconds: 0.8,       // a quiet pause after the 8th bit is born
  byteGatherSeconds: 2.6,      // the constellation straightens into a row and is enclosed
  byteSweepSeconds: 1.8,       // a wave of light runs through all eight bits
  byteRestSeconds: 2,          // a moment of stillness before play continues

  // --- Automatic flipping ---
  maxVisibleFlipsPerSecond: 2, // the star never blinks faster than this, however many oscillators you own
  autoSaveSeconds: 5,          // how often the game saves while oscillators are earning bits

  // --- Offline progress (oscillators keep flipping while the game is closed) ---
  offlineMaxHours: 8,          // time away beyond this doesn't count, so it's worth coming back
  offlineEfficiency: 1,        // share of normal speed earned while away (0.5 = half speed)
  offlineMessageMinSeconds: 60, // only say "while you were away" after at least this long
  offlineMessageSeconds: 9,    // how long that note stays on screen

  // --- The black hole reset (falling in starts a new universe) ---
  knowledge: {
    unlockAchievement: 'megabit', // the black hole can be entered once this achievement's goal is met in the current universe
    divisor: 10000,            // Knowledge gained = square root of (bits earned this universe ÷ this), rounded down
    bonusEach: 0.1,            // each point of Knowledge adds +10% to all earning, forever
    fallSeconds: 4.5,          // the stars spiral into the dark...
    darkSeconds: 2             // ...then the sky stays black for a moment before the new universe
  },

  // --- Sound (the sounds themselves, and their loudness, are in audio.js) ---
  audio: {
    defaultVolume: 0.7,        // starting volume, 0 to 1 (players can change it with the slider)
    streakTaps: 16,            // fast taps needed to climb to the top of the click streak
    streakGapSeconds: 0.4      // taps closer together than this count as a streak
  },

  // --- Testing ---
  testSpeedMax: 1000           // the highest ?speed= allowed (see TEST_SPEED below)
};

// Hidden speed-up switch for testing. Add ?speed=20 to the page address and every bit earned
// (taps, oscillators, memory cells, time away) counts 20 times over. Leave it off for normal play.
// It can be combined with a fresh start: ?reset&speed=50
// Note: progress made at test speed is saved like normal progress; use ?reset to start clean again.
const TEST_SPEED = (function () {
  const asked = Number(new URLSearchParams(location.search).get('speed'));
  if (!isFinite(asked) || asked <= 1) return 1;
  return Math.min(asked, CONFIG.testSpeedMax);
})();

// Hidden switch for hearing the warm drone before the black-hole reset exists: add ?warm to the address.
const TEST_WARM = new URLSearchParams(location.search).has('warm');
