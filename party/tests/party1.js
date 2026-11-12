// 파티 셸 통합 테스트: 로비(폰 3대) → 준비 → 시작 → 인트로 → 카운트다운 → 미니게임 → 결과 → 최종 → 로비. 재접속·이탈·레이아웃 전환·입력 지연.
const { chromium } = require('playwright'); const MOCK = require('./mock.js');
const PORT = process.env.PORT || 8501;
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
  await ctx.route('**/peerjs.min.js', r => r.fulfill({ contentType: 'text/javascript', body: MOCK }));
  const errs = []; const hook = (p, n) => { p.on('pageerror', e => errs.push(n + ' ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text()) && errs.push(n + ' console ' + m.text())); };
  const tv = await ctx.newPage(); hook(tv, 'tv'); await tv.goto(`http://localhost:${PORT}/party/tv.html?dev&rounds=3`);
  await tv.waitForFunction(() => window.party && party.code, null, { timeout: 8000 });
  const code = await tv.evaluate(() => { party.modeIdx = party._modes().findIndex(m => m.id === '_tapRace'); return party.code; });
  ok(/^[A-Z0-9]{5}$/.test(code), '방 코드 ' + code);
  const pads = [];
  const openPad = async (name) => {
    const pad = await ctx.newPage(); hook(pad, 'pad:' + name); await pad.addInitScript(n => { try { if (!sessionStorage.getItem('init')) { localStorage.setItem('kg.pid', 'pid-' + n); sessionStorage.setItem('init', '1'); } } catch (e) {} }, name); await pad.setViewportSize({ width: 800, height: 380 });
    await pad.goto(`http://localhost:${PORT}/party/pad.html?join=${code}`); await pad.fill('#nick', name); await pad.click('#login button');
    await pad.waitForFunction(() => window.__pad && window.__pad.connected, null, { timeout: 8000 }); return pad;
  };
  for (const n of ['하나', '둘', '셋']) pads.push(await openPad(n));
  await tv.waitForTimeout(500);
  let st = await tv.evaluate(() => ({ n: party.net.players.length, nicks: party.net.players.map(p => p.nick), colors: new Set(party.net.players.map(p => p.color)).size, state: party.state, owner: party.net.owner && party.net.owner.nick }));
  ok(st.n === 3 && st.colors === 3 && st.nicks.join() === '하나,둘,셋' && st.state === 'lobby' && st.owner === '하나', '로비: 3명 접속·닉네임·고유 색·방장 ' + JSON.stringify(st));
  // 폰 레이아웃(로비): 준비 버튼, 방장은 시작 버튼도
  let lay = await Promise.all(pads.map(p => p.evaluate(() => JSON.stringify(window.__pad.layout.buttons.map(b => b.id + ':' + b.label)))));
  ok(lay[0] === '["a:준비","b:시작"]' && lay[1] === '["a:준비"]', '폰 레이아웃(로비) ' + lay.join(' | '));
  // 설정 조작(방장 스틱 오른쪽 = 라운드/게임 변경) 확인 전 기본값
  const press = async (pad, key, ms = 120) => { await pad.keyboard.down(key); await pad.waitForTimeout(ms); await pad.keyboard.up(key); await pad.waitForTimeout(80); };
  // 준비: 각자 A(Space)
  await press(pads[1], 'Space'); await press(pads[2], 'Space'); await tv.waitForTimeout(200);
  let rd = await tv.evaluate(() => party.net.players.map(p => p.ready));
  ok(rd.join() === 'false,true,true', '준비 토글 ' + rd.join());
  // 방장이 아직 준비 안 했을 땐 시작 못 함
  await press(pads[0], 'KeyK'); await tv.waitForTimeout(200);
  ok(await tv.evaluate(() => party.state) === 'lobby', '모두 준비 전에는 시작 안 됨');
  await press(pads[0], 'Space'); await tv.waitForTimeout(150);
  // 방장 시작 버튼(K) → 바로 시작
  await press(pads[0], 'KeyK'); await tv.waitForTimeout(300);
  st = await tv.evaluate(() => ({ s: party.state, g: party.game && party.game.id, round: party.round, rounds: party.rounds }));
  ok(st.s === 'intro' && st.g === '_tapRace' && st.round === 1 && st.rounds === 3, '시작 → 인트로 ' + JSON.stringify(st));
  // 인트로: 방장 확인(A)으로 넘길 수 있음(1초 뒤)
  await tv.waitForTimeout(1100); await press(pads[0], 'Space'); await tv.waitForTimeout(300);
  ok(await tv.evaluate(() => party.state) === 'countdown', '인트로 → 카운트다운');
  await tv.waitForFunction(() => party.state === 'play', null, { timeout: 6000 });
  lay = await pads[1].evaluate(() => JSON.stringify(window.__pad.layout.buttons.map(b => b.id + ':' + b.label)) + window.__pad.layout.stick + window.__pad.layout.mode);
  ok(lay === '["a:연타"]falsegame', '게임 레이아웃으로 전환(스틱 없음, 버튼 A 연타) ' + lay);
  // 입력 지연: 폰 A 누름 → TV 입력 반영까지
  const t0 = Date.now(); await pads[0].keyboard.down('Space');
  await tv.waitForFunction(() => party.net.players[0].input.held('a'), null, { timeout: 2000 }); const lat = Date.now() - t0; await pads[0].keyboard.up('Space');
  ok(lat < 400, '입력 지연 ' + lat + 'ms (mock, 로컬)');
  // 연타: 하나·둘 이 먼저 끝내고, 셋은 연결 끊었다 재접속
  const mash = async (pad, n) => { for (let i = 0; i < n; i++) { await pad.keyboard.down('Space'); await pad.waitForTimeout(40); await pad.keyboard.up('Space'); await pad.waitForTimeout(40); } };
  await pads[2].close(); await tv.waitForTimeout(400);
  ok(await tv.evaluate(() => !party.net.players[2].connected), '이탈 감지(연결 끊김 표시)');
  const pad3 = await ctx.newPage(); hook(pad3, 'pad3'); await pad3.addInitScript(() => { localStorage.setItem('kg.pid', 'pid-셋'); }); await pad3.setViewportSize({ width: 800, height: 380 });
  await pad3.goto(`http://localhost:${PORT}/party/pad.html?join=${code}`); await pad3.fill('#nick', '셋'); await pad3.click('#login button');
  await pad3.waitForFunction(() => window.__pad && window.__pad.connected, null, { timeout: 8000 }); pads[2] = pad3; await tv.waitForTimeout(400);
  st = await tv.evaluate(() => ({ n: party.net.players.length, c: party.net.players[2].connected, id: party.net.players[2].id, state: party.state }));
  ok(st.n === 3 && st.c && st.id === 'p2' && st.state === 'play', '재접속: 새 플레이어 안 생기고 같은 id로 이어짐 ' + JSON.stringify(st));
  lay = await pads[2].evaluate(() => window.__pad.layout.mode); ok(lay === 'game', '재접속한 폰도 게임 레이아웃을 받음 ' + lay);
  const lag = (pad, ms, n) => pad.waitForTimeout(ms).then(() => mash(pad, n));
  await Promise.all([mash(pads[0], 26), lag(pads[1], 700, 26), lag(pads[2], 1400, 26)]);
  await tv.waitForFunction(() => party.state === 'result', null, { timeout: 15000 });
  let res = await tv.evaluate(() => ({ groups: party.outcome.groups, award: party.outcome.award, scores: party.net.players.map(p => p.score) }));
  ok(res.groups[0][0] === 'p0' && res.award.p0 === 3 && res.award.p1 === 2 && res.award.p2 === 1, '결과: 순위·점수(3/2/1) ' + JSON.stringify(res));
  // 라운드 2, 3 (확인으로 빠르게 넘김)
  for (let r = 2; r <= 3; r++) {
    await tv.waitForTimeout(1600); await press(pads[0], 'Space'); await tv.waitForFunction(() => party.state === 'intro', null, { timeout: 5000 });
    await tv.waitForTimeout(1100); await press(pads[0], 'Space'); await tv.waitForFunction(() => party.state === 'play', null, { timeout: 8000 });
    await Promise.all([mash(pads[0], 26), lag(pads[1], 700, 26), lag(pads[2], 1400, 26)]);
    await tv.waitForFunction(() => party.state === 'result', null, { timeout: 15000 });
  }
  await tv.waitForTimeout(1600); await press(pads[0], 'Space'); await tv.waitForFunction(() => party.state === 'final', null, { timeout: 5000 });
  const fin = await tv.evaluate(() => party.finalRank.map(p => p.nick + ':' + p.score));
  ok(fin[0].startsWith('하나') && fin.length === 3, '최종 순위 ' + fin.join(' '));
  // 오브젝트 누수 없음: 미니게임 장면이 모두 정리됨
  const leaks = await tv.evaluate(() => App ? 0 : 0).catch(() => 0);
  const roots = await tv.evaluate(() => party.App.roots.map(r => r.name));
  ok(!roots.includes('minigame'), '미니게임 장면 정리됨 ' + JSON.stringify(roots));
  await tv.waitForTimeout(3200); await press(pads[0], 'Space'); await tv.waitForFunction(() => party.state === 'lobby', null, { timeout: 5000 });
  rd = await tv.evaluate(() => party.net.players.map(p => p.ready + ':' + p.score)); ok(rd.every(x => x === 'false:0') || rd.every(x => x.startsWith('false')), '최종 → 로비 복귀(준비 초기화) ' + rd.join());
  ok(errs.length === 0, '오류 없음 ' + JSON.stringify(errs.slice(0, 5)));
  await b.close();
})();
