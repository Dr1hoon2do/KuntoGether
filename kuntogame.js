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

    ctx.fillStyle = this.color;
    ctx.textAlign = this.align;
    ctx.textBaseline = this.verticalAlign;
    for (let i = 0; i < lines.length; i++) {
      const ly = y + step * i;
      ctx.fillText(lines[i], this.pixelSnap ? Math.round(x) : x, this.pixelSnap ? Math.round(ly) : ly);
    }

    if (alpha < 1) ctx.globalAlpha = 1;
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
    const w = Math.max(1, Math.round((rect.width || this.canvas.width) * this.pixelRatio));
    const h = Math.max(1, Math.round((rect.height || this.canvas.height) * this.pixelRatio));
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

