// 파티 게임 호스트 네트워크 + 플레이어 명단. TV(party/tv.html)에서만 쓴다.
//  · 방 코드(shared/room.js) + PeerJS, json 직렬화(iOS), 폰이 150ms마다 상태를 보내고 600ms 넘게 소식이 없으면 입력을 0으로 만든다.
//  · 폰마다 기기 ID(pid)로 플레이어를 기억한다: 끊겼다 같은 폰이 다시 오면 같은 플레이어(점수·색)로 이어진다.
//  · 미니게임이 읽는 입력(ctx.input)은 이 파일의 PlayerInput이 만든다 (눌림/뗌 엣지를 래치해서 프레임 사이의 짧은 탭도 놓치지 않는다).
const PLAYER_COLORS = ["#ff5252", "#448aff", "#69f0ae", "#ffd740", "#e040fb", "#ff9100", "#18ffff", "#ff80ab"];
const STALE_MS = 600, MAX_PLAYERS = 8, BTN_IDS = ["a", "b", "c", "d"];

class PlayerInput {
  constructor() {
    this.mx = 0; this.my = 0; this.ax = 0; this.ay = 0; this.buttons = { a: false, b: false, c: false, d: false };
    this.motion = null; // 폰 모션 센서 값 { ax, ay, az, gx, gy, gz } (layout.motion 일 때만)
    this._down = {}; this._up = {}; this._pd = {}; this._pu = {};
  }
  pressed(id) { return !!this._pd[id]; }   // 이번 update에서 막 눌렸나
  released(id) { return !!this._pu[id]; }  // 이번 update에서 막 뗐나
  held(id) { return !!this.buttons[id]; }
  // 폰에서 온 상태를 반영 (버튼 래치)
  apply(d) {
    this.mx = +d.mx || 0; this.my = +d.my || 0; this.ax = +d.ax || 0; this.ay = +d.ay || 0;
    const b = d.b || {};
    for (const id of BTN_IDS) { const v = !!b[id]; if (v && !this.buttons[id]) this._down[id] = true; if (!v && this.buttons[id]) this._up[id] = true; this.buttons[id] = v; }
    if (d.m) this.motion = d.m;
  }
  zero() { this.mx = this.my = this.ax = this.ay = 0; for (const id of BTN_IDS) { if (this.buttons[id]) this._up[id] = true; this.buttons[id] = false; } }
  // 매 프레임 한 번: 래치 → 이번 프레임 엣지로 옮김
  frame() { this._pd = this._down; this._pu = this._up; this._down = {}; this._up = {}; }
}

class PartyNet {
  constructor(host) {
    this.host = host; this.roster = new Map(); // pid -> player
    this.peer = null; this.roomCode = ""; this.nextIndex = 0;
  }
  async start() {
    const options = await getPeerOptions();
    const open = () => {
      const code = makeCode();
      const peer = new Peer(codeToPeerId(code), options);
      peer.on("open", () => { this.roomCode = code; this.peer = peer; });
      peer.on("error", e => { if (e.type === "unavailable-id") { peer.destroy(); open(); } else console.warn("peer error", e.type); });
      peer.on("disconnected", () => peer.reconnect());
      peer.on("connection", c => this._onConn(c));
    };
    open();
  }
  get players() { return [...this.roster.values()]; }
  get connected() { return this.players.filter(p => p.connected); }
  // 방장: 먼저 들어온 (아직 연결된) 사람. 폰이 없고 키보드뿐이면 키보드 플레이어
  get owner() { return this.players.find(p => p.connected) || null; }

  _newPlayer(pid, name) {
    const used = new Set(this.players.map(p => p.color));
    const color = PLAYER_COLORS.find(c => !used.has(c)) || PLAYER_COLORS[this.nextIndex % PLAYER_COLORS.length];
    const idx = this.nextIndex++;
    const p = { id: "p" + idx, pid, index: idx, nick: name || "P" + (idx + 1), color, conn: null, connected: false, ready: false, score: 0, input: new PlayerInput(), lastMsg: 0, joinedAt: performance.now(), local: false };
    this.roster.set(pid, p); return p;
  }
  addLocal(pid, name) { // TV 키보드 플레이어
    let p = this.roster.get(pid); if (!p) p = this._newPlayer(pid, name); p.local = true; p.connected = true; p.lastMsg = Infinity; this.host.onPlayerChange(p, "join"); return p;
  }
  _onConn(c) {
    c.on("data", d => {
      if (!d) return;
      if (d.t === "hello") { this._bind(c, d); return; }
      const p = c._player; if (!p || p.conn !== c) return;
      if (d.t === "s") { p.input.apply(d); p.lastMsg = performance.now(); }
      else if (d.t === "ready") { p.lastMsg = performance.now(); this.host.onReady(p, !!d.v); }
    });
    const leave = () => { const p = c._player; if (p && p.conn === c) this._drop(p); };
    c.on("close", leave); c.on("error", leave);
  }
  _bind(c, d) {
    const pid = String(d.pid || "").slice(0, 64); if (!pid) return;
    let p = this.roster.get(pid), rejoin = !!p;
    if (!p) { if (this.players.length >= MAX_PLAYERS) { try { c.send({ t: "full" }); c.close(); } catch (e) {} return; } p = this._newPlayer(pid); }
    const nick = Array.from(String(d.name || "").replace(/[<>]/g, "").trim()).slice(0, 10).join(""); if (nick) p.nick = nick;
    if (p.conn && p.conn !== c) { const old = p.conn; p.conn = null; try { old.close(); } catch (e) {} } // 같은 기기가 다시 접속하면 이전 연결은 끊는다
    p.conn = c; c._player = p; p.connected = true; p.lastMsg = performance.now(); p.input.zero();
    c.send({ t: "welcome", id: p.id, color: p.color, name: p.nick, rejoined: rejoin, owner: this.owner === p });
    this.host.onPlayerChange(p, rejoin ? "rejoin" : "join");
    this.sendLayout(p);
  }
  _drop(p) {
    p.conn = null; p.connected = false; p.input.zero(); p.ready = false;
    this.host.onPlayerChange(p, "leave");
  }
  kick(p) { if (p.conn) { try { p.conn.send({ t: "kick" }); p.conn.close(); } catch (e) {} } this.roster.delete(p.pid); this.host.onPlayerChange(p, "kick"); }
  // 이 플레이어(또는 모두)에게 지금 화면 구성을 보낸다
  sendLayout(p) {
    const targets = p ? [p] : this.players;
    for (const q of targets) { const L = this.host.layoutFor(q); if (L && q.conn && q.conn.open) q.conn.send({ t: "layout", ...L }); }
  }
  sendAll(msg) { for (const q of this.players) if (q.conn && q.conn.open) q.conn.send(msg); }
  // 매 프레임: 끊김 감지(600ms 무소식 → 입력 0), 입력 엣지 갱신
  tick() {
    const now = performance.now();
    for (const p of this.roster.values()) {
      if (p.conn && now - p.lastMsg > STALE_MS) p.input.zero();
      p.input.frame();
    }
  }
}
if (typeof window !== "undefined") { window.PartyNet = PartyNet; window.PlayerInput = PlayerInput; window.PLAYER_COLORS = PLAYER_COLORS; }
