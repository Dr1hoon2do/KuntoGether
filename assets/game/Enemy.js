// ============================================================================
// 적 정의 (데이터 기반). 새 적은 ENEMY_DEFS에 한 항목을 추가하고 ENEMY_POOL에 등장 층·가중치만 적으면 된다.
//
//  hp, speed, radius(크기), color, kind(모양: square|circle|diamond|tri|poly|star|cross), sides(poly/star 꼭짓점), touch(접촉 피해), resist(넉백 저항 0~1)
//  gold: [최소,최대] 코인 드랍 (확률 goldChance)   onDeath: { spawn, count } 분열   pack: 한 번에 나오는 수   noDrop: 드랍 없음
//  특성: phasing(주기적으로 실체가 사라짐) | frontGuard(정면 공격 피해 75% 감소) | rage(체력 절반 이하에서 빨라짐)
//
//  ── 행동 ──────────────────────────────────────────────
//  일반 적은 modes: [ { ai, keep:[가까운한계,먼한계], dur:[최소초,최대초], attacks:[...] }, ... ] 를 번갈아 쓴다.
//  (modes가 없으면 def.ai / def.attacks 하나만 쓴다.)  보스는 phases: [{ at: 체력비율, enter:[단계 시작 때 한 번 쓰는 패턴], ai?, keep?, attacks }].
//  ai(움직임): chase(쫓음) | kite(거리 유지) | strafe(주위를 빙빙 돎) | zigzag | wander(배회) | flee(도망) | hop(껑충껑충 접근)
//              | ricochet(직선으로 달리다 벽·장애물에 튕김) | bomber(다가가 자폭) | static(제자리) | orbit(보스 주위를 돎: 보호 구체)
//
//  ── 공격 패턴 ────────────────────────────────────────
//  공통: cd(쿨다운 초), first(첫 발동까지 초), range(이 거리 안일 때만), countScale(층·인원 보너스가 개수에 더해짐), shield(true면 시전 중 보스 무적)
//  탄 옵션(shoot/burst/ring/ringgap/rain/wall…): bounce(벽·장애물에 튕기는 횟수) · homing(유도 지속 초) · wave:[진폭,주파수](물결 탄)
//    shoot  : count, spread(부채꼴 전체 각도), speed, dmg                   조준 탄
//    burst  : rounds, interval, count, spread, speed, dmg                  조준 연속 사격 (매 발마다 다시 조준)
//    ring   : count, speed, dmg                                           사방 탄막
//    ringgap: count, gap(비워 두는 각도°), speed                          플레이어 쪽이 뚫린 탄막
//    spiral : dur, rate, step, arms, speed, dmg                           회전 탄막
//    orbs   : count, spin, radius, hold, speed                            몸 주위를 도는 구체들 → hold초 뒤 발사
//    rain   : dur, rate, speed                                            위에서 쏟아지는 탄
//    wall   : gap(안전 틈 폭), spacing, speed                             한쪽 벽에서 밀려오는 탄의 벽(틈으로 피해야 함)
//    bombard: count, radius, delay, dmg                                   플레이어 근처에 예고 원 → 폭발
//    cross  : spokes, windup, dur, rot, width                             회전하는 레이저 선
//    charge : windup, dur, speed, chain(연속 횟수), ram(true면 벽·장애물에 부딪힐 때까지 돌진)
//    leap   : windup, radius, dmg                                         도약해서 플레이어 위치에 착지(충격파)
//    slam   : windup, radius, dmg                                         예고 원 후 내려찍기
//    teleport: slam, near                                                 사라졌다 플레이어 근처에 나타남
//    summon : spawn, count, max                                           졸개 소환
//    heal   : radius, pct                                                 주변 아군(보스 제외) 회복
//  ── 보스 무적(보호막) 해제 방식 (보스마다 다름. 없는 보스도 있다) ──
//    guard    : spawn, count, timeout      수호자를 소환 → 전부 처치하면 해제
//    orbshield: count, radius, spin        보스 주위를 도는 보호 구체 → 전부 부수면 해제 (닿으면 아프다)
//    crystals : count, timeout             방 모서리에 수정이 솟아남(탄을 쏨) → 전부 파괴하면 해제
//    def.armor "crash": 평소엔 갑옷으로 무적. ram 돌진이 벽·장애물에 부딪히면 갑옷이 깨져 잠시 공격 가능
//    shield:true 패턴: 그 패턴을 시전하는 동안만 무적 (끝난 뒤가 공격 기회)
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
  maxEnemyProjectiles: 340,   // 화면 위 적 탄 최대 개수 (넘으면 더 안 쏜다: 성능·공정성)
  coinRate: 1.0,              // 코인 드랍 확률 배율 (경제 조절: 가격은 Items.js ITEM_PRICE·weaponPrice)
  eliteHp: 3, eliteCountAdd: 1, eliteRate: 1.25, eliteSpeed: 1.1, eliteRadius: 1.35,
};
// ── 난이도 ─────────────────────────────────────────────────────────────
// 보통 = 기준(1층 슬라임 왕 수준). 쉬움은 적 체력·패턴 빈도·탄 속도/개수를 낮추고 모든 피해를 1로, 플레이어 시작 HP를 늘린다. 어려움은 반대.
//  hp/rate/speed: 배율, countAdd: 탄 개수 가감, dmgCap: 적이 주는 피해 상한, bossRate/bossCount/bossSpeed/bossHp: 보스 추가 보정, playerHp: 플레이어 시작 HP
const DIFFICULTY = {
  easy:   { name: "쉬움",   playerHp: 8, hp: 0.75, rate: 0.78, speed: 0.9,  countAdd: -1, dmgCap: 1,  bossRate: 0.92, bossCount: 0, bossSpeed: 1.0,  bossHp: 0.8 },
  normal: { name: "보통",   playerHp: 6, hp: 1,    rate: 1,    speed: 1,    countAdd: 0,  dmgCap: 99, bossRate: 1.18, bossCount: 1, bossSpeed: 1.08, bossHp: 1 },
  hard:   { name: "어려움", playerHp: 5, hp: 1.3,  rate: 1.2,  speed: 1.1,  countAdd: 1,  dmgCap: 99, bossRate: 1.4,  bossCount: 2, bossSpeed: 1.15, bossHp: 1.25 },
};
// 층(floor)과 인원수(np)로 적 능력치 배율을 계산한다. 적은 생성될 때 이걸 한 번 받아 간다.
function calcScale(floor, np, elite = false, boss = false, diff = "normal") {
  const B = BALANCE, f = floor - 1, e = Math.max(0, np - 1);
  const sc = {
    hp: (1 + B.hpPerFloor * f) * (1 - B.hpPerExtraPlayer + B.hpPerExtraPlayer * np),
    countAdd: Math.floor(f / B.countEveryFloors) + Math.floor(e * B.countPerExtraPlayer),
    speed: 1 + B.speedPerFloor * f + B.speedPerExtraPlayer * e,
    rate: 1 + B.ratePerFloor * f + B.ratePerExtraPlayer * e,
    dmgAdd: Math.floor(f / B.dmgEveryFloors),
  };
  if (elite) { sc.hp *= B.eliteHp; sc.countAdd += B.eliteCountAdd; sc.rate *= B.eliteRate; sc.speed *= B.eliteSpeed; }
  const D = DIFFICULTY[diff] || DIFFICULTY.normal;
  sc.hp *= D.hp; sc.rate *= D.rate; sc.speed *= D.speed; sc.countAdd = Math.max(0, sc.countAdd + D.countAdd); sc.dmgCap = D.dmgCap;
  if (boss) { sc.rate *= D.bossRate; sc.countAdd += D.bossCount; sc.speed *= D.bossSpeed; sc.hp *= D.bossHp; }
  return sc;
}

