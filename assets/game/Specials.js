// 특수 방: 가시방 · 희생방 · 도박방 · 매복방 · 서재(열쇠). 정의 표는 Floor.js의 SPECIAL_ROOMS (층 범위·확률·이름·색).
// 이 파일은 (1) 방 레이아웃 SPECIAL_LAYOUT, (2) 방에 들어갔을 때 내용을 채우는 Specials.populate, (3) 방이 도는 동안 동작하는 컨트롤러(Specials.create)를 가진다.
//   · 가시방: 처음 들어갈 때 모두 피해 1(체력 1은 남김). 바닥에 가시 판이 주기적으로 솟는다(준비 → 솟음). 건너편에 보상 아이템
//   · 희생방: 제단에 닿으면 체력 1을 바친다(체력 1이어도 바칠 수 있다 — 죽으면 보스 방 클리어 때 부활). 바친 횟수별로 정해진 종류의 보상이 나온다 (SAC_TABLE)
//   · 도박방: 기계 앞에서 공격 = 3G를 넣고 돌리기. 결과 표 GAMBLE_TABLE, 가끔 고장
//   · 매복방: 문이 잠기고 적이 3번에 걸쳐 몰려온다 → 클리어 보상(인원수만큼 아이템)
//   · 악마 상점(devil): 보스 방을 클리어할 때 보스전에서 맞은 횟수에 따라 확률로 열리는 옆방. 골드 대신 체력(하트)으로 산다 (아래 DEVIL_*)
//   · 서재: 열쇠 1개로 들어간다. 인원수+2개의 아이템 중 인원수만큼만 고를 수 있다 (group)
const DIRV = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };
const SPIKE_CYCLE = 2.8, SPIKE_SAFE = 1.5, SPIKE_WARN = 0.45;                  // 안전 1.5초 → 준비 0.45초 → 솟음 0.85초
const SAC_TABLE = ["coins2", "key", "heart", "coins4", "item", "weapon", "active", "jackpot"];  // 바친 횟수 1~8번째 보상 (고정)
const GAMBLE_PRICE = 3;
// 악마 상점: 보스전에서 맞은 횟수(누가 맞든 피해를 입을 때마다 1)에 따라 열릴 확률 = 0.5^맞은 횟수 (0번 100% · 1번 50% · 2번 25% · 3번 12.5% …).
// 값은 체력(하트)으로 낸다: 패시브·무기 1 · 액티브 2, 1체력 → 8G, 1체력 → 열쇠 3개
const DEVIL_GOLD = 8, DEVIL_KEYS = 3;
function devilChance(hits) { return Math.pow(0.5, Math.max(0, Math.floor(hits || 0))); }
const GAMBLE_TABLE = [["nothing", 40], ["c3", 24], ["c5", 11], ["c10", 4], ["key", 8], ["heart", 6], ["boom", 5], ["item", 2]];  // [결과, 가중치]

