// 자리 채우기용 최소 콘텐츠: 실제 방 구성(ArchetypesNormal/Boss/Special.js · Stamps.js)이 들어오기 전에 생성기·게임이 돌아가게 하는 4개 archetype + 5개 스탬프.
// 가중치를 아주 낮게(0.001) 줘서, 같은 종류의 진짜 콘텐츠가 있으면 거의 뽑히지 않는다 (없을 때만 이것들끼리 뽑힌다).
// 특수 방(가시·희생·도박)은 게임 동작에 필요한 타일(S 가시 + p 받침대, a 제단, m 기계)만 최소로 둔다.
const PH_SHAPES = ["1x1", "2x1", "1x2", "L", "2x2"];
TileContent.registerArchetype({
  id: "ph-open", kinds: ["normal", "elite", "start", "boss", "treasure", "shop", "devil", "secret", "library", "ambush"], shapes: PH_SHAPES, weight: 0.001, tags: ["placeholder"], stampSets: ["ph"], stampCount: [1, 3],
  build(ctx) { const g = ctx.grid(); const n = ctx.kind === "normal" || ctx.kind === "elite" ? ctx.int(1, 3) : 0; for (let k = 0; k < n; k++) { const x = ctx.int(3, ctx.w - 4), y = ctx.int(2, ctx.h - 3); if (!ctx.reserved(x, y)) g[y][x] = "P"; } return { rows: g, zones: [] }; },
});
TileContent.registerArchetype({
  id: "ph-ring", kinds: ["normal", "elite", "ambush"], shapes: ["1x1"], weight: 0.001, tags: ["placeholder", "arena"], stampSets: [], stampCount: [0, 0],
  build(ctx) { const g = ctx.grid(), W = ctx.w, H = ctx.h, c0 = 3, r0 = 2, w = W - 2 * c0, h = H - 2 * r0; ctx.ring(g, c0, r0, w, h, "#"); const mx = (W >> 1) - 1; for (let x = mx; x <= mx + 1; x++) { g[r0][x] = "."; g[r0 + h - 1][x] = "."; } for (let y = (H >> 1) - 1; y <= (H >> 1) + 1; y++) { g[y][c0] = "."; g[y][c0 + w - 1] = "."; }
    return { rows: g, zones: [{ x: c0 + 1, y: r0 + 1, w: w - 2, h: h - 2, weight: 3 }] }; },
});
TileContent.registerArchetype({
  id: "ph-boss-open", kinds: ["boss"], shapes: PH_SHAPES, weight: 0.001, tags: ["placeholder"], stampSets: [], stampCount: [0, 0],
  build(ctx) { const g = ctx.grid(); g[ctx.h - 3][3] = "B"; g[ctx.h - 3][ctx.w - 4] = "B"; return { rows: g, zones: [] }; },
});
TileContent.registerArchetype({
  id: "ph-special", kinds: ["sacrifice", "spike", "gamble"], shapes: ["1x1"], weight: 0.001, tags: ["placeholder", "special"], stampSets: [], stampCount: [0, 0],
  build(ctx) {
    const g = ctx.grid(), W = ctx.w, H = ctx.h, k = ctx.kind;
    if (k === "sacrifice") { ctx.fillRect(g, 7, 3, 2, 3, "a"); for (const [x, y] of [[3, 2], [12, 2], [3, 6], [12, 6]]) g[y][x] = "P"; }
    else if (k === "gamble") { ctx.fillRect(g, 4, 2, 1, 2, "m"); ctx.fillRect(g, 11, 2, 1, 2, "m"); ctx.fillRect(g, 2, 6, 1, 2, "C"); ctx.fillRect(g, 13, 6, 1, 2, "C"); }
    else { // spike: 문 반대편에 받침대 3개, 그 사이에 가시 띠 (방을 가득 가로지름)
      const side = (ctx.doors[0] && ctx.doors[0].side) || "S";
      if (side === "N" || side === "S") { ctx.fillRect(g, 1, 3, W - 2, 3, "S"); const y = side === "N" ? H - 2 : 1; for (const x of [5, 7, 9]) g[y][x] = "p"; }
      else { ctx.fillRect(g, 6, 1, 3, H - 2, "S"); const x = side === "W" ? W - 2 : 1; for (const y of [2, 4, 6]) g[y][x] = "p"; }
    }
    return { rows: g, zones: [] };
  },
});
for (const [id, rows] of [["ph-pillar", ["P"]], ["ph-crates", ["CC", "CC"]], ["ph-barrels", ["B.B"]], ["ph-rocks", ["RRR"]], ["ph-pit", ["VV", "VV"]]]) TileContent.registerStamp({ id, set: "ph", rows, weight: 0.001, tags: ["placeholder"], anchor: "any", mirror: true });
