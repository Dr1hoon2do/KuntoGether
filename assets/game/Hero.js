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
  }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer((ctx, r) => this._draw(ctx, r), 18, { order: 5 }));
  }
  // 아이템 효과가 반영된 현재 무기 능력치
  getWeapon() {
    const b = WEAPONS[this.weapon.id], t = TIERS[this.weapon.tier], s = this.stats, now = performance.now();
    let dmg = s.dmg * (b.ranged ? s.dmgRanged : s.dmgMelee);
    dmg *= 1 + s.berserk * (1 - Math.max(0, this.hp) / this.maxHp);
    if (s.noHitDmg && !this.hitThisRoom) dmg *= 1 + s.noHitDmg;       // 양파: 방에서 안 맞았다면
    if (s.heartBuff && this.heartBuffOn) dmg *= 1 + s.heartBuff;       // 뼈다귀: 하트를 먹었다면
    let spd = s.atkSpeed;
    if (s.moveAtk && this.moving) spd *= 1 + s.moveAtk;               // 운동화: 이동 중
    if (s.dashAtk && now - this.dashAt < 2000) spd *= 1 + s.dashAtk;  // 빨간 리본: 대시 직후
    if (s.fullHpAtk && this.hp >= this.maxHp) spd *= 1 + s.fullHpAtk; // 체력의 심장: HP 가득
    const arc = b.ranged ? b.arc : Math.min(360, (b.arc || 0) * (1 + s.arcMul)); // 쪼개진 막대: 근접 범위
    return { ...b, arc, dmg: b.dmg * t.mult * dmg, range: b.range * s.range, cd: b.cd / spd, knock: b.knock * s.knock, tier: this.weapon.tier };
  }
  get gold() { return this.game.gold; }            // 골드는 팀 전체가 공유한다
  set gold(v) { this.game.gold = v; }
  addGold(n) { return this.game.addGold(n); }
  giveItem(id) { this.items.push(id); PASSIVES[id].apply(this); }
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
    } else { ctx.fillStyle = this.color; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill(); ctx.globalAlpha = 0.6; }
    ctx.save(); ctx.scale(1, -1); ctx.fillStyle = this.alive ? "#fff" : "#aaa"; ctx.font = "bold 5.5px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.strokeStyle = "#000c"; ctx.lineWidth = 1.4; ctx.strokeText(this.nick, 0, -(this.radius + 5)); ctx.fillText(this.nick, 0, -(this.radius + 5)); ctx.restore();
  }
  update(dt) {
    if (!this.alive) return;
    const g = this.game, i = this.input, t = this.transform, s = this.stats;
    this.invuln -= dt; this.cd -= dt; this.dashCd -= dt; this.moveT -= dt; this.roomT += dt;
    if (this.active && this.active.cdLeft > 0) this.active.cdLeft = Math.max(0, this.active.cdLeft - dt);
    if (i.act && !this.prevAct) this.useActive();
    this.prevAct = i.act;
    this.draw.opacity = this.invuln > 0 && Math.floor(this.invuln * 14) % 2 ? 0.35 : 1;
    if (s.regen > 0) { this.regenT += dt; if (this.regenT >= 90 / s.regen) { this.regenT = 0; if (this.hp < this.maxHp) { this.heal(1); g.fx.emit(t.position.x, t.position.y, { count: 5, colors: ["#81c784", "#fff"], speed: [10, 30], life: [0.3, 0.5], size: [1, 2], fade: true }); } } }

    let mx = i.mx, my = i.my; const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    this.moving = ml > 0.2;
    if (ml > 0.15) this.facing = Math.atan2(my, mx);

    if (i.dash && !this.prevDash && this.dashCd <= 0 && this.dashT <= 0) { // 대시: 짧은 무적
      this.dashT = 0.16; this.dashCd = 0.7 * s.dashCd; this.invuln = Math.max(this.invuln, 0.2 + s.dashInvuln); this.dashAt = performance.now(); this.dashHit = new Set();
      this.dashDir = ml > 0.15 ? Math.atan2(my, mx) : this.facing;
      g.fx.emit(t.position.x, t.position.y, { count: 6, colors: [this.color, "#fff"], speed: [10, 40], life: [0.15, 0.3], size: [1, 2], fade: true });
    }
    this.prevDash = i.dash;

    const sprint = s.sprint && this.roomT < 5 ? 1 + s.sprint : 1; // 낡은 장화: 방에 들어간 직후
    let vx = mx * 82 * s.speed * sprint, vy = my * 82 * s.speed * sprint;
    if (this.dashT > 0) { this.dashT -= dt; vx = Math.cos(this.dashDir) * 230 * s.dashPower; vy = Math.sin(this.dashDir) * 230 * s.dashPower; }
    if (this.dashT > 0) { // 대시 중: 질풍의 띠(지나간 적에게 피해) · 깃털 장식(탄 제거)
      if (s.dashDmg) for (const e of g.enemies) { if (e.dead || e.spawnDelay > 0 || this.dashHit.has(e)) continue; const ep = e.transform.position; if (Math.hypot(ep.x - t.position.x, ep.y - t.position.y) < e.radius + 9) { this.dashHit.add(e); const dm = 3 * s.dmg * s.dashDmg; e.damage(dm, this, Math.atan2(ep.y - t.position.y, ep.x - t.position.x), 160); this.applyHitEffects(e, dm); } }
      if (s.dashCancel) g.cancelProjectiles(t.position.x, t.position.y, 18);
    }
    if (this.moveT > 0 && this.dashT <= 0) { vx *= this.moveMul; vy *= this.moveMul; } // 공격하는 동안 무기별로 조금 느려진다
    vx += this.kx; vy += this.ky; this.kx *= Math.max(0, 1 - 9 * dt); this.ky *= Math.max(0, 1 - 9 * dt);
    const p = t.position;
    const [ox, oy] = g.pushOut(p.x + vx * dt, p.y + vy * dt, this.radius); // 지형지물에 막힌다
    t.setPosition(Math.max(-ARENA.w / 2 + 7, Math.min(ARENA.w / 2 - 7, ox)), Math.max(-ARENA.h / 2 + 7, Math.min(ARENA.h / 2 - 7, oy)));

    for (let k = this.echoes.length - 1; k >= 0; k--) { // 연타·메아리 칼날의 추가 타격
      const e = this.echoes[k]; e.t -= dt;
      if (e.t <= 0) { this.echoes.splice(k, 1); g.spawnSlash(this, e.dir, e.w); this._strike(e.dir, e.w, true); }
    }
    if (this.swing) { this.swing.t -= dt; if (this.swing.t <= 0) { const sw = this.swing; this.swing = null; this._strike(sw.dir, sw.w, false); } }
    else if (i.atk && this.cd <= 0 && this.dashT <= 0) this._startSwing();
  }
  _startSwing() {
    const w = this.getWeapon(), g = this.game, p = this.transform.position;
    let dir = this.facing;
    if (Math.hypot(this.input.ax, this.input.ay) > 0.35) dir = Math.atan2(this.input.ay, this.input.ax); // 드래그로 직접 조준
    else { // 자동 조준
      let best = null, bd = w.ranged ? Math.min(w.range, 150) : w.range + 22;
      for (const e of g.enemies) { if (e.spawnDelay > 0) continue; const ep = e.transform.position, d = Math.hypot(ep.x - p.x, ep.y - p.y); if (d < bd) { bd = d; best = ep; } }
      if (best) dir = Math.atan2(best.y - p.y, best.x - p.x);
    }
    this.facing = dir;
    if (g.tryInteract(this)) { this.cd = 0.35; return; } // 아이템 앞에서 공격하면 획득·구매 (휘두르지는 않음)
    this.cd = w.cd; this.swing = { t: w.delay, dir, w };
    this.moveT = w.delay + (w.dur || 0.1); this.moveMul = w.move ?? 0.85;
    if (!w.ranged) { g.spawnSlash(this, dir, w); SFX.play("swing"); }
  }
  // 맞힌 적에게 붙는 아이템 효과: 화상·둔화·기절·폭발·흡혈 문양
  applyHitEffects(e, dmg) {
    const s = this.stats, g = this.game;
    e.applyStatus(s, this);
    if (s.explode) {
      const ep = e.transform.position; let any = false;
      for (const o of g.enemies) { if (o === e || o.dead || o.spawnDelay > 0) continue; const op = o.transform.position; if (Math.hypot(op.x - ep.x, op.y - ep.y) < 20 + o.radius) { o.damage(dmg * 0.4 * s.explode, this, Math.atan2(op.y - ep.y, op.x - ep.x), 60); any = true; } }
      g.fx.emit(ep.x, ep.y, { count: 8, colors: ["#ff8a65", "#fff59d"], speed: [30, 80], life: [0.15, 0.3], size: [1, 2], fade: true, area: 6 });
    }
    if (s.leech > 0) { this.leechN++; if (this.leechN >= 15 / s.leech) { this.leechN = 0; this.heal(1); } }
  }
  _strike(dir, w, isEcho) {
    if (w.ranged) return this._fire(dir, w, isEcho);
    const g = this.game, p = this.transform.position, s = this.stats;
    const crit = Math.random() < s.crit, dmg = w.dmg * (crit ? 2 + s.critDmg : 1), half = (w.arc * Math.PI / 180) / 2;
    if (crit && s.critReset) this.cd = 0; // 신속의 반지
    const inArc = (x, y, pad) => {
      const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
      if (d > w.range + pad) return false;
      return w.arc >= 360 || d < pad + 4 || angDiff(Math.atan2(dy, dx), dir) <= half;
    };
    let hit = 0;
    for (const e of g.enemies) {
      if (e.dead || e.spawnDelay > 0) continue;
      const ep = e.transform.position;
      if (inArc(ep.x, ep.y, e.radius)) { e.damage(dmg, this, Math.atan2(ep.y - p.y, ep.x - p.x), w.knock); this.applyHitEffects(e, dmg); hit++; }
    }
    for (const pr of g.projs) { // 근접 공격은 기본으로 범위 안의 적 탄을 지운다. 반사 거울이 있으면 되받아친다(근접 공격에만 적용)
      if (pr.fromPlayer || pr.gameObject.isDestroyed || pr.orbit) continue;
      const pp = pr.transform.position;
      if (!inArc(pp.x, pp.y, 4)) continue;
      if (s.deflect >= 2) { pr.owner = this; pr.reflect(this, dir); }
      else { g.fx.emit(pp.x, pp.y, { count: 4, colors: ["#fff", "#ff8a65"], speed: [20, 50], life: [0.15, 0.3], size: [1, 1.6], fade: true }); pr.gameObject.destroy(); SFX.play("block"); }
    }
    for (const o of g.obstacles.slice()) { // 상자·통은 부서진다 (바위는 폭발로만)
      if (!o.destructible) continue; const op = o.transform.position;
      if (inArc(op.x, op.y, Math.max(o.w, o.h) / 2)) { o.damage(Math.max(1, Math.round(dmg / 2)), this, false); hit++; }
    }
    if (!isEcho) {
      for (let b = 0; b < s.beam; b++) g.spawnProj(p.x, p.y, dir + (b - (s.beam - 1) / 2) * 0.25, 190, w.dmg * 0.5, true, { pierce: true, beam: true, life: 0.9, owner: this });
      for (let k = 1; k < (w.hits || 1); k++) this.echoes.push({ t: 0.1 * k, dir, w });
      if (Math.random() < s.doubleSwing) this.echoes.push({ t: 0.16, dir, w });
    }
    if (hit) g.cam.shake(w.knock > 150 ? 2.5 : 1.2, 0.1);
  }
  // 원거리 무기 발사
  _fire(dir, w, isEcho) {
    const g = this.game, p = this.transform.position, s = this.stats;
    const crit = Math.random() < s.crit, dmg = w.dmg * (crit ? 2 + s.critDmg : 1);
    if (crit && s.critReset) this.cd = 0;
    const n = (w.count || 1) + s.extraShots, spread = w.arc ? w.arc * Math.PI / 180 : 0.2 * (n - 1);
    const angs = Array.from({ length: n }, (_, i) => (n === 1 ? dir : dir + (i - (n - 1) / 2) * (spread / (n - 1))));
    SFX.play("shoot");
    g.fx.emit(p.x + Math.cos(dir) * 8, p.y + Math.sin(dir) * 8, { count: 3, colors: [TIERS[this.weapon.tier].color, "#fff"], speed: [15, 40], life: [0.1, 0.2], size: [1, 1.6], fade: true, angle: dir, spread: 0.8 });
    if (w.kind === "laser") { for (const a of angs) this._laser(a, w, dmg); return; }
    const spd = w.speed || 220;
    for (const a of angs) g.spawnProj(p.x, p.y, a, spd, dmg, true, {
      owner: this, knock: w.knock, kind: w.kind, color: TIERS[this.weapon.tier].color,
      pierce: w.kind === "pierce" || w.kind === "boomerang" || !!s.pierce, life: w.range / spd * (w.kind === "boomerang" ? 3 : 1), radius: w.kind === "orb" ? 4.5 : 2.6,
      area: w.kind === "orb" ? w.area * s.range : 0, boomerang: w.kind === "boomerang", range: w.range, speed: spd });
  }
  _laser(a, w, dmg) { // 즉시 직선 공격
    const g = this.game, p = this.transform.position, cs = Math.cos(a), sn = Math.sin(a);
    for (const e of g.enemies) {
      if (e.dead || e.spawnDelay > 0) continue;
      const ep = e.transform.position, dx = ep.x - p.x, dy = ep.y - p.y, along = dx * cs + dy * sn, perp = Math.abs(-dx * sn + dy * cs);
      if (along > 0 && along < w.range + e.radius && perp < w.width / 2 + e.radius) { e.damage(dmg, this, a, w.knock); this.applyHitEffects(e, dmg); }
    }
    for (const o of g.obstacles.slice()) { // 직선 위의 상자·통
      if (!o.destructible) continue; const op = o.transform.position, dx = op.x - p.x, dy = op.y - p.y, along = dx * cs + dy * sn, perp = Math.abs(-dx * sn + dy * cs);
      if (along > 0 && along < w.range && perp < w.width / 2 + Math.max(o.w, o.h) / 2) o.damage(Math.max(1, Math.round(dmg / 2)), this, false);
    }
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
    this.hp -= n; this.invuln = 1.0 + s.invuln; this.draw.flash = 0.1; this.hitThisRoom = true;
    Events.emit("hero.hit", { hero: this }); SFX.play("hurt");
    const a = Math.atan2(p.y - fromY, p.x - fromX);
    this.kx = Math.cos(a) * kb; this.ky = Math.sin(a) * kb; this.swing = null;
    g.cam.shake(3, 0.25);
    g.fx.emit(p.x, p.y, { count: 12, colors: [this.color, "#fff"], speed: [30, 90], life: [0.3, 0.6], size: [1, 2.5], fade: true });
    if (s.thorns) for (const e of g.enemies) { // 가시 갑옷
      if (e.dead || e.spawnDelay > 0) continue;
      const ep = e.transform.position;
      if (Math.hypot(ep.x - p.x, ep.y - p.y) < 34) e.damage(2 * s.thorns, this, Math.atan2(ep.y - p.y, ep.x - p.x), 170);
    }
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
