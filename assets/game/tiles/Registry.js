// 타일맵 방 생성용 콘텐츠 레지스트리. 이 파일은 "인터페이스"만 정한다 — 방 구성 데이터는 Archetypes*.js / Stamps.js 에서 등록하고,
// 생성기(TileGen)가 가져다 쓴다. 자세한 규약은 SPEC.md. Node 단위 테스트에서도 불러 쓸 수 있게 순수 JS로 둔다.
const TileContent = (typeof globalThis !== "undefined" && globalThis.TileContent) || {
  archetypes: [],   // A: 방의 큰 구성
  stamps: [],       // B: 작은 구성 조각
  registerArchetype(a) { if (!a || !a.id || typeof a.build !== "function") throw new Error("bad archetype " + (a && a.id)); this.archetypes.push({ weight: 1, floors: [1, 8], kinds: ["normal"], shapes: ["1x1"], ...a }); },
  registerStamp(s) { if (!s || !s.id || !Array.isArray(s.rows)) throw new Error("bad stamp " + (s && s.id)); this.stamps.push({ weight: 1, floors: [1, 8], tags: [], anchor: "any", mirror: true, ...s }); },
  archetypesFor(kind, shape, floor) { return this.archetypes.filter(a => a.kinds.includes(kind) && a.shapes.includes(shape) && floor >= a.floors[0] && floor <= a.floors[1]); },
  stampsFor(set, floor) { return this.stamps.filter(s => (!set || s.set === set) && floor >= s.floors[0] && floor <= s.floors[1]); },
};
if (typeof globalThis !== "undefined") globalThis.TileContent = TileContent;
if (typeof module !== "undefined") module.exports = TileContent;
