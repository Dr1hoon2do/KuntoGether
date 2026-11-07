class Camera extends Component {
  static main = null;

  constructor(zoom = 1) {
    super();
    // 설정
    this.zoom = zoom;
    this.baseViewHeight = null;
    this.baseViewWidth = null;
    this.depth = 0;
    this.cullingMargin = 0;
    this.pixelZoom = null;

    // 캐시
    this._view = new Matrix();
    this._inverse = new Matrix();
    this._bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    this._pixelRatio = 1;
    this._width = 0;
    this._height = 0;

    // 흔들기 (화면 px). shake()로 시작, update에서 줄어든다
    this._shake = { strength: 0, duration: 0, t: 0, x: 0, y: 0 };
  }

  static shakeEnabled = true; // 설정에서 끌 수 있게 (어지러움)

  // 화면 흔들기. strength: 최대 흔들림(CSS px), duration: 초. 진행 중이면 더 센 쪽으로 이어진다
  shake(strength = 3, duration = 0.25) {
    if (!Camera.shakeEnabled) return this;
    const s = this._shake;
    const left = s.duration > 0 ? s.strength * (1 - s.t / s.duration) : 0;
    if (strength >= left) {
      s.strength = strength;
      s.duration = duration;
      s.t = 0;
    }
    return this;
  }

  get isShaking() {
    return this._shake.t < this._shake.duration;
  }

  update(dt) {
    const s = this._shake;
    if (s.t >= s.duration) {
      s.x = 0;
      s.y = 0;
      return;
    }
    s.t += Time.unscaledDeltaTime;
    const k = Math.max(0, 1 - s.t / s.duration);
    const a = s.strength * k * k;
    s.x = (Math.random() * 2 - 1) * a;
    s.y = (Math.random() * 2 - 1) * a;
  }

  // Camera.main 자동 관리
  onEnable() {
    if (!Camera.main) Camera.main = this;
  }

  onDisable() {
    if (Camera.main === this) Camera.main = null;
  }

  onDestroy() {
    if (Camera.main === this) Camera.main = null;
  }

  // getter
  get viewMatrix() { return this._view; }
  get inverseViewMatrix() { return this._inverse; }
  get worldBounds() { return this._bounds; }

  get viewWidth() {
    const z = this._effectiveZoom();
    return z === 0 ? 0 : this._width / z;
  }

  get viewHeight() {
    const z = this._effectiveZoom();
    return z === 0 ? 0 : this._height / z;
  }

  setViewHeight(worldUnits) {
    if (worldUnits > 0 && this._height > 0) {
      const z = this._height / worldUnits;
      this.zoom = Config.pixelPerfect ? Math.max(1, Math.floor(z)) : z;
    }
    return this;
  }

  // 설정하면 zoom=1일 때 화면 높이에 이 월드 단위 수가 보이도록 기준을 고정.
  // zoom을 조절하면 이 기준에 대한 배율로 작동한다 (zoom 2 = 절반만 보임 = 확대).
  setBaseViewHeight(worldUnits) {
    this.baseViewHeight = worldUnits;
    return this;
  }

  clearBaseViewHeight() {
    this.baseViewHeight = null;
    return this;
  }

  // 세로 기준과 동일하되 가로 방향. 세로/가로 둘 다 설정하면
  // 화면이 한쪽으로 길어져도 오브젝트가 커지지 않고 그 방향으로 더 보이게 된다.
  setBaseViewWidth(worldUnits) {
    this.baseViewWidth = worldUnits;
    return this;
  }

  clearBaseViewWidth() {
    this.baseViewWidth = null;
    return this;
  }

  // 세로/가로 기준을 한번에 설정하는 편의 메서드
  setBaseView(width, height) {
    this.baseViewWidth = width;
    this.baseViewHeight = height;
    return this;
  }

  // 배율 고정: 월드 1유닛 = 화면 픽셀 level개 (소수 가능). 지정하면 기준 해상도/zoom 계산 대신 이 값을 쓴다.
  // 화면 크기가 바뀌어도 배율이 유지된다. null이면 원래 방식으로 돌아간다.
  // 소수 배율이어도 SpriteRenderer가 화면 모서리를 픽셀에 맞춰 그려서 타일 사이에 틈이 생기지 않는다.
  setPixelZoom(level) {
    this.pixelZoom = level === null ? null : Math.max(0.01, level);
    return this;
  }

  // 지금 실제로 쓰이는 배율 (화면 픽셀 / 월드 유닛)
  get effectiveZoom() {
    return this._effectiveZoom();
  }

  // 실제 화면 배율(픽셀/월드유닛).
  // 세로/가로 기준이 둘 다 있으면 더 작은 쪽(덜 확대되는 쪽)을 쓴다 -> 항상 두 기준 모두 최소한 보장.
  // pixelPerfect면 정수로 내림한다 - 타일맵처럼 붙여 그리는 스프라이트들 사이에
  // 이음새(seam)가 생기지 않으려면 위치뿐 아니라 배율 자체도 정수 픽셀이어야 한다.
  _effectiveZoom() {
    if (this.pixelZoom) return this.pixelZoom;
    const byHeight = this.baseViewHeight && this._height > 0
      ? (this._height * this.zoom) / this.baseViewHeight
      : null;
    const byWidth = this.baseViewWidth && this._width > 0
      ? (this._width * this.zoom) / this.baseViewWidth
      : null;

    let z;
    if (byHeight !== null && byWidth !== null) z = Math.min(byHeight, byWidth);
    else if (byHeight !== null) z = byHeight;
    else if (byWidth !== null) z = byWidth;
    else z = this.zoom;

    return Config.pixelPerfect ? Math.max(1, Math.floor(z)) : z;
  }

  // 매 프레임 RenderPipeline이 호출. Y축을 여기서 뒤집는다.
  updateMatrices(width, height, pixelRatio = 1) {
    this._width = width;
    this._height = height;
    this._pixelRatio = pixelRatio;

    const inv = this.transform.inverseWorldMatrix;
    const z = this._effectiveZoom();
    const m = this._view;

    m.a = z * inv.a;
    m.b = -z * inv.b;
    m.c = z * inv.c;
    m.d = -z * inv.d;
    m.e = z * inv.e + width / 2 + this._shake.x * pixelRatio;
    m.f = -z * inv.f + height / 2 + this._shake.y * pixelRatio;

    if (Config.pixelPerfect) {
      m.e = Math.round(m.e);
      m.f = Math.round(m.f);
    }

    if (!Matrix.invert(m, this._inverse)) Matrix.setIdentity(this._inverse);
    this._updateBounds(width, height);
    return m;
  }

  // 좌표 변환
  screenToWorld(x, y) {
    const inv = this._inverse;
    const px = x * this._pixelRatio;
    const py = y * this._pixelRatio;
    return new Vector(
      inv.a * px + inv.c * py + inv.e,
      inv.b * px + inv.d * py + inv.f
    );
  }

  worldToScreen(worldPoint) {
    const m = this._view;
    const r = this._pixelRatio;
    return new Vector(
      (m.a * worldPoint.x + m.c * worldPoint.y + m.e) / r,
      (m.b * worldPoint.x + m.d * worldPoint.y + m.f) / r
    );
  }

  // 컬링
  isInView(minX, minY, maxX, maxY) {
    const b = this._bounds;
    return !(maxX < b.minX || minX > b.maxX || maxY < b.minY || minY > b.maxY);
  }

  _updateBounds(width, height) {
    const inv = this._inverse;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const xs = [0, width, 0, width];
    const ys = [0, 0, height, height];

    for (let i = 0; i < 4; i++) {
      const wx = inv.a * xs[i] + inv.c * ys[i] + inv.e;
      const wy = inv.b * xs[i] + inv.d * ys[i] + inv.f;
      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
    }

    const b = this._bounds;
    b.minX = minX - this.cullingMargin;
    b.minY = minY - this.cullingMargin;
    b.maxX = maxX + this.cullingMargin;
    b.maxY = maxY + this.cullingMargin;
  }
}