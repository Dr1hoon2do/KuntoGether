// 이벤트 버스: 오브젝트끼리 서로를 직접 알지 않고 "무슨 일이 일어났다"를 알리고 듣는다.
//
//   Events.on("enemy.killed", (e) => score += e.points, { owner: this });   // 듣기 (owner가 파괴되면 저절로 해제)
//   Events.emit("enemy.killed", { points: 10 });                            // 알리기
//   const off = Events.on("x", fn); off();                                   // 반환값을 부르면 해제
//
// - 전역 버스 Events 하나를 기본으로 쓰고, 필요하면 new EventBus()로 따로 만든다 (예: 오브젝트 하나 안의 신호).
// - priority: 큰 것부터 부른다 (같으면 등록한 순서). 기본 0.
// - once: 한 번 부르면 해제.
// - owner: GameObject 또는 Component. 파괴되면(GameObject.isDestroyed, Component의 gameObject가 null) 다음 emit 때 자동 해제.
// - 듣는 쪽에서 에러가 나도 다른 듣는 쪽은 계속 불린다 (에러는 콘솔에).
// - emit은 그 자리에서 바로(동기로) 부른다. 매 프레임 도는 처리보다는 "가끔 일어나는 일"을 알리는 데 쓴다.
// - EventBus.debug = true면 emit마다 콘솔에 이벤트 이름과 받은 수를 찍는다.
class EventBus {
  static debug = false;

  constructor(name = 'EventBus') {
    this.name = name;
    this._map = new Map(); // 이름 -> [{ fn, owner, priority, once, seq }]
    this._seq = 0;
  }

  on(event, fn, options = {}) {
    const list = this._map.get(event) ?? [];
    const entry = { fn, owner: options.owner ?? null, priority: options.priority ?? 0, once: !!options.once, seq: this._seq++ };
    // 우선순위 큰 것 앞, 같으면 먼저 등록한 것 앞 (삽입 정렬)
    let i = list.length;
    while (i > 0 && list[i - 1].priority < entry.priority) i--;
    list.splice(i, 0, entry);
    this._map.set(event, list);
    return () => this._remove(event, entry);
  }

  once(event, fn, options = {}) {
    return this.on(event, fn, { ...options, once: true });
  }

  // fn을 주면 그 함수만, 안 주면 그 이벤트 전부 해제
  off(event, fn = null) {
    const list = this._map.get(event);
    if (!list) return this;
    if (!fn) this._map.delete(event);
    else {
      const left = list.filter((e) => e.fn !== fn);
      if (left.length) this._map.set(event, left);
      else this._map.delete(event);
    }
    return this;
  }

  // owner가 등록한 것 전부 해제
  offOwner(owner) {
    for (const [event, list] of this._map) {
      const left = list.filter((e) => e.owner !== owner);
      if (left.length) this._map.set(event, left);
      else this._map.delete(event);
    }
    return this;
  }

  // 알리기. 부른 듣는 쪽 수를 돌려준다
  emit(event, data) {
    const list = this._map.get(event);
    if (!list || list.length === 0) {
      if (EventBus.debug) console.log(`[${this.name}] ${event} → 0`);
      return 0;
    }
    // 부르는 중에 on/off가 일어나도 안전하게 (지금 목록을 복사해서 돈다)
    const snapshot = list.slice();
    let called = 0;
    for (const entry of snapshot) {
      if (entry.removed) continue;
      if (EventBus._ownerGone(entry.owner)) {
        this._remove(event, entry);
        continue;
      }
      if (entry.once) this._remove(event, entry);
      called++;
      try {
        entry.fn(data, event);
      } catch (err) {
        console.error(`[${this.name}] "${event}" 듣는 쪽에서 에러:`, err);
      }
    }
    if (EventBus.debug) console.log(`[${this.name}] ${event} → ${called}`, data);
    return called;
  }

  has(event) {
    const list = this._map.get(event);
    return !!list && list.length > 0;
  }

  count(event) {
    return this._map.get(event)?.length ?? 0;
  }

  clear() {
    this._map.clear();
    return this;
  }

  _remove(event, entry) {
    entry.removed = true;
    const list = this._map.get(event);
    if (!list) return;
    const i = list.indexOf(entry);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) this._map.delete(event);
  }

  static _ownerGone(owner) {
    if (!owner) return false;
    if (typeof GameObject !== 'undefined' && owner instanceof GameObject) return owner.isDestroyed;
    if (typeof Component !== 'undefined' && owner instanceof Component) return owner._detached === true || (owner.gameObject !== null && owner.gameObject.isDestroyed);
    return false;
  }
}

// 전역 버스
const Events = new EventBus('Events');
