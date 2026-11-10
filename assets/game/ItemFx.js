// ============================================================================
// 아이템용 개체와 도우미 (Items.js 다음에 불러온다)
//   Clone    : 분신. 모양(mode) ahead(앞) / behind(뒤, 반대로 공격) / twin(1초 전 내 위치) / side(옆, 임시)
//              내가 공격하면 분신도 자기 위치에서 같은 공격을 따라한다 (Hero._mimic)
//   Ludo     : 조종 무기. 공격 스틱을 끄는 방향으로 구슬(orb)/검(blade)이 날아가 닿는 적을 벤다 (루도비코)
//   Blades   : 몸 주위를 도는 칼날 n개
//   Zone     : 바닥에 남는 장판 (불·독·감속·잔상 폭발). 방을 나가면 사라진다
//   Turret   : 임시 포탑
//   rerollItems / replayRoom / warp / rerollPickups / convertPickups : 액티브 아이템용 방·아이템 조작
// 할당이 없도록 질의 버퍼는 모듈 안에서 재사용한다. 엔티티는 아이템 스탯이 켜져 있을 때만 syncFx가 만든다.
// ============================================================================
const _fb = [], _fmv = { x: 0, y: 0, hit: false, nx: 0, ny: 0, collider: null };
const fxNow = () => performance.now() / 1000;
const heroHere = (g, o) => o.alive && g.heroes.includes(o); // 접속 중이고 살아 있는 주인인지

// ---- 분신 ----
class Clone extends Component {
  constructor(game, owner, mode, life = 0) {
    super(); this.game = game; this.owner = owner; this.mode = mode; this.life = life; this.dmgMul = 0.6; this.t = 0; this.hi = 0; this.hn = 0; this.hT = 0;
    this.hist = new Float32Array(48); // twin: 0.05초마다 내 위치 기록 (24칸 = 1.2초)
  }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer((ctx) => {
      const o = this.owner, f = this.mode === "behind" ? o.facing + Math.PI : o.facing;
      ctx.globalAlpha *= 0.5 + Math.sin(this.t * 6) * 0.08; ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(0, 0, o.radius, 0, 7); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.9; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
      ctx.rotate(f); ctx.strokeStyle = TIERS[o.weapon.tier].color; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(o.radius - 1, 0); ctx.lineTo(o.radius + 7, 0); ctx.stroke();
    }, 18, { order: 4 }));
    const op = this.owner.transform.position; this.transform.setPosition(op.x, op.y);
  }
  update(dt) {
    const o = this.owner, g = this.game; this.t += dt;
    if (!heroHere(g, o)) { this.draw.opacity = 0; return; }
    this.draw.opacity = 1;
    if (this.life > 0 && (this.life -= dt) <= 0) { this.gameObject.destroy(); return; }
    const op = o.transform.position, p = this.transform.position; let tx, ty;
    if (this.mode === "twin") {
      this.hT -= dt; if (this.hT <= 0) { this.hT = 0.05; this.hist[this.hi * 2] = op.x; this.hist[this.hi * 2 + 1] = op.y; this.hi = (this.hi + 1) % 24; if (this.hn < 24) this.hn++; }
      const k = (this.hi - this.hn + 24) % 24; tx = this.hist[k * 2]; ty = this.hist[k * 2 + 1]; // 가장 오래된 기록 = 약 1초 전 내 위치
      if (this.hn < 20) { tx = op.x; ty = op.y; }
    } else {
      const a = this.mode === "behind" ? o.facing + Math.PI : this.mode === "side" ? o.facing + Math.PI / 2 : o.facing, d = this.mode === "behind" ? 26 : 32;
      tx = op.x + Math.cos(a) * d; ty = op.y + Math.sin(a) * d;
    }
    const dx = tx - p.x, dy = ty - p.y;
    if (dx * dx + dy * dy > 120 * 120) { this.transform.setPosition(tx, ty); return; }
    const k = Math.min(1, dt * 10); Physics.moveCircle(p.x, p.y, 5, dx * k, dy * k, PL.Solid, _fmv, null); this.transform.setPosition(_fmv.x, _fmv.y); // 벽을 뚫지 않는다
  }
}

