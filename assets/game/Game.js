// 던전 진행: 층 → 방(문으로 이동) → 전투/보물/상점/보스, 아이템·골드, HUD, 폰 접속 처리
class Game extends Component {
  constructor(App) {
    super();
    this.App = App; this.cam = App.camera;
    this.heroes = []; this.roster = new Map(); this.enemies = []; this.projs = []; this.pickups = []; this.conns = new Map();
    this.floorNum = 1; this.map = null; this.cur = null; this.state = "explore"; // explore | fight | over | victory
    this.nextId = 0; this.overTimer = 0; this.introTimer = 0; this.introText = "";
    this.doorHold = 0; this.stairsHold = 0; this.stairsGO = null; this.toastText = ""; this.toastT = 0;
    this.usedBosses = new Set();
  }
  awake() {
    const App = this.App;
    this.arena = App.create("arena").addComponent(new ArenaRenderer(this, ARENA_W, ARENA_H));
    App.create("minimap").addComponent(new MinimapRenderer(this));
    this.fx = App.create("fx").addComponent(new ParticleSystem({ capacity: 2048 }));
    this._buildHud();
    Events.on("enemy.killed", e => {
      this.cam.shake(e.enemy.boss ? 6 : 0.8, e.enemy.boss ? 0.6 : 0.08);
      const by = e.by; if (!by || !by.stats) return;
      if (by.stats.lifesteal && Math.random() < by.stats.lifesteal) by.heal(1);
      if (!e.enemy.boss && Math.random() < 0.005 + by.stats.heartDrop) { const q = e.enemy.transform.position; this.spawnHeart(q.x, q.y); }
    }, { owner: this });
    Events.on("hero.hit", () => this._flashVignette(), { owner: this });
    this.startRun();
  }

  // ---------- 생성 도우미 ----------
  spawnSlash(hero, dir, w) {
    const go = this.App.create("slash"), p = hero.transform.position, color = w.color || TIERS[hero.weapon.tier].color;
    go.transform.setPosition(p.x, p.y); go.transform.rotation = dir;
    let t = 0; const dur = w.dur, half = (w.arc * Math.PI / 180) / 2;
    go.addComponent(new DrawRenderer(ctx => {
      const k = Math.min(1, t / dur); ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.lineCap = "round";
      if (w.kind === "thrust") {
        const len = w.range * Math.min(1, k * 2.5 + 0.3);
        ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(len, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(len + 5, 0); ctx.lineTo(len - 3, 3); ctx.lineTo(len - 3, -3); ctx.closePath(); ctx.fill();
      } else {
        const sweep = w.arc >= 360 ? Math.PI * 2 : half * 2, start = w.arc >= 360 ? 0 : -half, cur = start + sweep * Math.min(1, k * 1.6);
        ctx.globalAlpha *= 0.55; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, w.range, start, cur); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1 - k * k; ctx.beginPath(); ctx.arc(0, 0, w.range, start, cur); ctx.stroke();
      }
    }, w.range + 10, { order: 8 }));
    go.addComponent(new (class extends Component { update(dt) { t += dt; go.transform.setPosition(hero.transform.position.x, hero.transform.position.y); if (t > dur) go.destroy(); } })());
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
  // 플레이어가 공격(터치)할 때 호출: 가까이 있는 무기·아이템·상점 하트를 획득·구매한다
  tryInteract(h) {
    const p = h.transform.position; let best = null, bd = 20;
    for (const pk of this.pickups) {
      const t = pk.item.type; if (pk.gameObject.isDestroyed || t === "coin" || (t === "heart" && !(pk.item.price > 0))) continue;
      const q = pk.transform.position, d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = pk; }
    }
    return best ? best.interact(h) : false;
  }
  spawnCoin(x, y, value) { return this._makePickup({ type: "coin", value, x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8 }); }
  spawnHeart(x, y, price = 0) { return this._makePickup({ type: "heart", price, x, y }); }
  spawnWeaponPickup(x, y, weapon, price = 0, lock = 0.8) { return this._makePickup({ type: "weapon", weapon, price, x, y, lock }); }
  spawnItemPickup(x, y, id, price = 0) { return this._makePickup({ type: "item", id, price, x, y }); }
  toast(text, secs = 2.5) { this.toastText = text; this.toastT = secs; }
  // n개를 한 줄에 최대 8개씩 가지런히 놓을 자리 (cy: 가운데 높이)
  _layout(n, cy = 0) {
    const rows = Math.max(1, Math.ceil(n / 8)), per = Math.ceil(n / rows), out = [];
    for (let r = 0; r < rows; r++) { const cnt = Math.min(per, n - r * per), y = cy + ((rows - 1) / 2 - r) * 34; for (let i = 0; i < cnt; i++) out.push({ x: (i - (cnt - 1) / 2) * 44, y }); }
    return out;
  }

