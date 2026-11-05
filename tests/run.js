// run.js — the browser tests for A Meaningful Answer.
//
// They play the real game in a headless browser (Chromium, through Playwright) on desktop- and phone-sized
// screens, and check that each feature behaves as the rules in js/config.js and js/upgrades.js say.
// Numbers are read from the game, so rebalancing doesn't break the tests.
//
// You need Node.js and Playwright (the game itself needs neither). Once, from the repo folder:
//   npm install playwright
//   npx playwright install chromium
// Then:
//   node tests/run.js              run every suite (a few minutes)
//   node tests/run.js boosters     run only suites whose file name contains "boosters"
//
// Each suite is a file in tests/suites/ exporting { name, run(env, t) }; see any of them for the pattern.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { Checks, openGame } = require('./helpers');

const REPO = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.md': 'text/plain', '.json': 'application/json' };

// A tiny web server for the repo folder, so the game loads exactly as it would from GitHub Pages.
function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(REPO, url === '/' ? 'index.html' : url);
    if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const filter = process.argv[2] || '';
  const files = fs.readdirSync(path.join(__dirname, 'suites')).filter(f => f.endsWith('.js') && f.includes(filter)).sort();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const env = {
    base,
    // Open the game: see openGame in helpers.js for the options.
    game: options => openGame(browser, base, options)
  };

  const results = [];
  const started = Date.now();
  for (const file of files) {
    const suite = require(path.join(__dirname, 'suites', file));
    const t = new Checks(suite.name);
    console.log(`\n${suite.name}  (${file})`);
    try {
      await suite.run(env, t);
    } catch (error) {
      t.ok(false, `the suite finished without crashing`, error.message.split('\n')[0]);
    }
    results.push(t);
  }
  await browser.close();
  server.close();

  const failed = results.filter(r => r.failed.length);
  const passed = results.reduce((n, r) => n + r.passed, 0);
  const failures = results.reduce((n, r) => n + r.failed.length, 0);
  console.log(`\n${passed} checks passed, ${failures} failed, in ${Math.round((Date.now() - started) / 1000)} s.`);
  for (const r of failed) for (const f of r.failed) console.log(`  ✗ ${r.suite}: ${f}`);
  process.exit(failures ? 1 : 0);
})();
