// balance-sim.js — a balance simulator for A Meaningful Answer.
//
// It plays the game's REAL rules (js/config.js, js/upgrades.js, js/achievements.js) with a modelled player,
// and prints when each milestone arrives. Use it to check pacing after changing numbers in config.js.
// It isn't part of the game: nothing loads it in the browser, and it needs Node.js to run.
//
// The modelled player:
//   - taps at a steady rate (2 a second unless you say otherwise),
//   - saves up for the next bit once it costs no more than about 3 minutes of income, and buys it straight away;
//     otherwise buys whichever visible upgrade pays itself back fastest (cost ÷ extra bits per second),
//   - catches 3 in 4 boosters (they appear by the game's own rules, from a fixed random seed so runs repeat),
//   - waits through each birth, the byte ceremony and the choice, as the real game does.
// It doesn't model time away (so Storage's offline upgrades never get bought), the dev tools, or Knowledge.
//
// How to run it (from the repo folder):
//   node tools/balance-sim.js                         steady player, Storage track, full timeline
//   node tools/balance-sim.js --taps 4 --track logic  an eager player on the Logic track
//   node tools/balance-sim.js --all                   a summary table: both tracks × 1, 2 and 4 taps a second
//   node tools/balance-sim.js --try trial.json        try numbers without editing config.js (see below)
//   node tools/balance-sim.js --boosters off          leave boosters out; --catch 0.5 catches half of them; --seed 7
//   node tools/balance-sim.js --universe 2 --all      the second universe: Knowledge from a first fall (--knowledge 10),
//                                                     the abacus before the spark, and the Punch Card
//
// A trial file holds only the numbers you want to change, in the same shape as CONFIG. For example:
//   { "hookAt": 250000, "upgrades": { "amplifier": { "baseCost": 20 } } }
//
// Keep this in step with main.js and boosters.js: if the game gains a new milestone, changes how one is
// triggered, or changes how boosters appear or pay out, add the same rule to playOnce() below.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');

// ---------- reading the options ----------

