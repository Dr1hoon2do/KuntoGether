// 방 진행(전투 → 보상 → 포털 → 다음 방), 무기·아이템 드랍, HUD, 폰 접속 처리
class Game extends Component {
  constructor(App) {
    super();
    this.App = App; this.cam = App.camera;
    this.heroes = []; this.enemies = []; this.projs = []; this.pickups = []; this.conns = new Map();
    this.state = "fight"; this.room = 0; this.nextId = 0; this.overTimer = 0; this.introTimer = 0;
    this.portal = null; this.portalT = 0;
  }
  awake() {
    const App = this.App;
    this.arena = App.create("arena").addComponent(new ArenaRenderer(ARENA_W, ARENA_H));
    this.fx = App.create("fx").addComponent(new ParticleSystem({ capacity: 2048 }));
    this._buildHud();
    Events.on("enemy.killed", e => {
      this.cam.shake(e.enemy.type === "boss" ? 5 : 0.8, e.enemy.type === "boss" ? 0.5 : 0.08);
      if (Math.random() < 0.07) this.spawnHeart(e.enemy.transform.position.x, e.enemy.transform.position.y);
    }, { owner: this });
    this.startRoom(1);
  }

  // ---------- 생성 도우미 ----------
  spawnSlash(hero, dir, w) {
    const go = this.App.create("slash"), p = hero.transform.position, color = TIERS[hero.weapon.tier].color;
    go.transform.setPosition(p.x, p.y); go.transform.rotation = dir;
    let t = 0; const dur = w.dur, half = (w.arc * Math.PI / 180) / 2;
    const rend = go.addComponent(new DrawRenderer(ctx => {
      const k = Math.min(1, t / dur); ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.lineCap = "round";
      if (w.kind === "thrust") { // 창: 앞으로 찌르는 선
        const len = w.range * Math.min(1, k * 2.5 + 0.3);
        ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(len, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(len + 5, 0); ctx.lineTo(len - 3, 3); ctx.lineTo(len - 3, -3); ctx.closePath(); ctx.fill();
      } else {
        const sweep = w.arc >= 360 ? Math.PI * 2 : half * 2, start = w.arc >= 360 ? 0 : -half, cur = start + sweep * Math.min(1, k * 1.6);
        ctx.globalAlpha *= 0.55; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, w.range, start, cur); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = (1 - k * k); ctx.beginPath(); ctx.arc(0, 0, w.range, start, cur); ctx.stroke();
      }
    }, w.range + 10, { order: 8 }));
    go.addComponent(new (class extends Component { update(dt) { t += dt; go.transform.setPosition(hero.transform.position.x, hero.transform.position.y); if (t > dur) go.destroy(); } })());
  }
  spawnProj(x, y, angle, speed, dmg, fromPlayer) {
    const go = this.App.create("proj"); go.transform.setPosition(x, y);
    const pr = go.addComponent(new Projectile(this, angle, speed, dmg, fromPlayer)); pr.setup();
    this.projs.push(pr);
  }
  spawnHeart(x, y) {
    const go = this.App.create("heart"); go.transform.setPosition(x, y);
    const pk = go.addComponent(new Pickup(this, { type: "heart" })); pk.setup(); this.pickups.push(pk);
  }
  spawnWeaponPickup(x, y, weapon) {
    const go = this.App.create("weapon"); go.transform.setPosition(x, y);
    const pk = go.addComponent(new Pickup(this, { type: "weapon", weapon })); pk.setup(); this.pickups.push(pk);
  }
  spawnEnemy(type, x, y, hpMult, delay) {
    const go = this.App.create("enemy"); go.transform.setPosition(x, y);
    const e = go.addComponent(new Enemy(this, type, hpMult, delay)); e.setup(); this.enemies.push(e);
  }

