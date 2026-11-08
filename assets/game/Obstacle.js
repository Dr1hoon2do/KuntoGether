// 지형지물: 움직임과 탄을 막는다.
//   pillar : 기둥(안 부서짐)           wall : 긴 기둥(안 부서짐, 엄폐용)
//   rock   : 바위 — 폭발(폭탄·폭발 통·폭발 구슬)로만 부서짐
//   crate  : 상자 — 아무 공격으로 부서짐, 가끔 코인
//   barrel : 폭발 통 — 부서지면 주변에 폭발(적·플레이어 모두 피해, 바위·상자도 연쇄 파괴)
class Obstacle extends Component {
  constructor(game, d) {
    super();
    this.game = game; this.kind = d.kind; this.w = d.w; this.h = d.h; this.hp = this.maxHp = d.hp ?? 1; this.dead = false; this.flash = 0;
    this.seed = Math.random() * 100;
  }
  get destructible() { return this.kind === "crate" || this.kind === "barrel" || this.kind === "rock"; }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer((ctx, r) => this._draw(ctx, r), Math.max(this.w, this.h) + 6, { order: 2 }));
  }
  data() { const p = this.transform.position; return { kind: this.kind, w: this.w, h: this.h, hp: this.hp, x: p.x, y: p.y }; }
  update(dt) { if (this.flash > 0) this.flash -= dt; }
  _draw(ctx) {
    const w = this.w, h = this.h, hw = w / 2, hh = h / 2, hit = this.flash > 0, cracked = this.maxHp > 1 && this.hp < this.maxHp;
    ctx.fillStyle = "#0006"; ctx.fillRect(-hw + 1, -hh - 1.5, w, h); // 그림자
    if (this.kind === "pillar" || this.kind === "wall") {
      ctx.fillStyle = hit ? "#fff" : "#5d5d6b"; ctx.fillRect(-hw, -hh, w, h); ctx.fillStyle = "#7d7d8c"; ctx.fillRect(-hw, hh - 3, w, 3);
      ctx.strokeStyle = "#2c2c36"; ctx.lineWidth = 1; ctx.strokeRect(-hw, -hh, w, h);
    } else if (this.kind === "rock") {
      ctx.fillStyle = hit ? "#fff" : "#7b6a58"; ctx.beginPath();
      const n = 7; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, j = 0.78 + 0.22 * Math.sin(this.seed + i * 2.1); ctx.lineTo(Math.cos(a) * hw * j * 1.05, Math.sin(a) * hh * j * 1.05); } ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#3e342a"; ctx.lineWidth = 1; ctx.stroke(); ctx.strokeStyle = "#a08c76"; ctx.beginPath(); ctx.moveTo(-hw * 0.4, -hh * 0.3); ctx.lineTo(hw * 0.1, -hh * 0.5); ctx.stroke();
    } else if (this.kind === "crate") {
      ctx.fillStyle = hit ? "#fff" : "#a47532"; ctx.fillRect(-hw, -hh, w, h); ctx.strokeStyle = "#5a3d14"; ctx.lineWidth = 1; ctx.strokeRect(-hw, -hh, w, h);
      ctx.beginPath(); ctx.moveTo(-hw, -hh); ctx.lineTo(hw, hh); ctx.moveTo(hw, -hh); ctx.lineTo(-hw, hh); ctx.stroke();
    } else { // barrel
      ctx.fillStyle = hit ? "#fff" : "#c0392b"; ctx.beginPath(); ctx.arc(0, 0, hw, 0, 7); ctx.fill(); ctx.strokeStyle = "#5b1a12"; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = "#f5b7b1"; ctx.beginPath(); ctx.moveTo(-hw * 0.8, -2); ctx.lineTo(hw * 0.8, -2); ctx.moveTo(-hw * 0.8, 2); ctx.lineTo(hw * 0.8, 2); ctx.stroke();
      ctx.save(); ctx.scale(1, -1); ctx.fillStyle = "#fff"; ctx.font = "bold 6px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("!", 0, 0); ctx.restore();
    }
    if (cracked) { ctx.strokeStyle = "#000a"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-hw * 0.5, -hh * 0.6); ctx.lineTo(0, 0); ctx.lineTo(hw * 0.3, hh * 0.5); ctx.stroke(); }
  }
  // n 피해. explosion=true면 바위도 부서진다.
  damage(n, by, explosion = false) {
    if (this.dead) return;
    if (this.kind === "pillar" || this.kind === "wall") return;
    if (this.kind === "rock" && !explosion) { this.flash = 0.05; return; }
    this.hp -= n; this.flash = 0.08; SFX.play("hit");
    if (this.hp <= 0) this.die(by);
  }
  die(by) {
    if (this.dead) return; this.dead = true;
    const g = this.game, p = this.transform.position;
    g.obstacles = g.obstacles.filter(o => o !== this);
    g.fx.emit(p.x, p.y, { count: 10, colors: this.kind === "crate" ? ["#a47532", "#5a3d14"] : this.kind === "rock" ? ["#7b6a58", "#3e342a"] : ["#c0392b", "#ff8a65"], speed: [20, 70], life: [0.2, 0.45], size: [1, 2.2], fade: true });
    if (this.kind === "crate" && Math.random() < 0.35) g.spawnCoin(p.x, p.y, 1 + Math.floor(Math.random() * 2));
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

// 방 하나에 놓을 지형 데이터를 만든다. 문 앞·시작 위치·보스 등장 위치는 비워 두고, 서로 22 이상 떨어뜨려서 지나갈 틈을 남긴다.
function generateObstacles(room) {
  if (room.type === "treasure" || room.type === "shop") return [];
  const k = room.big ? ARENA.BIG : 1, W = ARENA.BASE_W * k, H = ARENA.BASE_H * k, hw = W / 2, hh = H / 2, area = k * k;
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  let count = room.type === "start" ? rnd(0, 2) : room.type === "boss" ? rnd(2, 4) : rnd(4, 7);
  count = Math.round(count * Math.pow(area, 0.85));
  const lanes = []; // 지나다녀야 하는 구역 (중심 x, y, 반폭 w, 반높이 h)
  for (const d of Object.keys(room.nb)) { const [dx, dy] = ({ N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] })[d]; lanes.push(dx ? { x: dx * (hw - 30), y: 0, w: 34, h: 26 } : { x: 0, y: dy * (hh - 30), w: 26, h: 34 }); }
  lanes.push({ x: 0, y: -hh + 26, w: 46, h: 30 }); // 처음 서는 곳(아래쪽 가운데)
  if (room.type === "boss") lanes.push({ x: 0, y: hh - 52, w: 50, h: 40 }); // 보스 등장 위치
  const kinds = room.type === "boss" || room.type === "start" ? ["pillar", "pillar", "wall", "rock"] : ["pillar", "pillar", "wall", "crate", "crate", "crate", "barrel", "rock"];
  const out = [], hit = (a, b, m) => Math.abs(a.x - b.x) < a.w / 2 + b.w + m && Math.abs(a.y - b.y) < a.h / 2 + b.h + m;
  for (let tries = 0; out.length < count && tries < 400; tries++) {
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const o = kind === "pillar" ? { kind, w: 14, h: 14, hp: 999 } : kind === "wall" ? (Math.random() < 0.5 ? { kind, w: 14, h: 34, hp: 999 } : { kind, w: 34, h: 14, hp: 999 }) :
              kind === "rock" ? { kind, w: 18, h: 16, hp: 1 } : kind === "crate" ? { kind, w: 13, h: 13, hp: 3 } : { kind, w: 12, h: 12, hp: 1 };
    o.x = (Math.random() * 2 - 1) * (hw - 30); o.y = (Math.random() * 2 - 1) * (hh - 30);
    const half = { x: o.x, y: o.y, w: o.w, h: o.h };
    if (lanes.some(l => Math.abs(l.x - o.x) < l.w + o.w / 2 && Math.abs(l.y - o.y) < l.h + o.h / 2)) continue;
    if (out.some(b => Math.abs(b.x - o.x) < (b.w + o.w) / 2 + 22 && Math.abs(b.y - o.y) < (b.h + o.h) / 2 + 22)) continue;
    out.push(o);
  }
  return out;
}
