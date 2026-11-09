// ============================================================================
// 패시브 아이템 / 액티브 아이템
// 등급(tier)은 3단계: 1=일반(24G) 2=희귀(36G) 3=영웅(48G). 가격은 등급으로 고정이고 층이 올라도 오르지 않는다.
// 이름·모양(icon)은 효과와 관련 없어도 된다. 새 아이템은 PASSIVES에 한 줄 추가하면 보물방·상점·보스 보상에 자동으로 섞인다.
//
// 패시브 apply(hero)는 그 플레이어의 hero.stats만 바꾼다(플레이어별 적용). 단, "골드 관련" stats는 파티 전체가 합쳐서 쓴다:
//   gold(획득 골드 배율) · coinDrop(코인 드랍 확률) · roomGold(방 클리어 보너스) · discount(상점 할인) · compass(미니맵)
//   → 누가 가지고 있든 모두에게 적용된다. (Game.partySum / partyMul)
// stats: speed·atkSpeed·dmg·range·knock·dashCd·dashPower·gold·discount(배율), lifesteal·crit·dodge·execute·doubleSwing·coinDrop·heartDrop·stunChance·roomHeal(확률),
//        thorns·beam·berserk·reflect·roomGold·burn·slow·leech·explode·extraShots·deflect(2=반사, 근접 공격만; 기본은 상쇄), extraLives,
//        invuln(피격 후 무적 추가 초)·entryInvuln(방 입장 무적 초)·killInvuln(적 처치 시 무적 초), pierce·compass(bool)
//   특색 효과: dmgMelee/dmgRanged(근접/원거리 전용 공격력 배율)·noHitDmg(방에서 안 맞았을 때 공격력)·sprint(방 입장 후 5초 이동 속도)·moveAtk(이동 중 공격 속도)·dashAtk(대시 후 2초 공격 속도)·
//        critReset(치명타 시 쿨다운 초기화)·arcMul(근접 범위 각도)·critDmg(치명타 피해 추가 배수)·dashInvuln(대시 무적 추가 초)·dodgeShock(회피 시 충격파)·dashDmg(대시로 지나간 적 피해)·dashCancel(대시 중 탄 제거)·
//        heartBuff(하트를 먹으면 그 방 공격력)·fullHpAtk(HP 가득일 때 공격 속도) / [파티] coinDouble·eliteGold·interest·crateGold·autoCoin·firstHalf·shopExtra
// ============================================================================
const newStats = () => ({ speed: 1, atkSpeed: 1, dmg: 1, range: 1, knock: 1, dashCd: 1, dashPower: 1, gold: 1, discount: 1,
  lifesteal: 0, crit: 0, dodge: 0, execute: 0, doubleSwing: 0, coinDrop: 0, heartDrop: 0, stunChance: 0, roomHeal: 0,
  thorns: 0, beam: 0, berserk: 0, reflect: 0, roomGold: 0, burn: 0, slow: 0, leech: 0, explode: 0, extraShots: 0, deflect: 0,
  extraLives: 0, invuln: 0, entryInvuln: 0, killInvuln: 0, pierce: false, compass: false,
  // 특색 있는 효과용
  dmgMelee: 1, dmgRanged: 1, noHitDmg: 0, sprint: 0, moveAtk: 0, dashAtk: 0, critReset: false, arcMul: 0, critDmg: 0, dashInvuln: 0, dodgeShock: 0,
  dashDmg: 0, dashCancel: false, heartBuff: 0, fullHpAtk: 0,
  coinDouble: 0, eliteGold: 0, interest: 0, crateGold: 0, autoCoin: false, firstHalf: false, shopExtra: 0 });
const ITEM_TIERS = [null,
  { name: "일반", price: 24, color: "#e8e8e8", weight: 5 },
  { name: "희귀", price: 36, color: "#4fc3f7", weight: 3 },
  { name: "영웅", price: 48, color: "#ce93d8", weight: 1.4 }];

