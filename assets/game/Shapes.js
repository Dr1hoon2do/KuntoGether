// 도형 렌더러: 이미지 없이 월드 좌표(Y-up)에서 도형을 직접 그린다.
class ShapeRenderer extends Renderer {
  // kind: 'circle' | 'ship' | 'square'
  constructor({ kind = "circle", radius = 6, color = "#fff", sortingLayer = "Default", orderInLayer = 0 } = {}) {
    super();
    this.kind = kind; this.radius = radius; this.color = color;
    this.flash = 0; // 맞았을 때 흰색으로 번쩍이는 남은 시간
    this.sortingLayer = sortingLayer; this.orderInLayer = orderInLayer;
  }
  getBounds(out) {
    const p = this.transform.position, r = this.radius + 2;
    out.minX = p.x - r; out.minY = p.y - r; out.maxX = p.x + r; out.maxY = p.y + r;
    return out;
  }
  render(ctx, camera) {
    const m = Matrix.multiply(camera.viewMatrix, this.transform.worldMatrix, SHAPE_MATRIX);
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.globalAlpha = this.opacity;
    ctx.fillStyle = this.flash > 0 ? "#fff" : this.color;
    const r = this.radius;
    ctx.beginPath();
    if (this.kind === "circle") ctx.arc(0, 0, r, 0, Math.PI * 2);
    else if (this.kind === "square") ctx.rect(-r, -r, r * 2, r * 2);
    else { ctx.moveTo(r, 0); ctx.lineTo(-r * 0.8, r * 0.75); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r * 0.8, -r * 0.75); ctx.closePath(); }
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  update(dt) { if (this.flash > 0) this.flash -= dt; }
}
const SHAPE_MATRIX = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

// 아레나 테두리와 격자 (배경)
class ArenaRenderer extends Renderer {
  constructor(w, h) { super(); this.w = w; this.h = h; this.sortingLayer = "Background"; }
  render(ctx, camera) {
    const m = camera.viewMatrix;
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    const hw = this.w / 2, hh = this.h / 2;
    ctx.fillStyle = "#0d1117"; ctx.fillRect(-hw, -hh, this.w, this.h);
    ctx.strokeStyle = "#1a2230"; ctx.lineWidth = 0.5; ctx.beginPath();
    for (let x = -hw; x <= hw; x += 20) { ctx.moveTo(x, -hh); ctx.lineTo(x, hh); }
    for (let y = -hh; y <= hh; y += 20) { ctx.moveTo(-hw, y); ctx.lineTo(hw, y); }
    ctx.stroke();
    ctx.strokeStyle = "#3a5a8a"; ctx.lineWidth = 1.5; ctx.strokeRect(-hw, -hh, this.w, this.h);
  }
}
