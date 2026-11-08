// 이미지 없이 월드 좌표(Y-up)에서 직접 그리는 렌더러.
// fn(ctx, self): 오브젝트 로컬 좌표계에서 그린다 (원점 = 오브젝트 위치, 회전 적용). 글자는 ctx.scale(1,-1) 후에 그려야 안 뒤집힌다.
class DrawRenderer extends Renderer {
  constructor(fn, radius = 10, { layer = "Default", order = 0 } = {}) {
    super();
    this.fn = fn; this.radius = radius; this.sortingLayer = layer; this.orderInLayer = order;
    this.flash = 0; // 맞았을 때 흰색 번쩍임 (남은 초)
  }
  getBounds(out) {
    const p = this.transform.position, r = this.radius;
    out.minX = p.x - r; out.minY = p.y - r; out.maxX = p.x + r; out.maxY = p.y + r;
    return out;
  }
  update(dt) { if (this.flash > 0) this.flash -= dt; }
  render(ctx, camera) {
    const m = Matrix.multiply(camera.viewMatrix, this.transform.worldMatrix, DRAW_MATRIX);
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.globalAlpha = this.opacity;
    this.fn(ctx, this);
    ctx.globalAlpha = 1;
  }
}
const DRAW_MATRIX = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

// 방 바닥과 벽
class ArenaRenderer extends Renderer {
  constructor(w, h) { super(); this.w = w; this.h = h; this.sortingLayer = "Background"; this.locked = true; }
  render(ctx, camera) {
    const m = camera.viewMatrix;
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    const hw = this.w / 2, hh = this.h / 2;
    ctx.fillStyle = "#14110f"; ctx.fillRect(-hw - 400, -hh - 400, this.w + 800, this.h + 800);
    ctx.fillStyle = "#2a2420"; ctx.fillRect(-hw, -hh, this.w, this.h);
    ctx.strokeStyle = "#332c27"; ctx.lineWidth = 0.5; ctx.beginPath();
    for (let x = -hw; x <= hw; x += 25) { ctx.moveTo(x, -hh); ctx.lineTo(x, hh); }
    for (let y = -hh; y <= hh; y += 25) { ctx.moveTo(-hw, y); ctx.lineTo(hw, y); }
    ctx.stroke();
    ctx.strokeStyle = this.locked ? "#8a4b3a" : "#5a8a5a"; ctx.lineWidth = 3; ctx.strokeRect(-hw, -hh, this.w, this.h);
  }
}
