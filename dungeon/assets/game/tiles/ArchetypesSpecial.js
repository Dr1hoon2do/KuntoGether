// 특수 방 A(큰 구성) 모음 — 규약은 SPEC.md. 게임 규칙은 그대로고, 방 모양만 타일로 다시 표현한다.
// 종류(kinds): treasure · shop · sacrifice · spike · gamble · ambush · library · devil · secret.  전부 순수 JS(ctx.rng만 사용, DOM·게임 객체 참조 없음).
//
// ── build()가 돌려주는 값 ─────────────────────────────────────────────────────────────────────────
//   rows  : 2차원 문자 배열 rows[y][x] (ctx.h × ctx.w, 테두리 포함). 아이템이 놓일 자리는 'p', 제단 'a', 도박 기계 'm', 가시 'S'.
//   zones : 적 등장 구역 [{x,y,w,h,weight}] — 매복방만 채운다 (나머지는 [])
//   slots : 생성기가 게임 객체를 놓을 자리 (좌표는 rows와 같은 타일 좌표계 — 반전을 적용하면 같이 뒤집을 것. 순서가 우선순위다)
//     slots.pedestals : [[x,y],...]  바로 쓸 받침대 자리 ('p'가 그려진 곳). 개수 = 필요한 만큼(아래), 인원이 많아 모자라면 spare를 쓴다
//     slots.spare     : [[x,y],...]  추가 자리 ('p'는 그려지지 않음). 상점의 shopExtra 같은 초과 품목용
//     slots.altar     : [x,y]        희생 제단 ('a' 한 칸)                              — sacrifice
//     slots.machines  : [[x,y],...]  도박 기계 ('m' 한 칸씩, 2~3개)                        — gamble
//     slots.reward    : [x,y]        가시방 대표 보상 자리 (아이템)                         — spike
//     slots.rewards   : [[x,y]x3]    가시방 보상 자리, 우선순위 순: [아이템, 둘째 아이템(3명↑), 코인]. 앞의 둘에 'p'가 그려진다   — spike
//     slots.rewardSpots: [[x,y],...] 매복방 클리어 보상(인원수만큼 아이템)을 놓을 자리 ('p' 안 그림 — 클리어 뒤에 나옴)           — ambush
//     slots.pile      : [[x,y],...]  비밀방 코인·열쇠·하트 더미 자리                       — secret (받침대 1개 + 더미 자리)
//   필요한 받침대 수(ctx.players=np): treasure 2·np · shop 3+2·np · library np+2 · devil (아래 devilNeed) · secret 1.
//   ※ 문(ctx.doors[0])은 어느 쪽이든 괜찮다: 예약 구역을 비우고, 문에서 모든 자리까지 폭 2칸 이상 길이 이어지게 스스로 검사한다
//     (막으면 그 장식을 빼고, 그래도 안 되면 받침대를 줄이지 않는 선에서 가장 단순한 모양으로).
(function () {
  "use strict";
  const T = (typeof TileContent !== "undefined") ? TileContent : globalThis.TileContent;
  const BLOCK = new Set(["#", "P", "R", "C", "B", "V", "a", "m"]);   // 걸어 지나갈 수 없는 타일 (p 받침대와 S 가시는 걸을 수 있다)

  // ── 도구 ───────────────────────────────────────────────────────────────────────────────────────
  function env(ctx) {
    const W = ctx.w, H = ctx.h, pl = ctx.play || { x0: 1, y0: 1, w: W - 2, h: H - 2 };
    return { W, H, pl, cx: (W - 1) / 2, cy: (H - 1) / 2, x1: pl.x0, x2: pl.x0 + pl.w - 1, y1: pl.y0, y2: pl.y0 + pl.h - 1 };
  }
  function newGrid(ctx) { return ctx.grid().map(r => (typeof r === "string" ? r.split("") : r.slice())); }
  const inPlay = (e, x, y) => x >= e.x1 && x <= e.x2 && y >= e.y1 && y <= e.y2;
  function put(g, e, x, y, ch) { x = Math.round(x); y = Math.round(y); if (inPlay(e, x, y)) g[y][x] = ch; }
  function fillR(g, e, x, y, w, h, ch) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, e, x + i, y + j, ch); }
  const lat = (xs, ys) => { const o = []; for (const y of ys) for (const x of xs) o.push([x, y]); return o; };
  function sortCenter(list, e) { return list.slice().sort((a, b) => ((a[0] - e.cx) ** 2 + (a[1] - e.cy) ** 2) - ((b[0] - e.cx) ** 2 + (b[1] - e.cy) ** 2) || a[1] - b[1] || a[0] - b[0]); }
  const np = ctx => Math.max(1, ctx.players || 2);
  function devilNeed(n) { const pn = Math.max(1, Math.ceil((2 + n * 2) * 0.4)), wn = Math.max(1, Math.ceil((2 + n * 2) * 0.2)), an = 1 + Math.floor(n / 2); return pn + wn + an + 2; }

  // 문을 기준으로 한 좌표: dep = 문에서 안쪽으로 몇 번째 줄(0이 문 바로 안쪽), l = 문의 가로 위치에서 옆으로 몇 칸
  function frame(ctx, e) {
    const d = (ctx.doors && ctx.doors[0]) || { side: "S", x: Math.floor(e.W / 2), y: e.H - 1 };
    const side = d.side, vert = side === "N" || side === "S", D = vert ? e.pl.h : e.pl.w, l0 = vert ? d.x : d.y;
    const lmin = (vert ? e.x1 : e.y1) - l0, lmax = (vert ? e.x2 : e.y2) - l0;
    const at = (dep, l) => side === "N" ? [l0 + l, e.y1 + dep] : side === "S" ? [l0 + l, e.y2 - dep] : side === "W" ? [e.x1 + dep, l0 + l] : [e.x2 - dep, l0 + l];
    return { side, vert, D, lmin, lmax, cl: (lmin + lmax) / 2, at, door: d };
  }
  function inward(ctx, e) { // 문 바로 안쪽 타일
    const d = (ctx.doors && ctx.doors[0]); if (!d) return [Math.floor(e.W / 2), Math.floor(e.H / 2)];
    return d.side === "N" ? [d.x, d.y + 1] : d.side === "S" ? [d.x, d.y - 1] : d.side === "W" ? [d.x + 1, d.y] : [d.x - 1, d.y];
  }

  // 폭 2칸 이상으로 이어진 영역: 2×2 걷는 칸 덩어리를 한 칸씩 밀면서 문 안쪽에서 퍼뜨린다. 반환: 도달 표시 배열
  function wideReach(ctx, e, g) {
    const W = e.W, H = e.H, walk = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !BLOCK.has(g[y][x]);
    const okb = (x, y) => walk(x, y) && walk(x + 1, y) && walk(x, y + 1) && walk(x + 1, y + 1);
    const mark = Array.from({ length: H }, () => new Uint8Array(W)), seen = new Uint8Array(W * H), q = [];
    const [ix, iy] = inward(ctx, e);
    for (const [bx, by] of [[ix - 1, iy - 1], [ix, iy - 1], [ix - 1, iy], [ix, iy]]) if (bx >= 0 && by >= 0 && bx < W - 1 && by < H - 1 && okb(bx, by) && !seen[by * W + bx]) { seen[by * W + bx] = 1; q.push([bx, by]); }
    while (q.length) {
      const [bx, by] = q.pop(); mark[by][bx] = mark[by][bx + 1] = mark[by + 1][bx] = mark[by + 1][bx + 1] = 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = bx + dx, ny = by + dy; if (nx < 0 || ny < 0 || nx >= W - 1 || ny >= H - 1 || seen[ny * W + nx] || !okb(nx, ny)) continue; seen[ny * W + nx] = 1; q.push([nx, ny]); }
    }
    return mark;
  }
  const reachTile = (m, e, x, y) => x >= 0 && y >= 0 && x < e.W && y < e.H && m[y][x] === 1;
  const reachAdj = (m, e, x, y) => reachTile(m, e, x, y) || reachTile(m, e, x + 1, y) || reachTile(m, e, x - 1, y) || reachTile(m, e, x, y + 1) || reachTile(m, e, x, y - 1);
  const needReach = (m, e, g, [x, y]) => reachAdj(m, e, x, y); // 막는 타일(제단·기계)은 이웃이, 걷는 타일(받침대)은 자기 자신이나 이웃이 이어져 있으면 된다

  // 받침대(또는 그 밖의 필수 자리)를 지키면서 장식을 얹는다. 장식 조각마다 "필수 자리가 여전히 문에서 이어지는가"를 검사해서 아니면 되돌린다.
  //   spec.fixed  : [[x,y,ch]] 항상 놓는 것 (제단·기계·가시 띠·보상 받침대 …). 장식성 칸(V#PRCB)은 문 앞 예약 구역을 침범하지 않는다
  //   spec.need   : [[x,y]] 문에서 이어져야 하는 고정 자리
  //   spec.groups : [[ [x,y,ch], ... ], ...] 장식(선택). 칸마다 따로 빠지거나(18%) 한 칸 밀려서(27%) 좌우가 서로 다르게 놓인다. grp.jit=false면 그대로
  //   spec.quirk  : [최소, 최대] 개의 무작위 잔해 조각(기둥·바위·상자·벽 1~3칸)을 빈 곳에 던진다 — 방이 대칭이 되지 않게 하는 핵심 (기본 2~5, false면 끔)
  //   spec.clear  : [[x,y,r]] 이 칸 둘레 r칸에는 잔해를 놓지 않는다 (제단·기계 둘레)
  //   spec.cand   : 받침대 후보 [[x,y],...] (우선순위 순, 중앙부터), spec.n : 필요한 수. 후보 칸은 장식이 절대 덮지 않는다
  function compose(ctx, g, e, spec) {
    const rsv = (x, y) => (ctx.reserved ? ctx.reserved(x, y) : false);
    for (const [x, y, ch] of spec.fixed || []) { if (rsv(x, y) && "V#PRCB".includes(ch)) continue; put(g, e, x, y, ch); }
    const cand = spec.cand || [], n = spec.n || 0, need = spec.need || [], clear = spec.clear || [];
    const isCand = new Set(cand.map(c => c[0] + "," + c[1]));
    const freeC = () => cand.filter(([x, y]) => inPlay(e, x, y) && g[y][x] === "." && !rsv(x, y));
    const m0 = wideReach(ctx, e, g), r0 = freeC().filter(([x, y]) => reachAdj(m0, e, x, y));   // 처음부터 이어져 있던 후보는 끝까지 이어져 있어야 한다
    const good = () => {
      const m = wideReach(ctx, e, g);
      for (const t of need) if (!needReach(m, e, g, t)) return false;
      for (const [x, y] of r0) if (g[y][x] !== "." || !reachAdj(m, e, x, y)) return false;
      return true;
    };
    const base = Math.min(n, freeC().length), capBase = freeC().length;
    const near = (x, y) => clear.some(([cx, cy, r]) => Math.abs(cx - x) <= r && Math.abs(cy - y) <= r);
    const tryCells = cells => {
      const undo = [];
      for (const [x, y, ch] of cells) { if (!inPlay(e, x, y) || rsv(x, y) || g[y][x] !== "." || isCand.has(x + "," + y) || near(x, y)) continue; undo.push([x, y]); g[y][x] = ch; }
      if (!undo.length) return false;
      if (Math.min(n, freeC().length) < base || freeC().length < capBase || !good()) { for (const [x, y] of undo) g[y][x] = "."; return false; }
      return true;
    };
    for (const grp of spec.groups || []) {
      if (grp.keep !== undefined && !ctx.chance(grp.keep)) continue;
      let cells = grp;
      if (grp.jit !== false) { cells = []; for (const [x, y, ch] of grp) { const r = ctx.rng(); if (r < 0.18) continue; if (r < 0.45) { const ax = ctx.chance(0.5), d = ctx.chance(0.5) ? 1 : -1; cells.push([x + (ax ? d : 0), y + (ax ? 0 : d), ch]); } else cells.push([x, y, ch]); } }
      tryCells(cells);
    }
    if (spec.quirk !== false) { // 무작위 잔해 조각: 위치·모양·재질이 판마다 달라서 좌우/상하가 맞지 않는다
      const [qa, qb] = spec.quirk || [2, 5], chs = spec.qch || [["P", 3], ["R", 2], ["#", 1]], tot = chs.reduce((a, c) => a + c[1], 0), want = ctx.int(qa, qb);
      for (let tries = 0, placed = 0; tries < 40 && placed < want; tries++) {
        let r = ctx.rng() * tot, ch = chs[0][0]; for (const [c, w] of chs) { r -= w; if (r < 0) { ch = c; break; } }
        const x = ctx.int(e.x1, e.x2), y = ctx.int(e.y1, e.y2), t = ctx.rng(), cells = [[x, y, ch]];
        if (t > 0.55 && t < 0.8) cells.push(ctx.chance(0.5) ? [x + 1, y, ch] : [x, y + 1, ch]);   // 두 칸짜리
        else if (t >= 0.8) cells.push([x + 1, y, ch], [x, y + 1, ch]);                              // ㄱ자 세 칸
        if (tryCells(cells)) placed++;
      }
    }
    const m = wideReach(ctx, e, g), all = freeC().filter(([x, y]) => reachAdj(m, e, x, y)), peds = all.slice(0, n), spare = all.slice(n);
    for (const [x, y] of peds) g[y][x] = "p";
    return { peds, spare };
  }
  const finish = (g, slots, zones) => ({ rows: g, zones: zones || [], slots });
  const grp = (cells, keep) => { cells.keep = keep; return cells; };
  const P = (x, y) => [x, y, "P"];

  function reg(id, kind, shape, weight, build, extra) {
    T.registerArchetype(Object.assign({ id, kinds: [kind], shapes: [shape], floors: [1, 8], weight, tags: ["special", kind], stampSets: [], stampCount: [0, 0], build }, extra || {}));
  }

  // ═══ 보물방 (받침대 2·np: 아이템 np + 무기 np) ═══════════════════════════════════════════════
  const L12 = [2, 4, 6, 9, 11, 13];   // 가로 6칸 (중앙 대칭, 간격 ≥ 2)
  reg("treasure-hall", "treasure", "1x1", 1, ctx => {
    const e = env(ctx), g = newGrid(ctx);
    const r = compose(ctx, g, e, { n: 2 * np(ctx), cand: sortCenter(lat(L12, [3, 5]), e),
      groups: [grp([P(2, 2), P(13, 2)], 0.9), grp([P(2, 6), P(13, 6)], 0.9)] });
    return finish(g, { pedestals: r.peds, spare: r.spare });
  });
  reg("treasure-colonnade", "treasure", "1x1", 1, ctx => {
    const e = env(ctx), g = newGrid(ctx);
    const r = compose(ctx, g, e, { n: 2 * np(ctx), cand: sortCenter(lat([3, 6, 9, 12], [2, 4, 6]), e),
      groups: [grp([P(1, 1), P(14, 1), P(1, 7), P(14, 7)], 0.9), grp([P(7, 4), P(8, 4)], 0.7), grp([P(1, 4), P(14, 4)], 0.5)] });
    return finish(g, { pedestals: r.peds, spare: r.spare });
  });
  reg("treasure-alcoves", "treasure", "1x1", 0.9, ctx => { // 위·아래 벽에 파인 감실마다 받침대
    const e = env(ctx), g = newGrid(ctx), fixed = [], cand = [];
    let closeLeft = ctx.int(1, 3);   // 감실 몇 개는 막혀 있다 (위·아래가 서로 달라진다)
    for (const y of [1, 7]) for (let x = 1; x <= 14; x++) { if (L12.includes(x)) { if (closeLeft > 0 && ctx.chance(0.15)) { closeLeft--; fixed.push([x, y, "#"]); } else cand.push([x, y]); } else fixed.push([x, y, "#"]); }
    // 문 앞(예약)이 막히지 않도록: 예약 칸은 fixed에서 빼기 위해 put 대신 아래에서 정리
    const rsv = (x, y) => ctx.reserved(x, y);
    const fx = fixed.filter(([x, y]) => !rsv(x, y));
    const r = compose(ctx, g, e, { n: 2 * np(ctx), cand: sortCenter(cand, e).concat([[4, 4], [11, 4], [6, 4], [9, 4]]), fixed: fx, quirk: [3, 6], groups: [grp([P(7, 4), P(8, 4)], 0.5)] });
    return finish(g, { pedestals: r.peds, spare: r.spare });
  });
  reg("treasure-gallery", "treasure", "2x1", 0.35, ctx => { // 칸 두 개를 이은 긴 방
    const e = env(ctx), g = newGrid(ctx);
    const r = compose(ctx, g, e, { n: 2 * np(ctx), cand: sortCenter(lat([4, 7, 10, 13, 18, 21, 24, 27], [3, 5]), e),
      groups: [grp([P(15, 1), P(16, 1), P(15, 7), P(16, 7)], 0.9), grp([P(2, 2), P(29, 2), P(2, 6), P(29, 6)], 0.8)] });
    return finish(g, { pedestals: r.peds, spare: r.spare });
  });

  // ═══ 상점 (받침대 3+2·np, 초과분은 spare) ═══════════════════════════════════════════════════
  reg("shop-stalls", "shop", "1x1", 1, ctx => {
    const e = env(ctx), g = newGrid(ctx);
    const r = compose(ctx, g, e, { n: 3 + 2 * np(ctx), cand: sortCenter(lat(L12, [2, 4, 6]), e),
      groups: [grp([P(1, 3), P(1, 5), P(14, 3), P(14, 5)], 0.9), grp([P(7, 4), P(8, 4)], 0.3)] });
    return finish(g, { pedestals: r.peds, spare: r.spare });
  });
  reg("shop-bazaar", "shop", "1x1", 1, ctx => { // 엇갈려 놓인 좌판
    const e = env(ctx), g = newGrid(ctx);
    const cand = sortCenter([...lat([3, 6, 9, 12], [2, 6]), ...lat([2, 5, 10, 13], [4]), [1, 2], [14, 2], [1, 6], [14, 6]], e);
    const r = compose(ctx, g, e, { n: 3 + 2 * np(ctx), cand, groups: [grp([[7, 4, "#"], [8, 4, "#"]], 0.8), grp([P(1, 1), P(14, 1), P(1, 7), P(14, 7)], 0.8)] });
    return finish(g, { pedestals: r.peds, spare: r.spare });
  });
  reg("shop-arcade", "shop", "1x1", 0.9, ctx => { // 양옆 벽의 감실 + 가운데 줄
    const e = env(ctx), g = newGrid(ctx), fixed = [], cand = [];
    for (const x of [1, 14]) for (let y = 1; y <= 7; y++) { if (y === 2 || y === 4 || y === 6) cand.push([x, y]); else if (!ctx.reserved(x, y)) fixed.push([x, y, "#"]); }
    cand.push(...lat([4, 6, 9, 11], [3, 5]));
    const r = compose(ctx, g, e, { n: 3 + 2 * np(ctx), cand: sortCenter(cand, e), fixed, groups: [grp([P(7, 4), P(8, 4)], 0.5)] });
    return finish(g, { pedestals: r.peds, spare: r.spare });
  });
  reg("shop-market", "shop", "2x1", 0.35, ctx => {
    const e = env(ctx), g = newGrid(ctx);
    const r = compose(ctx, g, e, { n: 3 + 2 * np(ctx), cand: sortCenter(lat([3, 6, 9, 12, 19, 22, 25, 28], [2, 4, 6]), e),
      groups: [grp([P(15, 1), P(16, 1), P(15, 7), P(16, 7)], 0.9), grp([P(1, 4), P(30, 4)], 0.6)] });
    return finish(g, { pedestals: r.peds, spare: r.spare });
  });

  // ═══ 서재 (받침대 np+2, 책장은 '#') ════════════════════════════════════════════════════════
  reg("library-shelves", "library", "1x1", 1, ctx => {
    const e = env(ctx), g = newGrid(ctx);
    const shelf = (x0, x1, y0, y1) => { const c = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) c.push([x, y, "#"]); return c; };
    const r = compose(ctx, g, e, { n: np(ctx) + 2, cand: sortCenter(lat(L12, [4, 6]), e),
      groups: [grp(shelf(2, 6, 1, 2), 0.95), grp(shelf(9, 13, 1, 2), 0.95), grp([P(1, 7), P(14, 7)], 0.8)] });
    return finish(g, { pedestals: r.peds, spare: r.spare });
  });
  reg("library-stacks", "library", "1x1", 1, ctx => {
    const e = env(ctx), g = newGrid(ctx);
    const shelf = (x0, x1, y) => { const c = []; for (let x = x0; x <= x1; x++) c.push([x, y, "#"]); return c; };
    const r = compose(ctx, g, e, { n: np(ctx) + 2, cand: sortCenter(lat(L12, [3, 5]), e),
      groups: [grp(shelf(2, 5, 2), 0.95), grp(shelf(10, 13, 2), 0.95), grp(shelf(2, 5, 6), 0.95), grp(shelf(10, 13, 6), 0.95)] });
    return finish(g, { pedestals: r.peds, spare: r.spare });
  });
  reg("library-reading", "library", "1x1", 0.9, ctx => { // 가운데 큰 책상 둘레에 받침대
    const e = env(ctx), g = newGrid(ctx);
    const cand = sortCenter([...lat([3, 6, 9, 12], [2, 6]), [4, 4], [11, 4], [1, 4], [14, 4]], e);
    const r = compose(ctx, g, e, { n: np(ctx) + 2, cand, groups: [grp([[6, 4, "#"], [7, 4, "#"], [8, 4, "#"], [9, 4, "#"]], 0.9), grp([P(1, 1), P(14, 1), P(1, 7), P(14, 7)], 0.8)] });
    return finish(g, { pedestals: r.peds, spare: r.spare });
  });
  reg("library-grand", "library", "2x1", 0.35, ctx => {
    const e = env(ctx), g = newGrid(ctx);
    const shelf = (x0, x1, y0, y1) => { const c = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) c.push([x, y, "#"]); return c; };
    const r = compose(ctx, g, e, { n: np(ctx) + 2, cand: sortCenter(lat([4, 7, 10, 13, 18, 21, 24, 27], [4, 6]), e),
      groups: [grp(shelf(2, 12, 1, 2), 0.95), grp(shelf(19, 29, 1, 2), 0.95), grp([P(15, 1), P(16, 1)], 0.6)] });
    return finish(g, { pedestals: r.peds, spare: r.spare });
  });

  // ═══ 악마 상점 (받침대 devilNeed(np) ≤ 11, 후보 14개 이상) ═════════════════════════════════
  reg("devil-hall", "devil", "1x1", 1, ctx => {
    const e = env(ctx), g = newGrid(ctx);
    const r = compose(ctx, g, e, { n: devilNeed(np(ctx)), cand: sortCenter(lat(L12, [3, 5, 7]), e).concat(lat([2, 13], [1])),
      groups: [grp([P(3, 2), P(12, 2), P(3, 6), P(12, 6)], 0.95), grp([P(1, 4), P(14, 4)], 0.5)] });
    return finish(g, { pedestals: r.peds, spare: r.spare });
  });
  reg("devil-ring", "devil", "1x1", 1, ctx => { // 중앙 제단 둘레를 도는 받침대
    const e = env(ctx), g = newGrid(ctx);
    const ring = [[6, 2], [9, 2], [4, 3], [11, 3], [2, 4], [13, 4], [4, 5], [11, 5], [6, 6], [9, 6], [2, 2], [13, 2], [2, 6], [13, 6]];
    const r = compose(ctx, g, e, { n: devilNeed(np(ctx)), cand: sortCenter(ring, e), groups: [grp([P(7, 4), P(8, 4)], 0.9), grp([P(1, 1), P(14, 1), P(1, 7), P(14, 7)], 0.8)] });
    return finish(g, { pedestals: r.peds, spare: r.spare });
  });
  reg("devil-pews", "devil", "1x1", 0.9, ctx => {
    const e = env(ctx), g = newGrid(ctx);
    const r = compose(ctx, g, e, { n: devilNeed(np(ctx)), cand: sortCenter(lat([3, 6, 9, 12], [2, 4, 6]), e).concat(lat([1, 14], [2, 6])),
      groups: [grp([P(1, 4), P(14, 4)], 0.7), grp([P(5, 1), P(10, 1), P(5, 7), P(10, 7)], 0.7)] });
    return finish(g, { pedestals: r.peds, spare: r.spare });
  });

  // ═══ 희생방 (제단 'a' 한 칸. 둘레에 보상이 흩어질 빈 자리를 둔다) ═══════════════════════════
  reg("sacrifice-classic", "sacrifice", "1x1", 1, ctx => {
    const e = env(ctx), g = newGrid(ctx), alt = [7, 4];
    compose(ctx, g, e, { fixed: [[7, 4, "a"]], need: [alt], clear: [[7, 4, 2]], groups: [grp([P(3, 2), P(12, 2), P(3, 6), P(12, 6)], 0.95), grp([P(1, 4), P(14, 4)], 0.5)] });
    return finish(g, { altar: alt, pedestals: [], spare: [] });
  });
  reg("sacrifice-moat", "sacrifice", "1x1", 1, ctx => { // 제단 둘레의 구덩이 해자 + 폭 2칸 다리 네 곳
    const e = env(ctx), g = newGrid(ctx), alt = [7, 4], v = [];
    for (let x = 5; x <= 9; x++) for (let y = 2; y <= 6; y++) if (x === 5 || x === 9 || y === 2 || y === 6) v.push([x, y, "V"]);
    const gap = new Set(["6,2", "7,2", "6,6", "7,6", "5,3", "5,4", "9,3", "9,4"]);
    compose(ctx, g, e, { fixed: [[7, 4, "a"], ...v.filter(([x, y]) => !gap.has(x + "," + y))], need: [alt], clear: [[7, 4, 3]], groups: [grp([P(2, 2), P(13, 2), P(2, 6), P(13, 6)], 0.8)] });
    return finish(g, { altar: alt, pedestals: [], spare: [] });
  });
  reg("sacrifice-chapel", "sacrifice", "1x1", 1, ctx => { // 문에서 먼 쪽 끝에 제단, 통로 양옆에 기둥
    const e = env(ctx), g = newGrid(ctx), f = frame(ctx, e), l = Math.round(f.cl), altD = f.D - 3, alt = f.at(altD, l);
    const pil = [], fixed = [[alt[0], alt[1], "a"]];
    for (const dep of f.vert ? [2, 4] : [3, 6, 9]) for (const s of [-3, 4]) { const [x, y] = f.at(dep, l + s); pil.push(P(x, y)); }
    const side = [];
    for (const s of [-2, 3]) { const [x, y] = f.at(altD, l + s); side.push(P(x, y)); } // 제단 양옆 한 칸 띄운 기둥
    compose(ctx, g, e, { fixed, need: [alt], clear: [[alt[0], alt[1], 2]], groups: [grp(pil.slice(0, pil.length / 2), 0.9), grp(pil.slice(pil.length / 2), 0.9), grp(side, 0.6)] });
    return finish(g, { altar: alt, pedestals: [], spare: [] });
  });

  // ═══ 도박방 (기계 'm' 2~3개, 서 있을 자리가 기계 앞에 있다) ══════════════════════════════════
  function machines(ctx, g, e, cands, k, groups) {
    const rsv = (x, y) => ctx.reserved(x, y), ms = [];
    for (const [x, y] of cands) { if (ms.length >= k) break; if (!inPlay(e, x, y) || rsv(x, y) || ms.some(m => Math.abs(m[0] - x) < 3 && Math.abs(m[1] - y) < 2)) continue; ms.push([x, y]); }
    compose(ctx, g, e, { fixed: ms.map(([x, y]) => [x, y, "m"]), need: ms, clear: ms.map(([x, y]) => [x, y, 1]), qch: [["P", 3], ["C", 3], ["R", 1], ["#", 1]], groups });
    return ms;
  }
  reg("gamble-pair", "gamble", "1x1", 1, ctx => {
    const e = env(ctx), g = newGrid(ctx);
    const ms = machines(ctx, g, e, [[5, 2], [10, 2], [5, 6], [10, 6], [4, 4], [11, 4]], 2, [grp([[3, 5, "C"], [3, 6, "C"], [12, 5, "C"], [12, 6, "C"]], 0.85), grp([P(1, 1), P(14, 1)], 0.5)]);
    return finish(g, { machines: ms, pedestals: [], spare: [] });
  });
  reg("gamble-row", "gamble", "1x1", 0.9, ctx => { // 세 대가 나란히
    const e = env(ctx), g = newGrid(ctx);
    const ms = machines(ctx, g, e, [[4, 2], [11, 2], [7, 2], [8, 6], [4, 6], [11, 6], [7, 6], [4, 4], [11, 4]], 3, [grp([P(2, 4), P(13, 4)], 0.5), grp([P(1, 1), P(14, 1), P(1, 7), P(14, 7)], 0.7)]);
    return finish(g, { machines: ms, pedestals: [], spare: [] });
  });
  reg("gamble-lounge", "gamble", "1x1", 0.9, ctx => { // 마주 보는 두 대 + 벤치
    const e = env(ctx), g = newGrid(ctx);
    const ms = machines(ctx, g, e, [[4, 3], [11, 3], [4, 5], [11, 5], [5, 2], [10, 2]], 2, [grp([[6, 6, "#"], [9, 6, "#"]], 0.9), grp([[7, 2, "C"], [8, 2, "C"]], 0.6), grp([P(1, 1), P(14, 7)], 0.5)]);
    return finish(g, { machines: ms, pedestals: [], spare: [] });
  });

  // ═══ 매복방 (문이 잠기고 3웨이브. 클리어 뒤 보상 자리 np개) ═══════════════════════════════════
  function ambush(ctx, groups, zones) {
    const e = env(ctx), g = newGrid(ctx), cand = sortCenter(lat([7, 8, 6, 9, 5, 10, 4, 11, 3, 12], [4]).concat(lat([7, 8], [3, 5])), e);
    const r = compose(ctx, g, e, { n: np(ctx), cand, groups });
    for (const [x, y] of r.peds) g[y][x] = "."; // 보상은 클리어 뒤에 나온다 → 'p'는 그리지 않는다
    return finish(g, { rewardSpots: r.peds, pedestals: [], spare: [] }, zones);
  }
  reg("ambush-pillars", "ambush", "1x1", 1, ctx => ambush(ctx, [grp([P(4, 2), P(11, 2), P(4, 6), P(11, 6)], 0.95), grp([P(7, 1), P(8, 7)], 0.4)], [{ x: 3, y: 2, w: 10, h: 5, weight: 3 }, { x: 1, y: 1, w: 14, h: 7, weight: 1 }]));
  reg("ambush-cross", "ambush", "1x1", 1, ctx => ambush(ctx, [grp([[3, 4, "C"], [12, 4, "C"], [7, 2, "C"], [8, 6, "C"]], 0.9), grp([P(5, 2), P(10, 2), P(5, 6), P(10, 6)], 0.9)], [{ x: 2, y: 2, w: 12, h: 5, weight: 2 }, { x: 6, y: 1, w: 4, h: 7, weight: 2 }]));
  reg("ambush-ring", "ambush", "1x1", 0.9, ctx => ambush(ctx, [grp([P(5, 2), P(10, 2), P(5, 6), P(10, 6)], 0.95), grp([P(3, 4), P(12, 4)], 0.8), grp([[7, 2, "R"], [8, 2, "R"], [7, 6, "R"], [8, 6, "R"]], 0.6)], [{ x: 1, y: 1, w: 14, h: 7, weight: 1 }, { x: 5, y: 3, w: 6, h: 3, weight: 3 }]));

  // ═══ 가시방 (문 → 가시 띠 → 보상. 띠는 칸을 가득 채워 옆으로 돌아갈 수 없고, 가시는 주기로 솟는다) ═══════
  // 문(dep 0) → 여백 2줄 → 가시 띠(bd줄) → 보상. 가시는 칸을 가득 채워 옆으로 돌아갈 수 없다 (밟지 않고 가는 길이 없다).
  // 세로 방(문이 N/S)은 깊이가 7뿐이라 띠가 3줄, 가로 방(문이 E/W)은 깊이 14라 띠가 6줄(snake는 8줄)이다.
  function spikeBuild(ctx, kind) {
    const e = env(ctx), g = newGrid(ctx), f = frame(ctx, e), l0 = Math.round(f.cl), d0 = 2, lo = f.lmin, hi = f.lmax;
    const bd = f.vert ? 3 : (kind === "snake" ? 8 : 6), rd = Math.min(f.D - 2, d0 + bd + (f.vert ? 1 : 3));
    const fixed = [], band = new Set(), posts = [];
    for (let dep = d0; dep < d0 + bd; dep++) for (let l = lo; l <= hi; l++) band.add(dep + "," + l);
    const carve = (dep, l) => band.delete(dep + "," + l), wall = (dep, l, ch) => { carve(dep, l); fixed.push([...f.at(dep, l), ch]); };
    if (kind === "islands") { // 쉬어 가는 섬(2×1): 위아래 줄에 이어지지 않게 한 줄 건너 놓는다
      for (let dep = d0 + 1; dep < d0 + bd; dep += 2) { const k = ctx.int(1, 2); for (let i = 0; i < k; i++) { const l = ctx.int(lo + 2, hi - 3); carve(dep, l); carve(dep, l + 1); } }
    } else if (kind === "checker") { const ph = ctx.int(0, 1); // 2×2 덩어리 체크무늬: 비스듬히 이어진 빈 덩어리에서 쉬어 가며 건넌다
      for (let dep = d0; dep < d0 + bd; dep++) for (let l = lo; l <= hi; l++) if ((Math.floor((dep - d0) / 2) + Math.floor((l - lo + ph) / 2)) % 2 === 1) carve(dep, l);
    } else if (kind === "snake") {
      if (f.vert) { // 깊이가 얕아서 구불구불 길 대신 기둥 숲: 가시 띠 한가운데에 기둥을 박아 돌아가게 한다
        for (let l = lo + ctx.int(1, 3); l <= hi - 2; l += ctx.int(3, 5)) { wall(d0 + 1, l, "P"); if (ctx.chance(0.7)) wall(d0 + 1, l + 1, "P"); }   // 간격·굵기가 제각각인 기둥 숲
      } else { // 3줄 주기(가시2·벽1)의 엇갈리는 벽: 구멍(폭 2칸)이 번갈아 양 끝에 — 길이 2칸 폭으로 구불구불 이어진다
        let left = ctx.chance(0.5);
        for (let dep = d0 + 2; dep < d0 + bd - 1; dep += 3) {
          for (let l = lo; l <= hi; l++) { const gap = left ? l <= lo + 1 : l >= hi - 1; if (!gap) wall(dep, l, "#"); }
          left = !left;
        }
      }
    }
    for (const k of band) { const [dep, l] = k.split(",").map(Number); fixed.push([...f.at(dep, l), "S"]); }
    const rw = [f.at(rd, l0), f.at(rd, l0 - 2), f.at(rd, l0 + 2)];
    fixed.push([rw[0][0], rw[0][1], "p"], [rw[1][0], rw[1][1], "p"]);
    const pil = [[...f.at(rd, l0 - 5), "P"], [...f.at(rd, l0 + 5), "P"]];
    compose(ctx, g, e, { fixed, need: rw, clear: rw.map(([x, y]) => [x, y, 1]), groups: [grp(pil, 0.85), grp([[...f.at(rd + 1, l0 - 3), "P"], [...f.at(rd + 1, l0 + 3), "P"]], 0.5)] });
    return finish(g, { reward: rw[0], rewards: rw, pedestals: rw.slice(0, 2), spare: [] });
  }
  reg("spike-field", "spike", "1x1", 1, ctx => spikeBuild(ctx, "field"));
  reg("spike-islands", "spike", "1x1", 1, ctx => spikeBuild(ctx, "islands"));
  reg("spike-snake", "spike", "1x1", 0.9, ctx => spikeBuild(ctx, "snake"));
  reg("spike-checker", "spike", "1x1", 0.9, ctx => spikeBuild(ctx, "checker"));

  // ═══ 비밀방 (작고 아늑한 막다른 방: 받침대 1개 + 더미 자리) ═══════════════════════════════════
  function secretBuild(ctx, shape) {
    const e = env(ctx), g = newGrid(ctx), f = frame(ctx, e), l0 = Math.floor(f.cl);
    for (let y = e.y1; y <= e.y2; y++) for (let x = e.x1; x <= e.x2; x++) g[y][x] = "#";
    const open = (dep, l) => { const [x, y] = f.at(dep, l); if (inPlay(e, x, y)) g[y][x] = "."; return [x, y]; };
    const te = f.vert ? 2 : 4;                                   // 통로 끝(문에서 안쪽으로)
    for (let dep = 0; dep < te; dep++) { open(dep, l0); open(dep, l0 + 1); }   // 폭 2칸 통로
    const dc = te, side = () => (ctx.chance(0.5) ? -1 : 1);
    let ped;
    if (shape === "closet") { // 한쪽으로 치우친 직사각 방 + 가끔 곁방
      let lw = ctx.int(1, 3), rw = ctx.int(2, 4); if (rw === lw + 1 && ctx.chance(0.85)) rw = lw === 3 ? 2 : rw + 1; const dd = ctx.int(2, 3);
      for (let dep = dc; dep < dc + dd; dep++) for (let l = l0 - lw; l <= l0 + rw; l++) open(dep, l);
      if (true) { const sd = side(), l = sd < 0 ? l0 - lw - 1 : l0 + rw + 1; open(dc, l); open(dc + 1, l); }   // 곁방
      ped = f.at(dc + (dd > 2 ? 1 : 0), l0 + ctx.int(0, 1));
    } else if (shape === "keyhole") { // 열쇠 구멍: 줄마다 폭이 다르고 왼쪽·오른쪽이 따로 들쭉날쭉
      const rows = [[0, 1], [-1, 2], [-2, 3], [-1, 2]];
      rows.forEach(([a, b], i) => { const ja = i > 0 ? ctx.int(-1, 1) : 0, jb = i > 0 ? ctx.int(-1, 1) : 0; for (let l = l0 + Math.min(a, 0) + Math.min(0, ja) ; l <= l0 + Math.max(b, 1) + Math.max(0, jb); l++) open(dc + i, l); });
      for (let l = l0 - 2; l <= l0 + 2 + ctx.int(0, 1); l++) open(dc + 2, l);
      ped = f.at(dc + 2, l0 + ctx.int(0, 1));
    } else { // cross: 가운데 2×2에서 뻗는 팔의 길이가 제각각
      const up = ctx.int(1, 3), lf = ctx.int(1, 3), rt = ctx.int(1, 3), cd = dc + ctx.int(1, 2);
      for (let dep = dc; dep <= cd + 1 + up; dep++) { open(dep, l0); open(dep, l0 + 1); }
      for (let l = l0 - lf; l <= l0 + 1 + rt; l++) { open(cd, l); open(cd + 1, l); }
      ped = f.at(cd, l0);
    }
    for (let k = ctx.int(2, 3), tries = 0; k > 0 && tries < 40; tries++) { // 삐뚤빼뚤한 감실: 열린 칸 옆의 벽 한 칸을 더 판다 (너무 커지지 않게 총 열린 칸 수 제한)
      const x = ctx.int(e.x1, e.x2), y = ctx.int(e.y1, e.y2); if (g[y][x] !== "." || ctx.reserved(x, y)) continue;
      const [dx, dy] = ctx.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]), nx = x + dx, ny = y + dy; if (!inPlay(e, nx, ny) || g[ny][nx] !== "#") continue;
      let o = 0; for (let yy = e.y1; yy <= e.y2; yy++) for (let xx = e.x1; xx <= e.x2; xx++) if (g[yy][xx] !== "#") o++;
      if (o >= 38) break; g[ny][nx] = "."; k--;
    }
    g[ped[1]][ped[0]] = "p";
    for (let y = e.y1; y <= e.y2; y++) for (let x = e.x1; x <= e.x2; x++) if (ctx.reserved(x, y) && g[y][x] === "#") g[y][x] = "."; // 문 앞 예약 구역은 어떤 맞춤이든 비워 둔다 // 문 앞 예약 구역은 어떤 맞춤이든 비워 둔다
    // 더미 자리: 열린 칸 중 받침대에서 2칸 이상, 서로 2칸 이상 떨어진 곳 (최대 4개)
    const cands = []; for (let y = e.y1; y <= e.y2; y++) for (let x = e.x1; x <= e.x2; x++) if (g[y][x] === "." && !ctx.reserved(x, y) && Math.max(Math.abs(x - ped[0]), Math.abs(y - ped[1])) >= 2) cands.push([x, y]);
    for (let i = cands.length - 1; i > 0; i--) { const j = ctx.int(0, i); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    const pile = []; for (const c of cands) { if (pile.length >= 4) break; if (pile.every(q => Math.max(Math.abs(q[0] - c[0]), Math.abs(q[1] - c[1])) >= 2)) pile.push(c); }
    for (const c of cands) { if (pile.length >= 2) break; if (!pile.includes(c)) pile.push(c); }   // 좁은 방이면 간격 조건을 풀어 최소 2자리
    return finish(g, { pedestals: [ped], pile, spare: [] });
  }
  reg("secret-closet", "secret", "1x1", 1, ctx => secretBuild(ctx, "closet"));
  reg("secret-keyhole", "secret", "1x1", 1, ctx => secretBuild(ctx, "keyhole"));
  reg("secret-cross", "secret", "1x1", 1, ctx => secretBuild(ctx, "cross"));
})();
