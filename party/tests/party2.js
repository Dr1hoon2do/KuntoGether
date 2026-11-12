// 파티 셸 테스트 2: 레이아웃 전환(스틱+조준+버튼4 ↔ 버튼 하나), 터치 입력(스틱/조준/버튼)이 TV에 도달, 게임 중 이탈, 늦게 들어온 사람, 강퇴, 스틱 고정 복구, 키보드 플레이어.
const { chromium } = require('playwright'); const MOCK = require('./mock.js');
const PORT = process.env.PORT || 8501;
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
  await ctx.route('**/peerjs.min.js', r => r.fulfill({ contentType: 'text/javascript', body: MOCK }));
  const errs = []; const hook = (p, n) => { p.on('pageerror', e => errs.push(n + ' ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text()) && errs.push(n + ' console ' + m.text())); };
  const tv = await ctx.newPage(); hook(tv, 'tv'); await tv.goto(`http://localhost:${PORT}/party/tv.html?dev`);
  await tv.waitForFunction(() => window.party && party.code); const code = await tv.evaluate(() => party.code);
  const openPad = async (name) => {
    const pad = await ctx.newPage(); hook(pad, 'pad:' + name); await pad.addInitScript(n => { localStorage.setItem('kg.pid', 'pid-' + n); }, name); await pad.setViewportSize({ width: 800, height: 380 });
    await pad.goto(`http://localhost:${PORT}/party/pad.html?join=${code}`); await pad.fill('#nick', name); await pad.click('#login button');
    await pad.waitForFunction(() => window.__pad && window.__pad.connected, null, { timeout: 8000 }); return pad;
  };
  const A = await openPad('에이'), B = await openPad('비'); await tv.waitForTimeout(400);
  const cdpA = await ctx.newCDPSession(A);
  // 입력 시험 게임만 하도록 설정하고 시작
  await tv.evaluate(() => { party.modeIdx = party._modes().findIndex(m => m.id === '_inputTest'); party.net.players.forEach(p => p.ready = true); party._startMatch(); });
  await tv.waitForFunction(() => party.state === 'intro'); await tv.waitForTimeout(1100);
  await tv.evaluate(() => party._beginCountdown()); await tv.waitForFunction(() => party.state === 'play', null, { timeout: 6000 });
  let lay = await A.evaluate(() => { const l = window.__pad.layout; return `${l.mode}|${l.stick}|${l.aim}|${l.buttons.map(b => b.id).join('')}`; });
  ok(lay === 'game|true|true|abcd', '입력 시험 레이아웃: 스틱+조준+버튼 4개 ' + lay);
  // 터치: 왼쪽 스틱 오른쪽으로, 오른쪽 조준 위쪽으로, 버튼 A 누름
  const inp = () => tv.evaluate(() => { const i = party.net.players[0].input; return { mx: i.mx, my: i.my, ax: i.ax, ay: i.ay, a: i.buttons.a, b: i.buttons.b }; });
  await cdpA.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 250, id: 1 }] });
  await cdpA.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 250, id: 1 }] });
  await cdpA.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 250, id: 1 }, { x: 420, y: 250, id: 2 }] });
  await cdpA.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 250, id: 1 }, { x: 420, y: 160, id: 2 }] });
  await tv.waitForTimeout(300); let i = await inp();
  ok(i.mx > 0.9 && Math.abs(i.my) < 0.1 && i.ay > 0.9 && Math.abs(i.ax) < 0.2, '스틱(오른쪽)+조준(위) 동시 입력 ' + JSON.stringify(i));
  // 버튼 A (오른쪽 아래 모서리 근처)
  const pos = await A.evaluate(() => btnPos(0));
  await cdpA.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 250, id: 1 }, { x: 420, y: 160, id: 2 }, { x: pos.x, y: pos.y, id: 3 }] });
  await tv.waitForTimeout(250); i = await inp(); ok(i.a === true, '버튼 A 눌림 도달 ' + i.a);
  // 손가락 하나(스틱)만 뗐을 때 그 스틱만 해제, 나머지 유지
  await cdpA.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 200, y: 250, id: 1 }] }); await tv.waitForTimeout(250); i = await inp();
  ok(i.mx === 0 && i.ay > 0.9 && i.a === true, '스틱만 해제, 조준·버튼은 유지 ' + JSON.stringify(i));
  // 해제 이벤트를 놓친 경우(스틱 고정): 실제 터치 목록에 없는 id가 남아 있으면 다음 터치 이벤트에서 정리
  await A.evaluate(() => { window.__pad.touches.set(99, { role: 'move', ox: 100, oy: 100, x: 190, y: 100 }); });
  await cdpA.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 420, y: 160, id: 2 }, { x: pos.x, y: pos.y, id: 3 }] }); await tv.waitForTimeout(250); i = await inp();
  ok(i.mx === 0 && i.ay === 0 && i.a === false, '모든 손가락을 떼면 전부 해제(고정 없음) ' + JSON.stringify(i));
  // PC 키보드/마우스: WASD, Space(A), K(B), 마우스 조준
  await A.keyboard.down('KeyD'); await A.keyboard.down('KeyW'); await A.keyboard.down('KeyK'); await tv.waitForTimeout(250); i = await inp();
  ok(i.mx > 0.6 && i.my > 0.6 && i.b === true, 'PC 키보드: WASD + K(B) ' + JSON.stringify(i)); await A.keyboard.up('KeyD'); await A.keyboard.up('KeyW'); await A.keyboard.up('KeyK');
  await A.mouse.move(600, 40); await A.mouse.down(); await tv.waitForTimeout(250); i = await inp(); ok(i.ax > 0.5 && i.ay > 0.5, 'PC 마우스 조준(오른쪽 위) ' + JSON.stringify(i)); await A.mouse.up();
  // 키보드 플레이어(TV Tab)와 함께 진행, 게임 중 이탈 → onPlayerLeave 호출 안 해도 게임은 계속
  await B.close(); await tv.waitForTimeout(400);
  ok(await tv.evaluate(() => party.state === 'play' && !party.net.players[1].connected), '게임 중 이탈해도 게임은 계속, 플레이어는 연결 끊김 표시');
  // 늦게 들어온 사람: 대기 화면(wait 레이아웃), 명단에는 추가
  const C = await openPad('씨'); await tv.waitForTimeout(400);
  lay = await C.evaluate(() => { const l = window.__pad.layout; return `${l.mode}|${l.stick}|${l.buttons.length}`; });
  ok(lay === 'wait|false|0', '게임 중 들어온 사람은 대기 레이아웃 ' + lay);
  ok(await tv.evaluate(() => party.part.length === 2 && party.net.players.length === 3), '참가자 목록은 그대로(2명), 명단 3명');
  // 시간 종료 → 결과 → 다음 라운드를 위해 로비로 가서 다른 게임 선택 → 레이아웃 전환
  await tv.evaluate(() => party.ctx.end({ scores: { p0: 5, p1: 1 } })); await tv.waitForFunction(() => party.state === 'result', null, { timeout: 6000 });
  ok(await tv.evaluate(() => party.outcome.groups[0][0] === 'p0' && party.outcome.award.p0 === 3 && party.outcome.award.p1 === 2), 'scores 형식 결과 처리');
  await tv.evaluate(() => party._toLobby()); await tv.waitForTimeout(300);
  lay = await C.evaluate(() => window.__pad.layout.buttons.map(b => b.id).join()); ok(lay === 'a,b' || lay === 'a', '로비로 돌아오면 폰 레이아웃이 로비용으로 ' + lay);
  await tv.evaluate(() => { party.modeIdx = party._modes().findIndex(m => m.id === '_tapRace'); party.net.players.forEach(p => p.ready = p.connected); party._startMatch(); });
  await tv.waitForFunction(() => party.state === 'intro'); await tv.evaluate(() => party._beginCountdown()); await tv.waitForFunction(() => party.state === 'play', null, { timeout: 6000 });
  lay = await A.evaluate(() => { const l = window.__pad.layout; return `${l.mode}|${l.stick}|${l.aim}|${l.buttons.map(b => b.id).join('')}`; });
  ok(lay === 'game|false|false|a', '게임 전환: 연타 달리기 레이아웃(버튼 A만) ' + lay);
  ok(await tv.evaluate(() => party.part.length === 2 && party.part.every(p => p.connected)), '이탈했던 B 제외하고 접속자만 참가');
  // 강퇴
  await tv.evaluate(() => party.net.kick(party.net.players.find(p => p.nick === '씨'))); await tv.waitForTimeout(400);
  ok(await tv.evaluate(() => party.net.players.length === 2), '강퇴: 명단에서 제거');
  ok(errs.length === 0, '오류 없음 ' + JSON.stringify(errs.slice(0, 5)));
  await b.close();
})();
