# 파티 게임 — 미니게임 규약 (SPEC)

TV(`party/tv.html`)가 호스트이고 폰(`party/pad.html`)은 **컨트롤러 전용**이다 (폰 화면은 거의 안 본다는 전제). 셸이 로비·소개·카운트다운·결과·최종 순위·접속·입력을 맡고, 미니게임은 **한 판 안의 규칙과 그림**만 만든다.

## 파일
| 파일 | 역할 |
|---|---|
| `tv.html`, `main.js` | TV 시작점. 엔진(`#game`) + 오버레이(`#ui`) 두 캔버스 |
| `PartyHost.js` | 진행 상태기계(lobby → intro → countdown → play → result → … → final), 화면 그리기, 미니게임 ctx 만들기 |
| `PartyNet.js` | PeerJS 호스트, 플레이어 명단, 입력(`PlayerInput`), 끊김 감지 |
| `PartyGames.js` | **레지스트리** (`PartyGames.register`) |
| `PartySfx.js` | 효과음 (`ctx.sfx.play("coin")`) |
| `pad.html` | 범용 컨트롤러 (TV가 보내는 layout대로 그림) |
| `games/*.js` | 미니게임 (파일 하나 = 게임 하나). `_`로 시작하는 id는 개발용(`tv.html?dev`일 때만 목록에 나옴) |

## 새 미니게임 추가하는 법
1. `party/games/내게임.js`를 만들고 `PartyGames.register({...})`를 부른다 (아래 규약).
2. `party/tv.html`의 `<!-- 새 미니게임은 여기에 -->` 자리에 `<script src="games/내게임.js"></script>` 한 줄을 추가한다.
3. `tv.html?dev`로 열어 `_tapRace.js`(가장 작은 예제)를 참고해 시험한다. 폰 없이도 TV에서 **Tab**을 누르면 키보드 플레이어가 생긴다 (WASD/방향키 이동, Space·J = A, K·Enter = B, L = C, U = D).

## 등록
```js
PartyGames.register({
  id: "dodgeball",                 // 유일한 문자열. _로 시작하면 개발용
  name: "피구",                     // 인트로 카드 제목
  rule: "공을 피하세요!",            // 한 줄 규칙 (인트로 카드에 크게 나온다)
  view: "topdown",                 // "topdown" | "platformer" | "other" (정보용)
  players: [2, 8],                 // [최소, 최대] 인원. 현재 접속자 수가 이 범위일 때만 후보가 된다
  duration: 30,                    // 제한 시간(초). 0/생략 = 무제한 (ctx.end 를 직접 불러야 끝남)
  scoring: "rank",                 // 정보용: "rank"(개인전) | "team"(협동·팀: end({winners}) 사용)
  points: [3, 2, 1],               // 1등, 2등, 3등 점수 (나머지 0). 동점은 높은 쪽 점수를 같이 받음
  weight: 1,                       // (예약) 무작위 가중치
  controls: {                      // 폰에 보낼 컨트롤러 구성
    stick: true,                   //   왼쪽 이동 스틱
    aim: false,                    //   오른쪽 조준 스틱 (터치한 곳에서 시작)
    motion: false,                 //   폰 모션 센서(허가 버튼이 뜬다)
    buttons: [{ id: "a", label: "점프" }, { id: "b", label: "공격" }],   // 최대 4개, id는 "a"|"b"|"c"|"d"
  },
  create(ctx) { /* instance 반환 */ },
});
```

