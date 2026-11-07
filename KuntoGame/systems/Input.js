class Pointer {
  constructor(id) {
    this.id = id;
    this.type = 'mouse';
    this.button = 0;
    this.isPrimary = false;
    this.position = new Vector();
    this.previous = new Vector();
    this.delta = new Vector();
    this.startPosition = new Vector();
    this.held = false;
    this.pressed = false;
    this.released = false;
    this.consumed = false;
    this._queuedPress = false;
    this._queuedRelease = false;
  }

  get dragDistance() { return this.position.distance(this.startPosition); }
  get isDragging() { return this.held && this.dragDistance > 0; }

  worldPosition(camera) { return camera.screenToWorld(this.position.x, this.position.y); }

  consume() { this.consumed = true; return this; }
}

class Input {
  // 설정
  static enabled = true;
  static dragThreshold = 6;

  // 연결 상태
  static _engine = null;
  static _canvas = null;
  static _pixelRatio = 1;
  static get pixelRatio() { return Input._pixelRatio; } // 포인터 좌표(CSS px) -> 캔버스 device px 배율
  static _rect = null;

  // 키보드
  static _held = new Set();
  static _keysDown = new Set();
  static _keysUp = new Set();
  static _queuedDown = new Set();
  static _queuedUp = new Set();
  static _preventKeys = new Set();

  // 액션 맵
  static _buttons = new Map();
  static _axes = new Map();

  // 가상 입력(터치 UI)
  static _virtualAxes = new Map();
  static _virtualHeld = new Set();
  static _virtualDown = new Set();
  static _virtualUp = new Set();
  static _queuedVirtualDown = new Set();
  static _queuedVirtualUp = new Set();

  // 포인터
  static _pointers = new Map();

  // 휠
  static wheel = 0;
  static _queuedWheel = 0;

