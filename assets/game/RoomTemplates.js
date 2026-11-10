// 방 템플릿 목록과 레이아웃 생성·검사. (LayoutBuilder / buildMaze는 Rooms.js)
// 좌표는 "틀" 기준: 칸 템플릿은 칸 가운데가 (0,0), 반폭 200x112. y는 위쪽이 +. 틀은 좌우/상하로 무작위로 뒤집힌다.
// 템플릿 필드: id, w(가중치), fn(L), min/max(등장 층), start(시작 방에도 쓸 수 있음), need(L)=>bool (방 전체 템플릿의 조건)

// ── 칸 하나에 쓰는 템플릿 ─────────────────────────────────────────────────────────────
const CELL_TPL = [
  { id: "open", w: 1, start: true, fn: L => { if (Math.random() < 0.6) { L.BR(-70, 0); L.BR(70, 0); } } },
  { id: "pillars4", w: 3, start: true, fn: L => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) L.P(sx * 95, sy * 42); } },
  { id: "pillarGrid", w: 2.4, start: true, fn: L => { for (const x of [-135, -70, 70, 135]) for (const y of [-50, 50]) L.P(x, y); } },
  { id: "pillarRing", w: 2, start: true, fn: L => { for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; L.P(Math.cos(a) * 90, Math.sin(a) * 50); } } },
  { id: "plusPillars", w: 1.4, fn: L => { L.P(-58, 0); L.P(58, 0); L.P(0, 50); L.P(0, -50); L.zone(0, 0, 340, 190); } },
  { id: "mirrorCover", w: 2.4, start: true, fn: L => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) L.WH(sx * 100, sy * 55, 70); L.P(0, 0); } },
  { id: "rockCheckers", w: 2, start: true, fn: L => { for (const [x, y] of [[-130, -50], [-130, 50], [-65, 0], [0, -50], [0, 50], [65, 0], [130, -50], [130, 50]]) L.RK(x, y); } },
  { id: "diagonal", w: 2, fn: L => { for (const [x, y] of [[-140, -60], [-70, -30], [0, 0], [70, 30], [140, 60]]) L.P(x, y); L.BR(-140, 60); L.BR(140, -60); } },
  { id: "pinwheel", w: 2.2, fn: L => { L.WH(-50, 46, 100); L.WV(96, 24, 100); L.WH(50, -46, 100); L.WV(-96, -24, 100); L.zone(0, 0, 200, 110, 2); L.zone(0, 0, 360, 200, 1); } },
  { id: "cornerBunkers", w: 2.4, fn: L => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) { L.WH(sx * 125, sy * 78, 76); L.WV(sx * 100, sy * 48, 40); } L.zone(0, 0, 220, 130, 3); L.zone(0, 0, 360, 200, 1); } },
  { id: "lanesH", w: 2, fn: L => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) L.WH(sx * 105, sy * 52, 100); L.zone(0, 0, 260, 76, 2); L.zone(0, 0, 360, 200, 1); } },
  { id: "lanesV", w: 2, fn: L => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) L.WV(sx * 88, sy * 58, 78); } },
  { id: "zigzag", w: 1.8, min: 2, fn: L => { L.WV(-110, 22, 70); L.WV(0, -18, 70); L.WV(110, 22, 70); } },
  { id: "tunnel", w: 1.8, fn: L => { L.WH(0, 48, 240); L.WH(0, -48, 240); L.zone(0, 0, 300, 56, 4); L.zone(0, 0, 360, 200, 1); } },
  { id: "centerFort", w: 2, min: 2, fn: L => { L.WH(0, 34, 100); L.WH(0, -34, 100); for (const sx of [-1, 1]) for (const sy of [-1, 1]) L.BR(sx * 85, sy * 24); L.zone(0, 0, 90, 44, 3); L.zone(0, 0, 340, 190, 1); } },
  { id: "arenaGates", w: 2.8, min: 2, fn: L => { L.ring(128, 58, { N: 0, S: 0, E: 0, W: 0 }); L.zone(0, 0, 200, 64, 1); } },                 // 벽으로 둘러싸인 가운데에서만 싸운다 (사방 문)
  { id: "arenaPinwheel", w: 2.4, min: 2, fn: L => { L.ring(128, 58, { N: 70, E: -30, S: -70, W: 30 }); L.zone(0, 0, 200, 64, 1); } },       // 틈이 엇갈린 벽 (바로 안 보임)
  { id: "crateLattice", w: 3, fn: L => { for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) { const x = -150 + c * 50 + (r & 1 ? 0 : 0), y = -75 + r * 50, q = Math.random(); if (q < 0.2) continue; if (q < 0.32) L.BR(x, y); else L.CR(x, y); } L.zone(0, 0, 380, 200, 1); } },
  { id: "crateBlocks", w: 2.4, fn: L => { for (const [x, y] of shuffled([[-120, 45], [120, 45], [-120, -45], [120, -45], [0, 0]]).slice(0, 3)) L.clump(x, y); L.zone(0, 0, 380, 200, 1); } },
  { id: "crateWall", w: 2, fn: L => { for (const y of [-46, 46]) for (let x = -132; x <= 132; x += 22) L.add(Math.random() < 0.12 ? "barrel" : "crate", x, y, 22, 22, undefined); L.zone(0, 0, 300, 56, 4); L.zone(0, 0, 380, 200, 1); } },
  { id: "cornerCrates", w: 1.8, fn: L => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) L.clump(sx * 150, sy * 72); for (const x of [-80, -36, 36, 80]) L.BR(x, 0); } },
  { id: "barrelMoat", w: 1.8, min: 2, fn: L => { for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; L.BR(Math.cos(a) * 92, Math.sin(a) * 52); } L.P(0, 0); } },
  { id: "islands", w: 1.2, fn: L => { const cs = []; for (let t = 0; t < 40 && cs.length < 3; t++) { const x = rndr(-150, 150), y = rndr(-70, 70); if (cs.every(c => Math.hypot(c[0] - x, c[1] - y) > 95)) cs.push([x, y]); } for (const [x, y] of cs) { const k = rndi(0, 2); if (k === 0) { L.RK(x, y); L.P(x + 34, y + 10); } else if (k === 1) { L.RK(x - 20, y); L.RK(x + 20, y + 22); L.CR(x, y - 24); } else { L.P(x, y); L.CR(x + 24, y); L.CR(x - 24, y); } } } },
  { id: "maze", w: 1.5, min: 2, fn: L => { buildMaze(L, L.ox, L.oy, CELL_W, CELL_H); } },
];

