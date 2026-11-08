// 층 지도 생성. 방은 격자 위에 이어 붙고(고리 없이 가지 모양), 막다른 방에 보스·보물·상점이 놓인다.
// 방 종류: start / normal / elite / treasure / shop / boss
// 방(아레나) 지오메트리. 보통 방은 1칸(400x225, 카메라 기준 해상도와 같음)이고, 큰 방은 이웃한 2~4칸을 합친 모양이다
// (2칸 가로/세로, L자 3칸, 2x2 4칸). 카메라는 항상 같은 배율로 플레이어를 따라가므로 큰 방은 "넓어진" 방이 된다.
// 좌표 원점은 방 전체(바운딩 박스)의 가운데. 방에 들어갈 때 Game.enterRoom이 applyGeo로 채운다.
const CELL_W = 400, CELL_H = 225;
const ARENA = { w: CELL_W, h: CELL_H, BASE_W: CELL_W, BASE_H: CELL_H, ox: 0, oy: 0, cells: [{ x: 0, y: 0, dx: 0, dy: 0 }], voids: [], big: false };
function roomGeo(room) {
  const cells = room.cells || [[0, 0]];
  const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys), cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  const geo = { w: (maxx - minx + 1) * CELL_W, h: (maxy - miny + 1) * CELL_H, ox: (0 - cx) * CELL_W, oy: (0 - cy) * CELL_H, // ox,oy: 문이 있는 칸(소유 칸)의 중심
    cells: cells.map(([dx, dy]) => ({ x: (dx - cx) * CELL_W, y: (dy - cy) * CELL_H, dx, dy })), voids: [] };
  for (let dx = minx; dx <= maxx; dx++) for (let dy = miny; dy <= maxy; dy++) if (!cells.some(c => c[0] === dx && c[1] === dy)) geo.voids.push({ x: (dx - cx) * CELL_W, y: (dy - cy) * CELL_H }); // L자의 빈 칸
  return geo;
}
function applyGeo(room) { Object.assign(ARENA, roomGeo(room), { big: (room.cells || [[0, 0]]).length > 1 }); }
const doorPos = d => { const v = ({ N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] })[d]; return [ARENA.ox + v[0] * CELL_W / 2, ARENA.oy + v[1] * CELL_H / 2]; };
const DIRS = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };
const OPP = { N: "S", S: "N", E: "W", W: "E" };
const MAX_FLOOR = 8;            // 마지막 층 (최종 보스)
const SPECIAL_ROOM_FLOORS = 5;  // 이 층까지만 보물방·상점이 나온다
const ROOM_NAMES = { start: "시작 방", normal: "일반 방", elite: "엘리트 방", treasure: "보물 방", shop: "상점", boss: "보스 방" };

