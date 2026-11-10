// 방 레이아웃 생성 (타일맵 위에서). 시드 난수로 만들고(같은 시드 = 같은 방), 만든 뒤 flood fill로 "막힌 길이 없는지" 검사한다.
//   (A) 큰 구성(archetype): 방의 뼈대 — 벽 고리·미로·구덩이 호수·기둥 숲 같은 큰 구조를 타일 격자에 만든다. 칸(16x9)용 A_CELL, 큰 방 전체용 A_ROOM, 보스 방용 A_BOSS
//   (B) 작은 구성(stamp set): A가 만든 빈 곳에 상자 더미·통 무리·바위줄·기둥 쌍·구덩이 같은 작은 도장(stamp)을 가중치 표대로 찍는다 (B_SETS)
//   (C) 적 등장 구역(zones): A가 알려준 구역(가운데 아레나 등)을 가중치와 함께 레이아웃에 붙인다 — Game._spawnPos가 쓴다
//   모든 구성은 매개변수(크기·개수·틈 위치)가 무작위로 달라지고, 좌우/상하로 뒤집히거나 180° 돌려서(두 번 뒤집기) 쓰인다.
// 검사(validate): ① 문 앞·칸 사이 통로·보스 자리를 항상 비워 두고(res) ② 한 문에서 출발해 모든 문·통로·보스 자리·보상 자리에 닿는지(부서지는 상자·통도 막힌 것으로 본다)
//   ③ 보스 방은 덩치(2x2 타일)가 지나갈 수 있는지 ④ 닿을 수 없는 구멍(주머니)은 벽으로 메우고, 너무 크면 다시 만든다 ⑤ 열린 칸 비율 최소치.
//   실패하면 다른 시드(attempt)로 최대 14번 다시 만들고, 그래도 안 되면 안전한 빈 방(fallback).
const MIN_OPEN = 0.5, MIN_OPEN_BOSS = 0.6;

// ── 보기(View): 칸 또는 방 전체를 "위쪽이 r=0, 오른쪽이 c 증가"인 지역 좌표로 보고, 뒤집기(fx,fy)를 적용해 타일 격자에 쓴다 ───────────────
class TView {
  constructor(map, i0, j0, cols, rows, fx = false, fy = false) { this.map = map; this.i0 = i0; this.j0 = j0; this.cols = cols; this.rows = rows; this.fx = fx; this.fy = fy; }
  gi(c) { return this.i0 + (this.fx ? this.cols - 1 - c : c); }
  gj(r) { return this.j0 + this.rows - 1 - (this.fy ? this.rows - 1 - r : r); }
  has(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }
  get(c, r) { return this.has(c, r) ? this.map.get(this.gi(c), this.gj(r)) : T.WALL; }
  inside(c, r) { return this.has(c, r) && this.map.inside(this.gi(c), this.gj(r)); }
  free(c, r) { return this.has(c, r) && this.map.free(this.gi(c), this.gj(r)) && !this.map.res[this.gj(r) * this.map.cols + this.gi(c)]; }
  set(c, r, v) { c = Math.round(c); r = Math.round(r); if (this.has(c, r) && this.map.inside(this.gi(c), this.gj(r))) this.map.set(this.gi(c), this.gj(r), v); }
  rect(c0, r0, c1, r1, v) { if (c0 > c1) [c0, c1] = [c1, c0]; if (r0 > r1) [r0, r1] = [r1, r0]; for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.set(c, r, v); }
  hline(r, c0, c1, v) { this.rect(c0, r, c1, r, v); }
  vline(c, r0, r1, v) { this.rect(c, r0, c, r1, v); }
  // 사각 고리. gaps: [{s:"N"|"S"|"E"|"W", a: 틈 가운데(그 변을 따라 좌표, 소수 가능), w: 폭}]
  ring(c0, r0, c1, r1, v, gaps = []) {
    const gap = (s, p) => { for (const g of gaps) if (g.s === s && Math.abs(p - g.a) < g.w / 2 - 1e-6) return true; return false; };
    for (let c = c0; c <= c1; c++) { if (!gap("N", c)) this.set(c, r0, v); if (!gap("S", c)) this.set(c, r1, v); }
    for (let r = r0; r <= r1; r++) { if (!gap("W", r)) this.set(c0, r, v); if (!gap("E", r)) this.set(c1, r, v); }
  }
  // 지역 사각형 (c0..c1, r0..r1)의 월드 사각형
  worldRect(c0, r0, c1, r1) {
    const m = this.map, ia = this.gi(c0), ib = this.gi(c1), ja = this.gj(r0), jb = this.gj(r1), i0 = Math.min(ia, ib), i1 = Math.max(ia, ib), j0 = Math.min(ja, jb), j1 = Math.max(ja, jb);
    return { x: m.x0 + (i0 + i1 + 1) / 2 * TILE, y: m.y0 + (j0 + j1 + 1) / 2 * TILE, hw: (i1 - i0 + 1) * TILE / 2, hh: (j1 - j0 + 1) * TILE / 2 };
  }
  wx(c) { return this.map.cx(this.gi(Math.round(c))); }
  wy(r) { return this.map.cy(this.gj(Math.round(r))); }
}

