class Component {
  constructor() {
    // identity
    this._gameObject = null;
    this._enabled = true;

    // lifecycle
    this._awoken = false;
    this._started = false;
    this._enabledCalled = false;
  }

  // identity getter/setter
  get gameObject() { return this._gameObject; }
  get enabled() { return this._enabled; }
  set enabled(value) {
    if (this._enabled === value) return;
    this._enabled = value;
    if (this._gameObject) this._gameObject._refreshComponents();
  }

  get isActiveAndEnabled() { return this.enabled && this.gameObject.activeInHierarchy; }

  // gameObject 위임
  get transform() { return this._gameObject.transform; }
  get name() { return this._gameObject.name; }
  getComponent(Type) { return this.gameObject.getComponent(Type); }
  getComponents(Type) { return this.gameObject.getComponents(Type); }
  addComponent(component) { return this.gameObject.addComponent(component); }
  destroy() { this.gameObject.removeComponent(this); }

  // override
  awake() {}
  onEnable() {}
  start() {}
  update(deltaTime) {}
  lateUpdate(deltaTime) {}
  onDisable() {}
  onDestroy() {}
}