// 탑 오르기 (플랫포머) — 용암이 차오른다! 발판을 밟고 올라 꼭대기 깃발에 먼저 닿자.
// 규칙: 스틱 = 이동, A = 점프(오래 누르면 높게), B = 밀치기(앞의 라이벌을 날려 보냄, 쿨타임). 용암에 닿으면 탈락(그 높이가 기록).
//       첫 도착자가 나오면 6초 뒤 끝난다. 순위 = 도착 순서 → 나머지는 도달한 최고 높이. 아래로 떨어지는 건 괜찮지만 용암이 따라온다.
// 발판: 모두 "한쪽 통과" (아래에서 뛰어 올라 통과, 아래+점프로 내려옴) / 이동 발판 / 부서지는 발판(밟고 있으면 0.45초 뒤 무너지고 3초 뒤 복구) / 얼음(미끄러움) / 스프링(높이 튐).
// 물리: 엔진 World2D(planck) + PlatformerController. 탑은 climb_gen.js 가 시드로 만들고 도달 가능성을 검증한다.
// 그림: 전부 오버레이(hud.g)에 직접 그린다 — 월드 → 화면(1920x1080): sx = 960 + (x-camX)*k, sy = 540 - (y-camY)*k, k = 1080/viewH.
(function () {
  const G = ClimbGen, VW = 1920, VH = 1080;
  const CFG = window.ClimbCfg = {
    duration: 90, height: 2000,
    lava0: -260, lavaV0: 14, lavaAcc: 0.45,          // 용암 높이(t) = lava0 + v0*t + acc/2*t^2 (t: 시작 뒤 초)
    run: 175, jump: 430, spring: 660,
    shoveCd: 1.1, shoveRange: 46, shoveKnock: [300, 250], shoveStun: 0.3,
    crumbleWait: 0.45, crumbleGone: 3.0, finishGrace: 6,
    viewMin: 360, viewMax: 560, tag: 22,
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = (c, k) => { const n = parseInt(c.slice(1), 16), f = v => clamp(Math.round(v * k), 0, 255); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
  const mix = (a, b, t) => { const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)], pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)]; return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], t))).join(",")})`; };
  const KIND_COLOR = { normal: ["#7be07b", "#9a6b43"], ice: ["#e3f8ff", "#7fcdf0"], crumble: ["#e8cf96", "#b08a52"], move: ["#9aa8ff", "#5568d8"], spring: ["#7be07b", "#9a6b43"], flag: ["#ffe27a", "#e0a82e"], ground: ["#6fd36f", "#7a5233"] };

  class Climb {
    constructor(ctx) {
      this.ctx = ctx; this.rng = ctx.rng; this.t = 0; this.started = false; this.ended = false; this.finishAt = -1; this.order = []; this.bots = {}; this.shake = 0;
      this.tower = G.generate(ctx.rng, { height: CFG.height }); this.nodes = this.tower.nodes; this.flag = this.tower.flag; this.H = this.tower.height;
      this.world = World2D.create(ctx.App, { mode: "platformer", gravity: 1400 }); this.world.layer("Ground"); this.world.layer("Player");
      this.bodyNode = new Map();
      this._buildTower(); this._buildPlayers();
      const n = 320; this.pt = { n, i: 0, x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), life: new Float32Array(n), max: new Float32Array(n), size: new Float32Array(n), col: new Array(n).fill("#fff"), grav: new Float32Array(n) };
      // 배경 별/구름 (시드 고정)
      this.stars = Array.from({ length: 70 }, () => ({ x: ctx.rng(), y: ctx.rng(), s: ctx.rng.range(1.5, 4), a: ctx.rng.range(0.3, 1) }));
      this.clouds = Array.from({ length: 14 }, () => ({ x: ctx.rng(), y: ctx.rng(), w: ctx.rng.range(120, 300), a: ctx.rng.range(0.12, 0.3) }));
      this.cam = { x: 0, y: 130, h: CFG.viewMin }; this.camSnap();
      if (/[?&]dev\b/.test(location.search)) window.__climb = this;
    }
    // ---------- 만들기 ----------
    _buildTower() {
      const c = this.ctx, T = G.P.thick, half = G.P.W / 2;
      for (const n of this.nodes) {
        const go = c.create("plat"), ground = n.kind === "ground", h = ground ? 28 : T;
        go.transform.setPosition(n.x, n.y - h / 2); n.go = go; n.h = h; n.cx = n.x; n.state = "idle"; n.st = 0; n.pad = 0;
        n.body = go.addComponent(new Body2D({ type: n.kind === "move" ? "kinematic" : "static", shape: "box", w: n.w, h, friction: 0.8, oneWay: !ground, category: "Ground", mask: "all", drive: "transform" }));
        this.bodyNode.set(n.body, n);
      }
      for (const s of [-1, 1]) { const go = c.create("wall"); go.transform.setPosition(s * (half + 10), this.H / 2); go.addComponent(new Body2D({ type: "static", shape: "box", w: 20, h: this.H + 900, friction: 0, category: "Ground", mask: "all" })); }
    }
    _buildPlayers() {
      const c = this.ctx, n = c.players.length; this.P = [];
      const order = this.rng.shuffle(c.players.map((_, i) => i));
      c.players.forEach((cp, i) => {
        const slot = order[i], x = n === 1 ? 0 : lerp(-210, 210, slot / (n - 1)), y = 18;
        const go = c.create("pl_" + cp.id); go.transform.setPosition(x, y);
        const body = go.addComponent(new Body2D({ type: "dynamic", shape: "capsule", w: 20, h: 34, density: 1, friction: 0, fixedRotation: true, category: "Player", mask: "Ground" }));
        const pc = go.addComponent(new PlatformerController({ runSpeed: CFG.run, jumpSpeed: CFG.jump, wallJump: null, mask: "Ground" }));
        const p = { id: cp.id, cp, go, body, pc, alive: true, finished: false, best: 0, x, y, vx: 0, vy: 0, face: 1, shoveCd: 0, swing: 0, stun: 0, flash: 0, sqy: 1, sprCd: 0, deadAt: -1, finishAt: -1, walk: 0, grounded: false, lastGround: null, air: 0 };
        pc.onJump = () => { c.sfx.play("jump"); this.puff(p.x, p.y - 15, "#fff", 4, 40); p.sqy = 1.28; };
        pc.onLand = v => { if (v < -160) { this.puff(p.x, p.y - 16, "#ffffffcc", 5 + Math.min(6, -v / 120 | 0), 55); p.sqy = clamp(1 + v / 1100, 0.62, 1); } };
        this.P.push(p);
      });
    }
    // ---------- 진행 ----------
    start() { this.started = true; this.t = 0; }
    lavaY(t) { return CFG.lava0 + CFG.lavaV0 * t + 0.5 * CFG.lavaAcc * t * t; }
    get lava() { return this.lavaY(this.t); }
    readInput(p) {
      const bot = this.bots[p.id]; if (bot) return bot(p, this);
      const i = this.ctx.input(p.id); return { mx: i.mx, jump: i.held("a"), down: i.my < -0.6, shove: i.pressed("b") };
    }
    update(dt) {
      if (this.ended) return;
      this.t += dt; const t = this.t, S = this.pt, lavaY = this.lava;
      // 이동 발판 / 부서지는 발판
      for (const n of this.nodes) {
        if (n.kind === "move") { n.cx = n.x + n.r * Math.sin(6.2832 * t / n.period + n.phase); n.go.transform.setPosition(n.cx, n.y - n.h / 2); }
        else if (n.kind === "crumble") this._crumble(n, dt);
        if (n.pad > 0) n.pad = Math.max(0, n.pad - dt);
      }
      let first = null;
      for (const p of this.P) {
        if (!p.alive) continue;
        const pos = p.go.transform.position, pc = p.pc; p.x = pos.x; p.y = pos.y; p.vx = p.body.vx; p.vy = p.body.vy; p.grounded = pc.grounded; p.face = pc.facing;
        if (p.finished) { pc.setInput(0, false, false); } else {
          const inp = this.readInput(p); p.stun -= dt; p.shoveCd -= dt; p.swing -= dt; p.sprCd -= dt; p.flash -= dt;
          pc.setInput(p.stun > 0 ? 0 : clamp(inp.mx, -1, 1), inp.jump, inp.down);
          if (inp.shove && p.shoveCd <= 0 && p.stun <= 0) this._shove(p);
          // 발 밑 발판: 얼음 / 스프링 / 부서지는 발판
          const gn = pc.grounded ? this.bodyNode.get(pc.groundBody) : null; p.lastGround = gn || p.lastGround;
          if (gn && gn.kind === "ice") { pc.accel = 520; pc.decel = 150; } else { pc.accel = 1700; pc.decel = 2300; }
          if (gn && gn.kind === "spring" && p.sprCd <= 0 && Math.abs(p.x - (gn.cx + gn.springOff)) < 18 && p.vy < 40) {
            p.body.setVelocity(p.vx, CFG.spring); p.sprCd = 0.3; gn.pad = 0.3; p.sqy = 1.4; this.ctx.sfx.play("coin"); this.puff(gn.cx + gn.springOff, gn.y + 4, "#ff8a80", 8, 70);
          }
          if (gn && gn.kind === "crumble" && gn.state === "idle") { gn.state = "shake"; gn.st = CFG.crumbleWait; }
          p.best = Math.max(p.best, p.y - 17);
          // 깃발 도착
          if (pc.grounded && gn === this.flag) this._finish(p);
          // 용암
          if (p.y < lavaY + 2) this._burn(p);
        }
        // 그림 상태(찌그러짐 복원)
        p.sqy = lerp(p.sqy, 1 + clamp(Math.abs(p.vy) / 1300, 0, 0.2) * (p.grounded ? 0 : 1), 1 - Math.exp(-14 * dt)); p.walk += Math.abs(p.vx) * dt * 0.09;
        if (!first || p.best > first.best) first = p;
      }
      this.leader = first;
      // 파티클
      for (let k = 0; k < S.n; k++) { if (S.life[k] <= 0) continue; S.life[k] -= dt; S.vy[k] -= S.grav[k] * dt; S.x[k] += S.vx[k] * dt; S.y[k] += S.vy[k] * dt; }
      this.lavaEmbers(dt); this.shake = Math.max(0, this.shake - dt * 3);
      this.updateCam(dt);
      // 끝 조건
      const alive = this.P.filter(p => p.alive && !p.finished);
      if (this.finishAt >= 0 && t >= this.finishAt) this._end();
      else if (!alive.length) this._end();
    }
    _crumble(n, dt) {
      if (n.state === "shake") { n.st -= dt; if (n.st <= 0) { n.state = "gone"; n.st = CFG.crumbleGone; n.body.enabled = false; this.puff(n.cx, n.y - 6, "#d9b878", 10, 60); this.ctx.sfx.play("tick"); } }
      else if (n.state === "gone") { n.st -= dt; if (n.st <= 0) { n.state = "idle"; n.body.enabled = true; } }
    }
    _shove(p) {
      const dir = p.face || 1, hit = []; p.shoveCd = CFG.shoveCd; p.swing = 0.22;
      for (const q of this.P) {
        if (q === p || !q.alive || q.finished) continue;
        const dx = (q.x - p.x) * dir, dy = q.y - p.y;
        if ((dx > -8 && dx < CFG.shoveRange && Math.abs(dy) < 30) || Math.hypot(q.x - p.x, dy) < 24) hit.push(q);
      }
      for (const q of hit) {
        const d = q.x === p.x ? dir : Math.sign(q.x - p.x) || dir;
        q.body.setVelocity(d * CFG.shoveKnock[0], CFG.shoveKnock[1]); q.stun = CFG.shoveStun; q.pc.lockT = CFG.shoveStun; q.flash = 0.15; q.sqy = 0.8;
        this.puff(q.x, q.y, "#fff", 8, 90); this.puff(q.x, q.y, q.cp.color, 6, 70);
      }
      if (hit.length) { this.ctx.sfx.play("hit"); this.shake = 0.3; p.body.setVelocity(-dir * 60, p.vy); } else this.puff(p.x + dir * 22, p.y, "#ffffffaa", 3, 30);
    }
    _burn(p) {
      p.alive = false; p.deadAt = this.t; this.puff(p.x, p.y, "#ff9100", 18, 110); this.puff(p.x, p.y, "#ffee58", 10, 80); this.ctx.sfx.play("lose"); this.shake = 0.5;
      try { p.go.destroy(); } catch (e) {}
    }
    _finish(p) {
      p.finished = true; p.finishAt = this.t; this.order.push(p.id); this.ctx.sfx.play("fanfare");
      for (let i = 0; i < 24; i++) this.puff(p.x, p.y + 10, ["#ff5252", "#ffee58", "#69f0ae", "#40c4ff", "#e040fb"][i % 5], 1, 160);
      if (this.finishAt < 0) { this.finishAt = this.t + CFG.finishGrace; this.firstFinisher = p; }
    }
    rank() { // [id | [id,..]] 좋은 순: 도착 순서 → 나머지는 최고 높이 (같으면 공동)
      const done = this.order.slice(), rest = this.P.filter(p => !this.order.includes(p.id)).sort((a, b) => b.best - a.best), out = done.map(id => id);
      for (let i = 0; i < rest.length;) { let j = i + 1; while (j < rest.length && Math.abs(rest[j].best - rest[i].best) < 0.5) j++; out.push(j - i > 1 ? rest.slice(i, j).map(p => p.id) : rest[i].id); i = j; }
      return out;
    }
    _end() { if (this.ended) return; this.ended = true; this.ctx.end({ ranking: this.rank() }); }
    onTimeUp() { this._end(); }
    getResult() { return { ranking: this.rank() }; }
    onPlayerLeave(id) { const p = this.P.find(q => q.id === id); if (p && p.alive && !p.finished) { /* 연결이 끊겨도 캐릭터는 그대로 (입력만 0) */ } }
    dispose() { try { this.world.destroy(); } catch (e) {} if (window.__climb === this) window.__climb = null; }
    // ---------- 카메라 ----------
    camSnap() { this.updateCam(1); }
    updateCam(dt) {
      const al = this.P.filter(p => p.alive), cam = this.cam; let top = cam.y + cam.h / 2, bot = cam.y - cam.h / 2;
      if (al.length) {
        let lead = -1e9; for (const p of al) lead = Math.max(lead, p.y);
        let lo = 1e9; for (const p of al) if (p.y > lead - 380) lo = Math.min(lo, p.y);
        top = lead + 140; bot = lo - 90;
      }
      const h = clamp(top - bot, CFG.viewMin, CFG.viewMax); let y = (top + bot) / 2; if (top - bot > CFG.viewMax) y = top - h / 2; // 너무 벌어지면 선두 쪽을 본다
      y = Math.max(y, h / 2 - 90);
      const a = dt >= 1 ? 1 : 1 - Math.exp(-5 * dt), b = dt >= 1 ? 1 : 1 - Math.exp(-2.5 * dt);
      cam.y = lerp(cam.y, y, a); cam.h = lerp(cam.h, h, b);
    }
    // ---------- 파티클 ----------
    puff(x, y, col, n, speed) {
      const S = this.pt;
      for (let k = 0; k < n; k++) {
        const i = S.i, a = this.rng() * 6.283, sp = speed * (0.3 + this.rng() * 0.7); S.i = (S.i + 1) % S.n;
        S.x[i] = x; S.y[i] = y; S.vx[i] = Math.cos(a) * sp; S.vy[i] = Math.sin(a) * sp * 0.8 + speed * 0.2; S.life[i] = S.max[i] = 0.35 + this.rng() * 0.3; S.size[i] = 1.5 + this.rng() * 2.5; S.col[i] = col; S.grav[i] = 260;
      }
    }
    lavaEmbers(dt) {
      this._em = (this._em || 0) - dt; if (this._em > 0) return; this._em = 0.06;
      const S = this.pt, i = S.i; S.i = (S.i + 1) % S.n; const x = (this.rng() * 2 - 1) * 300 + this.cam.x;
      S.x[i] = x; S.y[i] = this.lava + 2; S.vx[i] = (this.rng() - 0.5) * 30; S.vy[i] = 50 + this.rng() * 70; S.life[i] = S.max[i] = 0.8 + this.rng() * 0.8; S.size[i] = 1.5 + this.rng() * 2; S.col[i] = this.rng() < 0.5 ? "#ffb300" : "#ff6e40"; S.grav[i] = -10;
    }
    // ---------- 그리기 ----------
    render(h) {
      const g = h.g, c = this.cam, k = VH / c.h, lavaY = this.lava, t = this.t, W = VW / k; // W: 화면 가로 월드 폭
      const sh = this.shake > 0 ? (this.rng() - 0.5) * this.shake * 14 : 0;
      g.save(); g.translate(sh, sh * 0.6);
      this._sky(g, c, k);
      g.save(); g.translate(VW / 2, VH / 2); g.scale(k, -k); g.translate(-c.x, -c.y);
      const x0 = c.x - W / 2 - 20, x1 = c.x + W / 2 + 20, y0 = c.y - c.h / 2 - 40, y1 = c.y + c.h / 2 + 40;
      this._tower(g, x0, x1, y0, y1);
      this._platforms(g, y0, y1);
      this._flag(g, t);
      this._lava(g, x0, x1, y0, lavaY, t);
      this._particles(g, y0, y1);
      g.restore();
      for (const p of this.P) if (p.alive) this._player(g, p, k);
      this._lavaGlow(g);
      g.restore();
      this._hud(h, k, W);
    }
    _sky(g, c, k) {
      const f = clamp(c.y / this.H, 0, 1), top = mix("#2b1559", "#79d8ff", f * f), mid = mix("#7a2f8f", "#d4f3ff", f), bot = mix("#d9548e", "#fff4d0", f);
      const gr = g.createLinearGradient(0, 0, 0, VH); gr.addColorStop(0, top); gr.addColorStop(0.55, mid); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(-60, -60, VW + 120, VH + 120);
      g.fillStyle = "#fff"; const sa = clamp(1 - f * 1.6, 0, 1);
      if (sa > 0) for (const s of this.stars) { g.globalAlpha = s.a * sa * (0.6 + 0.4 * Math.sin(this.t * 2 + s.x * 40)); const sy = (((s.y * 1.4 * VH - c.y * k * 0.12) % VH) + VH) % VH; g.fillRect(s.x * VW, sy, s.s * 1.6, s.s * 1.6); }
      g.globalAlpha = 1;
      for (const cl of this.clouds) { const sy = (((cl.y * 1.6 * VH - c.y * k * 0.35) % (VH * 1.4)) + VH * 1.4) % (VH * 1.4) - 150, sx = ((cl.x * (VW + 400) + this.t * 6 * (cl.w / 200)) % (VW + 400)) - 200; g.globalAlpha = cl.a * (0.4 + 0.6 * f); g.fillStyle = "#fff"; g.beginPath(); g.ellipse(sx, sy, cl.w, cl.w * 0.22, 0, 0, 7); g.ellipse(sx + cl.w * 0.35, sy - cl.w * 0.1, cl.w * 0.55, cl.w * 0.2, 0, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }
    _tower(g, x0, x1, y0, y1) { // 탑 뒷벽 + 양옆 돌벽
      const half = G.P.W / 2;
      g.fillStyle = "#1d1233cc"; g.fillRect(-half, y0, G.P.W, y1 - y0);
      g.strokeStyle = "#ffffff12"; g.lineWidth = 1; g.beginPath();
      for (let y = Math.floor(y0 / 40) * 40; y < y1; y += 40) { g.moveTo(-half, y); g.lineTo(half, y); }
      for (let y = Math.floor(y0 / 40) * 40, r = 0; y < y1; y += 40, r++) for (let x = -half + ((y / 40) & 1) * 40; x < half; x += 80) { g.moveTo(x, y); g.lineTo(x, y + 40); }
      g.stroke();
      for (const s of [-1, 1]) { // 돌 기둥
        const xa = s < 0 ? x0 : half, xb = s < 0 ? -half : x1;
        g.fillStyle = "#3a2b52"; g.fillRect(xa, y0, xb - xa, y1 - y0); g.fillStyle = "#4b3a6b"; g.fillRect(s < 0 ? -half - 8 : half, y0, 8, y1 - y0);
        g.strokeStyle = "#2a1d3d"; g.lineWidth = 1.5; g.beginPath(); for (let y = Math.floor(y0 / 48) * 48; y < y1; y += 48) { g.moveTo(xa, y); g.lineTo(xb, y); } g.stroke();
      }
    }
    _platforms(g, y0, y1) {
      for (const n of this.nodes) {
        if (n.y + 20 < y0 || n.y - 40 > y1) continue;
        if (n.kind === "crumble" && n.state === "gone") { // 사라진 자리: 희미한 윤곽
          g.globalAlpha = 0.18; g.strokeStyle = "#e8cf96"; g.setLineDash([6, 6]); g.lineWidth = 2; g.strokeRect(n.cx - n.w / 2, n.y - n.h, n.w, n.h); g.setLineDash([]); g.globalAlpha = 1; continue;
        }
        const [top, side] = KIND_COLOR[n.kind] || KIND_COLOR.normal, x = n.cx - n.w / 2, w = n.w, hh = n.h, ytop = n.y; let jx = 0;
        if (n.kind === "crumble" && n.state === "shake") jx = Math.sin(this.t * 70) * 1.6;
        g.save(); g.translate(jx, 0);
        if (n.kind === "ground") { g.fillStyle = side; g.fillRect(x - 40, ytop - 2000, w + 80, 2000); g.fillStyle = top; g.fillRect(x, ytop - 10, w, 10); g.fillStyle = "#58b858"; g.fillRect(x, ytop - 4, w, 4); g.restore(); continue; }
        g.fillStyle = "#0004"; g.fillRect(x + 2, ytop - hh - 2, w, hh);
        g.fillStyle = side; this._rr(g, x, ytop - hh, w, hh, 4); g.fill();
        g.fillStyle = top; this._rr(g, x, ytop - 5, w, 5, 2.5); g.fill();
        g.strokeStyle = "#1c1230"; g.lineWidth = 1.6; this._rr(g, x, ytop - hh, w, hh, 4); g.stroke();
        if (n.kind === "ice") { g.strokeStyle = "#ffffffcc"; g.lineWidth = 1.2; g.beginPath(); for (let i = 0; i < 3; i++) { const xx = x + w * (0.2 + 0.3 * i); g.moveTo(xx, ytop - 8); g.lineTo(xx + 8, ytop - 3); } g.stroke(); }
        else if (n.kind === "crumble") { g.strokeStyle = "#7a5a2a"; g.lineWidth = 1.3; g.beginPath(); for (let i = 1; i < 4; i++) { const xx = x + w * i / 4; g.moveTo(xx, ytop - hh); g.lineTo(xx - 3, ytop - hh * 0.55); g.lineTo(xx + 3, ytop - 1); } g.stroke(); }
        else if (n.kind === "move") { g.fillStyle = "#e8ecff"; for (let i = 0; i < Math.floor(w / 26); i++) { const xx = x + 14 + i * 26; g.beginPath(); g.moveTo(xx, ytop - 3); g.lineTo(xx + 6, ytop - 6); g.lineTo(xx, ytop - 9); g.closePath(); g.fill(); } }
        else if (n.kind === "spring") { const px = n.cx + n.springOff, comp = n.pad > 0 ? 1 - n.pad / 0.3 : 1, hgt = 6 + 10 * (n.pad > 0 ? 0.4 + 0.6 * comp : 1); g.fillStyle = "#ff5252"; this._rr(g, px - 15, ytop, 30, 4, 2); g.fill(); g.strokeStyle = "#c62828"; g.lineWidth = 2; g.beginPath(); g.moveTo(px - 9, ytop + 4); g.lineTo(px + 9, ytop + 4 + hgt * 0.33); g.lineTo(px - 9, ytop + 4 + hgt * 0.66); g.lineTo(px + 9, ytop + 4 + hgt); g.stroke(); g.fillStyle = "#ff8a80"; this._rr(g, px - 17, ytop + 4 + hgt, 34, 4, 2); g.fill(); }
        g.restore();
      }
    }
    _rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); }
    _flag(g, t) {
      const f = this.flag, x = f.cx, y = f.y; if (y + 120 < this.cam.y - this.cam.h / 2 - 40) return;
      g.fillStyle = "#f5f0ff"; g.fillRect(x - 2, y, 4, 78); g.fillStyle = "#ffd54f"; g.beginPath(); g.arc(x, y + 80, 5, 0, 7); g.fill();
      g.fillStyle = "#ff5252"; g.beginPath(); g.moveTo(x + 2, y + 74);
      for (let i = 0; i <= 10; i++) g.lineTo(x + 2 + i * 5, y + 74 - 2 + Math.sin(t * 6 + i * 0.7) * 3);
      for (let i = 10; i >= 0; i--) g.lineTo(x + 2 + i * 5, y + 54 + Math.sin(t * 6 + i * 0.7) * 3);
      g.closePath(); g.fill(); g.fillStyle = "#fff"; for (let i = 0; i < 5; i++) g.fillRect(x + 4 + i * 10, y + 64 + (i & 1) * 0 + Math.sin(t * 6 + i * 1.4) * 2, 5, 5);
    }
    _lava(g, x0, x1, y0, lavaY, t) {
      if (lavaY < y0 - 30) return; const top = lavaY, bot = Math.min(y0 - 20, top - 400);
      const gr = g.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, "#ffd54f"); gr.addColorStop(0.12, "#ff8f00"); gr.addColorStop(0.5, "#e53935"); gr.addColorStop(1, "#7f1d1d");
      g.fillStyle = gr; g.beginPath(); g.moveTo(x0, bot);
      for (let x = x0; x <= x1; x += 14) g.lineTo(x, top + Math.sin(x * 0.045 + t * 3) * 3.2 + Math.sin(x * 0.11 - t * 2.1) * 1.6);
      g.lineTo(x1, bot); g.closePath(); g.fill();
      g.strokeStyle = "#fff3a0"; g.lineWidth = 2; g.beginPath(); for (let x = x0; x <= x1; x += 14) { const y = top + Math.sin(x * 0.045 + t * 3) * 3.2 + Math.sin(x * 0.11 - t * 2.1) * 1.6 + 1; x === x0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
      const gl = g.createLinearGradient(0, top, 0, top + 60); gl.addColorStop(0, "#ff6d0055"); gl.addColorStop(1, "#ff6d0000"); g.fillStyle = gl; g.fillRect(x0, top, x1 - x0, 60);
    }
    _particles(g, y0, y1) {
      const S = this.pt;
      for (let i = 0; i < S.n; i++) { if (S.life[i] <= 0) continue; const y = S.y[i]; if (y < y0 || y > y1) continue; g.globalAlpha = clamp(S.life[i] / S.max[i], 0, 1); g.fillStyle = S.col[i]; const s = S.size[i]; g.fillRect(S.x[i] - s / 2, y - s / 2, s, s); }
      g.globalAlpha = 1;
    }
    _lavaGlow(g) { // 용암이 가까우면 화면 아래가 붉게
      const lowest = this.P.reduce((m, p) => (p.alive ? Math.min(m, p.y) : m), 1e9), d = lowest - this.lava; if (!(d < 160)) return;
      const a = clamp(1 - d / 160, 0, 1) * (0.25 + 0.15 * Math.sin(this.t * 8)), gr = g.createLinearGradient(0, VH, 0, VH - 260); gr.addColorStop(0, `rgba(255,60,20,${a})`); gr.addColorStop(1, "rgba(255,60,20,0)"); g.fillStyle = gr; g.fillRect(0, VH - 260, VW, 260);
    }
    _player(g, p, k) {
      const c = this.cam, sx = VW / 2 + (p.x - c.x) * k, sy = VH / 2 - (p.y - c.y) * k;
      if (sy < -120 || sy > VH + 120) return;
      const col = p.cp.color, S = k * (p.finished ? 1.05 : 1), sqy = p.sqy, sqx = 1 / sqy, hw = 10 * S * sqx, hh = 17 * S * sqy, face = p.face || 1;
      g.save(); g.translate(sx, sy + (17 * S - hh));
      g.fillStyle = "#0003"; g.beginPath(); g.ellipse(0, hh + 2, hw * 0.9, hw * 0.28, 0, 0, 7); g.fill();
      if (p.swing > 0) { g.strokeStyle = "#ffffffcc"; g.lineWidth = 6 * S / 3; g.beginPath(); g.arc(face * hw * 0.6, 0, hw * 2.1, face > 0 ? -0.9 : Math.PI - 0.9 + 1.8 - 1.8, face > 0 ? 0.9 : Math.PI + 0.9); g.stroke(); }
      const bodyCol = p.flash > 0 ? "#ffffff" : col;
      g.fillStyle = bodyCol; g.strokeStyle = "#1c1230"; g.lineWidth = Math.max(2.4, 2 * S / 1.5);
      this._rr(g, -hw, -hh, hw * 2, hh * 2, hw); g.fill(); g.stroke();
      g.fillStyle = "#ffffff44"; this._rr(g, -hw * 0.55, -hh * 0.78, hw * 0.45, hh * 0.9, hw * 0.22); g.fill();
      const ex = hw * 0.34, ey = -hh * 0.35, er = hw * 0.34; g.fillStyle = "#fff"; g.beginPath(); g.ellipse(-ex + face * hw * 0.12, ey, er, er * 1.25, 0, 0, 7); g.ellipse(ex + face * hw * 0.12, ey, er, er * 1.25, 0, 0, 7); g.fill();
      const look = clamp(p.vx / 180, -1, 1) * er * 0.45 + face * er * 0.2; g.fillStyle = "#1c1230"; g.beginPath(); g.arc(-ex + face * hw * 0.12 + look, ey + er * 0.1, er * 0.5, 0, 7); g.arc(ex + face * hw * 0.12 + look, ey + er * 0.1, er * 0.5, 0, 7); g.fill();
      if (p.stun > 0) { g.strokeStyle = "#fff176"; g.lineWidth = 3; for (let i = 0; i < 3; i++) { const a = this.t * 9 + i * 2.1; g.beginPath(); g.arc(Math.cos(a) * hw * 1.1, -hh - 10 + Math.sin(a) * 6, 3.5, 0, 7); g.stroke(); } }
      if (p.finished) { g.fillStyle = "#ffeb3b"; g.beginPath(); g.moveTo(-hw * 0.8, -hh - 2); g.lineTo(-hw * 0.8, -hh - hw * 0.9); g.lineTo(-hw * 0.4, -hh - hw * 0.5); g.lineTo(0, -hh - hw * 1.0); g.lineTo(hw * 0.4, -hh - hw * 0.5); g.lineTo(hw * 0.8, -hh - hw * 0.9); g.lineTo(hw * 0.8, -hh - 2); g.closePath(); g.fill(); g.strokeStyle = "#1c1230"; g.lineWidth = 2; g.stroke(); }
      else if (p === this.leader && this.P.length > 1 && !this.ended && p.best > 60) { g.fillStyle = "#ffd54f"; g.beginPath(); g.moveTo(-hw * 0.7, -hh - 4); g.lineTo(-hw * 0.7, -hh - hw * 0.8); g.lineTo(-hw * 0.3, -hh - hw * 0.4); g.lineTo(0, -hh - hw * 0.9); g.lineTo(hw * 0.3, -hh - hw * 0.4); g.lineTo(hw * 0.7, -hh - hw * 0.8); g.lineTo(hw * 0.7, -hh - 4); g.closePath(); g.fill(); g.strokeStyle = "#1c1230"; g.lineWidth = 2; g.stroke(); }
      g.restore();
      // 닉네임 + 밀치기 쿨타임
      const ty = sy - hh - 26 * (k / 3), size = Math.round(CFG.tag * clamp(k / 2.6, 0.9, 1.25) * 1.5);
      this.ctx.hud.text(p.cp.nick, sx, ty - ((p === this.leader && p.best > 60 && this.P.length > 1 && !this.ended) || p.finished ? 28 : 0), { size, align: "center", color: "#fff", strokeW: 6 });
      if (p.shoveCd > 0) { const w = 54, r = 1 - p.shoveCd / CFG.shoveCd; this.ctx.hud.rect(sx - w / 2, ty + 12, w, 6, "#0008", 3); this.ctx.hud.rect(sx - w / 2, ty + 12, w * r, 6, "#fff", 3); }
    }
    _hud(h, k, W) {
      const c = this.cam;
      // 높이 순위 (왼쪽)
      const list = this.P.slice().sort((a, b) => (this.order.includes(b.id) - this.order.includes(a.id)) || (b.best - a.best));
      list.forEach((p, i) => { const y = 120 + i * 58, m = Math.max(0, Math.round(p.best / 10)); h.g.globalAlpha = p.alive || p.finished ? 1 : 0.5; h.circle(46, y, 17, "#1c1230"); h.circle(46, y, 14, p.cp.color); h.text(`${p.cp.nick}  ${p.finished ? "🚩" : p.alive ? m + "m" : "💀 " + m + "m"}`, 76, y, { size: 36, align: "left", color: "#fff", strokeW: 6 }); h.g.globalAlpha = 1; });
      // 높이 눈금 (오른쪽): 용암(빨강) ~ 깃발(위), 플레이어 점
      const x = VW - 50, y0 = 960, y1 = 150, f = v => lerp(y0, y1, clamp((v - CFG.lava0) / (this.H - CFG.lava0), 0, 1));
      h.rect(x - 5, y1, 10, y0 - y1, "#0007", 5); const ly = f(this.lava); h.rect(x - 5, ly, 10, y0 - ly, "#ff6e40", 5); h.text("🚩", x, y1 - 24, { size: 40, align: "center" });
      for (const p of this.P) { const yy = f(p.alive || p.finished ? p.y : p.best); h.g.globalAlpha = p.alive ? 1 : 0.4; h.circle(x, yy, 13, "#1c1230"); h.circle(x, yy, 10, p.cp.color); }
      h.g.globalAlpha = 1;
      // 화면 밖 플레이어 화살표
      for (const p of this.P) {
        if (!p.alive) continue; const sy = VH / 2 - (p.y - c.y) * k; if (sy > 40 && sy < VH - 40) continue;
        const up = sy < 40, sx = clamp(VW / 2 + (p.x - c.x) * k, 90, VW - 140), yy = up ? 70 : VH - 70;
        h.g.save(); h.g.translate(sx, yy); h.g.fillStyle = p.cp.color; h.g.strokeStyle = "#1c1230"; h.g.lineWidth = 4; h.g.beginPath(); h.g.moveTo(0, up ? -26 : 26); h.g.lineTo(-24, up ? 12 : -12); h.g.lineTo(24, up ? 12 : -12); h.g.closePath(); h.g.fill(); h.g.stroke(); h.g.restore();
        h.text(p.cp.nick, sx, yy + (up ? 50 : -50), { size: 28, align: "center", strokeW: 5 });
      }
      // 첫 도착 안내
      if (this.firstFinisher && !this.ended) { const left = Math.max(0, Math.ceil(this.finishAt - this.t)); h.text(`🚩 ${this.firstFinisher.cp.nick} 도착!  ${left}`, VW / 2, 190, { size: 64, align: "center", color: "#ffeb3b", strokeW: 10 }); }
    }
  }

  PartyGames.register({
    id: "climb", name: "탑 오르기", rule: "용암이 차오른다! 꼭대기 깃발까지 올라가세요", view: "platformer", players: [2, 8], duration: CFG.duration, scoring: "rank", points: [3, 2, 1],
    controls: { stick: true, aim: false, buttons: [{ id: "a", label: "점프" }, { id: "b", label: "밀치기" }] },
    create(ctx) { return new Climb(ctx); },
  });
})();
