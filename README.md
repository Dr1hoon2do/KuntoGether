# KuntoGether

TV 브라우저를 화면으로, 폰을 컨트롤러로 쓰는 멀티플레이 게임. 접속은 PeerJS, 게임 엔진은 [Kortfinite](https://github.com/Dr1hoon2do/Kortfinite)의 `KuntoGame/`을 가져다 쓴다.

- `index.html` — 시작 메뉴 (TV 열기 / 방 코드 입력)
- `tv.html` — TV 호스트. 5글자 방 코드를 보여 주고 게임을 돌린다 (`?debug`로 FPS 표시)
- `pad.html` — 폰 컨트롤러. 왼쪽 = 이동, 오른쪽 터치 = 공격(드래그로 방향), 오른쪽 아래 버튼 = 대시
- `KuntoGame/` — 엔진 원본 (문서: `KuntoGame/API.md`). `python3 tools/build_kuntogame.py`로 `kuntogame.js` 하나로 묶으면 `<script src="kuntogame.js">` 한 줄로 쓸 수 있다 (엔진을 고치면 다시 빌드)
- `assets/main.js`, `assets/game/` — 게임 코드. **탑다운 협동 던전**: 8층, 층마다 방이 격자로 이어진다 (아이작 방식). 인원 제한 없음, 기준 2~4인
  - 방 종류: 시작 / 일반(적) / 엘리트(강한 적, 무기 보상) / 보물(패시브·무기) / 상점(골드로 구매) / 보스. **보물방·상점은 5층까지만**, 6층부터는 없다. 8층 보스(마왕)를 잡으면 클리어
  - 인원이 늘면 보물·상점·보상 개수가 늘고, 적은 체력뿐 아니라 **탄 개수·탄 속도·패턴 빈도**가 같이 강해진다
  - `Floor.js` 층 지도 생성 · `Items.js` 패시브 아이템 31종(전투·체력·유틸·골드, 플레이어별 적용) · `Weapons.js` 근접 무기 15종 × 등급 5단계(화상·둔화·기절·연타·흡혈 등 특수효과)
  - 폰은 기기 ID를 저장해 두고, 끊겼다 같은 폰으로 다시 접속하면 같은 캐릭터(아이템·골드·체력)로 이어진다. 닉네임은 폰 컨트롤러에서 입력. 죽은 플레이어는 보스방을 클리어하면 부활
  - `Enemy.js` 적 정의 표(`ENEMY_DEFS`)와 스케일(`BALANCE`, `calcScale`). 새 적은 표에 한 항목 + `ENEMY_POOL`에 등장 층·가중치. 공격 패턴(shoot·ring·spiral·charge·slam·summon)은 매개변수로 조절 — 파일 위쪽 주석 참고
  - `Hero.js` 플레이어, `Pickup.js` 바닥 아이템·구매, `Game.js` 진행·HUD·접속
- `shared/room.js` — 방 코드 ↔ PeerJS ID

TV 화면에서 `K` 키를 누르면 키보드 1P(WASD 이동, J 공격, L 대시)로 혼자 테스트할 수 있다.
실행: `python3 -m http.server` 후 `tv.html`을 연다.
