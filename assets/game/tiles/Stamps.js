// 타일맵 방 콘텐츠 — B: 작은 구성 조각(스탬프). 규약은 SPEC.md.
// 생성기가 A(방의 큰 구성)가 만든 빈 곳에 놓는다. 모양은 '.'(바닥) '#'(벽) 'P'(기둥) 'R'(바위) 'C'(상자) 'B'(폭발 통) 'V'(구덩이)만 쓴다.
// 설계 원칙: 대부분 단단한 타일 12개 이하(벙커·해자 세트와 anchor "center"만 더 큼), 스스로 길을 막지 않음(안쪽 닫힌 칸 없음),
// 한 줄로 이어진 벽은 6칸 이하. 좌우/상하 반전은 생성기가 적용한다 (mirror:true).
//
// ── 세트별 쓰임 (A 아키타입의 stampSets에서 이름으로 참조) ─────────────────────────────────────────
//   cover      엄폐물 (L·U·대각·T·막대). 거의 모든 일반/엘리트 방의 기본. 가중치 높음
//   crates     상자 더미·줄·계단·상자 밭 조각. 상자 방/적이 숨은 방. 부수면 코인
//   barrels    폭발 통 무리 (쌍·삼각·일렬·상자로 둘러싼 통). 한두 개만 놓는 걸 권장
//   rocks      바위 줄(틈 있는), 군집, 지그재그. 폭발로만 부서짐
//   pillars    기둥 한두 개·삼각·네 귀퉁이·줄. 가벼운 장식 겸 엄폐
//   pits       구덩이(걷지 못함·탄 통과): 덩어리, 다리가 있는 구덩이, 대각선. 탄막 전투에서 이동을 제한
//   walls      벽 토막·꺾임·T·U. 긴 시야 차단. 문 앞 통로를 막지 않게 생성기가 검사
//   decor-mix  상자/바위/통/기둥을 섞은 잡동사니 — 방이 "쓰던 곳" 같아 보이게 가볍게 얹음
//   altar-ruins   무너진 신전 느낌(기둥+바위). 희생/서재/보물 계열 A에서 분위기용
//   mazelets      작은 미로 조각 (벽이 꺾이는 짧은 골목). 3층 이후 권장
//   bunker        속이 비어 한쪽이 열린 작은 요새 (anchor center). 안에서 버티는 구도, 2층 이후
//   spiral-bits   소용돌이 조각 (바위·벽이 말려 들어감)
//   rubble-lines  듬성듬성 이어진 파편 줄 (대각 흩뿌림). 통로를 거의 안 막음
//   checker-bits  체크무늬 조각 (타일이 어긋나게 배치). 장식 + 약한 엄폐
//   moat       구덩이로 둘러싼 섬(다리 한 군데). 가운데 놓기 (anchor center), 2층 이후
//   columns    기둥 열 (가로·세로 줄, 쌍기둥). 긴 방/보스방 장식에 적합
//
// 형식:  S(세트, id, rows, { w: 가중치, f: [최소층, 최대층], a: anchor, t: [태그], m: mirror })
const S = (set, id, rows, o = {}) => TileContent.registerStamp({
  id: set + "/" + id, set, rows, tags: [set, ...(o.t || [])], weight: o.w ?? 1, floors: o.f || [1, 8], anchor: o.a || "any", mirror: o.m !== false,
});

// ── cover: 엄폐물 ──────────────────────────────────────────────
S("cover", "L3",        ["PP", "P."],                      { w: 3, t: ["L"] });
S("cover", "L5",        ["PPP", "P..", "P.."],             { w: 2, t: ["L"] });
S("cover", "U",         ["P.P", "PPP"],                    { w: 2, t: ["nook"] });
S("cover", "bar3",      ["PPP"],                           { w: 3 });
S("cover", "bar2v",     ["P", "P"],                        { w: 3 });
S("cover", "diag3",     ["P..", ".P.", "..P"],             { w: 2, t: ["diagonal"] });
S("cover", "twin",      ["P.P"],                           { w: 3 });
S("cover", "T",         ["PPP", ".P."],                    { w: 2 });
S("cover", "corner",    ["PP.", "P.."],                    { w: 2, a: "corner" });
S("cover", "edge-lip",  ["PPP", "P.."],                     { w: 2, a: "edge" });
S("cover", "wing",      ["P...", "PP..", ".PP."],          { w: 1, f: [2, 8] });

// ── crates: 상자 ───────────────────────────────────────────────
S("crates", "pile-3x2",    ["CC.", "CCC"],                 { w: 3 });
S("crates", "pile-barrel", ["CCC", "CBC", "CCC"],          { w: 1, a: "free", f: [2, 8], t: ["trap"] });
S("crates", "line4",       ["CCCC"],                       { w: 2 });
S("crates", "L",           ["CC", "C."],                   { w: 3, t: ["L"] });
S("crates", "scatter",     ["C.C", ".C.", "C.C"],          { w: 3 });
S("crates", "gap-wall",    ["CC.CC"],                      { w: 2 });
S("crates", "stair",       ["C..", "CC.", "CCC"],          { w: 2 });
S("crates", "pair",        ["CC"],                         { w: 3 });
S("crates", "corner-pile", ["CCC", "C..", "C.."],          { w: 2, a: "corner" });
S("crates", "ring-open",   ["CCC", "C.C", "..."],          { w: 1, f: [2, 8], t: ["nook"] });

