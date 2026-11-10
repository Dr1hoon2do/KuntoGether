// 던전 진행: 층 → 방(문으로 이동) → 전투/보물/상점/보스, 아이템·골드, HUD, 폰 접속 처리
const HEART_PRICE = 4; // 상점 하트 가격 (고정)
// ── 경제: 적은 골드를 떨어뜨리지 않는다. 방을 클리어하면 보상이 바닥에 떨어지고, 닿으면 얻는다 (아이작식) ──
// 코인은 1(구리)/3(은)/5(금)/10(파랑) 네 가지. 3·5·10은 드물다. 확률은 인원수가 늘면 조금씩(perPlayer) 늘어난다.
const ECON = {
  coinW: [[1, 0.80], [3, 0.12], [5, 0.06], [10, 0.02]], // 코인 값 확률 (bias가 클수록 비싼 코인이 잘 나옴)
  perPlayer: 0.12,                                       // 인원수 1명 추가당 보상 확률 +12%
  floorTaper: 0.05,                                      // 층이 오를수록 방이 많아지므로 층당 5%씩 줄임 (최소 65%)
  normal: { coin: 0.36, coin2: 0.12, key: 0.10, heart: 0.05, bundle: 0.03, chest: 0.05 },
  elite:  { coins: 2, coinExtra: 0.3, key: 0.35, heart: 0.15, bundle: 0.10, chest: 0.20, bias: 0.3 },
  boss:   { coins: 3, coinExtra: 0.4, key: 0.6, heart: 0.5, bias: 0.4 },
  crate:  { coin: 0.20, key: 0.04 },                     // 상자(부수는 지형)
  bundle: { pieces: [3, 4], coin: 0.72, key: 0.14, heart: 0.14 }, // 꾸러미가 터지면 나오는 것
  chest:  { coins: [2, 3], bias: 0.4, heart: 0.30, key: 0.12, item: 0.08 }, // 열쇠 1개로 여는 상자
};
class Game extends Component {
  constructor(App) {
    super();
    this.App = App; this.cam = App.camera;
    this.heroes = []; this.roster = new Map(); this.enemies = []; this.projs = []; this.pickups = []; this.conns = new Map();
    this.floorNum = 1; this.map = null; this.cur = null; this.state = "explore"; // explore | fight | over | victory
    this.nextId = 0; this.overTimer = 0; this.introTimer = 0; this.introText = "";
    this.doorHold = 0; this.stairsHold = 0; this.stairsGO = null;
    this.usedBosses = new Set(); this.gold = 0; this.keys = 0; this.obstacles = []; this.walls = []; this.bombs = []; // gold·keys: 팀 공유
    this.difficulty = "normal"; this.runStarted = false; // 난이도는 첫 문으로 나가기 전(런 시작 전)에만 바꿀 수 있다
  }
  awake() {
    const App = this.App;
    this.arena = App.create("arena").addComponent(new ArenaRenderer(this, ARENA.w, ARENA.h));
    App.create("minimap").addComponent(new MinimapRenderer(this));
    this.fx = App.create("fx").addComponent(new ParticleSystem({ capacity: 2048 }));
    // 카메라: 배율은 항상 같고, 플레이어들을 따라간다 (큰 방에서 화면 밖으로 멀리 나간 플레이어는 그냥 안 보인다)
    this.camTarget = App.create("camtarget"); this.camFollow = this.cam.gameObject.addComponent(new CameraFollow({ target: this.camTarget.transform, smoothing: 7 }));
    this._buildHud();
    Events.on("enemy.killed", e => {
      this.cam.shake(e.enemy.boss ? 6 : 0.8, e.enemy.boss ? 0.6 : 0.08);
      const by = e.by; if (!by || !by.stats) return;
      if (by.stats.lifesteal && Math.random() < by.stats.lifesteal) by.heal(1);
      if (by.stats.killInvuln) by.invuln = Math.max(by.invuln, by.stats.killInvuln);
      itemsOnKill(this, by, e.enemy); // 처치 관련 아이템·세트 효과 → kill 훅
      if (!e.enemy.boss && Math.random() < 0.005 + by.stats.heartDrop) { const q = e.enemy.transform.position; this.spawnHeart(q.x, q.y); }
    }, { owner: this });
    Events.on("hero.hit", () => this._flashVignette(), { owner: this });
    this.startRun();
  }

