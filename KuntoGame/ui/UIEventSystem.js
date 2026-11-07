class UIEventSystem {
  static enabled = true;

  static _engine = null;
  static _captured = new Map(); // pointerId -> UIElement

  static attach(engine) {
    UIEventSystem._engine = engine;
  }

  static detach() {
    UIEventSystem._engine = null;
    UIEventSystem._captured.clear();
  }

  // Engine이 매 프레임 호출. Input.update() 다음, GameObject Update 이전이어야 한다.
  static update() {
    if (!UIEventSystem.enabled) return;
    const engine = UIEventSystem._engine;
    if (!engine || !engine.renderer) return;

    // 파괴되었거나 비활성화된 캡처는 정리
    for (const [id, el] of UIEventSystem._captured) {
      if (!el.gameObject || el.gameObject.isDestroyed || !el.isActiveAndEnabled) {
        UIEventSystem._captured.delete(id);
      }
    }

    for (const pointer of Input.pointers) {
      let captured = UIEventSystem._captured.get(pointer.id);

      if (captured) {
        pointer.consume();
        // 스크롤 목록 안의 버튼을 끌기 시작하면 누른 것을 취소하고 목록 스크롤로 넘긴다 (행이 목록을 가득 채워도 끌어서 스크롤된다)
        if (!pointer.released && captured instanceof UIButton && pointer.dragDistance > Input.dragThreshold) {
          const view = UIEventSystem._scrollAncestor(captured);
          if (view) {
            captured.onPointerUp(pointer);
            UIEventSystem._captured.set(pointer.id, view);
            view.onPointerDown(pointer);
            captured = view;
          }
        }
        if (pointer.released) {
          UIEventSystem._captured.delete(pointer.id);
          captured.onPointerUp(pointer);
          const hitNow = UIEventSystem._hitTest(engine, pointer.position.x, pointer.position.y);
          // 버튼을 끌고 나서 뗀 것은 탭이 아니다
          const dragged = captured instanceof UIButton && pointer.dragDistance > Input.dragThreshold;
          if (hitNow === captured && !dragged) captured.onClick(pointer);
        } else {
          captured.onDrag(pointer);
        }
        continue;
      }

      if (pointer.pressed) {
        const hit = UIEventSystem._hitTest(engine, pointer.position.x, pointer.position.y);
        if (hit) {
          pointer.consume();
          hit.onPointerDown(pointer);
          // 누름과 뗌이 같은 프레임에 들어온 짧은 탭: 다음 프레임엔 포인터가 지워지므로 여기서 바로 끝낸다
          if (pointer.released) {
            hit.onPointerUp(pointer);
            hit.onClick(pointer);
          } else {
            UIEventSystem._captured.set(pointer.id, hit);
          }
        }
      }
    }
  }

  // el 위쪽(부모들)에 있는 가장 가까운 UIScrollView. 없으면 null
  static _scrollAncestor(el) {
    for (let go = el.gameObject && el.gameObject.parent; go; go = go.parent) {
      const view = go.getComponent(UIScrollView);
      if (view && view.isActiveAndEnabled) return view;
    }
    return null;
  }

  // 화면 좌표(x, y)에 있는 맨 위 UI 요소. 없으면 null. 월드 입력이 UI 위인지 확인할 때 쓴다.
  static raycast(x, y) {
    const engine = UIEventSystem._engine;
    if (!engine || !engine.renderer) return null;
    return UIEventSystem._hitTest(engine, x, y);
  }

  // RenderPipeline이 정렬해둔 순서를 그대로 재사용 (그려진 순서의 역순으로 검사)
  // x, y는 포인터 좌표(CSS px). RectTransform.rect는 캔버스 device px라서 pixelRatio를 곱해 맞춘다.
  static _hitTest(engine, x, y) {
    const k = engine.pixelRatio || 1;
    x *= k;
    y *= k;
    const list = engine.renderer.sortedUIRenderers;
    for (let i = list.length - 1; i >= 0; i--) {
      const go = list[i].gameObject;
      if (!go) continue;

      const el = go.getComponent(UIElement);
      if (!el || !el.raycastTarget || !el.isActiveAndEnabled) continue;

      const rt = go.getComponent(RectTransform);
      if (!rt) continue;

      const r = rt.rect;
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height && UIMask.contains(rt, x, y)) {
        return el;
      }
    }
    return null;
  }
}