const PASSIVES = {
  // ================= 일반 (12G) =================
  onion:      { tier: 1, icon: "🧅", name: "양파",         desc: "방에 들어간 뒤 한 번도 안 맞았다면 공격력 +15%", apply: h => { h.stats.noHitDmg += 0.15; } },
  oldboots:   { tier: 1, icon: "👢", name: "낡은 장화",     desc: "방에 들어간 뒤 5초간 이동 속도 +40%",  apply: h => { h.stats.sprint += 0.4; } },
  ribbon:     { tier: 1, icon: "🎀", name: "빨간 리본",     desc: "대시한 뒤 2초간 공격 속도 +35%",       apply: h => { h.stats.dashAtk += 0.35; } },
  stick:      { tier: 1, icon: "🪵", name: "쪼개진 막대",   desc: "근접 공격의 범위(각도) +25%",         apply: h => { h.stats.arcMul += 0.25; } },
  irondust:   { tier: 1, icon: "⚙️", name: "철가루",        desc: "넉백 +30%",                        apply: h => { h.stats.knock *= 1.3; } },
  nail:       { tier: 1, icon: "📌", name: "구부러진 못",   desc: "방에 들어갈 때 무적 5초",            apply: h => { h.stats.entryInvuln = Math.max(h.stats.entryInvuln, 3.8); } },
  miniheart:  { tier: 1, icon: "💗", name: "작은 심장",     desc: "최대 HP +1, HP 1 회복",             apply: h => { h.maxHp += 1; h.heal(1); } },
  tack:       { tier: 1, icon: "📍", name: "압정",         desc: "치명타 +5%, 치명타 피해 2배 → 2.5배",   apply: h => { h.stats.crit += 0.05; h.stats.critDmg += 0.5; } },
  purse:      { tier: 1, icon: "👛", name: "동전 지갑",     desc: "[파티] 코인 드랍 확률 +5%p",         apply: h => { h.stats.coinDrop += 0.05; } },
  oldbook:    { tier: 1, icon: "📖", name: "낡은 책",       desc: "[파티] 상점 가격 -10%",             apply: h => { h.stats.discount *= 0.9; } },
  acorn:      { tier: 1, icon: "🌰", name: "도토리",       desc: "[파티] 상자·폭발 통을 부수면 코인 +2G 확정", apply: h => { h.stats.crateGold += 2; } },
  plume:      { tier: 1, icon: "🪶", name: "깃털 장식",     desc: "대시하는 동안 주변 적 탄을 지운다",    apply: h => { h.stats.dashCancel = true; } },
  bone:       { tier: 1, icon: "🦴", name: "뼈다귀",       desc: "하트를 먹으면 그 방에서 공격력 +10%",  apply: h => { h.stats.heartBuff += 0.10; } },
  balloon:    { tier: 1, icon: "🎈", name: "풍선",         desc: "대시 무적 시간 +0.25초",             apply: h => { h.stats.dashInvuln += 0.25; } },
  shiny:      { tier: 1, icon: "💎", name: "반짝이는 돌",   desc: "[파티] 획득 골드 +15%",             apply: h => { h.stats.gold *= 1.15; } },
  twig:       { tier: 1, icon: "🌿", name: "마른 가지",     desc: "대시 재사용 시간 -15%",             apply: h => { h.stats.dashCd *= 0.85; } },
  sock:       { tier: 1, icon: "🧦", name: "낡은 양말",     desc: "피격 후 무적 +0.3초",               apply: h => { h.stats.invuln += 0.3; } },
  // ================= 희귀 (18G) =================
  hotonion:   { tier: 2, icon: "🌶️", name: "개매운 양파",   desc: "공격력 +10%, HP 2 회복",            apply: h => { h.stats.dmg *= 1.10; h.heal(2); } },
  rottenmush: { tier: 2, icon: "🍄", name: "썩은 버섯",     desc: "최대 HP -1, 공격 속도 ×1.3",         apply: h => { h.maxHp = Math.max(2, h.maxHp - 1); h.hp = Math.min(h.hp, h.maxHp); h.stats.atkSpeed *= 1.3; } },
  millstone:  { tier: 2, icon: "🪨", name: "맷돌",         desc: "적을 처치하면 1초 무적",             apply: h => { h.stats.killInvuln = Math.max(h.stats.killInvuln, 1); } },
  ember:      { tier: 2, icon: "🔥", name: "불씨",         desc: "공격에 화상 (3초간 초당 2피해)",      apply: h => { h.stats.burn += 1; } },
  iceshard:   { tier: 2, icon: "🧊", name: "얼음 조각",     desc: "공격한 적을 둔화 (이동·공격 -50%)",   apply: h => { h.stats.slow += 1; } },
  toyhammer:  { tier: 2, icon: "🔨", name: "장난감 망치",   desc: "공격 시 12% 확률로 적 기절",         apply: h => { h.stats.stunChance += 0.12; } },
  glitter:    { tier: 2, icon: "✨", name: "반짝이 가루",   desc: "치명타 +15% (피해 2배)",            apply: h => { h.stats.crit += 0.15; } },
  fang:       { tier: 2, icon: "🦷", name: "송곳니",       desc: "적 처치 시 3% 확률로 HP +1",         apply: h => { h.stats.lifesteal += 0.03; } },
  shell:      { tier: 2, icon: "🐚", name: "가시 껍질",     desc: "맞으면 주변 적에게 피해·넉백",        apply: h => { h.stats.thorns += 1; } },
  lens:       { tier: 2, icon: "🔍", name: "렌즈",         desc: "원거리 무기 탄 +1",                 apply: h => { h.stats.extraShots += 1; } },
  arrowhead:  { tier: 2, icon: "🏹", name: "관통 화살촉",   desc: "원거리 탄이 적을 관통",              apply: h => { h.stats.pierce = true; } },
  clover:     { tier: 2, icon: "🍀", name: "네잎 클로버",   desc: "[파티] 코인이 15% 확률로 2배",        apply: h => { h.stats.coinDouble += 0.15; } },
  looter:     { tier: 2, icon: "🎒", name: "도굴꾼 주머니", desc: "[파티] 코인 드랍 +8%, 떨어진 코인이 바로 팀 골드로", apply: h => { h.stats.coinDrop += 0.08; h.stats.autoCoin = true; } },
  piggy:      { tier: 2, icon: "🐷", name: "저금통",       desc: "[파티] 방 클리어마다 보유 골드의 10% 이자(최대 +5G)", apply: h => { h.stats.interest += 1; } },
  coupon:     { tier: 2, icon: "🎫", name: "쿠폰",         desc: "[파티] 상점에서 처음 사는 물건 반값",   apply: h => { h.stats.firstHalf = true; } },
  berserk:    { tier: 2, icon: "🩸", name: "광전사의 피",   desc: "HP가 낮을수록 공격력 최대 +60%",     apply: h => { h.stats.berserk += 0.6; } },
  glass:      { tier: 2, icon: "🥂", name: "유리 대포",     desc: "최대 HP -2, 공격력 +50%",           apply: h => { h.maxHp = Math.max(2, h.maxHp - 2); h.hp = Math.min(h.hp, h.maxHp); h.stats.dmg *= 1.5; } },
  sneakers:   { tier: 2, icon: "👟", name: "운동화",       desc: "이동하는 동안 공격 속도 +20%",         apply: h => { h.stats.moveAtk += 0.2; } },
  ring:       { tier: 2, icon: "💍", name: "신속의 반지",   desc: "치명타가 터지면 공격 쿨다운 즉시 초기화", apply: h => { h.stats.critReset = true; } },
  glove:      { tier: 2, icon: "🥊", name: "힘의 장갑",     desc: "근접 무기 공격력 +30%",               apply: h => { h.stats.dmgMelee *= 1.3; } },
  archglove:  { tier: 2, icon: "🧤", name: "사수의 장갑",   desc: "원거리 무기 공격력 +30%",             apply: h => { h.stats.dmgRanged *= 1.3; } },
  band:       { tier: 2, icon: "🪢", name: "질풍의 띠",     desc: "대시로 지나간 적에게 피해",           apply: h => { h.stats.dashDmg += 1; } },
  charm:      { tier: 2, icon: "🧿", name: "푸른 눈 부적",  desc: "12% 확률로 피해 무효, 무효 시 충격파(적 밀침·탄 제거)", apply: h => { h.stats.dodge += 0.12; h.stats.dodgeShock += 1; } },
  compass:    { tier: 2, icon: "🧭", name: "나침반",       desc: "[파티] 미니맵에 층 전체가 보임",      apply: h => { h.stats.compass = true; } },
  incense:    { tier: 2, icon: "🪔", name: "치유의 향로",   desc: "방 클리어 시 25% 확률로 HP +1",      apply: h => { h.stats.roomHeal += 0.25; } },
  pole:       { tier: 2, icon: "📏", name: "장대",         desc: "사거리 +20%",                      apply: h => { h.stats.range *= 1.2; } },
  mirror2:    { tier: 2, icon: "🪞", name: "강화 거울",     desc: "되받아친 탄 피해 2배 (반사 거울 필요)", apply: h => { h.stats.reflect += 1; } },
  necklace:   { tier: 2, icon: "📿", name: "하트 목걸이",   desc: "적 처치 시 하트 드랍 확률 +2%",      apply: h => { h.stats.heartDrop += 0.02; } },
  // ================= 영웅 (24G) =================
  redonion:   { tier: 3, icon: "🧅", name: "적양파",       desc: "공격력 +25%, HP 3 회복",             apply: h => { h.stats.dmg *= 1.25; h.heal(3); } },
  rainbowmush:{ tier: 3, icon: "🍄", name: "알록달록 버섯", desc: "최대 HP +1, 공격력 ×1.3, 이동 +15%, 공격속도 +0.15, 사거리 +5%", apply: h => { h.maxHp += 1; h.heal(1); h.stats.dmg *= 1.3; h.stats.speed *= 1.15; h.stats.atkSpeed += 0.15; h.stats.range *= 1.05; } },
  swordaura:  { tier: 3, icon: "🌙", name: "초승달 조각",   desc: "근접 공격 시 검기 발사 (관통)",       apply: h => { h.stats.beam += 1; } },
  executioner:{ tier: 3, icon: "🎖️", name: "처형자의 휘장", desc: "체력 15% 이하 일반 적 즉사",          apply: h => { h.stats.execute += 0.15; } },
  echoblade:  { tier: 3, icon: "🗡️", name: "메아리 칼날",   desc: "20% 확률로 한 번 더 공격",           apply: h => { h.stats.doubleSwing += 0.2; } },
  blastorb:   { tier: 3, icon: "💥", name: "폭발 구슬",     desc: "맞힌 적 주변에 작은 폭발",           apply: h => { h.stats.explode += 1; } },
  sigil:      { tier: 3, icon: "☯️", name: "흡혈 문양",     desc: "15번 맞힐 때마다 HP +1",             apply: h => { h.stats.leech += 1; } },
  mirror:     { tier: 3, icon: "🪞", name: "반사 거울",     desc: "근접 공격이 적 탄을 되받아친다",      apply: h => { h.stats.deflect = 2; } },
  ankh:       { tier: 3, icon: "☥",  name: "앙크",         desc: "죽으면 1회 부활",                   apply: h => { h.stats.extraLives += 1; } },
  bigheart:   { tier: 3, icon: "❤️", name: "체력의 심장",   desc: "최대 HP +2, HP가 가득이면 공격 속도 +12%", apply: h => { h.maxHp += 2; h.heal(1); h.stats.fullHpAtk += 0.12; } },
  goldtooth:  { tier: 3, icon: "🪙", name: "황금 이빨",     desc: "[파티] 획득 골드 +40%, 엘리트 처치 시 코인 +4G", apply: h => { h.stats.gold *= 1.4; h.stats.eliteGold += 4; } },
  haggler:    { tier: 3, icon: "🛒", name: "상인의 안목",   desc: "[파티] 상점 가격 -30%, 상점 품목 +2개", apply: h => { h.stats.discount *= 0.7; h.stats.shopExtra += 2; } },
  basket:     { tier: 3, icon: "🧺", name: "과일 바구니",   desc: "최대 HP +1, 공격 속도 +15%, 이동 +8%", apply: h => { h.maxHp += 1; h.heal(1); h.stats.atkSpeed *= 1.15; h.stats.speed *= 1.08; } },
  skull:      { tier: 3, icon: "💀", name: "수정 해골",     desc: "공격력 +15%, 치명타 +10%, 화상",     apply: h => { h.stats.dmg *= 1.15; h.stats.crit += 0.10; h.stats.burn += 1; } },
};
const ITEMS = PASSIVES; // (예전 이름)
for (const it of Object.values(PASSIVES)) it.price = ITEM_TIERS[it.tier].price;

