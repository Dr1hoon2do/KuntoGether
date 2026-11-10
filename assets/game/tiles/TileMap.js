// 타일맵: 아이작처럼 방을 격자 타일로 다룬다. 칸(방 1칸) 하나 = 16 x 9 타일 (타일 25 → 400 x 225, 카메라 한 화면).
// 큰 방은 칸을 이어 붙인 격자(2칸 가로 32x9, 세로 16x18, L자, 2x2 32x18)이고, L자의 빈 칸은 mask=0.
//   · 좌표: 타일 (i,j)의 i는 오른쪽, j는 위쪽(월드 Y-up). 방 전체 바운딩 박스의 가운데가 월드 (0,0).
//   · 타일 종류(T): 바닥 / 벽(안 부서짐) / 기둥(안 부서짐) / 바위(폭발로만) / 상자 / 폭발 통 / 구덩이(걷기만 막음, 탄은 지나감) / 제단 / 기계 / 가시
//   · 충돌: 같은 종류의 이웃한 벽·구덩이는 큰 직사각형 하나로 합쳐서(greedy merge) 콜라이더를 만든다. 부서지는 타일은 타일마다 하나.
//   · 시드 난수(Rng)·검사용 flood fill·정적 타일 그리기(오프스크린 캔버스에 한 번)도 여기에 있다.
const TILE = 25, TC = 16, TR = 9; // 타일 크기, 칸 하나의 가로·세로 타일 수
const T = { FLOOR: 0, WALL: 1, PILLAR: 2, ROCK: 3, CRATE: 4, BARREL: 5, PIT: 6, ALTAR: 7, MACHINE: 8, SPIKE: 9, PEDESTAL: 10, CRACK: 11 };
const T_SOLID = [0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1];       // 걸어서 못 지나가는 타일
const T_STATIC = [0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0];      // 오프스크린 캔버스에 구워 두는 타일 (벽·기둥·구덩이)
const T_HP = { wall: 999, pillar: 999, rock: 1, crate: 3, barrel: 1, altar: 999, machine: 999, pit: 999, crack: 999 };
const T_KIND = [null, "wall", "pillar", "rock", "crate", "barrel", "pit", "altar", "machine", null, null, "crack"];
// 규약(tiles/SPEC.md)의 타일 문자. k(금 간 벽)는 생성기만 쓴다. p = 아이템 받침대(걸을 수 있는 바닥, 보상·상점 품목이 놓일 자리)
const T_CHAR = { ".": 0, "#": 1, "P": 2, "R": 3, "C": 4, "B": 5, "V": 6, "a": 7, "m": 8, "S": 9, "p": 10, "k": 11 };
const T_LETTER = ".#PRCBVamSpk";

