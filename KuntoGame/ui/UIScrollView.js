// 세로 스크롤 영역. 이 오브젝트(뷰포트)를 끌거나 휠을 굴리면 content가 위아래로 움직인다.
// 뷰포트에는 클릭 판정용 렌더러(UIRect 등)와 UIMask를 같이 붙여서 쓴다.
// content의 높이는 contentHeight로 직접 알려준다 (UI 단위).
class UIScrollView extends UIElement {
  constructor(options = {}) {
    super();
    this.content = options.content ?? null; // RectTransform
    this.bar = options.bar ?? null;         // 스크롤바 RectTransform (선택)
    this.contentHeight = options.contentHeight ?? 0;
    this.wheelSpeed = options.wheelSpeed ?? 0.5;
    this.friction = options.friction ?? 6;   // 손을 뗀 뒤 관성 감쇠 (클수록 빨리 멈춤)
    this.onTap = options.onTap ?? null;      // 끌지 않고 눌렀다 뗐을 때 (pointer) — 목록 항목 고르기용

    this.scroll = 0;
    this.velocity = 0;
    this.dragging = false;
    this._applied = null;
  }

  get viewportHeight() {
    const rt = this.getComponent(RectTransform);
    return rt.rect.height / rt.uiRoot.scale;
  }

  get maxScroll() {
    return Math.max(0, this.contentHeight - this.viewportHeight);
  }

  scrollTo(value) {
    this.scroll = Math.min(Math.max(value, 0), this.maxScroll);
  }

  onPointerDown(pointer) {
    this.dragging = true;
    this.velocity = 0;
  }

  onDrag(pointer) {
    const s = this.getComponent(RectTransform).uiRoot.scale;
    const dy = pointer.delta.y * Input.pixelRatio / s; // 포인터는 CSS px, scale은 device px 기준
    this.scrollTo(this.scroll - dy);
    this.velocity = -dy / Math.max(Time.unscaledDeltaTime, 1 / 120);
  }

  onPointerUp(pointer) {
    this.dragging = false;
  }

  onClick(pointer) {
    if (this.onTap && pointer.dragDistance <= Input.dragThreshold) this.onTap(pointer);
  }

  update(dt) {
    const rt = this.getComponent(RectTransform);

    if (Input.wheel !== 0) {
      const p = Input.pointerPosition;
      if (rt.containsPoint(p.x, p.y)) {
        this.velocity = 0;
        this.scrollTo(this.scroll + Input.wheel * this.wheelSpeed / rt.uiRoot.scale);
      }
    }

    if (!this.dragging && this.velocity !== 0) {
      this.scrollTo(this.scroll + this.velocity * dt);
      this.velocity *= Math.exp(-this.friction * dt);
      if (Math.abs(this.velocity) < 5 || this.scroll === 0 || this.scroll === this.maxScroll) this.velocity = 0;
    }

    this.scrollTo(this.scroll);
    this._apply();
  }

  _apply() {
    const key = this.scroll + ':' + this.contentHeight + ':' + this.viewportHeight;
    if (key === this._applied) return;
    this._applied = key;

    if (this.content) {
      this.content.setAnchor(0, 0, 1, 0);
      this.content.setOffsets(0, -this.scroll, 0, this.scroll - this.contentHeight);
    }

    if (this.bar) {
      const view = this.viewportHeight;
      const show = this.contentHeight > view;
      this.bar.gameObject.setActive(show);
      if (show) {
        const h = Math.max(16, view * view / this.contentHeight);
        const y = (view - h) * (this.scroll / this.maxScroll);
        this.bar.setAnchor(1, 0, 1, 0);
        this.bar.setOffsets(-4, y, 1, -(y + h));
      }
    }
  }
}
