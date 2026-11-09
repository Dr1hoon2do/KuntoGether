// 물리 레이어 (KuntoGame Physics). Solid = 캐릭터·탄이 부딪히는 것 (방 벽 + 지형지물)
const PL = { Wall: Physics.layer("Wall"), Obstacle: Physics.layer("Obstacle"), Hero: Physics.layer("Hero"), Enemy: Physics.layer("Enemy"), EProj: Physics.layer("EProj"), Pickup: Physics.layer("Pickup") };
PL.Solid = PL.Wall | PL.Obstacle;
const ROCK_R = 9; // 바위의 모서리 반지름 (그림과 충돌 모양이 같다)
// 지형지물: 움직임과 탄을 막는다.
//   pillar : 기둥(안 부서짐)           wall : 긴 기둥(안 부서짐, 엄폐용)
//   rock   : 바위 — 폭발(폭탄·폭발 통·폭발 구슬)로만 부서짐
//   crate  : 상자 — 아무 공격으로 부서짐, 가끔 코인
//   barrel : 폭발 통 — 부서지면 주변에 폭발(적·플레이어 모두 피해, 바위·상자도 연쇄 파괴)
//   void   : L자 방의 빈 칸(보이지 않는 벽)
// 크기는 플레이어(지름 12)의 2~6배 — 탄막을 피해 숨거나 엄폐할 수 있을 만큼 크다.
class Obstacle extends Component {
  constructor(game, d) {
    super();
    this.game = game; this.kind = d.kind; this.w = d.w; this.h = d.h; this.hp = this.maxHp = d.hp ?? 1; this.dead = false; this.flash = 0;
    this.seed = Math.random() * 100;
  }
  get destructible() { return this.kind === "crate" || this.kind === "barrel" || this.kind === "rock"; }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer((ctx, r) => this._draw(ctx, r), Math.max(this.w, this.h) + 6, { order: 2 }));
    const o = { layer: "Obstacle", body: "static", data: this }; // 충돌 모양 = 그려지는 모양
    this.col = this.gameObject.addComponent(this.kind === "barrel" ? Collider2D.circle(this.w / 2, o) : this.kind === "rock" ? Collider2D.rbox(this.w, this.h, ROCK_R, o) : Collider2D.box(this.w, this.h, o));
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
    } else if (this.kind === "rock") {
      const rr = ROCK_R; // 둥근 상자: 충돌 모양과 똑같다
      ctx.fillStyle = hit ? "#fff" : "#7b6a58"; ctx.beginPath();
      ctx.moveTo(-hw + rr, -hh); ctx.arc(hw - rr, -hh + rr, rr, -Math.PI / 2, 0); ctx.arc(hw - rr, hh - rr, rr, 0, Math.PI / 2); ctx.arc(-hw + rr, hh - rr, rr, Math.PI / 2, Math.PI); ctx.arc(-hw + rr, -hh + rr, rr, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#3e342a"; ctx.lineWidth = 1; ctx.stroke(); ctx.strokeStyle = "#a08c76"; ctx.beginPath(); ctx.moveTo(-hw * 0.4, -hh * 0.3); ctx.lineTo(hw * 0.1, -hh * 0.5); ctx.moveTo(hw * 0.2, hh * 0.35); ctx.lineTo(hw * 0.55, hh * 0.1); ctx.stroke();
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
    if (this.kind === "pillar" || this.kind === "wall" || this.kind === "void") return;
    if (this.kind === "rock" && !explosion) { this.flash = 0.05; return; }
    this.hp -= n; this.flash = 0.08; SFX.play("hit");
    if (this.hp <= 0) this.die(by);
  }
  die(by) {
    if (this.dead) return; this.dead = true;
    const g = this.game, p = this.transform.position;
    g.obstacles = g.obstacles.filter(o => o !== this);
    g.fx.emit(p.x, p.y, { count: 10, colors: this.kind === "crate" ? ["#a47532", "#5a3d14"] : this.kind === "rock" ? ["#7b6a58", "#3e342a"] : ["#c0392b", "#ff8a65"], speed: [20, 70], life: [0.2, 0.45], size: [1, 2.2], fade: true });
    const cg = g.partySum("crateGold"); // 도토리: 상자·통을 부수면 코인 확정
    if (this.kind === "crate" && Math.random() < 0.35) g.spawnCoin(p.x, p.y, 1 + Math.floor(Math.random() * 2));
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

// 방 하나에 놓을 지형 데이터를 만든다. 문 앞·시작 위치·보스 등장 위치는 비워 두고, 서로 26 이상 떨어뜨려서 지나갈 틈을 남긴다.
// 큰 방(여러 칸)은 칸 수만큼 더 많이 놓는다.
function generateObstacles(room) {
  if (room.type === "treasure" || room.type === "shop") return [];
  const geo = roomGeo(room), nCells = geo.cells.length, CW = ARENA.BASE_W, CH = ARENA.BASE_H;
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  let count = room.type === "start" ? rnd(0, 2) : room.type === "boss" ? rnd(2, 3) : rnd(3, 5);
  count = Math.round(count * Math.pow(nCells, 0.9));
  const lanes = []; // 지나다녀야 하는 구역 (중심 x, y, 반폭 w, 반높이 h)
  for (const d of Object.keys(room.nb)) { const x = geo.ox + ({ N: 0, S: 0, E: 1, W: -1 })[d] * (CW / 2 - 40), y = geo.oy + ({ N: 1, S: -1, E: 0, W: 0 })[d] * (CH / 2 - 40); lanes.push(d === "N" || d === "S" ? { x, y, w: 48, h: 44 } : { x, y, w: 44, h: 48 }); }
  lanes.push({ x: geo.ox, y: geo.oy - CH / 2 + 34, w: 64, h: 40 }); // 처음 서는 곳(소유 칸 아래쪽 가운데)
  if (room.type === "boss") lanes.push({ x: geo.ox, y: geo.oy + CH / 2 - 56, w: 60, h: 48 }); // 보스 등장 위치
  const kinds = room.type === "boss" || room.type === "start" ? ["pillar", "pillar", "wall", "rock"] : ["pillar", "pillar", "wall", "crate", "crate", "crate", "barrel", "rock"];
  const gap = room.type === "boss" ? 46 : 26; // 보스는 덩치가 커서 지나갈 틈을 더 넓게
  const out = [];
  for (let tries = 0; out.length < count && tries < 600; tries++) {
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const o = kind === "pillar" ? { kind, w: 26, h: 26, hp: 999 } : kind === "wall" ? (Math.random() < 0.5 ? { kind, w: 26, h: 70, hp: 999 } : { kind, w: 70, h: 26, hp: 999 }) :
              kind === "rock" ? { kind, w: 34, h: 28, hp: 1 } : kind === "crate" ? { kind, w: 22, h: 22, hp: 3 } : { kind, w: 22, h: 22, hp: 1 };
    const c = geo.cells[Math.floor(Math.random() * geo.cells.length)];
    o.x = c.x + (Math.random() * 2 - 1) * (CW / 2 - 50); o.y = c.y + (Math.random() * 2 - 1) * (CH / 2 - 50);
    if (lanes.some(l => Math.abs(l.x - o.x) < l.w + o.w / 2 && Math.abs(l.y - o.y) < l.h + o.h / 2)) continue;
    if (out.some(b => Math.abs(b.x - o.x) < (b.w + o.w) / 2 + gap && Math.abs(b.y - o.y) < (b.h + o.h) / 2 + gap)) continue;
    out.push(o);
  }
  return out;
}
