# KuntoGether

TV 브라우저를 화면으로, 폰을 컨트롤러로 쓰는 멀티플레이 게임. 접속은 PeerJS, 게임 엔진은 [Kortfinite](https://github.com/Dr1hoon2do/Kortfinite)의 `KuntoGame/`을 가져다 쓴다.

- `index.html` — 시작 메뉴 (TV 열기 / 방 코드 입력)
- `tv.html` — TV 호스트. 5글자 방 코드를 보여 주고 게임을 돌린다 (`?debug`로 FPS 표시)
- `pad.html` — 폰 컨트롤러. 왼쪽 = 이동, 오른쪽 터치 = 공격(드래그로 방향), 오른쪽 아래 버튼 = 대시
- `KuntoGame/` — 엔진 원본 (문서: `KuntoGame/API.md`). `python3 tools/build_kuntogame.py`로 `kuntogame.js` 하나로 묶으면 `<script src="kuntogame.js">` 한 줄로 쓸 수 있다 (엔진을 고치면 다시 빌드)
- `assets/main.js`, `assets/game/` — 게임 코드. **탑다운 협동 던전**: 방을 깨고 → 무기 드랍 → 포털로 다음 방, 5방마다 보스. 인원 제한 없음(사람이 많을수록 적이 강해지고 늘어남, 기준 2~4인)
  - `Weapons.js` 근접 무기 표 (검·단검·대검·창·망치·낫, 등급 3단계) — 무기를 추가하려면 여기에 한 줄
  - `Hero.js` 플레이어(이동·대시·휘두르기), `Enemy.js` 적·탄환(검으로 튕겨낼 수 있음), `Pickup.js` 바닥 아이템, `Game.js` 방 진행·HUD·접속
- `shared/room.js` — 방 코드 ↔ PeerJS ID

TV 화면에서 `K` 키를 누르면 키보드 1P(WASD 이동, J 공격, L 대시)로 혼자 테스트할 수 있다.
실행: `python3 -m http.server` 후 `tv.html`을 연다.
