# KuntoGame API

HTML canvas 2D 게임 엔진. 유니티 구조(GameObject, Component, Transform, Camera, RectTransform)를 따르고, 모든 클래스는 전역이다.
전부 한 묶음으로 불러온다 (트윈·타이머·입자·스프라이트 애니메이션·디버그 표시 포함). 파일 위치:

| 폴더 | 파일 |
| --- | --- |
| `math/` | Vector, Matrix |
| `core/` | EventBus, Component, Transform, GameObject, Renderer, Engine, Resource, Load |
| `systems/` | Time, Input, RenderPipeline, Tween(+Ease), Timer, Debug |
| `components/` | Camera, CameraFollow, SpriteRenderer, ParticleSystem, SpriteAnimator(+AnimationClip) |
| `ui/` | RectTransform, UIRoot, UIImage, UIText, UIElement, UIButton, UIRect, UIMask, UIScrollView, UIEventSystem |
| `config.js` | 기준 해상도, 픽셀 배율, UI 배율, 글꼴, 디버그 표시 |

## 먼저 알아둘 규칙

- **좌표계가 둘이다.**
  - 월드: **Y-up** (`Vector.up = (0, 1)`). 단위는 월드 유닛(`Config.pixelsPerUnit` 픽셀 = 1유닛, 기본 1).
  - 화면·UI·포인터: **Y-down** 픽셀. 포인터(`Input.pointers[i].position`)는 **CSS px**, `RectTransform.rect`와 캔버스는 **device px**(CSS × `engine.pixelRatio`). 비교할 때는 `rt.containsPoint(x, y)`를 쓰면 배율을 알아서 맞춘다.
  - 변환: `camera.screenToWorld(x, y)`(CSS px → 월드), `camera.worldToScreen(v)`(월드 → CSS px).
- **Vector**: 메서드(`add`, `sub`, `scale`, `normalize`, `lerp` …)는 **새 Vector를 돌려준다**. 정적 함수 `Vector.add(a, b, out)` 등은 **out에 쓴다**(할당 없음, 매 프레임용).
- **Transform 위치 쓰기**: `transform.position.x = 10`도 되고(받은 벡터가 transform에 다시 써 준다), `transform.setPosition(x, y)`가 제일 싸다. 읽은 위치는 그 순간의 복사본이다.
- **불러오는 순서**: 전역 스크립트라서 `init.js`의 `ENGINE_FILES`(엔진)와 게임 쪽 목록 순서대로 불러온다. 새 파일은 목록에 꼭 추가한다. 하나라도 404면 그 자리에서 멈추고 콘솔에 파일 이름이 나온다.
- **생명주기**: 엔진에 붙은(루트 또는 루트의 자손) 오브젝트만 돈다. 붙은 다음 프레임에 `awake → onEnable → start`, 그 뒤 매 프레임 `update(dt) → lateUpdate(dt)`, 파괴하면 프레임 끝에 `onDisable → onDestroy`.
- **씬 직렬화는 없다.** 저장은 게임이 자기 데이터로 한다(엔진은 관여하지 않음).

## Engine

```js
const App = new Engine({ canvas: "#game", pixelRatio: 1, clearColor: "#000" });
App.start();
```

| 옵션 | 기본 | 설명 |
| --- | --- | --- |
| `canvas` | (필수) | 선택자 또는 요소 |
| `pixelRatio` | 1 | 캔버스 해상도 배율 |
| `clearColor` | `#000000` | `null`이면 투명하게 지움 |
| `imageSmoothing` | false | 픽셀 아트면 false |
| `pauseOnBlur` | true | 탭이 가려지면 멈춤 |
| `input`, `ui`, `camera` | 켬 | `false`면 그 기본 구성을 안 만든다 |
| `viewWidth`, `viewHeight`, `zoom`, `uiScaleMode`, `uiScale` | `Config` | 카메라·UI 기준 |

- `create(name)` → 루트 GameObject 만들기, `add(go)` / `remove(go)` → 루트로 붙이기/빼기(파괴 아님)
- `createUI(name)` → RectTransform이 붙은 UI 오브젝트
- `find(name)`, `roots`, `camera`, `uiRoot`, `renderer`, `width`/`height`(CSS px), `frameMs`(지난 프레임 작업 시간)
- `addSystem(sys)` / `removeSystem(sys)`: 시스템은 정적 클래스나 객체. 있으면 부르는 함수: `attach(engine)`, `update()`(오브젝트 update 전), `render(ctx, engine)`(화면을 다 그린 뒤), `lateUpdate()`(프레임 끝)
- `start()`, `stop()`, `resize()`

