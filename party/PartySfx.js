// 가벼운 효과음 (WebAudio 합성, 파일 없음). 브라우저 정책상 첫 키/클릭/터치 뒤에 소리가 켜진다. 미니게임에서는 ctx.sfx.play("coin") 처럼 쓴다.
const PartySfx = {
  ctx: null, master: null, vol: 0.2, muted: false, last: {},
  get unlocked() { return !!this.ctx && this.ctx.state === "running"; },
  unlock() {
    try {
      if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.vol; this.master.connect(this.ctx.destination); }
      if (this.ctx.state === "suspended") this.ctx.resume();
    } catch (e) {}
  },
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : this.vol; },
  tone(f, dur, type = "square", vol = 1, slide = 0, delay = 0) {
    if (!this.unlocked || this.muted) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  PRESETS: {
    tick: s => s.tone(660, 0.07, "square", 0.5),
    count: s => s.tone(520, 0.18, "square", 0.7),
    go: s => { s.tone(780, 0.12, "square", 0.8); s.tone(1170, 0.3, "square", 0.8, 0, 0.1); },
    join: s => { s.tone(520, 0.08, "triangle"); s.tone(780, 0.12, "triangle", 1, 0, 0.08); },
    ready: s => s.tone(880, 0.1, "triangle", 0.8),
    coin: s => { s.tone(988, 0.06, "square", 0.6); s.tone(1319, 0.2, "square", 0.6, 0, 0.06); },
    jump: s => s.tone(300, 0.15, "square", 0.5, 380),
    hit: s => s.tone(180, 0.12, "sawtooth", 0.7, -120),
    boom: s => s.tone(120, 0.35, "sawtooth", 0.9, -90),
    win: s => { [523, 659, 784, 1047].forEach((f, i) => s.tone(f, 0.18, "square", 0.7, 0, i * 0.12)); },
    lose: s => { s.tone(330, 0.25, "triangle", 0.8, -120); s.tone(247, 0.4, "triangle", 0.8, -80, 0.22); },
    fanfare: s => { [523, 523, 523, 659, 784, 1047].forEach((f, i) => s.tone(f, i > 2 ? 0.3 : 0.12, "square", 0.7, 0, i * 0.14)); },
  },
  play(name) {
    const now = performance.now(); if (now - (this.last[name] || 0) < 40) return; this.last[name] = now;
    const f = this.PRESETS[name]; if (f) f(this);
  },
};
["keydown", "pointerdown", "touchstart", "click"].forEach(ev => addEventListener(ev, () => PartySfx.unlock(), { passive: true }));
window.PartySfx = PartySfx;
