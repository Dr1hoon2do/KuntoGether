// 스프라이트 애니메이션: 스프라이트 시트를 잘라 만든 클립을 재생해서 같은 오브젝트의 SpriteRenderer 그림(영역)을 바꾼다.
//
//   const walk = AnimationClip.fromGrid("walk_down", "hero", { frameWidth: 16, frameHeight: 16, row: 0, count: 4, fps: 8 });
//   const anim = go.addComponent(new SpriteAnimator([walk, idle]));
//   anim.play("walk_down");                  // 같은 클립을 다시 부르면 이어서 (restart: true면 처음부터)
//   anim.speed = 1.5;                        // 재생 속도
//   anim.events.on("step", () => ...);      // 프레임 이벤트 (클립의 events: { 프레임 번호: "이름" })
//   anim.events.on("finish", () => ...);    // 반복하지 않는 클립이 끝났을 때
//
// 시간은 Time.deltaTime (timeScale 영향)을 쓴다. unscaled: true면 무시.
class AnimationClip {
  // frames: [{ x, y, width, height }] (시트 픽셀 좌표), image: Resource 키 또는 이미지
  constructor(name, options = {}) {
    this.name = name;
    this.image = options.image ?? null;
    this.frames = options.frames ?? [];
    this.fps = options.fps ?? 8;
    this.loop = options.loop ?? true;
    this.events = options.events ?? {}; // { 프레임 번호: 이벤트 이름 }
  }

  // 격자 시트에서 한 줄(row)의 start번째부터 count칸
  static fromGrid(name, image, options = {}) {
    const fw = options.frameWidth ?? 16;
    const fh = options.frameHeight ?? fw;
    const row = options.row ?? 0;
    const start = options.start ?? 0;
    const count = options.count ?? 1;
    const frames = [];
    for (let i = 0; i < count; i++) frames.push({ x: (start + i) * fw, y: row * fh, width: fw, height: fh });
    return new AnimationClip(name, { ...options, image, frames });
  }

  get duration() {
    return this.frames.length / this.fps;
  }
}

class SpriteAnimator extends Component {
  constructor(clips = [], options = {}) {
    super();
    this.clips = new Map();
    for (const c of clips) this.add(c);
    this.speed = options.speed ?? 1;
    this.unscaled = options.unscaled ?? false;
    this.events = new EventBus('SpriteAnimator');
    this.clip = null;
    this.frame = 0;
    this.time = 0;
    this.playing = false;
    this._autoplay = options.play ?? null;
  }

  add(clip) {
    this.clips.set(clip.name, clip);
    return this;
  }

  start() {
    if (this._autoplay) this.play(this._autoplay);
  }

  play(name, options = {}) {
    const clip = this.clips.get(name);
    if (!clip) throw new Error(`SpriteAnimator: 클립 없음 "${name}"`);
    if (options.speed !== undefined) this.speed = options.speed;
    if (this.clip === clip && this.playing && !options.restart) return this;
    this.clip = clip;
    this.time = 0;
    this.frame = 0;
    this.playing = true;
    this._apply();
    this._fire(0);
    return this;
  }

  stop() {
    this.playing = false;
    return this;
  }

  resume() {
    if (this.clip) this.playing = true;
    return this;
  }

  // 특정 프레임으로 (멈춘 채 보여 줄 때)
  setFrame(i) {
    if (!this.clip) return this;
    this.frame = Math.max(0, Math.min(this.clip.frames.length - 1, i));
    this.time = this.frame / this.clip.fps;
    this._apply();
    return this;
  }

  get isPlaying() {
    return this.playing;
  }

  update(dt) {
    if (!this.playing || !this.clip) return;
    const clip = this.clip;
    const n = clip.frames.length;
    if (n === 0) return;
    this.time += (this.unscaled ? Time.unscaledDeltaTime : dt) * this.speed;
    let next = Math.floor(this.time * clip.fps);
    if (next >= n) {
      if (clip.loop) {
        this.time %= clip.duration;
        next = Math.floor(this.time * clip.fps) % n;
      } else {
        next = n - 1;
        this.playing = false;
      }
    }
    if (next !== this.frame) {
      // 건너뛴 프레임의 이벤트도 부른다 (느린 프레임에서도 발소리를 놓치지 않게)
      let i = this.frame;
      while (i !== next) {
        i = (i + 1) % n;
        this._fire(i);
      }
      this.frame = next;
      this._apply();
    }
    if (!this.playing) this.events.emit('finish', { animator: this, clip });
  }

  _fire(i) {
    const name = this.clip.events[i];
    if (name) this.events.emit(name, { animator: this, clip: this.clip, frame: i });
  }

  _apply() {
    const sr = this.getComponent(SpriteRenderer);
    if (!sr) return;
    const f = this.clip.frames[this.frame];
    if (this.clip.image) {
      const img = typeof this.clip.image === 'string' ? Resource.image(this.clip.image) : this.clip.image;
      if (sr.sprite !== img) sr.sprite = img;
    }
    if (f) sr.region = { x: f.x, y: f.y, width: f.width, height: f.height };
  }
}
