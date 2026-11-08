// ============================================================================
// 적 정의 (데이터 기반). 새 적은 ENEMY_DEFS에 한 항목을 추가하고 ENEMY_POOL에 등장 층·가중치만 적으면 된다.
//
//  hp, speed, radius, color, kind(square|circle|diamond|tri|poly), sides(poly 변 수), touch(접촉 피해), resist(넉백 저항 0~1)
//  ai: chase(쫓아감) | kite(keep:[가까운한계,먼한계] 거리 유지) | bomber(다가가 자폭)
//  gold: [최소,최대] 코인 드랍 (확률 goldChance)
//  onDeath: { spawn, count }  죽을 때 다른 적 생성 (분열)
//  attacks: [ 패턴, ... ]   (보스는 phases: [{ at: 체력비율, attacks }])  at 이하가 되면 그 단계로 전환
//
//  패턴 공통: cd(쿨다운 초), first(첫 발동까지 초), range(이 거리 안일 때만)
//    shoot  : count, spread(rad), speed, dmg           조준 탄 (여러 발 부채꼴)
//    ring   : count, speed, dmg                        사방 탄막
//    spiral : dur, rate(초당 발사), step(회전 rad), arms, speed, dmg   회전 탄막
//    charge : windup, dur, speed                       예고선 후 돌진
//    slam   : windup, radius, dmg                      예고 원 후 내려찍기
//    summon : spawn, count, max                        졸개 소환
//  countScale: true 이면 층·인원수 보너스(sc.countAdd)가 탄 개수(count/arms)에 더해진다.
// ============================================================================
const BALANCE = {
  hpPerFloor: 0.15,           // 층마다 체력 +15%
  hpPerExtraPlayer: 0.3,      // 인원 1명 추가마다 체력 +30% (1명 기준 0.7 + 0.3n)
  countEveryFloors: 3,        // 몇 층마다 탄 개수 +1
  countPerExtraPlayer: 0.6,   // 추가 인원 1명당 탄 개수 +0.6 (내림)
  speedPerFloor: 0.03, speedPerExtraPlayer: 0.04,   // 이동·탄 속도
  ratePerFloor: 0.05, ratePerExtraPlayer: 0.06,     // 패턴 빈도 (쿨다운이 줄어든다)
  dmgEveryFloors: 4,          // 몇 층마다 탄/접촉 피해 +1
  maxArms: 6,                 // 회전 탄막 줄기 수 상한
  maxEnemyProjectiles: 260,   // 화면 위 적 탄 최대 개수 (넘으면 더 안 쏜다: 성능·공정성)
  eliteHp: 3, eliteCountAdd: 1, eliteRate: 1.25, eliteSpeed: 1.1, eliteRadius: 1.35,
};
// 층(floor)과 인원수(np)로 적 능력치 배율을 계산한다. 적은 생성될 때 이걸 한 번 받아 간다.
function calcScale(floor, np, elite = false) {
  const B = BALANCE, f = floor - 1, e = Math.max(0, np - 1);
  const sc = {
    hp: (1 + B.hpPerFloor * f) * (1 - B.hpPerExtraPlayer + B.hpPerExtraPlayer * np),
    countAdd: Math.floor(f / B.countEveryFloors) + Math.floor(e * B.countPerExtraPlayer),
    speed: 1 + B.speedPerFloor * f + B.speedPerExtraPlayer * e,
    rate: 1 + B.ratePerFloor * f + B.ratePerExtraPlayer * e,
    dmgAdd: Math.floor(f / B.dmgEveryFloors),
  };
  if (elite) { sc.hp *= B.eliteHp; sc.countAdd += B.eliteCountAdd; sc.rate *= B.eliteRate; sc.speed *= B.eliteSpeed; }
  return sc;
}

