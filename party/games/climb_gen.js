// 탑 오르기: 탑(발판 배치) 생성기 + 도달 가능성 검증기. 엔진·DOM에 의존하지 않는 순수 JS라서 Node에서도 돌려 볼 수 있다.
// 규칙: 모든 발판은 "한쪽 통과" (아래에서 뛰어 올라 통과, 위에서 밟음) 이라 머리 부딪힘이 없고, 점프 높이/거리만 맞으면 어디로든 오를 수 있다.
//
// 점프 모델 (PlatformerController 기본값과 같다: 중력 1400, 점프 속도 430, 낙하 중력 x1.5, 달리기 170)
//   올라가는 시간 = v/g, 꼭대기 높이 = v^2/2g (430 → 약 66), 목표가 dy 위에 있으면 꼭대기에서 내려와 dy 높이를 지날 때까지 낙하.
//   가로 이동 거리 = 달리기 속도 x 전체 비행 시간.  발판 가장자리 사이 간격 ≤ 0.6 x 그 거리 (여유 40%) 이고, 오르는 높이 ≤ 52 (여유 14) 일 때만 "건널 수 있다"고 본다.
// 움직이는 발판은 "가장 가까운 위치"에서 건널 수 있으면 건널 수 있다고 본다 (그 위치를 지날 때까지 기다리면 되므로).
// 스프링 발판은 점프 속도 660 (꼭대기 ~155)로 더 높은 곳까지 건널 수 있다.
const ClimbGen = (() => {
  const P = {
    g: 1400, fallMul: 1.5, vJump: 430, vSpring: 660, run: 170,
    W: 520,                 // 탑 안쪽 폭 (x: -260..260)
    thick: 12,              // 발판 두께
    margin: 0.6,           // 가장자리 간격 여유 (실제 비행 거리의 몇 %까지 쓰는지)
    riseMax: 52, springRiseMax: 130,
  };
  const apex = v => v * v / (2 * P.g);
  // 점프 속도 v로, 출발 발판보다 dy 높은(음수면 낮은) 발판에 닿을 때까지 가로로 갈 수 있는 거리. 못 오르면 -1.
  const flight = (dy, v) => { const a = apex(v); if (dy > a - 2) return -1; return P.run * (v / P.g + Math.sqrt(2 * (a - dy) / (P.g * P.fallMul))); };
  const gapMax = (dy, v) => { const f = flight(dy, v); return f < 0 ? -1 : P.margin * f; };

  // 두 발판 사이의 가장자리 간격 (움직이는 발판은 이동 범위 중 가장 가까운 위치 기준)
  const gapBetween = (a, b) => Math.max(0, Math.abs(a.x - b.x) - (a.r || 0) - (b.r || 0)) - (a.w + b.w) / 2;
  // a에서 b로 건널 수 있나?
  function canReach(a, b, useSpring = true) {
    const dy = b.y - a.y, gap = gapBetween(a, b);
    if (useSpring && a.kind === 'spring' && dy <= P.springRiseMax) { const m = gapMax(dy, P.vSpring); if (m >= 0 && gap <= m) return true; }
    if (dy > P.riseMax) return false;
    const m = gapMax(dy, P.vJump); return m >= 0 && gap <= m;
  }

  // 시드 난수 도우미 (ctx.rng 와 같은 모양: rng(), .range, .int, .pick). 테스트용으로도 쓴다.
  function makeRng(seed) {
    let s = seed >>> 0; const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.range = (a, b) => a + r() * (b - a); r.int = (a, b) => a + Math.floor(r() * (b - a + 1)); r.pick = arr => arr[Math.floor(r() * arr.length)];
    return r;
  }

  // 구간(segment) 설정: 아래쪽은 쉽고 넓게, 위로 갈수록 좁고 위험하게.
  const SEG = [
    { name: 'easy', to: 0.2, dy: [34, 44], w: [130, 180], rows: [1, 2], kinds: { normal: 80, spring: 8, ice: 6, crumble: 6 } },
    { name: 'mid', to: 0.65, dy: [38, 50], w: [90, 130], rows: [1, 2], kinds: { normal: 28, move: 24, crumble: 18, ice: 14, spring: 9 } },
    { name: 'hard', to: 1, dy: [44, 52], w: [64, 100], rows: [1, 1.4], kinds: { normal: 14, move: 30, crumble: 28, ice: 16, spring: 6 } },
  ];
  const pickKind = (rng, table) => { let t = 0; for (const k in table) t += table[k]; let r = rng() * t; for (const k in table) { if ((r -= table[k]) < 0) return k; } return 'normal'; };

  function generate(rng, opts = {}) {
    const H = opts.height || 2000, W = P.W, half = W / 2, nodes = [];
    let id = 0;
    const add = n => { n.id = id++; n.r = n.r || 0; nodes.push(n); return n; };
    add({ kind: 'ground', x: 0, y: 0, w: W + 20, row: 0 });
    const overlaps = (c) => nodes.some(n => n.kind !== 'ground' && Math.abs(c.y - n.y) < 24 && Math.abs(c.x - n.x) - (c.r || 0) - (n.r || 0) < (c.w + n.w) / 2 + 20);
    const dropSpringOnlyNear = c => { for (let i = nodes.length - 1; i > 0; i--) { const n = nodes[i]; if (n.springOnly && Math.abs(c.y - n.y) < 24 && Math.abs(c.x - n.x) - (c.r || 0) - (n.r || 0) < (c.w + n.w) / 2 + 20) nodes.splice(i, 1); } };
    const inside = (c) => c.x - (c.r || 0) - c.w / 2 >= -half + 2 && c.x + (c.r || 0) + c.w / 2 <= half - 2;

    // 한 발판을 y 높이에 놓는다: 가까운 아래쪽 발판에서 건널 수 있는 자리를 골라 본다. 못 놓으면 null.
    function place(y, wRange, kind, tries = 40, from = null, boosted = false) {
      for (let t = 0; t < tries; t++) {
        const w = Math.round(rng.range(wRange[0], wRange[1]));
        const c = { kind, y, w, r: 0, row: 0 };
        if (kind === 'move') { c.r = Math.round(rng.range(30, 64)); c.period = rng.range(3.6, 5.4); c.phase = rng.range(0, 6.28); } // 이동 발판 최고 속도 ≈ 2πr/주기 ≤ 112 u/s (사람이 타이밍을 맞출 수 있게)
        // 건너올 후보: 높이 차이가 riseMax 안인 아래 발판들 (최근 것 우선)
        const srcs = from ? [from] : nodes.filter(n => !n.springOnly && y - n.y >= 18 && y - n.y <= P.riseMax - 4);
        if (!srcs.length) return null;
        const s = srcs[Math.max(0, srcs.length - 1 - Math.floor(Math.pow(rng(), 2) * srcs.length))];
        const dy = y - s.y, gm = gapMax(dy, boosted ? P.vSpring : P.vJump);
        if (gm < 0) continue;
        const reachDist = (s.w + w) / 2 + gm + (s.r || 0) + c.r - 4; // 중심 간 최대 거리 (이 안에서 고르면 건널 수 있다)
        c.x = Math.round(s.x + (rng() * 2 - 1) * Math.max(0, reachDist));
        c.x = Math.max(-half + c.w / 2 + c.r + 4, Math.min(half - c.w / 2 - c.r - 4, c.x));
        if (!inside(c) || overlaps(c) || !canReach(s, c, boosted)) continue; // 일반 줄은 스프링 없이 건널 수 있게 (스프링은 지름길로만)
        if (kind === 'spring') c.springOff = Math.round(rng.range(-c.w / 2 + 18, c.w / 2 - 18));
        if (boosted) c.springOnly = true; // 스프링으로만 올 수 있는 지름길 발판 (여기서 이어지는 줄은 만들지 않는다)
        return add(c);
      }
      return null;
    }

    let y = 0, row = 0, lastY = 0;
    while (true) {
      const seg = SEG.find(s => y / H < s.to) || SEG[2];
      const dy = Math.round(rng.range(seg.dy[0], seg.dy[1]));
      if (y + dy >= H - 40) break;
      y += dy; row++;
      let n = Math.floor(seg.rows[0] + rng() * (seg.rows[1] - seg.rows[0] + 1)); if (row <= 3) n = Math.max(n, 2);
      let placed = 0;
      for (let j = 0; j < n; j++) {
        let kind = pickKind(rng, seg.kinds); if (j > 0 && (kind === 'spring' || kind === 'move')) kind = 'normal';
        let p = place(y, seg.w, kind); if (!p && kind !== 'normal') p = place(y, seg.w, 'normal');
        if (p) { p.row = row; placed++; if (p.kind === 'spring' && placed === 1 && rng() < 0.7) { // 스프링 지름길: 훨씬 위에 발판 하나를 더 놓는다
          const sc = nodes.find(q => q === p); const up = Math.round(rng.range(92, 120)); const t = place(sc.y + up, [seg.w[0], seg.w[1]], 'normal', 60, sc, true); if (t) t.row = row; } }
      }
      if (!placed) { // 한 줄이 통째로 비면(자리 못 찾음) 이 높이를 건너뛰지 않게 가장 쉬운 발판을 하나 놓는다
        const top = nodes.filter(n => !n.springOnly).reduce((a, b) => (b.y > a.y ? b : a)), w = Math.round(seg.w[1]); // 가장 높은 (스프링 전용이 아닌) 발판 바로 위로 높이를 당겨 놓는다
        const clampX = x => Math.max(-half + w / 2 + 4, Math.min(half - w / 2 - 4, x)), side = rng() < 0.5 ? -1 : 1;
        let c = null;
        for (const up of [34, 38, 42, 46, 30]) for (const dx of [side * ((top.w + w) / 2 + 16), -side * ((top.w + w) / 2 + 16), 0, side * 40, -side * 40]) {
          const t = { kind: 'normal', x: clampX(top.x + dx), y: top.y + up, w, r: 0, row };
          if (!c && canReach(top, t, false) && !overlaps(t)) c = t;
        }
        if (!c) { c = { kind: 'normal', x: clampX(top.x), y: top.y + 34, w, r: 0, row }; dropSpringOnlyNear(c); } // 어쩔 수 없을 때: 겹치는 스프링 지름길 발판을 치운다
        y = c.y; add(c).row = row;
      }
      lastY = Math.max(lastY, y);
    }
    // 꼭대기: 깃발이 있는 넓은 발판 (마지막 발판들 중 하나에서 건널 수 있는 높이에)
    const topY = lastY + 40;
    let flag = null;
    for (let t = 0; t < 60 && !flag; t++) {
      const w = 220, x = Math.round(rng.range(-half + w / 2 + 4, half - w / 2 - 4));
      const c = { kind: 'flag', x, y: topY, w, r: 0, row: row + 1 };
      if (nodes.some(n => !n.springOnly && n.y >= topY - P.riseMax + 6 && n.y < topY - 10 && canReach(n, c, false)) && !overlaps(c)) flag = add(c);
    }
    if (!flag) { // 드물게: 마지막 발판 바로 위 가운데에 깃발 발판
      const s = nodes.filter(n => n.kind !== 'flag' && !n.springOnly).reduce((a, b) => (b.y > a.y ? b : a)); const c = { kind: 'flag', x: Math.max(-half + 114, Math.min(half - 114, s.x)), y: s.y + 36, w: 220, r: 0, row: row + 1 };
      dropSpringOnlyNear(c); flag = add(c);
    }
    // springOnly 발판 중 지금은 아래 연결이 사라진 것(치워진 스프링에 매달린 것)이 없는지는 validate가 확인한다. id를 번호순으로 다시 매긴다.
    nodes.forEach((n, i) => { n.id = i; });
    return { nodes, height: flag.y, flag, width: W, seed: opts.seed };
  }

  // 검증: 땅에서 출발해 모든 발판에 닿을 수 있나 + 규칙 위반(겹침, 탑 밖) 없나. 결과 {ok, errors[], unreachable[], counts}
  function validate(tower) {
    const nodes = tower.nodes, errors = [], half = P.W / 2;
    const reached = new Set([0]), q = [nodes[0]];
    while (q.length) { const a = q.pop(); for (const b of nodes) if (!reached.has(b.id) && b !== a && canReach(a, b)) { reached.add(b.id); q.push(b); } }
    const unreachable = nodes.filter(n => !reached.has(n.id)).map(n => n.id);
    if (unreachable.length) errors.push('도달 불가 발판 ' + unreachable.length + '개');
    if (!reached.has(tower.flag.id)) errors.push('깃발에 못 감');
    { const r2 = new Set([0]), q2 = [nodes[0]]; while (q2.length) { const a = q2.pop(); for (const b of nodes) if (!r2.has(b.id) && b !== a && canReach(a, b, false)) { r2.add(b.id); q2.push(b); } } if (!r2.has(tower.flag.id)) errors.push('스프링 없이는 깃발에 못 감'); }
    for (const n of nodes) {
      if (n.kind === 'ground') continue;
      if (n.x - n.r - n.w / 2 < -half || n.x + n.r + n.w / 2 > half) errors.push('탑 밖 ' + n.id);
      for (const m of nodes) if (m.id < n.id && m.kind !== 'ground' && Math.abs(n.y - m.y) < 20 && Math.abs(n.x - m.x) - n.r - m.r < (n.w + m.w) / 2) errors.push('겹침 ' + n.id + '/' + m.id);
    }
    // 깃발 쪽으로 가는 길의 최소 단계 수(BFS 층)
    const counts = {}; for (const n of nodes) counts[n.kind] = (counts[n.kind] || 0) + 1;
    return { ok: errors.length === 0, errors, unreachable, counts };
  }

  // 길 찾기(봇/테스트용): 땅에서 깃발까지 발판 사이를 건너는 경로 (BFS, 위로 가는 쪽 우선)
  function path(tower) {
    const nodes = tower.nodes, prev = new Map([[0, null]]), q = [nodes[0]];
    while (q.length) { const a = q.shift(); if (a === tower.flag) break; for (const b of nodes) if (!prev.has(b.id) && b !== a && b.y > a.y - 1 && canReach(a, b, false)) { prev.set(b.id, a); q.push(b); } }
    const out = []; let n = tower.flag; if (!prev.has(n.id)) return null; while (n) { out.push(n); n = prev.get(n.id); } return out.reverse();
  }

  return { P, apex, flight, gapMax, gapBetween, canReach, makeRng, generate, validate, path, SEG };
})();
if (typeof module !== 'undefined') module.exports = ClimbGen;
