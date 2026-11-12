// 범퍼 아레나 (탑뷰): 둥근 플랫폼 위에서 서로 밀어 떨어뜨린다. 스틱 = 이동, A = 돌진(쿨다운).
// 플랫폼은 10초마다 바깥 고리가 무너진다 (2.5초 전부터 붉게 깜빡임). 60초부터는 서든데스(계속 줄어듦).
// 마지막까지 남은 사람이 1등, 탈락 순서의 역순으로 순위. 같은 프레임에 떨어지면 동점.
// 물리: 엔진 World2D(Body2D 원형 몸체). 그림은 전부 코드로(BumperView 렌더러 하나가 바닥·플레이어·효과를 그린다).
(function () {
  const TAU = Math.PI * 2;
  const MAXV = 140, ACC = 7, FRIC = 2.4, DASH_V = 440, DASH_T = 0.22, DASH_CD = 1.25, KICK = 190;
  const STAGE_T = [12, 22, 32, 42, 52], WARN = 2.5, DROP_T = 0.45, SUDDEN_T = 60, FRACS = [1, 0.84, 0.70, 0.58, 0.47, 0.38];
  const hex = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const shade = (c, k) => { const [r, g, b] = hex(c); const f = v => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(r)},${f(g)},${f(b)})`; };
  const lerp = (a, b, t) => a + (b - a) * t;

  // 엔진 렌더러 하나가 아레나 전체를 월드 좌표로 그린다 (Y-up. 글자는 scale(1,-1) 후에)
  class BumperView extends Renderer {
    constructor(g) { super(); this.g = g; this.sortingLayer = "Default"; this.orderInLayer = 0; }
    render(ctx, camera) { const m = camera.viewMatrix; ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f); ctx.globalAlpha = 1; this.g.draw(ctx); }
  }

  PartyGames.register({
    id: "bumper", name: "범퍼 아레나", rule: "서로 밀어서 떨어뜨리세요! [돌진] 버튼으로 크게 부딪치기", view: "topdown", players: [2, 8], duration: 75, scoring: "rank", points: [3, 2, 1],
    controls: { stick: true, aim: false, buttons: [{ id: "a", label: "돌진" }] },
    create(ctx) {
      const n = ctx.players.length, R0 = 130 + 16 * n, PR = 14 + Math.max(0, n - 4) * 0.75, rng = ctx.rng;
      const RS = FRACS.map(f => f * R0), RMIN = Math.max(PR * 3.2, 0.2 * R0);
      const viewH = 2.45 * R0, viewW = viewH * 16 / 9; ctx.setView(viewW, viewH); ctx.camera.transform.setPosition(0, 0);
      const world = World2D.create(ctx.App, { mode: "topdown", adaptive: true }); world.layer("Player");

      // ---- 플레이어 ----
      const order = rng.shuffle(ctx.players.map((p, i) => i)), base = rng() * TAU, ents = [];
      ctx.players.forEach((p, i) => {
        const slot = order[i], a = base + slot * TAU / n, r = R0 * (n <= 2 ? 0.5 : 0.52);
        const go = ctx.create("bumper_" + p.id); go.transform.setPosition(Math.cos(a) * r, Math.sin(a) * r);
        const e = { p, go, id: p.id, color: p.color, dark: shade(p.color, 0.6), light: shade(p.color, 1.25), body: null, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0,
          alive: true, fall: -1, fx: 0, fy: 0, fvx: 0, fvy: 0, fa: 0, dashT: 0, cd: 0, cdMax: DASH_CD, face: a + Math.PI, hx: Math.cos(a + Math.PI), hy: Math.sin(a + Math.PI), squash: 0, bumpCd: 0, trail: 0, elimT: -1, wob: 0 };
        e.body = go.addComponent(new Body2D({ type: "dynamic", shape: "circle", radius: PR, density: 1, friction: 0, restitution: 0.82, linearDamping: 0, angularDamping: 2, fixedRotation: true, allowSleep: false, category: "Player", mask: "all", onBegin: info => bump(e, info) }));
        go._bp = e; ents.push(e);
      });
      const byId = {}; for (const e of ents) byId[e.id] = e;

      // ---- 바닥 무늬 캐시 (극좌표 타일: 고리 5겹 = 무너지는 단계와 같은 경계) ----
      const PXS = Math.min(2, 1100 / (2 * R0)), cache = document.createElement("canvas"); cache.width = cache.height = Math.ceil(2 * R0 * PXS) + 4;
      { const c = cache.getContext("2d"), cx = cache.width / 2, cy = cache.height / 2; c.translate(cx, cy); c.scale(PXS, PXS);
        const pal = [["#e0a85a", "#d09a4c"], ["#cf9560", "#bf8754"], ["#b9826a", "#ab755e"], ["#a07a7a", "#936d6d"], ["#8b7a9a", "#7e6d8d"], ["#7a7fa8", "#6d729b"]];
        for (let k = 0; k < 6; k++) { const r1 = RS[k], r0 = k < 5 ? RS[k + 1] : 0, sec = Math.max(8, Math.round(TAU * (r0 + r1) / 2 / ((r1 - r0 || r1) * 1.15)));
          for (let j = 0; j < sec; j++) { c.fillStyle = pal[k][(j + k) & 1]; c.beginPath(); c.arc(0, 0, r1, j * TAU / sec, (j + 1) * TAU / sec); c.arc(0, 0, r0, (j + 1) * TAU / sec, j * TAU / sec, true); c.closePath(); c.fill(); }
          c.strokeStyle = "#00000030"; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, r1 - 0.6, 0, TAU); c.stroke(); }
        c.fillStyle = "#ffffff18"; c.beginPath(); c.arc(0, 0, RS[5] * 0.28, 0, TAU); c.fill(); }
      const stars = []; for (let i = 0; i < 70; i++) stars.push(rng.range(-1, 1), rng.range(-1, 1), rng());

      // ---- 상태 ----
      let T = 0, finished = false, shake = 0, stage = 0, lastTick = -1, sdShown = false, finishT = 0, winner = null;
      const elim = [], feed = [], pending = [], drop = [];
      let sfxHit = 0, sfxDash = 0;

      // ---- 반지름(시간 함수) ----
      function radiusAt(t) {
        if (t >= SUDDEN_T) return lerp(RS[5], RMIN, Math.min(1, (t - SUDDEN_T) / (75 - SUDDEN_T)));
        for (let k = 0; k < STAGE_T.length; k++) { const T0 = STAGE_T[k]; if (t < T0) return RS[k]; if (t < T0 + DROP_T) { const u = (t - T0) / DROP_T; return lerp(RS[k], RS[k + 1], u * u); } }
        return RS[5];
      }
      let R = RS[0];
      const warnIdx = () => { for (let k = 0; k < STAGE_T.length; k++) if (T >= STAGE_T[k] - WARN && T < STAGE_T[k] + 0.02) return k + 1; return 0; };

      // ---- 파티클 (고정 풀, 할당 없음) ----
      const NP = 220, px = new Float32Array(NP), py = new Float32Array(NP), pvx = new Float32Array(NP), pvy = new Float32Array(NP), pl = new Float32Array(NP), pm = new Float32Array(NP), ps = new Float32Array(NP), pg = new Float32Array(NP), pc = new Array(NP).fill("#fff");
      let pi = 0;
      function spark(x, y, vx, vy, life, size, color, grav) { const i = pi; pi = (pi + 1) % NP; px[i] = x; py[i] = y; pvx[i] = vx; pvy[i] = vy; pl[i] = pm[i] = life; ps[i] = size; pc[i] = color; pg[i] = grav || 0; }
      function burst(x, y, k, speed, color, size, life) { for (let i = 0; i < k; i++) { const a = rng() * TAU, s = speed * (0.4 + rng() * 0.8); spark(x, y, Math.cos(a) * s, Math.sin(a) * s, (life || 0.45) * (0.6 + rng() * 0.7), size * (0.6 + rng() * 0.8), color, 0); } }

      // ---- 부딪힘 ----
      function bump(e, info) {
        const o = info.otherObject && info.otherObject._bp; if (!o || e.bumpCd > 0 || !e.alive || !o.alive) return;
        const a = e.body, b = o.body, nx = info.normalX, ny = info.normalY, rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel < 30) return;
        e.bumpCd = 0.06; e.squash = Math.min(1, rel / 380); o.squash = Math.max(o.squash, e.squash * 0.8);
        if (e.dashT > 0 && o.dashT <= 0) pending.push(o, nx, ny, KICK * (0.7 + 0.3 * e.dashT / DASH_T)); // 돌진 중 부딪히면 상대가 더 멀리 튕긴다
        shake = Math.max(shake, Math.min(5, 0.9 + rel / 110)); const x = info.pointX, y = info.pointY;
        burst(x, y, 4 + Math.min(10, (rel / 40) | 0), 150 + rel * 0.4, "#fff8c4", 2.2, 0.35); burst(x, y, 3, 90, e.color, 2.4, 0.4);
        if (sfxHit <= 0) { ctx.sfx.play(rel > 260 ? "boom" : "hit"); sfxHit = 0.07; }
      }

      // ---- 탈락 ----
      function eliminate(e, group) {
        e.alive = false; e.fall = 0; e.fx = e.body.x; e.fy = e.body.y; e.fvx = e.body.vx * 0.5; e.fvy = e.body.vy * 0.5; e.elimT = T;
        try { e.body.body.setActive(false); } catch (err) { /* 몸체가 아직 없으면 무시 */ }
        group.push(e.id); feed.push({ e, t: 0 }); if (feed.length > 4) feed.shift();
        ctx.sfx.play("lose"); shake = Math.max(shake, 3); burst(e.fx, e.fy, 10, 110, e.color, 2.6, 0.6);
      }

      function rankingNow() {
        const alive = ents.filter(e => e.alive).sort((a, b) => Math.hypot(a.body.x, a.body.y) - Math.hypot(b.body.x, b.body.y)).map(e => e.id);
        return [...alive, ...elim.slice().reverse().map(g => g.length === 1 ? g[0] : g)];
      }

      const inst = {
        start() { ctx.sfx.play("go"); },
        update(dt) {
          T += dt; sfxHit -= dt; sfxDash -= dt; shake = Math.max(0, shake - dt * 9);
          // 돌진 쿨다운·입력·이동
          for (const e of ents) {
            e.bumpCd -= dt; e.squash = Math.max(0, e.squash - dt * 4);
            if (!e.alive) { e.fall += dt; e.fa += dt * 7; e.fx += e.fvx * dt; e.fy += e.fvy * dt; e.fvx *= 0.97; e.fvy *= 0.97; continue; }
            const bd = e.body, ready = !!bd.body; if (!ready) continue;
            const inp = ctx.input(e.id), mx = inp.mx, my = inp.my, ml = Math.hypot(mx, my), has = ml > 0.12;
            e.x = bd.x; e.y = bd.y; e.vx = bd.vx; e.vy = bd.vy;
            if (has) { e.hx = mx / ml; e.hy = my / ml; e.face = Math.atan2(e.hy, e.hx); }
            e.dashT = Math.max(0, e.dashT - dt); e.cd = Math.max(0, e.cd - dt);
            if (inp.pressed("a") && e.cd <= 0 && e.dashT <= 0) {
              e.dashT = DASH_T; e.cd = DASH_CD; bd.setVelocity(e.hx * DASH_V, e.hy * DASH_V); e.vx = e.hx * DASH_V; e.vy = e.hy * DASH_V;
              burst(e.x - e.hx * PR, e.y - e.hy * PR, 6, 120, "#ffffff", 2.2, 0.3); if (sfxDash <= 0) { ctx.sfx.play("jump"); sfxDash = 0.08; }
            }
            const k = has ? Math.min(1, ml) : 0, dvx = e.hx * MAXV * k, dvy = e.hy * MAXV * k, rate = e.dashT > 0 ? 0.6 : has ? ACC : FRIC, f = 1 - Math.exp(-rate * dt);
            bd.setVelocity(e.vx + (dvx - e.vx) * f, e.vy + (dvy - e.vy) * f);
            e.trail -= dt; const sp = Math.hypot(e.vx, e.vy);
            if (sp > 110 && e.trail <= 0) { e.trail = e.dashT > 0 ? 0.02 : 0.06; spark(e.x - e.hx * PR * 0.6, e.y - e.hy * PR * 0.6, (rng() - 0.5) * 20, (rng() - 0.5) * 20, 0.35, e.dashT > 0 ? 4 : 2.6, e.dashT > 0 ? e.light : "#b9b4d6", 0); }
          }
          // 돌진으로 밀친 상대에게 추가 속도 (접촉 콜백 밖에서 적용)
          for (let i = 0; i < pending.length; i += 4) { const o = pending[i]; if (o.alive && o.body.body) o.body.setVelocity(o.body.vx + pending[i + 1] * pending[i + 3], o.body.vy + pending[i + 2] * pending[i + 3]); }
          pending.length = 0;
          // 바닥 크기·경고·무너짐
          if (!finished) {
            R = radiusAt(T);
            const w = warnIdx(); if (w && Math.floor(T * 2) !== lastTick) { lastTick = Math.floor(T * 2); ctx.sfx.play("tick"); }
            if (stage < STAGE_T.length && T >= STAGE_T[stage]) { // 한 고리가 무너진다
              drop.push({ k: stage + 1, t: 0 }); stage++; shake = Math.max(shake, 4); ctx.sfx.play("boom");
              for (let i = 0; i < 30; i++) { const a = rng() * TAU, r = lerp(RS[stage], RS[stage - 1], rng()); spark(Math.cos(a) * r, Math.sin(a) * r, Math.cos(a) * 40, Math.sin(a) * 40, 0.7, 3, "#ffb36b", 0); }
            }
            if (T >= SUDDEN_T && !sdShown) { sdShown = true; ctx.sfx.play("warn"); }
            // 탈락 판정: 몸 중심이 가장자리 밖으로 (여러 명이 한 프레임에 떨어지면 동점)
            const group = [];
            for (const e of ents) if (e.alive && e.body.body && Math.hypot(e.body.x, e.body.y) > R + PR * 0.2) eliminate(e, group);
            if (group.length) elim.push(group);
            const left = ents.filter(e => e.alive);
            if (left.length <= 1) {
              finished = true; winner = left[0] || null; const res = rankingNow();
              if (winner) { burst(winner.body.x, winner.body.y, 24, 200, winner.light, 3, 0.9); ctx.sfx.play("fanfare"); }
              ctx.after(winner ? 1.6 : 0.5, () => { world.paused = true; ctx.end({ ranking: res }); });
            }
          }
          for (const d of drop) d.t += dt; while (drop.length && drop[0].t > 0.9) drop.shift();
          for (const f of feed) f.t += dt; while (feed.length && feed[0].t > 2.6) feed.shift();
          for (let i = 0; i < NP; i++) if (pl[i] > 0) { pl[i] -= dt; px[i] += pvx[i] * dt; py[i] += pvy[i] * dt; pvx[i] *= 0.94; pvy[i] *= 0.94; }
          // 카메라 흔들림
          const s = shake; ctx.camera.transform.setPosition(s ? (rng() - 0.5) * s * 2 : 0, s ? (rng() - 0.5) * s * 2 : 0);
        },
        onTimeUp() { if (!finished) { finished = true; world.paused = true; ctx.end({ ranking: rankingNow() }); } },
        getResult() { return { ranking: rankingNow() }; },
        dbg() { return { T, R, stage, finished, winner: winner && winner.id, elim: elim.map(g => g.slice()), ents, shake, R0, PR }; },
        dispose() { try { world.destroy(); } catch (e) { console.error(e); } },
        render(h) {
          // 아래쪽 참가자 칩 (탈락은 흐리게)
          const total = ents.length, x0 = 960 - (total - 1) * 110; ents.forEach((e, i) => { const x = x0 + i * 220; h.g.globalAlpha = e.alive ? 1 : 0.3; h.tag(e.p, x, 1030, { size: 30 }); h.g.globalAlpha = 1; if (!e.alive) h.text("✕", x - 96, 1030, { size: 40, color: "#ff5252", stroke: true }); });
          if (!finished) {
            const w = warnIdx(); if (w && Math.floor(T * 3) % 2 === 0) h.text("⚠ 바닥이 무너져요!", 960, 140, { size: 64, color: "#ff8a65", stroke: true, strokeW: 8 });
            if (T >= SUDDEN_T) h.text("서든데스! 바닥이 계속 줄어요", 960, 140, { size: 56, color: "#ff5252", stroke: true, strokeW: 8 });
          } else if (winner) h.text(`${winner.p.nick} 승리!`, 960, 180, { size: 90, color: winner.color, stroke: true, strokeW: 10 });
          feed.forEach((f, i) => { const a = f.t < 0.2 ? f.t / 0.2 : Math.max(0, 1 - (f.t - 1.9) / 0.7); h.text(`${f.e.p.nick} 탈락!`, 960, 250 + i * 56, { size: 44, color: f.e.color, stroke: true, strokeW: 7, alpha: a }); });
        },
        // 월드 좌표 그리기 (BumperView가 부른다)
        draw(c) {
          const pxs = 2 * R0 + 40;
          // 배경
          c.fillStyle = "#0e0b26"; c.fillRect(-viewW, -viewH, viewW * 2, viewH * 2);
          for (let i = 0; i < stars.length; i += 3) { c.globalAlpha = 0.35 + 0.35 * Math.sin(T * 1.5 + stars[i + 2] * 9); c.fillStyle = "#cfd8ff"; const s = 1 + stars[i + 2] * 1.6; c.fillRect(stars[i] * viewW * 0.5 - s / 2, stars[i + 1] * viewH * 0.5 - s / 2, s, s); }
          c.globalAlpha = 1;
          // 플랫폼 옆면(두께)과 그림자
          c.fillStyle = "#00000055"; c.beginPath(); c.arc(0, -22, R + 8, 0, TAU); c.fill();
          c.fillStyle = "#3b2c52"; c.beginPath(); c.arc(0, -10, R + 2, 0, TAU); c.fill();
          c.fillStyle = "#27193d"; c.beginPath(); c.arc(0, -16, R, 0, TAU); c.fill();
          // 바닥 (캐시한 타일 무늬를 현재 반지름으로 잘라 그린다)
          c.save(); c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip(); c.scale(1 / PXS, -1 / PXS); c.drawImage(cache, -cache.width / 2, -cache.height / 2); c.restore();
          c.strokeStyle = "#ffe9b8"; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.stroke();
          // 경고 띠
          const w = warnIdx(); if (w && !finished) {
            const u = (T - (STAGE_T[w - 1] - WARN)) / WARN, blink = Math.sin(T * (6 + 14 * u)) > 0 ? 0.8 : 0.35;
            c.save(); c.globalAlpha = blink; c.fillStyle = "#ff1a0a"; c.beginPath(); c.arc(0, 0, RS[w - 1], 0, TAU); c.moveTo(RS[w], 0); c.arc(0, 0, RS[w], 0, TAU, true); c.fill("evenodd"); c.restore();
          }
          if (w && !finished) { c.strokeStyle = "#ff3b30"; c.lineWidth = 4; c.globalAlpha = 0.5 + 0.5 * Math.sin(T * 14); c.beginPath(); c.arc(0, 0, RS[w], 0, TAU); c.stroke(); c.globalAlpha = 1; }
          // 무너져 떨어지는 고리
          for (const d of drop) {
            const u = Math.min(1, d.t / 0.9), s = 1 - 0.22 * u * u, ang = u * 0.08 * (d.k % 2 ? 1 : -1);
            c.save(); c.globalAlpha = 1 - u; c.rotate(ang); c.scale(s, s); c.beginPath(); c.arc(0, 0, RS[d.k - 1], 0, TAU); c.moveTo(RS[d.k], 0); c.arc(0, 0, RS[d.k], 0, TAU, true); c.clip("evenodd");
            c.scale(1 / PXS, -1 / PXS); c.drawImage(cache, -cache.width / 2, -cache.height / 2); c.restore();
          }
          // 떨어지는 사람
          for (const e of ents) if (!e.alive && e.fall < 1.0) { const u = e.fall / 1.0, s = 1 - 0.85 * u; c.save(); c.globalAlpha = 1 - u; c.translate(e.fx, e.fy - 30 * u * u); c.rotate(e.fa); c.scale(s, s); body(c, e, 0, 0, 1); c.restore(); }
          // 입자 (바닥 위, 사람 아래)
          for (let i = 0; i < NP; i++) if (pl[i] > 0) { c.globalAlpha = Math.min(1, pl[i] / pm[i] * 1.5); c.fillStyle = pc[i]; const s = ps[i] * (0.5 + 0.5 * pl[i] / pm[i]); c.fillRect(px[i] - s / 2, py[i] - s / 2, s, s); }
          c.globalAlpha = 1;
          // 살아 있는 플레이어 (아래쪽(y가 작은) 사람이 위에 보이게 정렬)
          const alive = ents.filter(e => e.alive).sort((a, b) => b.y - a.y);
          for (const e of alive) {
            const x = e.body.x, y = e.body.y, win = finished && winner === e, bob = win ? Math.abs(Math.sin(T * 8)) * 7 : 0;
            c.fillStyle = "#00000050"; c.beginPath(); c.ellipse(x + 2, y - 4, PR * 0.95, PR * 0.55, 0, 0, TAU); c.fill();
            if (e.dashT > 0) { c.globalAlpha = 0.35; c.fillStyle = e.light; c.beginPath(); c.arc(x - e.hx * PR * 0.9, y - e.hy * PR * 0.9, PR * 0.9, 0, TAU); c.arc(x - e.hx * PR * 1.7, y - e.hy * PR * 1.7, PR * 0.7, 0, TAU); c.fill(); c.globalAlpha = 1; }
            body(c, e, x, y + bob, 1 + e.squash * 0.28, 1 - e.squash * 0.2);
            // 돌진 충전 링
            const cr = PR + 5; if (e.cd > 0) { c.strokeStyle = "#ffffff66"; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y + bob, cr, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - e.cd / e.cdMax)); c.stroke(); }
            else { c.strokeStyle = e.light; c.globalAlpha = 0.55 + 0.35 * Math.sin(T * 8); c.lineWidth = 2; c.beginPath(); c.arc(x, y + bob, cr, 0, TAU); c.stroke(); c.globalAlpha = 1; }
            // 이름
            c.save(); c.translate(x, y + bob + PR + 13); c.scale(1, -1); c.font = "bold 13px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.lineWidth = 3.5; c.strokeStyle = "#000"; c.lineJoin = "round"; c.strokeText(e.p.nick, 0, 0); c.fillStyle = "#fff"; c.fillText(e.p.nick, 0, 0); c.restore();
          }
        },
      };
      ctx.create("bumperView").addComponent(new BumperView(inst));
      return inst;

      // 캐릭터 한 명 그리기 (둥근 몸 + 하이라이트 + 눈)
      function body(c, e, x, y, sx, sy) {
        c.save(); c.translate(x, y); c.scale(sx, sy === undefined ? sx : sy);
        c.fillStyle = e.dark; c.beginPath(); c.arc(0, 0, PR, 0, TAU); c.fill();
        c.fillStyle = e.color; c.beginPath(); c.arc(0, 1.2, PR - 2, 0, TAU); c.fill();
        c.fillStyle = e.light; c.globalAlpha *= 0.55; c.beginPath(); c.arc(-PR * 0.3, PR * 0.35, PR * 0.42, 0, TAU); c.fill(); c.globalAlpha /= 0.55;
        const ex = e.hx * PR * 0.28, ey = e.hy * PR * 0.28; c.fillStyle = "#fff"; c.beginPath(); c.arc(ex - PR * 0.3, ey + PR * 0.12, PR * 0.26, 0, TAU); c.arc(ex + PR * 0.3, ey + PR * 0.12, PR * 0.26, 0, TAU); c.fill();
        c.fillStyle = "#111"; c.beginPath(); c.arc(ex - PR * 0.3 + e.hx * PR * 0.1, ey + PR * 0.12 + e.hy * PR * 0.1, PR * 0.12, 0, TAU); c.arc(ex + PR * 0.3 + e.hx * PR * 0.1, ey + PR * 0.12 + e.hy * PR * 0.1, PR * 0.12, 0, TAU); c.fill();
        c.restore();
      }
    },
  });

})();
