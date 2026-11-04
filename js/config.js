// config.js — every number you might want to tweak lives here.
// Change a value, save, and refresh the page to see the effect.

const CONFIG = {
  // --- Economy ---
  bitsPerTap: 1,             // bits earned for each bit your tap flips (a carry can flip more than one)

  // --- Saving ---
  saveKey: 'a-meaningful-answer-save-v1', // name of the save slot in the browser's localStorage

  // --- The faint glow before the first tap ---
  darknessSeconds: 2,        // how long the screen stays fully dark before the glow fades in
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
      baseCost: 10,
      costGrowth: 1.6,
      revealAt: 5,
      bitsPerTapEach: 1      // extra bits per tap, for each amplifier owned
    },
    oscillator: {
      name: 'Oscillator',
      effect: 'flips the bit on its own',
      lesson: 'A circuit that switches itself on and off: the heartbeat inside every computer.',
      baseCost: 20,
      costGrowth: 1.5,
      revealAt: 12,
      flipsPerSecondEach: 0.5, // each oscillator flips the bit once every 2 seconds
      bitsPerFlip: 1           // bits earned for each bit an automatic tick flips
    },
    secondBit: {
      name: 'Second Bit',
      effect: 'a second bit joins the first',
      lesson: 'Two bits can hold four states: 00, 01, 10, 11. Each bit you add doubles what can be stored.',
      baseCost: 250,
      costGrowth: 1,
      revealAt: 150,
      maxOwned: 1              // you can only buy this once
    }
  },

  // --- Bits side by side ---
  // Bits count together in binary. When the rightmost bit rolls over from 1 to 0,
  // a "carry" pulse travels to its neighbour and flips it, just like a real counter.
  bitSpacing: 110,             // distance between neighbouring bits, in screen pixels
  carryPulseSeconds: 0.45,     // how long a carry takes to travel from one bit to the next
  ambientPulseSeconds: 6,      // a slow, quiet pulse drifts between the bits this often
  ambientPulseTravel: 2.6,     // ...and takes this long to cross

  // --- Automatic flipping ---
  maxVisibleFlipsPerSecond: 2, // the star never blinks faster than this, however many oscillators you own
  autoSaveSeconds: 5,          // how often the game saves while oscillators are earning bits

  // --- Offline progress (oscillators keep flipping while the game is closed) ---
  offlineMaxHours: 8,          // time away beyond this doesn't count, so it's worth coming back
  offlineEfficiency: 1,        // share of normal speed earned while away (0.5 = half speed)
  offlineMessageMinSeconds: 60, // only say "while you were away" after at least this long
  offlineMessageSeconds: 9     // how long that note stays on screen
};
