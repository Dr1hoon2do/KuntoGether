// 개발용: 폰 컨트롤러(스틱·조준·버튼 4개·모션)가 TV까지 제대로 오는지 눈으로 확인하는 화면. id가 _로 시작해서 ?dev 일 때만 목록에 나온다. 15초 뒤 끝난다.
PartyGames.register({
  id: "_inputTest", name: "입력 시험", rule: "스틱·조준·버튼을 눌러 보세요", view: "other", players: [1, 8], duration: 15,
  controls: { stick: true, aim: true, motion: true, buttons: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }, { id: "d", label: "D" }] },
  create(ctx) {
    const hits = {}; for (const p of ctx.players) hits[p.id] = 0;
    return {
      update() { for (const p of ctx.players) { const i = ctx.input(p.id); for (const b of ["a", "b", "c", "d"]) if (i.pressed(b)) hits[p.id]++; } },
      onTimeUp() { ctx.end({ scores: hits }); },
      render(h) {
        ctx.players.forEach((p, i) => {
          const inp = ctx.input(p.id), y = 170 + i * 120, m = inp.motion;
          h.tag(p, 100, y, { size: 36 });
          h.circle(520, y, 46, "#ffffff33"); h.circle(520 + inp.mx * 34, y - inp.my * 34, 16, "#fff");
          h.circle(640, y, 46, "#ff8a6533"); h.circle(640 + inp.ax * 34, y - inp.ay * 34, 16, "#ff8a65");
          ["a", "b", "c", "d"].forEach((b, k) => { h.circle(790 + k * 90, y, 34, inp.held(b) ? "#ffd740" : "#ffffff22"); h.text(b.toUpperCase(), 790 + k * 90, y, { size: 32, align: "center", stroke: false, color: inp.held(b) ? "#1a1033" : "#fff" }); });
          h.text(`누름 ${hits[p.id]}`, 1190, y, { size: 32 }); if (m) h.text(`모션 ${m.ax.toFixed(1)} ${m.ay.toFixed(1)} ${m.az.toFixed(1)}`, 1380, y, { size: 28 });
        });
      },
    };
  },
});
