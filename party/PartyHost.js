// 파티 게임 진행: 로비 → (소개 → 카운트다운 → 미니게임 → 결과) × 라운드 → 최종 순위 → 로비.
// 셸 화면(로비·소개·결과·최종)은 오버레이 캔버스(#ui)에 가상 해상도 1920x1080으로 그린다. 미니게임은 KuntoGame 장면(#game)에 그리고, HUD는 instance.render(hud)로 같은 오버레이에 그린다.
const VW = 1920, VH = 1080, ROUND_CHOICES = [3, 5, 7, 10];
const FONT = `"Jua","Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif`;

// ---- 그리기 도구 (미니게임은 ctx.hud 로 받는다) ----
class Hud {
  constructor(g) { this.g = g; this.W = VW; this.H = VH; }
  text(s, x, y, o = {}) {
    const g = this.g; g.save(); g.font = `${o.weight || "bold"} ${o.size || 48}px ${FONT}`; g.textAlign = o.align || "left"; g.textBaseline = o.base || "middle";
    if (o.alpha !== undefined) g.globalAlpha = o.alpha;
    if (o.stroke !== false) { g.lineJoin = "round"; g.lineWidth = o.strokeW || Math.max(4, (o.size || 48) / 7); g.strokeStyle = o.strokeColor || "#1a1033"; g.strokeText(s, x, y); }
    g.fillStyle = o.color || "#fff"; g.fillText(s, x, y); g.restore();
  }
  rect(x, y, w, h, color, r = 0) { const g = this.g; g.fillStyle = color; if (r) { this.rr(x, y, w, h, r); g.fill(); } else g.fillRect(x, y, w, h); }
  rr(x, y, w, h, r) { const g = this.g; r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  circle(x, y, r, color) { const g = this.g; g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  bar(x, y, w, h, ratio, color, bg = "#0006") { ratio = Math.max(0, Math.min(1, ratio)); this.rect(x, y, w, h, bg, h / 2); if (ratio > 0) this.rect(x, y, Math.max(h, w * ratio), h, color, h / 2); }
  // 플레이어 이름표 (색 원 + 닉네임)
  tag(p, x, y, o = {}) { const s = o.size || 34; this.circle(x, y, s * 0.55, p.color); this.g.strokeStyle = "#1a1033"; this.g.lineWidth = 4; this.g.beginPath(); this.g.arc(x, y, s * 0.55, 0, 7); this.g.stroke(); this.text(p.nick, x + s * 0.8, y, { size: s, align: "left", color: o.color }); }
}

class PartyHost {
  constructor(App, overlay, opts = {}) {
    this.App = App; this.overlay = overlay; this.g = overlay.getContext("2d"); this.hud = new Hud(this.g);
    this.dev = !!opts.dev; this.net = new PartyNet(this);
    this.state = "lobby"; this.t = 0; this.stateT = 0;
    this.modeIdx = 0; this.roundIdx = 1; this.row = 0; // 로비 설정: modeIdx 0 = 무작위 순서, 1.. = 그 미니게임만 / 라운드 수 ROUND_CHOICES[roundIdx]
    this.rounds = 5; this.round = 0; this.bag = []; this.game = null; this.part = []; this.ctx = null; this.inst = null; this.result = null; this.lastGameId = null;
    this.confetti = []; this.autoStartT = -1; this.nav = {}; this.endT = -1; this.fade = 0;
    this.keys = new Set();
    addEventListener("keydown", e => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; this.keys.add(e.code); if (e.code === "Tab") { e.preventDefault(); this._addKeyboard(); } if (e.code === "KeyM") PartySfx.toggleMute(); if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault(); });
    addEventListener("keyup", e => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    this._resize(); addEventListener("resize", () => this._resize());
  }
  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = innerWidth, h = innerHeight;
    this.overlay.width = Math.round(w * dpr); this.overlay.height = Math.round(h * dpr);
    const s = Math.min(w / VW, h / VH); this.sc = s * dpr; this.ox = (w - VW * s) / 2 * dpr; this.oy = (h - VH * s) / 2 * dpr;
  }
  start() { this.net.start(); }
  get code() { return this.net.roomCode; }

  // ---------- 플레이어 ----------
  _addKeyboard() { if (this.state === "lobby") { const p = this.net.addLocal("kb", "키보드"); this.net.sendLayout(p); } }
  _kbInput() {
    const p = this.net.roster.get("kb"); if (!p) return; const k = c => this.keys.has(c) ? 1 : 0;
    let mx = k("KeyD") + k("ArrowRight") - k("KeyA") - k("ArrowLeft"), my = k("KeyW") + k("ArrowUp") - k("KeyS") - k("ArrowDown"); const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    p.input.apply({ mx, my, ax: 0, ay: 0, b: { a: k("Space") || k("KeyJ"), b: k("KeyK") || k("Enter"), c: k("KeyL"), d: k("KeyU") } });
  }
  onPlayerChange(p, ev) {
    if (ev === "join" || ev === "rejoin") PartySfx.play("join");
    if (ev === "leave" || ev === "kick") { p.ready = false; if (this.inst && this.inst.onPlayerLeave && this.part.includes(p)) try { this.inst.onPlayerLeave(p.id); } catch (e) { console.error(e); } }
    if (this.state === "lobby") this.autoStartT = -1;
  }
  onReady(p, v) { if (this.state === "lobby") { p.ready = v; PartySfx.play("ready"); this._pushStatus(); } }
  _pushStatus() { for (const p of this.net.players) if (p.conn && p.conn.open) p.conn.send({ t: "st", ready: p.ready, owner: this.net.owner === p, n: this.net.connected.length, score: p.score }); }

  // 폰에 보낼 화면 구성
  layoutFor(p) {
    const base = { color: p.color, nick: p.nick, mode: this.state, owner: this.net.owner === p };
    if (this.state === "play" || this.state === "countdown") {
      if (this.part.includes(p) && this.game) { const c = this.game.controls; return { ...base, mode: "game", game: this.game.name, stick: !!c.stick, aim: !!c.aim, motion: !!c.motion, buttons: (c.buttons || []).slice(0, 4) }; }
      return { ...base, mode: "wait", note: "다음 게임부터 같이 해요", stick: false, aim: false, buttons: [] };
    }
    if (this.state === "lobby") return { ...base, stick: true, aim: false, buttons: [{ id: "a", label: p.ready ? "취소" : "준비" }, ...(this.net.owner === p ? [{ id: "b", label: "시작" }] : [])] };
    return { ...base, mode: "wait", stick: false, aim: false, buttons: [{ id: "a", label: "확인" }] }; // 소개·결과·최종 (방장이 넘길 수 있음)
  }
  _setState(s) { this.state = s; this.stateT = 0; this.net.sendLayout(); this._pushStatus(); }

  // ---------- 로비 ----------
  _modes() { return [{ id: null, name: "무작위" }, ...PartyGames.list.filter(g => this.dev || g.id[0] !== "_").map(g => ({ id: g.id, name: g.name }))]; }
  _canPlay(n) { const sel = this._modes()[this.modeIdx] || this._modes()[0], av = PartyGames.available(n, this.dev); return sel.id ? av.some(g => g.id === sel.id) : av.length > 0; } // 지금 인원으로 시작할 수 있나 (난수 가방을 건드리지 않는다)
  _axisEdge(key, v, th = 0.6) { // 스틱을 한 번 기울일 때마다 한 번만 true (+1/-1)
    const was = this.nav[key] || 0, now = v > th ? 1 : v < -th ? -1 : 0; this.nav[key] = now; return now !== 0 && now !== was ? now : 0;
  }
  _lobbyTick(dt) {
    const pl = this.net.connected, owner = this.net.owner;
    for (const p of pl) if (p.input.pressed("a")) { p.ready = !p.ready; PartySfx.play("ready"); this.autoStartT = -1; this.net.sendLayout(p); this._pushStatus(); }
    if (owner) {
      const dy = this._axisEdge("y", -owner.input.my), dx = this._axisEdge("x", owner.input.mx);
      if (dy) { this.row = 1 - this.row; PartySfx.play("tick"); }
      if (dx) { const modes = this._modes(); if (this.row === 0) this.modeIdx = (this.modeIdx + dx + modes.length) % modes.length; else this.roundIdx = (this.roundIdx + dx + ROUND_CHOICES.length) % ROUND_CHOICES.length; PartySfx.play("tick"); }
    }
    const allReady = pl.length > 0 && pl.every(p => p.ready), can = allReady && this._canPlay(pl.length);
    if (owner && owner.input.pressed("b")) { if (can) { this._startMatch(); return; } PartySfx.play("hit"); }
    if (can) { if (this.autoStartT < 0) this.autoStartT = 4; this.autoStartT -= dt; if (this.autoStartT <= 0) this._startMatch(); } else this.autoStartT = -1;
  }
  _pickGame(n, exclude) { // 지금 인원수로 할 수 있는 미니게임 하나 (설정 반영, 직전 게임은 피함)
    const modes = this._modes(), sel = modes[this.modeIdx] || modes[0], avail = PartyGames.available(n, this.dev);
    if (!avail.length) return null;
    if (sel.id) return avail.find(g => g.id === sel.id) || null;
    let pool = avail.filter(g => g.id !== (exclude || this.lastGameId)); if (!pool.length) pool = avail;
    if (this.bag.length === 0) this.bag = avail.map(g => g.id).sort(() => this._rand() - 0.5);
    let id = this.bag.find(i => pool.some(g => g.id === i)); if (!id) { this.bag = avail.map(g => g.id).sort(() => this._rand() - 0.5); id = this.bag.find(i => pool.some(g => g.id === i)) || pool[0].id; }
    this.bag.splice(this.bag.indexOf(id), 1); return PartyGames.get(id);
  }
  _rand() { return Math.random(); }
  _startMatch() {
    this.rounds = ROUND_CHOICES[this.roundIdx]; this.round = 0; this.bag = []; this.lastGameId = null;
    for (const p of this.net.players) { p.score = 0; p.ready = false; }
    this.autoStartT = -1; this._nextRound();
  }
  _nextRound() {
    const pl = this.net.connected; if (!pl.length) { this._toLobby(); return; }
    const g = this._pickGame(pl.length); if (!g) { this._toLobby(); return; }
    this.round++; this.game = g; this.lastGameId = g.id; this.part = pl.slice(); this.result = null; this.endT = -1;
    this._setState("intro");
  }
  _toLobby() { for (const p of this.net.players) p.ready = false; this.game = null; this.part = []; this._disposeGame(); this.autoStartT = -1; this._setState("lobby"); }

  // ---------- 미니게임 ----------
  _makeCtx() {
    const host = this, App = this.App, g = this.game, scene = App.create("minigame"), timers = [], disposers = [];
    let seed = (Date.now() ^ (this.round * 2654435761)) >>> 0; if (this.fixedSeed !== undefined) seed = (this.fixedSeed + this.round) >>> 0;
    const mul = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    mul.int = (a, b) => a + Math.floor(mul() * (b - a + 1)); mul.range = (a, b) => a + mul() * (b - a); mul.pick = arr => arr[Math.floor(mul() * arr.length)]; mul.shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(mul() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const ctx = {
      App, engine: App, camera: App.camera, scene, hud: this.hud, sfx: PartySfx, rng: mul, W: VW, H: VH,
      players: this.part.map((p, i) => ({ id: p.id, nick: p.nick, color: p.color, index: i, slot: p.index, get connected() { return p.connected; } })),
      time: { elapsed: 0, left: g.duration || Infinity, duration: g.duration || 0 },
      input: id => { const p = host.net.players.find(q => q.id === id); return p ? p.input : NULL_INPUT; },
      create(name) { const go = App.create(name || "obj"); scene.addChild(go); return go; }, // 이 게임의 오브젝트 만들기 (게임이 끝나면 자동으로 지워진다)
      // 카메라 화면 범위(월드 유닛). 기본 640x360. 위치는 ctx.camera.transform.setPosition(x, y)
      setView(w, h) { App.camera.setBaseView(w, h); App.camera.zoom = 1; },
      // 끝내기: { ranking: [id | [id,id(동점)], ...] 좋은 순 } 또는 { scores: {id: 숫자(클수록 좋음)} } 또는 { winners: [id...] } (협동·팀전: 이긴 사람 모두 1등 점수)
      end(result) { host._onEnd(result); },
      after(sec, fn) { timers.push({ t: sec, fn }); },
      onDispose(fn) { disposers.push(fn); },
      on(target, ev, fn, opt) { target.addEventListener(ev, fn, opt); disposers.push(() => target.removeEventListener(ev, fn, opt)); },
      _timers: timers, _disposers: disposers,
    };
    ctx.setView(640, 360); App.camera.transform.setPosition(0, 0);
    return ctx;
  }
  _beginCountdown() {
    this.ctx = this._makeCtx(); this.inst = null; this.goT = undefined; this.cdLast = 4;
    this._setState("countdown");
    try { this.inst = this.game.create(this.ctx); } catch (e) { console.error("미니게임 만들기 실패", e); this.ctx.end({ ranking: this.part.map(p => p.id) }); }
  }
  _disposeGame() {
    const c = this.ctx; this.ctx = null; const inst = this.inst; this.inst = null;
    try { if (inst && inst.dispose) inst.dispose(); } catch (e) { console.error(e); }
    if (c) { for (const d of c._disposers) try { d(); } catch (e) { console.error(e); } c._timers.length = 0; try { c.scene.destroy(); } catch (e) {} const cam = this.App.camera; cam.setBaseView(640, 360); cam.zoom = 1; cam.transform.setPosition(0, 0); }
  }
  _onEnd(result) {
    if (this.state !== "play" && this.state !== "countdown") return; if (this.endT >= 0) return;
    this.result = result || {}; this.endT = 0; if (this.state === "countdown") this._setState("play"); PartySfx.play("win");
  }
  _score() { // 결과 → 순위 그룹 [[id,...], ...] 와 점수
    const ids = this.part.map(p => p.id), r = this.result || {}; let groups = [];
    if (r.winners) { const w = r.winners.filter(i => ids.includes(i)); groups = [w, ids.filter(i => !w.includes(i))].filter(x => x.length); if (!w.length) groups = [ids.slice()]; }
    else if (r.scores) { const by = {}; for (const id of ids) (by[r.scores[id] ?? -Infinity] = by[r.scores[id] ?? -Infinity] || []).push(id); groups = Object.keys(by).map(Number).sort((a, b) => b - a).map(k => by[k]); }
    else { const seen = new Set(); for (const e of (r.ranking || [])) { const g = (Array.isArray(e) ? e : [e]).filter(i => ids.includes(i) && !seen.has(i)); g.forEach(i => seen.add(i)); if (g.length) groups.push(g); } const rest = ids.filter(i => !seen.has(i)); if (rest.length) groups.push(rest); }
    const pts = this.game.points || [3, 2, 1], award = {}; let place = 0;
    groups.forEach(gr => { const v = r.winners ? (place === 0 ? pts[0] : 0) : (pts[place] ?? 0); gr.forEach(i => award[i] = v); place += gr.length; });
    return { groups, award };
  }

  // ---------- 매 프레임 ----------
  tick(dt) {
    dt = Math.min(dt, 0.1); this.t += dt; this.stateT += dt; this._kbInput(); this.net.tick();
    const S = this.state;
    if (S === "lobby") this._lobbyTick(dt);
    else if (S === "intro") { if (this.stateT >= 4.2 || (this.stateT > 1 && this._ownerPressed("a"))) this._beginCountdown(); }
    else if (S === "countdown") {
      const n = Math.ceil(3.2 - this.stateT); if (n !== this.cdLast) { this.cdLast = n; if (n > 0) PartySfx.play("count"); }
      if (this.stateT >= 3.2) { this._setState("play"); this.ctx.time.elapsed = 0; PartySfx.play("go"); try { this.inst && this.inst.start && this.inst.start(); } catch (e) { console.error(e); } this.goT = 0; }
    } else if (S === "play") this._playTick(dt);
    else if (S === "result") { if (this.stateT > 6 || (this.stateT > 1.5 && this._ownerPressed("a"))) { if (this.round >= this.rounds) this._toFinal(); else this._nextRound(); } }
    else if (S === "final") { this._confettiTick(dt); if (this.stateT > 20 || (this.stateT > 3 && this._ownerPressed("a"))) this._toLobby(); }
    this._draw(dt);
  }
  _ownerPressed(id) { const o = this.net.owner; return !!(o && o.input.pressed(id)); }
  _playTick(dt) {
    const c = this.ctx; if (!c) return; this.goT = (this.goT || 0) + dt;
    if (this.endT >= 0) { this.endT += dt; if (this.endT > 1.6) this._finishRound(); return; }
    c.time.elapsed += dt; if (c.time.duration) c.time.left = Math.max(0, c.time.duration - c.time.elapsed);
    for (let i = c._timers.length - 1; i >= 0; i--) { const t = c._timers[i]; t.t -= dt; if (t.t <= 0) { c._timers.splice(i, 1); try { t.fn(); } catch (e) { console.error(e); } } }
    try { this.inst && this.inst.update && this.inst.update(dt); } catch (e) { console.error("미니게임 update 오류", e); this._onEnd({ ranking: this.part.map(p => p.id) }); return; }
    if (c.time.duration && c.time.elapsed >= c.time.duration && this.endT < 0) { // 시간 초과: onTimeUp()이 end를 부르게 하고, 안 부르면 getResult()/기본 순위로 끝낸다
      try { this.inst && this.inst.onTimeUp && this.inst.onTimeUp(); } catch (e) { console.error(e); }
      if (this.endT < 0) { let r = null; try { r = this.inst && this.inst.getResult && this.inst.getResult(); } catch (e) { console.error(e); } this._onEnd(r || { ranking: this.part.map(p => p.id) }); }
    }
  }
  _finishRound() {
    const { groups, award } = this._score(); this.outcome = { groups, award };
    for (const p of this.part) p.score += award[p.id] || 0;
    this._disposeGame(); this._setState("result");
  }
  _toFinal() { this.confetti = []; for (let i = 0; i < 160; i++) this._spawnConfetti(); this._setState("final"); PartySfx.play("fanfare"); this.finalRank = this.net.players.filter(p => p.connected || p.score > 0).sort((a, b) => b.score - a.score || a.index - b.index); }
  _spawnConfetti() { this.confetti.push({ x: Math.random() * VW, y: -Math.random() * VH, vx: (Math.random() - 0.5) * 120, vy: 120 + Math.random() * 260, r: 8 + Math.random() * 10, c: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)], a: Math.random() * 6, w: Math.random() * 6 }); }
  _confettiTick(dt) { for (const f of this.confetti) { f.x += f.vx * dt + Math.sin(this.t * 2 + f.w) * 30 * dt; f.y += f.vy * dt; f.a += dt * 4; if (f.y > VH + 30) { f.y = -20; f.x = Math.random() * VW; } } }

