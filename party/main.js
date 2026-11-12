// 파티 게임 TV 시작점
(function () {
  Config.uiScaleMode = "fit"; Config.pixelPerfect = false; Config.viewWidth = 640; Config.viewHeight = 360;
  const q = new URLSearchParams(location.search);
  Config.debug = q.has("debug");
  const App = new Engine({ canvas: "#game", clearColor: "#12082b", pixelRatio: Math.min(2, window.devicePixelRatio || 1), maxHeight: 720, maxWidth: 1280 });
  const host = new PartyHost(App, document.getElementById("ui"), { dev: q.has("dev") });
  if (q.has("seed")) host.fixedSeed = +q.get("seed") >>> 0; // ?seed=123 : 같은 시드면 같은 미니게임 난수
  if (q.has("rounds")) { const i = [3, 5, 7, 10].indexOf(+q.get("rounds")); if (i >= 0) host.roundIdx = i; }
  const go = App.create("partyHost");
  class Driver extends Component { update() { host.tick(Time.deltaTime); } }
  go.addComponent(new Driver());
  window.party = host; // 디버깅·테스트용
  App.start(); host.start();
})();
