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
const LOCK_FROM_FLOOR = 2, KEY_ROOMS = 2; // 이 층부터 보물방·상점 문이 잠김 / 열쇠를 확정으로 주는 일반 방 수
const MAX_FLOOR = 8;            // 마지막 층 (최종 보스)
const SPECIAL_ROOM_FLOORS = 5;  // 이 층까지만 보물방·상점이 나온다
const ROOM_NAMES = { start: "시작 방", normal: "일반 방", elite: "엘리트 방", treasure: "보물 방", shop: "상점", boss: "보스 방" };
// 특수 방: 막다른 방에 가끔 나온다. 층마다 종류별로 최대 1개, 한 층에 최대 MAX_SPECIAL개. min~max 층에서만, chance 확률로 (동작은 Specials.js)
//   보물방·상점은 5층까지만(SPECIAL_ROOM_FLOORS) 나오지만, 특수 방은 아래 범위를 따른다. locked: 열쇠 1개로 문을 연다
const MAX_SPECIAL = 2;
const SECRET_MIN = 2, SECRET_MAX = 7, SECRET_CHANCE = 0.25; // 비밀방이 나오는 층 범위와 확률
const SPECIAL_ROOMS = {
  spike:     { name: "가시방", color: "#ef5350", icon: "▲", min: 2, max: 8, chance: 0.26 },
  sacrifice: { name: "희생방", color: "#d81b60", icon: "✚", min: 2, max: 7, chance: 0.22 },
  gamble:    { name: "도박방", color: "#ffa726", icon: "?", min: 2, max: 7, chance: 0.18 },
  ambush:    { name: "매복방", color: "#ab47bc", icon: "‼", min: 3, max: 7, chance: 0.20 },
  library:   { name: "서재", color: "#4fc3f7", icon: "▤", min: 3, max: 8, chance: 0.16, locked: true },
};
for (const [k, v] of Object.entries(SPECIAL_ROOMS)) ROOM_NAMES[k] = v.name;
ROOM_NAMES.devil = "악마 상점"; // 보스 방 옆방 (지도에는 없다: Specials.openDevil)
ROOM_NAMES.secret = "비밀방"; // 숨겨진 막다른 방 (벽을 부수면 문이 열린다)
// 이번 층에 나올 특수 방 종류 (확률대로 굴려서 최대 MAX_SPECIAL개)
function rollSpecials(f, rnd = Math.random) {
  const out = []; for (const k of (() => { const a = Object.keys(SPECIAL_ROOMS); for (let k = a.length - 1; k > 0; k--) { const m = Math.floor(rnd() * (k + 1)); [a[k], a[m]] = [a[m], a[k]]; } return a; })()) { const s = SPECIAL_ROOMS[k]; if (out.length < MAX_SPECIAL && f >= s.min && f <= s.max && rnd() < s.chance) out.push(k); }
  return out;
}

