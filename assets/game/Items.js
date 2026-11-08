// 패시브 아이템. apply(hero)가 그 플레이어의 hero.stats만 바꾼다(플레이어별로 따로 적용). 새 아이템은 한 줄 추가하면 보물방·상점·보스 보상에 섞인다.
// tier(1~4)가 높을수록 비싸고 강하다 → 가격은 ITEM_PRICE[tier] (상점에서는 층이 오를수록 조금 더 비싸다).
// stats: speed·atkSpeed·dmg·range·knock·dashCd·dashPower·gold·magnet·discount(배율), lifesteal·crit·dodge·execute·doubleSwing·coinDrop·heartDrop·stunChance·roomHeal(확률),
//        thorns·beam·berserk·reflect·regen·roomGold·burn·slow·leech·explode·extraShots·deflect(0 없음/1 상쇄/2 반사), extraLives, invuln·entryInvuln(초), pierce·compass(bool)
const newStats = () => ({ speed: 1, atkSpeed: 1, dmg: 1, range: 1, knock: 1, dashCd: 1, dashPower: 1, gold: 1, magnet: 1, discount: 1,
  lifesteal: 0, crit: 0, dodge: 0, execute: 0, doubleSwing: 0, coinDrop: 0, heartDrop: 0, stunChance: 0, roomHeal: 0,
  thorns: 0, beam: 0, berserk: 0, reflect: 0, regen: 0, roomGold: 0, burn: 0, slow: 0, leech: 0, explode: 0, extraShots: 0, deflect: 0,
  extraLives: 0, invuln: 0, entryInvuln: 0, pierce: false, compass: false });
