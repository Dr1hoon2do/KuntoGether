class UIText extends Renderer {
  constructor(text = '', options = {}) {
    super();
    const cfg = typeof Config !== 'undefined' ? Config : {};

    this.text = text;
    this.fontSize = options.fontSize ?? cfg.fontSize ?? 16; // 기준 해상도 단위
    this.fontFamily = options.fontFamily ?? cfg.fontFamily ?? 'monospace';
    this.fontWeight = options.fontWeight ?? 'normal';
    this.color = options.color ?? '#ffffff';
    this.align = options.align ?? 'center'; // left / center / right
    this.verticalAlign = options.verticalAlign ?? 'middle'; // top / middle / bottom
    this.pixelSnap = options.pixelSnap ?? true;

    // 줄바꿈: true면 사각형 너비에 맞춰 여러 줄로 나눈다 (\n도 줄바꿈)
    this.wrap = options.wrap ?? false;
    this.lineHeight = options.lineHeight ?? 1.3; // fontSize 배수

    // 색 글자: [[키:글자]]를 UIText.colorOf(키, palette) 색의 굵은 글자로 그린다. rich가 아니면 표시만 벗겨 낸다
    this.rich = options.rich ?? false;
    this.palette = options.palette ?? 'light';

    this.sortingLayer = options.sortingLayer ?? 'UI';
    if (options.orderInLayer !== undefined) this.orderInLayer = options.orderInLayer;
    if (options.opacity !== undefined) this.opacity = options.opacity;

    this._wrapKey = null;
    this._lines = [];
  }

  setText(text) {
    this.text = text;
    return this;
  }

  // UI 패스는 컬링하지 않는다 (UIImage와 동일한 정책)
  getBounds(out) {
    return null;
  }

  // 게임이 정하는 색 표 (키 → 색). 없으면 기본 글자색
  static colorOf = (key, palette) => null;
  static MARK = /\[\[(\w+):([^\]]*)\]\]/g;

  static strip(text) {
    return String(text).replace(UIText.MARK, '$2');
  }

  render(ctx) {
    if (!this.text) return;
    if (this.rich) return this._renderRich(ctx);
    if (this.text.includes('[[')) {
      const t = this.text;
      this.text = UIText.strip(t);
      this._renderPlain(ctx);
      this.text = t;
      return;
    }
    this._renderPlain(ctx);
  }

  _renderPlain(ctx) {

    const rt = this.getComponent(RectTransform);
    if (!rt) return;

    const r = rt.rect;
    const scale = rt.uiRoot ? rt.uiRoot.scale : 1;
    const size = this.fontSize * scale;
    if (size <= 0) return;

    ctx.font = `${this.fontWeight} ${size}px ${this.fontFamily}`;
    const lines = this.wrap ? this._wrapLines(ctx, r.width) : [this.text];
    const step = size * this.lineHeight;
    const blockHeight = step * (lines.length - 1);

    let x = r.x;
    if (this.align === 'center') x = r.x + r.width / 2;
    else if (this.align === 'right') x = r.x + r.width;

    let y = r.y;
    if (this.verticalAlign === 'middle') y = r.y + r.height / 2 - blockHeight / 2;
    else if (this.verticalAlign === 'bottom') y = r.y + r.height - blockHeight;

    const alpha = this.opacity * rt.worldAlpha;
    if (alpha <= 0) return;
    if (alpha < 1) ctx.globalAlpha = alpha;

    ctx.fillStyle = this.color;
    ctx.textAlign = this.align;
    ctx.textBaseline = this.verticalAlign;
    for (let i = 0; i < lines.length; i++) {
      const ly = y + step * i;
      ctx.fillText(lines[i], this.pixelSnap ? Math.round(x) : x, this.pixelSnap ? Math.round(ly) : ly);
    }

    if (alpha < 1) ctx.globalAlpha = 1;
  }

  // 단어 단위로 자르고, 한 단어가 너비보다 길면 글자 단위로 자른다. 같은 입력이면 캐시를 쓴다.
  _wrapLines(ctx, maxWidth) {
    const key = this.text + '\u0000' + Math.round(maxWidth) + '\u0000' + ctx.font;
    if (key === this._wrapKey) return this._lines;

    const lines = [];
    for (const para of this.text.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width <= maxWidth) {
          line = test;
          continue;
        }
        if (line) lines.push(line);
        line = '';
        for (const ch of word) {
          if (line && ctx.measureText(line + ch).width > maxWidth) {
            lines.push(line);
            line = '';
          }
          line += ch;
        }
      }
      lines.push(line);
    }

    this._wrapKey = key;
    this._lines = lines;
    return lines;
  }

  // ---------- 색 글자 ----------
  _segments() {
    const out = [];
    const re = new RegExp(UIText.MARK.source, 'g');
    let last = 0;
    let m;
    while ((m = re.exec(this.text))) {
      if (m.index > last) out.push({ text: this.text.slice(last, m.index), color: null });
      out.push({ text: m[2], color: UIText.colorOf(m[1], this.palette), bold: true });
      last = re.lastIndex;
    }
    if (last < this.text.length) out.push({ text: this.text.slice(last), color: null });
    return out;
  }

  // 줄 = [{ text, color, bold, w }]. 띄어쓰기 단위로 자르고, 한 덩어리가 줄보다 길면 글자 단위로
  _richLines(ctx, size, maxWidth) {
    const key = this.text + '\u0000' + Math.round(maxWidth) + '\u0000' + size + '\u0000' + this.fontFamily + this.fontWeight + this.palette;
    if (key === this._wrapKey) return this._lines;
    const normal = `${this.fontWeight} ${size}px ${this.fontFamily}`;
    const bold = `bold ${size}px ${this.fontFamily}`;
    const measure = (t, b) => {
      ctx.font = b ? bold : normal;
      return ctx.measureText(t).width;
    };
    const lines = [[]];
    let width = 0;
    const push = (text, seg) => {
      const w = measure(text, seg.bold);
      const line = lines[lines.length - 1];
      const prev = line[line.length - 1];
      if (prev && prev.color === seg.color && prev.bold === seg.bold) {
        prev.text += text;
        prev.w += w;
      } else line.push({ text, color: seg.color, bold: seg.bold, w });
      width += w;
    };
    const newline = () => {
      const line = lines[lines.length - 1];
      // 줄 끝 띄어쓰기 지우기
      const tail = line[line.length - 1];
      if (tail && tail.text.endsWith(' ')) {
        tail.text = tail.text.replace(/ +$/, '');
        tail.w = measure(tail.text, tail.bold);
      }
      lines.push([]);
      width = 0;
    };
    for (const seg of this._segments()) {
      const paras = seg.text.split('\n');
      paras.forEach((para, pi) => {
        if (pi > 0) newline();
        // 단어 + 뒤 띄어쓰기
        const words = para.match(/[^ ]+ *| +/g) ?? [];
        for (const word of words) {
          const w = measure(word.replace(/ +$/, ''), seg.bold);
          if (width + w <= maxWidth || !this.wrap) {
            if (!(width === 0 && /^ +$/.test(word))) push(word, seg);
            continue;
          }
          if (width > 0 && w <= maxWidth) {
            newline();
            push(word, seg);
            continue;
          }
          // 너무 긴 덩어리: 글자 단위
          for (const ch of word) {
            if (width > 0 && width + measure(ch, seg.bold) > maxWidth) newline();
            if (width === 0 && ch === ' ') continue;
            push(ch, seg);
          }
        }
      });
    }
    this._wrapKey = key;
    this._lines = lines;
    return lines;
  }

  _renderRich(ctx) {
    const rt = this.getComponent(RectTransform);
    if (!rt) return;
    const r = rt.rect;
    const scale = rt.uiRoot ? rt.uiRoot.scale : 1;
    const size = this.fontSize * scale;
    if (size <= 0) return;
    const lines = this._richLines(ctx, size, r.width);
    const step = size * this.lineHeight;
    const blockHeight = step * (lines.length - 1);
    let y = r.y;
    if (this.verticalAlign === 'middle') y = r.y + r.height / 2 - blockHeight / 2;
    else if (this.verticalAlign === 'bottom') y = r.y + r.height - blockHeight;
    const alpha = this.opacity * rt.worldAlpha;
    if (alpha <= 0) return;
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.textAlign = 'left';
    ctx.textBaseline = this.verticalAlign;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lw = line.reduce((s, q) => s + q.w, 0);
      let x = r.x;
      if (this.align === 'center') x = r.x + (r.width - lw) / 2;
      else if (this.align === 'right') x = r.x + r.width - lw;
      const ly = y + step * i;
      for (const q of line) {
        ctx.font = `${q.bold ? 'bold' : this.fontWeight} ${size}px ${this.fontFamily}`;
        ctx.fillStyle = q.color ?? this.color;
        ctx.fillText(q.text, this.pixelSnap ? Math.round(x) : x, this.pixelSnap ? Math.round(ly) : ly);
        x += q.w;
      }
    }
    if (alpha < 1) ctx.globalAlpha = 1;
  }

  // 그려질 줄 수 (높이 계산용). 그리기 전에도 쓸 수 있게 캔버스를 받는다
  measureLines(ctx, width) {
    const rt = this.getComponent(RectTransform);
    const scale = rt && rt.uiRoot ? rt.uiRoot.scale : 1;
    const size = this.fontSize * scale;
    if (this.rich) return this._richLines(ctx, size, width * scale).length;
    ctx.font = `${this.fontWeight} ${size}px ${this.fontFamily}`;
    const t = this.text;
    if (t.includes('[[')) this.text = UIText.strip(t);
    const n = this._wrapLines(ctx, width * scale).length;
    this.text = t;
    this._wrapKey = null;
    return n;
  }
}
