// 패시브 아이템. apply(hero)가 hero.stats를 바꾼다. 새 아이템은 여기에 한 줄 추가하면 보물방·상점·보스 보상에 자동으로 섞인다.
// stats: speed·atkSpeed·dmg·range·knock·dashCd(배율), lifesteal·crit(확률), thorns, extraLives, gold(배율), beam(검기 개수), invuln(피격 후 무적 추가 초)
const newStats = () => ({ speed: 1, atkSpeed: 1, dmg: 1, range: 1, knock: 1, dashCd: 1, lifesteal: 0, crit: 0, thorns: 0, extraLives: 0, gold: 1, beam: 0, invuln: 0 });
const ITEMS = {
  hp_up:    { name: "체력의 심장", desc: "최대 HP +2 (HP 2 회복)", price: 20, apply: h => { h.maxHp += 2; h.heal(2); } },
  boots:    { name: "질주 신발",   desc: "이동 속도 +12%",         price: 12, apply: h => { h.stats.speed *= 1.12; } },
  haste:    { name: "신속의 반지", desc: "공격 속도 +18%",         price: 16, apply: h => { h.stats.atkSpeed *= 1.18; } },
  power:    { name: "힘의 장갑",   desc: "공격력 +20%",            price: 16, apply: h => { h.stats.dmg *= 1.2; } },
  reach:    { name: "장대",        desc: "사거리 +18%",            price: 12, apply: h => { h.stats.range *= 1.18; } },
  knock:    { name: "충격 장갑",   desc: "넉백 +40%",              price: 10, apply: h => { h.stats.knock *= 1.4; } },
  dashband: { name: "질풍의 띠",   desc: "대시 재사용 -30%",        price: 12, apply: h => { h.stats.dashCd *= 0.7; } },
  vamp:     { name: "흡혈 송곳니", desc: "적 처치 시 12% 확률로 HP +1", price: 16, apply: h => { h.stats.lifesteal += 0.12; } },
  thorns:   { name: "가시 갑옷",   desc: "맞으면 주변 적에게 피해·넉백", price: 14, apply: h => { h.stats.thorns += 1; } },
  ankh:     { name: "앙크",        desc: "죽으면 1회 부활",         price: 24, apply: h => { h.stats.extraLives += 1; } },
  lucky:    { name: "행운의 동전", desc: "획득 골드 +50%",         price: 12, apply: h => { h.stats.gold *= 1.5; } },
  crit:     { name: "예리한 숫돌", desc: "치명타 +15% (피해 2배)",  price: 14, apply: h => { h.stats.crit += 0.15; } },
  beam:     { name: "검기",        desc: "휘두를 때 검기를 발사",   price: 18, apply: h => { h.stats.beam += 1; } },
  shield:   { name: "수호 방패",   desc: "피격 후 무적 +0.5초",     price: 12, apply: h => { h.stats.invuln += 0.5; } },
};
// exclude: 이미 뽑은 id 집합. 모자라면 중복을 허용한다.
const randomItemId = (exclude = new Set()) => {
  let ids = Object.keys(ITEMS).filter(id => !exclude.has(id));
  if (!ids.length) ids = Object.keys(ITEMS);
  return ids[Math.floor(Math.random() * ids.length)];
};
const weaponPrice = w => Math.round([14, 26, 42][w.tier] * (0.8 + WEAPONS[w.id].dmg * 0.08));
