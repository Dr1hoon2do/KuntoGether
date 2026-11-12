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
  //       velocityIterations(8), positionIterations(3), interpolate(true), allowSleep(true), debug(false),
  //       adaptive(true): 약한 기기에서 스텝이 너무 오래 걸리면 자동으로 1/30초 스텝으로 낮추고(느려지는 대신 끊기지 않게) 여유가 생기면 되돌린다, budgetMs(9)
  constructor(opts = {}) {
    if (typeof planck === 'undefined') throw new Error('World2D: planck.js가 로드되지 않았다 (kuntogame.js에 포함됨)');
    this.scale = opts.scale ?? 32;
    this.mode = opts.mode || 'platformer';
    this.fixedStep = opts.fixedStep ?? 1 / 60;
    this.maxSubsteps = opts.maxSubsteps ?? 3; // 프레임이 밀려도 한 프레임에 최대 3스텝: 따라잡기 나선(spiral of death) 대신 시뮬레이션이 조금 느려진다
    this.velocityIterations = opts.velocityIterations ?? 8;
    this.positionIterations = opts.positionIterations ?? 3;
    this.baseStep = this.fixedStep; this.adaptive = opts.adaptive ?? true; this.budgetMs = opts.budgetMs ?? 9; this.degraded = false; this._slow = 0; this._fast = 0; this._ema = 0;
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
    if (this.adaptive) this._adapt(n);
  }

  // 한 프레임의 물리 시간이 예산을 넘는 상태가 이어지면 스텝을 1/30로 낮춘다 (연속 충돌·조인트는 그대로 동작). 여유가 오래 이어지면 1/60으로 복귀.
  _adapt(n) {
    if (n === 0) return; // 이번 프레임에 스텝이 없었으면 판단하지 않는다
    const ms = this.lastStepMs; this._ema += (ms - this._ema) * 0.15;
    if (!this.degraded) {
      if (this._ema > this.budgetMs) { if (++this._slow >= 20) { this.degraded = true; this.fixedStep = this.baseStep * 2; this._slow = this._fast = 0; this._acc = 0; } } else this._slow = 0;
    } else if (this._ema * 2 < this.budgetMs * 0.45) { if (++this._fast >= 300) { this.degraded = false; this.fixedStep = this.baseStep; this._slow = this._fast = 0; this._ema = 0; } } else this._fast = 0;
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
      const b = bs[i], pb = b.body; if (!pb || !(b._moves || b._kinTransform)) continue; // Transform 구동 킨메틱은 Transform에 쓰지는 않지만 x/y 값은 최신으로 둔다
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
  get x() { return this.world ? this._cx * this.world.scale : this.transform.worldMatrix.e; } // 몸체가 만들어지기 전(첫 프레임)에는 Transform 값
  get y() { return this.world ? this._cy * this.world.scale : this.transform.worldMatrix.f; }
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
