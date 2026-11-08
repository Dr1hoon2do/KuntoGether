const ARENA_W = 400, ARENA_H = 225;
const playerColor = id => `hsl(${Math.round((id * 137.5 + 200) % 360)},75%,62%)`;
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// 플레이어. input: { mx, my, ax, ay, atk, dash } (스틱 값 -1~1, Y-up)
class Hero extends Component {
  constructor(game, id) {
    super();
    this.game = game; this.id = id; this.color = playerColor(id);
    this.input = { mx: 0, my: 0, ax: 0, ay: 0, atk: 0, dash: 0 };
    this.maxHp = 6; this.hp = 6; this.kills = 0;
    this.weapon = { id: "sword", tier: 0 };
    this.alive = true; this.invuln = 0; this.facing = -Math.PI / 2;
    this.cd = 0; this.swing = null; this.dashT = 0; this.dashCd = 0; this.dashDir = 0; this.prevDash = 0;
    this.kx = 0; this.ky = 0; this.radius = 6; this.keyboard = false;
  }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer((ctx, r) => this._draw(ctx, r), 16, { order: 5 }));
  }
  _draw(ctx, r) {
    const wd = TIERS[this.weapon.tier];
    if (!this.alive) { // 쓰러짐: 반투명
      ctx.fillStyle = this.color; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill();
      return;
    }
    ctx.fillStyle = r.flash > 0 ? "#fff" : this.color;
    ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, 7); ctx.fill();
    ctx.strokeStyle = "#000a"; ctx.lineWidth = 1; ctx.stroke();
    // 바라보는 방향의 무기와 눈
    ctx.save(); ctx.rotate(this.facing); ctx.strokeStyle = wd.color; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(this.radius - 1, 0); ctx.lineTo(this.radius + 7, 0); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(3, 0, 1.4, 0, 7); ctx.fill();
    ctx.restore();
  }
  update(dt) {
    if (!this.alive) return;
    const g = this.game, i = this.input, t = this.transform;
    this.invuln -= dt; this.cd -= dt; this.dashCd -= dt;
    this.draw.opacity = this.invuln > 0 && Math.floor(this.invuln * 14) % 2 ? 0.35 : 1;

    let mx = i.mx, my = i.my; const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    if (ml > 0.15) this.facing = Math.atan2(my, mx);

    // 대시 (누르는 순간 시작, 짧게 무적)
    if (i.dash && !this.prevDash && this.dashCd <= 0 && this.dashT <= 0) {
      this.dashT = 0.16; this.dashCd = 0.7; this.invuln = Math.max(this.invuln, 0.2);
      this.dashDir = ml > 0.15 ? Math.atan2(my, mx) : this.facing;
      g.fx.emit(t.position.x, t.position.y, { count: 6, colors: [this.color, "#fff"], speed: [10, 40], life: [0.15, 0.3], size: [1, 2], fade: true });
    }
    this.prevDash = i.dash;

    let vx = mx * 82, vy = my * 82;
    if (this.dashT > 0) { this.dashT -= dt; vx = Math.cos(this.dashDir) * 230; vy = Math.sin(this.dashDir) * 230; }
    if (this.swing) { vx *= 0.35; vy *= 0.35; } // 휘두르는 동안 느려짐
    vx += this.kx; vy += this.ky; this.kx *= Math.max(0, 1 - 9 * dt); this.ky *= Math.max(0, 1 - 9 * dt);
    const p = t.position;
    t.setPosition(
      Math.max(-ARENA_W / 2 + 7, Math.min(ARENA_W / 2 - 7, p.x + vx * dt)),
      Math.max(-ARENA_H / 2 + 7, Math.min(ARENA_H / 2 - 7, p.y + vy * dt)));

    // 공격
    if (this.swing) { this.swing.t -= dt; if (this.swing.t <= 0) { this._strike(this.swing.dir); this.swing = null; } }
    else if (i.atk && this.cd <= 0 && this.dashT <= 0) this._startSwing();
  }
  _startSwing() {
    const w = WEAPONS[this.weapon.id], g = this.game, p = this.transform.position;
    let dir = this.facing;
    if (Math.hypot(this.input.ax, this.input.ay) > 0.35) dir = Math.atan2(this.input.ay, this.input.ax); // 드래그로 직접 조준
    else { // 자동 조준: 가까운 적이 있으면 그쪽으로
      let best = null, bd = w.range + 22;
      for (const e of g.enemies) { if (e.spawnDelay > 0) continue; const ep = e.transform.position, d = Math.hypot(ep.x - p.x, ep.y - p.y); if (d < bd) { bd = d; best = ep; } }
      if (best) dir = Math.atan2(best.y - p.y, best.x - p.x);
    }
    this.facing = dir;
    this.cd = w.cd; this.swing = { t: w.delay, dir };
    g.spawnSlash(this, dir, w);
  }
  _strike(dir) {
    const w = WEAPONS[this.weapon.id], g = this.game, p = this.transform.position;
    const dmg = w.dmg * TIERS[this.weapon.tier].mult, half = (w.arc * Math.PI / 180) / 2;
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
    for (const pr of g.projs) { // 적 탄환 튕겨내기
      if (pr.fromPlayer || pr.gameObject.isDestroyed) continue;
      const pp = pr.transform.position;
      if (inArc(pp.x, pp.y, 4)) pr.reflect(this, dir);
    }
    if (hit) g.cam.shake(w.knock > 150 ? 2.5 : 1.2, 0.1);
  }
  hit(n, fromX, fromY, kb = 120) {
    if (!this.alive || this.invuln > 0) return;
    this.hp -= n; this.invuln = 1.0; this.draw.flash = 0.1;
    const p = this.transform.position, a = Math.atan2(p.y - fromY, p.x - fromX);
    this.kx = Math.cos(a) * kb; this.ky = Math.sin(a) * kb; this.swing = null;
    this.game.cam.shake(3, 0.25);
    this.game.fx.emit(p.x, p.y, { count: 12, colors: [this.color, "#fff"], speed: [30, 90], life: [0.3, 0.6], size: [1, 2.5], fade: true });
    if (this.hp <= 0) this.die();
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  die() {
    this.alive = false; this.hp = 0; this.swing = null;
    const p = this.transform.position;
    this.game.fx.emit(p.x, p.y, { count: 28, colors: [this.color, "#fff"], speed: [20, 120], life: [0.4, 0.9], size: [1, 3], fade: true });
  }
  revive(hp) { this.alive = true; this.hp = hp; this.invuln = 1.5; this.draw.flash = 0; }
}