프레임 순서: `Time` → 시스템 `update` → UI 배치 → awake/start → `update` → `lateUpdate` → 그리기 → 파괴 정리 → 시스템 `render` → 시스템 `lateUpdate`.

## GameObject

```js
const go = App.create("player");
go.addComponent(new SpriteRenderer(Resource.image("hero")));
go.transform.setPosition(16, 32);
parent.addChild(child);          // 엔진 루트에 있던 child는 루트에서 빠진다
child.transform.setParent(null); // 다시 루트로
go.setActive(false);
go.destroy();                    // 프레임 끝에 자식까지 정리
```

`name`, `tags`, `transform`, `components`, `parent`, `engine`, `isActive`, `activeInHierarchy`, `isDestroyed`,
`addComponent(c)`, `getComponent(Type)`, `getComponents(Type)`, `removeComponent(c)`, `addChild(go)`, `find(name)`, `setActive(v)`, `destroy()`.

## Component

상속해서 쓴다. 덮어쓰는 함수: `awake()`, `onEnable()`, `start()`, `update(dt)`, `lateUpdate(dt)`, `onDisable()`, `onDestroy()`.
`gameObject`, `transform`, `enabled`, `isActiveAndEnabled`, `getComponent(Type)`, `addComponent(c)`, `destroy()`.
`this.wait(초)`, `this.invoke(fn, 초)`, `this.repeat(fn, 간격)`도 있다(Timer, 컴포넌트가 없어지면 취소).

## Transform

- 월드: `position`, `rotation`(라디안), `scale`, `setPosition(x, y)`
- 로컬: `localPosition`, `localRotation`, `localScale`, `setLocalPosition(x, y)`, `setLocalScale(x, y)`
- `translate(v)`, `rotate(r)`, `transformPoint(v)`, `inverseTransformPoint(v)`, `transformDirection(v)`
- `parent`, `children`, `setParent(t, worldPositionStays = true)`, `find(name)`
- 행렬: `localMatrix`, `worldMatrix`, `inverseWorldMatrix` (바뀐 것만 다시 계산)

## EventBus

```js
Events.on("enemy.killed", (e) => score += e.points, { owner: this, priority: 0 });
Events.emit("enemy.killed", { points: 10 });
const off = Events.on("x", fn); off();
```

- 전역 버스 `Events`. 따로 필요하면 `new EventBus(name)`.
- `on(event, fn, { owner, priority, once })` → 해제 함수, `once(...)`, `off(event, fn?)`, `offOwner(owner)`, `emit(event, data)` → 부른 수, `has(event)`, `count(event)`, `clear()`
- `priority`가 큰 것부터 부른다(같으면 등록 순서). `owner`(GameObject/Component)가 파괴되거나 떼어지면 자동 해제.
- 듣는 쪽 에러는 콘솔에 찍고 다음 듣는 쪽은 계속 부른다. `EventBus.debug = true`면 emit마다 로그.
- 동기 호출이다. 가끔 일어나는 일(처치, 턴 끝, 줍기)을 알리는 데 쓰고, 매 프레임 도는 일에는 쓰지 않는다.

## 그리기

### Renderer (상속용)
`sortingLayer`(`'Background' | 'Default' | 'Foreground' | 'UI'`), `orderInLayer`, `ySort`, `visible`, `opacity`.
덮어쓰기: `getBounds(out)` → `{minX, minY, maxX, maxY}`(월드, 컬링용, 못 구하면 null), `render(ctx, camera)`.
월드 렌더러는 `camera.viewMatrix`로 `ctx.setTransform`해서 그린다.

### SpriteRenderer
```js
new SpriteRenderer(Resource.image("tiles"), { region: { x: 0, y: 0, width: 16, height: 16 }, pivot: { x: 0.5, y: 0.5 },
    pixelsPerUnit: 1, flipX: false, sortingLayer: "Default", orderInLayer: 0, ySort: false, opacity: 1 });
```
`setSprite(img, region?)`, `setRegion(x, y, w, h)`, `setPivot(x, y)`, `worldWidth`, `worldHeight`.