// 특수 방·상점·보물방의 배치도 타일맵 위에 만든다. 함수는 (G, room, R) — G.ownerView()는 문이 있는 칸의 지역 좌표(위쪽이 r=0), R은 시드 난수.
//   가시 타일(T.SPIKE)은 걸어 다닐 수 있는 바닥이고, 가시 판의 동작·그림은 SpikeField가 맡는다. 제단(T.ALTAR)은 2x3 타일을 차지하고 지름 50의 원 하나가 된다.
const AMBUSH_BASE = ["arenaRing", "pillarRing", "bunkers", "fortress", "quadrants", "doubleRing", "pillarGrid", "colonnade"];
const SPECIAL_LAYOUT = {
  treasure(G, room, R) { const V = G.ownerView(); for (const [c, r] of [[2, 1], [13, 1], [2, 7], [13, 7]]) if (R.chance(0.75)) V.set(c, r, T.PILLAR); },
  shop(G, room, R) { const V = G.ownerView(); for (const [c, r] of [[1, 1], [14, 1], [1, 7], [14, 7]]) V.set(c, r, T.PILLAR); if (R.chance(0.5)) { V.set(3, 0, T.BARREL); V.set(12, 0, T.BARREL); } },
  // 가시방: 문 반대쪽에 보상, 그 사이에 가시 판 띠 3줄. 띠는 방을 가득 가로질러서 옆으로 돌아갈 수 없다
  spike(G, room, R) {
    const d = Object.keys(room.nb || {})[0] || "S", m = G.map, ow = G.owner, spots = [];
    if (d === "N" || d === "S") { const V = G.ownerView(false, d === "S"); V.rect(0, 3, 15, 5, T.SPIKE); V.set(2, 7, T.PILLAR); V.set(13, 7, T.PILLAR); for (const u of [-50, 0, 50]) spots.push({ x: ow.x + u, y: V.wy(7) }); }
    else { const V = G.ownerView(d === "E", false); V.rect(5, 0, 7, 8, T.SPIKE); V.set(13, 1, T.PILLAR); V.set(13, 7, T.PILLAR); for (const u of [-50, 0, 50]) spots.push({ x: V.wx(13), y: ow.y + u }); }
    G.spots = spots; G.checks.push([m.ti(spots[1].x), m.tj(spots[1].y)]);
  },
  sacrifice(G, room, R) { const V = G.ownerView(); V.rect(7, 3, 8, 5, T.ALTAR); for (const [c, r] of [[3, 2], [12, 2], [3, 6], [12, 6]]) V.set(c, r, T.PILLAR); },
  gamble(G, room, R) { const V = G.ownerView(); V.rect(4, 1, 4, 2, T.MACHINE); V.rect(11, 1, 11, 2, T.MACHINE); V.rect(1, 6, 1, 7, T.CRATE); V.rect(14, 6, 14, 7, T.CRATE); },
  ambush(G, room, R) { const id = R.pick(AMBUSH_BASE), t = A_CELL.find(a => a.id === id); t.fn(G, G.ownerView(R.chance(0.5), R.chance(0.5)), R); },
  devil(G, room, R) { const V = G.ownerView(); for (const [c, r] of [[3, 2], [12, 2], [3, 6], [12, 6]]) V.set(c, r, T.PILLAR); },
  library(G, room, R) { const V = G.ownerView(); V.hline(1, 3, 6, T.WALL); V.hline(1, 9, 12, T.WALL); V.set(1, 7, T.PILLAR); V.set(14, 7, T.PILLAR); },
  secret(G, room, R) { const V = G.ownerView(); for (const [c, r] of [[2, 2], [13, 2], [2, 6], [13, 6]]) V.set(c, r, T.PILLAR); },
};

class SpikeField extends Component {
  constructor(game, tiles) { super(); this.game = game; this.tiles = tiles; this.t = 0; }
  setup() { this.gameObject.addComponent(new DrawRenderer(ctx => this._draw(ctx), 300, { order: 0 })); }
  _phase(tl) { const p = (this.t + tl.ph) % SPIKE_CYCLE; return p; }
  update(dt) {
    this.t += dt; const g = this.game; if (g.state === "over" || g.state === "victory") return;
    for (const h of g.heroes) {
      if (!h.alive || h.invuln > 0) continue; const p = h.transform.position, r = h.radius;
      for (const tl of this.tiles) {
        if (this._phase(tl) < SPIKE_SAFE + SPIKE_WARN) continue;                                  // 솟아 있을 때만 아프다 (그려진 판 전체)
        const dx = Math.max(Math.abs(p.x - tl.x) - tl.hw, 0), dy = Math.max(Math.abs(p.y - tl.y) - tl.hh, 0);
        if (dx * dx + dy * dy < r * r) { h.hit(1, tl.x, tl.y, 70); break; }
      }
    }
  }
  _draw(ctx) {
    for (const tl of this.tiles) {
      const p = this._phase(tl), w = tl.hw * 2, h = tl.hh * 2, x0 = tl.x - tl.hw, y0 = tl.y - tl.hh;
      ctx.fillStyle = "#1b1517"; ctx.fillRect(x0, y0, w, h); ctx.fillStyle = "#2b2124"; ctx.fillRect(x0 + 1, y0 + 1, w - 2, h - 2);
      const up = p >= SPIKE_SAFE + SPIKE_WARN, warn = !up && p >= SPIKE_SAFE, k = up ? 1 : warn ? 0.25 + 0.2 * Math.sin(p * 40) : 0;
      ctx.fillStyle = "#120d0f";                                                                    // 구멍
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) ctx.fillRect(tl.x - tl.hw + w * (a + 0.5) / 3 - 1.5, tl.y - tl.hh + h * (b + 0.5) / 3 - 1.5, 3, 3);
      if (k <= 0) continue;
      ctx.fillStyle = up ? "#cfd8dc" : "#ef9a9a";
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        const cx = tl.x - tl.hw + w * (a + 0.5) / 3, cy = tl.y - tl.hh + h * (b + 0.5) / 3, s = Math.min(w, h) / 6 + 0.5, hh = s * 1.8 * k;
        ctx.beginPath(); ctx.moveTo(cx - s, cy - s * 0.6); ctx.lineTo(cx + s, cy - s * 0.6); ctx.lineTo(cx, cy - s * 0.6 + hh); ctx.fill();
      }
      if (up) { ctx.strokeStyle = "#b71c1c"; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1); }
    }
  }
}

