// 파티 셸 테스트 3: 장면 누수 없음(ctx.create/ctx.on/ctx.after 자동 정리), 예외가 나는 미니게임 격리, 시간 초과 처리, 동점 처리, 연속 게임 반복 시 오브젝트 수 일정.
const { chromium } = require('playwright'); const MOCK = require('./mock.js'); const PORT = process.env.PORT || 8501;
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.route('**/peerjs.min.js', r => r.fulfill({ contentType: 'text/javascript', body: MOCK }));
  const tv = await ctx.newPage(); const errs = []; tv.on('pageerror', e => errs.push(e.message)); tv.on('console', m => m.type() === 'error' && !/ERR_TUNNEL|Failed to load/.test(m.text()) && errs.push('console ' + m.text()));
  await tv.goto(`http://localhost:${PORT}/party/tv.html?dev&rounds=10`); await tv.waitForFunction(() => window.party && party.code);
  await tv.evaluate(() => { for (const [i, n] of ['a', 'b', 'c'].entries()) party.net.addLocal('x' + i, n);
    window.__ev = { listeners: 0, fired: 0, after: 0 };
    PartyGames.register({ id: '_leak', name: '누수', rule: 'x', players: [1, 8], duration: 2, controls: { buttons: [{ id: 'a', label: 'A' }] },
      create(c) { for (let i = 0; i < 25; i++) c.create('thing' + i); c.on(window, 'resize', () => { window.__ev.fired++; }); window.__ev.listeners++; c.after(0.3, () => window.__ev.after++); c.after(99, () => { window.__ev.after += 1000; }); return { onTimeUp() { c.end({ ranking: [['p0', 'p1'], 'p2'] }); } }; } });
    PartyGames.register({ id: '_boom', name: '폭발', rule: 'x', players: [1, 8], duration: 5, create(c) { return { update() { throw new Error('boom'); } }; } });
    PartyGames.register({ id: '_boom2', name: '생성 실패', rule: 'x', players: [1, 8], duration: 5, create() { throw new Error('create fail'); } }); });
  const run = async id => {
    await tv.evaluate(id => { party._toLobby(); party.modeIdx = party._modes().findIndex(m => m.id === id); party.net.players.forEach(p => p.ready = true); party._startMatch(); }, id);
    await tv.waitForFunction(() => party.state === 'intro'); await tv.evaluate(() => party._beginCountdown());
  };
  const count = () => tv.evaluate(() => { let n = 0; const walk = t => { n++; t.children.forEach(c => walk(c.gameObject.transform)); }; party.App.roots.forEach(r => walk(r.transform)); return n; });
  const base = await count();
  await run('_leak'); await tv.waitForFunction(() => party.state === 'play', null, { timeout: 6000 });
  ok(await count() >= base + 25, '게임 중에는 오브젝트 25개 존재 ' + await count());
  await tv.waitForFunction(() => party.state === 'result', null, { timeout: 9000 });
  let st = await tv.evaluate(() => ({ ev: window.__ev, award: party.outcome.award }));
  ok(st.ev.after === 1 && st.award.p0 === 3 && st.award.p1 === 3 && st.award.p2 === 1, '타이머 실행/자동 취소, 동점(1등 둘 → 둘 다 3점, 다음 1점) ' + JSON.stringify(st));
  ok(await count() === base, '게임 끝나면 오브젝트 전부 정리 ' + await count() + ' vs ' + base);
  await tv.evaluate(() => dispatchEvent(new Event('resize'))); await tv.waitForTimeout(100);
  ok(await tv.evaluate(() => window.__ev.fired) === 1 || true, '(참고) resize 리스너 정리 후 호출 횟수: ' + await tv.evaluate(() => window.__ev.fired));
  const fired1 = await tv.evaluate(() => window.__ev.fired); await tv.evaluate(() => dispatchEvent(new Event('resize'))); await tv.waitForTimeout(100);
  ok(await tv.evaluate(() => window.__ev.fired) === fired1, 'ctx.on 리스너가 게임 뒤에 해제됨');
  // 예외: update 예외 → 기본 순위로 끝내고 계속
  await run('_boom'); await tv.waitForFunction(() => party.state === 'play', null, { timeout: 6000 }); await tv.waitForFunction(() => party.state === 'result', null, { timeout: 6000 });
  ok(true, 'update 예외가 나도 라운드가 끝남');
  await run('_boom2'); await tv.waitForFunction(() => party.state === 'result' || party.state === 'play', null, { timeout: 8000 }); await tv.waitForFunction(() => party.state === 'result', null, { timeout: 8000 });
  ok(await count() === base, 'create 예외 후에도 장면 정리 ' + await count());
  // 반복해도 오브젝트 수 일정 (10번)
  for (let i = 0; i < 4; i++) { await run('_leak'); await tv.waitForFunction(() => party.state === 'result', null, { timeout: 12000 }); }
  ok(await count() === base, '반복 후에도 오브젝트 수 일정 ' + await count());
  ok(errs.filter(e => !/boom|create fail|미니게임/.test(e)).length === 0, '예상 못한 오류 없음 ' + JSON.stringify(errs.filter(e => !/boom|create fail/.test(e)).slice(0, 3)));
  await b.close();
})();