// ── barrels: 폭발 통 ───────────────────────────────────────────
S("barrels", "single",     ["B"],                          { w: 3 });
S("barrels", "pair",       ["BB"],                         { w: 3 });
S("barrels", "tri",        [".B.", "B.B"],                 { w: 2 });
S("barrels", "line",       ["B.B.B"],                      { w: 2 });
S("barrels", "diag",       ["B..", ".B.", "..B"],          { w: 1 });
S("barrels", "crate-ring", [".C.", "CBC", ".C."],          { w: 2, a: "free", t: ["trap"] });
S("barrels", "nest",       ["B.B", ".C.", "B.B"],          { w: 1, f: [2, 8], t: ["trap"] });

// ── rocks: 바위 ────────────────────────────────────────────────
S("rocks", "line-gap",     ["RR.RR"],                      { w: 3 });
S("rocks", "pair",         ["RR"],                         { w: 3 });
S("rocks", "C-shape",      ["RR", "R.", "RR"],             { w: 2, t: ["nook"] });
S("rocks", "diag2",        ["R.", ".R"],                   { w: 3 });
S("rocks", "cluster",      ["RR.", "RRR", ".R."],          { w: 1, f: [2, 8] });
S("rocks", "L",            ["RRR", "R.."],                 { w: 2, t: ["L"] });
S("rocks", "single",       ["R"],                          { w: 3 });
S("rocks", "zigzag",       ["RR..", "..RR"],               { w: 2 });
S("rocks", "edge-heap",    ["RR", "RR"],                   { w: 1, a: "edge" });

// ── pillars: 기둥 ──────────────────────────────────────────────
S("pillars", "single",     ["P"],                          { w: 4 });
S("pillars", "triad",      ["P.P", ".P."],                 { w: 2 });
S("pillars", "wide-pair",  ["P..P"],                       { w: 2 });
S("pillars", "row3",       ["P.P.P"],                      { w: 2 });
S("pillars", "square",     ["P.P", "...", "P.P"],          { w: 2, a: "center" });
S("pillars", "diag2",      ["P.", ".P"],                   { w: 3 });
S("pillars", "tall-gap",   ["P", ".", "P"],                { w: 2 });
S("pillars", "arrow",      ["..P", ".P.", "P.P"],          { w: 1, f: [2, 8] });

// ── pits: 구덩이 ───────────────────────────────────────────────
S("pits", "patch",         ["VV", "VV"],                   { w: 3 });
S("pits", "bridge",        ["VVV", "...", "VVV"],          { w: 2, t: ["bridge"] });
S("pits", "L",             ["VV", "V."],                   { w: 2, t: ["L"] });
S("pits", "C-shape",       ["VVV", "V..", "VVV"],          { w: 1, f: [2, 8], t: ["nook"] });
S("pits", "line4",         ["VVVV"],                       { w: 2 });
S("pits", "diag3",         ["V..", ".V.", "..V"],          { w: 2 });
S("pits", "lake",          ["VVV.", "VVVV"],               { w: 1, f: [2, 8] });
S("pits", "stepping",      ["V.V", ".V.", "V.V"],          { w: 1, f: [2, 8], t: ["checker"] });

// ── walls: 벽 토막 ─────────────────────────────────────────────
S("walls", "stub-h",       ["###"],                        { w: 3 });
S("walls", "stub-v",       ["#", "#", "#"],                { w: 3 });
S("walls", "L",            ["##", "#."],                   { w: 3, t: ["L"] });
S("walls", "T",            ["###", ".#."],                 { w: 2 });
S("walls", "gap",          ["##.##"],                      { w: 2 });
S("walls", "zigzag",       ["##..", "..##"],               { w: 2 });
S("walls", "U",            ["#.#", "###"],                 { w: 2, t: ["nook"] });
S("walls", "corner-big",   ["###", "#..", "#.."],          { w: 1, a: "corner" });
S("walls", "pier",         ["#", "#"],                     { w: 2, a: "edge" });

// ── decor-mix: 잡동사니 ────────────────────────────────────────
S("decor-mix", "crate-rock",   ["CR"],                     { w: 3 });
S("decor-mix", "junk-corner",  ["CR.", "R.."],             { w: 3, a: "corner" });
S("decor-mix", "cluster",      ["RC", "CB"],               { w: 2, t: ["trap"] });
S("decor-mix", "line",         ["R.C.R"],                  { w: 2 });
S("decor-mix", "pillar-crate", ["P.C"],                    { w: 3 });
S("decor-mix", "rubble",       ["C.R", ".R.", "B.C"],      { w: 1, f: [2, 8] });
S("decor-mix", "stack",        ["PC", "RB"],               { w: 1, f: [3, 8] });
S("decor-mix", "trio",         ["C", "R", "P"],            { w: 2 });