const ENEMY_DEFS = {
  // ---------- 일반 적 (행동 모드를 번갈아 쓴다) ----------
  grunt:    { name: "고블린", hp: 4, speed: 30, radius: 6, color: "#ef5350", kind: "square", touch: 1, gold: [1, 1], goldChance: 0.3,
              modes: [{ ai: "chase", dur: [2.5, 4] },
                      { ai: "strafe", keep: [42, 58], dur: [1.6, 2.4], attacks: [{ type: "charge", cd: 1.1, first: 0.4, windup: 0.45, dur: 0.28, speed: 135, range: 95 }] }] },
  brute:    { name: "오우거", hp: 14, speed: 20, radius: 9, color: "#a1887f", kind: "square", touch: 2, resist: 0.35, gold: [1, 2], goldChance: 0.5,
              modes: [{ ai: "chase", dur: [3, 5], attacks: [{ type: "slam", cd: 3.8, windup: 0.9, radius: 26, dmg: 2, range: 40 }] },
                      { ai: "hop", dur: [2.2, 3.2], attacks: [{ type: "leap", cd: 2.2, first: 0.6, windup: 0.55, radius: 28, dmg: 2, range: 160 }] }] },
  runner:   { name: "박쥐", hp: 2, speed: 62, radius: 4, color: "#ffee58", kind: "circle", touch: 1, gold: [1, 1], goldChance: 0.25,
              modes: [{ ai: "zigzag", dur: [1.8, 2.8] }, { ai: "flee", dur: [0.7, 1.1] }] },
  swarmer:  { name: "벌레", hp: 1, speed: 44, radius: 3, color: "#9e9d24", kind: "circle", touch: 1, pack: 4, gold: [1, 1], goldChance: 0.08,
              modes: [{ ai: "zigzag", dur: [1.5, 2.5] }, { ai: "wander", dur: [1, 1.6] }] },
  slime:    { name: "슬라임", hp: 5, speed: 24, radius: 7, color: "#66bb6a", kind: "circle", touch: 1, gold: [1, 1], goldChance: 0.3, onDeath: { spawn: "slimelet", count: 2 },
              modes: [{ ai: "chase", dur: [2.5, 3.5] }, { ai: "hop", dur: [1.5, 2.2] }] },
  slimelet: { name: "아기 슬라임", hp: 2, speed: 40, radius: 4, color: "#a5d6a7", kind: "circle", touch: 1, goldChance: 0,
              modes: [{ ai: "chase", dur: [2, 3] }, { ai: "hop", dur: [1, 1.5] }] },
  shooter:  { name: "궁수", hp: 3, speed: 24, radius: 5, color: "#4dd0e1", kind: "diamond", touch: 1, gold: [1, 2], goldChance: 0.4,
              modes: [{ ai: "kite", keep: [60, 90], dur: [2.5, 3.5], attacks: [{ type: "burst", cd: 2.2, rounds: 3, interval: 0.16, count: 1, speed: 100, dmg: 1, countScale: true }] },
                      { ai: "strafe", keep: [65, 85], dur: [1.8, 2.6], attacks: [{ type: "shoot", cd: 1.0, count: 1, speed: 110, dmg: 1 }] }] },
  sniper:   { name: "저격수", hp: 3, speed: 20, radius: 4, color: "#90a4ae", kind: "diamond", touch: 1, gold: [2, 3], goldChance: 0.4,
              modes: [{ ai: "kite", keep: [110, 150], dur: [2.5, 3.5], attacks: [{ type: "shoot", cd: 2.6, count: 1, speed: 185, dmg: 1 }] },
                      { ai: "flee", dur: [0.8, 1.2] }] },
  charger:  { name: "멧돼지", hp: 7, speed: 28, radius: 7, color: "#ff8a65", kind: "tri", touch: 1, gold: [1, 2], goldChance: 0.4,
              modes: [{ ai: "chase", dur: [2, 3.2], attacks: [{ type: "charge", cd: 2.6, windup: 0.55, dur: 0.45, speed: 175, chain: 2, range: 150 }] },
                      { ai: "strafe", keep: [60, 80], dur: [1.2, 1.8] }] },
  spearman: { name: "창병", hp: 6, speed: 26, radius: 6, color: "#8d6e63", kind: "tri", touch: 1, gold: [1, 2], goldChance: 0.4,
              modes: [{ ai: "chase", dur: [2, 3], attacks: [{ type: "charge", cd: 2.2, windup: 0.4, dur: 0.25, speed: 160, range: 85 }] },
                      { ai: "strafe", keep: [50, 60], dur: [1.5, 2.2], attacks: [{ type: "charge", cd: 1.4, windup: 0.35, dur: 0.22, speed: 170, range: 75 }] }] },
  spreader: { name: "마법사", hp: 5, speed: 20, radius: 6, color: "#ba68c8", kind: "star", sides: 5, touch: 1, gold: [1, 2], goldChance: 0.4,
              modes: [{ ai: "kite", keep: [70, 100], dur: [2.5, 3.5], attacks: [{ type: "shoot", cd: 2.2, count: 3, spread: 0.7, speed: 82, dmg: 1, countScale: true }] },
                      { ai: "strafe", keep: [75, 95], dur: [2, 3], attacks: [{ type: "burst", cd: 2.6, rounds: 2, interval: 0.3, count: 3, spread: 0.6, speed: 85, dmg: 1, countScale: true }] }] },
  wisp:     { name: "도깨비불", hp: 3, speed: 34, radius: 4, color: "#80deea", kind: "circle", touch: 1, gold: [1, 2], goldChance: 0.35,
              modes: [{ ai: "zigzag", dur: [2, 3], attacks: [{ type: "shoot", cd: 2.4, count: 1, speed: 90, dmg: 1, homing: 1.6 }] },
                      { ai: "wander", dur: [1.5, 2.2], attacks: [{ type: "shoot", cd: 1.6, count: 1, speed: 80, dmg: 1, wave: [16, 5] }] }] },
  ghost:    { name: "유령", hp: 6, speed: 24, radius: 6, color: "#cfd8dc", kind: "circle", touch: 1, phasing: true, gold: [1, 2], goldChance: 0.4,
              modes: [{ ai: "chase", dur: [2.5, 3.5] }, { ai: "wander", dur: [1.2, 2] }] },
  bomber:   { name: "폭탄병", hp: 3, speed: 50, radius: 5, color: "#ff7043", kind: "circle", touch: 0, ai: "bomber", gold: [1, 1], goldChance: 0.3 },
  tank:     { name: "골렘", hp: 16, speed: 18, radius: 10, color: "#8e24aa", kind: "square", touch: 2, resist: 0.3, gold: [2, 3], goldChance: 0.7,
              modes: [{ ai: "chase", dur: [3, 4.5], attacks: [{ type: "slam", cd: 3.5, windup: 0.8, radius: 30, dmg: 2, range: 55 }] },
                      { ai: "hop", dur: [2, 2.8], attacks: [{ type: "leap", cd: 2.6, first: 0.5, windup: 0.65, radius: 32, dmg: 2, range: 170 }] }] },
  shieldbearer: { name: "방패병", hp: 10, speed: 20, radius: 7, color: "#78909c", kind: "square", touch: 1, frontGuard: true, gold: [1, 2], goldChance: 0.5,
              modes: [{ ai: "chase", dur: [2.5, 3.5] }, { ai: "strafe", keep: [30, 40], dur: [1.5, 2.2] }] },
  spinner:  { name: "회전포", hp: 9, speed: 12, radius: 8, color: "#26a69a", kind: "poly", sides: 8, touch: 1, gold: [2, 3], goldChance: 0.6,
              modes: [{ ai: "chase", dur: [3, 4], attacks: [{ type: "spiral", cd: 4, dur: 2.2, rate: 12, step: 0.5, arms: 2, speed: 75, dmg: 1, countScale: true }] },
                      { ai: "wander", dur: [2, 3], attacks: [{ type: "ring", cd: 2.2, count: 8, speed: 65, dmg: 1, countScale: true, bounce: 1 }] }] },
  healer:   { name: "치유사", hp: 5, speed: 20, radius: 5, color: "#66bb6a", kind: "cross", touch: 1, gold: [1, 2], goldChance: 0.5,
              modes: [{ ai: "kite", keep: [90, 130], dur: [3, 4], attacks: [{ type: "heal", cd: 3.5, radius: 70, pct: 0.25 }] },
                      { ai: "flee", dur: [1, 1.5], attacks: [{ type: "heal", cd: 3, radius: 70, pct: 0.25 }] }] },
  summoner: { name: "소환사", hp: 6, speed: 18, radius: 6, color: "#7e57c2", kind: "diamond", touch: 1, gold: [2, 3], goldChance: 0.6,
              modes: [{ ai: "kite", keep: [80, 110], dur: [3, 4], attacks: [{ type: "summon", cd: 6, spawn: "runner", count: 2, max: 5, countScale: true }] },
                      { ai: "strafe", keep: [85, 105], dur: [2, 3], attacks: [{ type: "shoot", cd: 1.6, count: 2, spread: 0.4, speed: 90, dmg: 1 }] }] },
  turret:   { name: "포탑", hp: 8, speed: 0, radius: 6, color: "#fbc02d", kind: "poly", sides: 4, touch: 0, gold: [1, 2], goldChance: 0.4,
              modes: [{ ai: "static", dur: [3, 4], attacks: [{ type: "ring", cd: 2.4, count: 8, speed: 70, dmg: 1, countScale: true }] },
                      { ai: "static", dur: [3, 4], attacks: [{ type: "burst", cd: 1.8, rounds: 4, interval: 0.14, count: 1, speed: 105, dmg: 1 }] }] },
  // --- 돌진·근접·기동 계열 ---
  berserker:{ name: "광전사", hp: 8, speed: 36, radius: 7, color: "#c62828", kind: "star", sides: 4, touch: 1, rage: true, gold: [1, 2], goldChance: 0.45,
              modes: [{ ai: "chase", dur: [2.2, 3.2], attacks: [{ type: "charge", cd: 1.8, windup: 0.35, dur: 0.3, speed: 190, chain: 2, range: 120 }] },
                      { ai: "strafe", keep: [35, 50], dur: [1.2, 1.8] }] },
  lancer:   { name: "창기병", hp: 9, speed: 26, radius: 7, color: "#6d4c41", kind: "tri", touch: 1, gold: [2, 3], goldChance: 0.5,
              modes: [{ ai: "kite", keep: [90, 120], dur: [2.2, 3.2], attacks: [{ type: "charge", cd: 2.4, windup: 0.8, dur: 0.55, speed: 240, range: 200 }] },
                      { ai: "strafe", keep: [80, 100], dur: [1.5, 2.2] }] },
  jumper:   { name: "개구리", hp: 7, speed: 30, radius: 6, color: "#7cb342", kind: "circle", touch: 1, gold: [1, 2], goldChance: 0.4,
              modes: [{ ai: "hop", dur: [2.5, 3.5], attacks: [{ type: "leap", cd: 1.8, first: 0.6, windup: 0.5, radius: 24, dmg: 1, range: 150 }] },
                      { ai: "wander", dur: [1, 1.6] }] },
  biter:    { name: "늑대", hp: 5, speed: 56, radius: 5, color: "#9e9e9e", kind: "tri", touch: 1, gold: [1, 1], goldChance: 0.3,
              modes: [{ ai: "chase", dur: [1.6, 2.4] }, { ai: "flee", dur: [0.7, 1.1] }] },
  spinblade:{ name: "회전톱", hp: 10, speed: 70, radius: 7, color: "#b0bec5", kind: "poly", sides: 8, touch: 2, ai: "ricochet", resist: 0.3, gold: [2, 3], goldChance: 0.6 },
  bouncer:  { name: "튕김포", hp: 6, speed: 22, radius: 6, color: "#f48fb1", kind: "star", sides: 6, touch: 1, gold: [1, 2], goldChance: 0.45,
              modes: [{ ai: "strafe", keep: [70, 90], dur: [2.4, 3.4], attacks: [{ type: "shoot", cd: 2, count: 2, spread: 0.5, speed: 95, dmg: 1, bounce: 2 }] },
                      { ai: "kite", keep: [80, 110], dur: [1.6, 2.4], attacks: [{ type: "burst", cd: 2.4, rounds: 3, interval: 0.18, count: 1, speed: 100, dmg: 1, bounce: 2 }] }] },
  mortar:   { name: "박격포", hp: 6, speed: 20, radius: 6, color: "#ffb74d", kind: "poly", sides: 6, touch: 1, gold: [1, 2], goldChance: 0.45,
              modes: [{ ai: "kite", keep: [110, 150], dur: [3, 4], attacks: [{ type: "bombard", cd: 3, count: 2, radius: 22, delay: 1, dmg: 2 }] },
                      { ai: "flee", dur: [0.8, 1.2] }] },
  assassin: { name: "암살자", hp: 5, speed: 40, radius: 5, color: "#7e57c2", kind: "diamond", touch: 1, gold: [2, 3], goldChance: 0.5,
              modes: [{ ai: "wander", dur: [1.2, 1.8], attacks: [{ type: "teleport", cd: 3.2, first: 0.8, near: 42 }] },
                      { ai: "chase", dur: [1.4, 2], attacks: [{ type: "charge", cd: 1.2, windup: 0.3, dur: 0.2, speed: 210, range: 80 }] }] },
  // --- 보스가 만드는 것들 ---
  shieldorb:{ name: "보호 구체", hp: 3, speed: 0, radius: 4.5, color: "#ce93d8", kind: "circle", touch: 1, ai: "orbit", noDrop: true },
  crystal:  { name: "수정", hp: 14, speed: 0, radius: 8, color: "#4db6ac", kind: "diamond", touch: 0, ai: "static", resist: 1, noDrop: true,
              attacks: [{ type: "ring", cd: 4.2, first: 2.5, count: 6, speed: 55, dmg: 1, bounce: 1 }] },

  // ---------- 보스 (층마다 정해진 2종 중 하나가 나온다: BOSS_POOLS. 8층은 마왕 고정) ----------
  // 난이도 기준: 1층 슬라임 왕 = 보통. 같은 층의 보스는 비슷한 위협도(초당 탄 수·광역기·돌진·레이저·졸개를 합친 값)가 되도록 맞춰 둠 → 층이 오르면 calcScale이 점점 더 어렵게 만든다.
  // 무적 해제 방식: slimeKing·warlord=수호자 · knight=벽에 들이받게 하기 · witch=보호 구체 · golem=수정 · fortress·storm=시전 중 무적 · shade=주기적으로 비실체 · overlord=여러 방식 · 나머지는 보호막 없음
  slimeKing: { name: "슬라임 왕", boss: true, minFloor: 1, hp: 140, speed: 22, radius: 16, color: "#43a047", kind: "circle", touch: 2, ai: "chase", resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "ring", cd: 3.4, count: 10, speed: 65, dmg: 1, countScale: true, bounce: 1 }, { type: "burst", cd: 4, rounds: 3, interval: 0.25, count: 3, spread: 0.6, speed: 75, dmg: 1, bounce: 2 }, { type: "summon", cd: 7, spawn: "slime", count: 2, max: 4 }] },
      { at: 0.6, ai: "hop", enter: [{ type: "guard", spawn: "slimelet", count: 4, timeout: 24 }], attacks: [{ type: "ring", cd: 2.6, count: 14, speed: 70, dmg: 1, countScale: true, bounce: 1 }, { type: "leap", cd: 3.2, windup: 0.7, radius: 40, dmg: 2, range: 260 }, { type: "summon", cd: 5, spawn: "slimelet", count: 3, max: 8 }] },
      { at: 0.25, attacks: [{ type: "ringgap", cd: 2.6, count: 20, gap: 40, speed: 75, dmg: 1, countScale: true }, { type: "wall", cd: 6, gap: 46, speed: 70, dmg: 1 }, { type: "bombard", cd: 4, count: 3, radius: 24, delay: 0.9, dmg: 2 }, { type: "leap", cd: 2.8, windup: 0.6, radius: 40, dmg: 2, range: 260 }] }] },
  knight:    { name: "화염 기사", boss: true, hp: 150, speed: 36, radius: 13, color: "#ff7043", kind: "poly", sides: 6, touch: 2, ai: "chase", resist: 0.05, armor: "crash",
    phases: [
      { at: 1, attacks: [{ type: "charge", cd: 3.2, windup: 0.8, dur: 1.6, speed: 205, ram: true, range: 280 }, { type: "burst", cd: 2.4, rounds: 3, interval: 0.18, count: 3, spread: 0.55, speed: 105, dmg: 1, countScale: true }, { type: "shoot", cd: 3.4, count: 3, spread: 0.8, speed: 90, dmg: 1, bounce: 1 }, { type: "bombard", cd: 5, count: 2, radius: 24, delay: 1, dmg: 2 }] },
      { at: 0.6, attacks: [{ type: "charge", cd: 2.8, windup: 0.7, dur: 1.6, speed: 215, ram: true, range: 280 }, { type: "burst", cd: 2.2, rounds: 3, interval: 0.16, count: 5, spread: 0.85, speed: 110, dmg: 1, countScale: true }, { type: "bombard", cd: 4.2, count: 3, radius: 26, delay: 0.9, dmg: 2 }, { type: "ring", cd: 4.5, count: 12, speed: 80, dmg: 1, countScale: true, bounce: 1 }, { type: "wall", cd: 7, gap: 46, speed: 75, dmg: 1 }] },
      { at: 0.3, attacks: [{ type: "charge", cd: 2.4, windup: 0.6, dur: 1.6, speed: 230, ram: true, range: 300 }, { type: "burst", cd: 2, rounds: 4, interval: 0.15, count: 5, spread: 0.9, speed: 112, dmg: 1, countScale: true }, { type: "ringgap", cd: 3, count: 18, gap: 48, speed: 82, dmg: 1, countScale: true }, { type: "bombard", cd: 3.4, count: 4, radius: 26, delay: 0.8, dmg: 2 }, { type: "wall", cd: 5.5, gap: 44, speed: 78, dmg: 1 }] }] },
  clown:     { name: "광대 마술사", boss: true, hp: 140, speed: 30, radius: 11, color: "#f06292", kind: "star", sides: 6, touch: 2, ai: "kite", keep: [70, 100], resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "teleport", cd: 4.5, slam: true }, { type: "bombard", cd: 4, count: 3, radius: 24, delay: 1, dmg: 2 }, { type: "burst", cd: 2.6, rounds: 3, interval: 0.2, count: 3, spread: 0.6, speed: 90, dmg: 1, homing: 1.4 }, { type: "shoot", cd: 3, count: 3, spread: 0.6, speed: 92, dmg: 1, countScale: true }] },
      { at: 0.55, ai: "strafe", keep: [80, 110], attacks: [{ type: "orbs", cd: 7, count: 5, spin: 1.8, radius: 44, hold: 2.4, speed: 95 }, { type: "summon", cd: 7, spawn: "wisp", count: 2, max: 5 }, { type: "ringgap", cd: 3, count: 16, gap: 55, speed: 80, dmg: 1, countScale: true }, { type: "wall", cd: 7, gap: 46, speed: 72, dmg: 1 }] },
      { at: 0.25, attacks: [{ type: "teleport", cd: 3.4, slam: true }, { type: "bombard", cd: 3.4, count: 4, radius: 24, delay: 0.8, dmg: 2 }, { type: "spiral", cd: 5.5, dur: 2.2, rate: 9, step: 0.55, arms: 2, speed: 82, dmg: 1, countScale: true }, { type: "burst", cd: 3.4, rounds: 3, interval: 0.2, count: 2, spread: 0.5, speed: 90, dmg: 1, homing: 1.6 }] }] },
  witch:     { name: "마녀", boss: true, hp: 130, speed: 28, radius: 11, color: "#ab47bc", kind: "diamond", touch: 2, ai: "kite", keep: [90, 120], resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "orbs", cd: 6, count: 4, spin: 1.6, radius: 46, hold: 2.6, speed: 90 }, { type: "shoot", cd: 2.4, count: 5, spread: 0.9, speed: 92, dmg: 1, countScale: true }, { type: "burst", cd: 4, rounds: 3, interval: 0.3, count: 1, speed: 82, dmg: 1, homing: 1.6 }] },
      { at: 0.6, ai: "strafe", keep: [90, 120], enter: [{ type: "orbshield", count: 4, radius: 34, spin: 2, timeout: 26 }], attacks: [{ type: "spiral", cd: 6, dur: 2.4, rate: 9, step: 0.5, arms: 2, speed: 82, dmg: 1, countScale: true }, { type: "teleport", cd: 6, slam: true }, { type: "burst", cd: 4, rounds: 3, interval: 0.25, count: 2, spread: 0.7, speed: 88, dmg: 1, wave: [14, 5] }] },
      { at: 0.3, attacks: [{ type: "ring", cd: 3.6, count: 12, speed: 78, dmg: 1, countScale: true, bounce: 1 }, { type: "spiral", cd: 5.5, dur: 2.4, rate: 10, step: 0.6, arms: 2, speed: 86, dmg: 1, countScale: true }, { type: "burst", cd: 3.6, rounds: 4, interval: 0.22, count: 1, speed: 85, dmg: 1, homing: 2 }, { type: "wall", cd: 7, gap: 44, speed: 75, dmg: 1 }] }] },
  golem:     { name: "골렘 왕", boss: true, hp: 200, speed: 18, radius: 18, color: "#78909c", kind: "square", touch: 2, ai: "chase", resist: 0.6,
    phases: [
      { at: 1, attacks: [{ type: "slam", cd: 2.8, windup: 0.9, radius: 42, dmg: 2, range: 70 }, { type: "rain", cd: 5, dur: 3, rate: 7, speed: 85 }, { type: "leap", cd: 4.5, windup: 0.8, radius: 44, dmg: 2, range: 280 }, { type: "ring", cd: 4, count: 10, speed: 75, dmg: 1, countScale: true }] },
      { at: 0.6, enter: [{ type: "crystals", count: 4, timeout: 40 }], attacks: [{ type: "slam", cd: 2.4, windup: 0.8, radius: 52, dmg: 2, range: 80 }, { type: "ring", cd: 3, count: 16, speed: 82, dmg: 1, countScale: true, bounce: 1 }, { type: "leap", cd: 3.6, windup: 0.7, radius: 46, dmg: 2, range: 280 }, { type: "rain", cd: 6, dur: 3, rate: 8, speed: 88 }] },
      { at: 0.3, attacks: [{ type: "slam", cd: 2.4, windup: 0.8, radius: 52, dmg: 2, range: 80 }, { type: "bombard", cd: 3.4, count: 5, radius: 26, delay: 0.9, dmg: 2 }, { type: "rain", cd: 4, dur: 3.5, rate: 10, speed: 95 }, { type: "wall", cd: 5.5, gap: 46, speed: 75, dmg: 1 }, { type: "leap", cd: 3, windup: 0.6, radius: 46, dmg: 2, range: 280 }] }] },
  reaper:    { name: "사신", boss: true, hp: 170, speed: 40, radius: 12, color: "#455a64", kind: "poly", sides: 5, touch: 2, ai: "chase", resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "charge", cd: 2.8, windup: 0.5, dur: 0.5, speed: 225, chain: 2, range: 230 }, { type: "cross", cd: 6, spokes: 2, windup: 1.1, dur: 1.6, rot: 0.9, width: 7 }, { type: "burst", cd: 2.8, rounds: 3, interval: 0.22, count: 3, spread: 0.6, speed: 92, dmg: 1, homing: 1.4 }] },
      { at: 0.55, ai: "strafe", keep: [70, 100], attacks: [{ type: "cross", cd: 5.5, spokes: 4, windup: 1.1, dur: 1.8, rot: 1, width: 7 }, { type: "summon", cd: 6, spawn: "bomber", count: 3, max: 6 }, { type: "teleport", cd: 5, slam: true }, { type: "burst", cd: 2.6, rounds: 4, interval: 0.2, count: 3, spread: 0.7, speed: 95, dmg: 1 }, { type: "ring", cd: 4.5, count: 12, speed: 80, dmg: 1, countScale: true }] },
      { at: 0.25, attacks: [{ type: "burst", cd: 2.4, rounds: 4, interval: 0.18, count: 3, spread: 0.8, speed: 98, dmg: 1, homing: 1.2 }, { type: "spiral", cd: 5, dur: 2.2, rate: 11, step: 0.55, arms: 3, speed: 88, dmg: 1, countScale: true }, { type: "cross", cd: 5, spokes: 6, windup: 1, dur: 2, rot: 1.2, width: 7 }, { type: "teleport", cd: 3.5, slam: true }, { type: "charge", cd: 2.4, windup: 0.4, dur: 0.5, speed: 245, chain: 3, range: 260 }] }] },
  hive:      { name: "벌집 여왕", boss: true, hp: 150, speed: 20, radius: 15, color: "#fdd835", kind: "poly", sides: 6, touch: 2, ai: "kite", keep: [70, 110], resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "summon", cd: 6, spawn: "swarmer", count: 3, max: 8, countScale: true }, { type: "rain", cd: 6, dur: 2.5, rate: 7, speed: 88 }, { type: "shoot", cd: 2.6, count: 3, spread: 0.6, speed: 95, dmg: 1, countScale: true, wave: [14, 5] }] },
      { at: 0.55, ai: "strafe", keep: [80, 110], attacks: [{ type: "ringgap", cd: 3.2, count: 16, gap: 50, speed: 78, dmg: 1, countScale: true }, { type: "bombard", cd: 4.2, count: 3, radius: 22, delay: 0.9, dmg: 2 }, { type: "summon", cd: 6, spawn: "biter", count: 2, max: 4 }, { type: "burst", cd: 3.6, rounds: 3, interval: 0.25, count: 3, spread: 0.6, speed: 90, dmg: 1, wave: [16, 5] }] },
      { at: 0.25, attacks: [{ type: "rain", cd: 5, dur: 3, rate: 9, speed: 95 }, { type: "summon", cd: 5, spawn: "runner", count: 2, max: 5 }, { type: "spiral", cd: 5.5, dur: 2.2, rate: 10, step: 0.5, arms: 2, speed: 84, dmg: 1, countScale: true, wave: [10, 6] }, { type: "wall", cd: 6.5, gap: 42, speed: 78, dmg: 1 }] }] },
  fortress:  { name: "포탑 요새", boss: true, hp: 180, speed: 0, radius: 16, color: "#f9a825", kind: "poly", sides: 4, touch: 2, ai: "static", resist: 1,
    phases: [
      { at: 1, attacks: [{ type: "cross", cd: 7, spokes: 3, windup: 1.2, dur: 2, rot: 0.7, width: 7, shield: true }, { type: "ring", cd: 4, count: 10, speed: 72, dmg: 1, countScale: true, bounce: 1 }, { type: "bombard", cd: 4.5, count: 3, radius: 24, delay: 1, dmg: 2 }] },
      { at: 0.6, attacks: [{ type: "spiral", cd: 5, dur: 3, rate: 10, step: 0.5, arms: 2, speed: 82, dmg: 1, countScale: true, shield: true }, { type: "cross", cd: 7, spokes: 4, windup: 1.1, dur: 2, rot: 1, width: 7, shield: true }, { type: "burst", cd: 3, rounds: 3, interval: 0.18, count: 3, spread: 0.6, speed: 100, dmg: 1 }] },
      { at: 0.3, attacks: [{ type: "cross", cd: 6, spokes: 4, windup: 1, dur: 2.2, rot: 1.2, width: 7, shield: true }, { type: "ringgap", cd: 3.4, count: 18, gap: 45, speed: 82, dmg: 1, countScale: true }, { type: "bombard", cd: 3.6, count: 4, radius: 24, delay: 0.8, dmg: 2 }, { type: "wall", cd: 6, gap: 42, speed: 78, dmg: 1 }] }] },
  frostGiant: { name: "서리 거인", boss: true, hp: 220, speed: 20, radius: 19, color: "#4fc3f7", kind: "square", touch: 2, ai: "chase", resist: 0.6,
    phases: [
      { at: 1, attacks: [{ type: "slam", cd: 3, windup: 0.9, radius: 46, dmg: 2, range: 80 }, { type: "shoot", cd: 2.4, count: 5, spread: 0.8, speed: 88, dmg: 1, countScale: true, bounce: 1 }, { type: "leap", cd: 4.5, windup: 0.8, radius: 46, dmg: 2, range: 290 }] },
      { at: 0.6, attacks: [{ type: "rain", cd: 5, dur: 3, rate: 9, speed: 92 }, { type: "slam", cd: 2.6, windup: 0.8, radius: 56, dmg: 2, range: 90 }, { type: "ringgap", cd: 3.2, count: 18, gap: 50, speed: 82, dmg: 1, countScale: true }, { type: "wall", cd: 6, gap: 46, speed: 76, dmg: 1 }] },
      { at: 0.3, attacks: [{ type: "bombard", cd: 3.4, count: 5, radius: 26, delay: 0.9, dmg: 2 }, { type: "slam", cd: 2.6, windup: 0.8, radius: 56, dmg: 2, range: 90 }, { type: "wall", cd: 5, gap: 40, speed: 80, dmg: 1 }, { type: "burst", cd: 3, rounds: 3, interval: 0.25, count: 5, spread: 1, speed: 92, dmg: 1, bounce: 3 }, { type: "ring", cd: 3.5, count: 14, speed: 80, dmg: 1, countScale: true, bounce: 1 }, { type: "leap", cd: 4, windup: 0.7, radius: 46, dmg: 2, range: 290 }] }] },
  hydra:     { name: "히드라", boss: true, hp: 200, speed: 26, radius: 16, color: "#26a69a", kind: "poly", sides: 7, touch: 2, ai: "chase", resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "spiral", cd: 6, dur: 2.2, rate: 9, step: 0.5, arms: 2, speed: 82, dmg: 1, countScale: true }, { type: "shoot", cd: 2.6, count: 5, spread: 1.2, speed: 92, dmg: 1, countScale: true }, { type: "burst", cd: 4, rounds: 3, interval: 0.22, count: 3, spread: 0.5, speed: 98, dmg: 1 }] },
      { at: 0.6, ai: "strafe", keep: [60, 90], attacks: [{ type: "spiral", cd: 5.5, dur: 2.4, rate: 10, step: -0.6, arms: 2, speed: 88, dmg: 1, countScale: true }, { type: "ring", cd: 3.6, count: 12, speed: 82, dmg: 1, countScale: true, bounce: 1 }, { type: "charge", cd: 3.6, windup: 0.6, dur: 0.5, speed: 215, chain: 2, range: 230 }] },
      { at: 0.3, attacks: [{ type: "spiral", cd: 5, dur: 2.6, rate: 11, step: 0.65, arms: 3, speed: 90, dmg: 1, countScale: true }, { type: "ringgap", cd: 3.4, count: 16, gap: 45, speed: 86, dmg: 1, countScale: true }, { type: "burst", cd: 3.6, rounds: 3, interval: 0.2, count: 3, spread: 0.7, speed: 98, dmg: 1, homing: 1.4 }, { type: "leap", cd: 4, windup: 0.6, radius: 44, dmg: 2, range: 270 }] }] },
  // --- 6~7층 보스 (새로 추가) ---
  warlord:   { name: "전쟁군주", boss: true, hp: 190, speed: 28, radius: 16, color: "#8d6e63", kind: "poly", sides: 5, touch: 2, ai: "chase", resist: 0.3,
    phases: [
      { at: 1, attacks: [{ type: "charge", cd: 3, windup: 0.6, dur: 0.5, speed: 215, chain: 2, range: 240 }, { type: "shoot", cd: 2.4, count: 5, spread: 0.9, speed: 95, dmg: 1, countScale: true }, { type: "leap", cd: 5, windup: 0.7, radius: 42, dmg: 2, range: 280 }, { type: "burst", cd: 3.4, rounds: 3, interval: 0.2, count: 2, spread: 0.5, speed: 100, dmg: 1 }] },
      { at: 0.6, enter: [{ type: "guard", spawn: "berserker", count: 3, timeout: 26 }], attacks: [{ type: "charge", cd: 3, windup: 0.55, dur: 0.5, speed: 225, chain: 3, range: 250 }, { type: "leap", cd: 3.6, windup: 0.65, radius: 44, dmg: 2, range: 280 }, { type: "ring", cd: 3.6, count: 12, speed: 82, dmg: 1, countScale: true, bounce: 1 }, { type: "wall", cd: 7, gap: 46, speed: 76, dmg: 1 }] },
      { at: 0.28, attacks: [{ type: "slam", cd: 2.6, windup: 0.75, radius: 50, dmg: 2, range: 85 }, { type: "leap", cd: 3, windup: 0.6, radius: 46, dmg: 2, range: 290 }, { type: "charge", cd: 2.6, windup: 0.5, dur: 0.5, speed: 235, chain: 3, range: 260 }, { type: "ringgap", cd: 3, count: 16, gap: 46, speed: 86, dmg: 1, countScale: true }, { type: "bombard", cd: 4, count: 4, radius: 26, delay: 0.85, dmg: 2 }] }] },
  spider:    { name: "독거미", boss: true, hp: 150, speed: 36, radius: 13, color: "#5d4037", kind: "star", sides: 8, touch: 2, ai: "strafe", keep: [60, 90], resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "burst", cd: 2.6, rounds: 3, interval: 0.2, count: 2, spread: 0.5, speed: 98, dmg: 1, bounce: 2 }, { type: "summon", cd: 6, spawn: "biter", count: 2, max: 5 }, { type: "shoot", cd: 2.6, count: 3, spread: 0.7, speed: 92, dmg: 1, countScale: true, wave: [14, 5] }, { type: "leap", cd: 5, windup: 0.6, radius: 36, dmg: 2, range: 260 }] },
      { at: 0.6, attacks: [{ type: "ring", cd: 3.2, count: 12, speed: 82, dmg: 1, countScale: true, bounce: 2 }, { type: "wall", cd: 7, gap: 46, speed: 76, dmg: 1 }, { type: "summon", cd: 6, spawn: "swarmer", count: 3, max: 8 }, { type: "leap", cd: 3.6, windup: 0.55, radius: 38, dmg: 2, range: 260 }, { type: "burst", cd: 3.4, rounds: 3, interval: 0.22, count: 2, spread: 0.6, speed: 96, dmg: 1, homing: 1.3 }] },
      { at: 0.28, attacks: [{ type: "spiral", cd: 5.5, dur: 2.2, rate: 10, step: 0.55, arms: 2, speed: 86, dmg: 1, countScale: true, wave: [10, 6] }, { type: "bombard", cd: 3.8, count: 4, radius: 24, delay: 0.85, dmg: 2 }, { type: "leap", cd: 2.8, windup: 0.5, radius: 38, dmg: 2, range: 270 }, { type: "wall", cd: 5, gap: 42, speed: 80, dmg: 1 }, { type: "burst", cd: 3.4, rounds: 3, interval: 0.2, count: 3, spread: 0.7, speed: 98, dmg: 1, bounce: 2 }] }] },
  storm:     { name: "폭풍 정령", boss: true, hp: 140, speed: 30, radius: 12, color: "#4fc3f7", kind: "diamond", touch: 2, ai: "kite", keep: [80, 110], resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "cross", cd: 6, spokes: 2, windup: 1.1, dur: 1.6, rot: 0.9, width: 7, shield: true }, { type: "burst", cd: 2.8, rounds: 3, interval: 0.2, count: 2, spread: 0.5, speed: 95, dmg: 1, homing: 1.5 }, { type: "shoot", cd: 2.6, count: 3, spread: 0.7, speed: 92, dmg: 1, countScale: true, wave: [14, 5] }] },
      { at: 0.6, ai: "strafe", keep: [80, 110], attacks: [{ type: "cross", cd: 6, spokes: 4, windup: 1.1, dur: 1.8, rot: 1, width: 7, shield: true }, { type: "teleport", cd: 5, slam: true }, { type: "burst", cd: 3, rounds: 3, interval: 0.2, count: 3, spread: 0.7, speed: 96, dmg: 1, wave: [14, 5] }, { type: "rain", cd: 6, dur: 2.5, rate: 8, speed: 90 }] },
      { at: 0.28, attacks: [{ type: "cross", cd: 5.5, spokes: 6, windup: 1, dur: 2, rot: 1.2, width: 7, shield: true }, { type: "spiral", cd: 5.5, dur: 2.2, rate: 10, step: 0.55, arms: 2, speed: 86, dmg: 1, countScale: true }, { type: "bombard", cd: 3.6, count: 4, radius: 24, delay: 0.8, dmg: 2 }, { type: "wall", cd: 6, gap: 42, speed: 80, dmg: 1 }] }] },
  shade:     { name: "그림자 군주", boss: true, hp: 150, speed: 32, radius: 12, color: "#6a1b9a", kind: "poly", sides: 6, touch: 2, ai: "chase", phasing: true, resist: 0.05,
    phases: [
      { at: 1, attacks: [{ type: "teleport", cd: 4.5, slam: true }, { type: "burst", cd: 2.8, rounds: 3, interval: 0.2, count: 3, spread: 0.6, speed: 92, dmg: 1, homing: 1.5 }, { type: "orbs", cd: 7, count: 4, spin: 1.8, radius: 44, hold: 2.4, speed: 92 }, { type: "shoot", cd: 3, count: 3, spread: 0.7, speed: 92, dmg: 1, countScale: true }] },
      { at: 0.6, ai: "strafe", keep: [70, 100], attacks: [{ type: "spiral", cd: 5.5, dur: 2.2, rate: 10, step: 0.55, arms: 2, speed: 86, dmg: 1, countScale: true }, { type: "summon", cd: 7, spawn: "ghost", count: 2, max: 4 }, { type: "teleport", cd: 3.8, slam: true }, { type: "ringgap", cd: 3.2, count: 16, gap: 50, speed: 82, dmg: 1, countScale: true }] },
      { at: 0.28, attacks: [{ type: "bombard", cd: 3.4, count: 5, radius: 24, delay: 0.8, dmg: 2 }, { type: "orbs", cd: 6, count: 6, spin: -2, radius: 48, hold: 2.4, speed: 95 }, { type: "burst", cd: 3.2, rounds: 4, interval: 0.2, count: 3, spread: 0.7, speed: 98, dmg: 1, homing: 1.6 }, { type: "wall", cd: 6, gap: 42, speed: 80, dmg: 1 }, { type: "teleport", cd: 3.2, slam: true }] }] },
  // 8층 최종 보스: 여러 단계에서 서로 다른 무적 해제 방식을 쓴다
  overlord:  { name: "마왕", boss: true, final: true, hp: 420, speed: 30, radius: 20, color: "#d32f2f", kind: "poly", sides: 7, touch: 2, ai: "chase", resist: 0.1,
    phases: [
      { at: 1, attacks: [{ type: "ring", cd: 3, count: 14, speed: 78, dmg: 1, countScale: true, bounce: 1 }, { type: "shoot", cd: 2, count: 5, spread: 0.8, speed: 104, dmg: 1, countScale: true }, { type: "summon", cd: 8, spawn: "biter", count: 3, max: 6 }, { type: "bombard", cd: 4.5, count: 3, radius: 24, delay: 1, dmg: 2 }] },
      { at: 0.72, enter: [{ type: "guard", spawn: "shieldbearer", count: 3, timeout: 28 }], attacks: [{ type: "spiral", cd: 4, dur: 3, rate: 16, step: 0.6, arms: 3, speed: 92, dmg: 1, countScale: true }, { type: "charge", cd: 2.8, windup: 0.5, dur: 0.5, speed: 230, chain: 3, range: 250 }, { type: "slam", cd: 3.2, windup: 0.8, radius: 45, dmg: 2, range: 80 }, { type: "burst", cd: 3, rounds: 4, interval: 0.2, count: 3, spread: 0.7, speed: 100, dmg: 1, homing: 1.2 }] },
      { at: 0.46, ai: "strafe", keep: [70, 100], enter: [{ type: "orbshield", count: 6, radius: 42, spin: -2.4, timeout: 30 }], attacks: [{ type: "cross", cd: 6, spokes: 4, windup: 1, dur: 2.2, rot: 1.1, width: 7 }, { type: "ringgap", cd: 2.8, count: 22, gap: 42, speed: 90, dmg: 1, countScale: true }, { type: "teleport", cd: 5, slam: true }, { type: "wall", cd: 5.5, gap: 42, speed: 80, dmg: 1 }] },
      { at: 0.22, enter: [{ type: "crystals", count: 4, timeout: 40 }], attacks: [{ type: "ring", cd: 2.2, count: 20, speed: 92, dmg: 1, countScale: true, bounce: 1 }, { type: "spiral", cd: 3.2, dur: 3, rate: 20, step: 0.7, arms: 4, speed: 96, dmg: 1, countScale: true }, { type: "cross", cd: 5, spokes: 6, windup: 0.9, dur: 2.2, rot: 1.3, width: 7 }, { type: "burst", cd: 2.8, rounds: 5, interval: 0.18, count: 3, spread: 0.8, speed: 104, dmg: 1, homing: 1.4 }] }] },
};
// 일반 방에 나오는 적: [종류, 처음 나오는 층, 가중치]
const ENEMY_POOL = [
  ["grunt", 1, 10], ["runner", 1, 6], ["slime", 1, 5], ["swarmer", 1, 4], ["biter", 1, 3],
  ["shooter", 2, 5], ["charger", 2, 4], ["brute", 2, 3], ["jumper", 2, 3], ["berserker", 2, 3],
  ["spreader", 3, 4], ["bomber", 3, 4], ["wisp", 3, 4], ["spearman", 3, 3], ["bouncer", 3, 3], ["spinblade", 3, 2],
  ["tank", 4, 3], ["spinner", 4, 3], ["shieldbearer", 4, 3], ["healer", 4, 2], ["lancer", 4, 3], ["mortar", 4, 2],
  ["summoner", 5, 2], ["sniper", 5, 3], ["ghost", 5, 3], ["turret", 5, 2], ["assassin", 5, 3],
];
const pickEnemyType = floor => {
  const pool = ENEMY_POOL.filter(p => p[1] <= floor);
  let r = Math.random() * pool.reduce((a, p) => a + p[2], 0);
  for (const p of pool) if ((r -= p[2]) < 0) return p[0];
  return "grunt";
};
// 보스: 층마다 정해진 2종 중 하나가 나온다 (같은 층의 보스는 난이도가 비슷하게 맞춰져 있다). 8층은 마왕 고정.
const BOSS_POOLS = { 1: ["slimeKing", "knight"], 2: ["clown", "hive"], 3: ["witch", "reaper"], 4: ["golem", "fortress"], 5: ["frostGiant", "hydra"], 6: ["warlord", "spider"], 7: ["storm", "shade"] };
const pickBoss = (floor, used) => {
  if (floor >= MAX_FLOOR) return "overlord";
  const pool = BOSS_POOLS[floor] || BOSS_POOLS[1];
  return pool[Math.floor(Math.random() * pool.length)];
};
const SHIELD_NAMES = { guard: "수호자", orb: "보호 구체", crystal: "수정", armor: "갑옷", cast: "시전 중", phase: "비실체" };

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
const rr = (r) => Array.isArray(r) ? r[0] + Math.random() * (r[1] - r[0]) : r;