  // ---------- 방 진행 ----------
  startRoom(n) {
    this.room = n; this.state = "fight"; this.introTimer = 2.2; this.arena.locked = true;
    for (const o of [...this.enemies, ...this.projs, ...this.pickups]) o.gameObject.destroy();
    this.enemies = []; this.projs = []; this.pickups = [];
    if (this.portal) { this.portal.destroy(); this.portal = null; }
    const np = Math.max(1, this.heroes.length);
    this.heroes.forEach((h, i) => {
      h.transform.setPosition((i - (np - 1) / 2) * 22, -ARENA_H / 2 + 25);
      if (!h.alive) h.revive(3);
      h.cd = 0; h.swing = null;
    });
    const hpMult = (1 + 0.15 * (n - 1)) * (0.7 + 0.3 * np);
    const spawnAt = () => {
      for (let tries = 0; tries < 20; tries++) {
        const x = (Math.random() * 2 - 1) * (ARENA_W / 2 - 25), y = (Math.random() * 2 - 1) * (ARENA_H / 2 - 25);
        if (this.heroes.every(h => Math.hypot(h.transform.position.x - x, h.transform.position.y - y) > 70)) return [x, y];
      }
      return [0, ARENA_H / 2 - 30];
    };
    const boss = n % 5 === 0;
    const count = Math.min(34, Math.round((3 + n * 0.9) * (0.6 + 0.4 * np)));
    const pool = [["grunt", 10]];
    if (n >= 2) pool.push(["runner", 5]);
    if (n >= 3) pool.push(["shooter", 4]);
    if (n >= 4) pool.push(["tank", 2]);
    const total = pool.reduce((a, p) => a + p[1], 0);
    const pick = () => { let r = Math.random() * total; for (const [t, w] of pool) { if ((r -= w) < 0) return t; } return "grunt"; };
    if (boss) { const [x, y] = [0, ARENA_H / 2 - 40]; this.spawnEnemy("boss", x, y, hpMult * (1 + (n / 5 - 1) * 0.5), 1.2); }
    const normal = boss ? Math.round(count * 0.5) : count;
    for (let i = 0; i < normal; i++) { const [x, y] = spawnAt(); this.spawnEnemy(pick(), x, y, hpMult, 0.7 + i * 0.12); }
  }
  clearRoom() {
    this.state = "clear"; this.arena.locked = false; this.portalT = 0;
    const np = this.heroes.length, boss = this.room % 5 === 0;
    const count = Math.min(6, Math.max(2, np + 1));
    for (let i = 0; i < count; i++) this.spawnWeaponPickup((i - (count - 1) / 2) * 34, -5, randomWeapon(this.room, boss ? 1 : 0));
    this.spawnHeart(-60, -25); if (np >= 3) this.spawnHeart(60, -25);
    for (const h of this.heroes) if (!h.alive) h.revive(3);
    const go = this.App.create("portal"); go.transform.setPosition(0, ARENA_H / 2 - 32);
    go.addComponent(new DrawRenderer(ctx => {
      const t = performance.now() / 1000, r = 13 + Math.sin(t * 4) * 1.5;
      ctx.strokeStyle = "#80deea"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
      ctx.fillStyle = "#4dd0e1"; ctx.globalAlpha = 0.25 + this.portalT * 0.5; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.globalAlpha = 1; ctx.scale(1, -1); ctx.fillStyle = "#fff"; ctx.font = "6px monospace"; ctx.textAlign = "center"; ctx.fillText("다음 방", 0, 22);
    }, 30, { order: 1 }));
    this.portal = go;
    Events.emit("room.cleared", { room: this.room });
  }
  gameOver() { this.state = "over"; this.overTimer = 6; }
  restart() {
    for (const h of this.heroes) { h.weapon = { id: "sword", tier: 0 }; h.kills = 0; h.hp = h.maxHp; h.alive = true; h.invuln = 0; }
    this.startRoom(1);
  }

  // ---------- 플레이어 ----------
  addHero(keyboard = false) {
    const id = this.nextId++;
    const go = this.App.create("hero" + id);
    go.transform.setPosition((Math.random() - 0.5) * 40, -ARENA_H / 2 + 25);
    const h = go.addComponent(new Hero(this, id)); h.setup(); h.keyboard = keyboard;
    this.heroes.push(h);
    if (this.state === "clear") h.revive(h.maxHp);
    return h;
  }
  removeHero(h) { h.gameObject.destroy(); this.heroes = this.heroes.filter(x => x !== h); }

  _keyboard() {
    if (Input.getKeyDown("KeyK") && !this.heroes.some(h => h.keyboard)) this.addHero(true);
    const h = this.heroes.find(x => x.keyboard); if (!h) return;
    const k = c => (Input.getKey(c) ? 1 : 0);
    Object.assign(h.input, { mx: k("KeyD") - k("KeyA"), my: k("KeyW") - k("KeyS"), atk: k("KeyJ") || k("Space"), dash: k("KeyL") || k("ShiftLeft") });
  }

  update(dt) {
    this._keyboard();
    this.enemies = this.enemies.filter(e => !e.gameObject.isDestroyed);
    this.projs = this.projs.filter(p => !p.gameObject.isDestroyed);
    this.pickups = this.pickups.filter(p => !p.gameObject.isDestroyed);
    this.introTimer -= dt;
    if (this.heroes.length) {
      if (this.state === "fight") {
        if (this.enemies.length === 0) this.clearRoom();
        else if (this.heroes.every(h => !h.alive)) this.gameOver();
      } else if (this.state === "clear") this._updatePortal(dt);
      else if (this.state === "over") { this.overTimer -= dt; if (this.overTimer <= 0) this.restart(); }
    }
    this._sendStatus(dt);
    this._updateHud();
  }
  _updatePortal(dt) {
    const alive = this.heroes.filter(h => h.alive); if (!alive.length) return;
    const inside = alive.filter(h => Math.hypot(h.transform.position.x, h.transform.position.y - (ARENA_H / 2 - 32)) < 16).length;
    if (inside >= Math.ceil(alive.length / 2)) this.portalT += dt / 1.5; else this.portalT = Math.max(0, this.portalT - dt);
    if (this.portalT >= 1) this.startRoom(this.room + 1);
  }

