// 층 지도 생성. 방은 격자 위에 이어 붙고(고리 없이 가지 모양), 막다른 방에 보스·보물·상점이 놓인다.
// 방 종류: start / normal / elite / treasure / shop / boss
// 방(아레나) 크기. 보통 방은 400x225(카메라 기준 해상도와 같음), 큰 방은 1.5배. 방에 들어갈 때 Game.enterRoom이 바꾼다.
const ARENA = { w: 400, h: 225, BASE_W: 400, BASE_H: 225, BIG: 1.5 };
const doorPos = d => ({ N: [0, ARENA.h / 2], S: [0, -ARENA.h / 2], E: [ARENA.w / 2, 0], W: [-ARENA.w / 2, 0] })[d];
const DIRS = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };
const OPP = { N: "S", S: "N", E: "W", W: "E" };
const MAX_FLOOR = 8;            // 마지막 층 (최종 보스)
const SPECIAL_ROOM_FLOORS = 5;  // 이 층까지만 보물방·상점이 나온다
const ROOM_NAMES = { start: "시작 방", normal: "일반 방", elite: "엘리트 방", treasure: "보물 방", shop: "상점", boss: "보스 방" };

function generateFloor(f) {
  const key = (x, y) => x + "," + y, rooms = new Map();
  const add = (x, y, type) => { const r = { x, y, type, visited: false, cleared: false, spawned: false, items: [], obs: null, big: false, nb: {}, dist: 0 }; rooms.set(key(x, y), r); return r; };
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
  if (f >= 2) for (const r of rooms.values()) if (r.type === "normal" && r.dist >= 1 && Math.random() < 0.18) r.big = true; // 가끔 큰 방(일반·엘리트)
  const cands = [...rooms.values()].filter(r => r.type === "normal" && r.dist >= 2).sort(() => Math.random() - 0.5);
  cands.slice(0, elites).forEach(r => { r.type = "elite"; });
  start.cleared = true; start.spawned = true;
  return { rooms, start, floor: f, list: [...rooms.values()] };
}