class Enemy extends Component {
  // opts: { delay, elite, parent, guardOf, orbit:{r,w,a0}, }
  constructor(game, type, opts = {}) {
    super();
    const def = ENEMY_DEFS[type];
    this.game = game; this.def = def; this.type = type; this.title = def.name; this.boss = !!def.boss;
    this.elite = !!opts.elite; this.parent = opts.parent || null; this.guardOf = opts.guardOf || null; this.orbitOpt = opts.orbit || null;
    this.sc = calcScale(game.floorNum, Math.max(1, game.heroes.length), this.elite, this.boss, game.difficulty);
    this.radius = def.radius * (this.elite ? BALANCE.eliteRadius : 1);
    this.hp = this.maxHp = Math.max(1, Math.round(def.hp * this.sc.hp));
    this.speed = def.speed * this.sc.speed; this.touch = (def.touch || 0) ? this._dm(def.touch) : 0;
    this.color = def.color; this.resist = def.resist || 0;
    this.spawnDelay = opts.delay ?? 0.7; this.kx = 0; this.ky = 0; this.t = Math.random() * 6;
    this.dead = false; this.busy = null; this.fuse = 0; this.face = 0; this.lift = 0;
    this.burn = null; this.slowT = 0; this.slowMul = 1; this.stunT = 0;       // 상태이상 (아이템 효과)
    this.invuln = false; this.shieldKind = ""; this.guardT = 0; this.crashT = 0; this.crashStun = 0; this.ethereal = false; this.alpha = 1; this.phT = Math.random() * 4; // 무적/보호막/유령
    this.strafeDir = Math.random() < 0.5 ? 1 : -1; this.strafeT = 0; this.wanderT = 0; this.wp = null; this.rv = null; this.raged = false;
    this.ai = def.ai || "chase"; this.keep = def.keep || [60, 90]; this.atk = []; this.pendingEnter = null; this.modeIdx = -1; this.modeT = 99; this.phaseIdx = -1;
    if (def.phases) this._enterPhase(0); else this._enterMode(0);
  }
  _phases() { return this.def.phases; }
  _buildAtk(list) { return (list || []).map(d => ({ d, cd: d.first ?? d.cd * (0.5 + Math.random() * 0.5) })); }
  _enterPhase(i) {
    const ph = this.def.phases[i]; this.phaseIdx = i; this.busy = null;
    this.ai = ph.ai || this.def.ai || "chase"; this.keep = ph.keep || this.def.keep || [60, 90];
    this.atk = this._buildAtk(ph.attacks); this.pendingEnter = ph.enter ? ph.enter.slice() : null;
  }
  _enterMode(i) { // 일반 적: 행동 모드(움직임 + 공격 묶음) 전환
    const modes = this.def.modes;
    if (!modes) { this.atk = this._buildAtk(this.def.attacks); this.modeT = 99; return; }
    this.modeIdx = i; const m = modes[i];
    this.ai = m.ai; this.keep = m.keep || this.def.keep || [60, 90]; this.atk = this._buildAtk(m.attacks); this.modeT = rr(m.dur || [3, 4]);
    this.strafeDir = Math.random() < 0.5 ? 1 : -1; this.wp = null;
  }
  setup() {
    this.draw = this.gameObject.addComponent(new DrawRenderer((ctx, r) => this._draw(ctx, r), this.radius + 80, { order: 4 }));
  }
  _dm(n) { return Math.max(1, Math.min(n + this.sc.dmgAdd, this.sc.dmgCap)); } // 층 보정 + 난이도 상한이 반영된 적의 피해
  _count(d, key = "count") { return Math.round(d[key] + (d.countScale ? this.sc.countAdd : 0)); }
  // 아이템 효과(화상·둔화·기절). 보스는 기절 면역.
  applyStatus(stats, by) {
    if (stats.burn > 0) this.burn = { t: 3, dps: 2 * stats.burn, by, tick: 0.5 };
    if (stats.slow > 0) { this.slowT = 2.5; this.slowMul = 0.5; }
    if (stats.stunChance > 0 && !this.boss && Math.random() < stats.stunChance) { this.stunT = 0.8; this.busy = null; }
  }
  // 탄 옵션(튕김·유도·물결) 묶음
  _bopts(d) { const o = {}; if (d.bounce) o.bounces = d.bounce; if (d.homing) o.homing = d.homing; if (d.wave) o.wave = d.wave; return o; }
  _fire(d, aim, dmg, spd, count) { // 조준 탄 한 번 (count발 부채꼴)
    const g = this.game, p = this.transform.position, spread = d.spread || 0, o = this._bopts(d);
    for (let i = 0; i < count; i++) g.spawnProj(p.x, p.y, aim + (count > 1 ? (i - (count - 1) / 2) * (spread / (count - 1)) : 0), spd, dmg, false, o);
    SFX.play("eshoot");
  }