  // ---------- HUD ----------
  _text(name, opts, setup) {
    const go = this.App.createUI(name), rt = go.getComponent(RectTransform);
    setup(rt);
    return go.addComponent(new UIText("", opts));
  }
  _buildHud() {
    this.hudTop = this._text("top", { fontSize: 9, align: "left", verticalAlign: "top" }, rt => rt.setAnchor(0, 0, 1, 0).setPivot(0, 0).setOffsets(8, 6, 0, 0));
    this.hudRoom = this._text("room", { fontSize: 8, align: "right", verticalAlign: "top", color: "#9ab" }, rt => rt.setAnchor(0, 0, 1, 0).setPivot(0, 0).setOffsets(0, 6, 8, 0));
    this.hudCenter = this._text("center", { fontSize: 15, wrap: true }, rt => rt.setAnchor(0, 0, 1, 1).setOffsets(20, 20, 20, 20));
    this.hudHeroes = this._text("heroes", { fontSize: 7, align: "left", verticalAlign: "bottom", wrap: true }, rt => rt.setAnchor(0, 0, 1, 1).setOffsets(8, 0, 8, 5));
  }
  _updateHud() {
    this.hudTop.setText(`ROOM ${this.room}${this.room % 5 === 0 ? "  ★BOSS" : ""}   남은 적 ${this.enemies.length}`);
    this.hudRoom.setText(this.roomCode ? `방 코드 ${this.roomCode}` : "");
    this.hudHeroes.setText(this.heroes.map(h => `P${h.id + 1} ${h.alive ? "♥".repeat(h.hp) + "♡".repeat(h.maxHp - h.hp) : "💀"} ${weaponLabel(h.weapon)} (${h.kills})`).join("    "));
    let c = "";
    if (!this.heroes.length) c = this.roomCode ? `폰으로 접속하세요\n방 코드: ${this.roomCode}\n(키보드: K — WASD 이동, J 공격, L 대시)` : "서버 연결 중...";
    else if (this.state === "over") c = `GAME OVER\nROOM ${this.room} 도달\n${Math.ceil(this.overTimer)}초 후 재시작`;
    else if (this.state === "fight" && this.introTimer > 0) c = `ROOM ${this.room}${this.room % 5 === 0 ? "\nBOSS!" : ""}`;
    else if (this.state === "clear") c = this.introTimer > -3 ? "CLEAR!\n무기 위에 서 있으면 교체 · 포털로 이동" : "";
    this.hudCenter.setText(c);
  }

  // ---------- 폰 연결 (PeerJS) ----------
  async startNet() {
    const options = await getPeerOptions();
    const open = () => {
      const code = makeCode();
      const peer = new Peer(codeToPeerId(code), options);
      peer.on("open", () => { this.roomCode = code; this.peer = peer; });
      peer.on("error", e => {
        if (e.type === "unavailable-id") { peer.destroy(); open(); }
        else console.warn("peer error", e.type);
      });
      peer.on("disconnected", () => peer.reconnect());
      peer.on("connection", c => this._onConn(c));
    };
    open();
  }
  _onConn(c) {
    c.on("open", () => {
      const h = this.addHero();
      this.conns.set(c, h);
      c.send({ t: "welcome", id: h.id, color: h.color });
    });
    c.on("data", d => {
      const h = this.conns.get(c); if (!h || !d) return;
      if (d.t === "s") Object.assign(h.input, { mx: +d.mx || 0, my: +d.my || 0, ax: +d.ax || 0, ay: +d.ay || 0, atk: d.atk ? 1 : 0, dash: d.dash ? 1 : 0 });
    });
    const leave = () => { const h = this.conns.get(c); if (h) { this.removeHero(h); this.conns.delete(c); } };
    c.on("close", leave); c.on("error", leave);
  }
  _sendStatus(dt) {
    this._statusCd = (this._statusCd || 0) - dt;
    if (this._statusCd > 0) return; this._statusCd = 0.2;
    for (const [c, h] of this.conns) if (c.open) c.send({ t: "st", hp: h.hp, maxHp: h.maxHp, alive: h.alive, weapon: weaponLabel(h.weapon), room: this.room, kills: h.kills });
  }
}
