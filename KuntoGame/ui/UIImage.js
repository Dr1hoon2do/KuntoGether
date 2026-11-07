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