  _draw(ctx, r) {
    const rad = this.radius;
    if (this.spawnDelay > 0) { // 등장 예고
      ctx.strokeStyle = this.color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, rad * (1 + this.spawnDelay * 0.6), 0, 7); ctx.stroke();
      ctx.fillStyle = this.color; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(0, 0, rad, 0, 7); ctx.fill();
      return;
    }
    const b = this.busy, p0 = this.transform.position;
    if (b && (b.phase === "wind" || b.type === "cross" || b.type === "wall")) { // 공격 예고
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.t * 30); ctx.fillStyle = "#ff1744"; ctx.strokeStyle = "#ff1744";
      if (b.type === "slam") { ctx.beginPath(); ctx.arc(0, 0, b.d.radius, 0, 7); ctx.fill(); }
      else if (b.type === "charge") { ctx.lineWidth = b.d.ram ? 6 : 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(b.dir) * (b.d.ram ? 160 : 90), Math.sin(b.dir) * (b.d.ram ? 160 : 90)); ctx.stroke(); }
      else if (b.type === "leap") { ctx.beginPath(); ctx.arc(b.tx - p0.x, b.ty - p0.y, b.d.radius, 0, 7); ctx.fill(); ctx.strokeStyle = "#ff1744"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(b.tx - p0.x, b.ty - p0.y); ctx.stroke(); }
      else if (b.type === "wall" && b.phase === "wind") { // 안전한 틈이 어디인지 보여 준다
        ctx.globalAlpha = 0.5; const hw = ARENA.w / 2, hh = ARENA.h / 2, v = b.side === "N" || b.side === "S", len = v ? ARENA.w : ARENA.h, e = b.side === "N" ? hh : b.side === "S" ? -hh : b.side === "E" ? hw : -hw;
        const seg = (a0, a1, col) => { ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.beginPath(); if (v) { ctx.moveTo(a0 - p0.x, e - p0.y); ctx.lineTo(a1 - p0.x, e - p0.y); } else { ctx.moveTo(e - p0.x, a0 - p0.y); ctx.lineTo(e - p0.x, a1 - p0.y); } ctx.stroke(); };
        seg(-len / 2, b.gc - b.gap / 2, "#ff1744"); seg(b.gc + b.gap / 2, len / 2, "#ff1744"); seg(b.gc - b.gap / 2, b.gc + b.gap / 2, "#69f0ae");
      }
      else if (b.type === "cross") {
        const on = b.phase === "on"; ctx.globalAlpha = on ? 0.9 : 0.35 + 0.2 * Math.sin(this.t * 30); ctx.lineWidth = on ? b.d.width : 1.5; ctx.strokeStyle = on ? "#ff5252" : "#ff1744";
        for (let k = 0; k < b.n; k++) { const a = b.ang + k * Math.PI * 2 / b.n; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 320, Math.sin(a) * 320); ctx.stroke(); }
        if (on) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; for (let k = 0; k < b.n; k++) { const a = b.ang + k * Math.PI * 2 / b.n; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 320, Math.sin(a) * 320); ctx.stroke(); } }
      }
      ctx.globalAlpha = this.draw.opacity;
    }
    if (this.lift > 0) { ctx.fillStyle = "#0006"; ctx.beginPath(); ctx.ellipse(0, -2, rad * 0.9, rad * 0.35, 0, 0, 7); ctx.fill(); ctx.translate(0, this.lift); } // 도약 중: 그림자 + 떠 있음
    const flash = r.flash > 0 || (this.fuse > 0 && Math.floor(this.fuse * 14) % 2);
    ctx.fillStyle = flash ? "#fff" : (this.raged ? "#ff1744" : this.color);
    ctx.beginPath();
    const k = this.def.kind;
    if (k === "circle") ctx.arc(0, 0, rad, 0, 7);
    else if (k === "diamond") { ctx.moveTo(rad, 0); ctx.lineTo(0, rad); ctx.lineTo(-rad, 0); ctx.lineTo(0, -rad); ctx.closePath(); }
    else if (k === "tri") { const a = this.face; for (let i = 0; i < 3; i++) ctx.lineTo(Math.cos(a + i * 2.094) * rad * 1.15, Math.sin(a + i * 2.094) * rad * 1.15); ctx.closePath(); }
    else if (k === "poly") { const n = this.def.sides || 6, sp = this.ai === "ricochet" ? 9 : 0.8; for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n + this.t * sp; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } ctx.closePath(); }
    else if (k === "star") { const n = this.def.sides || 5; for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n + this.t * 0.6, rr2 = i % 2 ? rad * 0.5 : rad; ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } ctx.closePath(); }
    else if (k === "cross") { const w = rad * 0.38; ctx.rect(-w, -rad, w * 2, rad * 2); ctx.rect(-rad, -w, rad * 2, w * 2); }
    else ctx.rect(-rad, -rad, rad * 2, rad * 2);
    ctx.fill();
    if (this.def.frontGuard) { ctx.strokeStyle = "#e0e0e0"; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, 0, rad + 2, this.face - 0.9, this.face + 0.9); ctx.stroke(); }
    if (this.burn) { ctx.strokeStyle = "#ff6d00"; ctx.lineWidth = 1.6; ctx.stroke(); }
    else if (this.slowT > 0) { ctx.strokeStyle = "#4fc3f7"; ctx.lineWidth = 1.6; ctx.stroke(); }
    if (this.stunT > 0 || this.crashStun > 0) { ctx.fillStyle = "#fff59d"; ctx.fillRect(-1.5, -rad - 6, 3, 3); ctx.fillRect(-rad * 0.6, -rad - 4, 3, 3); ctx.fillRect(rad * 0.6 - 3, -rad - 4, 3, 3); }
    if (this.elite) { ctx.strokeStyle = "#ffd54f"; ctx.lineWidth = 1.6; ctx.stroke(); ctx.fillStyle = "#ffd54f"; ctx.fillRect(-2, rad + 5, 4, 3); }
    if (this.invuln) { // 보호막: 보스마다 해제 방식이 다르다
      const col = { guard: "#80deea", orb: "#ce93d8", crystal: "#4db6ac", armor: "#cfd8dc", cast: "#fff59d" }[this.shieldKind] || "#80deea";
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(this.t * 8);
      ctx.beginPath(); ctx.arc(0, 0, rad + 5, 0, 7); ctx.stroke(); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(0, 0, rad + 9, this.t, this.t + 5); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = this.draw.opacity;
      if (this.shieldKind === "crystal" || this.shieldKind === "orb") { // 보호 대상과 연결선
        ctx.lineWidth = 1; ctx.globalAlpha = 0.45;
        for (const e of this.game.enemies) if (e.guardOf === this && !e.dead) { const ep = e.transform.position; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ep.x - p0.x, ep.y - p0.y); ctx.stroke(); }
        ctx.globalAlpha = this.draw.opacity;
      }
    }
    if (this.crashT > 0) { ctx.fillStyle = "#ffd54f"; ctx.globalAlpha = 0.8; for (let i = 0; i < 3; i++) { const a = this.t * 6 + i * 2.09; ctx.fillRect(Math.cos(a) * (rad + 4) - 1.5, Math.sin(a) * (rad + 4) - 1.5, 3, 3); } ctx.globalAlpha = this.draw.opacity; } // 갑옷이 깨진 동안 반짝임
    ctx.fillStyle = "#000"; const e = Math.max(1.5, rad * 0.22); ctx.fillRect(-rad * 0.45, rad * 0.1, e, e); ctx.fillRect(rad * 0.2, rad * 0.1, e, e);
    if (!this.boss && this.maxHp > 8 && this.hp < this.maxHp) {
      ctx.fillStyle = "#000a"; ctx.fillRect(-rad, rad + 3, rad * 2, 2);
      ctx.fillStyle = "#e53935"; ctx.fillRect(-rad, rad + 3, rad * 2 * this.hp / this.maxHp, 2);
    }
  }

  // ---------- 움직임 ----------
  // 현재 행동(ai)에 따른 목표 속도. 폭탄병이 터지면 null.
  _moveAI(dt, a, td, target, sp) {
    const p = this.transform.position, c = Math.cos(a), s = Math.sin(a);
    switch (this.ai) {
      case "static": return [0, 0];
      case "kite": { const [n, f] = this.keep; const m = td > f ? 1 : td < n ? -1 : 0; return [c * sp * m, s * sp * m]; }
      case "strafe": { // 목표 주위를 빙빙 돈다 (거리를 keep 범위로 유지)
        this.strafeT -= dt; if (this.strafeT <= 0) { this.strafeT = 1.2 + Math.random() * 1.6; if (Math.random() < 0.55) this.strafeDir *= -1; }
        const [n, f] = this.keep, mid = (n + f) / 2, radial = td > f ? 1 : td < n ? -1 : (td - mid) / (f - n + 1) * -0.4;
        return [(c * radial - s * this.strafeDir * 0.9) * sp, (s * radial + c * this.strafeDir * 0.9) * sp];
      }
      case "zigzag": { const w = Math.sin(this.t * 4) * 0.9; return [(c - s * w) * sp, (s + c * w) * sp]; }
      case "flee": return [-c * sp * 1.15, -s * sp * 1.15];
      case "hop": { const ph = this.t % 0.9; return ph < 0.5 ? [c * sp * 1.9, s * sp * 1.9] : [0, 0]; } // 껑충껑충
      case "wander": { // 방 안을 무작위로 돌아다닌다
        this.wanderT -= dt;
        if (!this.wp || this.wanderT <= 0 || Math.hypot(this.wp[0] - p.x, this.wp[1] - p.y) < 8) { this.wanderT = 1.2 + Math.random() * 1.5; const [x, y] = this._rand(); this.wp = [x, y]; }
        const dx = this.wp[0] - p.x, dy = this.wp[1] - p.y, d = Math.hypot(dx, dy) || 1; return [dx / d * sp, dy / d * sp];
      }
      case "ricochet": { // 직선으로 달리다 벽·장애물에 튕긴다 (튕김 처리는 update 끝)
        if (!this.rv) { const aa = a + (Math.random() - 0.5) * 1.2; this.rv = [Math.cos(aa), Math.sin(aa)]; }
        return [this.rv[0] * sp, this.rv[1] * sp];
      }
      case "orbit": { // 보스 주위를 도는 보호 구체
        const o = this.orbitOpt, ctr = this.guardOf; if (!o || !ctr || ctr.dead || ctr.gameObject.isDestroyed) { this.die(null, true); return null; }
        const cp = ctr.transform.position, ang = o.a0 + o.w * this.t; this.transform.setPosition(cp.x + Math.cos(ang) * o.r, cp.y + Math.sin(ang) * o.r); return [0, 0];
      }
      case "bomber":
        if (this.fuse > 0) { this.fuse -= dt; if (this.fuse <= 0) { this._explode(); return null; } return [0, 0]; }
        if (td < this.radius + 14) this.fuse = 0.6;
        return [c * sp, s * sp];
      default: return [c * sp, s * sp]; // chase
    }
  }
  _rand() { const cells = ARENA.cells, cl = cells[Math.floor(Math.random() * cells.length)]; return [cl.x + (Math.random() * 2 - 1) * (ARENA.BASE_W / 2 - 25), cl.y + (Math.random() * 2 - 1) * (ARENA.BASE_H / 2 - 25)]; }
  _clampPos(x, y, m = 10) { return [Math.max(-ARENA.w / 2 + m, Math.min(ARENA.w / 2 - m, x)), Math.max(-ARENA.h / 2 + m, Math.min(ARENA.h / 2 - m, y))]; }

  update(dt) {
    if (this.spawnDelay > 0) { this.spawnDelay -= dt; return; }
    this.t += dt;
    const g = this.game, def = this.def;
    let p = this.transform.position;
    if (this.burn) { // 화상: 0.5초마다 피해
      this.burn.t -= dt; this.burn.tick -= dt;
      if (this.burn.tick <= 0) { this.burn.tick = 0.5; g.fx.emit(p.x, p.y, { count: 3, colors: ["#ff6d00", "#ffee58"], speed: [10, 30], life: [0.2, 0.4], size: [1, 1.6], fade: true }); this.damage(this.burn.dps * 0.5, this.burn.by, 0, 0); if (this.dead) return; }
      if (this.burn && this.burn.t <= 0) this.burn = null;
    }
    if (this.slowT > 0) this.slowT -= dt;
    const stunned = this.stunT > 0; if (stunned) this.stunT -= dt;
    if (this.crashStun > 0) this.crashStun -= dt;
    const slow = this.slowT > 0 ? this.slowMul : 1;
    if (def.phasing) { this.phT += dt; this.ethereal = (this.phT % 4) > 2.6; }
    if (def.rage && !this.raged && this.hp / this.maxHp < 0.5) { this.raged = true; this.speed *= 1.5; } // 광전사: 체력 절반 이하면 빨개지고 빨라짐
    // ---- 보호막 상태 ----
    if (this.guardT > 0) {
      this.guardT -= dt;
      if (!g.enemies.some(e => e.guardOf === this && !e.dead && !e.gameObject.isDestroyed)) { this.guardT = 0; g.toast(`${this.title}의 보호막이 사라졌다!`, 1.8); SFX.play("clear"); }
      else if (this.guardT <= 0) { g.toast(`${this.title}의 보호막이 시간이 다 돼 사라졌다`, 1.5); }
    }
    if (this.crashT > 0) { this.crashT -= dt; if (this.crashT <= 0) { g.toast(`${this.title}의 갑옷이 다시 단단해졌다`, 1.5); } }
    const armorUp = def.armor === "crash" && this.crashT <= 0, casting = !!(this.busy && this.busy.d && this.busy.d.shield);
    this.invuln = this.guardT > 0 || armorUp || casting;
    this.shieldKind = this.guardT > 0 ? (this.guardKind || "guard") : armorUp ? "armor" : casting ? "cast" : "";
    this.draw.opacity = this.alpha * (this.ethereal ? 0.35 : 1);
    if (this.boss) { const next = def.phases[this.phaseIdx + 1]; if (next && this.hp / this.maxHp <= next.at) { this._enterPhase(this.phaseIdx + 1); g.cam.shake(4, 0.4); g.toast(`${this.title} 격노!`, 1.5); SFX.play("boom"); } }
    else if (def.modes && !this.busy && (this.modeT -= dt) <= 0) { const n = def.modes.length; this._enterMode(n > 2 ? (this.modeIdx + 1 + Math.floor(Math.random() * (n - 1))) % n : (this.modeIdx + 1) % n); }
    let target = null, td = Infinity;
    for (const h of g.heroes) { if (!h.alive) continue; const hp = h.transform.position, d = Math.hypot(hp.x - p.x, hp.y - p.y); if (d < td) { td = d; target = h; } }
    let vx = 0, vy = 0;
    if (target) {
      const tp = target.transform.position, a = Math.atan2(tp.y - p.y, tp.x - p.x);
      if (!this.busy) this.face = a;
      const sp = this.speed * slow;
      if (this.pendingEnter && !this.busy) { const list = this.pendingEnter; this.pendingEnter = null; for (const d of list) this._begin({ d, cd: 0 }, a, target); }
      if (stunned || this.crashStun > 0) { vx = vy = 0; }
      else if (this.busy) [vx, vy] = this._runBusy(dt, a, target);
      else {
        const mv = this._moveAI(dt, a, td, target, sp); if (mv === null) return; [vx, vy] = mv;
        if (this.avoidT > 0 && (this.ai === "chase" || this.ai === "zigzag" || this.ai === "hop" || this.ai === "wander")) { // 장애물에 막혔을 땐 잠깐 옆으로 돌아간다
          this.avoidT -= dt; const pa = a + Math.PI / 2 * this.avoidSign; vx += Math.cos(pa) * sp * 0.9; vy += Math.sin(pa) * sp * 0.9;
        }
        if (!this.ethereal) for (const at of this.atk) {
          at.cd -= dt * this.sc.rate * slow;
          if (at.cd <= 0 && td <= (at.d.range ?? Infinity)) { this._begin(at, a, target); if (this.busy) break; }
        }
      }
      if (this.touch && !this.ethereal && this.lift <= 0 && td < this.radius + 6) target.hit(this.touch, p.x, p.y, 130);
    }
    for (const o of g.enemies) { // 겹치지 않게 밀어내기
      if (o === this || o.spawnDelay > 0 || this.ai === "orbit" || o.ai === "orbit") continue;
      const op = o.transform.position, dx = p.x - op.x, dy = p.y - op.y, d = Math.hypot(dx, dy), min = this.radius + o.radius;
      if (d > 0 && d < min) { vx += dx / d * 40; vy += dy / d * 40; }
    }
    vx += this.kx; vy += this.ky; this.kx *= Math.max(0, 1 - 8 * dt); this.ky *= Math.max(0, 1 - 8 * dt);
    // 막힘 감지: 거의 못 움직이면 우회 방향을 반대로
    this._chkT = (this._chkT || 0) + dt; p = this.transform.position;
    if (this._chkT >= 0.6) {
      if (this._cx !== undefined && target && !this.busy && !stunned && this.speed > 0 && (this.ai === "chase" || this.ai === "zigzag" || this.ai === "hop" || this.ai === "wander") && Math.hypot(p.x - this._cx, p.y - this._cy) < this.speed * slow * 0.6 * 0.25) { this.avoidSign = -(this.avoidSign || 1); this.avoidT = 1.4; }
      this._cx = p.x; this._cy = p.y; this._chkT = 0;
    }
    let nx = p.x + vx * dt, ny = p.y + vy * dt, blocked = false;
    if (this.ai !== "orbit" && g.obstacles.length) { // 지형지물에 막힌다. 막히면 잠깐 옆으로 돌아간다
      const [px, py, bl] = g.pushOut(nx, ny, this.radius); blocked = bl;
      if (bl && (vx || vy)) { this.avoidT = 0.6; if (!this.avoidSign) this.avoidSign = Math.random() < 0.5 ? 1 : -1; }
      nx = px; ny = py;
    }
    const cx = Math.max(-ARENA.w / 2 + this.radius, Math.min(ARENA.w / 2 - this.radius, nx)), cy = Math.max(-ARENA.h / 2 + this.radius, Math.min(ARENA.h / 2 - this.radius, ny));
    const wallHit = blocked || Math.abs(cx - nx) > 0.001 || Math.abs(cy - ny) > 0.001;
    const rawX = p.x + vx * dt, rawY = p.y + vy * dt;
    this.transform.setPosition(cx, cy);
    if (this.ai === "ricochet" && this.rv && wallHit) { // 튕기기: 보정이 일어난 축의 방향을 뒤집는다
      if (Math.abs(cx - rawX) > 0.05) this.rv[0] = (cx - rawX) > 0 ? Math.abs(this.rv[0]) : -Math.abs(this.rv[0]);
      if (Math.abs(cy - rawY) > 0.05) this.rv[1] = (cy - rawY) > 0 ? Math.abs(this.rv[1]) : -Math.abs(this.rv[1]);
      SFX.play("block");
    }
    const b = this.busy; if (b && b.type === "charge" && b.phase === "dash" && b.d.ram && wallHit && b.t < b.d.dur - 0.15) this._crash(); // 돌진이 벽·장애물에 부딪힘
  }
  _crash() { // 갑옷이 깨진다
    const g = this.game, p = this.transform.position;
    this.busy = null; this.crashStun = 1.6; if (this.def.armor === "crash") { this.crashT = 6; this.invuln = false; this.shieldKind = ""; g.toast(`${this.title}의 갑옷이 깨졌다! 지금이 기회`, 2); }
    g.fx.emit(p.x, p.y, { count: 22, colors: ["#fff59d", "#ffb74d", "#fff"], speed: [40, 120], life: [0.25, 0.55], size: [1, 2.6], fade: true }); g.cam.shake(5, 0.35); SFX.play("boom");
    for (const at of this.atk) at.cd = Math.max(at.cd, 1.2);
  }

  // ---- 공격 패턴 ----
  _begin(at, aim, target) {
    const d = at.d, g = this.game, p = this.transform.position, sc = this.sc;
    const dmg = this._dm(d.dmg || 1), spd = (d.speed || 80) * sc.speed, bo = this._bopts(d);
    switch (d.type) {
      case "shoot": this._fire(d, aim, dmg, spd, this._count(d)); at.cd = d.cd; break;
      case "burst": this.busy = { type: "burst", d, at, phase: "run", left: d.rounds, acc: 0, dmg, spd }; break;
      case "ring": {
        const n = this._count(d), off = Math.random() * 6;
        for (let i = 0; i < n; i++) g.spawnProj(p.x, p.y, off + i * Math.PI * 2 / n, spd, dmg, false, bo);
        g.cam.shake(1.5, 0.15); SFX.play("eshoot"); at.cd = d.cd; break;
      }
      case "ringgap": {
        const n = this._count(d), gap = (d.gap || 40) * Math.PI / 180, off = Math.random() * 6;
        for (let i = 0; i < n; i++) { const a = off + i * Math.PI * 2 / n; if (angleDiff(a, aim) > gap / 2) g.spawnProj(p.x, p.y, a, spd, dmg, false, bo); }
        g.cam.shake(1.5, 0.15); SFX.play("eshoot"); at.cd = d.cd; break;
      }
      case "spiral": this.busy = { type: "spiral", d, at, phase: "run", t: d.dur, acc: 0, base: Math.random() * 6, dmg, spd }; break;
      case "rain": this.busy = { type: "rain", d, at, phase: "run", t: d.dur, acc: 0, dmg, spd }; SFX.play("warn"); break;
      case "charge": this.busy = { type: "charge", d, at, phase: "wind", t: d.windup, dir: aim, left: d.chain || 1 }; SFX.play("warn"); break;
      case "slam": this.busy = { type: "slam", d, at, phase: "wind", t: d.windup }; SFX.play("warn"); break;
      case "leap": this.busy = { type: "leap", d, at, phase: "wind", t: d.windup || 0.6, tx: target.transform.position.x, ty: target.transform.position.y }; SFX.play("warn"); break;
      case "wall": { // 한쪽 벽에서 밀려오는 탄의 벽: 틈을 찾아 피한다
        const side = ["N", "S", "E", "W"][Math.floor(Math.random() * 4)], v = side === "N" || side === "S", len = v ? ARENA.w : ARENA.h, gap = d.gap || 44;
        this.busy = { type: "wall", d, at, phase: "wind", t: 0.8, side, gap, gc: (Math.random() * 2 - 1) * (len / 2 - gap), dmg, spd }; SFX.play("warn"); break;
      }
      case "cross": this.busy = { type: "cross", d, at, phase: "wind", t: d.windup, ang: Math.random() * 6, n: Math.min(8, Math.round(d.spokes + (d.countScale ? sc.countAdd : 0))), dmg }; SFX.play("warn"); break;
      case "teleport": this.busy = { type: "teleport", d, at, phase: "vanish", t: 0.35 }; break;
      case "orbs": {
        const n = this._count(d), a0 = Math.random() * 6;
        for (let i = 0; i < n; i++) g.spawnProj(p.x, p.y, 0, 0, dmg, false, { orbit: { center: this, a0: a0 + i * Math.PI * 2 / n, w: d.spin || 1.6, r0: 12, r1: d.radius || 46, t: 0, hold: d.hold || 2.5, speed: spd } });
        at.cd = d.cd; break;
      }
      case "bombard": {
        const n = this._count(d), alive = g.heroes.filter(h => h.alive); if (!alive.length) break;
        for (let i = 0; i < n; i++) { const h = alive[i % alive.length].transform.position, [x, y] = this._clampPos(h.x + (Math.random() - 0.5) * (i < alive.length ? 10 : 70), h.y + (Math.random() - 0.5) * (i < alive.length ? 10 : 70), 12); g.spawnHazard(x, y, d.radius || 24, d.delay || 0.9, this._dm(d.dmg || 2)); }
        SFX.play("warn"); at.cd = d.cd; break;
      }
      case "summon": {
        const mine = g.enemies.filter(e => e.parent === this).length, n = Math.min(this._count(d), Math.max(0, d.max - mine));
        for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, [x, y] = this._clampPos(p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24); g.spawnEnemy(d.spawn, x, y, { delay: 0.5, parent: this }); }
        at.cd = d.cd; break;
      }
      case "guard": { // 수호자 소환 + 본체 무적 (수호자를 모두 처치하면 해제)
        const n = this._count(d);
        for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n + 0.5, [x, y] = this._clampPos(p.x + Math.cos(a) * (this.radius + 36), p.y + Math.sin(a) * (this.radius + 36), 12); g.spawnEnemy(d.spawn, x, y, { delay: 0.6, guardOf: this, parent: this }); }
        this.guardT = d.timeout || 25; this.guardKind = "guard"; this.invuln = true; this.shieldKind = "guard"; g.toast(`${this.title}이(가) 수호자를 불렀다! 모두 처치하라`, 2.5); SFX.play("warn"); at.cd = d.cd || 99; break;
      }
      case "orbshield": { // 보스 주위를 도는 보호 구체: 전부 부수면 해제 (닿으면 아프다)
        const n = this._count(d), a0 = Math.random() * 6;
        for (let i = 0; i < n; i++) g.spawnEnemy("shieldorb", p.x, p.y, { delay: 0.3, guardOf: this, parent: this, orbit: { r: this.radius + (d.radius || 34), w: d.spin || 2, a0: a0 + i * Math.PI * 2 / n } });
        this.guardT = d.timeout || 26; this.guardKind = "orb"; this.invuln = true; this.shieldKind = "orb"; g.toast(`${this.title}이(가) 구체로 몸을 감쌌다! 도는 구체를 부숴라`, 2.5); SFX.play("warn"); at.cd = d.cd || 99; break;
      }
      case "crystals": { // 방 모서리에 수정이 솟아남: 전부 파괴하면 해제
        const n = Math.min(4, this._count(d)), hw = ARENA.w / 2 - 45, hh = ARENA.h / 2 - 38, spots = [[-hw, hh], [hw, hh], [-hw, -hh], [hw, -hh]];
        for (let i = 0; i < n; i++) { const [x, y] = spots[i]; g.spawnEnemy("crystal", x, y, { delay: 0.6, guardOf: this, parent: this }); }
        this.guardT = d.timeout || 40; this.guardKind = "crystal"; this.invuln = true; this.shieldKind = "crystal"; g.toast(`${this.title}이(가) 수정과 연결됐다! 수정을 모두 파괴하라`, 2.5); SFX.play("warn"); at.cd = d.cd || 99; break;
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
    if (b.type !== "burst") b.t -= dt;
    if (b.type === "burst") { // 연속 사격: 매 발마다 다시 조준
      b.acc -= dt;
      if (b.acc <= 0) { this._fire(d, aim, b.dmg, b.spd, this._count(d)); b.left--; b.acc = d.interval || 0.2; if (b.left <= 0) { b.at.cd = d.cd; this.busy = null; } }
      return [0, 0];
    }
    if (b.type === "spiral") {
      const arms = Math.min(BALANCE.maxArms, Math.round(d.arms + (d.countScale ? sc.countAdd : 0))), interval = 1 / (d.rate * sc.rate), bo = this._bopts(d);
      b.acc += dt;
      while (b.acc >= interval) { b.acc -= interval; b.base += d.step; for (let i = 0; i < arms; i++) g.spawnProj(p.x, p.y, b.base + i * Math.PI * 2 / arms, b.spd, b.dmg, false, bo); }
      if (b.t <= 0) { b.at.cd = d.cd; this.busy = null; }
      return d.shield ? [0, 0] : [Math.cos(aim) * this.speed * 0.3, Math.sin(aim) * this.speed * 0.3];
    }
    if (b.type === "rain") { // 위에서 쏟아지는 탄
      const interval = 1 / (d.rate * sc.rate); b.acc += dt;
      while (b.acc >= interval) { b.acc -= interval; const cl = ARENA.cells[Math.floor(Math.random() * ARENA.cells.length)]; g.spawnProj(cl.x + (Math.random() * 2 - 1) * (ARENA.BASE_W / 2 - 8), ARENA.h / 2 + 6, -Math.PI / 2 + (Math.random() - 0.5) * 0.2, b.spd, b.dmg, false); }
      if (b.t <= 0) { b.at.cd = d.cd; this.busy = null; }
      return [Math.cos(aim) * this.speed * 0.4, Math.sin(aim) * this.speed * 0.4];
    }
    if (b.type === "wall") { // 탄의 벽: 예고 후 한쪽 벽에서 반대쪽으로 쓸고 간다 (안전한 틈이 있다)
      if (b.phase === "wind") {
        if (b.t <= 0) {
          const sp = d.spacing || 13, v = b.side === "N" || b.side === "S", len = v ? ARENA.w : ARENA.h, hw = ARENA.w / 2, hh = ARENA.h / 2, bo = this._bopts(d);
          const ang = { N: -Math.PI / 2, S: Math.PI / 2, E: Math.PI, W: 0 }[b.side];
          for (let u = -len / 2 + 4; u <= len / 2 - 4; u += sp) { if (Math.abs(u - b.gc) < b.gap / 2) continue; const x = v ? u : { E: hw, W: -hw }[b.side], y = v ? { N: hh, S: -hh }[b.side] : u; g.spawnProj(x, y, ang, b.spd, b.dmg, false, bo); }
          g.cam.shake(2, 0.2); SFX.play("boom"); b.at.cd = d.cd; this.busy = null;
        }
      }
      return [0, 0];
    }
    if (b.type === "charge") {
      if (b.phase === "wind") { b.dir = b.left === (d.chain || 1) ? b.dir : aim; if (b.t <= 0) { b.phase = "dash"; b.t = d.dur; } return [0, 0]; }
      if (b.t <= 0) {
        if (--b.left > 0) { b.phase = "wind"; b.t = d.windup * 0.6; b.dir = aim; SFX.play("warn"); return [0, 0]; } // 연속 돌진
        b.at.cd = d.cd; this.busy = null; return [0, 0];
      }
      const s = d.speed * sc.speed; return [Math.cos(b.dir) * s, Math.sin(b.dir) * s];
    }
    if (b.type === "leap") { // 도약: 예고(플레이어를 따라가다 마지막에 고정) → 날아가서 착지 충격파
      if (b.phase === "wind") {
        if (b.t > 0.25) { const tp = target.transform.position; b.tx += (tp.x - b.tx) * Math.min(1, dt * 3); b.ty += (tp.y - b.ty) * Math.min(1, dt * 3); }
        if (b.t <= 0) { b.phase = "air"; b.t = 0.5; b.sx = p.x; b.sy = p.y; [b.tx, b.ty] = this._clampPos(b.tx, b.ty, this.radius + 2); }
        return [0, 0];
      }
      const k = Math.min(1, 1 - b.t / 0.5), e = k * k * (3 - 2 * k); this.lift = Math.sin(Math.PI * k) * 14;
      this.transform.setPosition(b.sx + (b.tx - b.sx) * e, b.sy + (b.ty - b.sy) * e);
      if (b.t <= 0) {
        this.lift = 0; const q = this.transform.position;
        for (const h of g.heroes) { const hp = h.transform.position; if (h.alive && Math.hypot(hp.x - q.x, hp.y - q.y) < d.radius + h.radius) h.hit(this._dm(d.dmg || 1), q.x, q.y, 200); }
        g.fx.emit(q.x, q.y, { count: 26, colors: [this.color, "#fff"], speed: [50, 140], life: [0.2, 0.45], size: [1, 2.4], fade: true, area: d.radius * 0.4 }); g.cam.shake(3, 0.2); SFX.play("boom");
        b.at.cd = d.cd; this.busy = null;
      }
      return [0, 0];
    }
    if (b.type === "slam") {
      if (b.t <= 0) {
        for (const h of g.heroes) { const hp = h.transform.position; if (h.alive && Math.hypot(hp.x - p.x, hp.y - p.y) < d.radius + h.radius) h.hit(this._dm(d.dmg || 2), p.x, p.y, 200); }
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
        for (let k = 0; k < b.n; k++) { const a = b.ang + k * Math.PI * 2 / b.n, along = dx * Math.cos(a) + dy * Math.sin(a), perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)); if (along > 0 && perp < d.width / 2 + h.radius) { h.hit(this._dm(1), p.x, p.y, 100); break; } }
      }
      if (b.t <= 0) { b.at.cd = d.cd; this.busy = null; }
      return [0, 0];
    }
    if (b.type === "teleport") {
      if (b.phase === "vanish") {
        this.alpha = Math.max(0, b.t / 0.35); this.ethereal = true;
        if (b.t <= 0) {
          const tp = target.transform.position, a = Math.random() * 6.28, nr = d.near || 55, [x, y] = this._clampPos(tp.x + Math.cos(a) * nr, tp.y + Math.sin(a) * nr, this.radius + 4);
          this.transform.setPosition(x, y); b.phase = "appear"; b.t = 0.35;
          if (d.slam) g.spawnHazard(x, y, 30, 0.7, this._dm(2), "#ff4081");
        }
      } else { this.alpha = Math.min(1, 1 - b.t / 0.35); if (b.t <= 0) { this.alpha = 1; this.ethereal = false; b.at.cd = d.cd; this.busy = null; } }
      return [0, 0];
    }
    this.busy = null; return [0, 0];
  }
  _explode() {
    const g = this.game, p = this.transform.position, R = 30;
    for (const h of g.heroes) { const hp = h.transform.position; if (h.alive && Math.hypot(hp.x - p.x, hp.y - p.y) < R + h.radius) h.hit(this._dm(2), p.x, p.y, 220); }
    g.fx.emit(p.x, p.y, { count: 40, colors: ["#ff7043", "#ffee58", "#fff"], speed: [50, 150], life: [0.2, 0.5], size: [1.5, 3], fade: true, area: 10 });
    g.cam.shake(4, 0.25); SFX.play("boom"); this.die(null, true);
  }

  damage(n, by, angle, knock) {
    if (this.dead || this.spawnDelay > 0 || this.ethereal || this.lift > 4) return;
    const g = this.game, p = this.transform.position;
    if (this.invuln) { // 보호막: 피해 무효
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
    if (!this.boss && !quiet && !def.noDrop && (def.gold || bonus > 0) && (this.elite || Math.random() < ((def.goldChance ?? 0) + bonus) * BALANCE.coinRate)) {
      const [lo, hi] = def.gold || [1, 1];
      let n = (lo + Math.floor(Math.random() * (hi - lo + 1))) * (this.elite ? 2 : 1);
      if (Math.random() < g.partySum("coinDouble")) n *= 2; // 네잎 클로버
      if (this.elite) n += g.partySum("eliteGold"); // 황금 이빨
      if (g.partyAny("autoCoin")) { g.addGold(n); g.fx.emit(p.x, p.y, { count: 4, colors: ["#ffca28", "#fff"], speed: [10, 40], life: [0.2, 0.4], size: [1, 1.6], fade: true }); SFX.play("coin"); } // 도굴꾼 주머니: 바로 팀 골드로
      else g.spawnCoin(p.x, p.y, n);
    }
    if (by) by.kills++;
    Events.emit("enemy.killed", { enemy: this, by });
    this.gameObject.destroy();
  }
}

