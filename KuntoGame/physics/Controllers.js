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
