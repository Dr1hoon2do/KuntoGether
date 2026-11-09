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
    if (shape === 'circle') this.radius = a; else if (shape === 'box') { this.w = a; this.h = b; } else { this.w = a; this.radius = b; }
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

  onEnable() { Physics._add(this); this.sync(true); }
  onDisable() { Physics._remove(this); }

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
    else { ctx.arc(-c.hx, 0, c.rr, Math.PI / 2, -Math.PI / 2); ctx.arc(c.hx, 0, c.rr, -Math.PI / 2, Math.PI / 2); ctx.closePath(); }
    ctx.stroke(); ctx.restore();
  }
};