// ============================================================================
// 액티브 아이템: 한 명당 1개. 새로 얻으면 들고 있던 것은 바닥에 떨어진다.
//   kind "charge"  : 방을 클리어하면 충전 1 (큰 방은 2). max까지 모인다.  use 한 번에 충전 1 소모
//   kind "cooldown": 쿨타임(cd초)이 지나면 다시 쓸 수 있다.
//   use(hero, game) → true면 사용됨 (false면 소모 안 함)
// ============================================================================
const ACTIVES = {
  vial:      { tier: 1, icon: "🧪", name: "붉은 약병",   kind: "charge", max: 6, desc: "HP 2 회복",
               use(h, g) { if (h.hp >= h.maxHp) return false; h.heal(2); g.puff(h, ["#ef5350", "#fff"]); SFX.play("swap"); return true; } },
  feather:   { tier: 1, icon: "🪽", name: "도약의 깃털", kind: "cooldown", cd: 8, desc: "바라보는 방향으로 도약 (0.5초 무적)",
               use(h, g) { const p = h.transform.position; g.puff(h, ["#fff", "#b3e5fc"]); const [x, y] = g.pushOut(p.x + Math.cos(h.facing) * 62, p.y + Math.sin(h.facing) * 62, h.radius); h.transform.setPosition(Math.max(-ARENA.w / 2 + 7, Math.min(ARENA.w / 2 - 7, x)), Math.max(-ARENA.h / 2 + 7, Math.min(ARENA.h / 2 - 7, y))); h.invuln = Math.max(h.invuln, 0.5); g.puff(h, ["#fff", "#b3e5fc"]); SFX.play("door"); return true; } },
  bomb:      { tier: 1, icon: "💣", name: "폭탄 가방",   kind: "charge", max: 2, desc: "1초 뒤 터지는 폭탄 설치 (바위·상자 파괴)",
               use(h, g) { const p = h.transform.position; g.spawnBomb(p.x, p.y, h); return true; } },
  horn:      { tier: 2, icon: "📯", name: "전쟁 나팔",   kind: "cooldown", cd: 20, desc: "주변 적 탄 제거 + 적을 밀어냄",
               use(h, g) { const p = h.transform.position; g.shockwave(p.x, p.y, 95, 3, 240, h); return true; } },
  drum:      { tier: 2, icon: "🥁", name: "분노의 북",   kind: "charge", max: 4, desc: "방 안의 모든 적에게 피해",
               use(h, g) { for (const e of g.enemies) { if (e.dead || e.spawnDelay > 0) continue; const ep = e.transform.position; e.damage(6 * h.stats.dmg, h, Math.atan2(ep.y - h.transform.position.y, ep.x - h.transform.position.x), 40); g.fx.emit(ep.x, ep.y, { count: 4, colors: ["#ff8a65", "#fff"], speed: [20, 60], life: [0.15, 0.3], size: [1, 2], fade: true }); } g.cam.shake(4, 0.3); SFX.play("boom"); return true; } },
  hourglass: { tier: 2, icon: "⏳", name: "모래시계",     kind: "charge", max: 4, desc: "5초간 모든 적 둔화",
               use(h, g) { for (const e of g.enemies) { if (e.dead) continue; e.slowT = 5; e.slowMul = 0.4; } g.cam.shake(1.5, 0.2); SFX.play("warn"); return true; } },
  lightning: { tier: 3, icon: "⚡", name: "번개 지팡이", kind: "cooldown", cd: 12, desc: "무작위 적 5명에게 번개",
               use(h, g) { const list = g.enemies.filter(e => !e.dead && e.spawnDelay <= 0).sort(() => Math.random() - 0.5).slice(0, 5); if (!list.length) return false; for (const e of list) { const ep = e.transform.position; e.damage(6 * h.stats.dmg, h, -Math.PI / 2, 30); g.fx.emit(ep.x, ep.y + 4, { count: 10, colors: ["#fff59d", "#fff"], speed: [30, 90], life: [0.15, 0.3], size: [1, 2], fade: true, angle: Math.PI / 2, spread: 0.6 }); } g.cam.shake(3, 0.2); SFX.play("boom"); return true; } },
  bell:      { tier: 3, icon: "🔔", name: "수호의 종",   kind: "charge", max: 3, desc: "4초간 무적 + 주변 적 탄 제거",
               use(h, g) { const p = h.transform.position; h.invuln = Math.max(h.invuln, 4); g.cancelProjectiles(p.x, p.y, 70); g.puff(h, ["#fff59d", "#fff"]); SFX.play("clear"); return true; } },
};
for (const it of Object.values(ACTIVES)) it.price = ITEM_TIERS[it.tier].price;
const activeLabel = a => a ? `${ACTIVES[a.id].icon}${ACTIVES[a.id].name} ${ACTIVES[a.id].kind === "charge" ? `${a.charge}/${ACTIVES[a.id].max}` : a.cdLeft > 0 ? Math.ceil(a.cdLeft) + "초" : "준비"}` : "";

// 등급이 높을수록 덜 나온다. exclude: 이미 뽑은 id 집합 (모자라면 중복 허용)
const randomItemId = (exclude = new Set()) => {
  let ids = Object.keys(PASSIVES).filter(id => !exclude.has(id));
  if (!ids.length) ids = Object.keys(PASSIVES);
  let r = Math.random() * ids.reduce((a, id) => a + ITEM_TIERS[PASSIVES[id].tier].weight, 0);
  for (const id of ids) if ((r -= ITEM_TIERS[PASSIVES[id].tier].weight) < 0) return id;
  return ids[0];
};
const randomActiveId = (exclude = new Set()) => {
  let ids = Object.keys(ACTIVES).filter(id => !exclude.has(id)); if (!ids.length) ids = Object.keys(ACTIVES);
  let r = Math.random() * ids.reduce((a, id) => a + ITEM_TIERS[ACTIVES[id].tier].weight, 0);
  for (const id of ids) if ((r -= ITEM_TIERS[ACTIVES[id].tier].weight) < 0) return id;
  return ids[0];
};
// 무기 가격은 등급(5단계)으로 고정
const weaponPrice = w => [24, 36, 48, 64, 88][w.tier];