// ---- 몸 주위를 도는 칼날 ----
class Blades extends Component {
  constructor(game, owner) { super(); this.game = game; this.owner = owner; this.n = 0; this.a = 0; this.hitT = 0; }
  setup() {
    this.gameObject.addComponent(new DrawRenderer((ctx) => {
      const n = this.n; ctx.fillStyle = "#cfd8dc"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.8;
      for (let k = 0; k < n; k++) { const a = this.a + k * Math.PI * 2 / n; ctx.save(); ctx.translate(Math.cos(a) * 25, Math.sin(a) * 25); ctx.rotate(a + Math.PI / 2 + this.a * 3); ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(3, 2); ctx.lineTo(-3, 2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
    }, 34, { order: 5 }));
  }
  update(dt) {
    const o = this.owner, g = this.game; if (!heroHere(g, o) || !this.n) { this.transform.setPosition(-9999, -9999); return; }
    const op = o.transform.position; this.transform.setPosition(op.x, op.y); this.a += dt * 4.2; this.hitT -= dt;
    if (this.hitT > 0) return; this.hitT = 0.1;
    const now = fxNow(), key = "_bl" + o.id, dmg = 1.2 * o.stats.dmg;
    for (let k = 0; k < this.n; k++) {
      const a = this.a + k * Math.PI * 2 / this.n, bx = op.x + Math.cos(a) * 25, by = op.y + Math.sin(a) * 25;
      let m = Physics.overlapCircle(bx, by, 6, PL.Enemy, _fb);
      for (let i = 0; i < m; i++) { const e = _fb[i].data; if (e.dead || e.spawnDelay > 0 || now - (e[key] || 0) < 0.35) continue; e[key] = now; e.damage(dmg, o, a + Math.PI / 2, 60, true); o.applyHitEffects(e, dmg); }
      m = Physics.overlapCircle(bx, by, 6, PL.EProj, _fb); // 칼날은 적 탄도 쳐낸다
      for (let i = 0; i < m; i++) { const pr = _fb[i].data; if (pr.fromPlayer || pr.gameObject.isDestroyed || pr.orbit) continue; pr.gameObject.destroy(); }
    }
  }
}

// ---- 조종 무기 (루도비코): 공격 스틱을 끄는 방향으로 날아간다 ----
class Ludo extends Component {
  constructor(game, owner, kind) { super(); this.game = game; this.owner = owner; this.kind = kind; this.t = 0; this.ang = 0; this.hitT = 0; this.vx = 0; this.vy = 0; }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer((ctx) => {
      const o = this.owner, col = TIERS[o.weapon.tier].color;
      if (this.kind === "blade") { ctx.rotate(this.ang); ctx.fillStyle = col; ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-2, 2.6); ctx.lineTo(-6, 0); ctx.lineTo(-2, -2.6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#8d6e63"; ctx.fillRect(-9, -1, 4, 2); }
      else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-1.2, -1.2, 1.6, 0, 7); ctx.fill(); }
    }, 16, { order: 6 }));
    const op = this.owner.transform.position; this.transform.setPosition(op.x, op.y);
  }
  update(dt) {
    const o = this.owner, g = this.game; this.t += dt;
    if (!heroHere(g, o)) { this.draw.opacity = 0; return; }
    this.draw.opacity = 1; const op = o.transform.position, p = this.transform.position, i = o.input; let tx, ty, fast = false;
    if (i.atk) {
      const m = Math.hypot(i.ax, i.ay);
      if (m > 0.35) { const R = 96 * o.stats.range, k = Math.min(1, m); tx = op.x + i.ax / m * R * k; ty = op.y + i.ay / m * R * k; fast = true; } // 스틱을 끈 방향·세기만큼 멀리
      else { let bd = 150 * 150, best = null; for (const e of g.enemies) { if (e.dead || e.spawnDelay > 0) continue; const ep = e.transform.position, d = (ep.x - op.x) * (ep.x - op.x) + (ep.y - op.y) * (ep.y - op.y); if (d < bd) { bd = d; best = ep; } } if (best) { tx = best.x; ty = best.y; fast = true; } else { tx = op.x + Math.cos(o.facing) * 40; ty = op.y + Math.sin(o.facing) * 40; } }
    } else { tx = op.x + Math.cos(this.t * 3) * 18; ty = op.y + Math.sin(this.t * 3) * 18; }
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1, sp = Math.min(d * 9, fast ? 330 : 220), nvx = dx / d * sp, nvy = dy / d * sp;
    this.vx += (nvx - this.vx) * Math.min(1, dt * 14); this.vy += (nvy - this.vy) * Math.min(1, dt * 14);
    this.transform.setPosition(p.x + this.vx * dt, p.y + this.vy * dt);
    if (this.kind === "blade") this.ang = Math.hypot(this.vx, this.vy) > 25 ? Math.atan2(this.vy, this.vx) : this.ang + dt * 8;
    this.hitT -= dt; if (this.hitT > 0) return; this.hitT = 0.08;
    const q = this.transform.position, blade = this.kind === "blade", now = fxNow(), key = "_lu" + o.id, dmg = (blade ? 2 : 1.3) * o.stats.dmg;
    let m = Physics.overlapCircle(q.x, q.y, blade ? 9 : 7, PL.Enemy, _fb);
    for (let k = 0; k < m; k++) { const e = _fb[k].data; if (e.dead || e.spawnDelay > 0 || now - (e[key] || 0) < 0.25) continue; e[key] = now; const ep = e.transform.position; e.damage(dmg, o, Math.atan2(ep.y - q.y, ep.x - q.x), 80, true); o.applyHitEffects(e, dmg); }
    if (blade) { m = Physics.overlapCircle(q.x, q.y, 9, PL.EProj, _fb); for (let k = 0; k < m; k++) { const pr = _fb[k].data; if (pr.fromPlayer || pr.gameObject.isDestroyed || pr.orbit) continue; pr.gameObject.destroy(); } }
    m = Physics.overlapCircle(q.x, q.y, 7, PL.Obstacle, _fb); for (let k = 0; k < m; k++) { const ob = _fb[k].data; if (ob.destructible && !ob.dead && fxNow() - (ob._lu || 0) > 0.3) { ob._lu = fxNow(); ob.damage(1, o, !!o.stats.demolish); } }
  }
}

