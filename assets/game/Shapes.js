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
const DOOR_POS = { N: [0, ARENA_H / 2], S: [0, -ARENA_H / 2], E: [ARENA_W / 2, 0], W: [-ARENA_W / 2, 0] };
const DOOR_W = 30;
class ArenaRenderer extends Renderer {
  constructor(game, w, h) { super(); this.game = game; this.w = w; this.h = h; this.sortingLayer = "Background"; }
  render(ctx, camera) {
    const m = camera.viewMatrix, g = this.game;
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    const hw = this.w / 2, hh = this.h / 2, locked = g.state !== "explore";
    ctx.fillStyle = "#14110f"; ctx.fillRect(-hw - 400, -hh - 400, this.w + 800, this.h + 800);
    ctx.fillStyle = FLOOR_TINTS[(g.floorNum - 1) % FLOOR_TINTS.length]; ctx.fillRect(-hw, -hh, this.w, this.h);
    ctx.strokeStyle = "#ffffff10"; ctx.lineWidth = 0.5; ctx.beginPath();
    for (let x = -hw; x <= hw; x += 25) { ctx.moveTo(x, -hh); ctx.lineTo(x, hh); }
    for (let y = -hh; y <= hh; y += 25) { ctx.moveTo(-hw, y); ctx.lineTo(hw, y); }
    ctx.stroke();
    ctx.strokeStyle = "#6a5a50"; ctx.lineWidth = 3; ctx.strokeRect(-hw, -hh, this.w, this.h);
    if (!g.cur) return;
    for (const [d, room] of Object.entries(g.cur.nb)) { // 문
      const [x, y] = DOOR_POS[d], horiz = d === "N" || d === "S";
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
    const C = 9, seen = [];
    const compass = g.heroes.some(h => h.stats.compass); // 나침반: 층 전체 공개
    for (const r of g.map.list) if (compass || r.visited || Object.values(r.nb).some(o => o.visited)) seen.push(r);
    if (!seen.length) return;
    const xs = seen.map(r => r.x), ys = seen.map(r => r.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const ox = ARENA_W / 2 - 46, oy = ARENA_H / 2 - 30;
    ctx.globalAlpha = 0.85;
    for (const r of seen) {
      const x = ox + (r.x - cx) * C, y = oy + (r.y - cy) * C, col = ROOM_COLORS[r.type];
      for (const [d, o] of Object.entries(r.nb)) if (seen.includes(o) && (d === "N" || d === "E")) { ctx.fillStyle = "#ffffff55"; ctx.fillRect(Math.min(x, ox + (o.x - cx) * C) - 1, Math.min(y, oy + (o.y - cy) * C) - 1, d === "E" ? C : 2, d === "N" ? C : 2); }
      ctx.fillStyle = r.visited ? col : "#3a3a3a"; ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
      if (!r.visited) { ctx.strokeStyle = col; ctx.lineWidth = 0.8; ctx.strokeRect(x - 3.5, y - 3.5, 7, 7); }
      if (r === g.cur) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4; ctx.strokeRect(x - 4.5, y - 4.5, 9, 9); }
      else if (r.visited && !r.cleared) { ctx.fillStyle = "#0008"; ctx.fillRect(x - 1, y - 1, 2, 2); }
    }
    ctx.globalAlpha = 1;
  }
}