const ITEM_PRICE = [0, 34, 56, 84, 120];
// cat: 전투 / 부가효과 / 탄 처리 / 체력 / 유틸 / 골드
const ITEMS = {
  // ----- 전투 -----
  power:    { cat: "전투", tier: 2, name: "힘의 장갑",   desc: "공격력 +20%",                    apply: h => { h.stats.dmg *= 1.2; } },
  haste:    { cat: "전투", tier: 2, name: "신속의 반지", desc: "공격 속도 +18%",                 apply: h => { h.stats.atkSpeed *= 1.18; } },
  reach:    { cat: "전투", tier: 1, name: "장대",        desc: "사거리 +18%",                    apply: h => { h.stats.range *= 1.18; } },
  knock:    { cat: "전투", tier: 1, name: "충격 장갑",   desc: "넉백 +40%",                      apply: h => { h.stats.knock *= 1.4; } },
  crit:     { cat: "전투", tier: 2, name: "예리한 숫돌", desc: "치명타 +15% (피해 2배)",         apply: h => { h.stats.crit += 0.15; } },
  beam:     { cat: "전투", tier: 3, name: "검기",        desc: "근접 공격 시 검기 발사 (관통)",   apply: h => { h.stats.beam += 1; } },
  vamp:     { cat: "전투", tier: 3, name: "흡혈 송곳니", desc: "적 처치 시 3% 확률로 HP +1",     apply: h => { h.stats.lifesteal += 0.03; } },
  thorns:   { cat: "전투", tier: 2, name: "가시 갑옷",   desc: "맞으면 주변 적에게 피해·넉백",   apply: h => { h.stats.thorns += 1; } },
  execute:  { cat: "전투", tier: 3, name: "처형자의 휘장", desc: "체력 15% 이하 일반 적 즉사",   apply: h => { h.stats.execute += 0.15; } },
  echo:     { cat: "전투", tier: 3, name: "메아리 칼날", desc: "20% 확률로 한 번 더 공격",        apply: h => { h.stats.doubleSwing += 0.2; } },
  berserk:  { cat: "전투", tier: 2, name: "광전사의 피", desc: "HP가 낮을수록 공격력 최대 +60%", apply: h => { h.stats.berserk += 0.6; } },
  glass:    { cat: "전투", tier: 2, name: "유리 대포",   desc: "최대 HP -2, 공격력 +50%",        apply: h => { h.maxHp = Math.max(2, h.maxHp - 2); h.hp = Math.min(h.hp, h.maxHp); h.stats.dmg *= 1.5; } },
  // ----- 부가효과 (공격에 붙는다) -----
  ignite:   { cat: "부가", tier: 3, name: "발화석",      desc: "공격에 화상 (3초간 초당 2피해)",  apply: h => { h.stats.burn += 1; } },
  frost:    { cat: "부가", tier: 3, name: "서리 수정",   desc: "공격한 적을 둔화 (이동·공격 -50%)", apply: h => { h.stats.slow += 1; } },
  stun:     { cat: "부가", tier: 3, name: "기절의 망치", desc: "공격 시 15% 확률로 적 기절",      apply: h => { h.stats.stunChance += 0.15; } },
  leechhit: { cat: "부가", tier: 4, name: "흡혈 문양",   desc: "15번 맞힐 때마다 HP +1",         apply: h => { h.stats.leech += 1; } },
  blast:    { cat: "부가", tier: 3, name: "폭발 구슬",   desc: "맞힌 적 주변에 작은 폭발",        apply: h => { h.stats.explode += 1; } },
  multishot:{ cat: "부가", tier: 3, name: "추가 탄창",   desc: "원거리 무기 탄 +1",              apply: h => { h.stats.extraShots += 1; } },
  pierce:   { cat: "부가", tier: 2, name: "관통 화살촉", desc: "원거리 탄이 적을 관통",           apply: h => { h.stats.pierce = true; } },
  // ----- 탄 처리 (기본 공격은 적 탄을 못 막는다) -----
  cancel:   { cat: "탄",   tier: 3, name: "상쇄의 부적", desc: "공격 범위 안의 적 탄을 지운다",   apply: h => { h.stats.deflect = Math.max(h.stats.deflect, 1); } },
  mirror:   { cat: "탄",   tier: 4, name: "반사 거울",   desc: "공격 범위 안의 적 탄을 되받아친다", apply: h => { h.stats.deflect = 2; } },
  reflect:  { cat: "탄",   tier: 2, name: "강화 거울",   desc: "되받아친 탄 피해 2배 (반사 거울 필요)", apply: h => { h.stats.reflect += 1; } },
  // ----- 체력 (회복은 일부러 박하다) -----
  hp_up:    { cat: "체력", tier: 3, name: "체력의 심장", desc: "최대 HP +2 (HP 1 회복)",         apply: h => { h.maxHp += 2; h.heal(1); } },
  potion:   { cat: "체력", tier: 2, name: "생명의 물약", desc: "최대 HP +1, HP 3 회복",          apply: h => { h.maxHp += 1; h.heal(3); } },
  regen:    { cat: "체력", tier: 3, name: "재생의 반지", desc: "90초마다 HP +1 (중첩 시 빨라짐)", apply: h => { h.stats.regen += 1; } },
  dodge:    { cat: "체력", tier: 3, name: "회피 부적",   desc: "15% 확률로 피해 무효",           apply: h => { h.stats.dodge += 0.15; } },
  shield:   { cat: "체력", tier: 2, name: "수호 방패",   desc: "피격 후 무적 +0.5초",            apply: h => { h.stats.invuln += 0.5; } },
  ankh:     { cat: "체력", tier: 4, name: "앙크",        desc: "죽으면 1회 부활",                apply: h => { h.stats.extraLives += 1; } },
  clear_heal: { cat: "체력", tier: 3, name: "치유의 향로", desc: "방 클리어 시 25% 확률로 HP +1", apply: h => { h.stats.roomHeal += 0.25; } },
  heartneck:{ cat: "체력", tier: 2, name: "하트 목걸이", desc: "적 처치 시 하트 드랍 확률 +1.5%", apply: h => { h.stats.heartDrop += 0.015; } },
  // ----- 이동·유틸 -----
  boots:    { cat: "유틸", tier: 1, name: "질주 신발",   desc: "이동 속도 +12%",                 apply: h => { h.stats.speed *= 1.12; } },
  dashband: { cat: "유틸", tier: 1, name: "질풍의 띠",   desc: "대시 재사용 -30%",               apply: h => { h.stats.dashCd *= 0.7; } },
  dashpow:  { cat: "유틸", tier: 1, name: "도약 장화",   desc: "대시 거리 +40%",                 apply: h => { h.stats.dashPower *= 1.4; } },
  cloak:    { cat: "유틸", tier: 2, name: "투명 망토",   desc: "방에 들어갈 때 무적 +2.5초",     apply: h => { h.stats.entryInvuln += 2.5; } },
  compass:  { cat: "유틸", tier: 2, name: "나침반",      desc: "미니맵에 층 전체가 보임 (파티 공유)", apply: h => { h.stats.compass = true; } },
  magnet:   { cat: "유틸", tier: 1, name: "자석",        desc: "코인 끌어당기는 범위 2배",        apply: h => { h.stats.magnet *= 2; } },
  // ----- 골드 -----
  lucky:    { cat: "골드", tier: 2, name: "행운의 동전", desc: "획득 골드 +40%",                 apply: h => { h.stats.gold *= 1.4; } },
  piggy:    { cat: "골드", tier: 2, name: "저금통",      desc: "방을 클리어할 때마다 +2G",       apply: h => { h.stats.roomGold += 2; } },
  looter:   { cat: "골드", tier: 2, name: "도굴꾼 주머니", desc: "코인 드랍 확률 +10%p",         apply: h => { h.stats.coinDrop += 0.1; } },
  haggler:  { cat: "골드", tier: 3, name: "상인의 안목", desc: "상점 가격 -20%",                 apply: h => { h.stats.discount *= 0.8; } },
};
for (const it of Object.values(ITEMS)) it.price = ITEM_PRICE[it.tier];
// 높은 등급일수록 덜 나온다. exclude: 이미 뽑은 id 집합 (모자라면 중복 허용)
const randomItemId = (exclude = new Set()) => {
  let ids = Object.keys(ITEMS).filter(id => !exclude.has(id));
  if (!ids.length) ids = Object.keys(ITEMS);
  const w = id => [0, 4, 3, 2, 1][ITEMS[id].tier];
  let r = Math.random() * ids.reduce((a, id) => a + w(id), 0);
  for (const id of ids) if ((r -= w(id)) < 0) return id;
  return ids[0];
};
const weaponPrice = w => Math.round([30, 52, 82, 130, 210][w.tier] * (0.85 + WEAPONS[w.id].dmg * 0.06));
