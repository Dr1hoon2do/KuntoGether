// 타일맵 방 생성기. 방 구성 데이터(archetype A · stamp B)는 tiles/Archetypes*.js · Stamps.js 가 TileContent(Registry.js)에 등록하고,
// 이 파일이 규약(tiles/SPEC.md)대로 ctx를 만들어 넘겨 받아 타일맵에 적용한다. 순서:
//   ① 시드 난수로 좌우/상하 뒤집기(fx, fy)를 정하고, 뒤집힌 틀(build frame)의 ctx(문·통로·예약 구역도 같이 뒤집힘)로 archetype.build(ctx)를 부른다
//   ② 받은 rows(문자 격자)를 원래 틀로 되돌려 TileMap에 쓰고, 바깥 테두리 벽·문 틈·금 간 벽(비밀방)을 생성기가 그린다. 예약 구역(문 앞·칸 사이 통로·시작·보스 자리)은 장애물을 지운다
//   ③ archetype의 stampSets에서 stampCount만큼 스탬프를 빈 곳에 찍는다 (random 좌우 반전, anchor 규칙, 둘레 한 타일은 비움). 찍을 때마다 흐름(flood fill)을 다시 검사해서 막히면 되돌린다
//   ④ 검증(validate): 한 문에서 모든 문·통로·보스 자리·보상 자리에 닿는지, 보스는 2x2 폭으로 닿는지, 닿을 수 없는 구멍은 벽으로 메우고(많으면 다시), 열린 비율. 실패하면 다른 시드로 최대 14번 → 그래도 안 되면 안전한 빈 방
// 좌표: 규약은 y=0이 맨 위 (X 오른쪽, Y 아래). TileMap 안쪽은 j가 위쪽(월드 Y-up)이라 (i,j) = (X, rows-1-Y)로 오간다.
// 시드: room.seed (Floor.generateFloor가 층 시드에서 방마다 뽑는다) — 같은 시드, 같은 층·방이면 같은 결과.
const MIN_OPEN = 0.45, MIN_OPEN_BOSS = 0.55;
const TileGenOptions = { perturb: true };   // 비대칭 섞기(perturb)를 끄고 켠다 (테스트에서 비교용)
const PERTURB_KINDS = new Set(["normal", "elite", "boss", "start", "ambush"]); // 설계가 정해진 특수 방(제단·가시·상점 등)은 건드리지 않는다
const TILE_CH = { ".": T.FLOOR, "#": T.WALL, "P": T.PILLAR, "R": T.ROCK, "C": T.CRATE, "B": T.BARREL, "V": T.PIT, "S": T.SPIKE, "a": T.ALTAR, "m": T.MACHINE, "p": T.PEDESTAL, "k": T.WALL };

function shapeOf(cells) {
  const n = cells.length; if (n === 1) return "1x1"; if (n === 4) return "2x2"; if (n === 3) return "L";
  return cells[0][1] === cells[1][1] ? "2x1" : "1x2";
}