### Camera
`Camera.main`(자동), `setPixelZoom(level)`(월드 1유닛 = 화면 px level개), `setBaseView(w, h)`, `zoom`, `effectiveZoom`,
`viewWidth`/`viewHeight`(월드), `screenToWorld(x, y)`, `worldToScreen(v)`, `isInView(minX, minY, maxX, maxY)`, `viewMatrix`.
**흔들기**: `camera.shake(세기 px = 3, 초 = 0.25)`, `isShaking`, 전체 끄기 `Camera.shakeEnabled = false`.

### CameraFollow
`new CameraFollow({ target: transform, smoothing: 12, follow: true, bounds: {minX, minY, maxX, maxY} })`, `snap()`, `pan(dx, dy)`.

### RenderPipeline
`engine.renderer`. 통계: `drawCalls`, `visibleCount`, `culledCount`. `sortingLayers` 배열을 바꿔 레이어를 늘릴 수 있다.
정렬: 레이어 → `orderInLayer` → (`ySort`면) 월드 Y 큰 것 먼저.

## UI

```js
const go = App.createUI("panel");
const rt = go.getComponent(RectTransform);
rt.setAnchor(1, 0, 1, 0).setPivot(1, 0).setSizeAndPosition(120, 40, -8, 8);   // 오른쪽 위에서 8,8 안쪽
go.addComponent(new UIRect({ color: "#222", borderColor: "#aa8", borderWidth: 1 }));
const label = rt.createChild("label");
label.addComponent(new UIText("안녕", { fontSize: 12, align: "left" }));
go.addComponent(new UIButton({ onTap: () => ... }));
```

- **RectTransform**: 앵커(부모 기준 0~1, 왼쪽 위가 0,0), `setOffsets(l, t, r, b)`(늘이기), `setSizeAndPosition(w, h, x, y)`(고정 크기), `setSize`, `setPivot`,
  `createChild(name)`, `rect`(device px), `containsPoint(x, y)`(포인터 CSS px), **`alpha`**(그룹 투명도, 자손 UI에 곱해진다), `worldAlpha`, **`sortOrder`**(최상위 UI의 그리는 순서. 큰 값이 위에 그려지고 먼저 눌린다. 같으면 만든 순서).
- 단위: 오프셋·크기는 기준 해상도 단위 × `uiRoot.scale`. `uiScaleMode: 'constant'`면 1단위 = `uiScale` px.
- **UIRect**(`color`, `borderColor`, `borderWidth`), **UIImage**(`sprite`, `region`), **UIText**(`fontSize`, `color`, `align`, `verticalAlign`, `wrap`, `setText`)
- **UIButton**(`onTap`, `onPress`, `onRelease`, `action`: 누르는 동안 Input 가상 버튼), **UIElement**(포인터 받기: `onPointerDown/Up`, `onClick`, `onDrag`)
- **UIScrollView**(`content`, `contentHeight`, `scrollTo`, 끌기·휠·관성), **UIMask**(자손을 이 사각형으로 자르고 클릭도 막음)
- `UIEventSystem.raycast(x, y)` → 그 자리 맨 위 UI 요소(없으면 null). 월드 입력 전에 UI 위인지 확인할 때.

## Input

- 버튼: `Input.defineButton("jump", ["Space"])`, `getButton / getButtonDown / getButtonUp(name)`, `hasButton(name)`
- 축: `defineAxis("moveX", [음], [양])`, `getAxis(name)`, `getVector()` (기본 WASD/방향키 `moveX`·`moveY`, `confirm`, `cancel`)
- 키: `getKey / getKeyDown / getKeyUp(code)`
- 포인터: `pointers`, `pointer`, `pointerPosition`(CSS px), `getPointerDown(button)`, `pointerWorld(camera)`, `wheel`, `dragThreshold`.
  포인터 객체: `position`, `startPosition`, `delta`, `pressed`, `released`, `held`, `dragDistance`, `consume()`
- 가상 입력(화면 버튼): `setVirtualButton(name, pressed)`, `setVirtualAxis(name, v)`

## Time

`Time.deltaTime`(초, `timeScale` 적용, 최대 `maxDeltaTime`), `unscaledDeltaTime`, `time`, `timeScale`(0이면 일시정지), `fps`, `frameCount`.

