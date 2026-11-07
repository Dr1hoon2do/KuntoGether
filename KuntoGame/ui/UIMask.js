// 이 컴포넌트가 붙은 RectTransform 밖으로 나간 자손 UI는 잘려서 그려지고, 클릭도 안 된다.
// 마스크가 겹치면 모든 조상 마스크의 교집합만 보인다.
class UIMask extends Component {
  // RenderPipeline이 호출: 조상 마스크로 ctx를 잘라둔다. 잘랐으면 true (호출자가 restore)
  static clip(ctx, rectTransform) {
    let clipped = false;
    for (let p = rectTransform.parent; p; p = p.parent) {
      if (!p.gameObject.getComponent(UIMask)) continue;
      if (!clipped) ctx.save();
      clipped = true;
      const r = p.rect;
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.width, r.height);
      ctx.clip();
    }
    return clipped;
  }

  // UIEventSystem이 호출: 점이 모든 조상 마스크 안에 있는지
  static contains(rectTransform, x, y) {
    for (let p = rectTransform.parent; p; p = p.parent) {
      if (!p.gameObject.getComponent(UIMask)) continue;
      const r = p.rect;
      if (x < r.x || x > r.x + r.width || y < r.y || y > r.y + r.height) return false;
    }
    return true;
  }
}
