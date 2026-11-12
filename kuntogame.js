// KuntoGame 묶음 파일 (자동 생성: tools/build_kuntogame.py). 직접 고치지 말고 KuntoGame/ 원본을 고친 뒤 다시 빌드한다.

/* ---- core/Load.js ---- */
class Load {
  static basePath = '';
  // 파일 주소 뒤에 붙는 버전 (?v=). 배포할 때마다 바뀌어서 브라우저가 옛 파일을 캐시로 쓰지 않는다. 비어 있으면 안 붙인다
  static version = '';
  static assetBasePath = '';
  static _loaded = new Set();
  static _pending = new Map();
  static _pendingImages = new Map();

  static _versioned(url) {
    return Load.version ? url + (url.includes('?') ? '&' : '?') + 'v=' + Load.version : url;
  }

  static Script(src) {
    const full = Load._resolve(src, Load.basePath);

    if (Load._loaded.has(full)) return Promise.resolve();

    const pending = Load._pending.get(full);
    if (pending) return pending;

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = Load._versioned(full);

      script.onload = () => {
        script.remove();
        Load._loaded.add(full);
        Load._pending.delete(full);
        resolve();
      };

      script.onerror = () => {
        script.remove();
        Load._pending.delete(full);
        reject(new Error(`Load.Script: failed to load "${full}"`));
      };

      document.head.appendChild(script);
    });

    Load._pending.set(full, promise);
    return promise;
  }

  // 순서대로 불러오다가 하나라도 실패하면 바로 멈춘다 (fail-fast).
  // 계속 진행하면 엉뚱한 파일에서 'X is not defined'가 터져서 원인을 찾기 어렵다.
  static async Scripts(paths) {
    for (const path of paths) {
      try {
        await Load.Script(path);
      } catch (err) {
        console.error(err.message);
        throw err;
      }
    }
  }

  static Image(key, path) {
    if (Resource.hasImage(key)) return Promise.resolve(Resource.image(key));

    const pending = Load._pendingImages.get(key);
    if (pending) return pending;

    const full = Load._resolve(path, Load.assetBasePath);

    const promise = new Promise((resolve, reject) => {
      const img = new Image();

      const finish = () => {
        Load._pendingImages.delete(key);
        Resource.setImage(key, img);
        resolve(img);
      };

      img.onload = () => {
        if (typeof img.decode === 'function') img.decode().then(finish, finish);
        else finish();
      };

      img.onerror = () => {
        Load._pendingImages.delete(key);
        reject(new Error(`Load.Image: failed to load "${key}" from "${full}"`));
      };

      img.src = Load._versioned(full);
    });

    Load._pendingImages.set(key, promise);
    return promise;
  }

  static async Images(entries) {
    for (const [key, path] of entries) {
      try {
        await Load.Image(key, path);
      } catch (err) {
        console.error(err.message);
      }
    }
  }

  static _resolve(path, base) {
    if (!base) return path;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//') || path.startsWith('/')) return path;
    const b = base.endsWith('/') ? base : base + '/';
    return b + path;
  }
}

/* ---- config.js ---- */
const Config = {
  // 카메라 / 화면 기준 (16:9)
  viewWidth: 320,
  viewHeight: 180,
  pixelPerfect: true,

  // 스프라이트: 원본 이미지 몇 픽셀 = 월드 1유닛
  pixelsPerUnit: 1,

  // UI 배율: 'fit'(기준 해상도에 맞춤) 또는 'constant'(화면 픽셀 고정, 모바일용)
  uiScaleMode: 'constant',
  uiScale: 1,

  // 디버그 표시 (FPS, 그린 개수, 오브젝트 수 …). 실행 중에는 F3으로 켜고 끈다. 배포할 때 false
  debug: true,

  fontSize: 12,
  fontFamily: 'monospace'
};

/* ---- math/Vector.js ---- */
class Vector {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  static get zero() { return VEC_ZERO; }
  static get one() { return VEC_ONE; }
  static get up() { return VEC_UP; }
  static get down() { return VEC_DOWN; }
  static get left() { return VEC_LEFT; }
  static get right() { return VEC_RIGHT; }

  static from(obj) {
    return new Vector(obj.x, obj.y);
  }

  static fromAngle(radians, length = 1) {
    return new Vector(Math.cos(radians) * length, Math.sin(radians) * length);
  }

  clone() {
    return new Vector(this.x, this.y);
  }

  add(v) {
    return new Vector(this.x + v.x, this.y + v.y);
  }

  sub(v) {
    return new Vector(this.x - v.x, this.y - v.y);
  }

  scale(s) {
    return new Vector(this.x * s, this.y * s);
  }

  mul(v) {
    return new Vector(this.x * v.x, this.y * v.y);
  }

  div(v) {
    return new Vector(v.x === 0 ? 0 : this.x / v.x, v.y === 0 ? 0 : this.y / v.y);
  }

  neg() {
    return new Vector(-this.x, -this.y);
  }

  get length() {
    return Math.hypot(this.x, this.y);
  }

  get sqrLength() {
    return this.x * this.x + this.y * this.y;
  }

  normalize() {
    const len = this.length;
    if (len === 0) return new Vector(0, 0);
    return new Vector(this.x / len, this.y / len);
  }

  withLength(length) {
    return this.normalize().scale(length);
  }

  clampLength(max) {
    return this.sqrLength > max * max ? this.withLength(max) : this.clone();
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  cross(v) {
    return this.x * v.y - this.y * v.x;
  }

  distance(v) {
    return Math.hypot(this.x - v.x, this.y - v.y);
  }

  sqrDistance(v) {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return dx * dx + dy * dy;
  }

  get angle() {
    return Math.atan2(this.y, this.x);
  }

  rotate(radians) {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    return new Vector(this.x * c - this.y * s, this.x * s + this.y * c);
  }

  perp() {
    return new Vector(-this.y, this.x);
  }

  lerp(v, t) {
    const k = t < 0 ? 0 : t > 1 ? 1 : t;
    return new Vector(this.x + (v.x - this.x) * k, this.y + (v.y - this.y) * k);
  }

  equals(v, epsilon = 1e-6) {
    return Math.abs(this.x - v.x) <= epsilon && Math.abs(this.y - v.y) <= epsilon;
  }

  round() {
    return new Vector(Math.round(this.x), Math.round(this.y));
  }

  toString() {
    return `Vector(${this.x}, ${this.y})`;
  }

  toJSON() {
    return { x: this.x, y: this.y };
  }

  static add(a, b, out) {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
    return out;
  }

  static sub(a, b, out) {
    out.x = a.x - b.x;
    out.y = a.y - b.y;
    return out;
  }

  static scale(v, s, out) {
    out.x = v.x * s;
    out.y = v.y * s;
    return out;
  }

  static copy(v, out) {
    out.x = v.x;
    out.y = v.y;
    return out;
  }

  static set(x, y, out) {
    out.x = x;
    out.y = y;
    return out;
  }

  static lerp(a, b, t, out) {
    const k = t < 0 ? 0 : t > 1 ? 1 : t;
    out.x = a.x + (b.x - a.x) * k;
    out.y = a.y + (b.y - a.y) * k;
    return out;
  }
}

const VEC_ZERO = Object.freeze(new Vector(0, 0));
const VEC_ONE = Object.freeze(new Vector(1, 1));
const VEC_UP = Object.freeze(new Vector(0, 1));
const VEC_DOWN = Object.freeze(new Vector(0, -1));
const VEC_LEFT = Object.freeze(new Vector(-1, 0));
const VEC_RIGHT = Object.freeze(new Vector(1, 0));

/* ---- math/Matrix.js ---- */
class Matrix {
  constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
  }

  static identity() {
    return new Matrix();
  }

  static compose(position, rotation, scale) {
    return Matrix.composeInto(position, rotation, scale, new Matrix());
  }

  static composeInto(position, rotation, scale, out) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    out.a = cos * scale.x;
    out.b = sin * scale.x;
    out.c = -sin * scale.y;
    out.d = cos * scale.y;
    out.e = position.x;
    out.f = position.y;
    return out;
  }

  clone() {
    return new Matrix(this.a, this.b, this.c, this.d, this.e, this.f);
  }

  multiply(m) {
    return Matrix.multiply(this, m, new Matrix());
  }

  static multiply(a, b, out) {
    const a0 = a.a, b0 = a.b, c0 = a.c, d0 = a.d, e0 = a.e, f0 = a.f;
    const a1 = b.a, b1 = b.b, c1 = b.c, d1 = b.d, e1 = b.e, f1 = b.f;

    out.a = a0 * a1 + c0 * b1;
    out.b = b0 * a1 + d0 * b1;
    out.c = a0 * c1 + c0 * d1;
    out.d = b0 * c1 + d0 * d1;
    out.e = a0 * e1 + c0 * f1 + e0;
    out.f = b0 * e1 + d0 * f1 + f0;
    return out;
  }

  get determinant() {
    return this.a * this.d - this.b * this.c;
  }

  invert() {
    return Matrix.invert(this, new Matrix());
  }

  static invert(m, out) {
    const det = m.a * m.d - m.b * m.c;
    if (det === 0) return null;

    const { a, b, c, d, e, f } = m;
    out.a = d / det;
    out.b = -b / det;
    out.c = -c / det;
    out.d = a / det;
    out.e = (c * f - d * e) / det;
    out.f = (b * e - a * f) / det;
    return out;
  }

  transformPoint(v) {
    return new Vector(
      this.a * v.x + this.c * v.y + this.e,
      this.b * v.x + this.d * v.y + this.f
    );
  }

  static transformPoint(m, v, out) {
    const x = v.x;
    const y = v.y;
    out.x = m.a * x + m.c * y + m.e;
    out.y = m.b * x + m.d * y + m.f;
    return out;
  }

  transformVector(v) {
    return new Vector(
      this.a * v.x + this.c * v.y,
      this.b * v.x + this.d * v.y
    );
  }

  static transformVector(m, v, out) {
    const x = v.x;
    const y = v.y;
    out.x = m.a * x + m.c * y;
    out.y = m.b * x + m.d * y;
    return out;
  }

  getPosition() {
    return new Vector(this.e, this.f);
  }

  getRotation() {
    return Math.atan2(this.b, this.a);
  }

  getScale() {
    const sx = Math.hypot(this.a, this.b);
    const sy = Math.hypot(this.c, this.d);
    return new Vector(this.determinant < 0 ? -sx : sx, sy);
  }

  decompose() {
    return {
      position: this.getPosition(),
      rotation: this.getRotation(),
      scale: this.getScale(),
    };
  }

  static set(a, b, c, d, e, f, out) {
    out.a = a; out.b = b; out.c = c;
    out.d = d; out.e = e; out.f = f;
    return out;
  }

  static copy(m, out) {
    out.a = m.a; out.b = m.b; out.c = m.c;
    out.d = m.d; out.e = m.e; out.f = m.f;
    return out;
  }

  static setIdentity(out) {
    out.a = 1; out.b = 0; out.c = 0;
    out.d = 1; out.e = 0; out.f = 0;
    return out;
  }

  equals(m, epsilon = 1e-6) {
    return (
      Math.abs(this.a - m.a) <= epsilon &&
      Math.abs(this.b - m.b) <= epsilon &&
      Math.abs(this.c - m.c) <= epsilon &&
      Math.abs(this.d - m.d) <= epsilon &&
      Math.abs(this.e - m.e) <= epsilon &&
      Math.abs(this.f - m.f) <= epsilon
    );
  }

  toString() {
    return `Matrix(a=${this.a}, b=${this.b}, c=${this.c}, d=${this.d}, e=${this.e}, f=${this.f})`;
  }
}

/* ---- core/EventBus.js ---- */
// 이벤트 버스: 오브젝트끼리 서로를 직접 알지 않고 "무슨 일이 일어났다"를 알리고 듣는다.
//
//   Events.on("enemy.killed", (e) => score += e.points, { owner: this });   // 듣기 (owner가 파괴되면 저절로 해제)
//   Events.emit("enemy.killed", { points: 10 });                            // 알리기
//   const off = Events.on("x", fn); off();                                   // 반환값을 부르면 해제
//
// - 전역 버스 Events 하나를 기본으로 쓰고, 필요하면 new EventBus()로 따로 만든다 (예: 오브젝트 하나 안의 신호).
// - priority: 큰 것부터 부른다 (같으면 등록한 순서). 기본 0.
// - once: 한 번 부르면 해제.
// - owner: GameObject 또는 Component. 파괴되면(GameObject.isDestroyed, Component의 gameObject가 null) 다음 emit 때 자동 해제.
// - 듣는 쪽에서 에러가 나도 다른 듣는 쪽은 계속 불린다 (에러는 콘솔에).
// - emit은 그 자리에서 바로(동기로) 부른다. 매 프레임 도는 처리보다는 "가끔 일어나는 일"을 알리는 데 쓴다.
// - EventBus.debug = true면 emit마다 콘솔에 이벤트 이름과 받은 수를 찍는다.
class EventBus {
  static debug = false;

  constructor(name = 'EventBus') {
    this.name = name;
    this._map = new Map(); // 이름 -> [{ fn, owner, priority, once, seq }]
    this._seq = 0;
  }

  on(event, fn, options = {}) {
    const list = this._map.get(event) ?? [];
    const entry = { fn, owner: options.owner ?? null, priority: options.priority ?? 0, once: !!options.once, seq: this._seq++ };
    // 우선순위 큰 것 앞, 같으면 먼저 등록한 것 앞 (삽입 정렬)
    let i = list.length;
    while (i > 0 && list[i - 1].priority < entry.priority) i--;
    list.splice(i, 0, entry);
    this._map.set(event, list);
    return () => this._remove(event, entry);
  }

  once(event, fn, options = {}) {
    return this.on(event, fn, { ...options, once: true });
  }

  // fn을 주면 그 함수만, 안 주면 그 이벤트 전부 해제
  off(event, fn = null) {
    const list = this._map.get(event);
    if (!list) return this;
    if (!fn) this._map.delete(event);
    else {
      const left = list.filter((e) => e.fn !== fn);
      if (left.length) this._map.set(event, left);
      else this._map.delete(event);
    }
    return this;
  }

  // owner가 등록한 것 전부 해제
  offOwner(owner) {
    for (const [event, list] of this._map) {
      const left = list.filter((e) => e.owner !== owner);
      if (left.length) this._map.set(event, left);
      else this._map.delete(event);
    }
    return this;
  }

  // 알리기. 부른 듣는 쪽 수를 돌려준다
  emit(event, data) {
    const list = this._map.get(event);
    if (!list || list.length === 0) {
      if (EventBus.debug) console.log(`[${this.name}] ${event} → 0`);
      return 0;
    }
    // 부르는 중에 on/off가 일어나도 안전하게 (지금 목록을 복사해서 돈다)
    const snapshot = list.slice();
    let called = 0;
    for (const entry of snapshot) {
      if (entry.removed) continue;
      if (EventBus._ownerGone(entry.owner)) {
        this._remove(event, entry);
        continue;
      }
      if (entry.once) this._remove(event, entry);
      called++;
      try {
        entry.fn(data, event);
      } catch (err) {
        console.error(`[${this.name}] "${event}" 듣는 쪽에서 에러:`, err);
      }
    }
    if (EventBus.debug) console.log(`[${this.name}] ${event} → ${called}`, data);
    return called;
  }

  has(event) {
    const list = this._map.get(event);
    return !!list && list.length > 0;
  }

  count(event) {
    return this._map.get(event)?.length ?? 0;
  }

  clear() {
    this._map.clear();
    return this;
  }

  _remove(event, entry) {
    entry.removed = true;
    const list = this._map.get(event);
    if (!list) return;
    const i = list.indexOf(entry);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) this._map.delete(event);
  }

  static _ownerGone(owner) {
    if (!owner) return false;
    if (typeof GameObject !== 'undefined' && owner instanceof GameObject) return owner.isDestroyed;
    if (typeof Component !== 'undefined' && owner instanceof Component) return owner._detached === true || (owner.gameObject !== null && owner.gameObject.isDestroyed);
    return false;
  }
}

// 전역 버스
const Events = new EventBus('Events');


/* ---- core/Component.js ---- */
class Component {
  constructor() {
    // identity
    this._gameObject = null;
    this._enabled = true;

    // lifecycle
    this._awoken = false;
    this._started = false;
    this._enabledCalled = false;
  }

  // identity getter/setter
  get gameObject() { return this._gameObject; }
  get enabled() { return this._enabled; }
  set enabled(value) {
    if (this._enabled === value) return;
    this._enabled = value;
    if (this._gameObject) this._gameObject._refreshComponents();
  }

  get isActiveAndEnabled() { return this.enabled && this.gameObject.activeInHierarchy; }

  // gameObject 위임
  get transform() { return this._gameObject.transform; }
  get name() { return this._gameObject.name; }
  getComponent(Type) { return this.gameObject.getComponent(Type); }
  getComponents(Type) { return this.gameObject.getComponents(Type); }
  addComponent(component) { return this.gameObject.addComponent(component); }
  destroy() { this.gameObject.removeComponent(this); }

  // override
  onAttach() {}
  awake() {}
  onEnable() {}
  start() {}
  update(deltaTime) {}
  lateUpdate(deltaTime) {}
  onDisable() {}
  onDestroy() {}
}

/* ---- core/Transform.js ---- */
// transform.position.x = 10 처럼 받은 벡터의 x/y를 바꾸면 바로 transform에 반영되는 벡터.
// 읽을 때는 그 순간의 값(복사본)이다. clone()/add() 등이 만드는 새 벡터는 평범한 Vector라 연결이 끊긴다.
class TransformVector extends Vector {
  constructor(x, y, owner, apply) {
    super();
    this._x = x;
    this._y = y;
    this._owner = owner;
    this._apply = apply;
  }

  get x() { return this._x; }
  set x(v) { this._x = v; if (this._owner) this._apply(this._owner, v, this._y); }
  get y() { return this._y; }
  set y(v) { this._y = v; if (this._owner) this._apply(this._owner, this._x, v); }

  static applyPosition(t, x, y) { t.setPosition(x, y); }
  static applyLocalPosition(t, x, y) { t.setLocalPosition(x, y); }
  static applyLocalScale(t, x, y) { t.setLocalScale(x, y); }
  static applyScale(t, x, y) { t.scale = new Vector(x, y); }
}

class Transform extends Component {
  constructor() {
    super();
    this._awoken = true;
    this._started = true;

    // local 값
    this._localPosition = new Vector(0, 0);
    this._localRotation = 0;
    this._localScale = new Vector(1, 1);

    // 계층
    this.parent = null;
    this.children = [];

    // 행렬 캐시
    this._local = new Matrix();
    this._world = new Matrix();
    this._inverse = new Matrix();
    this._localDirty = true;
    this._worldDirty = true;
    this._inverseDirty = true;
  }

  // local getter/setter
  get localPosition() { return new TransformVector(this._localPosition.x, this._localPosition.y, this, TransformVector.applyLocalPosition); }
  set localPosition(v) { this._localPosition = new Vector(v.x, v.y); this._markDirty(); }

  get localRotation() { return this._localRotation; }
  set localRotation(radians) { this._localRotation = radians; this._markDirty(); }

  get localScale() { return new TransformVector(this._localScale.x, this._localScale.y, this, TransformVector.applyLocalScale); }
  set localScale(v) { this._localScale = new Vector(v.x, v.y); this._markDirty(); }

  setLocalPosition(x, y) {
    this._localPosition.x = x;
    this._localPosition.y = y;
    this._markDirty();
    const c = this._gameObject && this._gameObject._collider; if (c) c.sync(); // 물리 콜라이더가 있으면 격자도 바로 따라간다 (질의가 항상 최신 위치를 본다)
    return this;
  }

  setLocalScale(x, y = x) {
    this._localScale.x = x;
    this._localScale.y = y;
    this._markDirty();
    return this;
  }

  // world getter/setter
  get position() {
    const m = this.worldMatrix;
    return new TransformVector(m.e, m.f, this, TransformVector.applyPosition);
  }

  set position(v) {
    if (!this.parent) {
      this.setLocalPosition(v.x, v.y);
      return;
    }
    const local = this.parent.inverseWorldMatrix.transformPoint(v);
    this.setLocalPosition(local.x, local.y);
  }

  setPosition(x, y) {
    if (!this.parent) return this.setLocalPosition(x, y);
    const local = this.parent.inverseWorldMatrix.transformPoint(new Vector(x, y));
    return this.setLocalPosition(local.x, local.y);
  }

  get rotation() {
    return this.worldMatrix.getRotation();
  }

  set rotation(radians) {
    this.localRotation = this.parent ? radians - this.parent.rotation : radians;
  }

  get scale() {
    const s = this.worldMatrix.getScale();
    return new TransformVector(s.x, s.y, this, TransformVector.applyScale);
  }

  set scale(v) {
    if (!this.parent) {
      this.setLocalScale(v.x, v.y);
      return;
    }
    const p = this.parent.scale;
    this.setLocalScale(p.x === 0 ? 0 : v.x / p.x, p.y === 0 ? 0 : v.y / p.y);
  }

  // 행렬 (dirty 캐시)
  get localMatrix() {
    if (this._localDirty) {
      Matrix.composeInto(this._localPosition, this._localRotation, this._localScale, this._local);
      this._localDirty = false;
    }
    return this._local;
  }

  get worldMatrix() {
    if (this._worldDirty) {
      if (this.parent) {
        Matrix.multiply(this.parent.worldMatrix, this.localMatrix, this._world);
      } else {
        Matrix.copy(this.localMatrix, this._world);
      }
      this._worldDirty = false;
    }
    return this._world;
  }

  get inverseWorldMatrix() {
    if (this._inverseDirty) {
      if (!Matrix.invert(this.worldMatrix, this._inverse)) Matrix.setIdentity(this._inverse);
      this._inverseDirty = false;
    }
    return this._inverse;
  }

  // 이동/회전 헬퍼
  translate(v) {
    return this.setLocalPosition(this._localPosition.x + v.x, this._localPosition.y + v.y);
  }

  rotate(radians) {
    this.localRotation = this._localRotation + radians;
    return this;
  }

  // 좌표 변환
  transformPoint(v) {
    return this.worldMatrix.transformPoint(v);
  }

  transformDirection(v) {
    return this.worldMatrix.transformVector(v);
  }

  inverseTransformPoint(v) {
    return this.inverseWorldMatrix.transformPoint(v);
  }

  inverseTransformDirection(v) {
    return this.inverseWorldMatrix.transformVector(v);
  }

  // 계층
  setParent(parent, worldPositionStays = true) {
    if (parent === this.parent) return this;

    const go = this._gameObject;
    const engine = go ? go.engine : null; // 옮기기 전에 속해 있던 엔진

    const world = worldPositionStays ? this.worldMatrix.clone() : null;

    if (this.parent) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
    }

    this.parent = parent;
    if (parent) parent.children.push(this);

    if (world) {
      const target = parent ? Matrix.multiply(parent.inverseWorldMatrix, world, new Matrix()) : world;
      const d = target.decompose();
      this._localPosition = d.position;
      this._localRotation = d.rotation;
      this._localScale = d.scale;
    }

    this._markDirty();

    if (go) {
      // 엔진 루트 목록 동기화: 자식이 되면 루트에서 빠지고, 부모를 떼면(null) 다시 루트가 된다.
      // (안 하면 engine.create로 만든 걸 addChild했을 때 update·렌더가 두 번 돈다)
      if (engine) {
        if (parent) engine.remove(go);
        else engine.add(go);
      }
      // 새 부모 밑에서 awake/onEnable 상태를 다시 맞춘다 (다음 프레임)
      if (parent) GameObject._queueAwake(go);
    }
    return this;
  }

  find(name) {
    for (const c of this.children) {
      if (c.gameObject && c.gameObject.name === name) return c;
    }
    for (const c of this.children) {
      const found = c.find(name);
      if (found) return found;
    }
    return null;
  }

  // internal
  _markDirty() {
    this._localDirty = true;
    this._markWorldDirty();
  }

  _markWorldDirty() {
    if (this._worldDirty) return;
    this._worldDirty = true;
    this._inverseDirty = true;
    for (const c of this.children) c._markWorldDirty();
  }
}

/* ---- core/GameObject.js ---- */
class GameObject {
  // 생명주기 큐: 엔진이 매 프레임 트리 전체를 돌지 않고, 새로 붙었거나 상태가 바뀐 것만 처리한다
  static _awakeQueue = [];   // awake가 필요할 수 있는 GameObject (엔진에 붙거나 부모가 바뀐 것)
  static _startQueue = [];   // onEnable은 됐는데 start가 아직인 Component
  static _destroyQueue = []; // destroy()로 표시된 GameObject

  static _queueAwake(go) { GameObject._awakeQueue.push(go); }
  static _queueStart(c) { GameObject._startQueue.push(c); }

  // 배열을 돌다가 콜백 안에서 배열이 바뀌었을 때(제거/삽입) 현재 항목의 새 위치를 찾는다.
  // 매 프레임 [...배열] 복사를 안 하려고 쓴다.
  static _resync(arr, item, i) {
    const j = arr.indexOf(item);
    return j >= 0 ? j : i - 1;
  }

  constructor(name = 'GameObject') {
    // identity
    this._name = name;
    this._tags = [];
    this._transform = new Transform();
    this._transform._gameObject = this;
    this._components = [this._transform];

    // active state
    this._active = true;

    // lifecycle
    this._awoken = false;
    this._started = false;
    this._destroyed = false;

    // 이 오브젝트가 루트로 올라가 있는 엔진 (자식이면 null, engine 게터로 루트까지 올라가서 찾는다)
    this._engine = null;
  }

  // 속한 엔진. 루트까지 올라가서 그 루트가 엔진에 붙어 있으면 그 엔진, 아니면 null
  get engine() {
    let go = this;
    while (go._transform.parent) go = go._transform.parent._gameObject;
    return go._engine;
  }

  // identity getter/setter
  get name() { return this._name; }
  set name(v) { this._name = v; }
  get tags() { return this._tags; }
  get transform() { return this._transform; }
  get components() { return this._components; }

  
  get position() { return this._transform.position; }
  set position(v) { this._transform.position = v; }
  
  // active state
  get isActive() { return this._active; }
  get isDestroyed() { return this._destroyed; }

  get activeInHierarchy() {
    if (!this._active || this._destroyed) return false;
    const parent = this.transform.parent;
    return parent ? parent.gameObject.activeInHierarchy : true;
  }

  setActive(value) {
    if (this._active === value) return this;
    const before = this.activeInHierarchy;
    this._active = value;
    if (before !== this.activeInHierarchy) this._refreshHierarchy();
    return this;
  }

  // component management
  addComponent(component) {
    component._gameObject = this;
    this._components.push(component);
    component.onAttach(); // 붙은 직후 (awake보다 먼저, 엔진에 올라가기 전에도 호출됨)

    if (this._awoken && !this._destroyed) {
      component._awoken = true;
      component.awake();
      if (this.activeInHierarchy && component.enabled) {
        component._enabledCalled = true;
        component.onEnable();
        if (!component._started) GameObject._queueStart(component);
      }
    }
    return component;
  }

  getComponent(Type) {
    return this.components.find((c) => c instanceof Type) ?? null;
  }

  getComponents(Type) {
    return this.components.filter((c) => c instanceof Type);
  }

  removeComponent(component) {
    const i = this._components.indexOf(component);
    if (i < 0) return false;

    this._components.splice(i, 1);
    if (component._enabledCalled) component.onDisable();
    if (component._awoken) component.onDestroy();
    component._gameObject = null;
    component._detached = true; // 떼어낸 컴포넌트 (owner로 건 트윈·이벤트가 멈춘다)
    return true;
  }

  // hierarchy
  get parent() {
    const p = this.transform.parent;
    return p ? p.gameObject : null;
  }

  addChild(gameObject) {
    gameObject.transform.setParent(this.transform);
    return gameObject;
  }

  find(name) {
    const t = this.transform.find(name);
    return t ? t.gameObject : null;
  }

  // destroy
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    GameObject._destroyQueue.push(this);
    for (const child of [...this.transform.children]) child.gameObject.destroy();
  }

  _destroyImmediate() {
    for (const child of [...this.transform.children]) child.gameObject._destroyImmediate();

    for (const c of [...this._components]) {
      if (c._enabledCalled) c.onDisable();
    }
    for (const c of [...this._components]) {
      if (c._awoken) c.onDestroy();
    }

    if (this.transform.parent) {
      const i = this.transform.parent.children.indexOf(this.transform);
      if (i >= 0) this.transform.parent.children.splice(i, 1);
    }
    this.transform.parent = null;

    this._components.length = 0;
  }

  // internal: onEnable/onDisable 재계산
  _refreshComponents() {
    const active = this.activeInHierarchy;
    for (const c of [...this._components]) {
      const should = active && c.enabled && c._awoken;
      if (should && !c._enabledCalled) {
        c._enabledCalled = true;
        c.onEnable();
        if (!c._started) GameObject._queueStart(c);
      } else if (!should && c._enabledCalled) {
        c._enabledCalled = false;
        c.onDisable();
      }
    }
  }

  _refreshHierarchy() {
    this._refreshComponents();
    for (const child of [...this.transform.children]) child.gameObject._refreshHierarchy();
  }

  // lifecycle pass
  _awakePass() {
    if (this._destroyed) return;
    this._awoken = true;
    for (const c of [...this._components]) {
      if (!c._awoken) {
        c._awoken = true;
        c.awake();
      }
    }
    this._refreshComponents();
    // 엔진 밖에 있을 때 켜져서 start 큐에서 버려졌던 컴포넌트를 다시 넣는다
    for (const c of this._components) {
      if (c._enabledCalled && !c._started) GameObject._queueStart(c);
    }
    for (const child of [...this.transform.children]) child.gameObject._awakePass();
  }

  _startPass() {
    if (this._destroyed) return;
    for (const c of [...this._components]) {
      if (!c._started && c._enabledCalled) {
        c._started = true;
        c.start();
      }
    }
    for (const child of [...this.transform.children]) child.gameObject._startPass();
  }

  // update/lateUpdate: 매 프레임 도는 곳이라 배열을 복사하지 않고 돈다 (중간에 바뀌면 _resync로 위치를 다시 잡는다)
  _updatePass(deltaTime) {
    if (this._destroyed || !this._active) return;
    const comps = this._components;
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i];
      if (c._started && c.enabled) c.update(deltaTime);
      if (comps[i] !== c) i = GameObject._resync(comps, c, i);
    }
    const kids = this._transform.children;
    for (let i = 0; i < kids.length; i++) {
      const t = kids[i];
      t._gameObject._updatePass(deltaTime);
      if (kids[i] !== t) i = GameObject._resync(kids, t, i);
    }
  }

  _lateUpdatePass(deltaTime) {
    if (this._destroyed || !this._active) return;
    const comps = this._components;
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i];
      if (c._started && c.enabled) c.lateUpdate(deltaTime);
      if (comps[i] !== c) i = GameObject._resync(comps, c, i);
    }
    const kids = this._transform.children;
    for (let i = 0; i < kids.length; i++) {
      const t = kids[i];
      t._gameObject._lateUpdatePass(deltaTime);
      if (kids[i] !== t) i = GameObject._resync(kids, t, i);
    }
  }
}

/* ---- core/Renderer.js ---- */
class Renderer extends Component {
  constructor() {
    super();
    // 정렬
    this.sortingLayer = 'Default';
    this.orderInLayer = 0;
    this.ySort = false;

    // 표시
    this.visible = true;
    this.opacity = 1;

    // RenderPipeline이 매 프레임 채워넣는 정렬용 캐시
    this._layerIndex = 0;
    this._sortY = 0;
  }

  get isVisible() {
    return this.visible && this.opacity > 0 && this.isActiveAndEnabled;
  }

  // 컬링용 월드 AABB. 서브클래스가 override, 못 구하면 null
  getBounds(out) {
    return null;
  }

  // 서브클래스가 override
  render(ctx, camera) {}
}

/* ---- ui/RectTransform.js ---- */
class RectTransform extends Component {
  constructor() {
    super();
    this._awoken = true;
    this._started = true;

    // 앵커 (부모 기준 0~1 비율)
    this.anchorMin = { x: 0, y: 0 };
    this.anchorMax = { x: 0, y: 0 };
    this.pivot = { x: 0.5, y: 0.5 };

    // 오프셋: 기준 해상도 단위. stretch 앵커에선 여백, point 앵커에선 피벗 기준 위치로 쓰인다.
    this.offsetMin = { x: 0, y: 0 };
    this.offsetMax = { x: 0, y: 0 };

    // 그리는 순서 (최상위 UI만 본다): 큰 값이 위에 그려지고 먼저 눌린다. 같으면 만든 순서
    this.sortOrder = 0;

    // 그룹 투명도: 자기와 모든 자손 UI에 곱해진다 (유니티 CanvasGroup). 창 전체를 한 번에 흐리게·나타나게 할 때
    this.alpha = 1;

    // UI 전용 계층 (Transform.parent/children과 별개)
    this.parent = null;
    this.children = [];
    this.uiRoot = null;

    // 캐시
    this._rect = { x: 0, y: 0, width: 0, height: 0 };
    this._dirty = true;
  }

  setAnchor(minX, minY, maxX, maxY) {
    this.anchorMin.x = minX;
    this.anchorMin.y = minY;
    this.anchorMax.x = maxX;
    this.anchorMax.y = maxY;
    this._markDirty();
    return this;
  }

  setPivot(x, y) {
    this.pivot.x = x;
    this.pivot.y = y;
    this._markDirty();
    return this;
  }

  // stretch 앵커용: 네 방향 여백 (기준 해상도 단위)
  setOffsets(left, top, right, bottom) {
    this.offsetMin.x = left;
    this.offsetMin.y = top;
    this.offsetMax.x = -right;
    this.offsetMax.y = -bottom;
    this._markDirty();
    return this;
  }

  // point 앵커용: 고정 크기 + 앵커 기준 위치 (피벗 적용, 기준 해상도 단위)
  setSizeAndPosition(width, height, x = 0, y = 0) {
    this.offsetMin.x = x - this.pivot.x * width;
    this.offsetMin.y = y - this.pivot.y * height;
    this.offsetMax.x = x + (1 - this.pivot.x) * width;
    this.offsetMax.y = y + (1 - this.pivot.y) * height;
    this._markDirty();
    return this;
  }

  setSize(width, height) {
    const x = this.offsetMin.x + this.pivot.x * (this.offsetMax.x - this.offsetMin.x);
    const y = this.offsetMin.y + this.pivot.y * (this.offsetMax.y - this.offsetMin.y);
    return this.setSizeAndPosition(width, height, x, y);
  }

  setParent(parent) {
    if (parent === this.parent) return this;
    if (this.parent) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
    } else if (this.uiRoot) {
      this.uiRoot.detach(this);
    }
    this.parent = parent;
    if (parent) {
      parent.children.push(this);
      this.uiRoot = parent.uiRoot;
    }
    this._markDirty();
    return this;
  }

  // 자식 UI 오브젝트 생성. Transform 계층(생명주기)과 RectTransform 계층(배치)에 같이 붙인다.
  createChild(name) {
    const go = new GameObject(name);
    const rt = go.addComponent(new RectTransform());
    this.gameObject.addChild(go);
    rt.setParent(this);
    return go;
  }

  // 파괴될 때 부모 목록에서 빠진다. 안 빼면 파괴된 자식이 계속 순회된다.
  onDestroy() {
    if (this.parent) this.setParent(null);
    else if (this.uiRoot) this.uiRoot.detach(this);
  }

  // 조상까지 곱한 그룹 투명도 (UI 렌더러가 opacity에 곱한다)
  get worldAlpha() {
    let a = this.alpha;
    for (let p = this.parent; p; p = p.parent) a *= p.alpha;
    return a;
  }

  // 포인터 좌표(CSS px, Input.pointers의 position)가 이 사각형 안에 있는지. pixelRatio를 알아서 맞춘다.
  containsPoint(x, y) {
    const k = typeof Input !== 'undefined' ? Input.pixelRatio : 1;
    const r = this.rect;
    const px = x * k;
    const py = y * k;
    return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
  }

  // 계산된 최종 사각형 (화면 device pixel 기준: x, y, width, height)
  get rect() {
    if (this._dirty) this._recompute();
    return this._rect;
  }

  _parentRect() {
    if (this.parent) return this.parent.rect;
    if (this.uiRoot) return this.uiRoot.rootRect;
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  _recompute() {
    const p = this._parentRect();
    const scale = this.uiRoot ? this.uiRoot.scale : 1;

    const xMin = p.x + this.anchorMin.x * p.width + this.offsetMin.x * scale;
    const yMin = p.y + this.anchorMin.y * p.height + this.offsetMin.y * scale;
    const xMax = p.x + this.anchorMax.x * p.width + this.offsetMax.x * scale;
    const yMax = p.y + this.anchorMax.y * p.height + this.offsetMax.y * scale;

    this._rect.x = xMin;
    this._rect.y = yMin;
    this._rect.width = xMax - xMin;
    this._rect.height = yMax - yMin;
    this._dirty = false;
  }

  _markDirty() {
    if (this._dirty) return;
    this._dirty = true;
    for (const c of this.children) c._markDirty();
  }
}

/* ---- ui/UIRoot.js ---- */
class UIRoot {
  constructor(referenceWidth = 320, referenceHeight = 180, options = {}) {
    this.referenceWidth = referenceWidth;
    this.referenceHeight = referenceHeight;

    // 'fit': 기준 해상도(16:9)를 화면 안에 맞춰 늘린다. 세로 화면에선 가운데 띠만 쓰게 된다.
    // 'constant': 화면 전체를 쓰고, UI 1단위 = 화면 픽셀 constantScale개. 모바일 HUD용.
    this.mode = options.mode ?? 'fit';
    this.constantScale = options.scale ?? 1;

    this.scale = 1;
    this.rootRect = { x: 0, y: 0, width: 0, height: 0 };

    this._lastCanvasWidth = -1;
    this._lastCanvasHeight = -1;
    this._roots = [];
  }

  attach(rectTransform) {
    if (rectTransform.parent) rectTransform.setParent(null);
    rectTransform.uiRoot = this;
    if (!this._roots.includes(rectTransform)) this._roots.push(rectTransform);
    rectTransform._markDirty();
    return rectTransform;
  }

  detach(rectTransform) {
    const i = this._roots.indexOf(rectTransform);
    if (i >= 0) this._roots.splice(i, 1);
    return rectTransform;
  }

  // Engine이 매 프레임 실제 캔버스 크기(device pixel)로 호출
  update(canvasWidth, canvasHeight) {
    if (canvasWidth === this._lastCanvasWidth && canvasHeight === this._lastCanvasHeight) return;
    this._lastCanvasWidth = canvasWidth;
    this._lastCanvasHeight = canvasHeight;

    if (this.mode === 'constant') {
      this.scale = this.constantScale;
      this.rootRect.x = 0;
      this.rootRect.y = 0;
      this.rootRect.width = canvasWidth;
      this.rootRect.height = canvasHeight;
    } else {
      this.scale = Math.min(canvasWidth / this.referenceWidth, canvasHeight / this.referenceHeight);

      const usedWidth = this.referenceWidth * this.scale;
      const usedHeight = this.referenceHeight * this.scale;

      this.rootRect.x = (canvasWidth - usedWidth) / 2;
      this.rootRect.y = (canvasHeight - usedHeight) / 2;
      this.rootRect.width = usedWidth;
      this.rootRect.height = usedHeight;
    }

    for (const rt of this._roots) rt._markDirty();
  }

  // 화면비가 기준과 다를 때 남는 여백. 기준 해상도 단위로 환산해서 반환 (left/right/top/bottom).
  get safeArea() {
    if (this.scale === 0 || this.mode === 'constant') return { left: 0, right: 0, top: 0, bottom: 0 };
    const usedWidth = this.referenceWidth * this.scale;
    const usedHeight = this.referenceHeight * this.scale;
    const marginX = (this._lastCanvasWidth - usedWidth) / this.scale / 2;
    const marginY = (this._lastCanvasHeight - usedHeight) / this.scale / 2;
    return { left: marginX, right: marginX, top: marginY, bottom: marginY };
  }
}


/* ---- ui/UIImage.js ---- */
class UIImage extends Renderer {
  constructor(sprite = null, options = {}) {
    super();
    this.sprite = sprite;
    this.region = options.region ?? null;
    this.pixelSnap = options.pixelSnap ?? true;

    if (options.sortingLayer) this.sortingLayer = options.sortingLayer;
    else this.sortingLayer = 'UI';
    if (options.orderInLayer !== undefined) this.orderInLayer = options.orderInLayer;
    if (options.opacity !== undefined) this.opacity = options.opacity;
  }

  setSprite(sprite, region = null) {
    this.sprite = sprite;
    this.region = region;
    return this;
  }

  // 컬링은 UI 패스에서 하지 않는다 (RectTransform 자체가 이미 화면 기준)
  getBounds(out) {
    return null;
  }

  render(ctx) {
    const img = this.sprite;
    if (!img) return;

    const rt = this.getComponent(RectTransform);
    if (!rt) return;

    const r = rt.rect;
    if (r.width <= 0 || r.height <= 0) return;

    const x = this.pixelSnap ? Math.round(r.x) : r.x;
    const y = this.pixelSnap ? Math.round(r.y) : r.y;
    const w = this.pixelSnap ? Math.round(r.width) : r.width;
    const h = this.pixelSnap ? Math.round(r.height) : r.height;

    const alpha = this.opacity * rt.worldAlpha;
    if (alpha <= 0) return;
    if (alpha < 1) ctx.globalAlpha = alpha;

    if (this.region) {
      const reg = this.region;
      ctx.drawImage(img, reg.x, reg.y, reg.width, reg.height, x, y, w, h);
    } else {
      ctx.drawImage(img, x, y, w, h);
    }

    if (alpha < 1) ctx.globalAlpha = 1;
  }
}

/* ---- ui/UIText.js ---- */
class UIText extends Renderer {
  constructor(text = '', options = {}) {
    super();
    const cfg = typeof Config !== 'undefined' ? Config : {};

    this.text = text;
    this.fontSize = options.fontSize ?? cfg.fontSize ?? 16; // 기준 해상도 단위
    this.fontFamily = options.fontFamily ?? cfg.fontFamily ?? 'monospace';
    this.fontWeight = options.fontWeight ?? 'normal';
    this.color = options.color ?? '#ffffff';
    this.align = options.align ?? 'center'; // left / center / right
    this.verticalAlign = options.verticalAlign ?? 'middle'; // top / middle / bottom
    this.pixelSnap = options.pixelSnap ?? true;

    // 줄바꿈: true면 사각형 너비에 맞춰 여러 줄로 나눈다 (\n도 줄바꿈)
    this.wrap = options.wrap ?? false;
    this.lineHeight = options.lineHeight ?? 1.3; // fontSize 배수

    // 색 글자: [[키:글자]]를 UIText.colorOf(키, palette) 색의 굵은 글자로 그린다. rich가 아니면 표시만 벗겨 낸다
    this.rich = options.rich ?? false;
    this.palette = options.palette ?? 'light';

    this.sortingLayer = options.sortingLayer ?? 'UI';
    if (options.orderInLayer !== undefined) this.orderInLayer = options.orderInLayer;
    if (options.opacity !== undefined) this.opacity = options.opacity;

    this._wrapKey = null;
    this._lines = [];
  }

  setText(text) {
    this.text = text;
    return this;
  }

  // UI 패스는 컬링하지 않는다 (UIImage와 동일한 정책)
  getBounds(out) {
    return null;
  }

  // 게임이 정하는 색 표 (키 → 색). 없으면 기본 글자색
  static colorOf = (key, palette) => null;
  static MARK = /\[\[(\w+):([^\]]*)\]\]/g;

  static strip(text) {
    return String(text).replace(UIText.MARK, '$2');
  }

  render(ctx) {
    if (!this.text) return;
    if (this.rich) return this._renderRich(ctx);
    if (this.text.includes('[[')) {
      const t = this.text;
      this.text = UIText.strip(t);
      this._renderPlain(ctx);
      this.text = t;
      return;
    }
    this._renderPlain(ctx);
  }

  _renderPlain(ctx) {

    const rt = this.getComponent(RectTransform);
    if (!rt) return;

    const r = rt.rect;
    const scale = rt.uiRoot ? rt.uiRoot.scale : 1;
    const size = this.fontSize * scale;
    if (size <= 0) return;

    ctx.font = `${this.fontWeight} ${size}px ${this.fontFamily}`;
    const lines = this.wrap ? this._wrapLines(ctx, r.width) : [this.text];
    const step = size * this.lineHeight;
    const blockHeight = step * (lines.length - 1);

    let x = r.x;
    if (this.align === 'center') x = r.x + r.width / 2;
    else if (this.align === 'right') x = r.x + r.width;

    let y = r.y;
    if (this.verticalAlign === 'middle') y = r.y + r.height / 2 - blockHeight / 2;
    else if (this.verticalAlign === 'bottom') y = r.y + r.height - blockHeight;

    const alpha = this.opacity * rt.worldAlpha;
    if (alpha <= 0) return;
    if (alpha < 1) ctx.globalAlpha = alpha;

    // 글자는 내용이 바뀔 때만 작은 오프스크린 캔버스에 그려 두고 매 프레임 그 그림을 찍는다 (fillText, 특히 이모지·한글은 느리다)
    const px = this.pixelSnap, key = this.text + '\u0000' + ctx.font + this.color + this.align + this.verticalAlign + '|' + Math.round(x) + ',' + Math.round(y) + ',' + step + ',' + lines.length + ',' + Math.round(r.width);
    if (key !== this._cacheKey) this._bake(ctx, lines, x, y, step, size, px, key);
    if (this._cache) ctx.drawImage(this._cache, this._cx, this._cy);

    if (alpha < 1) ctx.globalAlpha = 1;
  }

  // 글자 덩어리 크기를 재서 딱 맞는 캔버스에 그린다
  _bake(ctx, lines, x, y, step, size, snap, key) {
    this._cacheKey = key;
    let wMax = 0;
    for (const l of lines) wMax = Math.max(wMax, ctx.measureText(l).width);
    const pad = Math.ceil(size * 0.4) + 2, block = step * (lines.length - 1);
    const left = this.align === 'center' ? x - wMax / 2 : this.align === 'right' ? x - wMax : x;
    const top = this.verticalAlign === 'top' ? y : this.verticalAlign === 'middle' ? y - size * 0.6 : y - size * 1.2;
    const bx = Math.floor(left) - pad, by = Math.floor(top) - pad;
    const W = Math.ceil(wMax) + pad * 2 + 2, H = Math.ceil(block + size * 1.5) + pad * 2;
    if (W <= 0 || H <= 0 || W > 4096 || H > 4096) { this._cache = null; return; }
    const cv = this._cache || (this._cache = document.createElement('canvas'));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; } else { /* 크기가 같으면 지우기만 */ }
    const c2 = cv.getContext('2d');
    c2.setTransform(1, 0, 0, 1, 0, 0);
    c2.clearRect(0, 0, W, H);
    c2.font = ctx.font; c2.fillStyle = this.color; c2.textAlign = this.align; c2.textBaseline = this.verticalAlign;
    for (let i = 0; i < lines.length; i++) {
      const lx = snap ? Math.round(x) : x, ly = snap ? Math.round(y + step * i) : y + step * i;
      c2.fillText(lines[i], lx - bx, ly - by);
    }
    this._cx = bx; this._cy = by;
  }

  // 단어 단위로 자르고, 한 단어가 너비보다 길면 글자 단위로 자른다. 같은 입력이면 캐시를 쓴다.
  _wrapLines(ctx, maxWidth) {
    const key = this.text + '\u0000' + Math.round(maxWidth) + '\u0000' + ctx.font;
    if (key === this._wrapKey) return this._lines;

    const lines = [];
    for (const para of this.text.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width <= maxWidth) {
          line = test;
          continue;
        }
        if (line) lines.push(line);
        line = '';
        for (const ch of word) {
          if (line && ctx.measureText(line + ch).width > maxWidth) {
            lines.push(line);
            line = '';
          }
          line += ch;
        }
      }
      lines.push(line);
    }

    this._wrapKey = key;
    this._lines = lines;
    return lines;
  }

  // ---------- 색 글자 ----------
  _segments() {
    const out = [];
    const re = new RegExp(UIText.MARK.source, 'g');
    let last = 0;
    let m;
    while ((m = re.exec(this.text))) {
      if (m.index > last) out.push({ text: this.text.slice(last, m.index), color: null });
      out.push({ text: m[2], color: UIText.colorOf(m[1], this.palette), bold: true });
      last = re.lastIndex;
    }
    if (last < this.text.length) out.push({ text: this.text.slice(last), color: null });
    return out;
  }

  // 줄 = [{ text, color, bold, w }]. 띄어쓰기 단위로 자르고, 한 덩어리가 줄보다 길면 글자 단위로
  _richLines(ctx, size, maxWidth) {
    const key = this.text + '\u0000' + Math.round(maxWidth) + '\u0000' + size + '\u0000' + this.fontFamily + this.fontWeight + this.palette;
    if (key === this._wrapKey) return this._lines;
    const normal = `${this.fontWeight} ${size}px ${this.fontFamily}`;
    const bold = `bold ${size}px ${this.fontFamily}`;
    const measure = (t, b) => {
      ctx.font = b ? bold : normal;
      return ctx.measureText(t).width;
    };
    const lines = [[]];
    let width = 0;
    const push = (text, seg) => {
      const w = measure(text, seg.bold);
      const line = lines[lines.length - 1];
      const prev = line[line.length - 1];
      if (prev && prev.color === seg.color && prev.bold === seg.bold) {
        prev.text += text;
        prev.w += w;
      } else line.push({ text, color: seg.color, bold: seg.bold, w });
      width += w;
    };
    const newline = () => {
      const line = lines[lines.length - 1];
      // 줄 끝 띄어쓰기 지우기
      const tail = line[line.length - 1];
      if (tail && tail.text.endsWith(' ')) {
        tail.text = tail.text.replace(/ +$/, '');
        tail.w = measure(tail.text, tail.bold);
      }
      lines.push([]);
      width = 0;
    };
    for (const seg of this._segments()) {
      const paras = seg.text.split('\n');
      paras.forEach((para, pi) => {
        if (pi > 0) newline();
        // 단어 + 뒤 띄어쓰기
        const words = para.match(/[^ ]+ *| +/g) ?? [];
        for (const word of words) {
          const w = measure(word.replace(/ +$/, ''), seg.bold);
          if (width + w <= maxWidth || !this.wrap) {
            if (!(width === 0 && /^ +$/.test(word))) push(word, seg);
            continue;
          }
          if (width > 0 && w <= maxWidth) {
            newline();
            push(word, seg);
            continue;
          }
          // 너무 긴 덩어리: 글자 단위
          for (const ch of word) {
            if (width > 0 && width + measure(ch, seg.bold) > maxWidth) newline();
            if (width === 0 && ch === ' ') continue;
            push(ch, seg);
          }
        }
      });
    }
    this._wrapKey = key;
    this._lines = lines;
    return lines;
  }

  _renderRich(ctx) {
    const rt = this.getComponent(RectTransform);
    if (!rt) return;
    const r = rt.rect;
    const scale = rt.uiRoot ? rt.uiRoot.scale : 1;
    const size = this.fontSize * scale;
    if (size <= 0) return;
    const lines = this._richLines(ctx, size, r.width);
    const step = size * this.lineHeight;
    const blockHeight = step * (lines.length - 1);
    let y = r.y;
    if (this.verticalAlign === 'middle') y = r.y + r.height / 2 - blockHeight / 2;
    else if (this.verticalAlign === 'bottom') y = r.y + r.height - blockHeight;
    const alpha = this.opacity * rt.worldAlpha;
    if (alpha <= 0) return;
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.textAlign = 'left';
    ctx.textBaseline = this.verticalAlign;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lw = line.reduce((s, q) => s + q.w, 0);
      let x = r.x;
      if (this.align === 'center') x = r.x + (r.width - lw) / 2;
      else if (this.align === 'right') x = r.x + r.width - lw;
      const ly = y + step * i;
      for (const q of line) {
        ctx.font = `${q.bold ? 'bold' : this.fontWeight} ${size}px ${this.fontFamily}`;
        ctx.fillStyle = q.color ?? this.color;
        ctx.fillText(q.text, this.pixelSnap ? Math.round(x) : x, this.pixelSnap ? Math.round(ly) : ly);
        x += q.w;
      }
    }
    if (alpha < 1) ctx.globalAlpha = 1;
  }

  // 그려질 줄 수 (높이 계산용). 그리기 전에도 쓸 수 있게 캔버스를 받는다
  measureLines(ctx, width) {
    const rt = this.getComponent(RectTransform);
    const scale = rt && rt.uiRoot ? rt.uiRoot.scale : 1;
    const size = this.fontSize * scale;
    if (this.rich) return this._richLines(ctx, size, width * scale).length;
    ctx.font = `${this.fontWeight} ${size}px ${this.fontFamily}`;
    const t = this.text;
    if (t.includes('[[')) this.text = UIText.strip(t);
    const n = this._wrapLines(ctx, width * scale).length;
    this.text = t;
    this._wrapKey = null;
    return n;
  }
}


/* ---- ui/UIElement.js ---- */
class UIElement extends Component {
  constructor() {
    super();
    this.raycastTarget = true;
  }

  onPointerDown(pointer) {}
  onPointerUp(pointer) {}
  onClick(pointer) {}
  onDrag(pointer) {}
}

/* ---- ui/UIButton.js ---- */
class UIButton extends UIElement {
  constructor(options = {}) {
    super();
    // Input 액션 이름. 지정하면 누르는 동안 Input.getButton(action)이 true가 된다.
    this.action = options.action ?? null;

    // 눌린 상태 이미지 (없으면 기본 이미지 유지)
    this.pressedSprite = options.pressedSprite ?? null;
    this.pressedRegion = options.pressedRegion ?? null;

    // 콜백
    this.onPress = options.onPress ?? null;
    this.onRelease = options.onRelease ?? null;
    this.onTap = options.onTap ?? null;

    this.pressed = false;
    this._image = null;
    this._normalSprite = null;
    this._normalRegion = null;
  }

  start() {
    this._image = this.getComponent(UIImage);
    if (this._image) {
      this._normalSprite = this._image.sprite;
      this._normalRegion = this._image.region;
    }
  }

  // 기본/눌림 이미지 영역을 바꾼다 (켜짐/꺼짐 아이콘 전환 등)
  setRegions(normalRegion, pressedRegion = normalRegion) {
    this._normalRegion = normalRegion;
    this.pressedRegion = pressedRegion;
    const image = this._image ?? this.getComponent(UIImage); // start 전에 불려도 이미지에 바로 반영
    if (image) image.setSprite(image.sprite, this.pressed ? pressedRegion : normalRegion);
    return this;
  }

  onPointerDown(pointer) { this._setPressed(true); }
  onPointerUp(pointer) { this._setPressed(false); }
  onClick(pointer) { if (this.onTap) this.onTap(this); }
  onDisable() { this._setPressed(false); }

  _setPressed(value) {
    if (this.pressed === value) return;
    this.pressed = value;

    if (this.action) Input.setVirtualButton(this.action, value);

    if (this._image) {
      if (value) this._image.setSprite(this.pressedSprite ?? this._normalSprite, this.pressedRegion ?? this._normalRegion);
      else this._image.setSprite(this._normalSprite, this._normalRegion);
    }

    const cb = value ? this.onPress : this.onRelease;
    if (cb) cb(this);
  }
}


/* ---- ui/UIRect.js ---- */
// 단색 사각형 + 테두리. 패널, 카드 바탕 같은 UI 배경용.
// color가 null이면 아무것도 그리지 않지만, 렌더러 목록엔 남아서 클릭 판정 대상이 된다.
class UIRect extends Renderer {
  constructor(options = {}) {
    super();
    this.color = options.color !== undefined ? options.color : '#000000'; // null이면 칠하지 않음 (?? 를 쓰면 null도 검정이 된다)
    this.borderColor = options.borderColor ?? null;
    this.borderWidth = options.borderWidth ?? 1; // UI 단위

    this.sortingLayer = options.sortingLayer ?? 'UI';
    if (options.orderInLayer !== undefined) this.orderInLayer = options.orderInLayer;
    if (options.opacity !== undefined) this.opacity = options.opacity;
  }

  getBounds(out) {
    return null;
  }

  render(ctx) {
    const rt = this.getComponent(RectTransform);
    const r = rt.rect;
    const x = Math.round(r.x);
    const y = Math.round(r.y);
    const w = Math.round(r.x + r.width) - x;
    const h = Math.round(r.y + r.height) - y;
    if (w <= 0 || h <= 0) return;

    const alpha = this.opacity * rt.worldAlpha;
    if (alpha <= 0) return;
    if (alpha < 1) ctx.globalAlpha = alpha;

    if (this.color) {
      ctx.fillStyle = this.color;
      ctx.fillRect(x, y, w, h);
    }

    if (this.borderColor) {
      const b = Math.max(1, Math.round(this.borderWidth * (rt.uiRoot ? rt.uiRoot.scale : 1)));
      ctx.fillStyle = this.borderColor;
      ctx.fillRect(x, y, w, b);
      ctx.fillRect(x, y + h - b, w, b);
      ctx.fillRect(x, y + b, b, h - b * 2);
      ctx.fillRect(x + w - b, y + b, b, h - b * 2);
    }

    if (alpha < 1) ctx.globalAlpha = 1;
  }
}


/* ---- ui/UIMask.js ---- */
// 이 컴포넌트가 붙은 RectTransform 밖으로 나간 자손 UI는 잘려서 그려지고, 클릭도 안 된다.
// 마스크가 겹치면 모든 조상 마스크의 교집합만 보인다.
class UIMask extends Component {
  // RenderPipeline이 호출: 조상 마스크로 ctx를 잘라둔다. 잘랐으면 true (호출자가 restore)
  static clip(ctx, rectTransform) {
    let clipped = false;
    for (let p = rectTransform.parent; p; p = p.parent) {
      if (!p.gameObject.getComponent(UIMask)) continue;
      if (!clipped) ctx.save();
      clipped = true;
      const r = p.rect;
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.width, r.height);
      ctx.clip();
    }
    return clipped;
  }

  // UIEventSystem이 호출: 점이 모든 조상 마스크 안에 있는지
  static contains(rectTransform, x, y) {
    for (let p = rectTransform.parent; p; p = p.parent) {
      if (!p.gameObject.getComponent(UIMask)) continue;
      const r = p.rect;
      if (x < r.x || x > r.x + r.width || y < r.y || y > r.y + r.height) return false;
    }
    return true;
  }
}


/* ---- ui/UIScrollView.js ---- */
// 세로 스크롤 영역. 이 오브젝트(뷰포트)를 끌거나 휠을 굴리면 content가 위아래로 움직인다.
// 뷰포트에는 클릭 판정용 렌더러(UIRect 등)와 UIMask를 같이 붙여서 쓴다.
// content의 높이는 contentHeight로 직접 알려준다 (UI 단위).
class UIScrollView extends UIElement {
  constructor(options = {}) {
    super();
    this.content = options.content ?? null; // RectTransform
    this.bar = options.bar ?? null;         // 스크롤바 RectTransform (선택)
    this.contentHeight = options.contentHeight ?? 0;
    this.wheelSpeed = options.wheelSpeed ?? 0.5;
    this.friction = options.friction ?? 6;   // 손을 뗀 뒤 관성 감쇠 (클수록 빨리 멈춤)
    this.onTap = options.onTap ?? null;      // 끌지 않고 눌렀다 뗐을 때 (pointer) — 목록 항목 고르기용

    this.scroll = 0;
    this.velocity = 0;
    this.dragging = false;
    this._applied = null;
  }

  get viewportHeight() {
    const rt = this.getComponent(RectTransform);
    return rt.rect.height / rt.uiRoot.scale;
  }

  get maxScroll() {
    return Math.max(0, this.contentHeight - this.viewportHeight);
  }

  scrollTo(value) {
    this.scroll = Math.min(Math.max(value, 0), this.maxScroll);
  }

  onPointerDown(pointer) {
    this.dragging = true;
    this.velocity = 0;
  }

  onDrag(pointer) {
    const s = this.getComponent(RectTransform).uiRoot.scale;
    const dy = pointer.delta.y * Input.pixelRatio / s; // 포인터는 CSS px, scale은 device px 기준
    this.scrollTo(this.scroll - dy);
    this.velocity = -dy / Math.max(Time.unscaledDeltaTime, 1 / 120);
  }

  onPointerUp(pointer) {
    this.dragging = false;
  }

  onClick(pointer) {
    if (this.onTap && pointer.dragDistance <= Input.dragThreshold) this.onTap(pointer);
  }

  update(dt) {
    const rt = this.getComponent(RectTransform);

    if (Input.wheel !== 0) {
      const p = Input.pointerPosition;
      if (rt.containsPoint(p.x, p.y)) {
        this.velocity = 0;
        this.scrollTo(this.scroll + Input.wheel * this.wheelSpeed / rt.uiRoot.scale);
      }
    }

    if (!this.dragging && this.velocity !== 0) {
      this.scrollTo(this.scroll + this.velocity * dt);
      this.velocity *= Math.exp(-this.friction * dt);
      if (Math.abs(this.velocity) < 5 || this.scroll === 0 || this.scroll === this.maxScroll) this.velocity = 0;
    }

    this.scrollTo(this.scroll);
    this._apply();
  }

  _apply() {
    const key = this.scroll + ':' + this.contentHeight + ':' + this.viewportHeight;
    if (key === this._applied) return;
    this._applied = key;

    if (this.content) {
      this.content.setAnchor(0, 0, 1, 0);
      this.content.setOffsets(0, -this.scroll, 0, this.scroll - this.contentHeight);
    }

    if (this.bar) {
      const view = this.viewportHeight;
      const show = this.contentHeight > view;
      this.bar.gameObject.setActive(show);
      if (show) {
        const h = Math.max(16, view * view / this.contentHeight);
        const y = (view - h) * (this.scroll / this.maxScroll);
        this.bar.setAnchor(1, 0, 1, 0);
        this.bar.setOffsets(-4, y, 1, -(y + h));
      }
    }
  }
}


/* ---- systems/Time.js ---- */
class Time {
  // 설정
  static maxDeltaTime = 0.1;
  static timeScale = 1;

  // 상태
  static _deltaTime = 0;
  static _unscaledDeltaTime = 0;
  static _time = 0;
  static _unscaledTime = 0;
  static _frameCount = 0;
  static _fps = 0;
  static _last = null;

  // 읽기 전용 getter
  static get deltaTime() { return Time._deltaTime; }
  static get unscaledDeltaTime() { return Time._unscaledDeltaTime; }
  static get time() { return Time._time; }
  static get unscaledTime() { return Time._unscaledTime; }
  static get frameCount() { return Time._frameCount; }
  static get fps() { return Time._fps; }
  static get isPaused() { return Time.timeScale === 0; }

  // 엔진 전용: 매 프레임 Engine이 호출
  static update(timestampMs) {
    if (Time._last === null) {
      Time._last = timestampMs;
      Time._unscaledDeltaTime = 0;
      Time._deltaTime = 0;
      Time._frameCount++;
      return;
    }

    let dt = (timestampMs - Time._last) / 1000;
    Time._last = timestampMs;

    if (dt < 0) dt = 0;
    if (dt > Time.maxDeltaTime) dt = Time.maxDeltaTime;

    Time._unscaledDeltaTime = dt;
    Time._deltaTime = dt * Time.timeScale;

    Time._unscaledTime += Time._unscaledDeltaTime;
    Time._time += Time._deltaTime;
    Time._frameCount++;

    if (dt > 0) {
      const instant = 1 / dt;
      Time._fps = Time._fps === 0 ? instant : Time._fps + (instant - Time._fps) * 0.1;
    }
  }

  static resync() {
    Time._last = null;
  }

  static reset() {
    Time._deltaTime = 0;
    Time._unscaledDeltaTime = 0;
    Time._time = 0;
    Time._unscaledTime = 0;
    Time._frameCount = 0;
    Time._fps = 0;
    Time._last = null;
  }
}

/* ---- core/Engine.js ---- */
class Engine {
  constructor(options = {}) {
    // 캔버스/렌더 설정
    const target = options.canvas;
    this.canvas = typeof target === 'string' ? document.querySelector(target) : target;
    this.ctx = this.canvas.getContext('2d', { alpha: options.alpha ?? false });
    this.clearColor = options.clearColor ?? '#000000';
    this.pixelRatio = options.pixelRatio ?? 1;
    this._wantRatio = this.pixelRatio;           // 원하는 배율 (maxWidth/maxHeight 때문에 pixelRatio가 더 작아질 수 있다)
    this.maxWidth = options.maxWidth ?? 0;       // 캔버스 가로 해상도 상한(device px, 0=제한 없음). TV처럼 큰 화면에서 채우기 비용을 줄인다
    this.maxHeight = options.maxHeight ?? 0;
    this.imageSmoothing = options.imageSmoothing ?? false;
    this.pauseOnBlur = options.pauseOnBlur ?? true;

    // 확장 지점: 기본값을 자동 구성, 끄고 싶으면 옵션에 false/null 전달
    this.renderer = options.renderer !== undefined ? options.renderer : new RenderPipeline();
    this.systems = [];

    // 루트 GameObject 관리
    this._roots = [];

    // 루프 상태
    this._running = false;
    this._rafId = 0;

    this._frame = this._frame.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    this._onResize = this._onResize.bind(this);

    this._installListeners();
    this.resize();

    // 기본 Input
    if (options.input !== false) {
      this.addSystem(Input);
      Input.useDefaultBindings();
    }

    // 트윈은 GameObject update 전에 값을 움직이고, 디버그 표시는 화면을 다 그린 뒤 맨 위에 그린다 (Config.debug로 켜고 끔)
    this.addSystem(Tween);
    if (typeof Physics !== 'undefined') this.addSystem(Physics); // 프레임 시작에 콜라이더 위치 동기화, 프레임 끝에 트리거 이벤트
    this.addSystem(Debug);
    this.frameMs = 0; // 지난 프레임의 엔진 작업 시간 (ms, 디버그 표시용)

    // 기본 카메라. Config.viewWidth/viewHeight 기준(없으면 16:9 320x180)으로 최소한 보이는 범위를 보장.
    const cfg = typeof Config !== 'undefined' ? Config : {};
    this.camera = null;
    if (options.camera !== false) {
      const camGO = this.create('camera');
      this.camera = camGO.addComponent(new Camera(options.zoom ?? cfg.zoom ?? 1));
      this.camera.setBaseView(
        options.viewWidth ?? cfg.viewWidth ?? 320,
        options.viewHeight ?? cfg.viewHeight ?? 180
      );
    }

    // UI 루트. 카메라와 같은 기준 해상도를 공유한다.
    this.uiRoot = null;
    if (options.ui !== false) {
      this.uiRoot = new UIRoot(
        options.viewWidth ?? cfg.viewWidth ?? 320,
        options.viewHeight ?? cfg.viewHeight ?? 180,
        {
          mode: options.uiScaleMode ?? cfg.uiScaleMode ?? 'fit',
          scale: options.uiScale ?? cfg.uiScale ?? 1
        }
      );
      this.uiRoot.update(this.canvas.width, this.canvas.height);
      this.addSystem(UIEventSystem); // Input 다음에 등록되어야 프레임 순서가 맞음
    }
  }

  // UI 오브젝트 생성: GameObject + RectTransform을 붙이고 uiRoot에 연결
  createUI(name) {
    const go = this.create(name);
    const rt = go.addComponent(new RectTransform());
    if (this.uiRoot) this.uiRoot.attach(rt);
    return go;
  }

  // public getter
  get width() { return this.canvas.width / this.pixelRatio; }
  get height() { return this.canvas.height / this.pixelRatio; }
  get isRunning() { return this._running; }
  get roots() { return this._roots; }

  // 시스템 관리 (Input 등)
  addSystem(system) {
    if (!this.systems.includes(system)) this.systems.push(system);
    if (typeof system.attach === 'function') system.attach(this);
    return system;
  }

  removeSystem(system) {
    const i = this.systems.indexOf(system);
    if (i >= 0) this.systems.splice(i, 1);
    if (typeof system.detach === 'function') system.detach(this);
    return this;
  }

  // 루트 GameObject 관리
  create(name) {
    return this.add(new GameObject(name));
  }

  // 루트로 붙인다. 이미 다른 오브젝트의 자식이면 아무것도 안 한다 (부모를 통해 이미 엔진에 있다)
  add(gameObject) {
    if (gameObject.transform.parent) return gameObject;
    if (gameObject._engine !== this) {
      gameObject._engine = this;
      this._roots.push(gameObject);
    }
    GameObject._queueAwake(gameObject);
    return gameObject;
  }

  // 루트 목록에서 뺀다 (파괴하지는 않는다)
  remove(gameObject) {
    if (gameObject._engine !== this) return gameObject;
    const i = this._roots.indexOf(gameObject);
    if (i >= 0) this._roots.splice(i, 1);
    gameObject._engine = null;
    return gameObject;
  }

  // 이름으로 GameObject 탐색 (루트 -> 자식까지 재귀)
  find(name) {
    for (const root of this._roots) {
      if (root.name === name) return root;
      const found = root.find(name);
      if (found) return found;
    }
    return null;
  }

  // 시작/정지
  start() {
    if (this._running) return this;
    this._running = true;
    Time.resync();
    this._rafId = requestAnimationFrame(this._frame);
    return this;
  }

  stop() {
    if (!this._running) return this;
    this._running = false;
    cancelAnimationFrame(this._rafId);
    this._rafId = 0;
    return this;
  }

  // 리사이즈
  resize() {
    const rect = this.canvas.getBoundingClientRect
      ? this.canvas.getBoundingClientRect()
      : { width: this.canvas.width, height: this.canvas.height };
    const cw = rect.width || this.canvas.width, ch = rect.height || this.canvas.height;
    let k = this._wantRatio;
    if (this.maxWidth > 0) k = Math.min(k, this.maxWidth / cw);
    if (this.maxHeight > 0) k = Math.min(k, this.maxHeight / ch);
    this.pixelRatio = k;
    const w = Math.max(1, Math.round(cw * k));
    const h = Math.max(1, Math.round(ch * k));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.imageSmoothingEnabled = this.imageSmoothing;
    return this;
  }

  // 내부: 프레임 루프
  _frame(timestamp) {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(this._frame);

    Time.update(timestamp);
    const t0 = performance.now();

    for (const system of this.systems) {
      if (typeof system.update === 'function') system.update();
    }

    if (this.uiRoot) this.uiRoot.update(this.canvas.width, this.canvas.height);

    const dt = Time.deltaTime;

    this._lifecycle();
    const roots = this._roots;
    for (let i = 0; i < roots.length; i++) {
      const r = roots[i];
      r._updatePass(dt);
      if (roots[i] !== r) i = GameObject._resync(roots, r, i);
    }
    // 물리 월드 등: update(컨트롤러가 속도를 정함) 뒤, lateUpdate(카메라 추적)·렌더 앞에서 한 번 (postUpdate 훅이 있는 시스템만)
    for (const system of this.systems) {
      if (typeof system.postUpdate === 'function') system.postUpdate(dt);
    }
    for (let i = 0; i < roots.length; i++) {
      const r = roots[i];
      r._lateUpdatePass(dt);
      if (roots[i] !== r) i = GameObject._resync(roots, r, i);
    }

    this._clear();
    if (this.renderer) this.renderer.render(this.ctx, this);

    this._flushDestroyed();
    this.frameMs = performance.now() - t0;

    // 시스템이 화면 위에 덧그리는 것 (디버그 표시 등)
    for (const system of this.systems) {
      if (typeof system.render === 'function') system.render(this.ctx, this);
    }

    for (const system of this.systems) {
      if (typeof system.lateUpdate === 'function') system.lateUpdate();
    }
  }

  _clear() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.clearColor === null) {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      ctx.fillStyle = this.clearColor;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  // awake/start: 새로 붙었거나 상태가 바뀐 것만 처리한다 (예전엔 매 프레임 트리 전체를 두 번 돌았다).
  // awake 중에 또 붙은 오브젝트도 같은 프레임에 처리한다.
  _lifecycle() {
    for (let guard = 0; GameObject._awakeQueue.length > 0 && guard < 16; guard++) {
      const queue = GameObject._awakeQueue;
      GameObject._awakeQueue = [];
      for (const go of queue) {
        if (!go._destroyed && go.engine === this) go._awakePass();
      }
    }
    const starts = GameObject._startQueue;
    for (let i = 0; i < starts.length; i++) {
      const c = starts[i];
      const go = c._gameObject;
      if (c._started || !c._enabledCalled || !go || go._destroyed || go.engine !== this) continue;
      c._started = true;
      c.start();
    }
    starts.length = 0;
  }

  // 파괴: destroy()로 표시된 것만 정리한다 (예전엔 매 프레임 트리 전체를 훑었다)
  _flushDestroyed() {
    const queue = GameObject._destroyQueue;
    if (queue.length === 0) return;
    GameObject._destroyQueue = [];
    for (const go of queue) {
      if (go._engine) go._engine.remove(go);
      if (go._components.length > 0 || go.transform.parent) go._destroyImmediate();
    }
  }

  // 내부: 탭 전환/리사이즈 리스너
  _onVisibility() {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      if (this.pauseOnBlur) this.stop();
    } else {
      Time.resync();
      if (this.pauseOnBlur && !this._running) this.start();
    }
  }

  _onResize() {
    this.resize();
  }

  _installListeners() {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', this._onVisibility);
    }
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(this._onResize);
      this._resizeObserver.observe(this.canvas);
    } else if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('resize', this._onResize);
    }
  }
}

/* ---- core/Resource.js ---- */
class Resource {
  static _images = new Map();
  static _sounds = new Map();

  // image
  static setImage(key, img) {
    Resource._images.set(key, img);
    return img;
  }

  static image(key) {
    return Resource._images.get(key);
  }

  static hasImage(key) {
    return Resource._images.has(key);
  }

  // sound
  static setSound(key, sound) {
    Resource._sounds.set(key, sound);
    return sound;
  }

  static sound(key) {
    return Resource._sounds.get(key);
  }

  static hasSound(key) {
    return Resource._sounds.has(key);
  }
}

/* ---- systems/Input.js ---- */
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

/* ---- components/Camera.js ---- */
class Camera extends Component {
  static main = null;

  constructor(zoom = 1) {
    super();
    // 설정
    this.zoom = zoom;
    this.baseViewHeight = null;
    this.baseViewWidth = null;
    this.depth = 0;
    this.cullingMargin = 0;
    this.pixelZoom = null;

    // 캐시
    this._view = new Matrix();
    this._inverse = new Matrix();
    this._bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    this._pixelRatio = 1;
    this._width = 0;
    this._height = 0;

    // 흔들기 (화면 px). shake()로 시작, update에서 줄어든다
    this._shake = { strength: 0, duration: 0, t: 0, x: 0, y: 0 };
  }

  static shakeEnabled = true; // 설정에서 끌 수 있게 (어지러움)

  // 화면 흔들기. strength: 최대 흔들림(CSS px), duration: 초. 진행 중이면 더 센 쪽으로 이어진다
  shake(strength = 3, duration = 0.25) {
    if (!Camera.shakeEnabled) return this;
    const s = this._shake;
    const left = s.duration > 0 ? s.strength * (1 - s.t / s.duration) : 0;
    if (strength >= left) {
      s.strength = strength;
      s.duration = duration;
      s.t = 0;
    }
    return this;
  }

  get isShaking() {
    return this._shake.t < this._shake.duration;
  }

  update(dt) {
    const s = this._shake;
    if (s.t >= s.duration) {
      s.x = 0;
      s.y = 0;
      return;
    }
    s.t += Time.unscaledDeltaTime;
    const k = Math.max(0, 1 - s.t / s.duration);
    const a = s.strength * k * k;
    s.x = (Math.random() * 2 - 1) * a;
    s.y = (Math.random() * 2 - 1) * a;
  }

  // Camera.main 자동 관리
  onEnable() {
    if (!Camera.main) Camera.main = this;
  }

  onDisable() {
    if (Camera.main === this) Camera.main = null;
  }

  onDestroy() {
    if (Camera.main === this) Camera.main = null;
  }

  // getter
  get viewMatrix() { return this._view; }
  get inverseViewMatrix() { return this._inverse; }
  get worldBounds() { return this._bounds; }

  get viewWidth() {
    const z = this._effectiveZoom();
    return z === 0 ? 0 : this._width / z;
  }

  get viewHeight() {
    const z = this._effectiveZoom();
    return z === 0 ? 0 : this._height / z;
  }

  setViewHeight(worldUnits) {
    if (worldUnits > 0 && this._height > 0) {
      const z = this._height / worldUnits;
      this.zoom = Config.pixelPerfect ? Math.max(1, Math.floor(z)) : z;
    }
    return this;
  }

  // 설정하면 zoom=1일 때 화면 높이에 이 월드 단위 수가 보이도록 기준을 고정.
  // zoom을 조절하면 이 기준에 대한 배율로 작동한다 (zoom 2 = 절반만 보임 = 확대).
  setBaseViewHeight(worldUnits) {
    this.baseViewHeight = worldUnits;
    return this;
  }

  clearBaseViewHeight() {
    this.baseViewHeight = null;
    return this;
  }

  // 세로 기준과 동일하되 가로 방향. 세로/가로 둘 다 설정하면
  // 화면이 한쪽으로 길어져도 오브젝트가 커지지 않고 그 방향으로 더 보이게 된다.
  setBaseViewWidth(worldUnits) {
    this.baseViewWidth = worldUnits;
    return this;
  }

  clearBaseViewWidth() {
    this.baseViewWidth = null;
    return this;
  }

  // 세로/가로 기준을 한번에 설정하는 편의 메서드
  setBaseView(width, height) {
    this.baseViewWidth = width;
    this.baseViewHeight = height;
    return this;
  }

  // 배율 고정: 월드 1유닛 = 화면 픽셀 level개 (소수 가능). 지정하면 기준 해상도/zoom 계산 대신 이 값을 쓴다.
  // 화면 크기가 바뀌어도 배율이 유지된다. null이면 원래 방식으로 돌아간다.
  // 소수 배율이어도 SpriteRenderer가 화면 모서리를 픽셀에 맞춰 그려서 타일 사이에 틈이 생기지 않는다.
  setPixelZoom(level) {
    this.pixelZoom = level === null ? null : Math.max(0.01, level);
    return this;
  }

  // 지금 실제로 쓰이는 배율 (화면 픽셀 / 월드 유닛)
  get effectiveZoom() {
    return this._effectiveZoom();
  }

  // 실제 화면 배율(픽셀/월드유닛).
  // 세로/가로 기준이 둘 다 있으면 더 작은 쪽(덜 확대되는 쪽)을 쓴다 -> 항상 두 기준 모두 최소한 보장.
  // pixelPerfect면 정수로 내림한다 - 타일맵처럼 붙여 그리는 스프라이트들 사이에
  // 이음새(seam)가 생기지 않으려면 위치뿐 아니라 배율 자체도 정수 픽셀이어야 한다.
  _effectiveZoom() {
    if (this.pixelZoom) return this.pixelZoom;
    const byHeight = this.baseViewHeight && this._height > 0
      ? (this._height * this.zoom) / this.baseViewHeight
      : null;
    const byWidth = this.baseViewWidth && this._width > 0
      ? (this._width * this.zoom) / this.baseViewWidth
      : null;

    let z;
    if (byHeight !== null && byWidth !== null) z = Math.min(byHeight, byWidth);
    else if (byHeight !== null) z = byHeight;
    else if (byWidth !== null) z = byWidth;
    else z = this.zoom;

    return Config.pixelPerfect ? Math.max(1, Math.floor(z)) : z;
  }

  // 매 프레임 RenderPipeline이 호출. Y축을 여기서 뒤집는다.
  updateMatrices(width, height, pixelRatio = 1) {
    this._width = width;
    this._height = height;
    this._pixelRatio = pixelRatio;

    const inv = this.transform.inverseWorldMatrix;
    const z = this._effectiveZoom();
    const m = this._view;

    m.a = z * inv.a;
    m.b = -z * inv.b;
    m.c = z * inv.c;
    m.d = -z * inv.d;
    m.e = z * inv.e + width / 2 + this._shake.x * pixelRatio;
    m.f = -z * inv.f + height / 2 + this._shake.y * pixelRatio;

    if (Config.pixelPerfect) {
      m.e = Math.round(m.e);
      m.f = Math.round(m.f);
    }

    if (!Matrix.invert(m, this._inverse)) Matrix.setIdentity(this._inverse);
    this._updateBounds(width, height);
    return m;
  }

  // 좌표 변환
  screenToWorld(x, y) {
    const inv = this._inverse;
    const px = x * this._pixelRatio;
    const py = y * this._pixelRatio;
    return new Vector(
      inv.a * px + inv.c * py + inv.e,
      inv.b * px + inv.d * py + inv.f
    );
  }

  worldToScreen(worldPoint) {
    const m = this._view;
    const r = this._pixelRatio;
    return new Vector(
      (m.a * worldPoint.x + m.c * worldPoint.y + m.e) / r,
      (m.b * worldPoint.x + m.d * worldPoint.y + m.f) / r
    );
  }

  // 컬링
  isInView(minX, minY, maxX, maxY) {
    const b = this._bounds;
    return !(maxX < b.minX || minX > b.maxX || maxY < b.minY || minY > b.maxY);
  }

  _updateBounds(width, height) {
    const inv = this._inverse;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const xs = [0, width, 0, width];
    const ys = [0, 0, height, height];

    for (let i = 0; i < 4; i++) {
      const wx = inv.a * xs[i] + inv.c * ys[i] + inv.e;
      const wy = inv.b * xs[i] + inv.d * ys[i] + inv.f;
      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
    }

    const b = this._bounds;
    b.minX = minX - this.cullingMargin;
    b.minY = minY - this.cullingMargin;
    b.maxX = maxX + this.cullingMargin;
    b.maxY = maxY + this.cullingMargin;
  }
}

/* ---- components/CameraFollow.js ---- */
// Camera가 붙은 오브젝트에 같이 붙인다.
// follow가 켜져 있으면 target(Transform)을 부드럽게 따라가고, bounds가 있으면 화면이 그 밖을 보여주지 않게 막는다.
// pan()으로 손으로 끌어 옮길 수 있다 (follow가 켜져 있으면 다음 프레임에 다시 끌려간다).
class CameraFollow extends Component {
  constructor(options = {}) {
    super();
    this.target = options.target ?? null;       // Transform
    this.follow = options.follow ?? true;
    this.smoothing = options.smoothing ?? 12;    // 클수록 빨리 따라붙는다. 0이면 즉시
    this.bounds = options.bounds ?? null;        // { minX, minY, maxX, maxY } 월드 단위, 매 프레임 다시 읽는다
  }

  // 대상 위치로 즉시 이동
  snap() {
    if (!this.target) return this;
    const t = this.target.position;
    this.transform.setPosition(t.x, t.y);
    this._clamp();
    return this;
  }

  pan(dx, dy) {
    const p = this.transform.position;
    this.transform.setPosition(p.x + dx, p.y + dy);
    this._clamp();
    return this;
  }

  lateUpdate(dt) {
    if (this.follow && this.target) {
      const p = this.transform.position;
      const t = this.target.position;
      const k = this.smoothing > 0 ? 1 - Math.exp(-this.smoothing * dt) : 1;
      this.transform.setPosition(p.x + (t.x - p.x) * k, p.y + (t.y - p.y) * k);
    }
    this._clamp();
  }

  // 보이는 영역(카메라 viewWidth/Height)이 bounds 안에 들어오도록 중심을 제한한다. 영역이 bounds보다 크면 가운데에 둔다.
  _clamp() {
    const b = this.bounds;
    if (!b) return;
    const cam = this.getComponent(Camera);
    const hw = cam.viewWidth / 2;
    const hh = cam.viewHeight / 2;
    const p = this.transform.position;
    const x = b.maxX - b.minX <= hw * 2 ? (b.minX + b.maxX) / 2 : Math.min(Math.max(p.x, b.minX + hw), b.maxX - hw);
    const y = b.maxY - b.minY <= hh * 2 ? (b.minY + b.maxY) / 2 : Math.min(Math.max(p.y, b.minY + hh), b.maxY - hh);
    if (x !== p.x || y !== p.y) this.transform.setPosition(x, y);
  }
}


/* ---- components/SpriteRenderer.js ---- */
class SpriteRenderer extends Renderer {
  constructor(sprite = null, options = {}) {
    super();
    const cfg = typeof Config !== 'undefined' ? Config : {};

    // 스프라이트 소스
    this.sprite = sprite;
    this.region = options.region ?? null;

    // 배치
    this.pivot = options.pivot ? new Vector(options.pivot.x, options.pivot.y) : new Vector(0.5, 0.5);
    this.pixelsPerUnit = options.pixelsPerUnit ?? cfg.pixelsPerUnit ?? 1;
    this.flipX = options.flipX ?? false;
    this.flipY = options.flipY ?? false;
    this.pixelSnap = options.pixelSnap ?? true;

    if (options.sortingLayer) this.sortingLayer = options.sortingLayer;
    if (options.orderInLayer !== undefined) this.orderInLayer = options.orderInLayer;
    if (options.ySort !== undefined) this.ySort = options.ySort;
    if (options.opacity !== undefined) this.opacity = options.opacity;
  }

  setSprite(sprite, region = null) {
    this.sprite = sprite;
    this.region = region;
    return this;
  }

  setRegion(x, y, width, height) {
    this.region = { x, y, width, height };
    return this;
  }

  setPivot(x, y) {
    this.pivot.x = x;
    this.pivot.y = y;
    return this;
  }

  // 크기
  get sourceWidth() {
    if (this.region) return this.region.width;
    return this.sprite ? (this.sprite.naturalWidth || this.sprite.width || 0) : 0;
  }

  get sourceHeight() {
    if (this.region) return this.region.height;
    return this.sprite ? (this.sprite.naturalHeight || this.sprite.height || 0) : 0;
  }

  get worldWidth() { return this.sourceWidth / this.pixelsPerUnit; }
  get worldHeight() { return this.sourceHeight / this.pixelsPerUnit; }

  // 컬링용 월드 AABB
  getBounds(out) {
    if (!this.sprite) return null;
    const w = this.worldWidth;
    const h = this.worldHeight;
    const x0 = -this.pivot.x * w;
    const x1 = x0 + w;
    const y0 = -this.pivot.y * h;
    const y1 = y0 + h;

    const m = this.transform.worldMatrix;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const xs = [x0, x1, x0, x1];
    const ys = [y0, y0, y1, y1];

    for (let i = 0; i < 4; i++) {
      const wx = m.a * xs[i] + m.c * ys[i] + m.e;
      const wy = m.b * xs[i] + m.d * ys[i] + m.f;
      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
    }

    out.minX = minX;
    out.minY = minY;
    out.maxX = maxX;
    out.maxY = maxY;
    return out;
  }

  // 그리기
  render(ctx, camera) {
    const img = this.sprite;
    if (!img) return;

    const w = this.worldWidth;
    const h = this.worldHeight;
    if (w <= 0 || h <= 0) return;

    const m = Matrix.multiply(camera.viewMatrix, this.transform.worldMatrix, SPRITE_MATRIX);

    const alpha = this.opacity;
    if (alpha < 1) ctx.globalAlpha = alpha;

    // 회전/기울기가 없으면 화면 사각형의 네 모서리를 픽셀에 맞춰 그린다.
    // 위치만 반올림하고 너비를 소수로 두면, 소수점 줌에서 붙어 있는 스프라이트(청크 이미지) 사이에 틈이나 겹침이 생긴다.
    // 모서리를 반올림하면 같은 월드 좌표를 공유하는 경계는 항상 같은 픽셀로 떨어져 틈이 생기지 않는다.
    if (this.pixelSnap && m.b === 0 && m.c === 0) {
      const lx0 = -this.pivot.x * w;
      const ly0 = -this.pivot.y * h;
      const xa = Math.round(m.a * lx0 + m.e);
      const xb = Math.round(m.a * (lx0 + w) + m.e);
      const ya = Math.round(m.d * ly0 + m.f);
      const yb = Math.round(m.d * (ly0 + h) + m.f);
      const left = Math.min(xa, xb);
      const right = Math.max(xa, xb);
      const top = Math.min(ya, yb);
      const bottom = Math.max(ya, yb);
      if (right > left && bottom > top) {
        // 변환이 x/y를 뒤집으면(음수 스케일) 그만큼, flip 옵션이면 또 한 번 이미지를 뒤집는다. 월드 Y-up이라 d<0이 기본.
        const mirrorX = (m.a < 0) !== this.flipX;
        const mirrorY = (m.d > 0) !== this.flipY;
        ctx.setTransform(mirrorX ? -1 : 1, 0, 0, mirrorY ? -1 : 1, mirrorX ? left + right : 0, mirrorY ? top + bottom : 0);
        this._draw(ctx, img, left, top, right - left, bottom - top);
      }
    } else {
      ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      ctx.scale(this.flipX ? -1 : 1, this.flipY ? 1 : -1);
      this._draw(ctx, img, -this.pivot.x * w, -(1 - this.pivot.y) * h, w, h);
    }

    if (alpha < 1) ctx.globalAlpha = 1;
  }

  _draw(ctx, img, x, y, w, h) {
    if (this.region) {
      const r = this.region;
      ctx.drawImage(img, r.x, r.y, r.width, r.height, x, y, w, h);
    } else {
      ctx.drawImage(img, x, y, w, h);
    }
  }
}

// render()에서 매 프레임 재사용하는 스크래치 행렬 (할당 방지)
const SPRITE_MATRIX = new Matrix();

/* ---- systems/RenderPipeline.js ---- */
class RenderPipeline {
  constructor(options = {}) {
    // 설정
    this.sortingLayers = options.sortingLayers ?? ['Background', 'Default', 'Foreground', 'UI'];
    this.culling = options.culling ?? true;

    // 통계 (디버깅용)
    this.drawCalls = 0;
    this.culledCount = 0;
    this.visibleCount = 0;

    // 내부 스크래치
    this._renderers = [];
    this._cameras = [];
    this._uiList = [];
    this._defaultLayer = Math.max(0, this.sortingLayers.indexOf('Default'));
    this._scratch = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    this._visible = [];
    this._layerCache = new Map(); // 레이어 이름 -> 순서 (매 렌더러마다 indexOf 안 하게)
  }

  // 이번 프레임에 그려진 순서대로 정렬된 UI 렌더러 목록 (위에 그려진 게 배열 뒤쪽)
  get sortedUIRenderers() {
    return this._uiList;
  }

  layerIndex(name) {
    let i = this._layerCache.get(name);
    if (i === undefined) {
      i = this.sortingLayers.indexOf(name);
      if (i < 0) i = this._defaultLayer;
      this._layerCache.set(name, i);
    }
    return i;
  }

  // Engine이 매 프레임 호출: render(ctx, engine)
  render(ctx, engine) {
    // sortingLayers를 바꿨으면 레이어 캐시를 비운다
    if (this._layersKey !== this.sortingLayers.join('|')) {
      this._layersKey = this.sortingLayers.join('|');
      this._defaultLayer = Math.max(0, this.sortingLayers.indexOf('Default'));
      this._layerCache.clear();
    }
    this._renderers.length = 0;
    this._cameras.length = 0;
    this.drawCalls = 0;
    this.culledCount = 0;

    for (const root of engine.roots) this._collect(root);
    this.visibleCount = this._renderers.length;

    if (this._cameras.length > 0) {
      this._cameras.sort((a, b) => a.depth - b.depth);
      if (!Camera.main || !Camera.main.isActiveAndEnabled) Camera.main = this._cameras[0];

      const width = engine.canvas.width;
      const height = engine.canvas.height;
      const ratio = engine.pixelRatio;

      for (const camera of this._cameras) {
        camera.updateMatrices(width, height, ratio);
        this._renderCamera(ctx, camera);
      }
    }

    this._renderUI(ctx, engine);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // 트리 순회하며 카메라/렌더러 수집
  _collect(gameObject) {
    if (!gameObject.isActive || gameObject.isDestroyed) return;
    if (gameObject.getComponent(RectTransform)) return; // UI 오브젝트는 _renderUI에서 별도 처리

    for (const c of gameObject.components) {
      if (c instanceof Camera) {
        if (c.isActiveAndEnabled) this._cameras.push(c);
      } else if (c instanceof Renderer) {
        if (c.isVisible) this._renderers.push(c);
      }
    }

    for (const child of gameObject.transform.children) this._collect(child.gameObject);
  }

  // UI: RectTransform 트리를 따로 순회 (Transform 계층과 무관)
  _renderUI(ctx, engine) {
    this._uiList.length = 0;

    const uiRoot = engine.uiRoot;
    if (!uiRoot) return;

    // 최상위 UI는 sortOrder 순서로 (같으면 만든 순서. 정렬은 안정 정렬이다)
    const roots = this._uiRoots ?? (this._uiRoots = []);
    roots.length = 0;
    roots.push(...uiRoot._roots);
    roots.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const root of roots) this._collectUI(root, this._uiList);
    if (this._uiList.length === 0) return;

    for (const r of this._uiList) {
      r._layerIndex = this.layerIndex(r.sortingLayer);
    }
    this._uiList.sort(renderPipelineCompare);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const r of this._uiList) {
      const clipped = UIMask.clip(ctx, r.getComponent(RectTransform));
      r.render(ctx, null);
      if (clipped) ctx.restore();
      this.drawCalls++;
    }
  }

  // 꺼진(비활성/파괴) UI는 자식까지 통째로 건너뛴다
  _collectUI(rectTransform, out) {
    const go = rectTransform.gameObject;
    if (!go || !go.isActive || go.isDestroyed) return;
    for (const c of go.components) {
      if (c instanceof Renderer && c.isVisible) out.push(c);
    }
    for (const child of rectTransform.children) this._collectUI(child, out);
  }

  // 컬링 + 정렬 + 그리기
  _renderCamera(ctx, camera) {
    const visible = this._visible;
    visible.length = 0;

    for (const r of this._renderers) {
      if (this.culling) {
        const b = r.getBounds(this._scratch);
        if (b && !camera.isInView(b.minX, b.minY, b.maxX, b.maxY)) {
          this.culledCount++;
          continue;
        }
      }
      r._layerIndex = this.layerIndex(r.sortingLayer);
      r._sortY = r.ySort ? r.transform.worldMatrix.f : 0;
      visible.push(r);
    }

    visible.sort(renderPipelineCompare);

    for (const r of visible) {
      r.render(ctx, camera);
      this.drawCalls++;
    }
  }
}

// 정렬 키: 레이어 -> orderInLayer -> 월드 Y 내림차순 (Y-up이라 큰 Y가 더 멀리 있는 것)
function renderPipelineCompare(a, b) {
  if (a._layerIndex !== b._layerIndex) return a._layerIndex - b._layerIndex;
  if (a.orderInLayer !== b.orderInLayer) return a.orderInLayer - b.orderInLayer;
  return b._sortY - a._sortY;
}

/* ---- ui/UIEventSystem.js ---- */
class UIEventSystem {
  static enabled = true;

  static _engine = null;
  static _captured = new Map(); // pointerId -> UIElement

  static attach(engine) {
    UIEventSystem._engine = engine;
  }

  static detach() {
    UIEventSystem._engine = null;
    UIEventSystem._captured.clear();
  }

  // Engine이 매 프레임 호출. Input.update() 다음, GameObject Update 이전이어야 한다.
  static update() {
    if (!UIEventSystem.enabled) return;
    const engine = UIEventSystem._engine;
    if (!engine || !engine.renderer) return;

    // 파괴되었거나 비활성화된 캡처는 정리
    for (const [id, el] of UIEventSystem._captured) {
      if (!el.gameObject || el.gameObject.isDestroyed || !el.isActiveAndEnabled) {
        UIEventSystem._captured.delete(id);
      }
    }

    for (const pointer of Input.pointers) {
      let captured = UIEventSystem._captured.get(pointer.id);

      if (captured) {
        pointer.consume();
        // 스크롤 목록 안의 버튼을 끌기 시작하면 누른 것을 취소하고 목록 스크롤로 넘긴다 (행이 목록을 가득 채워도 끌어서 스크롤된다)
        if (!pointer.released && captured instanceof UIButton && pointer.dragDistance > Input.dragThreshold) {
          const view = UIEventSystem._scrollAncestor(captured);
          if (view) {
            captured.onPointerUp(pointer);
            UIEventSystem._captured.set(pointer.id, view);
            view.onPointerDown(pointer);
            captured = view;
          }
        }
        if (pointer.released) {
          UIEventSystem._captured.delete(pointer.id);
          captured.onPointerUp(pointer);
          const hitNow = UIEventSystem._hitTest(engine, pointer.position.x, pointer.position.y);
          // 버튼을 끌고 나서 뗀 것은 탭이 아니다
          const dragged = captured instanceof UIButton && pointer.dragDistance > Input.dragThreshold;
          if (hitNow === captured && !dragged) captured.onClick(pointer);
        } else {
          captured.onDrag(pointer);
        }
        continue;
      }

      if (pointer.pressed) {
        const hit = UIEventSystem._hitTest(engine, pointer.position.x, pointer.position.y);
        if (hit) {
          pointer.consume();
          hit.onPointerDown(pointer);
          // 누름과 뗌이 같은 프레임에 들어온 짧은 탭: 다음 프레임엔 포인터가 지워지므로 여기서 바로 끝낸다
          if (pointer.released) {
            hit.onPointerUp(pointer);
            hit.onClick(pointer);
          } else {
            UIEventSystem._captured.set(pointer.id, hit);
          }
        }
      }
    }
  }

  // el 위쪽(부모들)에 있는 가장 가까운 UIScrollView. 없으면 null
  static _scrollAncestor(el) {
    for (let go = el.gameObject && el.gameObject.parent; go; go = go.parent) {
      const view = go.getComponent(UIScrollView);
      if (view && view.isActiveAndEnabled) return view;
    }
    return null;
  }

  // 화면 좌표(x, y)에 있는 맨 위 UI 요소. 없으면 null. 월드 입력이 UI 위인지 확인할 때 쓴다.
  static raycast(x, y) {
    const engine = UIEventSystem._engine;
    if (!engine || !engine.renderer) return null;
    return UIEventSystem._hitTest(engine, x, y);
  }

  // RenderPipeline이 정렬해둔 순서를 그대로 재사용 (그려진 순서의 역순으로 검사)
  // x, y는 포인터 좌표(CSS px). RectTransform.rect는 캔버스 device px라서 pixelRatio를 곱해 맞춘다.
  static _hitTest(engine, x, y) {
    const k = engine.pixelRatio || 1;
    x *= k;
    y *= k;
    const list = engine.renderer.sortedUIRenderers;
    for (let i = list.length - 1; i >= 0; i--) {
      const go = list[i].gameObject;
      if (!go) continue;

      const el = go.getComponent(UIElement);
      if (!el || !el.raycastTarget || !el.isActiveAndEnabled) continue;

      const rt = go.getComponent(RectTransform);
      if (!rt) continue;

      const r = rt.rect;
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height && UIMask.contains(rt, x, y)) {
        return el;
      }
    }
    return null;
  }
}

/* ---- systems/Tween.js ---- */
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


/* ---- systems/Timer.js ---- */
// 타이머: 시간 기다리기·나중에 부르기·반복. Tween 위에서 돌아서 Time.timeScale(일시정지·느리게)의 영향을 받는다.
//
//   await Timer.wait(0.5);                 // 0.5초 기다리기 (async 함수 안에서)
//   Timer.invoke(() => boom(), 1.2);       // 1.2초 뒤에 한 번
//   const h = Timer.repeat(() => tick(), 0.25, { count: 4 }); h.stop();  // 0.25초마다 4번 (count 없으면 멈출 때까지)
//
// 옵션: { unscaled: true } → timeScale 무시 (일시정지 메뉴 연출 등), { owner } → 그 오브젝트가 파괴되면 취소.
// 컴포넌트 안에서는 this.wait(초), this.invoke(fn, 초), this.repeat(fn, 간격)을 쓰면 owner가 자동으로 그 컴포넌트다.
// owner가 파괴되어 취소된 wait는 영영 끝나지 않는다 (그 뒤 코드가 실행되지 않음).
class Timer {
  static wait(seconds, options = {}) {
    return new Promise((resolve) => {
      Tween.delay(seconds, () => resolve(), options);
    });
  }

  // 핸들(TweenHandle)을 돌려준다. h.stop()으로 취소
  static invoke(fn, seconds, options = {}) {
    return Tween.delay(seconds, fn, options);
  }

  // interval초마다 fn(횟수). options.count가 있으면 그만큼만, options.immediate면 처음에도 바로 한 번
  static repeat(fn, interval, options = {}) {
    let n = 0;
    const count = options.count ?? Infinity;
    if (options.immediate) {
      fn(n++);
      if (n >= count) return Tween.delay(0, () => {}, options);
    }
    const h = Tween.value(0, 1, Math.max(interval, 1e-4), () => {}, {
      ...options,
      repeat: count === Infinity ? Infinity : count - n - 1,
      onRepeat: () => fn(n++)
    });
    h.then(() => fn(n++));
    return h;
  }
}

// 컴포넌트 편의 함수 (owner = 이 컴포넌트)
Component.prototype.wait = function (seconds, options = {}) {
  return Timer.wait(seconds, { owner: this, ...options });
};
Component.prototype.invoke = function (fn, seconds, options = {}) {
  return Timer.invoke(fn, seconds, { owner: this, ...options });
};
Component.prototype.repeat = function (fn, interval, options = {}) {
  return Timer.repeat(fn, interval, { owner: this, ...options });
};


/* ---- systems/Debug.js ---- */
// 디버그 표시: 화면 구석에 FPS, 프레임 시간, 그린 개수, 오브젝트 수, 트윈 수와 게임이 넣은 값을 보여 준다.
// showBounds면 월드 렌더러의 컬링 사각형(바운드)도 그린다.
//
//   Config.debug = true;            // 처음부터 켜기 (config.js). 실행 중에는 F3으로 켜고 끈다 (Input 버튼 "debug")
//   Debug.enabled = true;           // 코드로 켜고 끄기
//   Debug.set("턴", turn);          // 게임 값 한 줄 (같은 이름이면 덮어쓴다)
//   Debug.showBounds = true;
//   Debug.opacity = 0.5;            // 표시 창 전체 투명도 (0~1, 배경과 글자 모두)
//
// Engine이 시스템으로 등록하고, 화면을 다 그린 뒤 render(ctx, engine)를 부른다.
class Debug {
  static enabled = false;
  static showBounds = false;
  static showColliders = false; // true면 Physics 콜라이더 외곽선도 그린다
  static corner = 'top-left';      // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  static offset = { x: 8, y: 8 };  // 구석에서 띄울 거리 (CSS px)
  static opacity = 1;              // 표시 창 전체 투명도 (0~1)

  static _engine = null;
  static _values = new Map();
  static _objects = 0;
  static _frame = 0;
  static _frameMs = 0;

  static attach(engine) {
    Debug._engine = engine;
    if (typeof Config !== 'undefined' && Config.debug !== undefined) Debug.enabled = !!Config.debug;
    if (typeof Input !== 'undefined' && !Input.hasButton?.('debug')) Input.defineButton('debug', ['F3']);
  }

  static detach() {
    Debug._engine = null;
  }

  static set(name, value) {
    Debug._values.set(name, value);
  }

  static remove(name) {
    Debug._values.delete(name);
  }

  static update() {
    if (typeof Input !== 'undefined' && Input.getButtonDown('debug')) Debug.enabled = !Debug.enabled;
  }

  // 전체 GameObject 수 (30프레임에 한 번만 센다)
  static _countObjects(engine) {
    let n = 0;
    const walk = (go) => {
      n++;
      for (const t of go.transform.children) walk(t.gameObject);
    };
    for (const r of engine.roots) walk(r);
    return n;
  }

  static render(ctx, engine) {
    if (!Debug.enabled) return;
    const r = engine.renderer;
    if (Debug.showBounds && r && Camera.main) Debug._drawBounds(ctx, r, Camera.main);
    if (Debug.showColliders && typeof Physics !== 'undefined' && Camera.main) Physics.drawDebug(ctx, Camera.main);

    if (Debug._frame++ % 30 === 0) Debug._objects = Debug._countObjects(engine);
    Debug._frameMs += ((engine.frameMs ?? 0) - Debug._frameMs) * 0.1;

    const lines = [
      `FPS ${Time.fps.toFixed(0)}  프레임 ${Debug._frameMs.toFixed(2)}ms`,
      r ? `그린 것 ${r.drawCalls}  렌더러 ${r.visibleCount}  컬링 ${r.culledCount}` : null,
      `오브젝트 ${Debug._objects}  트윈 ${Tween.count}`
    ].filter(Boolean);
    for (const [k, v] of Debug._values) lines.push(`${k}: ${v}`);

    const k = engine.pixelRatio || 1;
    const size = 11 * k;
    const lh = Math.round(size * 1.35);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${size}px monospace`;
    let w = 0;
    for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
    const pad = 6 * k;
    const bw = w + pad * 2;
    const bh = lines.length * lh + pad * 2;
    const cw = engine.canvas.width;
    const ch = engine.canvas.height;
    const right = Debug.corner.endsWith('right');
    const bottom = Debug.corner.startsWith('bottom');
    const x = right ? cw - bw - Debug.offset.x * k : Debug.offset.x * k;
    const y = bottom ? ch - bh - Debug.offset.y * k : Debug.offset.y * k;

    const alpha = Math.min(1, Math.max(0, Debug.opacity));
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#9fe870';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad + i * lh));
    ctx.globalAlpha = 1;
  }

  static _drawBounds(ctx, r, camera) {
    const m = camera.viewMatrix;
    const b = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = 'rgba(80, 255, 120, 0.8)';
    ctx.lineWidth = 1;
    for (const rd of r._renderers) {
      if (!rd.getBounds(b)) continue;
      if (!camera.isInView(b.minX, b.minY, b.maxX, b.maxY)) continue;
      const x0 = m.a * b.minX + m.c * b.maxY + m.e;
      const y0 = m.b * b.minX + m.d * b.maxY + m.f;
      const x1 = m.a * b.maxX + m.c * b.minY + m.e;
      const y1 = m.b * b.maxX + m.d * b.minY + m.f;
      ctx.strokeRect(Math.round(Math.min(x0, x1)) + 0.5, Math.round(Math.min(y0, y1)) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }
}


/* ---- components/ParticleSystem.js ---- */
// 입자 시스템: 작은 네모 입자 수백~수천 개를 GameObject 없이 한 컴포넌트가 다룬다.
// - 입자 데이터는 미리 잡아 둔 Float32Array에 들어 있고, 죽은 입자는 맨 끝 것과 바꿔 지운다 (매 프레임 할당 없음).
// - 그릴 때는 색이 같은 입자끼리 몰아서 fillStyle을 한 번만 바꾼다.
// - 월드 좌표(Y-up) 기준. 중력은 아래로 당기려면 음수 (예: gravity: -300).
//
//   const ps = go.addComponent(new ParticleSystem({ capacity: 1024 }));
//   ps.emit(x, y, { count: 12, colors: ['#6a4', '#383'], speed: [20, 60], life: [0.3, 0.6], gravity: -300 });
class ParticleSystem extends Renderer {
  // 이미지(또는 그 영역)에서 많이 쓰인 색 몇 개를 뽑는다. 결과는 캐시. 입자 색을 그림에 맞출 때 쓴다.
  static _paletteCache = new Map();

  static paletteFromImage(image, region = null, max = 5) {
    if (!image) return ['#ffffff'];
    const r = region ?? { x: 0, y: 0, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
    const key = (image.src || image._paletteId || (image._paletteId = 'img' + ParticleSystem._paletteCache.size)) +
      `|${r.x},${r.y},${r.width},${r.height}|${max}`;
    const cached = ParticleSystem._paletteCache.get(key);
    if (cached) return cached;

    let colors = ['#ffffff'];
    try {
      const c = document.createElement('canvas');
      c.width = r.width;
      c.height = r.height;
      const g = c.getContext('2d');
      g.drawImage(image, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
      const data = g.getImageData(0, 0, r.width, r.height).data;
      const counts = new Map();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        // 비슷한 색은 묶는다 (채널당 16단계)
        const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
        const e = counts.get(k);
        if (e) { e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2]; }
        else counts.set(k, { n: 1, r: data[i], g: data[i + 1], b: data[i + 2] });
      }
      // 아주 어두운 색(외곽선)은 다른 색이 있으면 뺀다
      let entries = [...counts.values()];
      const bright = entries.filter((e) => Math.max(e.r, e.g, e.b) / e.n >= 48);
      if (bright.length) entries = bright;
      const top = entries.sort((a, b) => b.n - a.n).slice(0, max);
      if (top.length) colors = top.map((e) => `rgb(${Math.round(e.r / e.n)},${Math.round(e.g / e.n)},${Math.round(e.b / e.n)})`);
    } catch (err) {
      // 다른 출처 이미지 등으로 픽셀을 못 읽으면 흰색
    }
    ParticleSystem._paletteCache.set(key, colors);
    return colors;
  }

  constructor(options = {}) {
    super();
    this.capacity = options.capacity ?? 1024;
    this.sortingLayer = options.sortingLayer ?? 'Foreground';
    if (options.orderInLayer !== undefined) this.orderInLayer = options.orderInLayer;
    this.pixelSnap = options.pixelSnap ?? true;
    this.unscaled = options.unscaled ?? false;

    const n = this.capacity;
    this._x = new Float32Array(n);
    this._y = new Float32Array(n);
    this._vx = new Float32Array(n);
    this._vy = new Float32Array(n);
    this._age = new Float32Array(n);
    this._life = new Float32Array(n);
    this._size = new Float32Array(n);
    this._grav = new Float32Array(n);
    this._drag = new Float32Array(n);
    this._fade = new Uint8Array(n);
    this._color = new Uint16Array(n); // 색 목록(_colors)의 번호
    this.count = 0;

    this._colors = [];          // 색 문자열 목록 (번호 -> 색)
    this._colorIndex = new Map(); // 색 -> 번호
    this._bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    this._order = new Uint16Array(n); // 그릴 때 색별 정렬용
    this._bucket = [];
  }

  _colorId(color) {
    let id = this._colorIndex.get(color);
    if (id === undefined) {
      id = this._colors.length;
      this._colors.push(color);
      this._colorIndex.set(color, id);
    }
    return id;
  }

  // 입자 뿌리기 (월드 좌표). 범위 옵션은 숫자 하나 또는 [최소, 최대]
  //   count, colors(배열), speed, angle(라디안, 기본 위쪽), spread(라디안, 기본 2π = 사방),
  //   life(초), size(px), gravity, drag(초당 감속 비율), area(뿌리는 반경 px), fade(true면 끝에 흐려짐)
  emit(x, y, o = {}) {
    const count = o.count ?? 8;
    const colors = o.colors && o.colors.length ? o.colors : ['#ffffff'];
    const ids = colors.map((c) => this._colorId(c));
    const angle = o.angle ?? Math.PI / 2;
    const spread = o.spread ?? Math.PI * 2;
    const area = o.area ?? 0;
    const fade = (o.fade ?? true) ? 1 : 0;
    const gravity = o.gravity ?? 0;
    const drag = o.drag ?? 0;
    const rnd = ParticleSystem._range;

    for (let i = 0; i < count; i++) {
      if (this.count >= this.capacity) this._kill((Math.random() * this.count) | 0); // 가득 차면 아무거나 하나 밀어낸다
      const p = this.count++;
      const a = angle + (Math.random() - 0.5) * spread;
      const s = rnd(o.speed ?? [10, 40]);
      this._x[p] = x + (Math.random() * 2 - 1) * area;
      this._y[p] = y + (Math.random() * 2 - 1) * area;
      this._vx[p] = Math.cos(a) * s;
      this._vy[p] = Math.sin(a) * s;
      this._age[p] = 0;
      this._life[p] = Math.max(0.01, rnd(o.life ?? [0.3, 0.6]));
      this._size[p] = rnd(o.size ?? [1, 2]);
      this._grav[p] = gravity;
      this._drag[p] = drag;
      this._fade[p] = fade;
      this._color[p] = ids[(Math.random() * ids.length) | 0];
    }
    return this;
  }

  static _range(v) {
    return Array.isArray(v) ? v[0] + Math.random() * (v[1] - v[0]) : v;
  }

  clear() {
    this.count = 0;
  }

  _kill(i) {
    const last = --this.count;
    if (i === last) return;
    this._x[i] = this._x[last];
    this._y[i] = this._y[last];
    this._vx[i] = this._vx[last];
    this._vy[i] = this._vy[last];
    this._age[i] = this._age[last];
    this._life[i] = this._life[last];
    this._size[i] = this._size[last];
    this._grav[i] = this._grav[last];
    this._drag[i] = this._drag[last];
    this._fade[i] = this._fade[last];
    this._color[i] = this._color[last];
  }

  update(dt) {
    if (this.count === 0) return;
    if (this.unscaled) dt = Time.unscaledDeltaTime;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < this.count; i++) {
      const age = this._age[i] + dt;
      if (age >= this._life[i]) {
        this._kill(i);
        i--;
        continue;
      }
      this._age[i] = age;
      const d = this._drag[i];
      if (d > 0) {
        const k = Math.max(0, 1 - d * dt);
        this._vx[i] *= k;
        this._vy[i] *= k;
      }
      this._vy[i] += this._grav[i] * dt;
      const x = (this._x[i] += this._vx[i] * dt);
      const y = (this._y[i] += this._vy[i] * dt);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const b = this._bounds;
    b.minX = minX - 4;
    b.minY = minY - 4;
    b.maxX = maxX + 4;
    b.maxY = maxY + 4;
  }

  get isVisible() {
    return this.count > 0 && super.isVisible;
  }

  getBounds(out) {
    const b = this._bounds;
    out.minX = b.minX;
    out.minY = b.minY;
    out.maxX = b.maxX;
    out.maxY = b.maxY;
    return out;
  }

  render(ctx, camera) {
    const n = this.count;
    if (n === 0) return;
    const m = camera.viewMatrix;
    // 화면 픽셀 좌표로 직접 계산해서 그린다 (setTransform 한 번, 입자마다 행렬 없음)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sx = Math.hypot(m.a, m.b); // 월드 1px -> 화면 px 배율

    // 색별로 묶기 (계수 정렬)
    const nc = this._colors.length;
    const bucket = this._bucket;
    for (let c = 0; c <= nc; c++) bucket[c] = 0;
    for (let i = 0; i < n; i++) bucket[this._color[i] + 1]++;
    for (let c = 1; c <= nc; c++) bucket[c] += bucket[c - 1];
    const order = this._order;
    for (let i = 0; i < n; i++) order[bucket[this._color[i]]++] = i;

    const snap = this.pixelSnap;
    const baseAlpha = this.opacity;
    let lastColor = -1;
    let lastAlpha = -1;
    for (let j = 0; j < n; j++) {
      const i = order[j];
      const c = this._color[i];
      if (c !== lastColor) {
        ctx.fillStyle = this._colors[c];
        lastColor = c;
      }
      let alpha = baseAlpha;
      if (this._fade[i]) {
        const k = this._age[i] / this._life[i];
        if (k > 0.6) alpha *= 1 - (k - 0.6) / 0.4;
      }
      // 알파는 몇 단계로만 바꿔서 상태 변경을 줄인다
      alpha = Math.round(alpha * 8) / 8;
      if (alpha <= 0) continue;
      if (alpha !== lastAlpha) {
        ctx.globalAlpha = alpha;
        lastAlpha = alpha;
      }
      const wx = this._x[i];
      const wy = this._y[i];
      const px = m.a * wx + m.c * wy + m.e;
      const py = m.b * wx + m.d * wy + m.f;
      const size = Math.max(1, this._size[i] * sx);
      if (snap) ctx.fillRect(Math.round(px - size / 2), Math.round(py - size / 2), Math.round(size), Math.round(size));
      else ctx.fillRect(px - size / 2, py - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }
}


/* ---- components/SpriteAnimator.js ---- */
// 스프라이트 애니메이션: 스프라이트 시트를 잘라 만든 클립을 재생해서 같은 오브젝트의 SpriteRenderer 그림(영역)을 바꾼다.
//
//   const walk = AnimationClip.fromGrid("walk_down", "hero", { frameWidth: 16, frameHeight: 16, row: 0, count: 4, fps: 8 });
//   const anim = go.addComponent(new SpriteAnimator([walk, idle]));
//   anim.play("walk_down");                  // 같은 클립을 다시 부르면 이어서 (restart: true면 처음부터)
//   anim.speed = 1.5;                        // 재생 속도
//   anim.events.on("step", () => ...);      // 프레임 이벤트 (클립의 events: { 프레임 번호: "이름" })
//   anim.events.on("finish", () => ...);    // 반복하지 않는 클립이 끝났을 때
//
// 시간은 Time.deltaTime (timeScale 영향)을 쓴다. unscaled: true면 무시.
class AnimationClip {
  // frames: [{ x, y, width, height }] (시트 픽셀 좌표), image: Resource 키 또는 이미지
  constructor(name, options = {}) {
    this.name = name;
    this.image = options.image ?? null;
    this.frames = options.frames ?? [];
    this.fps = options.fps ?? 8;
    this.loop = options.loop ?? true;
    this.events = options.events ?? {}; // { 프레임 번호: 이벤트 이름 }
  }

  // 격자 시트에서 한 줄(row)의 start번째부터 count칸
  static fromGrid(name, image, options = {}) {
    const fw = options.frameWidth ?? 16;
    const fh = options.frameHeight ?? fw;
    const row = options.row ?? 0;
    const start = options.start ?? 0;
    const count = options.count ?? 1;
    const frames = [];
    for (let i = 0; i < count; i++) frames.push({ x: (start + i) * fw, y: row * fh, width: fw, height: fh });
    return new AnimationClip(name, { ...options, image, frames });
  }

  get duration() {
    return this.frames.length / this.fps;
  }
}

class SpriteAnimator extends Component {
  constructor(clips = [], options = {}) {
    super();
    this.clips = new Map();
    for (const c of clips) this.add(c);
    this.speed = options.speed ?? 1;
    this.unscaled = options.unscaled ?? false;
    this.events = new EventBus('SpriteAnimator');
    this.clip = null;
    this.frame = 0;
    this.time = 0;
    this.playing = false;
    this._autoplay = options.play ?? null;
  }

  add(clip) {
    this.clips.set(clip.name, clip);
    return this;
  }

  start() {
    if (this._autoplay) this.play(this._autoplay);
  }

  play(name, options = {}) {
    const clip = this.clips.get(name);
    if (!clip) throw new Error(`SpriteAnimator: 클립 없음 "${name}"`);
    if (options.speed !== undefined) this.speed = options.speed;
    if (this.clip === clip && this.playing && !options.restart) return this;
    this.clip = clip;
    this.time = 0;
    this.frame = 0;
    this.playing = true;
    this._apply();
    this._fire(0);
    return this;
  }

  stop() {
    this.playing = false;
    return this;
  }

  resume() {
    if (this.clip) this.playing = true;
    return this;
  }

  // 특정 프레임으로 (멈춘 채 보여 줄 때)
  setFrame(i) {
    if (!this.clip) return this;
    this.frame = Math.max(0, Math.min(this.clip.frames.length - 1, i));
    this.time = this.frame / this.clip.fps;
    this._apply();
    return this;
  }

  get isPlaying() {
    return this.playing;
  }

  update(dt) {
    if (!this.playing || !this.clip) return;
    const clip = this.clip;
    const n = clip.frames.length;
    if (n === 0) return;
    this.time += (this.unscaled ? Time.unscaledDeltaTime : dt) * this.speed;
    let next = Math.floor(this.time * clip.fps);
    if (next >= n) {
      if (clip.loop) {
        this.time %= clip.duration;
        next = Math.floor(this.time * clip.fps) % n;
      } else {
        next = n - 1;
        this.playing = false;
      }
    }
    if (next !== this.frame) {
      // 건너뛴 프레임의 이벤트도 부른다 (느린 프레임에서도 발소리를 놓치지 않게)
      let i = this.frame;
      while (i !== next) {
        i = (i + 1) % n;
        this._fire(i);
      }
      this.frame = next;
      this._apply();
    }
    if (!this.playing) this.events.emit('finish', { animator: this, clip });
  }

  _fire(i) {
    const name = this.clip.events[i];
    if (name) this.events.emit(name, { animator: this, clip: this.clip, frame: i });
  }

  _apply() {
    const sr = this.getComponent(SpriteRenderer);
    if (!sr) return;
    const f = this.clip.frames[this.frame];
    if (this.clip.image) {
      const img = typeof this.clip.image === 'string' ? Resource.image(this.clip.image) : this.clip.image;
      if (sr.sprite !== img) sr.sprite = img;
    }
    if (f) sr.region = { x: f.x, y: f.y, width: f.width, height: f.height };
  }
}


/* ---- physics/Physics.js ---- */
// KuntoGame 2D 물리: 콜라이더 + 균일 격자(spatial hash) 광역 탐색 + 연속(스윕) 이동 + 겹침/레이 질의.
//
// 모든 모양은 "둥근 상자" 하나로 통일한다: 중심, 회전, 반폭(hx, hy), 모서리 반지름(rr).
//   원      = hx=hy=0, rr=반지름
//   상자    = rr=0 (transform 회전이 있으면 회전된 상자)
//   캡슐    = hx=길이/2, hy=0, rr=반지름 (로컬 X축 방향)
// 그래서 점 거리·밀어내기·스윕(원 이동)·겹침 질의가 모든 모양에서 한 가지 수식으로 정확히 돈다.
//
// 핫패스(이동·질의)는 객체를 만들지 않는다. 결과는 미리 만들어 둔 배열/객체(Physics.hits, 호출자가 넘기는 out)에 채운다.
//
// 사용 예:
//   Physics.layer('Wall'); Physics.layer('Hero');                 // 레이어 이름 → 비트
//   go.addComponent(Collider2D.circle(6, { layer: 'Hero', body: 'kinematic' }));
//   Physics.moveCircle(x, y, 6, dx, dy, Physics.maskOf('Wall'), out)   // 막히면 미끄러지며 이동. out.x/out.y/out.hit/out.nx/out.ny/out.collider
//   Physics.overlapCircle(x, y, r, mask, Physics.hits)  → 개수 (Physics.hits[0..n-1]에 Collider2D)
//   Physics.overlapSector(x, y, range, dir, halfAngle, mask, arr)   // 부채꼴(근접 휘두르기)
//   Physics.overlapCapsule(ax, ay, bx, by, halfWidth, mask, arr)    // 굵은 선분(레이저)
//   Physics.castCircle(x, y, r, dx, dy, mask, out, filter, ctx)     // 원을 (dx,dy)만큼 쏘아 가장 먼저 맞는 콜라이더
//   Physics.raycast(x, y, dx, dy, mask, out)                        // 반지름 0 캐스트
//   컴포넌트에 onTriggerEnter/Stay/Exit(other) · onCollisionEnter/Stay/Exit(other) 를 두면 프레임 끝에 호출된다.

const PHYS_EPS = 1e-6;
const PHYS_SKIN = 0.02;      // 막힌 면에서 띄우는 간격 (떨림 방지)
const PHYS_CELL = 32;        // 격자 한 칸 크기
const PHYS_OFF = 512;        // 격자 키가 음수가 되지 않게 하는 오프셋 (칸 단위)
const PHYS_STRIDE = 1024;

// ---- 모양 수학 (로컬 좌표: 회전을 푼 상태) -----------------------------------------------------------
// 로컬 점 (u,v)에서 코어 상자까지의 거리 - rr (바깥이면 양수, 안이면 음수)
function _sd(c, u, v) {
  const qx = Math.abs(u) - c.hx, qy = Math.abs(v) - c.hy;
  if (qx > 0 || qy > 0) { const ax = qx > 0 ? qx : 0, ay = qy > 0 ? qy : 0; return Math.sqrt(ax * ax + ay * ay) - c.rr; }
  return Math.max(qx, qy) - c.rr; // 코어 안쪽: 가장 가까운 면까지 (음수)
}

class Collider2D extends Component {
  // opts: { layer:'Default', mask:-1(부딪히는 레이어들), isTrigger:false, body:'static'|'kinematic'|'dynamic', offsetX, offsetY, data }
  constructor(shape, a, b, opts = {}) {
    super();
    this.shape = shape;                      // 'circle' | 'box' | 'capsule'
    this.radius = 0; this.w = 0; this.h = 0; // circle: radius / box: w,h / capsule: w(길이), radius
    if (shape === 'circle') this.radius = a; else if (shape === 'box' || shape === 'rbox') { this.w = a; this.h = b; } else { this.w = a; this.radius = b; }
    this.layerName = opts.layer || 'Default'; this.bit = Physics.layer(this.layerName);
    this.mask = opts.mask ?? -1;
    this.isTrigger = !!opts.isTrigger;
    this.body = opts.body || 'static';       // static: 안 움직임(이동 안 하면 갱신 생략) / kinematic: 코드로 움직임 / dynamic: Rigidbody2D가 움직임
    this.offsetX = opts.offsetX || 0; this.offsetY = opts.offsetY || 0;
    this.data = opts.data || null;           // 게임이 붙여두는 자유 데이터 (예: 소유 컴포넌트)
    this.active = true;                      // false면 질의·충돌에서 빠진다 (gameObject 활성과 별개)
    // 월드 캐시
    this.cx = 0; this.cy = 0; this.cos = 1; this.sin = 0; this.hx = 0; this.hy = 0; this.rr = 0;
    this.minX = 0; this.minY = 0; this.maxX = 0; this.maxY = 0;
    this._gx0 = 1; this._gy0 = 1; this._gx1 = 0; this._gy1 = 0; // 등록된 격자 범위 (비어 있으면 x0>x1)
    this._registered = false; this._q = 0;
    this._touch = null; this._touchNext = null; // 트리거/충돌 진입 추적용 Set
    this._px = NaN; this._py = NaN; this._pr = NaN;
  }
  static circle(r, opts) { return new Collider2D('circle', r, 0, opts); }
  static box(w, h, opts) { return new Collider2D('box', w, h, opts); }
  static capsule(length, r, opts) { return new Collider2D('capsule', length, r, opts); }
  // 모서리가 둥근 상자 (w x h, 모서리 반지름 cr). 바위처럼 각진 데가 없는 모양에 쓴다.
  static rbox(w, h, cr, opts) { const c = new Collider2D('rbox', w, h, opts); c.radius = Math.min(cr, w / 2, h / 2); return c; }

  setRadius(r) { this.radius = r; this.sync(true); return this; }
  setSize(w, h) { this.w = w; if (h !== undefined) this.h = h; this.sync(true); return this; }

  onAttach() { Physics._add(this); if (!this._gameObject._collider) this._gameObject._collider = this; this.sync(true); } // 붙자마자 질의에 잡힌다 (다음 프레임을 기다리지 않음)
  onEnable() { Physics._add(this); if (this._gameObject && !this._gameObject._collider) this._gameObject._collider = this; this.sync(true); }
  onDisable() { Physics._remove(this); if (this._gameObject && this._gameObject._collider === this) this._gameObject._collider = null; }

  // transform에서 월드 모양을 다시 계산하고 격자를 갱신한다. 움직인 직후에 호출하면 질의가 바로 새 위치를 본다.
  sync(force) {
    const go = this._gameObject; if (!go) return;
    const m = go.transform.worldMatrix, rot = m.getRotation();
    let ox = this.offsetX, oy = this.offsetY, cx = m.e, cy = m.f;
    let cs = 1, sn = 0;
    if (rot !== 0) { cs = Math.cos(rot); sn = Math.sin(rot); }
    if (ox || oy) { cx += ox * cs - oy * sn; cy += ox * sn + oy * cs; }
    if (!force && cx === this._px && cy === this._py && rot === this._pr) return;
    this._px = cx; this._py = cy; this._pr = rot;
    this.cx = cx; this.cy = cy; this.cos = cs; this.sin = sn;
    if (this.shape === 'circle') { this.hx = 0; this.hy = 0; this.rr = this.radius; }
    else if (this.shape === 'box') { this.hx = this.w / 2; this.hy = this.h / 2; this.rr = 0; }
    else if (this.shape === 'rbox') { this.hx = this.w / 2 - this.radius; this.hy = this.h / 2 - this.radius; this.rr = this.radius; }
    else { this.hx = this.w / 2; this.hy = 0; this.rr = this.radius; }
    const ex = Math.abs(cs) * this.hx + Math.abs(sn) * this.hy + this.rr, ey = Math.abs(sn) * this.hx + Math.abs(cs) * this.hy + this.rr;
    this.minX = cx - ex; this.maxX = cx + ex; this.minY = cy - ey; this.maxY = cy + ey;
    if (this._registered) Physics._rehash(this);
  }

  // 월드 점 → 이 콜라이더까지의 부호 있는 거리 (겹치면 음수)
  distanceTo(x, y) {
    const dx = x - this.cx, dy = y - this.cy;
    return _sd(this, dx * this.cos + dy * this.sin, -dx * this.sin + dy * this.cos);
  }
  containsPoint(x, y) { return this.distanceTo(x, y) <= 0; }
}

class Rigidbody2D extends Component {
  // 가벼운 강체: 속도(vx,vy)·감속(drag)·반발(bounce). dynamic이면 고정 콜라이더에 스윕으로 막히고 미끄러진다. kinematic이면 그냥 움직인다.
  constructor(opts = {}) {
    super();
    this.type = opts.type || 'dynamic'; this.vx = opts.vx || 0; this.vy = opts.vy || 0;
    this.drag = opts.drag || 0; this.bounce = opts.bounce || 0; this.mask = opts.mask ?? -1; this.radius = opts.radius ?? null;
    this.grounded = false; this._out = { x: 0, y: 0, hit: false, nx: 0, ny: 0, t: 1, collider: null };
  }
  addForce(fx, fy) { this.vx += fx; this.vy += fy; }
  update(dt) {
    const col = this._gameObject.getComponent(Collider2D), t = this._gameObject.transform, m = t.worldMatrix;
    if (this.drag > 0) { const k = Math.max(0, 1 - this.drag * dt); this.vx *= k; this.vy *= k; }
    let dx = this.vx * dt, dy = this.vy * dt;
    if (this.type === 'kinematic' || !col) { t.setPosition(m.e + dx, m.f + dy); if (col) col.sync(); return; }
    const r = this.radius ?? (col.shape === 'circle' ? col.radius : Math.max(col.w, col.h) / 2), o = this._out;
    Physics.moveCircle(m.e, m.f, r, dx, dy, this.mask & col.mask, o, col);
    t.setPosition(o.x, o.y); col.sync();
    if (o.hit) {
      const vn = this.vx * o.nx + this.vy * o.ny;
      if (vn < 0) { this.vx -= (1 + this.bounce) * vn * o.nx; this.vy -= (1 + this.bounce) * vn * o.ny; }
    }
  }
}

class Physics {
  static _layers = { Default: 0 };
  static _nLayers = 1;
  static _matrix = [-1];                   // _matrix[a] = a가 부딪히는 레이어 비트들
  static _grid = new Map();                // key → Collider2D[]
  static _all = [];                        // 등록된 모든 콜라이더
  static _moving = [];
  static _evt = [];                        // 이벤트 콜백을 가진 콜라이더만 (프레임 끝 트리거 판정 대상)                     // body !== 'static' 인 것 (프레임 시작에 sync)
  static _stamp = 1;
  static hits = [];                        // 질의 결과 기본 버퍼 (쓰기 전에 길이는 호출이 돌려주는 n을 믿을 것)
  static _tmpOut = { x: 0, y: 0, hit: false, nx: 0, ny: 0, t: 1, collider: null };
  static _cast = { t: 0, nx: 0, ny: 0, collider: null };
  static _pairs = new Map();               // 진행 중인 트리거/충돌 쌍
  static events = true;                    // false면 onTrigger*/onCollision* 처리를 건너뛴다 (성능)

  // ---- 레이어 ----
  static layer(name) { // 이름 → 비트 (처음 부르면 등록)
    let i = Physics._layers[name];
    if (i === undefined) { i = Physics._nLayers++; if (i > 30) throw new Error('레이어는 31개까지'); Physics._layers[name] = i; Physics._matrix[i] = -1; }
    return 1 << i;
  }
  static maskOf(...names) { let m = 0; for (const n of names) m |= Physics.layer(n); return m; }
  // 두 레이어가 서로 부딪히는지 설정 (기본은 전부 true)
  static setCollision(a, b, on) {
    const A = Math.log2(Physics.layer(a)) | 0, B = Math.log2(Physics.layer(b)) | 0;
    if (on) { Physics._matrix[A] |= 1 << B; Physics._matrix[B] |= 1 << A; } else { Physics._matrix[A] &= ~(1 << B); Physics._matrix[B] &= ~(1 << A); }
  }
  static canCollide(a, b) { return (a.mask & b.bit) !== 0 && (b.mask & a.bit) !== 0 && (Physics._matrix[31 - Math.clz32(a.bit)] & b.bit) !== 0; }

  // ---- 등록 / 격자 ----
  static _key(gx, gy) { return (gx + PHYS_OFF) * PHYS_STRIDE + (gy + PHYS_OFF); }
  static _add(c) {
    if (c._registered) return; c._registered = true; c._ai = Physics._all.length; Physics._all.push(c);
    if (c.body !== 'static') { c._mi = Physics._moving.length; Physics._moving.push(c); } else c._mi = -1;
    c.events = false; const comps = c._gameObject && c._gameObject._components;
    if (comps) for (let i = 0; i < comps.length; i++) { const k = comps[i]; if (typeof k.onTriggerEnter === 'function' || typeof k.onTriggerStay === 'function' || typeof k.onCollisionStay === 'function' || typeof k.onTriggerExit === 'function' || typeof k.onCollisionEnter === 'function' || typeof k.onCollisionExit === 'function') c.events = true; }
    if (c.events) { c._ei = Physics._evt.length; Physics._evt.push(c); } else c._ei = -1;
    c._gx0 = 1; c._gx1 = 0; Physics._rehash(c);
  }
  static _remove(c) {
    if (!c._registered) return; c._registered = false;
    Physics._unhash(c);
    Physics._swapRemove(Physics._all, c, '_ai'); if (c._mi >= 0) Physics._swapRemove(Physics._moving, c, '_mi'); if (c._ei >= 0) Physics._swapRemove(Physics._evt, c, '_ei');
    if (c._touch) { for (const o of c._touch) Physics._pairs.delete(Physics._pairKey(c, o)); c._touch.clear(); }
  }
  static _swapRemove(arr, c, key) { const i = c[key], last = arr.pop(); if (last !== c) { arr[i] = last; last[key] = i; } c[key] = -1; }
  static _unhash(c) {
    for (let gx = c._gx0; gx <= c._gx1; gx++) for (let gy = c._gy0; gy <= c._gy1; gy++) {
      const arr = Physics._grid.get(Physics._key(gx, gy)); if (!arr) continue;
      const i = arr.indexOf(c); if (i >= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); }
    }
    c._gx0 = 1; c._gx1 = 0;
  }
  static _rehash(c) {
    const x0 = Math.floor(c.minX / PHYS_CELL), x1 = Math.floor(c.maxX / PHYS_CELL), y0 = Math.floor(c.minY / PHYS_CELL), y1 = Math.floor(c.maxY / PHYS_CELL);
    if (x0 === c._gx0 && x1 === c._gx1 && y0 === c._gy0 && y1 === c._gy1) return;
    Physics._unhash(c);
    c._gx0 = x0; c._gx1 = x1; c._gy0 = y0; c._gy1 = y1;
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const k = Physics._key(gx, gy); let arr = Physics._grid.get(k);
      if (!arr) { arr = []; Physics._grid.set(k, arr); }
      arr.push(c);
    }
  }
  // 모든 콜라이더 제거 (방을 바꿀 때 등)
  static clear() { for (const c of Physics._all.slice()) Physics._remove(c); Physics._grid.clear(); Physics._pairs.clear(); }

  // ---- 엔진 시스템 훅 ----
  static update() { // 프레임 시작: 움직이는 콜라이더를 최신 위치로
    const mv = Physics._moving; for (let i = 0; i < mv.length; i++) mv[i].sync();
  }
  static lateUpdate() { if (Physics.events) Physics._dispatch(); }

  // ---- 질의: 범위 안의 후보 모으기 ----
  // 후보를 _cand 버퍼에 담는다 (같은 콜라이더 중복 제거)
  static _cand = [];
  static _gather(minX, minY, maxX, maxY, mask) {
    const out = Physics._cand; out.length = 0; const st = ++Physics._stamp, grid = Physics._grid;
    const x0 = Math.floor(minX / PHYS_CELL), x1 = Math.floor(maxX / PHYS_CELL), y0 = Math.floor(minY / PHYS_CELL), y1 = Math.floor(maxY / PHYS_CELL);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const arr = grid.get((gx + PHYS_OFF) * PHYS_STRIDE + (gy + PHYS_OFF)); if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i]; if (c._q === st || !c.active || !(c.bit & mask) || c._gameObject._destroyed) continue;
        c._q = st; out.push(c);
      }
    }
    return out;
  }

  // 원 겹침. 결과는 arr에 담고 개수를 돌려준다. (트리거도 포함)
  static overlapCircle(x, y, r, mask, arr = Physics.hits) {
    const cand = Physics._gather(x - r, y - r, x + r, y + r, mask); let n = 0;
    for (let i = 0; i < cand.length; i++) { const c = cand[i]; if (c.distanceTo(x, y) < r) arr[n++] = c; }
    arr.length = n; return n;
  }
  // 축 정렬 상자 겹침
  static overlapBox(minX, minY, maxX, maxY, mask, arr = Physics.hits) {
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, hx = (maxX - minX) / 2, hy = (maxY - minY) / 2;
    const cand = Physics._gather(minX, minY, maxX, maxY, mask); let n = 0;
    for (let i = 0; i < cand.length; i++) {
      const c = cand[i]; // 후보 중심의 코어 상자 vs 이 상자 (정확: 코어를 rr만큼 부풀린 상자와의 거리)
      if (Physics._boxVsShape(cx, cy, hx, hy, c)) arr[n++] = c;
    }
    arr.length = n; return n;
  }
  static _boxVsShape(cx, cy, hx, hy, c) { // 축 정렬 상자 vs 둥근 상자 (분리축)
    const axs = Physics._axes; axs[0] = 1; axs[1] = 0; axs[2] = 0; axs[3] = 1; axs[4] = c.cos; axs[5] = c.sin; axs[6] = -c.sin; axs[7] = c.cos;
    for (let i = 0; i < 8; i += 2) {
      const ux = axs[i], uy = axs[i + 1];
      const ra = Math.abs(ux) * hx + Math.abs(uy) * hy;
      const rb = Math.abs(c.cos * ux + c.sin * uy) * c.hx + Math.abs(-c.sin * ux + c.cos * uy) * c.hy + c.rr;
      if (Math.abs((c.cx - cx) * ux + (c.cy - cy) * uy) > ra + rb) return false;
    }
    if (c.hx === 0 && c.hy === 0) { const px = Math.max(cx - hx, Math.min(cx + hx, c.cx)), py = Math.max(cy - hy, Math.min(cy + hy, c.cy)); return c.distanceTo(px, py) < 0; }
    return true; // 캡슐 끝의 둥근 모서리는 분리축 판정이라 아주 조금 후하다
  }
  static _axes = new Array(8);
  // 부채꼴(중심 x,y / 반지름 range / 방향 dir / 반각 half). 콜라이더 모양과 정확히 교차하는지 본다.
  // pad: 부채꼴을 바깥으로 살짝 키울 때(기본 0). half >= PI면 원.
  static overlapSector(x, y, range, dir, half, mask, arr = Physics.hits) {
    const cand = Physics._gather(x - range, y - range, x + range, y + range, mask); let n = 0;
    for (let i = 0; i < cand.length; i++) { const c = cand[i]; if (Physics._sectorHits(x, y, range, dir, half, c)) arr[n++] = c; }
    arr.length = n; return n;
  }
  static _sectorHits(x, y, range, dir, half, c) {
    const d0 = c.distanceTo(x, y);        // 부채꼴 꼭짓점에서 모양까지의 거리
    if (d0 >= range) return false;        // 반지름 밖
    if (half >= Math.PI - 1e-3) return true;
    if (d0 <= 0) return true;             // 꼭짓점이 모양 안
    const cd = Math.cos(dir), sd = Math.sin(dir);
    // 모양 위의 점 중 하나라도 부채꼴(반지름 안 + 각도 안)에 들어가는가.
    // 1) 모양 중심 방향 각도로 판정하되, 모양 크기만큼 각도를 넓힌다 (원 근사: asin(r/d)). 둥근 상자는 외접원 반지름으로 보수적으로 잡지 않고 코어 모서리까지 확인한다.
    const dx = c.cx - x, dy = c.cy - y, dist = Math.sqrt(dx * dx + dy * dy);
    if (c.hx === 0 && c.hy === 0) { // 원: 정확
      const rr = c.rr; if (dist <= rr) return true;
      const spread = Math.asin(Math.min(1, rr / dist)), df = Math.abs(Math.atan2(dx * sd - dy * cd, dx * cd + dy * sd));
      if (df <= half + spread) {
        if (df <= half) return true;                      // 중심이 각도 안 → 거리 d0<range 이미 통과
        // 각도 가장자리 반직선과 원의 거리
        const ea = (dx * sd - dy * cd) > 0 ? -half : half; // 가까운 가장자리
        const ex = Math.cos(dir + ea), ey = Math.sin(dir + ea), t = Math.max(0, Math.min(range, dx * ex + dy * ey));
        const px = ex * t - dx, py = ey * t - dy; return px * px + py * py < rr * rr;
      }
      return false;
    }
    // 상자/캡슐: (1) 꼭짓점에서 가장 가까운 점이 부채꼴 안, (2) 부채꼴 두 변이 모양을 가로지름, (3) 호 위 표본점이 모양 안
    { const px = c.cx - x, py = c.cy - y, ex = (px * c.cos + py * c.sin), ey = (-px * c.sin + py * c.cos); // 꼭짓점 기준 로컬 좌표 (부호 반대)
      // 꼭짓점을 코어 상자로 clamp해 가장 가까운 코어 점 Q (로컬), 거기서 꼭짓점 쪽으로 rr만큼 당긴 점이 모양 위의 최근접점
      const lu = Math.max(-c.hx, Math.min(c.hx, -ex)), lv = Math.max(-c.hy, Math.min(c.hy, -ey));
      const qx = c.cx + lu * c.cos - lv * c.sin, qy = c.cy + lu * c.sin + lv * c.cos, vx = qx - x, vy = qy - y, vl = Math.sqrt(vx * vx + vy * vy) || 1, k = Math.max(0, vl - c.rr) / vl;
      const nx = vx * k, ny = vy * k;
      if (Math.abs(Math.atan2(nx * sd - ny * cd, nx * cd + ny * sd)) <= half) return true; }
    for (let s = -1; s <= 1; s += 2) { const ex = Math.cos(dir + s * half), ey = Math.sin(dir + s * half); if (Physics._segDist(c, x, y, x + ex * range, y + ey * range) < 0) return true; }
    for (let i = 0; i <= 4; i++) { const a = dir - half + half * 2 * i / 4; if (c.distanceTo(x + Math.cos(a) * range * 0.999, y + Math.sin(a) * range * 0.999) < 0) return true; }
    return false;
  }
  // 선분 a→b 와 모양 사이의 거리 (겹치면 음수). 볼록 모양이라 선분을 따라 거리 함수가 볼록 → 삼분 탐색이 아니라 로컬 변환 후 정확히 계산한다.
  static _segDist(c, ax, ay, bx, by) {
    // 로컬 좌표로
    let u0 = (ax - c.cx) * c.cos + (ay - c.cy) * c.sin, v0 = -(ax - c.cx) * c.sin + (ay - c.cy) * c.cos;
    let u1 = (bx - c.cx) * c.cos + (by - c.cy) * c.sin, v1 = -(bx - c.cx) * c.sin + (by - c.cy) * c.cos;
    // 코어 상자 [-hx,hx]x[-hy,hy] 와 선분 사이의 최소 거리
    // 선분이 상자와 교차하면 0 → 코어 거리 0
    let t0 = 0, t1 = 1; const du = u1 - u0, dv = v1 - v0;
    let inter = true;
    for (let ax2 = 0; ax2 < 2; ax2++) {
      const p = ax2 ? v0 : u0, d = ax2 ? dv : du, lo = ax2 ? -c.hy : -c.hx, hi = ax2 ? c.hy : c.hx;
      if (Math.abs(d) < 1e-12) { if (p < lo || p > hi) { inter = false; break; } }
      else { let ta = (lo - p) / d, tb = (hi - p) / d; if (ta > tb) { const s = ta; ta = tb; tb = s; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) { inter = false; break; } }
    }
    if (inter) return -c.rr;
    // 교차하지 않으면: 선분 끝점→상자 거리, 상자 모서리→선분 거리의 최솟값 (볼록 다각형 간 거리의 정확한 공식)
    let best = Math.min(Physics._coreDist(c, u0, v0), Physics._coreDist(c, u1, v1));
    for (let sx = -1; sx <= 1; sx += 2) for (let sy = -1; sy <= 1; sy += 2) {
      const px = sx * c.hx, py = sy * c.hy, t = du * du + dv * dv > 1e-12 ? Math.max(0, Math.min(1, ((px - u0) * du + (py - v0) * dv) / (du * du + dv * dv))) : 0;
      const qx = u0 + du * t - px, qy = v0 + dv * t - py, d = Math.sqrt(qx * qx + qy * qy); if (d < best) best = d;
    }
    return best - c.rr;
  }
  static _coreDist(c, u, v) { const qx = Math.max(Math.abs(u) - c.hx, 0), qy = Math.max(Math.abs(v) - c.hy, 0); return Math.sqrt(qx * qx + qy * qy); }

  // 굵은 선분(캡슐 모양) 겹침 — 레이저·직선 공격용. halfWidth는 폭의 절반.
  static overlapCapsule(ax, ay, bx, by, halfWidth, mask, arr = Physics.hits) {
    const cand = Physics._gather(Math.min(ax, bx) - halfWidth, Math.min(ay, by) - halfWidth, Math.max(ax, bx) + halfWidth, Math.max(ay, by) + halfWidth, mask); let n = 0;
    for (let i = 0; i < cand.length; i++) { const c = cand[i]; if (Physics._segDist(c, ax, ay, bx, by) < halfWidth) arr[n++] = c; }
    arr.length = n; return n;
  }
  // 가장 가까운 겹치는 콜라이더 하나 (없으면 null)
  static pointQuery(x, y, r, mask, filter) {
    const cand = Physics._gather(x - r, y - r, x + r, y + r, mask); let best = null, bd = Infinity;
    for (let i = 0; i < cand.length; i++) { const c = cand[i]; if (filter && !filter(c)) continue; const d = c.distanceTo(x, y); if (d < r && d < bd) { bd = d; best = c; } }
    return best;
  }

  // ---- 스윕(연속) ----
  // 로컬 좌표에서 반지름 r 원이 (u0,v0)→+(du,dv) 로 움직일 때 c(코어 상자 ⊕ rr)와 처음 닿는 시간 t∈[0,1] (없으면 2), 법선은 Physics._cast에.
  static _sweepShape(c, x, y, dx, dy, r) {
    const cs = c.cos, sn = c.sin, ox = x - c.cx, oy = y - c.cy;
    const u0 = ox * cs + oy * sn, v0 = -ox * sn + oy * cs, du = dx * cs + dy * sn, dv = -dx * sn + dy * cs;
    const R = c.rr + r, hx = c.hx, hy = c.hy;
    let bestT = 2, bnx = 0, bny = 0;
    // 상자 두 개 (x 방향으로 부풀린 것, y 방향으로 부풀린 것)
    for (let pass = 0; pass < 2; pass++) {
      const ex = pass ? hx : hx + R, ey = pass ? hy + R : hy;
      let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0, ok = true;
      // x slab
      if (Math.abs(du) < 1e-12) { if (u0 < -ex || u0 > ex) ok = false; }
      else {
        let ta = (-ex - u0) / du, tb = (ex - u0) / du, sa = -1; if (ta > tb) { const s = ta; ta = tb; tb = s; sa = 1; }
        if (ta > tmin) { tmin = ta; nx = sa; ny = 0; } if (tb < tmax) tmax = tb;
      }
      if (ok) {
        if (Math.abs(dv) < 1e-12) { if (v0 < -ey || v0 > ey) ok = false; }
        else {
          let ta = (-ey - v0) / dv, tb = (ey - v0) / dv, sa = -1; if (ta > tb) { const s = ta; ta = tb; tb = s; sa = 1; }
          if (ta > tmin) { tmin = ta; nx = 0; ny = sa; } if (tb < tmax) tmax = tb;
        }
      }
      if (ok && tmin <= tmax && tmax >= 0 && tmin <= 1 && tmin < bestT) {
        if (tmin < -PHYS_EPS) continue; // 시작부터 안쪽 (밀어내기에서 처리)
        // 부풀린 상자 한쪽 면에서 맞았는지 확인: 모서리 영역(코어 밖 양축)이면 원 쪽이 담당
        const t = Math.max(0, tmin), hu = u0 + du * t, hv = v0 + dv * t;
        if (pass === 0 ? Math.abs(hv) <= hy + 1e-9 : Math.abs(hu) <= hx + 1e-9) { bestT = t; bnx = nx; bny = ny; }
      }
    }
    // 모서리 원 4개 (코어 모서리에서 반지름 R)
    if (R > 0) for (let sx = -1; sx <= 1; sx += 2) for (let sy = -1; sy <= 1; sy += 2) {
      const px = u0 - sx * hx, py = v0 - sy * hy, a = du * du + dv * dv; if (a < 1e-12) continue;
      const b = px * du + py * dv, cc = px * px + py * py - R * R; if (cc < 0) continue; // 이미 안쪽
      if (b >= 0) continue; // 멀어지는 중
      const disc = b * b - a * cc; if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / a; if (t < 0 || t > 1 || t >= bestT) continue;
      const qx = px + du * t, qy = py + dv * t, L = Math.sqrt(qx * qx + qy * qy) || 1;
      bestT = t; bnx = qx / L; bny = qy / L;
    }
    if (bestT > 1) return 2;
    // 법선을 월드로
    Physics._cast.nx = bnx * cs - bny * sn; Physics._cast.ny = bnx * sn + bny * cs;
    return bestT;
  }
  // 이미 겹쳐 있으면 밖으로 밀어낸다 (Physics._push에 결과). 겹쳤으면 true
  static _push = { x: 0, y: 0, nx: 0, ny: 0 };
  static _depenetrate(c, x, y, r) {
    const dx = x - c.cx, dy = y - c.cy, u = dx * c.cos + dy * c.sin, v = -dx * c.sin + dy * c.cos;
    const qx = Math.abs(u) - c.hx, qy = Math.abs(v) - c.hy, R = c.rr + r, P = Physics._push;
    let nu, nv, pen;
    if (qx > 0 || qy > 0) {
      const ax = qx > 0 ? qx : 0, ay = qy > 0 ? qy : 0, d = Math.sqrt(ax * ax + ay * ay);
      if (d >= R) return false;
      nu = (ax / d) * (u < 0 ? -1 : 1); nv = (ay / d) * (v < 0 ? -1 : 1); pen = R - d;
    } else { // 코어 안: 가장 얕은 축으로
      if (-qx < -qy) { nu = u < 0 ? -1 : 1; nv = 0; pen = -qx + R; } else { nu = 0; nv = v < 0 ? -1 : 1; pen = -qy + R; }
    }
    const wnx = nu * c.cos - nv * c.sin, wny = nu * c.sin + nv * c.cos;
    P.nx = wnx; P.ny = wny; P.x = x + wnx * (pen + PHYS_SKIN); P.y = y + wny * (pen + PHYS_SKIN);
    return true;
  }
  // 원(x,y,r)을 (dx,dy)만큼 움직인다. 고정 콜라이더(트리거 아님, 마스크·레이어 매트릭스 통과)에 막히면 미끄러진다. 터널링 없음.
  // self: 자기 자신 콜라이더(제외·레이어 판정용, 생략 가능). out.x/out.y 최종 위치, out.hit/nx/ny/collider 마지막으로 막힌 면.
  static moveCircle(x, y, r, dx, dy, mask, out = Physics._tmpOut, self = null) {
    out.hit = false; out.nx = 0; out.ny = 0; out.collider = null;
    // 시작 겹침 해소 (최대 4회)
    for (let it = 0; it < 4; it++) {
      const cand = Physics._gather(x - r - 1, y - r - 1, x + r + 1, y + r + 1, mask); let moved = false;
      for (let i = 0; i < cand.length; i++) {
        const c = cand[i]; if (c === self || c.isTrigger || (self && !Physics.canCollide(self, c))) continue;
        if (Physics._depenetrate(c, x, y, r)) { x = Physics._push.x; y = Physics._push.y; out.hit = true; out.nx = Physics._push.nx; out.ny = Physics._push.ny; out.collider = c; moved = true; }
      }
      if (!moved) break;
    }
    let rx = dx, ry = dy;
    for (let iter = 0; iter < 4; iter++) {
      const len2 = rx * rx + ry * ry; if (len2 < 1e-12) break;
      const cand = Physics._gather(Math.min(x, x + rx) - r - 1, Math.min(y, y + ry) - r - 1, Math.max(x, x + rx) + r + 1, Math.max(y, y + ry) + r + 1, mask);
      let bt = 2, bnx = 0, bny = 0, bc = null;
      for (let i = 0; i < cand.length; i++) {
        const c = cand[i]; if (c === self || c.isTrigger || (self && !Physics.canCollide(self, c))) continue;
        const t = Physics._sweepShape(c, x, y, rx, ry, r);
        if (t < bt) { bt = t; bnx = Physics._cast.nx; bny = Physics._cast.ny; bc = c; }
      }
      if (bt > 1) { x += rx; y += ry; break; }
      x += rx * bt + bnx * PHYS_SKIN; y += ry * bt + bny * PHYS_SKIN;
      out.hit = true; out.nx = bnx; out.ny = bny; out.collider = bc;
      const rem = 1 - bt, dot = (rx * bnx + ry * bny) * rem; // 남은 이동에서 법선 성분을 제거 (미끄러짐)
      rx = rx * rem - bnx * dot; ry = ry * rem - bny * dot;
    }
    out.x = x; out.y = y; return out;
  }
  // 원을 (dx,dy)만큼 쏘아 가장 먼저 맞는 콜라이더. out.t∈[0,1], out.nx/ny 법선, out.collider, out.x/out.y 닿는 순간 원 중심. 맞았으면 true.
  // filter(collider, ctx) 가 false를 돌려주면 건너뛴다. 이미 겹쳐 있는 콜라이더는 t=0으로 친다(includeOverlap).
  static castCircle(x, y, r, dx, dy, mask, out = Physics._tmpOut, filter = null, ctx = null, includeOverlap = true) {
    out.hit = false; out.collider = null; out.t = 1; out.x = x + dx; out.y = y + dy; out.nx = 0; out.ny = 0;
    const cand = Physics._gather(Math.min(x, x + dx) - r - 1, Math.min(y, y + dy) - r - 1, Math.max(x, x + dx) + r + 1, Math.max(y, y + dy) + r + 1, mask);
    let bt = 2, bc = null, bnx = 0, bny = 0;
    for (let i = 0; i < cand.length; i++) {
      const c = cand[i]; if (filter && !filter(c, ctx)) continue;
      let t, nx, ny;
      if (c.distanceTo(x, y) < r) { // 시작부터 겹침
        if (!includeOverlap) continue;
        t = 0; const ddx = x - c.cx, ddy = y - c.cy, L = Math.sqrt(ddx * ddx + ddy * ddy) || 1; nx = ddx / L; ny = ddy / L;
      } else { t = Physics._sweepShape(c, x, y, dx, dy, r); if (t > 1) continue; nx = Physics._cast.nx; ny = Physics._cast.ny; }
      if (t < bt) { bt = t; bc = c; bnx = nx; bny = ny; }
    }
    if (!bc) return false;
    out.hit = true; out.t = bt; out.collider = bc; out.nx = bnx; out.ny = bny; out.x = x + dx * bt; out.y = y + dy * bt; return true;
  }
  static raycast(x, y, dx, dy, mask, out = Physics._tmpOut, filter = null, ctx = null) { return Physics.castCircle(x, y, 0, dx, dy, mask, out, filter, ctx, false); }

  // ---- 트리거/충돌 이벤트 (프레임 끝) ----
  static _pairKey(a, b) { return a._id < b._id ? a._id * 1048576 + b._id : b._id * 1048576 + a._id; }
  static _nextId = 1;
  static _dispatch() {
    const mv = Physics._evt, pairs = Physics._pairs; if (!mv.length) { if (pairs.size) pairs.clear(); return; }
    const st = ++Physics._stamp;
    for (let i = 0; i < mv.length; i++) {
      const a = mv[i]; if (!a.active || !a._gameObject || a._gameObject._destroyed) continue;
      if (a._id === undefined) a._id = Physics._nextId++;
      const cand = Physics._gather(a.minX, a.minY, a.maxX, a.maxY, a.mask);
      for (let j = 0; j < cand.length; j++) {
        const b = cand[j]; if (b === a) continue;
        if (b._id === undefined) b._id = Physics._nextId++;
        if (b.events && b._id < a._id) continue; // 둘 다 이벤트 대상이면 한 번만
        if (!Physics.canCollide(a, b)) continue;
        if (!Physics._shapeOverlap(a, b)) continue;
        const k = Physics._pairKey(a, b);
        let p = pairs.get(k);
        if (!p) { p = { a, b, seen: 0, trig: a.isTrigger || b.isTrigger }; pairs.set(k, p); p.seen = st; Physics._fire(p, 1); }
        else { p.seen = st; Physics._fire(p, 2); } // 2 = 머무는 중 (onTriggerStay / onCollisionStay)
      }
    }
    for (const [k, p] of pairs) if (p.seen !== st) {
      // 이번 프레임에 안 보였으면 종료 — 단, 둘 중 하나가 비활성/제거여도 종료
      pairs.delete(k); Physics._fire(p, 0);
    }
  }
  static _fire(p, enter) {
    const a = p.a, b = p.b, ev = p.trig ? (enter === 1 ? 'onTriggerEnter' : enter === 2 ? 'onTriggerStay' : 'onTriggerExit') : (enter === 1 ? 'onCollisionEnter' : enter === 2 ? 'onCollisionStay' : 'onCollisionExit');
    for (let s = 0; s < 2; s++) {
      const me = s ? b : a, other = s ? a : b, go = me._gameObject; if (!go) continue;
      const comps = go._components;
      for (let i = 0; i < comps.length; i++) { const f = comps[i][ev]; if (typeof f === 'function') f.call(comps[i], other); }
    }
  }
  // 두 콜라이더가 겹치는가 (둥근 상자끼리): a의 코어 점들 중 b까지 가장 가까운 거리 판정
  static _shapeOverlap(a, b) {
    if (a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY) return false;
    if (a.hx === 0 && a.hy === 0) return b.distanceTo(a.cx, a.cy) < a.rr;
    if (b.hx === 0 && b.hy === 0) return a.distanceTo(b.cx, b.cy) < b.rr;
    // 둘 다 상자/캡슐: b의 코어 모서리·중심이 a 안인지 + 반대로 (SAT 근사: 분리축 4개)
    const A = a, B = b, axes = [A.cos, A.sin, -A.sin, A.cos, B.cos, B.sin, -B.sin, B.cos];
    for (let i = 0; i < 8; i += 2) {
      const ux = axes[i], uy = axes[i + 1];
      const ra = Math.abs(A.cos * ux + A.sin * uy) * A.hx + Math.abs(-A.sin * ux + A.cos * uy) * A.hy + A.rr;
      const rb = Math.abs(B.cos * ux + B.sin * uy) * B.hx + Math.abs(-B.sin * ux + B.cos * uy) * B.hy + B.rr;
      if (Math.abs((B.cx - A.cx) * ux + (B.cy - A.cy) * uy) > ra + rb) return false;
    }
    return true;
  }
}

// 콜라이더 외곽선 표시 (Debug.enabled && Debug.showColliders). 초록=고정, 노랑=움직임, 하늘=트리거
Physics.drawDebug = function (ctx, camera) {
  const m = camera.viewMatrix; ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f); ctx.lineWidth = 0.8;
  const all = Physics._all;
  for (let i = 0; i < all.length; i++) {
    const c = all[i]; if (!c.active || !camera.isInView(c.minX, c.minY, c.maxX, c.maxY)) continue;
    ctx.strokeStyle = c.isTrigger ? '#4fc3f7' : c.body === 'static' ? '#66ff66' : '#ffee58';
    ctx.save(); ctx.translate(c.cx, c.cy); ctx.rotate(Math.atan2(c.sin, c.cos)); ctx.beginPath();
    if (c.hx === 0 && c.hy === 0) ctx.arc(0, 0, c.rr, 0, 7);
    else if (c.rr === 0) ctx.rect(-c.hx, -c.hy, c.hx * 2, c.hy * 2);
    else { const h = Math.PI / 2; ctx.arc(c.hx, c.hy, c.rr, 0, h); ctx.arc(-c.hx, c.hy, c.rr, h, 2 * h); ctx.arc(-c.hx, -c.hy, c.rr, 2 * h, 3 * h); ctx.arc(c.hx, -c.hy, c.rr, 3 * h, 4 * h); ctx.closePath(); } // 캡슐·둥근 상자
    ctx.stroke(); ctx.restore();
  }
};


/* ---- vendor/planck.min.js ---- */
/* planck.js 1.5.1 (Box2D port) - MIT License, (c) Erin Catto, Ali Shakiba. Vendored unmodified (dist/planck.min.js) so the engine has no CDN dependency. https://github.com/piqnt/planck.js */
(function(global,factory){typeof exports==="object"&&typeof module!=="undefined"?factory(exports):typeof define==="function"&&define.amd?define(["exports"],factory):(global=typeof globalThis!=="undefined"?globalThis:global||self,factory(global.planck={}))})(this,function(exports2){"use strict";
/**
 * Planck.js v1.5.1
 * @license The MIT license
 * @copyright Copyright (c) 2026 Erin Catto, Ali Shakiba
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */var extendStatics=function(d2,b2){extendStatics=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(d3,b3){d3.__proto__=b3}||function(d3,b3){for(var p in b3)if(Object.prototype.hasOwnProperty.call(b3,p))d3[p]=b3[p]};return extendStatics(d2,b2)};function __extends(d2,b2){if(typeof b2!=="function"&&b2!==null)throw new TypeError("Class extends value "+String(b2)+" is not a constructor or null");extendStatics(d2,b2);function __(){this.constructor=d2}d2.prototype=b2===null?Object.create(b2):(__.prototype=b2.prototype,new __)}var __assign=function(){__assign=Object.assign||function __assign2(t){for(var s2,i=1,n2=arguments.length;i<n2;i++){s2=arguments[i];for(var p in s2)if(Object.prototype.hasOwnProperty.call(s2,p))t[p]=s2[p]}return t};return __assign.apply(this,arguments)};typeof SuppressedError==="function"?SuppressedError:function(error,suppressed,message){var e3=new Error(message);return e3.name="SuppressedError",e3.error=error,e3.suppressed=suppressed,e3};var options=function(input2,defaults){if(input2===null||typeof input2==="undefined"){input2={}}var output2=__assign({},input2);for(var key in defaults){if(defaults.hasOwnProperty(key)&&typeof input2[key]==="undefined"){output2[key]=defaults[key]}}if(typeof Object.getOwnPropertySymbols==="function"){var symbols=Object.getOwnPropertySymbols(defaults);for(var i=0;i<symbols.length;i++){var symbol=symbols[i];if(defaults.propertyIsEnumerable(symbol)&&typeof input2[symbol]==="undefined"){output2[symbol]=defaults[symbol]}}}return output2};var math_random=Math.random;var EPSILON=1e-9;var isFinite=Number.isFinite;function nextPowerOfTwo(x2){x2|=x2>>1;x2|=x2>>2;x2|=x2>>4;x2|=x2>>8;x2|=x2>>16;return x2+1}function isPowerOfTwo(x2){return x2>0&&(x2&x2-1)===0}function mod(num,min,max){if(typeof min==="undefined"){max=1;min=0}else if(typeof max==="undefined"){max=min;min=0}if(max>min){num=(num-min)%(max-min);return num+(num<0?max:min)}else{num=(num-max)%(min-max);return num+(num<=0?min:max)}}function clamp(num,min,max){if(num<min){return min}else if(num>max){return max}else{return num}}function random(min,max){if(typeof min==="undefined"){max=1;min=0}else if(typeof max==="undefined"){max=min;min=0}return min===max?min:math_random()*(max-min)+min}var math=Object.create(Math);math.EPSILON=EPSILON;math.isFinite=isFinite;math.nextPowerOfTwo=nextPowerOfTwo;math.isPowerOfTwo=isPowerOfTwo;math.mod=mod;math.clamp=clamp;math.random=random;var math_abs$9=Math.abs;var math_sqrt$5=Math.sqrt;var math_max$8=Math.max;var math_min$8=Math.min;var Vec2=function(){function Vec22(x2,y){if(!(this instanceof Vec22)){return new Vec22(x2,y)}if(typeof x2==="undefined"){this.x=0;this.y=0}else if(typeof x2==="object"){this.x=x2.x;this.y=x2.y}else{this.x=x2;this.y=y}}Vec22.prototype._serialize=function(){return{x:this.x,y:this.y}};Vec22._deserialize=function(data){var obj=Object.create(Vec22.prototype);obj.x=data.x;obj.y=data.y;return obj};Vec22.zero=function(){var obj=Object.create(Vec22.prototype);obj.x=0;obj.y=0;return obj};Vec22.neo=function(x2,y){var obj=Object.create(Vec22.prototype);obj.x=x2;obj.y=y;return obj};Vec22.clone=function(v3){return Vec22.neo(v3.x,v3.y)};Vec22.prototype.toString=function(){return JSON.stringify(this)};Vec22.isValid=function(obj){if(obj===null||typeof obj==="undefined"){return false}return Number.isFinite(obj.x)&&Number.isFinite(obj.y)};Vec22.assert=function(o){};Vec22.prototype.clone=function(){return Vec22.clone(this)};Vec22.prototype.setZero=function(){this.x=0;this.y=0;return this};Vec22.prototype.set=function(x2,y){if(typeof x2==="object"){this.x=x2.x;this.y=x2.y}else{this.x=x2;this.y=y}return this};Vec22.prototype.setNum=function(x2,y){this.x=x2;this.y=y;return this};Vec22.prototype.setVec2=function(value){this.x=value.x;this.y=value.y;return this};Vec22.prototype.wSet=function(a2,v3,b2,w){if(typeof b2!=="undefined"||typeof w!=="undefined"){return this.setCombine(a2,v3,b2,w)}else{return this.setMul(a2,v3)}};Vec22.prototype.setCombine=function(a2,v3,b2,w){var x2=a2*v3.x+b2*w.x;var y=a2*v3.y+b2*w.y;this.x=x2;this.y=y;return this};Vec22.prototype.setMul=function(a2,v3){var x2=a2*v3.x;var y=a2*v3.y;this.x=x2;this.y=y;return this};Vec22.prototype.add=function(w){this.x+=w.x;this.y+=w.y;return this};Vec22.prototype.wAdd=function(a2,v3,b2,w){if(typeof b2!=="undefined"||typeof w!=="undefined"){return this.addCombine(a2,v3,b2,w)}else{return this.addMul(a2,v3)}};Vec22.prototype.addCombine=function(a2,v3,b2,w){var x2=a2*v3.x+b2*w.x;var y=a2*v3.y+b2*w.y;this.x+=x2;this.y+=y;return this};Vec22.prototype.addMul=function(a2,v3){var x2=a2*v3.x;var y=a2*v3.y;this.x+=x2;this.y+=y;return this};Vec22.prototype.wSub=function(a2,v3,b2,w){if(typeof b2!=="undefined"||typeof w!=="undefined"){return this.subCombine(a2,v3,b2,w)}else{return this.subMul(a2,v3)}};Vec22.prototype.subCombine=function(a2,v3,b2,w){var x2=a2*v3.x+b2*w.x;var y=a2*v3.y+b2*w.y;this.x-=x2;this.y-=y;return this};Vec22.prototype.subMul=function(a2,v3){var x2=a2*v3.x;var y=a2*v3.y;this.x-=x2;this.y-=y;return this};Vec22.prototype.sub=function(w){this.x-=w.x;this.y-=w.y;return this};Vec22.prototype.mul=function(m){this.x*=m;this.y*=m;return this};Vec22.prototype.length=function(){return Vec22.lengthOf(this)};Vec22.prototype.lengthSquared=function(){return Vec22.lengthSquared(this)};Vec22.prototype.normalize=function(){var length=this.length();if(length<EPSILON){return 0}var invLength=1/length;this.x*=invLength;this.y*=invLength;return length};Vec22.normalize=function(v3){var length=Vec22.lengthOf(v3);if(length<EPSILON){return Vec22.zero()}var invLength=1/length;return Vec22.neo(v3.x*invLength,v3.y*invLength)};Vec22.lengthOf=function(v3){return math_sqrt$5(v3.x*v3.x+v3.y*v3.y)};Vec22.lengthSquared=function(v3){return v3.x*v3.x+v3.y*v3.y};Vec22.distance=function(v3,w){var dx=v3.x-w.x;var dy=v3.y-w.y;return math_sqrt$5(dx*dx+dy*dy)};Vec22.distanceSquared=function(v3,w){var dx=v3.x-w.x;var dy=v3.y-w.y;return dx*dx+dy*dy};Vec22.areEqual=function(v3,w){return v3===w||typeof w==="object"&&w!==null&&v3.x===w.x&&v3.y===w.y};Vec22.skew=function(v3){return Vec22.neo(-v3.y,v3.x)};Vec22.dot=function(v3,w){return v3.x*w.x+v3.y*w.y};Vec22.cross=function(v3,w){if(typeof w==="number"){return Vec22.neo(w*v3.y,-w*v3.x)}else if(typeof v3==="number"){return Vec22.neo(-v3*w.y,v3*w.x)}else{return v3.x*w.y-v3.y*w.x}};Vec22.crossVec2Vec2=function(v3,w){return v3.x*w.y-v3.y*w.x};Vec22.crossVec2Num=function(v3,w){return Vec22.neo(w*v3.y,-w*v3.x)};Vec22.crossNumVec2=function(v3,w){return Vec22.neo(-v3*w.y,v3*w.x)};Vec22.addCross=function(a2,v3,w){if(typeof w==="number"){return Vec22.neo(w*v3.y+a2.x,-w*v3.x+a2.y)}else if(typeof v3==="number"){return Vec22.neo(-v3*w.y+a2.x,v3*w.x+a2.y)}};Vec22.addCrossVec2Num=function(a2,v3,w){return Vec22.neo(w*v3.y+a2.x,-w*v3.x+a2.y)};Vec22.addCrossNumVec2=function(a2,v3,w){return Vec22.neo(-v3*w.y+a2.x,v3*w.x+a2.y)};Vec22.add=function(v3,w){return Vec22.neo(v3.x+w.x,v3.y+w.y)};Vec22.wAdd=function(a2,v3,b2,w){if(typeof b2!=="undefined"||typeof w!=="undefined"){return Vec22.combine(a2,v3,b2,w)}else{return Vec22.mulNumVec2(a2,v3)}};Vec22.combine=function(a2,v3,b2,w){return Vec22.zero().setCombine(a2,v3,b2,w)};Vec22.sub=function(v3,w){return Vec22.neo(v3.x-w.x,v3.y-w.y)};Vec22.mul=function(a2,b2){if(typeof a2==="object"){return Vec22.neo(a2.x*b2,a2.y*b2)}else if(typeof b2==="object"){return Vec22.neo(a2*b2.x,a2*b2.y)}};Vec22.mulVec2Num=function(a2,b2){return Vec22.neo(a2.x*b2,a2.y*b2)};Vec22.mulNumVec2=function(a2,b2){return Vec22.neo(a2*b2.x,a2*b2.y)};Vec22.prototype.neg=function(){this.x=-this.x;this.y=-this.y;return this};Vec22.neg=function(v3){return Vec22.neo(-v3.x,-v3.y)};Vec22.abs=function(v3){return Vec22.neo(math_abs$9(v3.x),math_abs$9(v3.y))};Vec22.mid=function(v3,w){return Vec22.neo((v3.x+w.x)*.5,(v3.y+w.y)*.5)};Vec22.upper=function(v3,w){return Vec22.neo(math_max$8(v3.x,w.x),math_max$8(v3.y,w.y))};Vec22.lower=function(v3,w){return Vec22.neo(math_min$8(v3.x,w.x),math_min$8(v3.y,w.y))};Vec22.prototype.clamp=function(max){var lengthSqr=this.x*this.x+this.y*this.y;if(lengthSqr>max*max){var scale=max/math_sqrt$5(lengthSqr);this.x*=scale;this.y*=scale}return this};Vec22.clamp=function(v3,max){var r=Vec22.neo(v3.x,v3.y);r.clamp(max);return r};Vec22.clampVec2=function(v3,min,max){return{x:clamp(v3.x,min===null||min===void 0?void 0:min.x,max===null||max===void 0?void 0:max.x),y:clamp(v3.y,min===null||min===void 0?void 0:min.y,max===null||max===void 0?void 0:max.y)}};Vec22.scaleFn=function(x2,y){return function(v3){return Vec22.neo(v3.x*x2,v3.y*y)}};Vec22.translateFn=function(x2,y){return function(v3){return Vec22.neo(v3.x+x2,v3.y+y)}};return Vec22}();var math_max$7=Math.max;var math_min$7=Math.min;var AABB=function(){function AABB2(lower,upper){if(!(this instanceof AABB2)){return new AABB2(lower,upper)}this.lowerBound=Vec2.zero();this.upperBound=Vec2.zero();if(typeof lower==="object"){this.lowerBound.setVec2(lower)}if(typeof upper==="object"){this.upperBound.setVec2(upper)}else if(typeof lower==="object"){this.upperBound.setVec2(lower)}}AABB2.prototype.isValid=function(){return AABB2.isValid(this)};AABB2.isValid=function(obj){if(obj===null||typeof obj==="undefined"){return false}return Vec2.isValid(obj.lowerBound)&&Vec2.isValid(obj.upperBound)&&Vec2.sub(obj.upperBound,obj.lowerBound).lengthSquared()>=0};AABB2.assert=function(o){};AABB2.prototype.getCenter=function(){return Vec2.neo((this.lowerBound.x+this.upperBound.x)*.5,(this.lowerBound.y+this.upperBound.y)*.5)};AABB2.prototype.getExtents=function(){return Vec2.neo((this.upperBound.x-this.lowerBound.x)*.5,(this.upperBound.y-this.lowerBound.y)*.5)};AABB2.prototype.getPerimeter=function(){return 2*(this.upperBound.x-this.lowerBound.x+this.upperBound.y-this.lowerBound.y)};AABB2.prototype.combine=function(a2,b2){b2=b2||this;var lowerA=a2.lowerBound;var upperA=a2.upperBound;var lowerB=b2.lowerBound;var upperB=b2.upperBound;var lowerX=math_min$7(lowerA.x,lowerB.x);var lowerY=math_min$7(lowerA.y,lowerB.y);var upperX=math_max$7(upperB.x,upperA.x);var upperY=math_max$7(upperB.y,upperA.y);this.lowerBound.setNum(lowerX,lowerY);this.upperBound.setNum(upperX,upperY)};AABB2.prototype.combinePoints=function(a2,b2){this.lowerBound.setNum(math_min$7(a2.x,b2.x),math_min$7(a2.y,b2.y));this.upperBound.setNum(math_max$7(a2.x,b2.x),math_max$7(a2.y,b2.y))};AABB2.prototype.set=function(aabb){this.lowerBound.setNum(aabb.lowerBound.x,aabb.lowerBound.y);this.upperBound.setNum(aabb.upperBound.x,aabb.upperBound.y)};AABB2.prototype.contains=function(aabb){var result=true;result=result&&this.lowerBound.x<=aabb.lowerBound.x;result=result&&this.lowerBound.y<=aabb.lowerBound.y;result=result&&aabb.upperBound.x<=this.upperBound.x;result=result&&aabb.upperBound.y<=this.upperBound.y;return result};AABB2.prototype.extend=function(value){AABB2.extend(this,value);return this};AABB2.extend=function(out,value){out.lowerBound.x-=value;out.lowerBound.y-=value;out.upperBound.x+=value;out.upperBound.y+=value;return out};AABB2.testOverlap=function(a2,b2){var d1x=b2.lowerBound.x-a2.upperBound.x;var d2x=a2.lowerBound.x-b2.upperBound.x;var d1y=b2.lowerBound.y-a2.upperBound.y;var d2y=a2.lowerBound.y-b2.upperBound.y;if(d1x>0||d1y>0||d2x>0||d2y>0){return false}return true};AABB2.areEqual=function(a2,b2){return Vec2.areEqual(a2.lowerBound,b2.lowerBound)&&Vec2.areEqual(a2.upperBound,b2.upperBound)};AABB2.diff=function(a2,b2){var wD=math_max$7(0,math_min$7(a2.upperBound.x,b2.upperBound.x)-math_max$7(b2.lowerBound.x,a2.lowerBound.x));var hD=math_max$7(0,math_min$7(a2.upperBound.y,b2.upperBound.y)-math_max$7(b2.lowerBound.y,a2.lowerBound.y));var wA=a2.upperBound.x-a2.lowerBound.x;var hA=a2.upperBound.y-a2.lowerBound.y;var wB=b2.upperBound.x-b2.lowerBound.x;var hB=b2.upperBound.y-b2.lowerBound.y;return wA*hA+wB*hB-wD*hD};AABB2.prototype.rayCast=function(output2,input2){var tmin=-Infinity;var tmax=Infinity;var p=input2.p1;var d2=Vec2.sub(input2.p2,input2.p1);var absD=Vec2.abs(d2);var normal3=Vec2.zero();{if(absD.x<EPSILON){if(p.x<this.lowerBound.x||this.upperBound.x<p.x){return false}}else{var inv_d=1/d2.x;var t1=(this.lowerBound.x-p.x)*inv_d;var t2=(this.upperBound.x-p.x)*inv_d;var s2=-1;if(t1>t2){var temp3=t1;t1=t2;t2=temp3;s2=1}if(t1>tmin){normal3.setZero();normal3.x=s2;tmin=t1}tmax=math_min$7(tmax,t2);if(tmin>tmax){return false}}}{if(absD.y<EPSILON){if(p.y<this.lowerBound.y||this.upperBound.y<p.y){return false}}else{var inv_d=1/d2.y;var t1=(this.lowerBound.y-p.y)*inv_d;var t2=(this.upperBound.y-p.y)*inv_d;var s2=-1;if(t1>t2){var temp3=t1;t1=t2;t2=temp3;s2=1}if(t1>tmin){normal3.setZero();normal3.y=s2;tmin=t1}tmax=math_min$7(tmax,t2);if(tmin>tmax){return false}}}if(tmin<0||input2.maxFraction<tmin){return false}output2.fraction=tmin;output2.normal=normal3;return true};AABB2.prototype.toString=function(){return JSON.stringify(this)};AABB2.combinePoints=function(out,a2,b2){out.lowerBound.x=math_min$7(a2.x,b2.x);out.lowerBound.y=math_min$7(a2.y,b2.y);out.upperBound.x=math_max$7(a2.x,b2.x);out.upperBound.y=math_max$7(a2.y,b2.y);return out};AABB2.combinedPerimeter=function(a2,b2){var lx=math_min$7(a2.lowerBound.x,b2.lowerBound.x);var ly=math_min$7(a2.lowerBound.y,b2.lowerBound.y);var ux=math_max$7(a2.upperBound.x,b2.upperBound.x);var uy=math_max$7(a2.upperBound.y,b2.upperBound.y);return 2*(ux-lx+uy-ly)};return AABB2}();var math_PI$6=Math.PI;var Settings=function(){function Settings2(){}Object.defineProperty(Settings2,"polygonRadius",{get:function(){return 2*Settings2.linearSlop},enumerable:false,configurable:true});Settings2.lengthUnitsPerMeter=1;Settings2.maxManifoldPoints=2;Settings2.maxPolygonVertices=12;Settings2.aabbExtension=.1;Settings2.aabbMultiplier=2;Settings2.linearSlop=.005;Settings2.angularSlop=2/180*math_PI$6;Settings2.maxSubSteps=8;Settings2.maxTOIContacts=32;Settings2.maxTOIIterations=20;Settings2.maxDistanceIterations=20;Settings2.velocityThreshold=1;Settings2.maxLinearCorrection=.2;Settings2.maxAngularCorrection=8/180*math_PI$6;Settings2.maxTranslation=2;Settings2.maxRotation=.5*math_PI$6;Settings2.baumgarte=.2;Settings2.toiBaugarte=.75;Settings2.timeToSleep=.5;Settings2.linearSleepTolerance=.01;Settings2.angularSleepTolerance=2/180*math_PI$6;return Settings2}();var SettingsInternal=function(){function SettingsInternal2(){}Object.defineProperty(SettingsInternal2,"maxManifoldPoints",{get:function(){return Settings.maxManifoldPoints},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"maxPolygonVertices",{get:function(){return Settings.maxPolygonVertices},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"aabbExtension",{get:function(){return Settings.aabbExtension*Settings.lengthUnitsPerMeter},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"aabbMultiplier",{get:function(){return Settings.aabbMultiplier},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"linearSlop",{get:function(){return Settings.linearSlop*Settings.lengthUnitsPerMeter},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"linearSlopSquared",{get:function(){return Settings.linearSlop*Settings.lengthUnitsPerMeter*Settings.linearSlop*Settings.lengthUnitsPerMeter},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"angularSlop",{get:function(){return Settings.angularSlop},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"polygonRadius",{get:function(){return 2*Settings.linearSlop},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"maxSubSteps",{get:function(){return Settings.maxSubSteps},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"maxTOIContacts",{get:function(){return Settings.maxTOIContacts},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"maxTOIIterations",{get:function(){return Settings.maxTOIIterations},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"maxDistanceIterations",{get:function(){return Settings.maxDistanceIterations},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"velocityThreshold",{get:function(){return Settings.velocityThreshold*Settings.lengthUnitsPerMeter},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"maxLinearCorrection",{get:function(){return Settings.maxLinearCorrection*Settings.lengthUnitsPerMeter},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"maxAngularCorrection",{get:function(){return Settings.maxAngularCorrection},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"maxTranslation",{get:function(){return Settings.maxTranslation*Settings.lengthUnitsPerMeter},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"maxTranslationSquared",{get:function(){return Settings.maxTranslation*Settings.lengthUnitsPerMeter*Settings.maxTranslation*Settings.lengthUnitsPerMeter},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"maxRotation",{get:function(){return Settings.maxRotation},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"maxRotationSquared",{get:function(){return Settings.maxRotation*Settings.maxRotation},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"baumgarte",{get:function(){return Settings.baumgarte},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"toiBaugarte",{get:function(){return Settings.toiBaugarte},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"timeToSleep",{get:function(){return Settings.timeToSleep},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"linearSleepTolerance",{get:function(){return Settings.linearSleepTolerance*Settings.lengthUnitsPerMeter},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"linearSleepToleranceSqr",{get:function(){return Settings.linearSleepTolerance*Settings.lengthUnitsPerMeter*Settings.linearSleepTolerance*Settings.lengthUnitsPerMeter},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"angularSleepTolerance",{get:function(){return Settings.angularSleepTolerance},enumerable:false,configurable:true});Object.defineProperty(SettingsInternal2,"angularSleepToleranceSqr",{get:function(){return Settings.angularSleepTolerance*Settings.angularSleepTolerance},enumerable:false,configurable:true});return SettingsInternal2}();var Pool=function(){function Pool2(opts){this._list=[];this._max=Infinity;this._hasCreateFn=false;this._createCount=0;this._hasAllocateFn=false;this._allocateCount=0;this._hasReleaseFn=false;this._releaseCount=0;this._hasDisposeFn=false;this._disposeCount=0;this._list=[];this._max=opts.max||this._max;this._createFn=opts.create;this._hasCreateFn=typeof this._createFn==="function";this._allocateFn=opts.allocate;this._hasAllocateFn=typeof this._allocateFn==="function";this._releaseFn=opts.release;this._hasReleaseFn=typeof this._releaseFn==="function";this._disposeFn=opts.dispose;this._hasDisposeFn=typeof this._disposeFn==="function"}Pool2.prototype.max=function(n2){if(typeof n2==="number"){this._max=n2;return this}return this._max};Pool2.prototype.size=function(){return this._list.length};Pool2.prototype.allocate=function(){var item;if(this._list.length>0){item=this._list.shift()}else{this._createCount++;if(this._hasCreateFn){item=this._createFn()}else{item={}}}this._allocateCount++;if(this._hasAllocateFn){this._allocateFn(item)}return item};Pool2.prototype.release=function(item){if(this._list.length<this._max){this._releaseCount++;if(this._hasReleaseFn){this._releaseFn(item)}this._list.push(item)}else{this._disposeCount++;if(this._hasDisposeFn){item=this._disposeFn(item)}}};Pool2.prototype.toString=function(){return" +"+this._createCount+" >"+this._allocateCount+" <"+this._releaseCount+" -"+this._disposeCount+" ="+this._list.length+"/"+this._max};return Pool2}();var math_abs$8=Math.abs;var math_max$6=Math.max;var TreeNode=function(){function TreeNode2(id){this.aabb=new AABB;this.userData=null;this.parent=null;this.child1=null;this.child2=null;this.height=-1;this.id=id}TreeNode2.prototype.toString=function(){return this.id+": "+this.userData};TreeNode2.prototype.isLeaf=function(){return this.child1==null};return TreeNode2}();var poolTreeNode=new Pool({create:function(){return new TreeNode},release:function(node){node.userData=null;node.parent=null;node.child1=null;node.child2=null;node.height=-1;node.id=void 0}});var DynamicTree=function(){function DynamicTree2(){this.inputPool=new Pool({create:function(){return{}},release:function(stack){}});this.stackPool=new Pool({create:function(){return[]},release:function(stack){stack.length=0}});this.iteratorPool=new Pool({create:function(){return new Iterator},release:function(iterator){iterator.close()}});this.m_root=null;this.m_nodes={};this.m_lastProxyId=0}DynamicTree2.prototype.getUserData=function(id){var node=this.m_nodes[id];return node.userData};DynamicTree2.prototype.getFatAABB=function(id){var node=this.m_nodes[id];return node.aabb};DynamicTree2.prototype.allocateNode=function(){var node=poolTreeNode.allocate();node.id=++this.m_lastProxyId;this.m_nodes[node.id]=node;return node};DynamicTree2.prototype.freeNode=function(node){delete this.m_nodes[node.id];poolTreeNode.release(node)};DynamicTree2.prototype.createProxy=function(aabb,userData){var node=this.allocateNode();node.aabb.set(aabb);AABB.extend(node.aabb,SettingsInternal.aabbExtension);node.userData=userData;node.height=0;this.insertLeaf(node);return node.id};DynamicTree2.prototype.destroyProxy=function(id){var node=this.m_nodes[id];this.removeLeaf(node);this.freeNode(node)};DynamicTree2.prototype.moveProxy=function(id,aabb,d2){var node=this.m_nodes[id];if(node.aabb.contains(aabb)){return false}this.removeLeaf(node);node.aabb.set(aabb);aabb=node.aabb;AABB.extend(aabb,SettingsInternal.aabbExtension);if(d2.x<0){aabb.lowerBound.x+=d2.x*SettingsInternal.aabbMultiplier}else{aabb.upperBound.x+=d2.x*SettingsInternal.aabbMultiplier}if(d2.y<0){aabb.lowerBound.y+=d2.y*SettingsInternal.aabbMultiplier}else{aabb.upperBound.y+=d2.y*SettingsInternal.aabbMultiplier}this.insertLeaf(node);return true};DynamicTree2.prototype.insertLeaf=function(leaf){if(this.m_root==null){this.m_root=leaf;this.m_root.parent=null;return}var leafAABB=leaf.aabb;var index=this.m_root;while(!index.isLeaf()){var child1=index.child1;var child2=index.child2;var area=index.aabb.getPerimeter();var combinedArea=AABB.combinedPerimeter(index.aabb,leafAABB);var cost=2*combinedArea;var inheritanceCost=2*(combinedArea-area);var newArea1=AABB.combinedPerimeter(leafAABB,child1.aabb);var cost1=newArea1+inheritanceCost;if(!child1.isLeaf()){var oldArea=child1.aabb.getPerimeter();cost1-=oldArea}var newArea2=AABB.combinedPerimeter(leafAABB,child2.aabb);var cost2=newArea2+inheritanceCost;if(!child2.isLeaf()){var oldArea=child2.aabb.getPerimeter();cost2-=oldArea}if(cost<cost1&&cost<cost2){break}if(cost1<cost2){index=child1}else{index=child2}}var sibling=index;var oldParent=sibling.parent;var newParent=this.allocateNode();newParent.parent=oldParent;newParent.userData=null;newParent.aabb.combine(leafAABB,sibling.aabb);newParent.height=sibling.height+1;if(oldParent!=null){if(oldParent.child1===sibling){oldParent.child1=newParent}else{oldParent.child2=newParent}newParent.child1=sibling;newParent.child2=leaf;sibling.parent=newParent;leaf.parent=newParent}else{newParent.child1=sibling;newParent.child2=leaf;sibling.parent=newParent;leaf.parent=newParent;this.m_root=newParent}index=leaf.parent;while(index!=null){index=this.balance(index);var child1=index.child1;var child2=index.child2;index.height=1+math_max$6(child1.height,child2.height);index.aabb.combine(child1.aabb,child2.aabb);index=index.parent}};DynamicTree2.prototype.removeLeaf=function(leaf){if(leaf===this.m_root){this.m_root=null;return}var parent=leaf.parent;var grandParent=parent.parent;var sibling;if(parent.child1===leaf){sibling=parent.child2}else{sibling=parent.child1}if(grandParent!=null){if(grandParent.child1===parent){grandParent.child1=sibling}else{grandParent.child2=sibling}sibling.parent=grandParent;this.freeNode(parent);var index=grandParent;while(index!=null){index=this.balance(index);var child1=index.child1;var child2=index.child2;index.aabb.combine(child1.aabb,child2.aabb);index.height=1+math_max$6(child1.height,child2.height);index=index.parent}}else{this.m_root=sibling;sibling.parent=null;this.freeNode(parent)}};DynamicTree2.prototype.balance=function(iA){var A=iA;if(A.isLeaf()||A.height<2){return iA}var B=A.child1;var C=A.child2;var balance=C.height-B.height;if(balance>1){var F=C.child1;var G=C.child2;C.child1=A;C.parent=A.parent;A.parent=C;if(C.parent!=null){if(C.parent.child1===iA){C.parent.child1=C}else{C.parent.child2=C}}else{this.m_root=C}if(F.height>G.height){C.child2=F;A.child2=G;G.parent=A;A.aabb.combine(B.aabb,G.aabb);C.aabb.combine(A.aabb,F.aabb);A.height=1+math_max$6(B.height,G.height);C.height=1+math_max$6(A.height,F.height)}else{C.child2=G;A.child2=F;F.parent=A;A.aabb.combine(B.aabb,F.aabb);C.aabb.combine(A.aabb,G.aabb);A.height=1+math_max$6(B.height,F.height);C.height=1+math_max$6(A.height,G.height)}return C}if(balance<-1){var D=B.child1;var E=B.child2;B.child1=A;B.parent=A.parent;A.parent=B;if(B.parent!=null){if(B.parent.child1===A){B.parent.child1=B}else{B.parent.child2=B}}else{this.m_root=B}if(D.height>E.height){B.child2=D;A.child1=E;E.parent=A;A.aabb.combine(C.aabb,E.aabb);B.aabb.combine(A.aabb,D.aabb);A.height=1+math_max$6(C.height,E.height);B.height=1+math_max$6(A.height,D.height)}else{B.child2=E;A.child1=D;D.parent=A;A.aabb.combine(C.aabb,D.aabb);B.aabb.combine(A.aabb,E.aabb);A.height=1+math_max$6(C.height,D.height);B.height=1+math_max$6(A.height,E.height)}return B}return A};DynamicTree2.prototype.getHeight=function(){if(this.m_root==null){return 0}return this.m_root.height};DynamicTree2.prototype.getAreaRatio=function(){if(this.m_root==null){return 0}var root=this.m_root;var rootArea=root.aabb.getPerimeter();var totalArea=0;var node;var it=this.iteratorPool.allocate().preorder(this.m_root);while(node=it.next()){if(node.height<0){continue}totalArea+=node.aabb.getPerimeter()}this.iteratorPool.release(it);return totalArea/rootArea};DynamicTree2.prototype.computeHeight=function(id){var node;if(typeof id!=="undefined"){node=this.m_nodes[id]}else{node=this.m_root}if(node.isLeaf()){return 0}var height1=this.computeHeight(node.child1.id);var height2=this.computeHeight(node.child2.id);return 1+math_max$6(height1,height2)};DynamicTree2.prototype.validateStructure=function(node){if(node==null){return}if(node===this.m_root);var child1=node.child1;var child2=node.child2;if(node.isLeaf()){return}this.validateStructure(child1);this.validateStructure(child2)};DynamicTree2.prototype.validateMetrics=function(node){if(node==null){return}var child1=node.child1;var child2=node.child2;if(node.isLeaf()){return}this.validateMetrics(child1);this.validateMetrics(child2)};DynamicTree2.prototype.validate=function(){return};DynamicTree2.prototype.getMaxBalance=function(){var maxBalance=0;var node;var it=this.iteratorPool.allocate().preorder(this.m_root);while(node=it.next()){if(node.height<=1){continue}var balance=math_abs$8(node.child2.height-node.child1.height);maxBalance=math_max$6(maxBalance,balance)}this.iteratorPool.release(it);return maxBalance};DynamicTree2.prototype.rebuildBottomUp=function(){var nodes=[];var count=0;var node;var it=this.iteratorPool.allocate().preorder(this.m_root);while(node=it.next()){if(node.height<0){continue}if(node.isLeaf()){node.parent=null;nodes[count]=node;++count}else{this.freeNode(node)}}this.iteratorPool.release(it);while(count>1){var minCost=Infinity;var iMin=-1;var jMin=-1;for(var i=0;i<count;++i){var aabbi=nodes[i].aabb;for(var j=i+1;j<count;++j){var aabbj=nodes[j].aabb;var cost=AABB.combinedPerimeter(aabbi,aabbj);if(cost<minCost){iMin=i;jMin=j;minCost=cost}}}var child1=nodes[iMin];var child2=nodes[jMin];var parent_1=this.allocateNode();parent_1.child1=child1;parent_1.child2=child2;parent_1.height=1+math_max$6(child1.height,child2.height);parent_1.aabb.combine(child1.aabb,child2.aabb);parent_1.parent=null;child1.parent=parent_1;child2.parent=parent_1;nodes[jMin]=nodes[count-1];nodes[iMin]=parent_1;--count}this.m_root=nodes[0]};DynamicTree2.prototype.shiftOrigin=function(newOrigin){var node;var it=this.iteratorPool.allocate().preorder(this.m_root);while(node=it.next()){var aabb=node.aabb;aabb.lowerBound.x-=newOrigin.x;aabb.lowerBound.y-=newOrigin.y;aabb.upperBound.x-=newOrigin.x;aabb.upperBound.y-=newOrigin.y}this.iteratorPool.release(it)};DynamicTree2.prototype.query=function(aabb,queryCallback){var stack=this.stackPool.allocate();stack.push(this.m_root);while(stack.length>0){var node=stack.pop();if(node==null){continue}if(AABB.testOverlap(node.aabb,aabb)){if(node.isLeaf()){var proceed=queryCallback(node.id);if(proceed===false){return}}else{stack.push(node.child1);stack.push(node.child2)}}}this.stackPool.release(stack)};DynamicTree2.prototype.rayCast=function(input2,rayCastCallback){var p1=input2.p1;var p2=input2.p2;var r=Vec2.sub(p2,p1);r.normalize();var v3=Vec2.crossNumVec2(1,r);var abs_v=Vec2.abs(v3);var maxFraction=input2.maxFraction;var segmentAABB=new AABB;var t=Vec2.combine(1-maxFraction,p1,maxFraction,p2);segmentAABB.combinePoints(p1,t);var stack=this.stackPool.allocate();var subInput=this.inputPool.allocate();stack.push(this.m_root);while(stack.length>0){var node=stack.pop();if(node==null){continue}if(AABB.testOverlap(node.aabb,segmentAABB)===false){continue}var c2=node.aabb.getCenter();var h=node.aabb.getExtents();var separation=math_abs$8(Vec2.dot(v3,Vec2.sub(p1,c2)))-Vec2.dot(abs_v,h);if(separation>0){continue}if(node.isLeaf()){subInput.p1=Vec2.clone(input2.p1);subInput.p2=Vec2.clone(input2.p2);subInput.maxFraction=maxFraction;var value=rayCastCallback(subInput,node.id);if(value===0){break}else if(value>0){maxFraction=value;t=Vec2.combine(1-maxFraction,p1,maxFraction,p2);segmentAABB.combinePoints(p1,t)}}else{stack.push(node.child1);stack.push(node.child2)}}this.stackPool.release(stack);this.inputPool.release(subInput)};return DynamicTree2}();var Iterator=function(){function Iterator2(){this.parents=[];this.states=[]}Iterator2.prototype.preorder=function(root){this.parents.length=0;this.parents.push(root);this.states.length=0;this.states.push(0);return this};Iterator2.prototype.next=function(){while(this.parents.length>0){var i=this.parents.length-1;var node=this.parents[i];if(this.states[i]===0){this.states[i]=1;return node}if(this.states[i]===1){this.states[i]=2;if(node.child1){this.parents.push(node.child1);this.states.push(1);return node.child1}}if(this.states[i]===2){this.states[i]=3;if(node.child2){this.parents.push(node.child2);this.states.push(1);return node.child2}}this.parents.pop();this.states.pop()}};Iterator2.prototype.close=function(){this.parents.length=0};return Iterator2}();var math_max$5=Math.max;var math_min$6=Math.min;var BroadPhase=function(){function BroadPhase2(){var _this=this;this.m_tree=new DynamicTree;this.m_moveBuffer=[];this.query=function(aabb,queryCallback){_this.m_tree.query(aabb,queryCallback)};this.queryCallback=function(proxyId){if(proxyId===_this.m_queryProxyId){return true}var proxyIdA=math_min$6(proxyId,_this.m_queryProxyId);var proxyIdB=math_max$5(proxyId,_this.m_queryProxyId);var userDataA=_this.m_tree.getUserData(proxyIdA);var userDataB=_this.m_tree.getUserData(proxyIdB);_this.m_callback(userDataA,userDataB);return true}}BroadPhase2.prototype.getUserData=function(proxyId){return this.m_tree.getUserData(proxyId)};BroadPhase2.prototype.testOverlap=function(proxyIdA,proxyIdB){var aabbA=this.m_tree.getFatAABB(proxyIdA);var aabbB=this.m_tree.getFatAABB(proxyIdB);return AABB.testOverlap(aabbA,aabbB)};BroadPhase2.prototype.getFatAABB=function(proxyId){return this.m_tree.getFatAABB(proxyId)};BroadPhase2.prototype.getProxyCount=function(){return this.m_moveBuffer.length};BroadPhase2.prototype.getTreeHeight=function(){return this.m_tree.getHeight()};BroadPhase2.prototype.getTreeBalance=function(){return this.m_tree.getMaxBalance()};BroadPhase2.prototype.getTreeQuality=function(){return this.m_tree.getAreaRatio()};BroadPhase2.prototype.rayCast=function(input2,rayCastCallback){this.m_tree.rayCast(input2,rayCastCallback)};BroadPhase2.prototype.shiftOrigin=function(newOrigin){this.m_tree.shiftOrigin(newOrigin)};BroadPhase2.prototype.createProxy=function(aabb,userData){var proxyId=this.m_tree.createProxy(aabb,userData);this.bufferMove(proxyId);return proxyId};BroadPhase2.prototype.destroyProxy=function(proxyId){this.unbufferMove(proxyId);this.m_tree.destroyProxy(proxyId)};BroadPhase2.prototype.moveProxy=function(proxyId,aabb,displacement2){var changed=this.m_tree.moveProxy(proxyId,aabb,displacement2);if(changed){this.bufferMove(proxyId)}};BroadPhase2.prototype.touchProxy=function(proxyId){this.bufferMove(proxyId)};BroadPhase2.prototype.bufferMove=function(proxyId){this.m_moveBuffer.push(proxyId)};BroadPhase2.prototype.unbufferMove=function(proxyId){for(var i=0;i<this.m_moveBuffer.length;++i){if(this.m_moveBuffer[i]===proxyId){this.m_moveBuffer[i]=null}}};BroadPhase2.prototype.updatePairs=function(addPairCallback){this.m_callback=addPairCallback;while(this.m_moveBuffer.length>0){this.m_queryProxyId=this.m_moveBuffer.pop();if(this.m_queryProxyId===null){continue}var fatAABB=this.m_tree.getFatAABB(this.m_queryProxyId);this.m_tree.query(fatAABB,this.queryCallback)}};return BroadPhase2}();var math_sin$2=Math.sin;var math_cos$2=Math.cos;var math_sqrt$4=Math.sqrt;function vec2(x2,y){return{x:x2,y:y}}function rotation(angle){return{s:math_sin$2(angle),c:math_cos$2(angle)}}function setVec2(out,x2,y){out.x=x2;out.y=y;return out}function copyVec2(out,w){out.x=w.x;out.y=w.y;return out}function zeroVec2(out){out.x=0;out.y=0;return out}function negVec2(out){out.x=-out.x;out.y=-out.y;return out}function plusVec2(out,w){out.x+=w.x;out.y+=w.y;return out}function addVec2(out,v3,w){out.x=v3.x+w.x;out.y=v3.y+w.y;return out}function minusVec2(out,w){out.x-=w.x;out.y-=w.y;return out}function subVec2(out,v3,w){out.x=v3.x-w.x;out.y=v3.y-w.y;return out}function mulVec2(out,m){out.x*=m;out.y*=m;return out}function scaleVec2(out,m,w){out.x=m*w.x;out.y=m*w.y;return out}function plusScaleVec2(out,m,w){out.x+=m*w.x;out.y+=m*w.y;return out}function minusScaleVec2(out,m,w){out.x-=m*w.x;out.y-=m*w.y;return out}function combine2Vec2(out,am,a2,bm,b2){out.x=am*a2.x+bm*b2.x;out.y=am*a2.y+bm*b2.y;return out}function combine3Vec2(out,am,a2,bm,b2,cm,c2){out.x=am*a2.x+bm*b2.x+cm*c2.x;out.y=am*a2.y+bm*b2.y+cm*c2.y;return out}function normalizeVec2Length(out){var length=math_sqrt$4(out.x*out.x+out.y*out.y);if(length!==0){var invLength=1/length;out.x*=invLength;out.y*=invLength}return length}function normalizeVec2(out){var length=math_sqrt$4(out.x*out.x+out.y*out.y);if(length>0){var invLength=1/length;out.x*=invLength;out.y*=invLength}return out}function crossVec2Num(out,v3,w){var x2=w*v3.y;var y=-w*v3.x;out.x=x2;out.y=y;return out}function crossNumVec2(out,w,v3){var x2=-w*v3.y;var y=w*v3.x;out.x=x2;out.y=y;return out}function crossVec2Vec2(a2,b2){return a2.x*b2.y-a2.y*b2.x}function dotVec2(a2,b2){return a2.x*b2.x+a2.y*b2.y}function lengthSqrVec2(a2){return a2.x*a2.x+a2.y*a2.y}function distVec2(a2,b2){var dx=a2.x-b2.x;var dy=a2.y-b2.y;return math_sqrt$4(dx*dx+dy*dy)}function distSqrVec2(a2,b2){var dx=a2.x-b2.x;var dy=a2.y-b2.y;return dx*dx+dy*dy}function setRotAngle(out,a2){out.c=math_cos$2(a2);out.s=math_sin$2(a2);return out}function rotVec2(out,q,v3){out.x=q.c*v3.x-q.s*v3.y;out.y=q.s*v3.x+q.c*v3.y;return out}function derotVec2(out,q,v3){var x2=q.c*v3.x+q.s*v3.y;var y=-q.s*v3.x+q.c*v3.y;out.x=x2;out.y=y;return out}function rerotVec2(out,before,after,v3){var x0=before.c*v3.x+before.s*v3.y;var y0=-before.s*v3.x+before.c*v3.y;var x2=after.c*x0-after.s*y0;var y=after.s*x0+after.c*y0;out.x=x2;out.y=y;return out}function transform(x2,y,a2){return{p:vec2(x2,y),q:rotation(a2)}}function copyTransform(out,transform2){out.p.x=transform2.p.x;out.p.y=transform2.p.y;out.q.s=transform2.q.s;out.q.c=transform2.q.c;return out}function transformVec2(out,xf2,v3){var x2=xf2.q.c*v3.x-xf2.q.s*v3.y+xf2.p.x;var y=xf2.q.s*v3.x+xf2.q.c*v3.y+xf2.p.y;out.x=x2;out.y=y;return out}function detransformVec2(out,xf2,v3){var px=v3.x-xf2.p.x;var py=v3.y-xf2.p.y;var x2=xf2.q.c*px+xf2.q.s*py;var y=-xf2.q.s*px+xf2.q.c*py;out.x=x2;out.y=y;return out}function retransformVec2(out,from,to,v3){var x0=from.q.c*v3.x-from.q.s*v3.y+from.p.x;var y0=from.q.s*v3.x+from.q.c*v3.y+from.p.y;var px=x0-to.p.x;var py=y0-to.p.y;var x2=to.q.c*px+to.q.s*py;var y=-to.q.s*px+to.q.c*py;out.x=x2;out.y=y;return out}function detransformTransform(out,a2,b2){var c2=a2.q.c*b2.q.c+a2.q.s*b2.q.s;var s2=a2.q.c*b2.q.s-a2.q.s*b2.q.c;var x2=a2.q.c*(b2.p.x-a2.p.x)+a2.q.s*(b2.p.y-a2.p.y);var y=-a2.q.s*(b2.p.x-a2.p.x)+a2.q.c*(b2.p.y-a2.p.y);out.q.c=c2;out.q.s=s2;out.p.x=x2;out.p.y=y;return out}var math_sin$1=Math.sin;var math_cos$1=Math.cos;var math_atan2$1=Math.atan2;var Rot=function(){function Rot2(angle){if(!(this instanceof Rot2)){return new Rot2(angle)}if(typeof angle==="number"){this.setAngle(angle)}else if(typeof angle==="object"){this.setRot(angle)}else{this.setIdentity()}}Rot2.neo=function(angle){var obj=Object.create(Rot2.prototype);obj.setAngle(angle);return obj};Rot2.clone=function(rot){var obj=Object.create(Rot2.prototype);obj.s=rot.s;obj.c=rot.c;return obj};Rot2.identity=function(){var obj=Object.create(Rot2.prototype);obj.s=0;obj.c=1;return obj};Rot2.isValid=function(obj){if(obj===null||typeof obj==="undefined"){return false}return Number.isFinite(obj.s)&&Number.isFinite(obj.c)};Rot2.assert=function(o){};Rot2.prototype.setIdentity=function(){this.s=0;this.c=1};Rot2.prototype.set=function(angle){if(typeof angle==="object"){this.s=angle.s;this.c=angle.c}else{this.s=math_sin$1(angle);this.c=math_cos$1(angle)}};Rot2.prototype.setRot=function(angle){this.s=angle.s;this.c=angle.c};Rot2.prototype.setAngle=function(angle){this.s=math_sin$1(angle);this.c=math_cos$1(angle)};Rot2.prototype.getAngle=function(){return math_atan2$1(this.s,this.c)};Rot2.prototype.getXAxis=function(){return Vec2.neo(this.c,this.s)};Rot2.prototype.getYAxis=function(){return Vec2.neo(-this.s,this.c)};Rot2.mul=function(rot,m){if("c"in m&&"s"in m){var qr=Rot2.identity();qr.s=rot.s*m.c+rot.c*m.s;qr.c=rot.c*m.c-rot.s*m.s;return qr}else if("x"in m&&"y"in m){return Vec2.neo(rot.c*m.x-rot.s*m.y,rot.s*m.x+rot.c*m.y)}};Rot2.mulRot=function(rot,m){var qr=Rot2.identity();qr.s=rot.s*m.c+rot.c*m.s;qr.c=rot.c*m.c-rot.s*m.s;return qr};Rot2.mulVec2=function(rot,m){return Vec2.neo(rot.c*m.x-rot.s*m.y,rot.s*m.x+rot.c*m.y)};Rot2.mulSub=function(rot,v3,w){var x2=rot.c*(v3.x-w.x)-rot.s*(v3.y-w.y);var y=rot.s*(v3.x-w.x)+rot.c*(v3.y-w.y);return Vec2.neo(x2,y)};Rot2.mulT=function(rot,m){if("c"in m&&"s"in m){var qr=Rot2.identity();qr.s=rot.c*m.s-rot.s*m.c;qr.c=rot.c*m.c+rot.s*m.s;return qr}else if("x"in m&&"y"in m){return Vec2.neo(rot.c*m.x+rot.s*m.y,-rot.s*m.x+rot.c*m.y)}};Rot2.mulTRot=function(rot,m){var qr=Rot2.identity();qr.s=rot.c*m.s-rot.s*m.c;qr.c=rot.c*m.c+rot.s*m.s;return qr};Rot2.mulTVec2=function(rot,m){return Vec2.neo(rot.c*m.x+rot.s*m.y,-rot.s*m.x+rot.c*m.y)};return Rot2}();var math_atan2=Math.atan2;var math_PI$5=Math.PI;var temp$7=vec2(0,0);var Sweep=function(){function Sweep2(){this.localCenter=Vec2.zero();this.c=Vec2.zero();this.a=0;this.alpha0=0;this.c0=Vec2.zero();this.a0=0}Sweep2.prototype.recycle=function(){zeroVec2(this.localCenter);zeroVec2(this.c);this.a=0;this.alpha0=0;zeroVec2(this.c0);this.a0=0};Sweep2.prototype.setTransform=function(xf2){transformVec2(temp$7,xf2,this.localCenter);copyVec2(this.c,temp$7);copyVec2(this.c0,temp$7);this.a=this.a0=math_atan2(xf2.q.s,xf2.q.c)};Sweep2.prototype.setLocalCenter=function(localCenter2,xf2){copyVec2(this.localCenter,localCenter2);transformVec2(temp$7,xf2,this.localCenter);copyVec2(this.c,temp$7);copyVec2(this.c0,temp$7)};Sweep2.prototype.getTransform=function(xf2,beta){if(beta===void 0){beta=0}setRotAngle(xf2.q,(1-beta)*this.a0+beta*this.a);combine2Vec2(xf2.p,1-beta,this.c0,beta,this.c);minusVec2(xf2.p,rotVec2(temp$7,xf2.q,this.localCenter))};Sweep2.prototype.advance=function(alpha){var beta=(alpha-this.alpha0)/(1-this.alpha0);combine2Vec2(this.c0,beta,this.c,1-beta,this.c0);this.a0=beta*this.a+(1-beta)*this.a0;this.alpha0=alpha};Sweep2.prototype.forward=function(){this.a0=this.a;copyVec2(this.c0,this.c)};Sweep2.prototype.normalize=function(){var a0=mod(this.a0,-math_PI$5,+math_PI$5);this.a-=this.a0-a0;this.a0=a0};Sweep2.prototype.isValid=function(){return Number.isFinite(this.localCenter.x)&&Number.isFinite(this.localCenter.y)&&Number.isFinite(this.c0.x)&&Number.isFinite(this.c0.y)&&Number.isFinite(this.c.x)&&Number.isFinite(this.c.y)&&Number.isFinite(this.a0)&&Number.isFinite(this.a)&&Number.isFinite(this.alpha0)};Sweep2.prototype.set=function(that){copyVec2(this.localCenter,that.localCenter);copyVec2(this.c,that.c);this.a=that.a;this.alpha0=that.alpha0;copyVec2(this.c0,that.c0);this.a0=that.a0};return Sweep2}();var Transform=function(){function Transform2(position,rotation2){if(!(this instanceof Transform2)){return new Transform2(position,rotation2)}this.p=Vec2.zero();this.q=Rot.identity();if(typeof position!=="undefined"){this.p.setVec2(position)}if(typeof rotation2!=="undefined"){this.q.setAngle(rotation2)}}Transform2.clone=function(xf2){var obj=Object.create(Transform2.prototype);obj.p=Vec2.clone(xf2.p);obj.q=Rot.clone(xf2.q);return obj};Transform2.neo=function(position,rotation2){var obj=Object.create(Transform2.prototype);obj.p=Vec2.clone(position);obj.q=Rot.clone(rotation2);return obj};Transform2.identity=function(){var obj=Object.create(Transform2.prototype);obj.p=Vec2.zero();obj.q=Rot.identity();return obj};Transform2.prototype.setIdentity=function(){this.p.setZero();this.q.setIdentity()};Transform2.prototype.set=function(a2,b2){if(typeof b2==="undefined"){this.p.set(a2.p);this.q.set(a2.q)}else{this.p.set(a2);this.q.set(b2)}};Transform2.prototype.setNum=function(position,rotation2){this.p.setVec2(position);this.q.setAngle(rotation2)};Transform2.prototype.setTransform=function(xf2){this.p.setVec2(xf2.p);this.q.setRot(xf2.q)};Transform2.isValid=function(obj){if(obj===null||typeof obj==="undefined"){return false}return Vec2.isValid(obj.p)&&Rot.isValid(obj.q)};Transform2.assert=function(o){};Transform2.mul=function(a2,b2){if(Array.isArray(b2)){var arr=[];for(var i=0;i<b2.length;i++){arr[i]=Transform2.mul(a2,b2[i])}return arr}else if("x"in b2&&"y"in b2){return Transform2.mulVec2(a2,b2)}else if("p"in b2&&"q"in b2){return Transform2.mulXf(a2,b2)}};Transform2.mulAll=function(a2,b2){var arr=[];for(var i=0;i<b2.length;i++){arr[i]=Transform2.mul(a2,b2[i])}return arr};Transform2.mulFn=function(a2){return function(b2){return Transform2.mul(a2,b2)}};Transform2.mulVec2=function(a2,b2){var x2=a2.q.c*b2.x-a2.q.s*b2.y+a2.p.x;var y=a2.q.s*b2.x+a2.q.c*b2.y+a2.p.y;return Vec2.neo(x2,y)};Transform2.mulXf=function(a2,b2){var xf2=Transform2.identity();xf2.q=Rot.mulRot(a2.q,b2.q);xf2.p=Vec2.add(Rot.mulVec2(a2.q,b2.p),a2.p);return xf2};Transform2.mulT=function(a2,b2){if("x"in b2&&"y"in b2){return Transform2.mulTVec2(a2,b2)}else if("p"in b2&&"q"in b2){return Transform2.mulTXf(a2,b2)}};Transform2.mulTVec2=function(a2,b2){var px=b2.x-a2.p.x;var py=b2.y-a2.p.y;var x2=a2.q.c*px+a2.q.s*py;var y=-a2.q.s*px+a2.q.c*py;return Vec2.neo(x2,y)};Transform2.mulTXf=function(a2,b2){var xf2=Transform2.identity();xf2.q.setRot(Rot.mulTRot(a2.q,b2.q));xf2.p.setVec2(Rot.mulTVec2(a2.q,Vec2.sub(b2.p,a2.p)));return xf2};return Transform2}();var Velocity=function(){function Velocity2(){this.v=Vec2.zero();this.w=0}return Velocity2}();var math_sin=Math.sin;var math_cos=Math.cos;var Position=function(){function Position2(){this.c=Vec2.zero();this.a=0}Position2.prototype.getTransform=function(xf2,p){xf2.q.c=math_cos(this.a);xf2.q.s=math_sin(this.a);xf2.p.x=this.c.x-(xf2.q.c*p.x-xf2.q.s*p.y);xf2.p.y=this.c.y-(xf2.q.s*p.x+xf2.q.c*p.y);return xf2};return Position2}();function getTransform(xf2,p,c2,a2){xf2.q.c=math_cos(a2);xf2.q.s=math_sin(a2);xf2.p.x=c2.x-(xf2.q.c*p.x-xf2.q.s*p.y);xf2.p.y=c2.y-(xf2.q.s*p.x+xf2.q.c*p.y);return xf2}var Shape=function(){function Shape2(){this.style={};this.appData={}}Shape2.isValid=function(obj){if(obj===null||typeof obj==="undefined"){return false}return typeof obj.m_type==="string"&&typeof obj.m_radius==="number"};return Shape2}();var synchronize_aabb1=new AABB;var synchronize_aabb2=new AABB;var displacement=vec2(0,0);var FixtureDefDefault={userData:null,friction:.2,restitution:0,density:0,isSensor:false,filterGroupIndex:0,filterCategoryBits:1,filterMaskBits:65535};var FixtureProxy=function(){function FixtureProxy2(fixture,childIndex){this.aabb=new AABB;this.fixture=fixture;this.childIndex=childIndex}return FixtureProxy2}();var Fixture=function(){function Fixture2(body,shape,def){this.style={};this.appData={};if(shape.shape){def=shape;shape=shape.shape}else if(typeof def==="number"){def={density:def}}def=options(def,FixtureDefDefault);this.m_body=body;this.m_friction=def.friction;this.m_restitution=def.restitution;this.m_density=def.density;this.m_isSensor=def.isSensor;this.m_filterGroupIndex=def.filterGroupIndex;this.m_filterCategoryBits=def.filterCategoryBits;this.m_filterMaskBits=def.filterMaskBits;this.m_shape=shape;this.m_next=null;this.m_proxies=[];this.m_proxyCount=0;var childCount=this.m_shape.getChildCount();for(var i=0;i<childCount;++i){this.m_proxies[i]=new FixtureProxy(this,i)}this.m_userData=def.userData;if(typeof def.style==="object"&&def.style!==null){this.style=def.style}}Fixture2.prototype._reset=function(){var body=this.getBody();var broadPhase=body.m_world.m_broadPhase;this.destroyProxies(broadPhase);if(this.m_shape._reset){this.m_shape._reset()}var childCount=this.m_shape.getChildCount();for(var i=0;i<childCount;++i){this.m_proxies[i]=new FixtureProxy(this,i)}this.createProxies(broadPhase,body.m_xf);body.resetMassData()};Fixture2.prototype._serialize=function(){return{friction:this.m_friction,restitution:this.m_restitution,density:this.m_density,isSensor:this.m_isSensor,filterGroupIndex:this.m_filterGroupIndex,filterCategoryBits:this.m_filterCategoryBits,filterMaskBits:this.m_filterMaskBits,shape:this.m_shape}};Fixture2._deserialize=function(data,body,restore){var shape=restore(Shape,data.shape);var fixture=shape&&new Fixture2(body,shape,data);return fixture};Fixture2.prototype.getType=function(){return this.m_shape.m_type};Fixture2.prototype.getShape=function(){return this.m_shape};Fixture2.prototype.isSensor=function(){return this.m_isSensor};Fixture2.prototype.setSensor=function(sensor){if(sensor!=this.m_isSensor){this.m_body.setAwake(true);this.m_isSensor=sensor}};Fixture2.prototype.getUserData=function(){return this.m_userData};Fixture2.prototype.setUserData=function(data){this.m_userData=data};Fixture2.prototype.getBody=function(){return this.m_body};Fixture2.prototype.getNext=function(){return this.m_next};Fixture2.prototype.getDensity=function(){return this.m_density};Fixture2.prototype.setDensity=function(density){this.m_density=density};Fixture2.prototype.getFriction=function(){return this.m_friction};Fixture2.prototype.setFriction=function(friction){this.m_friction=friction};Fixture2.prototype.getRestitution=function(){return this.m_restitution};Fixture2.prototype.setRestitution=function(restitution){this.m_restitution=restitution};Fixture2.prototype.testPoint=function(p){return this.m_shape.testPoint(this.m_body.getTransform(),p)};Fixture2.prototype.rayCast=function(output2,input2,childIndex){return this.m_shape.rayCast(output2,input2,this.m_body.getTransform(),childIndex)};Fixture2.prototype.getMassData=function(massData){this.m_shape.computeMass(massData,this.m_density)};Fixture2.prototype.getAABB=function(childIndex){return this.m_proxies[childIndex].aabb};Fixture2.prototype.createProxies=function(broadPhase,xf2){this.m_proxyCount=this.m_shape.getChildCount();for(var i=0;i<this.m_proxyCount;++i){var proxy=this.m_proxies[i];this.m_shape.computeAABB(proxy.aabb,xf2,i);proxy.proxyId=broadPhase.createProxy(proxy.aabb,proxy)}};Fixture2.prototype.destroyProxies=function(broadPhase){for(var i=0;i<this.m_proxyCount;++i){var proxy=this.m_proxies[i];broadPhase.destroyProxy(proxy.proxyId);proxy.proxyId=null}this.m_proxyCount=0};Fixture2.prototype.synchronize=function(broadPhase,xf1,xf2){for(var i=0;i<this.m_proxyCount;++i){var proxy=this.m_proxies[i];this.m_shape.computeAABB(synchronize_aabb1,xf1,proxy.childIndex);this.m_shape.computeAABB(synchronize_aabb2,xf2,proxy.childIndex);proxy.aabb.combine(synchronize_aabb1,synchronize_aabb2);subVec2(displacement,xf2.p,xf1.p);broadPhase.moveProxy(proxy.proxyId,proxy.aabb,displacement)}};Fixture2.prototype.setFilterData=function(filter){this.m_filterGroupIndex=filter.groupIndex;this.m_filterCategoryBits=filter.categoryBits;this.m_filterMaskBits=filter.maskBits;this.refilter()};Fixture2.prototype.getFilterGroupIndex=function(){return this.m_filterGroupIndex};Fixture2.prototype.setFilterGroupIndex=function(groupIndex){this.m_filterGroupIndex=groupIndex;this.refilter()};Fixture2.prototype.getFilterCategoryBits=function(){return this.m_filterCategoryBits};Fixture2.prototype.setFilterCategoryBits=function(categoryBits){this.m_filterCategoryBits=categoryBits;this.refilter()};Fixture2.prototype.getFilterMaskBits=function(){return this.m_filterMaskBits};Fixture2.prototype.setFilterMaskBits=function(maskBits){this.m_filterMaskBits=maskBits;this.refilter()};Fixture2.prototype.refilter=function(){if(this.m_body==null){return}var edge=this.m_body.getContactList();while(edge){var contact=edge.contact;var fixtureA=contact.getFixtureA();var fixtureB=contact.getFixtureB();if(fixtureA==this||fixtureB==this){contact.flagForFiltering()}edge=edge.next}var world=this.m_body.getWorld();if(world==null){return}var broadPhase=world.m_broadPhase;for(var i=0;i<this.m_proxyCount;++i){broadPhase.touchProxy(this.m_proxies[i].proxyId)}};Fixture2.prototype.shouldCollide=function(that){if(that.m_filterGroupIndex===this.m_filterGroupIndex&&that.m_filterGroupIndex!==0){return that.m_filterGroupIndex>0}var collideA=(that.m_filterMaskBits&this.m_filterCategoryBits)!==0;var collideB=(that.m_filterCategoryBits&this.m_filterMaskBits)!==0;var collide=collideA&&collideB;return collide};return Fixture2}();var STATIC="static";var KINEMATIC="kinematic";var DYNAMIC="dynamic";var oldCenter=vec2(0,0);var localCenter=vec2(0,0);var shift=vec2(0,0);var temp$6=vec2(0,0);var xf$2=transform(0,0,0);var BodyDefDefault={type:STATIC,position:Vec2.zero(),angle:0,linearVelocity:Vec2.zero(),angularVelocity:0,linearDamping:0,angularDamping:0,fixedRotation:false,bullet:false,gravityScale:1,allowSleep:true,awake:true,active:true,userData:null};var Body=function(){function Body2(world,def){this.style={};this.appData={};def=options(def,BodyDefDefault);this.m_world=world;this.m_awakeFlag=def.awake;this.m_autoSleepFlag=def.allowSleep;this.m_bulletFlag=def.bullet;this.m_fixedRotationFlag=def.fixedRotation;this.m_activeFlag=def.active;this.m_islandFlag=false;this.m_toiFlag=false;this.m_userData=def.userData;this.m_type=def.type;if(this.m_type==DYNAMIC){this.m_mass=1;this.m_invMass=1}else{this.m_mass=0;this.m_invMass=0}this.m_I=0;this.m_invI=0;this.m_xf=Transform.identity();this.m_xf.p.setVec2(def.position);this.m_xf.q.setAngle(def.angle);this.m_sweep=new Sweep;this.m_sweep.setTransform(this.m_xf);this.c_velocity=new Velocity;this.c_position=new Position;this.m_force=Vec2.zero();this.m_torque=0;this.m_linearVelocity=Vec2.clone(def.linearVelocity);this.m_angularVelocity=def.angularVelocity;this.m_linearDamping=def.linearDamping;this.m_angularDamping=def.angularDamping;this.m_gravityScale=def.gravityScale;this.m_sleepTime=0;this.m_jointList=null;this.m_contactList=null;this.m_fixtureList=null;this.m_prev=null;this.m_next=null;this.m_destroyed=false;if(typeof def.style==="object"&&def.style!==null){this.style=def.style}}Body2.prototype._serialize=function(){var fixtures=[];for(var f=this.m_fixtureList;f;f=f.m_next){fixtures.push(f)}return{type:this.m_type,bullet:this.m_bulletFlag,fixedRotation:this.m_fixedRotationFlag,position:this.m_xf.p,angle:this.m_xf.q.getAngle(),linearVelocity:this.m_linearVelocity,angularVelocity:this.m_angularVelocity,fixtures:fixtures}};Body2._deserialize=function(data,world,restore){var body=new Body2(world,data);if(data.fixtures){for(var i=data.fixtures.length-1;i>=0;i--){var fixture=restore(Fixture,data.fixtures[i],body);body._addFixture(fixture)}}return body};Body2.prototype.isWorldLocked=function(){return this.m_world&&this.m_world.isLocked()?true:false};Body2.prototype.getWorld=function(){return this.m_world};Body2.prototype.getNext=function(){return this.m_next};Body2.prototype.setUserData=function(data){this.m_userData=data};Body2.prototype.getUserData=function(){return this.m_userData};Body2.prototype.getFixtureList=function(){return this.m_fixtureList};Body2.prototype.getJointList=function(){return this.m_jointList};Body2.prototype.getContactList=function(){return this.m_contactList};Body2.prototype.isStatic=function(){return this.m_type==STATIC};Body2.prototype.isDynamic=function(){return this.m_type==DYNAMIC};Body2.prototype.isKinematic=function(){return this.m_type==KINEMATIC};Body2.prototype.setStatic=function(){this.setType(STATIC);return this};Body2.prototype.setDynamic=function(){this.setType(DYNAMIC);return this};Body2.prototype.setKinematic=function(){this.setType(KINEMATIC);return this};Body2.prototype.getType=function(){return this.m_type};Body2.prototype.setType=function(type){if(this.isWorldLocked()==true){return}if(this.m_type==type){return}this.m_type=type;this.resetMassData();if(this.m_type==STATIC){this.m_linearVelocity.setZero();this.m_angularVelocity=0;this.m_sweep.forward();this.synchronizeFixtures()}this.setAwake(true);this.m_force.setZero();this.m_torque=0;var ce=this.m_contactList;while(ce){var ce0=ce;ce=ce.next;this.m_world.destroyContact(ce0.contact)}this.m_contactList=null;var broadPhase=this.m_world.m_broadPhase;for(var f=this.m_fixtureList;f;f=f.m_next){for(var i=0;i<f.m_proxyCount;++i){broadPhase.touchProxy(f.m_proxies[i].proxyId)}}};Body2.prototype.isBullet=function(){return this.m_bulletFlag};Body2.prototype.setBullet=function(flag){this.m_bulletFlag=!!flag};Body2.prototype.isSleepingAllowed=function(){return this.m_autoSleepFlag};Body2.prototype.setSleepingAllowed=function(flag){this.m_autoSleepFlag=!!flag;if(this.m_autoSleepFlag==false){this.setAwake(true)}};Body2.prototype.isAwake=function(){return this.m_awakeFlag};Body2.prototype.setAwake=function(flag){if(flag){this.m_awakeFlag=true;this.m_sleepTime=0}else{this.m_awakeFlag=false;this.m_sleepTime=0;this.m_linearVelocity.setZero();this.m_angularVelocity=0;this.m_force.setZero();this.m_torque=0}};Body2.prototype.isActive=function(){return this.m_activeFlag};Body2.prototype.setActive=function(flag){if(flag==this.m_activeFlag){return}this.m_activeFlag=!!flag;if(this.m_activeFlag){var broadPhase=this.m_world.m_broadPhase;for(var f=this.m_fixtureList;f;f=f.m_next){f.createProxies(broadPhase,this.m_xf)}this.m_world.m_newFixture=true}else{var broadPhase=this.m_world.m_broadPhase;for(var f=this.m_fixtureList;f;f=f.m_next){f.destroyProxies(broadPhase)}var ce=this.m_contactList;while(ce){var ce0=ce;ce=ce.next;this.m_world.destroyContact(ce0.contact)}this.m_contactList=null}};Body2.prototype.isFixedRotation=function(){return this.m_fixedRotationFlag};Body2.prototype.setFixedRotation=function(flag){if(this.m_fixedRotationFlag==flag){return}this.m_fixedRotationFlag=!!flag;this.m_angularVelocity=0;this.resetMassData()};Body2.prototype.getTransform=function(){return this.m_xf};Body2.prototype.setTransform=function(a2,b2){if(this.isWorldLocked()==true){return}if(typeof b2==="number"){this.m_xf.setNum(a2,b2)}else{this.m_xf.setTransform(a2)}this.m_sweep.setTransform(this.m_xf);var broadPhase=this.m_world.m_broadPhase;for(var f=this.m_fixtureList;f;f=f.m_next){f.synchronize(broadPhase,this.m_xf,this.m_xf)}this.setAwake(true)};Body2.prototype.synchronizeTransform=function(){this.m_sweep.getTransform(this.m_xf,1)};Body2.prototype.synchronizeFixtures=function(){this.m_sweep.getTransform(xf$2,0);var broadPhase=this.m_world.m_broadPhase;for(var f=this.m_fixtureList;f;f=f.m_next){f.synchronize(broadPhase,xf$2,this.m_xf)}};Body2.prototype.advance=function(alpha){this.m_sweep.advance(alpha);copyVec2(this.m_sweep.c,this.m_sweep.c0);this.m_sweep.a=this.m_sweep.a0;this.m_sweep.getTransform(this.m_xf,1)};Body2.prototype.getPosition=function(){return this.m_xf.p};Body2.prototype.setPosition=function(p){this.setTransform(p,this.m_sweep.a)};Body2.prototype.getAngle=function(){return this.m_sweep.a};Body2.prototype.setAngle=function(angle){this.setTransform(this.m_xf.p,angle)};Body2.prototype.getWorldCenter=function(){return this.m_sweep.c};Body2.prototype.getLocalCenter=function(){return this.m_sweep.localCenter};Body2.prototype.getLinearVelocity=function(){return this.m_linearVelocity};Body2.prototype.getLinearVelocityFromWorldPoint=function(worldPoint){var localCenter2=Vec2.sub(worldPoint,this.m_sweep.c);return Vec2.add(this.m_linearVelocity,Vec2.crossNumVec2(this.m_angularVelocity,localCenter2))};Body2.prototype.getLinearVelocityFromLocalPoint=function(localPoint){return this.getLinearVelocityFromWorldPoint(this.getWorldPoint(localPoint))};Body2.prototype.setLinearVelocity=function(v3){if(this.m_type==STATIC){return}if(Vec2.dot(v3,v3)>0){this.setAwake(true)}this.m_linearVelocity.setVec2(v3)};Body2.prototype.getAngularVelocity=function(){return this.m_angularVelocity};Body2.prototype.setAngularVelocity=function(w){if(this.m_type==STATIC){return}if(w*w>0){this.setAwake(true)}this.m_angularVelocity=w};Body2.prototype.getLinearDamping=function(){return this.m_linearDamping};Body2.prototype.setLinearDamping=function(linearDamping){this.m_linearDamping=linearDamping};Body2.prototype.getAngularDamping=function(){return this.m_angularDamping};Body2.prototype.setAngularDamping=function(angularDamping){this.m_angularDamping=angularDamping};Body2.prototype.getGravityScale=function(){return this.m_gravityScale};Body2.prototype.setGravityScale=function(scale){this.m_gravityScale=scale};Body2.prototype.getMass=function(){return this.m_mass};Body2.prototype.getInertia=function(){return this.m_I+this.m_mass*Vec2.dot(this.m_sweep.localCenter,this.m_sweep.localCenter)};Body2.prototype.getMassData=function(data){data.mass=this.m_mass;data.I=this.getInertia();copyVec2(data.center,this.m_sweep.localCenter)};Body2.prototype.resetMassData=function(){this.m_mass=0;this.m_invMass=0;this.m_I=0;this.m_invI=0;zeroVec2(this.m_sweep.localCenter);if(this.isStatic()||this.isKinematic()){copyVec2(this.m_sweep.c0,this.m_xf.p);copyVec2(this.m_sweep.c,this.m_xf.p);this.m_sweep.a0=this.m_sweep.a;return}zeroVec2(localCenter);for(var f=this.m_fixtureList;f;f=f.m_next){if(f.m_density==0){continue}var massData={mass:0,center:vec2(0,0),I:0};f.getMassData(massData);this.m_mass+=massData.mass;plusScaleVec2(localCenter,massData.mass,massData.center);this.m_I+=massData.I}if(this.m_mass>0){this.m_invMass=1/this.m_mass;scaleVec2(localCenter,this.m_invMass,localCenter)}else{this.m_mass=1;this.m_invMass=1}if(this.m_I>0&&this.m_fixedRotationFlag==false){this.m_I-=this.m_mass*dotVec2(localCenter,localCenter);this.m_invI=1/this.m_I}else{this.m_I=0;this.m_invI=0}copyVec2(oldCenter,this.m_sweep.c);this.m_sweep.setLocalCenter(localCenter,this.m_xf);subVec2(shift,this.m_sweep.c,oldCenter);crossNumVec2(temp$6,this.m_angularVelocity,shift);plusVec2(this.m_linearVelocity,temp$6)};Body2.prototype.setMassData=function(massData){if(this.isWorldLocked()==true){return}if(this.m_type!=DYNAMIC){return}this.m_invMass=0;this.m_I=0;this.m_invI=0;this.m_mass=massData.mass;if(this.m_mass<=0){this.m_mass=1}this.m_invMass=1/this.m_mass;if(massData.I>0&&this.m_fixedRotationFlag==false){this.m_I=massData.I-this.m_mass*dotVec2(massData.center,massData.center);this.m_invI=1/this.m_I}copyVec2(oldCenter,this.m_sweep.c);this.m_sweep.setLocalCenter(massData.center,this.m_xf);subVec2(shift,this.m_sweep.c,oldCenter);crossNumVec2(temp$6,this.m_angularVelocity,shift);plusVec2(this.m_linearVelocity,temp$6)};Body2.prototype.applyForce=function(force,point2,wake){if(wake===void 0){wake=true}if(this.m_type!=DYNAMIC){return}if(wake&&this.m_awakeFlag==false){this.setAwake(true)}if(this.m_awakeFlag){this.m_force.add(force);this.m_torque+=Vec2.crossVec2Vec2(Vec2.sub(point2,this.m_sweep.c),force)}};Body2.prototype.applyForceToCenter=function(force,wake){if(wake===void 0){wake=true}if(this.m_type!=DYNAMIC){return}if(wake&&this.m_awakeFlag==false){this.setAwake(true)}if(this.m_awakeFlag){this.m_force.add(force)}};Body2.prototype.applyTorque=function(torque,wake){if(wake===void 0){wake=true}if(this.m_type!=DYNAMIC){return}if(wake&&this.m_awakeFlag==false){this.setAwake(true)}if(this.m_awakeFlag){this.m_torque+=torque}};Body2.prototype.applyLinearImpulse=function(impulse,point2,wake){if(wake===void 0){wake=true}if(this.m_type!=DYNAMIC){return}if(wake&&this.m_awakeFlag==false){this.setAwake(true)}if(this.m_awakeFlag){this.m_linearVelocity.addMul(this.m_invMass,impulse);this.m_angularVelocity+=this.m_invI*Vec2.crossVec2Vec2(Vec2.sub(point2,this.m_sweep.c),impulse)}};Body2.prototype.applyAngularImpulse=function(impulse,wake){if(wake===void 0){wake=true}if(this.m_type!=DYNAMIC){return}if(wake&&this.m_awakeFlag==false){this.setAwake(true)}if(this.m_awakeFlag){this.m_angularVelocity+=this.m_invI*impulse}};Body2.prototype.shouldCollide=function(that){if(this.m_type!=DYNAMIC&&that.m_type!=DYNAMIC){return false}for(var jn=this.m_jointList;jn;jn=jn.next){if(jn.other==that){if(jn.joint.m_collideConnected==false){return false}}}return true};Body2.prototype._addFixture=function(fixture){if(this.isWorldLocked()==true){return null}if(this.m_activeFlag){var broadPhase=this.m_world.m_broadPhase;fixture.createProxies(broadPhase,this.m_xf)}fixture.m_next=this.m_fixtureList;this.m_fixtureList=fixture;if(fixture.m_density>0){this.resetMassData()}this.m_world.m_newFixture=true;return fixture};Body2.prototype.createFixture=function(shape,fixdef){if(this.isWorldLocked()==true){return null}var fixture=new Fixture(this,shape,fixdef);this._addFixture(fixture);this.m_world.publish("add-fixture",fixture);return fixture};Body2.prototype.destroyFixture=function(fixture){if(this.isWorldLocked()==true){return}if(this.m_fixtureList===fixture){this.m_fixtureList=fixture.m_next}else{var node=this.m_fixtureList;while(node!=null){if(node.m_next===fixture){node.m_next=fixture.m_next;break}node=node.m_next}}var edge=this.m_contactList;while(edge){var c2=edge.contact;edge=edge.next;var fixtureA=c2.getFixtureA();var fixtureB=c2.getFixtureB();if(fixture==fixtureA||fixture==fixtureB){this.m_world.destroyContact(c2)}}if(this.m_activeFlag){var broadPhase=this.m_world.m_broadPhase;fixture.destroyProxies(broadPhase)}fixture.m_body=null;fixture.m_next=null;this.m_world.publish("remove-fixture",fixture);this.resetMassData()};Body2.prototype.getWorldPoint=function(localPoint){return Transform.mulVec2(this.m_xf,localPoint)};Body2.prototype.getWorldVector=function(localVector){return Rot.mulVec2(this.m_xf.q,localVector)};Body2.prototype.getLocalPoint=function(worldPoint){return Transform.mulTVec2(this.m_xf,worldPoint)};Body2.prototype.getLocalVector=function(worldVector){return Rot.mulTVec2(this.m_xf.q,worldVector)};Body2.STATIC="static";Body2.KINEMATIC="kinematic";Body2.DYNAMIC="dynamic";return Body2}();var JointEdge=function(){function JointEdge2(){this.other=null;this.joint=null;this.prev=null;this.next=null}return JointEdge2}();var Joint=function(){function Joint2(def,bodyA,bodyB){this.m_type="unknown-joint";this.m_prev=null;this.m_next=null;this.m_edgeA=new JointEdge;this.m_edgeB=new JointEdge;this.m_islandFlag=false;this.style={};this.appData={};bodyA="bodyA"in def?def.bodyA:bodyA;bodyB="bodyB"in def?def.bodyB:bodyB;this.m_bodyA=bodyA;this.m_bodyB=bodyB;this.m_collideConnected=!!def.collideConnected;this.m_userData=def.userData;if(typeof def.style==="object"&&def.style!==null){this.style=def.style}}Joint2.prototype.isActive=function(){return this.m_bodyA.isActive()&&this.m_bodyB.isActive()};Joint2.prototype.getType=function(){return this.m_type};Joint2.prototype.getBodyA=function(){return this.m_bodyA};Joint2.prototype.getBodyB=function(){return this.m_bodyB};Joint2.prototype.getNext=function(){return this.m_next};Joint2.prototype.getUserData=function(){return this.m_userData};Joint2.prototype.setUserData=function(data){this.m_userData=data};Joint2.prototype.getCollideConnected=function(){return this.m_collideConnected};Joint2.prototype.shiftOrigin=function(newOrigin){};Joint2.prototype._resetAnchors=function(def){return this._reset(def)};return Joint2}();var stats={gjkCalls:0,gjkIters:0,gjkMaxIters:0,toiTime:0,toiMaxTime:0,toiCalls:0,toiIters:0,toiMaxIters:0,toiRootIters:0,toiMaxRootIters:0,toString:function(newline){newline=typeof newline==="string"?newline:"\n";var string="";for(var name_1 in this){if(typeof this[name_1]!=="function"&&typeof this[name_1]!=="object"){string+=name_1+": "+this[name_1]+newline}}return string}};var now=function(){return Date.now()};var diff=function(time){return Date.now()-time};const Timer={now:now,diff:diff};var math_max$4=Math.max;var temp$5=vec2(0,0);var normal$4=vec2(0,0);var e12=vec2(0,0);var e13=vec2(0,0);var e23=vec2(0,0);var temp1=vec2(0,0);var temp2=vec2(0,0);stats.gjkCalls=0;stats.gjkIters=0;stats.gjkMaxIters=0;var DistanceInput=function(){function DistanceInput2(){this.proxyA=new DistanceProxy;this.proxyB=new DistanceProxy;this.transformA=Transform.identity();this.transformB=Transform.identity();this.useRadii=false}DistanceInput2.prototype.recycle=function(){this.proxyA.recycle();this.proxyB.recycle();this.transformA.setIdentity();this.transformB.setIdentity();this.useRadii=false};return DistanceInput2}();var DistanceOutput=function(){function DistanceOutput2(){this.pointA=vec2(0,0);this.pointB=vec2(0,0);this.distance=0;this.iterations=0}DistanceOutput2.prototype.recycle=function(){zeroVec2(this.pointA);zeroVec2(this.pointB);this.distance=0;this.iterations=0};return DistanceOutput2}();var SimplexCache=function(){function SimplexCache2(){this.metric=0;this.indexA=[];this.indexB=[];this.count=0}SimplexCache2.prototype.recycle=function(){this.metric=0;this.indexA.length=0;this.indexB.length=0;this.count=0};return SimplexCache2}();var Distance=function(output2,cache2,input2){++stats.gjkCalls;var proxyA=input2.proxyA;var proxyB=input2.proxyB;var xfA2=input2.transformA;var xfB2=input2.transformB;simplex.recycle();simplex.readCache(cache2,proxyA,xfA2,proxyB,xfB2);var vertices=simplex.m_v;var k_maxIters=SettingsInternal.maxDistanceIterations;var saveA=[];var saveB=[];var saveCount=0;var iter=0;while(iter<k_maxIters){saveCount=simplex.m_count;for(var i=0;i<saveCount;++i){saveA[i]=vertices[i].indexA;saveB[i]=vertices[i].indexB}simplex.solve();if(simplex.m_count===3){break}var d2=simplex.getSearchDirection();if(lengthSqrVec2(d2)<EPSILON*EPSILON){break}var vertex=vertices[simplex.m_count];vertex.indexA=proxyA.getSupport(derotVec2(temp$5,xfA2.q,scaleVec2(temp$5,-1,d2)));transformVec2(vertex.wA,xfA2,proxyA.getVertex(vertex.indexA));vertex.indexB=proxyB.getSupport(derotVec2(temp$5,xfB2.q,d2));transformVec2(vertex.wB,xfB2,proxyB.getVertex(vertex.indexB));subVec2(vertex.w,vertex.wB,vertex.wA);++iter;++stats.gjkIters;var duplicate=false;for(var i=0;i<saveCount;++i){if(vertex.indexA===saveA[i]&&vertex.indexB===saveB[i]){duplicate=true;break}}if(duplicate){break}++simplex.m_count}stats.gjkMaxIters=math_max$4(stats.gjkMaxIters,iter);simplex.getWitnessPoints(output2.pointA,output2.pointB);output2.distance=distVec2(output2.pointA,output2.pointB);output2.iterations=iter;simplex.writeCache(cache2);if(input2.useRadii){var rA2=proxyA.m_radius;var rB2=proxyB.m_radius;if(output2.distance>rA2+rB2&&output2.distance>EPSILON){output2.distance-=rA2+rB2;subVec2(normal$4,output2.pointB,output2.pointA);normalizeVec2(normal$4);plusScaleVec2(output2.pointA,rA2,normal$4);minusScaleVec2(output2.pointB,rB2,normal$4)}else{var p=subVec2(temp$5,output2.pointA,output2.pointB);copyVec2(output2.pointA,p);copyVec2(output2.pointB,p);output2.distance=0}}};var DistanceProxy=function(){function DistanceProxy2(){this.m_vertices=[];this.m_count=0;this.m_radius=0}DistanceProxy2.prototype.recycle=function(){this.m_vertices.length=0;this.m_count=0;this.m_radius=0};DistanceProxy2.prototype.getVertexCount=function(){return this.m_count};DistanceProxy2.prototype.getVertex=function(index){return this.m_vertices[index]};DistanceProxy2.prototype.getSupport=function(d2){var bestIndex=0;var bestValue=-Infinity;for(var i=0;i<this.m_count;++i){var value=dotVec2(this.m_vertices[i],d2);if(value>bestValue){bestIndex=i;bestValue=value}}return bestIndex};DistanceProxy2.prototype.getSupportVertex=function(d2){return this.m_vertices[this.getSupport(d2)]};DistanceProxy2.prototype.set=function(shape,index){shape.computeDistanceProxy(this,index)};DistanceProxy2.prototype.setVertices=function(vertices,count,radius){this.m_vertices=vertices;this.m_count=count;this.m_radius=radius};return DistanceProxy2}();var SimplexVertex=function(){function SimplexVertex2(){this.wA=vec2(0,0);this.indexA=0;this.wB=vec2(0,0);this.indexB=0;this.w=vec2(0,0);this.a=0}SimplexVertex2.prototype.recycle=function(){this.indexA=0;this.indexB=0;zeroVec2(this.wA);zeroVec2(this.wB);zeroVec2(this.w);this.a=0};SimplexVertex2.prototype.set=function(v3){this.indexA=v3.indexA;this.indexB=v3.indexB;copyVec2(this.wA,v3.wA);copyVec2(this.wB,v3.wB);copyVec2(this.w,v3.w);this.a=v3.a};return SimplexVertex2}();var searchDirection_reuse=vec2(0,0);var closestPoint_reuse=vec2(0,0);var Simplex=function(){function Simplex2(){this.m_v1=new SimplexVertex;this.m_v2=new SimplexVertex;this.m_v3=new SimplexVertex;this.m_v=[this.m_v1,this.m_v2,this.m_v3]}Simplex2.prototype.recycle=function(){this.m_v1.recycle();this.m_v2.recycle();this.m_v3.recycle();this.m_count=0};Simplex2.prototype.toString=function(){if(this.m_count===3){return["+"+this.m_count,this.m_v1.a,this.m_v1.wA.x,this.m_v1.wA.y,this.m_v1.wB.x,this.m_v1.wB.y,this.m_v2.a,this.m_v2.wA.x,this.m_v2.wA.y,this.m_v2.wB.x,this.m_v2.wB.y,this.m_v3.a,this.m_v3.wA.x,this.m_v3.wA.y,this.m_v3.wB.x,this.m_v3.wB.y].toString()}else if(this.m_count===2){return["+"+this.m_count,this.m_v1.a,this.m_v1.wA.x,this.m_v1.wA.y,this.m_v1.wB.x,this.m_v1.wB.y,this.m_v2.a,this.m_v2.wA.x,this.m_v2.wA.y,this.m_v2.wB.x,this.m_v2.wB.y].toString()}else if(this.m_count===1){return["+"+this.m_count,this.m_v1.a,this.m_v1.wA.x,this.m_v1.wA.y,this.m_v1.wB.x,this.m_v1.wB.y].toString()}else{return"+"+this.m_count}};Simplex2.prototype.readCache=function(cache2,proxyA,transformA,proxyB,transformB){this.m_count=cache2.count;for(var i=0;i<this.m_count;++i){var v3=this.m_v[i];v3.indexA=cache2.indexA[i];v3.indexB=cache2.indexB[i];var wALocal=proxyA.getVertex(v3.indexA);var wBLocal=proxyB.getVertex(v3.indexB);transformVec2(v3.wA,transformA,wALocal);transformVec2(v3.wB,transformB,wBLocal);subVec2(v3.w,v3.wB,v3.wA);v3.a=0}if(this.m_count>1){var metric1=cache2.metric;var metric2=this.getMetric();if(metric2<.5*metric1||2*metric1<metric2||metric2<EPSILON){this.m_count=0}}if(this.m_count===0){var v3=this.m_v[0];v3.indexA=0;v3.indexB=0;var wALocal=proxyA.getVertex(0);var wBLocal=proxyB.getVertex(0);transformVec2(v3.wA,transformA,wALocal);transformVec2(v3.wB,transformB,wBLocal);subVec2(v3.w,v3.wB,v3.wA);v3.a=1;this.m_count=1}};Simplex2.prototype.writeCache=function(cache2){cache2.metric=this.getMetric();cache2.count=this.m_count;for(var i=0;i<this.m_count;++i){cache2.indexA[i]=this.m_v[i].indexA;cache2.indexB[i]=this.m_v[i].indexB}};Simplex2.prototype.getSearchDirection=function(){var v13=this.m_v1;var v22=this.m_v2;switch(this.m_count){case 1:return setVec2(searchDirection_reuse,-v13.w.x,-v13.w.y);case 2:{subVec2(e12,v22.w,v13.w);var sgn=-crossVec2Vec2(e12,v13.w);if(sgn>0){return setVec2(searchDirection_reuse,-e12.y,e12.x)}else{return setVec2(searchDirection_reuse,e12.y,-e12.x)}}default:return zeroVec2(searchDirection_reuse)}};Simplex2.prototype.getClosestPoint=function(){var v13=this.m_v1;var v22=this.m_v2;switch(this.m_count){case 0:return zeroVec2(closestPoint_reuse);case 1:return copyVec2(closestPoint_reuse,v13.w);case 2:return combine2Vec2(closestPoint_reuse,v13.a,v13.w,v22.a,v22.w);case 3:return zeroVec2(closestPoint_reuse);default:return zeroVec2(closestPoint_reuse)}};Simplex2.prototype.getWitnessPoints=function(pA2,pB2){var v13=this.m_v1;var v22=this.m_v2;var v3=this.m_v3;switch(this.m_count){case 0:break;case 1:copyVec2(pA2,v13.wA);copyVec2(pB2,v13.wB);break;case 2:combine2Vec2(pA2,v13.a,v13.wA,v22.a,v22.wA);combine2Vec2(pB2,v13.a,v13.wB,v22.a,v22.wB);break;case 3:combine3Vec2(pA2,v13.a,v13.wA,v22.a,v22.wA,v3.a,v3.wA);copyVec2(pB2,pA2);break}};Simplex2.prototype.getMetric=function(){switch(this.m_count){case 0:return 0;case 1:return 0;case 2:return distVec2(this.m_v1.w,this.m_v2.w);case 3:return crossVec2Vec2(subVec2(temp1,this.m_v2.w,this.m_v1.w),subVec2(temp2,this.m_v3.w,this.m_v1.w));default:return 0}};Simplex2.prototype.solve=function(){switch(this.m_count){case 1:break;case 2:this.solve2();break;case 3:this.solve3();break}};Simplex2.prototype.solve2=function(){var w1=this.m_v1.w;var w2=this.m_v2.w;subVec2(e12,w2,w1);var d12_2=-dotVec2(w1,e12);if(d12_2<=0){this.m_v1.a=1;this.m_count=1;return}var d12_1=dotVec2(w2,e12);if(d12_1<=0){this.m_v2.a=1;this.m_count=1;this.m_v1.set(this.m_v2);return}var inv_d12=1/(d12_1+d12_2);this.m_v1.a=d12_1*inv_d12;this.m_v2.a=d12_2*inv_d12;this.m_count=2};Simplex2.prototype.solve3=function(){var w1=this.m_v1.w;var w2=this.m_v2.w;var w3=this.m_v3.w;subVec2(e12,w2,w1);var w1e12=dotVec2(w1,e12);var w2e12=dotVec2(w2,e12);var d12_1=w2e12;var d12_2=-w1e12;subVec2(e13,w3,w1);var w1e13=dotVec2(w1,e13);var w3e13=dotVec2(w3,e13);var d13_1=w3e13;var d13_2=-w1e13;subVec2(e23,w3,w2);var w2e23=dotVec2(w2,e23);var w3e23=dotVec2(w3,e23);var d23_1=w3e23;var d23_2=-w2e23;var n123=crossVec2Vec2(e12,e13);var d123_1=n123*crossVec2Vec2(w2,w3);var d123_2=n123*crossVec2Vec2(w3,w1);var d123_3=n123*crossVec2Vec2(w1,w2);if(d12_2<=0&&d13_2<=0){this.m_v1.a=1;this.m_count=1;return}if(d12_1>0&&d12_2>0&&d123_3<=0){var inv_d12=1/(d12_1+d12_2);this.m_v1.a=d12_1*inv_d12;this.m_v2.a=d12_2*inv_d12;this.m_count=2;return}if(d13_1>0&&d13_2>0&&d123_2<=0){var inv_d13=1/(d13_1+d13_2);this.m_v1.a=d13_1*inv_d13;this.m_v3.a=d13_2*inv_d13;this.m_count=2;this.m_v2.set(this.m_v3);return}if(d12_1<=0&&d23_2<=0){this.m_v2.a=1;this.m_count=1;this.m_v1.set(this.m_v2);return}if(d13_1<=0&&d23_1<=0){this.m_v3.a=1;this.m_count=1;this.m_v1.set(this.m_v3);return}if(d23_1>0&&d23_2>0&&d123_1<=0){var inv_d23=1/(d23_1+d23_2);this.m_v2.a=d23_1*inv_d23;this.m_v3.a=d23_2*inv_d23;this.m_count=2;this.m_v1.set(this.m_v3);return}var inv_d123=1/(d123_1+d123_2+d123_3);this.m_v1.a=d123_1*inv_d123;this.m_v2.a=d123_2*inv_d123;this.m_v3.a=d123_3*inv_d123;this.m_count=3};return Simplex2}();var simplex=new Simplex;var input$1=new DistanceInput;var cache$1=new SimplexCache;var output$1=new DistanceOutput;var testOverlap=function(shapeA,indexA,shapeB,indexB,xfA2,xfB2){input$1.recycle();input$1.proxyA.set(shapeA,indexA);input$1.proxyB.set(shapeB,indexB);copyTransform(input$1.transformA,xfA2);copyTransform(input$1.transformB,xfB2);input$1.useRadii=true;output$1.recycle();cache$1.recycle();Distance(output$1,cache$1,input$1);return output$1.distance<10*EPSILON};Distance.testOverlap=testOverlap;Distance.Input=DistanceInput;Distance.Output=DistanceOutput;Distance.Proxy=DistanceProxy;Distance.Cache=SimplexCache;var ShapeCastInput=function(){function ShapeCastInput2(){this.proxyA=new DistanceProxy;this.proxyB=new DistanceProxy;this.transformA=Transform.identity();this.transformB=Transform.identity();this.translationB=Vec2.zero()}ShapeCastInput2.prototype.recycle=function(){this.proxyA.recycle();this.proxyB.recycle();this.transformA.setIdentity();this.transformB.setIdentity();zeroVec2(this.translationB)};return ShapeCastInput2}();var ShapeCastOutput=function(){function ShapeCastOutput2(){this.point=Vec2.zero();this.normal=Vec2.zero();this.lambda=1;this.iterations=0}return ShapeCastOutput2}();var ShapeCast=function(output2,input2){output2.iterations=0;output2.lambda=1;output2.normal.setZero();output2.point.setZero();var proxyA=input2.proxyA;var proxyB=input2.proxyB;var radiusA=math_max$4(proxyA.m_radius,SettingsInternal.polygonRadius);var radiusB=math_max$4(proxyB.m_radius,SettingsInternal.polygonRadius);var radius=radiusA+radiusB;var xfA2=input2.transformA;var xfB2=input2.transformB;var r=input2.translationB;var n2=Vec2.zero();var lambda=0;var simplex2=new Simplex;simplex2.m_count=0;var vertices=simplex2.m_v;var indexA=proxyA.getSupport(Rot.mulTVec2(xfA2.q,Vec2.neg(r)));var wA=Transform.mulVec2(xfA2,proxyA.getVertex(indexA));var indexB=proxyB.getSupport(Rot.mulTVec2(xfB2.q,r));var wB=Transform.mulVec2(xfB2,proxyB.getVertex(indexB));var v3=Vec2.sub(wA,wB);var sigma=math_max$4(SettingsInternal.polygonRadius,radius-SettingsInternal.polygonRadius);var tolerance=.5*SettingsInternal.linearSlop;var k_maxIters=20;var iter=0;while(iter<k_maxIters&&v3.length()-sigma>tolerance){output2.iterations+=1;indexA=proxyA.getSupport(Rot.mulTVec2(xfA2.q,Vec2.neg(v3)));wA=Transform.mulVec2(xfA2,proxyA.getVertex(indexA));indexB=proxyB.getSupport(Rot.mulTVec2(xfB2.q,v3));wB=Transform.mulVec2(xfB2,proxyB.getVertex(indexB));var p=Vec2.sub(wA,wB);v3.normalize();var vp=Vec2.dot(v3,p);var vr=Vec2.dot(v3,r);if(vp-sigma>lambda*vr){if(vr<=0){return false}lambda=(vp-sigma)/vr;if(lambda>1){return false}n2.setMul(-1,v3);simplex2.m_count=0}var vertex=vertices[simplex2.m_count];vertex.indexA=indexB;vertex.wA=Vec2.combine(1,wB,lambda,r);vertex.indexB=indexA;vertex.wB=wA;vertex.w=Vec2.sub(vertex.wB,vertex.wA);vertex.a=1;simplex2.m_count+=1;switch(simplex2.m_count){case 1:break;case 2:simplex2.solve2();break;case 3:simplex2.solve3();break}if(simplex2.m_count==3){return false}v3.setVec2(simplex2.getClosestPoint());++iter}if(iter==0){return false}var pointA2=Vec2.zero();var pointB2=Vec2.zero();simplex2.getWitnessPoints(pointB2,pointA2);if(v3.lengthSquared()>0){n2.setMul(-1,v3);n2.normalize()}output2.point=Vec2.combine(1,pointA2,radiusA,n2);output2.normal=n2;output2.lambda=lambda;output2.iterations=iter;return true};var math_abs$7=Math.abs;var math_max$3=Math.max;var TOIInput=function(){function TOIInput2(){this.proxyA=new DistanceProxy;this.proxyB=new DistanceProxy;this.sweepA=new Sweep;this.sweepB=new Sweep}TOIInput2.prototype.recycle=function(){this.proxyA.recycle();this.proxyB.recycle();this.sweepA.recycle();this.sweepB.recycle();this.tMax=-1};return TOIInput2}();exports2.TOIOutputState=void 0;(function(TOIOutputState2){TOIOutputState2[TOIOutputState2["e_unset"]=-1]="e_unset";TOIOutputState2[TOIOutputState2["e_unknown"]=0]="e_unknown";TOIOutputState2[TOIOutputState2["e_failed"]=1]="e_failed";TOIOutputState2[TOIOutputState2["e_overlapped"]=2]="e_overlapped";TOIOutputState2[TOIOutputState2["e_touching"]=3]="e_touching";TOIOutputState2[TOIOutputState2["e_separated"]=4]="e_separated"})(exports2.TOIOutputState||(exports2.TOIOutputState={}));var TOIOutput=function(){function TOIOutput2(){this.state=exports2.TOIOutputState.e_unset;this.t=-1}TOIOutput2.prototype.recycle=function(){this.state=exports2.TOIOutputState.e_unset;this.t=-1};return TOIOutput2}();stats.toiTime=0;stats.toiMaxTime=0;stats.toiCalls=0;stats.toiIters=0;stats.toiMaxIters=0;stats.toiRootIters=0;stats.toiMaxRootIters=0;var distanceInput=new DistanceInput;var distanceOutput=new DistanceOutput;var cache=new SimplexCache;var xfA$1=transform(0,0,0);var xfB$1=transform(0,0,0);var temp$4=vec2(0,0);var pointA$2=vec2(0,0);var pointB$2=vec2(0,0);var normal$3=vec2(0,0);var axisA=vec2(0,0);var axisB=vec2(0,0);var localPointA=vec2(0,0);var localPointB=vec2(0,0);var TimeOfImpact=function(output2,input2){var timer=Timer.now();++stats.toiCalls;output2.state=exports2.TOIOutputState.e_unknown;output2.t=input2.tMax;var proxyA=input2.proxyA;var proxyB=input2.proxyB;var sweepA=input2.sweepA;var sweepB=input2.sweepB;sweepA.normalize();sweepB.normalize();if(!sweepA.isValid()||!sweepB.isValid()){output2.state=exports2.TOIOutputState.e_failed;return}var tMax=input2.tMax;var totalRadius=proxyA.m_radius+proxyB.m_radius;var target=math_max$3(SettingsInternal.linearSlop,totalRadius-3*SettingsInternal.linearSlop);var tolerance=.25*SettingsInternal.linearSlop;var t1=0;var k_maxIterations=SettingsInternal.maxTOIIterations;var iter=0;cache.recycle();distanceInput.proxyA.setVertices(proxyA.m_vertices,proxyA.m_count,proxyA.m_radius);distanceInput.proxyB.setVertices(proxyB.m_vertices,proxyB.m_count,proxyB.m_radius);distanceInput.useRadii=false;while(true){sweepA.getTransform(xfA$1,t1);sweepB.getTransform(xfB$1,t1);copyTransform(distanceInput.transformA,xfA$1);copyTransform(distanceInput.transformB,xfB$1);Distance(distanceOutput,cache,distanceInput);if(distanceOutput.distance<=0){output2.state=exports2.TOIOutputState.e_overlapped;output2.t=0;break}if(distanceOutput.distance<target+tolerance){output2.state=exports2.TOIOutputState.e_touching;output2.t=t1;break}separationFunction.initialize(cache,proxyA,sweepA,proxyB,sweepB,t1);var done=false;var t2=tMax;var pushBackIter=0;while(true){var s2=separationFunction.findMinSeparation(t2);if(s2>target+tolerance){output2.state=exports2.TOIOutputState.e_separated;output2.t=tMax;done=true;break}if(s2>target-tolerance){t1=t2;break}var s1=separationFunction.evaluate(t1);if(s1<target-tolerance){output2.state=exports2.TOIOutputState.e_failed;output2.t=t1;done=true;break}if(s1<=target+tolerance){output2.state=exports2.TOIOutputState.e_touching;output2.t=t1;done=true;break}var rootIterCount=0;var a1=t1;var a2=t2;while(true){var t=void 0;if(rootIterCount&1){t=a1+(target-s1)*(a2-a1)/(s2-s1)}else{t=.5*(a1+a2)}++rootIterCount;++stats.toiRootIters;var s3=separationFunction.evaluate(t);if(math_abs$7(s3-target)<tolerance){t2=t;break}if(s3>target){a1=t;s1=s3}else{a2=t;s2=s3}if(rootIterCount===50){break}}stats.toiMaxRootIters=math_max$3(stats.toiMaxRootIters,rootIterCount);++pushBackIter;if(pushBackIter===SettingsInternal.maxPolygonVertices){break}}++iter;++stats.toiIters;if(done){break}if(iter===k_maxIterations){output2.state=exports2.TOIOutputState.e_failed;output2.t=t1;break}}stats.toiMaxIters=math_max$3(stats.toiMaxIters,iter);var time=Timer.diff(timer);stats.toiMaxTime=math_max$3(stats.toiMaxTime,time);stats.toiTime+=time;separationFunction.recycle()};var SeparationFunctionType;(function(SeparationFunctionType2){SeparationFunctionType2[SeparationFunctionType2["e_unset"]=-1]="e_unset";SeparationFunctionType2[SeparationFunctionType2["e_points"]=1]="e_points";SeparationFunctionType2[SeparationFunctionType2["e_faceA"]=2]="e_faceA";SeparationFunctionType2[SeparationFunctionType2["e_faceB"]=3]="e_faceB"})(SeparationFunctionType||(SeparationFunctionType={}));var SeparationFunction=function(){function SeparationFunction2(){this.m_proxyA=null;this.m_proxyB=null;this.m_sweepA=null;this.m_sweepB=null;this.m_type=SeparationFunctionType.e_unset;this.m_localPoint=vec2(0,0);this.m_axis=vec2(0,0);this.indexA=-1;this.indexB=-1}SeparationFunction2.prototype.recycle=function(){this.m_proxyA=null;this.m_proxyB=null;this.m_sweepA=null;this.m_sweepB=null;this.m_type=SeparationFunctionType.e_unset;zeroVec2(this.m_localPoint);zeroVec2(this.m_axis);this.indexA=-1;this.indexB=-1};SeparationFunction2.prototype.initialize=function(cache2,proxyA,sweepA,proxyB,sweepB,t1){var count=cache2.count;this.m_proxyA=proxyA;this.m_proxyB=proxyB;this.m_sweepA=sweepA;this.m_sweepB=sweepB;this.m_sweepA.getTransform(xfA$1,t1);this.m_sweepB.getTransform(xfB$1,t1);if(count===1){this.m_type=SeparationFunctionType.e_points;var localPointA_1=this.m_proxyA.getVertex(cache2.indexA[0]);var localPointB_1=this.m_proxyB.getVertex(cache2.indexB[0]);transformVec2(pointA$2,xfA$1,localPointA_1);transformVec2(pointB$2,xfB$1,localPointB_1);subVec2(this.m_axis,pointB$2,pointA$2);var s2=normalizeVec2Length(this.m_axis);return s2}else if(cache2.indexA[0]===cache2.indexA[1]){this.m_type=SeparationFunctionType.e_faceB;var localPointB1=proxyB.getVertex(cache2.indexB[0]);var localPointB2=proxyB.getVertex(cache2.indexB[1]);crossVec2Num(this.m_axis,subVec2(temp$4,localPointB2,localPointB1),1);normalizeVec2(this.m_axis);rotVec2(normal$3,xfB$1.q,this.m_axis);combine2Vec2(this.m_localPoint,.5,localPointB1,.5,localPointB2);transformVec2(pointB$2,xfB$1,this.m_localPoint);var localPointA_2=proxyA.getVertex(cache2.indexA[0]);var pointA_1=Transform.mulVec2(xfA$1,localPointA_2);var s2=dotVec2(pointA_1,normal$3)-dotVec2(pointB$2,normal$3);if(s2<0){negVec2(this.m_axis);s2=-s2}return s2}else{this.m_type=SeparationFunctionType.e_faceA;var localPointA1=this.m_proxyA.getVertex(cache2.indexA[0]);var localPointA2=this.m_proxyA.getVertex(cache2.indexA[1]);crossVec2Num(this.m_axis,subVec2(temp$4,localPointA2,localPointA1),1);normalizeVec2(this.m_axis);rotVec2(normal$3,xfA$1.q,this.m_axis);combine2Vec2(this.m_localPoint,.5,localPointA1,.5,localPointA2);transformVec2(pointA$2,xfA$1,this.m_localPoint);var localPointB_2=this.m_proxyB.getVertex(cache2.indexB[0]);transformVec2(pointB$2,xfB$1,localPointB_2);var s2=dotVec2(pointB$2,normal$3)-dotVec2(pointA$2,normal$3);if(s2<0){negVec2(this.m_axis);s2=-s2}return s2}};SeparationFunction2.prototype.compute=function(find,t){this.m_sweepA.getTransform(xfA$1,t);this.m_sweepB.getTransform(xfB$1,t);switch(this.m_type){case SeparationFunctionType.e_points:{if(find){derotVec2(axisA,xfA$1.q,this.m_axis);derotVec2(axisB,xfB$1.q,scaleVec2(temp$4,-1,this.m_axis));this.indexA=this.m_proxyA.getSupport(axisA);this.indexB=this.m_proxyB.getSupport(axisB)}copyVec2(localPointA,this.m_proxyA.getVertex(this.indexA));copyVec2(localPointB,this.m_proxyB.getVertex(this.indexB));transformVec2(pointA$2,xfA$1,localPointA);transformVec2(pointB$2,xfB$1,localPointB);var sep=dotVec2(pointB$2,this.m_axis)-dotVec2(pointA$2,this.m_axis);return sep}case SeparationFunctionType.e_faceA:{rotVec2(normal$3,xfA$1.q,this.m_axis);transformVec2(pointA$2,xfA$1,this.m_localPoint);if(find){derotVec2(axisB,xfB$1.q,scaleVec2(temp$4,-1,normal$3));this.indexA=-1;this.indexB=this.m_proxyB.getSupport(axisB)}copyVec2(localPointB,this.m_proxyB.getVertex(this.indexB));transformVec2(pointB$2,xfB$1,localPointB);var sep=dotVec2(pointB$2,normal$3)-dotVec2(pointA$2,normal$3);return sep}case SeparationFunctionType.e_faceB:{rotVec2(normal$3,xfB$1.q,this.m_axis);transformVec2(pointB$2,xfB$1,this.m_localPoint);if(find){derotVec2(axisA,xfA$1.q,scaleVec2(temp$4,-1,normal$3));this.indexB=-1;this.indexA=this.m_proxyA.getSupport(axisA)}copyVec2(localPointA,this.m_proxyA.getVertex(this.indexA));transformVec2(pointA$2,xfA$1,localPointA);var sep=dotVec2(pointA$2,normal$3)-dotVec2(pointB$2,normal$3);return sep}default:if(find){this.indexA=-1;this.indexB=-1}return 0}};SeparationFunction2.prototype.findMinSeparation=function(t){return this.compute(true,t)};SeparationFunction2.prototype.evaluate=function(t){return this.compute(false,t)};return SeparationFunction2}();var separationFunction=new SeparationFunction;TimeOfImpact.Input=TOIInput;TimeOfImpact.Output=TOIOutput;var math_abs$6=Math.abs;var math_sqrt$3=Math.sqrt;var math_min$5=Math.min;var TimeStep=function(){function TimeStep2(){this.dt=0;this.inv_dt=0;this.velocityIterations=0;this.positionIterations=0;this.warmStarting=false;this.blockSolve=true;this.inv_dt0=0;this.dtRatio=1}TimeStep2.prototype.reset=function(dt){if(this.dt>0){this.inv_dt0=this.inv_dt}this.dt=dt;this.inv_dt=dt==0?0:1/dt;this.dtRatio=dt*this.inv_dt0};return TimeStep2}();var s_subStep=new TimeStep;var c=vec2(0,0);var v=vec2(0,0);var translation=vec2(0,0);var input=new TOIInput;var output=new TOIOutput;var backup=new Sweep;var backup1=new Sweep;var backup2=new Sweep;var ContactImpulse=function(){function ContactImpulse2(contact){this.contact=contact;this.normals=[];this.tangents=[]}ContactImpulse2.prototype.recycle=function(){this.normals.length=0;this.tangents.length=0};Object.defineProperty(ContactImpulse2.prototype,"normalImpulses",{get:function(){var contact=this.contact;var normals=this.normals;normals.length=0;for(var p=0;p<contact.v_points.length;++p){normals.push(contact.v_points[p].normalImpulse)}return normals},enumerable:false,configurable:true});Object.defineProperty(ContactImpulse2.prototype,"tangentImpulses",{get:function(){var contact=this.contact;var tangents=this.tangents;tangents.length=0;for(var p=0;p<contact.v_points.length;++p){tangents.push(contact.v_points[p].tangentImpulse)}return tangents},enumerable:false,configurable:true});return ContactImpulse2}();var Solver=function(){function Solver2(world){this.m_world=world;this.m_stack=[];this.m_bodies=[];this.m_contacts=[];this.m_joints=[]}Solver2.prototype.clear=function(){this.m_stack.length=0;this.m_bodies.length=0;this.m_contacts.length=0;this.m_joints.length=0};Solver2.prototype.addBody=function(body){this.m_bodies.push(body)};Solver2.prototype.addContact=function(contact){this.m_contacts.push(contact)};Solver2.prototype.addJoint=function(joint){this.m_joints.push(joint)};Solver2.prototype.solveWorld=function(step){var world=this.m_world;for(var b2=world.m_bodyList;b2;b2=b2.m_next){b2.m_islandFlag=false}for(var c_1=world.m_contactList;c_1;c_1=c_1.m_next){c_1.m_islandFlag=false}for(var j=world.m_jointList;j;j=j.m_next){j.m_islandFlag=false}var stack=this.m_stack;for(var seed=world.m_bodyList;seed;seed=seed.m_next){if(seed.m_islandFlag){continue}if(seed.isAwake()==false||seed.isActive()==false){continue}if(seed.isStatic()){continue}this.clear();stack.push(seed);seed.m_islandFlag=true;while(stack.length>0){var b2=stack.pop();this.addBody(b2);b2.m_awakeFlag=true;if(b2.isStatic()){continue}for(var ce=b2.m_contactList;ce;ce=ce.next){var contact=ce.contact;if(contact.m_islandFlag){continue}if(contact.isEnabled()==false||contact.isTouching()==false){continue}var sensorA=contact.m_fixtureA.m_isSensor;var sensorB=contact.m_fixtureB.m_isSensor;if(sensorA||sensorB){continue}this.addContact(contact);contact.m_islandFlag=true;var other=ce.other;if(other.m_islandFlag){continue}stack.push(other);other.m_islandFlag=true}for(var je=b2.m_jointList;je;je=je.next){if(je.joint.m_islandFlag==true){continue}var other=je.other;if(other.isActive()==false){continue}this.addJoint(je.joint);je.joint.m_islandFlag=true;if(other.m_islandFlag){continue}stack.push(other);other.m_islandFlag=true}}this.solveIsland(step);for(var i=0;i<this.m_bodies.length;++i){var b2=this.m_bodies[i];if(b2.isStatic()){b2.m_islandFlag=false}}}};Solver2.prototype.solveIsland=function(step){var world=this.m_world;var gravity=world.m_gravity;var allowSleep=world.m_allowSleep;var h=step.dt;for(var i=0;i<this.m_bodies.length;++i){var body=this.m_bodies[i];copyVec2(c,body.m_sweep.c);var a2=body.m_sweep.a;copyVec2(v,body.m_linearVelocity);var w=body.m_angularVelocity;copyVec2(body.m_sweep.c0,body.m_sweep.c);body.m_sweep.a0=body.m_sweep.a;if(body.isDynamic()){plusScaleVec2(v,h*body.m_gravityScale,gravity);plusScaleVec2(v,h*body.m_invMass,body.m_force);w+=h*body.m_invI*body.m_torque;scaleVec2(v,1/(1+h*body.m_linearDamping),v);w*=1/(1+h*body.m_angularDamping)}copyVec2(body.c_position.c,c);body.c_position.a=a2;copyVec2(body.c_velocity.v,v);body.c_velocity.w=w}for(var i=0;i<this.m_contacts.length;++i){var contact=this.m_contacts[i];contact.initConstraint(step)}for(var i=0;i<this.m_contacts.length;++i){var contact=this.m_contacts[i];contact.initVelocityConstraint(step)}if(step.warmStarting){for(var i=0;i<this.m_contacts.length;++i){var contact=this.m_contacts[i];contact.warmStartConstraint(step)}}for(var i=0;i<this.m_joints.length;++i){var joint=this.m_joints[i];joint.initVelocityConstraints(step)}for(var i=0;i<step.velocityIterations;++i){for(var j=0;j<this.m_joints.length;++j){var joint=this.m_joints[j];joint.solveVelocityConstraints(step)}for(var j=0;j<this.m_contacts.length;++j){var contact=this.m_contacts[j];contact.solveVelocityConstraint(step)}}for(var i=0;i<this.m_contacts.length;++i){var contact=this.m_contacts[i];contact.storeConstraintImpulses(step)}for(var i=0;i<this.m_bodies.length;++i){var body=this.m_bodies[i];copyVec2(c,body.c_position.c);var a2=body.c_position.a;copyVec2(v,body.c_velocity.v);var w=body.c_velocity.w;scaleVec2(translation,h,v);var translationLengthSqr=lengthSqrVec2(translation);if(translationLengthSqr>SettingsInternal.maxTranslationSquared){var ratio=SettingsInternal.maxTranslation/math_sqrt$3(translationLengthSqr);mulVec2(v,ratio)}var rotation2=h*w;if(rotation2*rotation2>SettingsInternal.maxRotationSquared){var ratio=SettingsInternal.maxRotation/math_abs$6(rotation2);w*=ratio}plusScaleVec2(c,h,v);a2+=h*w;copyVec2(body.c_position.c,c);body.c_position.a=a2;copyVec2(body.c_velocity.v,v);body.c_velocity.w=w}var positionSolved=false;for(var i=0;i<step.positionIterations;++i){var minSeparation=0;for(var j=0;j<this.m_contacts.length;++j){var contact=this.m_contacts[j];var separation=contact.solvePositionConstraint(step);minSeparation=math_min$5(minSeparation,separation)}var contactsOkay=minSeparation>=-3*SettingsInternal.linearSlop;var jointsOkay=true;for(var j=0;j<this.m_joints.length;++j){var joint=this.m_joints[j];var jointOkay=joint.solvePositionConstraints(step);jointsOkay=jointsOkay&&jointOkay}if(contactsOkay&&jointsOkay){positionSolved=true;break}}for(var i=0;i<this.m_bodies.length;++i){var body=this.m_bodies[i];copyVec2(body.m_sweep.c,body.c_position.c);body.m_sweep.a=body.c_position.a;copyVec2(body.m_linearVelocity,body.c_velocity.v);body.m_angularVelocity=body.c_velocity.w;body.synchronizeTransform()}this.postSolveIsland();if(allowSleep){var minSleepTime=Infinity;var linTolSqr=SettingsInternal.linearSleepToleranceSqr;var angTolSqr=SettingsInternal.angularSleepToleranceSqr;for(var i=0;i<this.m_bodies.length;++i){var body=this.m_bodies[i];if(body.isStatic()){continue}if(body.m_autoSleepFlag==false||body.m_angularVelocity*body.m_angularVelocity>angTolSqr||lengthSqrVec2(body.m_linearVelocity)>linTolSqr){body.m_sleepTime=0;minSleepTime=0}else{body.m_sleepTime+=h;minSleepTime=math_min$5(minSleepTime,body.m_sleepTime)}}if(minSleepTime>=SettingsInternal.timeToSleep&&positionSolved){for(var i=0;i<this.m_bodies.length;++i){var body=this.m_bodies[i];body.setAwake(false)}}}};Solver2.prototype.solveWorldTOI=function(step){var world=this.m_world;if(world.m_stepComplete){for(var b2=world.m_bodyList;b2;b2=b2.m_next){b2.m_islandFlag=false;b2.m_sweep.alpha0=0}for(var c_2=world.m_contactList;c_2;c_2=c_2.m_next){c_2.m_toiFlag=false;c_2.m_islandFlag=false;c_2.m_toiCount=0;c_2.m_toi=1}}while(true){var minContact=null;var minAlpha=1;for(var c_3=world.m_contactList;c_3;c_3=c_3.m_next){if(c_3.isEnabled()==false){continue}if(c_3.m_toiCount>SettingsInternal.maxSubSteps){continue}var alpha=1;if(c_3.m_toiFlag){alpha=c_3.m_toi}else{var fA_1=c_3.getFixtureA();var fB_1=c_3.getFixtureB();if(fA_1.isSensor()||fB_1.isSensor()){continue}var bA_1=fA_1.getBody();var bB_1=fB_1.getBody();var activeA=bA_1.isAwake()&&!bA_1.isStatic();var activeB=bB_1.isAwake()&&!bB_1.isStatic();if(activeA==false&&activeB==false){continue}var collideA=bA_1.isBullet()||!bA_1.isDynamic();var collideB=bB_1.isBullet()||!bB_1.isDynamic();if(collideA==false&&collideB==false){continue}var alpha0=bA_1.m_sweep.alpha0;if(bA_1.m_sweep.alpha0<bB_1.m_sweep.alpha0){alpha0=bB_1.m_sweep.alpha0;bA_1.m_sweep.advance(alpha0)}else if(bB_1.m_sweep.alpha0<bA_1.m_sweep.alpha0){alpha0=bA_1.m_sweep.alpha0;bB_1.m_sweep.advance(alpha0)}var indexA=c_3.getChildIndexA();var indexB=c_3.getChildIndexB();input.proxyA.set(fA_1.getShape(),indexA);input.proxyB.set(fB_1.getShape(),indexB);input.sweepA.set(bA_1.m_sweep);input.sweepB.set(bB_1.m_sweep);input.tMax=1;TimeOfImpact(output,input);var beta=output.t;if(output.state==exports2.TOIOutputState.e_touching){alpha=math_min$5(alpha0+(1-alpha0)*beta,1)}else{alpha=1}c_3.m_toi=alpha;c_3.m_toiFlag=true}if(alpha<minAlpha){minContact=c_3;minAlpha=alpha}}if(minContact==null||1-10*EPSILON<minAlpha){world.m_stepComplete=true;break}var fA=minContact.getFixtureA();var fB=minContact.getFixtureB();var bA=fA.getBody();var bB=fB.getBody();backup1.set(bA.m_sweep);backup2.set(bB.m_sweep);bA.advance(minAlpha);bB.advance(minAlpha);minContact.update(world);minContact.m_toiFlag=false;++minContact.m_toiCount;if(minContact.isEnabled()==false||minContact.isTouching()==false){minContact.setEnabled(false);bA.m_sweep.set(backup1);bB.m_sweep.set(backup2);bA.synchronizeTransform();bB.synchronizeTransform();continue}bA.setAwake(true);bB.setAwake(true);this.clear();this.addBody(bA);this.addBody(bB);this.addContact(minContact);bA.m_islandFlag=true;bB.m_islandFlag=true;minContact.m_islandFlag=true;var bodies=[bA,bB];for(var i=0;i<bodies.length;++i){var body=bodies[i];if(body.isDynamic()){for(var ce=body.m_contactList;ce;ce=ce.next){var contact=ce.contact;if(contact.m_islandFlag){continue}var other=ce.other;if(other.isDynamic()&&!body.isBullet()&&!other.isBullet()){continue}var sensorA=contact.m_fixtureA.m_isSensor;var sensorB=contact.m_fixtureB.m_isSensor;if(sensorA||sensorB){continue}backup.set(other.m_sweep);if(other.m_islandFlag==false){other.advance(minAlpha)}contact.update(world);if(contact.isEnabled()==false||contact.isTouching()==false){other.m_sweep.set(backup);other.synchronizeTransform();continue}contact.m_islandFlag=true;this.addContact(contact);if(other.m_islandFlag){continue}other.m_islandFlag=true;if(!other.isStatic()){other.setAwake(true)}this.addBody(other)}}}s_subStep.reset((1-minAlpha)*step.dt);s_subStep.dtRatio=1;s_subStep.positionIterations=20;s_subStep.velocityIterations=step.velocityIterations;s_subStep.warmStarting=false;this.solveIslandTOI(s_subStep,bA,bB);for(var i=0;i<this.m_bodies.length;++i){var body=this.m_bodies[i];body.m_islandFlag=false;if(!body.isDynamic()){continue}body.synchronizeFixtures();for(var ce=body.m_contactList;ce;ce=ce.next){ce.contact.m_toiFlag=false;ce.contact.m_islandFlag=false}}world.findNewContacts();if(world.m_subStepping){world.m_stepComplete=false;break}}};Solver2.prototype.solveIslandTOI=function(subStep,toiA,toiB){for(var i=0;i<this.m_bodies.length;++i){var body=this.m_bodies[i];copyVec2(body.c_position.c,body.m_sweep.c);body.c_position.a=body.m_sweep.a;copyVec2(body.c_velocity.v,body.m_linearVelocity);body.c_velocity.w=body.m_angularVelocity}for(var i=0;i<this.m_contacts.length;++i){var contact=this.m_contacts[i];contact.initConstraint(subStep)}for(var i=0;i<subStep.positionIterations;++i){var minSeparation=0;for(var j=0;j<this.m_contacts.length;++j){var contact=this.m_contacts[j];var separation=contact.solvePositionConstraintTOI(subStep,toiA,toiB);minSeparation=math_min$5(minSeparation,separation)}var contactsOkay=minSeparation>=-1.5*SettingsInternal.linearSlop;if(contactsOkay){break}}var i;copyVec2(toiA.m_sweep.c0,toiA.c_position.c);toiA.m_sweep.a0=toiA.c_position.a;copyVec2(toiB.m_sweep.c0,toiB.c_position.c);toiB.m_sweep.a0=toiB.c_position.a;for(var i=0;i<this.m_contacts.length;++i){var contact=this.m_contacts[i];contact.initVelocityConstraint(subStep)}for(var i=0;i<subStep.velocityIterations;++i){for(var j=0;j<this.m_contacts.length;++j){var contact=this.m_contacts[j];contact.solveVelocityConstraint(subStep)}}var h=subStep.dt;for(var i=0;i<this.m_bodies.length;++i){var body=this.m_bodies[i];copyVec2(c,body.c_position.c);var a2=body.c_position.a;copyVec2(v,body.c_velocity.v);var w=body.c_velocity.w;scaleVec2(translation,h,v);var translationLengthSqr=lengthSqrVec2(translation);if(translationLengthSqr>SettingsInternal.maxTranslationSquared){var ratio=SettingsInternal.maxTranslation/math_sqrt$3(translationLengthSqr);mulVec2(v,ratio)}var rotation2=h*w;if(rotation2*rotation2>SettingsInternal.maxRotationSquared){var ratio=SettingsInternal.maxRotation/math_abs$6(rotation2);w*=ratio}plusScaleVec2(c,h,v);a2+=h*w;copyVec2(body.c_position.c,c);body.c_position.a=a2;copyVec2(body.c_velocity.v,v);body.c_velocity.w=w;copyVec2(body.m_sweep.c,c);body.m_sweep.a=a2;copyVec2(body.m_linearVelocity,v);body.m_angularVelocity=w;body.synchronizeTransform()}this.postSolveIsland()};Solver2.prototype.postSolveIsland=function(){for(var c_5=0;c_5<this.m_contacts.length;++c_5){var contact=this.m_contacts[c_5];this.m_world.postSolve(contact,contact.m_impulse)}};return Solver2}();Solver.TimeStep=TimeStep;var Mat22=function(){function Mat222(a2,b2,c2,d2){if(typeof a2==="object"&&a2!==null){this.ex=Vec2.clone(a2);this.ey=Vec2.clone(b2)}else if(typeof a2==="number"){this.ex=Vec2.neo(a2,c2);this.ey=Vec2.neo(b2,d2)}else{this.ex=Vec2.zero();this.ey=Vec2.zero()}}Mat222.prototype.toString=function(){return JSON.stringify(this)};Mat222.isValid=function(obj){if(obj===null||typeof obj==="undefined"){return false}return Vec2.isValid(obj.ex)&&Vec2.isValid(obj.ey)};Mat222.assert=function(o){};Mat222.prototype.set=function(a2,b2,c2,d2){if(typeof a2==="number"&&typeof b2==="number"&&typeof c2==="number"&&typeof d2==="number"){this.ex.setNum(a2,c2);this.ey.setNum(b2,d2)}else if(typeof a2==="object"&&typeof b2==="object"){this.ex.setVec2(a2);this.ey.setVec2(b2)}else if(typeof a2==="object"){this.ex.setVec2(a2.ex);this.ey.setVec2(a2.ey)}else;};Mat222.prototype.setIdentity=function(){this.ex.x=1;this.ey.x=0;this.ex.y=0;this.ey.y=1};Mat222.prototype.setZero=function(){this.ex.x=0;this.ey.x=0;this.ex.y=0;this.ey.y=0};Mat222.prototype.getInverse=function(){var a2=this.ex.x;var b2=this.ey.x;var c2=this.ex.y;var d2=this.ey.y;var det=a2*d2-b2*c2;if(det!==0){det=1/det}var imx=new Mat222;imx.ex.x=det*d2;imx.ey.x=-det*b2;imx.ex.y=-det*c2;imx.ey.y=det*a2;return imx};Mat222.prototype.solve=function(v3){var a2=this.ex.x;var b2=this.ey.x;var c2=this.ex.y;var d2=this.ey.y;var det=a2*d2-b2*c2;if(det!==0){det=1/det}var w=Vec2.zero();w.x=det*(d2*v3.x-b2*v3.y);w.y=det*(a2*v3.y-c2*v3.x);return w};Mat222.mul=function(mx,v3){if(v3&&"x"in v3&&"y"in v3){var x2=mx.ex.x*v3.x+mx.ey.x*v3.y;var y=mx.ex.y*v3.x+mx.ey.y*v3.y;return Vec2.neo(x2,y)}else if(v3&&"ex"in v3&&"ey"in v3){var a2=mx.ex.x*v3.ex.x+mx.ey.x*v3.ex.y;var b2=mx.ex.x*v3.ey.x+mx.ey.x*v3.ey.y;var c2=mx.ex.y*v3.ex.x+mx.ey.y*v3.ex.y;var d2=mx.ex.y*v3.ey.x+mx.ey.y*v3.ey.y;return new Mat222(a2,b2,c2,d2)}};Mat222.mulVec2=function(mx,v3){var x2=mx.ex.x*v3.x+mx.ey.x*v3.y;var y=mx.ex.y*v3.x+mx.ey.y*v3.y;return Vec2.neo(x2,y)};Mat222.mulMat22=function(mx,v3){var a2=mx.ex.x*v3.ex.x+mx.ey.x*v3.ex.y;var b2=mx.ex.x*v3.ey.x+mx.ey.x*v3.ey.y;var c2=mx.ex.y*v3.ex.x+mx.ey.y*v3.ex.y;var d2=mx.ex.y*v3.ey.x+mx.ey.y*v3.ey.y;return new Mat222(a2,b2,c2,d2)};Mat222.mulT=function(mx,v3){if(v3&&"x"in v3&&"y"in v3){return Vec2.neo(Vec2.dot(v3,mx.ex),Vec2.dot(v3,mx.ey))}else if(v3&&"ex"in v3&&"ey"in v3){var c1=Vec2.neo(Vec2.dot(mx.ex,v3.ex),Vec2.dot(mx.ey,v3.ex));var c2=Vec2.neo(Vec2.dot(mx.ex,v3.ey),Vec2.dot(mx.ey,v3.ey));return new Mat222(c1,c2)}};Mat222.mulTVec2=function(mx,v3){return Vec2.neo(Vec2.dot(v3,mx.ex),Vec2.dot(v3,mx.ey))};Mat222.mulTMat22=function(mx,v3){var c1=Vec2.neo(Vec2.dot(mx.ex,v3.ex),Vec2.dot(mx.ey,v3.ex));var c2=Vec2.neo(Vec2.dot(mx.ex,v3.ey),Vec2.dot(mx.ey,v3.ey));return new Mat222(c1,c2)};Mat222.abs=function(mx){return new Mat222(Vec2.abs(mx.ex),Vec2.abs(mx.ey))};Mat222.add=function(mx1,mx2){return new Mat222(Vec2.add(mx1.ex,mx2.ex),Vec2.add(mx1.ey,mx2.ey))};return Mat222}();var math_sqrt$2=Math.sqrt;var pointA$1=vec2(0,0);var pointB$1=vec2(0,0);var temp$3=vec2(0,0);var cA$1=vec2(0,0);var cB$1=vec2(0,0);var dist=vec2(0,0);var planePoint$2=vec2(0,0);var clipPoint$1=vec2(0,0);exports2.ManifoldType=void 0;(function(ManifoldType2){ManifoldType2[ManifoldType2["e_unset"]=-1]="e_unset";ManifoldType2[ManifoldType2["e_circles"]=0]="e_circles";ManifoldType2[ManifoldType2["e_faceA"]=1]="e_faceA";ManifoldType2[ManifoldType2["e_faceB"]=2]="e_faceB"})(exports2.ManifoldType||(exports2.ManifoldType={}));exports2.ContactFeatureType=void 0;(function(ContactFeatureType2){ContactFeatureType2[ContactFeatureType2["e_unset"]=-1]="e_unset";ContactFeatureType2[ContactFeatureType2["e_vertex"]=0]="e_vertex";ContactFeatureType2[ContactFeatureType2["e_face"]=1]="e_face"})(exports2.ContactFeatureType||(exports2.ContactFeatureType={}));exports2.PointState=void 0;(function(PointState2){PointState2[PointState2["nullState"]=0]="nullState";PointState2[PointState2["addState"]=1]="addState";PointState2[PointState2["persistState"]=2]="persistState";PointState2[PointState2["removeState"]=3]="removeState"})(exports2.PointState||(exports2.PointState={}));var ClipVertex=function(){function ClipVertex2(){this.v=vec2(0,0);this.id=new ContactID}ClipVertex2.prototype.set=function(o){copyVec2(this.v,o.v);this.id.set(o.id)};ClipVertex2.prototype.recycle=function(){zeroVec2(this.v);this.id.recycle()};return ClipVertex2}();var Manifold=function(){function Manifold2(){this.localNormal=vec2(0,0);this.localPoint=vec2(0,0);this.points=[new ManifoldPoint,new ManifoldPoint];this.pointCount=0}Manifold2.prototype.set=function(that){this.type=that.type;copyVec2(this.localNormal,that.localNormal);copyVec2(this.localPoint,that.localPoint);this.pointCount=that.pointCount;this.points[0].set(that.points[0]);this.points[1].set(that.points[1])};Manifold2.prototype.recycle=function(){this.type=exports2.ManifoldType.e_unset;zeroVec2(this.localNormal);zeroVec2(this.localPoint);this.pointCount=0;this.points[0].recycle();this.points[1].recycle()};Manifold2.prototype.getWorldManifold=function(wm,xfA2,radiusA,xfB2,radiusB){if(this.pointCount==0){return wm}wm=wm||new WorldManifold;wm.pointCount=this.pointCount;var normal3=wm.normal;var points=wm.points;var separations=wm.separations;switch(this.type){case exports2.ManifoldType.e_circles:{setVec2(normal3,1,0);var manifoldPoint=this.points[0];transformVec2(pointA$1,xfA2,this.localPoint);transformVec2(pointB$1,xfB2,manifoldPoint.localPoint);subVec2(dist,pointB$1,pointA$1);var lengthSqr=lengthSqrVec2(dist);if(lengthSqr>EPSILON*EPSILON){var length_1=math_sqrt$2(lengthSqr);scaleVec2(normal3,1/length_1,dist)}combine2Vec2(cA$1,1,pointA$1,radiusA,normal3);combine2Vec2(cB$1,1,pointB$1,-radiusB,normal3);combine2Vec2(points[0],.5,cA$1,.5,cB$1);separations[0]=dotVec2(subVec2(temp$3,cB$1,cA$1),normal3);break}case exports2.ManifoldType.e_faceA:{rotVec2(normal3,xfA2.q,this.localNormal);transformVec2(planePoint$2,xfA2,this.localPoint);for(var i=0;i<this.pointCount;++i){var manifoldPoint=this.points[i];transformVec2(clipPoint$1,xfB2,manifoldPoint.localPoint);combine2Vec2(cA$1,1,clipPoint$1,radiusA-dotVec2(subVec2(temp$3,clipPoint$1,planePoint$2),normal3),normal3);combine2Vec2(cB$1,1,clipPoint$1,-radiusB,normal3);combine2Vec2(points[i],.5,cA$1,.5,cB$1);separations[i]=dotVec2(subVec2(temp$3,cB$1,cA$1),normal3)}break}case exports2.ManifoldType.e_faceB:{rotVec2(normal3,xfB2.q,this.localNormal);transformVec2(planePoint$2,xfB2,this.localPoint);for(var i=0;i<this.pointCount;++i){var manifoldPoint=this.points[i];transformVec2(clipPoint$1,xfA2,manifoldPoint.localPoint);combine2Vec2(cB$1,1,clipPoint$1,radiusB-dotVec2(subVec2(temp$3,clipPoint$1,planePoint$2),normal3),normal3);combine2Vec2(cA$1,1,clipPoint$1,-radiusA,normal3);combine2Vec2(points[i],.5,cA$1,.5,cB$1);separations[i]=dotVec2(subVec2(temp$3,cA$1,cB$1),normal3)}negVec2(normal3);break}}return wm};Manifold2.clipSegmentToLine=clipSegmentToLine;Manifold2.ClipVertex=ClipVertex;Manifold2.getPointStates=getPointStates;Manifold2.PointState=exports2.PointState;return Manifold2}();var ManifoldPoint=function(){function ManifoldPoint2(){this.localPoint=vec2(0,0);this.normalImpulse=0;this.tangentImpulse=0;this.id=new ContactID}ManifoldPoint2.prototype.set=function(that){copyVec2(this.localPoint,that.localPoint);this.normalImpulse=that.normalImpulse;this.tangentImpulse=that.tangentImpulse;this.id.set(that.id)};ManifoldPoint2.prototype.recycle=function(){zeroVec2(this.localPoint);this.normalImpulse=0;this.tangentImpulse=0;this.id.recycle()};return ManifoldPoint2}();var ContactID=function(){function ContactID2(){this.key=-1;this.indexA=-1;this.indexB=-1;this.typeA=exports2.ContactFeatureType.e_unset;this.typeB=exports2.ContactFeatureType.e_unset}ContactID2.prototype.setFeatures=function(indexA,typeA,indexB,typeB){this.indexA=indexA;this.indexB=indexB;this.typeA=typeA;this.typeB=typeB;this.key=this.indexA+this.indexB*256+this.typeA*65536+this.typeB*16777216};ContactID2.prototype.set=function(that){this.indexA=that.indexA;this.indexB=that.indexB;this.typeA=that.typeA;this.typeB=that.typeB;this.key=this.indexA+this.indexB*256+this.typeA*65536+this.typeB*16777216};ContactID2.prototype.swapFeatures=function(){var indexA=this.indexA;var indexB=this.indexB;var typeA=this.typeA;var typeB=this.typeB;this.indexA=indexB;this.indexB=indexA;this.typeA=typeB;this.typeB=typeA;this.key=this.indexA+this.indexB*256+this.typeA*65536+this.typeB*16777216};ContactID2.prototype.recycle=function(){this.indexA=0;this.indexB=0;this.typeA=exports2.ContactFeatureType.e_unset;this.typeB=exports2.ContactFeatureType.e_unset;this.key=-1};return ContactID2}();var WorldManifold=function(){function WorldManifold2(){this.normal=vec2(0,0);this.points=[vec2(0,0),vec2(0,0)];this.separations=[0,0];this.pointCount=0}WorldManifold2.prototype.recycle=function(){zeroVec2(this.normal);zeroVec2(this.points[0]);zeroVec2(this.points[1]);this.separations[0]=0;this.separations[1]=0;this.pointCount=0};return WorldManifold2}();function getPointStates(state1,state2,manifold1,manifold2){for(var i=0;i<manifold1.pointCount;++i){var id=manifold1.points[i].id;state1[i]=exports2.PointState.removeState;for(var j=0;j<manifold2.pointCount;++j){if(manifold2.points[j].id.key===id.key){state1[i]=exports2.PointState.persistState;break}}}for(var i=0;i<manifold2.pointCount;++i){var id=manifold2.points[i].id;state2[i]=exports2.PointState.addState;for(var j=0;j<manifold1.pointCount;++j){if(manifold1.points[j].id.key===id.key){state2[i]=exports2.PointState.persistState;break}}}}function clipSegmentToLine(vOut,vIn,normal3,offset,vertexIndexA){var numOut=0;var distance0=dotVec2(normal3,vIn[0].v)-offset;var distance1=dotVec2(normal3,vIn[1].v)-offset;if(distance0<=0)vOut[numOut++].set(vIn[0]);if(distance1<=0)vOut[numOut++].set(vIn[1]);if(distance0*distance1<0){var interp=distance0/(distance0-distance1);combine2Vec2(vOut[numOut].v,1-interp,vIn[0].v,interp,vIn[1].v);vOut[numOut].id.setFeatures(vertexIndexA,exports2.ContactFeatureType.e_vertex,vIn[0].id.indexB,exports2.ContactFeatureType.e_face);++numOut}return numOut}var math_sqrt$1=Math.sqrt;var math_max$2=Math.max;var math_min$4=Math.min;var contactPool=new Pool({create:function(){return new Contact},release:function(contact){contact.recycle()}});var oldManifold=new Manifold;var worldManifold=new WorldManifold;var ContactEdge=function(){function ContactEdge2(contact){this.prev=null;this.next=null;this.other=null;this.contact=contact}ContactEdge2.prototype.recycle=function(){this.prev=null;this.next=null;this.other=null};return ContactEdge2}();function mixFriction(friction1,friction2){return math_sqrt$1(friction1*friction2)}function mixRestitution(restitution1,restitution2){return restitution1>restitution2?restitution1:restitution2}var s_registers=[];var VelocityConstraintPoint=function(){function VelocityConstraintPoint2(){this.rA=vec2(0,0);this.rB=vec2(0,0);this.normalImpulse=0;this.tangentImpulse=0;this.normalMass=0;this.tangentMass=0;this.velocityBias=0}VelocityConstraintPoint2.prototype.recycle=function(){zeroVec2(this.rA);zeroVec2(this.rB);this.normalImpulse=0;this.tangentImpulse=0;this.normalMass=0;this.tangentMass=0;this.velocityBias=0};return VelocityConstraintPoint2}();var cA=vec2(0,0);var vA=vec2(0,0);var cB=vec2(0,0);var vB=vec2(0,0);var tangent$1=vec2(0,0);var xfA=transform(0,0,0);var xfB=transform(0,0,0);var pointA=vec2(0,0);var pointB=vec2(0,0);var clipPoint=vec2(0,0);var planePoint$1=vec2(0,0);var rA=vec2(0,0);var rB=vec2(0,0);var P$1=vec2(0,0);var normal$2=vec2(0,0);var point=vec2(0,0);var dv=vec2(0,0);var dv1=vec2(0,0);var dv2=vec2(0,0);var b=vec2(0,0);var a=vec2(0,0);var x=vec2(0,0);var d=vec2(0,0);var P1=vec2(0,0);var P2=vec2(0,0);var temp$2=vec2(0,0);var Contact=function(){function Contact2(){this.m_nodeA=new ContactEdge(this);this.m_nodeB=new ContactEdge(this);this.m_fixtureA=null;this.m_fixtureB=null;this.m_indexA=-1;this.m_indexB=-1;this.m_evaluateFcn=null;this.m_manifold=new Manifold;this.m_prev=null;this.m_next=null;this.m_toi=1;this.m_toiCount=0;this.m_toiFlag=false;this.m_friction=0;this.m_restitution=0;this.m_tangentSpeed=0;this.m_enabledFlag=true;this.m_islandFlag=false;this.m_touchingFlag=false;this.m_filterFlag=false;this.m_bulletHitFlag=false;this.m_impulse=new ContactImpulse(this);this.v_points=[new VelocityConstraintPoint,new VelocityConstraintPoint];this.v_normal=vec2(0,0);this.v_normalMass=new Mat22;this.v_K=new Mat22;this.v_pointCount=0;this.v_tangentSpeed=0;this.v_friction=0;this.v_restitution=0;this.v_invMassA=0;this.v_invMassB=0;this.v_invIA=0;this.v_invIB=0;this.p_localPoints=[vec2(0,0),vec2(0,0)];this.p_localNormal=vec2(0,0);this.p_localPoint=vec2(0,0);this.p_localCenterA=vec2(0,0);this.p_localCenterB=vec2(0,0);this.p_type=exports2.ManifoldType.e_unset;this.p_radiusA=0;this.p_radiusB=0;this.p_pointCount=0;this.p_invMassA=0;this.p_invMassB=0;this.p_invIA=0;this.p_invIB=0}Contact2.prototype.initialize=function(fA,indexA,fB,indexB,evaluateFcn){this.m_fixtureA=fA;this.m_fixtureB=fB;this.m_indexA=indexA;this.m_indexB=indexB;this.m_evaluateFcn=evaluateFcn;this.m_friction=mixFriction(this.m_fixtureA.m_friction,this.m_fixtureB.m_friction);this.m_restitution=mixRestitution(this.m_fixtureA.m_restitution,this.m_fixtureB.m_restitution)};Contact2.prototype.recycle=function(){this.m_nodeA.recycle();this.m_nodeB.recycle();this.m_fixtureA=null;this.m_fixtureB=null;this.m_indexA=-1;this.m_indexB=-1;this.m_evaluateFcn=null;this.m_manifold.recycle();this.m_prev=null;this.m_next=null;this.m_toi=1;this.m_toiCount=0;this.m_toiFlag=false;this.m_friction=0;this.m_restitution=0;this.m_tangentSpeed=0;this.m_enabledFlag=true;this.m_islandFlag=false;this.m_touchingFlag=false;this.m_filterFlag=false;this.m_bulletHitFlag=false;this.m_impulse.recycle();for(var _i=0,_a2=this.v_points;_i<_a2.length;_i++){var point_1=_a2[_i];point_1.recycle()}zeroVec2(this.v_normal);this.v_normalMass.setZero();this.v_K.setZero();this.v_pointCount=0;this.v_tangentSpeed=0;this.v_friction=0;this.v_restitution=0;this.v_invMassA=0;this.v_invMassB=0;this.v_invIA=0;this.v_invIB=0;for(var _b=0,_c=this.p_localPoints;_b<_c.length;_b++){var point_2=_c[_b];zeroVec2(point_2)}zeroVec2(this.p_localNormal);zeroVec2(this.p_localPoint);zeroVec2(this.p_localCenterA);zeroVec2(this.p_localCenterB);this.p_type=exports2.ManifoldType.e_unset;this.p_radiusA=0;this.p_radiusB=0;this.p_pointCount=0;this.p_invMassA=0;this.p_invMassB=0;this.p_invIA=0;this.p_invIB=0};Contact2.prototype.initConstraint=function(step){var fixtureA=this.m_fixtureA;var fixtureB=this.m_fixtureB;if(fixtureA===null||fixtureB===null)return;var bodyA=fixtureA.m_body;var bodyB=fixtureB.m_body;if(bodyA===null||bodyB===null)return;var shapeA=fixtureA.m_shape;var shapeB=fixtureB.m_shape;if(shapeA===null||shapeB===null)return;var manifold=this.m_manifold;var pointCount=manifold.pointCount;this.v_invMassA=bodyA.m_invMass;this.v_invMassB=bodyB.m_invMass;this.v_invIA=bodyA.m_invI;this.v_invIB=bodyB.m_invI;this.v_friction=this.m_friction;this.v_restitution=this.m_restitution;this.v_tangentSpeed=this.m_tangentSpeed;this.v_pointCount=pointCount;this.v_K.setZero();this.v_normalMass.setZero();this.p_invMassA=bodyA.m_invMass;this.p_invMassB=bodyB.m_invMass;this.p_invIA=bodyA.m_invI;this.p_invIB=bodyB.m_invI;copyVec2(this.p_localCenterA,bodyA.m_sweep.localCenter);copyVec2(this.p_localCenterB,bodyB.m_sweep.localCenter);this.p_radiusA=shapeA.m_radius;this.p_radiusB=shapeB.m_radius;this.p_type=manifold.type;copyVec2(this.p_localNormal,manifold.localNormal);copyVec2(this.p_localPoint,manifold.localPoint);this.p_pointCount=pointCount;for(var j=0;j<SettingsInternal.maxManifoldPoints;++j){this.v_points[j].recycle();zeroVec2(this.p_localPoints[j])}for(var j=0;j<pointCount;++j){var cp=manifold.points[j];var vcp=this.v_points[j];if(step.warmStarting){vcp.normalImpulse=step.dtRatio*cp.normalImpulse;vcp.tangentImpulse=step.dtRatio*cp.tangentImpulse}copyVec2(this.p_localPoints[j],cp.localPoint)}};Contact2.prototype.getManifold=function(){return this.m_manifold};Contact2.prototype.getWorldManifold=function(worldManifold2){var fixtureA=this.m_fixtureA;var fixtureB=this.m_fixtureB;if(fixtureA===null||fixtureB===null)return;var bodyA=fixtureA.m_body;var bodyB=fixtureB.m_body;if(bodyA===null||bodyB===null)return;var shapeA=fixtureA.m_shape;var shapeB=fixtureB.m_shape;if(shapeA===null||shapeB===null)return;return this.m_manifold.getWorldManifold(worldManifold2,bodyA.getTransform(),shapeA.m_radius,bodyB.getTransform(),shapeB.m_radius)};Contact2.prototype.setEnabled=function(flag){this.m_enabledFlag=!!flag};Contact2.prototype.isEnabled=function(){return this.m_enabledFlag};Contact2.prototype.isTouching=function(){return this.m_touchingFlag};Contact2.prototype.getNext=function(){return this.m_next};Contact2.prototype.getFixtureA=function(){return this.m_fixtureA};Contact2.prototype.getFixtureB=function(){return this.m_fixtureB};Contact2.prototype.getChildIndexA=function(){return this.m_indexA};Contact2.prototype.getChildIndexB=function(){return this.m_indexB};Contact2.prototype.flagForFiltering=function(){this.m_filterFlag=true};Contact2.prototype.setFriction=function(friction){this.m_friction=friction};Contact2.prototype.getFriction=function(){return this.m_friction};Contact2.prototype.resetFriction=function(){var fixtureA=this.m_fixtureA;var fixtureB=this.m_fixtureB;if(fixtureA===null||fixtureB===null)return;this.m_friction=mixFriction(fixtureA.m_friction,fixtureB.m_friction)};Contact2.prototype.setRestitution=function(restitution){this.m_restitution=restitution};Contact2.prototype.getRestitution=function(){return this.m_restitution};Contact2.prototype.resetRestitution=function(){var fixtureA=this.m_fixtureA;var fixtureB=this.m_fixtureB;if(fixtureA===null||fixtureB===null)return;this.m_restitution=mixRestitution(fixtureA.m_restitution,fixtureB.m_restitution)};Contact2.prototype.setTangentSpeed=function(speed){this.m_tangentSpeed=speed};Contact2.prototype.getTangentSpeed=function(){return this.m_tangentSpeed};Contact2.prototype.evaluate=function(manifold,xfA2,xfB2){var fixtureA=this.m_fixtureA;var fixtureB=this.m_fixtureB;if(fixtureA===null||fixtureB===null)return;this.m_evaluateFcn(manifold,xfA2,fixtureA,this.m_indexA,xfB2,fixtureB,this.m_indexB)};Contact2.prototype.update=function(listener){var fixtureA=this.m_fixtureA;var fixtureB=this.m_fixtureB;if(fixtureA===null||fixtureB===null)return;var bodyA=fixtureA.m_body;var bodyB=fixtureB.m_body;if(bodyA===null||bodyB===null)return;var shapeA=fixtureA.m_shape;var shapeB=fixtureB.m_shape;if(shapeA===null||shapeB===null)return;this.m_enabledFlag=true;var touching=false;var wasTouching=this.m_touchingFlag;var sensorA=fixtureA.m_isSensor;var sensorB=fixtureB.m_isSensor;var sensor=sensorA||sensorB;var xfA2=bodyA.m_xf;var xfB2=bodyB.m_xf;if(sensor){touching=testOverlap(shapeA,this.m_indexA,shapeB,this.m_indexB,xfA2,xfB2);this.m_manifold.pointCount=0}else{oldManifold.recycle();oldManifold.set(this.m_manifold);this.m_manifold.recycle();this.evaluate(this.m_manifold,xfA2,xfB2);touching=this.m_manifold.pointCount>0;for(var i=0;i<this.m_manifold.pointCount;++i){var nmp=this.m_manifold.points[i];nmp.normalImpulse=0;nmp.tangentImpulse=0;for(var j=0;j<oldManifold.pointCount;++j){var omp=oldManifold.points[j];if(omp.id.key===nmp.id.key){nmp.normalImpulse=omp.normalImpulse;nmp.tangentImpulse=omp.tangentImpulse;break}}}if(touching!==wasTouching){bodyA.setAwake(true);bodyB.setAwake(true)}}this.m_touchingFlag=touching;var hasListener=typeof listener==="object"&&listener!==null;if(!wasTouching&&touching&&hasListener){listener.beginContact(this)}if(wasTouching&&!touching&&hasListener){listener.endContact(this)}if(!sensor&&touching&&hasListener&&oldManifold){listener.preSolve(this,oldManifold)}};Contact2.prototype.solvePositionConstraint=function(step){return this._solvePositionConstraint(step,null,null)};Contact2.prototype.solvePositionConstraintTOI=function(step,toiA,toiB){return this._solvePositionConstraint(step,toiA,toiB)};Contact2.prototype._solvePositionConstraint=function(step,toiA,toiB){var toi=toiA!==null&&toiB!==null?true:false;var minSeparation=0;var fixtureA=this.m_fixtureA;var fixtureB=this.m_fixtureB;if(fixtureA===null||fixtureB===null)return minSeparation;var bodyA=fixtureA.m_body;var bodyB=fixtureB.m_body;if(bodyA===null||bodyB===null)return minSeparation;var positionA=bodyA.c_position;var positionB=bodyB.c_position;var localCenterA=this.p_localCenterA;var localCenterB=this.p_localCenterB;var mA=0;var iA=0;if(!toi||bodyA===toiA||bodyA===toiB){mA=this.p_invMassA;iA=this.p_invIA}var mB=0;var iB=0;if(!toi||bodyB===toiA||bodyB===toiB){mB=this.p_invMassB;iB=this.p_invIB}copyVec2(cA,positionA.c);var aA=positionA.a;copyVec2(cB,positionB.c);var aB=positionB.a;for(var j=0;j<this.p_pointCount;++j){getTransform(xfA,localCenterA,cA,aA);getTransform(xfB,localCenterB,cB,aB);var separation=void 0;switch(this.p_type){case exports2.ManifoldType.e_circles:{transformVec2(pointA,xfA,this.p_localPoint);transformVec2(pointB,xfB,this.p_localPoints[0]);subVec2(normal$2,pointB,pointA);normalizeVec2(normal$2);combine2Vec2(point,.5,pointA,.5,pointB);separation=dotVec2(pointB,normal$2)-dotVec2(pointA,normal$2)-this.p_radiusA-this.p_radiusB;break}case exports2.ManifoldType.e_faceA:{rotVec2(normal$2,xfA.q,this.p_localNormal);transformVec2(planePoint$1,xfA,this.p_localPoint);transformVec2(clipPoint,xfB,this.p_localPoints[j]);separation=dotVec2(clipPoint,normal$2)-dotVec2(planePoint$1,normal$2)-this.p_radiusA-this.p_radiusB;copyVec2(point,clipPoint);break}case exports2.ManifoldType.e_faceB:{rotVec2(normal$2,xfB.q,this.p_localNormal);transformVec2(planePoint$1,xfB,this.p_localPoint);transformVec2(clipPoint,xfA,this.p_localPoints[j]);separation=dotVec2(clipPoint,normal$2)-dotVec2(planePoint$1,normal$2)-this.p_radiusA-this.p_radiusB;copyVec2(point,clipPoint);negVec2(normal$2);break}default:{return minSeparation}}subVec2(rA,point,cA);subVec2(rB,point,cB);minSeparation=math_min$4(minSeparation,separation);var baumgarte=toi?SettingsInternal.toiBaugarte:SettingsInternal.baumgarte;var linearSlop=SettingsInternal.linearSlop;var maxLinearCorrection=SettingsInternal.maxLinearCorrection;var C=clamp(baumgarte*(separation+linearSlop),-maxLinearCorrection,0);var rnA=crossVec2Vec2(rA,normal$2);var rnB=crossVec2Vec2(rB,normal$2);var K=mA+mB+iA*rnA*rnA+iB*rnB*rnB;var impulse=K>0?-C/K:0;scaleVec2(P$1,impulse,normal$2);minusScaleVec2(cA,mA,P$1);aA-=iA*crossVec2Vec2(rA,P$1);plusScaleVec2(cB,mB,P$1);aB+=iB*crossVec2Vec2(rB,P$1)}copyVec2(positionA.c,cA);positionA.a=aA;copyVec2(positionB.c,cB);positionB.a=aB;return minSeparation};Contact2.prototype.initVelocityConstraint=function(step){var fixtureA=this.m_fixtureA;var fixtureB=this.m_fixtureB;if(fixtureA===null||fixtureB===null)return;var bodyA=fixtureA.m_body;var bodyB=fixtureB.m_body;if(bodyA===null||bodyB===null)return;var velocityA=bodyA.c_velocity;var velocityB=bodyB.c_velocity;var positionA=bodyA.c_position;var positionB=bodyB.c_position;var radiusA=this.p_radiusA;var radiusB=this.p_radiusB;var manifold=this.m_manifold;var mA=this.v_invMassA;var mB=this.v_invMassB;var iA=this.v_invIA;var iB=this.v_invIB;var localCenterA=this.p_localCenterA;var localCenterB=this.p_localCenterB;copyVec2(cA,positionA.c);var aA=positionA.a;copyVec2(vA,velocityA.v);var wA=velocityA.w;copyVec2(cB,positionB.c);var aB=positionB.a;copyVec2(vB,velocityB.v);var wB=velocityB.w;getTransform(xfA,localCenterA,cA,aA);getTransform(xfB,localCenterB,cB,aB);worldManifold.recycle();manifold.getWorldManifold(worldManifold,xfA,radiusA,xfB,radiusB);copyVec2(this.v_normal,worldManifold.normal);for(var j=0;j<this.v_pointCount;++j){var vcp=this.v_points[j];var wmp=worldManifold.points[j];subVec2(vcp.rA,wmp,cA);subVec2(vcp.rB,wmp,cB);var rnA=crossVec2Vec2(vcp.rA,this.v_normal);var rnB=crossVec2Vec2(vcp.rB,this.v_normal);var kNormal=mA+mB+iA*rnA*rnA+iB*rnB*rnB;vcp.normalMass=kNormal>0?1/kNormal:0;crossVec2Num(tangent$1,this.v_normal,1);var rtA=crossVec2Vec2(vcp.rA,tangent$1);var rtB=crossVec2Vec2(vcp.rB,tangent$1);var kTangent=mA+mB+iA*rtA*rtA+iB*rtB*rtB;vcp.tangentMass=kTangent>0?1/kTangent:0;vcp.velocityBias=0;var vRel=0;vRel+=dotVec2(this.v_normal,vB);vRel+=dotVec2(this.v_normal,crossNumVec2(temp$2,wB,vcp.rB));vRel-=dotVec2(this.v_normal,vA);vRel-=dotVec2(this.v_normal,crossNumVec2(temp$2,wA,vcp.rA));if(vRel<-SettingsInternal.velocityThreshold){vcp.velocityBias=-this.v_restitution*vRel}}if(this.v_pointCount==2&&step.blockSolve){var vcp1=this.v_points[0];var vcp2=this.v_points[1];var rn1A=crossVec2Vec2(vcp1.rA,this.v_normal);var rn1B=crossVec2Vec2(vcp1.rB,this.v_normal);var rn2A=crossVec2Vec2(vcp2.rA,this.v_normal);var rn2B=crossVec2Vec2(vcp2.rB,this.v_normal);var k11=mA+mB+iA*rn1A*rn1A+iB*rn1B*rn1B;var k22=mA+mB+iA*rn2A*rn2A+iB*rn2B*rn2B;var k12=mA+mB+iA*rn1A*rn2A+iB*rn1B*rn2B;var k_maxConditionNumber=1e3;if(k11*k11<k_maxConditionNumber*(k11*k22-k12*k12)){this.v_K.ex.setNum(k11,k12);this.v_K.ey.setNum(k12,k22);var a_1=this.v_K.ex.x;var b_1=this.v_K.ey.x;var c2=this.v_K.ex.y;var d_1=this.v_K.ey.y;var det=a_1*d_1-b_1*c2;if(det!==0){det=1/det}this.v_normalMass.ex.x=det*d_1;this.v_normalMass.ey.x=-det*b_1;this.v_normalMass.ex.y=-det*c2;this.v_normalMass.ey.y=det*a_1}else{this.v_pointCount=1}}copyVec2(positionA.c,cA);positionA.a=aA;copyVec2(velocityA.v,vA);velocityA.w=wA;copyVec2(positionB.c,cB);positionB.a=aB;copyVec2(velocityB.v,vB);velocityB.w=wB};Contact2.prototype.warmStartConstraint=function(step){var fixtureA=this.m_fixtureA;var fixtureB=this.m_fixtureB;if(fixtureA===null||fixtureB===null)return;var bodyA=fixtureA.m_body;var bodyB=fixtureB.m_body;if(bodyA===null||bodyB===null)return;var velocityA=bodyA.c_velocity;var velocityB=bodyB.c_velocity;var mA=this.v_invMassA;var iA=this.v_invIA;var mB=this.v_invMassB;var iB=this.v_invIB;copyVec2(vA,velocityA.v);var wA=velocityA.w;copyVec2(vB,velocityB.v);var wB=velocityB.w;copyVec2(normal$2,this.v_normal);crossVec2Num(tangent$1,normal$2,1);for(var j=0;j<this.v_pointCount;++j){var vcp=this.v_points[j];combine2Vec2(P$1,vcp.normalImpulse,normal$2,vcp.tangentImpulse,tangent$1);wA-=iA*crossVec2Vec2(vcp.rA,P$1);minusScaleVec2(vA,mA,P$1);wB+=iB*crossVec2Vec2(vcp.rB,P$1);plusScaleVec2(vB,mB,P$1)}copyVec2(velocityA.v,vA);velocityA.w=wA;copyVec2(velocityB.v,vB);velocityB.w=wB};Contact2.prototype.storeConstraintImpulses=function(step){var manifold=this.m_manifold;for(var j=0;j<this.v_pointCount;++j){manifold.points[j].normalImpulse=this.v_points[j].normalImpulse;manifold.points[j].tangentImpulse=this.v_points[j].tangentImpulse}};Contact2.prototype.solveVelocityConstraint=function(step){var fixtureA=this.m_fixtureA;var fixtureB=this.m_fixtureB;if(fixtureA===null||fixtureB===null)return;var bodyA=fixtureA.m_body;var bodyB=fixtureB.m_body;if(bodyA===null||bodyB===null)return;var velocityA=bodyA.c_velocity;var velocityB=bodyB.c_velocity;var mA=this.v_invMassA;var iA=this.v_invIA;var mB=this.v_invMassB;var iB=this.v_invIB;copyVec2(vA,velocityA.v);var wA=velocityA.w;copyVec2(vB,velocityB.v);var wB=velocityB.w;copyVec2(normal$2,this.v_normal);crossVec2Num(tangent$1,normal$2,1);var friction=this.v_friction;for(var j=0;j<this.v_pointCount;++j){var vcp=this.v_points[j];zeroVec2(dv);plusVec2(dv,vB);plusVec2(dv,crossNumVec2(temp$2,wB,vcp.rB));minusVec2(dv,vA);minusVec2(dv,crossNumVec2(temp$2,wA,vcp.rA));var vt=dotVec2(dv,tangent$1)-this.v_tangentSpeed;var lambda=vcp.tangentMass*-vt;var maxFriction=friction*vcp.normalImpulse;var newImpulse=clamp(vcp.tangentImpulse+lambda,-maxFriction,maxFriction);lambda=newImpulse-vcp.tangentImpulse;vcp.tangentImpulse=newImpulse;scaleVec2(P$1,lambda,tangent$1);minusScaleVec2(vA,mA,P$1);wA-=iA*crossVec2Vec2(vcp.rA,P$1);plusScaleVec2(vB,mB,P$1);wB+=iB*crossVec2Vec2(vcp.rB,P$1)}if(this.v_pointCount==1||step.blockSolve==false){for(var i=0;i<this.v_pointCount;++i){var vcp=this.v_points[i];zeroVec2(dv);plusVec2(dv,vB);plusVec2(dv,crossNumVec2(temp$2,wB,vcp.rB));minusVec2(dv,vA);minusVec2(dv,crossNumVec2(temp$2,wA,vcp.rA));var vn=dotVec2(dv,normal$2);var lambda=-vcp.normalMass*(vn-vcp.velocityBias);var newImpulse=math_max$2(vcp.normalImpulse+lambda,0);lambda=newImpulse-vcp.normalImpulse;vcp.normalImpulse=newImpulse;scaleVec2(P$1,lambda,normal$2);minusScaleVec2(vA,mA,P$1);wA-=iA*crossVec2Vec2(vcp.rA,P$1);plusScaleVec2(vB,mB,P$1);wB+=iB*crossVec2Vec2(vcp.rB,P$1)}}else{var vcp1=this.v_points[0];var vcp2=this.v_points[1];setVec2(a,vcp1.normalImpulse,vcp2.normalImpulse);zeroVec2(dv1);plusVec2(dv1,vB);plusVec2(dv1,crossNumVec2(temp$2,wB,vcp1.rB));minusVec2(dv1,vA);minusVec2(dv1,crossNumVec2(temp$2,wA,vcp1.rA));zeroVec2(dv2);plusVec2(dv2,vB);plusVec2(dv2,crossNumVec2(temp$2,wB,vcp2.rB));minusVec2(dv2,vA);minusVec2(dv2,crossNumVec2(temp$2,wA,vcp2.rA));var vn1=dotVec2(dv1,normal$2);var vn2=dotVec2(dv2,normal$2);setVec2(b,vn1-vcp1.velocityBias,vn2-vcp2.velocityBias);b.x-=this.v_K.ex.x*a.x+this.v_K.ey.x*a.y;b.y-=this.v_K.ex.y*a.x+this.v_K.ey.y*a.y;while(true){zeroVec2(x);x.x=-(this.v_normalMass.ex.x*b.x+this.v_normalMass.ey.x*b.y);x.y=-(this.v_normalMass.ex.y*b.x+this.v_normalMass.ey.y*b.y);if(x.x>=0&&x.y>=0){subVec2(d,x,a);scaleVec2(P1,d.x,normal$2);scaleVec2(P2,d.y,normal$2);combine3Vec2(vA,-mA,P1,-mA,P2,1,vA);wA-=iA*(crossVec2Vec2(vcp1.rA,P1)+crossVec2Vec2(vcp2.rA,P2));combine3Vec2(vB,mB,P1,mB,P2,1,vB);wB+=iB*(crossVec2Vec2(vcp1.rB,P1)+crossVec2Vec2(vcp2.rB,P2));vcp1.normalImpulse=x.x;vcp2.normalImpulse=x.y;break}x.x=-vcp1.normalMass*b.x;x.y=0;vn1=0;vn2=this.v_K.ex.y*x.x+b.y;if(x.x>=0&&vn2>=0){subVec2(d,x,a);scaleVec2(P1,d.x,normal$2);scaleVec2(P2,d.y,normal$2);combine3Vec2(vA,-mA,P1,-mA,P2,1,vA);wA-=iA*(crossVec2Vec2(vcp1.rA,P1)+crossVec2Vec2(vcp2.rA,P2));combine3Vec2(vB,mB,P1,mB,P2,1,vB);wB+=iB*(crossVec2Vec2(vcp1.rB,P1)+crossVec2Vec2(vcp2.rB,P2));vcp1.normalImpulse=x.x;vcp2.normalImpulse=x.y;break}x.x=0;x.y=-vcp2.normalMass*b.y;vn1=this.v_K.ey.x*x.y+b.x;vn2=0;if(x.y>=0&&vn1>=0){subVec2(d,x,a);scaleVec2(P1,d.x,normal$2);scaleVec2(P2,d.y,normal$2);combine3Vec2(vA,-mA,P1,-mA,P2,1,vA);wA-=iA*(crossVec2Vec2(vcp1.rA,P1)+crossVec2Vec2(vcp2.rA,P2));combine3Vec2(vB,mB,P1,mB,P2,1,vB);wB+=iB*(crossVec2Vec2(vcp1.rB,P1)+crossVec2Vec2(vcp2.rB,P2));vcp1.normalImpulse=x.x;vcp2.normalImpulse=x.y;break}x.x=0;x.y=0;vn1=b.x;vn2=b.y;if(vn1>=0&&vn2>=0){subVec2(d,x,a);scaleVec2(P1,d.x,normal$2);scaleVec2(P2,d.y,normal$2);combine3Vec2(vA,-mA,P1,-mA,P2,1,vA);wA-=iA*(crossVec2Vec2(vcp1.rA,P1)+crossVec2Vec2(vcp2.rA,P2));combine3Vec2(vB,mB,P1,mB,P2,1,vB);wB+=iB*(crossVec2Vec2(vcp1.rB,P1)+crossVec2Vec2(vcp2.rB,P2));vcp1.normalImpulse=x.x;vcp2.normalImpulse=x.y;break}break}}copyVec2(velocityA.v,vA);velocityA.w=wA;copyVec2(velocityB.v,vB);velocityB.w=wB};Contact2.addType=function(type1,type2,callback){s_registers[type1]=s_registers[type1]||{};s_registers[type1][type2]=callback};Contact2.create=function(fixtureA,indexA,fixtureB,indexB){var typeA=fixtureA.m_shape.m_type;var typeB=fixtureB.m_shape.m_type;var contact=contactPool.allocate();var evaluateFcn;if(evaluateFcn=s_registers[typeA]&&s_registers[typeA][typeB]){contact.initialize(fixtureA,indexA,fixtureB,indexB,evaluateFcn)}else if(evaluateFcn=s_registers[typeB]&&s_registers[typeB][typeA]){contact.initialize(fixtureB,indexB,fixtureA,indexA,evaluateFcn)}else{return null}fixtureA=contact.m_fixtureA;fixtureB=contact.m_fixtureB;indexA=contact.getChildIndexA();indexB=contact.getChildIndexB();var bodyA=fixtureA.m_body;var bodyB=fixtureB.m_body;contact.m_nodeA.contact=contact;contact.m_nodeA.other=bodyB;contact.m_nodeA.prev=null;contact.m_nodeA.next=bodyA.m_contactList;if(bodyA.m_contactList!=null){bodyA.m_contactList.prev=contact.m_nodeA}bodyA.m_contactList=contact.m_nodeA;contact.m_nodeB.contact=contact;contact.m_nodeB.other=bodyA;contact.m_nodeB.prev=null;contact.m_nodeB.next=bodyB.m_contactList;if(bodyB.m_contactList!=null){bodyB.m_contactList.prev=contact.m_nodeB}bodyB.m_contactList=contact.m_nodeB;if(fixtureA.isSensor()==false&&fixtureB.isSensor()==false){bodyA.setAwake(true);bodyB.setAwake(true)}return contact};Contact2.destroy=function(contact,listener){var fixtureA=contact.m_fixtureA;var fixtureB=contact.m_fixtureB;if(fixtureA===null||fixtureB===null)return;var bodyA=fixtureA.m_body;var bodyB=fixtureB.m_body;if(bodyA===null||bodyB===null)return;if(contact.isTouching()){listener.endContact(contact)}if(contact.m_nodeA.prev){contact.m_nodeA.prev.next=contact.m_nodeA.next}if(contact.m_nodeA.next){contact.m_nodeA.next.prev=contact.m_nodeA.prev}if(contact.m_nodeA==bodyA.m_contactList){bodyA.m_contactList=contact.m_nodeA.next}if(contact.m_nodeB.prev){contact.m_nodeB.prev.next=contact.m_nodeB.next}if(contact.m_nodeB.next){contact.m_nodeB.next.prev=contact.m_nodeB.prev}if(contact.m_nodeB==bodyB.m_contactList){bodyB.m_contactList=contact.m_nodeB.next}if(contact.m_manifold.pointCount>0&&!fixtureA.m_isSensor&&!fixtureB.m_isSensor){bodyA.setAwake(true);bodyB.setAwake(true)}contactPool.release(contact)};return Contact2}();var DEFAULTS$b={gravity:Vec2.zero(),allowSleep:true,warmStarting:true,continuousPhysics:true,subStepping:false,blockSolve:true,velocityIterations:8,positionIterations:3};var World=function(){function World2(def){if(!(this instanceof World2)){return new World2(def)}this.s_step=new TimeStep;if(!def){def={}}else if(Vec2.isValid(def)){def={gravity:def}}def=options(def,DEFAULTS$b);this.m_solver=new Solver(this);this.m_broadPhase=new BroadPhase;this.m_contactList=null;this.m_contactCount=0;this.m_bodyList=null;this.m_bodyCount=0;this.m_jointList=null;this.m_jointCount=0;this.m_stepComplete=true;this.m_allowSleep=def.allowSleep;this.m_gravity=Vec2.clone(def.gravity);this.m_clearForces=true;this.m_newFixture=false;this.m_locked=false;this.m_warmStarting=def.warmStarting;this.m_continuousPhysics=def.continuousPhysics;this.m_subStepping=def.subStepping;this.m_blockSolve=def.blockSolve;this.m_velocityIterations=def.velocityIterations;this.m_positionIterations=def.positionIterations;this.m_t=0;this.m_step_callback=[]}World2.prototype._serialize=function(){var bodies=[];var joints=[];for(var b2=this.getBodyList();b2;b2=b2.getNext()){bodies.push(b2)}for(var j=this.getJointList();j;j=j.getNext()){if(typeof j._serialize==="function"){joints.push(j)}}return{gravity:this.m_gravity,bodies:bodies,joints:joints}};World2._deserialize=function(data,context,restore){if(!data){return new World2}var world=new World2(data.gravity);if(data.bodies){for(var i=data.bodies.length-1;i>=0;i-=1){world._addBody(restore(Body,data.bodies[i],world))}}if(data.joints){for(var i=data.joints.length-1;i>=0;i--){world.createJoint(restore(Joint,data.joints[i],world))}}return world};World2.prototype.getBodyList=function(){return this.m_bodyList};World2.prototype.getJointList=function(){return this.m_jointList};World2.prototype.getContactList=function(){return this.m_contactList};World2.prototype.getBodyCount=function(){return this.m_bodyCount};World2.prototype.getJointCount=function(){return this.m_jointCount};World2.prototype.getContactCount=function(){return this.m_contactCount};World2.prototype.setGravity=function(gravity){this.m_gravity.set(gravity)};World2.prototype.getGravity=function(){return this.m_gravity};World2.prototype.isLocked=function(){return this.m_locked};World2.prototype.setAllowSleeping=function(flag){if(flag==this.m_allowSleep){return}this.m_allowSleep=flag;if(this.m_allowSleep==false){for(var b2=this.m_bodyList;b2;b2=b2.m_next){b2.setAwake(true)}}};World2.prototype.getAllowSleeping=function(){return this.m_allowSleep};World2.prototype.setWarmStarting=function(flag){this.m_warmStarting=flag};World2.prototype.getWarmStarting=function(){return this.m_warmStarting};World2.prototype.setContinuousPhysics=function(flag){this.m_continuousPhysics=flag};World2.prototype.getContinuousPhysics=function(){return this.m_continuousPhysics};World2.prototype.setSubStepping=function(flag){this.m_subStepping=flag};World2.prototype.getSubStepping=function(){return this.m_subStepping};World2.prototype.setAutoClearForces=function(flag){this.m_clearForces=flag};World2.prototype.getAutoClearForces=function(){return this.m_clearForces};World2.prototype.clearForces=function(){for(var body=this.m_bodyList;body;body=body.getNext()){body.m_force.setZero();body.m_torque=0}};World2.prototype.queryAABB=function(aabb,callback){var broadPhase=this.m_broadPhase;this.m_broadPhase.query(aabb,function(proxyId){var proxy=broadPhase.getUserData(proxyId);return callback(proxy.fixture)})};World2.prototype.rayCast=function(point1,point2,callback){var broadPhase=this.m_broadPhase;this.m_broadPhase.rayCast({maxFraction:1,p1:point1,p2:point2},function(input2,proxyId){var proxy=broadPhase.getUserData(proxyId);var fixture=proxy.fixture;var index=proxy.childIndex;var output2={};var hit=fixture.rayCast(output2,input2,index);if(hit){var fraction=output2.fraction;var point3=Vec2.add(Vec2.mulNumVec2(1-fraction,input2.p1),Vec2.mulNumVec2(fraction,input2.p2));return callback(fixture,point3,output2.normal,fraction)}return input2.maxFraction})};World2.prototype.getProxyCount=function(){return this.m_broadPhase.getProxyCount()};World2.prototype.getTreeHeight=function(){return this.m_broadPhase.getTreeHeight()};World2.prototype.getTreeBalance=function(){return this.m_broadPhase.getTreeBalance()};World2.prototype.getTreeQuality=function(){return this.m_broadPhase.getTreeQuality()};World2.prototype.shiftOrigin=function(newOrigin){if(this.isLocked()){return}for(var b2=this.m_bodyList;b2;b2=b2.m_next){b2.m_xf.p.sub(newOrigin);b2.m_sweep.c0.sub(newOrigin);b2.m_sweep.c.sub(newOrigin)}for(var j=this.m_jointList;j;j=j.m_next){j.shiftOrigin(newOrigin)}this.m_broadPhase.shiftOrigin(newOrigin)};World2.prototype._addBody=function(body){if(this.isLocked()){return}body.m_prev=null;body.m_next=this.m_bodyList;if(this.m_bodyList){this.m_bodyList.m_prev=body}this.m_bodyList=body;++this.m_bodyCount;this.publish("add-body",body)};World2.prototype.createBody=function(arg1,arg2){if(this.isLocked()){return null}var def={};if(!arg1);else if(Vec2.isValid(arg1)){def={position:arg1,angle:arg2}}else if(typeof arg1==="object"){def=arg1}var body=new Body(this,def);this._addBody(body);return body};World2.prototype.createDynamicBody=function(arg1,arg2){var def={};if(!arg1);else if(Vec2.isValid(arg1)){def={position:arg1,angle:arg2}}else if(typeof arg1==="object"){def=arg1}def.type="dynamic";return this.createBody(def)};World2.prototype.createKinematicBody=function(arg1,arg2){var def={};if(!arg1);else if(Vec2.isValid(arg1)){def={position:arg1,angle:arg2}}else if(typeof arg1==="object"){def=arg1}def.type="kinematic";return this.createBody(def)};World2.prototype.destroyBody=function(b2){if(this.isLocked()){return}if(b2.m_destroyed){return false}var je=b2.m_jointList;while(je){var je0=je;je=je.next;this.publish("remove-joint",je0.joint);this.destroyJoint(je0.joint);b2.m_jointList=je}b2.m_jointList=null;var ce=b2.m_contactList;while(ce){var ce0=ce;ce=ce.next;this.destroyContact(ce0.contact);b2.m_contactList=ce}b2.m_contactList=null;var f=b2.m_fixtureList;while(f){var f0=f;f=f.m_next;this.publish("remove-fixture",f0);f0.destroyProxies(this.m_broadPhase);b2.m_fixtureList=f}b2.m_fixtureList=null;if(b2.m_prev){b2.m_prev.m_next=b2.m_next}if(b2.m_next){b2.m_next.m_prev=b2.m_prev}if(b2==this.m_bodyList){this.m_bodyList=b2.m_next}b2.m_destroyed=true;--this.m_bodyCount;this.publish("remove-body",b2);return true};World2.prototype.createJoint=function(joint){if(this.isLocked()){return null}joint.m_prev=null;joint.m_next=this.m_jointList;if(this.m_jointList){this.m_jointList.m_prev=joint}this.m_jointList=joint;++this.m_jointCount;joint.m_edgeA.joint=joint;joint.m_edgeA.other=joint.m_bodyB;joint.m_edgeA.prev=null;joint.m_edgeA.next=joint.m_bodyA.m_jointList;if(joint.m_bodyA.m_jointList)joint.m_bodyA.m_jointList.prev=joint.m_edgeA;joint.m_bodyA.m_jointList=joint.m_edgeA;joint.m_edgeB.joint=joint;joint.m_edgeB.other=joint.m_bodyA;joint.m_edgeB.prev=null;joint.m_edgeB.next=joint.m_bodyB.m_jointList;if(joint.m_bodyB.m_jointList)joint.m_bodyB.m_jointList.prev=joint.m_edgeB;joint.m_bodyB.m_jointList=joint.m_edgeB;if(joint.m_collideConnected==false){for(var edge=joint.m_bodyB.getContactList();edge;edge=edge.next){if(edge.other==joint.m_bodyA){edge.contact.flagForFiltering()}}}this.publish("add-joint",joint);return joint};World2.prototype.destroyJoint=function(joint){if(this.isLocked()){return}if(joint.m_prev){joint.m_prev.m_next=joint.m_next}if(joint.m_next){joint.m_next.m_prev=joint.m_prev}if(joint==this.m_jointList){this.m_jointList=joint.m_next}var bodyA=joint.m_bodyA;var bodyB=joint.m_bodyB;bodyA.setAwake(true);bodyB.setAwake(true);if(joint.m_edgeA.prev){joint.m_edgeA.prev.next=joint.m_edgeA.next}if(joint.m_edgeA.next){joint.m_edgeA.next.prev=joint.m_edgeA.prev}if(joint.m_edgeA==bodyA.m_jointList){bodyA.m_jointList=joint.m_edgeA.next}joint.m_edgeA.prev=null;joint.m_edgeA.next=null;if(joint.m_edgeB.prev){joint.m_edgeB.prev.next=joint.m_edgeB.next}if(joint.m_edgeB.next){joint.m_edgeB.next.prev=joint.m_edgeB.prev}if(joint.m_edgeB==bodyB.m_jointList){bodyB.m_jointList=joint.m_edgeB.next}joint.m_edgeB.prev=null;joint.m_edgeB.next=null;--this.m_jointCount;if(joint.m_collideConnected==false){var edge=bodyB.getContactList();while(edge){if(edge.other==bodyA){edge.contact.flagForFiltering()}edge=edge.next}}this.publish("remove-joint",joint)};World2.prototype.step=function(timeStep,velocityIterations,positionIterations){this.publish("pre-step",timeStep);if((velocityIterations|0)!==velocityIterations){velocityIterations=0}velocityIterations=velocityIterations||this.m_velocityIterations;positionIterations=positionIterations||this.m_positionIterations;if(this.m_newFixture){this.findNewContacts();this.m_newFixture=false}this.m_locked=true;this.s_step.reset(timeStep);this.s_step.velocityIterations=velocityIterations;this.s_step.positionIterations=positionIterations;this.s_step.warmStarting=this.m_warmStarting;this.s_step.blockSolve=this.m_blockSolve;this.updateContacts();if(this.m_stepComplete&&timeStep>0){this.m_solver.solveWorld(this.s_step);for(var b2=this.m_bodyList;b2;b2=b2.getNext()){if(b2.m_islandFlag==false){continue}if(b2.isStatic()){continue}b2.synchronizeFixtures()}this.findNewContacts()}if(this.m_continuousPhysics&&timeStep>0){this.m_solver.solveWorldTOI(this.s_step)}if(this.m_clearForces){this.clearForces()}this.m_locked=false;var callback;while(callback=this.m_step_callback.shift()){callback(this)}this.publish("post-step",timeStep)};World2.prototype.queueUpdate=function(callback){if(!this.isLocked()){callback(this)}else{this.m_step_callback.push(callback)}};World2.prototype.findNewContacts=function(){var _this=this;this.m_broadPhase.updatePairs(function(proxyA,proxyB){return _this.createContact(proxyA,proxyB)})};World2.prototype.createContact=function(proxyA,proxyB){var fixtureA=proxyA.fixture;var fixtureB=proxyB.fixture;var indexA=proxyA.childIndex;var indexB=proxyB.childIndex;var bodyA=fixtureA.getBody();var bodyB=fixtureB.getBody();if(bodyA==bodyB){return}var edge=bodyB.getContactList();while(edge){if(edge.other==bodyA){var fA=edge.contact.getFixtureA();var fB=edge.contact.getFixtureB();var iA=edge.contact.getChildIndexA();var iB=edge.contact.getChildIndexB();if(fA==fixtureA&&fB==fixtureB&&iA==indexA&&iB==indexB){return}if(fA==fixtureB&&fB==fixtureA&&iA==indexB&&iB==indexA){return}}edge=edge.next}if(bodyB.shouldCollide(bodyA)==false){return}if(fixtureB.shouldCollide(fixtureA)==false){return}var contact=Contact.create(fixtureA,indexA,fixtureB,indexB);if(contact==null){return}contact.m_prev=null;if(this.m_contactList!=null){contact.m_next=this.m_contactList;this.m_contactList.m_prev=contact}this.m_contactList=contact;++this.m_contactCount};World2.prototype.updateContacts=function(){var c2;var next_c=this.m_contactList;while(c2=next_c){next_c=c2.getNext();var fixtureA=c2.getFixtureA();var fixtureB=c2.getFixtureB();var indexA=c2.getChildIndexA();var indexB=c2.getChildIndexB();var bodyA=fixtureA.getBody();var bodyB=fixtureB.getBody();if(c2.m_filterFlag){if(bodyB.shouldCollide(bodyA)==false){this.destroyContact(c2);continue}if(fixtureB.shouldCollide(fixtureA)==false){this.destroyContact(c2);continue}c2.m_filterFlag=false}var activeA=bodyA.isAwake()&&!bodyA.isStatic();var activeB=bodyB.isAwake()&&!bodyB.isStatic();if(activeA==false&&activeB==false){continue}var proxyIdA=fixtureA.m_proxies[indexA].proxyId;var proxyIdB=fixtureB.m_proxies[indexB].proxyId;var overlap=this.m_broadPhase.testOverlap(proxyIdA,proxyIdB);if(overlap==false){this.destroyContact(c2);continue}c2.update(this)}};World2.prototype.destroyContact=function(contact){if(contact.m_prev){contact.m_prev.m_next=contact.m_next}if(contact.m_next){contact.m_next.m_prev=contact.m_prev}if(contact==this.m_contactList){this.m_contactList=contact.m_next}Contact.destroy(contact,this);--this.m_contactCount};World2.prototype.on=function(name,listener){if(typeof name!=="string"||typeof listener!=="function"){return this}if(!this._listeners){this._listeners={}}if(!this._listeners[name]){this._listeners[name]=[]}this._listeners[name].push(listener);return this};World2.prototype.off=function(name,listener){if(typeof name!=="string"||typeof listener!=="function"){return this}var listeners=this._listeners&&this._listeners[name];if(!listeners||!listeners.length){return this}var index=listeners.indexOf(listener);if(index>=0){listeners.splice(index,1)}return this};World2.prototype.publish=function(name,arg1,arg2,arg3){var listeners=this._listeners&&this._listeners[name];if(!listeners||!listeners.length){return 0}for(var l=0;l<listeners.length;l++){listeners[l].call(this,arg1,arg2,arg3)}return listeners.length};World2.prototype.beginContact=function(contact){this.publish("begin-contact",contact)};World2.prototype.endContact=function(contact){this.publish("end-contact",contact)};World2.prototype.preSolve=function(contact,oldManifold2){this.publish("pre-solve",contact,oldManifold2)};World2.prototype.postSolve=function(contact,impulse){this.publish("post-solve",contact,impulse)};return World2}();var Vec3=function(){function Vec32(x2,y,z){if(!(this instanceof Vec32)){return new Vec32(x2,y,z)}if(typeof x2==="undefined"){this.x=0;this.y=0;this.z=0}else if(typeof x2==="object"){this.x=x2.x;this.y=x2.y;this.z=x2.z}else{this.x=x2;this.y=y;this.z=z}}Vec32.prototype._serialize=function(){return{x:this.x,y:this.y,z:this.z}};Vec32._deserialize=function(data){var obj=Object.create(Vec32.prototype);obj.x=data.x;obj.y=data.y;obj.z=data.z;return obj};Vec32.neo=function(x2,y,z){var obj=Object.create(Vec32.prototype);obj.x=x2;obj.y=y;obj.z=z;return obj};Vec32.zero=function(){var obj=Object.create(Vec32.prototype);obj.x=0;obj.y=0;obj.z=0;return obj};Vec32.clone=function(v3){return Vec32.neo(v3.x,v3.y,v3.z)};Vec32.prototype.toString=function(){return JSON.stringify(this)};Vec32.isValid=function(obj){if(obj===null||typeof obj==="undefined"){return false}return Number.isFinite(obj.x)&&Number.isFinite(obj.y)&&Number.isFinite(obj.z)};Vec32.assert=function(o){};Vec32.prototype.setZero=function(){this.x=0;this.y=0;this.z=0;return this};Vec32.prototype.set=function(x2,y,z){this.x=x2;this.y=y;this.z=z;return this};Vec32.prototype.add=function(w){this.x+=w.x;this.y+=w.y;this.z+=w.z;return this};Vec32.prototype.sub=function(w){this.x-=w.x;this.y-=w.y;this.z-=w.z;return this};Vec32.prototype.mul=function(m){this.x*=m;this.y*=m;this.z*=m;return this};Vec32.areEqual=function(v3,w){return v3===w||typeof v3==="object"&&v3!==null&&typeof w==="object"&&w!==null&&v3.x===w.x&&v3.y===w.y&&v3.z===w.z};Vec32.dot=function(v3,w){return v3.x*w.x+v3.y*w.y+v3.z*w.z};Vec32.cross=function(v3,w){return new Vec32(v3.y*w.z-v3.z*w.y,v3.z*w.x-v3.x*w.z,v3.x*w.y-v3.y*w.x)};Vec32.add=function(v3,w){return new Vec32(v3.x+w.x,v3.y+w.y,v3.z+w.z)};Vec32.sub=function(v3,w){return new Vec32(v3.x-w.x,v3.y-w.y,v3.z-w.z)};Vec32.mul=function(v3,m){return new Vec32(m*v3.x,m*v3.y,m*v3.z)};Vec32.prototype.neg=function(){this.x=-this.x;this.y=-this.y;this.z=-this.z;return this};Vec32.neg=function(v3){return new Vec32(-v3.x,-v3.y,-v3.z)};return Vec32}();var v1$2=vec2(0,0);var v2$1=vec2(0,0);var EdgeShape=function(_super){__extends(EdgeShape2,_super);function EdgeShape2(v122,v22){var _this=this;if(!(_this instanceof EdgeShape2)){return new EdgeShape2(v122,v22)}_this=_super.call(this)||this;_this.m_type=EdgeShape2.TYPE;_this.m_radius=SettingsInternal.polygonRadius;_this.m_vertex1=v122?Vec2.clone(v122):Vec2.zero();_this.m_vertex2=v22?Vec2.clone(v22):Vec2.zero();_this.m_vertex0=Vec2.zero();_this.m_vertex3=Vec2.zero();_this.m_hasVertex0=false;_this.m_hasVertex3=false;return _this}EdgeShape2.prototype._serialize=function(){return{type:this.m_type,vertex1:this.m_vertex1,vertex2:this.m_vertex2,vertex0:this.m_vertex0,vertex3:this.m_vertex3}};EdgeShape2._deserialize=function(data){var shape=new EdgeShape2(data.vertex1,data.vertex2);if(shape.m_hasVertex0){shape.setPrevVertex(data.vertex0)}if(shape.m_hasVertex3){shape.setNextVertex(data.vertex3)}return shape};EdgeShape2.prototype._reset=function(){};EdgeShape2.prototype.getRadius=function(){return this.m_radius};EdgeShape2.prototype.getType=function(){return this.m_type};EdgeShape2.prototype.setNext=function(v3){return this.setNextVertex(v3)};EdgeShape2.prototype.setNextVertex=function(v3){if(v3){this.m_vertex3.setVec2(v3);this.m_hasVertex3=true}else{this.m_vertex3.setZero();this.m_hasVertex3=false}return this};EdgeShape2.prototype.getNextVertex=function(){return this.m_vertex3};EdgeShape2.prototype.setPrev=function(v3){return this.setPrevVertex(v3)};EdgeShape2.prototype.setPrevVertex=function(v3){if(v3){this.m_vertex0.setVec2(v3);this.m_hasVertex0=true}else{this.m_vertex0.setZero();this.m_hasVertex0=false}return this};EdgeShape2.prototype.getPrevVertex=function(){return this.m_vertex0};EdgeShape2.prototype._set=function(v122,v22){this.m_vertex1.setVec2(v122);this.m_vertex2.setVec2(v22);this.m_hasVertex0=false;this.m_hasVertex3=false;return this};EdgeShape2.prototype._clone=function(){var clone=new EdgeShape2;clone.m_type=this.m_type;clone.m_radius=this.m_radius;clone.m_vertex1.setVec2(this.m_vertex1);clone.m_vertex2.setVec2(this.m_vertex2);clone.m_vertex0.setVec2(this.m_vertex0);clone.m_vertex3.setVec2(this.m_vertex3);clone.m_hasVertex0=this.m_hasVertex0;clone.m_hasVertex3=this.m_hasVertex3;return clone};EdgeShape2.prototype.getChildCount=function(){return 1};EdgeShape2.prototype.testPoint=function(xf2,p){return false};EdgeShape2.prototype.rayCast=function(output2,input2,xf2,childIndex){var p1=Rot.mulTVec2(xf2.q,Vec2.sub(input2.p1,xf2.p));var p2=Rot.mulTVec2(xf2.q,Vec2.sub(input2.p2,xf2.p));var d2=Vec2.sub(p2,p1);var v122=this.m_vertex1;var v22=this.m_vertex2;var e3=Vec2.sub(v22,v122);var normal3=Vec2.neo(e3.y,-e3.x);normal3.normalize();var numerator=Vec2.dot(normal3,Vec2.sub(v122,p1));var denominator=Vec2.dot(normal3,d2);if(denominator==0){return false}var t=numerator/denominator;if(t<0||input2.maxFraction<t){return false}var q=Vec2.add(p1,Vec2.mulNumVec2(t,d2));var r=Vec2.sub(v22,v122);var rr=Vec2.dot(r,r);if(rr==0){return false}var s2=Vec2.dot(Vec2.sub(q,v122),r)/rr;if(s2<0||1<s2){return false}output2.fraction=t;if(numerator>0){output2.normal=Rot.mulVec2(xf2.q,normal3).neg()}else{output2.normal=Rot.mulVec2(xf2.q,normal3)}return true};EdgeShape2.prototype.computeAABB=function(aabb,xf2,childIndex){transformVec2(v1$2,xf2,this.m_vertex1);transformVec2(v2$1,xf2,this.m_vertex2);AABB.combinePoints(aabb,v1$2,v2$1);AABB.extend(aabb,this.m_radius)};EdgeShape2.prototype.computeMass=function(massData,density){massData.mass=0;combine2Vec2(massData.center,.5,this.m_vertex1,.5,this.m_vertex2);massData.I=0};EdgeShape2.prototype.computeDistanceProxy=function(proxy){proxy.m_vertices[0]=this.m_vertex1;proxy.m_vertices[1]=this.m_vertex2;proxy.m_vertices.length=2;proxy.m_count=2;proxy.m_radius=this.m_radius};EdgeShape2.TYPE="edge";return EdgeShape2}(Shape);var v1$1=vec2(0,0);var v2=vec2(0,0);var ChainShape=function(_super){__extends(ChainShape2,_super);function ChainShape2(vertices,loop){var _this=this;if(!(_this instanceof ChainShape2)){return new ChainShape2(vertices,loop)}_this=_super.call(this)||this;_this.m_type=ChainShape2.TYPE;_this.m_radius=SettingsInternal.polygonRadius;_this.m_vertices=[];_this.m_count=0;_this.m_prevVertex=null;_this.m_nextVertex=null;_this.m_hasPrevVertex=false;_this.m_hasNextVertex=false;_this.m_isLoop=!!loop;if(vertices&&vertices.length){if(loop){_this._createLoop(vertices)}else{_this._createChain(vertices)}}return _this}ChainShape2.prototype._serialize=function(){var data={type:this.m_type,vertices:this.m_isLoop?this.m_vertices.slice(0,this.m_vertices.length-1):this.m_vertices,isLoop:this.m_isLoop,hasPrevVertex:this.m_hasPrevVertex,hasNextVertex:this.m_hasNextVertex,prevVertex:null,nextVertex:null};if(this.m_prevVertex){data.prevVertex=this.m_prevVertex}if(this.m_nextVertex){data.nextVertex=this.m_nextVertex}return data};ChainShape2._deserialize=function(data,fixture,restore){var vertices=[];if(data.vertices){for(var i=0;i<data.vertices.length;i++){vertices.push(data.vertices[i])}}var shape=new ChainShape2(vertices,data.isLoop);if(data.prevVertex){shape.setPrevVertex(data.prevVertex)}if(data.nextVertex){shape.setNextVertex(data.nextVertex)}return shape};ChainShape2.prototype.getType=function(){return this.m_type};ChainShape2.prototype.getRadius=function(){return this.m_radius};ChainShape2.prototype._createLoop=function(vertices){if(vertices.length<3){return}var i;this.m_vertices=[];this.m_count=vertices.length+1;for(var i=0;i<vertices.length;++i){this.m_vertices[i]=Vec2.clone(vertices[i])}this.m_vertices[vertices.length]=Vec2.clone(vertices[0]);this.m_prevVertex=this.m_vertices[this.m_count-2];this.m_nextVertex=this.m_vertices[1];this.m_hasPrevVertex=true;this.m_hasNextVertex=true;return this};ChainShape2.prototype._createChain=function(vertices){var i;this.m_vertices=[];this.m_count=vertices.length;for(var i=0;i<vertices.length;++i){this.m_vertices[i]=Vec2.clone(vertices[i])}this.m_prevVertex=null;this.m_nextVertex=null;this.m_hasPrevVertex=false;this.m_hasNextVertex=false;return this};ChainShape2.prototype._reset=function(){if(this.m_isLoop){this._createLoop(this.m_vertices.slice(0,this.m_vertices.length-1))}else{this._createChain(this.m_vertices)}};ChainShape2.prototype.setPrevVertex=function(prevVertex){this.m_prevVertex=prevVertex;this.m_hasPrevVertex=true};ChainShape2.prototype.getPrevVertex=function(){return this.m_prevVertex};ChainShape2.prototype.setNextVertex=function(nextVertex){this.m_nextVertex=nextVertex;this.m_hasNextVertex=true};ChainShape2.prototype.getNextVertex=function(){return this.m_nextVertex};ChainShape2.prototype._clone=function(){var clone=new ChainShape2;clone._createChain(this.m_vertices);clone.m_type=this.m_type;clone.m_radius=this.m_radius;clone.m_prevVertex=this.m_prevVertex;clone.m_nextVertex=this.m_nextVertex;clone.m_hasPrevVertex=this.m_hasPrevVertex;clone.m_hasNextVertex=this.m_hasNextVertex;return clone};ChainShape2.prototype.getChildCount=function(){return this.m_count-1};ChainShape2.prototype.getChildEdge=function(edge,childIndex){edge.m_type=EdgeShape.TYPE;edge.m_radius=this.m_radius;edge.m_vertex1=this.m_vertices[childIndex];edge.m_vertex2=this.m_vertices[childIndex+1];if(childIndex>0){edge.m_vertex0=this.m_vertices[childIndex-1];edge.m_hasVertex0=true}else{edge.m_vertex0=this.m_prevVertex;edge.m_hasVertex0=this.m_hasPrevVertex}if(childIndex<this.m_count-2){edge.m_vertex3=this.m_vertices[childIndex+2];edge.m_hasVertex3=true}else{edge.m_vertex3=this.m_nextVertex;edge.m_hasVertex3=this.m_hasNextVertex}};ChainShape2.prototype.getVertex=function(index){if(index<this.m_count){return this.m_vertices[index]}else{return this.m_vertices[0]}};ChainShape2.prototype.isLoop=function(){return this.m_isLoop};ChainShape2.prototype.testPoint=function(xf2,p){return false};ChainShape2.prototype.rayCast=function(output2,input2,xf2,childIndex){var edgeShape=new EdgeShape(this.getVertex(childIndex),this.getVertex(childIndex+1));return edgeShape.rayCast(output2,input2,xf2,0)};ChainShape2.prototype.computeAABB=function(aabb,xf2,childIndex){transformVec2(v1$1,xf2,this.getVertex(childIndex));transformVec2(v2,xf2,this.getVertex(childIndex+1));AABB.combinePoints(aabb,v1$1,v2)};ChainShape2.prototype.computeMass=function(massData,density){massData.mass=0;zeroVec2(massData.center);massData.I=0};ChainShape2.prototype.computeDistanceProxy=function(proxy,childIndex){proxy.m_vertices[0]=this.getVertex(childIndex);proxy.m_vertices[1]=this.getVertex(childIndex+1);proxy.m_count=2;proxy.m_radius=this.m_radius};ChainShape2.TYPE="chain";return ChainShape2}(Shape);var math_max$1=Math.max;var math_min$3=Math.min;var temp$1=vec2(0,0);var e$1=vec2(0,0);var e1$1=vec2(0,0);var e2$1=vec2(0,0);var center=vec2(0,0);var s=vec2(0,0);var PolygonShape=function(_super){__extends(PolygonShape2,_super);function PolygonShape2(vertices){var _this=this;if(!(_this instanceof PolygonShape2)){return new PolygonShape2(vertices)}_this=_super.call(this)||this;_this.m_type=PolygonShape2.TYPE;_this.m_radius=SettingsInternal.polygonRadius;_this.m_centroid=Vec2.zero();_this.m_vertices=[];_this.m_normals=[];_this.m_count=0;if(vertices&&vertices.length){_this._set(vertices)}return _this}PolygonShape2.prototype._serialize=function(){return{type:this.m_type,vertices:this.m_vertices}};PolygonShape2._deserialize=function(data,fixture,restore){var vertices=[];if(data.vertices){for(var i=0;i<data.vertices.length;i++){vertices.push(data.vertices[i])}}var shape=new PolygonShape2(vertices);return shape};PolygonShape2.prototype.getType=function(){return this.m_type};PolygonShape2.prototype.getRadius=function(){return this.m_radius};PolygonShape2.prototype._clone=function(){var clone=new PolygonShape2;clone.m_type=this.m_type;clone.m_radius=this.m_radius;clone.m_count=this.m_count;clone.m_centroid.setVec2(this.m_centroid);for(var i=0;i<this.m_count;i++){clone.m_vertices.push(this.m_vertices[i].clone())}for(var i=0;i<this.m_normals.length;i++){clone.m_normals.push(this.m_normals[i].clone())}return clone};PolygonShape2.prototype.getChildCount=function(){return 1};PolygonShape2.prototype._reset=function(){this._set(this.m_vertices)};PolygonShape2.prototype._set=function(vertices){if(vertices.length<3){this._setAsBox(1,1);return}var n2=math_min$3(vertices.length,SettingsInternal.maxPolygonVertices);var ps=[];for(var i=0;i<n2;++i){var v3=vertices[i];var unique=true;for(var j=0;j<ps.length;++j){if(Vec2.distanceSquared(v3,ps[j])<.25*SettingsInternal.linearSlopSquared){unique=false;break}}if(unique){ps.push(Vec2.clone(v3))}}n2=ps.length;if(n2<3){this._setAsBox(1,1);return}var i0=0;var x0=ps[0].x;for(var i=1;i<n2;++i){var x2=ps[i].x;if(x2>x0||x2===x0&&ps[i].y<ps[i0].y){i0=i;x0=x2}}var hull=[];var m=0;var ih=i0;while(true){hull[m]=ih;var ie2=0;for(var j=1;j<n2;++j){if(ie2===ih){ie2=j;continue}var r=Vec2.sub(ps[ie2],ps[hull[m]]);var v3=Vec2.sub(ps[j],ps[hull[m]]);var c2=Vec2.crossVec2Vec2(r,v3);if(c2<0){ie2=j}if(c2===0&&v3.lengthSquared()>r.lengthSquared()){ie2=j}}++m;ih=ie2;if(ie2===i0){break}}if(m<3){this._setAsBox(1,1);return}this.m_count=m;this.m_vertices=[];for(var i=0;i<m;++i){this.m_vertices[i]=ps[hull[i]]}for(var i=0;i<m;++i){var i1=i;var i2=i+1<m?i+1:0;var edge=Vec2.sub(this.m_vertices[i2],this.m_vertices[i1]);this.m_normals[i]=Vec2.crossVec2Num(edge,1);this.m_normals[i].normalize()}this.m_centroid=computeCentroid(this.m_vertices,m)};PolygonShape2.prototype._setAsBox=function(hx,hy,center2,angle){this.m_vertices[0]=Vec2.neo(hx,-hy);this.m_vertices[1]=Vec2.neo(hx,hy);this.m_vertices[2]=Vec2.neo(-hx,hy);this.m_vertices[3]=Vec2.neo(-hx,-hy);this.m_normals[0]=Vec2.neo(1,0);this.m_normals[1]=Vec2.neo(0,1);this.m_normals[2]=Vec2.neo(-1,0);this.m_normals[3]=Vec2.neo(0,-1);this.m_count=4;if(center2&&Vec2.isValid(center2)){angle=angle||0;copyVec2(this.m_centroid,center2);var xf2=Transform.identity();xf2.p.setVec2(center2);xf2.q.setAngle(angle);for(var i=0;i<this.m_count;++i){this.m_vertices[i]=Transform.mulVec2(xf2,this.m_vertices[i]);this.m_normals[i]=Rot.mulVec2(xf2.q,this.m_normals[i])}}};PolygonShape2.prototype.testPoint=function(xf2,p){var pLocal=detransformVec2(temp$1,xf2,p);for(var i=0;i<this.m_count;++i){var dot=dotVec2(this.m_normals[i],pLocal)-dotVec2(this.m_normals[i],this.m_vertices[i]);if(dot>0){return false}}return true};PolygonShape2.prototype.rayCast=function(output2,input2,xf2,childIndex){var p1=Rot.mulTVec2(xf2.q,Vec2.sub(input2.p1,xf2.p));var p2=Rot.mulTVec2(xf2.q,Vec2.sub(input2.p2,xf2.p));var d2=Vec2.sub(p2,p1);var lower=0;var upper=input2.maxFraction;var index=-1;for(var i=0;i<this.m_count;++i){var numerator=Vec2.dot(this.m_normals[i],Vec2.sub(this.m_vertices[i],p1));var denominator=Vec2.dot(this.m_normals[i],d2);if(denominator==0){if(numerator<0){return false}}else{if(denominator<0&&numerator<lower*denominator){lower=numerator/denominator;index=i}else if(denominator>0&&numerator<upper*denominator){upper=numerator/denominator}}if(upper<lower){return false}}if(index>=0){output2.fraction=lower;output2.normal=Rot.mulVec2(xf2.q,this.m_normals[index]);return true}return false};PolygonShape2.prototype.computeAABB=function(aabb,xf2,childIndex){var minX=Infinity;var minY=Infinity;var maxX=-Infinity;var maxY=-Infinity;for(var i=0;i<this.m_count;++i){var v3=transformVec2(temp$1,xf2,this.m_vertices[i]);minX=math_min$3(minX,v3.x);maxX=math_max$1(maxX,v3.x);minY=math_min$3(minY,v3.y);maxY=math_max$1(maxY,v3.y)}setVec2(aabb.lowerBound,minX-this.m_radius,minY-this.m_radius);setVec2(aabb.upperBound,maxX+this.m_radius,maxY+this.m_radius)};PolygonShape2.prototype.computeMass=function(massData,density){zeroVec2(center);var area=0;var I=0;zeroVec2(s);for(var i=0;i<this.m_count;++i){plusVec2(s,this.m_vertices[i])}scaleVec2(s,1/this.m_count,s);var k_inv3=1/3;for(var i=0;i<this.m_count;++i){subVec2(e1$1,this.m_vertices[i],s);if(i+1<this.m_count){subVec2(e2$1,this.m_vertices[i+1],s)}else{subVec2(e2$1,this.m_vertices[0],s)}var D=crossVec2Vec2(e1$1,e2$1);var triangleArea=.5*D;area+=triangleArea;combine2Vec2(temp$1,triangleArea*k_inv3,e1$1,triangleArea*k_inv3,e2$1);plusVec2(center,temp$1);var ex1=e1$1.x;var ey1=e1$1.y;var ex2=e2$1.x;var ey2=e2$1.y;var intx2=ex1*ex1+ex2*ex1+ex2*ex2;var inty2=ey1*ey1+ey2*ey1+ey2*ey2;I+=.25*k_inv3*D*(intx2+inty2)}massData.mass=density*area;scaleVec2(center,1/area,center);addVec2(massData.center,center,s);massData.I=density*I;massData.I+=massData.mass*(dotVec2(massData.center,massData.center)-dotVec2(center,center))};PolygonShape2.prototype.validate=function(){for(var i=0;i<this.m_count;++i){var i1=i;var i2=i<this.m_count-1?i1+1:0;var p=this.m_vertices[i1];subVec2(e$1,this.m_vertices[i2],p);for(var j=0;j<this.m_count;++j){if(j==i1||j==i2){continue}var c2=crossVec2Vec2(e$1,subVec2(temp$1,this.m_vertices[j],p));if(c2<0){return false}}}return true};PolygonShape2.prototype.computeDistanceProxy=function(proxy){for(var i=0;i<this.m_count;++i){proxy.m_vertices[i]=this.m_vertices[i]}proxy.m_vertices.length=this.m_count;proxy.m_count=this.m_count;proxy.m_radius=this.m_radius};PolygonShape2.TYPE="polygon";return PolygonShape2}(Shape);function computeCentroid(vs,count){var c2=Vec2.zero();var area=0;var pRef=Vec2.zero();var i;var inv3=1/3;for(var i=0;i<count;++i){var p1=pRef;var p2=vs[i];var p3=i+1<count?vs[i+1]:vs[0];var e1_1=Vec2.sub(p2,p1);var e2_1=Vec2.sub(p3,p1);var D=Vec2.crossVec2Vec2(e1_1,e2_1);var triangleArea=.5*D;area+=triangleArea;combine3Vec2(temp$1,1,p1,1,p2,1,p3);plusScaleVec2(c2,triangleArea*inv3,temp$1)}c2.mul(1/area);return c2}var math_sqrt=Math.sqrt;var math_PI$4=Math.PI;var temp=vec2(0,0);var CircleShape=function(_super){__extends(CircleShape2,_super);function CircleShape2(a2,b2){var _this=this;if(!(_this instanceof CircleShape2)){return new CircleShape2(a2,b2)}_this=_super.call(this)||this;_this.m_type=CircleShape2.TYPE;_this.m_p=Vec2.zero();_this.m_radius=1;if(typeof a2==="object"&&Vec2.isValid(a2)){_this.m_p.setVec2(a2);if(typeof b2==="number"){_this.m_radius=b2}}else if(typeof a2==="number"){_this.m_radius=a2}return _this}CircleShape2.prototype._serialize=function(){return{type:this.m_type,p:this.m_p,radius:this.m_radius}};CircleShape2._deserialize=function(data){return new CircleShape2(data.p,data.radius)};CircleShape2.prototype._reset=function(){};CircleShape2.prototype.getType=function(){return this.m_type};CircleShape2.prototype.getRadius=function(){return this.m_radius};CircleShape2.prototype.getCenter=function(){return this.m_p};CircleShape2.prototype._clone=function(){var clone=new CircleShape2;clone.m_type=this.m_type;clone.m_radius=this.m_radius;clone.m_p=this.m_p.clone();return clone};CircleShape2.prototype.getChildCount=function(){return 1};CircleShape2.prototype.testPoint=function(xf2,p){var center2=transformVec2(temp,xf2,this.m_p);return distSqrVec2(p,center2)<=this.m_radius*this.m_radius};CircleShape2.prototype.rayCast=function(output2,input2,xf2,childIndex){var position=Vec2.add(xf2.p,Rot.mulVec2(xf2.q,this.m_p));var s2=Vec2.sub(input2.p1,position);var b2=Vec2.dot(s2,s2)-this.m_radius*this.m_radius;var r=Vec2.sub(input2.p2,input2.p1);var c2=Vec2.dot(s2,r);var rr=Vec2.dot(r,r);var sigma=c2*c2-rr*b2;if(sigma<0||rr<EPSILON){return false}var a2=-(c2+math_sqrt(sigma));if(0<=a2&&a2<=input2.maxFraction*rr){a2/=rr;output2.fraction=a2;output2.normal=Vec2.add(s2,Vec2.mulNumVec2(a2,r));output2.normal.normalize();return true}return false};CircleShape2.prototype.computeAABB=function(aabb,xf2,childIndex){var p=transformVec2(temp,xf2,this.m_p);setVec2(aabb.lowerBound,p.x-this.m_radius,p.y-this.m_radius);setVec2(aabb.upperBound,p.x+this.m_radius,p.y+this.m_radius)};CircleShape2.prototype.computeMass=function(massData,density){massData.mass=density*math_PI$4*this.m_radius*this.m_radius;copyVec2(massData.center,this.m_p);massData.I=massData.mass*(.5*this.m_radius*this.m_radius+lengthSqrVec2(this.m_p))};CircleShape2.prototype.computeDistanceProxy=function(proxy){proxy.m_vertices[0]=this.m_p;proxy.m_vertices.length=1;proxy.m_count=1;proxy.m_radius=this.m_radius};CircleShape2.TYPE="circle";return CircleShape2}(Shape);var math_abs$5=Math.abs;var math_PI$3=Math.PI;var DEFAULTS$a={frequencyHz:0,dampingRatio:0};var DistanceJoint=function(_super){__extends(DistanceJoint2,_super);function DistanceJoint2(def,bodyA,bodyB,anchorA,anchorB){var _this=this;if(!(_this instanceof DistanceJoint2)){return new DistanceJoint2(def,bodyA,bodyB,anchorA,anchorB)}if(bodyB&&anchorA&&"m_type"in anchorA&&"x"in bodyB&&"y"in bodyB){var temp3=bodyB;bodyB=anchorA;anchorA=temp3}def=options(def,DEFAULTS$a);_this=_super.call(this,def,bodyA,bodyB)||this;bodyA=_this.m_bodyA;bodyB=_this.m_bodyB;_this.m_type=DistanceJoint2.TYPE;_this.m_localAnchorA=Vec2.clone(anchorA?bodyA.getLocalPoint(anchorA):def.localAnchorA||Vec2.zero());_this.m_localAnchorB=Vec2.clone(anchorB?bodyB.getLocalPoint(anchorB):def.localAnchorB||Vec2.zero());_this.m_length=Number.isFinite(def.length)?def.length:Vec2.distance(bodyA.getWorldPoint(_this.m_localAnchorA),bodyB.getWorldPoint(_this.m_localAnchorB));_this.m_frequencyHz=def.frequencyHz;_this.m_dampingRatio=def.dampingRatio;_this.m_impulse=0;_this.m_gamma=0;_this.m_bias=0;return _this}DistanceJoint2.prototype._serialize=function(){return{type:this.m_type,bodyA:this.m_bodyA,bodyB:this.m_bodyB,collideConnected:this.m_collideConnected,frequencyHz:this.m_frequencyHz,dampingRatio:this.m_dampingRatio,localAnchorA:this.m_localAnchorA,localAnchorB:this.m_localAnchorB,length:this.m_length}};DistanceJoint2._deserialize=function(data,world,restore){data=__assign({},data);data.bodyA=restore(Body,data.bodyA,world);data.bodyB=restore(Body,data.bodyB,world);var joint=new DistanceJoint2(data);return joint};DistanceJoint2.prototype._reset=function(def){if(def.anchorA){this.m_localAnchorA.setVec2(this.m_bodyA.getLocalPoint(def.anchorA))}else if(def.localAnchorA){this.m_localAnchorA.setVec2(def.localAnchorA)}if(def.anchorB){this.m_localAnchorB.setVec2(this.m_bodyB.getLocalPoint(def.anchorB))}else if(def.localAnchorB){this.m_localAnchorB.setVec2(def.localAnchorB)}if(def.length>0){this.m_length=+def.length}else if(def.length<0);else if(def.anchorA||def.anchorA||def.anchorA||def.anchorA){this.m_length=Vec2.distance(this.m_bodyA.getWorldPoint(this.m_localAnchorA),this.m_bodyB.getWorldPoint(this.m_localAnchorB))}if(Number.isFinite(def.frequencyHz)){this.m_frequencyHz=def.frequencyHz}if(Number.isFinite(def.dampingRatio)){this.m_dampingRatio=def.dampingRatio}};DistanceJoint2.prototype.getLocalAnchorA=function(){return this.m_localAnchorA};DistanceJoint2.prototype.getLocalAnchorB=function(){return this.m_localAnchorB};DistanceJoint2.prototype.setLength=function(length){this.m_length=length};DistanceJoint2.prototype.getLength=function(){return this.m_length};DistanceJoint2.prototype.setFrequency=function(hz){this.m_frequencyHz=hz};DistanceJoint2.prototype.getFrequency=function(){return this.m_frequencyHz};DistanceJoint2.prototype.setDampingRatio=function(ratio){this.m_dampingRatio=ratio};DistanceJoint2.prototype.getDampingRatio=function(){return this.m_dampingRatio};DistanceJoint2.prototype.getAnchorA=function(){return this.m_bodyA.getWorldPoint(this.m_localAnchorA)};DistanceJoint2.prototype.getAnchorB=function(){return this.m_bodyB.getWorldPoint(this.m_localAnchorB)};DistanceJoint2.prototype.getReactionForce=function(inv_dt){return Vec2.mulNumVec2(this.m_impulse,this.m_u).mul(inv_dt)};DistanceJoint2.prototype.getReactionTorque=function(inv_dt){return 0};DistanceJoint2.prototype.initVelocityConstraints=function(step){this.m_localCenterA=this.m_bodyA.m_sweep.localCenter;this.m_localCenterB=this.m_bodyB.m_sweep.localCenter;this.m_invMassA=this.m_bodyA.m_invMass;this.m_invMassB=this.m_bodyB.m_invMass;this.m_invIA=this.m_bodyA.m_invI;this.m_invIB=this.m_bodyB.m_invI;var cA2=this.m_bodyA.c_position.c;var aA=this.m_bodyA.c_position.a;var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var cB2=this.m_bodyB.c_position.c;var aB=this.m_bodyB.c_position.a;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var qA=Rot.neo(aA);var qB=Rot.neo(aB);this.m_rA=Rot.mulVec2(qA,Vec2.sub(this.m_localAnchorA,this.m_localCenterA));this.m_rB=Rot.mulVec2(qB,Vec2.sub(this.m_localAnchorB,this.m_localCenterB));this.m_u=Vec2.sub(Vec2.add(cB2,this.m_rB),Vec2.add(cA2,this.m_rA));var length=this.m_u.length();if(length>SettingsInternal.linearSlop){this.m_u.mul(1/length)}else{this.m_u.setNum(0,0)}var crAu=Vec2.crossVec2Vec2(this.m_rA,this.m_u);var crBu=Vec2.crossVec2Vec2(this.m_rB,this.m_u);var invMass=this.m_invMassA+this.m_invIA*crAu*crAu+this.m_invMassB+this.m_invIB*crBu*crBu;this.m_mass=invMass!=0?1/invMass:0;if(this.m_frequencyHz>0){var C=length-this.m_length;var omega=2*math_PI$3*this.m_frequencyHz;var d2=2*this.m_mass*this.m_dampingRatio*omega;var k=this.m_mass*omega*omega;var h=step.dt;this.m_gamma=h*(d2+h*k);this.m_gamma=this.m_gamma!=0?1/this.m_gamma:0;this.m_bias=C*h*k*this.m_gamma;invMass+=this.m_gamma;this.m_mass=invMass!=0?1/invMass:0}else{this.m_gamma=0;this.m_bias=0}if(step.warmStarting){this.m_impulse*=step.dtRatio;var P3=Vec2.mulNumVec2(this.m_impulse,this.m_u);vA2.subMul(this.m_invMassA,P3);wA-=this.m_invIA*Vec2.crossVec2Vec2(this.m_rA,P3);vB2.addMul(this.m_invMassB,P3);wB+=this.m_invIB*Vec2.crossVec2Vec2(this.m_rB,P3)}else{this.m_impulse=0}this.m_bodyA.c_velocity.v.setVec2(vA2);this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v.setVec2(vB2);this.m_bodyB.c_velocity.w=wB};DistanceJoint2.prototype.solveVelocityConstraints=function(step){var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var vpA=Vec2.add(vA2,Vec2.crossNumVec2(wA,this.m_rA));var vpB=Vec2.add(vB2,Vec2.crossNumVec2(wB,this.m_rB));var Cdot=Vec2.dot(this.m_u,vpB)-Vec2.dot(this.m_u,vpA);var impulse=-this.m_mass*(Cdot+this.m_bias+this.m_gamma*this.m_impulse);this.m_impulse+=impulse;var P3=Vec2.mulNumVec2(impulse,this.m_u);vA2.subMul(this.m_invMassA,P3);wA-=this.m_invIA*Vec2.crossVec2Vec2(this.m_rA,P3);vB2.addMul(this.m_invMassB,P3);wB+=this.m_invIB*Vec2.crossVec2Vec2(this.m_rB,P3);this.m_bodyA.c_velocity.v.setVec2(vA2);this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v.setVec2(vB2);this.m_bodyB.c_velocity.w=wB};DistanceJoint2.prototype.solvePositionConstraints=function(step){if(this.m_frequencyHz>0){return true}var cA2=this.m_bodyA.c_position.c;var aA=this.m_bodyA.c_position.a;var cB2=this.m_bodyB.c_position.c;var aB=this.m_bodyB.c_position.a;var qA=Rot.neo(aA);var qB=Rot.neo(aB);var rA2=Rot.mulSub(qA,this.m_localAnchorA,this.m_localCenterA);var rB2=Rot.mulSub(qB,this.m_localAnchorB,this.m_localCenterB);var u=Vec2.sub(Vec2.add(cB2,rB2),Vec2.add(cA2,rA2));var length=u.normalize();var C=clamp(length-this.m_length,-SettingsInternal.maxLinearCorrection,SettingsInternal.maxLinearCorrection);var impulse=-this.m_mass*C;var P3=Vec2.mulNumVec2(impulse,u);cA2.subMul(this.m_invMassA,P3);aA-=this.m_invIA*Vec2.crossVec2Vec2(rA2,P3);cB2.addMul(this.m_invMassB,P3);aB+=this.m_invIB*Vec2.crossVec2Vec2(rB2,P3);this.m_bodyA.c_position.c.setVec2(cA2);this.m_bodyA.c_position.a=aA;this.m_bodyB.c_position.c.setVec2(cB2);this.m_bodyB.c_position.a=aB;return math_abs$5(C)<SettingsInternal.linearSlop};DistanceJoint2.TYPE="distance-joint";return DistanceJoint2}(Joint);var DEFAULTS$9={maxForce:0,maxTorque:0};var FrictionJoint=function(_super){__extends(FrictionJoint2,_super);function FrictionJoint2(def,bodyA,bodyB,anchor){var _this=this;if(!(_this instanceof FrictionJoint2)){return new FrictionJoint2(def,bodyA,bodyB,anchor)}def=options(def,DEFAULTS$9);_this=_super.call(this,def,bodyA,bodyB)||this;bodyA=_this.m_bodyA;bodyB=_this.m_bodyB;_this.m_type=FrictionJoint2.TYPE;_this.m_localAnchorA=Vec2.clone(anchor?bodyA.getLocalPoint(anchor):def.localAnchorA||Vec2.zero());_this.m_localAnchorB=Vec2.clone(anchor?bodyB.getLocalPoint(anchor):def.localAnchorB||Vec2.zero());_this.m_linearImpulse=Vec2.zero();_this.m_angularImpulse=0;_this.m_maxForce=def.maxForce;_this.m_maxTorque=def.maxTorque;return _this}FrictionJoint2.prototype._serialize=function(){return{type:this.m_type,bodyA:this.m_bodyA,bodyB:this.m_bodyB,collideConnected:this.m_collideConnected,maxForce:this.m_maxForce,maxTorque:this.m_maxTorque,localAnchorA:this.m_localAnchorA,localAnchorB:this.m_localAnchorB}};FrictionJoint2._deserialize=function(data,world,restore){data=__assign({},data);data.bodyA=restore(Body,data.bodyA,world);data.bodyB=restore(Body,data.bodyB,world);var joint=new FrictionJoint2(data);return joint};FrictionJoint2.prototype._reset=function(def){if(def.anchorA){this.m_localAnchorA.setVec2(this.m_bodyA.getLocalPoint(def.anchorA))}else if(def.localAnchorA){this.m_localAnchorA.setVec2(def.localAnchorA)}if(def.anchorB){this.m_localAnchorB.setVec2(this.m_bodyB.getLocalPoint(def.anchorB))}else if(def.localAnchorB){this.m_localAnchorB.setVec2(def.localAnchorB)}if(Number.isFinite(def.maxForce)){this.m_maxForce=def.maxForce}if(Number.isFinite(def.maxTorque)){this.m_maxTorque=def.maxTorque}};FrictionJoint2.prototype.getLocalAnchorA=function(){return this.m_localAnchorA};FrictionJoint2.prototype.getLocalAnchorB=function(){return this.m_localAnchorB};FrictionJoint2.prototype.setMaxForce=function(force){this.m_maxForce=force};FrictionJoint2.prototype.getMaxForce=function(){return this.m_maxForce};FrictionJoint2.prototype.setMaxTorque=function(torque){this.m_maxTorque=torque};FrictionJoint2.prototype.getMaxTorque=function(){return this.m_maxTorque};FrictionJoint2.prototype.getAnchorA=function(){return this.m_bodyA.getWorldPoint(this.m_localAnchorA)};FrictionJoint2.prototype.getAnchorB=function(){return this.m_bodyB.getWorldPoint(this.m_localAnchorB)};FrictionJoint2.prototype.getReactionForce=function(inv_dt){return Vec2.mulNumVec2(inv_dt,this.m_linearImpulse)};FrictionJoint2.prototype.getReactionTorque=function(inv_dt){return inv_dt*this.m_angularImpulse};FrictionJoint2.prototype.initVelocityConstraints=function(step){this.m_localCenterA=this.m_bodyA.m_sweep.localCenter;this.m_localCenterB=this.m_bodyB.m_sweep.localCenter;this.m_invMassA=this.m_bodyA.m_invMass;this.m_invMassB=this.m_bodyB.m_invMass;this.m_invIA=this.m_bodyA.m_invI;this.m_invIB=this.m_bodyB.m_invI;var aA=this.m_bodyA.c_position.a;var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var aB=this.m_bodyB.c_position.a;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var qA=Rot.neo(aA);var qB=Rot.neo(aB);this.m_rA=Rot.mulVec2(qA,Vec2.sub(this.m_localAnchorA,this.m_localCenterA));this.m_rB=Rot.mulVec2(qB,Vec2.sub(this.m_localAnchorB,this.m_localCenterB));var mA=this.m_invMassA;var mB=this.m_invMassB;var iA=this.m_invIA;var iB=this.m_invIB;var K=new Mat22;K.ex.x=mA+mB+iA*this.m_rA.y*this.m_rA.y+iB*this.m_rB.y*this.m_rB.y;K.ex.y=-iA*this.m_rA.x*this.m_rA.y-iB*this.m_rB.x*this.m_rB.y;K.ey.x=K.ex.y;K.ey.y=mA+mB+iA*this.m_rA.x*this.m_rA.x+iB*this.m_rB.x*this.m_rB.x;this.m_linearMass=K.getInverse();this.m_angularMass=iA+iB;if(this.m_angularMass>0){this.m_angularMass=1/this.m_angularMass}if(step.warmStarting){this.m_linearImpulse.mul(step.dtRatio);this.m_angularImpulse*=step.dtRatio;var P3=Vec2.neo(this.m_linearImpulse.x,this.m_linearImpulse.y);vA2.subMul(mA,P3);wA-=iA*(Vec2.crossVec2Vec2(this.m_rA,P3)+this.m_angularImpulse);vB2.addMul(mB,P3);wB+=iB*(Vec2.crossVec2Vec2(this.m_rB,P3)+this.m_angularImpulse)}else{this.m_linearImpulse.setZero();this.m_angularImpulse=0}this.m_bodyA.c_velocity.v=vA2;this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v=vB2;this.m_bodyB.c_velocity.w=wB};FrictionJoint2.prototype.solveVelocityConstraints=function(step){var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var mA=this.m_invMassA;var mB=this.m_invMassB;var iA=this.m_invIA;var iB=this.m_invIB;var h=step.dt;{var Cdot=wB-wA;var impulse=-this.m_angularMass*Cdot;var oldImpulse=this.m_angularImpulse;var maxImpulse=h*this.m_maxTorque;this.m_angularImpulse=clamp(this.m_angularImpulse+impulse,-maxImpulse,maxImpulse);impulse=this.m_angularImpulse-oldImpulse;wA-=iA*impulse;wB+=iB*impulse}{var Cdot=Vec2.sub(Vec2.add(vB2,Vec2.crossNumVec2(wB,this.m_rB)),Vec2.add(vA2,Vec2.crossNumVec2(wA,this.m_rA)));var impulse=Vec2.neg(Mat22.mulVec2(this.m_linearMass,Cdot));var oldImpulse=this.m_linearImpulse;this.m_linearImpulse.add(impulse);var maxImpulse=h*this.m_maxForce;if(this.m_linearImpulse.lengthSquared()>maxImpulse*maxImpulse){this.m_linearImpulse.normalize();this.m_linearImpulse.mul(maxImpulse)}impulse=Vec2.sub(this.m_linearImpulse,oldImpulse);vA2.subMul(mA,impulse);wA-=iA*Vec2.crossVec2Vec2(this.m_rA,impulse);vB2.addMul(mB,impulse);wB+=iB*Vec2.crossVec2Vec2(this.m_rB,impulse)}this.m_bodyA.c_velocity.v=vA2;this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v=vB2;this.m_bodyB.c_velocity.w=wB};FrictionJoint2.prototype.solvePositionConstraints=function(step){return true};FrictionJoint2.TYPE="friction-joint";return FrictionJoint2}(Joint);var Mat33=function(){function Mat332(a2,b2,c2){if(typeof a2==="object"&&a2!==null){this.ex=Vec3.clone(a2);this.ey=Vec3.clone(b2);this.ez=Vec3.clone(c2)}else{this.ex=Vec3.zero();this.ey=Vec3.zero();this.ez=Vec3.zero()}}Mat332.prototype.toString=function(){return JSON.stringify(this)};Mat332.isValid=function(obj){if(obj===null||typeof obj==="undefined"){return false}return Vec3.isValid(obj.ex)&&Vec3.isValid(obj.ey)&&Vec3.isValid(obj.ez)};Mat332.assert=function(o){};Mat332.prototype.setZero=function(){this.ex.setZero();this.ey.setZero();this.ez.setZero();return this};Mat332.prototype.solve33=function(v3){var cross_x=this.ey.y*this.ez.z-this.ey.z*this.ez.y;var cross_y=this.ey.z*this.ez.x-this.ey.x*this.ez.z;var cross_z=this.ey.x*this.ez.y-this.ey.y*this.ez.x;var det=this.ex.x*cross_x+this.ex.y*cross_y+this.ex.z*cross_z;if(det!==0){det=1/det}var r=new Vec3;cross_x=this.ey.y*this.ez.z-this.ey.z*this.ez.y;cross_y=this.ey.z*this.ez.x-this.ey.x*this.ez.z;cross_z=this.ey.x*this.ez.y-this.ey.y*this.ez.x;r.x=det*(v3.x*cross_x+v3.y*cross_y+v3.z*cross_z);cross_x=v3.y*this.ez.z-v3.z*this.ez.y;cross_y=v3.z*this.ez.x-v3.x*this.ez.z;cross_z=v3.x*this.ez.y-v3.y*this.ez.x;r.y=det*(this.ex.x*cross_x+this.ex.y*cross_y+this.ex.z*cross_z);cross_x=this.ey.y*v3.z-this.ey.z*v3.y;cross_y=this.ey.z*v3.x-this.ey.x*v3.z;cross_z=this.ey.x*v3.y-this.ey.y*v3.x;r.z=det*(this.ex.x*cross_x+this.ex.y*cross_y+this.ex.z*cross_z);return r};Mat332.prototype.solve22=function(v3){var a11=this.ex.x;var a12=this.ey.x;var a21=this.ex.y;var a22=this.ey.y;var det=a11*a22-a12*a21;if(det!==0){det=1/det}var r=Vec2.zero();r.x=det*(a22*v3.x-a12*v3.y);r.y=det*(a11*v3.y-a21*v3.x);return r};Mat332.prototype.getInverse22=function(M){var a2=this.ex.x;var b2=this.ey.x;var c2=this.ex.y;var d2=this.ey.y;var det=a2*d2-b2*c2;if(det!==0){det=1/det}M.ex.x=det*d2;M.ey.x=-det*b2;M.ex.z=0;M.ex.y=-det*c2;M.ey.y=det*a2;M.ey.z=0;M.ez.x=0;M.ez.y=0;M.ez.z=0};Mat332.prototype.getSymInverse33=function(M){var det=Vec3.dot(this.ex,Vec3.cross(this.ey,this.ez));if(det!==0){det=1/det}var a11=this.ex.x;var a12=this.ey.x;var a13=this.ez.x;var a22=this.ey.y;var a23=this.ez.y;var a33=this.ez.z;M.ex.x=det*(a22*a33-a23*a23);M.ex.y=det*(a13*a23-a12*a33);M.ex.z=det*(a12*a23-a13*a22);M.ey.x=M.ex.y;M.ey.y=det*(a11*a33-a13*a13);M.ey.z=det*(a13*a12-a11*a23);M.ez.x=M.ex.z;M.ez.y=M.ey.z;M.ez.z=det*(a11*a22-a12*a12)};Mat332.mul=function(a2,b2){if(b2&&"z"in b2&&"y"in b2&&"x"in b2){var x2=a2.ex.x*b2.x+a2.ey.x*b2.y+a2.ez.x*b2.z;var y=a2.ex.y*b2.x+a2.ey.y*b2.y+a2.ez.y*b2.z;var z=a2.ex.z*b2.x+a2.ey.z*b2.y+a2.ez.z*b2.z;return new Vec3(x2,y,z)}else if(b2&&"y"in b2&&"x"in b2){var x2=a2.ex.x*b2.x+a2.ey.x*b2.y;var y=a2.ex.y*b2.x+a2.ey.y*b2.y;return Vec2.neo(x2,y)}};Mat332.mulVec3=function(a2,b2){var x2=a2.ex.x*b2.x+a2.ey.x*b2.y+a2.ez.x*b2.z;var y=a2.ex.y*b2.x+a2.ey.y*b2.y+a2.ez.y*b2.z;var z=a2.ex.z*b2.x+a2.ey.z*b2.y+a2.ez.z*b2.z;return new Vec3(x2,y,z)};Mat332.mulVec2=function(a2,b2){var x2=a2.ex.x*b2.x+a2.ey.x*b2.y;var y=a2.ex.y*b2.x+a2.ey.y*b2.y;return Vec2.neo(x2,y)};Mat332.add=function(a2,b2){return new Mat332(Vec3.add(a2.ex,b2.ex),Vec3.add(a2.ey,b2.ey),Vec3.add(a2.ez,b2.ez))};return Mat332}();var math_abs$4=Math.abs;var LimitState$2;(function(LimitState2){LimitState2[LimitState2["inactiveLimit"]=0]="inactiveLimit";LimitState2[LimitState2["atLowerLimit"]=1]="atLowerLimit";LimitState2[LimitState2["atUpperLimit"]=2]="atUpperLimit";LimitState2[LimitState2["equalLimits"]=3]="equalLimits"})(LimitState$2||(LimitState$2={}));var DEFAULTS$8={lowerAngle:0,upperAngle:0,maxMotorTorque:0,motorSpeed:0,enableLimit:false,enableMotor:false};var RevoluteJoint=function(_super){__extends(RevoluteJoint2,_super);function RevoluteJoint2(def,bodyA,bodyB,anchor){var _this=this;var _a2,_b,_c,_d,_e,_f;if(!(_this instanceof RevoluteJoint2)){return new RevoluteJoint2(def,bodyA,bodyB,anchor)}def=def!==null&&def!==void 0?def:{};_this=_super.call(this,def,bodyA,bodyB)||this;bodyA=_this.m_bodyA;bodyB=_this.m_bodyB;_this.m_mass=new Mat33;_this.m_limitState=LimitState$2.inactiveLimit;_this.m_type=RevoluteJoint2.TYPE;if(Vec2.isValid(anchor)){_this.m_localAnchorA=bodyA.getLocalPoint(anchor)}else if(Vec2.isValid(def.localAnchorA)){_this.m_localAnchorA=Vec2.clone(def.localAnchorA)}else{_this.m_localAnchorA=Vec2.zero()}if(Vec2.isValid(anchor)){_this.m_localAnchorB=bodyB.getLocalPoint(anchor)}else if(Vec2.isValid(def.localAnchorB)){_this.m_localAnchorB=Vec2.clone(def.localAnchorB)}else{_this.m_localAnchorB=Vec2.zero()}if(Number.isFinite(def.referenceAngle)){_this.m_referenceAngle=def.referenceAngle}else{_this.m_referenceAngle=bodyB.getAngle()-bodyA.getAngle()}_this.m_impulse=new Vec3;_this.m_motorImpulse=0;_this.m_lowerAngle=(_a2=def.lowerAngle)!==null&&_a2!==void 0?_a2:DEFAULTS$8.lowerAngle;_this.m_upperAngle=(_b=def.upperAngle)!==null&&_b!==void 0?_b:DEFAULTS$8.upperAngle;_this.m_maxMotorTorque=(_c=def.maxMotorTorque)!==null&&_c!==void 0?_c:DEFAULTS$8.maxMotorTorque;_this.m_motorSpeed=(_d=def.motorSpeed)!==null&&_d!==void 0?_d:DEFAULTS$8.motorSpeed;_this.m_enableLimit=(_e=def.enableLimit)!==null&&_e!==void 0?_e:DEFAULTS$8.enableLimit;_this.m_enableMotor=(_f=def.enableMotor)!==null&&_f!==void 0?_f:DEFAULTS$8.enableMotor;return _this}RevoluteJoint2.prototype._serialize=function(){return{type:this.m_type,bodyA:this.m_bodyA,bodyB:this.m_bodyB,collideConnected:this.m_collideConnected,lowerAngle:this.m_lowerAngle,upperAngle:this.m_upperAngle,maxMotorTorque:this.m_maxMotorTorque,motorSpeed:this.m_motorSpeed,enableLimit:this.m_enableLimit,enableMotor:this.m_enableMotor,localAnchorA:this.m_localAnchorA,localAnchorB:this.m_localAnchorB,referenceAngle:this.m_referenceAngle}};RevoluteJoint2._deserialize=function(data,world,restore){data=__assign({},data);data.bodyA=restore(Body,data.bodyA,world);data.bodyB=restore(Body,data.bodyB,world);var joint=new RevoluteJoint2(data);return joint};RevoluteJoint2.prototype._reset=function(def){if(def.anchorA){this.m_localAnchorA.setVec2(this.m_bodyA.getLocalPoint(def.anchorA))}else if(def.localAnchorA){this.m_localAnchorA.setVec2(def.localAnchorA)}if(def.anchorB){this.m_localAnchorB.setVec2(this.m_bodyB.getLocalPoint(def.anchorB))}else if(def.localAnchorB){this.m_localAnchorB.setVec2(def.localAnchorB)}if(Number.isFinite(def.referenceAngle)){this.m_referenceAngle=def.referenceAngle}if(def.enableLimit!==void 0){this.m_enableLimit=def.enableLimit}if(Number.isFinite(def.lowerAngle)){this.m_lowerAngle=def.lowerAngle}if(Number.isFinite(def.upperAngle)){this.m_upperAngle=def.upperAngle}if(Number.isFinite(def.maxMotorTorque)){this.m_maxMotorTorque=def.maxMotorTorque}if(Number.isFinite(def.motorSpeed)){this.m_motorSpeed=def.motorSpeed}if(def.enableMotor!==void 0){this.m_enableMotor=def.enableMotor}};RevoluteJoint2.prototype.getLocalAnchorA=function(){return this.m_localAnchorA};RevoluteJoint2.prototype.getLocalAnchorB=function(){return this.m_localAnchorB};RevoluteJoint2.prototype.getReferenceAngle=function(){return this.m_referenceAngle};RevoluteJoint2.prototype.getJointAngle=function(){var bA=this.m_bodyA;var bB=this.m_bodyB;return bB.m_sweep.a-bA.m_sweep.a-this.m_referenceAngle};RevoluteJoint2.prototype.getJointSpeed=function(){var bA=this.m_bodyA;var bB=this.m_bodyB;return bB.m_angularVelocity-bA.m_angularVelocity};RevoluteJoint2.prototype.isMotorEnabled=function(){return this.m_enableMotor};RevoluteJoint2.prototype.enableMotor=function(flag){if(flag==this.m_enableMotor)return;this.m_bodyA.setAwake(true);this.m_bodyB.setAwake(true);this.m_enableMotor=flag};RevoluteJoint2.prototype.getMotorTorque=function(inv_dt){return inv_dt*this.m_motorImpulse};RevoluteJoint2.prototype.setMotorSpeed=function(speed){if(speed==this.m_motorSpeed)return;this.m_bodyA.setAwake(true);this.m_bodyB.setAwake(true);this.m_motorSpeed=speed};RevoluteJoint2.prototype.getMotorSpeed=function(){return this.m_motorSpeed};RevoluteJoint2.prototype.setMaxMotorTorque=function(torque){if(torque==this.m_maxMotorTorque)return;this.m_bodyA.setAwake(true);this.m_bodyB.setAwake(true);this.m_maxMotorTorque=torque};RevoluteJoint2.prototype.getMaxMotorTorque=function(){return this.m_maxMotorTorque};RevoluteJoint2.prototype.isLimitEnabled=function(){return this.m_enableLimit};RevoluteJoint2.prototype.enableLimit=function(flag){if(flag!=this.m_enableLimit){this.m_bodyA.setAwake(true);this.m_bodyB.setAwake(true);this.m_enableLimit=flag;this.m_impulse.z=0}};RevoluteJoint2.prototype.getLowerLimit=function(){return this.m_lowerAngle};RevoluteJoint2.prototype.getUpperLimit=function(){return this.m_upperAngle};RevoluteJoint2.prototype.setLimits=function(lower,upper){if(lower!=this.m_lowerAngle||upper!=this.m_upperAngle){this.m_bodyA.setAwake(true);this.m_bodyB.setAwake(true);this.m_impulse.z=0;this.m_lowerAngle=lower;this.m_upperAngle=upper}};RevoluteJoint2.prototype.getAnchorA=function(){return this.m_bodyA.getWorldPoint(this.m_localAnchorA)};RevoluteJoint2.prototype.getAnchorB=function(){return this.m_bodyB.getWorldPoint(this.m_localAnchorB)};RevoluteJoint2.prototype.getReactionForce=function(inv_dt){return Vec2.neo(this.m_impulse.x,this.m_impulse.y).mul(inv_dt)};RevoluteJoint2.prototype.getReactionTorque=function(inv_dt){return inv_dt*this.m_impulse.z};RevoluteJoint2.prototype.initVelocityConstraints=function(step){this.m_localCenterA=this.m_bodyA.m_sweep.localCenter;this.m_localCenterB=this.m_bodyB.m_sweep.localCenter;this.m_invMassA=this.m_bodyA.m_invMass;this.m_invMassB=this.m_bodyB.m_invMass;this.m_invIA=this.m_bodyA.m_invI;this.m_invIB=this.m_bodyB.m_invI;var aA=this.m_bodyA.c_position.a;var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var aB=this.m_bodyB.c_position.a;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var qA=Rot.neo(aA);var qB=Rot.neo(aB);this.m_rA=Rot.mulVec2(qA,Vec2.sub(this.m_localAnchorA,this.m_localCenterA));this.m_rB=Rot.mulVec2(qB,Vec2.sub(this.m_localAnchorB,this.m_localCenterB));var mA=this.m_invMassA;var mB=this.m_invMassB;var iA=this.m_invIA;var iB=this.m_invIB;var fixedRotation=iA+iB===0;this.m_mass.ex.x=mA+mB+this.m_rA.y*this.m_rA.y*iA+this.m_rB.y*this.m_rB.y*iB;this.m_mass.ey.x=-this.m_rA.y*this.m_rA.x*iA-this.m_rB.y*this.m_rB.x*iB;this.m_mass.ez.x=-this.m_rA.y*iA-this.m_rB.y*iB;this.m_mass.ex.y=this.m_mass.ey.x;this.m_mass.ey.y=mA+mB+this.m_rA.x*this.m_rA.x*iA+this.m_rB.x*this.m_rB.x*iB;this.m_mass.ez.y=this.m_rA.x*iA+this.m_rB.x*iB;this.m_mass.ex.z=this.m_mass.ez.x;this.m_mass.ey.z=this.m_mass.ez.y;this.m_mass.ez.z=iA+iB;this.m_motorMass=iA+iB;if(this.m_motorMass>0){this.m_motorMass=1/this.m_motorMass}if(this.m_enableMotor==false||fixedRotation){this.m_motorImpulse=0}if(this.m_enableLimit&&fixedRotation==false){var jointAngle=aB-aA-this.m_referenceAngle;if(math_abs$4(this.m_upperAngle-this.m_lowerAngle)<2*SettingsInternal.angularSlop){this.m_limitState=LimitState$2.equalLimits}else if(jointAngle<=this.m_lowerAngle){if(this.m_limitState!=LimitState$2.atLowerLimit){this.m_impulse.z=0}this.m_limitState=LimitState$2.atLowerLimit}else if(jointAngle>=this.m_upperAngle){if(this.m_limitState!=LimitState$2.atUpperLimit){this.m_impulse.z=0}this.m_limitState=LimitState$2.atUpperLimit}else{this.m_limitState=LimitState$2.inactiveLimit;this.m_impulse.z=0}}else{this.m_limitState=LimitState$2.inactiveLimit}if(step.warmStarting){this.m_impulse.mul(step.dtRatio);this.m_motorImpulse*=step.dtRatio;var P3=Vec2.neo(this.m_impulse.x,this.m_impulse.y);vA2.subMul(mA,P3);wA-=iA*(Vec2.crossVec2Vec2(this.m_rA,P3)+this.m_motorImpulse+this.m_impulse.z);vB2.addMul(mB,P3);wB+=iB*(Vec2.crossVec2Vec2(this.m_rB,P3)+this.m_motorImpulse+this.m_impulse.z)}else{this.m_impulse.setZero();this.m_motorImpulse=0}this.m_bodyA.c_velocity.v=vA2;this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v=vB2;this.m_bodyB.c_velocity.w=wB};RevoluteJoint2.prototype.solveVelocityConstraints=function(step){var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var mA=this.m_invMassA;var mB=this.m_invMassB;var iA=this.m_invIA;var iB=this.m_invIB;var fixedRotation=iA+iB===0;if(this.m_enableMotor&&this.m_limitState!=LimitState$2.equalLimits&&fixedRotation==false){var Cdot=wB-wA-this.m_motorSpeed;var impulse=-this.m_motorMass*Cdot;var oldImpulse=this.m_motorImpulse;var maxImpulse=step.dt*this.m_maxMotorTorque;this.m_motorImpulse=clamp(this.m_motorImpulse+impulse,-maxImpulse,maxImpulse);impulse=this.m_motorImpulse-oldImpulse;wA-=iA*impulse;wB+=iB*impulse}if(this.m_enableLimit&&this.m_limitState!=LimitState$2.inactiveLimit&&fixedRotation==false){var Cdot1=Vec2.zero();Cdot1.addCombine(1,vB2,1,Vec2.crossNumVec2(wB,this.m_rB));Cdot1.subCombine(1,vA2,1,Vec2.crossNumVec2(wA,this.m_rA));var Cdot2=wB-wA;var Cdot=new Vec3(Cdot1.x,Cdot1.y,Cdot2);var impulse=Vec3.neg(this.m_mass.solve33(Cdot));if(this.m_limitState==LimitState$2.equalLimits){this.m_impulse.add(impulse)}else if(this.m_limitState==LimitState$2.atLowerLimit){var newImpulse=this.m_impulse.z+impulse.z;if(newImpulse<0){var rhs=Vec2.combine(-1,Cdot1,this.m_impulse.z,Vec2.neo(this.m_mass.ez.x,this.m_mass.ez.y));var reduced=this.m_mass.solve22(rhs);impulse.x=reduced.x;impulse.y=reduced.y;impulse.z=-this.m_impulse.z;this.m_impulse.x+=reduced.x;this.m_impulse.y+=reduced.y;this.m_impulse.z=0}else{this.m_impulse.add(impulse)}}else if(this.m_limitState==LimitState$2.atUpperLimit){var newImpulse=this.m_impulse.z+impulse.z;if(newImpulse>0){var rhs=Vec2.combine(-1,Cdot1,this.m_impulse.z,Vec2.neo(this.m_mass.ez.x,this.m_mass.ez.y));var reduced=this.m_mass.solve22(rhs);impulse.x=reduced.x;impulse.y=reduced.y;impulse.z=-this.m_impulse.z;this.m_impulse.x+=reduced.x;this.m_impulse.y+=reduced.y;this.m_impulse.z=0}else{this.m_impulse.add(impulse)}}var P3=Vec2.neo(impulse.x,impulse.y);vA2.subMul(mA,P3);wA-=iA*(Vec2.crossVec2Vec2(this.m_rA,P3)+impulse.z);vB2.addMul(mB,P3);wB+=iB*(Vec2.crossVec2Vec2(this.m_rB,P3)+impulse.z)}else{var Cdot=Vec2.zero();Cdot.addCombine(1,vB2,1,Vec2.crossNumVec2(wB,this.m_rB));Cdot.subCombine(1,vA2,1,Vec2.crossNumVec2(wA,this.m_rA));var impulse=this.m_mass.solve22(Vec2.neg(Cdot));this.m_impulse.x+=impulse.x;this.m_impulse.y+=impulse.y;vA2.subMul(mA,impulse);wA-=iA*Vec2.crossVec2Vec2(this.m_rA,impulse);vB2.addMul(mB,impulse);wB+=iB*Vec2.crossVec2Vec2(this.m_rB,impulse)}this.m_bodyA.c_velocity.v=vA2;this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v=vB2;this.m_bodyB.c_velocity.w=wB};RevoluteJoint2.prototype.solvePositionConstraints=function(step){var cA2=this.m_bodyA.c_position.c;var aA=this.m_bodyA.c_position.a;var cB2=this.m_bodyB.c_position.c;var aB=this.m_bodyB.c_position.a;var qA=Rot.neo(aA);var qB=Rot.neo(aB);var angularError=0;var positionError=0;var fixedRotation=this.m_invIA+this.m_invIB==0;if(this.m_enableLimit&&this.m_limitState!=LimitState$2.inactiveLimit&&fixedRotation==false){var angle=aB-aA-this.m_referenceAngle;var limitImpulse=0;if(this.m_limitState==LimitState$2.equalLimits){var C=clamp(angle-this.m_lowerAngle,-SettingsInternal.maxAngularCorrection,SettingsInternal.maxAngularCorrection);limitImpulse=-this.m_motorMass*C;angularError=math_abs$4(C)}else if(this.m_limitState==LimitState$2.atLowerLimit){var C=angle-this.m_lowerAngle;angularError=-C;C=clamp(C+SettingsInternal.angularSlop,-SettingsInternal.maxAngularCorrection,0);limitImpulse=-this.m_motorMass*C}else if(this.m_limitState==LimitState$2.atUpperLimit){var C=angle-this.m_upperAngle;angularError=C;C=clamp(C-SettingsInternal.angularSlop,0,SettingsInternal.maxAngularCorrection);limitImpulse=-this.m_motorMass*C}aA-=this.m_invIA*limitImpulse;aB+=this.m_invIB*limitImpulse}{qA.setAngle(aA);qB.setAngle(aB);var rA2=Rot.mulVec2(qA,Vec2.sub(this.m_localAnchorA,this.m_localCenterA));var rB2=Rot.mulVec2(qB,Vec2.sub(this.m_localAnchorB,this.m_localCenterB));var C=Vec2.zero();C.addCombine(1,cB2,1,rB2);C.subCombine(1,cA2,1,rA2);positionError=C.length();var mA=this.m_invMassA;var mB=this.m_invMassB;var iA=this.m_invIA;var iB=this.m_invIB;var K=new Mat22;K.ex.x=mA+mB+iA*rA2.y*rA2.y+iB*rB2.y*rB2.y;K.ex.y=-iA*rA2.x*rA2.y-iB*rB2.x*rB2.y;K.ey.x=K.ex.y;K.ey.y=mA+mB+iA*rA2.x*rA2.x+iB*rB2.x*rB2.x;var impulse=Vec2.neg(K.solve(C));cA2.subMul(mA,impulse);aA-=iA*Vec2.crossVec2Vec2(rA2,impulse);cB2.addMul(mB,impulse);aB+=iB*Vec2.crossVec2Vec2(rB2,impulse)}this.m_bodyA.c_position.c.setVec2(cA2);this.m_bodyA.c_position.a=aA;this.m_bodyB.c_position.c.setVec2(cB2);this.m_bodyB.c_position.a=aB;return positionError<=SettingsInternal.linearSlop&&angularError<=SettingsInternal.angularSlop};RevoluteJoint2.TYPE="revolute-joint";return RevoluteJoint2}(Joint);var math_abs$3=Math.abs;var math_max=Math.max;var math_min$2=Math.min;var LimitState$1;(function(LimitState2){LimitState2[LimitState2["inactiveLimit"]=0]="inactiveLimit";LimitState2[LimitState2["atLowerLimit"]=1]="atLowerLimit";LimitState2[LimitState2["atUpperLimit"]=2]="atUpperLimit";LimitState2[LimitState2["equalLimits"]=3]="equalLimits"})(LimitState$1||(LimitState$1={}));var DEFAULTS$7={enableLimit:false,lowerTranslation:0,upperTranslation:0,enableMotor:false,maxMotorForce:0,motorSpeed:0};var PrismaticJoint=function(_super){__extends(PrismaticJoint2,_super);function PrismaticJoint2(def,bodyA,bodyB,anchor,axis){var _this=this;if(!(_this instanceof PrismaticJoint2)){return new PrismaticJoint2(def,bodyA,bodyB,anchor,axis)}def=options(def,DEFAULTS$7);_this=_super.call(this,def,bodyA,bodyB)||this;bodyA=_this.m_bodyA;bodyB=_this.m_bodyB;_this.m_type=PrismaticJoint2.TYPE;_this.m_localAnchorA=Vec2.clone(anchor?bodyA.getLocalPoint(anchor):def.localAnchorA||Vec2.zero());_this.m_localAnchorB=Vec2.clone(anchor?bodyB.getLocalPoint(anchor):def.localAnchorB||Vec2.zero());_this.m_localXAxisA=Vec2.clone(axis?bodyA.getLocalVector(axis):def.localAxisA||Vec2.neo(1,0));_this.m_localXAxisA.normalize();_this.m_localYAxisA=Vec2.crossNumVec2(1,_this.m_localXAxisA);_this.m_referenceAngle=Number.isFinite(def.referenceAngle)?def.referenceAngle:bodyB.getAngle()-bodyA.getAngle();_this.m_impulse=new Vec3;_this.m_motorMass=0;_this.m_motorImpulse=0;_this.m_lowerTranslation=def.lowerTranslation;_this.m_upperTranslation=def.upperTranslation;_this.m_maxMotorForce=def.maxMotorForce;_this.m_motorSpeed=def.motorSpeed;_this.m_enableLimit=def.enableLimit;_this.m_enableMotor=def.enableMotor;_this.m_limitState=LimitState$1.inactiveLimit;_this.m_axis=Vec2.zero();_this.m_perp=Vec2.zero();_this.m_K=new Mat33;return _this}PrismaticJoint2.prototype._serialize=function(){return{type:this.m_type,bodyA:this.m_bodyA,bodyB:this.m_bodyB,collideConnected:this.m_collideConnected,lowerTranslation:this.m_lowerTranslation,upperTranslation:this.m_upperTranslation,maxMotorForce:this.m_maxMotorForce,motorSpeed:this.m_motorSpeed,enableLimit:this.m_enableLimit,enableMotor:this.m_enableMotor,localAnchorA:this.m_localAnchorA,localAnchorB:this.m_localAnchorB,localAxisA:this.m_localXAxisA,referenceAngle:this.m_referenceAngle}};PrismaticJoint2._deserialize=function(data,world,restore){data=__assign({},data);data.bodyA=restore(Body,data.bodyA,world);data.bodyB=restore(Body,data.bodyB,world);data.localAxisA=Vec2.clone(data.localAxisA);var joint=new PrismaticJoint2(data);return joint};PrismaticJoint2.prototype._reset=function(def){if(def.anchorA){this.m_localAnchorA.setVec2(this.m_bodyA.getLocalPoint(def.anchorA))}else if(def.localAnchorA){this.m_localAnchorA.setVec2(def.localAnchorA)}if(def.anchorB){this.m_localAnchorB.setVec2(this.m_bodyB.getLocalPoint(def.anchorB))}else if(def.localAnchorB){this.m_localAnchorB.setVec2(def.localAnchorB)}if(def.localAxisA){this.m_localXAxisA.setVec2(def.localAxisA);this.m_localYAxisA.setVec2(Vec2.crossNumVec2(1,def.localAxisA))}if(Number.isFinite(def.referenceAngle)){this.m_referenceAngle=def.referenceAngle}if(typeof def.enableLimit!=="undefined"){this.m_enableLimit=!!def.enableLimit}if(Number.isFinite(def.lowerTranslation)){this.m_lowerTranslation=def.lowerTranslation}if(Number.isFinite(def.upperTranslation)){this.m_upperTranslation=def.upperTranslation}if(typeof def.enableMotor!=="undefined"){this.m_enableMotor=!!def.enableMotor}if(Number.isFinite(def.maxMotorForce)){this.m_maxMotorForce=def.maxMotorForce}if(Number.isFinite(def.motorSpeed)){this.m_motorSpeed=def.motorSpeed}};PrismaticJoint2.prototype.getLocalAnchorA=function(){return this.m_localAnchorA};PrismaticJoint2.prototype.getLocalAnchorB=function(){return this.m_localAnchorB};PrismaticJoint2.prototype.getLocalAxisA=function(){return this.m_localXAxisA};PrismaticJoint2.prototype.getReferenceAngle=function(){return this.m_referenceAngle};PrismaticJoint2.prototype.getJointTranslation=function(){var pA2=this.m_bodyA.getWorldPoint(this.m_localAnchorA);var pB2=this.m_bodyB.getWorldPoint(this.m_localAnchorB);var d2=Vec2.sub(pB2,pA2);var axis=this.m_bodyA.getWorldVector(this.m_localXAxisA);var translation2=Vec2.dot(d2,axis);return translation2};PrismaticJoint2.prototype.getJointSpeed=function(){var bA=this.m_bodyA;var bB=this.m_bodyB;var rA2=Rot.mulVec2(bA.m_xf.q,Vec2.sub(this.m_localAnchorA,bA.m_sweep.localCenter));var rB2=Rot.mulVec2(bB.m_xf.q,Vec2.sub(this.m_localAnchorB,bB.m_sweep.localCenter));var p1=Vec2.add(bA.m_sweep.c,rA2);var p2=Vec2.add(bB.m_sweep.c,rB2);var d2=Vec2.sub(p2,p1);var axis=Rot.mulVec2(bA.m_xf.q,this.m_localXAxisA);var vA2=bA.m_linearVelocity;var vB2=bB.m_linearVelocity;var wA=bA.m_angularVelocity;var wB=bB.m_angularVelocity;var speed=Vec2.dot(d2,Vec2.crossNumVec2(wA,axis))+Vec2.dot(axis,Vec2.sub(Vec2.addCrossNumVec2(vB2,wB,rB2),Vec2.addCrossNumVec2(vA2,wA,rA2)));return speed};PrismaticJoint2.prototype.isLimitEnabled=function(){return this.m_enableLimit};PrismaticJoint2.prototype.enableLimit=function(flag){if(flag!=this.m_enableLimit){this.m_bodyA.setAwake(true);this.m_bodyB.setAwake(true);this.m_enableLimit=flag;this.m_impulse.z=0}};PrismaticJoint2.prototype.getLowerLimit=function(){return this.m_lowerTranslation};PrismaticJoint2.prototype.getUpperLimit=function(){return this.m_upperTranslation};PrismaticJoint2.prototype.setLimits=function(lower,upper){if(lower!=this.m_lowerTranslation||upper!=this.m_upperTranslation){this.m_bodyA.setAwake(true);this.m_bodyB.setAwake(true);this.m_lowerTranslation=lower;this.m_upperTranslation=upper;this.m_impulse.z=0}};PrismaticJoint2.prototype.isMotorEnabled=function(){return this.m_enableMotor};PrismaticJoint2.prototype.enableMotor=function(flag){if(flag==this.m_enableMotor)return;this.m_bodyA.setAwake(true);this.m_bodyB.setAwake(true);this.m_enableMotor=flag};PrismaticJoint2.prototype.setMotorSpeed=function(speed){if(speed==this.m_motorSpeed)return;this.m_bodyA.setAwake(true);this.m_bodyB.setAwake(true);this.m_motorSpeed=speed};PrismaticJoint2.prototype.setMaxMotorForce=function(force){if(force==this.m_maxMotorForce)return;this.m_bodyA.setAwake(true);this.m_bodyB.setAwake(true);this.m_maxMotorForce=force};PrismaticJoint2.prototype.getMaxMotorForce=function(){return this.m_maxMotorForce};PrismaticJoint2.prototype.getMotorSpeed=function(){return this.m_motorSpeed};PrismaticJoint2.prototype.getMotorForce=function(inv_dt){return inv_dt*this.m_motorImpulse};PrismaticJoint2.prototype.getAnchorA=function(){return this.m_bodyA.getWorldPoint(this.m_localAnchorA)};PrismaticJoint2.prototype.getAnchorB=function(){return this.m_bodyB.getWorldPoint(this.m_localAnchorB)};PrismaticJoint2.prototype.getReactionForce=function(inv_dt){return Vec2.combine(this.m_impulse.x,this.m_perp,this.m_motorImpulse+this.m_impulse.z,this.m_axis).mul(inv_dt)};PrismaticJoint2.prototype.getReactionTorque=function(inv_dt){return inv_dt*this.m_impulse.y};PrismaticJoint2.prototype.initVelocityConstraints=function(step){this.m_localCenterA=this.m_bodyA.m_sweep.localCenter;this.m_localCenterB=this.m_bodyB.m_sweep.localCenter;this.m_invMassA=this.m_bodyA.m_invMass;this.m_invMassB=this.m_bodyB.m_invMass;this.m_invIA=this.m_bodyA.m_invI;this.m_invIB=this.m_bodyB.m_invI;var cA2=this.m_bodyA.c_position.c;var aA=this.m_bodyA.c_position.a;var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var cB2=this.m_bodyB.c_position.c;var aB=this.m_bodyB.c_position.a;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var qA=Rot.neo(aA);var qB=Rot.neo(aB);var rA2=Rot.mulVec2(qA,Vec2.sub(this.m_localAnchorA,this.m_localCenterA));var rB2=Rot.mulVec2(qB,Vec2.sub(this.m_localAnchorB,this.m_localCenterB));var d2=Vec2.zero();d2.addCombine(1,cB2,1,rB2);d2.subCombine(1,cA2,1,rA2);var mA=this.m_invMassA;var mB=this.m_invMassB;var iA=this.m_invIA;var iB=this.m_invIB;{this.m_axis=Rot.mulVec2(qA,this.m_localXAxisA);this.m_a1=Vec2.crossVec2Vec2(Vec2.add(d2,rA2),this.m_axis);this.m_a2=Vec2.crossVec2Vec2(rB2,this.m_axis);this.m_motorMass=mA+mB+iA*this.m_a1*this.m_a1+iB*this.m_a2*this.m_a2;if(this.m_motorMass>0){this.m_motorMass=1/this.m_motorMass}}{this.m_perp=Rot.mulVec2(qA,this.m_localYAxisA);this.m_s1=Vec2.crossVec2Vec2(Vec2.add(d2,rA2),this.m_perp);this.m_s2=Vec2.crossVec2Vec2(rB2,this.m_perp);Vec2.crossVec2Vec2(rA2,this.m_perp);var k11=mA+mB+iA*this.m_s1*this.m_s1+iB*this.m_s2*this.m_s2;var k12=iA*this.m_s1+iB*this.m_s2;var k13=iA*this.m_s1*this.m_a1+iB*this.m_s2*this.m_a2;var k22=iA+iB;if(k22==0){k22=1}var k23=iA*this.m_a1+iB*this.m_a2;var k33=mA+mB+iA*this.m_a1*this.m_a1+iB*this.m_a2*this.m_a2;this.m_K.ex.set(k11,k12,k13);this.m_K.ey.set(k12,k22,k23);this.m_K.ez.set(k13,k23,k33)}if(this.m_enableLimit){var jointTranslation=Vec2.dot(this.m_axis,d2);if(math_abs$3(this.m_upperTranslation-this.m_lowerTranslation)<2*SettingsInternal.linearSlop){this.m_limitState=LimitState$1.equalLimits}else if(jointTranslation<=this.m_lowerTranslation){if(this.m_limitState!=LimitState$1.atLowerLimit){this.m_limitState=LimitState$1.atLowerLimit;this.m_impulse.z=0}}else if(jointTranslation>=this.m_upperTranslation){if(this.m_limitState!=LimitState$1.atUpperLimit){this.m_limitState=LimitState$1.atUpperLimit;this.m_impulse.z=0}}else{this.m_limitState=LimitState$1.inactiveLimit;this.m_impulse.z=0}}else{this.m_limitState=LimitState$1.inactiveLimit;this.m_impulse.z=0}if(this.m_enableMotor==false){this.m_motorImpulse=0}if(step.warmStarting){this.m_impulse.mul(step.dtRatio);this.m_motorImpulse*=step.dtRatio;var P3=Vec2.combine(this.m_impulse.x,this.m_perp,this.m_motorImpulse+this.m_impulse.z,this.m_axis);var LA=this.m_impulse.x*this.m_s1+this.m_impulse.y+(this.m_motorImpulse+this.m_impulse.z)*this.m_a1;var LB=this.m_impulse.x*this.m_s2+this.m_impulse.y+(this.m_motorImpulse+this.m_impulse.z)*this.m_a2;vA2.subMul(mA,P3);wA-=iA*LA;vB2.addMul(mB,P3);wB+=iB*LB}else{this.m_impulse.setZero();this.m_motorImpulse=0}this.m_bodyA.c_velocity.v.setVec2(vA2);this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v.setVec2(vB2);this.m_bodyB.c_velocity.w=wB};PrismaticJoint2.prototype.solveVelocityConstraints=function(step){var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var mA=this.m_invMassA;var mB=this.m_invMassB;var iA=this.m_invIA;var iB=this.m_invIB;if(this.m_enableMotor&&this.m_limitState!=LimitState$1.equalLimits){var Cdot=Vec2.dot(this.m_axis,Vec2.sub(vB2,vA2))+this.m_a2*wB-this.m_a1*wA;var impulse=this.m_motorMass*(this.m_motorSpeed-Cdot);var oldImpulse=this.m_motorImpulse;var maxImpulse=step.dt*this.m_maxMotorForce;this.m_motorImpulse=clamp(this.m_motorImpulse+impulse,-maxImpulse,maxImpulse);impulse=this.m_motorImpulse-oldImpulse;var P3=Vec2.mulNumVec2(impulse,this.m_axis);var LA=impulse*this.m_a1;var LB=impulse*this.m_a2;vA2.subMul(mA,P3);wA-=iA*LA;vB2.addMul(mB,P3);wB+=iB*LB}var Cdot1=Vec2.zero();Cdot1.x+=Vec2.dot(this.m_perp,vB2)+this.m_s2*wB;Cdot1.x-=Vec2.dot(this.m_perp,vA2)+this.m_s1*wA;Cdot1.y=wB-wA;if(this.m_enableLimit&&this.m_limitState!=LimitState$1.inactiveLimit){var Cdot2=0;Cdot2+=Vec2.dot(this.m_axis,vB2)+this.m_a2*wB;Cdot2-=Vec2.dot(this.m_axis,vA2)+this.m_a1*wA;var Cdot=new Vec3(Cdot1.x,Cdot1.y,Cdot2);var f1=Vec3.clone(this.m_impulse);var df=this.m_K.solve33(Vec3.neg(Cdot));this.m_impulse.add(df);if(this.m_limitState==LimitState$1.atLowerLimit){this.m_impulse.z=math_max(this.m_impulse.z,0)}else if(this.m_limitState==LimitState$1.atUpperLimit){this.m_impulse.z=math_min$2(this.m_impulse.z,0)}var b2=Vec2.combine(-1,Cdot1,-(this.m_impulse.z-f1.z),Vec2.neo(this.m_K.ez.x,this.m_K.ez.y));var f2r=Vec2.add(this.m_K.solve22(b2),Vec2.neo(f1.x,f1.y));this.m_impulse.x=f2r.x;this.m_impulse.y=f2r.y;df=Vec3.sub(this.m_impulse,f1);var P3=Vec2.combine(df.x,this.m_perp,df.z,this.m_axis);var LA=df.x*this.m_s1+df.y+df.z*this.m_a1;var LB=df.x*this.m_s2+df.y+df.z*this.m_a2;vA2.subMul(mA,P3);wA-=iA*LA;vB2.addMul(mB,P3);wB+=iB*LB}else{var df=this.m_K.solve22(Vec2.neg(Cdot1));this.m_impulse.x+=df.x;this.m_impulse.y+=df.y;var P3=Vec2.mulNumVec2(df.x,this.m_perp);var LA=df.x*this.m_s1+df.y;var LB=df.x*this.m_s2+df.y;vA2.subMul(mA,P3);wA-=iA*LA;vB2.addMul(mB,P3);wB+=iB*LB}this.m_bodyA.c_velocity.v=vA2;this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v=vB2;this.m_bodyB.c_velocity.w=wB};PrismaticJoint2.prototype.solvePositionConstraints=function(step){var cA2=this.m_bodyA.c_position.c;var aA=this.m_bodyA.c_position.a;var cB2=this.m_bodyB.c_position.c;var aB=this.m_bodyB.c_position.a;var qA=Rot.neo(aA);var qB=Rot.neo(aB);var mA=this.m_invMassA;var mB=this.m_invMassB;var iA=this.m_invIA;var iB=this.m_invIB;var rA2=Rot.mulVec2(qA,Vec2.sub(this.m_localAnchorA,this.m_localCenterA));var rB2=Rot.mulVec2(qB,Vec2.sub(this.m_localAnchorB,this.m_localCenterB));var d2=Vec2.sub(Vec2.add(cB2,rB2),Vec2.add(cA2,rA2));var axis=Rot.mulVec2(qA,this.m_localXAxisA);var a1=Vec2.crossVec2Vec2(Vec2.add(d2,rA2),axis);var a2=Vec2.crossVec2Vec2(rB2,axis);var perp2=Rot.mulVec2(qA,this.m_localYAxisA);var s1=Vec2.crossVec2Vec2(Vec2.add(d2,rA2),perp2);var s2=Vec2.crossVec2Vec2(rB2,perp2);var impulse=new Vec3;var C1=Vec2.zero();C1.x=Vec2.dot(perp2,d2);C1.y=aB-aA-this.m_referenceAngle;var linearError=math_abs$3(C1.x);var angularError=math_abs$3(C1.y);var linearSlop=SettingsInternal.linearSlop;var maxLinearCorrection=SettingsInternal.maxLinearCorrection;var active=false;var C2=0;if(this.m_enableLimit){var translation2=Vec2.dot(axis,d2);if(math_abs$3(this.m_upperTranslation-this.m_lowerTranslation)<2*linearSlop){C2=clamp(translation2,-maxLinearCorrection,maxLinearCorrection);linearError=math_max(linearError,math_abs$3(translation2));active=true}else if(translation2<=this.m_lowerTranslation){C2=clamp(translation2-this.m_lowerTranslation+linearSlop,-maxLinearCorrection,0);linearError=Math.max(linearError,this.m_lowerTranslation-translation2);active=true}else if(translation2>=this.m_upperTranslation){C2=clamp(translation2-this.m_upperTranslation-linearSlop,0,maxLinearCorrection);linearError=Math.max(linearError,translation2-this.m_upperTranslation);active=true}}if(active){var k11=mA+mB+iA*s1*s1+iB*s2*s2;var k12=iA*s1+iB*s2;var k13=iA*s1*a1+iB*s2*a2;var k22=iA+iB;if(k22==0){k22=1}var k23=iA*a1+iB*a2;var k33=mA+mB+iA*a1*a1+iB*a2*a2;var K=new Mat33;K.ex.set(k11,k12,k13);K.ey.set(k12,k22,k23);K.ez.set(k13,k23,k33);var C=new Vec3;C.x=C1.x;C.y=C1.y;C.z=C2;impulse=K.solve33(Vec3.neg(C))}else{var k11=mA+mB+iA*s1*s1+iB*s2*s2;var k12=iA*s1+iB*s2;var k22=iA+iB;if(k22==0){k22=1}var K=new Mat22;K.ex.setNum(k11,k12);K.ey.setNum(k12,k22);var impulse1=K.solve(Vec2.neg(C1));impulse.x=impulse1.x;impulse.y=impulse1.y;impulse.z=0}var P3=Vec2.combine(impulse.x,perp2,impulse.z,axis);var LA=impulse.x*s1+impulse.y+impulse.z*a1;var LB=impulse.x*s2+impulse.y+impulse.z*a2;cA2.subMul(mA,P3);aA-=iA*LA;cB2.addMul(mB,P3);aB+=iB*LB;this.m_bodyA.c_position.c=cA2;this.m_bodyA.c_position.a=aA;this.m_bodyB.c_position.c=cB2;this.m_bodyB.c_position.a=aB;return linearError<=SettingsInternal.linearSlop&&angularError<=SettingsInternal.angularSlop};PrismaticJoint2.TYPE="prismatic-joint";return PrismaticJoint2}(Joint);var DEFAULTS$6={ratio:1};var GearJoint=function(_super){__extends(GearJoint2,_super);function GearJoint2(def,bodyA,bodyB,joint1,joint2,ratio){var _this=this;if(!(_this instanceof GearJoint2)){return new GearJoint2(def,bodyA,bodyB,joint1,joint2,ratio)}def=options(def,DEFAULTS$6);_this=_super.call(this,def,bodyA,bodyB)||this;bodyA=_this.m_bodyA;bodyB=_this.m_bodyB;_this.m_type=GearJoint2.TYPE;_this.m_joint1=joint1?joint1:def.joint1;_this.m_joint2=joint2?joint2:def.joint2;_this.m_ratio=Number.isFinite(ratio)?ratio:def.ratio;_this.m_type1=_this.m_joint1.getType();_this.m_type2=_this.m_joint2.getType();var coordinateA;var coordinateB;_this.m_bodyC=_this.m_joint1.getBodyA();_this.m_bodyA=_this.m_joint1.getBodyB();var xfA2=_this.m_bodyA.m_xf;var aA=_this.m_bodyA.m_sweep.a;var xfC=_this.m_bodyC.m_xf;var aC=_this.m_bodyC.m_sweep.a;if(_this.m_type1===RevoluteJoint.TYPE){var revolute=_this.m_joint1;_this.m_localAnchorC=revolute.m_localAnchorA;_this.m_localAnchorA=revolute.m_localAnchorB;_this.m_referenceAngleA=revolute.m_referenceAngle;_this.m_localAxisC=Vec2.zero();coordinateA=aA-aC-_this.m_referenceAngleA}else{var prismatic=_this.m_joint1;_this.m_localAnchorC=prismatic.m_localAnchorA;_this.m_localAnchorA=prismatic.m_localAnchorB;_this.m_referenceAngleA=prismatic.m_referenceAngle;_this.m_localAxisC=prismatic.m_localXAxisA;var pC=_this.m_localAnchorC;var pA2=Rot.mulTVec2(xfC.q,Vec2.add(Rot.mulVec2(xfA2.q,_this.m_localAnchorA),Vec2.sub(xfA2.p,xfC.p)));coordinateA=Vec2.dot(pA2,_this.m_localAxisC)-Vec2.dot(pC,_this.m_localAxisC)}_this.m_bodyD=_this.m_joint2.getBodyA();_this.m_bodyB=_this.m_joint2.getBodyB();var xfB2=_this.m_bodyB.m_xf;var aB=_this.m_bodyB.m_sweep.a;var xfD=_this.m_bodyD.m_xf;var aD=_this.m_bodyD.m_sweep.a;if(_this.m_type2===RevoluteJoint.TYPE){var revolute=_this.m_joint2;_this.m_localAnchorD=revolute.m_localAnchorA;_this.m_localAnchorB=revolute.m_localAnchorB;_this.m_referenceAngleB=revolute.m_referenceAngle;_this.m_localAxisD=Vec2.zero();coordinateB=aB-aD-_this.m_referenceAngleB}else{var prismatic=_this.m_joint2;_this.m_localAnchorD=prismatic.m_localAnchorA;_this.m_localAnchorB=prismatic.m_localAnchorB;_this.m_referenceAngleB=prismatic.m_referenceAngle;_this.m_localAxisD=prismatic.m_localXAxisA;var pD=_this.m_localAnchorD;var pB2=Rot.mulTVec2(xfD.q,Vec2.add(Rot.mulVec2(xfB2.q,_this.m_localAnchorB),Vec2.sub(xfB2.p,xfD.p)));coordinateB=Vec2.dot(pB2,_this.m_localAxisD)-Vec2.dot(pD,_this.m_localAxisD)}_this.m_constant=coordinateA+_this.m_ratio*coordinateB;_this.m_impulse=0;return _this}GearJoint2.prototype._serialize=function(){return{type:this.m_type,bodyA:this.m_bodyA,bodyB:this.m_bodyB,collideConnected:this.m_collideConnected,joint1:this.m_joint1,joint2:this.m_joint2,ratio:this.m_ratio}};GearJoint2._deserialize=function(data,world,restore){data=__assign({},data);data.bodyA=restore(Body,data.bodyA,world);data.bodyB=restore(Body,data.bodyB,world);data.joint1=restore(Joint,data.joint1,world);data.joint2=restore(Joint,data.joint2,world);var joint=new GearJoint2(data);return joint};GearJoint2.prototype._reset=function(def){if(Number.isFinite(def.ratio)){this.m_ratio=def.ratio}};GearJoint2.prototype.getJoint1=function(){return this.m_joint1};GearJoint2.prototype.getJoint2=function(){return this.m_joint2};GearJoint2.prototype.setRatio=function(ratio){this.m_ratio=ratio};GearJoint2.prototype.getRatio=function(){return this.m_ratio};GearJoint2.prototype.getAnchorA=function(){return this.m_bodyA.getWorldPoint(this.m_localAnchorA)};GearJoint2.prototype.getAnchorB=function(){return this.m_bodyB.getWorldPoint(this.m_localAnchorB)};GearJoint2.prototype.getReactionForce=function(inv_dt){return Vec2.mulNumVec2(this.m_impulse,this.m_JvAC).mul(inv_dt)};GearJoint2.prototype.getReactionTorque=function(inv_dt){var L=this.m_impulse*this.m_JwA;return inv_dt*L};GearJoint2.prototype.initVelocityConstraints=function(step){this.m_lcA=this.m_bodyA.m_sweep.localCenter;this.m_lcB=this.m_bodyB.m_sweep.localCenter;this.m_lcC=this.m_bodyC.m_sweep.localCenter;this.m_lcD=this.m_bodyD.m_sweep.localCenter;this.m_mA=this.m_bodyA.m_invMass;this.m_mB=this.m_bodyB.m_invMass;this.m_mC=this.m_bodyC.m_invMass;this.m_mD=this.m_bodyD.m_invMass;this.m_iA=this.m_bodyA.m_invI;this.m_iB=this.m_bodyB.m_invI;this.m_iC=this.m_bodyC.m_invI;this.m_iD=this.m_bodyD.m_invI;var aA=this.m_bodyA.c_position.a;var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var aB=this.m_bodyB.c_position.a;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var aC=this.m_bodyC.c_position.a;var vC=this.m_bodyC.c_velocity.v;var wC=this.m_bodyC.c_velocity.w;var aD=this.m_bodyD.c_position.a;var vD=this.m_bodyD.c_velocity.v;var wD=this.m_bodyD.c_velocity.w;var qA=Rot.neo(aA);var qB=Rot.neo(aB);var qC=Rot.neo(aC);var qD=Rot.neo(aD);this.m_mass=0;if(this.m_type1==RevoluteJoint.TYPE){this.m_JvAC=Vec2.zero();this.m_JwA=1;this.m_JwC=1;this.m_mass+=this.m_iA+this.m_iC}else{var u=Rot.mulVec2(qC,this.m_localAxisC);var rC=Rot.mulSub(qC,this.m_localAnchorC,this.m_lcC);var rA2=Rot.mulSub(qA,this.m_localAnchorA,this.m_lcA);this.m_JvAC=u;this.m_JwC=Vec2.crossVec2Vec2(rC,u);this.m_JwA=Vec2.crossVec2Vec2(rA2,u);this.m_mass+=this.m_mC+this.m_mA+this.m_iC*this.m_JwC*this.m_JwC+this.m_iA*this.m_JwA*this.m_JwA}if(this.m_type2==RevoluteJoint.TYPE){this.m_JvBD=Vec2.zero();this.m_JwB=this.m_ratio;this.m_JwD=this.m_ratio;this.m_mass+=this.m_ratio*this.m_ratio*(this.m_iB+this.m_iD)}else{var u=Rot.mulVec2(qD,this.m_localAxisD);var rD=Rot.mulSub(qD,this.m_localAnchorD,this.m_lcD);var rB2=Rot.mulSub(qB,this.m_localAnchorB,this.m_lcB);this.m_JvBD=Vec2.mulNumVec2(this.m_ratio,u);this.m_JwD=this.m_ratio*Vec2.crossVec2Vec2(rD,u);this.m_JwB=this.m_ratio*Vec2.crossVec2Vec2(rB2,u);this.m_mass+=this.m_ratio*this.m_ratio*(this.m_mD+this.m_mB)+this.m_iD*this.m_JwD*this.m_JwD+this.m_iB*this.m_JwB*this.m_JwB}this.m_mass=this.m_mass>0?1/this.m_mass:0;if(step.warmStarting){vA2.addMul(this.m_mA*this.m_impulse,this.m_JvAC);wA+=this.m_iA*this.m_impulse*this.m_JwA;vB2.addMul(this.m_mB*this.m_impulse,this.m_JvBD);wB+=this.m_iB*this.m_impulse*this.m_JwB;vC.subMul(this.m_mC*this.m_impulse,this.m_JvAC);wC-=this.m_iC*this.m_impulse*this.m_JwC;vD.subMul(this.m_mD*this.m_impulse,this.m_JvBD);wD-=this.m_iD*this.m_impulse*this.m_JwD}else{this.m_impulse=0}this.m_bodyA.c_velocity.v.setVec2(vA2);this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v.setVec2(vB2);this.m_bodyB.c_velocity.w=wB;this.m_bodyC.c_velocity.v.setVec2(vC);this.m_bodyC.c_velocity.w=wC;this.m_bodyD.c_velocity.v.setVec2(vD);this.m_bodyD.c_velocity.w=wD};GearJoint2.prototype.solveVelocityConstraints=function(step){var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var vC=this.m_bodyC.c_velocity.v;var wC=this.m_bodyC.c_velocity.w;var vD=this.m_bodyD.c_velocity.v;var wD=this.m_bodyD.c_velocity.w;var Cdot=Vec2.dot(this.m_JvAC,vA2)-Vec2.dot(this.m_JvAC,vC)+Vec2.dot(this.m_JvBD,vB2)-Vec2.dot(this.m_JvBD,vD);Cdot+=this.m_JwA*wA-this.m_JwC*wC+(this.m_JwB*wB-this.m_JwD*wD);var impulse=-this.m_mass*Cdot;this.m_impulse+=impulse;vA2.addMul(this.m_mA*impulse,this.m_JvAC);wA+=this.m_iA*impulse*this.m_JwA;vB2.addMul(this.m_mB*impulse,this.m_JvBD);wB+=this.m_iB*impulse*this.m_JwB;vC.subMul(this.m_mC*impulse,this.m_JvAC);wC-=this.m_iC*impulse*this.m_JwC;vD.subMul(this.m_mD*impulse,this.m_JvBD);wD-=this.m_iD*impulse*this.m_JwD;this.m_bodyA.c_velocity.v.setVec2(vA2);this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v.setVec2(vB2);this.m_bodyB.c_velocity.w=wB;this.m_bodyC.c_velocity.v.setVec2(vC);this.m_bodyC.c_velocity.w=wC;this.m_bodyD.c_velocity.v.setVec2(vD);this.m_bodyD.c_velocity.w=wD};GearJoint2.prototype.solvePositionConstraints=function(step){var cA2=this.m_bodyA.c_position.c;var aA=this.m_bodyA.c_position.a;var cB2=this.m_bodyB.c_position.c;var aB=this.m_bodyB.c_position.a;var cC=this.m_bodyC.c_position.c;var aC=this.m_bodyC.c_position.a;var cD=this.m_bodyD.c_position.c;var aD=this.m_bodyD.c_position.a;var qA=Rot.neo(aA);var qB=Rot.neo(aB);var qC=Rot.neo(aC);var qD=Rot.neo(aD);var linearError=0;var coordinateA;var coordinateB;var JvAC;var JvBD;var JwA;var JwB;var JwC;var JwD;var mass=0;if(this.m_type1==RevoluteJoint.TYPE){JvAC=Vec2.zero();JwA=1;JwC=1;mass+=this.m_iA+this.m_iC;coordinateA=aA-aC-this.m_referenceAngleA}else{var u=Rot.mulVec2(qC,this.m_localAxisC);var rC=Rot.mulSub(qC,this.m_localAnchorC,this.m_lcC);var rA2=Rot.mulSub(qA,this.m_localAnchorA,this.m_lcA);JvAC=u;JwC=Vec2.crossVec2Vec2(rC,u);JwA=Vec2.crossVec2Vec2(rA2,u);mass+=this.m_mC+this.m_mA+this.m_iC*JwC*JwC+this.m_iA*JwA*JwA;var pC=Vec2.sub(this.m_localAnchorC,this.m_lcC);var pA2=Rot.mulTVec2(qC,Vec2.add(rA2,Vec2.sub(cA2,cC)));coordinateA=Vec2.dot(Vec2.sub(pA2,pC),this.m_localAxisC)}if(this.m_type2==RevoluteJoint.TYPE){JvBD=Vec2.zero();JwB=this.m_ratio;JwD=this.m_ratio;mass+=this.m_ratio*this.m_ratio*(this.m_iB+this.m_iD);coordinateB=aB-aD-this.m_referenceAngleB}else{var u=Rot.mulVec2(qD,this.m_localAxisD);var rD=Rot.mulSub(qD,this.m_localAnchorD,this.m_lcD);var rB2=Rot.mulSub(qB,this.m_localAnchorB,this.m_lcB);JvBD=Vec2.mulNumVec2(this.m_ratio,u);JwD=this.m_ratio*Vec2.crossVec2Vec2(rD,u);JwB=this.m_ratio*Vec2.crossVec2Vec2(rB2,u);mass+=this.m_ratio*this.m_ratio*(this.m_mD+this.m_mB)+this.m_iD*JwD*JwD+this.m_iB*JwB*JwB;var pD=Vec2.sub(this.m_localAnchorD,this.m_lcD);var pB2=Rot.mulTVec2(qD,Vec2.add(rB2,Vec2.sub(cB2,cD)));coordinateB=Vec2.dot(pB2,this.m_localAxisD)-Vec2.dot(pD,this.m_localAxisD)}var C=coordinateA+this.m_ratio*coordinateB-this.m_constant;var impulse=0;if(mass>0){impulse=-C/mass}cA2.addMul(this.m_mA*impulse,JvAC);aA+=this.m_iA*impulse*JwA;cB2.addMul(this.m_mB*impulse,JvBD);aB+=this.m_iB*impulse*JwB;cC.subMul(this.m_mC*impulse,JvAC);aC-=this.m_iC*impulse*JwC;cD.subMul(this.m_mD*impulse,JvBD);aD-=this.m_iD*impulse*JwD;this.m_bodyA.c_position.c.setVec2(cA2);this.m_bodyA.c_position.a=aA;this.m_bodyB.c_position.c.setVec2(cB2);this.m_bodyB.c_position.a=aB;this.m_bodyC.c_position.c.setVec2(cC);this.m_bodyC.c_position.a=aC;this.m_bodyD.c_position.c.setVec2(cD);this.m_bodyD.c_position.a=aD;return linearError<SettingsInternal.linearSlop};GearJoint2.TYPE="gear-joint";return GearJoint2}(Joint);var DEFAULTS$5={maxForce:1,maxTorque:1,correctionFactor:.3};var MotorJoint=function(_super){__extends(MotorJoint2,_super);function MotorJoint2(def,bodyA,bodyB){var _this=this;if(!(_this instanceof MotorJoint2)){return new MotorJoint2(def,bodyA,bodyB)}def=options(def,DEFAULTS$5);_this=_super.call(this,def,bodyA,bodyB)||this;bodyA=_this.m_bodyA;bodyB=_this.m_bodyB;_this.m_type=MotorJoint2.TYPE;_this.m_linearOffset=Vec2.isValid(def.linearOffset)?Vec2.clone(def.linearOffset):bodyA.getLocalPoint(bodyB.getPosition());_this.m_angularOffset=Number.isFinite(def.angularOffset)?def.angularOffset:bodyB.getAngle()-bodyA.getAngle();_this.m_linearImpulse=Vec2.zero();_this.m_angularImpulse=0;_this.m_maxForce=def.maxForce;_this.m_maxTorque=def.maxTorque;_this.m_correctionFactor=def.correctionFactor;return _this}MotorJoint2.prototype._serialize=function(){return{type:this.m_type,bodyA:this.m_bodyA,bodyB:this.m_bodyB,collideConnected:this.m_collideConnected,maxForce:this.m_maxForce,maxTorque:this.m_maxTorque,correctionFactor:this.m_correctionFactor,linearOffset:this.m_linearOffset,angularOffset:this.m_angularOffset}};MotorJoint2._deserialize=function(data,world,restore){data=__assign({},data);data.bodyA=restore(Body,data.bodyA,world);data.bodyB=restore(Body,data.bodyB,world);var joint=new MotorJoint2(data);return joint};MotorJoint2.prototype._reset=function(def){if(Number.isFinite(def.angularOffset)){this.m_angularOffset=def.angularOffset}if(Number.isFinite(def.maxForce)){this.m_maxForce=def.maxForce}if(Number.isFinite(def.maxTorque)){this.m_maxTorque=def.maxTorque}if(Number.isFinite(def.correctionFactor)){this.m_correctionFactor=def.correctionFactor}if(Vec2.isValid(def.linearOffset)){this.m_linearOffset.set(def.linearOffset)}};MotorJoint2.prototype.setMaxForce=function(force){this.m_maxForce=force};MotorJoint2.prototype.getMaxForce=function(){return this.m_maxForce};MotorJoint2.prototype.setMaxTorque=function(torque){this.m_maxTorque=torque};MotorJoint2.prototype.getMaxTorque=function(){return this.m_maxTorque};MotorJoint2.prototype.setCorrectionFactor=function(factor){this.m_correctionFactor=factor};MotorJoint2.prototype.getCorrectionFactor=function(){return this.m_correctionFactor};MotorJoint2.prototype.setLinearOffset=function(linearOffset){if(linearOffset.x!=this.m_linearOffset.x||linearOffset.y!=this.m_linearOffset.y){this.m_bodyA.setAwake(true);this.m_bodyB.setAwake(true);this.m_linearOffset.set(linearOffset)}};MotorJoint2.prototype.getLinearOffset=function(){return this.m_linearOffset};MotorJoint2.prototype.setAngularOffset=function(angularOffset){if(angularOffset!=this.m_angularOffset){this.m_bodyA.setAwake(true);this.m_bodyB.setAwake(true);this.m_angularOffset=angularOffset}};MotorJoint2.prototype.getAngularOffset=function(){return this.m_angularOffset};MotorJoint2.prototype.getAnchorA=function(){return this.m_bodyA.getPosition()};MotorJoint2.prototype.getAnchorB=function(){return this.m_bodyB.getPosition()};MotorJoint2.prototype.getReactionForce=function(inv_dt){return Vec2.mulNumVec2(inv_dt,this.m_linearImpulse)};MotorJoint2.prototype.getReactionTorque=function(inv_dt){return inv_dt*this.m_angularImpulse};MotorJoint2.prototype.initVelocityConstraints=function(step){this.m_localCenterA=this.m_bodyA.m_sweep.localCenter;this.m_localCenterB=this.m_bodyB.m_sweep.localCenter;this.m_invMassA=this.m_bodyA.m_invMass;this.m_invMassB=this.m_bodyB.m_invMass;this.m_invIA=this.m_bodyA.m_invI;this.m_invIB=this.m_bodyB.m_invI;var cA2=this.m_bodyA.c_position.c;var aA=this.m_bodyA.c_position.a;var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var cB2=this.m_bodyB.c_position.c;var aB=this.m_bodyB.c_position.a;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var qA=Rot.neo(aA);var qB=Rot.neo(aB);this.m_rA=Rot.mulVec2(qA,Vec2.sub(this.m_linearOffset,this.m_localCenterA));this.m_rB=Rot.mulVec2(qB,Vec2.neg(this.m_localCenterB));var mA=this.m_invMassA;var mB=this.m_invMassB;var iA=this.m_invIA;var iB=this.m_invIB;var K=new Mat22;K.ex.x=mA+mB+iA*this.m_rA.y*this.m_rA.y+iB*this.m_rB.y*this.m_rB.y;K.ex.y=-iA*this.m_rA.x*this.m_rA.y-iB*this.m_rB.x*this.m_rB.y;K.ey.x=K.ex.y;K.ey.y=mA+mB+iA*this.m_rA.x*this.m_rA.x+iB*this.m_rB.x*this.m_rB.x;this.m_linearMass=K.getInverse();this.m_angularMass=iA+iB;if(this.m_angularMass>0){this.m_angularMass=1/this.m_angularMass}this.m_linearError=Vec2.zero();this.m_linearError.addCombine(1,cB2,1,this.m_rB);this.m_linearError.subCombine(1,cA2,1,this.m_rA);this.m_angularError=aB-aA-this.m_angularOffset;if(step.warmStarting){this.m_linearImpulse.mul(step.dtRatio);this.m_angularImpulse*=step.dtRatio;var P3=Vec2.neo(this.m_linearImpulse.x,this.m_linearImpulse.y);vA2.subMul(mA,P3);wA-=iA*(Vec2.crossVec2Vec2(this.m_rA,P3)+this.m_angularImpulse);vB2.addMul(mB,P3);wB+=iB*(Vec2.crossVec2Vec2(this.m_rB,P3)+this.m_angularImpulse)}else{this.m_linearImpulse.setZero();this.m_angularImpulse=0}this.m_bodyA.c_velocity.v=vA2;this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v=vB2;this.m_bodyB.c_velocity.w=wB};MotorJoint2.prototype.solveVelocityConstraints=function(step){var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var mA=this.m_invMassA;var mB=this.m_invMassB;var iA=this.m_invIA;var iB=this.m_invIB;var h=step.dt;var inv_h=step.inv_dt;{var Cdot=wB-wA+inv_h*this.m_correctionFactor*this.m_angularError;var impulse=-this.m_angularMass*Cdot;var oldImpulse=this.m_angularImpulse;var maxImpulse=h*this.m_maxTorque;this.m_angularImpulse=clamp(this.m_angularImpulse+impulse,-maxImpulse,maxImpulse);impulse=this.m_angularImpulse-oldImpulse;wA-=iA*impulse;wB+=iB*impulse}{var Cdot=Vec2.zero();Cdot.addCombine(1,vB2,1,Vec2.crossNumVec2(wB,this.m_rB));Cdot.subCombine(1,vA2,1,Vec2.crossNumVec2(wA,this.m_rA));Cdot.addMul(inv_h*this.m_correctionFactor,this.m_linearError);var impulse=Vec2.neg(Mat22.mulVec2(this.m_linearMass,Cdot));var oldImpulse=Vec2.clone(this.m_linearImpulse);this.m_linearImpulse.add(impulse);var maxImpulse=h*this.m_maxForce;this.m_linearImpulse.clamp(maxImpulse);impulse=Vec2.sub(this.m_linearImpulse,oldImpulse);vA2.subMul(mA,impulse);wA-=iA*Vec2.crossVec2Vec2(this.m_rA,impulse);vB2.addMul(mB,impulse);wB+=iB*Vec2.crossVec2Vec2(this.m_rB,impulse)}this.m_bodyA.c_velocity.v=vA2;this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v=vB2;this.m_bodyB.c_velocity.w=wB};MotorJoint2.prototype.solvePositionConstraints=function(step){return true};MotorJoint2.TYPE="motor-joint";return MotorJoint2}(Joint);var math_PI$2=Math.PI;var DEFAULTS$4={maxForce:0,frequencyHz:5,dampingRatio:.7};var MouseJoint=function(_super){__extends(MouseJoint2,_super);function MouseJoint2(def,bodyA,bodyB,target){var _this=this;if(!(_this instanceof MouseJoint2)){return new MouseJoint2(def,bodyA,bodyB,target)}def=options(def,DEFAULTS$4);_this=_super.call(this,def,bodyA,bodyB)||this;bodyA=_this.m_bodyA;bodyB=_this.m_bodyB;_this.m_type=MouseJoint2.TYPE;if(Vec2.isValid(target)){_this.m_targetA=Vec2.clone(target)}else if(Vec2.isValid(def.target)){_this.m_targetA=Vec2.clone(def.target)}else{_this.m_targetA=Vec2.zero()}_this.m_localAnchorB=Transform.mulTVec2(bodyB.getTransform(),_this.m_targetA);_this.m_maxForce=def.maxForce;_this.m_impulse=Vec2.zero();_this.m_frequencyHz=def.frequencyHz;_this.m_dampingRatio=def.dampingRatio;_this.m_beta=0;_this.m_gamma=0;_this.m_rB=Vec2.zero();_this.m_localCenterB=Vec2.zero();_this.m_invMassB=0;_this.m_invIB=0;_this.m_mass=new Mat22;_this.m_C=Vec2.zero();return _this}MouseJoint2.prototype._serialize=function(){return{type:this.m_type,bodyA:this.m_bodyA,bodyB:this.m_bodyB,collideConnected:this.m_collideConnected,target:this.m_targetA,maxForce:this.m_maxForce,frequencyHz:this.m_frequencyHz,dampingRatio:this.m_dampingRatio,_localAnchorB:this.m_localAnchorB}};MouseJoint2._deserialize=function(data,world,restore){data=__assign({},data);data.bodyA=restore(Body,data.bodyA,world);data.bodyB=restore(Body,data.bodyB,world);data.target=Vec2.clone(data.target);var joint=new MouseJoint2(data);if(data._localAnchorB){joint.m_localAnchorB=data._localAnchorB}return joint};MouseJoint2.prototype._reset=function(def){if(Number.isFinite(def.maxForce)){this.m_maxForce=def.maxForce}if(Number.isFinite(def.frequencyHz)){this.m_frequencyHz=def.frequencyHz}if(Number.isFinite(def.dampingRatio)){this.m_dampingRatio=def.dampingRatio}};MouseJoint2.prototype.setTarget=function(target){if(Vec2.areEqual(target,this.m_targetA))return;this.m_bodyB.setAwake(true);this.m_targetA.set(target)};MouseJoint2.prototype.getTarget=function(){return this.m_targetA};MouseJoint2.prototype.setMaxForce=function(force){this.m_maxForce=force};MouseJoint2.prototype.getMaxForce=function(){return this.m_maxForce};MouseJoint2.prototype.setFrequency=function(hz){this.m_frequencyHz=hz};MouseJoint2.prototype.getFrequency=function(){return this.m_frequencyHz};MouseJoint2.prototype.setDampingRatio=function(ratio){this.m_dampingRatio=ratio};MouseJoint2.prototype.getDampingRatio=function(){return this.m_dampingRatio};MouseJoint2.prototype.getAnchorA=function(){return Vec2.clone(this.m_targetA)};MouseJoint2.prototype.getAnchorB=function(){return this.m_bodyB.getWorldPoint(this.m_localAnchorB)};MouseJoint2.prototype.getReactionForce=function(inv_dt){return Vec2.mulNumVec2(inv_dt,this.m_impulse)};MouseJoint2.prototype.getReactionTorque=function(inv_dt){return inv_dt*0};MouseJoint2.prototype.shiftOrigin=function(newOrigin){this.m_targetA.sub(newOrigin)};MouseJoint2.prototype.initVelocityConstraints=function(step){this.m_localCenterB=this.m_bodyB.m_sweep.localCenter;this.m_invMassB=this.m_bodyB.m_invMass;this.m_invIB=this.m_bodyB.m_invI;var position=this.m_bodyB.c_position;var velocity=this.m_bodyB.c_velocity;var cB2=position.c;var aB=position.a;var vB2=velocity.v;var wB=velocity.w;var qB=Rot.neo(aB);var mass=this.m_bodyB.getMass();var omega=2*math_PI$2*this.m_frequencyHz;var d2=2*mass*this.m_dampingRatio*omega;var k=mass*(omega*omega);var h=step.dt;this.m_gamma=h*(d2+h*k);if(this.m_gamma!=0){this.m_gamma=1/this.m_gamma}this.m_beta=h*k*this.m_gamma;this.m_rB=Rot.mulVec2(qB,Vec2.sub(this.m_localAnchorB,this.m_localCenterB));var K=new Mat22;K.ex.x=this.m_invMassB+this.m_invIB*this.m_rB.y*this.m_rB.y+this.m_gamma;K.ex.y=-this.m_invIB*this.m_rB.x*this.m_rB.y;K.ey.x=K.ex.y;K.ey.y=this.m_invMassB+this.m_invIB*this.m_rB.x*this.m_rB.x+this.m_gamma;this.m_mass=K.getInverse();this.m_C.setVec2(cB2);this.m_C.addCombine(1,this.m_rB,-1,this.m_targetA);this.m_C.mul(this.m_beta);wB*=.98;if(step.warmStarting){this.m_impulse.mul(step.dtRatio);vB2.addMul(this.m_invMassB,this.m_impulse);wB+=this.m_invIB*Vec2.crossVec2Vec2(this.m_rB,this.m_impulse)}else{this.m_impulse.setZero()}velocity.v.setVec2(vB2);velocity.w=wB};MouseJoint2.prototype.solveVelocityConstraints=function(step){var velocity=this.m_bodyB.c_velocity;var vB2=Vec2.clone(velocity.v);var wB=velocity.w;var Cdot=Vec2.crossNumVec2(wB,this.m_rB);Cdot.add(vB2);Cdot.addCombine(1,this.m_C,this.m_gamma,this.m_impulse);Cdot.neg();var impulse=Mat22.mulVec2(this.m_mass,Cdot);var oldImpulse=Vec2.clone(this.m_impulse);this.m_impulse.add(impulse);var maxImpulse=step.dt*this.m_maxForce;this.m_impulse.clamp(maxImpulse);impulse=Vec2.sub(this.m_impulse,oldImpulse);vB2.addMul(this.m_invMassB,impulse);wB+=this.m_invIB*Vec2.crossVec2Vec2(this.m_rB,impulse);velocity.v.setVec2(vB2);velocity.w=wB};MouseJoint2.prototype.solvePositionConstraints=function(step){return true};MouseJoint2.TYPE="mouse-joint";return MouseJoint2}(Joint);var math_abs$2=Math.abs;var DEFAULTS$3={collideConnected:true};var PulleyJoint=function(_super){__extends(PulleyJoint2,_super);function PulleyJoint2(def,bodyA,bodyB,groundA,groundB,anchorA,anchorB,ratio){var _this=this;if(!(_this instanceof PulleyJoint2)){return new PulleyJoint2(def,bodyA,bodyB,groundA,groundB,anchorA,anchorB,ratio)}def=options(def,DEFAULTS$3);_this=_super.call(this,def,bodyA,bodyB)||this;bodyA=_this.m_bodyA;bodyB=_this.m_bodyB;_this.m_type=PulleyJoint2.TYPE;_this.m_groundAnchorA=Vec2.clone(groundA?groundA:def.groundAnchorA||Vec2.neo(-1,1));_this.m_groundAnchorB=Vec2.clone(groundB?groundB:def.groundAnchorB||Vec2.neo(1,1));_this.m_localAnchorA=Vec2.clone(anchorA?bodyA.getLocalPoint(anchorA):def.localAnchorA||Vec2.neo(-1,0));_this.m_localAnchorB=Vec2.clone(anchorB?bodyB.getLocalPoint(anchorB):def.localAnchorB||Vec2.neo(1,0));_this.m_lengthA=Number.isFinite(def.lengthA)?def.lengthA:Vec2.distance(anchorA,groundA);_this.m_lengthB=Number.isFinite(def.lengthB)?def.lengthB:Vec2.distance(anchorB,groundB);_this.m_ratio=Number.isFinite(ratio)?ratio:def.ratio;_this.m_constant=_this.m_lengthA+_this.m_ratio*_this.m_lengthB;_this.m_impulse=0;return _this}PulleyJoint2.prototype._serialize=function(){return{type:this.m_type,bodyA:this.m_bodyA,bodyB:this.m_bodyB,collideConnected:this.m_collideConnected,groundAnchorA:this.m_groundAnchorA,groundAnchorB:this.m_groundAnchorB,localAnchorA:this.m_localAnchorA,localAnchorB:this.m_localAnchorB,lengthA:this.m_lengthA,lengthB:this.m_lengthB,ratio:this.m_ratio}};PulleyJoint2._deserialize=function(data,world,restore){data=__assign({},data);data.bodyA=restore(Body,data.bodyA,world);data.bodyB=restore(Body,data.bodyB,world);var joint=new PulleyJoint2(data);return joint};PulleyJoint2.prototype._reset=function(def){if(Vec2.isValid(def.groundAnchorA)){this.m_groundAnchorA.set(def.groundAnchorA)}if(Vec2.isValid(def.groundAnchorB)){this.m_groundAnchorB.set(def.groundAnchorB)}if(Vec2.isValid(def.localAnchorA)){this.m_localAnchorA.set(def.localAnchorA)}else if(Vec2.isValid(def.anchorA)){this.m_localAnchorA.set(this.m_bodyA.getLocalPoint(def.anchorA))}if(Vec2.isValid(def.localAnchorB)){this.m_localAnchorB.set(def.localAnchorB)}else if(Vec2.isValid(def.anchorB)){this.m_localAnchorB.set(this.m_bodyB.getLocalPoint(def.anchorB))}if(Number.isFinite(def.lengthA)){this.m_lengthA=def.lengthA}if(Number.isFinite(def.lengthB)){this.m_lengthB=def.lengthB}if(Number.isFinite(def.ratio)){this.m_ratio=def.ratio}};PulleyJoint2.prototype.getGroundAnchorA=function(){return this.m_groundAnchorA};PulleyJoint2.prototype.getGroundAnchorB=function(){return this.m_groundAnchorB};PulleyJoint2.prototype.getLengthA=function(){return this.m_lengthA};PulleyJoint2.prototype.getLengthB=function(){return this.m_lengthB};PulleyJoint2.prototype.getRatio=function(){return this.m_ratio};PulleyJoint2.prototype.getCurrentLengthA=function(){var p=this.m_bodyA.getWorldPoint(this.m_localAnchorA);var s2=this.m_groundAnchorA;return Vec2.distance(p,s2)};PulleyJoint2.prototype.getCurrentLengthB=function(){var p=this.m_bodyB.getWorldPoint(this.m_localAnchorB);var s2=this.m_groundAnchorB;return Vec2.distance(p,s2)};PulleyJoint2.prototype.shiftOrigin=function(newOrigin){this.m_groundAnchorA.sub(newOrigin);this.m_groundAnchorB.sub(newOrigin)};PulleyJoint2.prototype.getAnchorA=function(){return this.m_bodyA.getWorldPoint(this.m_localAnchorA)};PulleyJoint2.prototype.getAnchorB=function(){return this.m_bodyB.getWorldPoint(this.m_localAnchorB)};PulleyJoint2.prototype.getReactionForce=function(inv_dt){return Vec2.mulNumVec2(this.m_impulse,this.m_uB).mul(inv_dt)};PulleyJoint2.prototype.getReactionTorque=function(inv_dt){return 0};PulleyJoint2.prototype.initVelocityConstraints=function(step){this.m_localCenterA=this.m_bodyA.m_sweep.localCenter;this.m_localCenterB=this.m_bodyB.m_sweep.localCenter;this.m_invMassA=this.m_bodyA.m_invMass;this.m_invMassB=this.m_bodyB.m_invMass;this.m_invIA=this.m_bodyA.m_invI;this.m_invIB=this.m_bodyB.m_invI;var cA2=this.m_bodyA.c_position.c;var aA=this.m_bodyA.c_position.a;var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var cB2=this.m_bodyB.c_position.c;var aB=this.m_bodyB.c_position.a;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var qA=Rot.neo(aA);var qB=Rot.neo(aB);this.m_rA=Rot.mulVec2(qA,Vec2.sub(this.m_localAnchorA,this.m_localCenterA));this.m_rB=Rot.mulVec2(qB,Vec2.sub(this.m_localAnchorB,this.m_localCenterB));this.m_uA=Vec2.sub(Vec2.add(cA2,this.m_rA),this.m_groundAnchorA);this.m_uB=Vec2.sub(Vec2.add(cB2,this.m_rB),this.m_groundAnchorB);var lengthA=this.m_uA.length();var lengthB=this.m_uB.length();if(lengthA>10*SettingsInternal.linearSlop){this.m_uA.mul(1/lengthA)}else{this.m_uA.setZero()}if(lengthB>10*SettingsInternal.linearSlop){this.m_uB.mul(1/lengthB)}else{this.m_uB.setZero()}var ruA=Vec2.crossVec2Vec2(this.m_rA,this.m_uA);var ruB=Vec2.crossVec2Vec2(this.m_rB,this.m_uB);var mA=this.m_invMassA+this.m_invIA*ruA*ruA;var mB=this.m_invMassB+this.m_invIB*ruB*ruB;this.m_mass=mA+this.m_ratio*this.m_ratio*mB;if(this.m_mass>0){this.m_mass=1/this.m_mass}if(step.warmStarting){this.m_impulse*=step.dtRatio;var PA=Vec2.mulNumVec2(-this.m_impulse,this.m_uA);var PB=Vec2.mulNumVec2(-this.m_ratio*this.m_impulse,this.m_uB);vA2.addMul(this.m_invMassA,PA);wA+=this.m_invIA*Vec2.crossVec2Vec2(this.m_rA,PA);vB2.addMul(this.m_invMassB,PB);wB+=this.m_invIB*Vec2.crossVec2Vec2(this.m_rB,PB)}else{this.m_impulse=0}this.m_bodyA.c_velocity.v=vA2;this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v=vB2;this.m_bodyB.c_velocity.w=wB};PulleyJoint2.prototype.solveVelocityConstraints=function(step){var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var vpA=Vec2.add(vA2,Vec2.crossNumVec2(wA,this.m_rA));var vpB=Vec2.add(vB2,Vec2.crossNumVec2(wB,this.m_rB));var Cdot=-Vec2.dot(this.m_uA,vpA)-this.m_ratio*Vec2.dot(this.m_uB,vpB);var impulse=-this.m_mass*Cdot;this.m_impulse+=impulse;var PA=Vec2.mulNumVec2(-impulse,this.m_uA);var PB=Vec2.mulNumVec2(-this.m_ratio*impulse,this.m_uB);vA2.addMul(this.m_invMassA,PA);wA+=this.m_invIA*Vec2.crossVec2Vec2(this.m_rA,PA);vB2.addMul(this.m_invMassB,PB);wB+=this.m_invIB*Vec2.crossVec2Vec2(this.m_rB,PB);this.m_bodyA.c_velocity.v=vA2;this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v=vB2;this.m_bodyB.c_velocity.w=wB};PulleyJoint2.prototype.solvePositionConstraints=function(step){var cA2=this.m_bodyA.c_position.c;var aA=this.m_bodyA.c_position.a;var cB2=this.m_bodyB.c_position.c;var aB=this.m_bodyB.c_position.a;var qA=Rot.neo(aA);var qB=Rot.neo(aB);var rA2=Rot.mulVec2(qA,Vec2.sub(this.m_localAnchorA,this.m_localCenterA));var rB2=Rot.mulVec2(qB,Vec2.sub(this.m_localAnchorB,this.m_localCenterB));var uA=Vec2.sub(Vec2.add(cA2,this.m_rA),this.m_groundAnchorA);var uB=Vec2.sub(Vec2.add(cB2,this.m_rB),this.m_groundAnchorB);var lengthA=uA.length();var lengthB=uB.length();if(lengthA>10*SettingsInternal.linearSlop){uA.mul(1/lengthA)}else{uA.setZero()}if(lengthB>10*SettingsInternal.linearSlop){uB.mul(1/lengthB)}else{uB.setZero()}var ruA=Vec2.crossVec2Vec2(rA2,uA);var ruB=Vec2.crossVec2Vec2(rB2,uB);var mA=this.m_invMassA+this.m_invIA*ruA*ruA;var mB=this.m_invMassB+this.m_invIB*ruB*ruB;var mass=mA+this.m_ratio*this.m_ratio*mB;if(mass>0){mass=1/mass}var C=this.m_constant-lengthA-this.m_ratio*lengthB;var linearError=math_abs$2(C);var impulse=-mass*C;var PA=Vec2.mulNumVec2(-impulse,uA);var PB=Vec2.mulNumVec2(-this.m_ratio*impulse,uB);cA2.addMul(this.m_invMassA,PA);aA+=this.m_invIA*Vec2.crossVec2Vec2(rA2,PA);cB2.addMul(this.m_invMassB,PB);aB+=this.m_invIB*Vec2.crossVec2Vec2(rB2,PB);this.m_bodyA.c_position.c=cA2;this.m_bodyA.c_position.a=aA;this.m_bodyB.c_position.c=cB2;this.m_bodyB.c_position.a=aB;return linearError<SettingsInternal.linearSlop};PulleyJoint2.TYPE="pulley-joint";return PulleyJoint2}(Joint);var math_min$1=Math.min;var LimitState;(function(LimitState2){LimitState2[LimitState2["inactiveLimit"]=0]="inactiveLimit";LimitState2[LimitState2["atLowerLimit"]=1]="atLowerLimit";LimitState2[LimitState2["atUpperLimit"]=2]="atUpperLimit";LimitState2[LimitState2["equalLimits"]=3]="equalLimits"})(LimitState||(LimitState={}));var DEFAULTS$2={maxLength:0};var RopeJoint=function(_super){__extends(RopeJoint2,_super);function RopeJoint2(def,bodyA,bodyB,anchor){var _this=this;if(!(_this instanceof RopeJoint2)){return new RopeJoint2(def,bodyA,bodyB,anchor)}def=options(def,DEFAULTS$2);_this=_super.call(this,def,bodyA,bodyB)||this;bodyA=_this.m_bodyA;bodyB=_this.m_bodyB;_this.m_type=RopeJoint2.TYPE;_this.m_localAnchorA=Vec2.clone(anchor?bodyA.getLocalPoint(anchor):def.localAnchorA||Vec2.neo(-1,0));_this.m_localAnchorB=Vec2.clone(anchor?bodyB.getLocalPoint(anchor):def.localAnchorB||Vec2.neo(1,0));_this.m_maxLength=def.maxLength;_this.m_mass=0;_this.m_impulse=0;_this.m_length=0;_this.m_state=LimitState.inactiveLimit;return _this}RopeJoint2.prototype._serialize=function(){return{type:this.m_type,bodyA:this.m_bodyA,bodyB:this.m_bodyB,collideConnected:this.m_collideConnected,localAnchorA:this.m_localAnchorA,localAnchorB:this.m_localAnchorB,maxLength:this.m_maxLength}};RopeJoint2._deserialize=function(data,world,restore){data=__assign({},data);data.bodyA=restore(Body,data.bodyA,world);data.bodyB=restore(Body,data.bodyB,world);var joint=new RopeJoint2(data);return joint};RopeJoint2.prototype._reset=function(def){if(Number.isFinite(def.maxLength)){this.m_maxLength=def.maxLength}};RopeJoint2.prototype.getLocalAnchorA=function(){return this.m_localAnchorA};RopeJoint2.prototype.getLocalAnchorB=function(){return this.m_localAnchorB};RopeJoint2.prototype.setMaxLength=function(length){this.m_maxLength=length};RopeJoint2.prototype.getMaxLength=function(){return this.m_maxLength};RopeJoint2.prototype.getLimitState=function(){return this.m_state};RopeJoint2.prototype.getAnchorA=function(){return this.m_bodyA.getWorldPoint(this.m_localAnchorA)};RopeJoint2.prototype.getAnchorB=function(){return this.m_bodyB.getWorldPoint(this.m_localAnchorB)};RopeJoint2.prototype.getReactionForce=function(inv_dt){return Vec2.mulNumVec2(this.m_impulse,this.m_u).mul(inv_dt)};RopeJoint2.prototype.getReactionTorque=function(inv_dt){return 0};RopeJoint2.prototype.initVelocityConstraints=function(step){this.m_localCenterA=this.m_bodyA.m_sweep.localCenter;this.m_localCenterB=this.m_bodyB.m_sweep.localCenter;this.m_invMassA=this.m_bodyA.m_invMass;this.m_invMassB=this.m_bodyB.m_invMass;this.m_invIA=this.m_bodyA.m_invI;this.m_invIB=this.m_bodyB.m_invI;var cA2=this.m_bodyA.c_position.c;var aA=this.m_bodyA.c_position.a;var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var cB2=this.m_bodyB.c_position.c;var aB=this.m_bodyB.c_position.a;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var qA=Rot.neo(aA);var qB=Rot.neo(aB);this.m_rA=Rot.mulSub(qA,this.m_localAnchorA,this.m_localCenterA);this.m_rB=Rot.mulSub(qB,this.m_localAnchorB,this.m_localCenterB);this.m_u=Vec2.zero();this.m_u.addCombine(1,cB2,1,this.m_rB);this.m_u.subCombine(1,cA2,1,this.m_rA);this.m_length=this.m_u.length();var C=this.m_length-this.m_maxLength;if(C>0){this.m_state=LimitState.atUpperLimit}else{this.m_state=LimitState.inactiveLimit}if(this.m_length>SettingsInternal.linearSlop){this.m_u.mul(1/this.m_length)}else{this.m_u.setZero();this.m_mass=0;this.m_impulse=0;return}var crA=Vec2.crossVec2Vec2(this.m_rA,this.m_u);var crB=Vec2.crossVec2Vec2(this.m_rB,this.m_u);var invMass=this.m_invMassA+this.m_invIA*crA*crA+this.m_invMassB+this.m_invIB*crB*crB;this.m_mass=invMass!=0?1/invMass:0;if(step.warmStarting){this.m_impulse*=step.dtRatio;var P3=Vec2.mulNumVec2(this.m_impulse,this.m_u);vA2.subMul(this.m_invMassA,P3);wA-=this.m_invIA*Vec2.crossVec2Vec2(this.m_rA,P3);vB2.addMul(this.m_invMassB,P3);wB+=this.m_invIB*Vec2.crossVec2Vec2(this.m_rB,P3)}else{this.m_impulse=0}this.m_bodyA.c_velocity.v.setVec2(vA2);this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v.setVec2(vB2);this.m_bodyB.c_velocity.w=wB};RopeJoint2.prototype.solveVelocityConstraints=function(step){var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var vpA=Vec2.addCrossNumVec2(vA2,wA,this.m_rA);var vpB=Vec2.addCrossNumVec2(vB2,wB,this.m_rB);var C=this.m_length-this.m_maxLength;var Cdot=Vec2.dot(this.m_u,Vec2.sub(vpB,vpA));if(C<0){Cdot+=step.inv_dt*C}var impulse=-this.m_mass*Cdot;var oldImpulse=this.m_impulse;this.m_impulse=math_min$1(0,this.m_impulse+impulse);impulse=this.m_impulse-oldImpulse;var P3=Vec2.mulNumVec2(impulse,this.m_u);vA2.subMul(this.m_invMassA,P3);wA-=this.m_invIA*Vec2.crossVec2Vec2(this.m_rA,P3);vB2.addMul(this.m_invMassB,P3);wB+=this.m_invIB*Vec2.crossVec2Vec2(this.m_rB,P3);this.m_bodyA.c_velocity.v=vA2;this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v=vB2;this.m_bodyB.c_velocity.w=wB};RopeJoint2.prototype.solvePositionConstraints=function(step){var cA2=this.m_bodyA.c_position.c;var aA=this.m_bodyA.c_position.a;var cB2=this.m_bodyB.c_position.c;var aB=this.m_bodyB.c_position.a;var qA=Rot.neo(aA);var qB=Rot.neo(aB);var rA2=Rot.mulSub(qA,this.m_localAnchorA,this.m_localCenterA);var rB2=Rot.mulSub(qB,this.m_localAnchorB,this.m_localCenterB);var u=Vec2.zero();u.addCombine(1,cB2,1,rB2);u.subCombine(1,cA2,1,rA2);var length=u.normalize();var C=length-this.m_maxLength;C=clamp(C,0,SettingsInternal.maxLinearCorrection);var impulse=-this.m_mass*C;var P3=Vec2.mulNumVec2(impulse,u);cA2.subMul(this.m_invMassA,P3);aA-=this.m_invIA*Vec2.crossVec2Vec2(rA2,P3);cB2.addMul(this.m_invMassB,P3);aB+=this.m_invIB*Vec2.crossVec2Vec2(rB2,P3);this.m_bodyA.c_position.c.setVec2(cA2);this.m_bodyA.c_position.a=aA;this.m_bodyB.c_position.c.setVec2(cB2);this.m_bodyB.c_position.a=aB;return length-this.m_maxLength<SettingsInternal.linearSlop};RopeJoint2.TYPE="rope-joint";return RopeJoint2}(Joint);var math_abs$1=Math.abs;var math_PI$1=Math.PI;var DEFAULTS$1={frequencyHz:0,dampingRatio:0};var WeldJoint=function(_super){__extends(WeldJoint2,_super);function WeldJoint2(def,bodyA,bodyB,anchor){var _this=this;if(!(_this instanceof WeldJoint2)){return new WeldJoint2(def,bodyA,bodyB,anchor)}def=options(def,DEFAULTS$1);_this=_super.call(this,def,bodyA,bodyB)||this;bodyA=_this.m_bodyA;bodyB=_this.m_bodyB;_this.m_type=WeldJoint2.TYPE;_this.m_localAnchorA=Vec2.clone(anchor?bodyA.getLocalPoint(anchor):def.localAnchorA||Vec2.zero());_this.m_localAnchorB=Vec2.clone(anchor?bodyB.getLocalPoint(anchor):def.localAnchorB||Vec2.zero());_this.m_referenceAngle=Number.isFinite(def.referenceAngle)?def.referenceAngle:bodyB.getAngle()-bodyA.getAngle();_this.m_frequencyHz=def.frequencyHz;_this.m_dampingRatio=def.dampingRatio;_this.m_impulse=new Vec3;_this.m_bias=0;_this.m_gamma=0;_this.m_mass=new Mat33;return _this}WeldJoint2.prototype._serialize=function(){return{type:this.m_type,bodyA:this.m_bodyA,bodyB:this.m_bodyB,collideConnected:this.m_collideConnected,frequencyHz:this.m_frequencyHz,dampingRatio:this.m_dampingRatio,localAnchorA:this.m_localAnchorA,localAnchorB:this.m_localAnchorB,referenceAngle:this.m_referenceAngle}};WeldJoint2._deserialize=function(data,world,restore){data=__assign({},data);data.bodyA=restore(Body,data.bodyA,world);data.bodyB=restore(Body,data.bodyB,world);var joint=new WeldJoint2(data);return joint};WeldJoint2.prototype._reset=function(def){if(def.anchorA){this.m_localAnchorA.setVec2(this.m_bodyA.getLocalPoint(def.anchorA))}else if(def.localAnchorA){this.m_localAnchorA.setVec2(def.localAnchorA)}if(def.anchorB){this.m_localAnchorB.setVec2(this.m_bodyB.getLocalPoint(def.anchorB))}else if(def.localAnchorB){this.m_localAnchorB.setVec2(def.localAnchorB)}if(Number.isFinite(def.frequencyHz)){this.m_frequencyHz=def.frequencyHz}if(Number.isFinite(def.dampingRatio)){this.m_dampingRatio=def.dampingRatio}};WeldJoint2.prototype.getLocalAnchorA=function(){return this.m_localAnchorA};WeldJoint2.prototype.getLocalAnchorB=function(){return this.m_localAnchorB};WeldJoint2.prototype.getReferenceAngle=function(){return this.m_referenceAngle};WeldJoint2.prototype.setFrequency=function(hz){this.m_frequencyHz=hz};WeldJoint2.prototype.getFrequency=function(){return this.m_frequencyHz};WeldJoint2.prototype.setDampingRatio=function(ratio){this.m_dampingRatio=ratio};WeldJoint2.prototype.getDampingRatio=function(){return this.m_dampingRatio};WeldJoint2.prototype.getAnchorA=function(){return this.m_bodyA.getWorldPoint(this.m_localAnchorA)};WeldJoint2.prototype.getAnchorB=function(){return this.m_bodyB.getWorldPoint(this.m_localAnchorB)};WeldJoint2.prototype.getReactionForce=function(inv_dt){return Vec2.neo(this.m_impulse.x,this.m_impulse.y).mul(inv_dt)};WeldJoint2.prototype.getReactionTorque=function(inv_dt){return inv_dt*this.m_impulse.z};WeldJoint2.prototype.initVelocityConstraints=function(step){this.m_localCenterA=this.m_bodyA.m_sweep.localCenter;this.m_localCenterB=this.m_bodyB.m_sweep.localCenter;this.m_invMassA=this.m_bodyA.m_invMass;this.m_invMassB=this.m_bodyB.m_invMass;this.m_invIA=this.m_bodyA.m_invI;this.m_invIB=this.m_bodyB.m_invI;var aA=this.m_bodyA.c_position.a;var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var aB=this.m_bodyB.c_position.a;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var qA=Rot.neo(aA);var qB=Rot.neo(aB);this.m_rA=Rot.mulVec2(qA,Vec2.sub(this.m_localAnchorA,this.m_localCenterA));this.m_rB=Rot.mulVec2(qB,Vec2.sub(this.m_localAnchorB,this.m_localCenterB));var mA=this.m_invMassA;var mB=this.m_invMassB;var iA=this.m_invIA;var iB=this.m_invIB;var K=new Mat33;K.ex.x=mA+mB+this.m_rA.y*this.m_rA.y*iA+this.m_rB.y*this.m_rB.y*iB;K.ey.x=-this.m_rA.y*this.m_rA.x*iA-this.m_rB.y*this.m_rB.x*iB;K.ez.x=-this.m_rA.y*iA-this.m_rB.y*iB;K.ex.y=K.ey.x;K.ey.y=mA+mB+this.m_rA.x*this.m_rA.x*iA+this.m_rB.x*this.m_rB.x*iB;K.ez.y=this.m_rA.x*iA+this.m_rB.x*iB;K.ex.z=K.ez.x;K.ey.z=K.ez.y;K.ez.z=iA+iB;if(this.m_frequencyHz>0){K.getInverse22(this.m_mass);var invM=iA+iB;var m=invM>0?1/invM:0;var C=aB-aA-this.m_referenceAngle;var omega=2*math_PI$1*this.m_frequencyHz;var d2=2*m*this.m_dampingRatio*omega;var k=m*omega*omega;var h=step.dt;this.m_gamma=h*(d2+h*k);this.m_gamma=this.m_gamma!=0?1/this.m_gamma:0;this.m_bias=C*h*k*this.m_gamma;invM+=this.m_gamma;this.m_mass.ez.z=invM!=0?1/invM:0}else if(K.ez.z==0){K.getInverse22(this.m_mass);this.m_gamma=0;this.m_bias=0}else{K.getSymInverse33(this.m_mass);this.m_gamma=0;this.m_bias=0}if(step.warmStarting){this.m_impulse.mul(step.dtRatio);var P3=Vec2.neo(this.m_impulse.x,this.m_impulse.y);vA2.subMul(mA,P3);wA-=iA*(Vec2.crossVec2Vec2(this.m_rA,P3)+this.m_impulse.z);vB2.addMul(mB,P3);wB+=iB*(Vec2.crossVec2Vec2(this.m_rB,P3)+this.m_impulse.z)}else{this.m_impulse.setZero()}this.m_bodyA.c_velocity.v=vA2;this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v=vB2;this.m_bodyB.c_velocity.w=wB};WeldJoint2.prototype.solveVelocityConstraints=function(step){var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var mA=this.m_invMassA;var mB=this.m_invMassB;var iA=this.m_invIA;var iB=this.m_invIB;if(this.m_frequencyHz>0){var Cdot2=wB-wA;var impulse2=-this.m_mass.ez.z*(Cdot2+this.m_bias+this.m_gamma*this.m_impulse.z);this.m_impulse.z+=impulse2;wA-=iA*impulse2;wB+=iB*impulse2;var Cdot1=Vec2.zero();Cdot1.addCombine(1,vB2,1,Vec2.crossNumVec2(wB,this.m_rB));Cdot1.subCombine(1,vA2,1,Vec2.crossNumVec2(wA,this.m_rA));var impulse1=Vec2.neg(Mat33.mulVec2(this.m_mass,Cdot1));this.m_impulse.x+=impulse1.x;this.m_impulse.y+=impulse1.y;var P3=Vec2.clone(impulse1);vA2.subMul(mA,P3);wA-=iA*Vec2.crossVec2Vec2(this.m_rA,P3);vB2.addMul(mB,P3);wB+=iB*Vec2.crossVec2Vec2(this.m_rB,P3)}else{var Cdot1=Vec2.zero();Cdot1.addCombine(1,vB2,1,Vec2.crossNumVec2(wB,this.m_rB));Cdot1.subCombine(1,vA2,1,Vec2.crossNumVec2(wA,this.m_rA));var Cdot2=wB-wA;var Cdot=new Vec3(Cdot1.x,Cdot1.y,Cdot2);var impulse=Vec3.neg(Mat33.mulVec3(this.m_mass,Cdot));this.m_impulse.add(impulse);var P3=Vec2.neo(impulse.x,impulse.y);vA2.subMul(mA,P3);wA-=iA*(Vec2.crossVec2Vec2(this.m_rA,P3)+impulse.z);vB2.addMul(mB,P3);wB+=iB*(Vec2.crossVec2Vec2(this.m_rB,P3)+impulse.z)}this.m_bodyA.c_velocity.v=vA2;this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v=vB2;this.m_bodyB.c_velocity.w=wB};WeldJoint2.prototype.solvePositionConstraints=function(step){var cA2=this.m_bodyA.c_position.c;var aA=this.m_bodyA.c_position.a;var cB2=this.m_bodyB.c_position.c;var aB=this.m_bodyB.c_position.a;var qA=Rot.neo(aA);var qB=Rot.neo(aB);var mA=this.m_invMassA;var mB=this.m_invMassB;var iA=this.m_invIA;var iB=this.m_invIB;var rA2=Rot.mulVec2(qA,Vec2.sub(this.m_localAnchorA,this.m_localCenterA));var rB2=Rot.mulVec2(qB,Vec2.sub(this.m_localAnchorB,this.m_localCenterB));var positionError;var angularError;var K=new Mat33;K.ex.x=mA+mB+rA2.y*rA2.y*iA+rB2.y*rB2.y*iB;K.ey.x=-rA2.y*rA2.x*iA-rB2.y*rB2.x*iB;K.ez.x=-rA2.y*iA-rB2.y*iB;K.ex.y=K.ey.x;K.ey.y=mA+mB+rA2.x*rA2.x*iA+rB2.x*rB2.x*iB;K.ez.y=rA2.x*iA+rB2.x*iB;K.ex.z=K.ez.x;K.ey.z=K.ez.y;K.ez.z=iA+iB;if(this.m_frequencyHz>0){var C1=Vec2.zero();C1.addCombine(1,cB2,1,rB2);C1.subCombine(1,cA2,1,rA2);positionError=C1.length();angularError=0;var P3=Vec2.neg(K.solve22(C1));cA2.subMul(mA,P3);aA-=iA*Vec2.crossVec2Vec2(rA2,P3);cB2.addMul(mB,P3);aB+=iB*Vec2.crossVec2Vec2(rB2,P3)}else{var C1=Vec2.zero();C1.addCombine(1,cB2,1,rB2);C1.subCombine(1,cA2,1,rA2);var C2=aB-aA-this.m_referenceAngle;positionError=C1.length();angularError=math_abs$1(C2);var C=new Vec3(C1.x,C1.y,C2);var impulse=new Vec3;if(K.ez.z>0){impulse=Vec3.neg(K.solve33(C))}else{var impulse2=Vec2.neg(K.solve22(C1));impulse.set(impulse2.x,impulse2.y,0)}var P3=Vec2.neo(impulse.x,impulse.y);cA2.subMul(mA,P3);aA-=iA*(Vec2.crossVec2Vec2(rA2,P3)+impulse.z);cB2.addMul(mB,P3);aB+=iB*(Vec2.crossVec2Vec2(rB2,P3)+impulse.z)}this.m_bodyA.c_position.c=cA2;this.m_bodyA.c_position.a=aA;this.m_bodyB.c_position.c=cB2;this.m_bodyB.c_position.a=aB;return positionError<=SettingsInternal.linearSlop&&angularError<=SettingsInternal.angularSlop};WeldJoint2.TYPE="weld-joint";return WeldJoint2}(Joint);var math_abs=Math.abs;var math_PI=Math.PI;var DEFAULTS={enableMotor:false,maxMotorTorque:0,motorSpeed:0,frequencyHz:2,dampingRatio:.7};var WheelJoint=function(_super){__extends(WheelJoint2,_super);function WheelJoint2(def,bodyA,bodyB,anchor,axis){var _this=this;if(!(_this instanceof WheelJoint2)){return new WheelJoint2(def,bodyA,bodyB,anchor,axis)}def=options(def,DEFAULTS);_this=_super.call(this,def,bodyA,bodyB)||this;bodyA=_this.m_bodyA;bodyB=_this.m_bodyB;_this.m_ax=Vec2.zero();_this.m_ay=Vec2.zero();_this.m_type=WheelJoint2.TYPE;_this.m_localAnchorA=Vec2.clone(anchor?bodyA.getLocalPoint(anchor):def.localAnchorA||Vec2.zero());_this.m_localAnchorB=Vec2.clone(anchor?bodyB.getLocalPoint(anchor):def.localAnchorB||Vec2.zero());if(Vec2.isValid(axis)){_this.m_localXAxisA=bodyA.getLocalVector(axis)}else if(Vec2.isValid(def.localAxisA)){_this.m_localXAxisA=Vec2.clone(def.localAxisA)}else if(Vec2.isValid(def.localAxis)){_this.m_localXAxisA=Vec2.clone(def.localAxis)}else{_this.m_localXAxisA=Vec2.neo(1,0)}_this.m_localYAxisA=Vec2.crossNumVec2(1,_this.m_localXAxisA);_this.m_mass=0;_this.m_impulse=0;_this.m_motorMass=0;_this.m_motorImpulse=0;_this.m_springMass=0;_this.m_springImpulse=0;_this.m_maxMotorTorque=def.maxMotorTorque;_this.m_motorSpeed=def.motorSpeed;_this.m_enableMotor=def.enableMotor;_this.m_frequencyHz=def.frequencyHz;_this.m_dampingRatio=def.dampingRatio;_this.m_bias=0;_this.m_gamma=0;return _this}WheelJoint2.prototype._serialize=function(){return{type:this.m_type,bodyA:this.m_bodyA,bodyB:this.m_bodyB,collideConnected:this.m_collideConnected,enableMotor:this.m_enableMotor,maxMotorTorque:this.m_maxMotorTorque,motorSpeed:this.m_motorSpeed,frequencyHz:this.m_frequencyHz,dampingRatio:this.m_dampingRatio,localAnchorA:this.m_localAnchorA,localAnchorB:this.m_localAnchorB,localAxisA:this.m_localXAxisA}};WheelJoint2._deserialize=function(data,world,restore){data=__assign({},data);data.bodyA=restore(Body,data.bodyA,world);data.bodyB=restore(Body,data.bodyB,world);var joint=new WheelJoint2(data);return joint};WheelJoint2.prototype._reset=function(def){if(def.anchorA){this.m_localAnchorA.setVec2(this.m_bodyA.getLocalPoint(def.anchorA))}else if(def.localAnchorA){this.m_localAnchorA.setVec2(def.localAnchorA)}if(def.anchorB){this.m_localAnchorB.setVec2(this.m_bodyB.getLocalPoint(def.anchorB))}else if(def.localAnchorB){this.m_localAnchorB.setVec2(def.localAnchorB)}if(def.localAxisA){this.m_localXAxisA.setVec2(def.localAxisA);this.m_localYAxisA.setVec2(Vec2.crossNumVec2(1,def.localAxisA))}if(def.enableMotor!==void 0){this.m_enableMotor=def.enableMotor}if(Number.isFinite(def.maxMotorTorque)){this.m_maxMotorTorque=def.maxMotorTorque}if(Number.isFinite(def.motorSpeed)){this.m_motorSpeed=def.motorSpeed}if(Number.isFinite(def.frequencyHz)){this.m_frequencyHz=def.frequencyHz}if(Number.isFinite(def.dampingRatio)){this.m_dampingRatio=def.dampingRatio}};WheelJoint2.prototype.getLocalAnchorA=function(){return this.m_localAnchorA};WheelJoint2.prototype.getLocalAnchorB=function(){return this.m_localAnchorB};WheelJoint2.prototype.getLocalAxisA=function(){return this.m_localXAxisA};WheelJoint2.prototype.getJointTranslation=function(){var bA=this.m_bodyA;var bB=this.m_bodyB;var pA2=bA.getWorldPoint(this.m_localAnchorA);var pB2=bB.getWorldPoint(this.m_localAnchorB);var d2=Vec2.sub(pB2,pA2);var axis=bA.getWorldVector(this.m_localXAxisA);var translation2=Vec2.dot(d2,axis);return translation2};WheelJoint2.prototype.getJointSpeed=function(){var wA=this.m_bodyA.m_angularVelocity;var wB=this.m_bodyB.m_angularVelocity;return wB-wA};WheelJoint2.prototype.isMotorEnabled=function(){return this.m_enableMotor};WheelJoint2.prototype.enableMotor=function(flag){if(flag==this.m_enableMotor)return;this.m_bodyA.setAwake(true);this.m_bodyB.setAwake(true);this.m_enableMotor=flag};WheelJoint2.prototype.setMotorSpeed=function(speed){if(speed==this.m_motorSpeed)return;this.m_bodyA.setAwake(true);this.m_bodyB.setAwake(true);this.m_motorSpeed=speed};WheelJoint2.prototype.getMotorSpeed=function(){return this.m_motorSpeed};WheelJoint2.prototype.setMaxMotorTorque=function(torque){if(torque==this.m_maxMotorTorque)return;this.m_bodyA.setAwake(true);this.m_bodyB.setAwake(true);this.m_maxMotorTorque=torque};WheelJoint2.prototype.getMaxMotorTorque=function(){return this.m_maxMotorTorque};WheelJoint2.prototype.getMotorTorque=function(inv_dt){return inv_dt*this.m_motorImpulse};WheelJoint2.prototype.setSpringFrequencyHz=function(hz){this.m_frequencyHz=hz};WheelJoint2.prototype.getSpringFrequencyHz=function(){return this.m_frequencyHz};WheelJoint2.prototype.setSpringDampingRatio=function(ratio){this.m_dampingRatio=ratio};WheelJoint2.prototype.getSpringDampingRatio=function(){return this.m_dampingRatio};WheelJoint2.prototype.getAnchorA=function(){return this.m_bodyA.getWorldPoint(this.m_localAnchorA)};WheelJoint2.prototype.getAnchorB=function(){return this.m_bodyB.getWorldPoint(this.m_localAnchorB)};WheelJoint2.prototype.getReactionForce=function(inv_dt){return Vec2.combine(this.m_impulse,this.m_ay,this.m_springImpulse,this.m_ax).mul(inv_dt)};WheelJoint2.prototype.getReactionTorque=function(inv_dt){return inv_dt*this.m_motorImpulse};WheelJoint2.prototype.initVelocityConstraints=function(step){this.m_localCenterA=this.m_bodyA.m_sweep.localCenter;this.m_localCenterB=this.m_bodyB.m_sweep.localCenter;this.m_invMassA=this.m_bodyA.m_invMass;this.m_invMassB=this.m_bodyB.m_invMass;this.m_invIA=this.m_bodyA.m_invI;this.m_invIB=this.m_bodyB.m_invI;var mA=this.m_invMassA;var mB=this.m_invMassB;var iA=this.m_invIA;var iB=this.m_invIB;var cA2=this.m_bodyA.c_position.c;var aA=this.m_bodyA.c_position.a;var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var cB2=this.m_bodyB.c_position.c;var aB=this.m_bodyB.c_position.a;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;var qA=Rot.neo(aA);var qB=Rot.neo(aB);var rA2=Rot.mulVec2(qA,Vec2.sub(this.m_localAnchorA,this.m_localCenterA));var rB2=Rot.mulVec2(qB,Vec2.sub(this.m_localAnchorB,this.m_localCenterB));var d2=Vec2.zero();d2.addCombine(1,cB2,1,rB2);d2.subCombine(1,cA2,1,rA2);{this.m_ay=Rot.mulVec2(qA,this.m_localYAxisA);this.m_sAy=Vec2.crossVec2Vec2(Vec2.add(d2,rA2),this.m_ay);this.m_sBy=Vec2.crossVec2Vec2(rB2,this.m_ay);this.m_mass=mA+mB+iA*this.m_sAy*this.m_sAy+iB*this.m_sBy*this.m_sBy;if(this.m_mass>0){this.m_mass=1/this.m_mass}}this.m_springMass=0;this.m_bias=0;this.m_gamma=0;if(this.m_frequencyHz>0){this.m_ax=Rot.mulVec2(qA,this.m_localXAxisA);this.m_sAx=Vec2.crossVec2Vec2(Vec2.add(d2,rA2),this.m_ax);this.m_sBx=Vec2.crossVec2Vec2(rB2,this.m_ax);var invMass=mA+mB+iA*this.m_sAx*this.m_sAx+iB*this.m_sBx*this.m_sBx;if(invMass>0){this.m_springMass=1/invMass;var C=Vec2.dot(d2,this.m_ax);var omega=2*math_PI*this.m_frequencyHz;var damp=2*this.m_springMass*this.m_dampingRatio*omega;var k=this.m_springMass*omega*omega;var h=step.dt;this.m_gamma=h*(damp+h*k);if(this.m_gamma>0){this.m_gamma=1/this.m_gamma}this.m_bias=C*h*k*this.m_gamma;this.m_springMass=invMass+this.m_gamma;if(this.m_springMass>0){this.m_springMass=1/this.m_springMass}}}else{this.m_springImpulse=0}if(this.m_enableMotor){this.m_motorMass=iA+iB;if(this.m_motorMass>0){this.m_motorMass=1/this.m_motorMass}}else{this.m_motorMass=0;this.m_motorImpulse=0}if(step.warmStarting){this.m_impulse*=step.dtRatio;this.m_springImpulse*=step.dtRatio;this.m_motorImpulse*=step.dtRatio;var P3=Vec2.combine(this.m_impulse,this.m_ay,this.m_springImpulse,this.m_ax);var LA=this.m_impulse*this.m_sAy+this.m_springImpulse*this.m_sAx+this.m_motorImpulse;var LB=this.m_impulse*this.m_sBy+this.m_springImpulse*this.m_sBx+this.m_motorImpulse;vA2.subMul(this.m_invMassA,P3);wA-=this.m_invIA*LA;vB2.addMul(this.m_invMassB,P3);wB+=this.m_invIB*LB}else{this.m_impulse=0;this.m_springImpulse=0;this.m_motorImpulse=0}this.m_bodyA.c_velocity.v.setVec2(vA2);this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v.setVec2(vB2);this.m_bodyB.c_velocity.w=wB};WheelJoint2.prototype.solveVelocityConstraints=function(step){var mA=this.m_invMassA;var mB=this.m_invMassB;var iA=this.m_invIA;var iB=this.m_invIB;var vA2=this.m_bodyA.c_velocity.v;var wA=this.m_bodyA.c_velocity.w;var vB2=this.m_bodyB.c_velocity.v;var wB=this.m_bodyB.c_velocity.w;{var Cdot=Vec2.dot(this.m_ax,vB2)-Vec2.dot(this.m_ax,vA2)+this.m_sBx*wB-this.m_sAx*wA;var impulse=-this.m_springMass*(Cdot+this.m_bias+this.m_gamma*this.m_springImpulse);this.m_springImpulse+=impulse;var P3=Vec2.mulNumVec2(impulse,this.m_ax);var LA=impulse*this.m_sAx;var LB=impulse*this.m_sBx;vA2.subMul(mA,P3);wA-=iA*LA;vB2.addMul(mB,P3);wB+=iB*LB}{var Cdot=wB-wA-this.m_motorSpeed;var impulse=-this.m_motorMass*Cdot;var oldImpulse=this.m_motorImpulse;var maxImpulse=step.dt*this.m_maxMotorTorque;this.m_motorImpulse=clamp(this.m_motorImpulse+impulse,-maxImpulse,maxImpulse);impulse=this.m_motorImpulse-oldImpulse;wA-=iA*impulse;wB+=iB*impulse}{var Cdot=Vec2.dot(this.m_ay,vB2)-Vec2.dot(this.m_ay,vA2)+this.m_sBy*wB-this.m_sAy*wA;var impulse=-this.m_mass*Cdot;this.m_impulse+=impulse;var P3=Vec2.mulNumVec2(impulse,this.m_ay);var LA=impulse*this.m_sAy;var LB=impulse*this.m_sBy;vA2.subMul(mA,P3);wA-=iA*LA;vB2.addMul(mB,P3);wB+=iB*LB}this.m_bodyA.c_velocity.v.setVec2(vA2);this.m_bodyA.c_velocity.w=wA;this.m_bodyB.c_velocity.v.setVec2(vB2);this.m_bodyB.c_velocity.w=wB};WheelJoint2.prototype.solvePositionConstraints=function(step){var cA2=this.m_bodyA.c_position.c;var aA=this.m_bodyA.c_position.a;var cB2=this.m_bodyB.c_position.c;var aB=this.m_bodyB.c_position.a;var qA=Rot.neo(aA);var qB=Rot.neo(aB);var rA2=Rot.mulVec2(qA,Vec2.sub(this.m_localAnchorA,this.m_localCenterA));var rB2=Rot.mulVec2(qB,Vec2.sub(this.m_localAnchorB,this.m_localCenterB));var d2=Vec2.zero();d2.addCombine(1,cB2,1,rB2);d2.subCombine(1,cA2,1,rA2);var ay=Rot.mulVec2(qA,this.m_localYAxisA);var sAy=Vec2.crossVec2Vec2(Vec2.add(d2,rA2),ay);var sBy=Vec2.crossVec2Vec2(rB2,ay);var C=Vec2.dot(d2,ay);var k=this.m_invMassA+this.m_invMassB+this.m_invIA*this.m_sAy*this.m_sAy+this.m_invIB*this.m_sBy*this.m_sBy;var impulse=k!=0?-C/k:0;var P3=Vec2.mulNumVec2(impulse,ay);var LA=impulse*sAy;var LB=impulse*sBy;cA2.subMul(this.m_invMassA,P3);aA-=this.m_invIA*LA;cB2.addMul(this.m_invMassB,P3);aB+=this.m_invIB*LB;this.m_bodyA.c_position.c.setVec2(cA2);this.m_bodyA.c_position.a=aA;this.m_bodyB.c_position.c.setVec2(cB2);this.m_bodyB.c_position.a=aB;return math_abs(C)<=SettingsInternal.linearSlop};WheelJoint2.TYPE="wheel-joint";return WheelJoint2}(Joint);var _a;var SID=0;var SERIALIZE_REF_TYPES={World:World,Body:Body,Joint:Joint,Fixture:Fixture,Shape:Shape};var DESERIALIZE_BY_REF_TYPE={Vec2:Vec2,Vec3:Vec3,World:World,Body:Body,Joint:Joint,Fixture:Fixture,Shape:Shape};var DESERIALIZE_BY_TYPE_FIELD=(_a={},_a[Body.STATIC]=Body,_a[Body.DYNAMIC]=Body,_a[Body.KINEMATIC]=Body,_a[ChainShape.TYPE]=ChainShape,_a[PolygonShape.TYPE]=PolygonShape,_a[EdgeShape.TYPE]=EdgeShape,_a[CircleShape.TYPE]=CircleShape,_a[DistanceJoint.TYPE]=DistanceJoint,_a[FrictionJoint.TYPE]=FrictionJoint,_a[GearJoint.TYPE]=GearJoint,_a[MotorJoint.TYPE]=MotorJoint,_a[MouseJoint.TYPE]=MouseJoint,_a[PrismaticJoint.TYPE]=PrismaticJoint,_a[PulleyJoint.TYPE]=PulleyJoint,_a[RevoluteJoint.TYPE]=RevoluteJoint,_a[RopeJoint.TYPE]=RopeJoint,_a[WeldJoint.TYPE]=WeldJoint,_a[WheelJoint.TYPE]=WheelJoint,_a);var DEFAULT_OPTIONS={rootClass:World,preSerialize:function(obj){return obj},postSerialize:function(data,obj){return data},preDeserialize:function(data){return data},postDeserialize:function(obj,data){return obj}};var Serializer=function(){function Serializer2(options2){var _this=this;this.toJson=function(root){var preSerialize=_this.options.preSerialize;var postSerialize=_this.options.postSerialize;var json=[];var refQueue=[root];var refMemoById={};function addToRefQueue(value,typeName){value.__sid=value.__sid||++SID;if(!refMemoById[value.__sid]){refQueue.push(value);var index=json.length+refQueue.length;var ref={refIndex:index,refType:typeName};refMemoById[value.__sid]=ref}return refMemoById[value.__sid]}function serializeWithHooks(obj2){obj2=preSerialize(obj2);var data=obj2._serialize();data=postSerialize(data,obj2);return data}function traverse(value,noRefType){if(noRefType===void 0){noRefType=false}if(typeof value!=="object"||value===null){return value}if(typeof value._serialize==="function"){if(!noRefType){for(var typeName in SERIALIZE_REF_TYPES){if(value instanceof SERIALIZE_REF_TYPES[typeName]){return addToRefQueue(value,typeName)}}}value=serializeWithHooks(value)}if(Array.isArray(value)){var newValue=[];for(var key=0;key<value.length;key++){newValue[key]=traverse(value[key])}value=newValue}else{var newValue={};for(var key in value){if(value.hasOwnProperty(key)){newValue[key]=traverse(value[key])}}value=newValue}return value}while(refQueue.length){var obj=refQueue.shift();var str=traverse(obj,true);json.push(str)}return json};this.fromJson=function(json){var preDeserialize=_this.options.preDeserialize;var postDeserialize=_this.options.postDeserialize;var rootClass=_this.options.rootClass;var deserializedRefMemoByIndex={};function deserializeWithHooks(classHint,data,context){if(!classHint||!classHint._deserialize){classHint=DESERIALIZE_BY_TYPE_FIELD[data.type]}var deserializer=classHint&&classHint._deserialize;if(!deserializer){return}data=preDeserialize(data);var classDeserializeFn=classHint._deserialize;var obj=classDeserializeFn(data,context,deserializeChild);obj=postDeserialize(obj,data);return obj}function deserializeChild(classHint,dataOrRef,context){var isRefObject=dataOrRef.refIndex&&dataOrRef.refType;if(!isRefObject){return deserializeWithHooks(classHint,dataOrRef,context)}var ref=dataOrRef;if(DESERIALIZE_BY_REF_TYPE[ref.refType]){classHint=DESERIALIZE_BY_REF_TYPE[ref.refType]}var refIndex=ref.refIndex;if(!deserializedRefMemoByIndex[refIndex]){var data=json[refIndex];var obj=deserializeWithHooks(classHint,data,context);deserializedRefMemoByIndex[refIndex]=obj}return deserializedRefMemoByIndex[refIndex]}var root=deserializeWithHooks(rootClass,json[0],null);return root};this.options=__assign(__assign({},DEFAULT_OPTIONS),options2)}return Serializer2}();var worldSerializer=new Serializer({rootClass:World});Serializer.fromJson=worldSerializer.fromJson;Serializer.toJson=worldSerializer.toJson;var Testbed=function(){function Testbed2(){}Testbed2.mount=function(options2){throw new Error("Not implemented")};Testbed2.start=function(world){var testbed2=Testbed2.mount();testbed2.start(world);return testbed2};return Testbed2}();function testbed(a2,b2){var callback;var options2;if(typeof a2==="function"){callback=a2;options2=b2}else if(typeof b2==="function"){callback=b2;options2=a2}else{options2=a2!==null&&a2!==void 0?a2:b2}var testbed2=Testbed.mount(options2);if(callback){var world=callback(testbed2)||testbed2.world;testbed2.start(world)}else{return testbed2}}var BoxShape=function(_super){__extends(BoxShape2,_super);function BoxShape2(halfWidth,halfHeight,center2,angle){var _this=this;if(!(_this instanceof BoxShape2)){return new BoxShape2(halfWidth,halfHeight,center2,angle)}_this=_super.call(this)||this;_this._setAsBox(halfWidth,halfHeight,center2,angle);return _this}BoxShape2.TYPE="polygon";return BoxShape2}(PolygonShape);Contact.addType(CircleShape.TYPE,CircleShape.TYPE,CircleCircleContact);function CircleCircleContact(manifold,xfA2,fixtureA,indexA,xfB2,fixtureB,indexB){CollideCircles(manifold,fixtureA.getShape(),xfA2,fixtureB.getShape(),xfB2)}var pA=vec2(0,0);var pB=vec2(0,0);var CollideCircles=function(manifold,circleA,xfA2,circleB,xfB2){manifold.pointCount=0;transformVec2(pA,xfA2,circleA.m_p);transformVec2(pB,xfB2,circleB.m_p);var distSqr=distSqrVec2(pB,pA);var rA2=circleA.m_radius;var rB2=circleB.m_radius;var radius=rA2+rB2;if(distSqr>radius*radius){return}manifold.type=exports2.ManifoldType.e_circles;copyVec2(manifold.localPoint,circleA.m_p);zeroVec2(manifold.localNormal);manifold.pointCount=1;copyVec2(manifold.points[0].localPoint,circleB.m_p);manifold.points[0].id.setFeatures(0,exports2.ContactFeatureType.e_vertex,0,exports2.ContactFeatureType.e_vertex)};Contact.addType(EdgeShape.TYPE,CircleShape.TYPE,EdgeCircleContact);Contact.addType(ChainShape.TYPE,CircleShape.TYPE,ChainCircleContact);function EdgeCircleContact(manifold,xfA2,fixtureA,indexA,xfB2,fixtureB,indexB){var shapeA=fixtureA.getShape();var shapeB=fixtureB.getShape();CollideEdgeCircle(manifold,shapeA,xfA2,shapeB,xfB2)}function ChainCircleContact(manifold,xfA2,fixtureA,indexA,xfB2,fixtureB,indexB){var chain=fixtureA.getShape();var edge=new EdgeShape;chain.getChildEdge(edge,indexA);var shapeA=edge;var shapeB=fixtureB.getShape();CollideEdgeCircle(manifold,shapeA,xfA2,shapeB,xfB2)}var e=vec2(0,0);var e1=vec2(0,0);var e2=vec2(0,0);var Q=vec2(0,0);var P=vec2(0,0);var n$2=vec2(0,0);var CollideEdgeCircle=function(manifold,edgeA,xfA2,circleB,xfB2){manifold.pointCount=0;retransformVec2(Q,xfB2,xfA2,circleB.m_p);var A=edgeA.m_vertex1;var B=edgeA.m_vertex2;subVec2(e,B,A);var u=dotVec2(e,B)-dotVec2(e,Q);var v3=dotVec2(e,Q)-dotVec2(e,A);var radius=edgeA.m_radius+circleB.m_radius;if(v3<=0){copyVec2(P,A);var dd_1=distSqrVec2(Q,A);if(dd_1>radius*radius){return}if(edgeA.m_hasVertex0){var A1=edgeA.m_vertex0;var B1=A;subVec2(e1,B1,A1);var u1=dotVec2(e1,B1)-dotVec2(e1,Q);if(u1>0){return}}manifold.type=exports2.ManifoldType.e_circles;zeroVec2(manifold.localNormal);copyVec2(manifold.localPoint,P);manifold.pointCount=1;copyVec2(manifold.points[0].localPoint,circleB.m_p);manifold.points[0].id.setFeatures(0,exports2.ContactFeatureType.e_vertex,0,exports2.ContactFeatureType.e_vertex);return}if(u<=0){copyVec2(P,B);var dd_2=distSqrVec2(Q,P);if(dd_2>radius*radius){return}if(edgeA.m_hasVertex3){var B2=edgeA.m_vertex3;var A2=B;subVec2(e2,B2,A2);var v22=dotVec2(e2,Q)-dotVec2(e2,A2);if(v22>0){return}}manifold.type=exports2.ManifoldType.e_circles;zeroVec2(manifold.localNormal);copyVec2(manifold.localPoint,P);manifold.pointCount=1;copyVec2(manifold.points[0].localPoint,circleB.m_p);manifold.points[0].id.setFeatures(1,exports2.ContactFeatureType.e_vertex,0,exports2.ContactFeatureType.e_vertex);return}var den=lengthSqrVec2(e);combine2Vec2(P,u/den,A,v3/den,B);var dd=distSqrVec2(Q,P);if(dd>radius*radius){return}crossNumVec2(n$2,1,e);if(dotVec2(n$2,Q)-dotVec2(n$2,A)<0){negVec2(n$2)}normalizeVec2(n$2);manifold.type=exports2.ManifoldType.e_faceA;copyVec2(manifold.localNormal,n$2);copyVec2(manifold.localPoint,A);manifold.pointCount=1;copyVec2(manifold.points[0].localPoint,circleB.m_p);manifold.points[0].id.setFeatures(0,exports2.ContactFeatureType.e_face,0,exports2.ContactFeatureType.e_vertex)};var incidentEdge=[new ClipVertex,new ClipVertex];var clipPoints1$1=[new ClipVertex,new ClipVertex];var clipPoints2$1=[new ClipVertex,new ClipVertex];var clipSegmentToLineNormal=vec2(0,0);var v1=vec2(0,0);var n$1=vec2(0,0);var xf$1=transform(0,0,0);var v11=vec2(0,0);var v12=vec2(0,0);var localTangent=vec2(0,0);var localNormal=vec2(0,0);var planePoint=vec2(0,0);var tangent=vec2(0,0);var normal$1=vec2(0,0);var normal1$1=vec2(0,0);Contact.addType(PolygonShape.TYPE,PolygonShape.TYPE,PolygonContact);function PolygonContact(manifold,xfA2,fixtureA,indexA,xfB2,fixtureB,indexB){CollidePolygons(manifold,fixtureA.getShape(),xfA2,fixtureB.getShape(),xfB2)}function findMaxSeparation(poly1,xf1,poly2,xf2,output2){var count1=poly1.m_count;var count2=poly2.m_count;var n1s=poly1.m_normals;var v1s=poly1.m_vertices;var v2s=poly2.m_vertices;detransformTransform(xf$1,xf2,xf1);var bestIndex=0;var maxSeparation2=-Infinity;for(var i=0;i<count1;++i){rotVec2(n$1,xf$1.q,n1s[i]);transformVec2(v1,xf$1,v1s[i]);var si=Infinity;for(var j=0;j<count2;++j){var sij=dotVec2(n$1,v2s[j])-dotVec2(n$1,v1);if(sij<si){si=sij}}if(si>maxSeparation2){maxSeparation2=si;bestIndex=i}}output2.maxSeparation=maxSeparation2;output2.bestIndex=bestIndex}function findIncidentEdge(clipVertex,poly1,xf1,edge12,poly2,xf2){var normals1=poly1.m_normals;var count2=poly2.m_count;var vertices2=poly2.m_vertices;var normals2=poly2.m_normals;rerotVec2(normal1$1,xf2.q,xf1.q,normals1[edge12]);var index=0;var minDot=Infinity;for(var i=0;i<count2;++i){var dot=dotVec2(normal1$1,normals2[i]);if(dot<minDot){minDot=dot;index=i}}var i1=index;var i2=i1+1<count2?i1+1:0;transformVec2(clipVertex[0].v,xf2,vertices2[i1]);clipVertex[0].id.setFeatures(edge12,exports2.ContactFeatureType.e_face,i1,exports2.ContactFeatureType.e_vertex);transformVec2(clipVertex[1].v,xf2,vertices2[i2]);clipVertex[1].id.setFeatures(edge12,exports2.ContactFeatureType.e_face,i2,exports2.ContactFeatureType.e_vertex)}var maxSeparation={maxSeparation:0,bestIndex:0};var CollidePolygons=function(manifold,polyA,xfA2,polyB,xfB2){manifold.pointCount=0;var totalRadius=polyA.m_radius+polyB.m_radius;findMaxSeparation(polyA,xfA2,polyB,xfB2,maxSeparation);var edgeA=maxSeparation.bestIndex;var separationA=maxSeparation.maxSeparation;if(separationA>totalRadius)return;findMaxSeparation(polyB,xfB2,polyA,xfA2,maxSeparation);var edgeB=maxSeparation.bestIndex;var separationB=maxSeparation.maxSeparation;if(separationB>totalRadius)return;var poly1;var poly2;var xf1;var xf2;var edge12;var flip;var k_tol=.1*SettingsInternal.linearSlop;if(separationB>separationA+k_tol){poly1=polyB;poly2=polyA;xf1=xfB2;xf2=xfA2;edge12=edgeB;manifold.type=exports2.ManifoldType.e_faceB;flip=true}else{poly1=polyA;poly2=polyB;xf1=xfA2;xf2=xfB2;edge12=edgeA;manifold.type=exports2.ManifoldType.e_faceA;flip=false}incidentEdge[0].recycle();incidentEdge[1].recycle();findIncidentEdge(incidentEdge,poly1,xf1,edge12,poly2,xf2);var count1=poly1.m_count;var vertices1=poly1.m_vertices;var iv1=edge12;var iv2=edge12+1<count1?edge12+1:0;copyVec2(v11,vertices1[iv1]);copyVec2(v12,vertices1[iv2]);subVec2(localTangent,v12,v11);normalizeVec2(localTangent);crossVec2Num(localNormal,localTangent,1);combine2Vec2(planePoint,.5,v11,.5,v12);rotVec2(tangent,xf1.q,localTangent);crossVec2Num(normal$1,tangent,1);transformVec2(v11,xf1,v11);transformVec2(v12,xf1,v12);var frontOffset=dotVec2(normal$1,v11);var sideOffset1=-dotVec2(tangent,v11)+totalRadius;var sideOffset2=dotVec2(tangent,v12)+totalRadius;clipPoints1$1[0].recycle();clipPoints1$1[1].recycle();clipPoints2$1[0].recycle();clipPoints2$1[1].recycle();setVec2(clipSegmentToLineNormal,-tangent.x,-tangent.y);var np1=clipSegmentToLine(clipPoints1$1,incidentEdge,clipSegmentToLineNormal,sideOffset1,iv1);if(np1<2){return}setVec2(clipSegmentToLineNormal,tangent.x,tangent.y);var np2=clipSegmentToLine(clipPoints2$1,clipPoints1$1,clipSegmentToLineNormal,sideOffset2,iv2);if(np2<2){return}copyVec2(manifold.localNormal,localNormal);copyVec2(manifold.localPoint,planePoint);var pointCount=0;for(var i=0;i<clipPoints2$1.length;++i){var separation=dotVec2(normal$1,clipPoints2$1[i].v)-frontOffset;if(separation<=totalRadius){var cp=manifold.points[pointCount];detransformVec2(cp.localPoint,xf2,clipPoints2$1[i].v);cp.id.set(clipPoints2$1[i].id);if(flip){cp.id.swapFeatures()}++pointCount}}manifold.pointCount=pointCount};Contact.addType(PolygonShape.TYPE,CircleShape.TYPE,PolygonCircleContact);function PolygonCircleContact(manifold,xfA2,fixtureA,indexA,xfB2,fixtureB,indexB){CollidePolygonCircle(manifold,fixtureA.getShape(),xfA2,fixtureB.getShape(),xfB2)}var cLocal=vec2(0,0);var faceCenter=vec2(0,0);var CollidePolygonCircle=function(manifold,polygonA,xfA2,circleB,xfB2){manifold.pointCount=0;retransformVec2(cLocal,xfB2,xfA2,circleB.m_p);var normalIndex=0;var separation=-Infinity;var radius=polygonA.m_radius+circleB.m_radius;var vertexCount=polygonA.m_count;var vertices=polygonA.m_vertices;var normals=polygonA.m_normals;for(var i=0;i<vertexCount;++i){var s2=dotVec2(normals[i],cLocal)-dotVec2(normals[i],vertices[i]);if(s2>radius){return}if(s2>separation){separation=s2;normalIndex=i}}var vertIndex1=normalIndex;var vertIndex2=vertIndex1+1<vertexCount?vertIndex1+1:0;var v13=vertices[vertIndex1];var v22=vertices[vertIndex2];if(separation<EPSILON){manifold.pointCount=1;manifold.type=exports2.ManifoldType.e_faceA;copyVec2(manifold.localNormal,normals[normalIndex]);combine2Vec2(manifold.localPoint,.5,v13,.5,v22);copyVec2(manifold.points[0].localPoint,circleB.m_p);manifold.points[0].id.setFeatures(0,exports2.ContactFeatureType.e_vertex,0,exports2.ContactFeatureType.e_vertex);return}var u1=dotVec2(cLocal,v22)-dotVec2(cLocal,v13)-dotVec2(v13,v22)+dotVec2(v13,v13);var u2=dotVec2(cLocal,v13)-dotVec2(cLocal,v22)-dotVec2(v22,v13)+dotVec2(v22,v22);if(u1<=0){if(distSqrVec2(cLocal,v13)>radius*radius){return}manifold.pointCount=1;manifold.type=exports2.ManifoldType.e_faceA;subVec2(manifold.localNormal,cLocal,v13);normalizeVec2(manifold.localNormal);copyVec2(manifold.localPoint,v13);copyVec2(manifold.points[0].localPoint,circleB.m_p);manifold.points[0].id.setFeatures(0,exports2.ContactFeatureType.e_vertex,0,exports2.ContactFeatureType.e_vertex)}else if(u2<=0){if(distSqrVec2(cLocal,v22)>radius*radius){return}manifold.pointCount=1;manifold.type=exports2.ManifoldType.e_faceA;subVec2(manifold.localNormal,cLocal,v22);normalizeVec2(manifold.localNormal);copyVec2(manifold.localPoint,v22);copyVec2(manifold.points[0].localPoint,circleB.m_p);manifold.points[0].id.setFeatures(0,exports2.ContactFeatureType.e_vertex,0,exports2.ContactFeatureType.e_vertex)}else{combine2Vec2(faceCenter,.5,v13,.5,v22);var separation_1=dotVec2(cLocal,normals[vertIndex1])-dotVec2(faceCenter,normals[vertIndex1]);if(separation_1>radius){return}manifold.pointCount=1;manifold.type=exports2.ManifoldType.e_faceA;copyVec2(manifold.localNormal,normals[vertIndex1]);copyVec2(manifold.localPoint,faceCenter);copyVec2(manifold.points[0].localPoint,circleB.m_p);manifold.points[0].id.setFeatures(0,exports2.ContactFeatureType.e_vertex,0,exports2.ContactFeatureType.e_vertex)}};var math_min=Math.min;Contact.addType(EdgeShape.TYPE,PolygonShape.TYPE,EdgePolygonContact);Contact.addType(ChainShape.TYPE,PolygonShape.TYPE,ChainPolygonContact);function EdgePolygonContact(manifold,xfA2,fA,indexA,xfB2,fB,indexB){CollideEdgePolygon(manifold,fA.getShape(),xfA2,fB.getShape(),xfB2)}var edge_reuse=new EdgeShape;function ChainPolygonContact(manifold,xfA2,fA,indexA,xfB2,fB,indexB){var chain=fA.getShape();chain.getChildEdge(edge_reuse,indexA);CollideEdgePolygon(manifold,edge_reuse,xfA2,fB.getShape(),xfB2)}var EPAxisType;(function(EPAxisType2){EPAxisType2[EPAxisType2["e_unknown"]=-1]="e_unknown";EPAxisType2[EPAxisType2["e_edgeA"]=1]="e_edgeA";EPAxisType2[EPAxisType2["e_edgeB"]=2]="e_edgeB"})(EPAxisType||(EPAxisType={}));var VertexType;(function(VertexType2){VertexType2[VertexType2["e_isolated"]=0]="e_isolated";VertexType2[VertexType2["e_concave"]=1]="e_concave";VertexType2[VertexType2["e_convex"]=2]="e_convex"})(VertexType||(VertexType={}));var EPAxis=function(){function EPAxis2(){}return EPAxis2}();var TempPolygon=function(){function TempPolygon2(){this.vertices=[];this.normals=[];this.count=0;for(var i=0;i<SettingsInternal.maxPolygonVertices;i++){this.vertices.push(vec2(0,0));this.normals.push(vec2(0,0))}}return TempPolygon2}();var ReferenceFace=function(){function ReferenceFace2(){this.v1=vec2(0,0);this.v2=vec2(0,0);this.normal=vec2(0,0);this.sideNormal1=vec2(0,0);this.sideNormal2=vec2(0,0)}ReferenceFace2.prototype.recycle=function(){zeroVec2(this.v1);zeroVec2(this.v2);zeroVec2(this.normal);zeroVec2(this.sideNormal1);zeroVec2(this.sideNormal2)};return ReferenceFace2}();var clipPoints1=[new ClipVertex,new ClipVertex];var clipPoints2=[new ClipVertex,new ClipVertex];var ie=[new ClipVertex,new ClipVertex];var edgeAxis=new EPAxis;var polygonAxis=new EPAxis;var polygonBA=new TempPolygon;var rf=new ReferenceFace;var centroidB=vec2(0,0);var edge0=vec2(0,0);var edge1=vec2(0,0);var edge2=vec2(0,0);var xf=transform(0,0,0);var normal=vec2(0,0);var normal0=vec2(0,0);var normal1=vec2(0,0);var normal2=vec2(0,0);var lowerLimit=vec2(0,0);var upperLimit=vec2(0,0);var perp=vec2(0,0);var n=vec2(0,0);var CollideEdgePolygon=function(manifold,edgeA,xfA2,polygonB,xfB2){detransformTransform(xf,xfA2,xfB2);transformVec2(centroidB,xf,polygonB.m_centroid);var v0=edgeA.m_vertex0;var v13=edgeA.m_vertex1;var v22=edgeA.m_vertex2;var v3=edgeA.m_vertex3;var hasVertex0=edgeA.m_hasVertex0;var hasVertex3=edgeA.m_hasVertex3;subVec2(edge1,v22,v13);normalizeVec2(edge1);setVec2(normal1,edge1.y,-edge1.x);var offset1=dotVec2(normal1,centroidB)-dotVec2(normal1,v13);var offset0=0;var offset2=0;var convex1=false;var convex2=false;zeroVec2(normal0);zeroVec2(normal2);if(hasVertex0){subVec2(edge0,v13,v0);normalizeVec2(edge0);setVec2(normal0,edge0.y,-edge0.x);convex1=crossVec2Vec2(edge0,edge1)>=0;offset0=Vec2.dot(normal0,centroidB)-Vec2.dot(normal0,v0)}if(hasVertex3){subVec2(edge2,v3,v22);normalizeVec2(edge2);setVec2(normal2,edge2.y,-edge2.x);convex2=Vec2.crossVec2Vec2(edge1,edge2)>0;offset2=Vec2.dot(normal2,centroidB)-Vec2.dot(normal2,v22)}var front;zeroVec2(normal);zeroVec2(lowerLimit);zeroVec2(upperLimit);if(hasVertex0&&hasVertex3){if(convex1&&convex2){front=offset0>=0||offset1>=0||offset2>=0;if(front){copyVec2(normal,normal1);copyVec2(lowerLimit,normal0);copyVec2(upperLimit,normal2)}else{scaleVec2(normal,-1,normal1);scaleVec2(lowerLimit,-1,normal1);scaleVec2(upperLimit,-1,normal1)}}else if(convex1){front=offset0>=0||offset1>=0&&offset2>=0;if(front){copyVec2(normal,normal1);copyVec2(lowerLimit,normal0);copyVec2(upperLimit,normal1)}else{scaleVec2(normal,-1,normal1);scaleVec2(lowerLimit,-1,normal2);scaleVec2(upperLimit,-1,normal1)}}else if(convex2){front=offset2>=0||offset0>=0&&offset1>=0;if(front){copyVec2(normal,normal1);copyVec2(lowerLimit,normal1);copyVec2(upperLimit,normal2)}else{scaleVec2(normal,-1,normal1);scaleVec2(lowerLimit,-1,normal1);scaleVec2(upperLimit,-1,normal0)}}else{front=offset0>=0&&offset1>=0&&offset2>=0;if(front){copyVec2(normal,normal1);copyVec2(lowerLimit,normal1);copyVec2(upperLimit,normal1)}else{scaleVec2(normal,-1,normal1);scaleVec2(lowerLimit,-1,normal2);scaleVec2(upperLimit,-1,normal0)}}}else if(hasVertex0){if(convex1){front=offset0>=0||offset1>=0;if(front){copyVec2(normal,normal1);copyVec2(lowerLimit,normal0);scaleVec2(upperLimit,-1,normal1)}else{scaleVec2(normal,-1,normal1);copyVec2(lowerLimit,normal1);scaleVec2(upperLimit,-1,normal1)}}else{front=offset0>=0&&offset1>=0;if(front){copyVec2(normal,normal1);copyVec2(lowerLimit,normal1);scaleVec2(upperLimit,-1,normal1)}else{scaleVec2(normal,-1,normal1);copyVec2(lowerLimit,normal1);scaleVec2(upperLimit,-1,normal0)}}}else if(hasVertex3){if(convex2){front=offset1>=0||offset2>=0;if(front){copyVec2(normal,normal1);scaleVec2(lowerLimit,-1,normal1);copyVec2(upperLimit,normal2)}else{scaleVec2(normal,-1,normal1);scaleVec2(lowerLimit,-1,normal1);copyVec2(upperLimit,normal1)}}else{front=offset1>=0&&offset2>=0;if(front){copyVec2(normal,normal1);scaleVec2(lowerLimit,-1,normal1);copyVec2(upperLimit,normal1)}else{scaleVec2(normal,-1,normal1);scaleVec2(lowerLimit,-1,normal2);copyVec2(upperLimit,normal1)}}}else{front=offset1>=0;if(front){copyVec2(normal,normal1);scaleVec2(lowerLimit,-1,normal1);scaleVec2(upperLimit,-1,normal1)}else{scaleVec2(normal,-1,normal1);copyVec2(lowerLimit,normal1);copyVec2(upperLimit,normal1)}}polygonBA.count=polygonB.m_count;for(var i=0;i<polygonB.m_count;++i){transformVec2(polygonBA.vertices[i],xf,polygonB.m_vertices[i]);rotVec2(polygonBA.normals[i],xf.q,polygonB.m_normals[i])}var radius=polygonB.m_radius+edgeA.m_radius;manifold.pointCount=0;{edgeAxis.type=EPAxisType.e_edgeA;edgeAxis.index=front?0:1;edgeAxis.separation=Infinity;for(var i=0;i<polygonBA.count;++i){var v4=polygonBA.vertices[i];var s2=dotVec2(normal,v4)-dotVec2(normal,v13);if(s2<edgeAxis.separation){edgeAxis.separation=s2}}}if(edgeAxis.type==EPAxisType.e_unknown){return}if(edgeAxis.separation>radius){return}{polygonAxis.type=EPAxisType.e_unknown;polygonAxis.index=-1;polygonAxis.separation=-Infinity;setVec2(perp,-normal.y,normal.x);for(var i=0;i<polygonBA.count;++i){scaleVec2(n,-1,polygonBA.normals[i]);var s1=dotVec2(n,polygonBA.vertices[i])-dotVec2(n,v13);var s22=dotVec2(n,polygonBA.vertices[i])-dotVec2(n,v22);var s2=math_min(s1,s22);if(s2>radius){polygonAxis.type=EPAxisType.e_edgeB;polygonAxis.index=i;polygonAxis.separation=s2;break}if(dotVec2(n,perp)>=0){if(dotVec2(n,normal)-dotVec2(upperLimit,normal)<-SettingsInternal.angularSlop){continue}}else{if(dotVec2(n,normal)-dotVec2(lowerLimit,normal)<-SettingsInternal.angularSlop){continue}}if(s2>polygonAxis.separation){polygonAxis.type=EPAxisType.e_edgeB;polygonAxis.index=i;polygonAxis.separation=s2}}}if(polygonAxis.type!=EPAxisType.e_unknown&&polygonAxis.separation>radius){return}var k_relativeTol=.98;var k_absoluteTol=.001;var primaryAxis;if(polygonAxis.type==EPAxisType.e_unknown){primaryAxis=edgeAxis}else if(polygonAxis.separation>k_relativeTol*edgeAxis.separation+k_absoluteTol){primaryAxis=polygonAxis}else{primaryAxis=edgeAxis}ie[0].recycle();ie[1].recycle();if(primaryAxis.type==EPAxisType.e_edgeA){manifold.type=exports2.ManifoldType.e_faceA;var bestIndex=0;var bestValue=dotVec2(normal,polygonBA.normals[0]);for(var i=1;i<polygonBA.count;++i){var value=dotVec2(normal,polygonBA.normals[i]);if(value<bestValue){bestValue=value;bestIndex=i}}var i1=bestIndex;var i2=i1+1<polygonBA.count?i1+1:0;copyVec2(ie[0].v,polygonBA.vertices[i1]);ie[0].id.setFeatures(0,exports2.ContactFeatureType.e_face,i1,exports2.ContactFeatureType.e_vertex);copyVec2(ie[1].v,polygonBA.vertices[i2]);ie[1].id.setFeatures(0,exports2.ContactFeatureType.e_face,i2,exports2.ContactFeatureType.e_vertex);if(front){rf.i1=0;rf.i2=1;copyVec2(rf.v1,v13);copyVec2(rf.v2,v22);copyVec2(rf.normal,normal1)}else{rf.i1=1;rf.i2=0;copyVec2(rf.v1,v22);copyVec2(rf.v2,v13);scaleVec2(rf.normal,-1,normal1)}}else{manifold.type=exports2.ManifoldType.e_faceB;copyVec2(ie[0].v,v13);ie[0].id.setFeatures(primaryAxis.index,exports2.ContactFeatureType.e_face,0,exports2.ContactFeatureType.e_vertex);copyVec2(ie[1].v,v22);ie[1].id.setFeatures(primaryAxis.index,exports2.ContactFeatureType.e_face,1,exports2.ContactFeatureType.e_vertex);rf.i1=primaryAxis.index;rf.i2=rf.i1+1<polygonBA.count?rf.i1+1:0;copyVec2(rf.v1,polygonBA.vertices[rf.i1]);copyVec2(rf.v2,polygonBA.vertices[rf.i2]);copyVec2(rf.normal,polygonBA.normals[rf.i1])}setVec2(rf.sideNormal1,rf.normal.y,-rf.normal.x);setVec2(rf.sideNormal2,-rf.sideNormal1.x,-rf.sideNormal1.y);rf.sideOffset1=dotVec2(rf.sideNormal1,rf.v1);rf.sideOffset2=dotVec2(rf.sideNormal2,rf.v2);clipPoints1[0].recycle();clipPoints1[1].recycle();clipPoints2[0].recycle();clipPoints2[1].recycle();var np1=clipSegmentToLine(clipPoints1,ie,rf.sideNormal1,rf.sideOffset1,rf.i1);if(np1<SettingsInternal.maxManifoldPoints){return}var np2=clipSegmentToLine(clipPoints2,clipPoints1,rf.sideNormal2,rf.sideOffset2,rf.i2);if(np2<SettingsInternal.maxManifoldPoints){return}if(primaryAxis.type==EPAxisType.e_edgeA){copyVec2(manifold.localNormal,rf.normal);copyVec2(manifold.localPoint,rf.v1)}else{copyVec2(manifold.localNormal,polygonB.m_normals[rf.i1]);copyVec2(manifold.localPoint,polygonB.m_vertices[rf.i1])}var pointCount=0;for(var i=0;i<SettingsInternal.maxManifoldPoints;++i){var separation=dotVec2(rf.normal,clipPoints2[i].v)-dotVec2(rf.normal,rf.v1);if(separation<=radius){var cp=manifold.points[pointCount];if(primaryAxis.type==EPAxisType.e_edgeA){detransformVec2(cp.localPoint,xf,clipPoints2[i].v);cp.id.set(clipPoints2[i].id)}else{copyVec2(cp.localPoint,clipPoints2[i].v);cp.id.set(clipPoints2[i].id);cp.id.swapFeatures()}++pointCount}}manifold.pointCount=pointCount};var internal={CollidePolygons:CollidePolygons,Settings:Settings,Sweep:Sweep,Manifold:Manifold,Distance:Distance,TimeOfImpact:TimeOfImpact,DynamicTree:DynamicTree,stats:stats};var DataDriver=function(){function DataDriver2(key,listener){this._refMap={};this._map={};this._xmap={};this._data=[];this._entered=[];this._exited=[];this._key=key;this._listener=listener}DataDriver2.prototype.update=function(data){if(!Array.isArray(data))throw"Invalid data: "+data;this._entered.length=0;this._exited.length=0;this._data.length=data.length;for(var i=0;i<data.length;i++){if(typeof data[i]!=="object"||data[i]===null)continue;var d2=data[i];var id=this._key(d2);if(!this._map[id]){this._entered.push(d2)}else{delete this._map[id]}this._data[i]=d2;this._xmap[id]=d2}for(var id in this._map){this._exited.push(this._map[id]);delete this._map[id]}var temp3=this._map;this._map=this._xmap;this._xmap=temp3;for(var i=0;i<this._exited.length;i++){var d2=this._exited[i];var key=this._key(d2);var ref=this._refMap[key];this._listener.exit(d2,ref);delete this._refMap[key]}for(var i=0;i<this._entered.length;i++){var d2=this._entered[i];var key=this._key(d2);var ref=this._listener.enter(d2);if(ref){this._refMap[key]=ref}}for(var i=0;i<this._data.length;i++){if(typeof data[i]!=="object"||data[i]===null)continue;var d2=this._data[i];var key=this._key(d2);var ref=this._refMap[key];this._listener.update(d2,ref)}this._entered.length=0;this._exited.length=0;this._data.length=0};DataDriver2.prototype.ref=function(d2){return this._refMap[this._key(d2)]};return DataDriver2}();const planck=Object.freeze(Object.defineProperty({__proto__:null,AABB:AABB,Body:Body,Box:BoxShape,BoxShape:BoxShape,BroadPhase:BroadPhase,Chain:ChainShape,ChainShape:ChainShape,Circle:CircleShape,CircleShape:CircleShape,ClipVertex:ClipVertex,CollideCircles:CollideCircles,CollideEdgeCircle:CollideEdgeCircle,CollideEdgePolygon:CollideEdgePolygon,CollidePolygonCircle:CollidePolygonCircle,CollidePolygons:CollidePolygons,Contact:Contact,ContactEdge:ContactEdge,get ContactFeatureType(){return exports2.ContactFeatureType},ContactID:ContactID,ContactImpulse:ContactImpulse,DataDriver:DataDriver,Distance:Distance,DistanceInput:DistanceInput,DistanceJoint:DistanceJoint,DistanceOutput:DistanceOutput,DistanceProxy:DistanceProxy,DynamicTree:DynamicTree,Edge:EdgeShape,EdgeShape:EdgeShape,Fixture:Fixture,FixtureProxy:FixtureProxy,FrictionJoint:FrictionJoint,GearJoint:GearJoint,Joint:Joint,JointEdge:JointEdge,Manifold:Manifold,ManifoldPoint:ManifoldPoint,get ManifoldType(){return exports2.ManifoldType},Mat22:Mat22,Mat33:Mat33,Math:math,MotorJoint:MotorJoint,MouseJoint:MouseJoint,get PointState(){return exports2.PointState},Polygon:PolygonShape,PolygonShape:PolygonShape,PrismaticJoint:PrismaticJoint,PulleyJoint:PulleyJoint,RevoluteJoint:RevoluteJoint,RopeJoint:RopeJoint,Rot:Rot,Serializer:Serializer,Settings:Settings,SettingsInternal:SettingsInternal,Shape:Shape,ShapeCast:ShapeCast,ShapeCastInput:ShapeCastInput,ShapeCastOutput:ShapeCastOutput,SimplexCache:SimplexCache,Solver:Solver,Sweep:Sweep,TOIInput:TOIInput,TOIOutput:TOIOutput,get TOIOutputState(){return exports2.TOIOutputState},Testbed:Testbed,TimeOfImpact:TimeOfImpact,TimeStep:TimeStep,Transform:Transform,TreeNode:TreeNode,Vec2:Vec2,Vec3:Vec3,VelocityConstraintPoint:VelocityConstraintPoint,WeldJoint:WeldJoint,WheelJoint:WheelJoint,World:World,WorldManifold:WorldManifold,clipSegmentToLine:clipSegmentToLine,getPointStates:getPointStates,internal:internal,mixFriction:mixFriction,mixRestitution:mixRestitution,stats:stats,testOverlap:testOverlap,testbed:testbed},Symbol.toStringTag,{value:"Module"}));exports2.AABB=AABB;exports2.Body=Body;exports2.Box=BoxShape;exports2.BoxShape=BoxShape;exports2.BroadPhase=BroadPhase;exports2.Chain=ChainShape;exports2.ChainShape=ChainShape;exports2.Circle=CircleShape;exports2.CircleShape=CircleShape;exports2.ClipVertex=ClipVertex;exports2.CollideCircles=CollideCircles;exports2.CollideEdgeCircle=CollideEdgeCircle;exports2.CollideEdgePolygon=CollideEdgePolygon;exports2.CollidePolygonCircle=CollidePolygonCircle;exports2.CollidePolygons=CollidePolygons;exports2.Contact=Contact;exports2.ContactEdge=ContactEdge;exports2.ContactID=ContactID;exports2.ContactImpulse=ContactImpulse;exports2.DataDriver=DataDriver;exports2.Distance=Distance;exports2.DistanceInput=DistanceInput;exports2.DistanceJoint=DistanceJoint;exports2.DistanceOutput=DistanceOutput;exports2.DistanceProxy=DistanceProxy;exports2.DynamicTree=DynamicTree;exports2.Edge=EdgeShape;exports2.EdgeShape=EdgeShape;exports2.Fixture=Fixture;exports2.FixtureProxy=FixtureProxy;exports2.FrictionJoint=FrictionJoint;exports2.GearJoint=GearJoint;exports2.Joint=Joint;exports2.JointEdge=JointEdge;exports2.Manifold=Manifold;exports2.ManifoldPoint=ManifoldPoint;exports2.Mat22=Mat22;exports2.Mat33=Mat33;exports2.Math=math;exports2.MotorJoint=MotorJoint;exports2.MouseJoint=MouseJoint;exports2.Polygon=PolygonShape;exports2.PolygonShape=PolygonShape;exports2.PrismaticJoint=PrismaticJoint;exports2.PulleyJoint=PulleyJoint;exports2.RevoluteJoint=RevoluteJoint;exports2.RopeJoint=RopeJoint;exports2.Rot=Rot;exports2.Serializer=Serializer;exports2.Settings=Settings;exports2.SettingsInternal=SettingsInternal;exports2.Shape=Shape;exports2.ShapeCast=ShapeCast;exports2.ShapeCastInput=ShapeCastInput;exports2.ShapeCastOutput=ShapeCastOutput;exports2.SimplexCache=SimplexCache;exports2.Solver=Solver;exports2.Sweep=Sweep;exports2.TOIInput=TOIInput;exports2.TOIOutput=TOIOutput;exports2.Testbed=Testbed;exports2.TimeOfImpact=TimeOfImpact;exports2.TimeStep=TimeStep;exports2.Transform=Transform;exports2.TreeNode=TreeNode;exports2.Vec2=Vec2;exports2.Vec3=Vec3;exports2.VelocityConstraintPoint=VelocityConstraintPoint;exports2.WeldJoint=WeldJoint;exports2.WheelJoint=WheelJoint;exports2.World=World;exports2.WorldManifold=WorldManifold;exports2.clipSegmentToLine=clipSegmentToLine;exports2.default=planck;exports2.getPointStates=getPointStates;exports2.internal=internal;exports2.mixFriction=mixFriction;exports2.mixRestitution=mixRestitution;exports2.stats=stats;exports2.testOverlap=testOverlap;exports2.testbed=testbed;Object.defineProperties(exports2,{__esModule:{value:true},[Symbol.toStringTag]:{value:"Module"}})});


/* ---- physics/World2D.js ---- */
// World2D / Body2D — planck.js(Box2D) 기반 강체 물리. 파티 게임(플랫포머·탑다운·물리 난장판)용.
// 던전 게임이 쓰는 Physics/Collider2D(킨메틱 쿼리 방식)와는 별개로 공존한다. 문서: KuntoGame/API.md "World2D".
//
//  · 단위: 게임 월드 단위(Y-up). planck는 미터를 쓰므로 World2D.scale(기본 32 단위 = 1m)로 나눠 넣고 곱해서 꺼낸다.
//    → 32×32짜리 상자 = 1m 상자. 힘/속도/중력은 전부 "게임 단위"로 받는다 (중력 1400 = 약 43.75 m/s²).
//  · 고정 스텝(1/60초) + 누산기. 프레임 사이는 보간해서 Transform에 쓴다 (30fps·120Hz 화면에서도 부드럽다).
//  · 순서: GameObject.update(컨트롤러가 속도 지정) → [World2D.postUpdate: 물리 스텝 + Transform 동기화] → lateUpdate → 렌더.

class World2D {
  static current = null;

  // engine.addSystem까지 해 주는 생성 도우미. World2D.current에 등록된다 (Body2D가 기본으로 여기에 붙는다).
  static create(engine, opts = {}) {
    const w = new World2D(opts);
    engine.addSystem(w);
    World2D.current = w;
    return w;
  }

  // opts: mode 'platformer'|'topdown', gravity(숫자=아래로 N, 또는 {x,y} 단위/s²), scale(기본 32), fixedStep(1/60), maxSubsteps(5),
  //       velocityIterations(8), positionIterations(3), interpolate(true), allowSleep(true), debug(false)
  constructor(opts = {}) {
    if (typeof planck === 'undefined') throw new Error('World2D: planck.js가 로드되지 않았다 (kuntogame.js에 포함됨)');
    this.scale = opts.scale ?? 32;
    this.mode = opts.mode || 'platformer';
    this.fixedStep = opts.fixedStep ?? 1 / 60;
    this.maxSubsteps = opts.maxSubsteps ?? 5;
    this.velocityIterations = opts.velocityIterations ?? 8;
    this.positionIterations = opts.positionIterations ?? 3;
    this.interpolate = opts.interpolate ?? true;
    this.debug = !!opts.debug;
    this.paused = false;
    const g = opts.gravity ?? (this.mode === 'platformer' ? 1400 : 0);
    this.world = new planck.World({ gravity: new planck.Vec2(0, 0), allowSleep: opts.allowSleep ?? true });
    this.setGravity(typeof g === 'number' ? 0 : g.x || 0, typeof g === 'number' ? -g : g.y || 0);
    this.engine = null;
    this.bodies = [];            // 등록된 Body2D
    this.joints = [];            // Joint2D
    this.stepCount = 0;          // 지금까지 돈 고정 스텝 수
    this.time = 0;               // 시뮬레이션 시간(초)
    this.lastStepMs = 0;         // 지난 프레임 물리 스텝에 쓴 시간 (ms)
    this._acc = 0; this._alpha = 0; this._stepping = false; this._deferred = [];
    this._layers = { Default: 1 }; this._nLayers = 1;
    this._preSolveOn = false; this._postSolveOn = false;
    this._ground = null;         // MouseJoint 등에 쓰는 정적 몸체 (처음 필요할 때 만든다)
    this.info = { self: null, other: null, selfObject: null, otherObject: null, selfTag: '', otherTag: '', sensor: false, normalX: 0, normalY: 0, pointX: 0, pointY: 0, impulse: 0, contact: null, disable() { if (this.contact) this.contact.setEnabled(false); } };
    this.hit = { hit: false, body: null, tag: '', x: 0, y: 0, nx: 0, ny: 0, fraction: 0, distance: 0 };
    this._rc = { mask: 0xffff, ignore: null, sensors: false, out: null, x1: 0, y1: 0, x2: 0, y2: 0, len: 0 };
    this._rcCb = (fixture, point, normal, fraction) => this._onRay(fixture, point, normal, fraction);
    this._q = { mask: 0xffff, out: null, n: 0, x: 0, y: 0, r: 0, mode: 0, shape: null, xf: null, stamp: 0 };
    this._qCb = fixture => this._onQuery(fixture);
    this._stampN = 0;
    this._pre = (c, m) => this._onPreSolve(c, m);
    this._post = (c, imp) => this._onPostSolve(c, imp);
    this.world.on('begin-contact', c => this._onContact(c, true));
    this.world.on('end-contact', c => this._onContact(c, false));
    this.world.on('remove-joint', j => { const w = j.__j2d; if (w) { w.alive = false; const i = this.joints.indexOf(w); if (i >= 0) this.joints.splice(i, 1); } });
  }

  // ---- 시스템 훅 (Engine이 부른다) ----
  attach(engine) { this.engine = engine; }
  detach() { this.engine = null; if (World2D.current === this) World2D.current = null; }

  postUpdate() {
    if (this.paused) return;
    const t0 = performance.now();
    this._acc += Math.min(Time.deltaTime, 0.1);
    const fs = this.fixedStep; let n = 0;
    while (this._acc >= fs && n < this.maxSubsteps) { this._fixedStep(fs); this._acc -= fs; n++; }
    if (n === this.maxSubsteps && this._acc >= fs) this._acc = 0; // 너무 밀리면 따라잡기를 포기한다
    this._alpha = this.interpolate ? this._acc / fs : 1;
    this._syncOut(this._alpha);
    this.lastStepMs = performance.now() - t0;
  }

  setGravity(gx, gy) { const s = this.scale; this.world.setGravity(new planck.Vec2(gx / s, gy / s)); return this; }

  // 고정 스텝 한 번. 직접 돌려도 된다 (테스트·결정적 재생용). Time과 무관.
  step(dt = this.fixedStep) { this._fixedStep(dt); this._syncOut(1); return this; }

  _fixedStep(dt) {
    const bs = this.bodies, S = this.scale;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i], pb = b.body; if (!pb) continue;
      if (b._timer > 0) { b.dropT = Math.max(0, b.dropT - dt); }
      if (b._kinTransform) { // 킨메틱 + Transform 구동: 목표 위치까지 이번 스텝에 가도록 속도를 준다 (위에 탄 몸체가 같이 실려 간다)
        const m = b.transform.worldMatrix, p = pb.getPosition();
        pb.setLinearVelocity(new planck.Vec2((m.e / S - p.x) / dt, (m.f / S - p.y) / dt));
        let da = m.getRotation() - pb.getAngle(); da = Math.atan2(Math.sin(da), Math.cos(da)); pb.setAngularVelocity(da / dt);
      } else if (b._moves) { b._px = b._cx; b._py = b._cy; b._pa = b._ca; }
      if (b._fixed) { const cs = b.gameObject.components; for (let k = 0; k < cs.length; k++) { const c = cs[k]; if (typeof c.fixedUpdate === 'function' && c.enabled) c.fixedUpdate(dt); } }
    }
    this._stepping = true;
    this.world.step(dt, this.velocityIterations, this.positionIterations);
    this._stepping = false;
    this.stepCount++; this.time += dt;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i], pb = b.body; if (!pb || !b._moves) continue;
      if (b._kinTransform) continue;
      const p = pb.getPosition(); b._cx = p.x; b._cy = p.y; b._ca = pb.getAngle();
    }
    if (this._deferred.length) { const d = this._deferred; this._deferred = []; for (let i = 0; i < d.length; i++) d[i](); }
  }

  _syncOut(alpha) {
    const bs = this.bodies, S = this.scale;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i]; if (!b.body || !b._moves || b._kinTransform) continue;
      const t = b.transform; let x, y, a;
      if (alpha >= 1) { x = b._cx; y = b._cy; a = b._ca; }
      else { x = b._px + (b._cx - b._px) * alpha; y = b._py + (b._cy - b._py) * alpha; let da = b._ca - b._pa; if (da > 3.2 || da < -3.2) da = 0; a = b._pa + da * alpha; }
      if (b._sx === x && b._sy === y && b._sa === a) continue; // 안 움직였으면 Transform을 건드리지 않는다 (행렬 재계산 방지)
      b._sx = x; b._sy = y; b._sa = a;
      if (!t.parent) t.setLocalPosition(x * S, y * S); else t.setPosition(x * S, y * S);
      if (!b.fixedAngle) t.localRotation = a;
    }
  }

  // ---- 레이어(충돌 분류) ----
  // 이름 → 비트 (최대 16개). 'Default'는 1.
  layer(name) {
    let v = this._layers[name];
    if (v === undefined) { if (this._nLayers >= 16) throw new Error('World2D: 레이어는 최대 16개'); v = 1 << this._nLayers++; this._layers[name] = v; }
    return v;
  }
  // 숫자(비트)·이름·이름 배열·'all' → 비트마스크
  bits(x) {
    if (x === undefined || x === null || x === 'all') return 0xffff;
    if (typeof x === 'number') return x;
    if (typeof x === 'string') return this.layer(x);
    let r = 0; for (let i = 0; i < x.length; i++) r |= this.bits(x[i]); return r;
  }

  // ---- 몸체 등록 (Body2D가 부른다) ----
  _add(b) { b._wi = this.bodies.length; this.bodies.push(b); }
  _remove(b) {
    const i = b._wi; if (i === undefined || this.bodies[i] !== b) return;
    const last = this.bodies.pop(); if (last !== b) { this.bodies[i] = last; last._wi = i; }
    b._wi = undefined;
  }
  // 콜백 안에서는 몸체·조인트를 만들거나 지울 수 없다. 스텝이 끝난 뒤로 미룬다.
  defer(fn) { if (this._stepping) this._deferred.push(fn); else fn(); }

  // 정적 땅 몸체 (MouseJoint 등에서 쓴다)
  get groundBody() { return this._ground || (this._ground = this.world.createBody({ type: 'static' })); }

  // ---- 질의 ----
  // 선분 레이캐스트: 가장 가까운 것. opts: { mask, ignore(Body2D), sensors }. 결과는 공유 객체(world.hit) — 바로 읽을 것.
  raycast(x1, y1, x2, y2, opts) {
    const r = this._rc, S = this.scale;
    r.mask = opts && opts.mask !== undefined ? this.bits(opts.mask) : 0xffff; r.ignore = opts && opts.ignore || null; r.sensors = !!(opts && opts.sensors); r.out = null;
    r.x1 = x1; r.y1 = y1; r.x2 = x2; r.y2 = y2; r.len = Math.hypot(x2 - x1, y2 - y1);
    const h = this.hit; h.hit = false; h.body = null; h.tag = ''; h.fraction = 1; h.distance = r.len;
    if (r.len < 1e-6) return h;
    this.world.rayCast(new planck.Vec2(x1 / S, y1 / S), new planck.Vec2(x2 / S, y2 / S), this._rcCb);
    return h;
  }
  // 선분 위 전부. out 배열에 {body, tag, x, y, nx, ny, fraction}를 채워 개수를 돌려준다 (정렬 안 됨).
  raycastAll(x1, y1, x2, y2, out, opts) {
    const r = this._rc, S = this.scale;
    r.mask = opts && opts.mask !== undefined ? this.bits(opts.mask) : 0xffff; r.ignore = opts && opts.ignore || null; r.sensors = !!(opts && opts.sensors); r.out = out; out.length = 0;
    r.x1 = x1; r.y1 = y1; r.x2 = x2; r.y2 = y2; r.len = Math.hypot(x2 - x1, y2 - y1);
    this.world.rayCast(new planck.Vec2(x1 / S, y1 / S), new planck.Vec2(x2 / S, y2 / S), this._rcCb);
    r.out = null; return out.length;
  }
  _onRay(fixture, point, normal, fraction) {
    const r = this._rc, ud = fixture.getUserData(); if (!ud) return -1;
    if (!r.sensors && fixture.isSensor()) return -1;
    if (r.ignore && ud.body === r.ignore) return -1;
    if (!(fixture.getFilterCategoryBits() & r.mask)) return -1;
    const S = this.scale;
    if (r.out) { r.out.push({ body: ud.body, tag: ud.tag, x: point.x * S, y: point.y * S, nx: normal.x, ny: normal.y, fraction }); return 1; }
    const h = this.hit; h.hit = true; h.body = ud.body; h.tag = ud.tag; h.x = point.x * S; h.y = point.y * S; h.nx = normal.x; h.ny = normal.y; h.fraction = fraction; h.distance = fraction * r.len;
    return fraction; // 여기까지로 자른다 → 가장 가까운 것만 남는다
  }
  // 사각형 안(겹치는) 몸체들. out 배열을 비우고 채운 뒤 개수 반환. mask: 레이어 이름/비트.
  queryAABB(minX, minY, maxX, maxY, out, mask) {
    const q = this._q, S = this.scale; out.length = 0;
    q.mask = this.bits(mask); q.out = out; q.mode = 0; q.stamp = ++this._stampN;
    this.world.queryAABB({ lowerBound: new planck.Vec2(minX / S, minY / S), upperBound: new planck.Vec2(maxX / S, maxY / S) }, this._qCb);
    q.out = null; return out.length;
  }
  // 점을 포함하는 몸체들 (정확한 도형 판정)
  queryPoint(x, y, out, mask) {
    const q = this._q, S = this.scale; out.length = 0;
    q.mask = this.bits(mask); q.out = out; q.mode = 1; q.x = x / S; q.y = y / S; q.stamp = ++this._stampN;
    const e = 0.001;
    this.world.queryAABB({ lowerBound: new planck.Vec2(q.x - e, q.y - e), upperBound: new planck.Vec2(q.x + e, q.y + e) }, this._qCb);
    q.out = null; return out.length;
  }
  // 원과 겹치는 몸체들 (정확한 도형 판정)
  overlapCircle(x, y, r, out, mask) {
    const q = this._q, S = this.scale; out.length = 0;
    q.mask = this.bits(mask); q.out = out; q.mode = 2; q.x = x / S; q.y = y / S; q.r = r / S; q.stamp = ++this._stampN;
    q.shape = new planck.Circle(new planck.Vec2(0, 0), q.r); q.xf = planck.Transform ? new planck.Transform(new planck.Vec2(q.x, q.y), 0) : null;
    this.world.queryAABB({ lowerBound: new planck.Vec2(q.x - q.r, q.y - q.r), upperBound: new planck.Vec2(q.x + q.r, q.y + q.r) }, this._qCb);
    q.out = null; return out.length;
  }
  _onQuery(fixture) {
    const q = this._q, ud = fixture.getUserData(); if (!ud) return true;
    if (fixture.isSensor() || !(fixture.getFilterCategoryBits() & q.mask)) return true;
    const body = ud.body;
    if (q.mode === 1 && !fixture.testPoint(new planck.Vec2(q.x, q.y))) return true;
    if (q.mode === 2 && !planck.testOverlap(q.shape, 0, fixture.getShape(), 0, q.xf, fixture.getBody().getTransform())) return true;
    if (body._qStamp === q.stamp) return true; body._qStamp = q.stamp; q.out.push(body); return true;
  }

  // ---- 조인트 ----  (좌표는 전부 게임 월드 좌표. 각도는 라디안)
  _joint(pj, a, b) { const j = new Joint2D(this, pj, a, b); pj.__j2d = j; this.joints.push(j); return j; }
  _bd(b) { return b instanceof Body2D ? b.body : b; }
  // 회전 관절(경첩). opts: { limit:[최소,최대], motor:{speed, maxTorque}, collide }
  revolute(a, b, x, y, opts = {}) {
    const S = this.scale, o = { collideConnected: !!opts.collide };
    if (opts.limit) { o.enableLimit = true; o.lowerAngle = opts.limit[0]; o.upperAngle = opts.limit[1]; }
    if (opts.motor) { o.enableMotor = true; o.motorSpeed = opts.motor.speed || 0; o.maxMotorTorque = (opts.motor.maxTorque ?? 1000) / (S * S); }
    return this._joint(this.world.createJoint(new planck.RevoluteJoint(o, this._bd(a), this._bd(b), new planck.Vec2(x / S, y / S))), a, b);
  }
  // 용접(딱 붙이기). frequency>0이면 스프링처럼 물렁하게.
  weld(a, b, x, y, opts = {}) {
    const S = this.scale, o = { collideConnected: !!opts.collide, frequencyHz: opts.frequency ?? 0, dampingRatio: opts.damping ?? 0 };
    return this._joint(this.world.createJoint(new planck.WeldJoint(o, this._bd(a), this._bd(b), new planck.Vec2(x / S, y / S))), a, b);
  }
  // 거리(막대/스프링). (ax,ay)는 A 위의 월드 점, (bx,by)는 B 위의 월드 점. opts: { length, frequency, damping, collide }
  distance(a, b, ax, ay, bx, by, opts = {}) {
    const S = this.scale, o = { collideConnected: !!opts.collide, frequencyHz: opts.frequency ?? 0, dampingRatio: opts.damping ?? 0 };
    if (opts.length !== undefined) o.length = opts.length / S;
    return this._joint(this.world.createJoint(new planck.DistanceJoint(o, this._bd(a), this._bd(b), new planck.Vec2(ax / S, ay / S), new planck.Vec2(bx / S, by / S))), a, b);
  }
  // 밧줄 (최대 길이까지만 자유롭고 그 이상은 못 늘어난다)
  rope(a, b, maxLength, ax, ay, bx, by) {
    const S = this.scale, A = this._bd(a), B = this._bd(b), pa = A.getPosition(), pb = B.getPosition();
    const o = { maxLength: maxLength / S, localAnchorA: A.getLocalPoint(new planck.Vec2(ax !== undefined ? ax / S : pa.x, ay !== undefined ? ay / S : pa.y)), localAnchorB: B.getLocalPoint(new planck.Vec2(bx !== undefined ? bx / S : pb.x, by !== undefined ? by / S : pb.y)), collideConnected: false };
    return this._joint(this.world.createJoint(new planck.RopeJoint(o, A, B)), a, b);
  }
  // 직선 슬라이더. 축(axisX, axisY). opts: { limit:[min,max](단위), motor:{speed, maxForce} }
  prismatic(a, b, x, y, axisX, axisY, opts = {}) {
    const S = this.scale, o = { collideConnected: !!opts.collide };
    if (opts.limit) { o.enableLimit = true; o.lowerTranslation = opts.limit[0] / S; o.upperTranslation = opts.limit[1] / S; }
    if (opts.motor) { o.enableMotor = true; o.motorSpeed = (opts.motor.speed || 0) / S; o.maxMotorForce = (opts.motor.maxForce ?? 1000) / S; }
    return this._joint(this.world.createJoint(new planck.PrismaticJoint(o, this._bd(a), this._bd(b), new planck.Vec2(x / S, y / S), new planck.Vec2(axisX, axisY))), a, b);
  }
  // 바퀴(서스펜션). 축 기본은 위아래. opts: { frequency, damping, motor:{speed(rad/s), maxTorque} }
  wheel(a, b, x, y, axisX = 0, axisY = 1, opts = {}) {
    const S = this.scale, o = { collideConnected: !!opts.collide, frequencyHz: opts.frequency ?? 4, dampingRatio: opts.damping ?? 0.7 };
    if (opts.motor) { o.enableMotor = true; o.motorSpeed = opts.motor.speed || 0; o.maxMotorTorque = (opts.motor.maxTorque ?? 1000) / (S * S); }
    return this._joint(this.world.createJoint(new planck.WheelJoint(o, this._bd(a), this._bd(b), new planck.Vec2(x / S, y / S), new planck.Vec2(axisX, axisY))), a, b);
  }
  // 마우스(손으로 잡아끌기). setTarget(x,y)로 목표를 옮긴다. opts: { maxForce, frequency, damping }
  mouse(body, x, y, opts = {}) {
    const S = this.scale, bd = this._bd(body);
    const o = { maxForce: (opts.maxForce ?? 1000) * bd.getMass() / S, frequencyHz: opts.frequency ?? 5, dampingRatio: opts.damping ?? 0.7 };
    return this._joint(this.world.createJoint(new planck.MouseJoint(o, this.groundBody, bd, new planck.Vec2(x / S, y / S))), null, body);
  }

  // 월드를 통째로 정리한다 (씬 전환 때)
  destroy() {
    for (let i = this.bodies.length - 1; i >= 0; i--) { const b = this.bodies[i]; b.body = null; b.world = null; }
    this.bodies.length = 0; this.joints.length = 0;
    if (this.engine) this.engine.removeSystem(this);
    this.world = null;
  }

  // ---- 접촉 이벤트 ----
  _onContact(c, begin) {
    const fa = c.getFixtureA(), fb = c.getFixtureB(), ua = fa.getUserData(), ub = fb.getUserData(); if (!ua || !ub) return;
    const A = ua.body, B = ub.body, fl = begin ? 1 : 2;
    const wa = A._cbMask() & fl, wb = B._cbMask() & fl; if (!wa && !wb) return;
    const info = this.info, S = this.scale, sensor = fa.isSensor() || fb.isSensor();
    let nx = 0, ny = 0, px = 0, py = 0;
    if (begin && !sensor) { const wm = c.getWorldManifold(null); if (wm) { nx = wm.normal.x; ny = wm.normal.y; if (wm.points && wm.points[0]) { px = wm.points[0].x * S; py = wm.points[0].y * S; } } }
    const name = begin ? 'onBeginContact' : 'onEndContact';
    info.contact = c; info.sensor = sensor; info.impulse = 0;
    if (wa) { info.self = A; info.other = B; info.selfObject = A.gameObject; info.otherObject = B.gameObject; info.selfTag = ua.tag; info.otherTag = ub.tag; info.normalX = nx; info.normalY = ny; info.pointX = px; info.pointY = py; A._emit(name, info); }
    if (wb) { info.self = B; info.other = A; info.selfObject = B.gameObject; info.otherObject = A.gameObject; info.selfTag = ub.tag; info.otherTag = ua.tag; info.normalX = -nx; info.normalY = -ny; info.pointX = px; info.pointY = py; B._emit(name, info); }
    info.contact = null; info.self = info.other = info.selfObject = info.otherObject = null;
  }
  _enablePreSolve() { if (!this._preSolveOn) { this._preSolveOn = true; this.world.on('pre-solve', this._pre); } }
  _enablePostSolve() { if (!this._postSolveOn) { this._postSolveOn = true; this.world.on('post-solve', this._post); } }
  _onPreSolve(c) {
    const fa = c.getFixtureA(), fb = c.getFixtureB(), ua = fa.getUserData(), ub = fb.getUserData(); if (!ua || !ub) return;
    // 한쪽 통과 발판 (oneWay: 위에서 밟을 수는 있지만 아래/옆에서는 통과한다)
    let ow = ua.oneWay ? fa : ub.oneWay ? fb : null;
    if (ow) {
      const fo = ow === fa ? fb : fa, uo = ow === fa ? ub : ua, ob = fo.getBody(), pb = ow.getBody();
      if (uo.oneWay) return; // 발판끼리는 무시
      if (uo.body.dropT > 0) { c.setEnabled(false); return; } // 아래로 내려가는 중
      const top = ow.getAABB(0).upperBound.y, bottom = fo.getAABB(0).lowerBound.y;
      const rel = ob.getLinearVelocity().y - pb.getLinearVelocity().y;
      const tol = 0.1 + Math.max(0, -rel) * this.fixedStep * 1.5;
      if (bottom < top - tol || rel > 0.5) { c.setEnabled(false); return; }
    }
    const fl = 4, A = ua.body, B = ub.body, wa = A._cbMask() & fl, wb = B._cbMask() & fl; if (!wa && !wb) return;
    const info = this.info; info.contact = c; info.sensor = false; info.impulse = 0;
    if (wa) { info.self = A; info.other = B; info.selfObject = A.gameObject; info.otherObject = B.gameObject; info.selfTag = ua.tag; info.otherTag = ub.tag; A._emit('onPreSolve', info); }
    if (wb) { info.self = B; info.other = A; info.selfObject = B.gameObject; info.otherObject = A.gameObject; info.selfTag = ub.tag; info.otherTag = ua.tag; B._emit('onPreSolve', info); }
    info.contact = null; info.self = info.other = info.selfObject = info.otherObject = null;
  }
  _onPostSolve(c, imp) {
    const fa = c.getFixtureA(), fb = c.getFixtureB(), ua = fa.getUserData(), ub = fb.getUserData(); if (!ua || !ub) return;
    const fl = 8, A = ua.body, B = ub.body, wa = A._cbMask() & fl, wb = B._cbMask() & fl; if (!wa && !wb) return;
    let sum = 0; const ni = imp && imp.normalImpulses; if (ni) for (let i = 0; i < ni.length; i++) sum += ni[i];
    sum *= this.scale; // kg·단위/s
    const info = this.info; info.contact = c; info.sensor = false; info.impulse = sum;
    if (wa) { info.self = A; info.other = B; info.selfObject = A.gameObject; info.otherObject = B.gameObject; info.selfTag = ua.tag; info.otherTag = ub.tag; A._emit('onPostSolve', info); }
    if (wb) { info.self = B; info.other = A; info.selfObject = B.gameObject; info.otherObject = A.gameObject; info.selfTag = ub.tag; info.otherTag = ua.tag; B._emit('onPostSolve', info); }
    info.contact = null; info.self = info.other = info.selfObject = info.otherObject = null;
  }

  // ---- 디버그 표시 (world.debug = true) ----
  render(ctx) {
    if (!this.debug || !Camera.main) return;
    const m = Camera.main.viewMatrix, S = this.scale; ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f); ctx.lineWidth = 0.9;
    for (let body = this.world.getBodyList(); body; body = body.getNext()) {
      const xf = body.getTransform(), ca = Math.cos(xf.q.getAngle()), sa = Math.sin(xf.q.getAngle());
      ctx.strokeStyle = !body.isActive() ? '#888' : body.isStatic() ? '#66ff66' : body.isKinematic() ? '#4fc3f7' : body.isAwake() ? '#ffee58' : '#ff9800';
      for (let f = body.getFixtureList(); f; f = f.getNext()) {
        const sh = f.getShape(), type = sh.getType(); ctx.beginPath();
        if (f.isSensor()) ctx.setLineDash([3, 3]); else ctx.setLineDash([]);
        if (type === 'circle') { const p = sh.m_p, cx = (xf.p.x + ca * p.x - sa * p.y) * S, cy = (xf.p.y + sa * p.x + ca * p.y) * S; ctx.arc(cx, cy, sh.m_radius * S, 0, 7); ctx.moveTo(cx, cy); ctx.lineTo(cx + ca * sh.m_radius * S, cy + sa * sh.m_radius * S); }
        else if (type === 'polygon') { const vs = sh.m_vertices; for (let i = 0; i < vs.length; i++) { const v = vs[i], x = (xf.p.x + ca * v.x - sa * v.y) * S, y = (xf.p.y + sa * v.x + ca * v.y) * S; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); }
        else if (type === 'edge') { const a = sh.m_vertex1, b = sh.m_vertex2; ctx.moveTo((xf.p.x + ca * a.x - sa * a.y) * S, (xf.p.y + sa * a.x + ca * a.y) * S); ctx.lineTo((xf.p.x + ca * b.x - sa * b.y) * S, (xf.p.y + sa * b.x + ca * b.y) * S); }
        else if (type === 'chain') { const vs = sh.m_vertices; for (let i = 0; i < vs.length; i++) { const v = vs[i], x = (xf.p.x + ca * v.x - sa * v.y) * S, y = (xf.p.y + sa * v.x + ca * v.y) * S; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } }
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }
}

// 조인트 래퍼. world.revolute() 등이 돌려준다.
class Joint2D {
  constructor(world, pj, a, b) { this.world = world; this.joint = pj; this.a = a; this.b = b; this.alive = true; }
  destroy() { if (!this.alive) return; const w = this.world; w.defer(() => { if (this.alive && w.world) w.world.destroyJoint(this.joint); }); }
  setMotor(speed, maxTorque) { const j = this.joint, S = this.world.scale; if (speed === null) { j.enableMotor(false); return this; } j.enableMotor(true); j.setMotorSpeed(j.m_type === 'prismatic-joint' ? speed / S : speed); if (maxTorque !== undefined) { if (j.setMaxMotorTorque) j.setMaxMotorTorque(maxTorque / (S * S)); else if (j.setMaxMotorForce) j.setMaxMotorForce(maxTorque / S); } return this; }
  setLimits(lo, hi) { const j = this.joint; if (j.setLimits) { j.enableLimit(true); j.setLimits(lo, hi); } return this; }
  setTarget(x, y) { const S = this.world.scale; this.joint.setTarget(new planck.Vec2(x / S, y / S)); return this; }
  setLength(len) { if (this.joint.setLength) this.joint.setLength(len / this.world.scale); return this; }
  get angle() { return this.joint.getJointAngle ? this.joint.getJointAngle() : 0; }
}

// 몸체 한 개. GameObject에 붙이면 Transform과 planck 몸체가 같이 움직인다.
// 생성 옵션(opts):
//   type 'dynamic'|'static'|'kinematic' (기본 dynamic)
//   shape 'box'|'circle'|'capsule'|'polygon'|'edge'|'chain' + w,h | radius | points | x1,y1,x2,y2   (한 개짜리 단축)
//   fixtures [ {shape, w,h,radius,points, x,y(오프셋), angle, sensor, tag, density, friction, restitution, category, mask, group, oneWay, color} ]  (여러 개)
//   density(1) friction(0.4) restitution(0) category('Default') mask('all') group(0) sensor(false)
//   fixedRotation linearDamping angularDamping gravityScale bullet(빠른 탄은 true) allowSleep
//   drive 'transform'|'velocity'  (kinematic 전용: Transform을 움직여 구동(기본) / 속도를 줘서 구동)
//   fixedAngle(true면 몸체가 돌아도 Transform 회전은 안 쓴다) preSolve postSolve (해당 콜백을 받으려면 true)
//   onBegin/onEnd/onPreSolve/onPostSolve : 함수로도 받을 수 있다 (info 하나를 인자로)
//   world 지정이 없으면 World2D.current.
// GameObject 안의 다른 컴포넌트에 onBeginContact(info) / onEndContact(info) / onPreSolve(info) / onPostSolve(info) 를 만들면 불린다.
//   info(공유 객체, 콜백 안에서만 유효): self, other, selfObject, otherObject, selfTag, otherTag, sensor, normalX/Y(self→other), pointX/Y, impulse, disable()
class Body2D extends Component {
  constructor(opts = {}) {
    super();
    this.opts = opts; this.world = null; this.body = null;
    this.type = opts.type || 'dynamic';
    this.oneWay = false;      // 한쪽 통과 발판 도형이 있는지
    this.dropT = 0;           // >0이면 한쪽 통과 발판을 무시한다 (아래로 내려가기)
    this.fixedAngle = !!opts.fixedAngle;
    this.hw = 0; this.hh = 0; // 충돌 도형 전체의 반폭/반높이 (단위, 센서 제외)
    this.tags = {};           // tag → planck fixture
    this._cx = 0; this._cy = 0; this._ca = 0; this._px = 0; this._py = 0; this._pa = 0; this._sx = NaN; this._sy = NaN; this._sa = NaN;
    this._moves = false; this._kinTransform = false; this._fixed = false; this._timer = 1; this._wi = undefined; this._qStamp = 0;
    this._cb = -1; this._cbN = -1; this.cb = { onBegin: opts.onBegin, onEnd: opts.onEnd, onPreSolve: opts.onPreSolve, onPostSolve: opts.onPostSolve };
    this.defs = [];           // 정규화된 도형 정의 (BodyRenderer가 그린다)
  }

  // ---- 생성/파괴 ----
  awake() { this._create(); }
  onDestroy() { this._dispose(); }
  onEnable() { if (this.body) this.body.setActive(true); }
  onDisable() { if (this.body) this.body.setActive(false); }

  _create() {
    if (this.body) return;
    const w = this.opts.world || World2D.current; if (!w) throw new Error('Body2D: World2D가 없다 (World2D.create(engine)를 먼저)');
    this.world = w; const S = w.scale, o = this.opts, m = this.transform.worldMatrix;
    const bd = { type: this.type, position: new planck.Vec2(m.e / S, m.f / S), angle: m.getRotation(), fixedRotation: !!o.fixedRotation, bullet: !!o.bullet, userData: this,
      linearDamping: o.linearDamping ?? (w.mode === 'topdown' && this.type === 'dynamic' ? 4 : 0), angularDamping: o.angularDamping ?? (w.mode === 'topdown' ? 4 : 0.05), gravityScale: o.gravityScale ?? 1, allowSleep: o.allowSleep ?? true };
    this.body = w.world.createBody(bd);
    const defs = o.fixtures ? o.fixtures : [o];
    for (let i = 0; i < defs.length; i++) this._addFixtureDef(defs[i], o);
    if (this.type === 'dynamic') this.body.resetMassData();
    const p = this.body.getPosition(); this._cx = this._px = p.x; this._cy = this._py = p.y; this._ca = this._pa = this.body.getAngle();
    this._setDrive();
    this._cbN = -1; if (this._cbMask() & 4 || o.preSolve) w._enablePreSolve(); if (o.postSolve) w._enablePostSolve();
    w._add(this);
  }
  _setDrive() {
    const k = this.type === 'kinematic', drive = this.opts.drive || 'transform';
    this._kinTransform = k && drive === 'transform';
    this._moves = this.type === 'dynamic' || (k && !this._kinTransform);
    if (this._kinTransform) this.body.setLinearVelocity(new planck.Vec2(0, 0));
  }
  _dispose() {
    const w = this.world, pb = this.body; if (!w) return;
    w._remove(this); this.body = null;
    if (pb && w.world) w.defer(() => { if (w.world && pb.getWorld()) w.world.destroyBody(pb); });
  }

  // 도형 한 개(또는 캡슐처럼 여러 fixture) 추가. 나중에 호출해도 된다. 반환: 만든 planck fixture 배열.
  addFixture(def) { const r = this._addFixtureDef(def, this.opts); if (this.type === 'dynamic') this.body.resetMassData(); return r; }
  _addFixtureDef(d, base) {
    const w = this.world, S = w.scale, out = [], sensor = d.sensor ?? false, density = d.density ?? base.density ?? 1;
    const fd = { density: this.type === 'dynamic' ? density : 0, friction: d.friction ?? base.friction ?? 0.4, restitution: d.restitution ?? base.restitution ?? 0, isSensor: !!sensor,
      filterCategoryBits: w.bits(d.category ?? base.category ?? 'Default') & 0xffff, filterMaskBits: w.bits(d.mask ?? base.mask), filterGroupIndex: d.group ?? base.group ?? 0,
      userData: { body: this, tag: d.tag || '', oneWay: !!d.oneWay } };
    if (d.category === undefined && base.category === undefined) fd.filterCategoryBits = 1;
    const ox = d.x || 0, oy = d.y || 0, ang = d.angle || 0, shape = d.shape || 'box';
    const mk = (sh, tagSuffix) => { const f = this.body.createFixture(sh, fd); out.push(f); if (d.tag) this.tags[d.tag + (tagSuffix || '')] = f; return f; };
    const def = { shape, x: ox, y: oy, angle: ang, color: d.color, sensor, tag: d.tag || '' };
    let ex = 0, ey = 0;
    if (shape === 'box') {
      const hw = (d.w ?? 32) / 2, hh = (d.h ?? 32) / 2; def.w = hw * 2; def.h = hh * 2;
      mk(new planck.Box(hw / S, hh / S, new planck.Vec2(ox / S, oy / S), ang)); ex = Math.abs(ox) + hw; ey = Math.abs(oy) + hh;
    } else if (shape === 'circle') {
      const r = d.radius ?? 16; def.radius = r; mk(new planck.Circle(new planck.Vec2(ox / S, oy / S), r / S)); ex = Math.abs(ox) + r; ey = Math.abs(oy) + r;
    } else if (shape === 'capsule') { // 세로(h>w) 또는 가로 캡슐: 가운데 상자 + 양 끝 원 (모서리에 걸리지 않는 캐릭터용)
      const cw = d.w ?? 24, ch = d.h ?? 40, vert = ch >= cw, r = (vert ? cw : ch) / 2, len = Math.max(0, (vert ? ch : cw) - 2 * r);
      def.w = cw; def.h = ch; def.vertical = vert;
      const c = Math.cos(ang), s = Math.sin(ang), ax = vert ? 0 : 1, ay = vert ? 1 : 0;
      if (len > 0) mk(new planck.Box((vert ? r : len / 2) / S, (vert ? len / 2 : r) / S, new planck.Vec2(ox / S, oy / S), ang));
      for (const sgn of [-1, 1]) { const px = ox + (ax * c - ay * s) * sgn * len / 2, py = oy + (ax * s + ay * c) * sgn * len / 2; mk(new planck.Circle(new planck.Vec2(px / S, py / S), r / S)); }
      ex = Math.abs(ox) + cw / 2; ey = Math.abs(oy) + ch / 2;
    } else if (shape === 'polygon') {
      const pts = d.points.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p); def.points = pts;
      const c = Math.cos(ang), s = Math.sin(ang);
      mk(new planck.Polygon(pts.map(p => new planck.Vec2((ox + p.x * c - p.y * s) / S, (oy + p.x * s + p.y * c) / S))));
      for (const p of pts) { ex = Math.max(ex, Math.abs(ox + p.x)); ey = Math.max(ey, Math.abs(oy + p.y)); }
    } else if (shape === 'edge') {
      def.x1 = d.x1; def.y1 = d.y1; def.x2 = d.x2; def.y2 = d.y2; mk(new planck.Edge(new planck.Vec2(d.x1 / S, d.y1 / S), new planck.Vec2(d.x2 / S, d.y2 / S)));
      ex = Math.max(Math.abs(d.x1), Math.abs(d.x2)); ey = Math.max(Math.abs(d.y1), Math.abs(d.y2));
    } else if (shape === 'chain') {
      const pts = d.points.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p); def.points = pts; def.loop = !!d.loop;
      mk(new planck.Chain(pts.map(p => new planck.Vec2(p.x / S, p.y / S)), !!d.loop)); for (const p of pts) { ex = Math.max(ex, Math.abs(p.x)); ey = Math.max(ey, Math.abs(p.y)); }
    } else throw new Error('Body2D: 알 수 없는 shape ' + shape);
    if (!sensor) { this.hw = Math.max(this.hw, ex); this.hh = Math.max(this.hh, ey); }
    if (d.oneWay) { w._enablePreSolve(); this.oneWay = true; }
    this.defs.push(def);
    return out;
  }

  // ---- 콜백 ----
  _cbMask() { // 1 begin, 2 end, 4 preSolve, 8 postSolve — 붙어 있는 컴포넌트에서 한 번 읽어 둔다 (컴포넌트 수가 바뀌면 다시)
    const cs = this._gameObject ? this._gameObject.components : null; if (!cs) return 0;
    if (this._cbN === cs.length && this._cb >= 0) return this._cb;
    let m = 0; const c0 = this.cb; if (c0.onBegin) m |= 1; if (c0.onEnd) m |= 2; if (c0.onPreSolve) m |= 4; if (c0.onPostSolve) m |= 8;
    for (let i = 0; i < cs.length; i++) { const c = cs[i]; if (typeof c.onBeginContact === 'function') m |= 1; if (typeof c.onEndContact === 'function') m |= 2; if (typeof c.onPreSolve === 'function') m |= 4; if (typeof c.onPostSolve === 'function') m |= 8; if (typeof c.fixedUpdate === 'function') this._fixed = true; }
    if ((m & 4) && this.world) this.world._enablePreSolve(); if ((m & 8) && this.world) this.world._enablePostSolve();
    this._cbN = cs.length; return (this._cb = m);
  }
  refreshCallbacks() { this._cb = -1; this._cbMask(); }
  _emit(name, info) {
    const f = this.cb[name === 'onBeginContact' ? 'onBegin' : name === 'onEndContact' ? 'onEnd' : name]; if (f) f(info);
    const cs = this._gameObject.components; for (let i = 0; i < cs.length; i++) { const c = cs[i]; if (typeof c[name] === 'function') c[name](info); }
  }

  // ---- 상태 읽기/쓰기 (전부 게임 단위) ----
  get x() { return this._cx * this.world.scale; }
  get y() { return this._cy * this.world.scale; }
  get angle() { return this.body.getAngle(); }
  set angle(a) { this.body.setAngle(a); this._ca = a; }
  get vx() { return this.body.getLinearVelocity().x * this.world.scale; }
  get vy() { return this.body.getLinearVelocity().y * this.world.scale; }
  set vx(v) { const lv = this.body.getLinearVelocity(); this.body.setLinearVelocity(new planck.Vec2(v / this.world.scale, lv.y)); this.body.setAwake(true); }
  set vy(v) { const lv = this.body.getLinearVelocity(); this.body.setLinearVelocity(new planck.Vec2(lv.x, v / this.world.scale)); this.body.setAwake(true); }
  setVelocity(x, y) { const S = this.world.scale; this.body.setLinearVelocity(new planck.Vec2(x / S, y / S)); this.body.setAwake(true); return this; }
  addVelocity(x, y) { const S = this.world.scale, v = this.body.getLinearVelocity(); this.body.setLinearVelocity(new planck.Vec2(v.x + x / S, v.y + y / S)); this.body.setAwake(true); return this; }
  get angularVelocity() { return this.body.getAngularVelocity(); }
  set angularVelocity(w) { this.body.setAngularVelocity(w); this.body.setAwake(true); }
  // 힘(매 스텝 쓰는 값: 질량·단위/s²), 충격량(한 번: 질량·단위/s), 토크
  applyForce(fx, fy) { const S = this.world.scale; this.body.applyForceToCenter(new planck.Vec2(fx / S, fy / S), true); return this; }
  applyImpulse(ix, iy, atX, atY) { const S = this.world.scale, c = atX === undefined ? this.body.getWorldCenter() : new planck.Vec2(atX / S, atY / S); this.body.applyLinearImpulse(new planck.Vec2(ix / S, iy / S), c, true); return this; }
  applyTorque(t) { this.body.applyTorque(t, true); return this; }
  get mass() { return this.body.getMass(); }
  get gravityScale() { return this.body.getGravityScale(); }
  set gravityScale(g) { this.body.setGravityScale(g); }
  get linearDamping() { return this.body.getLinearDamping(); }
  set linearDamping(d) { this.body.setLinearDamping(d); }
  get fixedRotation() { return this.body.isFixedRotation(); }
  set fixedRotation(f) { this.body.setFixedRotation(f); }
  get sleeping() { return !this.body.isAwake(); }
  wake() { this.body.setAwake(true); return this; }
  setType(t) { this.type = t; this.body.setType(t); this._setDrive(); this.body.resetMassData(); return this; }
  // 순간이동 (속도는 유지). Transform도 같이 옮긴다.
  setPosition(x, y, angle) {
    const S = this.world.scale; if (angle === undefined) angle = this.body.getAngle();
    this.body.setTransform(new planck.Vec2(x / S, y / S), angle); this.body.setAwake(true);
    this._cx = this._px = x / S; this._cy = this._py = y / S; this._ca = this._pa = angle; this._sx = NaN;
    const t = this.transform; t.setPosition(x, y); if (!this.fixedAngle) t.localRotation = angle; return this;
  }
  // Transform에서 몸체로 위치를 다시 읽는다 (정적 몸체를 코드로 옮겼을 때)
  syncFromTransform() { const m = this.transform.worldMatrix, S = this.world.scale; this.body.setTransform(new planck.Vec2(m.e / S, m.f / S), m.getRotation()); this._cx = this._px = m.e / S; this._cy = this._py = m.f / S; this._ca = this._pa = m.getRotation(); return this; }
  // 지금 닿아 있는 몸체들을 순회: fn(otherBody2D, contact) — 센서 접촉 제외
  forEachContact(fn) { for (let ce = this.body.getContactList(); ce; ce = ce.next) { const c = ce.contact; if (!c.isTouching()) continue; const fa = c.getFixtureA(), fb = c.getFixtureB(); if (fa.isSensor() || fb.isSensor()) continue; const o = ce.other.getUserData(); if (o) fn(o, c); } }
  isTouching(other) { let r = false; this.forEachContact(o => { if (o === other) r = true; }); return r; }
  getFixture(tag) { return this.tags[tag] || null; }
}

// 프로토타입용 그리기: Body2D의 도형을 색칠해서 그린다 (스프라이트가 없을 때). 같은 GameObject에 Body2D가 있어야 한다.
//   new BodyRenderer({ fill:'#4fc3f7', stroke:'#000', lineWidth:1, layer:'Default', order:0, flash })
class BodyRenderer extends Renderer {
  constructor(o = {}) {
    super();
    this.fill = o.fill ?? '#90a4ae'; this.stroke = o.stroke ?? '#1c232b'; this.lineWidth = o.lineWidth ?? 1; this.marker = o.marker ?? true;
    this.sortingLayer = o.layer || 'Default'; this.orderInLayer = o.order || 0; this.flash = 0; // flash>0이면 흰색으로 번쩍임 (초, 직접 줄여 줄 것)
    this._m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }
  getBounds(out) { const b = this._gameObject.getComponent(Body2D); if (!b) return null; const m = this.transform.worldMatrix, r = Math.hypot(b.hw, b.hh) + 2; out.minX = m.e - r; out.minY = m.f - r; out.maxX = m.e + r; out.maxY = m.f + r; return out; }
  update(dt) { if (this.flash > 0) this.flash -= dt; }
  render(ctx, camera) {
    const b = this._gameObject.getComponent(Body2D); if (!b) return;
    const m = Matrix.multiply(camera.viewMatrix, this.transform.worldMatrix, this._m);
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f); ctx.globalAlpha = this.opacity; ctx.lineWidth = this.lineWidth; ctx.lineJoin = 'round';
    const defs = b.defs;
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i]; if (d.sensor) continue;
      ctx.fillStyle = this.flash > 0 ? '#fff' : (d.color || this.fill); ctx.strokeStyle = this.stroke; ctx.beginPath();
      if (d.shape === 'box') { ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.angle); ctx.rect(-d.w / 2, -d.h / 2, d.w, d.h); ctx.restore(); }
      else if (d.shape === 'circle') { ctx.arc(d.x, d.y, d.radius, 0, 7); if (this.marker) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.radius, d.y); } }
      else if (d.shape === 'capsule') {
        const w = d.w, h = d.h, r = Math.min(w, h) / 2; ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.angle); const hw = w / 2, hh = h / 2;
        ctx.moveTo(-hw + r, -hh); ctx.arc(hw - r, -hh + r, r, -Math.PI / 2, 0); ctx.arc(hw - r, hh - r, r, 0, Math.PI / 2); ctx.arc(-hw + r, hh - r, r, Math.PI / 2, Math.PI); ctx.arc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.restore();
      } else if (d.shape === 'polygon') { const c = Math.cos(d.angle), s = Math.sin(d.angle); for (let k = 0; k < d.points.length; k++) { const p = d.points[k], x = d.x + p.x * c - p.y * s, y = d.y + p.x * s + p.y * c; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); }
      else if (d.shape === 'edge') { ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); }
      else if (d.shape === 'chain') { for (let k = 0; k < d.points.length; k++) { const p = d.points[k]; if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); } if (d.loop) ctx.closePath(); }
      if (d.shape !== 'edge' && d.shape !== 'chain') ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}


/* ---- physics/Controllers.js ---- */
// 캐릭터 조종 도우미. Body2D(dynamic)가 붙은 GameObject에 같이 붙인다. 입력은 minigame이 매 프레임 setInput으로 넣어 준다.
// 키보드든 폰 스틱이든 상관없이 "좌우 -1..1, 점프 누르고 있는지, 아래 눌렀는지"만 받는다.

const _moveToward = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));

// 횡스크롤 캐릭터. 달리기 가감속, 가변 점프(떼면 짧게), 코요테 시간, 점프 선입력, 이동 발판 위 타기,
// 한쪽 통과 발판 내려가기(아래 + 점프), 선택적으로 벽 슬라이드·벽 점프·추가 점프.
// 몸체는 가운데 기준 대칭 도형(캡슐 권장)이어야 한다. 마찰은 자동으로 0이 되고 회전은 고정된다.
//   const pc = go.addComponent(new PlatformerController({ runSpeed: 180, jumpSpeed: 430 }));
//   매 프레임: pc.setInput(moveX, jumpHeld, downHeld);
// 읽기 상태: grounded, groundBody, wall(-1/0/1), facing(-1/1), jumping, coyoteT
// 콜백(선택): pc.onJump(), pc.onLand(낙하속도), pc.onWallJump()
class PlatformerController extends Component {
  constructor(o = {}) {
    super();
    this.runSpeed = o.runSpeed ?? 170; this.accel = o.accel ?? 1700; this.decel = o.decel ?? 2300; this.airAccel = o.airAccel ?? 1100; this.airDecel = o.airDecel ?? 450;
    this.jumpSpeed = o.jumpSpeed ?? 430; this.jumpCut = o.jumpCut ?? 0.45; this.fallGravity = o.fallGravity ?? 1.5; this.maxFall = o.maxFall ?? 650;
    this.coyote = o.coyote ?? 0.1; this.buffer = o.buffer ?? 0.12; this.extraJumps = o.extraJumps ?? 0;
    this.wallSlide = o.wallSlide ?? false; this.wallSlideSpeed = o.wallSlideSpeed ?? 70; this.wallJump = o.wallJump === undefined ? [230, 400] : o.wallJump; this.wallLock = o.wallLock ?? 0.16;
    this.dropThrough = o.dropThrough ?? true; this.dropTime = o.dropTime ?? 0.28; this.probe = o.probe ?? 3; this.mask = o.mask ?? 'all';
    this.moveX = 0; this.jumpHeld = false; this.down = false; this._prevHeld = false;
    this.grounded = false; this.groundBody = null; this.wall = 0; this.facing = 1; this.jumping = false;
    this.coyoteT = 0; this.bufferT = 0; this.lockT = 0; this._noGroundT = 0; this._jumps = 0; this._fallV = 0;
    this.onJump = null; this.onLand = null; this.onWallJump = null; this.body = null;
  }
  setInput(moveX, jumpHeld, down = false) {
    this.moveX = moveX < -1 ? -1 : moveX > 1 ? 1 : moveX; this.down = !!down;
    if (jumpHeld && !this._prevHeld) this.bufferT = this.buffer; // 누른 순간 선입력
    this._prevHeld = this.jumpHeld = !!jumpHeld;
  }
  start() {
    this.body = this.getComponent(Body2D); if (!this.body) throw new Error('PlatformerController: Body2D가 필요하다');
    const pb = this.body.body; pb.setFixedRotation(true);
    for (let f = pb.getFixtureList(); f; f = f.getNext()) f.setFriction(0); // 벽에 달라붙지 않게; 바닥 마찰은 컨트롤러가 직접 준다
  }
  // 발 밑 탐지: 세 줄. 위를 향한 면에 닿으면 그 몸체를 돌려준다.
  _probeGround(B, w) {
    const foot = B.y - B.hh, hw = B.hw * 0.85, x = B.x; let best = null, bestD = 1e9;
    for (let i = -1; i <= 1; i++) {
      const h = w.raycast(x + i * hw, foot + 2, x + i * hw, foot - this.probe, { ignore: B, mask: this.mask });
      if (h.hit && h.ny > 0.55 && h.distance < bestD) { bestD = h.distance; best = h.body; }
    }
    return best;
  }
  _probeWall(B, w, dir) {
    const h = w.raycast(B.x, B.y, B.x + dir * (B.hw + this.probe), B.y, { ignore: B, mask: this.mask });
    return h.hit && Math.abs(h.nx) > 0.7;
  }
  update(dt) {
    const B = this.body; if (!B || !B.body) return; const w = B.world, S = w.scale, lv = B.body.getLinearVelocity();
    let vx = lv.x * S, vy = lv.y * S;
    this.bufferT -= dt; this.coyoteT -= dt; this.lockT -= dt; this._noGroundT -= dt;
    const was = this.grounded; let gb = this._noGroundT > 0 ? null : this._probeGround(B, w);
    const gvx = gb ? gb.vx : 0, gvy = gb ? gb.vy : 0;
    this.grounded = !!gb && vy - gvy <= 60; this.groundBody = this.grounded ? gb : null;
    if (this.grounded) { this.coyoteT = this.coyote; this._jumps = 0; if (!was) { this.jumping = false; if (this.onLand) this.onLand(this._fallV); } }
    this._fallV = vy;
    this.wall = 0;
    if ((this.wallSlide || this.wallJump) && !this.grounded) { if (this._probeWall(B, w, -1)) this.wall = -1; else if (this._probeWall(B, w, 1)) this.wall = 1; }
    // 좌우
    const mx = this.moveX;
    if (this.lockT <= 0) {
      const a = mx !== 0 ? (this.grounded ? this.accel : this.airAccel) : (this.grounded ? this.decel : this.airDecel), gv = this.grounded ? gvx : 0;
      vx = _moveToward(vx - gv, mx * this.runSpeed, a * dt) + gv;
      if (mx !== 0) this.facing = mx > 0 ? 1 : -1;
    }
    // 점프
    if (this.bufferT > 0) {
      if (this.dropThrough && this.down && this.grounded && this.groundBody && this.groundBody.oneWay) { B.dropT = this.dropTime; this.bufferT = 0; this._noGroundT = 0.12; this.grounded = false; }
      else if (this.grounded || this.coyoteT > 0) { vy = this.jumpSpeed + (gvy > 0 ? gvy : 0); this.bufferT = 0; this.coyoteT = 0; this._noGroundT = 0.08; this.grounded = false; this.groundBody = null; this.jumping = true; if (this.onJump) this.onJump(); }
      else if (this.wallJump && this.wall !== 0) { vx = -this.wall * this.wallJump[0]; vy = this.wallJump[1]; this.facing = -this.wall; this.lockT = this.wallLock; this.bufferT = 0; this.jumping = true; this._noGroundT = 0.05; if (this.onWallJump) this.onWallJump(); }
      else if (this._jumps < this.extraJumps) { this._jumps++; vy = this.jumpSpeed * 0.9; this.bufferT = 0; this.jumping = true; if (this.onJump) this.onJump(); }
    }
    if (this.jumping && !this.jumpHeld && vy > 0) { vy *= this.jumpCut; this.jumping = false; } // 점프 버튼을 떼면 위로 오르던 힘을 깎는다 (가변 점프 높이)
    if (vy <= 0) this.jumping = false;
    // 중력 배율/낙하 속도 제한/벽 슬라이드
    B.gravityScale = !this.grounded && vy < 0 ? this.fallGravity : 1;
    if (this.wallSlide && this.wall !== 0 && vy < 0 && mx === this.wall) vy = Math.max(vy, -this.wallSlideSpeed);
    if (vy < -this.maxFall) vy = -this.maxFall;
    B.setVelocity(vx, vy);
  }
}

// 탑다운 캐릭터: 가감속 이동 + 대시. 마찰/감속은 컨트롤러가 직접 주므로 몸체 감쇠는 0으로 둔다 (넉백 등 외부 충격량은 마찰로 서서히 사라진다).
//   const tc = go.addComponent(new TopDownController({ maxSpeed: 150, dashSpeed: 380 }));
//   매 프레임: tc.setInput(x, y) ; 대시: tc.dash(dx, dy)  (dx,dy 없으면 현재 입력/바라보는 방향)
// 읽기 상태: dashing, facing(라디안), moving, dashCd
class TopDownController extends Component {
  constructor(o = {}) {
    super();
    this.maxSpeed = o.maxSpeed ?? 150; this.accel = o.accel ?? 1600; this.friction = o.friction ?? 1900;
    this.dashSpeed = o.dashSpeed ?? 380; this.dashTime = o.dashTime ?? 0.14; this.dashCooldown = o.dashCooldown ?? 0.55; this.faceMove = o.faceMove ?? true;
    this.ix = 0; this.iy = 0; this.dashing = false; this.dashT = 0; this.dashCd = 0; this.facing = o.facing ?? -Math.PI / 2; this.moving = false; this._dx = 0; this._dy = 0;
    this.onDash = null; this.body = null;
  }
  setInput(x, y) { const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } this.ix = x; this.iy = y; }
  dash(dx, dy) {
    if (this.dashing || this.dashCd > 0) return false;
    if (dx === undefined) { dx = this.ix; dy = this.iy; if (!dx && !dy) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); } }
    const l = Math.hypot(dx, dy) || 1; this._dx = dx / l; this._dy = dy / l; this.dashing = true; this.dashT = this.dashTime; this.dashCd = this.dashCooldown; if (this.onDash) this.onDash(this._dx, this._dy); return true;
  }
  start() { this.body = this.getComponent(Body2D); if (!this.body) throw new Error('TopDownController: Body2D가 필요하다'); this.body.linearDamping = 0; }
  update(dt) {
    const B = this.body; if (!B || !B.body) return;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.dashing) { this.dashT -= dt; B.setVelocity(this._dx * this.dashSpeed, this._dy * this.dashSpeed); if (this.dashT <= 0) this.dashing = false; return; }
    let vx = B.vx, vy = B.vy; const want = this.ix !== 0 || this.iy !== 0; this.moving = want;
    if (want) {
      const a = this.accel * dt, tx = this.ix * this.maxSpeed, ty = this.iy * this.maxSpeed;
      vx = _moveToward(vx, tx, a); vy = _moveToward(vy, ty, a);
      if (this.faceMove) this.facing = Math.atan2(this.iy, this.ix);
    } else { const sp = Math.hypot(vx, vy); if (sp > 0) { const k = Math.max(0, sp - this.friction * dt) / sp; vx *= k; vy *= k; } }
    B.setVelocity(vx, vy);
  }
}