## Resource / Load

```js
await Load.Images([["hero", "hero.png"], ...]);   // Load.assetBasePath 기준
Resource.image("hero");
await Load.Scripts(["a.js", "b.js"]);               // Load.basePath 기준, 실패하면 멈춤
```

## Matrix

2D 아핀 `{a, b, c, d, e, f}`. `Matrix.multiply(a, b, out)`, `Matrix.invert(m, out)`, `transformPoint(v)`, `compose`, `decompose`. 정적 함수는 out에 쓴다.

## Config (`config.js`)

`viewWidth`/`viewHeight`(기준 해상도), `pixelPerfect`, `pixelsPerUnit`, `uiScaleMode`, `uiScale`, `fontSize`, `fontFamily`,
`debug`(디버그 표시를 처음부터 켤지. 개발 중 true, 배포할 때 false).

## Tween · Ease · Timer

엔진이 `Tween`을 늘 시스템으로 등록해서 매 프레임 GameObject `update` 전에 값을 움직인다. 시간은 `Time.deltaTime`(timeScale 영향)을 쓰고, `unscaled: true`면 무시한다.

### Tween

```js
Tween.to(obj, { x: 10, alpha: 0 }, 0.3, { ease: "outQuad", onComplete: () => ... });
Tween.from(obj, { alpha: 0 }, 0.2);                     // 이 값에서 지금 값으로
Tween.value(0, 100, 1, (v, k) => bar.width = v);        // 숫자 하나 (setter나 계산에)
Tween.move(transform, x, y, 0.2, { ease: "outCubic" }); // 월드 위치
Tween.delay(1, () => ...);
Tween.killTweensOf(obj, complete = false);
Tween.isTweening(obj); Tween.count;
```

옵션: `ease`(함수 또는 이름), `delay`, `repeat`(추가 반복 수, `Infinity` 가능), `yoyo`, `unscaled`, `owner`(GameObject/Component, 없어지면 멈춤),
`onStart(target)`, `onUpdate(k, target)`, `onRepeat(target)`, `onComplete(target)`.

돌려받는 핸들: `stop(complete = false)`, `then(fn)`(끝나면, 체이닝), `finished`.

- 시작 값은 지연이 끝나는 순간에 읽는다.
- 숫자 속성만 움직인다. 위치처럼 setter를 불러야 하는 건 `Tween.value`나 `Tween.move`.
- UI 창 전체를 나타나게: `Tween.to(rt, { alpha: 1 }, 0.12)` (`RectTransform.alpha`는 자손에 곱해진다).

### Ease

`linear`, `inQuad`, `outQuad`, `inOutQuad`, `inCubic`, `outCubic`, `inOutCubic`, `inSine`, `outSine`, `inOutSine`, `inBack`, `outBack`, `outElastic`, `outBounce`, `pingPong`(0→1→0).
직접 써도 된다: `Ease.outCubic(t)`.

### Timer

```js
await Timer.wait(0.5);                          // async 함수 안에서
const h = Timer.invoke(() => boom(), 1.2);      // h.stop()으로 취소
Timer.repeat((i) => tick(i), 0.25, { count: 4, immediate: false });
// 컴포넌트 안 (owner 자동):
await this.wait(1);  this.invoke(fn, 2);  this.repeat(fn, 0.5);
```

- 모두 Tween 위에서 돌아서 `Time.timeScale`을 따른다(0이면 멈춘다). 옵션 `unscaled`, `owner`.
- owner가 없어져서 취소된 `wait`는 끝나지 않는다(그 뒤 코드가 실행되지 않음).

## ParticleSystem

작은 네모 입자 수백~수천 개를 GameObject 없이 컴포넌트 하나가 다룬다. 미리 잡아 둔 배열에 넣어서 매 프레임 할당이 없고, 같은 색끼리 몰아 그린다.

```js
const ps = worldObject.addComponent(new ParticleSystem({ capacity: 1024, sortingLayer: "Foreground" }));
ps.emit(x, y, {
  count: 12,
  colors: ["#6a4", "#383"],     // 또는 ParticleSystem.paletteFromImage(img, region, 4)
  speed: [20, 60],              // 숫자 또는 [최소, 최대]
  angle: Math.PI / 2,           // 기본 위쪽 (월드 Y-up)
  spread: Math.PI * 1.2,        // 기본 2π = 사방
  area: 3,                      // 뿌리는 반경
  life: [0.3, 0.6],             // 초
  size: [1, 2],                 // 월드 px
  gravity: -300,                // 아래로 당기려면 음수
  drag: 1.5,                    // 초당 감속 비율
  fade: true                    // 수명 끝 40%에서 흐려짐
});
ps.count; ps.clear();
```