// ── altar-ruins: 무너진 신전 ───────────────────────────────────
S("altar-ruins", "arch",     ["PPPP", "P..P"],              { w: 2, a: "center" });
S("altar-ruins", "fallen",   ["P.R", "...", "R.P"],        { w: 2 });
S("altar-ruins", "shrine",   [".P.", "PRP"],               { w: 2, a: "edge" });
S("altar-ruins", "rows",     ["P.P.P", "R...R"],           { w: 1, f: [2, 8] });
S("altar-ruins", "block",    ["PP", "RR"],                 { w: 2 });

// ── mazelets: 작은 미로 조각 ───────────────────────────────────
S("mazelets", "hook",      ["###..", "..#..", ".##.."],      { w: 2, f: [3, 8] });
S("mazelets", "S",         ["##...", "..##.", "...##"],      { w: 2, f: [3, 8] });
S("mazelets", "comb",      ["#.#.#", "#.#.#"],                { w: 2, f: [3, 8] });
S("mazelets", "E",         ["###", "..#", "#.#", "#..", "###"], { w: 1, f: [4, 8] });
S("mazelets", "tee-chain", ["#.###", "#.#..", "..#.."],      { w: 1, f: [4, 8] });

// ── bunker: 한쪽이 열린 작은 요새 (중앙) ───────────────────────
S("bunker", "3x3-open-s",  ["PPP", "P.P", "P.P"],            { w: 2, a: "center", f: [2, 8] });
S("bunker", "wide",        ["#####", "#...#", "#...#", "##.##"], { w: 1, a: "center", f: [3, 8], t: ["fort"] });
S("bunker", "L-fort",      ["###..", "#.#..", "#.###", "#...."], { w: 1, a: "center", f: [3, 8] });
S("bunker", "twin-booth",  ["P.P.P", "P.P.P"],               { w: 1, a: "center", f: [2, 8] });
S("bunker", "crate-fort",  ["CCC", "C.C", "C.."],            { w: 1, a: "center", f: [2, 8] });

// ── spiral-bits: 소용돌이 조각 ─────────────────────────────────
S("spiral-bits", "curl-a",   ["RRR", "..R", "R.R"],          { w: 2, f: [2, 8] });
S("spiral-bits", "curl-b",   ["####", "#...", "#.##"],       { w: 1, f: [3, 8] });
S("spiral-bits", "hook",     ["PPP.", "...P", "PP.P"],       { w: 1, f: [3, 8] });
S("spiral-bits", "tail",     ["R...", "RR..", ".RR.", "..RR"], { w: 1, f: [2, 8] });

// ── rubble-lines: 파편 줄 ──────────────────────────────────────
S("rubble-lines", "dots",    ["R.R.R"],                      { w: 3 });
S("rubble-lines", "diag",    ["R...", ".C..", "..R.", "...C"], { w: 2 });
S("rubble-lines", "sparse",  ["R..R", ".C..", "..B."],       { w: 2 });
S("rubble-lines", "col",     ["C", ".", "R", ".", "C"],      { w: 2 });

// ── checker-bits: 체크무늬 ─────────────────────────────────────
S("checker-bits", "rock-x",   ["R.R", ".R.", "R.R"],         { w: 2 });
S("checker-bits", "crate-2",  ["C.C.", ".C.C"],              { w: 2 });
S("checker-bits", "pillar-2", ["P.P.", ".P.P"],              { w: 2 });
S("checker-bits", "mixed",    ["R.C", ".P.", "C.R"],         { w: 1, f: [2, 8] });

// ── moat: 해자 섬 (중앙, 다리 한 군데) ─────────────────────────
S("moat", "island",        ["VVVVV", "V...V", "V.P.V", "V...V", "VV.VV"], { w: 2, a: "center", f: [2, 8] });
S("moat", "barrel-island", ["VVVVV", "V...V", "V.B.V", "V...V", "VV.VV"], { w: 1, a: "center", f: [3, 8], t: ["trap"] });
S("moat", "half",          ["VVVV", "V...", "V.P.", "V...", "VVVV"],        { w: 1, a: "center", f: [2, 8] });

// ── columns: 기둥 열 ───────────────────────────────────────────
S("columns", "row4",        ["P.P.P.P"],                     { w: 2 });
S("columns", "double-row",  ["P.P.P", ".....", "P.P.P"],      { w: 1, a: "center" });
S("columns", "pair-v",      ["P..P", "P..P"],                { w: 2 });
S("columns", "col3",        ["P", ".", "P", ".", "P"],       { w: 2 });