// ── 시드 난수 ────────────────────────────────────────────────────────────────
function hash2(a, b) { let h = (a ^ 0x9e3779b9) >>> 0; h = Math.imul(h ^ (b + 0x7f4a7c15 | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; }
class Rng {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  f() { let t = (this.s += 0x6D2B79F5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  i(a, b) { return a + Math.floor(this.f() * (b - a + 1)); }                  // a..b 정수 (양 끝 포함)
  chance(p) { return this.f() < p; }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  shuffle(arr) { const a = arr.slice(); for (let k = a.length - 1; k > 0; k--) { const m = Math.floor(this.f() * (k + 1)); [a[k], a[m]] = [a[m], a[k]]; } return a; }
  weighted(list, wf = o => o.w) { let tot = 0; for (const o of list) tot += wf(o); if (!(tot > 0)) return null; let r = this.f() * tot; for (const o of list) { r -= wf(o); if (r < 0) return o; } return list[list.length - 1]; }
}

let TILEMAP_UID = 0;
class TileMap {
  constructor(geo) {
    this.uid = ++TILEMAP_UID; this.version = 0; this.W = geo.w; this.H = geo.h; this.cols = Math.round(geo.w / TILE); this.rows = Math.round(geo.h / TILE); this.x0 = -geo.w / 2; this.y0 = -geo.h / 2;
    const n = this.cols * this.rows; this.t = new Uint8Array(n); this.mask = new Uint8Array(n); this.res = new Uint8Array(n); // res: 항상 비워 둘 곳(문 앞·통로·보스 자리)
    this.cells = geo.cells.map(c => ({ x: c.x, y: c.y, dx: c.dx, dy: c.dy, i0: Math.round((c.x - CELL_W / 2 - this.x0) / TILE), j0: Math.round((c.y - CELL_H / 2 - this.y0) / TILE) }));
    for (const c of this.cells) for (let j = 0; j < TR; j++) for (let i = 0; i < TC; i++) this.mask[(c.j0 + j) * this.cols + c.i0 + i] = 1;
  }
  inb(i, j) { return i >= 0 && j >= 0 && i < this.cols && j < this.rows; }
  ix(i, j) { return j * this.cols + i; }
  get(i, j) { return this.inb(i, j) ? this.t[j * this.cols + i] : T.WALL; }
  set(i, j, v) { if (this.inb(i, j)) this.t[j * this.cols + i] = v; }
  inside(i, j) { return this.inb(i, j) && this.mask[j * this.cols + i] === 1; }
  free(i, j) { return this.inb(i, j) && this.mask[j * this.cols + i] === 1 && !T_SOLID[this.t[j * this.cols + i]]; }
  cx(i) { return this.x0 + (i + 0.5) * TILE; }
  cy(j) { return this.y0 + (j + 0.5) * TILE; }
  ti(x) { return Math.floor((x - this.x0) / TILE); }
  tj(y) { return Math.floor((y - this.y0) / TILE); }
  tileAtWorld(x, y) { return this.get(this.ti(x), this.tj(y)); }
  // 월드 좌표 (x,y)의 타일을 바닥으로 (부서진 지형)
  clearAt(x, y) { const i = this.ti(x), j = this.tj(y); if (this.inb(i, j) && T_SOLID[this.t[j * this.cols + i]]) this.t[j * this.cols + i] = T.FLOOR; }
  cellOwner() { return this.cells.find(c => c.dx === 0 && c.dy === 0) || this.cells[0]; }
  // 지형 데이터(Game._makeObstacle에 들어가는 {kind,x,y,w,h,hp}) — 벽·구덩이는 큰 직사각형으로 합친다.
  toObstacles() {
    const { cols, rows, t } = this, out = [], used = new Uint8Array(cols * rows), at = (i, j) => j * cols + i;
    const rect = (i0, j0, i1, j1, kind) => out.push({ kind, x: this.cx((i0 + i1) / 2), y: this.cy((j0 + j1) / 2), w: (i1 - i0 + 1) * TILE, h: (j1 - j0 + 1) * TILE, hp: T_HP[kind] });
    const merge = (code, kind, vertOnly) => {
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        if (t[at(i, j)] !== code || used[at(i, j)]) continue;
        let i1 = i; if (!vertOnly) while (i1 + 1 < cols && t[at(i1 + 1, j)] === code && !used[at(i1 + 1, j)]) i1++;
        let j1 = j; for (;;) { const nj = j1 + 1; if (nj >= rows) break; let ok = true; for (let k = i; k <= i1; k++) if (t[at(k, nj)] !== code || used[at(k, nj)]) { ok = false; break; } if (!ok) break; j1 = nj; }
        for (let b = j; b <= j1; b++) for (let a = i; a <= i1; a++) used[at(a, b)] = 1;
        rect(i, j, i1, j1, kind);
      }
    };
    merge(T.WALL, "wall"); merge(T.PIT, "pit"); merge(T.MACHINE, "machine", true); merge(T.CRACK, "crack");
    let ax0 = 1e9, ax1 = -1, ay0 = 1e9, ay1 = -1;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const c = t[at(i, j)];
      if (c === T.ALTAR) { ax0 = Math.min(ax0, i); ax1 = Math.max(ax1, i); ay0 = Math.min(ay0, j); ay1 = Math.max(ay1, j); }
      else if (c === T.PILLAR || c === T.ROCK || c === T.CRATE || c === T.BARREL) rect(i, j, i, j, T_KIND[c]);
    }
    if (ax1 >= 0) { const o = { kind: "altar", x: this.cx((ax0 + ax1) / 2), y: this.cy((ay0 + ay1) / 2), w: Math.min((ax1 - ax0 + 1) * TILE, (ay1 - ay0 + 1) * TILE), hp: 999 }; o.h = o.w; out.push(o); }
    return out;
  }
  // 칸 (c.i0, c.j0)의 타일 문자열(위쪽이 첫 줄)
  ascii(cell) { const rowsOut = []; for (let r = 0; r < TR; r++) { let s = ""; for (let c = 0; c < TC; c++) { const v = this.get(cell.i0 + c, cell.j0 + TR - 1 - r); s += T_LETTER[v]; } rowsOut.push(s); } return rowsOut; }
  // 방 전체 문자열 (SPEC 좌표: y=0이 맨 위)
  asciiAll() { const out = []; for (let y = 0; y < this.rows; y++) { let s = ""; for (let x = 0; x < this.cols; x++) s += this.mask[(this.rows - 1 - y) * this.cols + x] ? T_LETTER[this.t[(this.rows - 1 - y) * this.cols + x]] : " "; out.push(s); } return out; }
  signature() { let h = 2166136261; for (let k = 0; k < this.t.length; k++) { h ^= this.t[k] + (this.mask[k] << 5); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
}

// ── flood fill ───────────────────────────────────────────────────────────────
// starts: [[i,j],...]. mode 0 = 비어 있는 타일만(부서지는 상자·통도 막힌 것) / 1 = 2x2 타일이 모두 비어 있는 자리만 (보스처럼 덩치가 큰 몸, (i,j)=블록 왼쪽 아래) /
// 2 = 부서지는 상자·통도 지나갈 수 있는 것으로 (적이 상자 사이에 갇혀 등장하는 자리까지 포함)
function floodTiles(map, starts, mode = 0) {
  const { cols, rows } = map, reach = new Uint8Array(cols * rows), q = new Int32Array(cols * rows); let qh = 0, qt = 0;
  const ok = mode === 1 ? ((i, j) => map.free(i, j) && map.free(i + 1, j) && map.free(i, j + 1) && map.free(i + 1, j + 1))
    : mode === 2 ? ((i, j) => { if (!map.inside(i, j)) return false; const c = map.t[j * cols + i]; return !T_SOLID[c] || c === T.CRATE || c === T.BARREL; })
    : ((i, j) => map.free(i, j));
  for (const [i, j] of starts) if (ok(i, j) && !reach[j * cols + i]) { reach[j * cols + i] = 1; q[qt++] = j * cols + i; }
  while (qh < qt) {
    const k = q[qh++], i = k % cols, j = (k - i) / cols;
    if (i > 0 && !reach[k - 1] && ok(i - 1, j)) { reach[k - 1] = 1; q[qt++] = k - 1; }
    if (i < cols - 1 && !reach[k + 1] && ok(i + 1, j)) { reach[k + 1] = 1; q[qt++] = k + 1; }
    if (j > 0 && !reach[k - cols] && ok(i, j - 1)) { reach[k - cols] = 1; q[qt++] = k - cols; }
    if (j < rows - 1 && !reach[k + cols] && ok(i, j + 1)) { reach[k + cols] = 1; q[qt++] = k + cols; }
  }
  return reach;
}

// ── 정적 타일 그리기 (벽·기둥·구덩이). 월드 좌표(Y-up) 컨텍스트에 그린다. ArenaRenderer가 방이 바뀔 때 한 번만 오프스크린 캔버스에 구워 둔다. ──
function drawStaticTiles(ctx, map) {
  const { cols, rows, t } = map, S = TILE, kind = (i, j) => map.get(i, j);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const c = t[j * cols + i]; if (c === T.PEDESTAL) { const px = map.x0 + (i + 0.5) * S, py = map.y0 + (j + 0.5) * S; ctx.fillStyle = "#00000030"; ctx.beginPath(); ctx.ellipse(px, py - 2, 10, 5, 0, 0, 7); ctx.fill(); ctx.strokeStyle = "#8d7f5a"; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(px, py - 1, 9, 4.5, 0, 0, 7); ctx.stroke(); continue; } if (!T_STATIC[c]) continue; const x = map.x0 + i * S, y = map.y0 + j * S;
    if (c === T.WALL) {
      const up = kind(i, j + 1) !== T.WALL, dn = kind(i, j - 1) !== T.WALL, lf = kind(i - 1, j) !== T.WALL, rt = kind(i + 1, j) !== T.WALL;
      ctx.fillStyle = "#5d5d6b"; ctx.fillRect(x, y, S, S);
      ctx.fillStyle = "#6b6b7a"; ctx.fillRect(x + 1, y + 1, S - 2, S - 6);                 // 윗면(밝게)·앞면 구분
      if (up) { ctx.fillStyle = "#7d7d8c"; ctx.fillRect(x, y + S - 5, S, 5); }
      ctx.strokeStyle = "#2c2c36"; ctx.lineWidth = 1; ctx.beginPath();
      if (up) { ctx.moveTo(x, y + S); ctx.lineTo(x + S, y + S); } if (dn) { ctx.moveTo(x, y); ctx.lineTo(x + S, y); }
      if (lf) { ctx.moveTo(x, y); ctx.lineTo(x, y + S); } if (rt) { ctx.moveTo(x + S, y); ctx.lineTo(x + S, y + S); } ctx.stroke();
      ctx.strokeStyle = "#ffffff10"; ctx.beginPath(); ctx.rect(x + 0.5, y + 0.5, S - 1, S - 1); ctx.stroke();   // 타일 이음선
    } else if (c === T.PILLAR) {
      ctx.fillStyle = "#0000004d"; ctx.fillRect(x + 1, y - 1.5, S, 3.5);
      ctx.fillStyle = "#5d5d6b"; ctx.fillRect(x + 1, y + 1, S - 2, S - 2); ctx.fillStyle = "#7d7d8c"; ctx.fillRect(x + 1, y + S - 6, S - 2, 5); ctx.fillStyle = "#6b6b7a"; ctx.fillRect(x + 4, y + 4, S - 8, S - 11);
      ctx.strokeStyle = "#2c2c36"; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, S - 3, S - 3);
    } else if (c === T.PIT) {
      ctx.fillStyle = "#06070b"; ctx.fillRect(x, y, S, S); ctx.fillStyle = "#0f1219"; ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
      ctx.strokeStyle = "#5c6575"; ctx.lineWidth = 1.2; ctx.beginPath();
      if (kind(i, j + 1) !== T.PIT) { ctx.moveTo(x, y + S - 0.6); ctx.lineTo(x + S, y + S - 0.6); } if (kind(i, j - 1) !== T.PIT) { ctx.moveTo(x, y + 0.6); ctx.lineTo(x + S, y + 0.6); }
      if (kind(i - 1, j) !== T.PIT) { ctx.moveTo(x + 0.6, y); ctx.lineTo(x + 0.6, y + S); } if (kind(i + 1, j) !== T.PIT) { ctx.moveTo(x + S - 0.6, y); ctx.lineTo(x + S - 0.6, y + S); } ctx.stroke();
    }
  }
}
