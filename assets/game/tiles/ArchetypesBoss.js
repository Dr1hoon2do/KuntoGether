// 보스방 A(큰 구성) — 타일맵 규약은 SPEC.md. 순수 JS (DOM·게임 객체 참조 없음, 난수는 ctx.rng 계열만).
// 1칸(16×9) 보스방 7종 + 큰 보스방(2×1 / 1×2 / 2×2) 9종 + 모든 모양에 쓰이는 "흩어진 폐허" 1종.
// 보스방 공통 원칙
//  · 지나다니는 길은 폭 3칸 이상 (플레이어는 1칸 미만이지만 덩치 큰 보스·탄막을 피할 공간). 장애물은 벽에 붙이거나 3칸 간격을 둔다.
//  · 칸 안쪽 위 가운데(보스 등장 자리)와 문 앞은 비워 둔다.
//  · 각 방은 만든 뒤에 스스로 흐름 검사(폭 3 이상 통로로 문·연결·보스 자리가 이어지는지)를 하고, 실패하면 장식을 줄여서 다시 만든다.
// 태그: "ram" = 돌진형 보스가 들이받을 긴 벽이 있음, "cover" = 엄폐물 위주, "pit" = 구덩이(탄은 통과), "destructible" = 부술 수 있는 지형.
(function () {
  const TC = globalThis.TileContent;
  if (!TC) throw new Error("Registry.js를 먼저 불러와야 한다");
  const CW = 16, CH = 9;

  // ---------- 격자 도구 (ctx 도우미에 기대지 않고 직접 쓴다) ----------
  const inside = (g, x, y) => y >= 1 && y < g.length - 1 && x >= 1 && x < g[0].length - 1;
  const put = (g, x, y, ch) => { if (inside(g, x, y)) g[y][x] = ch; };
  const box = (g, x, y, w, h, ch) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, ch); };
  const free = (g, x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { if (!inside(g, x + i, y + j) || g[y + j][x + i] !== ".") return false; } return true; };
  // 좌우/상하 대칭 복사 (장애물만 합침)
  const sym = (g, H, V) => {
    const h = g.length, w = g[0].length, src = g.map(r => r.slice());
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const ch = src[y][x]; if (ch === ".") continue;
      if (H) put(g, w - 1 - x, y, ch);
      if (V) put(g, x, h - 1 - y, ch);
      if (H && V) put(g, w - 1 - x, h - 1 - y, ch);
    }
  };
  const mk = ctx => ctx.grid().map(r => (typeof r === "string" ? r.split("") : r));

  // ---------- 보스 칸 / 문 / 연결 ----------
  // 보스가 나오는 칸 = 문에서 가장 먼 칸. 등장 자리는 그 칸의 위쪽 가운데.
  function bossCell(ctx) {
    const cells = ctx.cells && ctx.cells.length ? ctx.cells : [{ cx: 0, cy: 0 }], doors = ctx.doors || [];
    if (cells.length === 1 || !doors.length) return cells[0];
    let best = cells[0], bd = -1;
    for (const c of cells) {
      const x = c.cx * CW + CW / 2, y = c.cy * CH + CH / 2; let d = 1e9;
      for (const q of doors) d = Math.min(d, Math.hypot(q.x - x, q.y - y));
      if (d > bd) { bd = d; best = c; }
    }
    return best;
  }
  const padRect = ctx => { const c = bossCell(ctx); return { x0: c.cx * CW + 5, y0: c.cy * CH + 1, x1: c.cx * CW + 10, y1: c.cy * CH + 3 }; };
  function carve(g, x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, "."); }
  // 비워 둬야 하는 곳을 마지막에 확실히 비운다 (문 앞 길, 칸 사이 통로, 예약 영역, 보스 등장 자리)
  function carveKeep(ctx, g) {
    const w = g[0].length, h = g.length;
    for (const d of ctx.doors || []) {
      if (d.side === "N") carve(g, d.x - 1, 1, d.x + 1, 3);
      else if (d.side === "S") carve(g, d.x - 1, h - 4, d.x + 1, h - 2);
      else if (d.side === "W") carve(g, 1, d.y - 1, 3, d.y + 1);
      else if (d.side === "E") carve(g, w - 4, d.y - 1, w - 2, d.y + 1);
    }
    for (const l of ctx.links || []) { if (l.axis === "h") carve(g, l.x - 3, l.y - 1, l.x + 3, l.y + 1); else carve(g, l.x - 1, l.y - 3, l.x + 1, l.y + 3); }
    if (ctx.reserved) for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (ctx.reserved(x, y)) g[y][x] = ".";
    const p = padRect(ctx); carve(g, p.x0, p.y0, p.x1, p.y1);
  }

  // ---------- 스스로 하는 흐름 검사 ----------
  // "넓은 길" = 가로세로 3×3이 모두 걸을 수 있는 칸을 포함하는 타일. 문 안쪽·칸 연결·보스 자리가 모두 한 덩어리의 넓은 길로 이어져야 한다.
  const walkable = ch => ch === "." || ch === "S";
  function analyze(ctx, g) {
    const w = g[0].length, h = g.length, area = (w - 2) * (h - 2);
    const W = (x, y) => x >= 1 && y >= 1 && x < w - 1 && y < h - 1 && walkable(g[y][x]);
    let open = 0; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (W(x, y)) open++;
    // wide[k] = 이 타일을 가운데로 하는 3×3이 모두 걸을 수 있다 (= 폭 3 이상으로 지나다닐 수 있는 중심선)
    const wide = new Uint8Array(w * h);
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      let all = true; for (let j = -1; j <= 1 && all; j++) for (let i = -1; i <= 1; i++) if (!W(x + i, y + j)) { all = false; break; }
      if (all) wide[y * w + x] = 1;
    }
    const comp = new Int32Array(w * h).fill(-1); let nc = 0; const sizes = [];
    for (let s = 0; s < w * h; s++) {
      if (!wide[s] || comp[s] >= 0) continue; const st = [s]; comp[s] = nc; let n = 0;
      while (st.length) { const c = st.pop(); n++; const cx = c % w, cy = (c / w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const k = ny * w + nx; if (wide[k] && comp[k] < 0) { comp[k] = nc; st.push(k); } } }
      sizes.push(n); nc++;
    }
    const near = (x, y) => { for (let r = 0; r <= 1; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const k = (y + j) * w + x + i; if (x + i >= 1 && y + j >= 1 && x + i < w - 1 && y + j < h - 1 && wide[k]) return comp[k]; } return -1; };
    const anchors = [];
    for (const d of ctx.doors || []) anchors.push(d.side === "N" ? [d.x, 2] : d.side === "S" ? [d.x, h - 3] : d.side === "W" ? [2, d.y] : [w - 3, d.y]);
    for (const l of ctx.links || []) anchors.push([l.x, l.y]);
    const p = padRect(ctx); anchors.push([(p.x0 + p.x1) >> 1, p.y0 + 1]);
    let main = -1, ok = true;
    for (const [ax, ay] of anchors) { const c = near(ax, ay); if (c < 0) { ok = false; break; } if (main < 0) main = c; else if (c !== main) { ok = false; break; } }
    const wideTotal = sizes.reduce((a, b) => a + b, 0);
    if (ok && wideTotal && sizes[main] / wideTotal < 0.9) ok = false; // 따로 떨어진 넓은 구역이 있으면 안 됨
    if (open / area < 0.5) ok = false;
    return { ok, openRatio: open / area };
  }

  // ---------- 적 등장 구역 (졸개·호위 소환용): 열린 4×3 칸 몇 곳을 골라 흩어 놓는다 ----------
  function makeZones(ctx, g, n = 5) {
    const w = g[0].length, h = g.length, p = padRect(ctx), cand = [];
    for (let y = 1; y + 3 <= h - 1; y += 2) for (let x = 1; x + 4 <= w - 1; x += 2) {
      if (!free(g, x, y, 4, 3)) continue;
      if (x <= p.x1 + 1 && x + 3 >= p.x0 - 1 && y <= p.y1 + 1 && y + 2 >= p.y0 - 1) continue; // 보스 등장 자리 위는 제외
      cand.push({ x, y, w: 4, h: 3, weight: 1 });
    }
    for (let i = cand.length - 1; i > 0; i--) { const j = ctx.int(0, i); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    const out = [];
    for (const c of cand) { if (out.length >= n) break; if (out.every(o => Math.abs(o.x - c.x) >= 5 || Math.abs(o.y - c.y) >= 4)) out.push(c); }
    if (!out.length) out.push({ x: 1, y: 1, w: g[0].length - 2, h: g.length - 2, weight: 1 });
    return out;
  }

  // 길(예약 영역)을 뚫다가 남은 낱개 구덩이 조각(이웃 구덩이가 1개 이하)은 치운다.
  function tidy(g) {
    const w = g[0].length, h = g.length;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (g[y][x] !== "V") continue; let n = 0;
      if (g[y - 1][x] === "V") n++; if (g[y + 1][x] === "V") n++; if (g[y][x - 1] === "V") n++; if (g[y][x + 1] === "V") n++;
      if (n < 2) g[y][x] = ".";
    }
  }
  // 변형을 여러 번 시도해 흐름 검사를 통과하는 첫 결과를 쓴다. 마지막 시도(lvl = 99)는 가장 단순한 기본형.
  function make(ctx, draw) {
    let g = null;
    for (let lvl = 0; lvl <= 6; lvl++) {
      g = mk(ctx); draw(g, ctx, lvl === 6 ? 99 : lvl); carveKeep(ctx, g); tidy(g);
      if (analyze(ctx, g).ok) break;
    }
    return { rows: g, zones: makeZones(ctx, g) };
  }
  const reg = a => TC.registerArchetype({ kinds: ["boss"], shapes: ["1x1"], floors: [1, 8], weight: 1, ...a, build: ctx => make(ctx, a.draw) });

  // ---------- 비대칭 도구 ----------
  // 모퉁이 시점: flip(g, fx, fy) — 로컬 좌표 (1,1)이 방의 네 모퉁이 중 하나가 되도록 뒤집어서 그린다.
  function flip(g, fx, fy) {
    const W = g[0].length, H = g.length, o = {
      put: (x, y, ch) => put(g, fx ? W - 1 - x : x, fy ? H - 1 - y : y, ch),
      box: (x, y, w, h, ch) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.put(x + i, y + j, ch); },
    };
    return o;
  }
  const corners = g => [flip(g, 0, 0), flip(g, 1, 0), flip(g, 0, 1), flip(g, 1, 1)];
  // 켜진 항목이 최소 n개가 되도록 (모자라면 앞에서부터 켠다)
  function flags(ctx, n, p, min) {
    const f = Array.from({ length: n }, () => ctx.chance(p)); let on = f.filter(Boolean).length;
    for (let i = 0; on < min && i < n; i++) if (!f[i]) { f[i] = true; on++; }
    return f;
  }
  // 공식적인 좌우·상하 대칭 방은 전체의 일부(≤25%)만: 기본 확률 p로만 대칭
  const formal = (ctx, lvl, p) => lvl < 99 && ctx.chance(p);
  // 흩어진 작은 조각 — 하나 놓을 때마다 흐름을 검사해서 길을 막으면 도로 뺀다. bias>0이면 오른쪽, <0이면 왼쪽에 몰린다.
  const PIECES = [["R"], ["P"], ["CC"], ["RR"], ["P", "P"], ["B"], ["PP", "P."], ["C", "C"], ["RR", "R."], ["#"], ["CB"], ["R", "C"], ["P", "R"]];
  function scatter(g, ctx, goal, lvl, mirrorP = 0.1, bias = 0) {
    if (lvl >= 99 || goal <= 0) return;
    const w = g[0].length, h = g.length; let placed = 0;
    for (let tries = 0; tries < 160 && placed < goal; tries++) {
      const pc = ctx.pick(PIECES), ph = pc.length, pw = pc[0].length, hi = w - 2 - pw;
      let x = ctx.int(2, hi); if (bias && ctx.chance(0.7)) x = bias > 0 ? ctx.int(Math.max(2, w >> 1), hi) : ctx.int(2, Math.max(2, (w >> 1) - pw));
      const y = ctx.int(2, h - 2 - ph);
      if (!free(g, x - 1, y - 1, pw + 2, ph + 2)) continue;           // 둘레 1칸 여유
      const mx = w - x - pw;                                           // 거울 짝의 왼쪽 끝
      const mirror = mirrorP > 0 && ctx.chance(mirrorP) && free(g, mx - 1, y - 1, pw + 2, ph + 2) && (mx >= x + pw + 2 || mx + pw - 1 <= x - 3);
      const snap = g.map(r => r.slice());
      for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) { const ch = pc[j][i]; if (ch === ".") continue; put(g, x + i, y + j, ch); if (mirror) put(g, w - 1 - x - i, y + j, ch); }
      carveKeep(ctx, g);
      if (analyze(ctx, g).ok) placed++; else for (let r = 0; r < h; r++) g[r] = snap[r];
    }
  }
  // 모퉁이 벙커 한 개 (로컬 좌표: x 1..4, y 1..2 안에서만)
  function bunker(c, ctx, lvl, bw0) {
    const bw = bw0 || ctx.int(2, 4), ch = ctx.pick(["P", "#"]), st = lvl >= 99 ? 0 : ctx.int(0, 4);
    if (st === 0) c.box(1, 1, bw, 2, ch);                                       // 단단한 블록
    else if (st === 1) { c.box(1, 1, bw, 1, ch); c.put(1, 2, ch); c.put(bw, 2, "R"); }  // 계단형, 모서리는 바위
    else if (st === 2) { c.box(1, 1, bw, 2, ch); c.put(bw, 1, "R"); c.put(bw - 1, 2, "C"); }  // 한쪽이 부서짐
    else if (st === 3) { c.box(1, 1, Math.min(bw, 3) + 1, 2, ch); c.put(2, 2, "B"); }  // 속이 폭발통
    else { c.box(1, 1, 1, 2, ch); c.box(2, 1, Math.min(bw, 3), 1, "C"); }      // 기둥 + 상자 가림막
    if (lvl < 99 && bw <= 3 && ctx.chance(0.5)) c.put(bw + 1, 1, "B");
  }

  // =====================================================================================
  // 1×1 보스방 (16×9, 안쪽 14×7)
  // =====================================================================================

  // 1) 모퉁이 벙커: 모퉁이마다 크기·모양이 다르고 일부는 비어 있다 (가끔 공식적인 대칭형)
  reg({ id: "boss-corner-bunkers", weight: 1.3, tags: ["cover", "ram"], stampSets: ["cover", "barrels"], stampCount: [0, 2],
    draw(g, ctx, lvl) {
      const cs = corners(g);
      if (formal(ctx, lvl, 0.15)) { bunker(cs[0], ctx, lvl); sym(g, true, true); return; }
      if (lvl >= 99) { bunker(cs[0], ctx, lvl, 3); bunker(cs[3], ctx, lvl, 4); return; }   // 기본형: 대각선 두 곳, 크기 다름
      const on = flags(ctx, 4, 0.78, 2);
      for (let k = 0; k < 4; k++) if (on[k]) bunker(cs[k], ctx, lvl);
      if (ctx.chance(0.3)) cs[ctx.int(0, 3)].put(1, 3, "R");                                // 벽에 붙은 바위 하나
      scatter(g, ctx, ctx.int(1, 3), lvl, 0.05, ctx.pick([-1, 0, 1]));
    } });

  // 2) 기둥 흩뿌리기: 네 구역마다 개수·자리가 제각각인 기둥과 상자
  reg({ id: "boss-pillar-scatter", weight: 1, tags: ["cover"], stampSets: ["pillars", "cover"], stampCount: [0, 2],
    draw(g, ctx, lvl) {
      const cs = corners(g), ch = () => ctx.pick(["P", "P", "#"]);
      if (formal(ctx, lvl, 0.12)) { cs[0].put(ctx.int(3, 4), 2, "P"); sym(g, true, true); return; }
      if (lvl >= 99) { cs[0].put(3, 2, "P"); cs[1].put(4, 1, "P"); cs[1].put(4, 2, "P"); cs[3].put(2, 2, "P"); return; }
      for (const c of cs) {
        const n = ctx.int(0, 2);
        for (let i = 0; i < n; i++) {
          const x = ctx.int(2, 4), y = ctx.int(1, 2), s = ctx.int(0, 3);
          if (s === 0) c.put(x, y, ch()); else if (s === 1) { c.put(x, 1, ch()); c.put(x, 2, ch()); } else if (s === 2) { c.put(x, y, ch()); c.put(x - 1, y, "C"); } else { c.put(x, y, "B"); }
        }
      }
      scatter(g, ctx, ctx.int(2, 4), lvl, 0.05, ctx.pick([-1, 0, 1]));
    } });

  // 3) 도랑: 가운데 가로로 길게 구덩이. 끝 위치가 좌우 다르고, 한 군데는 끊기거나 바위/기둥이다.
  reg({ id: "boss-trench", weight: 1, floors: [2, 8], tags: ["pit"], stampSets: ["pits", "rocks"], stampCount: [0, 1],
    draw(g, ctx, lvl) {
      const tl = lvl >= 99 ? 4 : ctx.int(4, 7), tr = lvl >= 99 ? 6 : ctx.int(4, 7), len = Math.max(2, 16 - tl - tr);
      box(g, tl, 4, len, 1, "V");
      if (formal(ctx, lvl, 0.1)) { const t = ctx.int(4, 6); box(g, 1, 4, 14, 1, "."); box(g, t, 4, 16 - 2 * t, 1, "V"); }
      if (lvl < 99) {
        const kind = ctx.int(0, 3), xe = tl + len - 1;
        if (kind === 0) { const m = ctx.int(tl + 1, xe - 2); put(g, m, 4, "R"); put(g, m + 1, 4, "R"); }                // 바위 다리
        else if (kind === 1 && len >= 5) { const m = ctx.int(tl + 1, xe - 2); put(g, m, 4, "."); put(g, m + 1, 4, "."); }   // 끊어진 도랑
        else if (kind === 2) { put(g, ctx.chance(0.5) ? tl : xe, 4, "P"); }                                            // 한쪽 끝만 기둥
        if (ctx.chance(0.6)) { put(g, ctx.chance(0.5) ? tl - 1 : xe + 1, ctx.pick([3, 5]), "B"); }
        if (ctx.chance(0.5)) { put(g, ctx.int(1, 3), ctx.pick([1, 7]), "C"); }
        scatter(g, ctx, ctx.int(0, 2), lvl, 0, ctx.pick([-1, 1]));
      }
    } });

  // 4) 관문: 바위·벽 문이 방을 가른다. 왼쪽/오른쪽 위치·길이가 다르고 한두 군데는 비어 있다 (대각선으로 어긋나기도).
  reg({ id: "boss-gatehouse", weight: 1, floors: [3, 8], tags: ["ram", "destructible"], stampSets: ["rocks", "walls"], stampCount: [0, 1],
    draw(g, ctx, lvl) {
      const gl = lvl >= 99 ? 4 : ctx.int(3, 5), gr = lvl >= 99 ? 3 : ctx.int(3, 5), xr = 15 - gr;
      const on = lvl >= 99 ? [true, true, true, true] : flags(ctx, 4, 0.8, 3), segs = [[gl, 0], [gl, 1], [xr, 0], [xr, 1]];
      segs.forEach(([x, bot], i) => {
        if (!on[i]) return; const len = lvl >= 99 ? 2 : ctx.int(1, 2), th = lvl >= 99 ? 1 : ctx.int(1, 2), ch = ctx.pick(["R", "R", "#"]);
        const xx = x === xr ? Math.min(x, 15 - th) : x;   // 오른쪽 벽이 두꺼우면 안쪽으로 붙인다
        if (bot) box(g, xx, 8 - len, th, len, ch); else box(g, xx, 1, th, len, ch);
      });
      if (lvl < 99) {
        if (ctx.chance(0.5)) { put(g, gl - 1, 1, "P"); } if (ctx.chance(0.4)) { put(g, gl - 2, ctx.pick([2, 6]), "C"); } if (ctx.chance(0.4)) { put(g, xr + 2, ctx.pick([1, 7]), "B"); }
        scatter(g, ctx, ctx.int(0, 2), lvl, 0, ctx.pick([-1, 1]));
      }
    } });

  // 5) 상자 울타리: 총알이 갉아먹는 상자·통 벽이 구역마다 다른 줄에 흩어져 있다.
  reg({ id: "boss-crate-fence", weight: 1.2, floors: [1, 6], tags: ["destructible", "cover"], stampSets: ["crates", "barrels"], stampCount: [0, 2],
    draw(g, ctx, lvl) {
      const cs = corners(g), on = lvl >= 99 ? [true, false, false, true] : flags(ctx, 4, 0.82, 2);
      cs.forEach((c, k) => {
        if (!on[k]) return; const x0 = lvl >= 99 ? 2 : ctx.int(1, 3), row = lvl >= 99 ? 2 : ctx.int(1, 2), len = lvl >= 99 ? 3 : ctx.int(2, Math.min(4, 5 - x0));
        for (let i = 0; i < len; i++) c.put(x0 + i, row, i === len - 1 && lvl < 99 && ctx.chance(0.5) ? "B" : "C");
        if (lvl < 99 && ctx.chance(0.5)) c.put(x0, row + 1, "C");
        if (lvl < 99 && ctx.chance(0.35)) c.put(Math.max(1, x0 - 1), row, "P");
      });
      scatter(g, ctx, ctx.int(1, 3), lvl, 0.05, ctx.pick([-1, 0, 1]));
    } });

  // 6) 왕좌 곁벽: 위·아래 가운데를 감싼 곁벽 — 높이·위치가 좌우 다르고 일부는 빠진다 (돌진형 보스가 들이받기 좋다).
  reg({ id: "boss-throne-alcove", weight: 1, floors: [1, 8], tags: ["ram", "cover"], stampSets: ["walls", "barrels"], stampCount: [0, 1],
    draw(g, ctx, lvl) {
      const wl = lvl >= 99 ? 4 : ctx.int(3, 4), wr = lvl >= 99 ? 4 : ctx.int(3, 4);   // 왼쪽 벽 x, 오른쪽 벽은 15 - wr
      const on = lvl >= 99 ? [true, true, true, false] : flags(ctx, 4, 0.8, 3), ch = ctx.pick(["#", "P"]);
      [[wl, 0], [wl, 1], [15 - wr, 0], [15 - wr, 1]].forEach(([x, bot], i) => {
        if (!on[i]) return; const len = lvl >= 99 ? 2 : ctx.int(1, 2), th = lvl >= 99 ? 1 : ctx.int(1, 2), xx = x > 8 ? Math.min(x, 15 - th) : x;
        if (bot) box(g, xx, 8 - len, th, len, ch); else box(g, xx, 1, th, len, ch);
      });
      if (lvl < 99) {
        if (ctx.chance(0.5)) put(g, ctx.int(2, 3), ctx.pick([2, 6]), "B");
        if (ctx.chance(0.4)) { put(g, 14, 1, "R"); put(g, 13, 1, "C"); }
        scatter(g, ctx, ctx.int(1, 2), lvl, 0, ctx.pick([-1, 1]));
      }
    } });

  // =====================================================================================
  // 큰 보스방: 2×1 (32×9)
  // =====================================================================================

  // 7) 기둥 회랑: 기둥 벽 두 줄 — 위치와 토막이 제각각이라 회랑이 고르지 않다.
  reg({ id: "boss-colonnade", shapes: ["2x1"], floors: [3, 8], weight: 1.2, tags: ["ram", "cover"], stampSets: ["cover", "barrels"], stampCount: [0, 2],
    draw(g, ctx, lvl) {
      const xl = lvl >= 99 ? 8 : ctx.int(6, 11), xr = lvl >= 99 ? 22 : ctx.int(20, 25), ch = ctx.pick(["P", "#"]);
      const on = lvl >= 99 ? [true, true, true, true] : flags(ctx, 4, 0.8, 3);
      [[xl, 0], [xl, 1], [xr, 0], [xr, 1]].forEach(([x, bot], i) => {
        if (!on[i]) return; const len = lvl >= 99 ? 2 : ctx.int(1, 2), th = lvl >= 99 ? 2 : ctx.int(1, 2);
        if (bot) box(g, x, 8 - len, th, len, ch); else box(g, x, 1, th, len, ch);
      });
      if (lvl < 99) {
        if (formal(ctx, lvl, 0.12)) { box(g, 15, 1, 2, 2, "P"); box(g, 15, 6, 2, 2, "P"); }
        if (ctx.chance(0.5)) { put(g, xl - 2, ctx.pick([3, 5]), "B"); }
        if (ctx.chance(0.4)) { put(g, xr + 3, ctx.pick([2, 6]), "C"); }
        scatter(g, ctx, ctx.int(2, 4), lvl, 0.03, ctx.pick([-1, 0, 1]));
      }
    } });

  // 8) 절벽 다리: 위·아래 구덩이의 시작과 길이가 서로 다르다. 폭 3의 다리(가운데 줄)는 늘 이어진다.
  reg({ id: "boss-chasm-bridge", shapes: ["2x1"], floors: [3, 8], weight: 1, tags: ["pit"], stampSets: ["pits", "rocks"], stampCount: [0, 1],
    draw(g, ctx, lvl) {
      const pit = (y, h, a, len) => box(g, a, y, Math.min(len, 22 - a), h, "V");
      if (lvl >= 99) { pit(1, 2, 11, 8); pit(6, 2, 13, 6); return; }
      pit(1, 2, ctx.int(10, 14), ctx.int(5, 10)); pit(6, 2, ctx.int(10, 14), ctx.int(5, 10));
      if (ctx.chance(0.4)) { const m = ctx.int(12, 17), y = ctx.pick([1, 6]); box(g, m, y, 2, 2, "R"); }       // 구덩이 한 곳이 바위 (폭발로 길이 생김)
      if (ctx.chance(0.5)) { put(g, ctx.pick([9, 24]), ctx.pick([2, 6]), "B"); }
      if (ctx.chance(0.4)) { box(g, ctx.pick([9, 10]), ctx.pick([1, 7]), 1, 1, "P"); }
      scatter(g, ctx, ctx.int(1, 3), lvl, 0.03, ctx.pick([-1, 0, 1]));
    } });

  // 9) 쌍둥이 성채가 아닌 "두 요새": 양쪽 모퉁이 벙커는 서로 다르고 가운데 바위 문은 한쪽으로 치우쳐 있다.
  reg({ id: "boss-twin-keeps", shapes: ["2x1"], floors: [2, 8], weight: 1, tags: ["cover", "destructible"], stampSets: ["cover", "rocks"], stampCount: [0, 2],
    draw(g, ctx, lvl) {
      const cs = corners(g), on = lvl >= 99 ? [true, true, true, true] : flags(ctx, 4, 0.82, 3);
      for (let k = 0; k < 4; k++) if (on[k]) bunker(cs[k], ctx, lvl, lvl >= 99 ? 3 : ctx.int(3, 5) > 4 ? 4 : undefined);
      const gx = lvl >= 99 ? 15 : ctx.int(12, 18);
      if (lvl >= 99 || ctx.chance(0.7)) box(g, gx, 1, 2, 2, "R");
      if (lvl >= 99 || ctx.chance(0.7)) box(g, gx + (lvl >= 99 ? 0 : ctx.int(-1, 1)), 6, 2, 2, "R");
      if (lvl < 99) { if (ctx.chance(0.5)) put(g, ctx.int(5, 10), ctx.pick([1, 7]), "B"); scatter(g, ctx, ctx.int(1, 3), lvl, 0.03, ctx.pick([-1, 0, 1])); }
    } });

  // 10) 상자 바리케이드: 상자 덩어리가 왼쪽/오른쪽에 서로 다른 모양으로 놓여 있다.
  reg({ id: "boss-crate-barricade", shapes: ["2x1"], floors: [1, 6], weight: 1, tags: ["destructible", "cover"], stampSets: ["crates", "barrels"], stampCount: [0, 2],
    draw(g, ctx, lvl) {
      const xl = lvl >= 99 ? 10 : ctx.int(7, 12), xr = lvl >= 99 ? 21 : ctx.int(19, 24), on = lvl >= 99 ? [true, true, true, false] : flags(ctx, 4, 0.8, 3);
      [[xl, 0], [xl, 1], [xr, 0], [xr, 1]].forEach(([x, bot], i) => {
        if (!on[i]) return; const w = lvl >= 99 ? 2 : ctx.int(1, 3), h = lvl >= 99 ? 2 : ctx.int(1, 2);
        if (bot) box(g, x, 8 - h, w, h, "C"); else box(g, x, 1, w, h, "C");
        if (lvl < 99 && ctx.chance(0.5)) put(g, x - 1, bot ? 6 : 2, "B");
      });
      if (lvl < 99) { if (ctx.chance(0.5)) { box(g, ctx.int(13, 18), ctx.pick([1, 7]), 1, 1, "P"); } scatter(g, ctx, ctx.int(1, 3), lvl, 0.03, ctx.pick([-1, 0, 1])); }
    } });

  // =====================================================================================
  // 큰 보스방: 1×2 (16×18)
  // =====================================================================================

  // 11) 탑의 층계참: 가로 벽의 높이와 트인 곳(문)이 한쪽으로 치우쳐 있고, 한쪽 벽에는 작은 보조 벽이 붙는다.
  reg({ id: "boss-tower-landings", shapes: ["1x2"], floors: [3, 8], weight: 1.2, tags: ["ram", "cover"], stampSets: ["cover", "barrels"], stampCount: [0, 2],
    draw(g, ctx, lvl) {
      const ch = ctx.pick(["P", "#"]), gap = lvl >= 99 ? 6 : ctx.int(6, 7), gx0 = lvl >= 99 ? 5 : ctx.int(3, 14 - gap), wy = lvl >= 99 ? 8 : ctx.int(6, 10);
      box(g, 1, wy, gx0 - 1, 2, ch); box(g, gx0 + gap, wy, 14 - (gx0 + gap) + 1, 2, ch);
      if (lvl < 99) {
        if (ctx.chance(0.5)) { const y = ctx.pick([2, 3, 13, 14]), len = ctx.int(3, 5); if (ctx.chance(0.5)) box(g, 1, y, len, 1, ctx.pick(["#", "R"])); else box(g, 15 - len, y, len, 1, ctx.pick(["#", "R"])); }   // 한쪽에 붙은 보조 벽
        if (ctx.chance(0.5)) { put(g, gx0 - 1, wy - 1, "B"); put(g, gx0 + gap, wy + 2, "B"); }
        scatter(g, ctx, ctx.int(2, 4), lvl, 0.03, ctx.pick([-1, 0, 1]));
      }
    } });

  // 12) 구덩이 트랙: 길쭉한 구덩이가 한쪽으로 치우쳐 있어 두 길의 폭이 다르다. 끝은 기둥·바위·끊김 등으로 제각각.
  reg({ id: "boss-pit-track", shapes: ["1x2"], floors: [3, 8], weight: 1, tags: ["pit"], stampSets: ["pits", "rocks"], stampCount: [0, 1],
    draw(g, ctx, lvl) {
      // 칸 사이 세로 통로(ctx.links의 v)가 가운데(x 6..8)를 지나므로, 구덩이는 그 옆(왼쪽/오른쪽)에 붙여서 통로가 잘리지 않게 한다.
      const hasV = (ctx.links || []).some(l => l.axis === "v"), left = ctx.chance(0.5);
      let pw = lvl >= 99 ? 2 : ctx.int(2, 6), x0 = lvl >= 99 ? 4 : ctx.int(4, 12 - pw);
      if (hasV) { pw = Math.min(pw, left ? 2 : 3); x0 = left ? ctx.int(4, 6 - pw) : ctx.int(9, 12 - pw); if (lvl >= 99) { pw = 2; x0 = 4; } }
      const ya = lvl >= 99 ? 5 : ctx.int(3, 6), yb = lvl >= 99 ? 5 : ctx.int(3, 6);
      box(g, x0, ya, pw, 18 - ya - yb, "V");
      if (lvl < 99) {
        const kind = ctx.int(0, 3), ymid = ya + ((18 - ya - yb) >> 1);
        if (kind === 0) box(g, x0 + (pw >> 1) - 1 + (pw & 1 ? 0 : 0), ymid, Math.min(2, pw), 2, "R");        // 바위 다리
        else if (kind === 1) { const m = ctx.int(ya + 1, 18 - yb - 4); box(g, x0, m, pw, 2, "."); }          // 끊어진 구덩이
        else if (kind === 2) { box(g, x0, ya, pw, 1, "P"); }                                                  // 한쪽 끝만 기둥
        if (ctx.chance(0.5)) put(g, ctx.pick([2, 13]), ctx.int(4, 13), "B");
        scatter(g, ctx, ctx.int(2, 4), lvl, 0.03, ctx.pick([-1, 1]));
      }
    } });

  // =====================================================================================
  // 큰 보스방: 2×2 (32×18)
  // =====================================================================================

  // 13) 큰 제단: 해자(구덩이 고리)와 기둥 단상. 대칭인 "공식 아레나"로도, 중심이 어긋나고 모퉁이가 제각각인 모양으로도 나온다.
  reg({ id: "boss-grand-dais", shapes: ["2x2"], floors: [4, 8], weight: 1.3, tags: ["pit", "cover"], stampSets: ["cover", "barrels"], stampCount: [0, 2],
    draw(g, ctx, lvl) {
      const cs = corners(g), fm = formal(ctx, lvl, 0.3);
      const rw = lvl >= 99 ? 10 : ctx.pick([8, 10, 12]), rh = lvl >= 99 ? 8 : ctx.pick([6, 8, 10]);
      const ox = fm || lvl >= 99 ? 0 : ctx.int(-2, 2), oy = fm || lvl >= 99 ? 0 : ctx.int(-1, 1);
      const x0 = Math.max(11, Math.min(21 - rw, 16 - rw / 2 + ox)), y0 = Math.max(4, Math.min(14 - rh, 9 - rh / 2 + oy));
      box(g, x0, y0, rw, rh, "V"); box(g, x0 + 2, y0 + 2, rw - 4, rh - 4, ctx.pick(["P", "P", "R"]));
      if (lvl < 99 && ctx.chance(0.4)) { box(g, x0 + (rw >> 1) - 1, y0, 2, 2, "R"); if (ctx.chance(0.5)) box(g, x0 + (rw >> 1) - 1, y0 + rh - 2, 2, 2, "R"); }  // 해자 한두 곳은 바위 다리
      if (fm) { bunker(cs[0], ctx, lvl, 3); sym(g, true, true); }
      else if (lvl >= 99) { bunker(cs[0], ctx, lvl, 3); bunker(cs[3], ctx, lvl, 4); }
      else { const on = flags(ctx, 4, 0.8, 2); for (let k = 0; k < 4; k++) if (on[k]) bunker(cs[k], ctx, lvl); if (ctx.chance(0.6)) put(g, ctx.int(5, 9), ctx.int(2, 15), "B"); scatter(g, ctx, ctx.int(1, 3), lvl, 0.03, ctx.pick([-1, 0, 1])); }
    } });

  // 14) 네 개의 방: 십자 벽이 방을 가르지만 벽의 위치가 어긋나 방 크기가 제각각이고, 가끔 벽 한 팔이 없다 (세 개의 방).
  reg({ id: "boss-four-chambers", shapes: ["2x2"], floors: [5, 8], weight: 1, tags: ["ram", "destructible"], stampSets: ["cover", "crates"], stampCount: [0, 2],
    draw(g, ctx, lvl) {
      const vx = lvl >= 99 ? 15 : ctx.int(13, 17), hy = lvl >= 99 ? 8 : ctx.int(7, 9), ch = ctx.pick(["#", "P"]);
      const noRight = lvl < 99 && ctx.chance(0.3), noBottom = lvl < 99 && !noRight && ctx.chance(0.25);
      box(g, vx, 1, 2, noBottom ? hy + 1 : 16, ch);                                    // 세로 벽 (아래쪽 팔이 없을 수도)
      if (noRight) box(g, 1, hy, vx, 2, ch); else box(g, 1, hy, 30, 2, ch);           // 가로 벽 (오른쪽 팔이 없을 수도)
      if (!(ctx.links && ctx.links.length)) { box(g, vx, hy - 2, 2, 6, "."); box(g, vx - 3, hy, 8, 2, "."); }   // 칸 사이 통로가 없으면 가운데에 넓은 허브 문 (모퉁이가 좁게 끼지 않도록 여유 있게)
      if (lvl < 99) {
        if (ctx.chance(0.7)) box(g, vx, ctx.pick([1, 2]), 2, 1, "R");                  // 벽 끝은 부술 수 있는 바위
        if (ctx.chance(0.6)) box(g, ctx.pick([1, 29]), hy, 1, 2, "R");
        if (ctx.chance(0.5)) { put(g, ctx.int(2, 6), ctx.int(2, 6), "B"); put(g, ctx.int(24, 29), ctx.int(11, 15), "B"); }
        scatter(g, ctx, ctx.int(2, 4), lvl, 0.03, ctx.pick([-1, 0, 1]));
      }
    } });

  // 15) 기둥 밭: 격자에서 어긋난 기둥들. 크기·종류가 섞이고 군데군데 빠진다.
  reg({ id: "boss-pillar-field", shapes: ["2x2"], floors: [2, 8], weight: 1.1, tags: ["cover"], stampSets: ["cover", "barrels"], stampCount: [0, 2],
    draw(g, ctx, lvl) {
      const xs = [5, 12, 19, 26], ys = [4, 11];
      if (lvl >= 99) { xs.forEach((x, i) => ys.forEach((y, j) => { if ((i + j) % 3 !== 1) box(g, x, y, 2, 2, "P"); })); return; }
      const kinds = [[2, 2], [2, 2], [2, 1], [1, 2], [1, 1]];
      for (const y of ys) for (const x of xs) {
        if (ctx.chance(0.25)) continue;
        const [w, h] = ctx.pick(kinds), jx = ctx.int(-1, 1), jy = ctx.int(-1, 1);
        box(g, x + jx, y + jy, w, h, ctx.chance(0.2) ? "R" : ctx.chance(0.1) ? "B" : "P");
      }
    } });

  // =====================================================================================
  // 모든 모양: 한쪽으로 치우친 폐허 — 작은 조각을 하나씩 놓고, 그때마다 흐름을 검사해서 길을 막는 조각은 도로 뺀다.
  // =====================================================================================
  TC.registerArchetype({
    id: "boss-ruins", kinds: ["boss"], shapes: ["1x1", "2x1", "1x2", "2x2"], floors: [1, 8], weight: 0.9, tags: ["cover", "destructible"], stampSets: ["cover", "crates", "rocks"], stampCount: [0, 2],
    build(ctx) {
      const w = ctx.w, h = ctx.h, area = (w - 2) * (h - 2), goal = Math.max(3, Math.round(area / 16 * (0.7 + ctx.rng() * 0.6)));
      const g = mk(ctx); carveKeep(ctx, g);
      scatter(g, ctx, goal, 0, 0.1, ctx.pick([-1, 1]));   // 한쪽으로 치우쳐 모인다
      return { rows: g, zones: makeZones(ctx, g) };
    },
  });
})();