// ── 생성기 ──────────────────────────────────────────────────────────────────
class RoomGen {
  constructor(room, floor, rng) {
    this.room = room; this.floor = floor; this.rng = rng; this.type = room.type; this.geo = roomGeo(room); const m = this.map = new TileMap(this.geo);
    this.zones = []; this.checks = []; this.entries = []; this.names = []; this.spikes = null; this.spots = null; this.bossSpawn = null; this.padNode = null; this.wideChecks = [];
    this.owner = m.cellOwner(); this.multi = m.cells.length > 1; this.voids = this.geo.voids.length > 0; this.clearBoss = this.type === "boss";
    const doorSet = new Set(Object.keys(room.nb || {})); if (room.secretDir) doorSet.add(room.secretDir); if (this.type === "start") doorSet.add("S"); // 시작 방은 문이 없어도 아래쪽에서 시작한다
    const ow = this.owner, L = (c0, r0, c1, r1) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this._res(ow, c, r); };
    for (const d of doorSet) { // 문 앞 통로 (칸의 위/아래는 4폭 x 2줄, 양옆은 2줄 x 3폭)
      if (d === "N") { L(6, 0, 9, 1); this._chk(ow, 8, 1, room.nb && room.nb.N); } else if (d === "S") { L(6, 7, 9, 8); this._chk(ow, 8, 7, room.nb && room.nb.S || this.type === "start"); }
      else if (d === "W") { L(0, 3, 1, 5); this._chk(ow, 1, 4, room.nb && room.nb.W); } else { L(14, 3, 15, 5); this._chk(ow, 14, 4, room.nb && room.nb.E); }
    }
    const cs = m.cells;
    for (const a of cs) for (const [dx, dy] of [[1, 0], [0, 1]]) { // 칸 사이 통로
      const b = cs.find(c => c.dx === a.dx + dx && c.dy === a.dy + dy); if (!b) continue;
      if (dx) { for (let r = 3; r <= 5; r++) for (let k = 14; k <= 17; k++) this._resT(a.i0 + k, a.j0 + TR - 1 - r); this._chkT(a.i0 + 15, a.j0 + 4); }
      else { for (let k = 6; k <= 9; k++) for (let q = -2; q <= 1; q++) this._resT(a.i0 + k, a.j0 + TR + q); this._chkT(a.i0 + 8, a.j0 + TR - 1); }
    }
    if (this.type === "boss") { // 보스 등장 자리(4x4): 들어오는 문에서 가장 먼 칸의 위쪽 가운데
      let far = ow, fd = -1; for (const c of cs) { const d = Math.abs(c.dx) + Math.abs(c.dy); if (d > fd) { fd = d; far = c; } }
      const r0 = cs.length > 1 ? 2 : 0; for (let r = r0; r < r0 + 4; r++) for (let c = 6; c <= 9; c++) this._res(far, c, r);
      const cx = far.x, cy = this.map.y0 + (far.j0 + TR - 1 - (r0 + 1.5) + 0.5) * TILE; this.bossSpawn = { x: cx, y: cy };
      this.padNode = [far.i0 + 7, far.j0 + TR - 1 - (r0 + 2)]; // 보스가 지나갈 수 있는지 검사할 때 출발점(2x2 블록의 왼쪽 아래)
      this.checks.push([far.i0 + 8, far.j0 + TR - 1 - (r0 + 1)]);
    }
  }
  _resT(i, j) { if (this.map.inb(i, j) && this.map.mask[this.map.ix(i, j)]) this.map.res[this.map.ix(i, j)] = 1; }
  _res(cell, c, r) { this._resT(cell.i0 + c, cell.j0 + TR - 1 - r); }
  _chkT(i, j) { this.checks.push([i, j]); }
  _chk(cell, c, r, entry) { const p = [cell.i0 + c, cell.j0 + TR - 1 - r]; this.checks.push(p); if (entry || entry === undefined) this.entries.push(p); }
  cellView(cell, fx = false, fy = false) { return new TView(this.map, cell.i0, cell.j0, TC, TR, fx, fy); }
  roomView(fx = false, fy = false) { return new TView(this.map, 0, 0, this.map.cols, this.map.rows, fx, fy); }
  ownerView(fx = false, fy = false) { return this.cellView(this.owner, fx, fy); }
  zone(V, c0, r0, c1, r1, wt = 1) { const z = V.worldRect(c0, r0, c1, r1); z.wt = wt; this.zones.push(z); }
  carve() { const m = this.map; for (let k = 0; k < m.t.length; k++) if (m.res[k]) m.t[k] = T.FLOOR; }
  chance(p) { return this.rng.chance(p); }
}

// ── 도우미 ──────────────────────────────────────────────────────────────────
// 지역 (c,r)을 무작위 상자류로: 상자 위주, 가끔 통·바위
function junk(R, pBarrel = 0.1, pRock = 0.08) { const q = R.f(); return q < pBarrel ? T.BARREL : q < pBarrel + pRock ? T.ROCK : T.CRATE; }
// 뒤집어 넣기: 한 쪽 사분면에 만든 것을 (대칭이면) 네 사분면에 같이 찍는다
function quad(V, sym, fn) { // fn(mirrorC, mirrorR) 은 지역 좌표를 변환하는 함수 mc(c), mr(r)
  const id = v => v, flipC = c => V.cols - 1 - c, flipR = r => V.rows - 1 - r;
  fn(id, id); if (sym === 0) return; fn(flipC, id); if (sym === 1) return; fn(id, flipR); fn(flipC, flipR);
}
// 막다른 곳 없는 미로 (DFS). 격자 칸은 (짝수 c, 짝수 r). 남는 가장자리 줄은 열어 둔다
function carveMaze(G, V, R, c0, r0, c1, r1, loops = 0.1) {
  V.rect(c0, r0, c1, r1, T.WALL);
  const lc = Math.floor((c1 - c0) / 2) + 1, lr = Math.floor((r1 - r0) / 2) + 1, seen = new Uint8Array(lc * lr), at = (a, b) => b * lc + a, tile = (a, b) => [c0 + a * 2, r0 + b * 2];
  const ok = (a, b) => a >= 0 && b >= 0 && a < lc && b < lr && V.inside(...tile(a, b));
  let sa = -1, sb = -1; for (let b = 0; b < lr && sa < 0; b++) for (let a = 0; a < lc; a++) if (ok(a, b)) { sa = a; sb = b; break; }
  if (sa < 0) return;
  const st = [[sa, sb]]; seen[at(sa, sb)] = 1; V.set(...tile(sa, sb), T.FLOOR);
  while (st.length) {
    const [a, b] = st[st.length - 1], opts = [];
    for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const na = a + da, nb = b + db; if (ok(na, nb) && !seen[at(na, nb)]) opts.push([na, nb, da, db]); }
    if (!opts.length) { st.pop(); continue; }
    const [na, nb, da, db] = R.pick(opts); seen[at(na, nb)] = 1; const [tc, tr] = tile(a, b); V.set(tc + da, tr + db, T.FLOOR); V.set(...tile(na, nb), T.FLOOR); st.push([na, nb]);
  }
  if (c1 - c0 + 1 > lc * 2 - 1) V.vline(c1, r0, r1, T.FLOOR);             // 남는 줄 열기
  if (r1 - r0 + 1 > lr * 2 - 1) V.hline(r1, c0, c1, T.FLOOR);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { // 고리 만들기
    if (((c - c0) & 1) !== ((r - r0) & 1) && V.get(c, r) === T.WALL && R.chance(loops) && V.inside(c, r)) { const a = V.get(c - 1, r) !== T.WALL, b = V.get(c + 1, r) !== T.WALL, d = V.get(c, r - 1) !== T.WALL, e = V.get(c, r + 1) !== T.WALL; if ((a && b) || (d && e)) V.set(c, r, T.FLOOR); }
  }
}
// 세포 자동자(동굴): 영역을 무작위로 채우고 몇 번 다듬는다
function caveFill(V, R, c0, r0, c1, r1, p, code, iters = 2) {
  const W = c1 - c0 + 1, H = r1 - r0 + 1; let a = new Uint8Array(W * H); for (let k = 0; k < a.length; k++) a[k] = R.chance(p) ? 1 : 0;
  for (let it = 0; it < iters; it++) {
    const b = new Uint8Array(a.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; n += xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : a[yy * W + xx]; } b[y * W + x] = a[y * W + x] ? (n >= 3 ? 1 : 0) : (n >= 5 ? 1 : 0); }
    a = b;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[y * W + x]) V.set(c0 + x, r0 + y, code);
}
// 덩어리(blob): 중심 (c,r) 둘레에 반지름 rad 안팎으로
function blob(V, R, c, r, rad, code) { for (let y = -rad - 1; y <= rad + 1; y++) for (let x = -rad - 1; x <= rad + 1; x++) { const d = Math.hypot(x * 0.9, y * 1.15) + (R.f() - 0.5) * 0.9; if (d <= rad + 0.2) V.set(c + x, r + y, code); } }