class Generator {
  constructor(room, floor, players, rng, flip) {
    this.room = room; this.floor = floor; this.players = players; this.rng = rng; this.type = room.type;
    this.geo = roomGeo(room); const m = this.map = new TileMap(this.geo); this.W = m.cols; this.H = m.rows;
    this.fx = !!flip[0]; this.fy = !!flip[1]; this.shape = shapeOf(room.cells || [[0, 0]]);
    this.owner = m.cellOwner(); this.cells = m.cells.map(c => ({ cx: Math.round((c.i0) / TC), cy: Math.round((this.H - c.j0 - TR) / TR), X0: c.i0, Y0: this.H - c.j0 - TR, raw: c }));
    this.ownerS = this.cells.find(c => c.raw === this.owner);
    this.res = new Uint8Array(this.W * this.H);   // 예약(비워 둘 곳), 원래 틀 [Y*W+X]
    this.doors = []; this.links = []; this.entries = []; this.checks = []; this.gaps = []; this.crack = []; this.pad = null; this.bossSpawn = null; this.padNode = null; this.zones = []; this.names = []; this.placed = [];
    this._layoutDoors(); this._layoutLinks(); this._layoutPad();
  }
  // ── 좌표 도우미 (원래 틀: X 오른쪽, Y 아래) ──
  inside(X, Y) { return X >= 0 && Y >= 0 && X < this.W && Y < this.H && this.map.mask[(this.H - 1 - Y) * this.W + X] === 1; }
  border(X, Y) { return this.inside(X, Y) && !(this.inside(X - 1, Y) && this.inside(X + 1, Y) && this.inside(X, Y - 1) && this.inside(X, Y + 1)); }
  code(X, Y) { return this.map.t[(this.H - 1 - Y) * this.W + X]; }
  put(X, Y, v) { this.map.t[(this.H - 1 - Y) * this.W + X] = v; }
  reserve(X, Y) { if (X >= 0 && Y >= 0 && X < this.W && Y < this.H) this.res[Y * this.W + X] = 1; }
  isRes(X, Y) { return X >= 0 && Y >= 0 && X < this.W && Y < this.H && this.res[Y * this.W + X] === 1; }
  ij(X, Y) { return [X, this.H - 1 - Y]; }
  F(X, Y) { return [this.fx ? this.W - 1 - X : X, this.fy ? this.H - 1 - Y : Y]; }       // 원래 틀 ↔ 뒤집힌 틀 (자기 자신이 역함수)
  _layoutDoors() {
    const room = this.room, o = this.ownerS, set = new Set(Object.keys(room.nb || {})); if (room.secretDir) set.add(room.secretDir); const start = this.type === "start";
    if (start) set.add("S");
    for (const d of set) {
      let gap = [], inner = [], entry;
      if (d === "N") { gap = [[o.X0 + 7, o.Y0], [o.X0 + 8, o.Y0]]; entry = [o.X0 + 8, o.Y0 + 1]; for (let y = 0; y <= 2; y++) for (const x of [7, 8]) inner.push([o.X0 + x, o.Y0 + y]); }
      else if (d === "S") { gap = [[o.X0 + 7, o.Y0 + 8], [o.X0 + 8, o.Y0 + 8]]; entry = [o.X0 + 8, o.Y0 + 7]; for (let y = 6; y <= 8; y++) for (const x of [7, 8]) inner.push([o.X0 + x, o.Y0 + y]); }
      else if (d === "W") { gap = [3, 4, 5].map(y => [o.X0, o.Y0 + y]); entry = [o.X0 + 1, o.Y0 + 4]; for (let x = 0; x <= 2; x++) for (const y of [3, 4, 5]) inner.push([o.X0 + x, o.Y0 + y]); }
      else { gap = [3, 4, 5].map(y => [o.X0 + 15, o.Y0 + y]); entry = [o.X0 + 14, o.Y0 + 4]; for (let x = 13; x <= 15; x++) for (const y of [3, 4, 5]) inner.push([o.X0 + x, o.Y0 + y]); }
      for (const [x, y] of inner) this.reserve(x, y);
      const real = !!(room.nb && room.nb[d]), secret = room.secretDir === d && !real;
      if (start && d === "S" && !real) { this.entries.push(entry); this.checks.push(entry); continue; }         // 시작 방: 문 틈은 없고 시작 자리만
      this.doors.push({ side: d, x: gap[0][0], y: gap[0][1], gap, secret });
      if (secret) this.crack.push(...gap); else this.gaps.push(...gap);
      this.entries.push(entry); this.checks.push(entry);
    }
  }
  _layoutLinks() {
    const cs = this.cells;
    for (const a of cs) {
      const r = cs.find(c => c.cx === a.cx + 1 && c.cy === a.cy), d = cs.find(c => c.cx === a.cx && c.cy === a.cy + 1);
      if (r) { for (let y = 3; y <= 5; y++) for (let k = 14; k <= 17; k++) this.reserve(a.X0 + k, a.Y0 + y); const x = a.X0 + 16, y = a.Y0 + 4; this.links.push({ x, y, axis: "h" }); this.checks.push([a.X0 + 15, y]); }
      if (d) { for (let k = 6; k <= 9; k++) for (let q = 7; q <= 10; q++) this.reserve(a.X0 + k, a.Y0 + q); const x = a.X0 + 8, y = a.Y0 + 9; this.links.push({ x, y, axis: "v" }); this.checks.push([x, a.Y0 + 8]); }
    }
  }
  _layoutPad() { // 보스 등장 자리 4x4: 들어오는 문 반대쪽, 문에서 가장 먼 칸
    if (this.type !== "boss") return; const o = this.ownerS; let far = o, fd = -1; for (const c of this.cells) { const d = Math.abs(c.cx - o.cx) + Math.abs(c.cy - o.cy); if (d > fd) { fd = d; far = c; } }
    const side = (this.doors[0] && this.doors[0].side) || "S"; let x0, y0;
    if (side === "S") { x0 = 6; y0 = this.cells.length > 1 ? 3 : 1; } else if (side === "N") { x0 = 6; y0 = this.cells.length > 1 ? 2 : 4; } else if (side === "W") { x0 = 10; y0 = 2; } else { x0 = 2; y0 = 2; }
    for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + 4; x++) this.reserve(far.X0 + x, far.Y0 + y);
    this.pad = { X: far.X0 + x0, Y: far.Y0 + y0 }; const m = this.map;
    this.bossSpawn = { x: m.x0 + (this.pad.X + 2) * TILE, y: m.y0 + (this.H - this.pad.Y - 2) * TILE }; this.padNode = [this.pad.X + 1, this.H - 1 - (this.pad.Y + 2)]; // 2x2 블록 왼쪽 아래 타일(i, j)
    this.checks.push([this.pad.X + 2, this.pad.Y + 1]);
  }

  // ── 규약의 ctx (뒤집힌 틀 기준) ──
  makeCtx() {
    const W = this.W, H = this.H, rng = this.rng, self = this, flipCell = c => ({ cx: this.fx ? Math.max(...this.cells.map(k => k.cx)) - c.cx : c.cx, cy: this.fy ? Math.max(...this.cells.map(k => k.cy)) - c.cy : c.cy });
    const ctx = {
      w: W, h: H, play: { x0: 1, y0: 1, w: W - 2, h: H - 2 }, floor: this.floor, players: this.players, kind: this.type, shape: this.shape,
      cells: this.cells.map(flipCell), links: this.links.map(l => { const [x, y] = this.F(l.x, l.y); return { x, y, axis: l.axis }; }),
      doors: this.doors.map(d => { const [x, y] = this.F(d.x, d.y); const side = d.side === "N" ? (this.fy ? "S" : "N") : d.side === "S" ? (this.fy ? "N" : "S") : d.side === "E" ? (this.fx ? "W" : "E") : (this.fx ? "E" : "W"); return { side, x, y }; }),
      reserved: (x, y) => { const [X, Y] = this.F(x, y); return this.isRes(X, Y); },
      rng: () => rng.f(), int: (a, b) => rng.i(a, b), pick: arr => rng.pick(arr), chance: p => rng.chance(p),
      grid() { const g = []; for (let y = 0; y < H; y++) { const row = []; for (let x = 0; x < W; x++) { const [X, Y] = self.F(x, y); row.push(self.inside(X, Y) && (!self.border(X, Y) || self.gapAt(X, Y)) ? "." : "#"); } g.push(row); } return g; },
      fillRect(g, x, y, w, h, ch) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (yy >= 0 && xx >= 0 && yy < H && xx < W) g[yy][xx] = ch; },
      line(g, x0, y0, x1, y1, ch) { let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy; for (let n = 0; n < 4096; n++) { if (y0 >= 0 && x0 >= 0 && y0 < H && x0 < W) g[y0][x0] = ch; if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } } },
      ring(g, x, y, w, h, ch) { for (let xx = x; xx < x + w; xx++) { if (y >= 0 && y < H && xx >= 0 && xx < W) g[y][xx] = ch; if (y + h - 1 >= 0 && y + h - 1 < H && xx >= 0 && xx < W) g[y + h - 1][xx] = ch; } for (let yy = y; yy < y + h; yy++) { if (x >= 0 && x < W && yy >= 0 && yy < H) g[yy][x] = ch; if (x + w - 1 >= 0 && x + w - 1 < W && yy >= 0 && yy < H) g[yy][x + w - 1] = ch; } },
      mirrorH(g) { for (let y = 0; y < H; y++) for (let x = 0; x < W >> 1; x++) g[y][W - 1 - x] = g[y][x]; return g; },
      mirrorV(g) { for (let y = 0; y < H >> 1; y++) for (let x = 0; x < W; x++) g[H - 1 - y][x] = g[y][x]; return g; },
      stamp(g, rows, x, y) { for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) { const ch = rows[r][c]; if (ch === " " || y + r < 0 || x + c < 0 || y + r >= H || x + c >= W) continue; g[y + r][x + c] = ch; } }, // 공백은 건드리지 않음(투명), '.'은 바닥으로 덮어씀
    };
    return ctx;
  }
  gapAt(X, Y) { return this.gaps.some(g => g[0] === X && g[1] === Y) || this.crack.some(g => g[0] === X && g[1] === Y); }

  // ── rows(뒤집힌 틀) → TileMap (원래 틀) ──
  apply(out) {
    const W = this.W, H = this.H, rows = out && out.rows; if (!rows) return false;
    const at = (x, y) => { const r = rows[y]; if (!r) return "."; const ch = r[x]; return ch === undefined ? "." : ch; };
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
      if (!this.inside(X, Y)) continue; const [bx, by] = this.F(X, Y); const ch = at(bx, by); this.put(X, Y, TILE_CH[ch] ?? T.FLOOR);
    }
    this.finishFrame();
    this.zones = []; const world = z => { // 구역(타일 사각형, 뒤집힌 틀) → 월드 사각형
      const [a, b] = this.F(z.x, z.y), [c, d] = this.F(z.x + z.w - 1, z.y + z.h - 1), X0 = Math.min(a, c), X1 = Math.max(a, c), Y0 = Math.min(b, d), Y1 = Math.max(b, d), m = this.map;
      return { x: m.x0 + (X0 + X1 + 1) / 2 * TILE, y: m.y0 + (this.H - 1 - Y1 + this.H - Y0) / 2 * TILE, hw: (X1 - X0 + 1) * TILE / 2, hh: (Y1 - Y0 + 1) * TILE / 2, wt: z.weight ?? 1 };
    };
    for (const z of (out.zones || [])) if (z && z.w > 0 && z.h > 0) this.zones.push(world(z));
    return true;
  }
  // 생성기가 그리는 것: 바깥 테두리 벽 · 문 틈 · 금 간 벽 · 예약 구역 비우기
  finishFrame() {
    for (let Y = 0; Y < this.H; Y++) for (let X = 0; X < this.W; X++) { if (!this.inside(X, Y)) continue; if (this.border(X, Y)) this.put(X, Y, T.WALL); else if (this.isRes(X, Y)) this.put(X, Y, T.FLOOR); }
    for (const [X, Y] of this.gaps) this.put(X, Y, T.FLOOR);
    for (const [X, Y] of this.crack) this.put(X, Y, T.CRACK);
  }
}

