// 플레이어 기체. input: { mx, my, ax, ay } (-1~1, Y-up). 폰이나 키보드가 채워 준다.
const ARENA_W = 320, ARENA_H = 180;
const PLAYER_COLORS = ["#4fc3f7", "#ffb74d", "#81c784", "#ba68c8", "#f06292", "#fff176"];

class Ship extends Component {
  constructor(game, id, color) {
    super();
    this.game = game; this.id = id; this.color = color;
    this.input = { mx: 0, my: 0, ax: 0, ay: 0 };
    this.hp = 3; this.maxHp = 3; this.score = 0;
    this.speed = 85; this.fireCd = 0; this.invuln = 0; this.angle = 0;
    this.alive = true; this.respawn = 0;
  }
  awake() {
    this.shape = this.gameObject.addComponent(new ShapeRenderer({ kind: "ship", radius: 7, color: this.color, orderInLayer: 5 }));
  }
  update(dt) {
    if (!this.alive) {
      this.respawn -= dt;
      if (this.respawn <= 0 && this.game.state === "play") this.revive();
      return;
    }
    const i = this.input, t = this.transform;
    let mx = i.mx, my = i.my;
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    const p = t.position;
    t.setPosition(
      Math.max(-ARENA_W / 2 + 7, Math.min(ARENA_W / 2 - 7, p.x + mx * this.speed * dt)),
      Math.max(-ARENA_H / 2 + 7, Math.min(ARENA_H / 2 - 7, p.y + my * this.speed * dt)));
    const aiming = Math.hypot(i.ax, i.ay) > 0.3;
    if (aiming) this.angle = Math.atan2(i.ay, i.ax);
    else if (ml > 0.1) this.angle = Math.atan2(my, mx);
    t.rotation = this.angle;

    this.fireCd -= dt;
    if (aiming && this.fireCd <= 0) { this.fireCd = 0.16; this.game.spawnBullet(this, this.angle); }

    if (this.invuln > 0) { this.invuln -= dt; this.shape.opacity = Math.floor(this.invuln * 12) % 2 ? 0.3 : 1; }
    else this.shape.opacity = 1;
  }
  hit() {
    if (!this.alive || this.invuln > 0) return;
    this.hp--; this.invuln = 1.2;
    this.game.cam.shake(3, 0.25);
    const p = this.transform.position;
    this.game.fx.emit(p.x, p.y, { count: 14, colors: [this.color, "#fff"], speed: [30, 90], life: [0.3, 0.6], size: [1, 2.5], fade: true });
    Events.emit("ship.hit", { ship: this });
    if (this.hp <= 0) this.die();
  }
  die() {
    this.alive = false; this.respawn = 6; this.shape.visible = false;
    const p = this.transform.position;
    this.game.fx.emit(p.x, p.y, { count: 30, colors: [this.color, "#fff"], speed: [20, 120], life: [0.4, 0.9], size: [1, 3], fade: true });
    Events.emit("ship.died", { ship: this });
  }
  revive() {
    this.alive = true; this.hp = this.maxHp; this.invuln = 2; this.shape.visible = true;
    this.transform.setPosition(0, 0);
    Events.emit("ship.hit", { ship: this });
  }
}
