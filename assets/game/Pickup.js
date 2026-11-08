// 바닥 아이템. type: coin(자동 획득·자석) / heart(price 0이면 닿으면 회복, 상점 하트는 구매·stock회) / weapon·item(위에 0.6초 서 있으면 교체·획득, price가 있으면 골드로 구매)
class Pickup extends Component {
  constructor(game, item) {
    super();
    this.game = game; this.item = item; this.lock = item.lock ?? 0.8; this.hold = 0; this.holder = null; this.t = Math.random() * 6; this.near = null;
  }
  _price(h) { const base = this.item.price || 0; return base > 0 && h ? Math.max(1, Math.ceil(base * h.stats.discount)) : base; } // 상점 할인 반영
  data() { const p = this.transform.position; return { ...this.item, x: p.x, y: p.y, lock: 0.8 }; }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer(ctx => this._draw(ctx), 22, { order: 1 }));
  }
  _label(ctx, text, y, color, size = 5.5) {
    ctx.save(); ctx.scale(1, -1); ctx.fillStyle = color; ctx.font = `${size}px monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 0, y); ctx.restore();
  }
  _draw(ctx) {
    const it = this.item, bob = Math.sin(this.t * 4) * 1.2;
    if (it.type === "coin") { ctx.fillStyle = "#ffca28"; ctx.beginPath(); ctx.arc(0, bob, 3 + Math.min(2, it.value / 4), 0, 7); ctx.fill(); ctx.strokeStyle = "#fff8"; ctx.lineWidth = 0.8; ctx.stroke(); return; }
    if (it.type === "heart") {
      ctx.fillStyle = "#ef5350"; ctx.beginPath(); ctx.arc(-2.5, 1 + bob, 3, 0, 7); ctx.arc(2.5, 1 + bob, 3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-5.4, bob); ctx.lineTo(5.4, bob); ctx.lineTo(0, -6 + bob); ctx.fill();
    } else {
      const isItem = it.type === "item", color = isItem ? "#ffd54f" : TIERS[it.weapon.tier].color;
      ctx.fillStyle = "#0008"; ctx.beginPath(); ctx.ellipse(0, -5, 7, 2.5, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, bob, 8, 0, 7); ctx.stroke();
      ctx.fillStyle = color; ctx.globalAlpha = 0.2; ctx.fill(); ctx.globalAlpha = 1;
      if (isItem) {
        this._label(ctx, "★", -bob, color, 9);
        this._label(ctx, ITEMS[it.id].name, -14, "#fff", 5.5);
        if (this.near) this._label(ctx, ITEMS[it.id].desc, -21, "#cfd8dc", 4.6);
      } else {
        const w = WEAPONS[it.weapon.id], t = TIERS[it.weapon.tier];
        this._label(ctx, w.name, -bob, color, 7);
        this._label(ctx, (t.name ? t.name + " " : "") + "ATK " + (w.dmg * t.mult).toFixed(1), -14, "#fff", 5);
        if (this.near) this._label(ctx, `${w.note || ""} · 사거리 ${w.range} · ${(1 / w.cd).toFixed(1)}/s`, -20, "#cfd8dc", 4.6);
      }
    }
    if (it.type === "heart" && it.stock) this._label(ctx, "x" + it.stock, -12, "#fff", 6);
    if (it.price > 0) { const pr = this._price(this.near), afford = !this.near || this.near.gold >= pr; this._label(ctx, pr + "G", 15, afford ? "#ffca28" : "#ef5350", 6); }
    if (this.hold > 0) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 10.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.hold / 0.6)); ctx.stroke(); }
  }
  update(dt) {
    this.t += dt; this.lock -= dt;
    const g = this.game, it = this.item, p = this.transform.position;
    let near = null, nd = Infinity;
    for (const h of g.heroes) { if (!h.alive) continue; const hp = h.transform.position, d = Math.hypot(hp.x - p.x, hp.y - p.y); if (d < nd) { nd = d; near = h; } }
    if (it.type === "coin") { // 가까우면 끌려간다
      if (near && nd < 42 * near.stats.magnet) { const a = Math.atan2(near.transform.position.y - p.y, near.transform.position.x - p.x), s = 90 * dt; this.transform.setPosition(p.x + Math.cos(a) * s, p.y + Math.sin(a) * s); }
      if (near && nd < 8) { near.addGold(it.value); SFX.play("coin"); g.fx.emit(p.x, p.y, { count: 4, colors: ["#ffca28", "#fff"], speed: [10, 40], life: [0.2, 0.4], size: [1, 1.6], fade: true }); this.gameObject.destroy(); }
      return;
    }
    if (it.type === "heart" && !(it.price > 0)) {
      if (near && nd < 10 && near.hp < near.maxHp) { near.heal(1); SFX.play("swap"); g.fx.emit(p.x, p.y, { count: 8, colors: ["#ef5350", "#fff"], speed: [10, 40], life: [0.3, 0.5], size: [1, 2], fade: true }); this.gameObject.destroy(); }
      return;
    }
    // 무기·패시브: 가까이 서 있기
    this.near = near && nd < 14 ? near : null;
    const price = this._price(this.near), full = it.type === "heart" && this.near && this.near.hp >= this.near.maxHp;
    const can = this.near && this.lock <= 0 && !full && (!(it.price > 0) || this.near.gold >= price);
    if (!can) { this.hold = 0; this.holder = null; return; }
    if (this.holder !== this.near) { this.holder = this.near; this.hold = 0; }
    this.hold += dt;
    if (this.hold < 0.6) return;
    const h = this.near; this.hold = 0; this.holder = null;
    if (it.price > 0) h.gold -= this._price(h);
    g.fx.emit(p.x, p.y, { count: 12, colors: ["#ffd54f", "#fff"], speed: [20, 70], life: [0.3, 0.6], size: [1, 2], fade: true });
    if (it.type === "heart") { h.heal(1); SFX.play("swap"); if (--it.stock <= 0) this.gameObject.destroy(); return; } // 상점 하트: 인원수만큼 살 수 있다
    SFX.play(it.type === "item" ? "item" : "swap");
    if (it.type === "item") { h.giveItem(it.id); g.toast(`${h.nick} 획득: ${ITEMS[it.id].name} — ${ITEMS[it.id].desc}`, 3); this.gameObject.destroy(); return; }
    // 무기
    const old = h.weapon; h.weapon = it.weapon;
    if (it.price > 0) { g.spawnWeaponPickup(p.x, p.y - 14, old, 0, 1.5); this.gameObject.destroy(); } // 산 무기: 원래 무기는 근처에 공짜로 떨어짐
    else { it.weapon = old; this.lock = 1.5; }
  }
}