// ── 희생방 컨트롤러 ────────────────────────────────────────────────────────────
class SacrificeCtl {
  constructor(game, room) { this.g = game; this.room = room; this.st = room.sp; this.altar = game.obstacles.find(o => o.kind === "altar"); this.cd = 0; if (this.altar) this.altar.count = this.st.count; }
  update(dt) {
    this.cd -= dt; const a = this.altar; if (!a || this.cd > 0 || this.st.count >= SAC_TABLE.length) return;
    const ap = a.transform.position;
    for (const h of this.g.heroes) {
      if (!h.alive) continue; const p = h.transform.position;
      if (Math.hypot(p.x - ap.x, p.y - ap.y) <= a.w / 2 + h.radius + 3) { this.sacrifice(h, ap); break; }   // 제단(반지름 w/2)에 몸이 닿았을 때
    }
  }
  sacrifice(h, ap) {
    const g = this.g; this.cd = 0.9;
    h.hp -= 1; h.invuln = Math.max(h.invuln, 0.9); h.draw.flash = 0.1; h.hurtT = 3; SFX.play("hurt");   // 체력 1이어도 바칠 수 있다 (죽으면 보스 방 클리어 때 부활)
    const a = Math.atan2(h.transform.position.y - ap.y, h.transform.position.x - ap.x); h.kx = Math.cos(a) * 110; h.ky = Math.sin(a) * 110; h.swing = null;
    g.fx.emit(ap.x, ap.y, { count: 12, colors: ["#b71c1c", "#ef5350", "#fff"], speed: [20, 80], life: [0.3, 0.6], size: [1, 2.2], fade: true }); g.cam.shake(2, 0.2);
    h.fire?.("damaged", 1);
    const n = ++this.st.count; this.altar.count = n; this.reward(SAC_TABLE[n - 1], n, ap);
    if (h.hp <= 0) h.die();                                                           // 앙크 같은 부활 효과가 있으면 Hero.die가 처리한다
  }
  reward(kind, n, ap) {
    const g = this.g, np = g._np(), R = (i = 0) => { const a = n * 2.4 + i * 1.3, s = g._freeSpot(ap.x + Math.cos(a) * 56, ap.y + Math.sin(a) * 56, 12); return [s.x, s.y]; };
    const takenP = g._heldItems(), takenA = g._heldActives();
    switch (kind) {
      case "coins2": for (let i = 0; i < 2; i++) { const [x, y] = R(i); g.spawnCoin(x, y, g.rollCoinValue(0.1)); } break;
      case "key": { const [x, y] = R(); g.spawnKey(x, y); break; }
      case "heart": { const [x, y] = R(); g.spawnHeart(x, y); break; }
      case "coins4": for (let i = 0; i < 4; i++) { const [x, y] = R(i); g.spawnCoin(x, y, g.rollCoinValue(0.45)); } break;
      case "item": { const [x, y] = R(); g._makePickup({ ...g._itemSlot(takenP, takenA, 0), price: 0, x, y }); break; }
      case "weapon": { const [x, y] = R(); g.spawnWeaponPickup(x, y, randomWeapon(g.floorNum + 5, 1)); break; }
      case "active": { const [x, y] = R(); const id = randomActiveId(takenA); g.spawnActivePickup(x, y, id); break; }
      case "jackpot": { for (let i = 0; i < 2; i++) { const [x, y] = R(i); g.spawnKey(x, y); } const [hx, hy] = R(2); g.spawnHeart(hx, hy); const [x, y] = R(3); g.spawnChest(x, y); break; }
    }
    SFX.play(kind === "jackpot" ? "win" : "item");
  }
}

