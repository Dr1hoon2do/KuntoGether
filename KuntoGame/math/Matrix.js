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