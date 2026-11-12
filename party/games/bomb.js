// 폭탄 돌리기 (탑뷰) — 폭탄을 들고 있으면 터진다! 다른 사람에게 부딪쳐서 폭탄을 넘기자. 마지막까지 살아남으면 승리.
// 물리: 엔진 World2D(planck) — 플레이어(동적 원), 벽(킨메틱, 라운드마다 안쪽으로 이동), 기둥(정적). 그림은 전부 오버레이(hud.g)에 직접 그린다
// (월드 640x360 → 오버레이 1920x1080 은 정확히 3배: sx = 960 + x*3, sy = 540 - y*3).
// 규칙: 스틱 = 이동, A = 돌진(쿨다운). 폭탄을 든 사람은 조금 더 빠르다. 폭탄 든 사람과 몸이 닿으면 폭탄이 넘어간다
//       (넘긴 사람은 0.6초 동안 다시 받지 않고, 받은 사람은 0.35초 동안 바로 넘기지 못한다). 폭탄은 8~15초 뒤 터져 든 사람이 탈락하고 폭풍이 주변을 날려 보낸다.
//       라운드(폭발)마다 벽이 좁혀진다. 2라운드마다 변수: 얼음 바닥 / 폭탄 2개. 순위 = 탈락 순서의 역순 (같이 터진 사람은 공동).
(function () {
  const CFG = window.BombCfg = {
    fuseMin: 8, fuseMax: 15, minFuse: 3.5, totalTarget: 62,   // 퓨즈(초). totalTarget: 모두가 한 번씩 터질 때 걸리는 총 시간의 목표 → 사람이 많으면 퓨즈를 줄인다
    duration: 90,
    radius: 9, speed: 112, boost: 1.12, accel: 1700, friction: 1900,
    dashSpeed: 300, dashTime: 0.14, dashCd: 1.1,
    passImmune: 0.6, passLock: 0.35, rest: 1.4, doneWait: 1.3,
    hw: 250, hh: 140, minScale: 0.62, shrinkStep: 0.07, shrinkSpeed: 34, // 아레나 반폭/반높이, 라운드마다 줄어드는 비율
    blastR: 125, blastMin: 170, blastMax: 420, knock: 0.45,
    iceAccel: 380, iceFriction: 90,
  };
  const S = 3, CX = 960, CY = 540, T = 60, R = CFG.radius, VW = 1920, VH = 1080;
  const sx = x => CX + x * S, sy = y => CY - y * S;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  class Bomb {
    constructor(ctx) {
      this.ctx = ctx; this.rng = ctx.rng; this.t = 0; this.round = 0; this.phase = "wait"; this.phaseT = 0; this.twist = null; this.banner = null;
      this.elim = []; this.shake = 0; this.flashScr = 0; this.waves = []; this.ended = false;
      const n = 260; this.pt = { n, i: 0, x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), life: new Float32Array(n), max: new Float32Array(n), size: new Float32Array(n), col: new Array(n).fill("#fff") };
      this.ar = { hw: CFG.hw, hh: CFG.hh, thw: CFG.hw, thh: CFG.hh };
      this.world = World2D.create(ctx.App, { mode: "topdown" });
      this._buildWalls(); this._buildObstacles(); this._buildPlayers();
    }
    // ---------- 만들기 ----------
    _buildWalls() {
      const c = this.ctx, mk = (w, h) => { const go = c.create("wall"); go.transform.setPosition(0, 0); go.addComponent(new Body2D({ type: "kinematic", shape: "box", w, h, friction: 0, restitution: 0.4 })); return go; };
      this.walls = { t: mk(2 * (CFG.hw + T) + 40, T), b: mk(2 * (CFG.hw + T) + 40, T), l: mk(T, 2 * (CFG.hh + T) + 40), r: mk(T, 2 * (CFG.hh + T) + 40) };
      this._placeWalls();
    }
    _placeWalls() { const a = this.ar, w = this.walls; w.t.transform.setPosition(0, a.hh + T / 2); w.b.transform.setPosition(0, -a.hh - T / 2); w.l.transform.setPosition(-a.hw - T / 2, 0); w.r.transform.setPosition(a.hw + T / 2, 0); }
    _buildObstacles() {
      const c = this.ctx, rng = this.rng, n = c.players.length, slots = [[-95, 45], [95, 45], [-95, -45], [95, -45]]; if (n >= 6) slots.push([0, 0]);
      this.obs = [];
      for (const [bx, by] of slots) {
        const kind = rng.pick(["pillar", "pillar", "block", "wall"]), x = bx + rng.range(-14, 14), y = by + rng.range(-10, 10);
        const o = kind === "pillar" ? { kind, x, y, r: 13 } : kind === "block" ? { kind, x, y, w: 28, h: 28 } : (rng() < 0.5 ? { kind, x, y, w: 54, h: 14 } : { kind, x, y, w: 14, h: 40 });
        const go = c.create("obs"); go.transform.setPosition(x, y);
        go.addComponent(new Body2D(o.kind === "pillar" ? { type: "static", shape: "circle", radius: o.r, friction: 0, restitution: 0.4 } : { type: "static", shape: "box", w: o.w, h: o.h, friction: 0, restitution: 0.4 }));
        this.obs.push(o);
      }
    }
    _clear(x, y, d) { // 기둥·다른 플레이어와 겹치지 않는 자리인가
      for (const o of this.obs) { const hx = o.kind === "pillar" ? o.r : o.w / 2, hy = o.kind === "pillar" ? o.r : o.h / 2; if (Math.abs(x - o.x) < hx + d && Math.abs(y - o.y) < hy + d) return false; }
      for (const p of this.P || []) if (Math.hypot(x - p.sx, y - p.sy) < 34) return false;
      return true;
    }
    _buildPlayers() {
      const c = this.ctx, rng = this.rng; this.P = [];
      for (const cp of c.players) {
        let x = 0, y = 0; for (let k = 0; k < 80; k++) { x = rng.range(-CFG.hw * 0.62 + 20, CFG.hw * 0.62 - 20); y = rng.range(-CFG.hh * 0.62 + 15, CFG.hh * 0.62 - 15); if (this._clear(x, y, R + 6)) break; }
        const go = c.create("pl_" + cp.id); go.transform.setPosition(x, y);
        const body = go.addComponent(new Body2D({ type: "dynamic", shape: "circle", radius: R, density: 1, friction: 0, restitution: 0.32, fixedRotation: true }));
        const tc = go.addComponent(new TopDownController({ maxSpeed: CFG.speed, accel: CFG.accel, friction: CFG.friction, dashSpeed: CFG.dashSpeed, dashTime: CFG.dashTime, dashCooldown: CFG.dashCd }));
        tc.onDash = () => { c.sfx.play("jump"); };
        this.P.push({ id: cp.id, cp, go, body, tc, alive: true, hold: false, fuse: 0, fuseMax: 1, immune: 0, lock: 0, knock: 0, beep: 0, flash: 0, sx: x, sy: y, face: -Math.PI / 2, ghost: 0 });
      }
    }
    // ---------- 진행 ----------
    start() { this.phase = "rest"; this.phaseT = 0.9; }
    _alive() { return this.P.filter(p => p.alive); }
    _fuse(nAlive) {
      const n0 = this.P.length, scale = Math.min(1, CFG.totalTarget / Math.max(1, (n0 - 1) * 11.5));
      let f = this.rng.range(CFG.fuseMin, CFG.fuseMax) * scale; if (nAlive <= 3) f *= 0.8;
      if (this.ctx.time.left < 12) f = Math.min(f, CFG.minFuse + 0.5);
      return Math.max(CFG.minFuse, f);
    }
    _setIce(on) { for (const p of this.P) { p.tc.accel = on ? CFG.iceAccel : CFG.accel; p.tc.friction = on ? CFG.iceFriction : CFG.friction; p.tc.dashCooldown = CFG.dashCd; } this.ice = on; }
    _startRound() {
      const al = this._alive(); this.round++; let tw = null;
      if (this.round % 2 === 0) { const o = ["ice"]; if (al.length >= 4) o.push("double"); tw = this.rng.pick(o); }
      this.twist = tw; this._setIce(tw === "ice");
      const hs = this.rng.shuffle(al.slice()).slice(0, tw === "double" ? 2 : 1), f = this._fuse(al.length);
      for (const h of hs) { h.hold = true; h.fuse = h.fuseMax = f; h.lock = 0.5; h.beep = 0; h.immune = 0; }
      this.banner = tw ? { text: tw === "ice" ? "❄ 얼음 바닥!" : "💣💣 폭탄 두 개!", t: 2 } : null;
      this.phase = "live"; this.ctx.sfx.play("go");
    }
    _holders() { return this.P.filter(p => p.alive && p.hold); }
    _pass(a, b) {
      a.hold = false; b.hold = true; b.fuse = a.fuse; b.fuseMax = a.fuseMax; a.immune = CFG.passImmune; b.lock = CFG.passLock; b.beep = 0; b.flash = 0.25;
      this.ctx.sfx.play("hit"); const mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2; this._spark(mx, my, 14, ["#fff", "#ffeb3b", b.cp.color], 90, 0.35);
    }
    _spark(x, y, n, cols, sp, life) { const q = this.pt; for (let k = 0; k < n; k++) { const i = q.i = (q.i + 1) % q.n, a = Math.random() * 6.283, v = sp * (0.35 + Math.random() * 0.65); q.x[i] = x; q.y[i] = y; q.vx[i] = Math.cos(a) * v; q.vy[i] = Math.sin(a) * v; q.life[i] = q.max[i] = life * (0.6 + Math.random() * 0.7); q.size[i] = 1.5 + Math.random() * 2.5; q.col[i] = cols[(Math.random() * cols.length) | 0]; } }
    _explode(hs) {
      const ids = []; for (const h of hs) ids.push(h.id);
      for (const h of hs) {
        const x = h.sx, y = h.sy; this._spark(x, y, 60, ["#ff1744", "#ff9100", "#ffeb3b", "#fff"], 230, 0.9); this._spark(x, y, 20, ["#222", "#444"], 90, 1.1);
        this.waves.push({ x, y, t: 0 });
        for (const q of this.P) { // 폭풍: 가까울수록 세게 날아간다
          if (!q.alive || q === h) continue; const dx = q.sx - x, dy = q.sy - y, d = Math.hypot(dx, dy); if (d > CFG.blastR) continue;
          const v = CFG.blastMin + (CFG.blastMax - CFG.blastMin) * (1 - d / CFG.blastR), nx = d > 0.1 ? dx / d : 1, ny = d > 0.1 ? dy / d : 0;
          q.body.setVelocity(nx * v, ny * v); q.knock = CFG.knock; q.tc.friction = 520; q.tc.dashing = false; q.flash = 0.15;
        }
        h.alive = false; h.hold = false; h.go.destroy();
      }
      this.elim.push(ids); this.shake = 0.7; this.flashScr = 0.35; this.ctx.sfx.play("boom"); this.ctx.sfx.play("lose");
      this._setIce(false);
      const al = this._alive();
      if (al.length <= 1) { this.phase = "done"; this.phaseT = CFG.doneWait; } else { this.phase = "rest"; this.phaseT = CFG.rest; }
      const s = Math.max(CFG.minScale, 1 - CFG.shrinkStep * this.elim.length); this.ar.thw = CFG.hw * s; this.ar.thh = CFG.hh * s; // 벽이 안쪽으로
    }
    _ranking() { const al = this._alive().map(p => p.id), r = [al.length === 1 ? al[0] : al]; for (let i = this.elim.length - 1; i >= 0; i--) r.push(this.elim[i].length === 1 ? this.elim[i][0] : this.elim[i]); return r; }
    _finish() { if (this.ended) return; this.ended = true; this.ctx.end({ ranking: this._ranking() }); }
    onTimeUp() { this._finish(); }
    onPlayerLeave(id) { // 나간 사람은 조용히 탈락 (폭탄을 들고 있었다면 가장 가까운 생존자에게 넘긴다)
      const p = this.P.find(q => q.id === id); if (!p || !p.alive) return;
      if (p.hold) { const o = this._alive().filter(q => q !== p && !q.hold).sort((a, b) => Math.hypot(a.sx - p.sx, a.sy - p.sy) - Math.hypot(b.sx - p.sx, b.sy - p.sy))[0]; if (o) { o.hold = true; o.fuse = p.fuse; o.fuseMax = p.fuseMax; o.lock = 0.5; } }
      p.alive = false; p.hold = false; p.go.destroy(); this.elim.push([id]); this._spark(p.sx, p.sy, 16, [p.cp.color, "#fff"], 100, 0.5);
      if (this._alive().length <= 1 && this.phase !== "done") { this.phase = "done"; this.phaseT = CFG.doneWait; }
    }
    getResult() { return { ranking: this._ranking() }; }
    // ---------- 매 프레임 ----------
    update(dt) {
      this.t += dt; const c = this.ctx, a = this.ar, P = this.P;
      // 벽 이동
      const st = CFG.shrinkSpeed * dt; a.hw += clamp(a.thw - a.hw, -st, st); a.hh += clamp(a.thh - a.hh, -st, st); this._placeWalls();
      // 입력 · 이동
      for (const p of P) {
        if (!p.alive) continue; const i = c.input(p.id), tc = p.tc, b = p.body;
        p.sx = b.x; p.sy = b.y; if (p.knock > 0) { p.knock -= dt; tc.setInput(0, 0); if (p.knock <= 0) tc.friction = this.ice ? CFG.iceFriction : CFG.friction; } else tc.setInput(i.mx, i.my);
        tc.maxSpeed = CFG.speed * (p.hold ? CFG.boost : 1);
        if (p.knock <= 0 && i.pressed("a") && this.phase !== "done") tc.dash();
        if (tc.moving) p.face = tc.facing;
        p.immune = Math.max(0, p.immune - dt); p.lock = Math.max(0, p.lock - dt); p.flash = Math.max(0, p.flash - dt);
        // 벽 밖으로 밀려나가지 않게 (안전장치)
        const mx = a.hw - R - 1, my = a.hh - R - 1; if (Math.abs(p.sx) > mx || Math.abs(p.sy) > my) { b.setPosition(clamp(p.sx, -mx, mx), clamp(p.sy, -my, my)); p.sx = b.x; p.sy = b.y; }
      }
      // 폭탄: 퓨즈 · 삐 소리 · 넘기기
      if (this.phase === "live") {
        const hs = this._holders(); let boom = null;
        for (const h of hs) {
          h.fuse -= dt; const fr = clamp(h.fuse / h.fuseMax, 0, 1); h.beep -= dt;
          if (h.beep <= 0) { h.beep = 0.1 + 0.55 * fr; h.flash = 0.07; c.sfx.play("tick"); }
          if (h.fuse <= 0) (boom = boom || []).push(h);
        }
        if (!boom) for (const h of hs) {
          if (h.lock > 0) continue;
          for (const q of P) { if (!q.alive || q.hold || q.immune > 0 || !q.cp.connected) continue; if (Math.hypot(h.sx - q.sx, h.sy - q.sy) < 2 * R + 2.2) { this._pass(h, q); break; } }
        }
        if (boom) this._explode(boom);
      } else if (this.phase === "rest") { this.phaseT -= dt; if (this.phaseT <= 0) this._startRound(); }
      else if (this.phase === "done") { this.phaseT -= dt; if (this.phaseT <= 0) this._finish(); }
      // 효과
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt); if (this.flashScr > 0) this.flashScr -= dt; if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
      for (let k = this.waves.length - 1; k >= 0; k--) if ((this.waves[k].t += dt) > 0.6) this.waves.splice(k, 1);
      const q = this.pt; for (let i = 0; i < q.n; i++) if (q.life[i] > 0) { q.life[i] -= dt; q.x[i] += q.vx[i] * dt; q.y[i] += q.vy[i] * dt; q.vx[i] *= 0.96; q.vy[i] *= 0.96; }
    }
    // ---------- 그리기 ----------
    render(h) {
      const g = h.g, a = this.ar, ctx = this.ctx;
      const gr = g.createLinearGradient(0, 0, 0, VH); gr.addColorStop(0, this.ice ? "#2b4d78" : "#3b2a78"); gr.addColorStop(1, this.ice ? "#1b2f52" : "#1f1446"); g.fillStyle = gr; g.fillRect(-VW, -VH, VW * 3, VH * 3);
      g.save(); const sk = this.shake > 0 ? this.shake * 14 : 0; if (sk) g.translate((Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk);
      // 바닥 (체커)
      const L = sx(-a.hw), Tp = sy(a.hh), W = a.hw * 2 * S, H = a.hh * 2 * S;
      g.save(); g.beginPath(); g.rect(L, Tp, W, H); g.clip(); const tile = 24 * S;
      for (let ix = 0; ix * tile < W + tile; ix++) for (let iy = 0; iy * tile < H + tile; iy++) { g.fillStyle = (ix + iy) & 1 ? (this.ice ? "#a8dcf0" : "#4d3b97") : (this.ice ? "#c4ecfa" : "#5a46ab"); g.fillRect(L + ix * tile, Tp + iy * tile, tile, tile); }
      if (this.ice) { g.strokeStyle = "#ffffff80"; g.lineWidth = 3; for (let k = 0; k < 9; k++) { const x = L + ((k * 331 + this.t * 20) % W), y = Tp + ((k * 197) % H); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 40, y - 14); g.stroke(); } }
      g.restore();
      g.lineWidth = 14; g.strokeStyle = this._danger() ? "#ff5252" : "#ffd740"; g.strokeRect(L - 7, Tp - 7, W + 14, H + 14); g.lineWidth = 4; g.strokeStyle = "#1a1033"; g.strokeRect(L - 15, Tp - 15, W + 30, H + 30);
      // 기둥
      for (const o of this.obs) {
        const x = sx(o.x), y = sy(o.y); g.fillStyle = "#0004";
        if (o.kind === "pillar") { g.beginPath(); g.ellipse(x + 4, y + 8, o.r * S, o.r * S * 0.9, 0, 0, 7); g.fill(); g.fillStyle = "#8d8aa8"; g.beginPath(); g.arc(x, y, o.r * S, 0, 7); g.fill(); g.fillStyle = "#b9b6d3"; g.beginPath(); g.arc(x - 6, y - 6, o.r * S * 0.62, 0, 7); g.fill(); g.lineWidth = 4; g.strokeStyle = "#1a1033"; g.beginPath(); g.arc(x, y, o.r * S, 0, 7); g.stroke(); }
        else { const w = o.w * S, hh = o.h * S; g.fillRect(x - w / 2 + 5, y - hh / 2 + 8, w, hh); g.fillStyle = "#8d8aa8"; g.fillRect(x - w / 2, y - hh / 2, w, hh); g.fillStyle = "#b9b6d3"; g.fillRect(x - w / 2 + 4, y - hh / 2 + 4, w - 8, hh * 0.35); g.lineWidth = 4; g.strokeStyle = "#1a1033"; g.strokeRect(x - w / 2, y - hh / 2, w, hh); }
      }
      // 플레이어
      const order = this.P.filter(p => p.alive).sort((p, q) => q.sy - p.sy);
      for (const p of order) this._drawPlayer(g, h, p);
      // 폭발 파동 · 입자
      for (const w of this.waves) { const k = w.t / 0.6; g.globalAlpha = 1 - k; g.lineWidth = 16 * (1 - k) + 2; g.strokeStyle = "#fff"; g.beginPath(); g.arc(sx(w.x), sy(w.y), CFG.blastR * S * (0.15 + 0.95 * k), 0, 7); g.stroke(); g.strokeStyle = "#ff9100"; g.lineWidth = 6; g.beginPath(); g.arc(sx(w.x), sy(w.y), CFG.blastR * S * (0.1 + 0.85 * k), 0, 7); g.stroke(); }
      const q = this.pt; for (let i = 0; i < q.n; i++) if (q.life[i] > 0) { g.globalAlpha = Math.min(1, q.life[i] / q.max[i] * 1.5); g.fillStyle = q.col[i]; const s = q.size[i] * (0.6 + 0.6 * q.life[i] / q.max[i]) * 3; g.fillRect(sx(q.x[i]) - s / 2, sy(q.y[i]) - s / 2, s, s); }
      g.globalAlpha = 1; g.restore();
      // 화면 효과
      if (this.flashScr > 0) { g.fillStyle = `rgba(255,255,255,${this.flashScr * 1.8})`; g.fillRect(-VW, -VH, VW * 3, VH * 3); }
      const hs = this._holders(), minF = hs.reduce((m, p) => Math.min(m, p.fuse), 99);
      if (minF < 2.5 && this.phase === "live") { const k = (1 - minF / 2.5) * (0.35 + 0.25 * Math.sin(this.t * 22)); const gr2 = g.createRadialGradient(CX, CY, 380, CX, CY, 1100); gr2.addColorStop(0, "rgba(255,0,0,0)"); gr2.addColorStop(1, `rgba(255,20,20,${k})`); g.fillStyle = gr2; g.fillRect(0, 0, VW, VH); }
      // HUD: 생존 표시 · 변수 배너
      const all = this.ctx.players; all.forEach((cp, i) => { const p = this.P[i], x = 70 + i * 74, y = 70; h.circle(x, y, 26, p.alive ? cp.color : "#0006"); g.lineWidth = 4; g.strokeStyle = "#1a1033"; g.beginPath(); g.arc(x, y, 26, 0, 7); g.stroke(); if (!p.alive) h.text("✕", x, y + 2, { size: 40, color: "#ff5252", align: "center" }); else if (p.hold) h.text("💣", x, y + 46, { size: 30, align: "center" }); });
      if (this.banner) { const k = Math.min(1, (2 - this.banner.t) / 0.25); g.save(); g.globalAlpha = Math.min(1, this.banner.t); g.translate(CX, 160); g.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k); h.text(this.banner.text, 0, 0, { size: 96, align: "center", color: this.twist === "ice" ? "#b3e5fc" : "#ffcc80", strokeW: 16 }); g.restore(); }
      if (this.phase === "done") { const w = this._alive()[0]; if (w) h.text(`${w.cp.nick} 승리!`, CX, VH - 110, { size: 96, align: "center", color: w.cp.color, strokeW: 16 }); }
    }
    _danger() { return this.phase === "live" && this._holders().some(p => p.fuse < 2.5); }
    _drawPlayer(g, h, p) {
      const x = sx(p.sx), y = sy(p.sy), r = R * S, hold = p.hold, fr = hold ? clamp(p.fuse / p.fuseMax, 0, 1) : 1, cp = p.cp;
      g.fillStyle = "#0005"; g.beginPath(); g.ellipse(x + 3, y + r * 0.9, r * 0.95, r * 0.42, 0, 0, 7); g.fill();
      if (p.tc.dashing) { g.globalAlpha = 0.35; g.fillStyle = cp.color; const vx = p.body.vx, vy = p.body.vy, l = Math.hypot(vx, vy) || 1; for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(x - vx / l * k * 16, y + vy / l * k * 16, r * (1 - k * 0.15), 0, 7); g.fill(); } g.globalAlpha = 1; }
      const hot = hold && (p.flash > 0 || Math.sin(this.t * (6 + (1 - fr) * 30)) > 0.2);
      g.fillStyle = hot ? (fr < 0.35 ? "#ff5252" : "#fff59d") : cp.color; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.lineWidth = 5; g.strokeStyle = p.immune > 0 ? "#69f0ae" : "#1a1033"; if (p.immune > 0) g.setLineDash([10, 8]); g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); g.setLineDash([]);
      // 눈
      const fx = Math.cos(p.face), fy = -Math.sin(p.face); g.fillStyle = "#fff"; for (const s of [-1, 1]) { const ex = x + fx * r * 0.35 - fy * s * r * 0.32, ey = y + fy * r * 0.35 + fx * s * r * 0.32 - 3; g.beginPath(); g.arc(ex, ey, r * 0.26, 0, 7); g.fill(); g.fillStyle = "#1a1033"; g.beginPath(); g.arc(ex + fx * 3, ey + fy * 3, r * 0.12, 0, 7); g.fill(); g.fillStyle = "#fff"; }
      h.text(cp.nick, x, y - r - 20, { size: 28, align: "center" });
      if (hold) { // 퓨즈 링(초록→노랑→빨강) + 머리 위 폭탄
        g.lineWidth = 9; g.strokeStyle = `hsl(${Math.round(120 * fr)},95%,58%)`; g.beginPath(); g.arc(x, y, r + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fr); g.stroke();
        const pulse = 1 + 0.18 * Math.sin(this.t * (8 + (1 - fr) * 34)), by = y - r - 62; g.save(); g.translate(x, by); g.scale(pulse, pulse);
        g.fillStyle = "#222"; g.beginPath(); g.arc(0, 0, 20, 0, 7); g.fill(); g.fillStyle = "#555"; g.beginPath(); g.arc(-6, -6, 7, 0, 7); g.fill();
        g.strokeStyle = "#a1887f"; g.lineWidth = 5; g.beginPath(); g.moveTo(8, -17); g.quadraticCurveTo(14, -30, 24, -28); g.stroke();
        g.fillStyle = Math.sin(this.t * 40) > 0 ? "#ffeb3b" : "#ff6d00"; g.beginPath(); g.arc(25, -29, 6 + 2 * Math.sin(this.t * 30), 0, 7); g.fill(); g.restore();
        h.text(String(Math.max(0, Math.ceil(p.fuse))), x, by - 38, { size: 34, align: "center", color: fr < 0.35 ? "#ff5252" : "#fff" });
      }
    }
    dispose() { try { this.world.destroy(); } catch (e) { console.error(e); } }
  }

  PartyGames.register({
    id: "bomb", name: "폭탄 돌리기", rule: "폭탄을 든 채로 터지면 탈락! 다른 사람에게 부딪쳐 넘기세요", view: "topdown", players: [2, 8], duration: CFG.duration, scoring: "rank", points: [3, 2, 1],
    controls: { stick: true, aim: false, buttons: [{ id: "a", label: "돌진" }] },
    create(ctx) { return new Bomb(ctx); },
  });
})();
