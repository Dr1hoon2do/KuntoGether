// 입자 시스템: 작은 네모 입자 수백~수천 개를 GameObject 없이 한 컴포넌트가 다룬다.
// - 입자 데이터는 미리 잡아 둔 Float32Array에 들어 있고, 죽은 입자는 맨 끝 것과 바꿔 지운다 (매 프레임 할당 없음).
// - 그릴 때는 색이 같은 입자끼리 몰아서 fillStyle을 한 번만 바꾼다.
// - 월드 좌표(Y-up) 기준. 중력은 아래로 당기려면 음수 (예: gravity: -300).
//
//   const ps = go.addComponent(new ParticleSystem({ capacity: 1024 }));
//   ps.emit(x, y, { count: 12, colors: ['#6a4', '#383'], speed: [20, 60], life: [0.3, 0.6], gravity: -300 });
class ParticleSystem extends Renderer {
  // 이미지(또는 그 영역)에서 많이 쓰인 색 몇 개를 뽑는다. 결과는 캐시. 입자 색을 그림에 맞출 때 쓴다.
  static _paletteCache = new Map();

  static paletteFromImage(image, region = null, max = 5) {
    if (!image) return ['#ffffff'];
    const r = region ?? { x: 0, y: 0, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
    const key = (image.src || image._paletteId || (image._paletteId = 'img' + ParticleSystem._paletteCache.size)) +
      `|${r.x},${r.y},${r.width},${r.height}|${max}`;
    const cached = ParticleSystem._paletteCache.get(key);
    if (cached) return cached;

    let colors = ['#ffffff'];
    try {
      const c = document.createElement('canvas');
      c.width = r.width;
      c.height = r.height;
      const g = c.getContext('2d');
      g.drawImage(image, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
      const data = g.getImageData(0, 0, r.width, r.height).data;
      const counts = new Map();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        // 비슷한 색은 묶는다 (채널당 16단계)
        const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
        const e = counts.get(k);
        if (e) { e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2]; }
        else counts.set(k, { n: 1, r: data[i], g: data[i + 1], b: data[i + 2] });
      }
      // 아주 어두운 색(외곽선)은 다른 색이 있으면 뺀다
      let entries = [...counts.values()];
      const bright = entries.filter((e) => Math.max(e.r, e.g, e.b) / e.n >= 48);
      if (bright.length) entries = bright;
      const top = entries.sort((a, b) => b.n - a.n).slice(0, max);
      if (top.length) colors = top.map((e) => `rgb(${Math.round(e.r / e.n)},${Math.round(e.g / e.n)},${Math.round(e.b / e.n)})`);
    } catch (err) {
      // 다른 출처 이미지 등으로 픽셀을 못 읽으면 흰색
    }
    ParticleSystem._paletteCache.set(key, colors);
    return colors;
  }

  constructor(options = {}) {
    super();
    this.capacity = options.capacity ?? 1024;
    this.sortingLayer = options.sortingLayer ?? 'Foreground';
    if (options.orderInLayer !== undefined) this.orderInLayer = options.orderInLayer;
    this.pixelSnap = options.pixelSnap ?? true;
    this.unscaled = options.unscaled ?? false;

    const n = this.capacity;
    this._x = new Float32Array(n);
    this._y = new Float32Array(n);
    this._vx = new Float32Array(n);
    this._vy = new Float32Array(n);
    this._age = new Float32Array(n);
    this._life = new Float32Array(n);
    this._size = new Float32Array(n);
    this._grav = new Float32Array(n);
    this._drag = new Float32Array(n);
    this._fade = new Uint8Array(n);
    this._color = new Uint16Array(n); // 색 목록(_colors)의 번호
    this.count = 0;

    this._colors = [];          // 색 문자열 목록 (번호 -> 색)
    this._colorIndex = new Map(); // 색 -> 번호
    this._bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    this._order = new Uint16Array(n); // 그릴 때 색별 정렬용
    this._bucket = [];
  }

  _colorId(color) {
    let id = this._colorIndex.get(color);
    if (id === undefined) {
      id = this._colors.length;
      this._colors.push(color);
      this._colorIndex.set(color, id);
    }
    return id;
  }