const ENEMY_DEFS = {
  grunt:    { name: "고블린", hp: 4, speed: 30, radius: 6, color: "#ef5350", kind: "square", touch: 1, ai: "chase", gold: [1, 1], goldChance: 0.3 },
  runner:   { name: "박쥐", hp: 2, speed: 62, radius: 4, color: "#ffee58", kind: "circle", touch: 1, ai: "chase", gold: [1, 1], goldChance: 0.25 },
  slime:    { name: "슬라임", hp: 5, speed: 24, radius: 7, color: "#66bb6a", kind: "circle", touch: 1, ai: "chase", gold: [1, 1], goldChance: 0.3, onDeath: { spawn: "slimelet", count: 2 } },
  slimelet: { name: "아기 슬라임", hp: 2, speed: 40, radius: 4, color: "#a5d6a7", kind: "circle", touch: 1, ai: "chase", goldChance: 0 },
  shooter:  { name: "궁수", hp: 3, speed: 24, radius: 5, color: "#4dd0e1", kind: "diamond", touch: 1, ai: "kite", keep: [60, 90], gold: [1, 2], goldChance: 0.4,
              attacks: [{ type: "shoot", cd: 1.8, count: 1, spread: 0, speed: 95, dmg: 1, countScale: true }] },
  charger:  { name: "멧돼지", hp: 7, speed: 28, radius: 7, color: "#ff8a65", kind: "tri", touch: 1, ai: "chase", gold: [1, 2], goldChance: 0.4,
              attacks: [{ type: "charge", cd: 3.2, windup: 0.6, dur: 0.45, speed: 170, range: 140 }] },
  spreader: { name: "마법사", hp: 5, speed: 20, radius: 6, color: "#ba68c8", kind: "diamond", touch: 1, ai: "kite", keep: [70, 100], gold: [1, 2], goldChance: 0.4,
              attacks: [{ type: "shoot", cd: 2.3, count: 3, spread: 0.35, speed: 80, dmg: 1, countScale: true }] },
  bomber:   { name: "폭탄병", hp: 3, speed: 50, radius: 5, color: "#ff7043", kind: "circle", touch: 0, ai: "bomber", gold: [1, 1], goldChance: 0.3 },
  tank:     { name: "골렘", hp: 16, speed: 18, radius: 10, color: "#8e24aa", kind: "square", touch: 2, ai: "chase", resist: 0.3, gold: [2, 3], goldChance: 0.7,
              attacks: [{ type: "slam", cd: 3.5, windup: 0.8, radius: 30, dmg: 2, range: 55 }] },
  spinner:  { name: "회전포", hp: 9, speed: 12, radius: 8, color: "#26a69a", kind: "poly", sides: 8, touch: 1, ai: "chase", gold: [2, 3], goldChance: 0.6,
              attacks: [{ type: "spiral", cd: 4, dur: 2.2, rate: 12, step: 0.5, arms: 2, speed: 75, dmg: 1, countScale: true }] },
  summoner: { name: "소환사", hp: 6, speed: 18, radius: 6, color: "#7e57c2", kind: "diamond", touch: 1, ai: "kite", keep: [80, 110], gold: [2, 3], goldChance: 0.6,
              attacks: [{ type: "summon", cd: 6, spawn: "runner", count: 2, max: 5, countScale: true }] },

  // ---------- 보스 ----------
  slimeKing: { name: "슬라임 왕", boss: true, hp: 140, speed: 22, radius: 16, color: "#43a047", kind: "circle", touch: 2, ai: "chase", resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "ring", cd: 3.5, count: 10, speed: 65, dmg: 1, countScale: true }, { type: "summon", cd: 7, spawn: "slime", count: 2, max: 5 }] },
      { at: 0.5, attacks: [{ type: "ring", cd: 2.6, count: 14, speed: 70, dmg: 1, countScale: true }, { type: "summon", cd: 5, spawn: "slimelet", count: 3, max: 8 }, { type: "shoot", cd: 2, count: 3, spread: 0.3, speed: 95, dmg: 1, countScale: true }] }] },
  knight:    { name: "화염 기사", boss: true, hp: 150, speed: 34, radius: 13, color: "#ff7043", kind: "poly", sides: 6, touch: 2, ai: "chase", resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "charge", cd: 3.5, windup: 0.7, dur: 0.5, speed: 190, range: 200 }, { type: "shoot", cd: 2.5, count: 3, spread: 0.4, speed: 100, dmg: 1, countScale: true }] },
      { at: 0.5, attacks: [{ type: "charge", cd: 2.6, windup: 0.55, dur: 0.5, speed: 210, range: 220 }, { type: "ring", cd: 3.5, count: 12, speed: 80, dmg: 1, countScale: true }, { type: "shoot", cd: 2, count: 5, spread: 0.5, speed: 105, dmg: 1, countScale: true }] }] },
  witch:     { name: "마녀", boss: true, hp: 130, speed: 28, radius: 11, color: "#ab47bc", kind: "diamond", touch: 2, ai: "kite", keep: [90, 120], resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "spiral", cd: 5, dur: 2.5, rate: 14, step: 0.5, arms: 2, speed: 80, dmg: 1, countScale: true }, { type: "shoot", cd: 2.2, count: 5, spread: 0.8, speed: 90, dmg: 1, countScale: true }] },
      { at: 0.5, attacks: [{ type: "spiral", cd: 4, dur: 2.8, rate: 18, step: 0.6, arms: 3, speed: 85, dmg: 1, countScale: true }, { type: "ring", cd: 3, count: 14, speed: 75, dmg: 1, countScale: true }, { type: "summon", cd: 7, spawn: "runner", count: 3, max: 6 }] }] },
  golem:     { name: "골렘 왕", boss: true, hp: 200, speed: 18, radius: 18, color: "#78909c", kind: "square", touch: 2, ai: "chase", resist: 0.6,
    phases: [
      { at: 1, attacks: [{ type: "slam", cd: 3, windup: 0.9, radius: 42, dmg: 2, range: 70 }, { type: "ring", cd: 4, count: 12, speed: 70, dmg: 1, countScale: true }] },
      { at: 0.5, attacks: [{ type: "slam", cd: 2.2, windup: 0.8, radius: 52, dmg: 2, range: 80 }, { type: "ring", cd: 3.2, count: 16, speed: 80, dmg: 1, countScale: true }, { type: "summon", cd: 6, spawn: "grunt", count: 3, max: 6 }] }] },
  reaper:    { name: "사신", boss: true, hp: 170, speed: 40, radius: 12, color: "#455a64", kind: "poly", sides: 5, touch: 2, ai: "chase", resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "charge", cd: 3, windup: 0.5, dur: 0.5, speed: 220, range: 220 }, { type: "spiral", cd: 5, dur: 2.2, rate: 14, step: 0.55, arms: 3, speed: 85, dmg: 1, countScale: true }] },
      { at: 0.5, attacks: [{ type: "charge", cd: 2, windup: 0.4, dur: 0.5, speed: 240, range: 240 }, { type: "ring", cd: 2.5, count: 16, speed: 85, dmg: 1, countScale: true }, { type: "summon", cd: 6, spawn: "bomber", count: 3, max: 6 }] }] },
  overlord:  { name: "마왕", boss: true, hp: 420, speed: 30, radius: 20, color: "#d32f2f", kind: "poly", sides: 7, touch: 2, ai: "chase", resist: 0.1,
    phases: [
      { at: 1, attacks: [{ type: "ring", cd: 3, count: 14, speed: 75, dmg: 1, countScale: true }, { type: "shoot", cd: 2, count: 5, spread: 0.7, speed: 100, dmg: 1, countScale: true }, { type: "summon", cd: 8, spawn: "runner", count: 3, max: 6 }] },
      { at: 0.66, attacks: [{ type: "spiral", cd: 4, dur: 3, rate: 16, step: 0.6, arms: 3, speed: 90, dmg: 1, countScale: true }, { type: "charge", cd: 3, windup: 0.5, dur: 0.5, speed: 220, range: 240 }, { type: "slam", cd: 3.5, windup: 0.8, radius: 45, dmg: 2, range: 80 }] },
      { at: 0.33, attacks: [{ type: "ring", cd: 2.2, count: 20, speed: 90, dmg: 1, countScale: true }, { type: "spiral", cd: 3.2, dur: 3, rate: 20, step: 0.7, arms: 4, speed: 95, dmg: 1, countScale: true }, { type: "charge", cd: 2.4, windup: 0.4, dur: 0.5, speed: 240, range: 260 }, { type: "summon", cd: 6, spawn: "bomber", count: 3, max: 6 }] }] },
};
// 일반 방에 나오는 적: [종류, 처음 나오는 층, 가중치]
const ENEMY_POOL = [
  ["grunt", 1, 10], ["runner", 1, 6], ["slime", 1, 5],
  ["shooter", 2, 5], ["charger", 2, 4],
  ["spreader", 3, 4], ["bomber", 3, 4],
  ["tank", 4, 3], ["spinner", 4, 3],
  ["summoner", 5, 2],
];
const BOSS_BY_FLOOR = ["slimeKing", "knight", "witch", "golem", "reaper"]; // 1~5층. 6~7층은 이 중 무작위, 8층은 마왕
const bossForFloor = f => f >= MAX_FLOOR ? "overlord" : BOSS_BY_FLOOR[f - 1] || BOSS_BY_FLOOR[Math.floor(Math.random() * BOSS_BY_FLOOR.length)];
const pickEnemyType = floor => {
  const pool = ENEMY_POOL.filter(p => p[1] <= floor);
  let r = Math.random() * pool.reduce((a, p) => a + p[2], 0);
  for (const p of pool) if ((r -= p[2]) < 0) return p[0];
  return "grunt";
};

