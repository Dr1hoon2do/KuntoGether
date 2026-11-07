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