function generateFloor(f, forceSpecials, rnd = Math.random) {
  const shuf = arr => { const a = arr.slice(); for (let k = a.length - 1; k > 0; k--) { const m = Math.floor(rnd() * (k + 1)); [a[k], a[m]] = [a[m], a[k]]; } return a; }; // 시드 난수로 섞기
  const key = (x, y) => x + "," + y, rooms = new Map();
  const add = (x, y, type) => { const r = { x, y, type, visited: false, cleared: false, spawned: false, items: [], obs: null, big: false, cells: [[0, 0]], nb: {}, dist: 0 }; rooms.set(key(x, y), r); return r; };
  const occ = (x, y) => Object.values(DIRS).filter(([dx, dy]) => rooms.has(key(x + dx, y + dy))).length;
  const entries = Object.entries(DIRS);
  const start = add(0, 0, "start");
  const target = Math.min(7 + f, 13);
  for (let guard = 0; rooms.size < target && guard < 800; guard++) {
    const list = [...rooms.values()], base = list[Math.floor(rnd() * list.length)];
    const [, [dx, dy]] = entries[Math.floor(rnd() * 4)];
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
    const list = shuf([...rooms.values()].filter(r => r !== start));
    for (const base of list) for (const [, [dx, dy]] of shuf(entries)) {
      const nx = base.x + dx, ny = base.y + dy;
      if (!rooms.has(key(nx, ny)) && occ(nx, ny) === 1) { add(nx, ny, "normal"); link(); return true; }
    }
    return false;
  };
  const special = [...(f <= SPECIAL_ROOM_FLOORS ? ["boss", "treasure", "shop"] : ["boss"]), ...(forceSpecials || rollSpecials(f, rnd))];
  while (leaves().length < special.length && addLeaf());
  const ls = leaves().sort((a, b) => b.dist - a.dist);
  ls[0].type = "boss";
  const rest = shuf(ls.slice(1));
  special.slice(1).forEach((t, i) => { if (rest[i]) { rest[i].type = t; if (SPECIAL_ROOMS[t] && SPECIAL_ROOMS[t].locked) rest[i].locked = true; } });
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
  if (f >= 2) for (const r of shuf([...rooms.values()])) {
    const isBoss = r.type === "boss" && f >= 3; // 보스 방도 가끔 큰 방 (L자는 제외: 가운데가 빈 칸이 되므로)
    if (bigCount >= 2 || (r.type !== "normal" && !isBoss) || r.dist < 1 || rnd() > (isBoss ? 0.4 : 0.3)) continue;
    const roll = rnd(), kind = isBoss ? (roll < 0.6 ? "two" : "four") : roll < 0.5 ? "two" : roll < 0.8 ? "ell" : "four";
    const shape = shuf(SHAPES[kind]).find(sh => fits(r, sh));
    if (!shape) continue;
    r.big = true; r.cells = [[0, 0], ...shape]; shape.forEach(([dx, dy]) => claimed.add(key(r.x + dx, r.y + dy))); bigCount++;
  }
  const cands = [...rooms.values()].filter(r => r.type === "normal" && r.dist >= 2); const candsS = shuf(cands);
  candsS.slice(0, elites).forEach(r => { r.type = "elite"; });
  // 2층부터 보물방·상점은 잠겨 있다: 열쇠 1개로 한 번 열면 계속 열려 있다 (1층은 그냥 들어간다). 열쇠가 모자라지 않게
  // 시작 방에서 가까운 일반 방 KEY_ROOMS개는 클리어하면 열쇠를 확정으로 준다 (그 밖에 방 클리어 보상·상자에서도 나온다).
  for (const r of rooms.values()) r.tie = rnd();
  if (f >= LOCK_FROM_FLOOR) {
    for (const r of rooms.values()) if (r.type === "treasure" || r.type === "shop") r.locked = true;
    [...rooms.values()].filter(r => r.type === "normal" && r.dist >= 1).sort((a, b) => a.dist - b.dist || a.tie - b.tie).slice(0, KEY_ROOMS).forEach(r => { r.keyDrop = true; });
  }
  // 비밀방: 일반·엘리트 방의 벽 너머 막다른 방. 처음엔 숨겨져 있고(지도·문 없음) 폭발이나 강한 공격으로 벽을 부수면 문이 열린다. 2~7층에서 SECRET_CHANCE 확률로 최대 1개.
  let secret = null;
  if (f >= SECRET_MIN && f <= SECRET_MAX && rnd() < SECRET_CHANCE) {
    const hosts = shuf([...rooms.values()].filter(r => r.type === "normal" || r.type === "elite"));
    outer: for (const host of hosts) for (const [d, [dx, dy]] of shuf(entries)) {
      const nx = host.x + dx, ny = host.y + dy; if (claimed.has(key(nx, ny))) continue;
      let ok = true; for (const [, [ax, ay]] of entries) { const k2 = key(nx + ax, ny + ay); if (k2 !== key(host.x, host.y) && claimed.has(k2)) ok = false; }
      if (!ok) continue;
      secret = { x: nx, y: ny, type: "secret", visited: false, cleared: false, spawned: false, items: [], obs: null, big: false, cells: [[0, 0]], nb: {}, dist: host.dist + 1, hidden: true, host };
      host.secret = secret; host.secretDir = d; claimed.add(key(nx, ny)); break outer;
    }
  }
  start.cleared = true; start.spawned = true;
  const list = [...rooms.values()]; list.forEach(r => { r.seed = (rnd() * 4294967296) >>> 0; }); if (secret) secret.seed = (rnd() * 4294967296) >>> 0; // 방마다 시드: 같은 시드 = 같은 방
  return { rooms, start, floor: f, list, secret };
}

// 비밀방의 문을 연다 (폭발·강한 공격으로 벽을 부쉈을 때). 지도에 방이 나타나고 host 방에 문이 생긴다.
function revealSecret(map, host) {
  const s = host && host.secret; if (!s || !s.hidden) return false;
  s.hidden = false; host.nb[host.secretDir] = s; s.nb[OPP[host.secretDir]] = host; map.rooms.set(s.x + "," + s.y, s); map.list.push(s); return true;
}