  // Engine.addSystem(Input)이 호출
  static attach(engine) {
    Input._engine = engine;
    Input._canvas = engine.canvas;
    Input._pixelRatio = engine.pixelRatio;

    const c = Input._canvas;
    if (c.style) c.style.touchAction = 'none';

    c.addEventListener('pointerdown', Input._onPointerDown);
    c.addEventListener('pointermove', Input._onPointerMove);
    c.addEventListener('pointerup', Input._onPointerUp);
    c.addEventListener('pointercancel', Input._onPointerUp);
    c.addEventListener('wheel', Input._onWheel, { passive: false });
    c.addEventListener('contextmenu', Input._onContextMenu);

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', Input._onKeyDown);
      window.addEventListener('keyup', Input._onKeyUp);
      window.addEventListener('blur', Input._onBlur);
    }
  }

  static detach() {
    const c = Input._canvas;
    if (c) {
      c.removeEventListener('pointerdown', Input._onPointerDown);
      c.removeEventListener('pointermove', Input._onPointerMove);
      c.removeEventListener('pointerup', Input._onPointerUp);
      c.removeEventListener('pointercancel', Input._onPointerUp);
      c.removeEventListener('wheel', Input._onWheel);
      c.removeEventListener('contextmenu', Input._onContextMenu);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', Input._onKeyDown);
      window.removeEventListener('keyup', Input._onKeyUp);
      window.removeEventListener('blur', Input._onBlur);
    }
    Input._engine = null;
    Input._canvas = null;
  }

  // 액션 맵 정의
  static defineButton(name, codes) {
    const list = Array.isArray(codes) ? codes : [codes];
    Input._buttons.set(name, list);
    for (const c of list) Input._preventKeys.add(c);
    return Input;
  }

  static defineAxis(name, negative, positive) {
    const neg = Array.isArray(negative) ? negative : [negative];
    const pos = Array.isArray(positive) ? positive : [positive];
    Input._axes.set(name, { neg, pos });
    for (const c of neg) Input._preventKeys.add(c);
    for (const c of pos) Input._preventKeys.add(c);
    return Input;
  }

  static hasButton(name) {
    return Input._buttons.has(name);
  }

  static useDefaultBindings() {
    Input.defineAxis('moveX', ['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    Input.defineAxis('moveY', ['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    Input.defineButton('confirm', ['Space', 'Enter', 'KeyE']);
    Input.defineButton('cancel', ['Escape', 'KeyQ']);
    return Input;
  }

  // 키보드 폴링
  static getKey(code) { return Input.enabled && Input._held.has(code); }
  static getKeyDown(code) { return Input.enabled && Input._keysDown.has(code); }
  static getKeyUp(code) { return Input.enabled && Input._keysUp.has(code); }
  static get anyKey() { return Input.enabled && Input._held.size > 0; }
  static get anyKeyDown() { return Input.enabled && Input._keysDown.size > 0; }

  // 버튼/축 (액션 맵 + 가상 입력 통합)
  static getButton(name) {
    if (!Input.enabled) return false;
    if (Input._virtualHeld.has(name)) return true;
    const codes = Input._buttons.get(name);
    return codes ? codes.some((c) => Input._held.has(c)) : false;
  }

  static getButtonDown(name) {
    if (!Input.enabled) return false;
    if (Input._virtualDown.has(name)) return true;
    const codes = Input._buttons.get(name);
    return codes ? codes.some((c) => Input._keysDown.has(c)) : false;
  }

  static getButtonUp(name) {
    if (!Input.enabled) return false;
    if (Input._virtualUp.has(name)) return true;
    const codes = Input._buttons.get(name);
    return codes ? codes.some((c) => Input._keysUp.has(c)) : false;
  }

  static getAxis(name) {
    if (!Input.enabled) return 0;
    let value = 0;
    const def = Input._axes.get(name);
    if (def) {
      if (def.pos.some((c) => Input._held.has(c))) value += 1;
      if (def.neg.some((c) => Input._held.has(c))) value -= 1;
    }
    const virtual = Input._virtualAxes.get(name);
    if (virtual !== undefined) value += virtual;
    return value < -1 ? -1 : value > 1 ? 1 : value;
  }

  static getVector(xAxis = 'moveX', yAxis = 'moveY', normalize = true) {
    const v = new Vector(Input.getAxis(xAxis), Input.getAxis(yAxis));
    return normalize && v.sqrLength > 1 ? v.normalize() : v;
  }

  // 가상 입력 (터치 UI가 여기로 값을 밀어넣음)
  static setVirtualAxis(name, value) {
    if (value === 0) Input._virtualAxes.delete(name);
    else Input._virtualAxes.set(name, value < -1 ? -1 : value > 1 ? 1 : value);
    return Input;
  }

  static setVirtualButton(name, pressed) {
    const was = Input._virtualHeld.has(name);
    if (pressed && !was) {
      Input._virtualHeld.add(name);
      Input._queuedVirtualDown.add(name);
    } else if (!pressed && was) {
      Input._virtualHeld.delete(name);
      Input._queuedVirtualUp.add(name);
    }
    return Input;
  }

  static clearVirtual() {
    for (const name of [...Input._virtualHeld]) Input.setVirtualButton(name, false);
    Input._virtualAxes.clear();
    return Input;
  }

  // 포인터 조회
  static get pointers() { return [...Input._pointers.values()]; }

  static get pointerCount() {
    let n = 0;
    for (const p of Input._pointers.values()) if (p.held) n++;
    return n;
  }

  static get pointer() {
    for (const p of Input._pointers.values()) if (p.isPrimary) return p;
    for (const p of Input._pointers.values()) return p;
    return null;
  }

  static get pointerPosition() {
    const p = Input.pointer;
    return p ? p.position.clone() : new Vector();
  }

  static getPointer(id) { return Input._pointers.get(id) ?? null; }

  static pointerWorld(camera) {
    const p = Input.pointer;
    return p ? p.worldPosition(camera) : new Vector();
  }

  static getPointerDown(button = 0, includeConsumed = false) {
    if (!Input.enabled) return false;
    for (const p of Input._pointers.values()) {
      if (p.pressed && p.button === button && (includeConsumed || !p.consumed)) return true;
    }
    return false;
  }

  static getPointerUp(button = 0, includeConsumed = false) {
    if (!Input.enabled) return false;
    for (const p of Input._pointers.values()) {
      if (p.released && p.button === button && (includeConsumed || !p.consumed)) return true;
    }
    return false;
  }

  static getPointerHeld(button = 0, includeConsumed = false) {
    if (!Input.enabled) return false;
    for (const p of Input._pointers.values()) {
      if (p.held && p.button === button && (includeConsumed || !p.consumed)) return true;
    }
    return false;
  }

  // Engine이 매 프레임 호출: 큐를 확정 상태로 넘김
  static update() {
    Input._rect = null;
    Input._pixelRatio = Input._engine ? Input._engine.pixelRatio : 1;

    for (const [id, p] of Input._pointers) {
      if (p.released && !p.held) Input._pointers.delete(id);
    }

    for (const p of Input._pointers.values()) {
      p.pressed = p._queuedPress;
      p.released = p._queuedRelease;
      p._queuedPress = false;
      p._queuedRelease = false;
      p.delta.x = p.position.x - p.previous.x;
      p.delta.y = p.position.y - p.previous.y;
      p.previous.x = p.position.x;
      p.previous.y = p.position.y;
      p.consumed = false;
    }

    inputSwapSets(Input, '_keysDown', '_queuedDown');
    inputSwapSets(Input, '_keysUp', '_queuedUp');
    inputSwapSets(Input, '_virtualDown', '_queuedVirtualDown');
    inputSwapSets(Input, '_virtualUp', '_queuedVirtualUp');

    Input.wheel = Input._queuedWheel;
    Input._queuedWheel = 0;
  }

  // 좌표 변환: clientX/Y -> 캔버스 픽셀
  static _toCanvas(clientX, clientY, out) {
    const canvas = Input._canvas;
    if (!canvas) {
      out.x = clientX;
      out.y = clientY;
      return out;
    }
    if (!Input._rect) {
      Input._rect = canvas.getBoundingClientRect
        ? canvas.getBoundingClientRect()
        : { left: 0, top: 0, width: canvas.width, height: canvas.height };
    }
    const r = Input._rect;
    const sx = r.width > 0 ? canvas.width / r.width / Input._pixelRatio : 1;
    const sy = r.height > 0 ? canvas.height / r.height / Input._pixelRatio : 1;
    out.x = (clientX - r.left) * sx;
    out.y = (clientY - r.top) * sy;
    return out;
  }

  // DOM 이벤트 핸들러
  static _onPointerDown(e) {
    let p = Input._pointers.get(e.pointerId);
    if (!p) {
      p = new Pointer(e.pointerId);
      Input._pointers.set(e.pointerId, p);
    }
    p.type = e.pointerType ?? 'mouse';
    p.button = e.button ?? 0;
    p.isPrimary = e.isPrimary ?? true;
    Input._toCanvas(e.clientX, e.clientY, p.position);
    p.previous.x = p.position.x;
    p.previous.y = p.position.y;
    p.startPosition.x = p.position.x;
    p.startPosition.y = p.position.y;
    p.held = true;
    p._queuedPress = true;
    p._queuedRelease = false;

    if (Input._canvas && Input._canvas.setPointerCapture) {
      try {
        Input._canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
    }
    if (e.preventDefault) e.preventDefault();
  }

  static _onPointerMove(e) {
    const p = Input._pointers.get(e.pointerId);
    if (p) {
      Input._toCanvas(e.clientX, e.clientY, p.position);
      return;
    }
    if (e.pointerType === 'mouse') {
      const hover = new Pointer(e.pointerId);
      hover.type = 'mouse';
      hover.isPrimary = e.isPrimary ?? true;
      Input._toCanvas(e.clientX, e.clientY, hover.position);
      hover.previous.x = hover.position.x;
      hover.previous.y = hover.position.y;
      Input._pointers.set(e.pointerId, hover);
    }
  }

  static _onPointerUp(e) {
    const p = Input._pointers.get(e.pointerId);
    if (!p) return;
    Input._toCanvas(e.clientX, e.clientY, p.position);
    p.held = false;
    p._queuedRelease = true;
    if (Input._canvas && Input._canvas.releasePointerCapture) {
      try {
        Input._canvas.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  }

  static _onKeyDown(e) {
    if (inputIsTextTarget(e.target)) return;
    if (Input._preventKeys.has(e.code) && e.preventDefault) e.preventDefault();
    if (e.repeat || Input._held.has(e.code)) return;
    Input._held.add(e.code);
    Input._queuedDown.add(e.code);
  }

  static _onKeyUp(e) {
    if (inputIsTextTarget(e.target)) return;
    if (!Input._held.has(e.code)) return;
    Input._held.delete(e.code);
    Input._queuedUp.add(e.code);
  }

  static _onWheel(e) {
    Input._queuedWheel += e.deltaY;
    if (e.preventDefault) e.preventDefault();
  }

  static _onContextMenu(e) {
    if (e.preventDefault) e.preventDefault();
  }

  static _onBlur() {
    for (const code of Input._held) Input._queuedUp.add(code);
    Input._held.clear();
    for (const p of Input._pointers.values()) {
      if (p.held) {
        p.held = false;
        p._queuedRelease = true;
      }
    }
    Input.clearVirtual();
  }
}

// update()에서 이번 프레임/다음 프레임 큐를 교체하는 헬퍼
function inputSwapSets(target, current, queued) {
  const tmp = target[current];
  target[current] = target[queued];
  target[queued] = tmp;
  tmp.clear();
}

function inputIsTextTarget(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
}