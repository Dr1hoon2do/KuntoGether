// 이징 함수: t(0~1) -> 진행도. Tween의 ease 옵션에 함수나 이름('outQuad')으로 넣는다.
class Ease {
  static linear(t) { return t; }

  static inQuad(t) { return t * t; }
  static outQuad(t) { return t * (2 - t); }
  static inOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }

  static inCubic(t) { return t * t * t; }
  static outCubic(t) { const u = 1 - t; return 1 - u * u * u; }
  static inOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - 4 * (1 - t) * (1 - t) * (1 - t); }

  static inSine(t) { return 1 - Math.cos(t * Math.PI / 2); }
  static outSine(t) { return Math.sin(t * Math.PI / 2); }
  static inOutSine(t) { return (1 - Math.cos(Math.PI * t)) / 2; }

  static inBack(t) { const s = 1.70158; return t * t * ((s + 1) * t - s); }
  static outBack(t) { const s = 1.70158; const u = t - 1; return u * u * ((s + 1) * u + s) + 1; }

  static outElastic(t) {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
  }

  static outBounce(t) {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
    if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
    t -= 2.625 / d;
    return n * t * t + 0.984375;
  }

  // 0 -> 1 -> 0 (찔렀다 돌아오기, 깜빡임 등)
  static pingPong(t) { return Math.sin(Math.PI * t); }

  // 이름이나 함수를 함수로
  static get(ease) {
    if (typeof ease === 'function') return ease;
    if (typeof ease === 'string' && typeof Ease[ease] === 'function') return Ease[ease];
    return Ease.linear;
  }
}

// Tween 하나. Tween.to / Tween.value 등이 돌려준다.
//   const h = Tween.to(obj, { x: 10, alpha: 0 }, 0.3, { ease: 'outQuad', onComplete: () => ... });
//   h.stop();          // 그 자리에서 멈춤
//   h.stop(true);      // 끝 값으로 맞추고 onComplete까지 부르고 멈춤
class TweenHandle {
  constructor(target, props, duration, options) {
    this.target = target;
    this.props = props;             // { 이름: 끝 값 }  (Tween.value면 null)
    this.duration = Math.max(0, duration);
    this.ease = Ease.get(options.ease);
    this.delay = options.delay ?? 0;
    this.repeat = options.repeat ?? 0;   // 추가 반복 횟수 (Infinity 가능)
    this.yoyo = options.yoyo ?? false;   // 반복할 때 거꾸로
    this.unscaled = options.unscaled ?? false; // Time.timeScale 무시 (일시정지 메뉴 UI 등)
    this.owner = options.owner ?? null;  // GameObject 또는 Component: 파괴되면 같이 멈춘다
    this.onStart = options.onStart ?? null;
    this.onUpdate = options.onUpdate ?? null;     // (진행도 k, target)
    this.onComplete = options.onComplete ?? null;
    this.onRepeat = options.onRepeat ?? null;      // 반복 한 바퀴가 끝날 때마다

    this.elapsed = 0;
    this.started = false;
    this.finished = false;
    this._from = null;
    this._keys = props ? Object.keys(props) : null;
    this._reverse = false;
    this._fromOverride = options.from ?? null; // Tween.from 용
  }

  // 시작 값은 지연이 끝나는 순간에 읽는다 (그 사이 바뀐 값에서 이어지게)
  _begin() {
    this.started = true;
    if (this._keys) {
      this._from = {};
      for (const k of this._keys) {
        this._from[k] = this._fromOverride && k in this._fromOverride ? this._fromOverride[k] : this.target[k];
      }
    }
    if (this.onStart) this.onStart(this.target);
  }

  _apply(k) {
    if (this._keys) {
      const t = this.target;
      for (const key of this._keys) {
        const a = this._from[key];
        t[key] = a + (this.props[key] - a) * k;
      }
    }
    if (this.onUpdate) this.onUpdate(k, this.target);
  }