## 인스턴스 (create가 돌려주는 객체)
모든 메서드는 선택이다.
```js
{
  start(),              // 카운트다운이 끝나고 "시작!" 하는 순간 한 번 (그 전에는 update가 안 불린다)
  update(dt),           // 매 프레임 (초 단위). 입력은 ctx.input(id)
  render(hud),          // 매 프레임 그린 뒤 호출. hud = ctx.hud (오버레이에 1920x1080 가상 좌표로 그린다)
  onTimeUp(),           // duration이 다 됐을 때. 여기서 ctx.end(...)를 부르면 된다
  getResult(),          // onTimeUp이 end를 안 불렀을 때 결과({ranking}|{scores}|{winners})를 돌려주면 셸이 쓴다
  onPlayerLeave(id),    // 게임 중 누가 나갔을 때 (플레이어 목록은 그대로 두고 connected만 false가 된다)
  dispose(),            // 끝나거나 중단됐을 때 한 번. 직접 만든 것(타이머, 리스너 …)을 정리
}
```
- 시간 초과(`duration`)인데 끝내지 않으면 셸이 `onTimeUp()` → `getResult()` → (없으면) 기본 순위 순으로 끝낸다.
- `update`/`render`에서 예외가 나도 셸이 잡아서 그 판을 기본 순위로 끝내고 다음으로 넘어간다 (콘솔에 오류가 찍힌다).

## ctx
```js
ctx.players        // [{ id, nick, color, index, slot, connected }]  이번 판 참가자 (index: 0..n-1, slot: 방 전체에서의 번호). id는 "p0","p1"…
ctx.input(id)      // PlayerInput (아래). 없는 id면 항상 0
ctx.rng()          // 시드 난수 [0,1). ctx.rng.int(a,b) / .range(a,b) / .pick(arr) / .shuffle(arr)  — Math.random 대신 쓰면 ?seed=로 재현된다
ctx.end(result)    // 게임 끝내기 (한 번만 유효). result 형식은 아래
ctx.time           // { elapsed, left, duration }  (duration이 0이면 left = Infinity)
ctx.after(sec, fn) // 타이머 (게임이 끝나면 자동 취소)
ctx.on(target, ev, fn)  // addEventListener (게임이 끝나면 자동 해제)
ctx.onDispose(fn)  // 정리 함수 등록
ctx.sfx.play(name) // "tick" "count" "go" "join" "ready" "coin" "jump" "hit" "boom" "win" "lose" "fanfare"
ctx.hud            // 오버레이 그리기 도구 (아래)
ctx.W, ctx.H       // 오버레이 가상 크기 1920x1080
```
**장면(엔진 오브젝트)**
```js
ctx.scene                  // 이 게임의 루트 GameObject (게임이 끝나면 자식까지 전부 파괴)
ctx.create(name)           // App.create + scene.addChild 한 번에: 이 게임의 오브젝트를 만든다
ctx.App / ctx.engine       // KuntoGame Engine
ctx.camera                 // App.camera
ctx.setView(w, h)          // 카메라가 보여줄 월드 크기 (기본 640x360, 16:9). 카메라 위치: ctx.camera.transform.setPosition(x, y)
```
- 게임이 끝나면 셸이 **`scene.destroy()`로 자식 오브젝트를 전부 지우고 카메라를 기본값(0,0, 640x360)으로 되돌린다.** 장면에 붙인 것은 누수 걱정이 없다. `ctx.scene` 밖(예: `App.create(...)`로 직접 만든 루트, `document`·`window` 리스너, `setInterval`)은 `ctx.onDispose` / `ctx.on` / `ctx.after`로 등록해서 치운다.
- 월드는 Y-up (엔진 규칙). 물리는 엔진의 물리 모듈(별도 작업)을 쓴다. 셸은 물리에 의존하지 않는다.

## 결과(`ctx.end`)
셋 중 하나:
```js
ctx.end({ ranking: ["p2", ["p0", "p1"], "p3"] })   // 좋은 순. 배열로 묶으면 동점(같은 점수)
ctx.end({ scores: { p0: 120, p1: 80 } })           // 숫자가 클수록 좋음. 같은 값은 동점
ctx.end({ winners: ["p0", "p2"] })                 // 협동·팀전: 이긴 사람 전원이 1등 점수, 나머지 0
```
빠진 참가자는 꼴찌 그룹으로 처리된다. 점수 = `points[등수]`, 동점이면 그 그룹은 모두 높은 쪽 점수를 받는다(1등 동점 둘 → 둘 다 3점, 다음은 3등).