// ── 방 전체(큰 방)에 쓰는 템플릿 ────────────────────────────────────────────────────────
const ROOM_TPL = [
  { id: "bigMaze", w: 2.4, min: 3, need: L => true, fn: L => { buildMaze(L, 0, 0, L.W, L.H); } },
  { id: "bigArena", w: 3, min: 2, need: L => L.geo.voids.length === 0, fn: L => {
    const RX = Math.min(L.W / 2 - 74, 270), RY = Math.min(L.H / 2 - 54, 150); L.ring(RX, RY, { N: 0, S: 0, E: 0, W: 0 });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) L.P(sx * (L.W / 2 - 34), sy * (L.H / 2 - 30)); L.zone(0, 0, RX * 2 - 40, RY * 2 - 40, 1); } },
  { id: "colonnade", w: 2.4, need: L => L.geo.voids.length === 0, fn: L => {
    const ys = L.H < 300 ? [-60, 60] : [-165, -60, 60, 165]; for (let x = -L.W / 2 + 70; x <= L.W / 2 - 70; x += 80) for (const y of ys) L.P(x, y); } },
  { id: "crateSea", w: 3, need: L => true, fn: L => {
    for (let x = -L.W / 2 + 50; x <= L.W / 2 - 50; x += 50) for (let y = -L.H / 2 + 38; y <= L.H / 2 - 30; y += 50) { const q = Math.random(); if (q < 0.26) continue; if (q < 0.38) L.BR(x, y); else L.CR(x, y); }
    L.zone(0, 0, L.W - 20, L.H - 20, 1); } },
  { id: "dividedHall", w: 2, need: L => L.geo.voids.length === 0, fn: L => {
    if (L.W > L.H * 1.5) { for (const y of [-80, 0, 80]) L.WV(0, y, 80); for (const x of [-190, 190]) L.WH(x, 0, 100); } else { for (const x of [-120, 0, 120]) L.WH(x, 0, 90); L.WV(0, 0, 60); }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) L.RK(sx * (L.W / 2 - 60), sy * (L.H / 2 - 36)); } },
];

// ── 보스 방 템플릿: 보스 등장 자리(위쪽)와 가운데는 넓게 비우고, 엄폐물만 둔다 ──────────────────────
const BOSS_TPL = [
  { id: "bossOpen", w: 1, fn: L => { for (const sx of [-1, 1]) L.BR(sx * 150, -70); } },
  { id: "bossCover4", w: 3, fn: L => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) L.P(sx * 120, sy * 55); } },
  { id: "bossRing", w: 2.4, fn: L => { for (const [x, y] of [[110, 0], [-110, 0], [80, -55], [-80, -55], [80, 55], [-80, 55]]) L.P(x, y); } },
  { id: "bossBunkers", w: 2.4, fn: L => { for (const sx of [-1, 1]) { L.WV(sx * 105, -10, 80); L.WH(sx * 90, -50, 52); L.CR(sx * 105, 60); L.CR(sx * 105, 84); } } },
  { id: "bossColumns", w: 2, fn: L => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) L.RK(sx * 100, sy * 45); } },
  { id: "bossCrates", w: 2, fn: L => { for (const sx of [-1, 1]) { L.clump(sx * 145, -70); L.BR(sx * 140, 0); L.P(sx * 100, 0); } } },
];

