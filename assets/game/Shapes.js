// 이미지 없이 월드 좌표(Y-up)에서 직접 그리는 렌더러.
// fn(ctx, self): 오브젝트 로컬 좌표계에서 그린다 (원점 = 오브젝트 위치, 회전 적용). 글자는 ctx.scale(1,-1) 후에 그려야 안 뒤집힌다.
class DrawRenderer extends Renderer {
  constructor(fn, radius = 10, { layer = "Default", order = 0 } = {}) {
    super();
    this.fn = fn; this.radius = radius; this.sortingLayer = layer; this.orderInLayer = order;
    this.flash = 0; // 맞았을 때 흰색 번쩍임 (남은 초)
  }
  getBounds(out) {
    const p = this.transform.position, r = this.radius;
    out.minX = p.x - r; out.minY = p.y - r; out.maxX = p.x + r; out.maxY = p.y + r;
    return out;
  }
  update(dt) { if (this.flash > 0) this.flash -= dt; }
  render(ctx, camera) {
    const m = Matrix.multiply(camera.viewMatrix, this.transform.worldMatrix, DRAW_MATRIX);
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.globalAlpha = this.opacity;
    this.fn(ctx, this);
    ctx.globalAlpha = 1;
  }
}
const DRAW_MATRIX = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

// 방 바닥·벽·문. 문은 이웃 방이 있는 쪽에만 생기고, 전투 중이면 잠긴다(빨강). 문 위에 가려는 방 종류가 표시된다.
const ROOM_COLORS = { start: "#5c8", normal: "#889", elite: "#fa4", treasure: "#fd3", shop: "#4d8", boss: "#f55" };
const ROOM_ICONS = { start: "◆", normal: "·", elite: "!", treasure: "★", shop: "$", boss: "☠" };
const FLOOR_TINTS = ["#2a2420", "#232a28", "#2a2329", "#292a22", "#222a2a", "#2a2222", "#28242c", "#2c2020"];
const DOOR_W = 30;
class ArenaRenderer extends Renderer {
  constructor(game) { super(); this.game = game; this.sortingLayer = "Background"; this._c = null; this._key = ""; this._scale = 0; this._built = 0; game.App.clearColor = "#14110f"; }
  // 바닥·격자·바깥 벽은 방이 바뀔 때만 오프스크린 캔버스에 한 번 그려 두고, 매 프레임은 한 번에 찍어 낸다 (예전엔 매 프레임 전체 화면을 여러 번 칠했다).
  _bake(s, tint) {
    const cw = ARENA.BASE_W, ch = ARENA.BASE_H, cells = ARENA.cells, M = 4;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of cells) { x0 = Math.min(x0, c.x - cw / 2); x1 = Math.max(x1, c.x + cw / 2); y0 = Math.min(y0, c.y - ch / 2); y1 = Math.max(y1, c.y + ch / 2); }
    x0 -= M; x1 += M; y0 -= M; y1 += M;
    const cv = this._c || (this._c = document.createElement("canvas")), W = Math.ceil((x1 - x0) * s), H = Math.ceil((y1 - y0) * s);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const c2 = cv.getContext("2d", { alpha: true });
    c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, W, H);
    c2.setTransform(s, 0, 0, -s, -x0 * s, y1 * s); // 월드 좌표(Y-up) 그대로 그린다
    const has = (dx, dy) => cells.some(c => c.dx === dx && c.dy === dy);
    for (const c of cells) { // 칸마다 바닥
      c2.fillStyle = tint; c2.fillRect(c.x - cw / 2, c.y - ch / 2, cw, ch);
      c2.strokeStyle = "#ffffff10"; c2.lineWidth = 0.5; c2.beginPath();
      for (let x = c.x - cw / 2; x <= c.x + cw / 2 + 0.1; x += 25) { c2.moveTo(x, c.y - ch / 2); c2.lineTo(x, c.y + ch / 2); }
      for (let y = c.y - ch / 2; y <= c.y + ch / 2 + 0.1; y += 25) { c2.moveTo(c.x - cw / 2, y); c2.lineTo(c.x + cw / 2, y); }
      c2.stroke();
    }
    c2.strokeStyle = "#6a5a50"; c2.lineWidth = 3; c2.beginPath(); // 바깥 벽: 이웃 칸이 없는 쪽만
    for (const c of cells) {
      const l = c.x - cw / 2, r = c.x + cw / 2, b = c.y - ch / 2, t = c.y + ch / 2;
      if (!has(c.dx, c.dy + 1)) { c2.moveTo(l, t); c2.lineTo(r, t); }
      if (!has(c.dx, c.dy - 1)) { c2.moveTo(l, b); c2.lineTo(r, b); }
      if (!has(c.dx + 1, c.dy)) { c2.moveTo(r, b); c2.lineTo(r, t); }
      if (!has(c.dx - 1, c.dy)) { c2.moveTo(l, b); c2.lineTo(l, t); }
    }
    c2.stroke();
    this._x0 = x0; this._y1 = y1; this._scale = s; this._built = performance.now();
  }
  render(ctx, camera) {
    const m = camera.viewMatrix, g = this.game, locked = g.state !== "explore";
    const tint = FLOOR_TINTS[(g.floorNum - 1) % FLOOR_TINTS.length], cells = ARENA.cells;
    let h = g.floorNum; for (const c of cells) h = (h * 31 + c.x * 7 + c.y * 13) | 0;
    const s = Math.hypot(m.a, m.b), key = h + "|" + cells.length;
    if (key !== this._key || Math.abs(s - this._scale) > 0.001 * s && performance.now() - this._built > 300) { this._key = key; this._bake(s, tint); }
    const k = s / this._scale; // 배율이 조금 달라도 늘려서 찍는다 (줌 트윈 중 매 프레임 다시 굽지 않게)
    // 화면 픽셀에 맞춰 찍는다 (확대·축소 없이 1:1이면 선이 번지지 않는다)
    const dx = m.a * this._x0 + m.c * this._y1 + m.e, dy = m.b * this._x0 + m.d * this._y1 + m.f;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (Math.abs(k - 1) < 1e-3) ctx.drawImage(this._c, Math.round(dx), Math.round(dy)); else ctx.drawImage(this._c, dx, dy, this._c.width * k, this._c.height * k);
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    if (!g.cur) return;
    for (const [d, room] of Object.entries(g.cur.nb)) { // 문
      const [x, y] = doorPos(d), horiz = d === "N" || d === "S";
      ctx.fillStyle = locked ? "#c62828" : "#2e7d32";
      if (horiz) ctx.fillRect(x - DOOR_W / 2, y - 2.5, DOOR_W, 5); else ctx.fillRect(x - 2.5, y - DOOR_W / 2, 5, DOOR_W);
      if (!locked) { ctx.globalAlpha = 0.18 + 0.1 * Math.sin(performance.now() / 300); ctx.fillStyle = ROOM_COLORS[room.type]; ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      const ix = x + (d === "E" ? -14 : d === "W" ? 14 : 0), iy = y + (d === "N" ? -14 : d === "S" ? 14 : 0);
      ctx.save(); ctx.translate(ix, iy); ctx.scale(1, -1); ctx.fillStyle = ROOM_COLORS[room.type]; ctx.font = "bold 9px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(ROOM_ICONS[room.type], 0, 0); ctx.restore();
    }
  }
}