// ── A: 칸(16x9)용 큰 구성 ────────────────────────────────────────────────────
// 필드: id, w(가중치), min/max(층), start(시작 방 가능), fn(G, V, R)
const A_CELL = [
  { id: "open", w: 1.2, start: true, fn: (G, V, R) => { if (R.chance(0.5)) { const s = R.i(1, 2); V.set(3, 4, T.BARREL); V.set(12, 4, T.BARREL); if (s > 1) V.set(7, 2, T.PILLAR); } } },
  { id: "pillarGrid", w: 3, start: true, fn: (G, V, R) => { const sx = R.pick([3, 4, 5]), sy = R.pick([2, 3, 4]), ox = R.i(1, 2), oy = R.i(1, 2), skip = R.pick([0, 0.1, 0.25]);
      for (let r = oy; r < 8; r += sy) for (let c = ox; c < 15; c += sx) if (!R.chance(skip)) V.set(c, r, R.chance(0.1) ? T.ROCK : T.PILLAR); } },
  { id: "pillarRing", w: 2.4, start: true, fn: (G, V, R) => { const rx = R.i(3, 5), ry = R.i(2, 3), n = R.pick([8, 10, 12]), a0 = R.f() * 0.6;
      for (let k = 0; k < n; k++) { const a = a0 + k * Math.PI * 2 / n; V.set(7.5 + Math.cos(a) * (rx + 0.5), 4 + Math.sin(a) * ry, R.chance(0.15) ? T.BARREL : T.PILLAR); } if (R.chance(0.4)) V.set(7, 4, T.ROCK); G.zone(V, 5, 3, 10, 5, 1); } },
  { id: "arenaRing", w: 3, min: 2, fn: (G, V, R) => { const c0 = R.i(2, 3), c1 = 15 - c0, r0 = R.i(1, 2), r1 = 8 - r0, mode = R.pick(["gates", "gates", "pinwheel", "twoGates", "corners"]);
      const gw = R.pick([2, 2, 3]); let gaps;
      if (mode === "gates") gaps = [{ s: "N", a: 7.5, w: gw }, { s: "S", a: 7.5, w: gw }, { s: "E", a: 4, w: 3 }, { s: "W", a: 4, w: 3 }];
      else if (mode === "pinwheel") gaps = [{ s: "N", a: 5.5, w: 2 }, { s: "E", a: 2.5 + r0, w: 2 }, { s: "S", a: 9.5, w: 2 }, { s: "W", a: 5.5, w: 2 }];
      else if (mode === "twoGates") gaps = R.chance(0.5) ? [{ s: "E", a: 4, w: 3 }, { s: "W", a: 4, w: 3 }] : [{ s: "N", a: 7.5, w: 3 }, { s: "S", a: 7.5, w: 3 }];
      else gaps = [{ s: "N", a: 3.5, w: 2 }, { s: "N", a: 11.5, w: 2 }, { s: "S", a: 3.5, w: 2 }, { s: "S", a: 11.5, w: 2 }];
      V.ring(c0, r0, c1, r1, T.WALL, gaps); G.zone(V, c0 + 1, r0 + 1, c1 - 1, r1 - 1, 4); if (R.chance(0.5)) quad(V, 2, (mc, mr) => V.set(mc(c0 - 1), mr(r0 - 1), T.PILLAR)); } },
  { id: "crossWalls", w: 2, min: 2, fn: (G, V, R) => { const a = R.i(2, 3), arms = R.shuffle(["N", "S", "E", "W"]).slice(0, R.pick([3, 4, 4]));
      for (const s of arms) { if (s === "N") V.rect(7, 1, 8, a, T.WALL); if (s === "S") V.rect(7, 7 - a + 1, 8, 7, T.WALL); if (s === "W") V.rect(3, 4, 3 + a + 1, 4, T.WALL); if (s === "E") V.rect(12 - a - 1, 4, 12, 4, T.WALL); }
      G.zone(V, 2, 1, 13, 7, 1); } },
  { id: "quadrants", w: 3, fn: (G, V, R) => { const sym = R.pick([2, 2, 1]), la = R.i(3, 4), lb = R.i(2, 3), c = R.i(1, 3), r = R.i(1, 2), kind = R.pick(["L", "L", "bar"]);
      quad(V, sym, (mc, mr) => { if (kind === "L") { for (let k = 0; k < la; k++) V.set(mc(c + k), mr(r), T.WALL); for (let k = 1; k < lb; k++) V.set(mc(c), mr(r + k), T.WALL); } else for (let k = 0; k < la; k++) V.set(mc(c + 1 + k), mr(r + 1), T.WALL); if (R.chance(0.5)) V.set(mc(c + 1), mr(r + 1), junk(R)); }); } },
  { id: "serpentine", w: 2.2, min: 2, fn: (G, V, R) => { const rows = R.pick([[2, 6], [2, 4, 6], [3, 5]]), gapW = R.i(2, 3); let left = R.chance(0.5);
      for (const r of rows) { V.hline(r, 3, 12, T.WALL); const g0 = left ? 3 : 12 - gapW + 1; V.rect(g0, r, g0 + gapW - 1, r, T.FLOOR); left = !left; } G.zone(V, 2, 1, 13, 7, 1); } },
  { id: "stripsV", w: 2, fn: (G, V, R) => { const cols = R.pick([[3, 5, 10, 12], [4, 11], [3, 6, 9, 12]]), top = R.chance(0.5), len = R.i(4, 6);
      cols.forEach((c, k) => { const up = (k % 2 === 0) === top; if (up) V.vline(c, 0, len - 1, T.WALL); else V.vline(c, 8 - len + 1, 8, T.WALL); }); G.zone(V, 2, 1, 13, 7, 1); } },
  { id: "maze", w: 1.6, min: 2, fn: (G, V, R) => { carveMaze(G, V, R, 0, 0, 15, 8, R.pick([0.05, 0.1, 0.18])); } },
  { id: "pitIslands", w: 2.2, fn: (G, V, R) => { const n = R.i(2, 4), pts = []; for (let t = 0; t < 40 && pts.length < n; t++) { const c = R.i(2, 13), r = R.i(2, 6); if (pts.every(p => Math.hypot(p[0] - c, p[1] - r) > 4.5) && (c < 5 || c > 10 || (r > 2 && r < 6))) pts.push([c, r]); }
      for (const [c, r] of pts) blob(V, R, c, r, R.pick([1, 1, 2]), T.PIT); } },
  { id: "moat", w: 2, min: 2, fn: (G, V, R) => { const c0 = R.i(3, 4), r0 = R.i(1, 2), gaps = R.shuffle([{ s: "N", a: 7.5, w: 2 }, { s: "S", a: 7.5, w: 2 }, { s: "E", a: 4, w: 2 }, { s: "W", a: 4, w: 2 }]).slice(0, R.i(2, 4));
      V.ring(c0, r0, 15 - c0, 8 - r0, T.PIT, gaps); if (R.chance(0.7)) { V.set(7, 4, T.PILLAR); V.set(8, 4, T.PILLAR); } else quad(V, 2, (mc, mr) => V.set(mc(c0 + 1), mr(r0 + 1), junk(R))); G.zone(V, c0 + 1, r0 + 1, 14 - c0, 7 - r0, 3); } },
  { id: "fortress", w: 2, min: 2, fn: (G, V, R) => { const c0 = R.i(4, 5), r0 = R.i(2, 3), gaps = R.chance(0.5) ? [{ s: "N", a: 7.5, w: 2 }, { s: "S", a: 7.5, w: 2 }] : [{ s: "E", a: 4, w: 1 }, { s: "W", a: 4, w: 1 }];
      V.ring(c0, r0, 15 - c0, 8 - r0, T.WALL, gaps); quad(V, 2, (mc, mr) => V.set(mc(c0 - 2), mr(r0 - 1), T.BARREL)); G.zone(V, c0 + 1, r0 + 1, 14 - c0, 7 - r0, 4); G.zone(V, 1, 1, 14, 7, 1); } },
  { id: "checker", w: 2.2, fn: (G, V, R) => { const p = R.pick([0.35, 0.5, 0.65]), mix = R.pick([[0.1, 0.5], [0.5, 0.1], [0.1, 0.1]]), par = R.i(0, 1);
      for (let r = 1; r < 8; r++) for (let c = 2; c < 14; c++) if (((c + r) & 1) === par && R.chance(p)) V.set(c, r, junk(R, mix[0], mix[1])); } },
  { id: "bunkers", w: 2.2, fn: (G, V, R) => { const la = R.i(3, 4), lb = R.i(2, 3), sym = R.pick([2, 2, 1]), mod = R.pick(["L", "U", "L"]);
      quad(V, sym, (mc, mr) => { for (let k = 0; k < la; k++) V.set(mc(1 + k), mr(1), T.WALL); for (let k = 1; k < lb; k++) V.set(mc(1), mr(1 + k), T.WALL); if (mod === "U") for (let k = 1; k < lb; k++) V.set(mc(la), mr(1 + k), T.WALL); V.set(mc(2), mr(2), R.chance(0.6) ? T.CRATE : T.BARREL); }); G.zone(V, 3, 2, 12, 6, 3); G.zone(V, 1, 1, 14, 7, 1); } },
  { id: "diagonal", w: 2, fn: (G, V, R) => { const x2 = R.chance(0.4), kind = R.pick([T.PILLAR, T.PILLAR, T.WALL, T.ROCK]), step = R.pick([1, 2]);
      const line = (flip) => { for (let k = 0; k < 14; k += step) { const c = 1 + k, r = Math.round(7 - k * 6 / 13); V.set(flip ? 15 - c : c, r, kind); } };
      line(false); if (x2) line(true); V.set(1, 1, T.BARREL); V.set(14, 7, T.BARREL); } },
  { id: "doubleRing", w: 1.8, min: 2, fn: (G, V, R) => { const g1 = R.pick(["E", "W"]), g2 = g1 === "E" ? "W" : "E";
      V.ring(2, 1, 13, 7, T.WALL, [{ s: g1, a: 4, w: 3 }, { s: "N", a: 3.5, w: 2 }]); V.hline(4, 5, 10, T.WALL); { const g = R.chance(0.5) ? 5 : 9; V.rect(g, 4, g + 1, 4, T.FLOOR); } G.zone(V, 3, 2, 12, 6, 2); } },
  { id: "colonnade", w: 2.2, start: true, fn: (G, V, R) => { const rows = R.pick([[2, 6], [2, 4, 6], [1, 4, 7]]), st = R.pick([2, 3]), fill = R.chance(0.4);
      for (const r of rows) for (let c = 2; c < 14; c += st) { V.set(c, r, T.PILLAR); if (fill && c + 1 < 14) V.set(c + 1, r, junk(R, 0.3, 0)); } } },
  { id: "crateField", w: 3, fn: (G, V, R) => { const p = R.pick([0.5, 0.6, 0.7]);
      for (let r = 1; r < 8; r++) for (let c = 1; c < 15; c++) if (R.chance(p)) V.set(c, r, junk(R, 0.1, 0.04));
      for (let k = 0; k < 3; k++) { let c = R.pick([0, 15]), r = R.i(2, 6); for (let s = 0; s < 22; s++) { V.set(c, r, T.FLOOR); const d = R.pick([[1, 0], [-1, 0], [0, 1], [0, -1], [c < 8 ? 1 : -1, 0]]); c = Math.max(0, Math.min(15, c + d[0])); r = Math.max(0, Math.min(8, r + d[1])); } }
      G.zone(V, 1, 1, 14, 7, 1); } },
  { id: "cavern", w: 2, min: 2, fn: (G, V, R) => { caveFill(V, R, 1, 1, 14, 7, R.pick([0.38, 0.45, 0.5]), R.chance(0.7) ? T.WALL : T.ROCK, 2); G.zone(V, 1, 1, 14, 7, 1); } },
  { id: "splitWall", w: 2, fn: (G, V, R) => { const c = R.pick([7, 8]), th = R.chance(0.4) ? 2 : 1, g1 = R.i(1, 2), g2 = R.i(5, 6);
      for (let t = 0; t < th; t++) V.vline(c + t, 0, 8, T.WALL); V.rect(c, g1, c + th - 1, g1 + 1, T.FLOOR); V.rect(c, g2, c + th - 1, g2 + 1, T.FLOOR); quad(V, 1, (mc, mr) => V.set(mc(3), mr(4), T.PILLAR)); } },
  { id: "tunnel", w: 2, fn: (G, V, R) => { const w = R.i(3, 5), c0 = 8 - w - 1, c1 = 7 + w + 1; V.hline(3, c0, c1, T.WALL); V.hline(5, c0, c1, T.WALL); if (R.chance(0.5)) { V.set(R.i(c0 + 1, c1 - 1), 3, T.FLOOR); V.set(R.i(c0 + 1, c1 - 1), 5, T.FLOOR); }
      G.zone(V, c0, 4, c1, 4, 5); G.zone(V, 1, 1, 14, 7, 1); } },
  { id: "zigzag", w: 1.8, min: 2, fn: (G, V, R) => { const xs = R.pick([[3, 6, 9, 12], [2, 5, 8, 11, 13], [4, 7, 10]]), len = R.i(4, 5); xs.forEach((c, k) => { if (k % 2) V.vline(c, 8 - len, 7, T.WALL); else V.vline(c, 1, len, T.WALL); }); } },
  { id: "pitCorners", w: 1.6, fn: (G, V, R) => { const sz = R.pick([1, 2]); quad(V, 2, (mc, mr) => { for (let a = 0; a < sz + 1; a++) for (let b = 0; b < sz; b++) V.set(mc(1 + a), mr(1 + b), T.PIT); }); quad(V, 1, (mc, mr) => V.set(mc(5), mr(4), T.PILLAR)); } },
  { id: "ruins", w: 2.4, fn: (G, V, R) => { const mir = R.chance(0.6);
      const place = (cc, rr) => { const k = R.i(0, 5); if (k === 0) { V.hline(rr, cc, cc + 2, T.WALL); V.set(cc, rr + 1, T.WALL); } else if (k === 1) { V.set(cc, rr, T.PILLAR); V.set(cc + 2, rr, T.PILLAR); } else if (k === 2) V.vline(cc, rr, rr + 2, T.WALL); else if (k === 3) { V.set(cc + 1, rr + 1, T.ROCK); V.set(cc, rr, junk(R)); } else if (k === 4) V.hline(rr, cc, cc + 1, T.WALL); };
      for (const [cc, rr] of [[1, 1], [5, 1], [10, 1], [1, 5], [5, 5], [10, 5], [3, 3], [11, 3]]) place(cc, rr);
      if (mir) for (let r = 0; r < 9; r++) for (let c = 0; c < 8; c++) { const v = V.get(c, r); if (v !== T.FLOOR && V.inside(15 - c, r)) V.set(15 - c, r, v); } } },
  { id: "barrelRing", w: 1.6, min: 2, fn: (G, V, R) => { const rx = R.i(3, 4), ry = R.i(2, 3); for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; V.set(7.5 + Math.cos(a) * (rx + 0.5), 4 + Math.sin(a) * ry, T.BARREL); } V.set(7, 4, T.PILLAR); V.set(8, 4, T.PILLAR); G.zone(V, 4, 2, 11, 6, 2); } },
  { id: "staircase", w: 1.6, fn: (G, V, R) => { const k = R.i(3, 5); for (let s = 0; s < k; s++) { V.hline(1 + s, 1, 1 + s * 2, T.WALL); } quad(V, 2, (mc, mr) => { for (let s = 0; s < 3; s++) V.set(mc(1 + s), mr(1 + s), T.WALL); }); } },
];