const TPL_NAMES = [...CELL_TPL, ...ROOM_TPL, ...BOSS_TPL].map(t => t.id);

function pickTpl(list, floor, type, L) {
  const ok = list.filter(t => (t.min || 1) <= floor && (t.max || 99) >= floor && (type !== "start" || t.start) && (!t.need || t.need(L)));
  let tot = 0; for (const t of ok) tot += t.w; if (!ok.length || tot <= 0) return null;
  let r = Math.random() * tot; for (const t of ok) { r -= t.w; if (r < 0) return t; }
  return ok[ok.length - 1];
}

function applyTemplates(L, room, floor) {
  const type = room.type, boss = type === "boss";
  if (type === "start" && Math.random() < 0.4) { L.names.push("start-open"); return; }  // 시작 방은 비어 있을 때가 많다
  const list = boss ? BOSS_TPL : CELL_TPL, flip = () => [Math.random() < 0.5 ? -1 : 1, Math.random() < 0.5 ? -1 : 1];
  if (L.cells.length > 1 && !boss && type !== "start" && Math.random() < 0.55) {
    const t = pickTpl(ROOM_TPL, floor, type, L);
    if (t) { const [fx, fy] = flip(); L.frame(0, 0, fx, fy); t.fn(L); L.names.push(t.id); return; }
  }
  const same = Math.random() < 0.3 ? pickTpl(list, floor, type, L) : null;
  for (const c of L.cells) {
    const t = same || pickTpl(list, floor, type, L); if (!t) continue;
    const [fx, fy] = flip(); L.frame(c.x, c.y, fx, fy); t.fn(L); L.names.push(t.id);
  }
}

// ── 검사: 격자 flood fill. 모든 장애물을 "막힘"으로 보고(부서지는 것도), 적 크기만큼 부풀려서 문·통로·보스 자리가 이어지는지 본다 ───────
const GRID_G = 6;
function analyzeLayout(L) {
  const G = GRID_G, nx = Math.ceil(L.W / G), ny = Math.ceil(L.H / G), x0 = -L.W / 2, y0 = -L.H / 2, N = nx * ny, walk = new Uint8Array(N), free = new Uint8Array(N);
  const E = L.clear; // 지나다니는 적의 크기만큼 바깥 벽에서도 떨어진 자리만 센다
  for (const c of L.cells) { // 서 있을 수 있는 곳: 칸 안쪽 (바깥으로 막힌 변은 E만큼 안쪽)
    const l = c.x - CELL_HX + (L.has(c.dx - 1, c.dy) ? -G : E), r = c.x + CELL_HX - (L.has(c.dx + 1, c.dy) ? -G : E);
    const b = c.y - CELL_HY + (L.has(c.dx, c.dy - 1) ? -G : E), t = c.y + CELL_HY - (L.has(c.dx, c.dy + 1) ? -G : E);
    const i0 = Math.max(0, Math.floor((l - x0) / G)), i1 = Math.min(nx - 1, Math.floor((r - x0) / G)), j0 = Math.max(0, Math.floor((b - y0) / G)), j1 = Math.min(ny - 1, Math.floor((t - y0) / G));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const px = x0 + (i + 0.5) * G, py = y0 + (j + 0.5) * G; if (px >= l && px <= r && py >= b && py <= t) walk[j * nx + i] = 1; }
  }
  free.set(walk);
  const cl = L.clear;
  for (const o of L.obs) { // 장애물(부풀림)
    const hw = o.w / 2 + cl, hh = o.h / 2 + cl, i0 = Math.max(0, Math.floor((o.x - hw - x0) / G)), i1 = Math.min(nx - 1, Math.floor((o.x + hw - x0) / G)), j0 = Math.max(0, Math.floor((o.y - hh - y0) / G)), j1 = Math.min(ny - 1, Math.floor((o.y + hh - y0) / G));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = x0 + (i + 0.5) * G, py = y0 + (j + 0.5) * G, dx = px - o.x, dy = py - o.y;
      if (o.kind === "barrel" || o.kind === "altar") { if (Math.hypot(dx, dy) < o.w / 2 + cl) free[j * nx + i] = 0; }
      else if (Math.abs(dx) < hw && Math.abs(dy) < hh) free[j * nx + i] = 0;
    }
  }
  const idx = (x, y) => { const i = Math.floor((x - x0) / G), j = Math.floor((y - y0) / G); return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i; };
  const reach = new Uint8Array(N), q = new Int32Array(N); let qh = 0, qt = 0, total = 0;
  for (let k = 0; k < N; k++) if (free[k]) total++;
  const seeds = [L.entries[0] || L.checks[0] || { x: L.owner.x, y: L.owner.y }]; // 한 문에서 출발해서 나머지 문·통로·보스 자리에 모두 닿아야 한다
  for (const s of seeds) { const k = idx(s.x, s.y); if (k >= 0 && free[k] && !reach[k]) { reach[k] = 1; q[qt++] = k; } }
  while (qh < qt) {
    const k = q[qh++], i = k % nx, j = (k - i) / nx;
    if (i > 0 && free[k - 1] && !reach[k - 1]) { reach[k - 1] = 1; q[qt++] = k - 1; }
    if (i < nx - 1 && free[k + 1] && !reach[k + 1]) { reach[k + 1] = 1; q[qt++] = k + 1; }
    if (j > 0 && free[k - nx] && !reach[k - nx]) { reach[k - nx] = 1; q[qt++] = k - nx; }
    if (j < ny - 1 && free[k + nx] && !reach[k + nx]) { reach[k + nx] = 1; q[qt++] = k + nx; }
  }
  let ok = qt > 0 && total > 0 && qt / total >= 0.7;
  for (const c of L.checks) { const k = idx(c.x, c.y); if (k < 0 || !reach[k]) { ok = false; break; } }
  return { ok, grid: { reach, nx, ny, x0, y0, G }, ratio: total ? qt / total : 0 };
}
// 도달 가능한 자리인가 (격자 기준). 격자가 없으면 true
function layoutReach(lay, x, y) {
  const g = lay && lay.grid; if (!g) return true;
  const i = Math.floor((x - g.x0) / g.G), j = Math.floor((y - g.y0) / g.G); return i >= 0 && j >= 0 && i < g.nx && j < g.ny && g.reach[j * g.nx + i] === 1;
}

