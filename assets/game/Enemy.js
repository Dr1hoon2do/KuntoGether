// ============================================================================
// 적 정의 (데이터 기반). 새 적은 ENEMY_DEFS에 한 항목을 추가하고 ENEMY_POOL에 등장 층·가중치만 적으면 된다.
//
//  hp, speed, radius(크기), color, kind(모양: square|circle|diamond|tri|poly|star|cross), sides(poly/star 꼭짓점), touch(접촉 피해), resist(넉백 저항 0~1)
//  ai: chase(쫓아감) | kite(keep:[가까운한계,먼한계] 거리 유지) | bomber(다가가 자폭) | zigzag(지그재그로 접근) | static(제자리)
//  특성: phasing(주기적으로 실체가 사라져 공격이 안 먹힘) | frontGuard(정면 공격은 피해 75% 감소) | pack(한 번에 나오는 수)
//  gold: [최소,최대] 코인 드랍 (확률 goldChance)     onDeath: { spawn, count } 죽을 때 분열
//  attacks: [ 패턴, ... ]   (보스는 phases: [{ at: 체력비율, enter: [단계 시작 때 한 번 쓰는 패턴], attacks }])
//
//  패턴 공통: cd(쿨다운 초), first(첫 발동까지 초), range(이 거리 안일 때만), countScale(층·인원 보너스가 개수에 더해짐)
//    shoot   : count, spread(부채꼴 전체 각도), speed, dmg        조준 탄
//    ring    : count, speed, dmg                                 사방 탄막
//    ringgap : count, gap(비워 두는 각도°), speed               플레이어 쪽이 뚫린 탄막(빠져나가야 함)
//    spiral  : dur, rate, step, arms, speed                     회전 탄막
//    orbs    : count, spin, radius, hold, speed                 몸 주위를 도는 구체들 → hold초 뒤 바깥으로 발사
//    rain    : dur, rate, speed                                 위에서 쏟아지는 탄
//    bombard : count, radius, delay, dmg                        플레이어 근처에 예고 원 → 폭발
//    cross   : spokes, windup, dur, rot, width                  회전하는 레이저 선 (예고선 후 발동)
//    charge  : windup, dur, speed, chain(연속 돌진 횟수)         예고선 후 돌진
//    slam    : windup, radius, dmg                              예고 원 후 내려찍기
//    teleport: slam(true면 도착 지점에 충격파)                   사라졌다 플레이어 근처에 나타남
//    summon  : spawn, count, max                                졸개 소환
//    guard   : spawn, count, timeout                            수호자를 소환하고 본체는 무적 → 수호자를 모두 처치해야 피해가 들어감
//    heal    : radius, pct                                      주변 아군(보스 제외) 회복
// ============================================================================
const BALANCE = {
  hpPerFloor: 0.15,           // 층마다 체력 +15%
  hpPerExtraPlayer: 0.3,      // 인원 1명 추가마다 체력 +30% (1명 기준 0.7 + 0.3n)
  countEveryFloors: 3,        // 몇 층마다 탄 개수 +1
  countPerExtraPlayer: 0.6,   // 추가 인원 1명당 탄 개수 +0.6 (내림)
  speedPerFloor: 0.03, speedPerExtraPlayer: 0.04,   // 이동·탄 속도
  ratePerFloor: 0.05, ratePerExtraPlayer: 0.06,     // 패턴 빈도 (쿨다운이 줄어든다)
  dmgEveryFloors: 4,          // 몇 층마다 탄/접촉 피해 +1
  maxArms: 6,                 // 회전 탄막 줄기 수 상한
  maxEnemyProjectiles: 260,   // 화면 위 적 탄 최대 개수 (넘으면 더 안 쏜다: 성능·공정성)
  coinRate: 1.0,              // 코인 드랍 확률 배율 (경제 조절: 가격은 Items.js ITEM_PRICE·weaponPrice, 상점은 층마다 +10%)
  eliteHp: 3, eliteCountAdd: 1, eliteRate: 1.25, eliteSpeed: 1.1, eliteRadius: 1.35,
};
// 층(floor)과 인원수(np)로 적 능력치 배율을 계산한다. 적은 생성될 때 이걸 한 번 받아 간다.
function calcScale(floor, np, elite = false) {
  const B = BALANCE, f = floor - 1, e = Math.max(0, np - 1);
  const sc = {
    hp: (1 + B.hpPerFloor * f) * (1 - B.hpPerExtraPlayer + B.hpPerExtraPlayer * np),
    countAdd: Math.floor(f / B.countEveryFloors) + Math.floor(e * B.countPerExtraPlayer),
    speed: 1 + B.speedPerFloor * f + B.speedPerExtraPlayer * e,
    rate: 1 + B.ratePerFloor * f + B.ratePerExtraPlayer * e,
    dmgAdd: Math.floor(f / B.dmgEveryFloors),
  };
  if (elite) { sc.hp *= B.eliteHp; sc.countAdd += B.eliteCountAdd; sc.rate *= B.eliteRate; sc.speed *= B.eliteSpeed; }
  return sc;
}

