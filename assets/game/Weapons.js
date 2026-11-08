// 근접 무기. 새 무기는 WEAPONS에 한 항목 추가하면 보상·상점에 자동으로 섞인다.
//  dmg 피해, range 사거리, arc 각도(도, 360=주변 전체), cd 공격 간격(초), delay 휘두르고 맞기까지, dur 궤적 표시 시간, knock 넉백
//  kind: arc(부채꼴 베기) | thrust(찌르기) | circle        color: 궤적 색(없으면 등급 색)
//  특수효과: hits(연타 수), burn{dps,dur}(화상), slow{mul,dur}(둔화), stun(기절 초), leech(N번 맞힐 때마다 HP+1)
const WEAPONS = {
  sword:   { name: "검",       dmg: 2,   range: 28, arc: 100, cd: 0.36, delay: 0.05, dur: 0.18, knock: 90,  kind: "arc", note: "균형형" },
  dagger:  { name: "단검",     dmg: 1,   range: 20, arc: 70,  cd: 0.15, delay: 0.02, dur: 0.10, knock: 35,  kind: "arc", note: "매우 빠름" },
  great:   { name: "대검",     dmg: 6,   range: 36, arc: 140, cd: 0.90, delay: 0.18, dur: 0.30, knock: 210, kind: "arc", note: "느리고 강함" },
  spear:   { name: "창",       dmg: 2,   range: 50, arc: 22,  cd: 0.48, delay: 0.07, dur: 0.20, knock: 110, kind: "thrust", note: "긴 사거리" },
  hammer:  { name: "망치",     dmg: 5,   range: 32, arc: 360, cd: 1.00, delay: 0.30, dur: 0.32, knock: 260, kind: "circle", note: "주변 전체" },
  scythe:  { name: "낫",       dmg: 3,   range: 32, arc: 200, cd: 0.62, delay: 0.10, dur: 0.24, knock: 130, kind: "arc", note: "넓은 각도" },
  twin:    { name: "쌍검",     dmg: 1.4, range: 24, arc: 90,  cd: 0.50, delay: 0.04, dur: 0.14, knock: 60,  kind: "arc", hits: 2, note: "2연타" },
  axe:     { name: "도끼",     dmg: 4,   range: 30, arc: 120, cd: 0.72, delay: 0.12, dur: 0.24, knock: 150, kind: "arc", note: "묵직한 한 방" },
  whip:    { name: "채찍",     dmg: 1.6, range: 62, arc: 36,  cd: 0.46, delay: 0.08, dur: 0.18, knock: 40,  kind: "thrust", note: "매우 긴 사거리" },
  rapier:  { name: "레이피어", dmg: 1.3, range: 42, arc: 18,  cd: 0.20, delay: 0.03, dur: 0.12, knock: 45,  kind: "thrust", note: "빠른 찌르기" },
  mace:    { name: "철퇴",     dmg: 3.2, range: 28, arc: 100, cd: 0.60, delay: 0.10, dur: 0.20, knock: 120, kind: "arc", stun: 0.9, note: "기절" },
  flame:   { name: "화염검",   dmg: 2,   range: 28, arc: 100, cd: 0.40, delay: 0.05, dur: 0.18, knock: 80,  kind: "arc", burn: { dps: 2, dur: 3 }, color: "#ff7043", note: "화상" },
  frost:   { name: "서리검",   dmg: 1.8, range: 28, arc: 100, cd: 0.40, delay: 0.05, dur: 0.18, knock: 60,  kind: "arc", slow: { mul: 0.5, dur: 2.5 }, color: "#4fc3f7", note: "둔화" },
  fang:    { name: "흡혈 단검", dmg: 1.1, range: 20, arc: 70,  cd: 0.17, delay: 0.02, dur: 0.10, knock: 35,  kind: "arc", leech: 8, color: "#ef5350", note: "8번 맞히면 HP+1" },
  halberd: { name: "미늘창",   dmg: 3,   range: 44, arc: 50,  cd: 0.66, delay: 0.10, dur: 0.22, knock: 140, kind: "arc", note: "긴 사거리+강함" },
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
