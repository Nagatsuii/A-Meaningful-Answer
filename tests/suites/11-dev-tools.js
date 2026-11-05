// The hidden dev tools: never shown to normal players, three ways in, the game speed, and every helper.
module.exports = {
  name: 'Dev tools',
  async run(env, t) {
    // Hidden from normal players
    let g = await env.game({ save: { sparked: true, value: 0, bits: 0, lifetimeBits: 10, upgrades: {} } });
    t.ok(!(await g.visible('#dev-button')) && !(await g.run(() => !!document.getElementById('dev-panel'))), 'normal players: no DEV button, no menu on the page');
    t.ok(await g.run(() => document.getElementById('test-badge').hidden), 'normal players: no badge');
    await g.page.keyboard.type('dev');
    t.ok(!(await g.visible('#dev-panel')), 'typing only "dev" does nothing');
    await g.page.keyboard.type('mode');
    t.ok(await g.visible('#dev-panel'), 'typing "devmode" opens the menu');
    await g.page.keyboard.press('Escape');
    t.ok(!(await g.visible('#dev-panel')), 'Escape closes it');
    await g.close();

    g = await env.game({ phone: true, save: { sparked: true, value: 0, bits: 0, lifetimeBits: 10, upgrades: {} } });
    for (let i = 0; i < 4; i++) { await g.tapAt(20, 20); await g.waitReal(0.12); }
    t.ok(!(await g.visible('#dev-panel')), 'phone: 4 taps in the top-left corner do nothing');
    await g.tapAt(20, 20); await g.waitReal(0.3);
    t.ok(await g.visible('#dev-panel'), 'phone: the 5th opens the menu');
    await g.close();

    // ?dev=1, the speed buttons, the badge, and ?dev=0
    g = await env.game({ query: '?dev=1', save: { sparked: true, value: 0, bits: 0, lifetimeBits: 10, upgrades: { oscillator: 2 } } });
    t.ok(await g.visible('#dev-button'), '?dev=1 shows the DEV button');
    await g.page.click('#dev-button');
    await g.page.click('#dev-speeds button[data-speed="10"]');
    t.eq(await g.run(() => document.getElementById('test-badge').textContent), 'TIME ×10', 'game speed 10× shows a badge');
    await g.page.goto(env.base); await g.waitReal(0.6);
    t.ok(await g.visible('#dev-button') && (await g.run(() => Dev.timeScale())) === 10, 'dev mode and the speed are remembered');
    // the whole game speeds up: oscillators earn 10× as fast
    const b0 = await g.bits(); await g.waitReal(3); await g.page.reload(); await g.waitReal(0.2);
    const rate = await g.run(() => Upgrades.flipsPerSecond({ upgrades: { oscillator: 2 } }));
    t.near((await g.bits()) - b0, rate * 10 * 3, rate * 10 * 1.2, 'at 10×, oscillators earn ten times as fast');
    await g.page.goto(env.base + '?dev=0'); await g.waitReal(0.6);
    t.ok(!(await g.visible('#dev-button')) && (await g.run(() => Dev.timeScale())) === 1, '?dev=0 turns dev mode off and the speed back to 1×');
    t.noErrors(g);
    await g.close();

    // A birth at 10× takes a tenth of the time
    g = await env.game({ speed: 10, save: { sparked: true, value: 0, bits: 1e6, lifetimeBits: 1e6, upgrades: {} } });
    await g.buy('Second Bit');
    const t0 = Date.now();
    await g.page.waitForFunction(() => document.getElementById('note').classList.contains('show'), null, { timeout: 5000 });
    const birth = await g.run(() => CONFIG.birthSeconds);
    t.near((Date.now() - t0) / 1000, birth / 10, 0.3, `at 10×, a ${birth} s birth takes about ${birth / 10} s`);
    await g.close();

    // Helpers: bits, and the milestone jumps (each reloads into its moment)
    g = await env.game({ dev: true, save: { sparked: true, value: 0, bits: 0, lifetimeBits: 10, upgrades: {}, knowledge: 3, universesCompleted: 1 } });
    await g.devTool('+100,000');
    t.near(await g.bits(), 100000, 1, '"+100,000" adds bits');
    const jumps = [
      ['Second bit', async () => (await g.card('Second Bit').isEnabled()), 'the Second Bit is ready to buy'],
      ['Constellation', async () => (await g.card('Third Bit').isEnabled()), 'the Third Bit is ready to buy'],
      ['Bit 5', async () => (await g.card('Fifth Bit').isEnabled()), 'the Fifth Bit is ready to buy'],
      ['Byte', async () => (await g.card('Eighth Bit').isEnabled()), 'the Eighth Bit is ready to buy'],
      ['Track fork', async () => { await g.waitReal(2.5); return g.run(() => document.getElementById('choice').classList.contains('open')); }, 'the paths open'],
      ['Hook', async () => { await g.waitReal(0.5); return (await g.save()).hookSeen; }, 'the hook begins'],
      ['Black hole ready', async () => { await g.waitReal(4); const h = await g.hole(); await g.tapAt(h.x, h.y); return g.run(() => !document.getElementById('confirm').hidden); }, 'touching the dark asks to fall']
    ];
    for (const [label, check, what] of jumps) {
      await g.devTool(label, true);
      t.ok(await check(), `jump to "${label}": ${what}`);
      const s = await g.save();
      t.ok(s.knowledge === 3 && s.universesCompleted === 1, `jump to "${label}": Knowledge and the universe count are kept`);
    }
    await g.page.keyboard.press('Escape');
    await g.devTool('Constellation', true);
    await g.devTool('Fall in now');
    await g.waitReal(0.4);
    t.ok(await g.run(() => document.body.classList.contains('falling')), '"Fall in now" starts the fall');
    await g.waitReal(await g.run(() => CONFIG.knowledge.fallSeconds + CONFIG.knowledge.darkSeconds + 1.5));
    t.eq((await g.save()).universesCompleted, 2, '...into the next universe');
    g.page.once('dialog', d => d.accept());
    await g.devTool('Reset save', true);
    t.ok(!((await g.save()) || {}).sparked, '"Reset save" starts again from the dark');
    t.noErrors(g);
    await g.close();
  }
};