// ---- 바닥 장판: kind fire(화상) / poison(중독) / slow(감속) / spark(작은 피해) / bomb(잠시 뒤 폭발) ----
const ZONE_COL = { fire: "#ff7043", poison: "#9ccc65", slow: "#4fc3f7", spark: "#fff59d", bomb: "#ef5350" };
class Zone extends Component {
  constructor(game, owner, o) {
    super(); this.game = game; this.owner = owner; this.kind = o.kind; this.r = o.r; this.life = this.max = o.life; this.tick = o.tick ?? 0.4; this.tt = 0.1; this.dmg = o.dmg ?? 0; this.room = game.cur; this.boom = o.boom || 0; this.t = 0;
  }
  setup() {
    this.gameObject.addComponent(new DrawRenderer((ctx) => {
      const k = Math.max(0, this.life / this.max), c = ZONE_COL[this.kind]; ctx.globalAlpha *= 0.2 + 0.2 * k; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, this.r, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.5 * k + 0.1; ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, this.r * (this.kind === "bomb" ? 1 - k * 0.2 : 1), 0, 7); ctx.stroke();
    }, this.r + 4, { order: 1 }));
  }
  update(dt) {
    const g = this.game, p = this.transform.position; this.t += dt;
    if (g.cur !== this.room) { this.gameObject.destroy(); return; }
    if ((this.life -= dt) <= 0) { if (this.kind === "bomb") g.explode(p.x, p.y, this.r, this.boom, 0, this.owner); this.gameObject.destroy(); return; }
    if (this.kind === "bomb") return;
    this.tt -= dt; if (this.tt > 0) return; this.tt = this.tick;
    const m = Physics.overlapCircle(p.x, p.y, this.r, PL.Enemy, _fb), o = this.owner;
    for (let i = 0; i < m; i++) {
      const e = _fb[i].data; if (e.dead || e.spawnDelay > 0) continue;
      if (this.kind === "slow") { e.slowT = Math.max(e.slowT, 0.6); e.slowMul = Math.min(e.slowMul || 1, 0.5); }
      else if (this.kind === "fire") e.addStatus("burn", 1, o);
      else if (this.kind === "poison") e.addStatus("poison", 1, o);
      if (this.dmg > 0) e.damage(this.dmg, o, 0, 0, true);
    }
  }
}
function spawnZone(g, owner, x, y, o) {
  const zs = g._zones || (g._zones = []);
  if (zs.length > 40) { let w = 0; for (const z of zs) if (!z.gameObject.isDestroyed) zs[w++] = z; zs.length = w; }
  if (zs.length > 44) { const z = zs.shift(); if (!z.gameObject.isDestroyed) z.gameObject.destroy(); }
  const go = g.App.create("zone"); go.transform.setPosition(x, y);
  const z = go.addComponent(new Zone(g, owner, o)); z.setup(); zs.push(z); return z;
}

