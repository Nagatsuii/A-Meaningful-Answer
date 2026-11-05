// helpers.js — shared tools for the browser tests (see tests/run.js).
//
// The tests read every price, milestone and multiplier from the game itself (CONFIG and Upgrades in the page),
// never typing numbers in, so rebalancing config.js doesn't break them.

const SAVE_KEY = 'a-meaningful-answer-save-v1';
const DEV_KEY = 'a-meaningful-answer-dev';

// ---------- checks ----------

// Collects results for one suite. ok() records a pass or fail; near() allows a small difference.
class Checks {
  constructor(suite) {
    this.suite = suite;
    this.passed = 0;
    this.failed = [];
  }

  ok(condition, what, detail) {
    if (condition) {
      this.passed++;
      console.log(`    ✓ ${what}`);
    } else {
      this.failed.push(what);
      console.log(`    ✗ ${what}${detail !== undefined ? `  (got: ${JSON.stringify(detail)})` : ''}`);
    }
  }

  eq(actual, expected, what) {
    this.ok(actual === expected, `${what}: ${JSON.stringify(expected)}`, actual);
  }

  // No script errors in this game's tab.
  noErrors(game, where) {
    this.ok(game.errors.length === 0, `no errors${where ? ` (${where})` : ''}`, game.errors);
  }

  near(actual, expected, tolerance, what) {
    const close = Math.abs(actual - expected) <= tolerance;
    this.ok(close, `${what}: about ${round(expected)}`, round(actual));
  }
}

function round(n) {
  return typeof n === 'number' ? Math.round(n * 100) / 100 : n;
}

// ---------- opening the game ----------

// Open the game in a fresh browser tab, optionally with a prepared save.
//   save:   a save object to start from (missing fields get the game's defaults); null = a brand-new game
//   speed:  the dev tools' game speed (1, 2, 5, 10 or 100) — game-time waits get shorter, taps don't
//   dev:    show the dev tools' DEV button
//   query:  extra address settings, e.g. '?speed=20'
//   phone:  use an iPhone-sized screen with touch
//   watch:  names of Sound functions to record (calls land in window.soundLog)
async function openGame(browser, base, options = {}) {
  const { save = null, speed = 1, dev = false, query = '', watch = [] } = options;
  const { devices } = require('playwright');
  // Each game gets its own clean browser profile (desktop, or an iPhone-sized touch screen).
  const context = await browser.newContext(options.phone ? devices['iPhone 13'] : { viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  if (watch.length) {
    await page.addInitScript(names => {
      window.soundLog = [];
      const wrap = () => {
        if (typeof Sound === 'undefined') return setTimeout(wrap, 5);
        for (const n of names) {
          const real = Sound[n];
          Sound[n] = (...args) => { const r = real.apply(Sound, args); window.soundLog.push({ name: n, args, result: r, at: performance.now() }); return r; };
        }
      };
      wrap();
    }, watch);
  }
  // Prepare storage from another page on the same site, so the game can't save over it as it closes.
  await page.goto(base + 'README.md');
  await page.evaluate(([saveKey, devKey, s, d]) => {
    localStorage.clear();
    if (s) localStorage.setItem(saveKey, JSON.stringify(s));
    localStorage.setItem(devKey, JSON.stringify(d));
  }, [SAVE_KEY, DEV_KEY, save ? { version: 1, lastSeen: Date.now(), ...save } : null, { enabled: dev, timeScale: speed }]);
  await page.goto(base + query);
  await page.waitForTimeout(600);
  return new Game(page, base, speed, !!options.phone, errors);
}

// ---------- a game in a tab ----------

class Game {
  constructor(page, base, speed, phone, errors) {
    this.page = page;
    this.base = base;
    this.speed = speed;
    this.phone = phone;
    this.errors = errors;
  }

  // Run code in the page (CONFIG, Upgrades, UI, Boosters... are all reachable there).
  run(fn, arg) {
    return this.page.evaluate(fn, arg);
  }

  // The save as last written (the game saves on taps, purchases, every few seconds, and on leaving).
  save() {
    return this.run(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  }

  async bits() {
    return (await this.save()).bits;
  }

  // Wait this many seconds of game time (shorter at higher dev speeds).
  wait(gameSeconds) {
    return this.page.waitForTimeout(gameSeconds * 1000 / this.speed + 80);
  }

  // Wait real seconds (for things that run on real time, like notes and taps).
  waitReal(seconds) {
    return this.page.waitForTimeout(seconds * 1000);
  }

  async tapAt(x, y) {
    if (this.phone) await this.page.touchscreen.tap(x, y);
    else await this.page.mouse.click(x, y);
    await this.page.waitForTimeout(70);
  }

  // Where the bits are: the middle of the open sky.
  centre() {
    return this.run(() => UI.skyCentre(innerWidth, innerHeight));
  }

  async tapBits(times = 1) {
    const c = await this.centre();
    for (let i = 0; i < times; i++) await this.tapAt(c.x, c.y);
  }

  // Where the black hole sits (the same sum as runHook in main.js).
  hole() {
    return this.run(() => {
      const c = UI.skyCentre(innerWidth, innerHeight);
      return { x: Math.max(40, c.x * 2 * 0.13), y: Math.max(200, c.y * 2 * 0.3) };
    });
  }

  note() {
    return this.run(() => document.getElementById('note').textContent.trim());
  }

  noteShowing() {
    return this.run(() => document.getElementById('note').classList.contains('show'));
  }

  // Names of the upgrade cards showing in the menu.
  cards() {
    return this.run(() => [...document.querySelectorAll('.upgrade:not([hidden]) .upgrade-name')].map(e => e.textContent));
  }

  card(name) {
    return this.page.locator('.upgrade:not([hidden])', { has: this.page.locator('.upgrade-name', { hasText: new RegExp(`^${name}$`) }) });
  }

  // Buy an upgrade by its card name (on phones the menu slides up first, then back down).
  async buy(name) {
    if (this.phone) await this.setMenu(true);
    await this.card(name).click();
    if (this.phone) await this.setMenu(false);
    await this.page.waitForTimeout(100);
  }

  async setMenu(open) {
    const isOpen = await this.run(() => document.getElementById('panel').classList.contains('open'));
    if (isOpen !== open) {
      await this.page.locator('#panel-tab').click();
      await this.page.waitForTimeout(550);
    }
  }

  // Is an element on the page and showing?
  visible(selector) {
    return this.run(s => {
      const e = document.querySelector(s);
      if (!e || e.hidden) return false;
      const box = e.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(e).opacity !== '0';
    }, selector);
  }

  soundCalls(name) {
    return this.run(n => (window.soundLog || []).filter(c => c.name === n), name);
  }

  // Click a dev tools button by its label (opening the menu first if needed).
  async devTool(label, reloads = false) {
    const open = await this.run(() => { const p = document.getElementById('dev-panel'); return !!p && !p.hidden; });
    if (!open) await this.page.click('#dev-button');
    const button = this.page.locator('#dev-tools button', { hasText: new RegExp(`^${label.replace(/[+]/g, '\\+')}$`) });
    if (reloads) await Promise.all([this.page.waitForEvent('load'), button.click()]);
    else await button.click();
    await this.page.waitForTimeout(reloads ? 800 : 150);
  }

  close() {
    return this.page.context().close();
  }
}

module.exports = { Checks, openGame, SAVE_KEY, DEV_KEY };