// ── A: 큰 방(여러 칸) 전체용 큰 구성 ─────────────────────────────────────────
// need(G): 쓸 수 있는 조건. V는 방 전체 보기 (cols x rows 타일)
const A_ROOM = [
  { id: "bigMaze", w: 2.4, min: 3, need: G => true, fn: (G, V, R) => { carveMaze(G, V, R, 0, 0, V.cols - 1, V.rows - 1, 0.08); } },
  { id: "bigArena", w: 3, min: 2, need: G => !G.voids, fn: (G, V, R) => { const m = R.i(3, 4), c0 = m, c1 = V.cols - 1 - m, r0 = Math.min(m - 1, 2), r1 = V.rows - 1 - r0, mc = (c0 + c1) / 2, mr = (r0 + r1) / 2;
      V.ring(c0, r0, c1, r1, T.WALL, [{ s: "N", a: mc, w: 3 }, { s: "S", a: mc, w: 3 }, { s: "E", a: mr, w: 3 }, { s: "W", a: mr, w: 3 }]); quad(V, 2, (a, b) => { V.set(a(1), b(1), T.PILLAR); }); G.zone(V, c0 + 1, r0 + 1, c1 - 1, r1 - 1, 4); G.zone(V, 1, 1, V.cols - 2, V.rows - 2, 1); } },
  { id: "twinArenas", w: 2.2, min: 2, need: G => !G.voids && G.map.cols > G.map.rows * 1.5, fn: (G, V, R) => { const w = V.cols / 2;
      for (const k of [0, 1]) { V.ring(k * w + 3, 2, k * w + w - 4, V.rows - 3, T.WALL, [{ s: k ? "W" : "E", a: (V.rows - 1) / 2, w: 3 }, { s: "N", a: k * w + w / 2 - 0.5, w: 2 }, { s: "S", a: k * w + w / 2 - 0.5, w: 2 }]); G.zone(V, k * w + 4, 3, k * w + w - 5, V.rows - 4, 4); } } },
  { id: "colonnadeHall", w: 2.4, need: G => !G.voids, fn: (G, V, R) => { const ys = V.rows > 12 ? [2, 5, 12, 15] : [2, 6], st = R.pick([3, 4]), alt = R.chance(0.5);
      for (const [k, r] of ys.entries()) for (let c = 2 + (alt && k % 2 ? 1 : 0); c < V.cols - 2; c += st) V.set(c, r, T.PILLAR); } },
  { id: "crateSea", w: 3, need: G => true, fn: (G, V, R) => { const p = R.pick([0.4, 0.5, 0.6]); for (let r = 1; r < V.rows - 1; r++) for (let c = 1; c < V.cols - 1; c++) if (R.chance(p)) V.set(c, r, junk(R, 0.1, 0.05)); G.zone(V, 1, 1, V.cols - 2, V.rows - 2, 1); } },
  { id: "dividedHall", w: 2, need: G => !G.voids, fn: (G, V, R) => {
      const wide = V.cols >= V.rows * 1.5, n = wide ? V.cols / 16 - 1 : V.rows / 9 - 1;
      if (wide) { for (let k = 1; k <= n; k++) { const c = k * 16 - 1; V.vline(c, 0, V.rows - 1, T.WALL); V.vline(c + 1, 0, V.rows - 1, T.WALL); const g = R.i(1, 6); V.rect(c, g, c + 1, g + 2, T.FLOOR); } }
      else { for (let k = 1; k <= n; k++) { const r = k * 9 - 1; V.hline(r, 0, V.cols - 1, T.WALL); const g = R.i(1, V.cols - 5); V.rect(g, r, g + 3, r, T.FLOOR); } }
      quad(V, 2, (a, b) => V.set(a(2), b(2), T.ROCK)); } },
  { id: "cavernHall", w: 2.2, need: G => true, fn: (G, V, R) => { caveFill(V, R, 1, 1, V.cols - 2, V.rows - 2, R.pick([0.4, 0.46]), R.chance(0.7) ? T.WALL : T.ROCK, 3); G.zone(V, 1, 1, V.cols - 2, V.rows - 2, 1); } },
  { id: "spiralHall", w: 1.8, min: 3, need: G => !G.voids && G.map.rows >= 14 && G.map.cols >= 28, fn: (G, V, R) => { // 겹겹의 고리, 틈이 번갈아 있다
      let k = 0, left = R.chance(0.5); for (let m = 2; m * 2 < V.rows - 2; m += 3) { V.ring(m + 2, m, V.cols - 3 - m, V.rows - 1 - m, T.WALL, [{ s: "N", a: left ? m + 6 : V.cols - m - 7, w: 3 }, { s: "S", a: left ? V.cols - m - 7 : m + 6, w: 3 }, { s: "E", a: (V.rows - 1) / 2, w: 3 }, { s: "W", a: (V.rows - 1) / 2, w: 3 }]); left = !left; k++; }
      G.zone(V, V.cols / 2 - 4, V.rows / 2 - 2, V.cols / 2 + 3, V.rows / 2 + 1, 4); } },
  { id: "pitLake", w: 2, min: 2, need: G => !G.voids, fn: (G, V, R) => { const cc = (V.cols - 1) / 2, cr = (V.rows - 1) / 2, rx = V.cols / 4, ry = V.rows / 2 - 3;
      for (let r = 0; r < V.rows; r++) for (let c = 0; c < V.cols; c++) { const d = Math.hypot((c - cc) / rx, (r - cr) / ry); if (d < 1) V.set(c, r, T.PIT); }
      V.hline(Math.round(cr), 0, V.cols - 1, T.FLOOR); V.hline(Math.round(cr) + (V.rows % 2 ? 0 : 1), 0, V.cols - 1, T.FLOOR); V.vline(Math.floor(cc), 0, V.rows - 1, T.FLOOR); V.vline(Math.ceil(cc), 0, V.rows - 1, T.FLOOR); quad(V, 2, (a, b) => V.set(a(2), b(2), T.ROCK)); } },
  { id: "cityBlocks", w: 2.2, min: 2, need: G => !G.voids, fn: (G, V, R) => { const bw = R.pick([4, 5]), bh = R.pick([2, 3]), st = R.i(2, 3);
      for (let r0 = 1; r0 + bh - 1 < V.rows - 1; r0 += bh + st) for (let c0 = 1; c0 + bw - 1 < V.cols - 1; c0 += bw + st) { if (R.chance(0.12)) continue; V.rect(c0, r0, c0 + bw - 1, r0 + bh - 1, T.WALL); if (R.chance(0.5)) V.set(c0 + (bw >> 1), r0 + (bh >> 1), T.FLOOR); } G.zone(V, 1, 1, V.cols - 2, V.rows - 2, 1); } },
  { id: "pillarField", w: 2.4, need: G => true, fn: (G, V, R) => { const st = R.pick([3, 4]), j = R.pick([0, 1]);
      for (let r = 1; r < V.rows - 1; r += st - 1) for (let c = 1; c < V.cols - 1; c += st) V.set(c + (R.chance(0.3) ? j : 0), r, R.chance(0.12) ? T.ROCK : T.PILLAR); } },
  { id: "crossHall", w: 2, need: G => !G.voids, fn: (G, V, R) => { const mc = Math.floor((V.cols - 1) / 2), mr = Math.floor((V.rows - 1) / 2);
      V.rect(mc, 1, mc + 1, V.rows - 2, T.WALL); V.rect(1, mr, V.cols - 2, mr + (V.rows % 2 ? 0 : 1), T.WALL); const gs = [[mc, 3], [mc, V.rows - 5], [3, mr], [V.cols - 5, mr]];
      for (const [c, r] of gs) V.rect(Math.max(0, c - 1), Math.max(0, r - 1), c + 2, r + 1 + (V.rows % 2 ? 0 : 1), T.FLOOR); V.rect(mc - 1, mr - 1, mc + 2, mr + 2, T.FLOOR); } },
];

