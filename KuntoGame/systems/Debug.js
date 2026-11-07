// 디버그 표시: 화면 구석에 FPS, 프레임 시간, 그린 개수, 오브젝트 수, 트윈 수와 게임이 넣은 값을 보여 준다.
// showBounds면 월드 렌더러의 컬링 사각형(바운드)도 그린다.
//
//   Config.debug = true;            // 처음부터 켜기 (config.js). 실행 중에는 F3으로 켜고 끈다 (Input 버튼 "debug")
//   Debug.enabled = true;           // 코드로 켜고 끄기
//   Debug.set("턴", turn);          // 게임 값 한 줄 (같은 이름이면 덮어쓴다)
//   Debug.showBounds = true;
//   Debug.opacity = 0.5;            // 표시 창 전체 투명도 (0~1, 배경과 글자 모두)
//
// Engine이 시스템으로 등록하고, 화면을 다 그린 뒤 render(ctx, engine)를 부른다.
class Debug {
  static enabled = false;
  static showBounds = false;
  static corner = 'top-left';      // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  static offset = { x: 8, y: 8 };  // 구석에서 띄울 거리 (CSS px)
  static opacity = 1;              // 표시 창 전체 투명도 (0~1)

  static _engine = null;
  static _values = new Map();
  static _objects = 0;
  static _frame = 0;
  static _frameMs = 0;

  static attach(engine) {
    Debug._engine = engine;
    if (typeof Config !== 'undefined' && Config.debug !== undefined) Debug.enabled = !!Config.debug;
    if (typeof Input !== 'undefined' && !Input.hasButton?.('debug')) Input.defineButton('debug', ['F3']);
  }

  static detach() {
    Debug._engine = null;
  }

  static set(name, value) {
    Debug._values.set(name, value);
  }

  static remove(name) {
    Debug._values.delete(name);
  }

  static update() {
    if (typeof Input !== 'undefined' && Input.getButtonDown('debug')) Debug.enabled = !Debug.enabled;
  }

  // 전체 GameObject 수 (30프레임에 한 번만 센다)
  static _countObjects(engine) {
    let n = 0;
    const walk = (go) => {
      n++;
      for (const t of go.transform.children) walk(t.gameObject);
    };
    for (const r of engine.roots) walk(r);
    return n;
  }

  static render(ctx, engine) {
    if (!Debug.enabled) return;
    const r = engine.renderer;
    if (Debug.showBounds && r && Camera.main) Debug._drawBounds(ctx, r, Camera.main);

    if (Debug._frame++ % 30 === 0) Debug._objects = Debug._countObjects(engine);
    Debug._frameMs += ((engine.frameMs ?? 0) - Debug._frameMs) * 0.1;

    const lines = [
      `FPS ${Time.fps.toFixed(0)}  프레임 ${Debug._frameMs.toFixed(2)}ms`,
      r ? `그린 것 ${r.drawCalls}  렌더러 ${r.visibleCount}  컬링 ${r.culledCount}` : null,
      `오브젝트 ${Debug._objects}  트윈 ${Tween.count}`
    ].filter(Boolean);
    for (const [k, v] of Debug._values) lines.push(`${k}: ${v}`);

    const k = engine.pixelRatio || 1;
    const size = 11 * k;
    const lh = Math.round(size * 1.35);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${size}px monospace`;
    let w = 0;
    for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
    const pad = 6 * k;
    const bw = w + pad * 2;
    const bh = lines.length * lh + pad * 2;
    const cw = engine.canvas.width;
    const ch = engine.canvas.height;
    const right = Debug.corner.endsWith('right');
    const bottom = Debug.corner.startsWith('bottom');
    const x = right ? cw - bw - Debug.offset.x * k : Debug.offset.x * k;
    const y = bottom ? ch - bh - Debug.offset.y * k : Debug.offset.y * k;

    const alpha = Math.min(1, Math.max(0, Debug.opacity));
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#9fe870';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad + i * lh));
    ctx.globalAlpha = 1;
  }

  static _drawBounds(ctx, r, camera) {
    const m = camera.viewMatrix;
    const b = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = 'rgba(80, 255, 120, 0.8)';
    ctx.lineWidth = 1;
    for (const rd of r._renderers) {
      if (!rd.getBounds(b)) continue;
      if (!camera.isInView(b.minX, b.minY, b.maxX, b.maxY)) continue;
      const x0 = m.a * b.minX + m.c * b.maxY + m.e;
      const y0 = m.b * b.minX + m.d * b.maxY + m.f;
      const x1 = m.a * b.maxX + m.c * b.minY + m.e;
      const y1 = m.b * b.maxX + m.d * b.minY + m.f;
      ctx.strokeRect(Math.round(Math.min(x0, x1)) + 0.5, Math.round(Math.min(y0, y1)) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }
}
