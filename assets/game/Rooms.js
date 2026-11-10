// 방 레이아웃: 지형지물을 "아무 데나 몇 개" 흩뿌리지 않고, 의도된 방 설계(템플릿)를 골라 놓는다.
//   · 칸(400x225) 하나에 쓰는 템플릿(CELL_TPL) — 큰 방(2~4칸)은 칸마다 하나씩 고르거나, 방 전체에 쓰는 템플릿(ROOM_TPL)을 쓴다
//   · 보스 방 전용 템플릿(BOSS_TPL)
//   · 모든 템플릿은 좌우/상하 뒤집기(flip)와 매개변수(개수·생략 확률)로 조금씩 달라진다
// 보장: 문 앞(레인)·칸 사이 통로·보스 등장 자리는 비워 두고, 만든 뒤 격자 flood fill로 "문↔문↔통로↔보스 자리"가 모두 이어지는지
//       (적 크기만큼 여유를 두고) 검사한다. 실패하면 다른 템플릿으로 다시 만들고, 그래도 안 되면 거의 빈 방이 된다.
// 결과(room.layout): { obs[], zones[](적 등장 구역), bossSpawn, grid(도달 가능 격자), names[] }
//   generateObstacles(room, floor)가 layout을 만들어 room.layout에 붙이고 obs 배열을 돌려준다 (Game.enterRoom이 호출).
const CELL_HX = CELL_W / 2, CELL_HY = CELL_H / 2;
const DOOR_DEPTH = 38, DOOR_HALF = 44, LANE_DEPTH = 50, LINK_HALF = 30; // 문 앞 레인(안쪽으로 38 깊이, 폭 88) / 칸 사이 통로(양쪽 50 깊이, 폭 60)
const OBS_HP = { pillar: 999, wall: 999, rock: 1, crate: 3, barrel: 1, altar: 999, machine: 999 };
const WALK_R = 6;                                            // 플레이어 몸 반지름
const CLEAR_NORMAL = 10.5, CLEAR_BOSS = 21;                  // 검사에 쓰는 여유: 일반 적(반지름 ≤10) / 보스(≤20)
const rndr = (a, b) => a + Math.random() * (b - a);
const rndi = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffled = arr => arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(p => p[1]);