const ENEMY_DEFS = {
  // ---------- 일반 적 ----------
  grunt:    { name: "고블린", hp: 4, speed: 30, radius: 6, color: "#ef5350", kind: "square", touch: 1, ai: "chase", gold: [1, 1], goldChance: 0.3 },
  brute:    { name: "오우거", hp: 14, speed: 20, radius: 9, color: "#a1887f", kind: "square", touch: 2, ai: "chase", resist: 0.35, gold: [1, 2], goldChance: 0.5,
              attacks: [{ type: "slam", cd: 4, windup: 0.9, radius: 26, dmg: 2, range: 40 }] },
  runner:   { name: "박쥐", hp: 2, speed: 62, radius: 4, color: "#ffee58", kind: "circle", touch: 1, ai: "chase", gold: [1, 1], goldChance: 0.25 },
  swarmer:  { name: "벌레", hp: 1, speed: 44, radius: 3, color: "#9e9d24", kind: "circle", touch: 1, ai: "zigzag", pack: 4, gold: [1, 1], goldChance: 0.08 },
  slime:    { name: "슬라임", hp: 5, speed: 24, radius: 7, color: "#66bb6a", kind: "circle", touch: 1, ai: "chase", gold: [1, 1], goldChance: 0.3, onDeath: { spawn: "slimelet", count: 2 } },
  slimelet: { name: "아기 슬라임", hp: 2, speed: 40, radius: 4, color: "#a5d6a7", kind: "circle", touch: 1, ai: "chase", goldChance: 0 },
  shooter:  { name: "궁수", hp: 3, speed: 24, radius: 5, color: "#4dd0e1", kind: "diamond", touch: 1, ai: "kite", keep: [60, 90], gold: [1, 2], goldChance: 0.4,
              attacks: [{ type: "shoot", cd: 1.8, count: 1, spread: 0, speed: 95, dmg: 1, countScale: true }] },
  sniper:   { name: "저격수", hp: 3, speed: 20, radius: 4, color: "#90a4ae", kind: "diamond", touch: 1, ai: "kite", keep: [110, 150], gold: [2, 3], goldChance: 0.4,
              attacks: [{ type: "shoot", cd: 3.2, count: 1, spread: 0, speed: 175, dmg: 1 }] },
  charger:  { name: "멧돼지", hp: 7, speed: 28, radius: 7, color: "#ff8a65", kind: "tri", touch: 1, ai: "chase", gold: [1, 2], goldChance: 0.4,
              attacks: [{ type: "charge", cd: 3.2, windup: 0.6, dur: 0.45, speed: 170, range: 140 }] },
  spearman: { name: "창병", hp: 6, speed: 26, radius: 6, color: "#8d6e63", kind: "tri", touch: 1, ai: "chase", gold: [1, 2], goldChance: 0.4,
              attacks: [{ type: "charge", cd: 2.6, windup: 0.45, dur: 0.25, speed: 150, range: 80 }] },
  spreader: { name: "마법사", hp: 5, speed: 20, radius: 6, color: "#ba68c8", kind: "star", sides: 5, touch: 1, ai: "kite", keep: [70, 100], gold: [1, 2], goldChance: 0.4,
              attacks: [{ type: "shoot", cd: 2.3, count: 3, spread: 0.7, speed: 80, dmg: 1, countScale: true }] },
  wisp:     { name: "도깨비불", hp: 3, speed: 34, radius: 4, color: "#80deea", kind: "circle", touch: 1, ai: "zigzag", gold: [1, 2], goldChance: 0.35,
              attacks: [{ type: "shoot", cd: 2.4, count: 1, spread: 0, speed: 90, dmg: 1 }] },
  ghost:    { name: "유령", hp: 6, speed: 24, radius: 6, color: "#cfd8dc", kind: "circle", touch: 1, ai: "chase", phasing: true, gold: [1, 2], goldChance: 0.4 },
  bomber:   { name: "폭탄병", hp: 3, speed: 50, radius: 5, color: "#ff7043", kind: "circle", touch: 0, ai: "bomber", gold: [1, 1], goldChance: 0.3 },
  tank:     { name: "골렘", hp: 16, speed: 18, radius: 10, color: "#8e24aa", kind: "square", touch: 2, ai: "chase", resist: 0.3, gold: [2, 3], goldChance: 0.7,
              attacks: [{ type: "slam", cd: 3.5, windup: 0.8, radius: 30, dmg: 2, range: 55 }] },
  shieldbearer: { name: "방패병", hp: 10, speed: 20, radius: 7, color: "#78909c", kind: "square", touch: 1, ai: "chase", frontGuard: true, gold: [1, 2], goldChance: 0.5 },
  spinner:  { name: "회전포", hp: 9, speed: 12, radius: 8, color: "#26a69a", kind: "poly", sides: 8, touch: 1, ai: "chase", gold: [2, 3], goldChance: 0.6,
              attacks: [{ type: "spiral", cd: 4, dur: 2.2, rate: 12, step: 0.5, arms: 2, speed: 75, dmg: 1, countScale: true }] },
  healer:   { name: "치유사", hp: 5, speed: 20, radius: 5, color: "#66bb6a", kind: "cross", touch: 1, ai: "kite", keep: [90, 130], gold: [1, 2], goldChance: 0.5,
              attacks: [{ type: "heal", cd: 3.5, radius: 70, pct: 0.25 }] },
  summoner: { name: "소환사", hp: 6, speed: 18, radius: 6, color: "#7e57c2", kind: "diamond", touch: 1, ai: "kite", keep: [80, 110], gold: [2, 3], goldChance: 0.6,
              attacks: [{ type: "summon", cd: 6, spawn: "runner", count: 2, max: 5, countScale: true }] },
  turret:   { name: "포탑", hp: 8, speed: 0, radius: 6, color: "#fbc02d", kind: "poly", sides: 4, touch: 0, ai: "static", gold: [1, 2], goldChance: 0.4,
              attacks: [{ type: "ring", cd: 3, count: 8, speed: 70, dmg: 1, countScale: true }] },

  // ---------- 보스 (minFloor 이상 층에서 무작위로 나온다. 8층은 마왕 고정) ----------
  slimeKing: { name: "슬라임 왕", boss: true, minFloor: 1, hp: 140, speed: 22, radius: 16, color: "#43a047", kind: "circle", touch: 2, ai: "chase", resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "ring", cd: 3.6, count: 10, speed: 65, dmg: 1, countScale: true }, { type: "summon", cd: 7, spawn: "slime", count: 2, max: 4 }] },
      { at: 0.6, enter: [{ type: "guard", spawn: "slimelet", count: 4, timeout: 22 }], attacks: [{ type: "ring", cd: 2.8, count: 14, speed: 70, dmg: 1, countScale: true }, { type: "shoot", cd: 2, count: 3, spread: 0.6, speed: 95, dmg: 1, countScale: true }, { type: "summon", cd: 5, spawn: "slimelet", count: 3, max: 8 }] },
      { at: 0.25, attacks: [{ type: "ringgap", cd: 2.8, count: 20, gap: 40, speed: 75, dmg: 1, countScale: true }, { type: "bombard", cd: 4.5, count: 3, radius: 24, delay: 0.9, dmg: 2 }, { type: "summon", cd: 6, spawn: "slime", count: 2, max: 5 }] }] },
  knight:    { name: "화염 기사", boss: true, minFloor: 2, hp: 150, speed: 34, radius: 13, color: "#ff7043", kind: "poly", sides: 6, touch: 2, ai: "chase", resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "charge", cd: 3.4, windup: 0.7, dur: 0.5, speed: 190, chain: 2, range: 220 }, { type: "shoot", cd: 2.4, count: 3, spread: 0.5, speed: 100, dmg: 1, countScale: true }] },
      { at: 0.6, attacks: [{ type: "charge", cd: 3, windup: 0.6, dur: 0.5, speed: 205, chain: 3, range: 220 }, { type: "bombard", cd: 4, count: 3, radius: 26, delay: 0.9, dmg: 2 }, { type: "shoot", cd: 2.2, count: 5, spread: 0.8, speed: 105, dmg: 1, countScale: true }] },
      { at: 0.3, attacks: [{ type: "charge", cd: 2.4, windup: 0.5, dur: 0.5, speed: 220, chain: 3, range: 240 }, { type: "ringgap", cd: 3, count: 16, gap: 50, speed: 80, dmg: 1, countScale: true }, { type: "bombard", cd: 3.5, count: 4, radius: 26, delay: 0.8, dmg: 2 }] }] },
  clown:     { name: "광대 마술사", boss: true, minFloor: 2, hp: 140, speed: 30, radius: 11, color: "#f06292", kind: "star", sides: 6, touch: 2, ai: "kite", keep: [70, 100], resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "teleport", cd: 5, slam: true }, { type: "bombard", cd: 4.5, count: 3, radius: 24, delay: 1, dmg: 2 }, { type: "shoot", cd: 2.4, count: 3, spread: 0.6, speed: 90, dmg: 1, countScale: true }] },
      { at: 0.55, attacks: [{ type: "orbs", cd: 7, count: 5, spin: 1.8, radius: 44, hold: 2.4, speed: 90 }, { type: "summon", cd: 7, spawn: "wisp", count: 2, max: 5 }, { type: "ringgap", cd: 3.2, count: 16, gap: 55, speed: 78, dmg: 1, countScale: true }] },
      { at: 0.25, attacks: [{ type: "teleport", cd: 3.5, slam: true }, { type: "bombard", cd: 3.2, count: 5, radius: 24, delay: 0.8, dmg: 2 }, { type: "spiral", cd: 5, dur: 2.2, rate: 14, step: 0.55, arms: 2, speed: 80, dmg: 1, countScale: true }] }] },
  witch:     { name: "마녀", boss: true, minFloor: 3, hp: 130, speed: 28, radius: 11, color: "#ab47bc", kind: "diamond", touch: 2, ai: "kite", keep: [90, 120], resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "orbs", cd: 6, count: 4, spin: 1.6, radius: 46, hold: 2.6, speed: 85 }, { type: "shoot", cd: 2.2, count: 5, spread: 0.9, speed: 90, dmg: 1, countScale: true }] },
      { at: 0.6, attacks: [{ type: "spiral", cd: 5, dur: 2.6, rate: 15, step: 0.5, arms: 2, speed: 80, dmg: 1, countScale: true }, { type: "teleport", cd: 6, slam: true }, { type: "orbs", cd: 7, count: 6, spin: -2, radius: 50, hold: 2.4, speed: 90 }] },
      { at: 0.3, enter: [{ type: "guard", spawn: "wisp", count: 3, timeout: 22 }], attacks: [{ type: "ring", cd: 3, count: 14, speed: 75, dmg: 1, countScale: true }, { type: "spiral", cd: 4, dur: 2.8, rate: 18, step: 0.6, arms: 3, speed: 85, dmg: 1, countScale: true }] }] },
  golem:     { name: "골렘 왕", boss: true, minFloor: 4, hp: 200, speed: 18, radius: 18, color: "#78909c", kind: "square", touch: 2, ai: "chase", resist: 0.6,
    phases: [
      { at: 1, attacks: [{ type: "slam", cd: 3, windup: 0.9, radius: 42, dmg: 2, range: 70 }, { type: "rain", cd: 6, dur: 3, rate: 6, speed: 80 }] },
      { at: 0.6, enter: [{ type: "guard", spawn: "turret", count: 3, timeout: 30 }], attacks: [{ type: "slam", cd: 2.4, windup: 0.8, radius: 52, dmg: 2, range: 80 }, { type: "ring", cd: 3.2, count: 16, speed: 80, dmg: 1, countScale: true }] },
      { at: 0.3, attacks: [{ type: "slam", cd: 2.4, windup: 0.8, radius: 52, dmg: 2, range: 80 }, { type: "bombard", cd: 4, count: 5, radius: 26, delay: 0.9, dmg: 2 }, { type: "rain", cd: 5, dur: 3.5, rate: 9, speed: 90 }] }] },
  reaper:    { name: "사신", boss: true, minFloor: 3, hp: 170, speed: 40, radius: 12, color: "#455a64", kind: "poly", sides: 5, touch: 2, ai: "chase", resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "charge", cd: 3, windup: 0.5, dur: 0.5, speed: 220, chain: 2, range: 220 }, { type: "cross", cd: 7, spokes: 2, windup: 1.1, dur: 1.6, rot: 0.9, width: 7 }] },
      { at: 0.55, attacks: [{ type: "cross", cd: 6, spokes: 4, windup: 1.1, dur: 1.8, rot: 1, width: 7 }, { type: "summon", cd: 6, spawn: "bomber", count: 3, max: 6 }, { type: "teleport", cd: 6, slam: true }] },
      { at: 0.25, enter: [{ type: "guard", spawn: "ghost", count: 3, timeout: 24 }], attacks: [{ type: "cross", cd: 5, spokes: 6, windup: 1, dur: 2, rot: 1.2, width: 7 }, { type: "spiral", cd: 5, dur: 2.2, rate: 14, step: 0.55, arms: 3, speed: 85, dmg: 1, countScale: true }] }] },
  hive:      { name: "벌집 여왕", boss: true, minFloor: 3, hp: 150, speed: 20, radius: 15, color: "#fdd835", kind: "poly", sides: 6, touch: 2, ai: "kite", keep: [70, 110], resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "summon", cd: 5, spawn: "swarmer", count: 4, max: 12, countScale: true }, { type: "rain", cd: 6, dur: 2.5, rate: 7, speed: 85 }, { type: "shoot", cd: 2.4, count: 3, spread: 0.6, speed: 95, dmg: 1, countScale: true }] },
      { at: 0.55, enter: [{ type: "guard", spawn: "swarmer", count: 6, timeout: 20 }], attacks: [{ type: "ringgap", cd: 3, count: 18, gap: 50, speed: 75, dmg: 1, countScale: true }, { type: "bombard", cd: 4, count: 4, radius: 22, delay: 0.9, dmg: 2 }] },
      { at: 0.25, attacks: [{ type: "rain", cd: 4.5, dur: 3, rate: 10, speed: 95 }, { type: "summon", cd: 4, spawn: "runner", count: 3, max: 8 }, { type: "spiral", cd: 5, dur: 2.2, rate: 14, step: 0.5, arms: 3, speed: 80, dmg: 1, countScale: true }] }] },
  fortress:  { name: "포탑 요새", boss: true, minFloor: 4, hp: 180, speed: 0, radius: 16, color: "#f9a825", kind: "poly", sides: 4, touch: 2, ai: "static", resist: 1,
    phases: [
      { at: 1, attacks: [{ type: "cross", cd: 6.5, spokes: 3, windup: 1.2, dur: 2, rot: 0.7, width: 7 }, { type: "ring", cd: 3, count: 12, speed: 70, dmg: 1, countScale: true }, { type: "bombard", cd: 4.5, count: 3, radius: 24, delay: 1, dmg: 2 }] },
      { at: 0.6, enter: [{ type: "guard", spawn: "turret", count: 2, timeout: 28 }], attacks: [{ type: "spiral", cd: 4, dur: 3, rate: 14, step: 0.5, arms: 3, speed: 80, dmg: 1, countScale: true }, { type: "cross", cd: 6, spokes: 4, windup: 1.1, dur: 2, rot: 1, width: 7 }] },
      { at: 0.3, attacks: [{ type: "cross", cd: 5, spokes: 4, windup: 1, dur: 2.2, rot: 1.2, width: 7 }, { type: "ringgap", cd: 3, count: 18, gap: 45, speed: 80, dmg: 1, countScale: true }, { type: "bombard", cd: 3.5, count: 5, radius: 24, delay: 0.8, dmg: 2 }] }] },
  frostGiant: { name: "서리 거인", boss: true, minFloor: 5, hp: 220, speed: 20, radius: 19, color: "#4fc3f7", kind: "square", touch: 2, ai: "chase", resist: 0.6,
    phases: [
      { at: 1, attacks: [{ type: "slam", cd: 3, windup: 0.9, radius: 46, dmg: 2, range: 80 }, { type: "shoot", cd: 2.4, count: 5, spread: 0.8, speed: 85, dmg: 1, countScale: true }] },
      { at: 0.6, attacks: [{ type: "rain", cd: 5, dur: 3, rate: 8, speed: 90 }, { type: "slam", cd: 2.6, windup: 0.8, radius: 56, dmg: 2, range: 90 }, { type: "ringgap", cd: 3.2, count: 18, gap: 50, speed: 80, dmg: 1, countScale: true }] },
      { at: 0.3, enter: [{ type: "guard", spawn: "shieldbearer", count: 3, timeout: 26 }], attacks: [{ type: "bombard", cd: 3.5, count: 5, radius: 26, delay: 0.9, dmg: 2 }, { type: "slam", cd: 2.6, windup: 0.8, radius: 56, dmg: 2, range: 90 }] }] },
  hydra:     { name: "히드라", boss: true, minFloor: 5, hp: 200, speed: 26, radius: 16, color: "#26a69a", kind: "poly", sides: 7, touch: 2, ai: "chase", resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "spiral", cd: 5, dur: 2.4, rate: 14, step: 0.5, arms: 3, speed: 80, dmg: 1, countScale: true }, { type: "shoot", cd: 2.2, count: 7, spread: 1.2, speed: 90, dmg: 1, countScale: true }] },
      { at: 0.6, attacks: [{ type: "spiral", cd: 4.5, dur: 2.6, rate: 16, step: -0.6, arms: 3, speed: 85, dmg: 1, countScale: true }, { type: "ring", cd: 3, count: 16, speed: 80, dmg: 1, countScale: true }, { type: "charge", cd: 4, windup: 0.6, dur: 0.5, speed: 200, chain: 2, range: 220 }] },
      { at: 0.3, enter: [{ type: "guard", spawn: "spinner", count: 2, timeout: 26 }], attacks: [{ type: "spiral", cd: 4, dur: 3, rate: 18, step: 0.65, arms: 4, speed: 88, dmg: 1, countScale: true }, { type: "ringgap", cd: 3, count: 20, gap: 45, speed: 85, dmg: 1, countScale: true }] }] },
  // 8층 최종 보스
  overlord:  { name: "마왕", boss: true, final: true, hp: 420, speed: 30, radius: 20, color: "#d32f2f", kind: "poly", sides: 7, touch: 2, ai: "chase", resist: 0.1,
    phases: [
      { at: 1, attacks: [{ type: "ring", cd: 3, count: 14, speed: 75, dmg: 1, countScale: true }, { type: "shoot", cd: 2, count: 5, spread: 0.8, speed: 100, dmg: 1, countScale: true }, { type: "summon", cd: 8, spawn: "runner", count: 3, max: 6 }, { type: "bombard", cd: 5, count: 3, radius: 24, delay: 1, dmg: 2 }] },
      { at: 0.7, enter: [{ type: "guard", spawn: "shieldbearer", count: 3, timeout: 28 }], attacks: [{ type: "spiral", cd: 4, dur: 3, rate: 16, step: 0.6, arms: 3, speed: 90, dmg: 1, countScale: true }, { type: "charge", cd: 3, windup: 0.5, dur: 0.5, speed: 220, chain: 3, range: 240 }, { type: "slam", cd: 3.5, windup: 0.8, radius: 45, dmg: 2, range: 80 }] },
      { at: 0.4, attacks: [{ type: "cross", cd: 6, spokes: 4, windup: 1, dur: 2.2, rot: 1.1, width: 7 }, { type: "orbs", cd: 7, count: 6, spin: 2, radius: 50, hold: 2.4, speed: 95 }, { type: "ringgap", cd: 3, count: 20, gap: 45, speed: 88, dmg: 1, countScale: true }, { type: "teleport", cd: 6, slam: true }] },
      { at: 0.2, enter: [{ type: "guard", spawn: "ghost", count: 4, timeout: 26 }], attacks: [{ type: "ring", cd: 2.2, count: 20, speed: 90, dmg: 1, countScale: true }, { type: "spiral", cd: 3.2, dur: 3, rate: 20, step: 0.7, arms: 4, speed: 95, dmg: 1, countScale: true }, { type: "cross", cd: 5, spokes: 6, windup: 0.9, dur: 2.2, rot: 1.3, width: 7 }, { type: "summon", cd: 6, spawn: "bomber", count: 3, max: 6 }] }] },
};
// 일반 방에 나오는 적: [종류, 처음 나오는 층, 가중치]
const ENEMY_POOL = [
  ["grunt", 1, 10], ["runner", 1, 6], ["slime", 1, 5], ["swarmer", 1, 4],
  ["shooter", 2, 5], ["charger", 2, 4], ["brute", 2, 3],
  ["spreader", 3, 4], ["bomber", 3, 4], ["wisp", 3, 4], ["spearman", 3, 3],
  ["tank", 4, 3], ["spinner", 4, 3], ["shieldbearer", 4, 3], ["healer", 4, 2],
  ["summoner", 5, 2], ["sniper", 5, 3], ["ghost", 5, 3], ["turret", 5, 2],
];
const pickEnemyType = floor => {
  const pool = ENEMY_POOL.filter(p => p[1] <= floor);
  let r = Math.random() * pool.reduce((a, p) => a + p[2], 0);
  for (const p of pool) if ((r -= p[2]) < 0) return p[0];
  return "grunt";
};
// 보스: 마지막 층은 마왕 고정, 그 외에는 minFloor를 만족하는 보스 중 이번 판에 안 나온 것을 무작위로
const pickBoss = (floor, used) => {
  if (floor >= MAX_FLOOR) return "overlord";
  const all = Object.keys(ENEMY_DEFS).filter(id => ENEMY_DEFS[id].boss && !ENEMY_DEFS[id].final && ENEMY_DEFS[id].minFloor <= floor);
  const fresh = all.filter(id => !used.has(id)), pool = fresh.length ? fresh : all;
  const id = pool[Math.floor(Math.random() * pool.length)]; used.add(id); return id;
};