function generateFloor(f) {
  const key = (x, y) => x + "," + y, rooms = new Map();
  const add = (x, y, type) => { const r = { x, y, type, visited: false, cleared: false, spawned: false, items: [], obs: null, big: false, cells: [[0, 0]], nb: {}, dist: 0 }; rooms.set(key(x, y), r); return r; };
  const occ = (x, y) => Object.values(DIRS).filter(([dx, dy]) => rooms.has(key(x + dx, y + dy))).length;
  const entries = Object.entries(DIRS);
  const start = add(0, 0, "start");
  const target = Math.min(7 + f, 13);
  for (let guard = 0; rooms.size < target && guard < 800; guard++) {
    const list = [...rooms.values()], base = list[Math.floor(Math.random() * list.length)];
    const [, [dx, dy]] = entries[Math.floor(Math.random() * 4)];
    const nx = base.x + dx, ny = base.y + dy;
    if (rooms.has(key(nx, ny)) || occ(nx, ny) > 1) continue; // 이웃이 둘 이상이면 고리가 생기므로 제외
    add(nx, ny, "normal");
  }
  const link = () => {
    for (const r of rooms.values()) { r.nb = {}; for (const [d, [dx, dy]] of entries) { const o = rooms.get(key(r.x + dx, r.y + dy)); if (o) r.nb[d] = o; } }
    const q = [start]; for (const r of rooms.values()) r.dist = -1; start.dist = 0;
    while (q.length) { const r = q.shift(); for (const o of Object.values(r.nb)) if (o.dist < 0) { o.dist = r.dist + 1; q.push(o); } }
  };
  link();
  const leaves = () => [...rooms.values()].filter(r => r !== start && Object.keys(r.nb).length === 1);
  const addLeaf = () => { // 막다른 방이 모자랄 때 한 칸 더 붙인다
    const list = [...rooms.values()].filter(r => r !== start).sort(() => Math.random() - 0.5);
    for (const base of list) for (const [, [dx, dy]] of entries.sort(() => Math.random() - 0.5)) {
      const nx = base.x + dx, ny = base.y + dy;
      if (!rooms.has(key(nx, ny)) && occ(nx, ny) === 1) { add(nx, ny, "normal"); link(); return true; }
    }
    return false;
  };
  const special = f <= SPECIAL_ROOM_FLOORS ? ["boss", "treasure", "shop"] : ["boss"];
  while (leaves().length < special.length && addLeaf());
  const ls = leaves().sort((a, b) => b.dist - a.dist);
  ls[0].type = "boss";
  const rest = ls.slice(1).sort(() => Math.random() - 0.5);
  special.slice(1).forEach((t, i) => { if (rest[i]) rest[i].type = t; });
  // 엘리트 방: 시작 방에서 2칸 이상 떨어진 일반 방 중에서
  const elites = f >= 4 ? 2 : 1;
  // 가끔 큰 방(일반·엘리트): 이웃한 빈 칸 1~3개를 합친다. 합친 칸이 다른 방과 맞닿으면 안 된다(맞닿으면 문이 생겨 버리므로).
  const claimed = new Set([...rooms.keys()]);
  const SHAPES = { two: [[[1, 0]], [[-1, 0]], [[0, 1]], [[0, -1]]],
    ell: [[[1, 0], [0, 1]], [[1, 0], [0, -1]], [[-1, 0], [0, 1]], [[-1, 0], [0, -1]]],
    four: [[[1, 0], [0, 1], [1, 1]], [[1, 0], [0, -1], [1, -1]], [[-1, 0], [0, 1], [-1, 1]], [[-1, 0], [0, -1], [-1, -1]]] };
  const fits = (r, shape) => {
    const mine = new Set([key(r.x, r.y), ...shape.map(([dx, dy]) => key(r.x + dx, r.y + dy))]);
    for (const [dx, dy] of shape) {
      if (claimed.has(key(r.x + dx, r.y + dy))) return false;
      for (const [, [nx, ny]] of entries) { const k2 = key(r.x + dx + nx, r.y + dy + ny); if (claimed.has(k2) && !mine.has(k2)) return false; }
    }
    return true;
  };
  let bigCount = 0;
  if (f >= 2) for (const r of [...rooms.values()].sort(() => Math.random() - 0.5)) {
    if (bigCount >= 2 || r.type !== "normal" || r.dist < 1 || Math.random() > 0.3) continue;
    const roll = Math.random(), kind = roll < 0.5 ? "two" : roll < 0.8 ? "ell" : "four";
    const shape = [...SHAPES[kind]].sort(() => Math.random() - 0.5).find(sh => fits(r, sh));
    if (!shape) continue;
    r.big = true; r.cells = [[0, 0], ...shape]; shape.forEach(([dx, dy]) => claimed.add(key(r.x + dx, r.y + dy))); bigCount++;
  }
  const cands = [...rooms.values()].filter(r => r.type === "normal" && r.dist >= 2).sort(() => Math.random() - 0.5);
  cands.slice(0, elites).forEach(r => { r.type = "elite"; });
  start.cleared = true; start.spawned = true;
  return { rooms, start, floor: f, list: [...rooms.values()] };
}
