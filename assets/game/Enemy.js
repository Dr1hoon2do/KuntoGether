// hp는 기본값. 방 번호와 인원수에 따라 Game이 배율을 곱한다.
const ENEMY_TYPES = {
  grunt:   { hp: 4,   speed: 30, radius: 6,  color: "#ef5350", touch: 1, kind: "square", spawnW: 10 },
  runner:  { hp: 2,   speed: 62, radius: 4,  color: "#ffee58", touch: 1, kind: "circle", spawnW: 5 },
  shooter: { hp: 3,   speed: 24, radius: 5,  color: "#4dd0e1", touch: 1, kind: "diamond", spawnW: 4, ranged: true },
  tank:    { hp: 16,  speed: 18, radius: 10, color: "#8e24aa", touch: 2, kind: "square", spawnW: 2, resist: 0.3 },
  boss:    { hp: 120, speed: 26, radius: 17, color: "#ff7043", touch: 2, kind: "boss", spawnW: 0, resist: 0.05 },
};

class Enemy extends Component {
  constructor(game, type, hpMult, spawnDelay) {
    super();
    this.game = game; Object.assign(this, ENEMY_TYPES[type]);
    this.type = type; this.dead = false;
    this.hp = this.maxHp = Math.max(1, Math.round(this.hp * hpMult));
    this.spawnDelay = spawnDelay; this.kx = 0; this.ky = 0;
    this.atkCd = 1 + Math.random(); this.t = Math.random() * 5; this.charge = 0; this.chargeCd = 3; this.chargeDir = 0;
  }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer((ctx, r) => this._draw(ctx, r), this.radius + 8, { order: 4 }));
  }
  _draw(ctx, r) {
    const rad = this.radius;
    if (this.spawnDelay > 0) { // 등장 예고
      ctx.strokeStyle = this.color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, rad * (1 + this.spawnDelay * 0.6), 0, 7); ctx.stroke();
      ctx.fillStyle = this.color; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(0, 0, rad, 0, 7); ctx.fill();
      return;
    }
    ctx.fillStyle = r.flash > 0 ? "#fff" : this.color;
    ctx.beginPath();
    if (this.kind === "circle") ctx.arc(0, 0, rad, 0, 7);
    else if (this.kind === "diamond") { ctx.moveTo(rad, 0); ctx.lineTo(0, rad); ctx.lineTo(-rad, 0); ctx.lineTo(0, -rad); ctx.closePath(); }
    else if (this.kind === "boss") { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + this.t, rr = i % 2 ? rad * 0.75 : rad; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); }
    else ctx.rect(-rad, -rad, rad * 2, rad * 2);
    ctx.fill();
    ctx.fillStyle = "#000"; ctx.fillRect(-rad * 0.45, rad * 0.1, rad * 0.25, rad * 0.25); ctx.fillRect(rad * 0.2, rad * 0.1, rad * 0.25, rad * 0.25); // 눈
    if (this.maxHp > 8 && this.hp < this.maxHp) { // 체력바
      ctx.fillStyle = "#000a"; ctx.fillRect(-rad, rad + 3, rad * 2, 2);
      ctx.fillStyle = "#e53935"; ctx.fillRect(-rad, rad + 3, rad * 2 * this.hp / this.maxHp, 2);
    }
  }
  update(dt) {
    if (this.spawnDelay > 0) { this.spawnDelay -= dt; return; }
    this.t += dt;
    const g = this.game, p = this.transform.position;
    let target = null, td = Infinity;
    for (const h of g.heroes) { if (!h.alive) continue; const hp = h.transform.position, d = Math.hypot(hp.x - p.x, hp.y - p.y); if (d < td) { td = d; target = h; } }
    let vx = 0, vy = 0;
    if (target) {
      const tp = target.transform.position, a = Math.atan2(tp.y - p.y, tp.x - p.x);
      let sp = this.speed;
      if (this.ranged) { sp = td > 90 ? this.speed : td < 60 ? -this.speed : 0; }
      if (this.type === "boss") {
        this.chargeCd -= dt;
        if (this.charge > 0) { this.charge -= dt; sp = 150; vx = Math.cos(this.chargeDir) * sp; vy = Math.sin(this.chargeDir) * sp; sp = 0; }
        else if (this.chargeCd <= 0) { this.chargeCd = 5; this.charge = 0.6; this.chargeDir = a; }
      }
      vx += Math.cos(a) * sp; vy += Math.sin(a) * sp;
      this.atkCd -= dt;
      if (this.ranged && this.atkCd <= 0) { this.atkCd = 1.7; g.spawnProj(p.x, p.y, a, 95, 1, false); }
      if (this.type === "boss" && this.atkCd <= 0 && this.charge <= 0) { // 사방 탄막
        this.atkCd = 3.2; const n = 14, off = Math.random() * 6;
        for (let k = 0; k < n; k++) g.spawnProj(p.x, p.y, off + k * Math.PI * 2 / n, 70, 1, false);
        g.cam.shake(2, 0.2);
      }
      if (td < this.radius + 6) target.hit(this.touch, p.x, p.y, 130);
    }
    // 적끼리 겹치지 않게 밀어내기
    for (const o of g.enemies) {
      if (o === this || o.spawnDelay > 0) continue;
      const op = o.transform.position, dx = p.x - op.x, dy = p.y - op.y, d = Math.hypot(dx, dy), min = this.radius + o.radius;
      if (d > 0 && d < min) { vx += dx / d * 40; vy += dy / d * 40; }
    }
    vx += this.kx; vy += this.ky; this.kx *= Math.max(0, 1 - 8 * dt); this.ky *= Math.max(0, 1 - 8 * dt);
    this.transform.setPosition(
      Math.max(-ARENA_W / 2 + this.radius, Math.min(ARENA_W / 2 - this.radius, p.x + vx * dt)),
      Math.max(-ARENA_H / 2 + this.radius, Math.min(ARENA_H / 2 - this.radius, p.y + vy * dt)));
  }
  damage(n, by, angle, knock) {
    if (this.dead || this.spawnDelay > 0) return;
    this.hp -= n; this.draw.flash = 0.07;
    const k = knock * (1 - (this.resist || 0));
    this.kx += Math.cos(angle) * k; this.ky += Math.sin(angle) * k;
    const p = this.transform.position;
    this.game.fx.emit(p.x, p.y, { count: 5, colors: [this.color, "#fff"], speed: [20, 70], life: [0.15, 0.35], size: [1, 1.8], fade: true });
    if (this.hp <= 0) this.die(by);
  }
  die(by) {
    this.dead = true;
    const p = this.transform.position;
    this.game.fx.emit(p.x, p.y, { count: this.type === "boss" ? 50 : 14, colors: [this.color, "#fff"], speed: [30, 110], life: [0.3, 0.7], size: [1, 2.8], fade: true });
    if (by) by.kills++;
    Events.emit("enemy.killed", { enemy: this, by });
    this.gameObject.destroy();
  }
}