// 바닥 위험 지대: 예고 원이 차오른 뒤 폭발해서 안에 있는 플레이어에게 피해
class Hazard extends Component {
  constructor(game, r, delay, dmg, color = "#ff1744") { super(); this.game = game; this.r = r; this.t = this.total = delay; this.dmg = dmg; this.color = color; }
  setup() {
    this.gameObject.addComponent(new DrawRenderer(ctx => {
      const k = 1 - this.t / this.total;
      ctx.strokeStyle = this.color; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(0, 0, this.r, 0, 7); ctx.stroke();
      ctx.fillStyle = this.color; ctx.globalAlpha = 0.12 + 0.3 * k; ctx.beginPath(); ctx.arc(0, 0, this.r * k, 0, 7); ctx.fill();
    }, this.r + 4, { order: 1 }));
  }
  update(dt) {
    this.t -= dt; if (this.t > 0) return;
    const g = this.game, p = this.transform.position;
    for (const h of g.heroes) { const hp = h.transform.position; if (h.alive && Math.hypot(hp.x - p.x, hp.y - p.y) < this.r + h.radius) h.hit(this.dmg, p.x, p.y, 180); }
    g.fx.emit(p.x, p.y, { count: 22, colors: [this.color, "#ffee58", "#fff"], speed: [40, 120], life: [0.2, 0.45], size: [1, 2.5], fade: true, area: this.r * 0.4 });
    g.cam.shake(2.5, 0.2); SFX.play("boom"); this.gameObject.destroy();
  }
}

