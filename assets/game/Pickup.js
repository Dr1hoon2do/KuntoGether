// 바닥 아이템. type: coin(닿으면 골드, 자석) / heart(price 0이면 닿으면 회복) / weapon·item·상점 하트(가까이 가면 정보만 보이고, 공격(터치)하면 획득·교체·구매)
class Pickup extends Component {
  constructor(game, item) {
    super();
    this.game = game; this.item = item; this.lock = item.lock ?? 0.8; this.t = Math.random() * 6; this.near = null;
  }
  _price() { // 상점 할인(파티 전체 합산) + 쿠폰(상점에서 처음 사는 물건 반값)
    const base = this.item.price || 0; if (!(base > 0)) return base; const g = this.game;
    let pr = base * g.partyMul("discount"); if (g.partySum("firstHalf") > 0 && g.cur && !g.cur.shopUsed) pr *= 0.5;
    return Math.max(1, Math.ceil(pr));
  }
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
      const isPass = it.type === "item", isAct = it.type === "active", isItem = isPass || isAct;
      const def = isPass ? PASSIVES[it.id] : isAct ? ACTIVES[it.id] : null;
      const color = isItem ? ITEM_TIERS[def.tier].color : TIERS[it.weapon.tier].color;
      ctx.fillStyle = "#0008"; ctx.beginPath(); ctx.ellipse(0, -5, 7, 2.5, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = isAct ? "#ffd54f" : color; ctx.lineWidth = isAct ? 2 : 1.5; ctx.beginPath(); ctx.arc(0, bob, 8, 0, 7); ctx.stroke();
      ctx.fillStyle = color; ctx.globalAlpha = 0.2; ctx.fill(); ctx.globalAlpha = 1;
      if (isItem) {
        this._label(ctx, def.icon, -bob, "#fff", 9);
        this._label(ctx, def.name, -14, "#fff", 5.5);
        this._label(ctx, `${isAct ? "액티브 · " : ""}${ITEM_TIERS[def.tier].name}`, -20.5, color, 4.4);
        if (this.near) this._label(ctx, def.desc, -27, "#cfd8dc", 4.6);
        if (this.near && isAct) this._label(ctx, def.kind === "charge" ? `방 클리어마다 충전 (최대 ${def.max})` : `쿨타임 ${def.cd}초`, -32, "#90a4ae", 4.2);
      } else {
        const w = WEAPONS[it.weapon.id], t = TIERS[it.weapon.tier];
        this._label(ctx, w.name, -bob, color, 7);
        this._label(ctx, (t.name ? t.name + " " : "") + "ATK " + (w.dmg * t.mult).toFixed(1), -14, "#fff", 5);
        if (this.near) this._label(ctx, `${w.ranged ? "원거리" : "근접"} · ${w.note || ""} · 사거리 ${w.range} · ${(1 / w.cd).toFixed(1)}/s`, -20, "#cfd8dc", 4.6);
      }
    }
    if (it.type === "heart" && it.stock) this._label(ctx, "x" + it.stock, -12, "#fff", 6);
    if (it.price > 0) { const pr = this._price(), afford = this.game.gold >= pr; this._label(ctx, pr + "G", 15, afford ? "#ffca28" : "#ef5350", 6); }
    if (this.near) { // 가까이 가면 정보만 보이고, 공격하면 획득·구매
      ctx.strokeStyle = "#fff"; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.t * 6); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      this._label(ctx, it.price > 0 ? "공격 = 구매" : "공격 = 획득", 23, "#fff59d", 4.6);
    }
  }
  update(dt) {
    this.t += dt; this.lock -= dt;
    const g = this.game, it = this.item, p = this.transform.position;
    let near = null, nd = Infinity;
    for (const h of g.heroes) { if (!h.alive) continue; const hp = h.transform.position, d = Math.hypot(hp.x - p.x, hp.y - p.y); if (d < nd) { nd = d; near = h; } }
    if (it.type === "coin") { // 가까우면 끌려간다
      if (near && nd < 42) { const a = Math.atan2(near.transform.position.y - p.y, near.transform.position.x - p.x), s = 90 * dt; this.transform.setPosition(p.x + Math.cos(a) * s, p.y + Math.sin(a) * s); }
      if (near && nd < 8) { g.addGold(it.value); SFX.play("coin"); g.fx.emit(p.x, p.y, { count: 4, colors: ["#ffca28", "#fff"], speed: [10, 40], life: [0.2, 0.4], size: [1, 1.6], fade: true }); this.gameObject.destroy(); }
      return;
    }
    if (it.type === "heart" && !(it.price > 0)) {
      if (near && nd < 10 && near.hp < near.maxHp) { near.heal(1); near.heartBuffOn = true; SFX.play("swap"); g.fx.emit(p.x, p.y, { count: 8, colors: ["#ef5350", "#fff"], speed: [10, 40], life: [0.3, 0.5], size: [1, 2], fade: true }); this.gameObject.destroy(); }
      return;
    }
    // 무기·패시브·상점 하트: 가까이 가면 정보만 표시. 획득·구매는 공격(터치)할 때 Game.tryInteract → interact()
    this.near = near && nd < 18 ? near : null;
  }
  // h가 이 아이템을 향해 공격했을 때
  interact(h) {
    const g = this.game, it = this.item, p = this.transform.position;
    if (this.lock > 0) return false;
    const price = it.price > 0 ? this._price() : 0;
    if (it.type === "heart" && h.hp >= h.maxHp) { this._deny(h, "HP가 가득 찼어요"); return false; }
    if (it.price > 0 && g.gold < price) { this._deny(h, `골드가 부족해요 (${price}G 필요, 보유 ${g.gold}G)`); return false; }
    if (it.price > 0) { g.gold -= price; if (g.cur) g.cur.shopUsed = true; } // 골드는 팀 공유
    g.fx.emit(p.x, p.y, { count: 12, colors: ["#ffd54f", "#fff"], speed: [20, 70], life: [0.3, 0.6], size: [1, 2], fade: true });
    if (it.type === "heart") { h.heal(1); h.heartBuffOn = true; SFX.play("swap"); if (--it.stock <= 0) this.gameObject.destroy(); return true; } // 상점 하트: 인원수만큼 살 수 있다
    SFX.play(it.type === "weapon" ? "swap" : "item");
    if (it.type === "active") { // 액티브: 들고 있던 것은 바닥에 떨어진다 (충전 상태 유지)
      const old = h.active; h.setActive(it.id, it.state);
      g.toast(`${h.nick} 획득(액티브): ${ACTIVES[it.id].name} — ${ACTIVES[it.id].desc}`, 3);
      if (old) { g._makePickup({ type: "active", id: old.id, state: { charge: old.charge, cdLeft: old.cdLeft }, price: 0, x: p.x, y: p.y - 14, lock: 1.5 }); }
      this.gameObject.destroy(); return true;
    }
    if (it.type === "item") { h.giveItem(it.id); g.toast(`${h.nick} 획득: ${PASSIVES[it.id].name} — ${PASSIVES[it.id].desc}`, 3); this.gameObject.destroy(); return true; }
    // 무기
    const old = h.weapon; h.weapon = it.weapon;
    if (it.price > 0) { g.spawnWeaponPickup(p.x, p.y - 14, old, 0, 1.5); this.gameObject.destroy(); } // 산 무기: 원래 무기는 근처에 공짜로 떨어짐
    else { it.weapon = old; this.lock = 1.5; }
    return true;
  }
  _deny(h, text) { this.lock = 0.6; this.game.toast(`${h.nick}: ${text}`, 1.6); SFX.play("block"); }
}
