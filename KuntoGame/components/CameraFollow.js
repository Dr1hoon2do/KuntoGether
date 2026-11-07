// Camera가 붙은 오브젝트에 같이 붙인다.
// follow가 켜져 있으면 target(Transform)을 부드럽게 따라가고, bounds가 있으면 화면이 그 밖을 보여주지 않게 막는다.
// pan()으로 손으로 끌어 옮길 수 있다 (follow가 켜져 있으면 다음 프레임에 다시 끌려간다).
class CameraFollow extends Component {
  constructor(options = {}) {
    super();
    this.target = options.target ?? null;       // Transform
    this.follow = options.follow ?? true;
    this.smoothing = options.smoothing ?? 12;    // 클수록 빨리 따라붙는다. 0이면 즉시
    this.bounds = options.bounds ?? null;        // { minX, minY, maxX, maxY } 월드 단위, 매 프레임 다시 읽는다
  }

  // 대상 위치로 즉시 이동
  snap() {
    if (!this.target) return this;
    const t = this.target.position;
    this.transform.setPosition(t.x, t.y);
    this._clamp();
    return this;
  }

  pan(dx, dy) {
    const p = this.transform.position;
    this.transform.setPosition(p.x + dx, p.y + dy);
    this._clamp();
    return this;
  }

  lateUpdate(dt) {
    if (this.follow && this.target) {
      const p = this.transform.position;
      const t = this.target.position;
      const k = this.smoothing > 0 ? 1 - Math.exp(-this.smoothing * dt) : 1;
      this.transform.setPosition(p.x + (t.x - p.x) * k, p.y + (t.y - p.y) * k);
    }
    this._clamp();
  }

  // 보이는 영역(카메라 viewWidth/Height)이 bounds 안에 들어오도록 중심을 제한한다. 영역이 bounds보다 크면 가운데에 둔다.
  _clamp() {
    const b = this.bounds;
    if (!b) return;
    const cam = this.getComponent(Camera);
    const hw = cam.viewWidth / 2;
    const hh = cam.viewHeight / 2;
    const p = this.transform.position;
    const x = b.maxX - b.minX <= hw * 2 ? (b.minX + b.maxX) / 2 : Math.min(Math.max(p.x, b.minX + hw), b.maxX - hw);
    const y = b.maxY - b.minY <= hh * 2 ? (b.minY + b.maxY) / 2 : Math.min(Math.max(p.y, b.minY + hh), b.maxY - hh);
    if (x !== p.x || y !== p.y) this.transform.setPosition(x, y);
  }
}
