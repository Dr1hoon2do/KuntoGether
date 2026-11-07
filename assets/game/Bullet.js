class Bullet extends Component {
  constructor(game, owner, angle) {
    super();
    this.game = game; this.owner = owner;
    this.vx = Math.cos(angle) * 220; this.vy = Math.sin(angle) * 220; this.life = 1.2;
  }
  awake() {
    this.gameObject.addComponent(new ShapeRenderer({ kind: "circle", radius: 1.8, color: this.owner.color, orderInLayer: 3 }));
  }
  update(dt) {
    const t = this.transform, p = t.position;
    t.setPosition(p.x + this.vx * dt, p.y + this.vy * dt);
    this.life -= dt;
    const q = t.position;
    if (this.life <= 0 || Math.abs(q.x) > ARENA_W / 2 || Math.abs(q.y) > ARENA_H / 2) { this.gameObject.destroy(); return; }
    for (const e of this.game.enemies) {
      if (e.dead) continue;
      const ep = e.transform.position;
      if (Math.hypot(ep.x - q.x, ep.y - q.y) < e.radius + 2) {
        e.damage(1, this.owner);
        this.gameObject.destroy();
        return;
      }
    }
  }
}
