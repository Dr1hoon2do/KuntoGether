// 연결 확인용 임시 미니게임: A 버튼을 연타해서 먼저 100을 채우면 이긴다. (셸이 끝까지 도는지 시험하는 용도 — id가 _로 시작해서 ?dev 일 때만 목록에 나온다)
PartyGames.register({
  id: "_tapRace", name: "연타 달리기", rule: "A 버튼을 가장 빨리 연타하세요!", view: "other", players: [1, 8], duration: 20,
  controls: { stick: false, aim: false, buttons: [{ id: "a", label: "연타" }] },
  create(ctx) {
    const prog = {}, order = []; for (const p of ctx.players) prog[p.id] = 0;
    return {
      start() {},
      update(dt) {
        for (const p of ctx.players) {
          if (order.includes(p.id)) continue;
          if (ctx.input(p.id).pressed("a")) { prog[p.id] += 4; ctx.sfx.play("tick"); if (prog[p.id] >= 100) { prog[p.id] = 100; order.push(p.id); } }
        }
        if (order.length >= ctx.players.length || (order.length >= 1 && ctx.players.length === 1)) ctx.end({ ranking: order });
      },
      onTimeUp() { const rest = ctx.players.filter(p => !order.includes(p.id)).sort((a, b) => prog[b.id] - prog[a.id]).map(p => p.id); ctx.end({ ranking: [...order, ...rest] }); },
      render(h) {
        ctx.players.forEach((p, i) => { const y = 200 + i * 100; h.tag(p, 140, y, { size: 36 }); h.bar(420, y - 20, 1200, 40, prog[p.id] / 100, p.color); h.text(String(prog[p.id]), 1680, y, { size: 36 }); });
      },
      dispose() {},
    };
  },
});