// 탄환. fromPlayer=true면 적을 맞춘다. 적 탄은 기본적으로 근접 공격으로만 지워진다.
// 옵션: pierce(관통) · life · radius · area(맞으면 폭발 반경) · boomerang · orbit(보스 주변을 도는 구체)
//       bounces(벽·장애물에 튕기는 횟수) · homing(유도 지속 초) · wave:[진폭,주파수](물결)
class Projectile extends Component {
  constructor(game, angle, speed, dmg, fromPlayer, opts = {}) {
    super();
    this.game = game; this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.dmg = dmg; this.fromPlayer = fromPlayer; this.life = opts.life ?? 5; this.radius = opts.radius ?? 3;
    this.pierce = !!opts.pierce; this.beam = !!opts.beam; this.hitSet = new Set(); this.angle = angle;
    this.owner = opts.owner || null; this.knock = opts.knock ?? 60; this.color = opts.color || "#fff59d"; this.kind = opts.kind || "";
    this.area = opts.area || 0; this.orbit = opts.orbit || null; this.speed = opts.speed || speed;
    this.bm = opts.boomerang ? { phase: "out", dist: 0, max: opts.range || 80 } : null;
    this.bounces = opts.bounces || 0; this.homing = opts.homing || 0; this.wave = opts.wave || null; this.age = 0; this.bx = null; this.by = null;
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
      // 적 탄: 특수 탄은 색으로 구분 (튕김=청록, 유도=보라, 물결=노랑)
      const col = this.fromPlayer ? "#fff59d" : this.homing && this.age < this.homing ? "#ce93d8" : this.bounces > 0 ? "#4dd0e1" : this.wave ? "#ffee58" : "#ff8a65";
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.45, 0, 7); ctx.fill();
    }, 14, { order: 6 }));
  }
  reflect(hero, dir) { this.fromPlayer = true; this.owner = hero; const s = Math.hypot(this.vx, this.vy) * 1.5; this.vx = Math.cos(dir) * s; this.vy = Math.sin(dir) * s; this.dmg = 3 * (1 + (hero.stats.reflect || 0)); this.life = 3; this.hitSet.clear(); this.bounces = 0; this.homing = 0; this.wave = null; this.bx = null; }
  _boom() { // 구체 폭발
    const g = this.game, q = this.transform.position;
    for (const e of g.enemies) { if (e.dead || e.spawnDelay > 0) continue; const ep = e.transform.position; if (Math.hypot(ep.x - q.x, ep.y - q.y) < this.area + e.radius) { e.damage(this.dmg, this.owner, Math.atan2(ep.y - q.y, ep.x - q.x), this.knock); if (this.owner) this.owner.applyHitEffects(e, this.dmg); } }
    g.fx.emit(q.x, q.y, { count: 14, colors: [this.color, "#fff"], speed: [30, 90], life: [0.15, 0.35], size: [1, 2.2], fade: true, area: this.area * 0.3 }); SFX.play("boom");
    this.gameObject.destroy();
  }
  update(dt) {
    const t = this.transform, p = t.position, g = this.game;
    this.life -= dt; this.age += dt;
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
    } else {
      if (this.homing && !this.fromPlayer && this.age < this.homing) { // 유도: 가장 가까운 플레이어 쪽으로 서서히 꺾임
        let best = null, bd = Infinity; for (const h of g.heroes) { if (!h.alive) continue; const hp = h.transform.position, d = Math.hypot(hp.x - p.x, hp.y - p.y); if (d < bd) { bd = d; best = hp; } }
        if (best) { const sp = Math.hypot(this.vx, this.vy), cur = Math.atan2(this.vy, this.vx), want = Math.atan2(best.y - p.y, best.x - p.x); let df = Math.atan2(Math.sin(want - cur), Math.cos(want - cur)); const na = cur + Math.max(-2.2 * dt, Math.min(2.2 * dt, df)); this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp; }
      }
      if (this.wave) { // 물결: 진행 방향의 수직으로 흔들리며 간다
        if (this.bx === null) { this.bx = p.x; this.by = p.y; this._pa = this.age; }
        this.bx += this.vx * dt; this.by += this.vy * dt; const sp = Math.hypot(this.vx, this.vy) || 1, nx = -this.vy / sp, ny = this.vx / sp, off = Math.sin((this.age - this._pa) * this.wave[1]) * this.wave[0];
        t.setPosition(this.bx + nx * off, this.by + ny * off);
      } else t.setPosition(p.x + this.vx * dt, p.y + this.vy * dt);
    }
    const q = t.position;
    if (this.life <= 0) { if (this.area && this.fromPlayer) this._boom(); else this.gameObject.destroy(); return; }
    const hw = ARENA.w / 2, hh = ARENA.h / 2;
    if (!this.bm && !this.orbit && this.bounces > 0 && !this.fromPlayer) { // 벽에 튕긴다
      let hit = false;
      if (q.x > hw || q.x < -hw) { this.vx = -this.vx; t.setPosition(Math.max(-hw, Math.min(hw, q.x)), q.y); hit = true; }
      if (q.y > hh || q.y < -hh) { this.vy = -this.vy; t.setPosition(q.x, Math.max(-hh, Math.min(hh, q.y))); hit = true; }
      if (hit) { this.bounces--; this.life = Math.max(this.life, 2.2); this.bx = null; this.homing = 0; }
    } else if (!this.bm && (Math.abs(q.x) > hw + 10 || Math.abs(q.y) > hh + 10)) { if (this.area && this.fromPlayer) this._boom(); else this.gameObject.destroy(); return; }
    if (!this.orbit && g.obstacles.length && (this.obsCd = (this.obsCd || 0) - dt) <= 0) { // 지형지물에 막힌다 (적 탄은 엄폐물에 막혀 사라지거나 튕기고, 내 탄은 상자·통을 부순다)
      const o = g.obstacleAt(q.x, q.y, this.radius);
      if (o) {
        if (this.fromPlayer) {
          if (o.destructible) o.damage(Math.max(1, Math.round(this.dmg / 2)), this.owner, !!this.area);
          if (this.bm) { if (this.bm.phase === "out") { this.bm.phase = "back"; this.hitSet.clear(); } this.obsCd = 0.25; }
          else if (this.area) { this._boom(); return; }
          else if (!(this.pierce && o.destructible)) { this.gameObject.destroy(); return; }
        } else if (this.bounces > 0) { // 장애물에 튕김
          const op = o.transform.position, dx = (q.x - op.x) / (o.w / 2 + this.radius), dy = (q.y - op.y) / (o.h / 2 + this.radius);
          if (Math.abs(dx) > Math.abs(dy)) this.vx = Math.abs(this.vx) * Math.sign(dx || 1); else this.vy = Math.abs(this.vy) * Math.sign(dy || 1);
          t.setPosition(q.x + this.vx * dt * 2, q.y + this.vy * dt * 2); this.bounces--; this.life = Math.max(this.life, 2.2); this.obsCd = 0.08; this.bx = null; this.homing = 0;
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
