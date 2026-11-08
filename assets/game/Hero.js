const playerColor = id => `hsl(${Math.round((id * 137.5 + 200) % 360)},75%,62%)`;
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// 플레이어. input: { mx, my, ax, ay, atk, dash } (스틱 값 -1~1, Y-up)
class Hero extends Component {
  constructor(game, id) {
    super();
    this.game = game; this.id = id; this.color = playerColor(id);
    this.input = { mx: 0, my: 0, ax: 0, ay: 0, atk: 0, dash: 0 };
    this.resetRun();
    this.alive = true; this.invuln = 0; this.facing = -Math.PI / 2;
    this.cd = 0; this.swing = null; this.dashT = 0; this.dashCd = 0; this.dashDir = 0; this.prevDash = 0;
    this.kx = 0; this.ky = 0; this.radius = 6; this.keyboard = false;
  }
  resetRun() { // 새 게임을 시작할 때 초기화
    this.maxHp = 6; this.hp = 6; this.kills = 0; this.gold = 0; this.items = []; this.stats = newStats();
    this.weapon = { id: "sword", tier: 0 };
  }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer((ctx, r) => this._draw(ctx, r), 16, { order: 5 }));
  }
  // 아이템 효과가 반영된 현재 무기 능력치
  getWeapon() {
    const b = WEAPONS[this.weapon.id], t = TIERS[this.weapon.tier], s = this.stats;
    return { ...b, dmg: b.dmg * t.mult * s.dmg, range: b.range * s.range, cd: b.cd / s.atkSpeed, knock: b.knock * s.knock };
  }
  addGold(n) { const v = Math.max(1, Math.round(n * this.stats.gold)); this.gold += v; return v; }
  giveItem(id) { this.items.push(id); ITEMS[id].apply(this); }

  _draw(ctx, r) {
    const wd = TIERS[this.weapon.tier];
    if (!this.alive) { ctx.fillStyle = this.color; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill(); return; }
    ctx.fillStyle = r.flash > 0 ? "#fff" : this.color;
    ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, 7); ctx.fill();
    ctx.strokeStyle = "#000a"; ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); ctx.rotate(this.facing); ctx.strokeStyle = wd.color; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(this.radius - 1, 0); ctx.lineTo(this.radius + 7, 0); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(3, 0, 1.4, 0, 7); ctx.fill();
    ctx.restore();
  }
  update(dt) {
    if (!this.alive) return;
    const g = this.game, i = this.input, t = this.transform, s = this.stats;
    this.invuln -= dt; this.cd -= dt; this.dashCd -= dt;
    this.draw.opacity = this.invuln > 0 && Math.floor(this.invuln * 14) % 2 ? 0.35 : 1;

    let mx = i.mx, my = i.my; const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    if (ml > 0.15) this.facing = Math.atan2(my, mx);

    if (i.dash && !this.prevDash && this.dashCd <= 0 && this.dashT <= 0) { // 대시: 짧은 무적
      this.dashT = 0.16; this.dashCd = 0.7 * s.dashCd; this.invuln = Math.max(this.invuln, 0.2);
      this.dashDir = ml > 0.15 ? Math.atan2(my, mx) : this.facing;
      g.fx.emit(t.position.x, t.position.y, { count: 6, colors: [this.color, "#fff"], speed: [10, 40], life: [0.15, 0.3], size: [1, 2], fade: true });
    }
    this.prevDash = i.dash;

    let vx = mx * 82 * s.speed, vy = my * 82 * s.speed;
    if (this.dashT > 0) { this.dashT -= dt; vx = Math.cos(this.dashDir) * 230; vy = Math.sin(this.dashDir) * 230; }
    if (this.swing) { vx *= 0.35; vy *= 0.35; }
    vx += this.kx; vy += this.ky; this.kx *= Math.max(0, 1 - 9 * dt); this.ky *= Math.max(0, 1 - 9 * dt);
    const p = t.position;
    t.setPosition(
      Math.max(-ARENA_W / 2 + 7, Math.min(ARENA_W / 2 - 7, p.x + vx * dt)),
      Math.max(-ARENA_H / 2 + 7, Math.min(ARENA_H / 2 - 7, p.y + vy * dt)));

    if (this.swing) { this.swing.t -= dt; if (this.swing.t <= 0) { this._strike(this.swing.dir, this.swing.w); this.swing = null; } }
    else if (i.atk && this.cd <= 0 && this.dashT <= 0) this._startSwing();
  }
  _startSwing() {
    const w = this.getWeapon(), g = this.game, p = this.transform.position;
    let dir = this.facing;
    if (Math.hypot(this.input.ax, this.input.ay) > 0.35) dir = Math.atan2(this.input.ay, this.input.ax); // 드래그로 직접 조준
    else { // 자동 조준
      let best = null, bd = w.range + 22;
      for (const e of g.enemies) { if (e.spawnDelay > 0) continue; const ep = e.transform.position, d = Math.hypot(ep.x - p.x, ep.y - p.y); if (d < bd) { bd = d; best = ep; } }
      if (best) dir = Math.atan2(best.y - p.y, best.x - p.x);
    }
    this.facing = dir; this.cd = w.cd; this.swing = { t: w.delay, dir, w };
    g.spawnSlash(this, dir, w);
  }
  _strike(dir, w) {
    const g = this.game, p = this.transform.position, s = this.stats;
    const dmg = w.dmg * (Math.random() < s.crit ? 2 : 1), half = (w.arc * Math.PI / 180) / 2;
    const inArc = (x, y, pad) => {
      const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
      if (d > w.range + pad) return false;
      return w.arc >= 360 || d < pad + 4 || angDiff(Math.atan2(dy, dx), dir) <= half;
    };
    let hit = 0;
    for (const e of g.enemies) {
      if (e.dead || e.spawnDelay > 0) continue;
      const ep = e.transform.position;
      if (inArc(ep.x, ep.y, e.radius)) { e.damage(dmg, this, Math.atan2(ep.y - p.y, ep.x - p.x), w.knock); hit++; }
    }
    for (const pr of g.projs) { // 적 탄 튕겨내기
      if (pr.fromPlayer || pr.gameObject.isDestroyed) continue;
      const pp = pr.transform.position;
      if (inArc(pp.x, pp.y, 4)) { pr.owner = this; pr.reflect(this, dir); }
    }
    for (let b = 0; b < s.beam; b++) g.spawnProj(p.x, p.y, dir + (b - (s.beam - 1) / 2) * 0.25, 190, w.dmg * 0.5, true, { pierce: true, beam: true, life: 0.9, owner: this });
    if (hit) g.cam.shake(w.knock > 150 ? 2.5 : 1.2, 0.1);
  }
  hit(n, fromX, fromY, kb = 120) {
    if (!this.alive || this.invuln > 0) return;
    const g = this.game, s = this.stats;
    this.hp -= n; this.invuln = 1.0 + s.invuln; this.draw.flash = 0.1;
    const p = this.transform.position, a = Math.atan2(p.y - fromY, p.x - fromX);
    this.kx = Math.cos(a) * kb; this.ky = Math.sin(a) * kb; this.swing = null;
    g.cam.shake(3, 0.25);
    g.fx.emit(p.x, p.y, { count: 12, colors: [this.color, "#fff"], speed: [30, 90], life: [0.3, 0.6], size: [1, 2.5], fade: true });
    if (s.thorns) for (const e of g.enemies) { // 가시 갑옷
      if (e.dead || e.spawnDelay > 0) continue;
      const ep = e.transform.position;
      if (Math.hypot(ep.x - p.x, ep.y - p.y) < 34) e.damage(2 * s.thorns, this, Math.atan2(ep.y - p.y, ep.x - p.x), 170);
    }
    if (this.hp <= 0) this.die();
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  die() {
    const g = this.game, p = this.transform.position;
    if (this.stats.extraLives > 0) { // 앙크: 부활
      this.stats.extraLives--; this.hp = Math.ceil(this.maxHp / 2); this.invuln = 2.5;
      g.fx.emit(p.x, p.y, { count: 30, colors: ["#fff59d", "#fff"], speed: [30, 110], life: [0.4, 0.8], size: [1, 2.5], fade: true });
      g.toast(`P${this.id + 1} 앙크로 부활!`, 2); return;
    }
    this.alive = false; this.hp = 0; this.swing = null;
    g.fx.emit(p.x, p.y, { count: 28, colors: [this.color, "#fff"], speed: [20, 120], life: [0.4, 0.9], size: [1, 3], fade: true });
  }
  revive(hp) { this.alive = true; this.hp = Math.min(hp, this.maxHp); this.invuln = 1.5; this.draw.flash = 0; this.kx = this.ky = 0; }
}