// ── 도박방 컨트롤러 ────────────────────────────────────────────────────────────
class GambleCtl {
  constructor(game, room) { this.g = game; this.room = room; this.st = room.sp; this.ms = game.obstacles.filter(o => o.kind === "machine"); this.ms.forEach((m, i) => { m.broken = !!this.st.broken[i]; m.idx = i; }); this.pending = []; }
  update(dt) {
    for (const m of this.ms) if (m.spin > 0) m.spin -= dt;
    for (let i = this.pending.length - 1; i >= 0; i--) { const q = this.pending[i]; q.t -= dt; if (q.t <= 0) { this.pending.splice(i, 1); this.resolve(q.m); } }
  }
  interact(h) {                                                                    // 기계 앞에서 공격 = 돌리기
    const p = h.transform.position; let best = null, bd = 30 + h.radius;
    for (const m of this.ms) { const q = m.transform.position, d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = m; } }
    if (!best || best.broken || best.spin > 0) return false;
    const g = this.g; if (g.gold < GAMBLE_PRICE) { SFX.play("block"); return true; }
    g.gold -= GAMBLE_PRICE; best.spin = 0.55; SFX.play("coin"); this.pending.push({ m: best, t: 0.55 }); this.st.plays++; return true;
  }
  resolve(m) {
    const g = this.g, mp = m.transform.position; let tot = 0; for (const [, w] of GAMBLE_TABLE) tot += w;
    let r = Math.random() * tot, kind = "nothing"; for (const [k, w] of GAMBLE_TABLE) { r -= w; if (r < 0) { kind = k; break; } }
    const s = g._freeSpot(mp.x + (Math.random() - 0.5) * 24, mp.y - 30, 12), x = s.x, y = s.y;
    if (kind === "c3") g.spawnCoin(x, y, 3); else if (kind === "c5") g.spawnCoin(x, y, 5); else if (kind === "c10") g.spawnCoin(x, y, 10);
    else if (kind === "key") g.spawnKey(x, y); else if (kind === "heart") g.spawnHeart(x, y);
    else if (kind === "item") g._makePickup({ ...g._itemSlot(g._heldItems(), g._heldActives(), 0.1), price: 0, x, y });
    else if (kind === "boom") { g.explode(mp.x, mp.y - 18, 26, 0, 1, null); }
    SFX.play(kind === "nothing" ? "block" : kind === "boom" ? "boom" : "item");
    if (kind === "boom" || Math.random() < 0.04) { m.broken = true; this.st.broken[m.idx] = true; g.fx.emit(mp.x, mp.y, { count: 10, colors: ["#757575", "#bdbdbd"], speed: [10, 40], life: [0.3, 0.7], size: [1, 2], fade: true }); }
  }
}