// ── A: 보스 방 (보스 자리 = 위쪽 가운데 4x4 는 res로 항상 비어 있다. 가운데는 넓게 비우고 엄폐물을 둔다) ───────────────────────────
const A_BOSS = [
  { id: "bossOpen", w: 1, fn: (G, V, R) => { V.set(2, 6, T.BARREL); V.set(13, 6, T.BARREL); if (R.chance(0.5)) { V.set(2, 7, T.CRATE); V.set(13, 7, T.CRATE); } } },
  { id: "bossCover4", w: 3, fn: (G, V, R) => { const c = R.i(2, 4), r = R.i(4, 6); quad(V, 2, (mc, mr) => V.set(mc(c), mr(r) > 4 ? mr(r) : mr(r), T.PILLAR)); if (R.chance(0.5)) V.set(7, 5, T.ROCK); } },
  { id: "bossArc", w: 2.4, fn: (G, V, R) => { const rx = R.i(4, 5); for (let k = 0; k < 9; k++) { const a = Math.PI * (0.1 + 0.8 * k / 8); V.set(7.5 + Math.cos(a) * (rx + 0.5), 3.2 + Math.sin(a) * 4.2, T.PILLAR); } } },
  { id: "bossBunkers", w: 2.4, fn: (G, V, R) => { quad(V, 1, (mc, mr) => { V.vline(mc(3), 3, 5, T.WALL); V.hline(5, mc(3), mc(5), T.WALL); V.set(mc(2), 6, T.CRATE); V.set(mc(2), 7, T.CRATE); }); } },
  { id: "bossColumns", w: 2, fn: (G, V, R) => { const k = R.pick([T.ROCK, T.PILLAR]); quad(V, 2, (mc, mr) => { V.set(mc(3), mr(3), k); V.set(mc(4), mr(3), k); V.set(mc(3), mr(4), k); }); } },
  { id: "bossCrates", w: 2, fn: (G, V, R) => { quad(V, 1, (mc, mr) => { V.rect(mc(1), 5, mc(2), 6, T.CRATE); V.set(mc(3), 3, T.BARREL); V.set(mc(4), 5, T.PILLAR); }); } },
  { id: "bossMoat", w: 2, min: 2, fn: (G, V, R) => { const a = R.i(3, 4); quad(V, 1, (mc, mr) => V.vline(mc(a), 3, 7, T.PIT)); V.rect(R.i(a + 2, 6), 6, 9, 6, R.pick([T.FLOOR, T.CRATE])); V.set(R.pick([a, 15 - a]), 5, T.FLOOR); } },
  { id: "bossPitCenter", w: 1.8, min: 2, fn: (G, V, R) => { V.rect(6, 5, 9, 7, T.PIT); V.set(5, 4, T.PILLAR); V.set(10, 4, T.PILLAR); } },
  { id: "bossPillarRows", w: 2, fn: (G, V, R) => { const rows = R.pick([[5, 7], [4, 6], [4, 7]]); for (const r of rows) for (let c = 2; c < 14; c += 3) if (c < 5 || c > 9 || r > 4) V.set(c, r, T.PILLAR); } },
  { id: "bossHalfWalls", w: 2, min: 2, fn: (G, V, R) => { quad(V, 1, (mc, mr) => { V.hline(4, mc(2), mc(4), T.WALL); V.vline(mc(2), 4, 6, T.WALL); }); V.set(7, 6, T.CRATE); V.set(8, 6, T.CRATE); } },
  { id: "bossFlanks", w: 1.8, fn: (G, V, R) => { const k = R.pick([T.PILLAR, T.ROCK]); for (const r of [3, 5, 7]) { V.set(2, r, k); V.set(13, r, k); } if (R.chance(0.6)) { V.set(6, 6, T.ROCK); V.set(9, 6, T.ROCK); } } },
];