// 오른쪽 위 미니맵. 가 본 방과, 가 본 방에 붙어 있는 방(종류 힌트)만 보인다.
class MinimapRenderer extends Renderer {
  constructor(game) { super(); this.game = game; this.sortingLayer = "Foreground"; this.orderInLayer = 50; }
  render(ctx, camera) {
    const g = this.game; if (!g.map) return;
    const m = camera.viewMatrix; ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    const C = 9, seen = [], cp = camera.transform.position;
    const compass = g.heroes.some(h => h.stats.compass), special = g.heroes.some(h => h.stats.mapSpecial); // 나침반: 층 전체 공개 / 낡은 지도 조각: 특수 방만 공개
    for (const r of g.map.list) if (compass || r.visited || Object.values(r.nb).some(o => o.visited) || (special && (r.type === "shop" || r.type === "treasure" || r.type === "boss"))) seen.push(r);
    if (!seen.length) return;
    const cells = seen.flatMap(r => r.cells.map(([dx, dy]) => [r.x + dx, r.y + dy]));
    const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const ox = cp.x + camera.viewWidth / 2 - 46, oy = cp.y + camera.viewHeight / 2 - 30; // 화면 오른쪽 위
    ctx.globalAlpha = 0.85;
    for (const r of seen) {
      const col = ROOM_COLORS[r.type], big = r.cells.length > 1;
      for (const [dx, dy] of r.cells) {
        const x = ox + (r.x + dx - cx) * C, y = oy + (r.y + dy - cy) * C, sz = big ? C : 7;
        ctx.fillStyle = r.visited ? col : "#3a3a3a"; ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        if (!r.visited) { ctx.strokeStyle = col; ctx.lineWidth = 0.8; ctx.strokeRect(x - sz / 2, y - sz / 2, sz, sz); }
        if (r === g.cur) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2; ctx.strokeRect(x - sz / 2 - 0.5, y - sz / 2 - 0.5, sz + 1, sz + 1); }
      }
      const x = ox + (r.x - cx) * C, y = oy + (r.y - cy) * C;
      for (const [d, o] of Object.entries(r.nb)) if (seen.includes(o) && (d === "N" || d === "E")) { ctx.fillStyle = "#ffffff55"; ctx.fillRect(Math.min(x, ox + (o.x - cx) * C) - 1, Math.min(y, oy + (o.y - cy) * C) - 1, d === "E" ? C : 2, d === "N" ? C : 2); }
      if (r !== g.cur && r.visited && !r.cleared) { ctx.fillStyle = "#0008"; ctx.fillRect(x - 1, y - 1, 2, 2); }
    }
    ctx.globalAlpha = 1;
  }
}
