class Renderer extends Component {
  constructor() {
    super();
    // 정렬
    this.sortingLayer = 'Default';
    this.orderInLayer = 0;
    this.ySort = false;

    // 표시
    this.visible = true;
    this.opacity = 1;

    // RenderPipeline이 매 프레임 채워넣는 정렬용 캐시
    this._layerIndex = 0;
    this._sortY = 0;
  }

  get isVisible() {
    return this.visible && this.opacity > 0 && this.isActiveAndEnabled;
  }

  // 컬링용 월드 AABB. 서브클래스가 override, 못 구하면 null
  getBounds(out) {
    return null;
  }

  // 서브클래스가 override
  render(ctx, camera) {}
}