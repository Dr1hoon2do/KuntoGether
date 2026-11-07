// KuntoGame init.js가 엔진을 불러온 뒤 실행되는 TV(호스트) 게임 시작점
(async function () {
  Config.uiScaleMode = "fit";
  Config.pixelPerfect = false;
  Config.debug = new URLSearchParams(location.search).has("debug");
  Load.basePath = "assets/game/";
  await Load.Scripts(["Shapes.js", "Ship.js", "Bullet.js", "Enemy.js", "Game.js"]);

  const App = new Engine({ canvas: "#game", clearColor: "#05070a", pixelRatio: Math.min(2, window.devicePixelRatio || 1) });
  const go = App.create("game");
  const game = go.addComponent(new Game(App));
  window.game = game; // 디버깅용
  App.start();
  game.startNet();
})();