  // ---------- 런·층·방 ----------
  startRun() {
    for (const h of this.roster.values()) { h.resetRun(); h.alive = true; h.invuln = 0; }
    this.usedBosses = new Set(); this.floorNum = 1; this.startFloor();
  }
  startFloor() {
    this._clearObjects(); this.cur = null; this.map = generateFloor(this.floorNum);
    this.enterRoom(this.map.start, null);
    this.toast(`${this.floorNum}층 도착`, 2.5);
  }
  _clearObjects() {
    for (const o of [...this.enemies, ...this.projs, ...this.pickups]) o.gameObject.destroy();
    this.enemies = []; this.projs = []; this.pickups = [];
    if (this.stairsGO) { this.stairsGO.destroy(); this.stairsGO = null; }
  }
  _leaveRoom() {
    this.cur.items = this.pickups.filter(p => !p.gameObject.isDestroyed).map(p => p.data());
    this._clearObjects();
  }
  enterRoom(room, dir) {
    if (this.cur) { this._leaveRoom(); this._fadeIn(); SFX.play("door"); }
    this.cur = room; room.visited = true; this.doorHold = 0; this.stairsHold = 0; this.state = "explore";
    const hw = ARENA_W / 2, hh = ARENA_H / 2, n = this.heroes.length, side = dir ? OPP[dir] : "S";
    this.heroes.forEach((h, i) => {
      const gap = Math.min(20, 150 / Math.max(1, n)), off = (i - (n - 1) / 2) * gap;
      const [x, y] = side === "S" ? [off, -hh + 24] : side === "N" ? [off, hh - 24] : side === "W" ? [-hw + 24, off] : [hw - 24, off];
      h.transform.setPosition(x, y); h.invuln = Math.max(h.invuln, 1.2 + h.stats.entryInvuln); h.swing = null; h.echoes = []; h.cd = 0; h.kx = h.ky = 0;
    });
    this.introTimer = 2.2; this.introText = `${this.floorNum}층 — ${ROOM_NAMES[room.type]}`;
    if (!room.spawned) { room.spawned = true; this._populate(room); }
    else {
      for (const d of room.items) this._makePickup(d);
      room.items = [];
      if (room.type === "boss" && room.cleared && this.floorNum < MAX_FLOOR) this._makeStairs();
    }
    this.state = room.cleared ? "explore" : "fight";
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
      const x = (Math.random() * 2 - 1) * (ARENA_W / 2 - 25), y = (Math.random() * 2 - 1) * (ARENA_H / 2 - 25);
      if (this.heroes.every(h => Math.hypot(h.transform.position.x - x, h.transform.position.y - y) > 70)) return [x, y];
    }
    return [0, 0];
  }
  _spawnWave(elite) {
    const f = this.floorNum, np = this._np(), pf = 0.6 + 0.4 * np;
    let normals, elites = 0;
    if (elite) { elites = Math.min(5, 1 + Math.ceil(np / 2)) + (f >= 4 ? 1 : 0); normals = Math.round((2 + f * 0.4) * pf * 0.6); }
    else normals = Math.min(30, Math.round((2.5 + f * 0.7 + Math.random() * 1.5) * pf));
    const total = normals + elites;
    for (let i = 0; i < total; i++) { const [x, y] = this._spawnPos(); this.spawnEnemy(pickEnemyType(f), x, y, { delay: 0.7 + Math.min(1.8, i * 0.12), elite: i < elites }); }
  }
  _spawnBoss() {
    const [x, y] = [0, ARENA_H / 2 - 50];
    this.spawnEnemy(pickBoss(this.floorNum, this.usedBosses), x, y, { delay: 1.3 });
  }
  _heldItems() { return new Set(this.heroes.flatMap(h => h.items)); }
  // 보물방: 인원수만큼 패시브 아이템 + 인원수만큼 무기
  _stockTreasure(np) {
    const taken = this._heldItems(), pos = this._layout(np * 2);
    for (let i = 0; i < np; i++) { const id = randomItemId(taken); taken.add(id); this.spawnItemPickup(pos[i].x, pos[i].y, id); }
    for (let i = 0; i < np; i++) this.spawnWeaponPickup(pos[np + i].x, pos[np + i].y, randomWeapon(this.floorNum + 4));
  }
  // 상점: (1~3) + 인원수x2 개의 품목. 하트가 나오면 인원수만큼 살 수 있다. 가격은 층이 오를수록 조금씩 오른다.
  _stockShop(np) {
    const n = Math.min(24, 1 + Math.floor(Math.random() * 3) + np * 2), taken = this._heldItems(), mul = 1 + 0.1 * (this.floorNum - 1);
    const list = [];
    if (Math.random() < 0.6) list.push({ type: "heart", price: Math.round(25 * mul), stock: np });
    const rest = n - list.length, items = Math.ceil(rest * 0.55);
    for (let i = 0; i < items; i++) { const id = randomItemId(taken); taken.add(id); list.push({ type: "item", id, price: Math.round(ITEMS[id].price * mul) }); }
    for (let i = 0; i < rest - items; i++) { const w = randomWeapon(this.floorNum + 2); list.push({ type: "weapon", weapon: w, price: Math.round(weaponPrice(w) * mul) }); }
    list.sort(() => Math.random() - 0.5);
    const pos = this._layout(list.length);
    list.forEach((it, i) => this._makePickup({ ...it, x: pos[i].x, y: pos[i].y }));
  }
  clearRoom() {
    const room = this.cur, np = this._np(), f = this.floorNum;
    room.cleared = true; this.state = "explore"; SFX.play("clear");
    for (const h of this.heroes) { // 방 클리어 효과 (치유의 향로: 확률, 저금통)
      if (!h.alive) continue;
      if (h.stats.roomHeal && Math.random() < h.stats.roomHeal) h.heal(1);
      if (h.stats.roomGold) h.addGold(h.stats.roomGold);
    }
    const rand = (a, b) => a + Math.random() * (b - a);
    if (room.type === "normal") {
      if (Math.random() < 0.15) this.spawnHeart(rand(-40, 40), rand(-20, 20)); // 회복은 박하다
      if (Math.random() < 0.3) this.spawnCoin(rand(-40, 40), rand(-20, 20), 2);
    } else if (room.type === "elite") {
      const nw = Math.ceil(np / 2), pos = this._layout(nw, -10);
      for (let i = 0; i < nw; i++) this.spawnWeaponPickup(pos[i].x, pos[i].y, randomWeapon(f + 4, 1));
      for (let i = 0; i < 3; i++) this.spawnCoin(rand(-40, 40), rand(-40, 0), 3);
      if (Math.random() < 0.4) this.spawnHeart(0, 30);
      this.toast("엘리트 격파! 보상이 나왔다", 2.5);
    } else if (room.type === "boss") {
      const dead = this.heroes.filter(h => !h.alive); // 죽은 플레이어는 보스방을 클리어해야 부활한다
      for (const h of dead) h.revive(Math.ceil(h.maxHp / 2));
      if (dead.length) this.toast(`보스 격파! ${dead.map(h => h.nick).join(", ")} 부활`, 3);
      for (let i = 0; i < 4; i++) this.spawnCoin(rand(-50, 50), rand(-30, 0), 2 + f);
      for (let i = 0; i < Math.max(1, Math.floor(np / 3)); i++) this.spawnHeart(rand(-50, 50), 40);
      // 보상: 인원수만큼 패시브 아이템 + 인원수만큼 무기(희귀 이상)
      const taken = this._heldItems(), pos = this._layout(np * 2, -25);
      for (let i = 0; i < np; i++) { const id = randomItemId(taken); taken.add(id); this.spawnItemPickup(pos[i].x, pos[i].y, id); }
      for (let i = 0; i < np; i++) this.spawnWeaponPickup(pos[np + i].x, pos[np + i].y, randomWeapon(f + 5, 1));
      if (f >= MAX_FLOOR) { this.state = "victory"; this.overTimer = 14; this.cam.shake(8, 1); this.toast("마왕을 쓰러뜨렸다!", 4); SFX.play("win"); }
      else { this._makeStairs(); if (!dead.length) this.toast("보스 격파! 보상을 챙기고 계단으로", 3); }
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
    go.transform.setPosition((Math.random() - 0.5) * 40, -ARENA_H / 2 + 24);
    const h = go.addComponent(new Hero(this, id, pid)); h.setup(); h.keyboard = pid === "kb";
    if (nick) h.nick = nick;
    this.heroes.push(h); this.roster.set(pid, h);
    return h;
  }
  removeHero(h) { h.gameObject.destroy(); this.heroes = this.heroes.filter(x => x !== h); this.roster.delete(h.pid); }
  // 접속이 끊기면 캐릭터를 비활성화해 두고(아이템·골드·체력 그대로), 같은 pid가 돌아오면 되살린다
  deactivateHero(h) {
    h.conn = null; Object.assign(h.input, { mx: 0, my: 0, ax: 0, ay: 0, atk: 0, dash: 0 });
    this.heroes = this.heroes.filter(x => x !== h); h.gameObject.setActive(false);
  }
  rejoinHero(h) {
    if (this.heroes.includes(h)) return;
    const hw = ARENA_W / 2, hh = ARENA_H / 2;
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
    c.send({ t: "welcome", id: h.id, color: h.color, name: h.nick, rejoined });
    if (rejoined) this.toast(`${h.nick} 다시 접속`, 2);
  }
  _keyboard() {
    if (Input.getKeyDown("KeyK") && !this.roster.has("kb")) this.addHero("kb", "키보드");
    const h = this.heroes.find(x => x.keyboard); if (!h) return;
    const k = c => (Input.getKey(c) ? 1 : 0);
    Object.assign(h.input, { mx: k("KeyD") - k("KeyA"), my: k("KeyW") - k("KeyS"), atk: k("KeyJ") || k("Space"), dash: k("KeyL") || k("ShiftLeft") });
  }

  update(dt) {
    this._keyboard();
    this.enemies = this.enemies.filter(e => !e.gameObject.isDestroyed);
    this.projs = this.projs.filter(p => !p.gameObject.isDestroyed);
    this.pickups = this.pickups.filter(p => !p.gameObject.isDestroyed);
    this.introTimer -= dt; this.toastT -= dt;
    if (this.heroes.length && this.cur) {
      if (this.state === "fight") {
        if (this.enemies.length === 0) this.clearRoom();
        else if (this.heroes.every(h => !h.alive)) { this.state = "over"; this.overTimer = 6; SFX.play("over"); }
      } else if (this.state === "explore") { this._updateDoors(dt); this._updateStairs(dt); }
      else { this.overTimer -= dt; if (this.overTimer <= 0) this.startRun(); } // over | victory
    }
    const now = performance.now();
    for (const h of this.heroes) if (h.conn && now - h.lastMsg > 600) Object.assign(h.input, { mx: 0, my: 0, ax: 0, ay: 0, atk: 0, dash: 0 });
    this._sendStatus(dt);
    this._updateHud();
  }
  _updateDoors(dt) {
    const alive = this.heroes.filter(h => h.alive); if (!alive.length) return;
    let best = null, bc = 0;
    for (const d of Object.keys(this.cur.nb)) {
      const [dx, dy] = DOOR_POS[d], c = alive.filter(h => Math.hypot(h.transform.position.x - dx, h.transform.position.y - dy) < 17).length;
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
    this.hudTop = this._text("top", { fontSize: 9, align: "left", verticalAlign: "top" }, rt => rt.setAnchor(0, 0, 1, 0).setPivot(0, 0).setOffsets(8, 6, 0, 0));
    this.hudRoom = this._text("room", { fontSize: 8, align: "center", verticalAlign: "top", color: "#9ab" }, rt => rt.setAnchor(0, 0, 1, 0).setPivot(0, 0).setOffsets(0, 6, 0, 0));
    this.hudBoss = this._text("boss", { fontSize: 8, align: "center", verticalAlign: "top", color: "#ff8a80" }, rt => rt.setAnchor(0, 0, 1, 0).setPivot(0, 0).setOffsets(0, 18, 0, 0));
    this.hudCenter = this._text("center", { fontSize: 15, wrap: true }, rt => rt.setAnchor(0, 0, 1, 1).setOffsets(20, 20, 20, 20));
    this.hudToast = this._text("toast", { fontSize: 8, wrap: true, color: "#ffe082", verticalAlign: "bottom" }, rt => rt.setAnchor(0, 0, 1, 1).setOffsets(20, 0, 20, 26));
    const overlay = (name, color, order) => { const go = this.App.createUI(name), rt = go.getComponent(RectTransform); rt.setAnchor(0, 0, 1, 1).setOffsets(0, 0, 0, 0); rt.sortOrder = order; go.addComponent(new UIRect({ color })); rt.alpha = 0; return rt; };
    this.vignette = overlay("vignette", "#d50000", 98); this.fade = overlay("fade", "#000000", 99);
    this.hudHeroes = this._text("heroes", { fontSize: 7, align: "left", verticalAlign: "bottom", wrap: true }, rt => rt.setAnchor(0, 0, 1, 1).setOffsets(8, 0, 8, 5));
  }
  _fadeIn() { Tween.killTweensOf(this.fade); this.fade.alpha = 1; Tween.to(this.fade, { alpha: 0 }, 0.3, { ease: "outQuad" }); }   // 방 이동: 검정에서 서서히 밝아짐
  _flashVignette() { Tween.killTweensOf(this.vignette); this.vignette.alpha = 0.3; Tween.to(this.vignette, { alpha: 0 }, 0.25); }  // 맞으면 화면이 잠깐 붉어짐
  _updateHud() {
    const room = this.cur;
    this.hudTop.setText(room ? `${this.floorNum}층 · ${ROOM_NAMES[room.type]}${this.state === "fight" ? `   남은 적 ${this.enemies.length}` : ""}` : "");
    this.hudRoom.setText(this.roomCode ? `방 코드 ${this.roomCode}${SFX.unlocked ? (SFX.muted ? "  🔇 M" : "") : "  🔇 아무 키나 누르면 소리 켜짐"}` : "");
    const boss = this.enemies.find(e => e.boss && !e.dead);
    this.hudBoss.setText(boss ? `☠ ${boss.title}  ${"█".repeat(Math.ceil(20 * Math.max(0, boss.hp) / boss.maxHp))}${"░".repeat(20 - Math.ceil(20 * Math.max(0, boss.hp) / boss.maxHp))}` : "");
    this.hudHeroes.setText(this.heroes.map(h => `${h.nick} ${h.alive ? "♥".repeat(h.hp) + "♡".repeat(h.maxHp - h.hp) : "💀"} ${weaponLabel(h.weapon)} ${h.gold}G ★${h.items.length}`).join("    "));
    this.hudToast.setText(this.toastT > 0 ? this.toastText : "");
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
      if (d.t === "s") { Object.assign(h.input, { mx: +d.mx || 0, my: +d.my || 0, ax: +d.ax || 0, ay: +d.ay || 0, atk: d.atk ? 1 : 0, dash: d.dash ? 1 : 0 }); h.lastMsg = performance.now(); }
    });
    const leave = () => { const h = c._hero; this.conns.delete(c); if (h && h.conn === c) this.deactivateHero(h); };
    c.on("close", leave); c.on("error", leave);
  }
  _sendStatus(dt) {
    this._statusCd = (this._statusCd || 0) - dt;
    if (this._statusCd > 0) return; this._statusCd = 0.2;
    for (const [c, h] of this.conns) if (c.open) c.send({ t: "st", hp: h.hp, maxHp: h.maxHp, alive: h.alive, weapon: weaponLabel(h.weapon), floor: this.floorNum, gold: h.gold, items: h.items.length, itemNames: h.items.map(id => ITEMS[id].name), kills: h.kills, name: h.nick });
  }
}
