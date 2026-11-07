# KuntoGether

TV 브라우저를 화면으로, 폰을 컨트롤러로 쓰는 멀티플레이 게임. 접속은 PeerJS, 게임 엔진은 [Kortfinite](https://github.com/Dr1hoon2do/Kortfinite)의 `KuntoGame/`을 가져다 쓴다.

- `index.html` — 시작 메뉴 (TV 열기 / 방 코드 입력)
- `tv.html` — TV 호스트. 5글자 방 코드를 보여 주고 게임을 돌린다 (`?debug`로 FPS 표시)
- `pad.html` — 폰 컨트롤러. 왼쪽 절반 = 이동, 오른쪽 절반 = 조준·발사
- `KuntoGame/` — 엔진 원본 (문서: `KuntoGame/API.md`). `python3 tools/build_kuntogame.py`로 `kuntogame.js` 하나로 묶으면 `<script src="kuntogame.js">` 한 줄로 쓸 수 있다 (엔진을 고치면 다시 빌드)
- `assets/main.js`, `assets/game/` — 게임 코드 (2D 쿼드스틱 슈팅: 웨이브마다 적이 늘어난다, 최대 6명)
- `shared/room.js` — 방 코드 ↔ PeerJS ID

TV 화면에서 `K` 키를 누르면 키보드 1P(WASD 이동, 방향키 조준)로 혼자 테스트할 수 있다.
실행: `python3 -m http.server` 후 `tv.html`을 연다.
