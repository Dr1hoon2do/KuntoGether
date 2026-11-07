class Time {
  // 설정
  static maxDeltaTime = 0.1;
  static timeScale = 1;

  // 상태
  static _deltaTime = 0;
  static _unscaledDeltaTime = 0;
  static _time = 0;
  static _unscaledTime = 0;
  static _frameCount = 0;
  static _fps = 0;
  static _last = null;

  // 읽기 전용 getter
  static get deltaTime() { return Time._deltaTime; }
  static get unscaledDeltaTime() { return Time._unscaledDeltaTime; }
  static get time() { return Time._time; }
  static get unscaledTime() { return Time._unscaledTime; }
  static get frameCount() { return Time._frameCount; }
  static get fps() { return Time._fps; }
  static get isPaused() { return Time.timeScale === 0; }

  // 엔진 전용: 매 프레임 Engine이 호출
  static update(timestampMs) {
    if (Time._last === null) {
      Time._last = timestampMs;
      Time._unscaledDeltaTime = 0;
      Time._deltaTime = 0;
      Time._frameCount++;
      return;
    }

    let dt = (timestampMs - Time._last) / 1000;
    Time._last = timestampMs;

    if (dt < 0) dt = 0;
    if (dt > Time.maxDeltaTime) dt = Time.maxDeltaTime;

    Time._unscaledDeltaTime = dt;
    Time._deltaTime = dt * Time.timeScale;

    Time._unscaledTime += Time._unscaledDeltaTime;
    Time._time += Time._deltaTime;
    Time._frameCount++;

    if (dt > 0) {
      const instant = 1 / dt;
      Time._fps = Time._fps === 0 ? instant : Time._fps + (instant - Time._fps) * 0.1;
    }
  }

  static resync() {
    Time._last = null;
  }

  static reset() {
    Time._deltaTime = 0;
    Time._unscaledDeltaTime = 0;
    Time._time = 0;
    Time._unscaledTime = 0;
    Time._frameCount = 0;
    Time._fps = 0;
    Time._last = null;
  }
}