## 입력 (`ctx.input(id)` → PlayerInput)
```js
i.mx, i.my          // 왼쪽 스틱 -1..1 (y는 위가 +, 월드 Y-up과 같다)
i.ax, i.ay          // 조준 스틱 -1..1 (controls.aim 일 때. PC 마우스: 화면 가운데 → 마우스 방향, 가운데 근처 0)
i.held("a")         // 지금 눌려 있나
i.pressed("a")      // 이번 update에서 막 눌렸나 (프레임 사이의 짧은 탭도 놓치지 않게 래치됨)
i.released("a")     // 이번 update에서 막 뗐나
i.buttons           // { a, b, c, d }  (boolean)
i.motion            // controls.motion 일 때 { ax, ay, az, gx, gy, gz } (가속도 + 회전 속도) 또는 null
```
- 폰이 600ms 넘게 소식이 없으면 스틱·버튼이 0으로 풀린다 (끊김/백그라운드).
- 플레이어가 나갔다 같은 폰으로 돌아오면 같은 id(`p0`…)로 이어진다.
- 게임 중에 새로 들어온 사람은 그 판에는 참가하지 못하고 대기 화면("다음 게임부터")을 본다 (`ctx.players`는 판 시작 때 고정).

## HUD 도구 (`ctx.hud`, 좌표 1920x1080 가상)
```js
h.text(str, x, y, { size, color, align:"left|center|right", base, weight, stroke:true, strokeW, strokeColor, alpha })
h.rect(x, y, w, h, color, radius=0)    h.circle(x, y, r, color)
h.bar(x, y, w, h, ratio, color, bg)    h.tag(player, x, y, { size })      // 색 원 + 닉네임
h.rr(x, y, w, h, r)   // 둥근 사각형 경로 (직접 fill/stroke)       h.g   // 2D 컨텍스트 원본
```
`render(hud)`는 오버레이에만 그린다 (장면 뒤에 겹쳐 보인다). 셸이 시간(상단 중앙), 라운드(우상단), 카운트다운, "끝!"을 알아서 그린다.

## 프로토콜 (폰 ↔ TV, 참고)
- 폰 → TV: `{t:"hello", pid, name}`, `{t:"s", mx,my,ax,ay, b:{a:0|1,…}, m?:{…}}` (33ms마다, 바뀌지 않아도 150ms마다), `{t:"ready", v}` (예약)
- TV → 폰: `{t:"welcome", id, color, name, rejoined, owner}`, `{t:"layout", mode:"lobby|game|wait|intro|…", stick, aim, motion, buttons:[{id,label}], color, nick, game?, note?}`, `{t:"st", ready, owner, n, score}`, `{t:"kick"}`, `{t:"full"}`
- 화면 구성(layout)은 상태가 바뀔 때마다 TV가 보낸다: 로비(스틱 + 준비 A [+방장 시작 B]) / 게임(`controls` 그대로) / 대기(늦게 들어온 사람 등) / 소개·결과·최종(확인 A — 방장이 누르면 넘어감).

## 진행 규칙 (참고)
- 로비: 각자 폰의 A = 준비/취소. **모두 준비하면 4초 뒤 자동 시작**, 방장(먼저 들어온 사람)은 B로 바로 시작. 방장 스틱: 위/아래 = 설정 줄 이동, 좌/우 = 값 변경 (게임: 무작위 / 특정 게임, 라운드: 3·5·7·10).
- 무작위 모드: 후보를 섞은 가방에서 뽑아 같은 게임이 연속으로 나오지 않게 한다 (인원 조건에 맞는 것만).
- 라운드마다 점수 누적 → 마지막에 시상대. 방장 A로 건너뛰기 가능 (소개 1초 뒤, 결과 1.5초 뒤, 최종 3초 뒤).
- URL: `?dev`(개발용 게임 표시) `?rounds=3|5|7|10` `?seed=N`(미니게임 난수 고정).
