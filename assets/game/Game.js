// 게임 진행(웨이브·점수·HUD)과 폰 접속 처리
class Game extends Component {
  constructor(App) {
    super();
    this.App = App; this.cam = App.camera;
    this.ships = []; this.enemies = []; this.conns = new Map();
    this.state = "play"; this.time = 0; this.spawnCd = 1; this.overTimer = 0; this.nextId = 0;
  }
  awake() {
    const App = this.App;
    const bg = App.create("arena"); bg.addComponent(new ArenaRenderer(ARENA_W, ARENA_H));
    const fxGo = App.create("fx"); this.fx = fxGo.addComponent(new ParticleSystem({ capacity: 2048 }));
    this._buildHud();
    Events.on("enemy.killed", () => this.cam.shake(0.8, 0.08), { owner: this });
  }

  // ---------- HUD ----------
  _text(name, opts, setup) {
    const go = this.App.createUI(name), rt = go.getComponent(RectTransform);
    setup(rt);
    return go.addComponent(new UIText("", opts));
  }
  _buildHud() {
    this.hudScore = this._text("score", { fontSize: 10, align: "left", verticalAlign: "top" }, rt => rt.setAnchor(0, 0, 1, 0).setPivot(0, 0).setOffsets(8, 6, 0, 0));
    this.hudRoom = this._text("room", { fontSize: 9, align: "right", verticalAlign: "top", color: "#9ab" }, rt => rt.setAnchor(0, 0, 1, 0).setPivot(0, 0).setOffsets(0, 6, 8, 0));
    this.hudCenter = this._text("center", { fontSize: 16, wrap: true, color: "#fff" }, rt => rt.setAnchor(0, 0, 1, 1).setOffsets(20, 20, 20, 20));
    this.hudPlayers = this._text("players", { fontSize: 8, align: "left", verticalAlign: "bottom", wrap: true }, rt => rt.setAnchor(0, 0, 1, 1).setOffsets(8, 0, 0, 6));
  }
  _updateHud() {
    const total = this.ships.reduce((a, s) => a + s.score, 0);
    this.hudScore.setText(`SCORE ${total}   WAVE ${this.wave}`);
    this.hudRoom.setText(this.roomCode ? `방 코드 ${this.roomCode}` : "");
    this.hudPlayers.setText(this.ships.map(s => `P${s.id + 1} ${s.alive ? "♥".repeat(s.hp) : "💀 부활 " + Math.ceil(s.respawn) + "초"}  ${s.score}`).join("   "));
    if (!this.ships.length) this.hudCenter.setText(this.roomCode ? `폰으로 접속하세요\n방 코드: ${this.roomCode}\n(키보드: K 키로 1P 참가 — WASD 이동, 방향키 조준)` : "서버 연결 중...");
    else if (this.state === "over") this.hudCenter.setText(`GAME OVER\n점수 ${total}\n${Math.ceil(this.overTimer)}초 후 재시작`);
    else this.hudCenter.setText("");
  }

  get wave() { return 1 + Math.floor(this.time / 20); }

  // ---------- 플레이어 ----------
  addShip(keyboard = false) {
    const id = this.nextId++;
    const go = this.App.create("ship" + id);
    go.transform.setPosition((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 40);
    const ship = go.addComponent(new Ship(this, id, PLAYER_COLORS[id % PLAYER_COLORS.length]));
    ship.keyboard = keyboard;
    this.ships.push(ship);
    return ship;
  }
  removeShip(ship) { ship.gameObject.destroy(); this.ships = this.ships.filter(s => s !== ship); }

  spawnBullet(owner, angle) {
    const go = this.App.create("bullet"), p = owner.transform.position;
    go.transform.setPosition(p.x + Math.cos(angle) * 8, p.y + Math.sin(angle) * 8);
    go.addComponent(new Bullet(this, owner, angle));
  }
  spawnEnemy() {
    const w = this.wave, r = Math.random();
    const type = w >= 3 && r < 0.15 ? "tank" : w >= 2 && r < 0.45 ? "runner" : "grunt";
    // 아레나 바깥 가장자리 한 곳에서 등장
    const side = Math.floor(Math.random() * 4), hw = ARENA_W / 2, hh = ARENA_H / 2;
    const x = side < 2 ? (side ? hw : -hw) : (Math.random() * 2 - 1) * hw;
    const y = side < 2 ? (Math.random() * 2 - 1) * hh : (side === 2 ? hh : -hh);
    const go = this.App.create("enemy"); go.transform.setPosition(x, y);
    this.enemies.push(go.addComponent(new Enemy(this, type)));
  }

  _keyboard(dt) {
    if (Input.getKeyDown("KeyK") && !this.ships.some(s => s.keyboard)) this.addShip(true);
    const ks = this.ships.find(s => s.keyboard); if (!ks) return;
    const k = c => (Input.getKey(c) ? 1 : 0);
    ks.input.mx = k("KeyD") - k("KeyA"); ks.input.my = k("KeyW") - k("KeyS");
    ks.input.ax = k("ArrowRight") - k("ArrowLeft"); ks.input.ay = k("ArrowUp") - k("ArrowDown");
  }

  update(dt) {
    this._keyboard(dt);
    this.enemies = this.enemies.filter(e => !e.gameObject.isDestroyed);
    if (this.state === "play") {
      if (this.ships.length) {
        this.time += dt;
        this.spawnCd -= dt;
        if (this.spawnCd <= 0) {
          this.spawnCd = Math.max(0.3, 1.5 - this.wave * 0.14) / Math.sqrt(this.ships.length);
          if (this.enemies.length < 60) this.spawnEnemy();
        }
        if (this.ships.every(s => !s.alive)) this._gameOver();
      }
    } else {
      this.overTimer -= dt;
      if (this.overTimer <= 0) this._restart();
    }
    this._sendStatus(dt);
    this._updateHud();
  }
  _gameOver() { this.state = "over"; this.overTimer = 6; Events.emit("game.over", {}); }
  _restart() {
    for (const e of this.enemies) e.gameObject.destroy();
    this.enemies = []; this.time = 0; this.spawnCd = 1; this.state = "play";
    for (const s of this.ships) { s.score = 0; s.revive(); }
  }

  // ---------- 폰 연결 (PeerJS) ----------
  startNet() {
    const open = () => {
      const code = makeCode();
      const peer = new Peer(codeToPeerId(code));
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
      if (this.ships.length >= PLAYER_COLORS.length) { c.send({ t: "full" }); setTimeout(() => c.close(), 200); return; }
      const ship = this.addShip();
      this.conns.set(c, ship);
      c.send({ t: "welcome", id: ship.id, color: ship.color });
    });
    c.on("data", d => {
      const ship = this.conns.get(c); if (!ship || !d) return;
      if (d.t === "s") Object.assign(ship.input, { mx: +d.mx || 0, my: +d.my || 0, ax: +d.ax || 0, ay: +d.ay || 0 });
    });
    const leave = () => { const s = this.conns.get(c); if (s) { this.removeShip(s); this.conns.delete(c); } };
    c.on("close", leave); c.on("error", leave);
  }
  _sendStatus(dt) {
    this._statusCd = (this._statusCd || 0) - dt;
    if (this._statusCd > 0) return; this._statusCd = 0.2;
    for (const [c, s] of this.conns) if (c.open) c.send({ t: "st", hp: s.hp, maxHp: s.maxHp, alive: s.alive, score: s.score, over: this.state === "over" });
  }
}