  // ---------- 생성 도우미 ----------
  spawnSlash(hero, dir, w, anchor) { // anchor: 휘두르는 위치를 따라갈 대상 (분신·아군·잔향). 기본은 hero 자신
    const anc = anchor || hero.transform, go = this.App.create("slash"), p = anc.position, color = w.color || TIERS[hero.weapon.tier].color;
    go.transform.setPosition(p.x, p.y); go.transform.rotation = dir;
    let t = 0; const dur = w.dur, half = (w.arc * Math.PI / 180) / 2;
    go.addComponent(new DrawRenderer(ctx => {
      const k = Math.min(1, t / dur); ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.lineCap = "round";
      if (w.kind === "thrust") {
        const len = w.range * Math.min(1, k * 2.5 + 0.3), tw = Math.max(3.5, Math.min(9, w.range * half * 0.5)); // tw: 찌르기 판정 폭(Hero._strike와 같은 값)
        ctx.save(); ctx.globalAlpha *= 0.35; ctx.lineWidth = tw * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w.range * Math.min(1, k * 2.5 + 0.3), 0); ctx.stroke(); ctx.restore(); // 굵은 선 = 실제 맞는 범위
        ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(len, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(len + 5, 0); ctx.lineTo(len - 3, 3); ctx.lineTo(len - 3, -3); ctx.closePath(); ctx.fill();
      } else {
        const sweep = w.arc >= 360 ? Math.PI * 2 : half * 2, start = w.arc >= 360 ? 0 : -half, cur = start + sweep * Math.min(1, k * 1.6);
        ctx.globalAlpha *= 0.55; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, w.range, start, cur); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1 - k * k; ctx.beginPath(); ctx.arc(0, 0, w.range, start, cur); ctx.stroke();
      }
    }, w.range + 10, { order: 8 }));
    go.addComponent(new (class extends Component { update(dt) { t += dt; go.transform.setPosition(anc.position.x, anc.position.y); if (t > dur) go.destroy(); } })());
  }
  spawnProj(x, y, angle, speed, dmg, fromPlayer, opts) {
    if (!fromPlayer && this.projs.length >= BALANCE.maxEnemyProjectiles) return;
    const go = this.App.create("proj"); go.transform.setPosition(x, y);
    const pr = go.addComponent(new Projectile(this, angle, speed, dmg, fromPlayer, opts)); pr.setup();
    if (opts && opts.owner) pr.owner = opts.owner;
    this.projs.push(pr);
  }
  spawnHazard(x, y, r, delay, dmg, color) {
    const go = this.App.create("hazard"); go.transform.setPosition(x, y);
    const hz = go.addComponent(new Hazard(this, r, delay, dmg, color)); hz.setup(); return hz;
  }
  spawnEnemy(type, x, y, opts) {
    const go = this.App.create("enemy"); go.transform.setPosition(x, y);
    const e = go.addComponent(new Enemy(this, type, opts)); e.setup(); this.enemies.push(e); return e;
  }
  _makePickup(d) {
    const go = this.App.create("pickup_" + d.type); go.transform.setPosition(d.x, d.y);
    const pk = go.addComponent(new Pickup(this, d)); pk.setup(); this.pickups.push(pk); return pk;
  }
  // ---------- 난이도 ----------
  diffProfile() { return DIFFICULTY[this.difficulty] || DIFFICULTY.normal; }
  // 런이 시작되기 전(첫 문으로 나가기 전)에만 바뀐다. 플레이어 시작 HP도 난이도에 따라 달라진다.
  setDifficulty(d, by, silent) {
    if (!DIFFICULTY[d] || (this.runStarted && !silent)) return false;
    this.difficulty = d; const hp = this.diffProfile().playerHp;
    if (!this.runStarted) for (const h of this.roster.values()) { h.maxHp = h.hp = hp; }
    return true;
  }
  // 방장 = 먼저 접속한 (아직 연결돼 있는) 폰 플레이어
  _owner() { for (const h of this.roster.values()) if (h.conn && this.heroes.includes(h)) return h; return null; }

  // ---------- 파티(골드 관련 아이템은 모두에게 적용) ----------
  // 이벤트 훅 호출: 모든 플레이어가 가진 아이템의 on[evt](주인, 일으킨 플레이어 src, a, b)를 부른다. 이름 목록은 Items.js 맨 위 참고.
  fire(evt, src, a, b) { for (const h of this.heroes) { const l = h.hooks[evt]; if (l) for (let i = 0; i < l.length; i++) l[i](h, src, a, b); } }
  partySum(k) { let a = 0; for (const h of this.heroes) a += h.stats[k] || 0; return a; }
  partyAny(k) { return this.heroes.some(h => h.stats[k]); }
  partyMul(k) { let a = 1; for (const h of this.heroes) a *= h.stats[k]; return a; }
  addKey(n = 1) { this.keys += n; return n; }
  addGold(n) { const v = Math.max(1, Math.round(n * this.partyMul("gold"))); this.gold += v; return v; }
  puff(h, colors) { const p = h.transform.position; this.fx.emit(p.x, p.y, { count: 10, colors, speed: [20, 70], life: [0.2, 0.45], size: [1, 2], fade: true }); }

  // ---------- 지형지물 ----------
  _makeObstacle(d) {
    const go = this.App.create("obstacle_" + d.kind); go.transform.setPosition(d.x, d.y);
    const o = go.addComponent(new Obstacle(this, d)); o.setup(); this.obstacles.push(o); return o;
  }
  // 방 바깥 벽: 방 전체 바운딩 박스를 둘러싼 4개의 고정 콜라이더 (L자 방의 빈 칸은 void 지형이 막는다)
  _buildWalls() {
    for (const w of this.walls) if (!w.isDestroyed) w.destroy();
    this.walls = []; const T = 80, hw = ARENA.w / 2, hh = ARENA.h / 2;
    for (const [x, y, w, h] of [[0, hh + T / 2, ARENA.w + T * 2, T], [0, -hh - T / 2, ARENA.w + T * 2, T], [hw + T / 2, 0, T, ARENA.h], [-hw - T / 2, 0, T, ARENA.h]]) {
      const go = this.App.create("wall"); go.transform.setPosition(x, y); go.addComponent(Collider2D.box(w, h, { layer: "Wall", body: "static" })); this.walls.push(go);
    }
  }
  // 원(x,y,r)이 (dx,dy)만큼 움직인다 — 벽·지형에 막히면 미끄러진다(터널링 없음). out.x/out.y/out.hit/out.collider
  moveBody(x, y, r, dx, dy, out, self, mask = PL.Solid) { return Physics.moveCircle(x, y, r, dx, dy, mask, out, self); }
  // 원(x,y,r)이 지형에 겹치면 밖으로 밀어낸다. [x, y, 막혔는지]
  pushOut(x, y, r) { const o = Game._po; Physics.moveCircle(x, y, r, 0, 0, PL.Solid, o); return [o.x, o.y, o.hit]; }
  static _po = { x: 0, y: 0, hit: false, nx: 0, ny: 0, collider: null };
  obstacleAt(x, y, r) { const c = Physics.pointQuery(x, y, r, PL.Obstacle); return c ? c.data : null; }
  // 폭발: 적에게 eDmg, 플레이어에게 hDmg(0이면 안 다침), 범위 안의 바위·상자·통은 부서진다
  explode(x, y, r, eDmg, hDmg, src) {
    const buf = []; // 피해 중에 연쇄 폭발이 같은 질의 버퍼를 덮어쓰지 않게 새 배열을 쓴다
    let n = Physics.overlapCircle(x, y, r, PL.Enemy, buf); for (let i = 0; i < n; i++) { const e = buf[i].data; if (e.dead || e.spawnDelay > 0) continue; const ep = e.transform.position; e.damage(eDmg, src && src.stats ? src : null, Math.atan2(ep.y - y, ep.x - x), 120); }
    if (hDmg > 0) { n = Physics.overlapCircle(x, y, r, PL.Hero, buf); for (let i = 0; i < n; i++) { const h = buf[i].data; if (h.alive) h.hit(hDmg, x, y, 160); } }
    n = Physics.overlapCircle(x, y, r, PL.Obstacle, buf); for (let i = 0; i < n; i++) { const o = buf[i].data; if (o.destructible) o.damage(99, src, true); }
    this.fx.emit(x, y, { count: 26, colors: ["#ff7043", "#ffee58", "#fff"], speed: [40, 130], life: [0.2, 0.5], size: [1.5, 3], fade: true, area: r * 0.3 });
    this.cam.shake(4, 0.25); SFX.play("boom");
  }
  cancelProjectiles(x, y, r) { const buf = [], n = Physics.overlapCircle(x, y, r, PL.EProj, buf); for (let i = 0; i < n; i++) { const pr = buf[i].data; if (pr.fromPlayer || pr.gameObject.isDestroyed || pr.orbit) continue; pr.gameObject.destroy(); } }
  shockwave(x, y, r, dmg, knock, hero) {
    this.cancelProjectiles(x, y, r);
    const buf = [], n = Physics.overlapCircle(x, y, r, PL.Enemy, buf);
    for (let i = 0; i < n; i++) { const e = buf[i].data; if (e.dead || e.spawnDelay > 0) continue; const ep = e.transform.position; e.damage(dmg * (hero ? hero.stats.dmg : 1), hero, Math.atan2(ep.y - y, ep.x - x), knock); }
    this.fx.emit(x, y, { count: 24, colors: ["#fff", "#b3e5fc"], speed: [60, 140], life: [0.2, 0.4], size: [1, 2], fade: true, area: 4 }); this.cam.shake(3, 0.2); SFX.play("boom");
  }
  spawnBomb(x, y, owner) {
    const go = this.App.create("bomb"); go.transform.setPosition(x, y);
    const b = go.addComponent(new Bomb(this, owner)); b.setup(); this.bombs.push(go);
  }

  // 플레이어가 공격(터치)할 때 호출: 가까이 있는 무기·아이템·상점 하트를 획득·구매한다
  tryInteract(h) {
    const p = h.transform.position; let best = null, bd = PICK_R + h.radius;
    for (const pk of this.pickups) {
      if (pk.gameObject.isDestroyed || pk.touch) continue;
      const q = pk.transform.position, d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = pk; }
    }
    return best ? best.interact(h) : false;
  }
  // 코인 값 뽑기 (bias 0~1: 클수록 3·5·10이 잘 나온다)
  rollCoinValue(bias = 0) {
    const W = ECON.coinW; let tot = 0; for (let i = 0; i < W.length; i++) tot += W[i][1] * (i ? 1 + bias * 3 : 1);
    let r = Math.random() * tot; for (let i = 0; i < W.length; i++) { r -= W[i][1] * (i ? 1 + bias * 3 : 1); if (r < 0) return W[i][0]; }
    return 1;
  }
  spawnCoin(x, y, value) {
    if (this.partyAny("autoCoin")) { this.addGold(value); this.fire?.("coinPickup", null, value); return null; } // 도굴꾼 주머니: 바로 팀 골드로
    return this._makePickup({ type: "coin", value, x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8 });
  }
  spawnKey(x, y) { return this._makePickup({ type: "key", x, y }); }
  spawnBundle(x, y) { return this._makePickup({ type: "bundle", x, y }); }
  spawnChest(x, y) { return this._makePickup({ type: "chest", x, y, lock: 0.6 }); }
  // 방 안의 빈 자리 (큰 방이면 아무 칸, 지형 위는 피한다)
  _dropSpot(spread = 55) {
    const cells = ARENA.cells && ARENA.cells.length ? ARENA.cells : [{ x: 0, y: 0 }]; let x = 0, y = 0;
    for (let t = 0; t < 14; t++) {
      const c = cells[Math.floor(Math.random() * cells.length)]; x = c.x + (Math.random() * 2 - 1) * spread; y = c.y + (Math.random() * 2 - 1) * spread * 0.7;
      let bad = false; for (const o of this.obstacles) { const q = o.transform.position; if (Math.abs(q.x - x) < o.w / 2 + 9 && Math.abs(q.y - y) < o.h / 2 + 9) { bad = true; break; } }
      if (!bad) break;
    }
    return { x, y };
  }
  spawnHeart(x, y, price = 0) { return this._makePickup({ type: "heart", price, x, y }); }
  spawnWeaponPickup(x, y, weapon, price = 0, lock = 0.8) { return this._makePickup({ type: "weapon", weapon, price, x, y, lock }); }
  spawnItemPickup(x, y, id, price = 0) { return this._makePickup({ type: "item", id, price, x, y }); }
  spawnActivePickup(x, y, id, price = 0) { return this._makePickup({ type: "active", id, price, x, y, state: null }); }
  // n개를 한 줄에 최대 8개씩 가지런히 놓을 자리 (cy: 가운데 높이)
  _layout(n, cy = 0) {
    const rows = Math.max(1, Math.ceil(n / 8)), per = Math.ceil(n / rows), out = [];
    for (let r = 0; r < rows; r++) { const cnt = Math.min(per, n - r * per), y = cy + ((rows - 1) / 2 - r) * 34; for (let i = 0; i < cnt; i++) out.push({ x: (i - (cnt - 1) / 2) * 44, y }); }
    return out;
  }

  // ---------- 런·층·방 ----------
  startRun() {
    for (const h of this.roster.values()) { h.resetRun(); h.alive = true; h.invuln = 0; }
    this.usedBosses = new Set(); this.gold = 0; this.keys = 0; this.floorNum = 1; this.runStarted = false; this.startFloor();
  }
  startFloor() {
    this._clearObjects(); this.cur = null; this.map = generateFloor(this.floorNum);
    this.enterRoom(this.map.start, null);
    
  }
  _clearObjects() {
    for (const o of [...this.enemies, ...this.projs, ...this.pickups, ...this.obstacles]) o.gameObject.destroy();
    for (const w of this.walls) if (!w.isDestroyed) w.destroy(); this.walls = [];
    for (const b of this.bombs) if (!b.isDestroyed) b.destroy();
    this.enemies = []; this.projs = []; this.pickups = []; this.obstacles = []; this.bombs = [];
    if (this.stairsGO) { this.stairsGO.destroy(); this.stairsGO = null; }
  }
  _leaveRoom() {
    this.cur.items = this.pickups.filter(p => !p.gameObject.isDestroyed).map(p => p.data());
    this.cur.obs = this.obstacles.filter(o => !o.dead && o.kind !== "void").map(o => o.data()); // 부서진 지형은 그대로 부서진 채로 남는다
    this._clearObjects();
  }
  enterRoom(room, dir) {
    if (this.cur) { this._leaveRoom(); this._fadeIn(); SFX.play("door"); }
    if (dir) this.runStarted = true; // 문으로 나가면 난이도 확정
    this.cur = room; room.visited = true; this.doorHold = 0; this.stairsHold = 0; this.state = "explore";
    applyGeo(room); // 방 모양(1~4칸)과 크기. 카메라 배율은 그대로
    const hw0 = ARENA.w / 2, hh0 = ARENA.h / 2; this.camFollow.bounds = { minX: -hw0, maxX: hw0, minY: -hh0, maxY: hh0 };
    if (room.obs === null) room.obs = generateObstacles(room);
    this._buildWalls();
    for (const d of room.obs) this._makeObstacle(d);
    for (const v of ARENA.voids) this._makeObstacle({ kind: "void", x: v.x, y: v.y, w: ARENA.BASE_W, h: ARENA.BASE_H, hp: 999 }); // L자 방의 빈 칸
    const n = this.heroes.length, side = dir ? OPP[dir] : "S", [dx0, dy0] = doorPos(side);
    this.heroes.forEach((h, i) => { // 들어온 문 앞에 모여서 시작
      const gap = Math.min(20, 150 / Math.max(1, n)), off = (i - (n - 1) / 2) * gap;
      const [x, y] = side === "S" ? [dx0 + off, dy0 + 24] : side === "N" ? [dx0 + off, dy0 - 24] : side === "W" ? [dx0 + 24, dy0 + off] : [dx0 - 24, dy0 + off];
      h.transform.setPosition(x, y); h.invuln = Math.max(h.invuln, 1.2 + h.stats.entryInvuln); h.swing = null; h.echoes = [];
      h.roomT = 0; h.hitThisRoom = false; h.heartBuffOn = false; // 방마다 초기화되는 조건부 효과(양파·낡은 장화·뼈다귀) h.cd = 0; h.kx = h.ky = 0;
      h.shield = Math.max(h.shield, h.stats.roomShield); h.comboN = 0; // 방마다 보호막 채움
    });
    this._updateCamera(0, true);
    this.introTimer = 0;
    if (!room.spawned) { room.spawned = true; this._populate(room); }
    else {
      for (const d of room.items) this._makePickup(d);
      room.items = [];
      if (room.type === "boss" && room.cleared && this.floorNum < MAX_FLOOR) this._makeStairs();
    }
    this.state = room.cleared ? "explore" : "fight";
    this.fire("roomEnter", null, room);
  }
  _np() { return Math.max(1, this.heroes.length); }
  _populate(room) {
    const np = this._np();
    if (room.type === "normal") this._spawnWave(false);
    else if (room.type === "elite") this._spawnWave(true);
    else if (room.type === "boss") this._spawnBoss();
    else if (room.type === "treasure") { room.cleared = true; this._stockTreasure(np); }
    else if (room.type === "shop") { room.cleared = true; this._stockShop(np); }
  }
  _spawnPos() {
    for (let i = 0; i < 25; i++) {
      const x = (Math.random() * 2 - 1) * (ARENA.w / 2 - 25), y = (Math.random() * 2 - 1) * (ARENA.h / 2 - 25);
      if (this.heroes.every(h => Math.hypot(h.transform.position.x - x, h.transform.position.y - y) > 70) && !this.obstacleAt(x, y, 16)) return [x, y];
    }
    return [0, 0];
  }
  _spawnWave(elite) {
    const f = this.floorNum, np = this._np(), pf = 0.6 + 0.4 * np;
    let normals, elites = 0;
    if (elite) { elites = Math.min(5, 1 + Math.ceil(np / 2)) + (f >= 4 ? 1 : 0); normals = Math.round((2 + f * 0.4) * pf * 0.6); }
    else normals = Math.min(60, Math.round((2.5 + f * 0.7 + Math.random() * 1.5) * pf * Math.pow(this.cur.cells.length, 0.9)));
    if (elite && this.cur.big) elites += this.cur.cells.length - 1;
    const total = normals + elites;
    for (let i = 0; i < total; i++) { const [x, y] = this._spawnPos(); this.spawnEnemy(pickEnemyType(f), x, y, { delay: 0.7 + Math.min(1.8, i * 0.12), elite: i < elites }); }
  }
  _spawnBoss() {
    const [x, y] = [0, ARENA.h / 2 - 50];
    this.spawnEnemy(pickBoss(this.floorNum, this.usedBosses), x, y, { delay: 1.3 });
  }
  _heldItems() { return new Set(this.heroes.flatMap(h => h.items)); }
  // 아이템 한 칸: 패시브(기본) 또는 액티브(actChance 확률)
  _itemSlot(takenP, takenA, actChance) {
    if (Math.random() < actChance) { const id = randomActiveId(takenA); takenA.add(id); return { type: "active", id, state: null }; }
    const id = randomItemId(takenP); takenP.add(id); return { type: "item", id };
  }
  _heldActives() { return new Set(this.heroes.filter(h => h.active).map(h => h.active.id)); }
  // 보물방: 인원수만큼 아이템(패시브, 가끔 액티브) + 인원수만큼 무기
  _stockTreasure(np) {
    const takenP = this._heldItems(), takenA = this._heldActives(), pos = this._layout(np * 2);
    for (let i = 0; i < np; i++) this._makePickup({ ...this._itemSlot(takenP, takenA, 0.2), price: 0, x: pos[i].x, y: pos[i].y });
    for (let i = 0; i < np; i++) this.spawnWeaponPickup(pos[np + i].x, pos[np + i].y, randomWeapon(this.floorNum + 4));
  }
  // 상점: (1~3) + 인원수x2 개의 품목. 하트(4G)가 나오면 인원수만큼 살 수 있다. 가격은 등급으로 고정(일반 10 / 희귀 15 / 영웅 20).
  _stockShop(np) {
    const n = Math.min(30, 1 + Math.floor(Math.random() * 3) + np * 2 + 2 * this.partySum("shopExtra")), takenP = this._heldItems(), takenA = this._heldActives();
    const list = [];
    if (Math.random() < 0.6) list.push({ type: "heart", price: HEART_PRICE, stock: np });
    const rest = n - list.length, items = Math.ceil(rest * 0.55);
    for (let i = 0; i < items; i++) { const it = this._itemSlot(takenP, takenA, 0.22); list.push({ ...it, price: (it.type === "active" ? ACTIVES[it.id] : PASSIVES[it.id]).price }); }
    for (let i = 0; i < rest - items; i++) { const w = randomWeapon(this.floorNum + 2); list.push({ type: "weapon", weapon: w, price: weaponPrice(w) }); }
    list.sort(() => Math.random() - 0.5);
    const pos = this._layout(list.length);
    list.forEach((it, i) => this._makePickup({ ...it, x: pos[i].x, y: pos[i].y }));
  }
  // 방 클리어 보상: 코인·열쇠·하트·꾸러미·상자가 방 안 빈 자리에 떨어진다 (확률은 인원수·큰 방에 따라 조금 늘어남)
  _roomRewards(c, np, big) {
    const sc = (1 + ECON.perPlayer * (np - 1)) * (big ? 1.5 : 1) * Math.max(0.65, 1 - ECON.floorTaper * (this.floorNum - 1)), R = Math.random, P = p => Math.min(0.95, p * sc), bias = c.bias || 0, bonus = this.partySum("coinDrop");
    const at = fn => { const q = this._dropSpot(); fn.call(this, q.x, q.y); };
    let nc = 0;
    if (c.coins !== undefined) nc = c.coins + (R() < P(c.coinExtra) ? 1 : 0); else nc = (R() < P(c.coin + bonus) ? 1 : 0) + (R() < P(c.coin2) ? 1 : 0);
    for (let i = 0; i < nc; i++) { const v = this.rollCoinValue(bias + this.partySum("coinLuck")); at((x, y) => this.spawnCoin(x, y, v)); }
    if (R() < P(c.key)) at(this.spawnKey);
    if (R() < P(c.heart)) at(this.spawnHeart);
    if (c.bundle && R() < P(c.bundle)) at(this.spawnBundle);
    if (c.chest && R() < P(c.chest + this.partySum("chestLuck") * 0.1)) at(this.spawnChest);
  }
  clearRoom() {
    const room = this.cur, np = this._np(), f = this.floorNum, big = !!room.big;
    room.cleared = true; this.state = "explore"; SFX.play("clear");
    this.fire("roomClear", null, room); // roomClear 훅의 유일한 호출 지점 (보상 코드에서 또 부르지 말 것)
    for (const h of this.heroes) { // 방 클리어: 치유의 향로(확률), 액티브 충전(큰 방은 2)
      if (h.alive && h.stats.roomHeal && Math.random() < h.stats.roomHeal) h.heal(1);
      const a = h.active; if (a && ACTIVES[a.id].kind === "charge") a.charge = Math.min(ACTIVES[a.id].max, a.charge + (big ? 2 : 1));
    }
    const rg = this.partySum("roomGold"); if (rg > 0) this.addGold(rg); // 방 클리어 보너스: 파티 전체 합산
    for (let k = 0; k < Math.round(this.partySum("interest")); k++) { const itr = Math.min(5, Math.floor(this.gold * 0.1)); if (itr > 0) { this.gold += itr; } } // 저금통: 이자
    if (room.type === "normal") this._roomRewards(ECON.normal, np, big);
    else if (room.type === "elite") {
      const nw = Math.ceil(np / 2), pos = this._layout(nw, -10);
      for (let i = 0; i < nw; i++) this.spawnWeaponPickup(pos[i].x, pos[i].y, randomWeapon(f + 4, 1));
      this._roomRewards(ECON.elite, np, big); const eg = this.partySum("eliteGold"); if (eg > 0) this.addGold(eg); // 황금 이빨: 엘리트 방 클리어 보너스
    } else if (room.type === "boss") {
      const dead = this.heroes.filter(h => !h.alive); // 죽은 플레이어는 보스방을 클리어해야 부활한다
      for (const h of dead) h.revive(Math.ceil(h.maxHp / 2));
      this._roomRewards(ECON.boss, np, big);
      // 보상: 인원수만큼 아이템(패시브, 가끔 액티브) + 인원수만큼 무기(희귀 이상)
      const takenP = this._heldItems(), takenA = this._heldActives(), pos = this._layout(np * 2, -25);
      for (let i = 0; i < np; i++) this._makePickup({ ...this._itemSlot(takenP, takenA, 0.25), price: 0, x: pos[i].x, y: pos[i].y });
      for (let i = 0; i < np; i++) this.spawnWeaponPickup(pos[np + i].x, pos[np + i].y, randomWeapon(f + 5, 1));
      if (f >= MAX_FLOOR) { this.state = "victory"; this.overTimer = 14; this.cam.shake(8, 1);  SFX.play("win"); }
      else { this._makeStairs();  }
    }
  }
  _makeStairs() {
    const go = this.App.create("stairs"); go.transform.setPosition(0, 48);
    go.addComponent(new DrawRenderer(ctx => {
      const t = performance.now() / 1000, r = 13 + Math.sin(t * 4) * 1.2;
      ctx.strokeStyle = "#80deea"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
      ctx.fillStyle = "#4dd0e1"; ctx.globalAlpha = 0.25 + this.stairsHold * 0.5; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.globalAlpha = 1; ctx.scale(1, -1); ctx.fillStyle = "#fff"; ctx.font = "6px monospace"; ctx.textAlign = "center"; ctx.fillText("▼ 다음 층", 0, 22);
    }, 30, { order: 1 }));
    this.stairsGO = go;
  }
  nextFloor() { this.floorNum++; this.startFloor(); }

  // ---------- 플레이어 ----------
  addHero(pid, nick) {
    const id = this.nextId++;
    const go = this.App.create("hero" + id);
    go.transform.setPosition((Math.random() - 0.5) * 40, -ARENA.h / 2 + 24);
    const h = go.addComponent(new Hero(this, id, pid)); h.setup(); h.keyboard = pid === "kb";
    if (nick) h.nick = nick;
    this.heroes.push(h); this.roster.set(pid, h);
    return h;
  }
  removeHero(h) { h.gameObject.destroy(); this.heroes = this.heroes.filter(x => x !== h); this.roster.delete(h.pid); }
  // 접속이 끊기면 캐릭터를 비활성화해 두고(아이템·골드·체력 그대로), 같은 pid가 돌아오면 되살린다
  deactivateHero(h) {
    h.conn = null; Object.assign(h.input, { mx: 0, my: 0, ax: 0, ay: 0, atk: 0, dash: 0, act: 0 });
    this.heroes = this.heroes.filter(x => x !== h); h.gameObject.setActive(false);
  }
  rejoinHero(h) {
    if (this.heroes.includes(h)) return;
    const hw = ARENA.w / 2, hh = ARENA.h / 2;
    h.gameObject.setActive(true); h.transform.setPosition((Math.random() - 0.5) * 40, -hh + 24);
    h.invuln = 2; h.swing = null; h.echoes = []; h.kx = h.ky = 0; this.heroes.push(h);
  }
  // 폰이 보낸 hello({pid, name})로 연결과 캐릭터를 묶는다
  _bindHero(c, d) {
    const pid = String(d.pid || "").slice(0, 48) || "anon-" + Math.random().toString(36).slice(2, 10);
    const nick = Array.from(String(d.name || "").replace(/[\u0000-\u001f<>]/g, "").trim()).slice(0, 10).join("");
    let h = this.roster.get(pid), rejoined = !!h;
    if (h) {
      if (h.conn && h.conn !== c) { const old = h.conn; h.conn = null; try { old.close(); } catch (e) {} } // 같은 기기가 다시 접속하면 이전 연결을 끊는다
      this.rejoinHero(h);
    } else h = this.addHero(pid);
    if (nick) h.nick = nick; else if (!rejoined) h.nick = `P${h.id + 1}`;
    h.conn = c; h.lastMsg = performance.now(); c._hero = h; this.conns.set(c, h);
    if (d.diff && DIFFICULTY[d.diff] && this._owner() === h && this.difficulty !== d.diff) this.setDifficulty(d.diff, h); // 방장만 난이도를 고를 수 있다
    c.send({ t: "welcome", id: h.id, color: h.color, name: h.nick, rejoined, owner: this._owner() === h });
  }
  _keyboard() {
    if (Input.getKeyDown("KeyK") && !this.roster.has("kb")) this.addHero("kb", "키보드");
    if (!this.runStarted) for (const [code, d] of [["Digit1", "easy"], ["Digit2", "normal"], ["Digit3", "hard"], ["Numpad1", "easy"], ["Numpad2", "normal"], ["Numpad3", "hard"]]) if (Input.getKeyDown(code) && this.difficulty !== d) this.setDifficulty(d, null);
    const h = this.heroes.find(x => x.keyboard); if (!h) return;
    const k = c => (Input.getKey(c) ? 1 : 0);
    Object.assign(h.input, { mx: k("KeyD") - k("KeyA"), my: k("KeyW") - k("KeyS"), atk: k("KeyJ") || k("Space"), dash: k("KeyL") || k("ShiftLeft"), act: k("KeyE") || k("KeyI") });
  }

  update(dt) {
    this._keyboard();
    this.enemies = this.enemies.filter(e => !e.gameObject.isDestroyed);
    this.projs = this.projs.filter(p => !p.gameObject.isDestroyed);
    this.pickups = this.pickups.filter(p => !p.gameObject.isDestroyed);
    this.introTimer -= dt;
    if (this.heroes.length && this.cur) {
      if (this.state === "fight") {
        if (this.enemies.length === 0) this.clearRoom();
        else if (this.heroes.every(h => !h.alive)) { this.state = "over"; this.overTimer = 6; SFX.play("over"); }
      } else if (this.state === "explore") { this._updateDoors(dt); this._updateStairs(dt); }
      else { this.overTimer -= dt; if (this.overTimer <= 0) this.startRun(); } // over | victory
    }
    const now = performance.now();
    for (const h of this.heroes) if (h.conn && now - h.lastMsg > 600) Object.assign(h.input, { mx: 0, my: 0, ax: 0, ay: 0, atk: 0, dash: 0, act: 0 });
    this._updateCamera(dt, false);
    this._sendStatus(dt);
    if ((this._hudT = (this._hudT || 0) - dt) <= 0) { this._hudT = 0.08; this._updateHud(); } // 글자는 초당 ~12번만 갱신 (문자열 만들기·줄바꿈 계산 절약)
  }
  // 모든 플레이어가 보이도록 가운데를 잡는다 (넘치면 가운데에 맞추고 멀리 있는 플레이어는 화면 밖). 방 경계 밖은 안 보여 준다.
  _updateCamera(dt, snap) {
    const hs = this.heroes.filter(h => h.alive); const list = hs.length ? hs : this.heroes; if (!list.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const h of list) { const p = h.transform.position; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    this.camTarget.transform.setPosition((x0 + x1) / 2, (y0 + y1) / 2);
    if (snap) this.camFollow.snap();
  }
  _updateDoors(dt) {
    const alive = this.heroes.filter(h => h.alive); if (!alive.length) return;
    let best = null, bc = 0;
    for (const d of Object.keys(this.cur.nb)) {
      const [dx, dy] = doorPos(d), c = alive.filter(h => Math.hypot(h.transform.position.x - dx, h.transform.position.y - dy) < 17).length;
      if (c > bc) { bc = c; best = d; }
    }
    if (best && bc >= Math.ceil(alive.length / 2)) { this.doorHold += dt / 0.6; if (this.doorHold >= 1) this.enterRoom(this.cur.nb[best], best); }
    else this.doorHold = Math.max(0, this.doorHold - dt * 2);
  }
  _updateStairs(dt) {
    if (!this.stairsGO) return;
    const alive = this.heroes.filter(h => h.alive); if (!alive.length) return;
    const inside = alive.filter(h => Math.hypot(h.transform.position.x, h.transform.position.y - 48) < 17).length;
    if (inside >= Math.ceil(alive.length / 2)) this.stairsHold += dt / 1.5; else this.stairsHold = Math.max(0, this.stairsHold - dt);
    if (this.stairsHold >= 1) this.nextFloor();
  }

  // ---------- HUD ----------
  _text(name, opts, setup) {
    const go = this.App.createUI(name), rt = go.getComponent(RectTransform);
    setup(rt);
    return go.addComponent(new UIText("", opts));
  }
  _buildHud() {
    this.hudTop = this._text("top", { fontSize: 9, align: "left", verticalAlign: "top", wrap: true }, rt => rt.setAnchor(0, 0, 1, 0).setPivot(0, 0).setOffsets(8, 6, 120, 0));
    this.hudRoom = this._text("room", { fontSize: 7, align: "right", verticalAlign: "top", color: "#9ab" }, rt => rt.setAnchor(0, 0, 1, 0).setPivot(0, 0).setOffsets(0, 6, 78, 0));
    this.hudBoss = this._text("boss", { fontSize: 8, align: "center", verticalAlign: "top", color: "#ff8a80" }, rt => rt.setAnchor(0, 0, 1, 0).setPivot(0, 0).setOffsets(0, 30, 0, 0));
    this.hudCenter = this._text("center", { fontSize: 15, wrap: true }, rt => rt.setAnchor(0, 0, 1, 1).setOffsets(20, 20, 20, 20));
    const overlay = (name, color, order) => { const go = this.App.createUI(name), rt = go.getComponent(RectTransform); rt.setAnchor(0, 0, 1, 1).setOffsets(0, 0, 0, 0); rt.sortOrder = order; go.addComponent(new UIRect({ color })); rt.alpha = 0; return rt; };
    this.vignette = overlay("vignette", "#d50000", 98); this.fade = overlay("fade", "#000000", 99);
    this.hudHeroes = this._text("heroes", { fontSize: 7, align: "left", verticalAlign: "bottom", wrap: true }, rt => rt.setAnchor(0, 0, 1, 1).setOffsets(8, 0, 8, 5));
  }
  _fadeIn() { Tween.killTweensOf(this.fade); this.fade.alpha = 1; Tween.to(this.fade, { alpha: 0 }, 0.3, { ease: "outQuad" }); }   // 방 이동: 검정에서 서서히 밝아짐
  _flashVignette() { Tween.killTweensOf(this.vignette); this.vignette.alpha = 0.3; Tween.to(this.vignette, { alpha: 0 }, 0.25); }  // 맞으면 화면이 잠깐 붉어짐
  _updateHud() {
    const room = this.cur;
    this.hudTop.setText(room ? `${this.floorNum}층 [${this.diffProfile().name}] · ${ROOM_NAMES[room.type]}${room.big ? " (큰 방)" : ""}${this.state === "fight" ? `   남은 적 ${this.enemies.length}` : ""}\n💰 ${this.gold}G${this.keys > 0 ? `  🔑${this.keys}` : ""}${SFX.unlocked ? "" : "   🔇 아무 키나 누르면 소리"}` : "");
    this.hudRoom.setText(this.roomCode ? `방 코드 ${this.roomCode}` : "");
    const boss = this.enemies.find(e => e.boss && !e.dead);
    this.hudBoss.setText(boss ? `☠ ${boss.title}  ${"█".repeat(Math.ceil(20 * Math.max(0, boss.hp) / boss.maxHp))}${"░".repeat(20 - Math.ceil(20 * Math.max(0, boss.hp) / boss.maxHp))}${boss.invuln ? `  🛡 ${SHIELD_NAMES[boss.shieldKind] || "보호막"}` : boss.ethereal ? `  🛡 ${SHIELD_NAMES.phase}` : ""}` : "");
    this.hudHeroes.setText(this.heroes.map(h => `${h.nick} ${h.alive ? "♥".repeat(h.hp) + "♡".repeat(h.maxHp - h.hp) : "💀"} ${weaponLabel(h.weapon)} ★${h.items.length}${h.active ? " " + activeLabel(h.active) : ""}`).join("    "));
    let c = "";
    if (!this.heroes.length) c = this.roomCode ? `폰으로 접속하세요\n방 코드: ${this.roomCode}\n(키보드: K — WASD 이동, J 공격, L 대시)` : "서버 연결 중...";
    else if (this.state === "over") c = `GAME OVER\n${this.floorNum}층 도달\n${Math.ceil(this.overTimer)}초 후 처음부터`;
    else if (this.state === "victory") c = `VICTORY!\n던전을 정복했다\n${Math.ceil(this.overTimer)}초 후 새 게임`;
    else if (this.introTimer > 0) c = this.introText;
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
    c.on("data", d => {
      if (!d) return;
      if (d.t === "hello") { this._bindHero(c, d); return; }
      const h = c._hero; if (!h || h.conn !== c) return;
      if (d.t === "s") { Object.assign(h.input, { mx: +d.mx || 0, my: +d.my || 0, ax: +d.ax || 0, ay: +d.ay || 0, atk: d.atk ? 1 : 0, dash: d.dash ? 1 : 0, act: d.act ? 1 : 0 }); h.lastMsg = performance.now(); }
    });
    const leave = () => { const h = c._hero; this.conns.delete(c); if (h && h.conn === c) this.deactivateHero(h); };
    c.on("close", leave); c.on("error", leave);
  }
  _sendStatus(dt) {
    this._statusCd = (this._statusCd || 0) - dt;
    if (this._statusCd > 0) return; this._statusCd = 0.2;
    for (const [c, h] of this.conns) if (c.open) c.send({ t: "st", hp: h.hp, maxHp: h.maxHp, alive: h.alive, weapon: weaponLabel(h.weapon), floor: this.floorNum, diff: this.diffProfile().name, gold: this.gold, keys: this.keys, items: h.items.length, itemNames: h.items.map(id => PASSIVES[id].icon + PASSIVES[id].name), act: h.active ? { name: ACTIVES[h.active.id].icon + ACTIVES[h.active.id].name, text: activeLabel(h.active), ready: ACTIVES[h.active.id].kind === "charge" ? h.active.charge > 0 : h.active.cdLeft <= 0 } : null, kills: h.kills, name: h.nick });
  }
}
