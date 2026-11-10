const playerColor = id => `hsl(${Math.round((id * 137.5 + 200) % 360)},75%,62%)`;
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// 플레이어. input: { mx, my, ax, ay, atk, dash } (스틱 값 -1~1, Y-up)
// pid: 폰이 저장해 두는 기기 ID. 같은 pid로 다시 접속하면 같은 Hero(아이템·골드·체력 유지)를 되돌려 준다.
class Hero extends Component {
  constructor(game, id, pid) {
    super();
    this.game = game; this.id = id; this.pid = pid; this.nick = `P${id + 1}`; this.conn = null;
    this.color = playerColor(id);
    this.input = { mx: 0, my: 0, ax: 0, ay: 0, atk: 0, dash: 0, act: 0 }; this.lastMsg = 0; this.prevAct = 0;
    this.resetRun();
    this.alive = true; this.invuln = 0; this.facing = -Math.PI / 2;
    this.cd = 0; this.swing = null; this.echoes = []; this.dashT = 0; this.dashCd = 0; this.dashDir = 0; this.prevDash = 0;
    this.kx = 0; this.ky = 0; this.radius = 6; this.keyboard = false;
  }
  resetRun() { // 새 게임을 시작할 때 초기화 (닉네임·pid는 유지)
    const php = this.game.diffProfile().playerHp; this.maxHp = php; this.hp = php; this.kills = 0; this.items = []; this.stats = newStats(); this.active = null; this.moveT = 0; this.moveMul = 1;
    this.weapon = { id: "sword", tier: 0 }; this.leechN = 0; this.regenT = 0; this.echoes = [];
    this.roomT = 99; this.hitThisRoom = false; this.heartBuffOn = false; this.dashAt = -1e9; this.moving = false; this.dashHit = new Set();
    // 아이템 시스템 상태 (Items.js): 이벤트 훅 · 형태 변환 · 꾸미기 · 태그/세트/짝 · 동료 · 보호막 · 임시 버프
    if (this.fams) this.clearFamiliars(); this.fams = [];
    this.hooks = {}; this.convs = []; this.convTo = {}; this.cos = {}; this.tagN = {}; this.sets = {}; this.syn = {};
    this.shield = 0; this.buff = { t: 0, dmg: 0, atk: 0, spd: 0 }; this.dashCharge = 1; this.comboN = 0; this.comboT = 0; this.killT = 0; this.hurtT = 0; this.rollDmg = 1; this.fairyN = 0;
    this.allyAtk = 0; this.allyDmg = 0; this.allyInv = 0; this.linkTo = null; this.linkT = 0; this.auraT = 0; this.sparkT = 0; this._aw = null; this._awT = 0;
  }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer((ctx, r) => this._draw(ctx, r), 18, { order: 5 }));
    this.col = this.gameObject.addComponent(Collider2D.circle(this.radius, { layer: "Hero", body: "kinematic", data: this })); // 충돌 모양 = 그려진 몸(반지름 radius)
    this._mv = { x: 0, y: 0, hit: false, nx: 0, ny: 0, collider: null };
  }
  lateUpdate() { if (this.col) this.col.sync(); }
  // 아이템 효과가 반영된 현재 무기 능력치. 형태(form)가 아이템으로 바뀌면 그 형태의 능력치로 돌려준다.
  getWeapon() {
    const b = WEAPONS[this.weapon.id], t = TIERS[this.weapon.tier], s = this.stats, now = performance.now();
    const w = Object.assign({}, b); const to = this.convTo[b.form]; if (to) convertForm(w, to); // 형태 변환 (우선순위는 rebuildConv)
    let dmg = s.dmg * (w.ranged ? s.dmgRanged : s.dmgMelee);
    dmg *= 1 + s.berserk * (1 - Math.max(0, this.hp) / this.maxHp);
    if (s.noHitDmg && !this.hitThisRoom) dmg *= 1 + s.noHitDmg;       // 양파: 방에서 안 맞았다면
    if (s.heartBuff && this.heartBuffOn) dmg *= 1 + s.heartBuff;       // 뼈다귀: 하트를 먹었다면
    if (s.openDmg && this.roomT < 3) dmg *= 1 + s.openDmg;             // 촛불: 방 입장 직후
    if (s.lowHp && this.hp <= 1) dmg *= 1 + s.lowHp;                   // 마지막 숨
    if (this.buff.t > 0) dmg *= 1 + this.buff.dmg;                     // 액티브 버프
    if (this.allyDmg) dmg *= 1 + this.allyDmg;                         // 아군 오라
    if (this.rollDmg !== 1) dmg *= this.rollDmg;                       // 주사위 상자
    let spd = s.atkSpeed;
    if (s.moveAtk && this.moving) spd *= 1 + s.moveAtk;               // 운동화: 이동 중
    if (s.dashAtk && now - this.dashAt < 2000) spd *= 1 + s.dashAtk;  // 빨간 리본: 대시 직후
    if (s.fullHpAtk && this.hp >= this.maxHp) spd *= 1 + s.fullHpAtk; // 체력의 심장: HP 가득
    if (s.combo && this.comboN) spd *= 1 + s.combo * this.comboN;     // 연타 장갑
    if (s.killAtk && this.killT > 0) spd *= 1 + s.killAtk;            // 연쇄 살육
    if (s.hurtBuff && this.hurtT > 0) spd *= 1 + s.hurtBuff;          // 아드레날린
    if (s.lowHp && this.hp <= 1) spd *= 1 + s.lowHp * 0.5;
    if (this.buff.t > 0) spd *= 1 + this.buff.atk;
    if (this.allyAtk) spd *= 1 + this.allyAtk;                         // 응원봉
    w.arc = w.ranged ? w.arc : Math.min(360, (w.arc || 0) * (1 + s.arcMul)); // 쪼개진 막대: 근접 범위
    w.dmg *= t.mult * dmg; w.range *= s.range; w.cd /= spd; w.knock *= s.knock; w.tier = this.weapon.tier;
    return w;
  }
  _aimW() { const n = performance.now(); if (!this._aw || n - this._awT > 150) { this._aw = this.getWeapon(); this._awT = n; } return this._aw; } // 자동 조준용 (0.15초마다 갱신)
  get gold() { return this.game.gold; }            // 골드는 팀 전체가 공유한다
  set gold(v) { this.game.gold = v; }
  addGold(n) { return this.game.addGold(n); }
  giveItem(id) { this.items.push(id); PASSIVES[id].apply(this); this._aw = null; }
  on(evt, fn) { (this.hooks[evt] || (this.hooks[evt] = [])).push(fn); }   // 훅 등록 (Items.js의 on)
  fire(evt, a, b) { this.game.fire(evt, this, a, b); }                    // 이 플레이어가 일으킨 이벤트
  rebuildConv() { // 형태 변환 선택: 같은 형태를 바꾸는 변환이 여럿이면 우선순위(prio)가 높은 것, 같으면 나중에 얻은 것
    const best = {}; this.convTo = {};
    for (const c of this.convs) for (const f in c.conv) { const cur = best[f]; if (!cur || c.prio > cur.prio || (c.prio === cur.prio && c.n > cur.n)) best[f] = c; }
    for (const f in best) this.convTo[f] = best[f].conv[f];
  }
  addFamiliar(type) {
    const g = this.game, go = g.App.create("fam_" + type), p = this.transform.position; go.transform.setPosition(p.x, p.y);
    const f = go.addComponent(new Familiar(g, this, type)); f.setup(); this.fams.push(f); this.fams.forEach((q, i) => { q.idx = i; });
  }
  clearFamiliars() { for (const f of this.fams) if (f.gameObject && !f.gameObject.isDestroyed) f.gameObject.destroy(); this.fams = []; }
  addBuff(t, dmg, atk, spd) { const b = this.buff; b.t = t; b.dmg = dmg; b.atk = atk; b.spd = spd; }
  // 아군 오라(응원봉·사부의 인장)와 연결의 실 대상 — 0.2초마다 갱신
  _auraTick() {
    const g = this.game, p = this.transform.position; let atk = 0, dmg = 0, inv = 0, link = null, ld = 110 * 110;
    for (const o of g.heroes) {
      if (o === this || !o.alive) continue; const op = o.transform.position, d2 = (op.x - p.x) * (op.x - p.x) + (op.y - p.y) * (op.y - p.y), os = o.stats;
      if (d2 < 75 * 75) { atk += os.auraAtk; dmg += os.auraDmg; inv += os.auraInv; }
      if (this.stats.link && d2 < ld) { ld = d2; link = o; }
    }
    this.allyAtk = atk; this.allyDmg = dmg; this.allyInv = inv; this.linkTo = link;
  }
  // 상태/거리/대상에 따라 달라지는 추가 피해 배율 (Enemy.damage에서 호출)
  vsMul(e, n) {
    const s = this.stats; let m = 1;
    if (s.vsBurn && e.burn) m += s.vsBurn;
    if (s.vsFrozen && (e.frz > 0 || e.slowT > 0)) m += s.vsFrozen;
    if (s.vsBleed && e.bld) m += s.vsBleed;
    if (s.vsBoss && e.boss) m += s.vsBoss;
    if (s.vsElite && e.elite) m += s.vsElite;
    if (s.vsFull && e.hp >= e.maxHp) m += s.vsFull;
    if (s.far || s.near) { const p = this.transform.position, ep = e.transform.position, d = Math.hypot(ep.x - p.x, ep.y - p.y); if (s.far && d > 70) m += s.far; if (s.near && d < 30) m += s.near; }
    return n * m;
  }
  setActive(id, state) { this.active = { id, charge: state ? state.charge : 0, cdLeft: state ? state.cdLeft : 0 }; }
  useActive() {
    const a = this.active; if (!a) return;
    const def = ACTIVES[a.id], g = this.game;
    if (def.kind === "charge" ? a.charge <= 0 : a.cdLeft > 0) { if (!this._actDenied || this._actDenied < performance.now()) { SFX.play("block"); this._actDenied = performance.now() + 400; } return; }
    if (!def.use(this, g)) return;
    if (def.kind === "charge") a.charge--; else a.cdLeft = def.cd;
  }

  _draw(ctx, r) {
    const wd = TIERS[this.weapon.tier];
    if (this.alive) {
      ctx.fillStyle = r.flash > 0 ? "#fff" : this.color;
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, 7); ctx.fill();
      ctx.strokeStyle = "#000a"; ctx.lineWidth = 1; ctx.stroke();
      ctx.save(); ctx.rotate(this.facing); ctx.strokeStyle = wd.color; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(this.radius - 1, 0); ctx.lineTo(this.radius + 7, 0); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(3, 0, 1.4, 0, 7); ctx.fill();
      ctx.restore();
      const c = this.cos; // 아이템 꾸미기 (효과 없음)
      if (c.aura) { ctx.strokeStyle = `hsl(${(performance.now() / 8) % 360},90%,65%)`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, this.radius + 2.6, 0, 7); ctx.stroke(); }
      if (c.hat) { ctx.fillStyle = c.hat; ctx.beginPath(); ctx.moveTo(-4.5, 4); ctx.lineTo(4.5, 4); ctx.lineTo(1, 10.5); ctx.closePath(); ctx.fill(); ctx.fillRect(-5.5, 3.4, 11, 1.6); }
      if (c.crown) { ctx.fillStyle = c.crown; ctx.beginPath(); ctx.moveTo(-4, 4.5); ctx.lineTo(-4, 9); ctx.lineTo(-2, 7); ctx.lineTo(0, 9.5); ctx.lineTo(2, 7); ctx.lineTo(4, 9); ctx.lineTo(4, 4.5); ctx.closePath(); ctx.fill(); }
      if (c.glasses) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(-2.4, 1.2, 1.9, 0, 7); ctx.moveTo(4.3, 1.2); ctx.arc(2.4, 1.2, 1.9, 0, 7); ctx.moveTo(-0.5, 1.2); ctx.lineTo(0.5, 1.2); ctx.stroke(); }
      if (c.mustache) { ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 1.3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-3.6, -1.6); ctx.quadraticCurveTo(-1.8, -0.2, 0, -1.6); ctx.quadraticCurveTo(1.8, -0.2, 3.6, -1.6); ctx.stroke(); }
      if (this.shield > 0) { ctx.strokeStyle = "#80deea"; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, this.radius + 3.6, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    } else { ctx.fillStyle = this.color; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill(); ctx.globalAlpha = 0.6; }
    ctx.save(); ctx.scale(1, -1); ctx.fillStyle = this.alive ? "#fff" : "#aaa"; ctx.font = "bold 5.5px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.strokeStyle = "#000c"; ctx.lineWidth = 1.4; ctx.strokeText(this.nick, 0, -(this.radius + 5)); ctx.fillText(this.nick, 0, -(this.radius + 5)); ctx.restore();
  }
  update(dt) {
    if (this.col) this.col.active = this.alive;
    if (!this.alive) return;
    const g = this.game, i = this.input, t = this.transform, s = this.stats;
    this.invuln -= dt; this.cd -= dt; this.moveT -= dt; this.roomT += dt;
    this.hurtT -= dt; this.killT -= dt; if (this.buff.t > 0) this.buff.t -= dt; if (this.comboN && (this.comboT -= dt) <= 0) this.comboN = 0;
    this.auraT -= dt; if (this.auraT <= 0) { this.auraT = 0.2; this._auraTick(); }
    const dmax = 1 + s.dashExtra; this.dashCharge = Math.min(dmax, this.dashCharge + dt / (0.7 * s.dashCd)); this.dashCd = this.dashCharge >= 1 ? 0 : (1 - this.dashCharge) * 0.7 * s.dashCd; // 대시 충전(여분 대시 아이템이 있으면 여러 번)
    if (this.active && this.active.cdLeft > 0) this.active.cdLeft = Math.max(0, this.active.cdLeft - dt);
    if (i.act && !this.prevAct) this.useActive();
    this.prevAct = i.act;
    this.draw.opacity = this.invuln > 0 && Math.floor(this.invuln * 14) % 2 ? 0.35 : 1;
    if (s.regen > 0) { this.regenT += dt; if (this.regenT >= 90 / s.regen) { this.regenT = 0; if (this.hp < this.maxHp) { this.heal(1); g.fx.emit(t.position.x, t.position.y, { count: 5, colors: ["#81c784", "#fff"], speed: [10, 30], life: [0.3, 0.5], size: [1, 2], fade: true }); } } }

    let mx = i.mx, my = i.my; const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    this.moving = ml > 0.2;
    if (i.atk) { // 공격 조이스틱을 잡고 있는 동안은 이동 방향이 아니라 조준 방향(드래그 방향, 없으면 가장 가까운 적)으로 무기를 내민다
      if (Math.hypot(i.ax, i.ay) > 0.35) this.facing = Math.atan2(i.ay, i.ax);
      else { const a = this._autoAim(this._aimW()); if (a !== null) this.facing = a; else if (ml > 0.15) this.facing = Math.atan2(my, mx); }
    } else if (ml > 0.15) this.facing = Math.atan2(my, mx);

    if (i.dash && !this.prevDash && this.dashCharge >= 1 && this.dashT <= 0) { // 대시: 짧은 무적
      this.dashT = 0.16; this.dashCharge -= 1; this.dashCd = (1 - this.dashCharge) * 0.7 * s.dashCd; this.invuln = Math.max(this.invuln, 0.2 + s.dashInvuln); this.dashAt = performance.now(); this.dashHit = new Set();
      this.dashDir = ml > 0.15 ? Math.atan2(my, mx) : this.facing;
      g.fx.emit(t.position.x, t.position.y, { count: 6, colors: [this.color, "#fff"], speed: [10, 40], life: [0.15, 0.3], size: [1, 2], fade: true });
      this.fire("dash");
    }
    this.prevDash = i.dash;

    const sprint = s.sprint && this.roomT < 5 ? 1 + s.sprint : 1; // 낡은 장화: 방에 들어간 직후
    const spb = 1 + (this.buff.t > 0 ? this.buff.spd : 0) + (s.hurtBuff && this.hurtT > 0 ? s.hurtBuff : 0); // 버프로 인한 이동 속도
    let vx = mx * 82 * s.speed * sprint * spb, vy = my * 82 * s.speed * sprint * spb;
    if (this.dashT > 0) { this.dashT -= dt; vx = Math.cos(this.dashDir) * 230 * s.dashPower; vy = Math.sin(this.dashDir) * 230 * s.dashPower; }
    if (this.dashT > 0) { // 대시 중: 질풍의 띠(지나간 적에게 피해) · 깃털 장식(탄 제거)
      if (s.dashDmg) { const buf = [], n = Physics.overlapCircle(t.position.x, t.position.y, this.radius + 3, PL.Enemy, buf); for (let k = 0; k < n; k++) { const e = buf[k].data; if (e.dead || e.spawnDelay > 0 || this.dashHit.has(e)) continue; const ep = e.transform.position; this.dashHit.add(e); const dm = 3 * s.dmg * s.dashDmg; e.damage(dm, this, Math.atan2(ep.y - t.position.y, ep.x - t.position.x), 160); this.applyHitEffects(e, dm); } }
      if (s.dashCancel) g.cancelProjectiles(t.position.x, t.position.y, 18);
    }
    if (this.moveT > 0 && this.dashT <= 0) { vx *= this.moveMul; vy *= this.moveMul; } // 공격하는 동안 무기별로 조금 느려진다
    vx += this.kx; vy += this.ky; this.kx *= Math.max(0, 1 - 9 * dt); this.ky *= Math.max(0, 1 - 9 * dt);
    const p = t.position;
    const mv = this._mv; this.col.sync(); Physics.moveCircle(p.x, p.y, this.radius, vx * dt, vy * dt, PL.Solid, mv, this.col); // 벽·지형에 막히면 미끄러진다 (터널링 없음)
    t.setPosition(mv.x, mv.y); this.col.sync();

    if (this.cos.sparkle && this.moving) { this.sparkT -= dt; if (this.sparkT <= 0) { this.sparkT = 0.09; g.fx.emit(p.x, p.y - 3, { count: 1, colors: ["#fff59d", "#f8bbd0", "#b3e5fc"], speed: [4, 14], life: [0.3, 0.6], size: [1, 1.8], fade: true }); } } // 반짝이 신발
    if (s.link && this.linkTo && this.linkTo.alive) { // 연결의 실: 아군과의 선에 닿은 적이 0.5초마다 피해
      this.linkT -= dt;
      if (this.linkT <= 0) {
        this.linkT = 0.5; const lp = this.linkTo.transform.position, buf = this._lbuf || (this._lbuf = []), n = Physics.overlapCapsule(p.x, p.y, lp.x, lp.y, 3, PL.Enemy, buf);
        for (let k = 0; k < n; k++) { const e = buf[k].data; if (e.dead || e.spawnDelay > 0) continue; e.damage(1.4 * s.dmg * s.link, this, Math.atan2(lp.y - p.y, lp.x - p.x), 20, true); }
        for (let q = 1; q <= 4; q++) g.fx.emit(p.x + (lp.x - p.x) * q / 5, p.y + (lp.y - p.y) * q / 5, { count: 1, colors: ["#fff59d", "#ce93d8"], speed: [0, 6], life: [0.25, 0.45], size: [1, 1.6], fade: true });
      }
    }
    for (let k = this.echoes.length - 1; k >= 0; k--) { // 연타·메아리 칼날의 추가 타격
      const e = this.echoes[k]; e.t -= dt;
      if (e.t <= 0) { this.echoes.splice(k, 1); if (!e.w.ranged) g.spawnSlash(this, e.dir, e.w); this._strike(e.dir, e.w, true); }
    }
    if (this.swing) { this.swing.t -= dt; if (this.swing.t <= 0) { const sw = this.swing; this.swing = null; this._strike(sw.dir, sw.w, false); } }
    else if (i.atk && this.cd <= 0 && this.dashT <= 0) this._startSwing();
  }
  _autoAim(w) { // 가장 가까운 적 방향 (없으면 null)
    const p = this.transform.position; let best = null, bd = w.ranged ? Math.min(w.range, 150) : w.range + 22;
    for (const e of this.game.enemies) { if (e.spawnDelay > 0 || e.dead) continue; const ep = e.transform.position, d = Math.hypot(ep.x - p.x, ep.y - p.y); if (d < bd) { bd = d; best = ep; } }
    return best ? Math.atan2(best.y - p.y, best.x - p.x) : null;
  }
  _startSwing() {
    const w = this.getWeapon(), g = this.game, p = this.transform.position;
    let dir = this.facing;
    if (Math.hypot(this.input.ax, this.input.ay) > 0.35) dir = Math.atan2(this.input.ay, this.input.ax); // 드래그로 직접 조준
    else { const a = this._autoAim(w); if (a !== null) dir = a; } // 자동 조준
    this.facing = dir;
    if (g.tryInteract(this)) { this.cd = 0.35; return; } // 아이템 앞에서 공격하면 획득·구매 (휘두르지는 않음)
    this.cd = w.cd; this.swing = { t: w.delay, dir, w };
    this.moveT = w.delay + (w.dur || 0.1); this.moveMul = w.move ?? 0.85;
    if (!w.ranged) { g.spawnSlash(this, dir, w); SFX.play(this.cos.sfx || "swing"); }
    this.fire("swing", w, dir);
  }
  // 맞힌 적에게 붙는 아이템 효과: 상태이상(화상·둔화·빙결·중독·감전·출혈)·폭발·연쇄 번개·흡혈 문양·연타 → hit 훅
  applyHitEffects(e, dmg, kind) {
    const s = this.stats, g = this.game;
    e.applyStatus(s, this);
    if (s.explode) {
      const ep = e.transform.position, r = 20 * (this.sets.explosive ? 1.4 : 1);
      const buf = [], n = Physics.overlapCircle(ep.x, ep.y, r, PL.Enemy, buf);
      for (let k = 0; k < n; k++) { const o = buf[k].data; if (o === e || o.dead || o.spawnDelay > 0) continue; const op = o.transform.position; o.damage(dmg * 0.4 * s.explode, this, Math.atan2(op.y - ep.y, op.x - ep.x), 60, true); }
      g.fx.emit(ep.x, ep.y, { count: 8, colors: ["#ff8a65", "#fff59d"], speed: [30, 80], life: [0.15, 0.3], size: [1, 2], fade: true, area: 6 });
    }
    if (s.chain > 0) itemsArc(g, e, this, s.chain + (this.sets.electric ? 1 : 0), dmg * 0.5); // 번개가 튄다
    if (s.leech > 0) { this.leechN++; if (this.leechN >= 15 / s.leech) { this.leechN = 0; this.heal(1); } }
    if (s.combo) { this.comboN = Math.min(10, this.comboN + 1); this.comboT = 3; }
    this.fire("hit", e, dmg);
  }
  _strike(dir, w, isEcho) {
    if (w.ranged) return this._fire(dir, w, isEcho);
    const g = this.game, p = this.transform.position, s = this.stats;
    const crit = Math.random() < s.crit, dmg = w.dmg * (crit ? 2 + s.critDmg : 1), half = (w.arc * Math.PI / 180) / 2;
    if (crit && s.critReset) this.cd = 0; // 신속의 반지
    // 판정은 그려진 궤적과 같은 모양: 부채꼴(apex=내 위치, 반지름 range, 반각 half) / 찌르기는 굵은 선(캡슐) — Physics가 몸 모양과 정확히 교차 판정
    const thrust = w.kind === "thrust", tw = thrust ? Math.max(3.5, Math.min(9, w.range * half * 0.5)) : 0, ph = w.arc >= 360 ? Math.PI : Math.min(Math.PI, half);
    const ex = p.x + Math.cos(dir) * w.range, ey = p.y + Math.sin(dir) * w.range;
    const query = (mask, buf) => thrust ? Physics.overlapCapsule(p.x, p.y, ex, ey, tw, mask, buf) : Physics.overlapSector(p.x, p.y, w.range, dir, ph, mask, buf);
    let hit = 0, buf = [], n = query(PL.Enemy, buf);
    for (let k = 0; k < n; k++) {
      const e = buf[k].data; if (e.dead || e.spawnDelay > 0) continue;
      const ep = e.transform.position;
      e.damage(dmg, this, Math.atan2(ep.y - p.y, ep.x - p.x), w.knock); this.applyHitEffects(e, dmg); hit++;
    }
    buf = []; n = query(PL.EProj, buf);
    for (let k = 0; k < n; k++) { // 근접 공격은 기본으로 범위 안의 적 탄을 지운다. 반사 거울이 있으면 되받아친다(근접 공격에만 적용)
      const pr = buf[k].data; if (pr.fromPlayer || pr.gameObject.isDestroyed || pr.orbit) continue;
      const pp = pr.transform.position;
      if (s.deflect >= 2) { pr.owner = this; if (this.syn.mirrorBoom) g.explode(pp.x, pp.y, 22, 4 * s.dmg, 0, this); pr.reflect(this, dir); } // (폭발 거울: 되받는 순간 터진다)
      else { g.fx.emit(pp.x, pp.y, { count: 4, colors: ["#fff", "#ff8a65"], speed: [20, 50], life: [0.15, 0.3], size: [1, 1.6], fade: true }); pr.gameObject.destroy(); SFX.play("block"); }
    }
    buf = []; n = query(PL.Obstacle, buf);
    for (let k = 0; k < n; k++) { const o = buf[k].data; if (!o.destructible || o.dead) continue; o.damage(Math.max(1, Math.round(dmg / 2)), this, false); hit++; } // 상자·통은 부서진다 (바위는 폭발로만)
    if (!isEcho) {
      this._extras(w, dir);
      for (let k = 1; k < (w.hits || 1); k++) this.echoes.push({ t: 0.1 * k, dir, w });
      if (Math.random() < s.doubleSwing) this.echoes.push({ t: 0.16, dir, w });
    } else if (this.syn.echoWave) this._extras(w, dir); // 메아리 검기(짝 시너지)
    if (hit) g.cam.shake(w.knock > 150 ? 2.5 : 1.2, 0.1);
  }
  // 내 탄에 붙는 아이템 개조(튕김·유도·분열·모양)
  _mods() { const s = this.stats; return { bounces: s.bounce, homing: s.homing, split: s.split, shape: this.cos.shape || "" }; }
  // 형태별 추가 공격: 휘두르기 -> 검기(eSlash), 찌르기 -> 관통 바늘(eThrust). 내 탄이라 탄 개조·상태이상이 그대로 적용된다
  _extras(w, dir) {
    const s = this.stats, g = this.game, p = this.transform.position, thr = w.form === "thrust", n = thr ? s.eThrust : w.form === "slash" ? s.eSlash : 0;
    for (let k = 0; k < n; k++) g.spawnProj(p.x, p.y, dir + (k - (n - 1) / 2) * (thr ? 0.12 : 0.25), thr ? 300 : 190, w.dmg * (thr ? 0.6 : 0.5), true, Object.assign({ pierce: true, beam: true, needle: thr, life: thr ? 0.45 : 0.9, radius: thr ? 2 : 3, knock: 30, owner: this }, this._mods()));
  }
  // 원거리 무기 발사
  _fire(dir, w, isEcho) {
    const g = this.game, p = this.transform.position, s = this.stats;
    const crit = Math.random() < s.crit, dmg = w.dmg * (crit ? 2 + s.critDmg : 1);
    if (crit && s.critReset) this.cd = 0;
    const n = (w.count || 1) + s.extraShots, spread = w.arc ? w.arc * Math.PI / 180 : 0.2 * (n - 1);
    const angs = Array.from({ length: n }, (_, i) => (n === 1 ? dir : dir + (i - (n - 1) / 2) * (spread / (n - 1))));
    SFX.play(this.cos.sfx || "shoot");
    g.fx.emit(p.x + Math.cos(dir) * 8, p.y + Math.sin(dir) * 8, { count: 3, colors: [TIERS[this.weapon.tier].color, "#fff"], speed: [15, 40], life: [0.1, 0.2], size: [1, 1.6], fade: true, angle: dir, spread: 0.8 });
    if (w.kind === "laser") {
      for (const a of angs) this._laser(a, w, dmg);
      if (!isEcho) {
        if (s.eLaser > 0 && w.form === "laser") for (let k = 1; k <= s.eLaser; k++) for (const sg of [-1, 1]) this._laser(dir + sg * 0.3 * k, w, dmg * 0.7); // 프리즘: 좌우로 갈라진 광선
        if (w.ticks > 1) this.echoes.push({ t: 0.09, dir, w: Object.assign({}, w, { ticks: 1 }) }); // 짧게 이어지는 광선
      }
      return;
    }
    const spd = w.speed || 220, boom = w.kind === "boomerang" || (s.boomerang && w.kind !== "orb"), mods = this._mods();
    for (const a of angs) g.spawnProj(p.x, p.y, a, spd, dmg, true, {
      owner: this, knock: w.knock, kind: w.kind, color: TIERS[this.weapon.tier].color,
      pierce: w.kind === "pierce" || boom || !!s.pierce, life: w.range / spd * (boom ? 3 : 1), radius: w.kind === "orb" ? 4.5 : 2.6,
      area: w.kind === "orb" ? (w.area || 24) * s.range : 0, boomerang: boom, range: w.range, speed: spd, bounces: mods.bounces, homing: mods.homing, split: mods.split, shape: mods.shape });
    if (!isEcho && s.eProj > 0 && w.form === "projectile") this._laser(dir, { range: w.range, width: 4, knock: 20 }, dmg * 0.5 * s.eProj); // 광선 분할기: 즉시 광선이 함께 나간다
  }
  _laser(a, w, dmg) { // 즉시 직선 공격
    const g = this.game, p = this.transform.position, cs = Math.cos(a), sn = Math.sin(a);
    const ex = p.x + cs * w.range, ey = p.y + sn * w.range, buf = [];
    let n = Physics.overlapCapsule(p.x, p.y, ex, ey, w.width / 2, PL.Enemy, buf); // 그려진 굵은 선 그대로
    for (let k = 0; k < n; k++) { const e = buf[k].data; if (e.dead || e.spawnDelay > 0) continue; e.damage(dmg, this, a, w.knock); this.applyHitEffects(e, dmg); }
    n = Physics.overlapCapsule(p.x, p.y, ex, ey, w.width / 2, PL.Obstacle, buf); // 직선 위의 상자·통
    for (let k = 0; k < n; k++) { const o = buf[k].data; if (o.destructible && !o.dead) o.damage(Math.max(1, Math.round(dmg / 2)), this, false); }
    const go = g.App.create("laser"); go.transform.setPosition(p.x, p.y); go.transform.rotation = a; let t = 0;
    go.addComponent(new DrawRenderer(ctx => { ctx.globalAlpha = 1 - t / 0.12; ctx.strokeStyle = TIERS[this.weapon.tier].color; ctx.lineWidth = w.width * 0.7; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(w.range, 0); ctx.stroke(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(w.range, 0); ctx.stroke(); }, w.range + 10, { order: 8 }));
    go.addComponent(new (class extends Component { update(dt) { t += dt; if (t > 0.12) go.destroy(); } })());
  }
  hit(n, fromX, fromY, kb = 120) {
    if (!this.alive || this.invuln > 0) return;
    const g = this.game, s = this.stats, p = this.transform.position;
    if (Math.random() < Math.min(0.6, s.dodge)) { // 회피 부적
      this.invuln = 0.4; if (s.dodgeShock) g.shockwave(p.x, p.y, 40, 3 * s.dodgeShock, 160, this); g.fx.emit(p.x, p.y, { count: 6, colors: ["#fff", this.color], speed: [20, 50], life: [0.2, 0.4], size: [1, 1.6], fade: true }); return;
    }
    if (this.shield > 0) { // 보호막: 한 번 맞아도 무효
      this.shield--; this.invuln = 0.6; this.draw.flash = 0.05; g.fx.emit(p.x, p.y, { count: 8, colors: ["#80deea", "#fff"], speed: [20, 60], life: [0.2, 0.4], size: [1, 1.8], fade: true }); SFX.play("block"); this.fire("shieldBreak"); return;
    }
    this.hp -= n; this.invuln = 1.0 + s.invuln + this.allyInv; this.draw.flash = 0.1; this.hitThisRoom = true; this.hurtT = 3; this.fire("damaged", n);
    Events.emit("hero.hit", { hero: this }); SFX.play("hurt");
    const a = Math.atan2(p.y - fromY, p.x - fromX);
    this.kx = Math.cos(a) * kb; this.ky = Math.sin(a) * kb; this.swing = null;
    g.cam.shake(3, 0.25);
    g.fx.emit(p.x, p.y, { count: 12, colors: [this.color, "#fff"], speed: [30, 90], life: [0.3, 0.6], size: [1, 2.5], fade: true });
    if (s.thorns) { const buf = [], n = Physics.overlapCircle(p.x, p.y, 34, PL.Enemy, buf); for (let k = 0; k < n; k++) { const e = buf[k].data; if (e.dead || e.spawnDelay > 0) continue; const ep = e.transform.position; e.damage(2 * s.thorns, this, Math.atan2(ep.y - p.y, ep.x - p.x), 170); } } // 가시 갑옷
    if (this.hp <= 0) this.die();
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  die() {
    const g = this.game, p = this.transform.position;
    if (this.stats.extraLives > 0) { // 앙크: 부활
      this.stats.extraLives--; this.hp = Math.ceil(this.maxHp / 2); this.invuln = 2.5;
      g.fx.emit(p.x, p.y, { count: 30, colors: ["#fff59d", "#fff"], speed: [30, 110], life: [0.4, 0.8], size: [1, 2.5], fade: true });
       return;
    }
    this.alive = false; this.hp = 0; this.swing = null; this.echoes = [];
    g.fx.emit(p.x, p.y, { count: 28, colors: [this.color, "#fff"], speed: [20, 120], life: [0.4, 0.9], size: [1, 3], fade: true });
  }
  revive(hp) { this.alive = true; this.hp = Math.min(hp, this.maxHp); this.invuln = 1.5; this.draw.flash = 0; this.kx = this.ky = 0; }
}
