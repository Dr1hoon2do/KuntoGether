// 바닥 아이템. 하트는 닿으면 바로 회복, 무기는 위에 0.6초 서 있으면 교체 (원래 들고 있던 무기는 그 자리에 떨어진다).
class Pickup extends Component {
  constructor(game, item) {
    super();
    this.game = game; this.item = item; this.lock = 0.8; this.hold = 0; this.holder = null; this.t = Math.random() * 6;
  }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer(ctx => {
      const bob = Math.sin(this.t * 4) * 1.2;
      if (this.item.type === "heart") {
        ctx.fillStyle = "#ef5350"; ctx.beginPath(); ctx.arc(-2.5, 1 + bob, 3, 0, 7); ctx.arc(2.5, 1 + bob, 3, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-5.4, 0 + bob); ctx.lineTo(5.4, 0 + bob); ctx.lineTo(0, -6 + bob); ctx.fill(); return;
      }
      const w = this.item.weapon, tier = TIERS[w.tier];
      ctx.fillStyle = "#0008"; ctx.beginPath(); ctx.ellipse(0, -5, 7, 2.5, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = tier.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, bob, 8, 0, 7); ctx.stroke();
      ctx.fillStyle = tier.color; ctx.globalAlpha = 0.2; ctx.fill(); ctx.globalAlpha = 1;
      ctx.scale(1, -1); ctx.fillStyle = tier.color; ctx.font = "bold 7px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(WEAPONS[w.id].name, 0, -bob);
      ctx.font = "5px monospace"; ctx.fillStyle = "#fff"; ctx.fillText((tier.name ? tier.name + " " : "") + "ATK " + (WEAPONS[w.id].dmg * tier.mult).toFixed(1), 0, -13);
      if (this.hold > 0) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -bob, 10.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.hold / 0.6)); ctx.stroke(); }
    }, 16, { order: 1 }));
  }
  update(dt) {
    this.t += dt; this.lock -= dt;
    const p = this.transform.position;
    let near = null;
    for (const h of this.game.heroes) {
      if (!h.alive) continue;
      const hp = h.transform.position;
      if (Math.hypot(hp.x - p.x, hp.y - p.y) < (this.item.type === "heart" ? 10 : 12)) { near = h; break; }
    }
    if (this.item.type === "heart") {
      if (near && near.hp < near.maxHp) { near.heal(1); this.game.fx.emit(p.x, p.y, { count: 8, colors: ["#ef5350", "#fff"], speed: [10, 40], life: [0.3, 0.5], size: [1, 2], fade: true }); this.gameObject.destroy(); }
      return;
    }
    if (this.lock > 0 || !near) { this.hold = 0; this.holder = null; return; }
    if (this.holder !== near) { this.holder = near; this.hold = 0; }
    this.hold += dt;
    if (this.hold >= 0.6) { // 교체
      const old = near.weapon; near.weapon = this.item.weapon; this.item.weapon = old; this.lock = 1.5; this.hold = 0; this.holder = null;
      this.game.fx.emit(p.x, p.y, { count: 10, colors: [TIERS[near.weapon.tier].color, "#fff"], speed: [20, 60], life: [0.3, 0.6], size: [1, 2], fade: true });
    }
  }
}