// ── B: 작은 도장(stamp)과 도장 묶음 ──────────────────────────────────────────
const STAMPS = {
  clump2: ["CC", "CC"], clump3: ["CCC", "CBC", "CCC"], crate3: ["CCC"], crate5: ["CCCCC"], crateV: ["C", "C", "C"], crateDiag: ["C..", ".C.", "..C"], crateL: ["CC", "C."],
  barrel2: ["B.B"], barrelTri: [".B.", "B.B"], barrelRow: ["BBB"], barrelOne: ["B"], rock1: ["R"], rock2: ["RR"], rock3: ["RRR"], rockL: ["RR", "R."], rockDiag: ["R.", ".R"],
  pillar1: ["P"], pillar2: ["P.P"], pillarRow: ["P.P.P"], pillarV: ["P", ".", "P"], pillarSq: ["P.P", "...", "P.P"],
  wall3: ["###"], wall5: ["#####"], wallL: ["##", "#."], wallT: ["###", ".#."], wallV3: ["#", "#", "#"], wallU: ["#.#", "###"],
  pit2: ["OO", "OO"], pit3: ["OOO", "OOO"], pitStrip: ["OOOO"], pitL: ["OO", "O."], pitDot: ["O"], mixed: ["CB", "RC"], mixed2: ["R.C", ".B."], coverRow: ["#.#.#"],
};
// 묶음: parts = [도장 이름들, 개수 최소, 최대(칸 하나 기준)]. w=가중치. min/max=층, types=적용 방 종류(없으면 전부)
const B_SETS = [
  { id: "none", w: 1.4, parts: [] },
  { id: "warehouse", w: 3, parts: [[["clump2", "clump3", "crate3", "crate5", "crateV"], 3, 6], [["barrel2", "barrelOne"], 1, 2]] },
  { id: "ruinsB", w: 2.4, parts: [[["wall3", "wallL", "wallV3", "pillar1", "pillar2"], 3, 5], [["rock1", "rock2"], 1, 2]] },
  { id: "minefield", w: 2, min: 2, parts: [[["barrel2", "barrelTri", "barrelOne"], 4, 7], [["rock1"], 1, 3]] },
  { id: "swamp", w: 2, parts: [[["pit2", "pitStrip", "pitL", "pitDot"], 2, 4], [["rock1", "rock2"], 1, 3]] },
  { id: "quarry", w: 2.2, parts: [[["rock2", "rock3", "rockL", "rockDiag"], 3, 5], [["clump2"], 0, 2]] },
  { id: "sparse", w: 2.4, parts: [[["pillar1", "crate3", "rock1", "barrelOne"], 1, 3]] },
  { id: "barricades", w: 2.2, min: 2, parts: [[["wall5", "wallT", "wallU", "coverRow"], 2, 3], [["crate3", "crateV"], 2, 3]] },
  { id: "pillarGarden", w: 2, parts: [[["pillarRow", "pillar2", "pillarSq", "pillarV"], 2, 4], [["barrelOne"], 0, 2]] },
  { id: "bombStorage", w: 1.8, min: 2, parts: [[["barrelTri", "barrelRow", "barrel2"], 3, 5], [["crate3", "clump2"], 1, 3]] },
  { id: "cratePiles", w: 2.4, parts: [[["clump3", "clump2", "crateL"], 3, 6]] },
  { id: "craters", w: 1.8, min: 2, parts: [[["pit2", "pit3", "pitDot"], 2, 3], [["barrel2", "barrelOne", "rock1"], 2, 4]] },
  { id: "scattershot", w: 2.6, parts: [[["mixed", "mixed2", "crate3", "rock2", "pillar1", "barrelOne", "pit2", "wall3", "crateDiag"], 4, 8]] },
  { id: "debris", w: 2, parts: [[["crateDiag", "rockDiag", "mixed", "mixed2", "crateL"], 3, 6]] },
  { id: "trenches", w: 1.6, min: 3, parts: [[["pitStrip", "pitL", "wall3"], 3, 5], [["crate3"], 0, 2]] },
];
const BOSS_B = ["none", "sparse", "pillarGarden", "cratePiles", "debris", "craters", "ruinsB", "quarry"];
const BIG_STAMP_COUNT = c => Math.round(c * 0.9);

