class UIButton extends UIElement {
  constructor(options = {}) {
    super();
    // Input 액션 이름. 지정하면 누르는 동안 Input.getButton(action)이 true가 된다.
    this.action = options.action ?? null;

    // 눌린 상태 이미지 (없으면 기본 이미지 유지)
    this.pressedSprite = options.pressedSprite ?? null;
    this.pressedRegion = options.pressedRegion ?? null;

    // 콜백
    this.onPress = options.onPress ?? null;
    this.onRelease = options.onRelease ?? null;
    this.onTap = options.onTap ?? null;

    this.pressed = false;
    this._image = null;
    this._normalSprite = null;
    this._normalRegion = null;
  }

  start() {
    this._image = this.getComponent(UIImage);
    if (this._image) {
      this._normalSprite = this._image.sprite;
      this._normalRegion = this._image.region;
    }
  }

  // 기본/눌림 이미지 영역을 바꾼다 (켜짐/꺼짐 아이콘 전환 등)
  setRegions(normalRegion, pressedRegion = normalRegion) {
    this._normalRegion = normalRegion;
    this.pressedRegion = pressedRegion;
    const image = this._image ?? this.getComponent(UIImage); // start 전에 불려도 이미지에 바로 반영
    if (image) image.setSprite(image.sprite, this.pressed ? pressedRegion : normalRegion);
    return this;
  }

  onPointerDown(pointer) { this._setPressed(true); }
  onPointerUp(pointer) { this._setPressed(false); }
  onClick(pointer) { if (this.onTap) this.onTap(this); }
  onDisable() { this._setPressed(false); }

  _setPressed(value) {
    if (this.pressed === value) return;
    this.pressed = value;

    if (this.action) Input.setVirtualButton(this.action, value);

    if (this._image) {
      if (value) this._image.setSprite(this.pressedSprite ?? this._normalSprite, this.pressedRegion ?? this._normalRegion);
      else this._image.setSprite(this._normalSprite, this._normalRegion);
    }

    const cb = value ? this.onPress : this.onRelease;
    if (cb) cb(this);
  }
}