const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

class Enemy extends Component {
  // opts: { delay, elite, parent, guardOf }
  constructor(game, type, opts = {}) {
    super();
    const def = ENEMY_DEFS[type];
    this.game = game; this.def = def; this.type = type; this.title = def.name; this.boss = !!def.boss;
    this.elite = !!opts.elite; this.parent = opts.parent || null; this.guardOf = opts.guardOf || null;
    this.sc = calcScale(game.floorNum, Math.max(1, game.heroes.length), this.elite);
    this.radius = def.radius * (this.elite ? BALANCE.eliteRadius : 1);
    this.hp = this.maxHp = Math.max(1, Math.round(def.hp * this.sc.hp));
    this.speed = def.speed * this.sc.speed; this.touch = (def.touch || 0) ? def.touch + this.sc.dmgAdd : 0;
    this.color = def.color; this.resist = def.resist || 0;
    this.spawnDelay = opts.delay ?? 0.7; this.kx = 0; this.ky = 0; this.t = Math.random() * 6;
    this.dead = false; this.busy = null; this.fuse = 0; this.face = 0;
    this.burn = null; this.slowT = 0; this.slowMul = 1; this.stunT = 0;       // 상태이상 (아이템 효과)
    this.invuln = false; this.guardT = 0; this.ethereal = false; this.alpha = 1; this.phT = Math.random() * 4; // 무적/수호막/유령
    this.phaseIdx = -1; this.atk = []; this.pendingEnter = null; this._enterPhase(0);
  }
  _phases() { return this.def.phases || [{ at: 1, attacks: this.def.attacks || [] }]; }
  _enterPhase(i) {
    const ph = this._phases()[i]; this.phaseIdx = i; this.busy = null;
    this.atk = ph.attacks.map(d => ({ d, cd: d.first ?? d.cd * (0.5 + Math.random() * 0.5) }));
    this.pendingEnter = ph.enter ? ph.enter.slice() : null;
  }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer((ctx, r) => this._draw(ctx, r), this.radius + 70, { order: 4 }));
  }
  _count(d, key = "count") { return Math.round(d[key] + (d.countScale ? this.sc.countAdd : 0)); }
  // 아이템 효과(화상·둔화·기절). 보스는 기절 면역.
  applyStatus(stats, by) {
    if (stats.burn > 0) this.burn = { t: 3, dps: 2 * stats.burn, by, tick: 0.5 };
    if (stats.slow > 0) { this.slowT = 2.5; this.slowMul = 0.5; }
    if (stats.stunChance > 0 && !this.boss && Math.random() < stats.stunChance) { this.stunT = 0.8; this.busy = null; }
  }

  _draw(ctx, r) {
    const rad = this.radius;
    if (this.spawnDelay > 0) { // 등장 예고
      ctx.strokeStyle = this.color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, rad * (1 + this.spawnDelay * 0.6), 0, 7); ctx.stroke();
      ctx.fillStyle = this.color; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(0, 0, rad, 0, 7); ctx.fill();
      return;
    }
    const b = this.busy;
    if (b && (b.phase === "wind" || b.type === "cross")) { // 공격 예고
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.t * 30); ctx.fillStyle = "#ff1744"; ctx.strokeStyle = "#ff1744";
      if (b.d.type === "slam") { ctx.beginPath(); ctx.arc(0, 0, b.d.radius, 0, 7); ctx.fill(); }
      else if (b.d.type === "charge") { ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(b.dir) * 90, Math.sin(b.dir) * 90); ctx.stroke(); }
      else if (b.d.type === "cross") {
        const on = b.phase === "on"; ctx.globalAlpha = on ? 0.9 : 0.35 + 0.2 * Math.sin(this.t * 30); ctx.lineWidth = on ? b.d.width : 1.5; ctx.strokeStyle = on ? "#ff5252" : "#ff1744";
        for (let k = 0; k < b.n; k++) { const a = b.ang + k * Math.PI * 2 / b.n; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 320, Math.sin(a) * 320); ctx.stroke(); }
        if (on) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; for (let k = 0; k < b.n; k++) { const a = b.ang + k * Math.PI * 2 / b.n; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 320, Math.sin(a) * 320); ctx.stroke(); } }
      }
      ctx.globalAlpha = this.draw.opacity;
    }
    const flash = r.flash > 0 || (this.fuse > 0 && Math.floor(this.fuse * 14) % 2);
    ctx.fillStyle = flash ? "#fff" : this.color;
    ctx.beginPath();
    const k = this.def.kind;
    if (k === "circle") ctx.arc(0, 0, rad, 0, 7);
    else if (k === "diamond") { ctx.moveTo(rad, 0); ctx.lineTo(0, rad); ctx.lineTo(-rad, 0); ctx.lineTo(0, -rad); ctx.closePath(); }
    else if (k === "tri") { const a = this.face; for (let i = 0; i < 3; i++) ctx.lineTo(Math.cos(a + i * 2.094) * rad * 1.15, Math.sin(a + i * 2.094) * rad * 1.15); ctx.closePath(); }
    else if (k === "poly") { const n = this.def.sides || 6; for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n + this.t * 0.8; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } ctx.closePath(); }
    else if (k === "star") { const n = this.def.sides || 5; for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n + this.t * 0.6, rr = i % 2 ? rad * 0.5 : rad; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); }
    else if (k === "cross") { const w = rad * 0.38; ctx.rect(-w, -rad, w * 2, rad * 2); ctx.rect(-rad, -w, rad * 2, w * 2); }
    else ctx.rect(-rad, -rad, rad * 2, rad * 2);
    ctx.fill();
    if (this.def.frontGuard) { ctx.strokeStyle = "#e0e0e0"; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, 0, rad + 2, this.face - 0.9, this.face + 0.9); ctx.stroke(); }
    if (this.burn) { ctx.strokeStyle = "#ff6d00"; ctx.lineWidth = 1.6; ctx.stroke(); }
    else if (this.slowT > 0) { ctx.strokeStyle = "#4fc3f7"; ctx.lineWidth = 1.6; ctx.stroke(); }
    if (this.stunT > 0) { ctx.fillStyle = "#fff59d"; ctx.fillRect(-1.5, -rad - 6, 3, 3); ctx.fillRect(-rad * 0.6, -rad - 4, 3, 3); ctx.fillRect(rad * 0.6 - 3, -rad - 4, 3, 3); }
    if (this.elite) { ctx.strokeStyle = "#ffd54f"; ctx.lineWidth = 1.6; ctx.stroke(); ctx.fillStyle = "#ffd54f"; ctx.fillRect(-2, rad + 5, 4, 3); }
    if (this.invuln) { // 수호막: 수호자를 모두 처치해야 사라진다
      ctx.strokeStyle = "#80deea"; ctx.lineWidth = 2; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(this.t * 8);
      ctx.beginPath(); ctx.arc(0, 0, rad + 5, 0, 7); ctx.stroke(); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(0, 0, rad + 9, this.t, this.t + 5); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = this.draw.opacity;
    }
    ctx.fillStyle = "#000"; const e = Math.max(1.5, rad * 0.22); ctx.fillRect(-rad * 0.45, rad * 0.1, e, e); ctx.fillRect(rad * 0.2, rad * 0.1, e, e);
    if (!this.boss && this.maxHp > 8 && this.hp < this.maxHp) {
      ctx.fillStyle = "#000a"; ctx.fillRect(-rad, rad + 3, rad * 2, 2);
      ctx.fillStyle = "#e53935"; ctx.fillRect(-rad, rad + 3, rad * 2 * this.hp / this.maxHp, 2);
    }
  }

  update(dt) {
    if (this.spawnDelay > 0) { this.spawnDelay -= dt; return; }
    this.t += dt;
    const g = this.game, p = this.transform.position, def = this.def;
    if (this.burn) { // 화상: 0.5초마다 피해
      this.burn.t -= dt; this.burn.tick -= dt;
      if (this.burn.tick <= 0) { this.burn.tick = 0.5; g.fx.emit(p.x, p.y, { count: 3, colors: ["#ff6d00", "#ffee58"], speed: [10, 30], life: [0.2, 0.4], size: [1, 1.6], fade: true }); this.damage(this.burn.dps * 0.5, this.burn.by, 0, 0); if (this.dead) return; }
      if (this.burn && this.burn.t <= 0) this.burn = null;
    }
    if (this.slowT > 0) this.slowT -= dt;
    const stunned = this.stunT > 0; if (stunned) this.stunT -= dt;
    const slow = this.slowT > 0 ? this.slowMul : 1;
    if (def.phasing) { this.phT += dt; this.ethereal = (this.phT % 4) > 2.6; }
    if (this.guardT > 0) { // 수호막
      this.guardT -= dt;
      if (!g.enemies.some(e => e.guardOf === this && !e.dead && !e.gameObject.isDestroyed)) { this.guardT = 0; g.toast(`${this.title}의 방어막이 사라졌다!`, 1.8); SFX.play("clear"); }
    }
    this.invuln = this.guardT > 0;
    this.draw.opacity = this.alpha * (this.ethereal ? 0.35 : 1);
    if (this.boss) { const ph = this._phases(), next = ph[this.phaseIdx + 1]; if (next && this.hp / this.maxHp <= next.at) { this._enterPhase(this.phaseIdx + 1); g.cam.shake(4, 0.4); g.toast(`${this.title} 격노!`, 1.5); SFX.play("boom"); } }
    let target = null, td = Infinity;
    for (const h of g.heroes) { if (!h.alive) continue; const hp = h.transform.position, d = Math.hypot(hp.x - p.x, hp.y - p.y); if (d < td) { td = d; target = h; } }
    let vx = 0, vy = 0;
    if (target) {
      const tp = target.transform.position, a = Math.atan2(tp.y - p.y, tp.x - p.x);
      if (!this.busy) this.face = a;
      const sp = this.speed * slow;
      if (this.pendingEnter && !this.busy) { const list = this.pendingEnter; this.pendingEnter = null; for (const d of list) this._begin({ d, cd: 0 }, a, target); }
      if (stunned) { vx = vy = 0; }
      else if (this.busy) [vx, vy] = this._runBusy(dt, a, target);
      else {
        switch (def.ai) {
          case "static": break;
          case "kite": { const [n, f] = def.keep || [60, 90]; const m = td > f ? 1 : td < n ? -1 : 0; vx = Math.cos(a) * sp * m; vy = Math.sin(a) * sp * m; break; }
          case "zigzag": { const w = Math.sin(this.t * 4) * 0.9; vx = (Math.cos(a) - Math.sin(a) * w) * sp; vy = (Math.sin(a) + Math.cos(a) * w) * sp; break; }
          case "bomber":
            if (this.fuse > 0) { this.fuse -= dt; if (this.fuse <= 0) { this._explode(); return; } }
            else { vx = Math.cos(a) * sp; vy = Math.sin(a) * sp; if (td < this.radius + 14) this.fuse = 0.6; }
            break;
          default: vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
        }
        if (this.avoidT > 0 && (def.ai === "chase" || def.ai === "zigzag" || !def.ai)) { // 장애물에 막혔을 땐 잠깐 옆으로 돌아간다
          this.avoidT -= dt; const pa = a + Math.PI / 2 * this.avoidSign; vx += Math.cos(pa) * sp * 0.9; vy += Math.sin(pa) * sp * 0.9;
        }
        if (!this.ethereal) for (const at of this.atk) {
          at.cd -= dt * this.sc.rate * slow;
          if (at.cd <= 0 && td <= (at.d.range ?? Infinity)) { this._begin(at, a, target); if (this.busy) break; }
        }
      }
      if (this.touch && !this.ethereal && td < this.radius + 6) target.hit(this.touch, p.x, p.y, 130);
    }
    for (const o of g.enemies) { // 겹치지 않게 밀어내기
      if (o === this || o.spawnDelay > 0) continue;
      const op = o.transform.position, dx = p.x - op.x, dy = p.y - op.y, d = Math.hypot(dx, dy), min = this.radius + o.radius;
      if (d > 0 && d < min) { vx += dx / d * 40; vy += dy / d * 40; }
    }
    vx += this.kx; vy += this.ky; this.kx *= Math.max(0, 1 - 8 * dt); this.ky *= Math.max(0, 1 - 8 * dt);
    const q = this.transform.position; // 순간이동 등으로 이번 프레임에 위치가 바뀌었을 수 있으니 다시 읽는다
    let nx = q.x + vx * dt, ny = q.y + vy * dt;
    if (this.radius <= 11 && g.obstacles.length) { // 지형지물에 막힌다 (덩치 큰 보스는 무시). 막히면 잠깐 옆으로 돌아간다
      const [px, py, blocked] = g.pushOut(nx, ny, this.radius);
      if (blocked && (vx || vy)) { this.avoidT = 0.6; if (!this.avoidSign) this.avoidSign = Math.random() < 0.5 ? 1 : -1; }
      nx = px; ny = py;
    }
    this.transform.setPosition(Math.max(-ARENA.w / 2 + this.radius, Math.min(ARENA.w / 2 - this.radius, nx)), Math.max(-ARENA.h / 2 + this.radius, Math.min(ARENA.h / 2 - this.radius, ny)));
  }

  // ---- 공격 패턴 ----
  _clampPos(x, y, m = 10) { return [Math.max(-ARENA.w / 2 + m, Math.min(ARENA.w / 2 - m, x)), Math.max(-ARENA.h / 2 + m, Math.min(ARENA.h / 2 - m, y))]; }
  _begin(at, aim, target) {
    const d = at.d, g = this.game, p = this.transform.position, sc = this.sc;
    const dmg = (d.dmg || 1) + sc.dmgAdd, spd = (d.speed || 80) * sc.speed;
    switch (d.type) {
      case "shoot": {
        const n = this._count(d), spread = d.spread || 0;
        for (let i = 0; i < n; i++) g.spawnProj(p.x, p.y, aim + (n > 1 ? (i - (n - 1) / 2) * (spread / (n - 1)) : 0), spd, dmg, false); // spread = 부채꼴 전체 각도
        SFX.play("eshoot"); at.cd = d.cd; break;
      }
      case "ring": {
        const n = this._count(d), off = Math.random() * 6;
        for (let i = 0; i < n; i++) g.spawnProj(p.x, p.y, off + i * Math.PI * 2 / n, spd, dmg, false);
        g.cam.shake(1.5, 0.15); SFX.play("eshoot"); at.cd = d.cd; break;
      }
      case "ringgap": {
        const n = this._count(d), gap = (d.gap || 40) * Math.PI / 180, off = Math.random() * 6;
        for (let i = 0; i < n; i++) { const a = off + i * Math.PI * 2 / n; if (angleDiff(a, aim) > gap / 2) g.spawnProj(p.x, p.y, a, spd, dmg, false); }
        g.cam.shake(1.5, 0.15); SFX.play("eshoot"); at.cd = d.cd; break;
      }
      case "spiral": this.busy = { type: "spiral", d, at, phase: "run", t: d.dur, acc: 0, base: Math.random() * 6, dmg, spd }; break;
      case "rain": this.busy = { type: "rain", d, at, phase: "run", t: d.dur, acc: 0, dmg, spd: (d.speed || 80) * sc.speed }; SFX.play("warn"); break;
      case "charge": this.busy = { type: "charge", d, at, phase: "wind", t: d.windup, dir: aim, left: d.chain || 1 }; SFX.play("warn"); break;
      case "slam": this.busy = { type: "slam", d, at, phase: "wind", t: d.windup }; SFX.play("warn"); break;
      case "cross": this.busy = { type: "cross", d, at, phase: "wind", t: d.windup, ang: Math.random() * 6, n: Math.min(8, Math.round(d.spokes + (d.countScale ? sc.countAdd : 0))), dmg }; SFX.play("warn"); break;
      case "teleport": this.busy = { type: "teleport", d, at, phase: "vanish", t: 0.35 }; break;
      case "orbs": {
        const n = this._count(d), a0 = Math.random() * 6;
        for (let i = 0; i < n; i++) g.spawnProj(p.x, p.y, 0, 0, dmg, false, { orbit: { center: this, a0: a0 + i * Math.PI * 2 / n, w: d.spin || 1.6, r0: 12, r1: d.radius || 46, t: 0, hold: d.hold || 2.5, speed: spd } });
        at.cd = d.cd; break;
      }
      case "bombard": {
        const n = this._count(d), alive = g.heroes.filter(h => h.alive); if (!alive.length) break;
        for (let i = 0; i < n; i++) { const h = alive[i % alive.length].transform.position, [x, y] = this._clampPos(h.x + (Math.random() - 0.5) * (i < alive.length ? 10 : 70), h.y + (Math.random() - 0.5) * (i < alive.length ? 10 : 70), 12); g.spawnHazard(x, y, d.radius || 24, d.delay || 0.9, (d.dmg || 2) + sc.dmgAdd); }
        SFX.play("warn"); at.cd = d.cd; break;
      }
      case "summon": {
        const mine = g.enemies.filter(e => e.parent === this).length, n = Math.min(this._count(d), Math.max(0, d.max - mine));
        for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, [x, y] = this._clampPos(p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24); g.spawnEnemy(d.spawn, x, y, { delay: 0.5, parent: this }); }
        at.cd = d.cd; break;
      }
      case "guard": { // 수호자 소환 + 본체 무적
        const n = this._count(d);
        for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n + 0.5, [x, y] = this._clampPos(p.x + Math.cos(a) * (this.radius + 36), p.y + Math.sin(a) * (this.radius + 36), 12); g.spawnEnemy(d.spawn, x, y, { delay: 0.6, guardOf: this, parent: this }); }
        this.guardT = d.timeout || 25; this.invuln = true; g.toast(`${this.title}이(가) 방어막을 쳤다! 수호자를 처치하라`, 2.5); SFX.play("warn"); at.cd = d.cd || 99; break;
      }
      case "heal": {
        let any = false;
        for (const e of g.enemies) {
          if (e === this || e.boss || e.dead || e.spawnDelay > 0 || e.hp >= e.maxHp) continue;
          const ep = e.transform.position; if (Math.hypot(ep.x - p.x, ep.y - p.y) > (d.radius || 70)) continue;
          e.hp = Math.min(e.maxHp, e.hp + Math.max(1, Math.ceil(e.maxHp * (d.pct || 0.25)))); any = true;
          g.fx.emit(ep.x, ep.y, { count: 4, colors: ["#81c784", "#fff"], speed: [10, 30], life: [0.3, 0.5], size: [1, 1.8], fade: true });
        }
        at.cd = any ? d.cd : d.cd * 0.4; break;
      }
    }
  }
  _runBusy(dt, aim, target) {
    const b = this.busy, d = b.d, g = this.game, p = this.transform.position, sc = this.sc;
    b.t -= dt;
    if (b.type === "spiral") {
      const arms = Math.min(BALANCE.maxArms, Math.round(d.arms + (d.countScale ? sc.countAdd : 0))), interval = 1 / (d.rate * sc.rate);
      b.acc += dt;
      while (b.acc >= interval) { b.acc -= interval; b.base += d.step; for (let i = 0; i < arms; i++) g.spawnProj(p.x, p.y, b.base + i * Math.PI * 2 / arms, b.spd, b.dmg, false); }
      if (b.t <= 0) { b.at.cd = d.cd; this.busy = null; }
      return [Math.cos(aim) * this.speed * 0.3, Math.sin(aim) * this.speed * 0.3];
    }
    if (b.type === "rain") { // 위에서 쏟아지는 탄
      const interval = 1 / (d.rate * sc.rate); b.acc += dt;
      while (b.acc >= interval) { b.acc -= interval; g.spawnProj((Math.random() * 2 - 1) * (ARENA.w / 2 - 8), ARENA.h / 2 + 6, -Math.PI / 2 + (Math.random() - 0.5) * 0.2, b.spd, b.dmg, false); }
      if (b.t <= 0) { b.at.cd = d.cd; this.busy = null; }
      return [Math.cos(aim) * this.speed * 0.4, Math.sin(aim) * this.speed * 0.4];
    }
    if (b.type === "charge") {
      if (b.phase === "wind") { b.dir = b.left === (d.chain || 1) ? b.dir : aim; if (b.t <= 0) { b.phase = "dash"; b.t = d.dur; } return [0, 0]; }
      if (b.t <= 0) {
        if (--b.left > 0) { b.phase = "wind"; b.t = d.windup * 0.6; b.dir = aim; SFX.play("warn"); return [0, 0]; } // 연속 돌진
        b.at.cd = d.cd; this.busy = null; return [0, 0];
      }
      const s = d.speed * sc.speed; return [Math.cos(b.dir) * s, Math.sin(b.dir) * s];
    }
    if (b.type === "slam") {
      if (b.t <= 0) {
        for (const h of g.heroes) { const hp = h.transform.position; if (h.alive && Math.hypot(hp.x - p.x, hp.y - p.y) < d.radius + h.radius) h.hit((d.dmg || 2) + sc.dmgAdd, p.x, p.y, 200); }
        g.fx.emit(p.x, p.y, { count: 30, colors: [this.color, "#fff"], speed: [60, 160], life: [0.2, 0.5], size: [1, 2.5], fade: true, area: d.radius * 0.4 });
        g.cam.shake(4, 0.25); SFX.play("boom"); b.at.cd = d.cd; this.busy = null;
      }
      return [0, 0];
    }
    if (b.type === "cross") { // 회전 레이저: 예고선 → 발동(회전하며 닿으면 피해)
      if (b.phase === "wind") { b.ang += dt * 0.2; if (b.t <= 0) { b.phase = "on"; b.t = d.dur; SFX.play("boom"); } return [0, 0]; }
      b.ang += (d.rot || 1) * dt;
      for (const h of g.heroes) {
        if (!h.alive) continue; const hp = h.transform.position, dx = hp.x - p.x, dy = hp.y - p.y;
        for (let k = 0; k < b.n; k++) { const a = b.ang + k * Math.PI * 2 / b.n, along = dx * Math.cos(a) + dy * Math.sin(a), perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)); if (along > 0 && perp < d.width / 2 + h.radius) { h.hit(1 + sc.dmgAdd, p.x, p.y, 100); break; } }
      }
      if (b.t <= 0) { b.at.cd = d.cd; this.busy = null; }
      return [0, 0];
    }
    if (b.type === "teleport") {
      if (b.phase === "vanish") {
        this.alpha = Math.max(0, b.t / 0.35); this.ethereal = true;
        if (b.t <= 0) {
          const tp = target.transform.position, a = Math.random() * 6.28, [x, y] = this._clampPos(tp.x + Math.cos(a) * 55, tp.y + Math.sin(a) * 55, this.radius + 4);
          this.transform.setPosition(x, y); b.phase = "appear"; b.t = 0.35;
          if (d.slam) g.spawnHazard(x, y, 30, 0.7, 2 + sc.dmgAdd, "#ff4081");
        }
      } else { this.alpha = Math.min(1, 1 - b.t / 0.35); if (b.t <= 0) { this.alpha = 1; this.ethereal = false; b.at.cd = d.cd; this.busy = null; } }
      return [0, 0];
    }
    this.busy = null; return [0, 0];
  }
  _explode() {
    const g = this.game, p = this.transform.position, R = 30;
    for (const h of g.heroes) { const hp = h.transform.position; if (h.alive && Math.hypot(hp.x - p.x, hp.y - p.y) < R + h.radius) h.hit(2 + this.sc.dmgAdd, p.x, p.y, 220); }
    g.fx.emit(p.x, p.y, { count: 40, colors: ["#ff7043", "#ffee58", "#fff"], speed: [50, 150], life: [0.2, 0.5], size: [1.5, 3], fade: true, area: 10 });
    g.cam.shake(4, 0.25); SFX.play("boom"); this.die(null, true);
  }

  damage(n, by, angle, knock) {
    if (this.dead || this.spawnDelay > 0 || this.ethereal) return;
    const g = this.game, p = this.transform.position;
    if (this.invuln) { // 수호막: 피해 무효
      g.fx.emit(p.x, p.y, { count: 3, colors: ["#80deea", "#fff"], speed: [20, 60], life: [0.1, 0.25], size: [1, 1.6], fade: true }); SFX.play("block"); return;
    }
    if (this.def.frontGuard && knock > 0 && angleDiff(angle + Math.PI, this.face) < 0.9) { // 방패병: 정면 공격은 약하게
      n *= 0.25; knock *= 0.3; SFX.play("block");
      g.fx.emit(p.x + Math.cos(this.face) * this.radius, p.y + Math.sin(this.face) * this.radius, { count: 3, colors: ["#fff", "#b0bec5"], speed: [20, 60], life: [0.1, 0.25], size: [1, 1.6], fade: true });
    } else SFX.play("hit");
    this.hp -= n; this.draw.flash = 0.07;
    if (by && by.stats && by.stats.execute && !this.boss && this.hp > 0 && this.hp / this.maxHp < by.stats.execute) this.hp = 0; // 처형자의 휘장
    const k = knock * (1 - this.resist);
    this.kx += Math.cos(angle) * k; this.ky += Math.sin(angle) * k;
    g.fx.emit(p.x, p.y, { count: 5, colors: [this.color, "#fff"], speed: [20, 70], life: [0.15, 0.35], size: [1, 1.8], fade: true });
    if (this.hp <= 0) this.die(by);
  }
  die(by, quiet = false) {
    if (this.dead) return; this.dead = true;
    const g = this.game, p = this.transform.position, def = this.def;
    g.fx.emit(p.x, p.y, { count: this.boss ? 60 : 14, colors: [this.color, "#fff"], speed: [30, 110], life: [0.3, 0.7], size: [1, 2.8], fade: true });
    SFX.play(this.boss ? "boom" : "die");
    if (this.boss) for (const e of g.enemies) if (e !== this && !e.dead && (e.parent === this || e.guardOf === this)) e.die(null, true); // 보스가 쓰러지면 졸개도 사라진다
    if (def.onDeath && !quiet) for (let i = 0; i < def.onDeath.count; i++) { const a = i * 3.14 + Math.random(); g.spawnEnemy(def.onDeath.spawn, p.x + Math.cos(a) * 8, p.y + Math.sin(a) * 8, { delay: 0.2 }); }
    const bonus = g.partySum("coinDrop"); // 골드 관련 아이템은 파티 전체에 적용
    if (!this.boss && !quiet && (def.gold || bonus > 0) && (this.elite || Math.random() < ((def.goldChance ?? 0) + bonus) * BALANCE.coinRate)) {
      const [lo, hi] = def.gold || [1, 1], n = (lo + Math.floor(Math.random() * (hi - lo + 1))) * (this.elite ? 2 : 1);
      g.spawnCoin(p.x, p.y, n);
    }
    if (by) by.kills++;
    Events.emit("enemy.killed", { enemy: this, by });
    this.gameObject.destroy();
  }
}