function finishLayout(L, an, extra) {
  const g = an.grid, zones = L.zones.filter(z => { // 도달 가능한 격자가 4칸 이상 있는 구역만
    let n = 0; const i0 = Math.max(0, Math.floor((z.x - z.hw - g.x0) / g.G)), i1 = Math.min(g.nx - 1, Math.floor((z.x + z.hw - g.x0) / g.G)), j0 = Math.max(0, Math.floor((z.y - z.hh - g.y0) / g.G)), j1 = Math.min(g.ny - 1, Math.floor((z.y + z.hh - g.y0) / g.G));
    for (let j = j0; j <= j1 && n < 4; j++) for (let i = i0; i <= i1; i++) if (g.reach[j * g.nx + i]) { n++; if (n >= 4) break; }
    return n >= 4;
  });
  return Object.assign({ obs: L.obs, zones, bossSpawn: L.bossSpawn, grid: g, names: L.names, ratio: an.ratio, spikes: L.spikes, spots: L.spots, dropped: L.dropped }, extra || {});
}

// 방 하나의 레이아웃. 검사에 실패하면 다른 템플릿으로 다시(최대 14번), 그래도 안 되면 거의 빈 방.
function buildLayout(room, floor = 3, builder) {
  const geo = roomGeo(room), clear = room.type === "boss" ? CLEAR_BOSS : CLEAR_NORMAL;
  for (let attempt = 0; attempt < 14; attempt++) {
    const L = new LayoutBuilder(room, geo, floor, { clear });
    if (builder) builder(L); else applyTemplates(L, room, floor);
    const an = analyzeLayout(L);
    if (an.ok) return finishLayout(L, an, { attempts: attempt + 1 });
  }
  const L = new LayoutBuilder(room, geo, floor, { clear }); L.names.push("fallback"); const an = analyzeLayout(L);
  return finishLayout(L, an, { attempts: 15, fallback: true });
}

// Game.enterRoom이 부른다: 레이아웃을 만들어 room.layout에 붙이고 지형 배열을 돌려준다
function generateObstacles(room, floor = 3) {
  const sp = typeof SPECIAL_LAYOUT !== "undefined" ? SPECIAL_LAYOUT[room.type] : null;
  let lay;
  if (room.type === "treasure" || room.type === "shop") lay = buildLayout(room, floor, L => { L.names.push(room.type); });
  else if (sp) lay = buildLayout(room, floor, L => sp(L, room));
  else lay = buildLayout(room, floor);
  room.layout = lay; return lay.obs.map(o => ({ ...o }));
}