class LayoutBuilder {
  constructor(room, geo, floor, opts = {}) {
    this.room = room; this.geo = geo; this.floor = floor; this.W = geo.w; this.H = geo.h; this.cells = geo.cells;
    this.dropped = 0; this.obs = []; this.zones = []; this.lanes = []; this.checks = []; this.entries = []; this.names = []; this.spikes = null;
    this.ox = 0; this.oy = 0; this.fx = 1; this.fy = 1; this.clear = opts.clear || CLEAR_NORMAL; this.bossSpawn = null;
    const has = (dx, dy) => this.cells.some(c => c.dx === dx && c.dy === dy);
    this.has = has;
    const owner = this.cells.find(c => c.dx === 0 && c.dy === 0) || this.cells[0], doors = Object.keys(room.nb || {});
    const V = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };
    const doorSet = new Set(doors); if (room.type === "start") doorSet.add("S"); // 시작 방은 문이 없어도 아래쪽에서 시작한다
    for (const d of doorSet) {
      const [vx, vy] = V[d], cx = owner.x + vx * (CELL_HX - DOOR_DEPTH / 2), cy = owner.y + vy * (CELL_HY - DOOR_DEPTH / 2);
      const hw = vx ? DOOR_DEPTH / 2 : DOOR_HALF, hh = vy ? DOOR_DEPTH / 2 : DOOR_HALF;
      this.lanes.push({ x: cx, y: cy, hw, hh }); const px = owner.x + vx * (CELL_HX - 24), py = owner.y + vy * (CELL_HY - 24);
      this.checks.push({ x: px, y: py }); if (doors.includes(d) || room.type === "start") this.entries.push({ x: px, y: py });
    }
    for (const a of this.cells) for (const [dx, dy] of [[1, 0], [0, 1]]) { // 칸 사이 통로
      const b = this.cells.find(c => c.dx === a.dx + dx && c.dy === a.dy + dy); if (!b) continue;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      this.lanes.push({ x: mx, y: my, hw: dx ? LANE_DEPTH : LINK_HALF, hh: dy ? LANE_DEPTH : LINK_HALF }); this.checks.push({ x: mx, y: my });
    }
    this.owner = owner;
    if (room.type === "boss") { // 보스 등장 자리: 들어오는 문(소유 칸)에서 가장 먼 칸의 위쪽
      let far = owner, fd = -1; for (const c of this.cells) { const d = Math.abs(c.dx) + Math.abs(c.dy); if (d > fd) { fd = d; far = c; } }
      const bx = far.x, by = this.cells.length > 1 ? far.y + 14 : far.y + CELL_HY - 50;
      this.bossSpawn = { x: bx, y: by }; this.lanes.push({ x: bx, y: by, hw: 56, hh: 56 }); this.checks.push({ x: bx, y: by });
    }
  }
  // 이후 add/zone 좌표는 (cx,cy)를 원점으로 하고 fx,fy(±1)로 뒤집은 "틀" 기준
  frame(cx, cy, fx = 1, fy = 1) { this.ox = cx; this.oy = cy; this.fx = fx; this.fy = fy; return this; }
  _inCells(x, y) { for (const c of this.cells) if (Math.abs(x - c.x) <= CELL_HX && Math.abs(y - c.y) <= CELL_HY) return true; return false; }
  _fits(X, Y, w, h) { const a = w / 2, b = h / 2; return this._inCells(X, Y) && this._inCells(X - a, Y - b) && this._inCells(X + a, Y - b) && this._inCells(X - a, Y + b) && this._inCells(X + a, Y + b); }
  hitsLane(X, Y, w, h, m = 2) { for (const l of this.lanes) if (Math.abs(l.x - X) < l.hw + w / 2 + m && Math.abs(l.y - Y) < l.hh + h / 2 + m) return true; return false; }
  raw(kind, X, Y, w, h, hp) { if (!this._fits(X, Y, w, h)) return null; const o = { kind, x: X, y: Y, w, h, hp: hp ?? OBS_HP[kind] ?? 1 }; this.obs.push(o); return o; }
  add(kind, x, y, w, h, hp) { const X = this.ox + x * this.fx, Y = this.oy + y * this.fy; if (this.hitsLane(X, Y, w, h)) { this.dropped++; return null; } const o = this.raw(kind, X, Y, w, h, hp); if (!o) this.dropped++; return o; }
  P(x, y) { return this.add("pillar", x, y, 26, 26); }
  WH(x, y, len) { return this.add("wall", x, y, len, 26); }
  WV(x, y, len) { return this.add("wall", x, y, 26, len); }
  RK(x, y) { return this.add("rock", x, y, 34, 28); }
  CR(x, y) { return this.add("crate", x, y, 22, 22); }
  BR(x, y) { return this.add("barrel", x, y, 22, 22); }
  clump(x, y) { for (const [a, b] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) this.CR(x + a, y + b); }  // 상자 4개 뭉치
  zone(x, y, w, h, wt = 1) { this.zones.push({ x: this.ox + x * this.fx, y: this.oy + y * this.fy, hw: w / 2, hh: h / 2, wt }); }
  // 사각 고리 벽 (RX,RY: 바깥 벽 중심까지 반폭). gaps: 변마다 틈 중심의 치우친 정도(null이면 그 변은 막힘), 틈 폭 44
  ring(RX, RY, gaps) {
    const GW = 22, seg = (a, b, fn) => { if (b - a > 4) fn((a + b) / 2, b - a); };
    const side = (g, lo, hi, fn) => { if (g === null || g === undefined) { fn((lo + hi) / 2, hi - lo); return; } seg(lo, Math.max(lo, Math.min(hi, g - GW)), fn); seg(Math.min(hi, Math.max(lo, g + GW)), hi, fn); };
    side(gaps.N, -RX - 13, RX + 13, (c, l) => this.WH(c, RY, l)); side(gaps.S, -RX - 13, RX + 13, (c, l) => this.WH(c, -RY, l));
    side(gaps.E, -RY + 13, RY - 13, (c, l) => this.WV(RX, c, l)); side(gaps.W, -RY + 13, RY - 13, (c, l) => this.WV(-RX, c, l));
  }
}