// ---- 포탑 ----
class Turret extends Component {
  constructor(game, owner, life) { super(); this.game = game; this.owner = owner; this.life = life; this.cd = 0.4; this.room = game.cur; this.ang = 0; }
  setup() {
    this.gameObject.addComponent(new DrawRenderer((ctx) => {
      ctx.fillStyle = "#546e7a"; ctx.strokeStyle = "#cfd8dc"; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill(); ctx.stroke();
      ctx.rotate(this.ang); ctx.fillStyle = "#cfd8dc"; ctx.fillRect(1, -1.5, 8, 3);
    }, 14, { order: 3 }));
  }
  update(dt) {
    const g = this.game, o = this.owner, p = this.transform.position;
    if (g.cur !== this.room || (this.life -= dt) <= 0) { this.gameObject.destroy(); return; }
    this.cd -= dt; if (this.cd > 0) return;
    let best = null, bd = 150 * 150;
    for (const e of g.enemies) { if (e.dead || e.spawnDelay > 0) continue; const ep = e.transform.position, d = (ep.x - p.x) * (ep.x - p.x) + (ep.y - p.y) * (ep.y - p.y); if (d < bd) { bd = d; best = ep; } }
    if (!best) { this.cd = 0.15; return; }
    this.cd = 0.55; this.ang = Math.atan2(best.y - p.y, best.x - p.x);
    g.spawnProj(p.x, p.y, this.ang, 230, 1.1 * (o ? o.stats.dmg : 1), true, { owner: o, life: 0.8, radius: 2.2, color: "#cfd8dc", knock: 40 });
  }
}
function spawnTurret(g, owner, x, y, life = 10) {
  const go = g.App.create("turret"); go.transform.setPosition(x, y);
  const t = go.addComponent(new Turret(g, owner, life)); t.setup(); return t;
}

// ---- 아이템 스탯에 맞춰 분신·칼날·조종 무기를 만들고 없앤다 (giveItem·rerollItems 뒤에 호출) ----
function clearFx(h) {
  if (h.clones) for (const c of h.clones) if (c.gameObject && !c.gameObject.isDestroyed) c.gameObject.destroy();
  if (h.bladeFx && !h.bladeFx.gameObject.isDestroyed) h.bladeFx.gameObject.destroy();
  if (h.ludoFx && !h.ludoFx.gameObject.isDestroyed) h.ludoFx.gameObject.destroy();
  h.clones = []; h.bladeFx = null; h.ludoFx = null;
}
function syncFx(h) {
  const s = h.stats, g = h.game; h.clones = (h.clones || []).filter(c => !c.gameObject.isDestroyed);
  for (const mode of ["ahead", "behind", "twin"]) {
    const want = mode === "ahead" ? s.cloneAhead : mode === "behind" ? s.cloneBehind : s.twin, have = h.clones.find(c => c.mode === mode && !c.life);
    if (want && !have) { const go = g.App.create("clone"); const c = go.addComponent(new Clone(g, h, mode)); c.setup(); h.clones.push(c); }
    else if (!want && have) { have.gameObject.destroy(); h.clones.splice(h.clones.indexOf(have), 1); }
  }
  if (s.blades > 0) { if (!h.bladeFx || h.bladeFx.gameObject.isDestroyed) { const go = g.App.create("blades"); h.bladeFx = go.addComponent(new Blades(g, h)); h.bladeFx.setup(); } h.bladeFx.n = s.blades; }
  else if (h.bladeFx) { h.bladeFx.gameObject.destroy(); h.bladeFx = null; }
  if (s.ludo > 0) {
    const kind = s.ludo >= 2 ? "blade" : "orb";
    if (h.ludoFx && (h.ludoFx.gameObject.isDestroyed || h.ludoFx.kind !== kind)) { if (!h.ludoFx.gameObject.isDestroyed) h.ludoFx.gameObject.destroy(); h.ludoFx = null; }
    if (!h.ludoFx) { const go = g.App.create("ludo"); h.ludoFx = go.addComponent(new Ludo(g, h, kind)); h.ludoFx.setup(); }
  } else if (h.ludoFx) { h.ludoFx.gameObject.destroy(); h.ludoFx = null; }
}
function spawnTempClone(g, owner, secs) { const go = g.App.create("clone"); const c = go.addComponent(new Clone(g, owner, "side", secs)); c.setup(); owner.clones.push(c); return c; }

