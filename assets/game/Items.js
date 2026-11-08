// 패시브 아이템. apply(hero)가 그 플레이어의 hero.stats만 바꾼다(플레이어별로 따로 적용). 새 아이템은 한 줄 추가하면 보물방·상점·보스 보상에 섞인다.
// stats: speed·atkSpeed·dmg·range·knock·dashCd·dashPower·gold·magnet·discount(배율), lifesteal·crit·dodge·execute·doubleSwing·coinDrop·heartDrop(확률),
//        thorns·beam·berserk·reflect·regen·roomHeal·roomGold(개수/정도), extraLives, invuln(피격 후 무적 추가 초), entryInvuln(방 입장 무적 추가 초), compass(bool)
const newStats = () => ({ speed: 1, atkSpeed: 1, dmg: 1, range: 1, knock: 1, dashCd: 1, dashPower: 1, gold: 1, magnet: 1, discount: 1,
  lifesteal: 0, crit: 0, dodge: 0, execute: 0, doubleSwing: 0, coinDrop: 0, heartDrop: 0,
  thorns: 0, beam: 0, berserk: 0, reflect: 0, regen: 0, roomHeal: 0, roomGold: 0, extraLives: 0, invuln: 0, entryInvuln: 0, compass: false });
// cat: 전투 / 체력 / 이동·유틸 / 골드
const ITEMS = {
  // ----- 전투 -----
  power:    { cat: "전투", name: "힘의 장갑",   desc: "공격력 +20%",                    price: 16, apply: h => { h.stats.dmg *= 1.2; } },
  haste:    { cat: "전투", name: "신속의 반지", desc: "공격 속도 +18%",                 price: 16, apply: h => { h.stats.atkSpeed *= 1.18; } },
  reach:    { cat: "전투", name: "장대",        desc: "사거리 +18%",                    price: 12, apply: h => { h.stats.range *= 1.18; } },
  knock:    { cat: "전투", name: "충격 장갑",   desc: "넉백 +40%",                      price: 10, apply: h => { h.stats.knock *= 1.4; } },
  crit:     { cat: "전투", name: "예리한 숫돌", desc: "치명타 +15% (피해 2배)",         price: 14, apply: h => { h.stats.crit += 0.15; } },
  beam:     { cat: "전투", name: "검기",        desc: "휘두를 때 검기 발사 (관통)",     price: 18, apply: h => { h.stats.beam += 1; } },
  vamp:     { cat: "전투", name: "흡혈 송곳니", desc: "적 처치 시 12% 확률로 HP +1",    price: 16, apply: h => { h.stats.lifesteal += 0.12; } },
  thorns:   { cat: "전투", name: "가시 갑옷",   desc: "맞으면 주변 적에게 피해·넉백",   price: 14, apply: h => { h.stats.thorns += 1; } },
  execute:  { cat: "전투", name: "처형자의 휘장", desc: "체력 15% 이하 일반 적 즉사",   price: 18, apply: h => { h.stats.execute += 0.15; } },
  echo:     { cat: "전투", name: "메아리 칼날", desc: "20% 확률로 한 번 더 휘두름",     price: 18, apply: h => { h.stats.doubleSwing += 0.2; } },
  berserk:  { cat: "전투", name: "광전사의 피", desc: "HP가 낮을수록 공격력 최대 +60%", price: 14, apply: h => { h.stats.berserk += 0.6; } },
  glass:    { cat: "전투", name: "유리 대포",   desc: "최대 HP -2, 공격력 +50%",        price: 10, apply: h => { h.maxHp = Math.max(2, h.maxHp - 2); h.hp = Math.min(h.hp, h.maxHp); h.stats.dmg *= 1.5; } },
  reflect:  { cat: "전투", name: "반사 방패",   desc: "튕겨낸 탄의 피해 2배",           price: 12, apply: h => { h.stats.reflect += 1; } },
  // ----- 체력 -----
  hp_up:    { cat: "체력", name: "체력의 심장", desc: "최대 HP +2 (HP 2 회복)",         price: 20, apply: h => { h.maxHp += 2; h.heal(2); } },
  potion:   { cat: "체력", name: "생명의 물약", desc: "최대 HP +1, HP 전부 회복",       price: 18, apply: h => { h.maxHp += 1; h.hp = h.maxHp; } },
  regen:    { cat: "체력", name: "재생의 반지", desc: "30초마다 HP +1 (중첩 시 빨라짐)", price: 18, apply: h => { h.stats.regen += 1; } },
  dodge:    { cat: "체력", name: "회피 부적",   desc: "15% 확률로 피해 무효",           price: 16, apply: h => { h.stats.dodge += 0.15; } },
  shield:   { cat: "체력", name: "수호 방패",   desc: "피격 후 무적 +0.5초",            price: 12, apply: h => { h.stats.invuln += 0.5; } },
  ankh:     { cat: "체력", name: "앙크",        desc: "죽으면 1회 부활",                price: 24, apply: h => { h.stats.extraLives += 1; } },
  clear_heal: { cat: "체력", name: "치유의 향로", desc: "방을 클리어할 때마다 HP +1",   price: 16, apply: h => { h.stats.roomHeal += 1; } },
  heartneck: { cat: "체력", name: "하트 목걸이", desc: "적 처치 시 하트 드랍 확률 +4%", price: 12, apply: h => { h.stats.heartDrop += 0.04; } },
  // ----- 이동·유틸 -----
  boots:    { cat: "유틸", name: "질주 신발",   desc: "이동 속도 +12%",                 price: 12, apply: h => { h.stats.speed *= 1.12; } },
  dashband: { cat: "유틸", name: "질풍의 띠",   desc: "대시 재사용 -30%",               price: 12, apply: h => { h.stats.dashCd *= 0.7; } },
  dashpow:  { cat: "유틸", name: "도약 장화",   desc: "대시 거리 +40%",                 price: 10, apply: h => { h.stats.dashPower *= 1.4; } },
  cloak:    { cat: "유틸", name: "투명 망토",   desc: "방에 들어갈 때 무적 +2.5초",     price: 12, apply: h => { h.stats.entryInvuln += 2.5; } },
  compass:  { cat: "유틸", name: "나침반",      desc: "미니맵에 층 전체가 보임 (파티 공유)", price: 14, apply: h => { h.stats.compass = true; } },
  magnet:   { cat: "유틸", name: "자석",        desc: "코인 끌어당기는 범위 2배",        price: 8,  apply: h => { h.stats.magnet *= 2; } },
  // ----- 골드 -----
  lucky:    { cat: "골드", name: "행운의 동전", desc: "획득 골드 +50%",                 price: 12, apply: h => { h.stats.gold *= 1.5; } },
  piggy:    { cat: "골드", name: "저금통",      desc: "방을 클리어할 때마다 +3G",       price: 12, apply: h => { h.stats.roomGold += 3; } },
  looter:   { cat: "골드", name: "도굴꾼 주머니", desc: "코인 드랍 확률 +20%p",         price: 12, apply: h => { h.stats.coinDrop += 0.2; } },
  haggler:  { cat: "골드", name: "상인의 안목", desc: "상점 가격 -25%",                 price: 14, apply: h => { h.stats.discount *= 0.75; } },
};
// exclude: 이미 뽑은 id 집합. 모자라면 중복을 허용한다.
const randomItemId = (exclude = new Set()) => {
  let ids = Object.keys(ITEMS).filter(id => !exclude.has(id));
  if (!ids.length) ids = Object.keys(ITEMS);
  return ids[Math.floor(Math.random() * ids.length)];
};
const weaponPrice = w => Math.round([12, 20, 30, 46, 70][w.tier] * (0.8 + WEAPONS[w.id].dmg * 0.08));
