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
