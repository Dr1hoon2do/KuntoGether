// 물리 레이어 (KuntoGame Physics). Solid = 캐릭터·탄이 부딪히는 것 (방 벽 + 지형지물)
const PL = { Wall: Physics.layer("Wall"), Obstacle: Physics.layer("Obstacle"), Pit: Physics.layer("Pit"), Hero: Physics.layer("Hero"), Enemy: Physics.layer("Enemy"), EProj: Physics.layer("EProj"), Pickup: Physics.layer("Pickup") };
PL.Solid = PL.Wall | PL.Obstacle | PL.Pit; // Pit(구덩이): 걸어서는 못 지나가지만 탄은 지나간다
const ROCK_R = 9; // 바위의 모서리 반지름 (그림과 충돌 모양이 같다)
// 지형지물: 움직임과 탄을 막는다.
//   pillar : 기둥(안 부서짐)           wall : 긴 기둥(안 부서짐, 엄폐용)
//   rock   : 바위 — 폭발(폭탄·폭발 통·폭발 구슬)로만 부서짐
//   crate  : 상자 — 아무 공격으로 부서짐, 가끔 코인
//   barrel : 폭발 통 — 부서지면 주변에 폭발(적·플레이어 모두 피해, 바위·상자도 연쇄 파괴)
//   pit    : 구덩이 — 캐릭터는 못 지나가고 탄은 지나간다 (벽과 같이 타일맵에서 큰 직사각형으로 합쳐 만든다)
//   void   : L자 방의 빈 칸(보이지 않는 벽)
//   altar  : 희생방의 제단(원, 안 부서짐) · machine : 도박방의 기계(상자꼴, 안 부서짐) — 동작은 Specials.js
// 지형은 타일맵(TileMap.js)에서 만들어진다: 한 타일 = 25 (플레이어 지름 12의 2배). 벽·기둥·구덩이는 타일맵을 구울 때 같이 그려져서(drawStaticTiles) 여기서는 충돌만 맡는다.
class Obstacle extends Component {
  constructor(game, d) {
    super();
    this.game = game; this.kind = d.kind; this.w = d.w; this.h = d.h; this.hp = this.maxHp = d.hp ?? 1; this.dead = false; this.flash = 0;
    this.seed = Math.random() * 100;
  }
  get destructible() { return this.kind === "crate" || this.kind === "barrel" || this.kind === "rock"; }
  get solidOnly() { return this.kind === "pillar" || this.kind === "wall" || this.kind === "void" || this.kind === "altar" || this.kind === "machine" || this.kind === "pit" || this.kind === "crack"; } // 부서지지 않는 종류
  get baked() { return this.kind === "pillar" || this.kind === "wall" || this.kind === "pit" || this.kind === "void"; } // 방 바닥 캔버스에 구워 그려지는 종류 (따로 안 그린다)
  setup() {
    if (!this.baked) this.draw = this.gameObject.addComponent(new DrawRenderer((ctx, r) => this._draw(ctx, r), Math.max(this.w, this.h) + 6, { order: 2 }));
    const o = { layer: this.kind === "pit" ? "Pit" : "Obstacle", body: "static", data: this }; // 충돌 모양 = 그려지는 모양
    this.col = this.gameObject.addComponent(this.kind === "barrel" || this.kind === "altar" ? Collider2D.circle(this.w / 2, o) : this.kind === "rock" ? Collider2D.rbox(this.w, this.h, ROCK_R, o) : Collider2D.box(this.w, this.h, o));
  }
  data() { const p = this.transform.position; return { kind: this.kind, w: this.w, h: this.h, hp: this.hp, x: p.x, y: p.y }; }
  update(dt) { if (this.flash > 0) this.flash -= dt; }
  _draw(ctx) {
    const w = this.w, h = this.h, hw = w / 2, hh = h / 2, hit = this.flash > 0, cracked = this.maxHp > 1 && this.hp < this.maxHp;
    if (this.kind === "void") return;
    ctx.fillStyle = "#0000004d"; // 그림자: 모양을 따라가는 타원/사각 (검은 네모 배경이 보이지 않게)
    if (this.kind === "rock" || this.kind === "barrel") { ctx.beginPath(); ctx.ellipse(1, -hh * 0.55, hw * 0.95, hh * 0.45, 0, 0, 7); ctx.fill(); }
    else ctx.fillRect(-hw + 1, -hh - 1.5, w, 3.5);
    if (this.kind === "pillar" || this.kind === "wall") {
      ctx.fillStyle = hit ? "#fff" : "#5d5d6b"; ctx.fillRect(-hw, -hh, w, h); ctx.fillStyle = "#7d7d8c"; ctx.fillRect(-hw, hh - 4, w, 4); ctx.fillStyle = "#6b6b7a"; ctx.fillRect(-hw + 3, -hh + 3, w - 6, h - 9);
      ctx.strokeStyle = "#2c2c36"; ctx.lineWidth = 1; ctx.strokeRect(-hw, -hh, w, h);
    } else if (this.kind === "crack") { // 비밀방 입구: 벽인데 금이 가 있다 (맞으면 하얗게 번쩍이고 금이 커진다. 깨지면 문 틈이 열린다)
      const k = 1 - Math.max(0, (this.game.cur && this.game.cur.secretHp) ?? 12) / 12, v = w > h;
      ctx.fillStyle = hit ? "#fff" : "#5d5d6b"; ctx.fillRect(-hw, -hh, w, h); ctx.fillStyle = hit ? "#fff" : "#6b6b7a"; ctx.fillRect(-hw + 1, -hh + 1, w - 2, h - 6); ctx.fillStyle = "#7d7d8c"; ctx.fillRect(-hw, hh - 5, w, 5);
      ctx.strokeStyle = "#2c2c36"; ctx.lineWidth = 1; ctx.strokeRect(-hw + 0.5, -hh + 0.5, w - 1, h - 1);
      ctx.strokeStyle = hit ? "#444" : "#202026"; ctx.lineWidth = 1.2; ctx.beginPath(); const L = (v ? w : h) * 0.3, s2 = 1 + k * 0.8; // 금: 가운데에서 갈라져 나가는 선
      ctx.moveTo(0, -hh * 0.2); ctx.lineTo(2 * s2, -hh * 0.7 * s2); ctx.lineTo(-1 * s2, -hh * 1.0); ctx.moveTo(0, -hh * 0.2); ctx.lineTo(-3 * s2, hh * 0.3); ctx.lineTo(1 * s2, hh * 0.8 * s2); ctx.moveTo(-3 * s2, hh * 0.3); ctx.lineTo(-6 * s2, hh * 0.45); ctx.stroke();
      ctx.strokeStyle = "#a9a9b866"; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(1, -hh * 0.18); ctx.lineTo(3 * s2, -hh * 0.65 * s2); ctx.stroke();
    } else if (this.kind === "rock") {
      const rr = ROCK_R; // 둥근 상자: 충돌 모양과 똑같다
      ctx.fillStyle = hit ? "#fff" : "#7b6a58"; ctx.beginPath();
      ctx.moveTo(-hw + rr, -hh); ctx.arc(hw - rr, -hh + rr, rr, -Math.PI / 2, 0); ctx.arc(hw - rr, hh - rr, rr, 0, Math.PI / 2); ctx.arc(-hw + rr, hh - rr, rr, Math.PI / 2, Math.PI); ctx.arc(-hw + rr, -hh + rr, rr, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#3e342a"; ctx.lineWidth = 1; ctx.stroke(); ctx.strokeStyle = "#a08c76"; ctx.beginPath(); ctx.moveTo(-hw * 0.4, -hh * 0.3); ctx.lineTo(hw * 0.1, -hh * 0.5); ctx.moveTo(hw * 0.2, hh * 0.35); ctx.lineTo(hw * 0.55, hh * 0.1); ctx.stroke();
    } else if (this.kind === "altar") { // 희생방 제단: 돌 받침 + 피 웅덩이 + 바친 횟수만큼 붉은 점
      const n = this.count || 0;
      ctx.fillStyle = "#3a2b30"; ctx.beginPath(); ctx.arc(0, 0, hw, 0, 7); ctx.fill(); ctx.strokeStyle = "#1c1216"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = "#6d1b2a"; ctx.beginPath(); ctx.arc(0, 0, hw * 0.62, 0, 7); ctx.fill();
      ctx.fillStyle = "#cfd8dc"; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + 0.3; ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.12) * hw * 0.5, Math.sin(a - 0.12) * hw * 0.5); ctx.lineTo(Math.cos(a + 0.12) * hw * 0.5, Math.sin(a + 0.12) * hw * 0.5); ctx.lineTo(Math.cos(a) * hw * 0.88, Math.sin(a) * hw * 0.88); ctx.fill(); } // 가시
      for (let i = 0; i < 8; i++) { ctx.fillStyle = i < n ? "#ff5252" : "#4a3a3f"; ctx.beginPath(); ctx.arc((i - 3.5) * 6, hh + 9, 2, 0, 7); ctx.fill(); }  // 바친 횟수 (글자 없이 점)
    } else if (this.kind === "machine") { // 도박방 기계: 몸통 + 릴 3개 (돌릴 때 깜빡임, 고장나면 어두움)
      const spin = this.spin > 0, dead = this.broken;
      ctx.fillStyle = hit ? "#fff" : dead ? "#3b3b3b" : "#8e2d2d"; ctx.fillRect(-hw, -hh, w, h); ctx.strokeStyle = "#2a0d0d"; ctx.lineWidth = 1; ctx.strokeRect(-hw, -hh, w, h);
      ctx.fillStyle = "#16120f"; ctx.fillRect(-hw + 3, -2, w - 6, 12);
      for (let i = 0; i < 3; i++) { ctx.fillStyle = dead ? "#555" : spin ? (Math.floor(performance.now() / 70 + i) % 2 ? "#ffee58" : "#ef5350") : ["#ffee58", "#ef5350", "#66bb6a"][i]; ctx.fillRect(-hw + 4 + i * ((w - 8) / 3), 0, (w - 8) / 3 - 2, 8); }
      ctx.fillStyle = dead ? "#444" : "#ffd54f"; ctx.fillRect(-hw + 5, hh - 7, w - 10, 3); ctx.fillStyle = "#222"; ctx.fillRect(hw, -4, 3, 10); ctx.beginPath(); ctx.arc(hw + 1.5, 8, 2.4, 0, 7); ctx.fill();
    } else if (this.kind === "crate") {
      ctx.fillStyle = hit ? "#fff" : "#a47532"; ctx.fillRect(-hw, -hh, w, h); ctx.strokeStyle = "#5a3d14"; ctx.lineWidth = 1; ctx.strokeRect(-hw, -hh, w, h);
      ctx.beginPath(); ctx.moveTo(-hw, -hh); ctx.lineTo(hw, hh); ctx.moveTo(hw, -hh); ctx.lineTo(-hw, hh); ctx.stroke();
    } else { // barrel
      ctx.fillStyle = hit ? "#fff" : "#c0392b"; ctx.beginPath(); ctx.arc(0, 0, hw, 0, 7); ctx.fill(); ctx.strokeStyle = "#5b1a12"; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = "#f5b7b1"; ctx.beginPath(); ctx.moveTo(-hw * 0.8, -3.5); ctx.lineTo(hw * 0.8, -3.5); ctx.moveTo(-hw * 0.8, 3.5); ctx.lineTo(hw * 0.8, 3.5); ctx.stroke();
      ctx.save(); ctx.scale(1, -1); ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("!", 0, 0); ctx.restore();
    }
    if (cracked) { ctx.strokeStyle = "#000a"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-hw * 0.5, -hh * 0.6); ctx.lineTo(0, 0); ctx.lineTo(hw * 0.3, hh * 0.5); ctx.stroke(); }
  }
  // n 피해. explosion=true면 바위도 부서진다.
  damage(n, by, explosion = false) {
    if (this.dead) return;
    if (this.solidOnly) return;
    if (this.kind === "rock" && !explosion) { this.flash = 0.05; return; }
    this.hp -= n; this.flash = 0.08; SFX.play("hit");
    if (this.hp <= 0) this.die(by);
  }
  die(by) {
    if (this.dead) return; this.dead = true;
    const g = this.game, p = this.transform.position;
    g.obstacles = g.obstacles.filter(o => o !== this); if (g.tiles) g.tiles.clearAt(p.x, p.y); // 타일맵에서도 사라진다
    g.fx.emit(p.x, p.y, { count: 10, colors: this.kind === "crate" ? ["#a47532", "#5a3d14"] : this.kind === "rock" ? ["#7b6a58", "#3e342a"] : ["#c0392b", "#ff8a65"], speed: [20, 70], life: [0.2, 0.45], size: [1, 2.2], fade: true });
    const cg = g.partySum("crateGold"); // 도토리: 상자·통을 부수면 코인 확정
    if (this.kind === "crate" && Math.random() < ECON.crate.coin) g.spawnCoin(p.x, p.y, g.rollCoinValue(0));
    else if (this.kind === "crate" && Math.random() < ECON.crate.key / (1 - ECON.crate.coin)) g.spawnKey(p.x, p.y);
    else if ((this.kind === "crate" || this.kind === "barrel") && cg > 0) g.spawnCoin(p.x, p.y, cg);
    this.gameObject.destroy();
    if (this.kind === "barrel") g.explode(p.x, p.y, 30, 5, 1, by);
  }
}

// 폭탄: 1초 뒤 폭발 (바위·상자·통 파괴, 적에게 큰 피해)
class Bomb extends Component {
  constructor(game, owner) { super(); this.game = game; this.owner = owner; this.t = 1.0; }
  setup() {
    this.gameObject.addComponent(new DrawRenderer(ctx => {
      ctx.fillStyle = Math.floor(this.t * 10) % 2 ? "#fff" : "#37474f"; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 7); ctx.fill();
      ctx.strokeStyle = "#ff8a65"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 4.5); ctx.lineTo(2, 7); ctx.stroke();
      ctx.strokeStyle = "#ff1744"; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(0, 0, 36, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    }, 40, { order: 3 }));
  }
  update(dt) { this.t -= dt; if (this.t <= 0) { const p = this.transform.position; this.game.explode(p.x, p.y, 36, 12 * (this.owner ? this.owner.stats.dmg : 1), 0, this.owner); this.gameObject.destroy(); } }
}
// (방 레이아웃 생성은 Rooms.js / RoomTemplates.js: generateObstacles)