// 도장 하나 찍기. 놓을 자리와 그 둘레 한 타일이 모두 비어 있고(바깥 벽과도 한 타일 떨어짐), 문 앞 통로가 아닐 때만 찍힌다.
function stampOnce(G, name, R, V) {
  const m = G.map, pat = STAMPS[name], fh = R.chance(0.5), fv = R.chance(0.5), h = pat.length, w = pat[0].length;
  for (let t = 0; t < 30; t++) {
    const c = R.i(1, V.cols - w - 1), r = R.i(1, V.rows - h - 1), cellsT = [];
    let ok = true;
    for (let y = 0; y < h && ok; y++) for (let x = 0; x < w; x++) {
      const ch = pat[fv ? h - 1 - y : y][fh ? w - 1 - x : x]; if (ch === ".") continue; const cc = c + x, rr = r + y;
      if (!V.free(cc, rr)) { ok = false; break; } cellsT.push([cc, rr, T_CHAR[ch]]);
    }
    if (!ok) continue;
    const mine = new Set(cellsT.map(p => p[0] + "," + p[1]));
    for (const [cc, rr] of cellsT) for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) { const a = cc + dx, b = rr + dy; if (mine.has(a + "," + b)) continue; if (!V.inside(a, b) || (V.get(a, b) !== T.FLOOR && V.get(a, b) !== T.SPIKE)) { ok = false; break; } }
    if (!ok) continue;
    for (const [cc, rr, v] of cellsT) V.set(cc, rr, v);
    return true;
  }
  return false;
}
function applyStamps(G, set, R) {
  const V = G.roomView(R.chance(0.5), false), n = G.map.cells.length;
  for (const [names, lo, hi] of set.parts) { const k = Math.round(R.i(lo, hi) * Math.pow(n, 0.9)); for (let i = 0; i < k; i++) stampOnce(G, R.pick(names), R, V); }
}

