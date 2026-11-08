// 무기는 "사거리·범위·휘두르는 모양·데미지·공속"만 정한다. 화상·둔화 같은 부가 효과는 패시브 아이템(Items.js)에서 얻는다.
//  공통: dmg 피해, range 사거리, cd 공격 간격(초), delay 휘두르고/발사하고 맞기까지(초), knock 넉백,
//        move 공격하는 동안(휘두르는 시간 동안) 이동 속도 배율 (1이면 감속 없음. 무거운 무기일수록 작다)
//  근접: kind = arc(부채꼴 베기) | thrust(찌르기) | circle(주변 전체),  arc 범위 각도(도),  dur 궤적 표시 시간
//  원거리(ranged:true): kind = bolt(직선 탄) | pierce(관통 탄) | fan(부채꼴 산탄: count발, arc 범위 각도) | orb(느린 구체, 닿으면 area 반경 폭발) | boomerang(나갔다 돌아옴, 관통) | laser(즉시 직선: width 폭)
//                       speed 탄 속도,  count 한 번에 나가는 탄 수
const WEAPONS = {
  // ----- 근접 -----
  sword: { name: "검", dmg: 2.6, range: 28, arc: 100, cd: 0.34, delay: 0.05, dur: 0.18, knock: 90, move: 0.85, kind: "arc", note: "균형형" },
  dagger: { name: "단검", dmg: 1.3, range: 20, arc: 70, cd: 0.14, delay: 0.02, dur: 0.1, knock: 35, move: 0.95, kind: "arc", note: "매우 빠름" },
  great: { name: "대검", dmg: 8, range: 36, arc: 140, cd: 0.85, delay: 0.18, dur: 0.3, knock: 210, move: 0.6, kind: "arc", note: "느리고 강함" },
  spear: { name: "창", dmg: 2.8, range: 50, arc: 22, cd: 0.44, delay: 0.07, dur: 0.2, knock: 110, move: 0.85, kind: "thrust", note: "긴 사거리" },
  hammer: { name: "망치", dmg: 7, range: 32, arc: 360, cd: 0.95, delay: 0.3, dur: 0.32, knock: 260, move: 0.55, kind: "circle", note: "주변 전체" },
  scythe: { name: "낫", dmg: 3.8, range: 32, arc: 200, cd: 0.58, delay: 0.1, dur: 0.24, knock: 130, move: 0.8, kind: "arc", note: "넓은 각도" },
  axe: { name: "도끼", dmg: 5.2, range: 30, arc: 120, cd: 0.68, delay: 0.12, dur: 0.24, knock: 150, move: 0.7, kind: "arc", note: "묵직한 한 방" },
  whip: { name: "채찍", dmg: 2.2, range: 62, arc: 36, cd: 0.42, delay: 0.08, dur: 0.18, knock: 40, move: 0.9, kind: "thrust", note: "매우 긴 사거리" },
  rapier: { name: "레이피어", dmg: 1.7, range: 42, arc: 18, cd: 0.18, delay: 0.03, dur: 0.12, knock: 45, move: 0.9, kind: "thrust", note: "빠른 찌르기" },
  halberd: { name: "미늘창", dmg: 4, range: 44, arc: 50, cd: 0.62, delay: 0.1, dur: 0.22, knock: 140, move: 0.75, kind: "arc", note: "긴 사거리+강함" },
  mace: { name: "철퇴", dmg: 4.2, range: 28, arc: 100, cd: 0.56, delay: 0.1, dur: 0.2, knock: 160, move: 0.75, kind: "arc", note: "묵직한 타격" },
  // ----- 원거리 -----
  bow:       { name: "활",         ranged: true, kind: "bolt", move: 0.92,     dmg: 2.2, range: 130, speed: 230, cd: 0.50, delay: 0.06, knock: 50,  note: "직선 탄" },
  wand:      { name: "마법봉",     ranged: true, kind: "bolt", move: 0.92,     dmg: 1.1, range: 105, speed: 210, cd: 0.20, delay: 0.02, knock: 25,  note: "빠른 연사" },
  crossbow:  { name: "석궁",       ranged: true, kind: "pierce", move: 0.92,   dmg: 3,   range: 150, speed: 280, cd: 0.85, delay: 0.10, knock: 80,  note: "관통" },
  scatter:   { name: "산탄총",     ranged: true, kind: "fan", move: 0.92,      dmg: 1.1, range: 70,  speed: 200, cd: 0.95, delay: 0.08, knock: 70,  count: 5, arc: 44, note: "5발 산탄" },
  knives:    { name: "투척 단검",  ranged: true, kind: "fan", move: 0.92,      dmg: 1.2, range: 90,  speed: 240, cd: 0.45, delay: 0.04, knock: 40,  count: 3, arc: 20, note: "3발" },
  orbstaff:  { name: "구체 지팡이", ranged: true, kind: "orb", move: 0.92,      dmg: 3.2, range: 115, speed: 120, cd: 1.00, delay: 0.12, knock: 120, area: 24, note: "느린 폭발구" },
  boomerang: { name: "부메랑",     ranged: true, kind: "boomerang", move: 0.92, dmg: 2.4, range: 85,  speed: 200, cd: 0.75, delay: 0.06, knock: 60,  note: "돌아오며 관통" },
  chakram:   { name: "차크람",     ranged: true, kind: "boomerang", move: 0.92, dmg: 1.8, range: 65,  speed: 220, cd: 0.55, delay: 0.05, knock: 50,  note: "짧게 돌아옴" },
  laser:     { name: "광선총",     ranged: true, kind: "laser", move: 0.92,    dmg: 1.6, range: 140, width: 7,     cd: 0.50, delay: 0.05, knock: 30,  note: "즉시 직선" },
};
// 등급 5단계. mult는 피해 배율
const TIERS = [
  { name: "",     mult: 1,    color: "#e8e8e8" },
  { name: "고급", mult: 1.2,  color: "#81c784" },
  { name: "희귀", mult: 1.45, color: "#4fc3f7" },
  { name: "영웅", mult: 1.8,  color: "#ce93d8" },
  { name: "전설", mult: 2.4,  color: "#ffb74d" },
];
const weaponLabel = w => (TIERS[w.tier].name ? `[${TIERS[w.tier].name}] ` : "") + WEAPONS[w.id].name;
// room: 층 기반 값(클수록 좋은 등급이 잘 나온다), minTier: 이 등급 이상만
const randomWeapon = (room, minTier = 0) => {
  const ids = Object.keys(WEAPONS), f = Math.max(0, room - 4);
  const weights = [Math.max(10, 60 - 5 * f), 28, 8 + 1.5 * f, 2 + f, 0.4 * f].map((w, i) => (i < minTier ? 0 : w));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0), tier = minTier;
  for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) < 0) { tier = i; break; }
  return { id: ids[Math.floor(Math.random() * ids.length)], tier };
};