// ── 스탬프 찍기 ──
function stampWorldFree(G, X, Y) { return G.inside(X, Y) && !G.isRes(X, Y) && !G.border(X, Y) && G.code(X, Y) === T.FLOOR; }
const cxOf = (X, w) => X + w / 2, cyOf = (Y, h) => Y + h / 2;
function placeStamp(G, st, rng, strictCheck) {
  const pat0 = st.rows.map(r => typeof r === "string" ? r : r.join("")), fh = st.mirror !== false && rng.chance(0.5), fv = st.mirror !== false && rng.chance(0.5), h = pat0.length, w = Math.max(...pat0.map(r => r.length));
  const pat = []; for (let y = 0; y < h; y++) { const src = pat0[fv ? h - 1 - y : y].padEnd(w, "."); pat.push(fh ? src.split("").reverse().join("") : src); }
  const W = G.W, H = G.H, anchor = st.anchor || "any";
  for (let t = 0; t < 30; t++) {
    let X = rng.i(1, W - 1 - w), Y = rng.i(1, H - 1 - h);
    if (anchor === "any" && Math.abs(X + w / 2 - W / 2) < 2 && rng.chance(0.6)) { X = rng.i(1, W - 1 - w); Y = rng.i(1, H - 1 - h); } // 대칭축(가운데 세로선) 근처는 덜 고른다
    let ok = true;
    if (G.placed.some(q => q.id === st.id && (Math.abs(q.cx - (W - cxOf(X, w))) <= 1.5 && Math.abs(q.cy - cyOf(Y, h)) <= 1.5 || Math.abs(q.cx - cxOf(X, w)) <= 1.5 && Math.abs(q.cy - (H - cyOf(Y, h))) <= 1.5 || Math.abs(q.cx - (W - cxOf(X, w))) <= 1.5 && Math.abs(q.cy - (H - cyOf(Y, h))) <= 1.5))) continue; // 같은 스탬프를 거울 쌍으로 놓지 않는다
    for (let y = 0; y < h && ok; y++) for (let x = 0; x < w; x++) if (!stampWorldFree(G, X + x, Y + y)) { ok = false; break; }
    if (!ok) continue;
    let nearWall = false; // 둘레 한 타일: 안에 있고 장애물이 없어야 한다 (edge 앵커는 벽 옆을 허용)
    for (let y = -1; y <= h && ok; y++) for (let x = -1; x <= w; x++) {
      if (y >= 0 && y < h && x >= 0 && x < w) continue; const a = X + x, b = Y + y;
      if (!G.inside(a, b)) { ok = false; break; } const c = G.code(a, b);
      if (G.border(a, b) || c === T.WALL || c === T.CRACK) { if (anchor === "edge" || anchor === "corner") { nearWall = true; continue; } ok = false; break; }
      if (T_SOLID[c]) { ok = false; break; }
    }
    if (!ok) continue;
    const cx = X + w / 2, cy = Y + h / 2;
    if (anchor === "center" && (Math.abs(cx - W / 2) > W * 0.2 || Math.abs(cy - H / 2) > H * 0.25)) continue;
    if (anchor === "edge" && !nearWall) continue;
    if (anchor === "corner" && !(nearWall && (X <= 3 || X + w >= W - 3) && (Y <= 3 || Y + h >= H - 3))) continue;
    const saved = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { saved.push([X + x, Y + y, G.code(X + x, Y + y)]); const ch = pat[y][x]; G.put(X + x, Y + y, ch === "." ? T.FLOOR : TILE_CH[ch] ?? T.FLOOR); }
    if (strictCheck(G)) { G.placed.push({ id: st.id, cx: cxOf(X, w), cy: cyOf(Y, h) }); return true; }
    for (const [a, b, c] of saved) G.put(a, b, c);
  }
  return false;
}