// ── 미로: 통로 36, 벽 22, 바깥은 열린 테두리. 완전 미로에서 벽을 조금 더 허물어 고리를 만든다 ─────────────
function buildMaze(L, bx, by, bw, bh) {
  const CWD = 36, WT = 22, PITCH = CWD + WT, oddFloor = v => { let n = Math.floor(v); if (n % 2 === 0) n--; return n; };
  const cols = oddFloor((bw - 52 + WT) / PITCH), rows = oddFloor((bh - 52 + WT) / PITCH); if (cols < 3 || rows < 3) return false;
  const tw = cols * CWD + (cols - 1) * WT, th = rows * CWD + (rows - 1) * WT, sx = bx - tw / 2, sy = by - th / 2, TW = 2 * cols - 1, TH = 2 * rows - 1;
  const ti = (i, j) => j * TW + i, solid = new Uint8Array(TW * TH);
  const cellC = (c, r) => [sx + c * PITCH + CWD / 2, sy + r * PITCH + CWD / 2];
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) if ((i & 1) || (j & 1)) solid[ti(i, j)] = 1;          // 벽과 기둥
  const vis = new Uint8Array(cols * rows), voidC = (c, r) => { const [x, y] = cellC(c, r); return !L._inCells(x, y); };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (voidC(c, r)) vis[r * cols + c] = 1;           // 빈 칸(L자)은 건너뜀
  let sc = -1, sr = -1; for (let r = 0; r < rows && sc < 0; r++) for (let c = 0; c < cols; c++) if (!vis[r * cols + c]) { sc = c; sr = r; break; }
  if (sc < 0) return false;
  const stack = [[sc, sr]]; vis[sr * cols + sc] = 1;
  while (stack.length) {
    const [c, r] = stack[stack.length - 1], opts = [];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr; if (nc >= 0 && nr >= 0 && nc < cols && nr < rows && !vis[nr * cols + nc]) opts.push([nc, nr, dc, dr]); }
    if (!opts.length) { stack.pop(); continue; }
    const [nc, nr, dc, dr] = pickOne(opts); vis[nr * cols + nc] = 1; solid[ti(2 * c + dc, 2 * r + dr)] = 0; stack.push([nc, nr]);
  }
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) if (((i & 1) !== (j & 1)) && solid[ti(i, j)] && Math.random() < 0.12) solid[ti(i, j)] = 0; // 고리 만들기
  const off = i => Math.floor(i / 2) * PITCH + ((i & 1) ? CWD : 0), tx = i => sx + off(i), ty = j => sy + off(j), tl = i => (i & 1) ? WT : CWD;
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) { // 통로(레인) 위의 벽은 허문다
    if (!solid[ti(i, j)]) continue; const w = tl(i), h = tl(j);
    if (L.hitsLane(tx(i) + w / 2, ty(j) + h / 2, w, h, 1)) solid[ti(i, j)] = 0;
  }
  const used = new Uint8Array(TW * TH);
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {            // 직사각형으로 합치기 (세로 방향으로 늘림)
    if (!solid[ti(i, j)] || used[ti(i, j)]) continue;
    let i1 = i; while (i1 + 1 < TW && solid[ti(i1 + 1, j)] && !used[ti(i1 + 1, j)]) i1++;
    let j1 = j; for (;;) { const nj = j1 + 1; if (nj >= TH) break; let ok = true; for (let k = i; k <= i1; k++) if (!solid[ti(k, nj)] || used[ti(k, nj)]) { ok = false; break; } if (!ok) break; j1 = nj; }
    for (let b = j; b <= j1; b++) for (let a = i; a <= i1; a++) used[ti(a, b)] = 1;
    const x0 = tx(i), x1 = tx(i1) + tl(i1), y0 = ty(j), y1 = ty(j1) + tl(j1);
    L.raw("wall", (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0);
  }
  return true;
}