- 생성 옵션: `capacity`(가득 차면 아무거나 하나 밀어낸다), `sortingLayer`, `orderInLayer`, `pixelSnap`, `unscaled`.
- `ParticleSystem.paletteFromImage(image, region?, max = 5)`: 그림에서 많이 쓰인 색 몇 개를 뽑는다(외곽선처럼 아주 어두운 색은 다른 색이 있으면 뺀다). 결과는 캐시.
- 컬링용 바운드는 살아 있는 입자들로 매 프레임 계산한다.

## SpriteAnimator

스프라이트 시트를 잘라 만든 클립을 재생해서, 같은 오브젝트의 `SpriteRenderer` 그림(region)을 바꾼다.

```js
const walk = AnimationClip.fromGrid("walk_down", "hero", {
  frameWidth: 16, frameHeight: 16, row: 0, start: 0, count: 4,
  fps: 8, loop: true, events: { 1: "step", 3: "step" }   // 프레임 번호: 이벤트 이름
});
const idle = new AnimationClip("idle", { image: "hero", frames: [{ x: 0, y: 16, width: 16, height: 16 }], fps: 1 });

go.addComponent(new SpriteRenderer(Resource.image("hero")));
const anim = go.addComponent(new SpriteAnimator([walk, idle], { play: "idle", speed: 1 }));
anim.play("walk_down");                  // 같은 클립이면 이어서, { restart: true }면 처음부터, { speed }
anim.events.on("step", (e) => ...);     // e: { animator, clip, frame }
anim.events.on("finish", () => ...);    // loop: false 클립이 끝났을 때
anim.stop(); anim.resume(); anim.setFrame(2);
anim.clip; anim.frame; anim.isPlaying; anim.speed;
```

- 시간은 `Time.deltaTime`(timeScale 영향). 생성 옵션 `unscaled: true`면 무시.
- 프레임이 여러 개 건너뛰어도 그 사이 프레임 이벤트를 다 부른다(느린 기기에서 발소리 누락 방지).
- `events`는 그 애니메이터 전용 `EventBus`라서 `owner`, `priority`도 쓸 수 있다.

## Debug

화면 구석에 FPS, 엔진 프레임 시간, 그린 개수·렌더러 수·컬링 수, 오브젝트 수, 트윈 수와 게임이 넣은 값을 보여 준다.
엔진이 시스템으로 등록하고, 화면을 다 그린 뒤 맨 위에 그린다.

```js
Config.debug = true;             // config.js: 처음부터 켜기 (개발 중 true)
Debug.enabled = false;           // 코드로 끄기. 실행 중에는 F3 (Input 버튼 "debug")
Debug.set("턴", turn);           // 게임 값 한 줄 (같은 이름이면 덮어씀)
Debug.remove("턴");
Debug.showBounds = true;         // 월드 렌더러의 컬링 사각형 그리기
Debug.corner = "top-right";      // top-left | top-right | bottom-left | bottom-right
Debug.offset = { x: 8, y: 64 };  // 구석에서 띄울 거리 (CSS px)
Debug.opacity = 0.5;             // 표시 창 투명도 0~1 (배경·글자 모두, 기본 1)
```

- 꺼져 있으면 비용이 거의 없다. 게임 값은 `if (Debug.enabled)` 안에서 넣으면 계산도 아낀다.
- 오브젝트 수는 30프레임에 한 번만 센다.

## Physics (2D 충돌) — `physics/Physics.js`
모든 모양을 "둥근 상자"(중심·회전·반폭 hx,hy·모서리 반지름 rr) 하나로 다뤄서 원/상자/캡슐/둥근 상자의 이동·질의가 같은 수식으로 정확하다. 질의·이동은 객체를 만들지 않는다(결과는 넘겨준 배열/객체에 채움). 광역 탐색은 32px 격자.

