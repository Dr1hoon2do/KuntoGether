const PICK_R = 11; // 안내 고리 반지름 = 상호작용 거리 (그려진 대로)
// 코인 모양: 값 → [반지름, 색, 테두리, 안쪽 무늬]  (1 구리 / 3 은 / 5 금 / 10 파랑)
const COIN_STYLE = { 1: [3, "#b87333", "#e0a070", "#8a5424"], 3: [3.8, "#cfd8dc", "#ffffff", "#90a4ae"], 5: [4.6, "#ffca28", "#fff8c4", "#c79100"], 10: [5.5, "#4fc3f7", "#e1f5fe", "#0288d1"] };
// 바닥 아이템. type: coin(닿으면 골드, 자석) / key(닿으면 열쇠) / bundle(닿으면 터져서 코인·열쇠·하트) / chest(열쇠가 있으면 닿아서 열림) / heart(price 0이면 닿으면 회복) / weapon·item·상점 하트(가까이 가면 정보만 보이고, 공격(터치)하면 획득·교체·구매)
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
  get touch() { const it = this.item; return it.type === "coin" || it.type === "key" || it.type === "bundle" || it.type === "chest" || (it.type === "heart" && !(it.price > 0)); } // 닿으면 바로 작동하는 종류 (공격으로 사는 것이 아님)
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer(ctx => this._draw(ctx), 22, { order: 1 }));
    const it = this.item, o = { layer: "Pickup", isTrigger: true, body: "kinematic", data: this };
    if (it.type === "coin") { this.style = COIN_STYLE[it.value] || COIN_STYLE[1]; this.col = this.gameObject.addComponent(Collider2D.circle(this.style[0], o)); } // 줍는 아이템: 그려진 크기 그대로의 트리거
    else if (it.type === "key") this.col = this.gameObject.addComponent(Collider2D.circle(4.5, o));
    else if (it.type === "bundle") this.col = this.gameObject.addComponent(Collider2D.circle(6.5, o));
    else if (it.type === "chest") this.col = this.gameObject.addComponent(Collider2D.box(16, 12, o));
    else if (it.type === "heart" && !(it.price > 0)) this.col = this.gameObject.addComponent(Collider2D.circle(5.5, o));
  }
  onTriggerEnter(other) { this.onTriggerStay(other); }
  onTriggerStay(other) {
    const h = other.data, it = this.item, g = this.game; if (!h || !h.alive || this.gameObject.isDestroyed || !(h instanceof Hero)) return;
    const p = this.transform.position;
    if (it.type === "coin") { const v = Math.random() < g.partySum("coinDouble") ? it.value * 2 : it.value; g.addGold(v); g.fire?.("coinPickup", h, v); SFX.play("coin"); g.fx.emit(p.x, p.y, { count: 4, colors: [this.style[1], "#fff"], speed: [10, 40], life: [0.2, 0.4], size: [1, 1.6], fade: true }); this.gameObject.destroy(); }
    else if (it.type === "key") { g.addKey(1); g.fire?.("keyPickup", h, 1); SFX.play("coin"); g.fx.emit(p.x, p.y, { count: 5, colors: ["#fdd835", "#fff"], speed: [10, 40], life: [0.2, 0.4], size: [1, 1.6], fade: true }); this.gameObject.destroy(); }
    else if (it.type === "bundle") this._burst(h);
    else if (it.type === "chest") this._openChest(h);
    else if (it.type === "heart" && !(it.price > 0) && h.hp < h.maxHp) { h.heal(1); h.heartBuffOn = true; g.fire?.("heartPickup", h, 1); SFX.play("swap"); g.fx.emit(p.x, p.y, { count: 8, colors: ["#ef5350", "#fff"], speed: [10, 40], life: [0.3, 0.5], size: [1, 2], fade: true }); this.gameObject.destroy(); }
  }
  // 꾸러미: 터지면서 코인(대부분)·열쇠·하트가 주변에 흩어진다
  _burst(h) {
    const g = this.game, p = this.transform.position, B = ECON.bundle, n = B.pieces[0] + Math.floor(Math.random() * (B.pieces[1] - B.pieces[0] + 1));
    this.gameObject.destroy(); SFX.play("item"); g.fx.emit(p.x, p.y, { count: 10, colors: ["#a1887f", "#d7ccc8"], speed: [20, 60], life: [0.2, 0.4], size: [1, 2], fade: true });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, r = 14 + Math.random() * 8, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r, q = Math.random();
      if (q < B.coin) g.spawnCoin(x, y, g.rollCoinValue(0)); else if (q < B.coin + B.key) g.spawnKey(x, y); else g.spawnHeart(x, y);
    }
  }
  // 상자: 열쇠 1개로 열린다. 코인 2~3개 + 하트/열쇠/드물게 패시브 아이템
  _openChest(h) {
    const g = this.game, p = this.transform.position, C = ECON.chest;
    if (this.lock > 0) return;
    if (g.keys < 1) { this.lock = 0.7; SFX.play("block"); return; }
    g.keys--; g.fire?.("chestOpen", h, this); this.gameObject.destroy(); SFX.play("item");
    g.fx.emit(p.x, p.y, { count: 12, colors: ["#ffd54f", "#a47532", "#fff"], speed: [20, 70], life: [0.3, 0.6], size: [1, 2], fade: true });
    const n = C.coins[0] + Math.floor(Math.random() * (C.coins[1] - C.coins[0] + 1)), spot = i => { const a = Math.random() * 6.283, r = 14 + Math.random() * 10; return [p.x + Math.cos(a) * r, p.y + Math.sin(a) * r - 4 * (i & 1)]; };
    for (let i = 0; i < n; i++) { const [x, y] = spot(i); g.spawnCoin(x, y, g.rollCoinValue(C.bias)); }
    if (Math.random() < C.heart) { const [x, y] = spot(0); g.spawnHeart(x, y); }
    if (Math.random() < C.key) { const [x, y] = spot(1); g.spawnKey(x, y); }
    if (Math.random() < C.item) g._makePickup({ ...g._itemSlot(g._heldItems(), g._heldActives(), 0.15), price: 0, x: p.x, y: p.y - 16, lock: 0.8 });
  }
  _label(ctx, text, y, color, size = 5.5) {
    ctx.save(); ctx.scale(1, -1); ctx.fillStyle = color; ctx.font = `${size}px monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 0, y); ctx.restore();
  }
  _draw(ctx) {
    const it = this.item, bob = Math.sin(this.t * 4) * 1.2;
    if (it.type === "coin") {
      const S = this.style, r = S[0]; ctx.fillStyle = "#0004"; ctx.beginPath(); ctx.ellipse(0, -r - 1.5, r * 0.8, 1.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = S[1]; ctx.beginPath(); ctx.arc(0, bob, r, 0, 7); ctx.fill(); ctx.strokeStyle = S[2]; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.strokeStyle = S[3]; ctx.beginPath(); ctx.arc(0, bob, r * 0.55, 0, 7); ctx.stroke();
      if (it.value === 10) { ctx.fillStyle = S[2]; ctx.beginPath(); ctx.moveTo(0, bob + r * 0.4); ctx.lineTo(r * 0.3, bob); ctx.lineTo(0, bob - r * 0.4); ctx.lineTo(-r * 0.3, bob); ctx.fill(); } // 파란 코인은 다이아 무늬
      return;
    }
    if (it.type === "key") { // 열쇠: 고리 + 몸통 + 이빨
      ctx.fillStyle = "#0004"; ctx.beginPath(); ctx.ellipse(0, -6, 3.5, 1.2, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "#fdd835"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 2.5 + bob, 2.2, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0.3 + bob); ctx.lineTo(0, -4.5 + bob); ctx.moveTo(0, -3 + bob); ctx.lineTo(2.2, -3 + bob); ctx.moveTo(0, -4.5 + bob); ctx.lineTo(1.6, -4.5 + bob); ctx.stroke();
      return;
    }
    if (it.type === "bundle") { // 꾸러미: 묶은 자루
      ctx.fillStyle = "#0004"; ctx.beginPath(); ctx.ellipse(0, -6, 6, 1.8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#a1887f"; ctx.beginPath(); ctx.arc(0, -0.5 + bob, 5.6, 0, 7); ctx.fill(); ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 0.9; ctx.stroke();
      ctx.fillStyle = "#8d6e63"; ctx.fillRect(-2.2, 4.2 + bob, 4.4, 2); ctx.fillStyle = "#ffca28"; ctx.fillRect(-1.2, 1.2 + bob, 2.4, 2.4);
      return;
    }
    if (it.type === "chest") { // 상자: 열쇠가 있어야 열린다
      const has = this.game.keys > 0;
      ctx.fillStyle = "#0004"; ctx.fillRect(-8, -7.5, 16, 2.5);
      ctx.fillStyle = "#a47532"; ctx.fillRect(-8, -6, 16, 12); ctx.fillStyle = "#c58f45"; ctx.fillRect(-8, 1, 16, 5);
      ctx.strokeStyle = "#5a3d14"; ctx.lineWidth = 1; ctx.strokeRect(-8, -6, 16, 12); ctx.beginPath(); ctx.moveTo(-8, 1); ctx.lineTo(8, 1); ctx.stroke();
      ctx.fillStyle = has ? "#fdd835" : "#9e9e9e"; ctx.fillRect(-1.6, -0.6, 3.2, 3.2);
      return;
    }
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
    if (it.type === "coin" || it.type === "key") { // 가까우면 끌려간다
      if (near && nd < 42) { const a = Math.atan2(near.transform.position.y - p.y, near.transform.position.x - p.x), s = 90 * dt; this.transform.setPosition(p.x + Math.cos(a) * s, p.y + Math.sin(a) * s); }
      // 코인 획득은 트리거(onTriggerEnter)로: 코인 모양과 플레이어 몸이 실제로 닿았을 때
      return;
    }
    if (this.touch) return; // 하트·꾸러미·상자도 트리거(onTriggerStay)로
    // 무기·패시브·상점 하트: 가까이 가면 정보만 표시. 획득·구매는 공격(터치)할 때 Game.tryInteract → interact()
    this.near = near && nd < PICK_R + near.radius ? near : null; // 흰 고리(반지름 11)에 몸이 닿으면 "공격 = 획득"
  }
  // h가 이 아이템을 향해 공격했을 때
  interact(h) {
    const g = this.game, it = this.item, p = this.transform.position;
    if (this.lock > 0) return false;
    const price = it.price > 0 ? this._price() : 0;
    if (it.type === "heart" && h.hp >= h.maxHp) { this._deny(h); return false; }
    if (it.price > 0 && g.gold < price) { this._deny(h); return false; }
    if (it.price > 0) { g.gold -= price; if (g.cur) g.cur.shopUsed = true; } // 골드는 팀 공유
    g.fx.emit(p.x, p.y, { count: 12, colors: ["#ffd54f", "#fff"], speed: [20, 70], life: [0.3, 0.6], size: [1, 2], fade: true });
    if (it.type === "heart") { h.heal(1); h.heartBuffOn = true; SFX.play("swap"); if (--it.stock <= 0) this.gameObject.destroy(); return true; } // 상점 하트: 인원수만큼 살 수 있다
    SFX.play(it.type === "weapon" ? "swap" : "item");
    if (it.type === "active") { // 액티브: 들고 있던 것은 바닥에 떨어진다 (충전 상태 유지)
      const old = h.active; h.setActive(it.id, it.state);
      
      if (old) { g._makePickup({ type: "active", id: old.id, state: { charge: old.charge, cdLeft: old.cdLeft }, price: 0, x: p.x, y: p.y - 14, lock: 1.5 }); }
      this.gameObject.destroy(); return true;
    }
    if (it.type === "item") { h.giveItem(it.id);  this.gameObject.destroy(); return true; }
    // 무기
    const old = h.weapon; h.weapon = it.weapon;
    if (it.price > 0) { g.spawnWeaponPickup(p.x, p.y - 14, old, 0, 1.5); this.gameObject.destroy(); } // 산 무기: 원래 무기는 근처에 공짜로 떨어짐
    else { it.weapon = old; this.lock = 1.5; }
    return true;
  }
  _deny() { this.lock = 0.6; SFX.play("block"); }
}
