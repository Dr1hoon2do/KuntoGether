class Engine {
  constructor(options = {}) {
    // 캔버스/렌더 설정
    const target = options.canvas;
    this.canvas = typeof target === 'string' ? document.querySelector(target) : target;
    this.ctx = this.canvas.getContext('2d', { alpha: options.alpha ?? false });
    this.clearColor = options.clearColor ?? '#000000';
    this.pixelRatio = options.pixelRatio ?? 1;
    this.imageSmoothing = options.imageSmoothing ?? false;
    this.pauseOnBlur = options.pauseOnBlur ?? true;

    // 확장 지점: 기본값을 자동 구성, 끄고 싶으면 옵션에 false/null 전달
    this.renderer = options.renderer !== undefined ? options.renderer : new RenderPipeline();
    this.systems = [];

    // 루트 GameObject 관리
    this._roots = [];

    // 루프 상태
    this._running = false;
    this._rafId = 0;

    this._frame = this._frame.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    this._onResize = this._onResize.bind(this);

    this._installListeners();
    this.resize();

    // 기본 Input
    if (options.input !== false) {
      this.addSystem(Input);
      Input.useDefaultBindings();
    }

    // 트윈은 GameObject update 전에 값을 움직이고, 디버그 표시는 화면을 다 그린 뒤 맨 위에 그린다 (Config.debug로 켜고 끔)
    this.addSystem(Tween);
    this.addSystem(Debug);
    this.frameMs = 0; // 지난 프레임의 엔진 작업 시간 (ms, 디버그 표시용)

    // 기본 카메라. Config.viewWidth/viewHeight 기준(없으면 16:9 320x180)으로 최소한 보이는 범위를 보장.
    const cfg = typeof Config !== 'undefined' ? Config : {};
    this.camera = null;
    if (options.camera !== false) {
      const camGO = this.create('camera');
      this.camera = camGO.addComponent(new Camera(options.zoom ?? cfg.zoom ?? 1));
      this.camera.setBaseView(
        options.viewWidth ?? cfg.viewWidth ?? 320,
        options.viewHeight ?? cfg.viewHeight ?? 180
      );
    }

    // UI 루트. 카메라와 같은 기준 해상도를 공유한다.
    this.uiRoot = null;
    if (options.ui !== false) {
      this.uiRoot = new UIRoot(
        options.viewWidth ?? cfg.viewWidth ?? 320,
        options.viewHeight ?? cfg.viewHeight ?? 180,
        {
          mode: options.uiScaleMode ?? cfg.uiScaleMode ?? 'fit',
          scale: options.uiScale ?? cfg.uiScale ?? 1
        }
      );
      this.uiRoot.update(this.canvas.width, this.canvas.height);
      this.addSystem(UIEventSystem); // Input 다음에 등록되어야 프레임 순서가 맞음
    }
  }

  // UI 오브젝트 생성: GameObject + RectTransform을 붙이고 uiRoot에 연결
  createUI(name) {
    const go = this.create(name);
    const rt = go.addComponent(new RectTransform());
    if (this.uiRoot) this.uiRoot.attach(rt);
    return go;
  }

  // public getter
  get width() { return this.canvas.width / this.pixelRatio; }
  get height() { return this.canvas.height / this.pixelRatio; }
  get isRunning() { return this._running; }
  get roots() { return this._roots; }

  // 시스템 관리 (Input 등)
  addSystem(system) {
    if (!this.systems.includes(system)) this.systems.push(system);
    if (typeof system.attach === 'function') system.attach(this);
    return system;
  }

  removeSystem(system) {
    const i = this.systems.indexOf(system);
    if (i >= 0) this.systems.splice(i, 1);
    if (typeof system.detach === 'function') system.detach(this);
    return this;
  }

  // 루트 GameObject 관리
  create(name) {
    return this.add(new GameObject(name));
  }

  // 루트로 붙인다. 이미 다른 오브젝트의 자식이면 아무것도 안 한다 (부모를 통해 이미 엔진에 있다)
  add(gameObject) {
    if (gameObject.transform.parent) return gameObject;
    if (gameObject._engine !== this) {
      gameObject._engine = this;
      this._roots.push(gameObject);
    }
    GameObject._queueAwake(gameObject);
    return gameObject;
  }

  // 루트 목록에서 뺀다 (파괴하지는 않는다)
  remove(gameObject) {
    if (gameObject._engine !== this) return gameObject;
    const i = this._roots.indexOf(gameObject);
    if (i >= 0) this._roots.splice(i, 1);
    gameObject._engine = null;
    return gameObject;
  }

  // 이름으로 GameObject 탐색 (루트 -> 자식까지 재귀)
  find(name) {
    for (const root of this._roots) {
      if (root.name === name) return root;
      const found = root.find(name);
      if (found) return found;
    }
    return null;
  }

  // 시작/정지
  start() {
    if (this._running) return this;
    this._running = true;
    Time.resync();
    this._rafId = requestAnimationFrame(this._frame);
    return this;
  }

  stop() {
    if (!this._running) return this;
    this._running = false;
    cancelAnimationFrame(this._rafId);
    this._rafId = 0;
    return this;
  }

  // 리사이즈
  resize() {
    const rect = this.canvas.getBoundingClientRect
      ? this.canvas.getBoundingClientRect()
      : { width: this.canvas.width, height: this.canvas.height };
    const w = Math.max(1, Math.round((rect.width || this.canvas.width) * this.pixelRatio));
    const h = Math.max(1, Math.round((rect.height || this.canvas.height) * this.pixelRatio));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.imageSmoothingEnabled = this.imageSmoothing;
    return this;
  }

  // 내부: 프레임 루프
  _frame(timestamp) {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(this._frame);

    Time.update(timestamp);
    const t0 = performance.now();

    for (const system of this.systems) {
      if (typeof system.update === 'function') system.update();
    }

    if (this.uiRoot) this.uiRoot.update(this.canvas.width, this.canvas.height);

    const dt = Time.deltaTime;

    this._lifecycle();
    const roots = this._roots;
    for (let i = 0; i < roots.length; i++) {
      const r = roots[i];
      r._updatePass(dt);
      if (roots[i] !== r) i = GameObject._resync(roots, r, i);
    }
    for (let i = 0; i < roots.length; i++) {
      const r = roots[i];
      r._lateUpdatePass(dt);
      if (roots[i] !== r) i = GameObject._resync(roots, r, i);
    }

    this._clear();
    if (this.renderer) this.renderer.render(this.ctx, this);

    this._flushDestroyed();
    this.frameMs = performance.now() - t0;

    // 시스템이 화면 위에 덧그리는 것 (디버그 표시 등)
    for (const system of this.systems) {
      if (typeof system.render === 'function') system.render(this.ctx, this);
    }

    for (const system of this.systems) {
      if (typeof system.lateUpdate === 'function') system.lateUpdate();
    }
  }

  _clear() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.clearColor === null) {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      ctx.fillStyle = this.clearColor;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  // awake/start: 새로 붙었거나 상태가 바뀐 것만 처리한다 (예전엔 매 프레임 트리 전체를 두 번 돌았다).
  // awake 중에 또 붙은 오브젝트도 같은 프레임에 처리한다.
  _lifecycle() {
    for (let guard = 0; GameObject._awakeQueue.length > 0 && guard < 16; guard++) {
      const queue = GameObject._awakeQueue;
      GameObject._awakeQueue = [];
      for (const go of queue) {
        if (!go._destroyed && go.engine === this) go._awakePass();
      }
    }
    const starts = GameObject._startQueue;
    for (let i = 0; i < starts.length; i++) {
      const c = starts[i];
      const go = c._gameObject;
      if (c._started || !c._enabledCalled || !go || go._destroyed || go.engine !== this) continue;
      c._started = true;
      c.start();
    }
    starts.length = 0;
  }

  // 파괴: destroy()로 표시된 것만 정리한다 (예전엔 매 프레임 트리 전체를 훑었다)
  _flushDestroyed() {
    const queue = GameObject._destroyQueue;
    if (queue.length === 0) return;
    GameObject._destroyQueue = [];
    for (const go of queue) {
      if (go._engine) go._engine.remove(go);
      if (go._components.length > 0 || go.transform.parent) go._destroyImmediate();
    }
  }

  // 내부: 탭 전환/리사이즈 리스너
  _onVisibility() {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      if (this.pauseOnBlur) this.stop();
    } else {
      Time.resync();
      if (this.pauseOnBlur && !this._running) this.start();
    }
  }

  _onResize() {
    this.resize();
  }

  _installListeners() {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', this._onVisibility);
    }
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(this._onResize);
      this._resizeObserver.observe(this.canvas);
    } else if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('resize', this._onResize);
    }
  }
}