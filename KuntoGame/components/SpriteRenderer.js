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