// ---- 매 프레임 가벼운 아이템 틱 (Hero.update에서) ----
function fxTick(h, dt) {
  const s = h.stats, g = h.game, p = h.transform.position;
  if (h._floorN !== g.floorNum) { h._floorN = g.floorNum; const a = h.active; if (a && ACTIVES[a.id].kind === "floor") a.charge = ACTIVES[a.id].max; } // 층마다 횟수 충전
  if (s.trailWalk && h.moving) { h.trailT -= dt; if (h.trailT <= 0) { h.trailT = 0.28; spawnZone(g, h, p.x, p.y - 2, { kind: "spark", r: 8, life: 1.3, tick: 0.3, dmg: 0.7 * s.dmg }); } }
  if (s.pulse) {
    h.pulseT -= dt;
    if (h.pulseT <= 0) {
      h.pulseT = 6; const names = ["burn", "chill", "shock", "poison", "bleed"], m = Physics.overlapCircle(p.x, p.y, 70, PL.Enemy, _fb);
      for (let i = 0; i < m; i++) { const e = _fb[i].data; if (!e.dead && e.spawnDelay <= 0) e.addStatus(names[Math.floor(Math.random() * 5)], 1, h); }
      g.fx.emit(p.x, p.y, { count: 18, colors: ["#ef5350", "#ffee58", "#66bb6a", "#42a5f5", "#ab47bc"], speed: [40, 90], life: [0.3, 0.5], size: [1, 2], fade: true, area: 8 });
    }
  }
  if (s.bulletTime && h.hp <= Math.ceil(h.maxHp * 0.34)) { // 위기의 집중: HP가 얼마 안 남으면 적이 느려진다
    h.btT -= dt;
    if (h.btT <= 0) { h.btT = 0.25; for (const e of g.enemies) { if (e.dead) continue; e.slowT = Math.max(e.slowT, 0.4); e.slowMul = Math.min(e.slowMul || 1, 0.5); } }
  }
}