  // 프레임 진행. 끝나면 true
  _step(dt) {
    if (this.finished) return true;
    if (this.owner && EventBus._ownerGone(this.owner)) {
      this.finished = true;
      return true;
    }
    if (this.delay > 0) {
      this.delay -= dt;
      if (this.delay > 0) return false;
      dt = -this.delay;
      this.delay = 0;
    }
    if (!this.started) this._begin();

    this.elapsed += dt;
    const d = this.duration;
    let t = d > 0 ? Math.min(this.elapsed / d, 1) : 1;
    this._apply(this.ease(this._reverse ? 1 - t : t));
    if (t < 1) return false;

    if (this.repeat > 0) {
      this.repeat--;
      this.elapsed = d > 0 ? this.elapsed - d : 0;
      if (this.yoyo) this._reverse = !this._reverse;
      if (this.onRepeat) this.onRepeat(this.target);
      return false;
    }
    this.finished = true;
    if (this.onComplete) this.onComplete(this.target);
    return true;
  }

  stop(complete = false) {
    if (this.finished) return this;
    if (complete) {
      if (!this.started) this._begin();
      this._apply(this.ease(this.yoyo && this._reverse ? 0 : 1));
      this.finished = true;
      if (this.onComplete) this.onComplete(this.target);
    }
    this.finished = true;
    return this;
  }

  // 끝나면 부를 함수 추가 (체이닝)
  then(fn) {
    const prev = this.onComplete;
    this.onComplete = prev ? (t) => { prev(t); fn(t); } : fn;
    return this;
  }
}

// 트윈 시스템. Engine이 기본으로 등록해서 매 프레임 update()를 부른다 (GameObject update 전).
// 숫자 속성을 시간에 따라 바꾼다. 매 프레임 할당 없이 목록 하나를 돈다.
class Tween {
  static _list = [];

  static attach(engine) {}
  static detach() { Tween._list.length = 0; }

  static update() {
    const list = Tween._list;
    if (list.length === 0) return;
    const dt = Time.deltaTime;
    const udt = Time.unscaledDeltaTime;
    let w = 0;
    // 도는 중에 새로 추가된 것은 다음 프레임부터 (길이를 미리 잡는다)
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const h = list[i];
      if (!h._step(h.unscaled ? udt : dt)) list[w++] = h;
    }
    // 도는 중에 추가된 것들을 앞으로 당긴다
    for (let i = n; i < list.length; i++) list[w++] = list[i];
    list.length = w;
  }

  static _add(h) {
    Tween._list.push(h);
    return h;
  }

  // target의 숫자 속성들을 지금 값 -> props 값으로
  static to(target, props, duration, options = {}) {
    return Tween._add(new TweenHandle(target, props, duration, options));
  }

  // fromProps 값에서 지금 값으로 (지금 값이 끝 값)
  static from(target, fromProps, duration, options = {}) {
    const to = {};
    for (const k of Object.keys(fromProps)) {
      to[k] = target[k];
      target[k] = fromProps[k];
    }
    return Tween._add(new TweenHandle(target, to, duration, { ...options, from: fromProps }));
  }

  // 숫자 하나: onUpdate(값, 진행도)로 받는다. 속성이 아닌 것(setter 함수, 위치 등)을 움직일 때
  static value(from, to, duration, onUpdate, options = {}) {
    const h = new TweenHandle(null, null, duration, options);
    const ease = h.ease;
    h.ease = Ease.linear; // 진행도를 직접 받아서 이징한다
    h.onUpdate = (t) => {
      const k = ease(t);
      onUpdate(from + (to - from) * k, k);
    };
    return Tween._add(h);
  }

  // Transform 이동 (월드 좌표)
  static move(transform, x, y, duration, options = {}) {
    let sx = 0, sy = 0;
    const h = Tween.value(0, 1, duration, (k) => transform.setPosition(sx + (x - sx) * k, sy + (y - sy) * k), options);
    const onStart = h.onStart;
    h.onStart = (t) => {
      const p = transform.position;
      sx = p.x;
      sy = p.y;
      if (onStart) onStart(t);
    };
    if (!h.owner) h.owner = transform.gameObject;
    return h;
  }

  // seconds 뒤에 fn
  static delay(seconds, fn, options = {}) {
    return Tween.value(0, 1, 0, () => {}, { ...options, delay: seconds, onComplete: fn });
  }

  // target에 걸린 트윈 모두 멈춤 (complete면 끝 값으로)
  static killTweensOf(target, complete = false) {
    for (const h of Tween._list) if (h.target === target && !h.finished) h.stop(complete);
  }

  static isTweening(target) {
    return Tween._list.some((h) => h.target === target && !h.finished);
  }

  static get count() {
    return Tween._list.length;
  }
}