// ── 검증 ──
function quickConnected(G) { // 모든 검사점이 한 문에서 이어지는가 (부서지는 상자·통도 막힌 것으로 봄)
  const m = G.map, e0 = G.entries[0] || G.checks[0]; if (!e0) return false;
  const reach = floodTiles(m, [G.ij(e0[0], e0[1])], 0);
  for (const [X, Y] of G.checks) { const [i, j] = G.ij(X, Y); if (!m.free(i, j) || !reach[j * m.cols + i]) return false; }
  if (G.type === "boss" && G.padNode) { const w = floodTiles(m, [G.padNode], 1); if (!w[G.padNode[1] * m.cols + G.padNode[0]]) return false; for (const [X, Y] of G.checks) { const [i, j] = G.ij(X, Y); if (![[i, j], [i - 1, j], [i, j - 1], [i - 1, j - 1]].some(([a, b]) => m.inb(a, b) && w[b * m.cols + a])) return false; } }
  return true;
}
function validate(G) {
  const m = G.map; if (!quickConnected(G)) return { ok: false, why: "connect" };
  const e0 = G.entries[0] || G.checks[0], soft = floodTiles(m, [G.ij(e0[0], e0[1])], 2); let freeN = 0, lost = 0, maskN = 0;
  for (let k = 0; k < m.t.length; k++) { if (m.mask[k]) maskN++; if (m.mask[k] && !T_SOLID[m.t[k]]) { freeN++; if (!soft[k]) lost++; } }
  if (lost > freeN * 0.12) return { ok: false, why: "pockets" };
  for (let k = 0; k < m.t.length; k++) if (m.mask[k] && !T_SOLID[m.t[k]] && !soft[k]) m.t[k] = T.WALL; // 닿을 수 없는 구멍은 벽으로 메운다
  const open = (freeN - lost) / Math.max(1, maskN);
  if (open < (G.type === "boss" ? MIN_OPEN_BOSS : PERTURB_KINDS.has(G.type) ? MIN_OPEN : 0.08)) return { ok: false, why: "open" }; // 비밀방 같은 작은 방은 열린 비율 조건이 느슨하다
  return { ok: true, reach: soft, ratio: open };
}