class Enemy extends Component {
  // opts: { delay, elite, parent }
  constructor(game, type, opts = {}) {
    super();
    const def = ENEMY_DEFS[type];
    this.game = game; this.def = def; this.type = type; this.title = def.name; this.boss = !!def.boss;
    this.elite = !!opts.elite; this.parent = opts.parent || null;
    this.sc = calcScale(game.floorNum, Math.max(1, game.heroes.length), this.elite);
    this.radius = def.radius * (this.elite ? BALANCE.eliteRadius : 1);
    this.hp = this.maxHp = Math.max(1, Math.round(def.hp * this.sc.hp));
    this.speed = def.speed * this.sc.speed; this.touch = (def.touch || 0) ? def.touch + this.sc.dmgAdd : 0;
    this.color = def.color; this.resist = def.resist || 0;
    this.spawnDelay = opts.delay ?? 0.7; this.kx = 0; this.ky = 0; this.t = Math.random() * 6;
    this.dead = false; this.busy = null; this.fuse = 0;
    this.phaseIdx = -1; this.atk = []; this._enterPhase(0);
  }
  _phases() { return this.def.phases || [{ at: 1, attacks: this.def.attacks || [] }]; }
  _enterPhase(i) {
    this.phaseIdx = i;
    this.atk = this._phases()[i].attacks.map(d => ({ d, cd: d.first ?? d.cd * (0.5 + Math.random() * 0.5) }));
    this.busy = null;
  }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer((ctx, r) => this._draw(ctx, r), this.radius + 70, { order: this.boss ? 4 : 4 }));
  }
  _count(d, key = "count") { return Math.round(d[key] + (d.countScale ? this.sc.countAdd : 0)); }

  _draw(ctx, r) {
    const rad = this.radius;
    if (this.spawnDelay > 0) { // 등장 예고
      ctx.strokeStyle = this.color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, rad * (1 + this.spawnDelay * 0.6), 0, 7); ctx.stroke();
      ctx.fillStyle = this.color; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(0, 0, rad, 0, 7); ctx.fill();
      return;
    }
    const b = this.busy;
    if (b && b.phase === "wind") { // 공격 예고
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.t * 30); ctx.fillStyle = "#ff1744"; ctx.strokeStyle = "#ff1744";
      if (b.d.type === "slam") { ctx.beginPath(); ctx.arc(0, 0, b.d.radius, 0, 7); ctx.fill(); }
      else if (b.d.type === "charge") { ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(b.dir) * 90, Math.sin(b.dir) * 90); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    const flash = r.flash > 0 || (this.fuse > 0 && Math.floor(this.fuse * 14) % 2);
    ctx.fillStyle = flash ? "#fff" : this.color;
    ctx.beginPath();
    const k = this.def.kind;
    if (k === "circle") ctx.arc(0, 0, rad, 0, 7);
    else if (k === "diamond") { ctx.moveTo(rad, 0); ctx.lineTo(0, rad); ctx.lineTo(-rad, 0); ctx.lineTo(0, -rad); ctx.closePath(); }
    else if (k === "tri") { const a = b && b.dir !== undefined ? b.dir : this.face || 0; for (let i = 0; i < 3; i++) ctx.lineTo(Math.cos(a + i * 2.094) * rad * 1.15, Math.sin(a + i * 2.094) * rad * 1.15); ctx.closePath(); }
    else if (k === "poly") { const n = this.def.sides || 6; for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n + this.t * 0.8; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } ctx.closePath(); }
    else ctx.rect(-rad, -rad, rad * 2, rad * 2);
    ctx.fill();
    if (this.elite) { ctx.strokeStyle = "#ffd54f"; ctx.lineWidth = 1.6; ctx.stroke(); ctx.fillStyle = "#ffd54f"; ctx.fillRect(-2, rad + 5, 4, 3); }
    ctx.fillStyle = "#000"; const e = Math.max(1.5, rad * 0.22); ctx.fillRect(-rad * 0.45, rad * 0.1, e, e); ctx.fillRect(rad * 0.2, rad * 0.1, e, e);
    if (!this.boss && this.maxHp > 8 && this.hp < this.maxHp) {
      ctx.fillStyle = "#000a"; ctx.fillRect(-rad, rad + 3, rad * 2, 2);
      ctx.fillStyle = "#e53935"; ctx.fillRect(-rad, rad + 3, rad * 2 * this.hp / this.maxHp, 2);
    }
  }

  update(dt) {
    if (this.spawnDelay > 0) { this.spawnDelay -= dt; return; }
    this.t += dt;
    const g = this.game, p = this.transform.position;
    if (this.boss) { const ph = this._phases(), next = ph[this.phaseIdx + 1]; if (next && this.hp / this.maxHp <= next.at) { this._enterPhase(this.phaseIdx + 1); g.cam.shake(4, 0.4); g.toast(`${this.title} 격노!`, 1.5); } }
    let target = null, td = Infinity;
    for (const h of g.heroes) { if (!h.alive) continue; const hp = h.transform.position, d = Math.hypot(hp.x - p.x, hp.y - p.y); if (d < td) { td = d; target = h; } }
    let vx = 0, vy = 0;
    if (target) {
      const tp = target.transform.position, a = Math.atan2(tp.y - p.y, tp.x - p.x);
      this.face = a;
      const sp = this.speed;
      const b = this.busy;
      if (b) [vx, vy] = this._runBusy(dt, a, target);
      else {
        switch (this.def.ai) {
          case "kite": { const [n, f] = this.def.keep || [60, 90]; const m = td > f ? 1 : td < n ? -1 : 0; vx = Math.cos(a) * sp * m; vy = Math.sin(a) * sp * m; break; }
          case "bomber":
            if (this.fuse > 0) { this.fuse -= dt; if (this.fuse <= 0) { this._explode(); return; } }
            else { vx = Math.cos(a) * sp; vy = Math.sin(a) * sp; if (td < this.radius + 14) this.fuse = 0.6; }
            break;
          default: vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
        }
        for (const at of this.atk) {
          at.cd -= dt * this.sc.rate;
          if (at.cd <= 0 && td <= (at.d.range ?? Infinity)) { this._begin(at, a, target); if (this.busy) break; }
        }
      }
      if (this.touch && td < this.radius + 6) target.hit(this.touch, p.x, p.y, 130);
    }
    for (const o of g.enemies) { // 겹치지 않게 밀어내기
      if (o === this || o.spawnDelay > 0) continue;
      const op = o.transform.position, dx = p.x - op.x, dy = p.y - op.y, d = Math.hypot(dx, dy), min = this.radius + o.radius;
      if (d > 0 && d < min) { vx += dx / d * 40; vy += dy / d * 40; }
    }
    vx += this.kx; vy += this.ky; this.kx *= Math.max(0, 1 - 8 * dt); this.ky *= Math.max(0, 1 - 8 * dt);
    this.transform.setPosition(
      Math.max(-ARENA_W / 2 + this.radius, Math.min(ARENA_W / 2 - this.radius, p.x + vx * dt)),
      Math.max(-ARENA_H / 2 + this.radius, Math.min(ARENA_H / 2 - this.radius, p.y + vy * dt)));
  }

  // ---- 공격 패턴 실행 ----
  _begin(at, aim, target) {
    const d = at.d, g = this.game, p = this.transform.position, sc = this.sc;
    const dmg = (d.dmg || 1) + sc.dmgAdd, spd = (d.speed || 80) * sc.speed;
    switch (d.type) {
      case "shoot": {
        const n = this._count(d), spread = d.spread || 0;
        for (let i = 0; i < n; i++) g.spawnProj(p.x, p.y, aim + (n > 1 ? (i - (n - 1) / 2) * (spread / (n - 1)) : 0), spd, dmg, false); // spread = 부채꼴 전체 각도
        at.cd = d.cd; break;
      }
      case "ring": {
        const n = this._count(d), off = Math.random() * 6;
        for (let i = 0; i < n; i++) g.spawnProj(p.x, p.y, off + i * Math.PI * 2 / n, spd, dmg, false);
        g.cam.shake(1.5, 0.15); at.cd = d.cd; break;
      }
      case "spiral": this.busy = { d, at, phase: "run", t: d.dur, acc: 0, base: Math.random() * 6, dmg, spd }; break;
      case "charge": this.busy = { d, at, phase: "wind", t: d.windup, dir: aim }; break;
      case "slam": this.busy = { d, at, phase: "wind", t: d.windup }; break;
      case "summon": {
        const mine = g.enemies.filter(e => e.parent === this).length, n = Math.min(this._count(d), Math.max(0, d.max - mine));
        for (let i = 0; i < n; i++) { const a = Math.random() * 6.28; g.spawnEnemy(d.spawn, Math.max(-ARENA_W / 2 + 10, Math.min(ARENA_W / 2 - 10, p.x + Math.cos(a) * 24)), Math.max(-ARENA_H / 2 + 10, Math.min(ARENA_H / 2 - 10, p.y + Math.sin(a) * 24)), { delay: 0.5, parent: this }); }
        at.cd = d.cd; break;
      }
    }
  }
  _runBusy(dt, aim, target) {
    const b = this.busy, d = b.d, g = this.game, p = this.transform.position, sc = this.sc;
    b.t -= dt;
    if (d.type === "spiral") {
      const arms = Math.min(BALANCE.maxArms, Math.round(d.arms + (d.countScale ? sc.countAdd : 0))), interval = 1 / (d.rate * sc.rate);
      b.acc += dt;
      while (b.acc >= interval) { b.acc -= interval; b.base += d.step; for (let i = 0; i < arms; i++) g.spawnProj(p.x, p.y, b.base + i * Math.PI * 2 / arms, b.spd, b.dmg, false); }
      if (b.t <= 0) { b.at.cd = d.cd; this.busy = null; }
      return [Math.cos(aim) * this.speed * 0.3, Math.sin(aim) * this.speed * 0.3];
    }
    if (d.type === "charge") {
      if (b.phase === "wind") { if (b.t <= 0) { b.phase = "dash"; b.t = d.dur; } return [0, 0]; }
      if (b.t <= 0) { b.at.cd = d.cd; this.busy = null; return [0, 0]; }
      const s = d.speed * sc.speed; return [Math.cos(b.dir) * s, Math.sin(b.dir) * s];
    }
    if (d.type === "slam") {
      if (b.t <= 0) {
        for (const h of g.heroes) { const hp = h.transform.position; if (h.alive && Math.hypot(hp.x - p.x, hp.y - p.y) < d.radius + h.radius) h.hit((d.dmg || 2) + sc.dmgAdd, p.x, p.y, 200); }
        g.fx.emit(p.x, p.y, { count: 30, colors: [this.color, "#fff"], speed: [60, 160], life: [0.2, 0.5], size: [1, 2.5], fade: true, area: d.radius * 0.4 });
        g.cam.shake(4, 0.25); b.at.cd = d.cd; this.busy = null;
      }
      return [0, 0];
    }
    this.busy = null; return [0, 0];
  }
  _explode() {
    const g = this.game, p = this.transform.position, R = 30;
    for (const h of g.heroes) { const hp = h.transform.position; if (h.alive && Math.hypot(hp.x - p.x, hp.y - p.y) < R + h.radius) h.hit(2 + this.sc.dmgAdd, p.x, p.y, 220); }
    g.fx.emit(p.x, p.y, { count: 40, colors: ["#ff7043", "#ffee58", "#fff"], speed: [50, 150], life: [0.2, 0.5], size: [1.5, 3], fade: true, area: 10 });
    g.cam.shake(4, 0.25); this.die(null, true);
  }

  damage(n, by, angle, knock) {
    if (this.dead || this.spawnDelay > 0) return;
    this.hp -= n; this.draw.flash = 0.07;
    const k = knock * (1 - this.resist);
    this.kx += Math.cos(angle) * k; this.ky += Math.sin(angle) * k;
    const p = this.transform.position;
    this.game.fx.emit(p.x, p.y, { count: 5, colors: [this.color, "#fff"], speed: [20, 70], life: [0.15, 0.35], size: [1, 1.8], fade: true });
    if (this.hp <= 0) this.die(by);
  }
  die(by, quiet = false) {
    if (this.dead) return; this.dead = true;
    const g = this.game, p = this.transform.position, def = this.def;
    g.fx.emit(p.x, p.y, { count: this.boss ? 60 : 14, colors: [this.color, "#fff"], speed: [30, 110], life: [0.3, 0.7], size: [1, 2.8], fade: true });
    if (def.onDeath && !quiet) for (let i = 0; i < def.onDeath.count; i++) { const a = i * 3.14 + Math.random(); g.spawnEnemy(def.onDeath.spawn, p.x + Math.cos(a) * 8, p.y + Math.sin(a) * 8, { delay: 0.2 }); }
    if (!this.boss && def.gold && (this.elite || Math.random() < (def.goldChance ?? 0))) {
      const [lo, hi] = def.gold, n = (lo + Math.floor(Math.random() * (hi - lo + 1))) * (this.elite ? 2 : 1);
      g.spawnCoin(p.x, p.y, n);
    }
    if (by) by.kills++;
    Events.emit("enemy.killed", { enemy: this, by });
    this.gameObject.destroy();
  }
}

