// 타이머: 시간 기다리기·나중에 부르기·반복. Tween 위에서 돌아서 Time.timeScale(일시정지·느리게)의 영향을 받는다.
//
//   await Timer.wait(0.5);                 // 0.5초 기다리기 (async 함수 안에서)
//   Timer.invoke(() => boom(), 1.2);       // 1.2초 뒤에 한 번
//   const h = Timer.repeat(() => tick(), 0.25, { count: 4 }); h.stop();  // 0.25초마다 4번 (count 없으면 멈출 때까지)
//
// 옵션: { unscaled: true } → timeScale 무시 (일시정지 메뉴 연출 등), { owner } → 그 오브젝트가 파괴되면 취소.
// 컴포넌트 안에서는 this.wait(초), this.invoke(fn, 초), this.repeat(fn, 간격)을 쓰면 owner가 자동으로 그 컴포넌트다.
// owner가 파괴되어 취소된 wait는 영영 끝나지 않는다 (그 뒤 코드가 실행되지 않음).
class Timer {
  static wait(seconds, options = {}) {
    return new Promise((resolve) => {
      Tween.delay(seconds, () => resolve(), options);
    });
  }

  // 핸들(TweenHandle)을 돌려준다. h.stop()으로 취소
  static invoke(fn, seconds, options = {}) {
    return Tween.delay(seconds, fn, options);
  }

  // interval초마다 fn(횟수). options.count가 있으면 그만큼만, options.immediate면 처음에도 바로 한 번
  static repeat(fn, interval, options = {}) {
    let n = 0;
    const count = options.count ?? Infinity;
    if (options.immediate) {
      fn(n++);
      if (n >= count) return Tween.delay(0, () => {}, options);
    }
    const h = Tween.value(0, 1, Math.max(interval, 1e-4), () => {}, {
      ...options,
      repeat: count === Infinity ? Infinity : count - n - 1,
      onRepeat: () => fn(n++)
    });
    h.then(() => fn(n++));
    return h;
  }
}

// 컴포넌트 편의 함수 (owner = 이 컴포넌트)
Component.prototype.wait = function (seconds, options = {}) {
  return Timer.wait(seconds, { owner: this, ...options });
};
Component.prototype.invoke = function (fn, seconds, options = {}) {
  return Timer.invoke(fn, seconds, { owner: this, ...options });
};
Component.prototype.repeat = function (fn, interval, options = {}) {
  return Timer.repeat(fn, interval, { owner: this, ...options });
};
