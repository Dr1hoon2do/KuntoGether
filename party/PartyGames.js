// 미니게임 레지스트리. 미니게임 파일(party/games/*.js)은 PartyGames.register({...}) 한 번만 부른다. 규약은 party/SPEC.md.
const PartyGames = {
  list: [],
  register(def) {
    if (!def || !def.id || typeof def.create !== "function") throw new Error("bad minigame " + (def && def.id));
    if (this.list.some(g => g.id === def.id)) throw new Error("duplicate minigame id " + def.id);
    this.list.push({
      rule: "", view: "other", players: [1, 8], duration: 0, scoring: "rank", points: [3, 2, 1], weight: 1,
      ...def,
      controls: { stick: true, aim: false, motion: false, buttons: [], ...(def.controls || {}) },
    });
    return def;
  },
  get(id) { return this.list.find(g => g.id === id) || null; },
  // 개발용 게임(id가 _로 시작)은 ?dev 일 때만 목록에 나온다
  available(n, dev) { return this.list.filter(g => (dev || g.id[0] !== "_") && n >= g.players[0] && n <= g.players[1]); },
};
if (typeof window !== "undefined") window.PartyGames = PartyGames;
if (typeof module !== "undefined") module.exports = PartyGames;
