// TV(호스트) 게임 시작점. tv.html에서 kuntogame.js와 게임 스크립트를 불러온 뒤 실행된다.
(function () {
  Config.uiScaleMode = "fit";
  Config.pixelPerfect = false;
  Config.viewWidth = 400; Config.viewHeight = 225; // 아레나가 한 화면에 꽉 차게
  Config.debug = new URLSearchParams(location.search).has("debug");
  Debug.showColliders = Config.debug; // ?debug 에서는 충돌 모양(초록=지형 · 노랑=움직임 · 하늘=트리거)도 그린다

  // 렌더 해상도: 화면이 커도(4K, devicePixelRatio 2) 내부 캔버스는 최대 1280x720로 그리고 CSS로 늘린다 (TV 브라우저는 채우기 비용이 병목).
  // ?res=720|900|1080 처럼 세로 해상도를 고정할 수 있고, 안 쓰면 프레임이 느릴 때 자동으로 낮췄다가 여유가 생기면 다시 올린다.
  const RES_STEPS = [360, 450, 540, 630, 720, 900, 1080];
  const qr = +new URLSearchParams(location.search).get("res");
  const fixedRes = RES_STEPS.indexOf(qr) >= 0;
  let resIdx = fixedRes ? RES_STEPS.indexOf(qr) : RES_STEPS.indexOf(720);
  const App = new Engine({ canvas: "#game", clearColor: "#05070a", pixelRatio: Math.min(2, window.devicePixelRatio || 1), maxHeight: RES_STEPS[resIdx], maxWidth: RES_STEPS[resIdx] * 16 / 9 });
  const setRes = (i) => { resIdx = i; App.maxHeight = RES_STEPS[i]; App.maxWidth = RES_STEPS[i] * 16 / 9; App.resize(); };
  window.__setRes = setRes;
  if (!fixedRes) { // 적응형 해상도: 1초 평균 프레임 시간으로 판단
    let acc = 0, n = 0, lastT = 0, good = 0;
    setInterval(() => {
      if (document.hidden || !n) { acc = n = 0; return; }
      const avg = acc / n; acc = n = 0;
      if (avg > 24 && resIdx > 0) { setRes(resIdx - 1); good = 0; } // 40fps 미만이면 한 단계 낮춤
      else if (avg < 14.5) { if (++good >= 8 && resIdx < RES_STEPS.indexOf(720)) { setRes(resIdx + 1); good = 0; } } // 8초 연속 여유가 있으면 한 단계 올림 (상한 720)
      else good = 0;
    }, 1000);
    const tick = (t) => { if (lastT) { const d = t - lastT; if (d < 200) { acc += d; n++; } } lastT = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  const qs = new URLSearchParams(location.search).get("seed"); // tv.html?seed=123 (숫자 또는 아무 글자) — 같은 시드면 같은 층·방 배치
  if (qs !== null && qs !== "") { let h = 2166136261; for (const ch of qs) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } Game.fixedSeed = /^\d+$/.test(qs) ? (+qs >>> 0) : (h >>> 0); }
  const go = App.create("game");
  const game = go.addComponent(new Game(App));
  window.game = game; // 디버깅용
  const qd = new URLSearchParams(location.search).get("diff"); if (qd) game.setDifficulty(qd, null, true); // tv.html?diff=easy|normal|hard
  App.start();
  game.startNet();
})();
