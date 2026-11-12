// 일반 / 엘리트 / 시작 방의 A(큰 구성) 데이터. 규약은 SPEC.md. 순수 JS — ctx 도우미와 ctx.rng 계열만 쓴다 (Math.random 금지).
// 방향성: 대부분 "비대칭·유기적" — 한쪽으로 치우친 군집, 제각각인 벽 길이, 무작위 누락, 노이즈로 자란 바위밭, 동굴(셀룰러 오토마타),
// 랜덤 워크 벽/강, 삐뚤어진 아레나. 일부(colonnade·split-hall·quad-arena·central-plaza·twin-bunkers)만 의도적으로 "격식 있는" 모양이고
// 그것도 간격·누락·크기를 흔들어 놓았다. (생성기가 마지막에 무작위 좌우/상하 반전을 하므로 한쪽 쏠림은 방향이 매번 달라진다.)
// 모든 archetype은 reg()를 거친다: build 결과를 finish()가 정리해 준다.
//   1) 예약 구역(문 앞·칸 사이 통로·시작 자리)의 장애물을 지운다
//   2) 문/통로/시작 자리가 폭 2칸 이상의 길로 이어지지 않으면 2칸 폭으로 길을 뚫는다
//   3) 어디서도 닿을 수 없는 바닥(갇힌 주머니)은 벽으로 메운다
//   4) 너무 꽉 찬 방은 부서지는 장애물부터 치워 열린 비율(38%)을 맞춘다
//   5) 적 구역(zones)이 갈 수 있는 곳 안에 있는지 확인하고, 모자라면 빈 곳 전체로 대체한다
(function () {
  const TC = typeof TileContent !== "undefined" ? TileContent : require("./Registry.js");
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // ───────────────────────── 도구 ─────────────────────────
  function makeKit(ctx) {
    const P = ctx.play, W = ctx.w, H = ctx.h, g = ctx.grid();
    const cellSet = new Set(ctx.cells.map(c => c.cx + "," + c.cy));
    const inC = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cellSet.has(((x / 16) | 0) + "," + ((y / 9) | 0));
    // 안쪽 타일: 자기 칸이 있고 4방향 이웃도 방 안인 타일 (바깥 테두리·L자 빈 칸 옆은 제외)
    const valid = (x, y) => inC(x, y) && inC(x - 1, y) && inC(x + 1, y) && inC(x, y - 1) && inC(x, y + 1);
    const k = { g, ctx, W, H, P, x0: P.x0, y0: P.y0, w: P.w, h: P.h, x1: P.x0 + P.w - 1, y1: P.y0 + P.h - 1, valid, inC, ncell: ctx.cells.length };
    k.ri = (a, b) => ctx.int(a, Math.max(a, b));
    k.set = (x, y, c) => { if (valid(x, y)) g[y][x] = c; };
    k.free = (x, y) => valid(x, y) && g[y][x] === ".";
    k.rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) k.set(x + i, y + j, c); };
    k.frame = (x, y, w, h, c) => { for (let i = 0; i < w; i++) { k.set(x + i, y, c); k.set(x + i, y + h - 1, c); } for (let j = 0; j < h; j++) { k.set(x, y + j, c); k.set(x + w - 1, y + j, c); } };
    k.hline = (x, y, n, c) => { for (let i = 0; i < n; i++) k.set(x + i, y, c); };
    k.vline = (x, y, n, c) => { for (let j = 0; j < n; j++) k.set(x, y + j, c); };
    k.flipH = rows => rows.map(r => r.split("").reverse().join(""));
    k.flipV = rows => rows.slice().reverse();
    k.orient = rows => { let r = rows; if (ctx.chance(0.5)) r = k.flipH(r); if (ctx.chance(0.5)) r = k.flipV(r); return r; };
    // 맞는 패리티로 폭을 맞춘다 (가운데 정렬이 필요할 때)
    k.fit = (iw, total) => iw + ((total - iw) & 1);
    // 패턴 rows(문자열 배열)를 놓을 수 있는지: 발자국 + margin 만큼 모두 방 안의 빈 바닥이어야 한다. 예약 구역과 겹치면 안 된다.
    k.canPlace = (rows, x, y, m) => {
      const ph = rows.length, pw = rows[0].length;
      for (let j = -m; j < ph + m; j++) for (let i = -m; i < pw + m; i++) {
        const xx = x + i, yy = y + j;
        if (!valid(xx, yy) || g[yy][xx] !== ".") return false;
        if (i >= 0 && j >= 0 && i < pw && j < ph && rows[j][i] !== "." && ctx.reserved(xx, yy)) return false;
      }
      return true;
    };
    k.put = (rows, x, y) => { for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[0].length; i++) if (rows[j][i] !== ".") k.set(x + i, y + j, rows[j][i]); };
    k.tryPlace = (rows, x, y, m = 1) => { if (!k.canPlace(rows, x, y, m)) return false; k.put(rows, x, y); return true; };
    // 무작위 위치에 n개 (매번 무작위로 뒤집어서) 놓는다
    k.scatter = (n, shapes, m, tries = 40) => {
      let placed = 0;
      for (let t = 0; t < tries && placed < n; t++) {
        const s = k.orient(ctx.pick(shapes)), x = k.ri(k.x0, k.x1 - s[0].length + 1), y = k.ri(k.y0, k.y1 - s.length + 1);
        if (k.tryPlace(s, x, y, m)) placed++;
      }
      return placed;
    };
    // 주변 m칸이 (자기 조각을 빼고) 모두 빈 곳인지. em>0 이면 방 가장자리에서도 em칸 떨어져야 함
    k.clearOf = (x, y, m, own, em = 0) => {
      for (let dy = -m; dy <= m; dy++) for (let dx = -m; dx <= m; dx++) {
        const xx = x + dx, yy = y + dy;
        if (!valid(xx, yy)) { if (Math.max(Math.abs(dx), Math.abs(dy)) <= em) return false; continue; }
        if (own && own.has(xx + "," + yy)) continue;
        if (g[yy][xx] !== ".") return false;
      }
      return true;
    };
    // 랜덤 성장 덩어리 (바위·구덩이 등 유기적인 모양). 주변 m칸은 비워 둔다.
    k.blob = (sx, sy, n, ch, m = 1, em = 0) => {
      const own = new Set(), list = [];
      const can = (x, y) => valid(x, y) && g[y][x] === "." && !ctx.reserved(x, y) && k.clearOf(x, y, m, own, em);
      if (!can(sx, sy)) return 0;
      const add = (x, y) => { own.add(x + "," + y); list.push([x, y]); g[y][x] = ch; };
      add(sx, sy);
      for (let t = 0; t < n * 12 && list.length < n; t++) {
        const [bx, by] = ctx.pick(list), [dx, dy] = ctx.pick(DIRS), x = bx + dx, y = by + dy;
        if (!own.has(x + "," + y) && can(x, y)) add(x, y);
      }
      return list.length;
    };
    // 랜덤 워크 벽: 직진 확률 straight, 그렇지 않으면 90도 꺾는다
    k.wander = (sx, sy, len, ch, straight = 0.72, m = 1) => {
      let x = sx, y = sy, dir = ctx.pick(DIRS), n = 0; const own = new Set();
      for (let i = 0; i < len; i++) {
        if (!(valid(x, y) && g[y][x] === "." && !ctx.reserved(x, y) && k.clearOf(x, y, m, own))) {
          if (i === 0) return 0; break;
        }
        own.add(x + "," + y); g[y][x] = ch; n++;
        if (!ctx.chance(straight)) dir = dir[0] === 0 ? [ctx.pick([1, -1]), 0] : [0, ctx.pick([1, -1])];
        x += dir[0]; y += dir[1];
      }
      return n;
    };
    // 값 노이즈(value noise)를 문턱값으로 잘라 만든 동굴/바위밭. density: 벽이 될 비율, spacing: 덩어리 크기(칸).
    // 예약 구역 주변은 건드리지 않는다. 안쪽은 wallCh, 가장자리는 rimCh.
    k.caves = (density, spacing, wallCh, rimCh) => {
      const nearRes = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (ctx.reserved(x + dx, y + dy)) return true; return false; };
      const octave = sp => { // 격자점에 난수를 두고 부드럽게 보간
        const gw = Math.ceil(W / sp) + 2, gh = Math.ceil(H / sp) + 2, lat = []; for (let i = 0; i < gw * gh; i++) lat.push(ctx.rng());
        const ox = ctx.rng() * sp, oy = ctx.rng() * sp, sm = t => t * t * (3 - 2 * t);
        return (x, y) => { const fx = (x + ox) / sp, fy = (y + oy) / sp, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
          const v = (i, j) => lat[(iy + j) * gw + ix + i]; return (v(0, 0) * (1 - tx) + v(1, 0) * tx) * (1 - ty) + (v(0, 1) * (1 - tx) + v(1, 1) * tx) * ty; };
      };
      const n1 = octave(spacing), n2 = octave(Math.max(2, spacing / 2)), live = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (valid(x, y) && g[y][x] === "." && !nearRes(x, y)) live.push([x, y, n1(x, y) + 0.5 * n2(x, y)]);
      if (!live.length) return;
      const sorted = live.map(t => t[2]).sort((a, b) => b - a), thr = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * density))];
      const wall = new Uint8Array(W * H); for (const [x, y, v] of live) if (v > thr) wall[y * W + x] = 1;
      const isW = (x, y) => (valid(x, y) ? wall[y * W + x] === 1 : false);
      for (const [x, y] of live) if (wall[y * W + x]) g[y][x] = (isW(x + 1, y) && isW(x - 1, y) && isW(x, y + 1) && isW(x, y - 1)) ? wallCh : rimCh;
    };
    // 격자: pitch 간격으로 size 크기 조각이 들어가는 위치들 (방 가장자리에서 mx/my 떨어짐), 가운데 정렬
    k.lattice = (pitch, size, mx, my) => {
      const axis = (start, span) => {
        if (span < size) return [];
        const n = Math.floor((span - size) / pitch) + 1, used = (n - 1) * pitch + size, s0 = start + Math.floor((span - used) / 2), out = [];
        for (let i = 0; i < n; i++) out.push(s0 + i * pitch);
        return out;
      };
      return { xs: axis(k.x0 + mx, k.w - 2 * mx), ys: axis(k.y0 + my, k.h - 2 * my) };
    };
    k.zone = (x, y, w, h, weight = 1) => ({ x, y, w, h, weight });
    k.all = () => k.zone(k.x0, k.y0, k.w, k.h, 1);
    // 지금 가장 훤히 트인 창(window) count개를 적 구역으로 + 전체
    k.openZones = (count, zw, zh) => {
      const cand = [];
      for (let t = 0; t < 70; t++) {
        const x = k.ri(k.x0, k.x1 - zw + 1), y = k.ri(k.y0, k.y1 - zh + 1); let f = 0;
        for (let j = 0; j < zh; j++) for (let i = 0; i < zw; i++) if (k.free(x + i, y + j)) f++;
        cand.push({ x, y, f });
      }
      cand.sort((a, b) => b.f - a.f);
      const out = [];
      for (const c of cand) { if (out.length >= count) break; if (out.every(o => Math.abs(o.x - c.x) >= zw || Math.abs(o.y - c.y) >= zh)) out.push(c); }
      return [...out.map(c => k.zone(c.x, c.y, zw, zh, 2)), k.all()];
    };
    // 칸 하나의 안쪽 영역 (이웃 칸과 이어진 쪽은 경계 없이 열려 있음)
    k.cellBox = c => ({ x0: Math.max(k.x0, c.cx * 16 + 1), x1: Math.min(k.x1, c.cx * 16 + 14), y0: Math.max(k.y0, c.cy * 9 + 1), y1: Math.min(k.y1, c.cy * 9 + 7) });
    k.solid = () => (ctx.kind === "elite" ? ctx.pick(["#", "#", "P"]) : ctx.pick(["P", "P", "R"]));
    k.elite = () => ctx.kind === "elite";
    k.long = () => (k.w >= k.h ? "x" : "y");
    k.area = () => k.w * k.h; // 방 크기 배율 계산용
    k.scale = () => Math.pow(k.ncell, 0.85);
    k.nArea = base => Math.max(1, Math.round(base * k.w * k.h / 98)); // 14×7(한 칸) 기준 개수를 방 면적에 맞게 늘린다
    return k;
  }

  // ───────────────────────── 정리 (finish) ─────────────────────────
  const walkOf = k => (x, y) => k.valid(x, y) && k.g[y][x] === ".";

  function open2(k) { // 2×2 빈 칸 블록에 속한 타일 = 폭 2 이상으로 걸을 수 있는 곳
    const walk = walkOf(k), o = new Uint8Array(k.W * k.H);
    for (let y = 0; y < k.H - 1; y++) for (let x = 0; x < k.W - 1; x++)
      if (walk(x, y) && walk(x + 1, y) && walk(x, y + 1) && walk(x + 1, y + 1)) { o[y * k.W + x] = o[y * k.W + x + 1] = o[(y + 1) * k.W + x] = o[(y + 1) * k.W + x + 1] = 1; }
    return o;
  }
  function label(k, mask) { // 마스크 위 4방향 연결 성분 → { id[], sizes[] }
    const W = k.W, H = k.H, id = new Int32Array(W * H).fill(-1), sizes = [];
    for (let s = 0; s < W * H; s++) {
      if (!mask[s] || id[s] >= 0) continue;
      const c = sizes.length; let n = 0; const st = [s]; id[s] = c;
      while (st.length) {
        const p = st.pop(); n++; const x = p % W, y = (p / W) | 0;
        for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const q = ny * W + nx; if (mask[q] && id[q] < 0) { id[q] = c; st.push(q); } }
      }
      sizes.push(n);
    }
    return { id, sizes };
  }
  function carve2(k, x, y) { // (x,y)를 지나는 2칸 폭 통로 한 조각
    const dx = k.valid(x + 1, y) ? 1 : -1, dy = k.valid(x, y + 1) ? 1 : -1;
    k.set(x, y, "."); k.set(x + dx, y, "."); k.set(x, y + dy, "."); k.set(x + dx, y + dy, ".");
  }
  // src 타일 집합에서 dst 타일 집합까지 (벽을 뚫는 비용 1, 바닥 0) 최단 경로
  function cheapestPath(k, srcMask, dstMask) {
    const W = k.W, H = k.H, N = W * H, INF = 1e9, dist = new Int32Array(N).fill(INF), prev = new Int32Array(N).fill(-1), buckets = [[]];
    const push = (p, d) => { while (buckets.length <= d) buckets.push([]); buckets[d].push(p); };
    for (let p = 0; p < N; p++) if (srcMask[p]) { dist[p] = 0; push(p, 0); }
    for (let d = 0; d < buckets.length; d++) {
      for (let i = 0; i < buckets[d].length; i++) {
        const p = buckets[d][i]; if (dist[p] !== d) continue;
        if (dstMask[p]) { const path = []; for (let q = p; q >= 0; q = prev[q]) path.push(q); return path; }
        const x = p % W, y = (p / W) | 0;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy; if (!k.valid(nx, ny)) continue;
          const q = ny * W + nx, nd = d + (k.g[ny][nx] === "." ? 0 : 1);
          if (nd < dist[q]) { dist[q] = nd; prev[q] = p; push(q, nd); }
        }
      }
    }
    return null;
  }

  function finish(ctx, k, zones) {
    const g = k.g, W = k.W, st = { cleared: 0, carved: 0, sealed: 0, trimmed: 0 };
    const tiles = []; for (let y = 0; y < k.H; y++) for (let x = 0; x < W; x++) if (k.valid(x, y)) tiles.push([x, y]);
    for (const [x, y] of tiles) if (ctx.reserved(x, y) && g[y][x] !== ".") { g[y][x] = "."; st.cleared++; } // 1) 예약 구역 비우기
    const anchors = tiles.filter(([x, y]) => ctx.reserved(x, y)); // 2) 앵커가 폭 2 길로 이어지게
    for (let iter = 0; iter < 8; iter++) {
      let o = open2(k);
      for (const [x, y] of anchors) if (!o[y * W + x]) { carve2(k, x, y); st.carved++; }
      o = open2(k);
      const lab = label(k, o), cnt = new Array(lab.sizes.length).fill(0);
      for (const [x, y] of anchors) { const c = lab.id[y * W + x]; if (c >= 0) cnt[c]++; }
      let best = -1; for (let c = 0; c < cnt.length; c++) if (best < 0 || cnt[c] > cnt[best] || (cnt[c] === cnt[best] && lab.sizes[c] > lab.sizes[best])) best = c;
      if (best < 0) break;
      const stray = new Set(); for (const [x, y] of anchors) { const c = lab.id[y * W + x]; if (c !== best) stray.add(c); }
      if (!stray.size) break;
      const dst = new Uint8Array(W * k.H); for (let p = 0; p < dst.length; p++) if (lab.id[p] === best) dst[p] = 1;
      for (const c of stray) {
        const src = new Uint8Array(W * k.H); for (let p = 0; p < src.length; p++) if (lab.id[p] === c) src[p] = 1;
        const path = cheapestPath(k, src, dst); if (!path) continue;
        for (const p of path) { carve2(k, p % W, (p / W) | 0); st.carved++; }
        break; // 바뀐 지형으로 다시 계산
      }
    }
    const walk = walkOf(k); // 3) 갇힌 주머니 메우기
    const mask = new Uint8Array(W * k.H); for (const [x, y] of tiles) if (walk(x, y)) mask[y * W + x] = 1;
    const pl = label(k, mask); let bigC = 0; for (let c = 1; c < pl.sizes.length; c++) if (pl.sizes[c] > pl.sizes[bigC]) bigC = c;
    for (const [x, y] of tiles) if (mask[y * W + x] && pl.id[y * W + x] !== bigC) { g[y][x] = "#"; st.sealed++; }
    const frac = () => { let f = 0; for (const [x, y] of tiles) if (g[y][x] === ".") f++; return f / tiles.length; }; // 4) 열린 비율
    for (let guard = 0; guard < 500 && frac() < 0.38; guard++) {
      const cand = tiles.filter(([x, y]) => "RCBP".includes(g[y][x]));
      if (!cand.length) break;
      const [x, y] = ctx.pick(cand); g[y][x] = "."; st.trimmed++;
    }
    const mo = open2(k), ml = label(k, mo); let mc = -1; // 5) 적 구역
    for (const [x, y] of anchors) { const c = ml.id[y * W + x]; if (c >= 0) { mc = c; break; } }
    const okTile = (x, y) => k.valid(x, y) && g[y][x] === "." && ml.id[y * W + x] === mc;
    const zs = [];
    for (const z of zones && zones.length ? zones : [k.all()]) {
      let good = 0, tot = 0;
      for (let j = 0; j < z.h; j++) for (let i = 0; i < z.w; i++) { if (!k.valid(z.x + i, z.y + j)) continue; tot++; if (okTile(z.x + i, z.y + j)) good++; }
      if (tot && good / tot >= 0.3 && good >= 2) zs.push({ x: z.x, y: z.y, w: z.w, h: z.h, weight: z.weight || 1 });
    }
    return { rows: g, zones: zs.length ? zs : [k.all()], dbg: st };
  }

  // 등록 도우미: def.make(ctx, k) → zones 배열(또는 undefined)
  function reg(def) {
    const { make, ...meta } = def;
    TC.registerArchetype({ ...meta, build(ctx) { const k = makeKit(ctx); return finish(ctx, k, make(ctx, k)); } });
  }
  const ALL = ["1x1", "2x1", "1x2", "2x2", "L"], NE = ["normal", "elite"];

  // ═════════════════════════ A. 흩어진 / 유기적인 방 ═════════════════════════

  reg({
    id: "open-field", kinds: NE, shapes: ALL, floors: [1, 8], weight: 3, tags: ["open", "organic"], stampSets: ["cover", "decor-mix"], stampCount: [1, 3],
    make(ctx, k) { // 거의 비어 있다: 엄폐 몇 개와 한쪽에 치우친 바위 덩어리
      const shapes = [["P"], ["R"], ["C"], ["PP"], ["P", "P"], ["RR"], ["CC"], ["P.", "PP"], ["R.R"]];
      k.scatter(k.nArea(ctx.int(2, 4)) + (k.elite() ? 2 : 0), shapes, 1, 70);
      for (let i = k.nArea(ctx.int(1, 2)); i > 0; i--) for (let t = 0; t < 8; t++) if (k.blob(k.ri(k.x0 + 2, k.x1 - 2), k.ri(k.y0 + 1, k.y1 - 1), ctx.int(4, 10), k.solid(), 2, 1)) break;
      return k.openZones(2, 6, 3);
    },
  });

  reg({
    id: "scatter-pillars", kinds: NE, shapes: ALL, floors: [1, 8], weight: 2, tags: ["cover", "gradient"], stampSets: ["cover", "rocks"], stampCount: [0, 2],
    make(ctx, k) { // 기둥 격자에 밀도 기울기 — 한쪽은 빽빽하고 반대쪽은 휑하다
      const { xs, ys } = k.lattice(3, 1, 1, 1), slope = ctx.pick([-1, 1]) * (ctx.int(4, 9) / 10), base = ctx.int(55, 85) / 100, vslope = ctx.int(-3, 3) / 10, ch = k.elite() ? "#" : "P";
      for (const y of ys) for (const x of xs) {
        const tx = (x - k.x0) / k.w - 0.5, ty = (y - k.y0) / k.h - 0.5, p = base + slope * tx + vslope * ty;
        if (!ctx.chance(Math.max(0.05, Math.min(0.95, p)))) continue;
        const jx = ctx.chance(0.35) ? ctx.pick([-1, 1]) : 0, jy = ctx.chance(0.2) ? ctx.pick([-1, 1]) : 0;
        k.set(x + jx, y + jy, ch); if (ctx.chance(0.3)) k.set(x + jx + ctx.pick([-1, 1]), y + jy, ch); else if (ctx.chance(0.2)) k.set(x + jx, y + jy + ctx.pick([-1, 1]), ch);
      }
      k.scatter(k.nArea(ctx.int(1, 3)), [["PP"], ["P", "P"], ["P.", "PP"], ["R"]], 1, 40);
      return k.openZones(2, 6, 3);
    },
  });

  reg({
    id: "staggered-rocks", kinds: NE, shapes: ALL, floors: [1, 8], weight: 2, tags: ["cover", "rocks", "drift"], stampSets: ["crates", "decor-mix"], stampCount: [0, 2],
    make(ctx, k) { // 줄마다 점점 밀리는(drift) 바위, 위쪽은 빽빽 아래쪽은 성김
      const { xs, ys } = k.lattice(3, 1, 1, 1), ch = k.elite() ? "P" : "R", drift = ctx.pick([1, 2, 2, -1]), p0 = ctx.int(65, 95) / 100, dp = ctx.int(-4, 4) / 10;
      ys.forEach((y, j) => xs.forEach(x => {
        const p = Math.max(0.08, Math.min(0.95, p0 + dp * (j / Math.max(1, ys.length - 1) - 0.5)));
        if (ctx.chance(p)) { const xx = x + ((j * drift) % 3 + 3) % 3 - 1; k.set(xx, y, ch); if (ctx.chance(0.3)) k.set(xx + 1, y, ch); if (ctx.chance(0.12)) k.set(xx, y + 1, ch); }
      }));
      return k.openZones(2, 6, 3);
    },
  });

  function drawU(k, x, y, uw, uh, open, ch) { // open: N S E W (열린 쪽). 가로형은 uw×uh, 세로형은 uh×uw
    const vert = open === "E" || open === "W", w = vert ? uh : uw, h = vert ? uw : uh;
    k.frame(x, y, w, h, ch);
    if (open === "N") for (let i = 1; i < w - 1; i++) k.set(x + i, y, ".");
    if (open === "S") for (let i = 1; i < w - 1; i++) k.set(x + i, y + h - 1, ".");
    if (open === "W") for (let j = 1; j < h - 1; j++) k.set(x, y + j, ".");
    if (open === "E") for (let j = 1; j < h - 1; j++) k.set(x + w - 1, y + j, ".");
    return { w, h };
  }
  reg({
    id: "bunker-u", kinds: NE, shapes: ALL, floors: [1, 8], weight: 2, tags: ["bunker", "cover"], stampSets: ["cover", "crates"], stampCount: [1, 3],
    make(ctx, k) { // 한쪽이 무너진 U자 벙커 (칸마다 위치·방향·크기가 제각각)
      const zones = [];
      for (const c of ctx.cells.slice(0, 3)) {
        if (ctx.cells.length > 1 && ctx.chance(0.25)) continue;
        const b = k.cellBox(c), open = ctx.pick(["N", "S", "E", "W"]), ch = k.elite() ? "#" : k.solid();
        const vert = open === "E" || open === "W", uw = vert ? ctx.pick([3, 5]) : ctx.pick([6, 7, 8, 9]), uh = 3, bw = vert ? uh : uw, bh = vert ? uw : uh;
        const x = k.ri(b.x0 + 1, b.x1 - bw), y = k.ri(b.y0 + 1, b.y1 - bh);
        const pat = []; for (let j = 0; j < bh; j++) pat.push("X".repeat(bw));
        if (!k.canPlace(pat, x, y, 1)) continue;
        drawU(k, x, y, uw, uh, open, ch);
        if (ctx.chance(0.6)) { // 무너진 곳
          const side = ctx.pick([[x, y + 1], [x + bw - 1, y + bh - 2], [x + 1, y], [x + bw - 2, y + bh - 1]]); k.set(side[0], side[1], ctx.pick([".", "R"]));
        }
        const fx = open === "E" ? x + bw : open === "W" ? x - 3 : x, fy = open === "S" ? y + bh : open === "N" ? y - 3 : y;
        zones.push(k.zone(x + 1, y + 1, Math.max(1, bw - 2), Math.max(1, bh - 2), 1), k.zone(fx, fy, vert ? 3 : bw, vert ? bh : 3, 2));
      }
      k.scatter(k.nArea(ctx.int(2, 3)), [["P"], ["R"], ["CC"], ["P."], ["RR", "R."]], 1, 50);
      zones.push(k.all());
      return zones;
    },
  });

  reg({
    id: "crossroads", kinds: NE, shapes: ALL, floors: [1, 8], weight: 2, tags: ["cross", "cover"], stampSets: ["cover", "rocks"], stampCount: [1, 3],
    make(ctx, k) { // 어긋난 십자: 중심이 한쪽으로 쏠리고 네 팔 길이가 제각각, 군데군데 끊겼다
      const cx = k.x0 + (k.w >> 1) + k.ri(-3, 3), cy = k.y0 + (k.h >> 1) + ctx.int(-1, 1), ch = k.elite() ? "#" : ctx.pick(["P", "R"]);
      const arm = (dx, dy, len) => { for (let i = 1; i <= len; i++) { if (ctx.chance(0.18)) continue; k.set(cx + dx * i, cy + dy * i, ch); } };
      k.set(cx, cy, ch);
      const hx = Math.max(2, (k.w >> 1) - 3), hy = Math.max(1, (k.h >> 1) - 2);
      arm(1, 0, ctx.int(Math.ceil(hx / 2), hx)); arm(-1, 0, ctx.int(1, hx));
      arm(0, 1, ctx.int(0, hy)); arm(0, -1, ctx.int(1, hy));
      if (ctx.chance(0.6)) { arm(1, 1, ctx.int(0, 2)); arm(-1, -1, ctx.int(0, 2)); } // 모서리 쪽 삐죽
      for (let i = k.nArea(1); i > 0; i--) k.blob(k.ri(k.x0 + 1, k.x1 - 1), k.ri(k.y0 + 1, k.y1 - 1), ctx.int(3, 6), "R", 2, 1);
      k.scatter(k.nArea(ctx.int(1, 2)), [["P"], ["CC"], ["R"]], 1, 40);
      return k.openZones(2, 6, 3);
    },
  });

  reg({
    id: "corner-bunkers", kinds: NE, shapes: ALL, floors: [1, 8], weight: 2, tags: ["cover", "corners"], stampSets: ["crates", "barrels"], stampCount: [0, 2],
    make(ctx, k) { // 두세 모서리에만 크기가 다른 ㄱ자 엄폐물 (놓이는 모서리가 매번 다르다)
      const ch = k.elite() ? "#" : k.solid(), alt = ctx.chance(0.4) ? "C" : ch;
      const pool = [[ch + ch, ch + "."], [ch + ch + ch, ch + ".."], [ch + ch, ch + ch], [ch + ".", ch + ch, ch + "."], [ch + ch + ".", ch + ch + ch], [alt + alt, alt + "."]];
      const corners = [[k.x0, k.y0, 0, 0], [k.x1, k.y0, 1, 0], [k.x0, k.y1, 0, 1], [k.x1, k.y1, 1, 1]].filter(() => ctx.chance(0.8));
      if (corners.length < 2) corners.push([k.x0, k.y0, 0, 0], [k.x1, k.y1, 1, 1]);
      for (const [cx, cy, fx, fy] of corners) {
        let pat = ctx.pick(pool); if (fx) pat = k.flipH(pat); if (fy) pat = k.flipV(pat);
        const ox = ctx.int(1, 3), oy = ctx.int(0, 2), x = fx ? cx - pat[0].length + 1 - ox : cx + ox, y = fy ? cy - pat.length + 1 - oy : cy + oy;
        k.tryPlace(pat, x, y, 0);
      }
      k.scatter(k.nArea(ctx.int(1, 2)) + (k.ncell > 1 ? k.ncell : 0), [[ch + ch, ch + ch], ["CC", "C."], ["RR"], [ch], [ch + ".", ch + ch]], 1, 60);
      return k.openZones(2, 6, 3);
    },
  });

  // ───────────────────────── 줄 · 지그재그 · 미로 ─────────────────────────
  function bars(ctx, k, vertical) {
    const ch = k.elite() ? "#" : ctx.pick(["P", "P", "R"]), zones = [];
    const thick0 = ctx.pick([1, 1, 2]), pitch = thick0 + 2, lat = vertical ? k.lattice(pitch, thick0, 2, 1) : k.lattice(pitch, thick0, 1, 2), lines = (vertical ? lat.xs : lat.ys).filter(() => ctx.chance(0.85));
    const x0 = vertical ? k.y0 : k.x0, len = vertical ? k.h : k.w;
    for (const l of lines) {
      const thick = ctx.chance(0.2) ? 3 - thick0 : thick0;
      let p = x0 + ctx.int(0, 5), guard = 0;
      while (p < x0 + len - 1 && guard++ < 20) {
        const seg = ctx.int(3, 8) + (k.elite() ? 1 : 0), gap = ctx.int(2, 3);
        if (ctx.chance(0.82)) for (let t = 0; t < thick; t++) vertical ? k.vline(l + t, p, seg, ch) : k.hline(p, l + t, seg, ch);
        p += seg + gap;
      }
    }
    k.scatter(k.nArea(ctx.int(1, 3)), [["P"], ["R"], ["CC"], ["PP"]], 1, 40);
    const edge = vertical ? [k.x0, ...lines.map(v => v + thick0)] : [k.y0, ...lines.map(v => v + thick0)], edge2 = vertical ? [...lines, k.x1 + 1] : [...lines, k.y1 + 1];
    for (let i = 0; i < edge2.length; i++) { const a = edge[i], b = edge2[i]; if (b - a >= 2) zones.push(vertical ? k.zone(a, k.y0, b - a, k.h, 1) : k.zone(k.x0, a, k.w, b - a, 1)); }
    return zones;
  }
  reg({ id: "lanes-h", kinds: NE, shapes: ALL, floors: [1, 8], weight: 2, tags: ["lanes", "cover"], stampSets: ["rocks", "crates"], stampCount: [0, 2], make: (ctx, k) => bars(ctx, k, false) });
  reg({ id: "lanes-v", kinds: NE, shapes: ALL, floors: [1, 8], weight: 2, tags: ["lanes", "cover"], stampSets: ["rocks", "crates"], stampCount: [0, 2], make: (ctx, k) => bars(ctx, k, true) });

  reg({
    id: "zigzag", kinds: NE, shapes: ALL, floors: [2, 8], weight: 1.5, tags: ["serpentine", "corridor"], stampSets: ["crates", "barrels"], stampCount: [0, 1],
    make(ctx, k) { // 긴 벽이 번갈아 내려오되 간격·길이·방향이 불규칙 — 구불구불한 길
      const vert = k.long() === "x", ch = k.elite() ? "#" : ctx.pick(["P", "#", "P"]), span = vert ? k.h : k.w, start = (vert ? k.x0 : k.y0) + ctx.int(1, 3), end = (vert ? k.x1 : k.y1) - 1;
      let top = ctx.chance(0.5);
      for (let l = start; l <= end - 1; l += ctx.pick([3, 3, 4, 5])) {
        const len = span - 2 - ctx.int(0, 1) - (ctx.chance(0.25) ? 1 : 0);
        for (let i = 0; i < len; i++) { const a = top ? i : span - 1 - i; if (ctx.chance(0.94)) vert ? k.set(l, k.y0 + a, ch) : k.set(k.x0 + a, l, ch); }
        top = ctx.chance(0.8) ? !top : top;
      }
      return [k.all()];
    },
  });

  reg({
    id: "mini-maze", kinds: ["normal"], shapes: ["2x1", "1x2", "2x2", "L"], floors: [3, 8], weight: 1, tags: ["maze"], stampSets: [], stampCount: [0, 0],
    make(ctx, k) { // 폭 2칸 길 + 1칸 벽의 미로 (일부 벽을 터서 순환 길을 만든다)
      const nx = Math.floor((k.w + 1) / 3), ny = Math.floor((k.h + 1) / 3);
      if (nx < 2 || ny < 1) return;
      const ox = k.x0 + Math.floor((k.w - (3 * nx - 1)) / 2), oy = k.y0 + Math.floor((k.h - (3 * ny - 1)) / 2);
      k.rect(ox, oy, 3 * nx - 1, 3 * ny - 1, "#");
      const cellAt = (i, j) => [ox + 3 * i, oy + 3 * j];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const [x, y] = cellAt(i, j); k.rect(x, y, 2, 2, "."); }
      const seen = new Set(), key = (i, j) => i + "," + j, open = (a, b) => {
        const [ax, ay] = cellAt(a[0], a[1]);
        if (b[0] > a[0]) k.rect(ax + 2, ay, 1, 2, "."); else if (b[0] < a[0]) k.rect(ax - 1, ay, 1, 2, "."); else if (b[1] > a[1]) k.rect(ax, ay + 2, 2, 1, "."); else k.rect(ax, ay - 1, 2, 1, ".");
      };
      const stack = [[ctx.int(0, nx - 1), ctx.int(0, ny - 1)]]; seen.add(key(...stack[0]));
      while (stack.length) {
        const [i, j] = stack[stack.length - 1], nb = DIRS.map(([dx, dy]) => [i + dx, j + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < nx && b < ny && !seen.has(key(a, b)));
        if (!nb.length) { stack.pop(); continue; }
        const n = ctx.pick(nb); open([i, j], n); seen.add(key(...n)); stack.push(n);
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        if (i + 1 < nx && ctx.chance(0.16)) open([i, j], [i + 1, j]);
        if (j + 1 < ny && ctx.chance(0.16)) open([i, j], [i, j + 1]);
      }
      for (let t = ctx.int(0, 3); t > 0; t--) { const [x, y] = cellAt(ctx.int(0, nx - 1), ctx.int(0, ny - 1)); k.set(x + ctx.int(0, 1), y + ctx.int(0, 1), ctx.pick(["C", "B"])); }
      return [k.all()];
    },
  });

  // ───────────────────────── 상자 · 통 · 구덩이 ─────────────────────────
  reg({
    id: "crate-field", kinds: NE, shapes: ALL, floors: [1, 8], weight: 2.5, tags: ["crates", "ambush"], stampSets: ["crates", "barrels"], stampCount: [0, 2],
    make(ctx, k) { // 상자 더미 사이사이에 적이 숨어 있다 — 더미마다 크기가 다르고 한쪽으로 몰려 있다
      const { xs, ys } = k.lattice(4, 2, 2, 2), zones = [], slope = ctx.pick([-1, 1]) * ctx.int(2, 6) / 10, pick = () => ctx.pick(["C", "C", "C", "C", "C", "B", "R"]);
      for (const y of ys) for (const x of xs) {
        const t = (x - k.x0) / k.w - 0.5;
        if (!ctx.chance(Math.max(0.3, Math.min(0.99, 0.9 + slope * t)))) continue;
        const w = ctx.pick([2, 2, 3, 1, 2]), h = ctx.pick([2, 2, 1, 3]), ox = ctx.int(-1, 1), oy = ctx.int(-1, 1);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (ctx.chance(0.88)) k.set(x + ox + i, y + oy + j, pick());
      }
      k.scatter(k.nArea(ctx.int(2, 4)), [["C"], ["CC"], ["C", "C"], ["B"]], 1, 50);
      for (const x of xs.slice(0, -1)) zones.push(k.zone(x + 2, k.y0, 2, k.h, 2));
      for (const y of ys.slice(0, -1)) zones.push(k.zone(k.x0, y + 2, k.w, 2, 2));
      if (!zones.length) zones.push(k.all());
      return zones;
    },
  });

  reg({
    id: "barrel-moat", kinds: NE, shapes: ALL, floors: [2, 8], weight: 1.5, tags: ["explosive", "island", "organic"], stampSets: ["pillars", "rocks"], stampCount: [0, 2],
    make(ctx, k) { // 자라난 바위 섬과 그 둘레의 폭발 통 해자 — 위치도 모양도 제각각
      const islands = Math.max(1, Math.round(ctx.int(1, 2) * k.scale() * 0.7)), inner = k.elite() ? "P" : "R";
      for (let n = 0; n < islands; n++) {
        let placed = false;
        for (let t = 0; t < 25 && !placed; t++) {
          const sz = ctx.int(4, 9) + (k.ncell > 1 ? ctx.int(0, 5) : 0), sx = k.ri(k.x0 + 3, k.x1 - 3), sy = k.ri(k.y0 + 2, k.y1 - 2);
          const cells = []; const before = g2(k);
          if (k.blob(sx, sy, sz, inner, 3, 1) < 3) continue;
          for (let y = k.y0; y <= k.y1; y++) for (let x = k.x0; x <= k.x1; x++) if (before[y][x] === "." && k.g[y][x] === inner) cells.push([x, y]);
          for (const [x, y] of cells) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && k.free(x + dx, y + dy) && !ctx.reserved(x + dx, y + dy) && ctx.chance(0.82)) k.set(x + dx, y + dy, "B");
          placed = true;
        }
      }
      return k.openZones(2, 6, 3);
    },
  });
  function g2(k) { return k.g.map(r => r.slice()); }

  reg({
    id: "pit-islands", kinds: NE, shapes: ALL, floors: [2, 8], weight: 1.5, tags: ["pits", "organic"], stampSets: ["pits", "rocks"], stampCount: [0, 2],
    make(ctx, k) { // 자란 구덩이 웅덩이들 — 탄은 통과, 걷지는 못함
      const n = k.nArea(ctx.int(3, 4));
      for (let t = 0, placed = 0; t < 100 && placed < n; t++) if (k.blob(k.ri(k.x0 + 2, k.x1 - 2), k.ri(k.y0 + 2, k.y1 - 2), ctx.int(3, 9), "V", 2, 1) > 2) placed++;
      return k.openZones(2, 6, 3);
    },
  });

  reg({
    id: "chasm", kinds: NE, shapes: ALL, floors: [3, 8], weight: 1.5, tags: ["river", "pits"], stampSets: ["rocks", "crates"], stampCount: [0, 2],
    make(ctx, k) { // 방을 가로지르는 구불구불한 협곡 — 문 앞과 필요한 곳엔 다리가 놓인다 (finish가 뚫어 준다)
      const alongX = k.long() === "x", t = ctx.pick([1, 2, 2]);
      let pos = alongX ? k.ri(k.y0 + 2, k.y1 - 3) : k.ri(k.x0 + 2, k.x1 - 3);
      const a0 = alongX ? k.x0 : k.y0, a1 = alongX ? k.x1 : k.y1, lo = (alongX ? k.y0 : k.x0) + 1, hi = (alongX ? k.y1 : k.x1) - t;
      for (let a = a0; a <= a1; a++) {
        for (let i = 0; i < t; i++) alongX ? k.set(a, pos + i, "V") : k.set(pos + i, a, "V");
        if (ctx.chance(0.15)) { const w = ctx.pick([1, 2]); alongX ? k.rect(a, pos - 1, 1, t + w, "V") : k.rect(pos - 1, a, t + w, 1, "V"); }
        pos = Math.max(lo, Math.min(hi, pos + ctx.pick([-1, 0, 0, 0, 1])));
      }
      k.scatter(ctx.int(1, 3), [["R"], ["C"], ["PP"]], 1, 30);
      return k.openZones(2, 6, 3);
    },
  });

  reg({
    id: "powder-store", kinds: NE, shapes: ALL, floors: [2, 8], weight: 1.5, tags: ["explosive", "cover"], stampSets: ["barrels", "walls"], stampCount: [1, 3],
    make(ctx, k) { // 화약고: 구불구불한 바위벽 옆에 쌓아 둔 폭발 통 더미
      const wall = k.elite() ? "#" : "R", heaps = [["BB", "BB"], ["BBB"], [".B.", "BBB", ".B."], ["B", "B", "B"], ["BB"], ["B.", "BB"]];
      for (let i = k.nArea(ctx.int(1, 2)); i > 0; i--) k.wander(k.ri(k.x0 + 1, k.x1 - 1), k.ri(k.y0 + 1, k.y1 - 1), ctx.int(4, 8), wall, 0.8, 1);
      k.scatter(2 + k.nArea(ctx.int(2, 3)), heaps, 1, 90);
      return k.openZones(2, 6, 3);
    },
  });

  // ───────────────────────── 폐허 · 대각선 · 동굴 ─────────────────────────
  reg({
    id: "ruins", kinds: NE, shapes: ALL, floors: [1, 8], weight: 2, tags: ["broken", "walls"], stampSets: ["walls", "rocks", "decor-mix"], stampCount: [1, 3],
    make(ctx, k) { // 무너진 벽 조각들 — 서로 2칸 이상 떨어지고, 가장자리에 붙은 것도 있다
      const n = k.nArea(k.elite() ? 8 : 6), segs = [];
      const clear = (x, y, w, h) => {
        for (const s of segs) if (x < s.x + s.w + 2 && x + w + 2 > s.x && y < s.y + s.h + 2 && y + h + 2 > s.y) return false;
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!k.free(x + i, y + j) || ctx.reserved(x + i, y + j)) return false;
        return true;
      };
      for (let t = 0; t < 140 && segs.length < n; t++) {
        const vert = ctx.chance(0.5), len = ctx.int(2, 6), w = vert ? 1 : len, h = vert ? len : 1, x = ctx.int(k.x0, k.x1 - w + 1), y = ctx.int(k.y0, k.y1 - h + 1);
        if (!clear(x, y, w, h)) continue;
        segs.push({ x, y, w, h });
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (ctx.chance(0.92)) k.set(x + i, y + j, "#");
        if (len >= 3 && ctx.chance(0.5)) k.set(vert ? x : x + ctx.pick([0, len - 1]), vert ? y + ctx.pick([0, len - 1]) : y, ctx.pick(["R", "C"]));
      }
      return k.openZones(2, 6, 3);
    },
  });

  function diagPat(len, dir) { // dir 1: ↘ , -1: ↙
    const rows = []; for (let j = 0; j < len; j++) { let r = ""; for (let i = 0; i < len; i++) r += (dir === 1 ? i === j : i === len - 1 - j) ? "X" : "."; rows.push(r); }
    return rows;
  }
  reg({
    id: "diagonal-walls", kinds: NE, shapes: ALL, floors: [2, 8], weight: 1.5, tags: ["diagonal", "cover"], stampSets: ["cover", "crates"], stampCount: [0, 2],
    make(ctx, k) { // 계단식 대각선 벽 — 길이도 방향도 제각각
      const ch = k.elite() ? "#" : ctx.pick(["P", "R"]), n = k.nArea(ctx.int(3, 5));
      for (let t = 0, placed = 0; t < 90 && placed < n; t++) {
        const len = ctx.int(3, 6), rows = diagPat(len, ctx.pick([1, -1])).map(r => r.replace(/X/g, ch));
        if (k.tryPlace(rows, k.ri(k.x0, k.x1 - len + 1), k.ri(k.y0, k.y1 - len + 1), 1)) placed++;
      }
      return k.openZones(2, 6, 3);
    },
  });

  reg({
    id: "cave-noise", kinds: NE, shapes: ALL, floors: [3, 8], weight: 2, tags: ["cave", "organic"], stampSets: ["rocks", "crates"], stampCount: [0, 1],
    make(ctx, k) { // 노이즈 동굴: 둥글고 불규칙한 바위 덩어리와 굽이진 통로
      k.caves(ctx.pick([0.4, 0.46, 0.52]), ctx.int(5, 6), "#", "R");
      return k.openZones(3, 5, 3);
    },
  });

  reg({
    id: "rock-garden", kinds: NE, shapes: ALL, floors: [1, 8], weight: 2, tags: ["rocks", "organic"], stampSets: ["rocks", "decor-mix"], stampCount: [0, 2],
    make(ctx, k) { // 노이즈로 자란 바위밭 — 군데군데 뭉치고 틈이 벌어졌다
      k.caves(ctx.pick([0.22, 0.28, 0.34]), ctx.int(4, 5), k.elite() ? "P" : "R", k.elite() ? "P" : "R");
      return k.openZones(3, 5, 3);
    },
  });

  reg({
    id: "wandering-wall", kinds: NE, shapes: ALL, floors: [2, 8], weight: 1.5, tags: ["wall", "organic"], stampSets: ["rocks", "crates"], stampCount: [0, 2],
    make(ctx, k) { // 랜덤 워크로 뻗은 벽 — 한두 가닥이 방 안으로 굽이쳐 들어온다
      const n = ctx.int(1, 2) + (k.ncell > 2 ? 1 : 0), ch = k.elite() ? "#" : ctx.pick(["#", "R"]);
      for (let i = 0; i < n; i++) {
        const sx = ctx.chance(0.5) ? ctx.pick([k.x0, k.x1]) : k.ri(k.x0, k.x1), sy = sx === k.x0 || sx === k.x1 ? k.ri(k.y0, k.y1) : ctx.pick([k.y0, k.y1]);
        k.wander(sx, sy, Math.round(ctx.int(8, 16) * Math.pow(k.ncell, 0.6)), ch, 0.7, 1);
      }
      k.scatter(ctx.int(1, 3), [["P"], ["R"], ["CC"]], 1, 30);
      return k.openZones(2, 6, 3);
    },
  });

  reg({
    id: "lopsided-arena", kinds: NE, shapes: ALL, floors: [2, 8], weight: 2, tags: ["arena", "offcenter"], stampSets: ["cover", "crates"], stampCount: [1, 2],
    make(ctx, k) { // 한쪽 구석에 치우친 삐뚤어진 아레나 (벽 틈도 불규칙)
      const ch = k.elite() ? "#" : ctx.pick(["#", "R"]); let w = 0, h = 0, x = 0, y = 0, ok = false;
      for (let t = 0; t < 30 && !ok; t++) {
        w = k.ri(6, Math.min(k.w - 5, ctx.int(7, 12))); h = Math.min(k.h - 4, ctx.int(3, 6));
        const right = ctx.chance(0.5), down = ctx.chance(0.5);
        x = right ? k.x1 - w - ctx.int(1, 4) : k.x0 + ctx.int(1, 4); y = down ? k.y1 - h - ctx.int(0, 2) : k.y0 + ctx.int(0, 2);
        const pat = []; for (let j = 0; j < h; j++) pat.push("X".repeat(w));
        ok = k.canPlace(pat, x, y, 1);
      }
      if (!ok) { for (let i = 0; i < 3; i++) k.blob(k.ri(k.x0 + 2, k.x1 - 2), k.ri(k.y0 + 1, k.y1 - 1), 8, ch, 2, 1); return k.openZones(2, 6, 3); }
      k.frame(x, y, w, h, ch);
      for (let gap = ctx.int(2, 3); gap > 0; gap--) {
        const side = ctx.int(0, 3), len = ctx.int(1, 2);
        if (side === 0) k.rect(k.ri(x + 1, x + w - 3), y, len + 1, 1, "."); else if (side === 1) k.rect(k.ri(x + 1, x + w - 3), y + h - 1, len + 1, 1, ".");
        else if (side === 2) k.rect(x, k.ri(y + 1, y + h - 3), 1, len + 1, "."); else k.rect(x + w - 1, k.ri(y + 1, y + h - 3), 1, len + 1, ".");
      }
      if (h >= 5 && w >= 6 && ctx.chance(0.7)) k.set(x + ctx.int(2, w - 3), y + ctx.int(2, h - 3), "P");
      k.scatter(ctx.int(1, 3), [["P"], ["R"], ["CC"]], 1, 30);
      return [k.zone(x + 1, y + 1, w - 2, h - 2, 3), ...k.openZones(1, 6, 3)];
    },
  });

  // ───────────────────────── 엘리트 전용 ─────────────────────────
  reg({
    id: "elite-hall", kinds: ["elite"], shapes: ["1x1", "2x1", "1x2", "2x2"], floors: [2, 8], weight: 3, tags: ["elite", "blocks"], stampSets: ["walls", "barrels"], stampCount: [1, 3],
    make(ctx, k) { // 엘리트 전용: 높이도 위치도 제각각인 묵직한 벽 블록 사이 틈에서 맞붙는다
      const rowsLat = k.lattice(5, 3, 2, 2), colsLat = k.lattice(4, 2, 2, 2), zones = [];
      for (const y0 of rowsLat.ys.length ? rowsLat.ys : [k.y0 + 2]) for (const x of colsLat.xs) {
        if (ctx.chance(0.2)) continue;
        const h = ctx.pick([3, 3, 2, 1]), y = y0 + ctx.int(0, 3 - h), w = ctx.pick([2, 2, 2, 3, 1]), ch = ctx.pick(["#", "#", "P"]);
        k.rect(x + ctx.int(-1, 0), y, w, h, ch);
        if (ctx.chance(0.4)) k.set(x + ctx.int(0, 1), y + h + ctx.int(0, 1), ctx.pick(["R", "C", "B"]));
      }
      k.scatter(ctx.int(1, 2), [["P"], ["PP"], ["R"]], 1, 30);
      for (const x of colsLat.xs.slice(0, -1)) zones.push(k.zone(x + 2, k.y0, 2, k.h, 2));
      zones.push(k.all());
      return zones;
    },
  });

  // ═════════════════════════ B. 큰 방 전용 ═════════════════════════

  // 격식 있는 모양들(colonnade · split-hall · quad-arena · central-plaza · twin-bunkers): 틀은 반듯하지만 간격·누락·크기를 흔들어 놓았다.
  reg({
    id: "colonnade", kinds: NE, shapes: ALL, floors: [1, 8], weight: 2, tags: ["pillars", "aisles", "formal"], stampSets: ["rocks", "crates"], stampCount: [0, 2],
    make(ctx, k) { // 쌍기둥 줄이 복도를 나눈다 (긴 쪽을 따라) — 군데군데 무너져 있다
      const alongX = k.long() === "x", ch = k.elite() ? "#" : "P", zones = [];
      const rows = []; for (let p = (alongX ? k.y0 : k.x0) + 1; p <= (alongX ? k.y1 : k.x1) - 1; p += 4) if (ctx.chance(0.9)) rows.push(p);
      rows.forEach(r => {
        const phase = ctx.int(0, 3), pitch = ctx.pick([4, 4, 5]), keep = ctx.int(60, 90) / 100;
        for (let q = (alongX ? k.x0 : k.y0) + phase; q < (alongX ? k.x1 : k.y1); q += pitch) for (let t = 0; t < 2; t++) {
          if (!ctx.chance(keep)) continue;
          alongX ? k.set(q + t, r, ch) : k.set(r, q + t, ch);
        }
      });
      for (let i = 0; i + 1 < rows.length; i++) zones.push(alongX ? k.zone(k.x0, rows[i] + 1, k.w, rows[i + 1] - rows[i] - 1, 1) : k.zone(rows[i] + 1, k.y0, rows[i + 1] - rows[i] - 1, k.h, 1));
      k.blob(k.ri(k.x0 + 2, k.x1 - 2), k.ri(k.y0 + 1, k.y1 - 1), ctx.int(3, 6), "R", 2, 1);
      zones.push(k.all());
      return zones;
    },
  });

  reg({
    id: "split-hall", kinds: NE, shapes: ["2x1", "1x2"], floors: [1, 8], weight: 3, tags: ["divided", "gate", "formal"], stampSets: ["cover", "crates"], stampCount: [1, 3],
    make(ctx, k) { // 나뉜 홀: 두 방 사이 벽에 통로(문)와 군데군데 난 틈 — 두 쪽의 분위기가 다르다
      const horiz = k.long() === "x", link = (ctx.links || [])[0], ch = "#";
      const bx = horiz ? (link ? link.x : 16) - 1 : 0, by = horiz ? 0 : (link ? link.y : 9) - 1, lc = horiz ? (link ? link.y : k.y0 + (k.h >> 1)) : (link ? link.x : k.x0 + (k.w >> 1));
      const lo = lc - 1, hi = lc + ctx.int(0, 1), a0 = horiz ? k.y0 : k.x0, a1 = horiz ? k.y1 : k.x1;
      const extra = ctx.chance(0.55) ? k.ri(a0 + 1, a1 - 2) : -99, extraLen = ctx.int(1, 2);
      for (let p = a0; p <= a1; p++) {
        const open = (p >= lo && p <= hi) || (p >= extra && p < extra + extraLen + 1) || ctx.chance(0.07);
        if (!open) horiz ? k.set(bx, p, ch) : k.set(p, by, ch);
      }
      if (ctx.chance(0.7)) for (const edge of [ctx.chance(0.5) ? lo - 1 : hi + 1]) for (const d of [ctx.pick([-1, 1])]) horiz ? k.set(bx + d, edge, "P") : k.set(edge, by + d, "P");
      const half = horiz ? [[k.x0, bx - 2], [bx + 2, k.x1]] : [[k.y0, by - 2], [by + 2, k.y1]], n = [ctx.int(1, 3), ctx.int(2, 4)];
      half.forEach(([a, b], i) => {
        const cnt = n[i];
        for (let t = 0, placed = 0; t < 40 && placed < cnt; t++) {
          const px = horiz ? k.ri(a, b) : k.ri(k.x0, k.x1), py = horiz ? k.ri(k.y0, k.y1) : k.ri(a, b);
          if (i === 0 && ctx.chance(0.5) ? k.blob(px, py, ctx.int(2, 5), ctx.pick(["R", "P"]), 1, 1) : k.tryPlace(ctx.pick([["P"], ["R"], ["PP"], ["C"]]), px, py, 1)) placed++;
        }
      });
      return half.map(([a, b]) => (horiz ? k.zone(a, k.y0, b - a + 1, k.h, 2) : k.zone(k.x0, a, k.w, b - a + 1, 2)));
    },
  });

  reg({
    id: "quad-arena", kinds: NE, shapes: ["2x2"], floors: [2, 8], weight: 3, tags: ["divided", "quadrants", "formal"], stampSets: ["cover", "barrels"], stampCount: [2, 4],
    make(ctx, k) { // 네 구역 아레나: 십자 칸막이 + 통로(크기·위치가 제각각), 구역마다 다른 엄폐
      const bx = 15, by = 8, zones = [], breaches = (len, fn) => { for (let i = 0; i < len; i++) if (ctx.chance(0.5)) fn(); };
      const cv = [k.y0 + 3 + ctx.int(-1, 1), k.y0 + 12 + ctx.int(-1, 1)], ch2 = [k.x0 + 7 + ctx.int(-1, 1), k.x0 + 22 + ctx.int(-1, 1)];
      const gv = cv.map(() => [1, ctx.int(1, 2)]), gh = ch2.map(() => [1, ctx.int(1, 2)]);
      for (let y = k.y0; y <= k.y1; y++) if (!cv.some((c, i) => y >= c - gv[i][0] && y <= c + gv[i][1])) k.set(bx, y, "#");
      for (let x = k.x0; x <= k.x1; x++) if (!ch2.some((c, i) => x >= c - gh[i][0] && x <= c + gh[i][1])) k.set(x, by, "#");
      breaches(3, () => k.set(bx, k.ri(k.y0, k.y1), ".")); breaches(3, () => k.set(k.ri(k.x0, k.x1), by, "."));
      k.set(bx + ctx.int(-1, 1), by + ctx.int(-1, 1), "P");
      const quads = [[k.x0, k.y0, bx - 1, by - 1], [bx + 2, k.y0, k.x1, by - 1], [k.x0, by + 2, bx - 1, k.y1], [bx + 2, by + 2, k.x1, k.y1]];
      for (const [qx0, qy0, qx1, qy1] of quads) {
        zones.push(k.zone(qx0, qy0, qx1 - qx0 + 1, qy1 - qy0 + 1, 2));
        for (let n = ctx.int(1, 3), t = 0; t < 40 && n > 0; t++) {
          const px = k.ri(qx0 + 1, qx1 - 2), py = k.ri(qy0 + 1, qy1 - 1);
          if (ctx.chance(0.45) ? k.blob(px, py, ctx.int(2, 5), ctx.pick(["R", "P", "C"]), 1, 1) : k.tryPlace(ctx.pick([["P"], ["R"], ["CC"], ["PP"]]), px, py, 1)) n--;
        }
      }
      return zones;
    },
  });

  reg({
    id: "central-plaza", kinds: NE, shapes: ["2x1", "2x2"], floors: [1, 8], weight: 2.5, tags: ["plaza", "wings", "formal"], stampSets: ["pillars", "decor-mix"], stampCount: [1, 3],
    make(ctx, k) { // 쏠린 광장(분수) + 성긴/빽빽한 기둥 줄 + 양옆 서로 다른 날개
      const cx = k.x0 + (k.w >> 1) + ctx.int(-3, 3), cy = k.y0 + (k.h >> 1) + ctx.int(-1, 1), ch = k.elite() ? "#" : "P", zones = [], gapL = ctx.int(4, 7), gapR = ctx.int(4, 7);
      [[cx - gapL - 1, 0.95], [cx + gapR, 0.5]].forEach(([sx, keep]) => {
        const { ys } = k.lattice(3, 1, 0, 1);
        for (const y of ys) if (ctx.chance(ctx.chance(0.5) ? keep : 1 - keep + 0.3)) k.set(sx, y + ctx.int(0, 1), ch);
      });
      const fountain = ctx.pick([["PP", "PP"], ["PPP"], ["P.", "PP"], ["PP"]]); k.put(fountain, cx - 1, cy - 1);
      const wL = [k.x0, cx - gapL - 3], wR = [cx + gapR + 2, k.x1], { xs, ys } = k.lattice(3, 1, 1, 1);
      ys.forEach((y, j) => xs.forEach(x => { if (x >= wL[0] && x <= wL[1] && ctx.chance(0.8)) { k.set(x + (j % 2), y, ctx.pick(["R", "C", "P"])); if (ctx.chance(0.3)) k.set(x + (j % 2) + 1, y, "R"); } }));
      for (let n = k.nArea(ctx.int(1, 2)) + 1; n > 0; n--) k.blob(k.ri(wR[0], wR[1]), k.ri(k.y0 + 1, k.y1 - 1), ctx.int(4, 9), ctx.pick(["R", "P"]), 1, 1);
      zones.push(k.zone(wL[0], k.y0, Math.max(1, wL[1] - wL[0] + 1), k.h, 1), k.zone(cx - gapL, k.y0, gapL + gapR, k.h, 3), k.zone(wR[0], k.y0, Math.max(1, wR[1] - wR[0] + 1), k.h, 1));
      return zones;
    },
  });

  reg({
    id: "fortress-gates", kinds: NE, shapes: ["1x2", "2x2"], floors: [3, 8], weight: 2.5, tags: ["fortress", "gates", "ruined"], stampSets: ["crates", "barrels"], stampCount: [1, 3],
    make(ctx, k) { // 허물어진 요새: 한쪽으로 치우친 성벽 + 제각각인 성문·성벽 틈·무너진 탑
      const fw = k.w - 4 - ctx.int(0, 4), fh = k.h - 4 - ctx.int(0, 3), x = k.x0 + k.ri(2, k.w - fw - 2), y = k.y0 + k.ri(2, k.h - fh - 2);
      k.frame(x, y, fw, fh, "#");
      const sides = ["N", "E", "S", "W"].filter(() => ctx.chance(0.7)); if (sides.length < 2) sides.push("N", "S");
      for (const s of sides) {
        const gw = ctx.int(2, 3);
        if (s === "N") k.rect(k.ri(x + 2, x + fw - 2 - gw), y, gw, 1, "."); if (s === "S") k.rect(k.ri(x + 2, x + fw - 2 - gw), y + fh - 1, gw, 1, ".");
        if (s === "W") k.rect(x, k.ri(y + 2, y + fh - 2 - gw), 1, gw, "."); if (s === "E") k.rect(x + fw - 1, k.ri(y + 2, y + fh - 2 - gw), 1, gw, ".");
      }
      for (let b = ctx.int(2, 5); b > 0; b--) { const t = ctx.int(0, 3); if (t === 0) k.set(k.ri(x + 1, x + fw - 2), y, ctx.pick([".", "R"])); else if (t === 1) k.set(k.ri(x + 1, x + fw - 2), y + fh - 1, "."); else if (t === 2) k.set(x, k.ri(y + 1, y + fh - 2), "."); else k.set(x + fw - 1, k.ri(y + 1, y + fh - 2), "R"); }
      for (const [tx, ty] of [[x + 1, y + 1], [x + fw - 3, y + 1], [x + 1, y + fh - 3], [x + fw - 3, y + fh - 3]]) if (ctx.chance(0.6)) { const s = ctx.pick([1, 2, 2]); k.rect(tx, ty, s, s, ctx.pick(["P", "P", "R"])); }
      if (k.elite()) k.rect(k.ri(x + 3, x + fw - 5), k.ri(y + 3, y + fh - 5), 2, 2, "#"); else k.scatter(ctx.int(1, 3), [["C"], ["CC"], ["B"]], 1, 30);
      k.scatter(ctx.int(1, 3), [["P"], ["R"], ["CC"]], 1, 40);
      return [k.zone(x + 1, y + 1, fw - 2, fh - 2, 3), k.all()];
    },
  });

  reg({
    id: "concentric-rings", kinds: NE, shapes: ["1x2", "2x2"], floors: [4, 8], weight: 2, tags: ["rings", "winding"], stampSets: ["crates"], stampCount: [0, 2],
    make(ctx, k) { // 겹겹의 성벽: 중심이 어긋나고 문이 엇갈려 빙 돌아 들어간다
      const zones = [];
      let L = ctx.int(2, 3), R = ctx.int(2, 3), T = ctx.int(2, 3), B = ctx.int(2, 3), side = ctx.int(0, 3), last = null;
      for (let ring = 0; ring < 2; ring++) {
        const x = k.x0 + L, y = k.y0 + T, w = k.w - L - R, h = k.h - T - B;
        if (w < 4 || h < 4) break;
        k.frame(x, y, w, h, ctx.chance(0.2) ? "R" : "#");
        const gaps = ctx.chance(0.4) ? [side, (side + 2) % 4] : [side];
        for (const s of gaps) {
          const gw = ctx.int(2, 3);
          if (s === 0) k.rect(k.ri(x + 1, x + w - 1 - gw), y, gw, 1, "."); if (s === 1) k.rect(x + w - 1, k.ri(y + 1, y + h - 1 - gw), 1, gw, ".");
          if (s === 2) k.rect(k.ri(x + 1, x + w - 1 - gw), y + h - 1, gw, 1, "."); if (s === 3) k.rect(x, k.ri(y + 1, y + h - 1 - gw), 1, gw, ".");
        }
        side = (side + 1 + ctx.int(0, 1)) % 4; last = { x, y, w, h };
        L += 3 + ctx.int(0, 1); R += 3 + ctx.int(0, 1); T += 3 + ctx.int(0, 1); B += 3 + ctx.int(0, 1);
      }
      if (last && last.w - 2 >= 2 && last.h - 2 >= 2) { zones.push(k.zone(last.x + 1, last.y + 1, last.w - 2, last.h - 2, 3)); if (k.elite()) k.scatter(1, [["P"], ["PP"]], 1, 20); }
      k.scatter(ctx.int(1, 2), [["P"], ["CC"]], 1, 30);
      zones.push(k.all());
      return zones;
    },
  });

  reg({
    id: "twin-bunkers", kinds: NE, shapes: ["2x1", "1x2"], floors: [1, 8], weight: 2.5, tags: ["bunker", "duel", "formal"], stampSets: ["cover"], stampCount: [1, 2],
    make(ctx, k) { // 마주 보는 두 벙커 — 크기·높이가 서로 다르고 가운데는 사격 구역
      const horiz = k.long() === "x", ch = k.elite() ? "#" : k.solid(), zones = [], bw1 = ctx.int(3, 5), bw2 = ctx.int(3, 6), bh1 = 3, bh2 = ctx.pick([3, 3, 5].filter(v => v <= (horiz ? k.h : k.w) - 3));
      if (horiz) {
        const y1 = k.ri(k.y0 + 1, k.y1 - bh1 - 1), y2 = k.ri(k.y0 + 1, k.y1 - bh2 - 1), xl = k.x0 + ctx.int(1, 4), xr = k.x1 - bw2 - ctx.int(0, 4) + 1;
        drawU(k, xl, y1, bh1, bw1, "E", ch); drawU(k, xr, y2, bh2, bw2, "W", ch);
        zones.push(k.zone(xl + bw1, k.y0, Math.max(2, xr - xl - bw1), k.h, 2), k.zone(xl + 1, y1 + 1, 2, 1, 1), k.zone(xr + 1, y2 + 1, 2, 1, 1));
      } else {
        const x1 = k.ri(k.x0 + 1, k.x1 - bw1 - 1), x2 = k.ri(k.x0 + 1, k.x1 - bw2 - 1), yt = k.y0 + ctx.int(1, 4), yb = k.y1 - bh2 - ctx.int(0, 4) + 1;
        drawU(k, x1, yt, bw1, bh1, "S", ch); drawU(k, x2, yb, bw2, bh2, "N", ch);
        zones.push(k.zone(k.x0, yt + bh1, k.w, Math.max(2, yb - yt - bh1), 2), k.zone(x1 + 1, yt + 1, bw1 - 2, 1, 1), k.zone(x2 + 1, yb + 1, bw2 - 2, 1, 1));
      }
      k.scatter(ctx.int(1, 3), [["P"], ["R"], ["CC"], ["B"]], 1, 40);
      return zones;
    },
  });

  reg({
    id: "long-gauntlet", kinds: NE, shapes: ["2x1", "1x2"], floors: [2, 8], weight: 2, tags: ["chicane", "teeth"], stampSets: ["crates", "barrels"], stampCount: [0, 2],
    make(ctx, k) { // 위아래에서 번갈아 튀어나온 이빨 — 간격·길이·두께가 제각각
      const alongX = k.long() === "x", ch = k.elite() ? "#" : ctx.pick(["P", "#"]);
      let top = ctx.chance(0.5);
      for (let q = (alongX ? k.x0 : k.y0) + ctx.int(2, 4); q <= (alongX ? k.x1 : k.y1) - 3; q += ctx.int(3, 4)) {
        const thick = k.elite() ? ctx.int(1, 2) : ctx.pick([1, 1, 2]), len = ctx.int(3, Math.max(3, (alongX ? k.h : k.w) - 3));
        for (let t = 0; t < thick; t++) for (let i = 0; i < len; i++) { if (alongX) k.set(q + t, top ? k.y0 + i : k.y1 - i, ch); else k.set(top ? k.x0 + i : k.x1 - i, q + t, ch); }
        top = ctx.chance(0.75) ? !top : top;
      }
      k.scatter(k.nArea(ctx.int(1, 2)), [["R"], ["CC"], ["B"]], 1, 40);
      return k.openZones(2, 6, 3);
    },
  });

  // ───────────────────────── L자 방 전용 ─────────────────────────
  function lInfo(ctx) { // 팔꿈치 칸(이웃 둘)과 팔 칸들
    const has = (cx, cy) => ctx.cells.some(c => c.cx === cx && c.cy === cy);
    const elbow = ctx.cells.find(c => DIRS.filter(([dx, dy]) => has(c.cx + dx, c.cy + dy)).length >= 2) || ctx.cells[0];
    return { elbow, arms: ctx.cells.filter(c => c !== elbow) };
  }
  reg({
    id: "l-elbow", kinds: NE, shapes: ["L"], floors: [1, 8], weight: 3, tags: ["L", "elbow"], stampSets: ["cover", "crates"], stampCount: [1, 3],
    make(ctx, k) { // 꺾이는 모서리에 어긋난 기둥 군집, 두 팔에는 서로 다른 밀도의 바위
      const { elbow, arms } = lInfo(ctx), eb = k.cellBox(elbow), ex = k.ri(eb.x0 + 3, eb.x1 - 3), ey = k.ri(eb.y0 + 2, eb.y1 - 2), ch = k.elite() ? "#" : "P", zones = [];
      k.tryPlace(ctx.pick([["PP", "PP"], ["PP", "P."], ["P", "P", "P"]]).map(r => r.replace(/P/g, ch)), ex, ey, 1);
      for (const [dx, dy] of [[-3, 0], [3, 0], [0, -2], [0, 2]]) if (ctx.chance(0.5)) k.set(ex + dx + ctx.int(-1, 1), ey + dy, ctx.pick(["R", "C", "P"]));
      arms.forEach(a => {
        const b = k.cellBox(a); zones.push(k.zone(b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, 2));
        const dens = ctx.pick([0.45, 0.6, 0.75]), lat = k.lattice(3, 1, 1, 1);
        lat.ys.forEach((y, j) => lat.xs.forEach(x => { const xx = x + (j % 2); if (xx >= b.x0 + 1 && xx <= b.x1 - 1 && y >= b.y0 && y <= b.y1 && ctx.chance(dens)) k.set(xx, y, k.elite() ? "P" : "R"); }));
        for (let i = ctx.int(1, 2); i > 0; i--) k.blob(k.ri(b.x0 + 1, b.x1 - 1), k.ri(b.y0 + 1, b.y1 - 1), ctx.int(4, 8), "R", 2, 1);
      });
      zones.push(k.zone(eb.x0, eb.y0, eb.x1 - eb.x0 + 1, eb.y1 - eb.y0 + 1, 3));
      return zones;
    },
  });
  reg({
    id: "l-lanes", kinds: NE, shapes: ["L"], floors: [2, 8], weight: 2, tags: ["L", "strips"], stampSets: ["crates", "barrels"], stampCount: [0, 2],
    make(ctx, k) { // 팔마다 가운데보다 약간 비껴 선 긴 기둥 줄 (끊어진 길이도 제각각), 팔꿈치는 열어 둔다
      const { elbow, arms } = lInfo(ctx), ch = k.elite() ? "#" : "P", zones = [];
      for (const a of arms) {
        const b = k.cellBox(a), horiz = a.cy === elbow.cy, cy = ((b.y0 + b.y1) >> 1) + ctx.int(-1, 1), cx = ((b.x0 + b.x1) >> 1) + ctx.int(-1, 1);
        const lo = horiz ? (a.cx > elbow.cx ? b.x0 + 2 + ctx.int(0, 2) : b.x0 + 1) : (a.cy > elbow.cy ? b.y0 + 2 + ctx.int(0, 1) : b.y0 + 1);
        const hi = horiz ? (a.cx > elbow.cx ? b.x1 - 1 : b.x1 - 2 - ctx.int(0, 2)) : (a.cy > elbow.cy ? b.y1 - 1 : b.y1 - 2 - ctx.int(0, 1));
        for (let p = lo; p <= hi; p++) if (ctx.chance(0.88)) horiz ? k.set(p, cy, ch) : k.set(cx, p, ch);
        zones.push(k.zone(b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, 2));
      }
      const eb = k.cellBox(elbow); k.scatter(ctx.int(1, 3), [["PP"], ["R"], ["C"], ["R."]], 1, 30);
      zones.push(k.zone(eb.x0, eb.y0, eb.x1 - eb.x0 + 1, eb.y1 - eb.y0 + 1, 3));
      return zones;
    },
  });

  // ═════════════════════════ C. 시작 방 (거의 빈 방) ═════════════════════════
  reg({
    id: "start-open", kinds: ["start"], shapes: ["1x1"], floors: [1, 8], weight: 3, tags: ["start"], stampSets: ["decor-mix"], stampCount: [0, 1],
    make(ctx, k) { k.scatter(ctx.int(0, 2), [["P"], ["R"], ["C"], ["CC"]], 2, 30); return k.openZones(1, 6, 3); },
  });
  reg({
    id: "start-pillars", kinds: ["start"], shapes: ["1x1"], floors: [1, 8], weight: 2, tags: ["start", "pillars"], stampSets: [], stampCount: [0, 0],
    make(ctx, k) { // 위쪽에 제각각 서 있는 기둥 두어 개 (아래쪽은 시작 자리)
      for (let i = ctx.int(2, 3), t = 0; i > 0 && t < 30; t++) if (k.tryPlace(ctx.pick([["P"], ["P", "P"], ["PP"]]), k.ri(k.x0 + 1, k.x1 - 2), k.ri(k.y0 + 1, k.y0 + 3), 2)) i--;
      return k.openZones(1, 6, 3);
    },
  });
  reg({
    id: "start-crates", kinds: ["start"], shapes: ["1x1"], floors: [1, 8], weight: 1.5, tags: ["start", "crates"], stampSets: [], stampCount: [0, 0],
    make(ctx, k) { // 벽 쪽에 상자·바위 몇 개 (부수면 코인이 나온다)
      for (let n = ctx.int(2, 4); n > 0; n--) k.set(k.ri(k.x0, k.x1), ctx.chance(0.7) ? k.y0 + ctx.int(0, 1) : k.y1 - ctx.int(0, 1), ctx.pick(["C", "C", "R"]));
      return k.openZones(1, 6, 3);
    },
  });
})();