```js
Physics.layer('Wall'); Physics.maskOf('Wall', 'Obstacle');          // 레이어 이름 → 비트 (31개까지)
Physics.setCollision('Hero', 'Wall', false);                         // 레이어 매트릭스 (기본 전부 충돌)
go.addComponent(Collider2D.circle(6, { layer: 'Hero', body: 'kinematic', data: owner }));
Collider2D.box(w, h, opts) · .capsule(길이, r, opts) · .rbox(w, h, 모서리r, opts)   // 회전은 transform.rotation
// opts: layer, mask(부딪힐 레이어), isTrigger, body('static'|'kinematic'|'dynamic'), offsetX/Y, data
col.active = false;          // 질의·충돌에서 빠짐 (등장 연출·죽음 등)
col.sync();                  // 위치를 직접 바꾼 직후 격자 갱신 — transform.setPosition 은 자동으로 해 준다

Physics.moveCircle(x, y, r, dx, dy, mask, out, selfCollider)  // 막히면 미끄러지며 이동, 터널링 없음. out.x/y/hit/nx/ny/collider
Physics.castCircle(x, y, r, dx, dy, mask, out, filter, ctx)   // 쏘아서 처음 맞는 것. out.t(0~1)/x/y/nx/ny/collider
Physics.raycast(x, y, dx, dy, mask, out)
Physics.overlapCircle(x, y, r, mask, arr) → 개수              // arr[0..n-1] = Collider2D (arr.length도 n)
Physics.overlapBox(minX, minY, maxX, maxY, mask, arr)
Physics.overlapSector(x, y, 반지름, 방향, 반각, mask, arr)    // 부채꼴(근접 휘두르기) — 모양과 정확히 교차
Physics.overlapCapsule(ax, ay, bx, by, 반폭, mask, arr)       // 굵은 선(레이저·찌르기)
Physics.pointQuery(x, y, r, mask, filter)                     // 가장 가까운 겹침 하나
```
- `Rigidbody2D`: 속도 `vx,vy`·`drag`·`bounce`. `type:'dynamic'`이면 고정 콜라이더에 스윕으로 막히고 반발한다.
- 이벤트: 컴포넌트에 `onTriggerEnter/Stay/Exit(other)` · `onCollisionEnter/Stay/Exit(other)` 를 만들면 그 콜라이더만 프레임 끝에 판정한다(없으면 비용 0).
- 질의 중 피해 처리로 같은 질의가 다시 불릴 수 있으면(연쇄 폭발 등) 결과 배열을 호출마다 새로 만들어 쓴다.
- `Debug.showColliders = true` + `Debug.enabled`: 충돌 모양을 초록(고정)·노랑(움직임)·하늘(트리거)로 그린다. 게임은 `?debug`로 켠다.
- 컴포넌트에 `onAttach()` 훅이 생겼다(붙은 직후, 엔진에 올라가기 전에도 호출).

## World2D (강체 물리) — `physics/World2D.js`, `physics/Controllers.js`, `vendor/planck.min.js`
planck.js(Box2D) 기반. 파티 게임(플랫포머·탑다운·물리 난장판)용이고 던전이 쓰는 `Physics`와는 **별개로 공존**한다. 선택 이유·비교는 `docs/ENGINE_REVIEW.md`, 데모는 `docs/physics-demo.html`.
- 단위: 월드 단위(Y-up). planck는 미터라서 `world.scale`(기본 32 = 1m)로 변환한다 → 32×32 상자 `density 1` = 질량 1. 속도·힘·중력은 전부 **게임 단위**로 넣고 읽는다.
- 한 프레임: `GameObject.update`(컨트롤러가 속도 지정) → `World2D.postUpdate`(고정 1/60 스텝 + Transform 보간 동기화) → `lateUpdate`(카메라) → 렌더. Engine에 `postUpdate` 시스템 훅이 생겼다.

