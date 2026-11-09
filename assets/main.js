// TV(호스트) 게임 시작점. tv.html에서 kuntogame.js와 게임 스크립트를 불러온 뒤 실행된다.
(function () {
  Config.uiScaleMode = "fit";
  Config.pixelPerfect = false;
  Config.viewWidth = 400; Config.viewHeight = 225; // 아레나가 한 화면에 꽉 차게
  Config.debug = new URLSearchParams(location.search).has("debug");
  Debug.showColliders = Config.debug; // ?debug 에서는 충돌 모양(초록=지형 · 노랑=움직임 · 하늘=트리거)도 그린다

  const App = new Engine({ canvas: "#game", clearColor: "#05070a", pixelRatio: Math.min(2, window.devicePixelRatio || 1) });
  const go = App.create("game");
  const game = go.addComponent(new Game(App));
  window.game = game; // 디버깅용
  const qd = new URLSearchParams(location.search).get("diff"); if (qd) game.setDifficulty(qd, null, true); // tv.html?diff=easy|normal|hard
  App.start();
  game.startNet();
})();