// ── 레이아웃 만들기 ─────────────────────────────────────────────────────────
function pickA(list, G, floor, type, R) {
  const ok = list.filter(t => (t.min || 1) <= floor && (t.max || 99) >= floor && (type !== "start" || t.start) && (!t.need || t.need(G)));
  return R.weighted(ok) || list[0];
}
function buildOnce(room, floor, rng, opts) {
  const G = new RoomGen(room, floor, rng), R = rng, m = G.map, type = room.type, boss = type === "boss", flip = () => R.chance(0.5);
  if (opts.special) { opts.special(G, room, R); G.names.push(type); }
  else {
    let aName = "";
    if (type === "start" && R.chance(0.4)) aName = "start-open";
    else if (boss) {
      const t = pickA(A_BOSS, G, floor, type, R); aName = t.id; const big = m.cells.length > 1, far = G.padNode;
      for (const c of m.cells) { const V = G.cellView(c, flip(), false); if (big && !(c.i0 <= far[0] && far[0] < c.i0 + TC && c.j0 <= far[1] && far[1] < c.j0 + TR)) { const t2 = R.chance(0.6) ? t : pickA(A_BOSS, G, floor, type, R); t2.fn(G, V, R); } else t.fn(G, V, R); }
      if (big) aName += "+" + m.cells.length;
    } else if (G.multi && type !== "start" && R.chance(0.6)) {
      const t = pickA(A_ROOM, G, floor, type, R); if (t) { aName = t.id; t.fn(G, G.roomView(flip(), flip()), R); }
    } else {
      const same = R.chance(0.3) ? pickA(A_CELL, G, floor, type, R) : null, ids = [];
      for (const c of m.cells) { const t = same || pickA(A_CELL, G, floor, type, R); ids.push(t.id); t.fn(G, G.cellView(c, flip(), flip()), R); }
      aName = ids.length > 1 && ids.every(i => i === ids[0]) ? ids[0] + "x" + ids.length : ids.join("+");
    }
    G.carve();
    const cand = boss ? B_SETS.filter(s => BOSS_B.includes(s.id)) : B_SETS, set = R.weighted(cand.filter(s => (s.min || 1) <= floor && (!s.types || s.types.includes(type)) && (type !== "start" || ["none", "sparse", "pillarGarden"].includes(s.id))), s => s.w) || B_SETS[0];
    applyStamps(G, set, R); G.names.push(aName, set.id);
  }
  G.carve();
  return G;
}
// 검사: 모든 필수 지점이 이어지는가, 구멍은 메우고, 열린 비율을 본다. 통과하면 { ok, reach(부서지는 상자 통과), ratio }
function validate(G) {
  const m = G.map, { cols, rows } = m;
  const starts = G.entries.length ? G.entries : G.checks.slice(0, 1); if (!starts.length) return { ok: false };
  const strict = floodTiles(m, [starts[0]], 0);
  for (const [i, j] of G.checks) if (!m.free(i, j) || !strict[j * cols + i]) return { ok: false, why: "check" };
  if (G.type === "boss" && G.padNode) { // 보스는 2x2 이상 폭의 길로 모든 문·통로에 닿아야 한다
    const wide = floodTiles(m, [G.padNode], 1);
    if (!wide[G.padNode[1] * cols + G.padNode[0]]) return { ok: false, why: "pad" };
    for (const [i, j] of G.checks) { const ok = [[i, j], [i - 1, j], [i, j - 1], [i - 1, j - 1]].some(([a, b]) => m.inb(a, b) && wide[b * cols + a]); if (!ok) return { ok: false, why: "boss-wide" }; }
  }
  const soft = floodTiles(m, [starts[0]], 2); let freeN = 0, lost = 0, maskN = 0;
  for (let k = 0; k < m.t.length; k++) { if (m.mask[k]) maskN++; if (m.mask[k] && !T_SOLID[m.t[k]]) { freeN++; if (!soft[k]) lost++; } }
  if (lost > freeN * 0.12) return { ok: false, why: "pockets" };
  for (let k = 0; k < m.t.length; k++) if (m.mask[k] && !T_SOLID[m.t[k]] && !soft[k]) m.t[k] = T.WALL; // 닿을 수 없는 구멍은 벽으로 메운다
  const open = (freeN - lost) / Math.max(1, maskN);
  if (open < (G.type === "boss" ? MIN_OPEN_BOSS : MIN_OPEN)) return { ok: false, why: "open" };
  return { ok: true, reach: soft, ratio: open };
}
// 방 하나의 레이아웃. 검사에 실패하면 다른 시드로 다시(최대 14번), 그래도 안 되면 안전한 빈 방. 같은 room.seed면 같은 결과.
function buildLayout(room, floor = 3, opts = {}) {
  const base = (room.seed != null ? room.seed : (room.seed = (Math.random() * 4294967296) >>> 0)) >>> 0;
  for (let attempt = 0; attempt < 14; attempt++) {
    const G = buildOnce(room, floor, new Rng(hash2(base, attempt + 1)), opts), v = validate(G);
    if (v.ok) return finishLayout(G, v, attempt + 1, false);
  }
  const G = new RoomGen(room, floor, new Rng(base)); G.names.push("fallback");
  if (opts.special) { opts.special(G, room, new Rng(base)); G.names.push(room.type); } // 특수 방의 배치는 정해진 설계라서 그대로 쓴다
  G.carve(); const v = validate(G);
  return finishLayout(G, v.ok ? v : { ok: true, reach: floodTiles(G.map, [G.entries[0] || G.checks[0] || [0, 0]], 2), ratio: 1 }, 15, true);
}
function finishLayout(G, v, attempts, fallback) {
  const m = G.map, reach = v.reach, zones = G.zones.filter(z => { // 도달 가능한 타일이 4개 이상 있는 구역만
    let n = 0; const i0 = Math.max(0, m.ti(z.x - z.hw + 1)), i1 = Math.min(m.cols - 1, m.ti(z.x + z.hw - 1)), j0 = Math.max(0, m.tj(z.y - z.hh + 1)), j1 = Math.min(m.rows - 1, m.tj(z.y + z.hh - 1));
    for (let j = j0; j <= j1 && n < 4; j++) for (let i = i0; i <= i1; i++) if (reach[j * m.cols + i] && !T_SOLID[m.t[j * m.cols + i]]) { n++; if (n >= 4) break; }
    return n >= 4;
  });
  let spikes = null; // 가시 타일 → 가시 판 목록 (Specials.SpikeField)
  for (let j = 0; j < m.rows; j++) for (let i = 0; i < m.cols; i++) if (m.t[j * m.cols + i] === T.SPIKE) { (spikes || (spikes = [])).push({ x: m.cx(i), y: m.cy(j), hw: TILE / 2, hh: TILE / 2, ph: j * 0.62 + i * 0.11 + (j & 1 ? 0.3 : 0) }); }
  return { map: m, reach, zones, bossSpawn: G.bossSpawn, names: G.names, ratio: v.ratio, spikes: G.spikes || spikes, spots: G.spots, attempts, fallback, grid: null };
}
// 도달 가능한 자리인가 (타일 기준). 레이아웃이 없으면 true
function layoutReach(lay, x, y) {
  const m = lay && lay.map; if (!m) return true; const i = m.ti(x), j = m.tj(y);
  return m.inb(i, j) && lay.reach[j * m.cols + i] === 1 && m.mask[j * m.cols + i] === 1;
}

// Game.enterRoom이 부른다: 레이아웃을 만들어 room.layout / room.tiles에 붙이고 지형 배열을 돌려준다
function generateObstacles(room, floor = 3) {
  const sp = typeof SPECIAL_LAYOUT !== "undefined" ? SPECIAL_LAYOUT[room.type] : null;
  const lay = buildLayout(room, floor, sp ? { special: sp } : {});
  room.layout = lay; room.tiles = lay.map; return lay.map.toObstacles();
}
const TPL_NAMES = [...A_CELL, ...A_ROOM, ...A_BOSS].map(t => t.id);