```js
const world = World2D.create(App, { mode: 'platformer', gravity: 1400 });   // mode 'topdown'이면 중력 0, 몸체 기본 감쇠 4
// opts: gravity(숫자=아래로 N | {x,y}), scale(32), fixedStep(1/60), maxSubsteps(3), velocityIterations(8), positionIterations(3),
//       interpolate(true), allowSleep(true), adaptive(true: 느린 기기에서 1/30 스텝으로 자동 전환), budgetMs(9), debug(false)
world.layer('Player');            // 충돌 분류 이름 → 비트 (최대 16, 'Default'=1). world.bits('A'|['A','B']|'all'|숫자)
world.setGravity(0, -900); world.paused = true; world.debug = true;   // 디버그: 물리 도형 윤곽
world.step(dt)                    // 고정 스텝을 직접 한 번 (테스트·결정적 재생)
world.destroy()                   // 씬 전환 때. 이 월드의 몸체는 모두 비활성
```
### Body2D (컴포넌트)
```js
go.addComponent(new Body2D({ type: 'dynamic'|'static'|'kinematic', shape: 'box', w: 32, h: 32,   // box | circle(radius) | capsule(w,h) | polygon(points) | edge(x1,y1,x2,y2) | chain(points,loop)
  density: 1, friction: 0.4, restitution: 0, category: 'Player', mask: ['Ground','Item'] /* 'all' */, group: 0, sensor: false,
  fixedRotation: false, linearDamping, angularDamping, gravityScale: 1, bullet: false /* 빠른 탄은 true */, allowSleep: true,
  oneWay: true,            // 한쪽 통과 발판(위에서만 밟힘, 'static'/'kinematic' 박스에)
  drive: 'transform'|'velocity',   // kinematic: Transform을 움직여 구동(기본, 위에 탄 몸체가 같이 실려 감) / body.setVelocity로 구동
  fixtures: [ { shape, w,h,radius,points, x,y(오프셋), angle, sensor, tag:'foot', density, friction, restitution, category, mask, group, oneWay, color } ],  // 여러 도형
  preSolve: true, postSolve: true,   // onPreSolve/onPostSolve 콜백을 받으려면
}));
// 충돌 분류: 서로 `(A.mask & B.category) && (B.mask & A.category)`일 때만 충돌. 같은 음수 group이면 서로 무시(래그돌).
```
- 읽기/쓰기(게임 단위): `x, y`(물리상 위치) · `angle` · `vx, vy`(대입 가능) · `setVelocity(x,y)` · `addVelocity` · `angularVelocity` · `applyForce(fx,fy)`(매 스텝) · `applyImpulse(ix,iy[,atX,atY])` · `applyTorque(t)` · `mass` · `gravityScale` · `linearDamping` · `fixedRotation` · `sleeping/wake()` · `setType(t)` · `setPosition(x,y[,angle])`(순간이동, Transform도 같이) · `syncFromTransform()`(정적 몸체를 코드로 옮겼을 때) · `addFixture(def)` · `getFixture(tag)` · `forEachContact(fn)` · `isTouching(other)`. 도형 크기 `hw, hh`(센서 제외, 반폭/반높이).
- **Transform ↔ 몸체**: dynamic·velocity-구동 kinematic은 물리가 Transform을 쓴다(보간됨). `transform.setPosition`으로 옮기면 안 되고 `body.setPosition`을 쓴다. 킨메틱 `drive:'transform'`은 반대로 Transform이 기준.
- **접촉 콜백**: 같은 GameObject의 아무 컴포넌트에 `onBeginContact(info)`·`onEndContact(info)`·`onPreSolve(info)`·`onPostSolve(info)`를 만들면 불린다 (컴포넌트를 나중에 붙였다면 `body.refreshCallbacks()`). `info`는 **공유 객체**(콜백 안에서만 유효): `self, other(Body2D), selfObject, otherObject, selfTag, otherTag, sensor, normalX/Y(self→other), pointX/Y, impulse(postSolve), disable()`(preSolve 안에서 이번 접촉을 끈다). 센서는 막지 않고 begin/end만 낸다. **콜백 안에서 GameObject를 파괴해도 안전**하다(몸체 삭제는 스텝 뒤로 미룸). 생성 옵션 `onBegin/onEnd/onPreSolve/onPostSolve`(함수)로도 받을 수 있다.
- **질의**(전부 게임 단위, 몸체 `ignore`·레이어 `mask`·`sensors` 지원):
  `world.raycast(x1,y1,x2,y2, {mask, ignore, sensors})` → 공유 객체 `{hit, body, tag, x,y, nx,ny, fraction, distance}` (가장 가까운 것) · `world.raycastAll(x1,y1,x2,y2, outArray, opts)` → 개수 · `world.queryAABB(minX,minY,maxX,maxY, outArray, mask)` · `world.queryPoint(x,y,outArray,mask)` · `world.overlapCircle(x,y,r,outArray,mask)` → 개수 (outArray = Body2D 목록, 정확한 도형 판정)
