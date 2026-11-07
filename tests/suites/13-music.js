// The background music: silent in the dark, grows with the machine, its own on/off button,
// steps aside for milestones, fades in the fall, and a new piece in the next universe.
module.exports = {
  name: 'Background music',
  async run(env, t) {
    // A brand-new game: the dark opening is silent, music or not.
    let g = await env.game();
    await g.page.mouse.click(5, 790); // allow sound
    await g.waitReal(1.5);
    t.ok(await g.run(() => Music.level()) < 0.001, 'silent in the dark before the first spark');
    t.ok(await g.visible('#music'), 'the music button shows');
    t.noErrors(g, 'opening');
    await g.close();

    // The layers follow the number of bits (bits = first + second + Next Bits bought).
    const layersWith = async (save, label) => {
      const game = await env.game({ save: { sparked: true, value: 0, bits: 0, lifetimeBits: 100, ...save } });
      await game.page.mouse.click(5, 790);
      await game.waitReal(1.5);
      const l = await game.run(() => Music.layersNow());
      t.noErrors(game, label);
      await game.close();
      return l;
    };
    let l = await layersWith({}, 'one bit');
    t.ok(l.pad && !l.pluck, 'one bit: only the pads', l);
    l = await layersWith({ upgrades: { secondBit: 1 } }, 'two bits');
    t.ok(l.pluck && !l.pluckFull && !l.pulse, 'two bits: the harpsichord starts, gently', l);
    l = await layersWith({ upgrades: { secondBit: 1, nextBit: 3 } }, 'five bits');
    t.ok(l.pluckFull && l.pulse && !l.melody, 'five bits: the full figure and the pulse', l);
    l = await layersWith({ upgrades: { secondBit: 1, nextBit: 6 }, byteFormed: true, lifetimeBits: 3e6 }, 'byte');
    t.ok(l.bass && l.melody && !l.counter, 'the byte: bass and melody', l);
    l = await layersWith({ upgrades: { secondBit: 1, nextBit: 6 }, byteFormed: true, lifetimeBits: 3e6, track: 'logic' }, 'track');
    t.ok(l.counter, 'a chosen track: the second voice answers', l);

    // Full music: it fades in, ducks under an achievement chime, and the button turns it off and stays off.
    const full = { sparked: true, value: 0, bits: 0, lifetimeBits: 3e6, upgrades: { secondBit: 1, nextBit: 6 }, byteFormed: true, track: 'storage' };
    g = await env.game({ save: full });
    await g.page.mouse.click(5, 790);
    await g.waitReal(10);
    const playing = await g.run(() => Music.level());
    t.ok(playing > 0.3, 'the music fades in once there are bits', playing);
    t.eq(await g.run(() => Music.pieceName()), 'Prelude in Light', 'the first universe plays "Prelude in Light"');
    await g.run(() => Sound.achievement());
    await g.waitReal(0.8);
    const ducked = await g.run(() => Music.level());
    t.ok(ducked < playing * 0.6, 'it steps aside for an achievement chime', { playing, ducked });
    await g.page.click('#music');
    await g.waitReal(1.5);
    t.ok(await g.run(() => Music.level()) < 0.05, 'the button turns the music off');
    t.eq(await g.run(() => document.getElementById('music').getAttribute('aria-pressed')), 'false', 'the button shows it is off');
    await g.page.reload();
    await g.waitReal(1);
    t.ok(!(await g.run(() => Music.isOn())), 'music stays off after a reload');
    t.noErrors(g, 'full music');
    await g.close();

    // The fall into the black hole: the music fades away with everything else.
    g = await env.game({ save: { ...full, hookSeen: true }, dev: true });
    await g.page.mouse.click(5, 790);
    await g.waitReal(8);
    await g.devTool('Fall in now');
    await g.waitReal(4);
    t.ok(await g.run(() => Music.level()) < 0.15, 'the music fades during the fall');
    t.noErrors(g, 'fall');
    await g.close();

    // The next universe gets its own piece.
    g = await env.game({ save: { ...full, universesCompleted: 1 } });
    await g.page.mouse.click(5, 790);
    await g.waitReal(1.5);
    t.eq(await g.run(() => Music.pieceName()), 'Canon of Warm Light', 'universe 2 plays "Canon of Warm Light"');
    t.ok((await g.run(() => Music.layersNow())).strings, 'and its driving strings play');
    t.noErrors(g, 'universe 2');
    await g.close();
  }
};
