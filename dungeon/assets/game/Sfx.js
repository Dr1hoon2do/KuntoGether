// 아주 가벼운 효과음. 파일 없이 WebAudio로 합성한다. 브라우저 정책상 첫 키/클릭/터치 뒤에 소리가 켜진다. M 키로 음소거.
const SFX = {
  ctx: null, master: null, muted: false, vol: 0.22, last: {}, active: 0,
  get unlocked() { return !!this.ctx && this.ctx.state === "running"; },
  unlock() {
    try {
      if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination); }
      if (this.ctx.state !== "running") this.ctx.resume();
    } catch (e) {}
  },
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : this.vol; },
  _env(g, t0, dur, vol) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); },
  tone(f0, dur, type = "square", vol = 0.3, f1 = f0, delay = 0) {
    const c = this.ctx, t0 = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    this._env(g, t0, dur, vol); o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.02);
  },
  noise(dur, vol = 0.3, freq = 1200, delay = 0) {
    const c = this.ctx, t0 = c.currentTime + delay, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = "bandpass"; f.frequency.value = freq; this._env(g, t0, dur, vol); s.connect(f); f.connect(g); g.connect(this.master); s.start(t0);
  },
  // 같은 소리는 gap(초)보다 촘촘하게 나지 않게 하고, 동시에 너무 많이 울리지 않게 한다
  play(name) {
    if (!this.unlocked || this.muted) return;
    const now = this.ctx.currentTime, S = SFX_DEFS[name]; if (!S) return;
    if (now - (this.last[name] || -1) < S.gap || this.active > 10) return;
    this.last[name] = now; this.active++; setTimeout(() => this.active--, 150);
    S.f.call(this);
  },
};
const SFX_DEFS = {
  swing:  { gap: 0.05, f() { this.noise(0.09, 0.18, 1800); } },
  shoot:  { gap: 0.05, f() { this.tone(520, 0.08, "triangle", 0.18, 260); } },
  eshoot: { gap: 0.12, f() { this.tone(300, 0.07, "square", 0.07, 200); } },
  hit:    { gap: 0.04, f() { this.tone(180, 0.06, "square", 0.2, 90); } },
  die:    { gap: 0.04, f() { this.noise(0.14, 0.22, 700); this.tone(220, 0.14, "sawtooth", 0.12, 70); } },
  hurt:   { gap: 0.15, f() { this.tone(140, 0.22, "sawtooth", 0.3, 55); } },
  block:  { gap: 0.06, f() { this.tone(900, 0.05, "square", 0.12, 600); } },
  coin:   { gap: 0.03, f() { this.tone(980, 0.06, "square", 0.12); this.tone(1320, 0.08, "square", 0.12, 1320, 0.05); } },
  item:   { gap: 0.1, f() { [660, 880, 1100].forEach((f, i) => this.tone(f, 0.12, "triangle", 0.22, f, i * 0.07)); } },
  swap:   { gap: 0.1, f() { this.tone(440, 0.1, "triangle", 0.2, 660); } },
  door:   { gap: 0.2, f() { this.noise(0.25, 0.15, 500); } },
  warn:   { gap: 0.25, f() { this.tone(240, 0.16, "square", 0.12, 200); } },
  boom:   { gap: 0.1, f() { this.noise(0.4, 0.35, 260); this.tone(110, 0.35, "sawtooth", 0.25, 40); } },
  clear:  { gap: 0.5, f() { [520, 660, 780].forEach((f, i) => this.tone(f, 0.16, "triangle", 0.2, f, i * 0.08)); } },
  over:   { gap: 1, f() { [330, 247, 196].forEach((f, i) => this.tone(f, 0.35, "sawtooth", 0.2, f * 0.9, i * 0.25)); } },
  win:    { gap: 1, f() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.28, "triangle", 0.25, f, i * 0.14)); } },
};
["keydown", "pointerdown", "touchstart", "click"].forEach(ev => addEventListener(ev, () => SFX.unlock(), { passive: true }));
addEventListener("keydown", e => { if (e.code === "KeyM") SFX.toggleMute(); });
