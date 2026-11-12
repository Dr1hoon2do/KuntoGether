// 통합: 로비(폰 4대) → 게임을 하나씩 고정 → 끝까지 플레이(키 입력) → 결과/최종까지. 오류·누수 확인.
const { chromium } = require('playwright'); const MOCK = require('./mock.js');
const PORT = process.env.PORT || 8123; const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
  await ctx.route('**/peerjs.min.js', r => r.fulfill({ contentType: 'text/javascript', body: MOCK }));
  const errs = []; const hook = (p, n) => { p.on('pageerror', e => errs.push(n + ' ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_TUNNEL|Failed to load/.test(m.text()) && errs.push(n + ' ' + m.text())); };
  const tv = await ctx.newPage(); hook(tv, 'tv'); await tv.goto(`http://localhost:${PORT}/party/tv.html?rounds=3`);
  await tv.waitForFunction(() => window.party && party.code, null, { timeout: 8000 }); const code = await tv.evaluate(() => party.code);
  const pads = [];
  for (const n of ['하나', '둘', '셋', '넷']) {
    const pad = await ctx.newPage(); hook(pad, 'pad:' + n); await pad.addInitScript(n => { try { if (!sessionStorage.getItem('init')) { localStorage.setItem('kg.pid', 'pid-' + n); sessionStorage.setItem('init', 1); } } catch (e) {} }, n);
    await pad.goto(`http://localhost:${PORT}/party/pad.html?join=${code}`); await pad.fill('#nick', n); await pad.click('#login button');
    await pad.waitForFunction(() => window.__pad && window.__pad.connected, null, { timeout: 8000 }); pads.push(pad);
  }
  const modes = await tv.evaluate(() => party._modes().map(m => m.id)); console.log('modes', modes);
  const press = async (pad, key, ms = 90) => { await pad.keyboard.down(key); await pad.waitForTimeout(ms); await pad.keyboard.up(key); await pad.waitForTimeout(60); };
  const base = await tv.evaluate(() => party.App ? party.App.scene?.children?.length : 0);
  for (const gid of ['bumper', 'bomb', 'climb']) {
    await tv.evaluate(id => { party.modeIdx = party._modes().findIndex(m => m.id === id); party.roundIdx = 0; }, gid);
    // 준비
    await tv.waitForTimeout(500); for (let i = 0; i < pads.length; i++) { const r = await tv.evaluate(i => party.net.players[i].ready, i); if (!r) await press(pads[i], 'Space'); }
    await tv.waitForFunction(() => party.state !== 'lobby', null, { timeout: 12000 }); await tv.evaluate(() => { party.rounds = 1; });
    // 플레이 중 입력 흔들기
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
    const t0 = Date.now(); let st = '', game = '';
    while (Date.now() - t0 < 120000) {
      st = await tv.evaluate(() => party.state); if (st === 'result' || st === 'final' || st === 'lobby') break;
      if (st === 'play') { game = await tv.evaluate(() => party.game && party.game.id); for (const p of pads) await press(p, keys[Math.floor(Math.random() * keys.length)], 150); } else await tv.waitForTimeout(300);
    }
    const res = await tv.evaluate(() => JSON.stringify(party.result || null));
    ok(game === gid && (st === 'result' || st === 'final' || st === 'lobby'), `${gid}: 끝까지 진행 (game=${game}, state=${st}) ${(Date.now() - t0) / 1000 | 0}초 result=${res.slice(0, 80)}`);
    // 최종 → 로비로
    for (let i = 0; i < 20; i++) { st = await tv.evaluate(() => party.state); if (st === 'lobby') break; for (const p of pads) await press(p, 'Space'); await tv.waitForTimeout(600); }
    ok(st === 'lobby', `${gid}: 로비 복귀 (${st})`);
  }
  ok(errs.length === 0, '오류 없음 ' + JSON.stringify(errs.slice(0, 5)));
  await b.close();
})();