// 탄환. fromPlayer=true면 튕겨 나온 탄환이라 적을 맞춘다.
class Projectile extends Component {
  constructor(game, angle, speed, dmg, fromPlayer) {
    super();
    this.game = game; this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.dmg = dmg; this.fromPlayer = fromPlayer; this.life = 5; this.radius = 3;
  }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer(ctx => {
      ctx.fillStyle = this.fromPlayer ? "#fff59d" : "#ff8a65"; ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.45, 0, 7); ctx.fill();
    }, 8, { order: 6 }));
  }
  reflect(hero, dir) { this.fromPlayer = true; const s = Math.hypot(this.vx, this.vy) * 1.5; this.vx = Math.cos(dir) * s; this.vy = Math.sin(dir) * s; this.dmg = 3; this.life = 3; }
  update(dt) {
    const t = this.transform, p = t.position, g = this.game;
    t.setPosition(p.x + this.vx * dt, p.y + this.vy * dt);
    const q = t.position; this.life -= dt;
    if (this.life <= 0 || Math.abs(q.x) > ARENA_W / 2 + 10 || Math.abs(q.y) > ARENA_H / 2 + 10) { this.gameObject.destroy(); return; }
    if (this.fromPlayer) {
      for (const e of g.enemies) {
        if (e.dead || e.spawnDelay > 0) continue;
        const ep = e.transform.position;
        if (Math.hypot(ep.x - q.x, ep.y - q.y) < e.radius + this.radius) { e.damage(this.dmg, null, Math.atan2(this.vy, this.vx), 60); this.gameObject.destroy(); return; }
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
