// 근접 무기. arc: 휘두르는 각도(도), range: 닿는 거리, cd: 공격 간격(초), delay: 휘두르고 맞기까지(초), dur: 궤적이 보이는 시간
const WEAPONS = {
  sword:  { name: "검",   dmg: 2, range: 28, arc: 100, cd: 0.36, delay: 0.05, dur: 0.18, knock: 90,  kind: "arc" },
  dagger: { name: "단검", dmg: 1, range: 20, arc: 70,  cd: 0.15, delay: 0.02, dur: 0.10, knock: 35,  kind: "arc" },
  great:  { name: "대검", dmg: 6, range: 36, arc: 140, cd: 0.90, delay: 0.18, dur: 0.30, knock: 210, kind: "arc" },
  spear:  { name: "창",   dmg: 2, range: 50, arc: 22,  cd: 0.48, delay: 0.07, dur: 0.20, knock: 110, kind: "thrust" },
  hammer: { name: "망치", dmg: 5, range: 32, arc: 360, cd: 1.00, delay: 0.30, dur: 0.32, knock: 260, kind: "circle" },
  scythe: { name: "낫",   dmg: 3, range: 32, arc: 200, cd: 0.62, delay: 0.10, dur: 0.24, knock: 130, kind: "arc" },
};
const TIERS = [
  { name: "", mult: 1, color: "#e8e8e8" },
  { name: "희귀", mult: 1.4, color: "#4fc3f7" },
  { name: "영웅", mult: 1.9, color: "#ce93d8" },
];
const weaponLabel = w => (TIERS[w.tier].name ? `[${TIERS[w.tier].name}] ` : "") + WEAPONS[w.id].name;
const randomWeapon = (room, minTier = 0) => {
  const ids = Object.keys(WEAPONS);
  const r = Math.random() + room * 0.02;
  const tier = Math.max(minTier, r > 0.97 ? 2 : r > 0.7 ? 1 : 0);
  return { id: ids[Math.floor(Math.random() * ids.length)], tier };
};