function pickArchetype(kind, shape, floor, rng) {
  let list = TileContent.archetypesFor(kind, shape, floor); if (!list.length) list = TileContent.archetypes.filter(a => a.kinds.includes(kind) && a.shapes.includes(shape)); // 층 범위 밖이어도 같은 종류·모양이면
  return list.length ? rng.weighted(list, a => a.weight) : null;                      // 없으면 null → 빈 방 (테두리·문만)
}
// 비대칭 섞기: 스탬프까지 놓은 뒤, 부서지는 작은 지형(상자·바위·통·기둥)을 몇 개 지우고 몇 개 새로 놓는다. 새로 놓을 때마다 흐름을 다시 검사해 막히면 되돌린다.
// 거울 대칭(콘텐츠가 만든 대칭, 뒤집기로 생긴 대칭)이 한눈에 티 나지 않게 하려는 가벼운 손질이다.
const PERTURB_ADD = [T.CRATE, T.CRATE, T.ROCK, T.PILLAR, T.BARREL];
const crowded = (G, X, Y) => { let n = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = G.code(X + dx, Y + dy); if (c !== T.WALL && T_SOLID[c]) n++; } return n > 0; }; // 다른 작은 지형과 바로 붙지 않게 (벽 옆은 괜찮다)
function perturb(G, rng) {
  const W = G.W, H = G.H, k = Math.pow(G.cells.length, 0.9), small = c => c === T.CRATE || c === T.ROCK || c === T.BARREL || c === T.PILLAR, cand = [];
  for (let Y = 1; Y < H - 1; Y++) for (let X = 1; X < W - 1; X++) if (G.inside(X, Y) && !G.isRes(X, Y) && small(G.code(X, Y))) cand.push([X, Y]);
  const nRem = Math.min(cand.length, Math.round(rng.i(1, 3) * k));
  for (let n = 0; n < nRem; n++) { const [X, Y] = cand[rng.i(0, cand.length - 1)]; G.put(X, Y, T.FLOOR); }             // 지우기 (길을 막지 않으니 검사 필요 없음)
  const nAdd = Math.round(rng.i(2, 4) * k);
  for (let n = 0, t = 0; n < nAdd && t < 60; t++) {
    const X = rng.i(1, W - 2), Y = rng.i(1, H - 2); if (!stampWorldFree(G, X, Y) || G.placed.some(q => Math.abs(q.cx - X) < 1 && Math.abs(q.cy - Y) < 1)) continue;
    if (crowded(G, X, Y)) continue;
    G.put(X, Y, rng.pick(PERTURB_ADD)); if (quickConnected(G)) n++; else G.put(X, Y, T.FLOOR);
  }
}
// 방이 거울 대칭에 얼마나 가까운가 (놓인 지형 중 좌우/상하/180° 거울 자리에 같은 종류가 있는 비율의 최댓값)
function symmetry(G) {
  const W = G.W, H = G.H; let sc = 0, mh = 0, mv = 0, mr = 0;
  for (let Y = 1; Y < H - 1; Y++) for (let X = 1; X < W - 1; X++) { const c = G.code(X, Y); if (!G.inside(X, Y) || !T_SOLID[c] || c === T.CRACK) continue; sc++; if (G.inside(W - 1 - X, Y) && G.code(W - 1 - X, Y) === c) mh++; if (G.inside(X, H - 1 - Y) && G.code(X, H - 1 - Y) === c) mv++; if (G.inside(W - 1 - X, H - 1 - Y) && G.code(W - 1 - X, H - 1 - Y) === c) mr++; }
  return sc < 5 ? 0 : Math.max(mh, mv, mr) / sc;
}
// 아직 너무 대칭이면: 거울 자리가 비어 있는 곳에 작은 지형을 더 놓고(대칭을 깨는 쪽으로), 거울 짝이 있는 작은 지형 하나를 지운다
function breakSymmetry(G, rng) {
  const W = G.W, H = G.H;
  for (let step = 0; step < 16 && symmetry(G) >= 0.72; step++) {
    for (let t = 0; t < 40; t++) {
      const X = rng.i(1, W - 2), Y = rng.i(1, H - 2); if (!stampWorldFree(G, X, Y)) continue;
      const mirrors = [[W - 1 - X, Y], [X, H - 1 - Y], [W - 1 - X, H - 1 - Y]]; if (mirrors.some(([a, b]) => G.inside(a, b) && T_SOLID[G.code(a, b)])) continue; // 거울 자리가 비어 있어야 대칭이 깨진다
      if (crowded(G, X, Y)) continue; G.put(X, Y, rng.pick(PERTURB_ADD)); if (quickConnected(G)) break; G.put(X, Y, T.FLOOR);
    }
    for (let t = 0; t < 30; t++) { const X = rng.i(1, W - 2), Y = rng.i(1, H - 2), c = G.code(X, Y); if (!G.inside(X, Y) || G.isRes(X, Y) || !(c === T.CRATE || c === T.ROCK || c === T.BARREL)) continue; const mc = G.inside(W - 1 - X, Y) ? G.code(W - 1 - X, Y) : -1; if (mc === c) { G.put(X, Y, T.FLOOR); break; } }
  }
}
// 밀도: 전투 방이 너무 휑하면(안쪽 열린 비율이 목표보다 높으면) 스탬프를 몇 개 더 놓는다. 목표는 방마다 0.70~0.83 사이에서 무작위.
const DENSITY_KINDS = new Set(["normal", "elite"]), DENSITY_TARGET = [0.70, 0.83];
function openRatio(G) { let inner = 0, free = 0; for (let Y = 1; Y < G.H - 1; Y++) for (let X = 1; X < G.W - 1; X++) { if (!G.inside(X, Y) || G.border(X, Y)) continue; inner++; if (!T_SOLID[G.code(X, Y)]) free++; } return inner ? free / inner : 1; }
function topUp(G, rng, a, floor) {
  const target = DENSITY_TARGET[0] + rng.f() * (DENSITY_TARGET[1] - DENSITY_TARGET[0]); let pool = [];
  if (a && a.stampSets) for (const set of a.stampSets) pool.push(...TileContent.stampsFor(set, floor));
  if (!pool.length) pool = TileContent.stampsFor(null, floor).filter(st => st.rows.length * st.rows[0].length <= 12); // B가 없는 구성은 작은 스탬프 아무거나
  if (!pool.length) return;
  for (let k = 0; k < 12 && openRatio(G) > target; k++) { const st = rng.weighted(pool, x => x.weight); if (st) placeStamp(G, st, rng, quickConnected); }
}
function buildOnce(room, floor, players, rng) {
  const flip = [rng.chance(0.5), rng.chance(0.5)], G = new Generator(room, floor, players, rng, flip), a = pickArchetype(room.type, G.shape, floor, rng);
  G.names.push(a ? a.id : "empty"); G.arch = a;
  if (a) { const out = a.build(G.makeCtx()) || {}; if (!G.apply(out)) { G.finishFrame(); } G.slots = out.slots || null; } else G.finishFrame();
  if (a && a.stampSets && a.stampSets.length) { // B: 스탬프
    const pool = []; for (const set of a.stampSets) for (const s of TileContent.stampsFor(set, floor)) pool.push(s);
    const [lo, hi] = a.stampCount || [0, 0], n = Math.round(rng.i(lo, hi) * Math.pow(G.cells.length, 0.9)), used = new Set();
    for (let k = 0; k < n && pool.length; k++) { const st = rng.weighted(pool, s => s.weight); if (st && placeStamp(G, st, rng, quickConnected)) used.add(st.set || st.id); }
    for (const s of used) G.names.push(s);
  }
  if (DENSITY_KINDS.has(room.type)) topUp(G, rng, a, floor); // 너무 휑하면 스탬프를 더 놓는다
  if (TileGenOptions.perturb && PERTURB_KINDS.has(room.type)) { perturb(G, rng); breakSymmetry(G, rng); }
  G.finishFrame();
  return G;
}
// 바깥 테두리: 칸의 가장자리 한 줄은 이제 벽이 아니라 걸을 수 있는 바닥이다. 벽은 칸 바깥에 얇은 띠(WALL_BAND)로 그려지고, 충돌 벽은 칸 가장자리에 있다 (Game._buildWalls).
// 생성·검증은 예전처럼 안쪽(14x7) 기준으로 끝낸 뒤 마지막에 테두리를 바닥으로 바꾼다. 금 간 벽(비밀방 입구)은 타일이 아니라 바깥 벽 띠 위의 지형(crackRects)이다.
const CRACK_IN = 10; // 금 간 벽이 칸 안쪽으로 튀어나오는 깊이 (탄·폭발이 닿게)
function finalizeRing(G, v) {
  const m = G.map;
  for (let Y = 0; Y < G.H; Y++) for (let X = 0; X < G.W; X++) { if (!G.inside(X, Y)) continue; const c = G.code(X, Y); if ((c === T.WALL || c === T.CRACK) && G.border(X, Y)) G.put(X, Y, T.FLOOR); }
  const rects = [], o = G.owner, th = WALL_BAND + CRACK_IN, off = (WALL_BAND - CRACK_IN) / 2;
  for (const d of G.doors) if (d.secret) {
    const len = d.gap.length * TILE;
    if (d.side === "N") rects.push({ x: o.x, y: o.y + CELL_H / 2 + off, w: len, h: th }); else if (d.side === "S") rects.push({ x: o.x, y: o.y - CELL_H / 2 - off, w: len, h: th });
    else if (d.side === "E") rects.push({ x: o.x + CELL_W / 2 + off, y: o.y, w: th, h: len }); else rects.push({ x: o.x - CELL_W / 2 - off, y: o.y, w: th, h: len });
  }
  m.crackRects = rects.length ? rects : null;
  const e0 = G.entries[0] || G.checks[0]; if (e0) v.reach = floodTiles(m, [G.ij(e0[0], e0[1])], 2); // 테두리 바닥까지 포함해서 다시
  return v;
}
function buildLayout(room, floor = 3, players = 1) {
  const base = (room.seed != null ? room.seed : (room.seed = (Math.random() * 4294967296) >>> 0)) >>> 0;
  for (let attempt = 0; attempt < 14; attempt++) {
    const G = buildOnce(room, floor, players, new Rng(hash2(base, attempt + 1))), v = validate(G);
    if (v.ok) return finishLayout(G, finalizeRing(G, v), attempt + 1, false);
  }
  // 안전한 빈 방: 테두리·문·예약 구역만 (모든 시도가 실패했을 때)
  const G = new Generator(room, floor, players, new Rng(base), [false, false]); G.names.push("fallback"); G.finishFrame();
  const v = validate(G); return finishLayout(G, finalizeRing(G, v.ok ? v : { ok: true, reach: floodTiles(G.map, [G.ij(...(G.entries[0] || G.checks[0] || [1, 1]))], 2), ratio: 1 }), 15, true);
}
// 콘텐츠가 알려준 slots(뒤집힌 틀의 타일 좌표 [x,y])를 월드 좌표 {x,y}로 바꾼다 (배열·중첩 배열 모두)
function mapSlots(G, slots) {
  if (!slots) return null; const m = G.map, isPt = a => Array.isArray(a) && a.length === 2 && typeof a[0] === "number" && typeof a[1] === "number";
  const conv = v => { if (isPt(v)) { const [X, Y] = G.F(v[0], v[1]); return { x: m.cx(X), y: m.cy(G.H - 1 - Y) }; } return Array.isArray(v) ? v.map(conv) : v; };
  const out = {}; for (const k of Object.keys(slots)) out[k] = conv(slots[k]); return out;
}
function finishLayout(G, v, attempts, fallback) {
  const m = G.map, reach = v.reach, zones = G.zones.filter(z => { // 도달 가능한 타일이 4개 이상 있는 구역만
    let n = 0; const i0 = Math.max(0, m.ti(z.x - z.hw + 1)), i1 = Math.min(m.cols - 1, m.ti(z.x + z.hw - 1)), j0 = Math.max(0, m.tj(z.y - z.hh + 1)), j1 = Math.min(m.rows - 1, m.tj(z.y + z.hh - 1));
    for (let j = j0; j <= j1 && n < 4; j++) for (let i = i0; i <= i1; i++) if (reach[j * m.cols + i] && !T_SOLID[m.t[j * m.cols + i]]) { n++; if (n >= 4) break; }
    return n >= 4;
  });
  let spikes = null, pedestals = null;
  for (let j = 0; j < m.rows; j++) for (let i = 0; i < m.cols; i++) { const c = m.t[j * m.cols + i]; if (c === T.SPIKE) (spikes || (spikes = [])).push({ x: m.cx(i), y: m.cy(j), hw: TILE / 2, hh: TILE / 2, ph: j * 0.62 + i * 0.11 + (j & 1 ? 0.3 : 0) }); else if (c === T.PEDESTAL) (pedestals || (pedestals = [])).push({ x: m.cx(i), y: m.cy(j) }); }
  if (pedestals) pedestals.sort((a, b) => b.y - a.y || a.x - b.x);
  return { map: m, reach, zones, bossSpawn: G.bossSpawn, names: G.names, ratio: v.ratio, spikes, pedestals, spots: pedestals ? pedestals.slice().sort((a, b) => a.x - b.x) : null, slots: G.slots || null, slotsW: mapSlots(G, G.slots), attempts, fallback, grid: null, flip: [G.fx, G.fy], shape: G.shape };
}
// 도달 가능한 자리인가 (타일 기준). 레이아웃이 없으면 true
function layoutReach(lay, x, y) {
  const m = lay && lay.map; if (!m) return true; const i = m.ti(x), j = m.tj(y);
  return m.inb(i, j) && lay.reach[j * m.cols + i] === 1 && m.mask[j * m.cols + i] === 1;
}
// Game.enterRoom이 부른다: 레이아웃을 만들어 room.layout / room.tiles에 붙이고 지형 배열을 돌려준다
function generateObstacles(room, floor = 3, players = 1) {
  const lay = buildLayout(room, floor, players); room.layout = lay; room.tiles = lay.map; return lay.map.toObstacles();
}
const TPL_NAMES = () => TileContent.archetypes.map(a => a.id);