const Specials = {
  // enterRoom에서 지형을 만든 뒤 부른다. 컨트롤러(없으면 null)를 돌려준다.
  create(game, room) {
    const t = room.type;
    if (t === "spike") {
      const go = game.App.create("spikes"); go.addComponent(new SpikeField(game, room.layout.spikes || [])).setup(); game.spObjs.push(go); return { update() {} };
    }
    if (t === "sacrifice") return new SacrificeCtl(game, room);
    if (t === "gamble") return new GambleCtl(game, room);
    return null;
  },
  // 보스 방을 클리어했을 때 부른다: 악마 상점 방을 만들고 보스 방에 포탈을 연다 (한 번 열리면 그 층 동안 계속 열려 있다)
  openDevil(game, boss) {
    boss.devil = boss.devil || { type: "devil", seed: hash2(boss.seed || 1, 0xde711), x: boss.x, y: boss.y, visited: false, cleared: true, spawned: false, items: [], obs: null, big: false, cells: [[0, 0]], nb: { S: boss }, dist: boss.dist };
    boss.devilOpen = true; game._makePortal(); SFX.play("warn"); return boss.devil;
  },
  // 방에 처음 들어갔을 때 한 번: 내용물 채우기
  populate(game, room, np) {
    const t = room.type, lay = room.layout || {}, takenP = game._heldItems(), takenA = game._heldActives();
    if (t === "spike") {
      room.cleared = true;
      for (const h of game.heroes) if (h.alive && h.hp > 1) { h.hp -= 1; h.draw.flash = 0.1; h.hurtT = 3; }       // 들어오는 대가: 모두 체력 1 (마지막 1은 남김)
      SFX.play("hurt"); game.cam.shake(3, 0.25);
      const spots = lay.spots || [], n = Math.min(spots.length, 1 + Math.floor(np / 3));
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i];
        if (i === 1 && n >= 1) game._makePickup({ ...game._itemSlot(takenP, takenA, 0.2), price: 0, x: s.x, y: s.y });
        else if (i === 0 && n >= 2) game._makePickup({ ...game._itemSlot(takenP, takenA, 0.2), price: 0, x: s.x, y: s.y });
        else game.spawnCoin(s.x, s.y, game.rollCoinValue(0.3));
      }
    } else if (t === "sacrifice") { room.cleared = true; room.sp = { count: 0 }; }
    else if (t === "gamble") { room.cleared = true; room.sp = { plays: 0, broken: [] }; }
    else if (t === "devil") { // 악마 상점: 인원수에 따라 품목이 늘어난다 (일반 상점처럼)
      room.cleared = true; const items = [], pn = Math.max(1, Math.ceil((2 + np * 2) * 0.4)), wn = Math.max(1, Math.ceil((2 + np * 2) * 0.2)), an = 1 + Math.floor(np / 2);
      for (let i = 0; i < pn; i++) items.push({ ...game._itemSlot(takenP, takenA, 0), hpPrice: 1 });                                       // 패시브 1하트
      for (let i = 0; i < wn; i++) items.push({ type: "weapon", weapon: randomWeapon(game.floorNum + 5, 1), hpPrice: 1 });                     // 무기 1하트
      for (let i = 0; i < an; i++) { const id = randomActiveId(takenA); takenA.add(id); items.push({ type: "active", id, state: null, hpPrice: 2 }); } // 액티브 2하트
      items.push({ type: "trade", give: { gold: DEVIL_GOLD }, stock: np, hpPrice: 1 }); items.push({ type: "trade", give: { keys: DEVIL_KEYS }, stock: 1, hpPrice: 1 });
      const pos = game._layout(items.length, 6); items.forEach((it, i) => game._makePickup({ ...it, price: 0, x: pos[i].x, y: pos[i].y }));
    }
    else if (t === "secret") { // 비밀방 보상: 아이템 하나, 아니면 코인·하트·열쇠 더미
      room.cleared = true; const q = game._freeSpot(0, 0, 14);
      if (Math.random() < 0.5) game._makePickup({ ...game._itemSlot(takenP, takenA, 0.15), price: 0, x: q.x, y: q.y });
      else { for (let i = 0; i < 4; i++) { const s2 = game._dropSpot(40); game.spawnCoin(s2.x, s2.y, game.rollCoinValue(0.4)); } const h2 = game._dropSpot(40); game.spawnHeart(h2.x, h2.y); const k2 = game._dropSpot(40); game.spawnKey(k2.x, k2.y); }
    }
    else if (t === "ambush") { room.waves = 3; game._spawnWave(false, 1); }
    else if (t === "library") {
      room.cleared = true; const n = np + 2, pos = game._layout(n, 8); room.groupLeft = { lib: np };
      for (let i = 0; i < n; i++) { const it = game._itemSlot(takenP, takenA, 0.12); game._makePickup({ ...it, price: 0, group: "lib", x: pos[i].x, y: pos[i].y }); }
    }
  },
  // clearRoom에서: 전투가 있는 특수 방의 보상
  reward(game, room, np) {
    if (room.type === "ambush") {
      const takenP = game._heldItems(), takenA = game._heldActives(), pos = game._layout(np, 0);
      for (let i = 0; i < np; i++) game._makePickup({ ...game._itemSlot(takenP, takenA, 0.2), price: 0, x: pos[i].x, y: pos[i].y });
      game._roomRewards(ECON.elite, np, false);
    }
  },
};