  // ---------- 그리기 ----------
  _draw() {
    const g = this.g, h = this.hud; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.overlay.width, this.overlay.height);
    g.setTransform(this.sc, 0, 0, this.sc, this.ox, this.oy);
    const S = this.state;
    if (S === "play" || S === "countdown") this._drawGame();
    else { this._drawBg(); if (S === "lobby") this._drawLobby(); else if (S === "intro") this._drawIntro(); else if (S === "result") this._drawResult(); else if (S === "final") this._drawFinal(); }
  }
  _drawBg() {
    const g = this.g, t = this.t; const gr = g.createLinearGradient(0, 0, 0, VH); gr.addColorStop(0, "#5b3df5"); gr.addColorStop(1, "#c04bd8"); g.fillStyle = gr; g.fillRect(-VW, -VH, VW * 3, VH * 3);
    g.save(); g.globalAlpha = 0.12; g.fillStyle = "#fff"; for (let i = -2; i < 14; i++) { const x = ((i * 220 + t * 40) % (VW + 440)) - 220; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 110, 0); g.lineTo(x - 90, VH); g.lineTo(x - 200, VH); g.closePath(); g.fill(); } g.restore();
  }
  _drawGame() {
    const h = this.hud, c = this.ctx; if (!c) return;
    try { if (this.inst && this.inst.render) this.inst.render(h); } catch (e) { console.error("render 오류", e); }
    // 공통 HUD: 남은 시간
    if (c.time.duration && this.state === "play" && this.endT < 0) { const left = Math.ceil(c.time.left); h.text(String(left), VW / 2, 56, { size: 76, color: left <= 5 ? "#ff5252" : "#fff", align: "center" }); }
    h.text(`${this.round}/${this.rounds}`, VW - 40, 40, { size: 36, align: "right", color: "#ffeb3b" });
    if (this.state === "countdown") { const n = Math.ceil(3.2 - this.stateT), k = (3.2 - this.stateT) % 1; if (n >= 1) { h.g.save(); h.g.translate(VW / 2, VH / 2); const s = 1 + (1 - k) * 0.5; h.g.scale(s, s); h.text(String(n), 0, 0, { size: 320, align: "center", color: "#ffeb3b", strokeW: 30 }); h.g.restore(); } }
    else if (this.goT !== undefined && this.goT < 0.8) { h.g.save(); h.g.globalAlpha = 1 - this.goT / 0.8; h.text("시작!", VW / 2, VH / 2, { size: 260, align: "center", color: "#69f0ae", strokeW: 26 }); h.g.restore(); }
    if (this.endT >= 0) { h.g.fillStyle = "#0005"; h.g.fillRect(0, 0, VW, VH); h.text("끝!", VW / 2, VH / 2, { size: 280, align: "center", color: "#ffeb3b", strokeW: 28 }); }
  }
  _drawControlsIcon(x, y, c, scale = 1) { // 컨트롤러 안내 아이콘 (스틱 + 버튼)
    const h = this.hud, g = this.g; let cx = x;
    if (c.stick) { h.circle(cx, y, 52 * scale, "#ffffff33"); h.circle(cx, y, 28 * scale, "#fff"); h.text("이동", cx, y + 82 * scale, { size: 30 * scale, align: "center" }); cx += 170 * scale; }
    if (c.aim) { h.circle(cx, y, 52 * scale, "#ff8a6544"); h.circle(cx, y, 28 * scale, "#ff8a65"); h.text("조준", cx, y + 82 * scale, { size: 30 * scale, align: "center" }); cx += 170 * scale; }
    for (const b of (c.buttons || [])) { h.circle(cx, y, 46 * scale, "#ffd740"); g.strokeStyle = "#1a1033"; g.lineWidth = 5; g.beginPath(); g.arc(cx, y, 46 * scale, 0, 7); g.stroke(); h.text(b.id.toUpperCase(), cx, y, { size: 44 * scale, align: "center", color: "#1a1033", stroke: false }); h.text(b.label, cx, y + 82 * scale, { size: 30 * scale, align: "center" }); cx += 150 * scale; }
    if (c.motion) h.text("📱 흔들기", cx, y, { size: 40 * scale, align: "center" });
  }
  _card(x, y, w, hh, color = "#ffffff") { const h = this.hud; h.rect(x + 8, y + 12, w, hh, "#0004", 36); h.rect(x, y, w, hh, color, 36); }
  _drawLobby() {
    const h = this.hud, g = this.g, pl = this.net.players, owner = this.net.owner;
    h.text("KUNTO PARTY", VW / 2, 90, { size: 120, align: "center", color: "#ffeb3b", strokeW: 18 });
    this._card(VW / 2 - 470, 170, 940, 150, "#fff8");
    if (this.code) { h.text("방 코드", VW / 2, 205, { size: 36, align: "center", color: "#1a1033", stroke: false }); h.text(this.code.split("").join(" "), VW / 2, 281, { size: 100, align: "center", color: "#5b3df5", strokeW: 0, stroke: false }); }
    else h.text("서버에 연결 중...", VW / 2, 245, { size: 60, align: "center", color: "#1a1033", stroke: false });
    h.text("폰으로 접속해서 방 코드를 입력하세요  ·  PC는 Tab으로 키보드 참가", VW / 2, 360, { size: 34, align: "center" });
    // 플레이어 카드
    const n = Math.max(4, pl.length), cw = 200, gap = 24, total = n * cw + (n - 1) * gap, x0 = (VW - total) / 2;
    for (let i = 0; i < n; i++) {
      const p = pl[i], x = x0 + i * (cw + gap), y = 410;
      if (!p) { h.rect(x, y, cw, 250, "#ffffff22", 28); h.text("?", x + cw / 2, y + 125, { size: 90, align: "center", color: "#ffffff66", stroke: false }); continue; }
      const bob = p.ready ? Math.sin(this.t * 8 + i) * 8 : 0;
      this._card(x, y + bob, cw, 250, p.connected ? "#fff" : "#ccc");
      h.circle(x + cw / 2, y + bob + 85, 58, p.color); g.strokeStyle = "#1a1033"; g.lineWidth = 6; g.beginPath(); g.arc(x + cw / 2, y + bob + 85, 58, 0, 7); g.stroke();
      h.circle(x + cw / 2 - 18, y + bob + 78, 7, "#1a1033"); h.circle(x + cw / 2 + 18, y + bob + 78, 7, "#1a1033");
      h.text(p.nick, x + cw / 2, y + bob + 175, { size: 36, align: "center", color: "#1a1033", stroke: false });
      h.text(!p.connected ? "연결 끊김" : p.ready ? "준비 완료!" : "대기 중", x + cw / 2, y + bob + 218, { size: 30, align: "center", color: p.ready ? "#00c853" : "#777", stroke: false });
      if (p === owner) h.text("👑", x + cw - 24, y + bob + 26, { size: 40, align: "center", stroke: false });
    }
    // 설정 (방장)
    const modes = this._modes(), mode = modes[this.modeIdx] || modes[0];
    const rows = [["게임", mode.name], ["라운드", String(ROUND_CHOICES[this.roundIdx])]];
    rows.forEach((r, i) => { const y = 730 + i * 86, sel = this.row === i && owner; h.rect(VW / 2 - 330, y, 660, 72, sel ? "#ffeb3b" : "#ffffff33", 36); h.text(r[0], VW / 2 - 290, y + 36, { size: 38, color: sel ? "#1a1033" : "#fff", stroke: !sel }); h.text(`◀  ${r[1]}  ▶`, VW / 2 + 290, y + 36, { size: 42, align: "right", color: sel ? "#1a1033" : "#fff", stroke: !sel }); });
    const ready = pl.filter(p => p.connected && p.ready).length, tot = pl.filter(p => p.connected).length;
    let msg = tot === 0 ? "아직 아무도 없어요" : ready < tot ? `준비 ${ready}/${tot}  ·  폰의 [준비] 버튼` : this.autoStartT > 0 ? `곧 시작! ${Math.ceil(this.autoStartT)}` : "미니게임이 없어요";
    h.text(msg, VW / 2, 960, { size: 50, align: "center", color: "#ffeb3b", strokeW: 10 });
    h.text("방장: 스틱으로 설정 · [시작] 버튼으로 바로 시작", VW / 2, 1020, { size: 30, align: "center", color: "#ffffffcc" });
  }
  _drawIntro() {
    const h = this.hud, g = this.game; const k = Math.min(1, this.stateT / 0.4), ease = 1 - Math.pow(1 - k, 3);
    h.text(`ROUND ${this.round} / ${this.rounds}`, VW / 2, 110, { size: 64, align: "center", color: "#ffeb3b" });
    const G = this.g; G.save(); G.translate(0, (1 - ease) * 400);
    this._card(VW / 2 - 700, 190, 1400, 640);
    h.text(this.game.name, VW / 2, 330, { size: 150, align: "center", color: "#5b3df5", strokeColor: "#fff", strokeW: 0, stroke: false });
    h.text(this.game.rule, VW / 2, 470, { size: 56, align: "center", color: "#1a1033", stroke: false });
    this._drawControlsIcon(VW / 2 - this._controlsWidth(this.game.controls) / 2 + 60, 640, this.game.controls, 1.15);
    G.restore();
    h.text(this.part.map(p => p.nick).join("  ·  "), VW / 2, 940, { size: 40, align: "center" });
  }
  _controlsWidth(c) { return (c.stick ? 190 : 0) + (c.aim ? 190 : 0) + (c.buttons || []).length * 172 + (c.motion ? 200 : 0); }
  _drawResult() {
    const h = this.hud, o = this.outcome; if (!o) return; const byId = id => this.net.players.find(p => p.id === id);
    h.text(`${this.game ? this.game.name : ""} 결과`, VW / 2, 100, { size: 80, align: "center", color: "#ffeb3b", strokeW: 14 });
    let place = 0, y = 190; const medal = ["🥇", "🥈", "🥉"];
    o.groups.forEach(gr => { gr.forEach(id => { const p = byId(id); if (!p) return; const add = o.award[id] || 0, show = Math.min(1, this.stateT / 0.5 - place * 0.12); if (show > 0) {
      this._card(VW / 2 - 640 + (1 - show) * 700, y, 1280, 100, "#fff"); h.text(medal[place] || String(place + 1), VW / 2 - 580 + (1 - show) * 700, y + 52, { size: 64, stroke: false });
      h.circle(VW / 2 - 470 + (1 - show) * 700, y + 50, 32, p.color); h.text(p.nick, VW / 2 - 420 + (1 - show) * 700, y + 52, { size: 54, color: "#1a1033", stroke: false });
      h.text(`+${add}`, VW / 2 + 380 + (1 - show) * 700, y + 52, { size: 60, align: "right", color: add ? "#00c853" : "#999", stroke: false }); h.text(`합계 ${p.score}`, VW / 2 + 600 + (1 - show) * 700, y + 54, { size: 36, align: "right", color: "#555", stroke: false }); }
      y += 112; place++; }); });
    h.text(this.round >= this.rounds ? "곧 최종 결과!" : "다음 게임을 준비하세요", VW / 2, 1020, { size: 40, align: "center" });
  }
  _drawFinal() {
    const h = this.hud, g = this.g, rank = this.finalRank || []; for (const f of this.confetti) { g.save(); g.translate(f.x, f.y); g.rotate(f.a); g.fillStyle = f.c; g.fillRect(-f.r / 2, -f.r / 4, f.r, f.r / 2); g.restore(); }
    h.text("최종 순위", VW / 2, 100, { size: 120, align: "center", color: "#ffeb3b", strokeW: 18 });
    // 시상대: 2등-1등-3등 순서, 나머지는 아래 줄
    const order = [1, 0, 2], heights = [330, 460, 250], xs = [VW / 2 - 400, VW / 2, VW / 2 + 400];
    order.forEach((ri, slot) => { const p = rank[ri]; if (!p) return; const hh = heights[slot] * Math.min(1, this.stateT / 1.2), bx = xs[slot] - 150, by = 900 - hh;
      h.rect(bx, by, 300, hh, ri === 0 ? "#ffd740" : ri === 1 ? "#cfd8dc" : "#d7a36b", 24); h.text(String(ri + 1), xs[slot], by + hh / 2 + 10, { size: 140, align: "center", color: "#1a1033", stroke: false });
      const bounce = ri === 0 ? Math.abs(Math.sin(this.t * 3)) * 26 : 0; h.circle(xs[slot], by - 90 - bounce, 64, p.color); this.g.strokeStyle = "#1a1033"; this.g.lineWidth = 7; this.g.beginPath(); this.g.arc(xs[slot], by - 90 - bounce, 64, 0, 7); this.g.stroke();
      if (ri === 0) h.text("🏆", xs[slot], by - 200 - bounce, { size: 100, align: "center", stroke: false }); h.text(p.nick, xs[slot], by + 44, { size: 44, align: "center" }); h.text(`${p.score}점`, xs[slot], by + hh + 40, { size: 44, align: "center" }); });
    if (rank.length > 3) h.text(rank.slice(3).map((p, i) => `${i + 4}. ${p.nick} ${p.score}점`).join("    "), VW / 2, 1010, { size: 34, align: "center" });
    h.text("방장 [확인]으로 로비로", VW - 40, VH - 30, { size: 30, align: "right", color: "#ffffffcc" });
  }
}
const NULL_INPUT = new PlayerInput();
window.PartyHost = PartyHost;