### 조인트 (`Joint2D` 반환: `destroy()`, `setMotor(speed,maxTorque|null)`, `setLimits(lo,hi)`, `setTarget(x,y)`, `setLength(len)`, `angle`)
`world.revolute(a,b,x,y,{limit:[최소,최대(rad)], motor:{speed,maxTorque}, collide})` · `world.weld(a,b,x,y,{frequency,damping})` · `world.distance(a,b,ax,ay,bx,by,{length,frequency,damping})` · `world.rope(a,b,maxLength[,ax,ay,bx,by])` · `world.prismatic(a,b,x,y,axisX,axisY,{limit:[min,max],motor:{speed,maxForce}})` · `world.wheel(a,b,x,y,axisX,axisY,{frequency,damping,motor})` · `world.mouse(body,x,y,{maxForce})`(잡아끌기, `setTarget`). 몸체는 Body2D(또는 planck 몸체), 점은 월드 좌표. 연결된 두 몸체는 기본적으로 서로 충돌하지 않는다(`collide:true`로 켬). **조인트는 두 몸체가 실제로 만들어진 뒤**(추가한 다음 프레임부터) 걸 것.
### 컨트롤러 (Body2D와 같은 GameObject에)
- `PlatformerController({runSpeed:170, accel:1700, decel:2300, airAccel:1100, airDecel:450, jumpSpeed:430, jumpCut:0.45, fallGravity:1.5, maxFall:650, coyote:0.1, buffer:0.12, extraJumps:0, wallSlide:false, wallSlideSpeed:70, wallJump:[230,400]|null, wallLock:0.16, dropThrough:true, dropTime:0.28})` — 매 프레임 `pc.setInput(moveX(-1..1), jumpHeld, downHeld)`. 읽기: `grounded, groundBody, wall(-1/0/1), facing, jumping`. 콜백: `pc.onJump / onLand(낙하속도) / onWallJump`. 몸체는 **가운데 기준 대칭**(캡슐 권장). 마찰은 0, 회전은 고정으로 자동 설정. 이동 발판 위에서는 발판 속도 기준으로 움직인다. `아래 + 점프`로 한쪽 통과 발판 아래로 내려간다.
- `TopDownController({maxSpeed:150, accel:1600, friction:1900, dashSpeed:380, dashTime:0.14, dashCooldown:0.55})` — `tc.setInput(x,y)`, `tc.dash([dx,dy])`(쿨다운 중이면 false). 읽기: `dashing, facing(rad), moving, dashCd`. 콜백 `tc.onDash`.
- 컨트롤러 입력은 키보드든 폰 스틱이든 상관없다 — 미니게임이 매 프레임 `setInput`만 부르면 된다.
### BodyRenderer (프로토타입 그리기)
`go.addComponent(new BodyRenderer({ fill:'#4fc3f7', stroke:'#1c232b', lineWidth:1, layer:'Default', order:0 }))` — Body2D 도형을 색칠해서 그린다(도형별 `color`가 우선). `flash = 0.1`이면 흰색으로 번쩍인다.
### 쓰는 순서 / 주의
1. `Engine` 만든 뒤 `World2D.create(App, …)`로 월드를 하나 만든다(`World2D.current`가 기본 월드). 씬을 바꿀 때는 오브젝트를 지운 뒤 `world.destroy()`하고 새로 만든다.
2. GameObject에 `Body2D`(+`BodyRenderer`)를 붙인다. 몸체는 `awake`에서 만들어지므로 **붙인 직후 같은 프레임에는 `body.body`가 없다**(`x`/`y`는 Transform 값을 돌려준다).
3. 성능: 활성 몸체 ~60개까지는 CPU 4배 느림에서도 60fps. 쌓아 둔 몸체는 잠들게 두고(`allowSleep`), 빠른 탄만 `bullet:true`로. 느리면 월드가 자동으로 1/30초 스텝으로 내려간다(`world.degraded`).
4. planck를 직접 만지고 싶으면 `body.body`(planck Body), `world.world`(planck World). 가능하면 위 래퍼만 쓴다(나중에 다른 엔진으로 바꿀 수 있게).