function option(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
const TAPS = Number(option('--taps', 2));
const TRACK = option('--track', 'storage');
const TRY = option('--try', null);
const ALL = process.argv.includes('--all');
const MAX_HOURS = Number(option('--hours', 4)); // stop after this much play time
const BOOSTERS = option('--boosters', 'on') !== 'off';
const CATCH = Number(option('--catch', 0.75));   // share of boosters the player catches
const SEED = Number(option('--seed', 1));
const UNIVERSE = Number(option('--universe', 1));
const KNOWLEDGE = Number(option('--knowledge', UNIVERSE > 1 ? 10 : 0)); // about 10 at the first Megabyte

// A repeatable random number generator, so the same settings always give the same result.
function randomFrom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- loading the game's rules ----------

// Run the game's own files in a sandbox, exactly as the browser would (minus the page itself).
function loadGame() {
  const sandbox = { location: { search: '' }, URLSearchParams, Math, console };
  vm.createContext(sandbox);
  for (const file of ['js/config.js', 'js/upgrades.js', 'js/achievements.js']) {
    // `const X =` would stay hidden inside the sandbox; `var X =` lets us reach it from here.
    const code = fs.readFileSync(path.join(REPO, file), 'utf8').replace(/^const (\w+) =/m, 'var $1 =');
    vm.runInContext(code, sandbox, { filename: file });
  }
  const game = { CONFIG: sandbox.CONFIG, Upgrades: sandbox.Upgrades, Achievements: sandbox.Achievements };
  if (TRY) applyTrial(game.CONFIG, JSON.parse(fs.readFileSync(TRY, 'utf8')));
  speedUpAverages(game.Upgrades);
  return game;
}

// Copy a trial file's numbers over CONFIG (only the ones it mentions).
function applyTrial(config, trial) {
  for (const [key, value] of Object.entries(trial)) {
    if (key === 'upgrades') {
      for (const [id, fields] of Object.entries(value)) Object.assign(config.upgrades[id], fields);
    } else {
      config[key] = value;
    }
  }
}

// The game works out averages by walking every value the bits can show. That's quick once,
// but the simulator asks thousands of times, so remember each answer (it depends on only a few things).
function speedUpAverages(Upgrades) {
  const real = Upgrades.averageStepEarning.bind(Upgrades);
  const remembered = new Map();
  Upgrades.averageStepEarning = function (state, perFlip, source) {
    const key = [Upgrades.bitCount(state), Upgrades.owned(state, 'notGate'), Upgrades.owned(state, 'andGate'),
      Upgrades.owned(state, 'orGate'), Upgrades.owned(state, 'ifThenElse'), perFlip, source].join('|');
    if (!remembered.has(key)) remembered.set(key, real(state, perFlip, source));
    return remembered.get(key);
  };
}

// ---------- one play-through ----------

function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function playOnce(taps, track) {
  const { CONFIG, Upgrades, Achievements } = loadGame();
  const blackHoleGoal = Achievements.byId(CONFIG.knowledge.unlockAchievement);
  const random = randomFrom(SEED);
  const B = CONFIG.boosters;
  let boostEnds = -1, lastBooster = -Infinity, boostersCaught = 0;
  const state = {
    sparked: true, bits: 0, lifetimeBits: 0, value: 1, upgrades: {},
    track: null, byteFormed: false, hookSeen: false, stats: { taps: 0, carries: 0, wraps: 0 },
    universesCompleted: UNIVERSE - 1, knowledge: KNOWLEDGE, punch: []
  };
  const holes = CONFIG.upgrades.punchCard.holes;
  const events = [];
  const note = (t, what) => events.push({ t, what });

  // Bits per second before any multipliers, if the player keeps tapping at this rate.
  const baseIncome = () => taps * Upgrades.averageStepEarning(state, Upgrades.bitsPerTap(state), 'tap') + Upgrades.bitsPerSecond(state);
  // ...and with the bits' bonus (what upgrades are judged by).
  const income = () => baseIncome() * Upgrades.productionMultiplier(state);
  // Earning, as in main.js: the bits' bonus always applies; a light pulse's boost unless noBoost.
  let now = 0;
  const earn = (n, noBoost) => {
    const added = n * Upgrades.productionMultiplier(state) * (!noBoost && now < boostEnds ? B.pulseMultiplier : 1);
    state.bits += added;
    state.lifetimeBits += added;
  };

  // Buying a bit: it's born (a pause), and recorded.
  function buyBit(id) {
    const cost = Upgrades.cost(state, id);
    Upgrades.buy(state, id);
    waiting = CONFIG.birthSeconds;
    note(t, Upgrades.bitCount(state) === 2 ? 'SECOND BIT' : `bit ${Upgrades.bitCount(state)} joins (${cost.toLocaleString()} bits)`);
  }

  const dt = 0.1;                 // simulate in tenths of a second
  let t = CONFIG.darknessSeconds + 0.5 + CONFIG.birthSeconds; // the opening, the first tap, the first birth
  // Universe 2+: the abacus first (one tap per bead, then the carry plays and it fades away).
  if (UNIVERSE > 1) t += (CONFIG.abacus.beads + 1) / taps + CONFIG.abacus.carrySeconds + CONFIG.abacus.fadeSeconds;
  note(t, 'first bit alive');
  let waiting = 0, tapsDue = 0, stepsDue = 0, tick = 0, punchDue = 0;
  const firstBought = {};

  while (t < MAX_HOURS * 3600) {
    t += dt;
    now = t;
    tick++;
    if (tick % 3000 === 0) note(t, `   total earned ${Math.round(state.lifetimeBits).toLocaleString()}, ${income().toFixed(1)} bits/s`);
    if (waiting > 0) { waiting -= dt; continue; } // a birth or ceremony is playing: no tapping or counting

    // Tapping and the oscillators, counted step by step with the game's own Upgrades.step.
    tapsDue += taps * dt;
    while (tapsDue >= 1) {
      tapsDue--;
      const r = Upgrades.step(state, state.value, Upgrades.bitsPerTap(state), 'tap');
      state.value = r.next;
      earn(r.gain);
      // A Punch Card still being punched records this tap (the gap is the player's own rhythm).
      if (Upgrades.owned(state, 'punchCard') > 0 && state.punch.length < holes) {
        state.punch.push(1 / taps);
        if (state.punch.length === holes) note(t, 'punch card plays back');
      }
    }
    // The punch card playing your rhythm back: each hole counts as a tap for every card owned.
    punchDue += Upgrades.punchTapsPerSecond(state) * dt;
    while (punchDue >= 1) {
      punchDue--;
      const r = Upgrades.step(state, state.value, Upgrades.bitsPerTap(state), 'tap');
      state.value = r.next;
      earn(r.gain);
    }
    stepsDue += Upgrades.flipsPerSecond(state) * dt;
    while (stepsDue >= 1) {
      stepsDue--;
      const r = Upgrades.step(state, state.value, CONFIG.upgrades.oscillator.bitsPerFlip, 'osc');
      state.value = r.next;
      earn(r.gain);
    }
    earn(Upgrades.trickle(state) * dt); // memory cells

    // Boosters, by the same rules as boosters.js (the cap, the click rate, one at a time).
    if (BOOSTERS && t >= B.firstAfterSeconds && t - lastBooster >= B.minGapSeconds && !(state.byteFormed && !state.track && state.lifetimeBits >= CONFIG.trackChoiceAt)) {
      const rate = Math.min(taps, B.maxClickRate);
      if (random() < dt * (1 + B.clickRateBoost * rate) / B.averageWaitSeconds) {
        lastBooster = t;
        if (random() < CATCH) {
          boostersCaught++;
          if (random() < B.pulseChance) boostEnds = t + B.pulseSeconds;
          else earn(Math.max(B.lightningRewardMin, baseIncome() * B.lightningRewardSeconds), true);
        }
      }
    }

    // Milestones, in the same order and with the same rules as main.js.
    if (Upgrades.bitCount(state) >= 8 && !state.byteFormed) {
      state.byteFormed = true;
      waiting = CONFIG.byteDelaySeconds + CONFIG.byteGatherSeconds + CONFIG.byteSweepSeconds + CONFIG.byteRestSeconds;
      note(t, 'BYTE forms');
      continue;
    }
    if (state.byteFormed && !state.track && state.lifetimeBits >= CONFIG.trackChoiceAt) {
      state.track = track;
      waiting = 6; // reading the paths and choosing
      note(t, `FORK opens (chooses ${track})`);
      continue;
    }
    if (state.track && !state.hookSeen && state.lifetimeBits >= CONFIG.hookAt) {
      state.hookSeen = true;
      note(t, 'HOOK');
    }
    if (state.hookSeen && blackHoleGoal.done(state)) {
      note(t, 'BLACK HOLE opens');
      break;
    }

    // Shopping, once a second.
    if (tick % 10 !== 0) continue;
    // The next bit comes first once it's within about 3 minutes of income: save up for it, buy it straight away.
    const nextBitId = Upgrades.isRevealed(state, 'secondBit') ? 'secondBit' : Upgrades.isRevealed(state, 'nextBit') ? 'nextBit' : null;
    if (nextBitId && Upgrades.cost(state, nextBitId) <= income() * 180) {
      if (state.bits >= Upgrades.cost(state, nextBitId)) buyBit(nextBitId);
      continue;
    }
    // Otherwise: the visible upgrade with the fastest payback, if it's affordable.
    const current = income();
    let best = null;
    for (const id of Upgrades.ids) {
      if (!Upgrades.isRevealed(state, id)) continue;
      const cost = Upgrades.cost(state, id);
      // A blank Punch Card earns nothing until it's punched; judge it as if it were (the player will punch it).
      const blank = id === 'punchCard' && state.punch.length < holes;
      const realPunch = state.punch;
      if (blank) state.punch = new Array(holes).fill(1 / taps);
      state.upgrades[id] = Upgrades.owned(state, id) + 1; // try owning one more...
      const gain = income() - current;
      state.upgrades[id]--;                               // ...and put it back
      if (blank) state.punch = realPunch;
      if (gain <= 0) continue;                            // offline-only upgrades don't help here
      if (!best || cost / gain < best.payback) best = { id, cost, payback: cost / gain };
    }
    if (best && state.bits >= best.cost) {
      if (best.id === 'secondBit' || best.id === 'nextBit') { buyBit(best.id); continue; }
      Upgrades.buy(state, best.id);
      if (best.id === 'punchCard' && Upgrades.owned(state, 'punchCard') === 1) state.punch = [];
      if (!firstBought[best.id]) {
        firstBought[best.id] = true;
        note(t, `first ${CONFIG.upgrades[best.id].name} (${best.cost.toLocaleString()} bits)`);
      }
    }
  }
  if (BOOSTERS) note(t, `   boosters caught: ${boostersCaught}`);
  return { events, income: income(), owned: state.upgrades };
}

// ---------- printing ----------

const when = (events, pattern) => {
  const e = events.find(x => pattern.test(x.what));
  return e ? clock(e.t) : '—';
};

if (ALL) {
  const columns = [
    ['2nd bit', /^SECOND BIT/], ['bit 3', /^bit 3 /], ['bit 5', /^bit 5 /], ['bit 7', /^bit 7 /], ['byte', /^BYTE/],
    ['fork', /^FORK/], ['hook', /^HOOK/], ['black hole', /^BLACK HOLE/]
  ];
  console.log('player'.padEnd(20) + columns.map(c => c[0].padStart(11)).join(''));
  for (const track of ['storage', 'logic']) {
    for (const taps of [1, 2, 4]) {
      const { events } = playOnce(taps, track);
      console.log(`${track}, ${taps} taps/s`.padEnd(20) + columns.map(c => when(events, c[1]).padStart(11)).join(''));
    }
  }
} else {
  console.log(`A steady player tapping ${TAPS} times a second, choosing ${TRACK}${TRY ? `, trying ${TRY}` : ''}:\n`);
  const { events, income, owned } = playOnce(TAPS, TRACK);
  for (const e of events) console.log(clock(e.t).padStart(7), '  ', e.what);
  console.log(`\nAt the end: ${income.toFixed(1)} bits/s, owning ${JSON.stringify(owned)}`);
}
