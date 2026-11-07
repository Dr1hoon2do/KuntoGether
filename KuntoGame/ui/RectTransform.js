class RectTransform extends Component {
  constructor() {
    super();
    this._awoken = true;
    this._started = true;

    // 앵커 (부모 기준 0~1 비율)
    this.anchorMin = { x: 0, y: 0 };
    this.anchorMax = { x: 0, y: 0 };
    this.pivot = { x: 0.5, y: 0.5 };

    // 오프셋: 기준 해상도 단위. stretch 앵커에선 여백, point 앵커에선 피벗 기준 위치로 쓰인다.
    this.offsetMin = { x: 0, y: 0 };
    this.offsetMax = { x: 0, y: 0 };

    // 그리는 순서 (최상위 UI만 본다): 큰 값이 위에 그려지고 먼저 눌린다. 같으면 만든 순서
    this.sortOrder = 0;

    // 그룹 투명도: 자기와 모든 자손 UI에 곱해진다 (유니티 CanvasGroup). 창 전체를 한 번에 흐리게·나타나게 할 때
    this.alpha = 1;

    // UI 전용 계층 (Transform.parent/children과 별개)
    this.parent = null;
    this.children = [];
    this.uiRoot = null;

    // 캐시
    this._rect = { x: 0, y: 0, width: 0, height: 0 };
    this._dirty = true;
  }

  setAnchor(minX, minY, maxX, maxY) {
    this.anchorMin.x = minX;
    this.anchorMin.y = minY;
    this.anchorMax.x = maxX;
    this.anchorMax.y = maxY;
    this._markDirty();
    return this;
  }

  setPivot(x, y) {
    this.pivot.x = x;
    this.pivot.y = y;
    this._markDirty();
    return this;
  }

  // stretch 앵커용: 네 방향 여백 (기준 해상도 단위)
  setOffsets(left, top, right, bottom) {
    this.offsetMin.x = left;
    this.offsetMin.y = top;
    this.offsetMax.x = -right;
    this.offsetMax.y = -bottom;
    this._markDirty();
    return this;
  }

  // point 앵커용: 고정 크기 + 앵커 기준 위치 (피벗 적용, 기준 해상도 단위)
  setSizeAndPosition(width, height, x = 0, y = 0) {
    this.offsetMin.x = x - this.pivot.x * width;
    this.offsetMin.y = y - this.pivot.y * height;
    this.offsetMax.x = x + (1 - this.pivot.x) * width;
    this.offsetMax.y = y + (1 - this.pivot.y) * height;
    this._markDirty();
    return this;
  }

  setSize(width, height) {
    const x = this.offsetMin.x + this.pivot.x * (this.offsetMax.x - this.offsetMin.x);
    const y = this.offsetMin.y + this.pivot.y * (this.offsetMax.y - this.offsetMin.y);
    return this.setSizeAndPosition(width, height, x, y);
  }

  setParent(parent) {
    if (parent === this.parent) return this;
    if (this.parent) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
    } else if (this.uiRoot) {
      this.uiRoot.detach(this);
    }
    this.parent = parent;
    if (parent) {
      parent.children.push(this);
      this.uiRoot = parent.uiRoot;
    }
    this._markDirty();
    return this;
  }

  // 자식 UI 오브젝트 생성. Transform 계층(생명주기)과 RectTransform 계층(배치)에 같이 붙인다.
  createChild(name) {
    const go = new GameObject(name);
    const rt = go.addComponent(new RectTransform());
    this.gameObject.addChild(go);
    rt.setParent(this);
    return go;
  }

  // 파괴될 때 부모 목록에서 빠진다. 안 빼면 파괴된 자식이 계속 순회된다.
  onDestroy() {
    if (this.parent) this.setParent(null);
    else if (this.uiRoot) this.uiRoot.detach(this);
  }

  // 조상까지 곱한 그룹 투명도 (UI 렌더러가 opacity에 곱한다)
  get worldAlpha() {
    let a = this.alpha;
    for (let p = this.parent; p; p = p.parent) a *= p.alpha;
    return a;
  }

  // 포인터 좌표(CSS px, Input.pointers의 position)가 이 사각형 안에 있는지. pixelRatio를 알아서 맞춘다.
  containsPoint(x, y) {
    const k = typeof Input !== 'undefined' ? Input.pixelRatio : 1;
    const r = this.rect;
    const px = x * k;
    const py = y * k;
    return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
  }

  // 계산된 최종 사각형 (화면 device pixel 기준: x, y, width, height)
  get rect() {
    if (this._dirty) this._recompute();
    return this._rect;
  }

  _parentRect() {
    if (this.parent) return this.parent.rect;
    if (this.uiRoot) return this.uiRoot.rootRect;
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  _recompute() {
    const p = this._parentRect();
    const scale = this.uiRoot ? this.uiRoot.scale : 1;

    const xMin = p.x + this.anchorMin.x * p.width + this.offsetMin.x * scale;
    const yMin = p.y + this.anchorMin.y * p.height + this.offsetMin.y * scale;
    const xMax = p.x + this.anchorMax.x * p.width + this.offsetMax.x * scale;
    const yMax = p.y + this.anchorMax.y * p.height + this.offsetMax.y * scale;

    this._rect.x = xMin;
    this._rect.y = yMin;
    this._rect.width = xMax - xMin;
    this._rect.height = yMax - yMin;
    this._dirty = false;
  }

  _markDirty() {
    if (this._dirty) return;
    this._dirty = true;
    for (const c of this.children) c._markDirty();
  }
}