// 탄환. fromPlayer=true면 적을 맞춘다. 적 탄은 기본적으로 상쇄·반사되지 않는다(아이템 필요).
// 옵션: pierce(관통) · life · radius · area(맞으면 폭발 반경) · boomerang(나갔다 돌아옴) · orbit(적 보스 주변을 도는 구체)
class Projectile extends Component {
  constructor(game, angle, speed, dmg, fromPlayer, opts = {}) {
    super();
    this.game = game; this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.dmg = dmg; this.fromPlayer = fromPlayer; this.life = opts.life ?? 5; this.radius = opts.radius ?? 3;
    this.pierce = !!opts.pierce; this.beam = !!opts.beam; this.hitSet = new Set(); this.angle = angle;
    this.owner = opts.owner || null; this.knock = opts.knock ?? 60; this.color = opts.color || "#fff59d"; this.kind = opts.kind || "";
    this.area = opts.area || 0; this.orbit = opts.orbit || null; this.speed = opts.speed || speed;
    this.bm = opts.boomerang ? { phase: "out", dist: 0, max: opts.range || 80 } : null;
  }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer(ctx => {
      if (this.beam) { ctx.rotate(this.angle); ctx.strokeStyle = "#e1f5fe"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke(); return; }
      if (this.fromPlayer && this.owner) {
        if (this.area) { ctx.fillStyle = this.color; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(0, 0, this.radius + 3, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
        if (this.bm) { ctx.rotate(performance.now() / 60); ctx.strokeStyle = this.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, this.radius + 1.5, 0.4, 5.6); ctx.stroke(); return; }
        if (this.kind === "bolt" || this.kind === "pierce" || this.kind === "fan") { ctx.rotate(Math.atan2(this.vy, this.vx)); ctx.strokeStyle = this.color; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(3, 0); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(3, 0, 1.2, 0, 7); ctx.fill(); return; }
        ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.4, 0, 7); ctx.fill(); return;
      }
      ctx.fillStyle = this.fromPlayer ? "#fff59d" : "#ff8a65"; ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.45, 0, 7); ctx.fill();
    }, 14, { order: 6 }));
  }
  reflect(hero, dir) { this.fromPlayer = true; this.owner = hero; const s = Math.hypot(this.vx, this.vy) * 1.5; this.vx = Math.cos(dir) * s; this.vy = Math.sin(dir) * s; this.dmg = 3 * (1 + (hero.stats.reflect || 0)); this.life = 3; this.hitSet.clear(); }
  _boom() { // 구체 폭발
    const g = this.game, q = this.transform.position;
    for (const e of g.enemies) { if (e.dead || e.spawnDelay > 0) continue; const ep = e.transform.position; if (Math.hypot(ep.x - q.x, ep.y - q.y) < this.area + e.radius) { e.damage(this.dmg, this.owner, Math.atan2(ep.y - q.y, ep.x - q.x), this.knock); if (this.owner) this.owner.applyHitEffects(e, this.dmg); } }
    g.fx.emit(q.x, q.y, { count: 14, colors: [this.color, "#fff"], speed: [30, 90], life: [0.15, 0.35], size: [1, 2.2], fade: true, area: this.area * 0.3 }); SFX.play("boom");
    this.gameObject.destroy();
  }
  update(dt) {
    const t = this.transform, p = t.position, g = this.game;
    this.life -= dt;
    if (this.orbit) { // 보스 주변을 돌다가 hold초 뒤 바깥으로 발사
      const o = this.orbit, c = o.center, cp = c.transform.position, alive = !c.dead && !c.gameObject.isDestroyed;
      o.t += dt;
      if (!o.released && (o.t >= o.hold || !alive)) { o.released = true; const a = Math.atan2(p.y - cp.y, p.x - cp.x); this.vx = Math.cos(a) * o.speed; this.vy = Math.sin(a) * o.speed; this.life = 4; }
      if (!o.released) { const r = o.r0 + (o.r1 - o.r0) * Math.min(1, o.t / 0.8), a = o.a0 + o.w * o.t; t.setPosition(cp.x + Math.cos(a) * r, cp.y + Math.sin(a) * r); this.life = 5; }
      else t.setPosition(p.x + this.vx * dt, p.y + this.vy * dt);
    } else if (this.bm) { // 부메랑
      const b = this.bm, s = this.speed;
      if (b.phase === "out") { t.setPosition(p.x + this.vx * dt, p.y + this.vy * dt); b.dist += s * dt; if (b.dist >= b.max) { b.phase = "back"; this.hitSet.clear(); } }
      else {
        const o = this.owner, op = o && o.alive ? o.transform.position : null; if (!op) { this.gameObject.destroy(); return; }
        const a = Math.atan2(op.y - p.y, op.x - p.x); this.vx = Math.cos(a) * s * 1.1; this.vy = Math.sin(a) * s * 1.1; this.angle = a;
        t.setPosition(p.x + this.vx * dt, p.y + this.vy * dt);
        if (Math.hypot(op.x - p.x, op.y - p.y) < 8) { this.gameObject.destroy(); return; }
      }
    } else t.setPosition(p.x + this.vx * dt, p.y + this.vy * dt);
    const q = t.position;
    if (this.life <= 0) { if (this.area && this.fromPlayer) this._boom(); else this.gameObject.destroy(); return; }
    if (!this.bm && (Math.abs(q.x) > ARENA.w / 2 + 10 || Math.abs(q.y) > ARENA.h / 2 + 10)) { if (this.area && this.fromPlayer) this._boom(); else this.gameObject.destroy(); return; }
    if (!this.orbit && g.obstacles.length && (this.obsCd = (this.obsCd || 0) - dt) <= 0) { // 지형지물에 막힌다 (적 탄은 엄폐물에 막혀 사라지고, 내 탄은 상자·통을 부순다)
      const o = g.obstacleAt(q.x, q.y, this.radius);
      if (o) {
        if (this.fromPlayer) {
          if (o.destructible) o.damage(Math.max(1, Math.round(this.dmg / 2)), this.owner, !!this.area);
          if (this.bm) { if (this.bm.phase === "out") { this.bm.phase = "back"; this.hitSet.clear(); } this.obsCd = 0.25; }
          else if (this.area) { this._boom(); return; }
          else if (!(this.pierce && o.destructible)) { this.gameObject.destroy(); return; }
        } else { g.fx.emit(q.x, q.y, { count: 2, colors: ["#ff8a65", "#fff"], speed: [10, 30], life: [0.1, 0.2], size: [1, 1.4], fade: true }); this.gameObject.destroy(); return; }
      }
    }
    if (this.fromPlayer) {
      for (const e of g.enemies) {
        if (e.dead || e.spawnDelay > 0 || this.hitSet.has(e)) continue;
        const ep = e.transform.position;
        if (Math.hypot(ep.x - q.x, ep.y - q.y) < e.radius + this.radius) {
          if (this.area) { this._boom(); return; }
          e.damage(this.dmg, this.owner, Math.atan2(this.vy, this.vx), this.knock); this.hitSet.add(e);
          if (this.owner && !this.beam) this.owner.applyHitEffects(e, this.dmg);
          if (!this.pierce) { this.gameObject.destroy(); return; }
        }
      }
    } else {
      for (const h of g.heroes) {
        if (!h.alive) continue;
        const hp = h.transform.position;
        if (Math.hypot(hp.x - q.x, hp.y - q.y) < h.radius + this.radius) { h.hit(this.dmg, q.x - this.vx, q.y - this.vy, 90); this.gameObject.destroy(); return; }
      }
    }
  }
}