// ============================================================================
// 액티브 아이템용 방·아이템 조작
// ============================================================================
// 패시브 다시 뽑기: 가진 패시브를 전부 무작위 다른 아이템으로 (등급 없음)
function rerollItems(h) {
  const old = h.items.slice(); if (!old.length) return false;
  const held = new Set(old); for (const o of h.game.heroes) if (o !== h) for (const id of o.items) held.add(id);
  const list = old.map(() => { const x = randomItemId(held); held.add(x); return x; });
  const hp = h.hp; h.clearItems(); for (const id of list) h.giveItem(id); syncFx(h); h.hp = Math.max(1, Math.min(h.maxHp, hp)); return true;
}
// 작은 주사위: 가장 가까운 바닥 아이템(패시브·액티브·무기) 하나를 다른 것으로 (사거리 90)
function rerollNearest(h, g) {
  const p = h.transform.position; let best = null, bd = 90;
  for (const pk of g.pickups) {
    if (pk.gameObject.isDestroyed) continue; const t = pk.item.type; if (t !== "item" && t !== "active" && t !== "weapon") continue;
    const q = pk.transform.position, d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = pk; }
  }
  if (!best) return false;
  const it = best.item;
  if (it.type === "item") { const id = randomItemId(g._heldItems()); it.id = id; if (it.price > 0) it.price = PASSIVES[id].price; }
  else if (it.type === "active") { const id = randomActiveId(g._heldActives()); it.id = id; it.state = null; if (it.price > 0) it.price = ACTIVES[id].price; }
  else { it.weapon = randomWeapon(g.floorNum + 2); if (it.price > 0) it.price = weaponPrice(it.weapon); }
  const q = best.transform.position; g.fx.emit(q.x, q.y, { count: 8, colors: ["#ce93d8", "#fff"], speed: [10, 40], life: [0.2, 0.4], size: [1, 1.6], fade: true });
  return true;
}
// 방 한 번 더 돌기: 클리어한 일반·엘리트 방의 적이 다시 나타난다 (클리어하면 보상도 다시). 방마다 한 번
function replayRoom(g) {
  const r = g.cur; if (!r || r.replayed || !r.cleared || g.state !== "explore" || !(r.type === "normal" || r.type === "elite")) return false;
  r.replayed = true; r.cleared = false; g.state = "fight"; g._populate(r);
  for (const h of g.heroes) g.puff(h, ["#ce93d8", "#fff"]);
  SFX.play("warn"); return true;
}
// 다른 방으로 순간이동 (잠긴 방 — 열쇠가 필요한 보물방·상점·서재 — 은 제외). which: "start" 시작 방 / "random" 보스 외 무작위 방
function warp(g, which) {
  const m = g.map; if (!m || !g.cur) return false;
  let r = null;
  if (which === "start") r = m.start;
  else { const c = m.list.filter(x => x !== g.cur && x.type !== "boss" && !x.locked); r = c.length ? c[Math.floor(Math.random() * c.length)] : null; }
  if (!r || r === g.cur) return false;
  if (!g.cur.cleared) g.cur.spawned = false; // 싸우던 방을 떠나면 다음에 들어올 때 다시 시작된다
  g.enterRoom(r, null); return true;
}
// 바닥(상점·보물방 포함)의 아이템·무기를 다시 뽑는다
function rerollPickups(g) {
  const held = g._heldItems(), heldA = g._heldActives(); let n = 0;
  for (const pk of g.pickups) {
    if (pk.gameObject.isDestroyed) continue; const it = pk.item;
    if (it.type === "item") { const id = randomItemId(held); held.add(id); it.id = id; if (it.price > 0) it.price = PASSIVES[id].price; n++; }
    else if (it.type === "weapon") { it.weapon = randomWeapon(g.floorNum + 2); if (it.price > 0) it.price = weaponPrice(it.weapon); n++; }
    else if (it.type === "active") { const id = randomActiveId(heldA); heldA.add(id); it.id = id; it.state = null; if (it.price > 0) it.price = ACTIVES[id].price; n++; }
  }
  if (n) { SFX.play("item"); for (const h of g.heroes) g.puff(h, ["#ffe082", "#fff"]); }
  return n > 0;
}
// 푸른 주사위: 현재 방 바닥의 픽업(코인·열쇠·하트·꾸러미·상자)을 무작위 픽업으로 바꾼다
function rerollRoomPickups(g) {
  const list = g.pickups.filter(pk => !pk.gameObject.isDestroyed && (pk.item.type === "coin" || pk.item.type === "key" || pk.item.type === "bundle" || pk.item.type === "chest" || (pk.item.type === "heart" && !(pk.item.price > 0)))); let n = 0;
  for (const pk of list) {
    const p = pk.transform.position, x = p.x, y = p.y; pk.gameObject.destroy(); n++;
    const r = Math.random();
    if (r < 0.40) g.spawnCoin(x, y, g.rollCoinValue(0)); else if (r < 0.60) g.spawnKey(x, y); else if (r < 0.78) g.spawnHeart(x, y); else if (r < 0.90) g.spawnBundle(x, y); else g.spawnChest(x, y);
    g.fx.emit(x, y, { count: 6, colors: ["#4fc3f7", "#fff"], speed: [10, 40], life: [0.2, 0.4], size: [1, 1.6], fade: true });
  }
  return n > 0;
}
// 바닥의 동전→열쇠→하트→동전으로 바꾼다
function convertPickups(g) {
  const list = g.pickups.filter(pk => !pk.gameObject.isDestroyed && (pk.item.type === "coin" || pk.item.type === "key" || (pk.item.type === "heart" && !(pk.item.price > 0)))); let n = 0;
  for (const pk of list) {
    const p = pk.transform.position, t = pk.item.type; pk.gameObject.destroy(); n++;
    if (t === "coin") g.spawnKey(p.x, p.y); else if (t === "key") g.spawnHeart(p.x, p.y); else g.spawnCoin(p.x, p.y, 3);
    g.fx.emit(p.x, p.y, { count: 6, colors: ["#ffe082", "#fff"], speed: [10, 40], life: [0.2, 0.4], size: [1, 1.6], fade: true });
  }
  if (n) SFX.play("item");
  return n > 0;
}
