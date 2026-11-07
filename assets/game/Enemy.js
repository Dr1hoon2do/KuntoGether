// kind별 능력치
const ENEMY_TYPES = {
  grunt: { hp: 2, speed: 28, radius: 6, color: "#ef5350", score: 10, kind: "square" },
  runner: { hp: 1, speed: 55, radius: 4, color: "#ffee58", score: 15, kind: "circle" },
  tank: { hp: 6, speed: 16, radius: 10, color: "#8e24aa", score: 40, kind: "square" },
};

class Enemy extends Component {
  constructor(game, type) {
    super();
    this.game = game; Object.assign(this, ENEMY_TYPES[type]);
    this.type = type; this.dead = false; this.maxHp = this.hp;
  }
  awake() {
    this.shape = this.gameObject.addComponent(new ShapeRenderer({ kind: this.kind, radius: this.radius, color: this.color, orderInLayer: 2 }));
  }
  update(dt) {
    const ships = this.game.ships.filter(s => s.alive);
    if (!ships.length) return;
    const p = this.transform.position;
    let best = null, bd = Infinity;
    for (const s of ships) {
      const sp = s.transform.position, d = Math.hypot(sp.x - p.x, sp.y - p.y);
      if (d < bd) { bd = d; best = s; }
    }
    const bp = best.transform.position;
    const dx = (bp.x - p.x) / (bd || 1), dy = (bp.y - p.y) / (bd || 1);
    this.transform.setPosition(p.x + dx * this.speed * dt, p.y + dy * this.speed * dt);
    this.transform.rotation += dt * 2;
    if (bd < this.radius + 6) best.hit();
  }
  damage(n, by) {
    this.hp -= n; this.shape.flash = 0.06;
    const p = this.transform.position;
    this.game.fx.emit(p.x, p.y, { count: 4, colors: [this.color, "#fff"], speed: [20, 60], life: [0.15, 0.35], size: [1, 1.5], fade: true });
    if (this.hp <= 0) {
      this.dead = true;
      this.game.fx.emit(p.x, p.y, { count: 14, colors: [this.color, "#fff"], speed: [30, 100], life: [0.3, 0.6], size: [1, 2.5], fade: true });
      if (by) by.score += this.score;
      Events.emit("enemy.killed", { enemy: this, by });
      this.gameObject.destroy();
    }
  }
}
