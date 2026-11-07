class UIRoot {
  constructor(referenceWidth = 320, referenceHeight = 180, options = {}) {
    this.referenceWidth = referenceWidth;
    this.referenceHeight = referenceHeight;

    // 'fit': 기준 해상도(16:9)를 화면 안에 맞춰 늘린다. 세로 화면에선 가운데 띠만 쓰게 된다.
    // 'constant': 화면 전체를 쓰고, UI 1단위 = 화면 픽셀 constantScale개. 모바일 HUD용.
    this.mode = options.mode ?? 'fit';
    this.constantScale = options.scale ?? 1;

    this.scale = 1;
    this.rootRect = { x: 0, y: 0, width: 0, height: 0 };

    this._lastCanvasWidth = -1;
    this._lastCanvasHeight = -1;
    this._roots = [];
  }

  attach(rectTransform) {
    if (rectTransform.parent) rectTransform.setParent(null);
    rectTransform.uiRoot = this;
    if (!this._roots.includes(rectTransform)) this._roots.push(rectTransform);
    rectTransform._markDirty();
    return rectTransform;
  }

  detach(rectTransform) {
    const i = this._roots.indexOf(rectTransform);
    if (i >= 0) this._roots.splice(i, 1);
    return rectTransform;
  }

  // Engine이 매 프레임 실제 캔버스 크기(device pixel)로 호출
  update(canvasWidth, canvasHeight) {
    if (canvasWidth === this._lastCanvasWidth && canvasHeight === this._lastCanvasHeight) return;
    this._lastCanvasWidth = canvasWidth;
    this._lastCanvasHeight = canvasHeight;

    if (this.mode === 'constant') {
      this.scale = this.constantScale;
      this.rootRect.x = 0;
      this.rootRect.y = 0;
      this.rootRect.width = canvasWidth;
      this.rootRect.height = canvasHeight;
    } else {
      this.scale = Math.min(canvasWidth / this.referenceWidth, canvasHeight / this.referenceHeight);

      const usedWidth = this.referenceWidth * this.scale;
      const usedHeight = this.referenceHeight * this.scale;

      this.rootRect.x = (canvasWidth - usedWidth) / 2;
      this.rootRect.y = (canvasHeight - usedHeight) / 2;
      this.rootRect.width = usedWidth;
      this.rootRect.height = usedHeight;
    }

    for (const rt of this._roots) rt._markDirty();
  }

  // 화면비가 기준과 다를 때 남는 여백. 기준 해상도 단위로 환산해서 반환 (left/right/top/bottom).
  get safeArea() {
    if (this.scale === 0 || this.mode === 'constant') return { left: 0, right: 0, top: 0, bottom: 0 };
    const usedWidth = this.referenceWidth * this.scale;
    const usedHeight = this.referenceHeight * this.scale;
    const marginX = (this._lastCanvasWidth - usedWidth) / this.scale / 2;
    const marginY = (this._lastCanvasHeight - usedHeight) / this.scale / 2;
    return { left: marginX, right: marginX, top: marginY, bottom: marginY };
  }
}