// 탄환. fromPlayer=true면 적을 맞춘다(튕겨낸 탄·검기). pierce면 관통.
class Projectile extends Component {
  constructor(game, angle, speed, dmg, fromPlayer, opts = {}) {
    super();
    this.game = game; this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.dmg = dmg; this.fromPlayer = fromPlayer; this.life = opts.life ?? 5; this.radius = opts.radius ?? 3;
    this.pierce = !!opts.pierce; this.beam = !!opts.beam; this.hitSet = new Set(); this.angle = angle;
  }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer(ctx => {
      if (this.beam) { ctx.rotate(this.angle); ctx.strokeStyle = "#e1f5fe"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke(); return; }
      ctx.fillStyle = this.fromPlayer ? "#fff59d" : "#ff8a65"; ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.45, 0, 7); ctx.fill();
    }, 10, { order: 6 }));
  }
  reflect(hero, dir) { this.fromPlayer = true; const s = Math.hypot(this.vx, this.vy) * 1.5; this.vx = Math.cos(dir) * s; this.vy = Math.sin(dir) * s; this.dmg = 3; this.life = 3; }
  update(dt) {
    const t = this.transform, p = t.position, g = this.game;
    t.setPosition(p.x + this.vx * dt, p.y + this.vy * dt);
    const q = t.position; this.life -= dt;
    if (this.life <= 0 || Math.abs(q.x) > ARENA_W / 2 + 10 || Math.abs(q.y) > ARENA_H / 2 + 10) { this.gameObject.destroy(); return; }
    if (this.fromPlayer) {
      for (const e of g.enemies) {
        if (e.dead || e.spawnDelay > 0 || this.hitSet.has(e)) continue;
        const ep = e.transform.position;
        if (Math.hypot(ep.x - q.x, ep.y - q.y) < e.radius + this.radius) {
          e.damage(this.dmg, this.owner || null, Math.atan2(this.vy, this.vx), 60); this.hitSet.add(e);
          if (!this.pierce) { this.gameObject.destroy(); return; }
        }
      }
    } else {
      for (const h of g.heroes) {
        if (!h.alive) continue;
        const hp = h.transform.position;
        if (Math.hypot(hp.x - q.x, hp.y - q.y) < h.radius + this.radius) { h.hit(this.dmg, q.x - this.vx, q.y - this.vy, 90); this.gameObject.destroy(); return; }
      }
    }
  }
}