  // 입자 뿌리기 (월드 좌표). 범위 옵션은 숫자 하나 또는 [최소, 최대]
  //   count, colors(배열), speed, angle(라디안, 기본 위쪽), spread(라디안, 기본 2π = 사방),
  //   life(초), size(px), gravity, drag(초당 감속 비율), area(뿌리는 반경 px), fade(true면 끝에 흐려짐)
  emit(x, y, o = {}) {
    const count = o.count ?? 8;
    const colors = o.colors && o.colors.length ? o.colors : ['#ffffff'];
    const ids = colors.map((c) => this._colorId(c));
    const angle = o.angle ?? Math.PI / 2;
    const spread = o.spread ?? Math.PI * 2;
    const area = o.area ?? 0;
    const fade = (o.fade ?? true) ? 1 : 0;
    const gravity = o.gravity ?? 0;
    const drag = o.drag ?? 0;
    const rnd = ParticleSystem._range;

    for (let i = 0; i < count; i++) {
      if (this.count >= this.capacity) this._kill((Math.random() * this.count) | 0); // 가득 차면 아무거나 하나 밀어낸다
      const p = this.count++;
      const a = angle + (Math.random() - 0.5) * spread;
      const s = rnd(o.speed ?? [10, 40]);
      this._x[p] = x + (Math.random() * 2 - 1) * area;
      this._y[p] = y + (Math.random() * 2 - 1) * area;
      this._vx[p] = Math.cos(a) * s;
      this._vy[p] = Math.sin(a) * s;
      this._age[p] = 0;
      this._life[p] = Math.max(0.01, rnd(o.life ?? [0.3, 0.6]));
      this._size[p] = rnd(o.size ?? [1, 2]);
      this._grav[p] = gravity;
      this._drag[p] = drag;
      this._fade[p] = fade;
      this._color[p] = ids[(Math.random() * ids.length) | 0];
    }
    return this;
  }

  static _range(v) {
    return Array.isArray(v) ? v[0] + Math.random() * (v[1] - v[0]) : v;
  }

  clear() {
    this.count = 0;
  }

  _kill(i) {
    const last = --this.count;
    if (i === last) return;
    this._x[i] = this._x[last];
    this._y[i] = this._y[last];
    this._vx[i] = this._vx[last];
    this._vy[i] = this._vy[last];
    this._age[i] = this._age[last];
    this._life[i] = this._life[last];
    this._size[i] = this._size[last];
    this._grav[i] = this._grav[last];
    this._drag[i] = this._drag[last];
    this._fade[i] = this._fade[last];
    this._color[i] = this._color[last];
  }

  update(dt) {
    if (this.count === 0) return;
    if (this.unscaled) dt = Time.unscaledDeltaTime;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < this.count; i++) {
      const age = this._age[i] + dt;
      if (age >= this._life[i]) {
        this._kill(i);
        i--;
        continue;
      }
      this._age[i] = age;
      const d = this._drag[i];
      if (d > 0) {
        const k = Math.max(0, 1 - d * dt);
        this._vx[i] *= k;
        this._vy[i] *= k;
      }
      this._vy[i] += this._grav[i] * dt;
      const x = (this._x[i] += this._vx[i] * dt);
      const y = (this._y[i] += this._vy[i] * dt);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const b = this._bounds;
    b.minX = minX - 4;
    b.minY = minY - 4;
    b.maxX = maxX + 4;
    b.maxY = maxY + 4;
  }

  get isVisible() {
    return this.count > 0 && super.isVisible;
  }

  getBounds(out) {
    const b = this._bounds;
    out.minX = b.minX;
    out.minY = b.minY;
    out.maxX = b.maxX;
    out.maxY = b.maxY;
    return out;
  }

  render(ctx, camera) {
    const n = this.count;
    if (n === 0) return;
    const m = camera.viewMatrix;
    // 화면 픽셀 좌표로 직접 계산해서 그린다 (setTransform 한 번, 입자마다 행렬 없음)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sx = Math.hypot(m.a, m.b); // 월드 1px -> 화면 px 배율

    // 색별로 묶기 (계수 정렬)
    const nc = this._colors.length;
    const bucket = this._bucket;
    for (let c = 0; c <= nc; c++) bucket[c] = 0;
    for (let i = 0; i < n; i++) bucket[this._color[i] + 1]++;
    for (let c = 1; c <= nc; c++) bucket[c] += bucket[c - 1];
    const order = this._order;
    for (let i = 0; i < n; i++) order[bucket[this._color[i]]++] = i;

    const snap = this.pixelSnap;
    const baseAlpha = this.opacity;
    let lastColor = -1;
    let lastAlpha = -1;
    for (let j = 0; j < n; j++) {
      const i = order[j];
      const c = this._color[i];
      if (c !== lastColor) {
        ctx.fillStyle = this._colors[c];
        lastColor = c;
      }
      let alpha = baseAlpha;
      if (this._fade[i]) {
        const k = this._age[i] / this._life[i];
        if (k > 0.6) alpha *= 1 - (k - 0.6) / 0.4;
      }
      // 알파는 몇 단계로만 바꿔서 상태 변경을 줄인다
      alpha = Math.round(alpha * 8) / 8;
      if (alpha <= 0) continue;
      if (alpha !== lastAlpha) {
        ctx.globalAlpha = alpha;
        lastAlpha = alpha;
      }
      const wx = this._x[i];
      const wy = this._y[i];
      const px = m.a * wx + m.c * wy + m.e;
      const py = m.b * wx + m.d * wy + m.f;
      const size = Math.max(1, this._size[i] * sx);
      if (snap) ctx.fillRect(Math.round(px - size / 2), Math.round(py - size / 2), Math.round(size), Math.round(size));
      else ctx.fillRect(px - size / 2, py - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }
}
