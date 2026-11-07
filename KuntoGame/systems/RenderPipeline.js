class RenderPipeline {
  constructor(options = {}) {
    // 설정
    this.sortingLayers = options.sortingLayers ?? ['Background', 'Default', 'Foreground', 'UI'];
    this.culling = options.culling ?? true;

    // 통계 (디버깅용)
    this.drawCalls = 0;
    this.culledCount = 0;
    this.visibleCount = 0;

    // 내부 스크래치
    this._renderers = [];
    this._cameras = [];
    this._uiList = [];
    this._defaultLayer = Math.max(0, this.sortingLayers.indexOf('Default'));
    this._scratch = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    this._visible = [];
    this._layerCache = new Map(); // 레이어 이름 -> 순서 (매 렌더러마다 indexOf 안 하게)
  }

  // 이번 프레임에 그려진 순서대로 정렬된 UI 렌더러 목록 (위에 그려진 게 배열 뒤쪽)
  get sortedUIRenderers() {
    return this._uiList;
  }

  layerIndex(name) {
    let i = this._layerCache.get(name);
    if (i === undefined) {
      i = this.sortingLayers.indexOf(name);
      if (i < 0) i = this._defaultLayer;
      this._layerCache.set(name, i);
    }
    return i;
  }

  // Engine이 매 프레임 호출: render(ctx, engine)
  render(ctx, engine) {
    // sortingLayers를 바꿨으면 레이어 캐시를 비운다
    if (this._layersKey !== this.sortingLayers.join('|')) {
      this._layersKey = this.sortingLayers.join('|');
      this._defaultLayer = Math.max(0, this.sortingLayers.indexOf('Default'));
      this._layerCache.clear();
    }
    this._renderers.length = 0;
    this._cameras.length = 0;
    this.drawCalls = 0;
    this.culledCount = 0;

    for (const root of engine.roots) this._collect(root);
    this.visibleCount = this._renderers.length;

    if (this._cameras.length > 0) {
      this._cameras.sort((a, b) => a.depth - b.depth);
      if (!Camera.main || !Camera.main.isActiveAndEnabled) Camera.main = this._cameras[0];

      const width = engine.canvas.width;
      const height = engine.canvas.height;
      const ratio = engine.pixelRatio;

      for (const camera of this._cameras) {
        camera.updateMatrices(width, height, ratio);
        this._renderCamera(ctx, camera);
      }
    }

    this._renderUI(ctx, engine);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // 트리 순회하며 카메라/렌더러 수집
  _collect(gameObject) {
    if (!gameObject.isActive || gameObject.isDestroyed) return;
    if (gameObject.getComponent(RectTransform)) return; // UI 오브젝트는 _renderUI에서 별도 처리

    for (const c of gameObject.components) {
      if (c instanceof Camera) {
        if (c.isActiveAndEnabled) this._cameras.push(c);
      } else if (c instanceof Renderer) {
        if (c.isVisible) this._renderers.push(c);
      }
    }

    for (const child of gameObject.transform.children) this._collect(child.gameObject);
  }

  // UI: RectTransform 트리를 따로 순회 (Transform 계층과 무관)
  _renderUI(ctx, engine) {
    this._uiList.length = 0;

    const uiRoot = engine.uiRoot;
    if (!uiRoot) return;

    // 최상위 UI는 sortOrder 순서로 (같으면 만든 순서. 정렬은 안정 정렬이다)
    const roots = this._uiRoots ?? (this._uiRoots = []);
    roots.length = 0;
    roots.push(...uiRoot._roots);
    roots.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const root of roots) this._collectUI(root, this._uiList);
    if (this._uiList.length === 0) return;

    for (const r of this._uiList) {
      r._layerIndex = this.layerIndex(r.sortingLayer);
    }
    this._uiList.sort(renderPipelineCompare);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const r of this._uiList) {
      const clipped = UIMask.clip(ctx, r.getComponent(RectTransform));
      r.render(ctx, null);
      if (clipped) ctx.restore();
      this.drawCalls++;
    }
  }

  // 꺼진(비활성/파괴) UI는 자식까지 통째로 건너뛴다
  _collectUI(rectTransform, out) {
    const go = rectTransform.gameObject;
    if (!go || !go.isActive || go.isDestroyed) return;
    for (const c of go.components) {
      if (c instanceof Renderer && c.isVisible) out.push(c);
    }
    for (const child of rectTransform.children) this._collectUI(child, out);
  }

  // 컬링 + 정렬 + 그리기
  _renderCamera(ctx, camera) {
    const visible = this._visible;
    visible.length = 0;

    for (const r of this._renderers) {
      if (this.culling) {
        const b = r.getBounds(this._scratch);
        if (b && !camera.isInView(b.minX, b.minY, b.maxX, b.maxY)) {
          this.culledCount++;
          continue;
        }
      }
      r._layerIndex = this.layerIndex(r.sortingLayer);
      r._sortY = r.ySort ? r.transform.worldMatrix.f : 0;
      visible.push(r);
    }

    visible.sort(renderPipelineCompare);

    for (const r of visible) {
      r.render(ctx, camera);
      this.drawCalls++;
    }
  }
}

// 정렬 키: 레이어 -> orderInLayer -> 월드 Y 내림차순 (Y-up이라 큰 Y가 더 멀리 있는 것)
function renderPipelineCompare(a, b) {
  if (a._layerIndex !== b._layerIndex) return a._layerIndex - b._layerIndex;
  if (a.orderInLayer !== b.orderInLayer) return a.orderInLayer - b.orderInLayer;
  return b._sortY - a._sortY;
}