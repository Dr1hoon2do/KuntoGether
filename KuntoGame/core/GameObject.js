class GameObject {
  // 생명주기 큐: 엔진이 매 프레임 트리 전체를 돌지 않고, 새로 붙었거나 상태가 바뀐 것만 처리한다
  static _awakeQueue = [];   // awake가 필요할 수 있는 GameObject (엔진에 붙거나 부모가 바뀐 것)
  static _startQueue = [];   // onEnable은 됐는데 start가 아직인 Component
  static _destroyQueue = []; // destroy()로 표시된 GameObject

  static _queueAwake(go) { GameObject._awakeQueue.push(go); }
  static _queueStart(c) { GameObject._startQueue.push(c); }

  // 배열을 돌다가 콜백 안에서 배열이 바뀌었을 때(제거/삽입) 현재 항목의 새 위치를 찾는다.
  // 매 프레임 [...배열] 복사를 안 하려고 쓴다.
  static _resync(arr, item, i) {
    const j = arr.indexOf(item);
    return j >= 0 ? j : i - 1;
  }

  constructor(name = 'GameObject') {
    // identity
    this._name = name;
    this._tags = [];
    this._transform = new Transform();
    this._transform._gameObject = this;
    this._components = [this._transform];

    // active state
    this._active = true;

    // lifecycle
    this._awoken = false;
    this._started = false;
    this._destroyed = false;

    // 이 오브젝트가 루트로 올라가 있는 엔진 (자식이면 null, engine 게터로 루트까지 올라가서 찾는다)
    this._engine = null;
  }

  // 속한 엔진. 루트까지 올라가서 그 루트가 엔진에 붙어 있으면 그 엔진, 아니면 null
  get engine() {
    let go = this;
    while (go._transform.parent) go = go._transform.parent._gameObject;
    return go._engine;
  }

  // identity getter/setter
  get name() { return this._name; }
  set name(v) { this._name = v; }
  get tags() { return this._tags; }
  get transform() { return this._transform; }
  get components() { return this._components; }

  
  get position() { return this._transform.position; }
  set position(v) { this._transform.position = v; }
  
  // active state
  get isActive() { return this._active; }
  get isDestroyed() { return this._destroyed; }

  get activeInHierarchy() {
    if (!this._active || this._destroyed) return false;
    const parent = this.transform.parent;
    return parent ? parent.gameObject.activeInHierarchy : true;
  }

  setActive(value) {
    if (this._active === value) return this;
    const before = this.activeInHierarchy;
    this._active = value;
    if (before !== this.activeInHierarchy) this._refreshHierarchy();
    return this;
  }

  // component management
  addComponent(component) {
    component._gameObject = this;
    this._components.push(component);

    if (this._awoken && !this._destroyed) {
      component._awoken = true;
      component.awake();
      if (this.activeInHierarchy && component.enabled) {
        component._enabledCalled = true;
        component.onEnable();
        if (!component._started) GameObject._queueStart(component);
      }
    }
    return component;
  }

  getComponent(Type) {
    return this.components.find((c) => c instanceof Type) ?? null;
  }

  getComponents(Type) {
    return this.components.filter((c) => c instanceof Type);
  }

  removeComponent(component) {
    const i = this._components.indexOf(component);
    if (i < 0) return false;

    this._components.splice(i, 1);
    if (component._enabledCalled) component.onDisable();
    if (component._awoken) component.onDestroy();
    component._gameObject = null;
    component._detached = true; // 떼어낸 컴포넌트 (owner로 건 트윈·이벤트가 멈춘다)
    return true;
  }

  // hierarchy
  get parent() {
    const p = this.transform.parent;
    return p ? p.gameObject : null;
  }

  addChild(gameObject) {
    gameObject.transform.setParent(this.transform);
    return gameObject;
  }

  find(name) {
    const t = this.transform.find(name);
    return t ? t.gameObject : null;
  }

  // destroy
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    GameObject._destroyQueue.push(this);
    for (const child of [...this.transform.children]) child.gameObject.destroy();
  }

  _destroyImmediate() {
    for (const child of [...this.transform.children]) child.gameObject._destroyImmediate();

    for (const c of [...this._components]) {
      if (c._enabledCalled) c.onDisable();
    }
    for (const c of [...this._components]) {
      if (c._awoken) c.onDestroy();
    }

    if (this.transform.parent) {
      const i = this.transform.parent.children.indexOf(this.transform);
      if (i >= 0) this.transform.parent.children.splice(i, 1);
    }
    this.transform.parent = null;

    this._components.length = 0;
  }

  // internal: onEnable/onDisable 재계산
  _refreshComponents() {
    const active = this.activeInHierarchy;
    for (const c of [...this._components]) {
      const should = active && c.enabled && c._awoken;
      if (should && !c._enabledCalled) {
        c._enabledCalled = true;
        c.onEnable();
        if (!c._started) GameObject._queueStart(c);
      } else if (!should && c._enabledCalled) {
        c._enabledCalled = false;
        c.onDisable();
      }
    }
  }

  _refreshHierarchy() {
    this._refreshComponents();
    for (const child of [...this.transform.children]) child.gameObject._refreshHierarchy();
  }

  // lifecycle pass
  _awakePass() {
    if (this._destroyed) return;
    this._awoken = true;
    for (const c of [...this._components]) {
      if (!c._awoken) {
        c._awoken = true;
        c.awake();
      }
    }
    this._refreshComponents();
    // 엔진 밖에 있을 때 켜져서 start 큐에서 버려졌던 컴포넌트를 다시 넣는다
    for (const c of this._components) {
      if (c._enabledCalled && !c._started) GameObject._queueStart(c);
    }
    for (const child of [...this.transform.children]) child.gameObject._awakePass();
  }

  _startPass() {
    if (this._destroyed) return;
    for (const c of [...this._components]) {
      if (!c._started && c._enabledCalled) {
        c._started = true;
        c.start();
      }
    }
    for (const child of [...this.transform.children]) child.gameObject._startPass();
  }

  // update/lateUpdate: 매 프레임 도는 곳이라 배열을 복사하지 않고 돈다 (중간에 바뀌면 _resync로 위치를 다시 잡는다)
  _updatePass(deltaTime) {
    if (this._destroyed || !this._active) return;
    const comps = this._components;
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i];
      if (c._started && c.enabled) c.update(deltaTime);
      if (comps[i] !== c) i = GameObject._resync(comps, c, i);
    }
    const kids = this._transform.children;
    for (let i = 0; i < kids.length; i++) {
      const t = kids[i];
      t._gameObject._updatePass(deltaTime);
      if (kids[i] !== t) i = GameObject._resync(kids, t, i);
    }
  }

  _lateUpdatePass(deltaTime) {
    if (this._destroyed || !this._active) return;
    const comps = this._components;
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i];
      if (c._started && c.enabled) c.lateUpdate(deltaTime);
      if (comps[i] !== c) i = GameObject._resync(comps, c, i);
    }
    const kids = this._transform.children;
    for (let i = 0; i < kids.length; i++) {
      const t = kids[i];
      t._gameObject._lateUpdatePass(deltaTime);
      if (kids[i] !== t) i = GameObject._resync(kids, t, i);
    }
  }
}