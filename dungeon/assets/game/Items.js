// ============================================================================
// 패시브 아이템 / 액티브 아이템  (이벤트 훅 + 공격 수식 파이프라인)
// 아이템에는 등급 구분이 없다 (가격 15G 고정, 확률 균등). P()의 두 번째 인자는 형태 변환 우선순위 기본값. 새 아이템은 아래 P(...) 한 줄이면 보물방·상점·보스 보상에 자동으로 섞인다.
//
// ── 아이템 정의 형식  P(id, tier, 아이콘, 이름, 설명, [태그], 스펙)  ───────────────────────────────
//   s      : 스탯 변경. { dmg: 0.1 } 더하기 / { "dmg*": 1.2 } 곱하기 / { pierce: true } 켜기      (스탯 목록은 newStats)
//   hp     : 최대 체력 증감 (늘면 그만큼 회복)      heal : 즉시 회복
//   conv   : 무기 형태 변환 { slash:"projectile", ... }  prio: 우선순위(기본=등급)
//            → 같은 형태를 바꾸는 변환이 여럿이면 prio가 높은 쪽이, 같으면 나중에 얻은 쪽이 이긴다. 변환은 한 번만(연쇄 없음).
//   on     : 이벤트 훅 { 이벤트: (owner, src, a, b) => {...} }   owner=아이템 주인, src=이벤트를 일으킨 플레이어(방 이벤트는 null)
//   fam    : 따라다니는 동료(Familiar) 종류      cos : 꾸미기 { hat, glasses, mustache, aura, sparkle, shape, sfx }      init(h): 자유 코드
//   party  : 설명 앞에 [파티]를 붙일지는 설명 글자에 직접 쓴다 (partySum으로 읽는 스탯은 모두에게 적용)
//
// ── 무기 형태(form) 4가지 ─────────────────────────────────────────────────────────────────────
//   slash 휘두르기 / thrust 찌르기 / projectile 투사체 / laser 레이저  (무기별 기본 형태는 Weapons.js)
//   아이템은 형태를 바꾸거나(conv), 형태별로 "함께 나가는 추가 공격"을 붙인다:
//     eSlash  : 휘두르기 때 검기(관통 탄) n발       eThrust : 찌르기 때 관통 바늘 n발
//     eProj   : 투사체를 쏠 때 즉시 광선 1줄 함께    eLaser  : 레이저가 좌우로 갈라져 2줄 더(단계×)
//   검기·바늘은 "내 탄"이라서 튕김(bounce)·유도(homing)·분열(split)·관통(pierce)·부메랑(boomerang)·상태이상이 그대로 적용된다 → 근접도 탄 아이템과 시너지.
//
// ── 훅 이벤트 이름 (Game.fire(이벤트, 일으킨 플레이어, a, b)) ──────────────────────────────────
//   전투   : swing(w,dir) · hit(적,피해) · kill(적) · damaged(피해량) · dash · shieldBreak · active(id)
//   방     : roomEnter(room) · roomClear(room)
//   재화   : coinPickup(값) · keyPickup · heartPickup · chestOpen   ← 주워 담는 쪽(Pickup 등)이 호출한다
//   보유 스탯 중 coinLuck·chestLuck·rewardLuck(파티 합)은 보상 굴림에서 읽는 값이다.  game.gold(공유 골드)·game.keys(공유 열쇠, 없으면 0)
//
// ── 분신 · 조종 무기 · 장판 (ItemFx.js) ───────────────────────────────────────────────────────
//   cloneAhead/cloneBehind/twin : 분신(Clone)이 내 공격을 자기 위치에서 따라한다(Hero._mimic) — 앞·뒤(반대 방향)·1초 전 위치
//   relay : 가까운 아군이 내 공격을 자기 자리에서 따라한다      delayEcho n : n번째 공격마다 0.5초 뒤 같은 자리에서 한 번 더
//   ludo 1/2 : 조종 구슬/검(Ludo) — 공격 스틱을 끄는 방향·세기로 날아간다      blades n : 몸 주위를 도는 칼날(Blades)
//   spawnZone(g, 주인, x, y, {kind, r, life, tick, dmg}) : 바닥 장판(fire/poison/slow/spark/bomb), spawnTurret : 임시 포탑
//   액티브 조작 함수: rerollItems(주사위) · replayRoom · warp · rerollPickups · convertPickups
//   syncFx(h)는 giveItem 때마다 불려 스탯에 맞게 분신·칼날·조종 무기를 만들고 없앤다.  (끌어당기는 자석 효과는 없다 — 줍기는 몸이 닿아야 한다)
//
// ── 상태이상 (Enemy.addStatus) ─────────────────────────────────────────────────────────────────
//   burn 화상 · chill 둔화 · freeze 빙결 · poison 중독 · shock 감전(근처 적에게 번개) · bleed 출혈(받는 피해 +25%)
//   반응: 화상xN빙결/둔화=증기 폭발 · 화상x중독=독불 · 감전xN빙결/둔화=초전도.  → Enemy.js _react
//
// ── 태그 세트 / 짝 시너지 ───────────────────────────────────────────────────────────────────────
//   TAG_SETS : 같은 태그 아이템 n개를 모으면 보너스(소리+반짝임 한 번).   PAIRS : 특정 아이템 두 개를 같이 가지면 보너스.
// ============================================================================
const newStats = () => ({ speed: 1, atkSpeed: 1, dmg: 1, range: 1, knock: 1, dashCd: 1, dashPower: 1, gold: 1, discount: 1,
  lifesteal: 0, crit: 0, dodge: 0, execute: 0, doubleSwing: 0, heartDrop: 0, stunChance: 0, roomHeal: 0,
  thorns: 0, berserk: 0, reflect: 0, roomGold: 0, slow: 0, leech: 0, explode: 0, extraShots: 0, deflect: 0,
  extraLives: 0, invuln: 0, entryInvuln: 0, killInvuln: 0, pierce: false, compass: false,
  // 조건부 · 특색
  dmgMelee: 1, dmgRanged: 1, noHitDmg: 0, sprint: 0, moveAtk: 0, dashAtk: 0, critReset: false, arcMul: 0, critDmg: 0, dashInvuln: 0, dodgeShock: 0,
  dashDmg: 0, dashCancel: false, heartBuff: 0, fullHpAtk: 0, openDmg: 0, lowHp: 0, combo: 0, killAtk: 0, hurtBuff: 0,
  // 상태이상(확률) · 탄 개조 · 형태별 추가 공격
  burn: 0, burnP: 0, freeze: 0, poison: 0, shock: 0, bleed: 0, bounce: 0, homing: 0, split: 0, chain: 0, boomerang: false,
  eSlash: 0, eThrust: 0, eProj: 0, eLaser: 0, killBurst: 0, killBoom: 0, shatter: 0, plague: 0, bloodHeal: 0,
  // 대상별 추가 피해
  vsBurn: 0, vsFrozen: 0, vsBleed: 0, vsBoss: 0, vsElite: 0, vsFull: 0, far: 0, near: 0,
  // 유틸 · 협동 · [파티] 재화
  dashExtra: 0, roomShield: 0, mapSpecial: false, auraAtk: 0, auraDmg: 0, auraInv: 0, link: 0,
  // 분신·조종 무기·칼날 · 공격 변형 · 조건부 피해 (ItemFx.js / Hero.js가 읽는다)
  cloneAhead: 0, cloneBehind: 0, twin: 0, blades: 0, ludo: 0, relay: 0, delayEcho: 0, curve: 0, charge: 0, streakDmg: 0, roomRamp: 0, richDmg: 0, keyDmg: 0,
  demolish: false, bulletTime: false, bulletSize: 1, noSlow: false, dashFirst: 0, alt: 0, trailWalk: false, pulse: false, quack: 0, starProc: 0, critBleed: false, teamDmg: 0,
  coinDouble: 0, interest: 0, crateGold: 0, firstHalf: false, shopExtra: 0, coinLuck: 0, chestLuck: 0, rewardLuck: 0 });
// 아이템(패시브·액티브)에는 등급이 없다: 가격 15G 고정, 나올 확률 모두 같음. (tier 숫자는 형태 변환 우선순위 기본값으로만 쓰인다)
const ITEM_TIERS = [null, ...[1, 2, 3].map(() => ({ name: "", price: 15, color: "#e8e8e8", weight: 1 }))];

// ---------------------------------------------------------------------------
// 공통 도우미 (할당을 최소화: 모듈 안의 재사용 버퍼)
// ---------------------------------------------------------------------------
const _ib = []; let _kd = 0;
// 원 범위 안의 적에게 피해(dot=true라 아이템 추가배율 없음). fn(e)는 맞은 적마다 호출.
function itemsAoe(g, x, y, r, dmg, by, colors, fn) {
  const buf = []; const n = Physics.overlapCircle(x, y, r, PL.Enemy, buf);
  for (let i = 0; i < n; i++) { const e = buf[i].data; if (e.dead || e.spawnDelay > 0) continue; const ep = e.transform.position; if (dmg > 0) e.damage(dmg, by, Math.atan2(ep.y - y, ep.x - x), 40, true); if (fn) fn(e); }
  g.fx.emit(x, y, { count: 12, colors, speed: [30, 90], life: [0.15, 0.35], size: [1, 2], fade: true, area: r * 0.3 });
}
// 번개: from에서 가까운 다른 적 n마리에게 dmg (최대 60 거리)
function itemsArc(g, from, by, n, dmg) {
  const fp = from.transform.position, hit = _ib; hit.length = 0;
  for (let k = 0; k < n; k++) {
    let best = null, bd = 60 * 60;
    for (const e of g.enemies) { if (e === from || e.dead || e.spawnDelay > 0 || hit.includes(e)) continue; const ep = e.transform.position, d = (ep.x - fp.x) * (ep.x - fp.x) + (ep.y - fp.y) * (ep.y - fp.y); if (d < bd) { bd = d; best = e; } }
    if (!best) break; hit.push(best);
    const bp = best.transform.position; best.damage(dmg, by, Math.atan2(bp.y - fp.y, bp.x - fp.x), 20, true); best.shk = 0.3;
    for (let q = 1; q <= 3; q++) g.fx.emit(fp.x + (bp.x - fp.x) * q / 4, fp.y + (bp.y - fp.y) * q / 4, { count: 1, colors: ["#fff59d", "#fff"], speed: [0, 8], life: [0.1, 0.2], size: [1, 1.6], fade: true });
  }
  hit.length = 0;
}
// 적이 죽을 때 (Game의 enemy.killed에서 호출): 처치 관련 아이템·세트 효과 → 훅
function itemsOnKill(g, by, e) {
  if (!by || !by.stats || _kd > 2) return; _kd++;
  try {
    const s = by.stats, p = e.transform.position, d = s.dmg, burning = !!e.burn, chilled = e.frz > 0 || e.slowT > 0;
    if (by.sets.fire && burning) itemsAoe(g, p.x, p.y, 26, 0, by, ["#ff6d00", "#ffee58"], o => { if (o !== e) o.addStatus("burn", 1, by); }); // 화염 세트: 불이 번진다
    if (s.killBurst && burning) itemsAoe(g, p.x, p.y, 28, 3 * d * s.killBurst, by, ["#ff7043", "#ffee58"]);
    if (s.killBoom) itemsAoe(g, p.x, p.y, 26, 2.5 * d * s.killBoom, by, ["#ff8a65", "#fff59d"]);
    if ((s.shatter || by.sets.ice) && chilled) itemsAoe(g, p.x, p.y, 30, 3 * d, by, ["#e1f5fe", "#4fc3f7"]);
    if (s.plague && e.poi) itemsAoe(g, p.x, p.y, 36, 0, by, ["#9ccc65", "#c5e1a5"], o => { if (o !== e) o.addStatus("poison", 1, by); });
    if (s.bloodHeal && e.bld && Math.random() < s.bloodHeal) by.heal(1);
    by.killT = 2;
    const ac = by.active; if (ac) { const ad = ACTIVES[ac.id]; if (ad.kind === "kill" && ((ac.prog = (ac.prog || 0) + 1) >= ad.per)) { ac.prog = 0; ac.charge = Math.min(ad.max, ac.charge + 1); } } // 처치로 충전되는 액티브
    g.fire("kill", by, e);
  } finally { _kd--; }
}
// 가장 체력이 낮은(비율) 살아 있는 아군
function lowestAlly(g, except) { let best = null, bv = 2; for (const h of g.heroes) { if (!h.alive || h === except) continue; const v = h.hp / h.maxHp; if (v < bv) { bv = v; best = h; } } return best; }

// ---------------------------------------------------------------------------
// 아이템 적용 엔진
// ---------------------------------------------------------------------------
function itemApply(h, it) {
  const st = h.stats;
  if (it.s) for (const k in it.s) { const v = it.s[k]; if (k.endsWith("*")) st[k.slice(0, -1)] *= v; else if (typeof v === "boolean") st[k] = v; else st[k] += v; }
  if (it.hp) { h.maxHp = Math.max(2, h.maxHp + it.hp); h.hp = it.hp > 0 ? Math.min(h.maxHp, h.hp + it.hp) : Math.min(h.hp, h.maxHp); }
  if (it.heal) h.heal(it.heal);
  if (it.conv) { h.convs.push({ prio: it.prio ?? it.tier, n: h.items.length, conv: it.conv }); h.rebuildConv(); }
  if (it.on) for (const e in it.on) h.on(e, it.on[e]);
  if (it.cos) Object.assign(h.cos, it.cos);
  if (it.fam) h.addFamiliar(it.fam);
  if (it.s && it.s.dashExtra) h.dashCharge = Math.min(1 + st.dashExtra, h.dashCharge + it.s.dashExtra); // 대시 충전 늘면 바로 채워 준다
  if (it.init) it.init(h);
  for (const t of it.tags || []) h.tagN[t] = (h.tagN[t] || 0) + 1;
  checkSets(h); checkPairs(h);
}
// 태그 세트: 같은 태그 n개 이상 → 보너스 (h.sets[태그]=true 를 전투 코드가 읽는다)
const TAG_SETS = [
  { tag: "fire", n: 3, desc: "화염 3: 화상 피해 +30%, 화상 중인 적이 죽으면 불이 번진다" },
  { tag: "ice", n: 3, desc: "얼음 3: 빙결이 더 오래, 얼어붙은 적이 죽으면 산산조각" },
  { tag: "electric", n: 3, desc: "전기 3: 번개가 2마리 더 튄다" },
  { tag: "poison", n: 3, desc: "독 3: 중독 피해 +50%", apply: h => {} },
  { tag: "explosive", n: 3, desc: "폭발 3: 폭발 범위 +40%" },
  { tag: "familiar", n: 2, desc: "동료 2: 동료의 피해 +50%" },
  { tag: "defense", n: 3, desc: "방어 3: 방마다 보호막 +1", apply: h => { h.stats.roomShield += 1; } },
];
function checkSets(h) {
  for (const t of TAG_SETS) if (!h.sets[t.tag] && (h.tagN[t.tag] || 0) >= t.n) { h.sets[t.tag] = true; if (t.apply) t.apply(h); setCue(h); }
}
// 짝 시너지: 두 아이템을 같이 가지면 (순서 무관)
const PAIRS = [
  { a: "ember", b: "iceshard", key: "steam", desc: "증기 기관: 증기 폭발 피해 +60%" },
  { a: "coil", b: "frostbook", key: "supercon", desc: "초전도: 초전도 번개 피해 2배" },
  { a: "echoblade", b: "swordaura", key: "echoWave", desc: "메아리 검기: 추가 타격에도 검기가 나간다" },
  { a: "mirror", b: "blastorb", key: "mirrorBoom", desc: "폭발 거울: 되받아친 탄이 터진다" },
  { a: "lens", b: "arrowhead", key: "precise", desc: "정밀 사격: 치명타 +10%", apply: h => { h.stats.crit += 0.1; } },
  { a: "thrownblade", b: "boomerangring", key: "spinblade", desc: "회전 칼날: 원거리 공격력 +25%", apply: h => { h.stats.dmgRanged *= 1.25; } },
];
function checkPairs(h) {
  for (const p of PAIRS) if (!h.syn[p.key] && h.items.includes(p.a) && h.items.includes(p.b)) { h.syn[p.key] = true; if (p.apply) p.apply(h); setCue(h); }
}
function setCue(h) { const q = h.transform.position; h.game.fx.emit(q.x, q.y, { count: 14, colors: ["#fff59d", "#ce93d8", "#fff"], speed: [30, 90], life: [0.3, 0.6], size: [1, 2], fade: true }); SFX.play("item"); }

const PASSIVES = {};
const P = (id, tier, icon, name, desc, tags, spec = {}) => { const it = PASSIVES[id] = { id, tier, icon, name, desc, tags, ...spec }; it.apply = h => itemApply(h, it); return it; };

// ================= 일반 =================
// ── 스탯이 중심 / 조건부 ──
P("onion", 1, "🧅", "양파", "방에 들어간 뒤 한 번도 안 맞았다면 공격력 +15%", ["utility"], { s: { noHitDmg: 0.15 } });
P("oldboots", 1, "👢", "낡은 장화", "방에 들어간 뒤 5초간 이동 속도 +40%", ["speed"], { s: { sprint: 0.4 } });
P("ribbon", 1, "🎀", "빨간 리본", "대시한 뒤 2초간 공격 속도 +35%", ["speed"], { s: { dashAtk: 0.35 } });
P("stick", 1, "🪵", "쪼개진 막대", "근접 공격의 범위(각도) +25%", ["melee"], { s: { arcMul: 0.25 } });
P("irondust", 1, "⚙️", "철가루", "넉백 +30%", ["melee"], { s: { "knock*": 1.3 } });
P("nail", 1, "📌", "구부러진 못", "방에 들어갈 때 무적 5초", ["defense"], { s: { entryInvuln: 3.8 } });
P("miniheart", 1, "💗", "작은 심장", "최대 HP +1, HP 1 회복", ["defense"], { hp: 1 });
P("tack", 1, "📍", "압정", "치명타 +5%, 치명타 피해 2배 → 2.5배", ["luck"], { s: { crit: 0.05, critDmg: 0.5 } });
P("twig", 1, "🌿", "마른 가지", "대시 재사용 시간 -15%", ["speed"], { s: { "dashCd*": 0.85 } });
P("sock", 1, "🧦", "낡은 양말", "피격 후 무적 +0.3초", ["defense"], { s: { invuln: 0.3 } });
P("balloon", 1, "🎈", "풍선", "대시 무적 시간 +0.25초", ["speed"], { s: { dashInvuln: 0.25 } });
P("bone", 1, "🦴", "뼈다귀", "하트를 먹으면 그 방에서 공격력 +10%", ["utility"], { s: { heartBuff: 0.10 } });
P("plume", 1, "🪶", "깃털 장식", "대시하는 동안 주변 적 탄을 지운다", ["speed", "defense"], { s: { dashCancel: true } });
P("candle", 1, "🕯️", "촛불", "방에 들어간 뒤 3초간 공격력 +25%", ["holy"], { s: { openDmg: 0.25 } });
P("brawler", 1, "🥊", "주먹맛", "가까이 있는 적(30 이내)에게 피해 +25%", ["melee"], { s: { near: 0.25 } });
P("eliteknife", 1, "🔪", "엘리트 사냥칼", "엘리트 적에게 피해 +30%", ["dark"], { s: { vsElite: 0.3 } });
// ── 일반 상태이상 ──
P("matchbox", 1, "🧨", "성냥갑", "공격이 10% 확률로 화상", ["fire"], { s: { burnP: 0.1 } });
P("snowflake", 1, "❄️", "눈송이", "공격이 12% 확률로 빙결 (보스는 둔화)", ["ice"], { s: { freeze: 0.12 } });
P("battery", 1, "🔋", "건전지", "공격이 15% 확률로 감전 (주변 적에게 번개)", ["electric"], { s: { shock: 0.15 } });
P("toadskin", 1, "🐸", "두꺼비 피부", "공격이 15% 확률로 중독", ["poison"], { s: { poison: 0.15 } });
P("razor", 1, "🪒", "면도날", "공격이 15% 확률로 출혈 (받는 피해 +25%)", ["blood"], { s: { bleed: 0.15 } });
// ── 일반 유틸/재화 ──
P("purse", 1, "👛", "동전 지갑", "[파티] 코인을 주울 때 10% 확률로 +1G", ["wealth"], { on: { coinPickup: (o, s) => { if (Math.random() < 0.1) o.game.gold += 1; } } });
P("oldbook", 1, "📖", "낡은 책", "[파티] 상점 가격 -10%", ["wealth"], { s: { "discount*": 0.9 } });
P("acorn", 1, "🌰", "도토리", "[파티] 상자·폭발 통을 부수면 코인 +2G 확정", ["wealth"], { s: { crateGold: 2 } });
P("shiny", 1, "💎", "반짝이는 돌", "[파티] 획득 골드 +15%", ["wealth"], { s: { "gold*": 1.15 } });
P("keyring", 1, "🗝️", "열쇠고리", "[파티] 방을 클리어할 때 20% 확률로 열쇠 +1", ["utility"], { on: { roomClear: o => { if (Math.random() < 0.2) o.game.keys = (o.game.keys ?? 0) + 1; } } });
P("mapfrag", 1, "🗺️", "낡은 지도 조각", "[파티] 미니맵에 상점·보물방·보스방이 보인다", ["utility"], { s: { mapSpecial: true } });
P("scarecrow", 1, "🪆", "허수아비", "방에 들어가면 적이 3초간 느려진다", ["utility"], { on: { roomEnter: (o, s, room) => { for (const e of o.game.enemies) { e.slowT = 3; e.slowMul = 0.5; } } } });
P("bubble", 1, "🫧", "보호막 거품", "방마다 한 번 맞아도 무효 (보호막 1)", ["defense"], { s: { roomShield: 1 } });
// ── 일반 스탯 변환 (한쪽을 주고 한쪽을 얻음) ──
P("longbarrel", 1, "🔭", "긴 총신", "사거리 +30%, 공격 속도 -15%", ["ranged"], { s: { "range*": 1.3, "atkSpeed*": 0.85 } });
P("shortfuse", 1, "🧵", "짧은 심지", "공격 속도 +30%, 사거리 -20%", ["speed"], { s: { "atkSpeed*": 1.3, "range*": 0.8 } });
P("heavyboots", 1, "🥾", "무거운 군화", "이동 속도 -15%, 공격력 +20%, 넉백 +20%", ["melee"], { s: { "speed*": 0.85, "dmg*": 1.2, "knock*": 1.2 } });
// ── 일반: 엉뚱한 소재지만 모두 게임에 영향을 준다 ──
P("redhat", 1, "🧢", "빨간 두건", "공격 중에도 느려지지 않는다, 이동 속도 +8%", ["speed"], { s: { noSlow: true, "speed*": 1.08 }, cos: { hat: "#e53935" } });
P("papercrown", 1, "👑", "종이 왕관", "팀 골드 10G마다 공격력 +4% (최대 +40%)", ["wealth"], { s: { richDmg: 0.004 }, cos: { crown: "#ffd54f" } });
P("sparkleshoes", 1, "👟", "반짝이 신발", "걸은 자리에 반짝이 장판이 남아 닿은 적에게 피해", ["speed"], { s: { trailWalk: true }, cos: { sparkle: true } });
P("squaretear", 1, "🟦", "네모난 눈물", "내 탄이 1.6배 커지고 넉백 +30%", ["ranged"], { s: { bulletSize: 0.6, "knock*": 1.3 }, cos: { shape: "square" } });
P("startear", 1, "⭐", "별 눈물", "공격할 때 30% 확률로 별 3개가 부채꼴로 함께 나간다", ["luck"], { s: { starProc: 0.3 }, cos: { shape: "star" } });
P("duckwhistle", 1, "🦆", "오리 호루라기", "공격할 때 6% 확률로 '꽥!' — 주변 적(보스 제외)이 0.9초 기절", ["utility"], { s: { quack: 0.06 }, cos: { sfx: "coin" } });
P("mustache", 1, "🥸", "콧수염", "대시할 때 수염 바람이 주변 적을 밀어내고 피해를 준다", ["speed"], { cos: { mustache: true }, on: { dash: (o, s) => { if (s === o) { const p = o.transform.position; o.game.shockwave(p.x, p.y, 34, 3, 220, o); } } } });
P("mismatch", 1, "🧦", "짝짝이 양말", "공격이 번갈아 나간다: 짝수 타는 공속 +30%, 홀수 타는 피해 +30%", ["speed"], { s: { alt: 0.3 } });
P("pebble", 1, "🪨", "조약돌", "대시한 뒤 1.5초 안의 첫 공격 피해 ×2.5", ["speed"], { s: { dashFirst: 1.5 } });
P("soapbar", 1, "🧼", "비누", "적이 죽은 자리에 3초간 미끄러운 거품 — 닿은 적이 느려진다", ["utility"], { on: { kill: (o, s, e) => { if (s === o) { const p = e.transform.position; spawnZone(o.game, o, p.x, p.y, { kind: "slow", r: 22, life: 3, tick: 0.3 }); } } } });
P("dicebox", 1, "🎲", "주사위 상자", "방에 들어갈 때마다 무작위 버프: 공격력/공속/이속 +30% 또는 보호막 +1", ["luck"], { on: { roomEnter: o => { const r = Math.floor(Math.random() * 4); if (r === 0) o.addBuff(60, 0.3, 0, 0); else if (r === 1) o.addBuff(60, 0, 0.3, 0); else if (r === 2) o.addBuff(60, 0, 0, 0.3); else o.shield = Math.min(2, o.shield + 1); } } });
P("roundglasses", 1, "🤓", "동그란 안경", "치명타 +12%, 근접 치명타가 적을 출혈시킨다", ["luck"], { s: { crit: 0.12, critBleed: true }, cos: { glasses: true } });
P("keycutter", 1, "🗝️", "열쇠 칼날", "열쇠 1개당 공격력 +8% (최대 +40%)", ["wealth"], { s: { keyDmg: 0.08 } });
P("patience", 1, "⏳", "인내심", "방에 오래 머물수록 공격력이 오른다 (30초에 최대 +50%)", ["utility"], { s: { roomRamp: 0.5 } });
P("quickclock", 1, "⏱️", "속전속결 시계", "방에 들어가고 12초 안에 클리어하면 3G 코인이 떨어진다", ["wealth"], { on: { roomClear: o => { if (o.roomT < 12 && o.alive) { const q = o.game._dropSpot(); o.game.spawnCoin(q.x, q.y, 3); } } } });
P("tinbell", 1, "🛎️", "양철 방울", "적을 처치하면 12% 확률로 그 자리에 폭탄이 놓인다", ["explosive"], { on: { kill: (o, s, e) => { if (s === o && Math.random() < 0.12) { const p = e.transform.position; o.game.spawnBomb(p.x, p.y, o); } } } });
// ================= 희귀 =================
P("hotonion", 2, "🌶️", "개매운 양파", "공격력 +10%, HP 2 회복", ["blood"], { s: { "dmg*": 1.10 }, heal: 2 });
P("rottenmush", 2, "🍄", "썩은 버섯", "최대 HP -1, 공격 속도 ×1.3", ["dark"], { hp: -1, s: { "atkSpeed*": 1.3 } });
P("millstone", 2, "🪨", "맷돌", "적을 처치하면 1초 무적", ["defense"], { s: { killInvuln: 1 } });
P("ember", 2, "🔥", "불씨", "공격에 화상 (3초간 초당 2피해)", ["fire"], { s: { burn: 1 } });
P("iceshard", 2, "🧊", "얼음 조각", "공격한 적을 둔화 (이동·공격 -50%)", ["ice"], { s: { slow: 1 } });
P("toyhammer", 2, "🔨", "장난감 망치", "공격 시 12% 확률로 적 기절", ["melee"], { s: { stunChance: 0.12 } });
P("glitter", 2, "✨", "반짝이 가루", "치명타 +15% (피해 2배)", ["luck"], { s: { crit: 0.15 } });
P("fang", 2, "🦷", "송곳니", "적 처치 시 3% 확률로 HP +1", ["blood"], { s: { lifesteal: 0.03 } });
P("shell", 2, "🐚", "가시 껍질", "맞으면 주변 적에게 피해·넉백", ["defense"], { s: { thorns: 1 } });
P("lens", 2, "🔍", "렌즈", "원거리 무기 탄 +1", ["ranged"], { s: { extraShots: 1 } });
P("arrowhead", 2, "🏹", "관통 화살촉", "원거리 탄이 적을 관통", ["ranged"], { s: { pierce: true } });
P("clover", 2, "🍀", "네잎 클로버", "[파티] 코인을 주울 때 15% 확률로 2배", ["wealth", "luck"], { on: { coinPickup: (o, s, v) => { if (Math.random() < 0.15) o.game.gold += (v || 1); } } });
P("looter", 2, "🎒", "도굴꾼 주머니", "[파티] 방 클리어 시 +1G, 큰 동전이 나올 확률 증가", ["wealth"], { s: { roomGold: 1, coinLuck: 0.1 } });
P("piggy", 2, "🐷", "저금통", "[파티] 방 클리어마다 보유 골드의 10% 이자(최대 +5G)", ["wealth"], { s: { interest: 1 } });
P("coupon", 2, "🎫", "쿠폰", "[파티] 상점에서 처음 사는 물건 반값", ["wealth"], { s: { firstHalf: true } });
P("berserk", 2, "🩸", "광전사의 피", "HP가 낮을수록 공격력 최대 +60%", ["blood"], { s: { berserk: 0.6 } });
P("glass", 2, "🥂", "유리 대포", "최대 HP -2, 공격력 +50%", ["dark"], { hp: -2, s: { "dmg*": 1.5 } });
P("sneakers", 2, "👟", "운동화", "이동하는 동안 공격 속도 +20%", ["speed"], { s: { moveAtk: 0.2 } });
P("ring", 2, "💍", "신속의 반지", "치명타가 터지면 공격 쿨다운 즉시 초기화", ["luck"], { s: { critReset: true } });
P("glove", 2, "🥊", "힘의 장갑", "근접 무기 공격력 +30%", ["melee"], { s: { "dmgMelee*": 1.3 } });
P("archglove", 2, "🧤", "사수의 장갑", "원거리 무기 공격력 +30%", ["ranged"], { s: { "dmgRanged*": 1.3 } });
P("band", 2, "🪢", "질풍의 띠", "대시로 지나간 적에게 피해", ["speed"], { s: { dashDmg: 1 } });
P("charm", 2, "🧿", "푸른 눈 부적", "12% 확률로 피해 무효, 무효 시 충격파(적 밀침·탄 제거)", ["defense", "holy"], { s: { dodge: 0.12, dodgeShock: 1 } });
P("compass", 2, "🧭", "나침반", "[파티] 미니맵에 층 전체가 보임", ["utility"], { s: { compass: true } });
P("incense", 2, "🪔", "치유의 향로", "방 클리어 시 25% 확률로 HP +1", ["holy"], { s: { roomHeal: 0.25 } });
P("pole", 2, "📏", "장대", "사거리 +20%", ["utility"], { s: { "range*": 1.2 } });
P("mirror2", 2, "🪞", "강화 거울", "되받아친 탄 피해 2배 (반사 거울 필요)", ["defense"], { s: { reflect: 1 } });
P("necklace", 2, "📿", "하트 목걸이", "방 클리어 시 12% 확률로 하트가 떨어진다", ["holy"], { on: { roomClear: o => { if (Math.random() < 0.12) o.game.spawnHeart(0, 22); } } });
// ── 희귀 상태이상/폭발/연쇄 ──
P("flamering", 2, "🔆", "불꽃 반지", "화상 중인 적에게 피해 +30%", ["fire"], { s: { vsBurn: 0.3 } });
P("lavastone", 2, "🌋", "용암석", "화상 중인 적이 죽으면 폭발", ["fire", "explosive"], { s: { killBurst: 1 } });
P("shatterhammer", 2, "🔱", "얼음 쪼개기", "얼어붙거나 느려진 적이 죽으면 산산조각", ["ice"], { s: { shatter: 1 } });
P("coil", 2, "🧲", "코일", "번개가 적 사이를 튄다 (모든 공격 +1마리 연쇄), 감전 10%", ["electric"], { s: { chain: 1, shock: 0.1 } });
P("venomvial", 2, "🧪", "독약병", "공격이 30% 확률로 중독", ["poison"], { s: { poison: 0.3 } });
P("bloodthirst", 2, "🧛", "피의 갈증", "출혈 중인 적을 처치하면 20% 확률로 HP +1, 출혈 25%", ["blood"], { s: { bloodHeal: 0.2, bleed: 0.25 } });
P("dynamite", 2, "🧨", "다이너마이트", "적을 처치하면 작은 폭발", ["explosive"], { s: { killBoom: 1 } });
P("shrapnel", 2, "💣", "파편", "내 탄이 처음 맞힌 순간 2개의 작은 탄으로 갈라진다", ["explosive", "ranged"], { s: { split: 2 } });
// ── 희귀 탄 개조 / 형태 ──
P("spring", 2, "🌀", "용수철", "내 탄이 벽과 지형에 2번 튕긴다 (검기 포함)", ["ranged"], { s: { bounce: 2 } });
P("needlecompass", 2, "🧭", "나침 바늘", "내 탄이 가까운 적 쪽으로 휘어진다 (검기 포함)", ["ranged"], { s: { homing: 1.4 } });
P("needlepoint", 2, "📍", "바늘 끝", "찌르기가 관통 바늘 2개를 함께 쏜다", ["melee", "ranged"], { s: { eThrust: 2 } });
P("longhandle", 2, "🪄", "긴 자루", "휘두르기가 찌르기로 바뀐다 (사거리 +30%, 피해 +10%)", ["melee"], { conv: { slash: "thrust" }, prio: 1 });
P("broadblade", 2, "🗡️", "넓은 날", "찌르기가 부채꼴 휘두르기로 바뀐다", ["melee"], { conv: { thrust: "slash" }, prio: 1 });
P("photonmirror", 2, "🔦", "광자 거울", "레이저가 관통 투사체로 바뀐다", ["ranged"], { conv: { laser: "projectile" }, prio: 1 });
P("beamsplitter", 2, "🔀", "광선 분할기", "투사체를 쏠 때 즉시 광선 한 줄이 함께 나간다", ["ranged", "electric"], { s: { eProj: 1 } });
// ── 희귀 방어/유틸/대상별 ──
P("padlock", 2, "🔒", "자물쇠", "피격 후 무적 +0.6초", ["defense"], { s: { invuln: 0.6 } });
P("adrenaline", 2, "💉", "아드레날린", "맞으면 3초간 이동 속도 +30%, 공격 속도 +30%", ["blood", "speed"], { s: { hurtBuff: 0.3 } });
P("comboglove", 2, "🥋", "연타 장갑", "연속으로 맞힐수록 공격 속도 +3% (최대 10단계, 3초 유지)", ["speed"], { s: { combo: 0.03 } });
P("sniper", 2, "🎯", "저격 훈련", "멀리 있는 적(70 이상)에게 피해 +25%", ["ranged"], { s: { far: 0.25 } });
P("ambush", 2, "🕶️", "기습", "체력이 가득한 적에게 첫 타 피해 +40%", ["dark"], { s: { vsFull: 0.4 } });
P("lastgasp", 2, "🕰️", "마지막 숨", "HP가 1일 때 공격력 +80%, 공격 속도 +40%", ["blood"], { s: { lowHp: 0.8 } });
P("coffee", 2, "☕", "진한 커피", "이동 속도 +25%, 공격 속도 +10%, 최대 HP -1", ["speed"], { hp: -1, s: { "speed*": 1.25, "atkSpeed*": 1.1 } });
P("bloodpact", 2, "📜", "피의 서약", "최대 HP -1, 공격력 +25%, 처치 시 6% 확률로 HP +1", ["blood", "dark"], { hp: -1, s: { "dmg*": 1.25, lifesteal: 0.06 } });
P("luckycoin", 2, "🪙", "행운의 동전", "[파티] 큰 동전(3·5·10G)이 나올 확률 증가, 상자 운 증가", ["wealth", "luck"], { s: { coinLuck: 0.15, chestLuck: 0.1 } });
P("thiefglove", 2, "🧤", "도둑 장갑", "[파티] 상자를 열 때 30% 확률로 +3G", ["wealth", "luck"], { on: { chestOpen: o => { if (Math.random() < 0.3) o.game.gold += 3; } } });
P("heartshare", 2, "💞", "나눔 하트", "HP가 가득일 때 하트를 먹으면 가장 아픈 아군을 1 치유", ["coop", "holy"], { on: { heartPickup: (o, s) => { if (s === o && o.hp >= o.maxHp) { const a = lowestAlly(o.game, o); if (a && a.hp < a.maxHp) { a.heal(1); o.game.puff(a, ["#f48fb1", "#fff"]); } } } } });
P("cheerstick", 2, "📣", "응원봉", "가까운 아군(75 이내)의 공격 속도 +15%", ["coop", "speed"], { s: { auraAtk: 0.15 } });
P("revivebell", 2, "🔔", "회복의 종", "보스방을 클리어하면 모든 아군 HP +1", ["coop", "holy"], { on: { roomClear: (o, s, room) => { if (room && room.type === "boss") for (const h of o.game.heroes) if (h.alive) h.heal(1); } } });
// ── 희귀 동료(따라다니는 도우미) ──
P("starbug", 2, "🐞", "별벌레", "주변을 돌며 가까운 적에게 작은 별을 쏜다", ["familiar"], { fam: "starbug" });
P("shieldbug", 2, "🪲", "방패 딱정벌레", "주변을 돌며 닿는 적 탄을 막아 준다", ["familiar", "defense"], { fam: "shieldbug" });
P("flamesprite", 2, "🔥", "불꽃 정령", "따라다니며 닿는 적에게 화상", ["familiar", "fire"], { fam: "flamesprite" });
P("babyghost", 2, "👻", "아기 유령", "넓게 돌며 닿는 적에게 피해", ["familiar", "dark"], { fam: "babyghost" });
// ── 희귀: 엉뚱하지만 게임에 영향을 주는 것 ──
P("rainbowaura", 2, "🌈", "무지개 후광", "6초마다 주변 적에게 무작위 상태이상(화상·둔화·감전·중독·출혈)", ["utility"], { s: { pulse: true }, cos: { aura: true } });
P("fartcushion", 2, "💨", "방귀 쿠션", "대시할 때 지나간 자리에 독가스 구름이 3초간 남는다", ["poison"], { on: { dash: (o, s) => { if (s === o) { const p = o.transform.position; for (let k = 0; k < 2; k++) spawnZone(o.game, o, p.x + Math.cos(o.dashDir) * 18 * k, p.y + Math.sin(o.dashDir) * 18 * k, { kind: "poison", r: 16, life: 3, tick: 0.4, dmg: 0.5 * o.stats.dmg }); } } } });
P("confetti", 2, "🎊", "폭죽 통", "HP가 가득일 때 적을 처치하면 폭죽이 터져 주변에 피해", ["explosive"], { on: { kill: (o, s, e) => { if (s === o && o.hp >= o.maxHp) { const p = e.transform.position; itemsAoe(o.game, p.x, p.y, 30, 3 * o.stats.dmg, o, ["#ef5350", "#ffee58", "#66bb6a", "#42a5f5"]); } } } });
// ── 희귀: 분신·조종·반복 공격 ──
P("mirrorself", 2, "🪞", "거울 분신", "뒤에 분신이 생겨 내 공격을 반대 방향으로 따라한다 (피해 60%)", ["clone"], { s: { cloneBehind: 1 } });
P("shadowtwin", 2, "👥", "그림자 쌍둥이", "1초 전 내 위치를 따라다니는 분신이 같은 방향으로 공격을 따라한다 (피해 60%)", ["clone", "dark"], { s: { twin: 1 } });
P("delayecho", 2, "🔔", "잔향의 종", "3번째 공격마다 0.5초 뒤 같은 자리에서 한 번 더 울린다 (피해 70%)", ["clone"], { s: { delayEcho: 3 } });
P("spinblades", 2, "🌀", "회전 칼날", "몸 주위를 도는 칼날 2개 — 닿은 적에게 피해, 적 탄도 쳐낸다", ["melee", "defense"], { s: { blades: 2 } });
P("curveshot", 2, "↪️", "휘는 탄", "내 탄이 이동하는 방향으로 휘어진다 (이동 스틱으로 조종)", ["ranged"], { s: { curve: 1 } });
P("chargeglove", 2, "🔋", "충전 장갑", "공격을 멈추고 있으면 충전된다 — 1.3초 쉬면 다음 공격 피해 ×2.5", ["luck"], { s: { charge: 1.5 } });
P("turretbox", 2, "🧰", "포탑 상자", "적을 10마리 처치할 때마다 그 자리에 10초간 자동 포탑이 선다", ["explosive", "utility"], { on: { kill: (o, s, e) => { if (s === o && ++o.killN % 10 === 0) { const p = e.transform.position; spawnTurret(o.game, o, p.x, p.y, 10); } } } });
P("streak", 2, "🏅", "무결점 행진", "안 맞고 처치할수록 공격력 +3% (최대 +50%), 맞으면 초기화", ["luck"], { s: { streakDmg: 0.03 }, on: { kill: (o, s) => { if (s === o) o.streak++; }, damaged: (o, s) => { if (s === o) o.streak = 0; } } });
P("demolish", 2, "🔨", "철거반 망치", "근접·레이저가 바위도 부순다 (원래는 폭발만 가능)", ["melee", "utility"], { s: { demolish: true } });
P("bullettime", 2, "⌛", "위기의 집중", "HP가 3분의 1 이하면 모든 적이 절반 속도로 움직인다", ["defense"], { s: { bulletTime: true } });
P("lingerfire", 2, "🕯️", "불씨 장판", "공격이 20% 확률로 맞은 자리에 2.5초간 타는 장판을 남긴다", ["fire"], { on: { hit: (o, s, e) => { if (s === o && Math.random() < 0.2) { const p = e.transform.position; spawnZone(o.game, o, p.x, p.y, { kind: "fire", r: 15, life: 2.5, tick: 0.4, dmg: 0.4 * o.stats.dmg }); } } } });
P("slotgrip", 2, "🎰", "슬롯 손잡이", "방을 클리어하면 25% 확률로 코인·열쇠·꾸러미·하트 중 하나가 더 떨어진다", ["wealth", "luck"], { on: { roomClear: o => { const g = o.game; if (o !== g.heroes[0] || Math.random() > 0.25 + 0.05 * (g.heroes.length - 1)) return; const q = g._dropSpot(), r = Math.random(); if (r < 0.4) g.spawnCoin(q.x, q.y, 5); else if (r < 0.65) g.spawnKey(q.x, q.y); else if (r < 0.85) g.spawnBundle(q.x, q.y); else g.spawnHeart(q.x, q.y); } } });
P("teamoath", 2, "🤝", "희생의 서약", "[파티] 모두 공격력 +12%, 나는 최대 HP -1", ["coop"], { hp: -1, s: { teamDmg: 0.12 } });
// ================= 영웅 =================
P("redonion", 3, "🧅", "적양파", "공격력 +25%, HP 3 회복", ["blood"], { s: { "dmg*": 1.25 }, heal: 3 });
P("rainbowmush", 3, "🍄", "알록달록 버섯", "최대 HP +1, 공격력 ×1.3, 이동 +15%, 공격속도 +0.15, 사거리 +5%", ["luck"], { hp: 1, s: { "dmg*": 1.3, "speed*": 1.15, atkSpeed: 0.15, "range*": 1.05 } });
P("swordaura", 3, "🌙", "초승달 조각", "휘두르면 검기, 찌르면 바늘이 함께 나간다 (관통)", ["holy", "melee"], { s: { eSlash: 1, eThrust: 1 } });
P("executioner", 3, "🎖️", "처형자의 휘장", "체력 15% 이하 일반 적 즉사", ["dark"], { s: { execute: 0.15 } });
P("echoblade", 3, "🗡️", "메아리 칼날", "20% 확률로 한 번 더 공격", ["speed"], { s: { doubleSwing: 0.2 } });
P("blastorb", 3, "💥", "폭발 구슬", "맞힌 적 주변에 작은 폭발", ["explosive"], { s: { explode: 1 } });
P("sigil", 3, "☯️", "흡혈 문양", "15번 맞힐 때마다 HP +1", ["blood"], { s: { leech: 1 } });
P("mirror", 3, "🪞", "반사 거울", "근접 공격이 적 탄을 되받아친다", ["defense"], { s: { deflect: 2 } });
P("ankh", 3, "☥", "앙크", "죽으면 1회 부활", ["holy"], { s: { extraLives: 1 } });
P("bigheart", 3, "❤️", "체력의 심장", "최대 HP +2, HP가 가득이면 공격 속도 +12%", ["holy"], { hp: 2, s: { fullHpAtk: 0.12 } });
P("goldtooth", 3, "🪙", "황금 이빨", "[파티] 획득 골드 +40%, 엘리트방 클리어 시 +4G", ["wealth"], { s: { "gold*": 1.4 }, on: { roomClear: (o, s, room) => { if (room && room.type === "elite") o.game.gold += 4; } } });
P("haggler", 3, "🛒", "상인의 안목", "[파티] 상점 가격 -30%, 상점 품목 +2개", ["wealth"], { s: { "discount*": 0.7, shopExtra: 2 } });
P("basket", 3, "🧺", "과일 바구니", "최대 HP +1, 공격 속도 +15%, 이동 +8%", ["utility"], { hp: 1, s: { "atkSpeed*": 1.15, "speed*": 1.08 } });
P("skull", 3, "💀", "수정 해골", "공격력 +15%, 치명타 +10%, 화상", ["fire", "dark"], { s: { "dmg*": 1.15, crit: 0.10, burn: 1 } });
// ── 영웅 형태 변환 (무기의 모양 자체가 바뀐다) ──
P("lensfocus", 3, "🔬", "집광 렌즈", "투사체가 짧게 이어지는 레이저로 바뀐다", ["ranged", "fire"], { conv: { projectile: "laser" }, prio: 3 });
P("thrownblade", 3, "🌀", "던지는 칼날", "근접 공격이 칼날을 던지는 원거리 공격으로 바뀐다", ["ranged", "melee"], { conv: { slash: "projectile", thrust: "projectile" }, prio: 3 });
P("prism", 3, "🔺", "프리즘", "레이저가 좌우로 갈라져 3줄이 된다", ["ranged", "holy"], { s: { eLaser: 1 } });
P("boomerangring", 3, "⭕", "회귀의 고리", "내 탄이 나갔다가 돌아온다 (돌아오며 관통)", ["ranged"], { s: { boomerang: true } });
// ── 영웅 상태이상 ──
P("frostbook", 3, "📘", "서리 마법서", "공격이 25% 확률로 빙결, 얼어붙은 적에게 피해 +40%", ["ice"], { s: { freeze: 0.25, vsFrozen: 0.4 } });
P("stormcloud", 3, "⛈️", "먹구름", "공격이 25% 확률로 감전, 번개가 한 번 더 튄다", ["electric"], { s: { shock: 0.25, chain: 1 } });
P("plaguemask", 3, "😷", "역병 가면", "중독 20%, 중독된 적이 죽으면 독이 주변으로 번진다", ["poison"], { s: { poison: 0.2, plague: 1 } });
// ── 영웅 유틸/방어/협동 ──
P("holyshield", 3, "🛡️", "성스러운 방패", "방마다 보호막 1, 보호막이 깨질 때 충격파", ["defense", "holy"], { s: { roomShield: 1 }, on: { shieldBreak: (o, s) => { if (s === o) { const p = o.transform.position; o.game.shockwave(p.x, p.y, 45, 3, 200, o); } } } });
P("springshoes", 3, "🩴", "용수철 신발", "대시를 2번 연속 쓸 수 있다, 대시 재사용 -15%", ["speed"], { s: { dashExtra: 1, "dashCd*": 0.85 } });
P("killstreak", 3, "🩸", "연쇄 살육", "적을 처치하면 2초간 공격 속도 +25%", ["blood", "speed"], { s: { killAtk: 0.25 } });
P("bossslayer", 3, "🗿", "보스 사냥꾼", "보스에게 피해 +30%", ["dark"], { s: { vsBoss: 0.3 } });
P("linkthread", 3, "🧶", "연결의 실", "가까운 아군과 실로 이어져, 실에 닿은 적이 피해를 입는다", ["coop", "electric"], { s: { link: 1 } });
P("mentorseal", 3, "🏵️", "사부의 인장", "가까운 아군(75 이내)의 공격력 +12%", ["coop", "holy"], { s: { auraDmg: 0.12 } });
P("fairy", 3, "🧚", "요정", "따라다니며 방을 3번 클리어할 때마다 가장 아픈 아군을 치유", ["familiar", "holy", "coop"], { fam: "fairy", on: { roomClear: (o, s, room) => { o.fairyN = (o.fairyN || 0) + 1; if (o.fairyN % 3 === 0) { const a = lowestAlly(o.game, null); if (a && a.hp < a.maxHp) { a.heal(1); o.game.puff(a, ["#f8bbd0", "#fff"]); } } } } });

// ── 영웅: 분신·조종·릴레이 ──
P("phantom", 3, "👻", "분신 인형", "내 앞에 분신이 서서 내 공격을 그 자리에서 따라한다 (피해 60%)", ["clone", "dark"], { s: { cloneAhead: 1 } });
P("ludoorb", 3, "🔮", "조종 구슬", "공격 스틱을 끄는 방향·세기로 구슬이 날아가 닿는 적을 벤다 (스틱을 놓으면 몸 주위를 돈다)", ["ranged", "luck"], { s: { ludo: 1 } });
P("ludoblade", 3, "🗡️", "유령 검", "공격 스틱을 끄는 대로 움직이는 검 — 닿는 적에게 큰 피해", ["melee", "dark"], { s: { ludo: 2 } });
P("relay", 3, "🏃", "릴레이 배턴", "[파티] 가까운 아군(150 이내)이 내 공격을 자기 자리에서 따라한다 (피해 40%)", ["coop", "clone"], { s: { relay: 1 } });

for (const it of Object.values(PASSIVES)) it.price = ITEM_TIERS[it.tier].price;
const ITEMS = PASSIVES; // (예전 이름)

// ============================================================================
// 동료(Familiar): 플레이어를 따라다니는 작은 도우미. 충돌체 없이 0.1~0.4초마다 범위 질의만 한다(가볍다).
// ============================================================================
const FAMS = {
  starbug:     { color: "#ffd54f", orbit: 19, spd: 2.6 },
  shieldbug:   { color: "#80cbc4", orbit: 15, spd: 3.4 },
  flamesprite: { color: "#ff7043", follow: true },
  babyghost:   { color: "#eceff1", orbit: 27, spd: 1.7 },
  fairy:       { color: "#f48fb1", follow: true },
};
class Familiar extends Component {
  constructor(game, owner, type) { super(); this.game = game; this.owner = owner; this.type = type; this.cfg = FAMS[type]; this.t = Math.random() * 6; this.idx = 0; this.at = 0.5; this.buf = []; this.snd = 0; }
  setup() {
    const c = this.cfg, type = this.type;
    this.draw = this.gameObject.addComponent(new DrawRenderer(ctx => {
      const bob = Math.sin(this.t * 5) * 0.8; ctx.fillStyle = c.color; ctx.strokeStyle = "#0008"; ctx.lineWidth = 0.8;
      if (type === "starbug") { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 + this.t * 2, r = i % 2 ? 2.4 : 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else if (type === "shieldbug") { ctx.beginPath(); ctx.ellipse(0, bob, 5, 3.6, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.fillRect(-1, bob - 1, 2, 2); }
      else if (type === "flamesprite") { ctx.beginPath(); ctx.moveTo(0, 6 + bob); ctx.lineTo(-4, -2 + bob); ctx.lineTo(0, -5 + bob); ctx.lineTo(4, -2 + bob); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#ffee58"; ctx.fillRect(-1, bob - 2, 2, 3); }
      else if (type === "babyghost") { ctx.globalAlpha *= 0.85; ctx.beginPath(); ctx.arc(0, bob, 4.4, Math.PI, 0); ctx.lineTo(4.4, bob - 4); ctx.lineTo(0, bob - 3); ctx.lineTo(-4.4, bob - 4); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#000"; ctx.fillRect(-2.2, bob + 0.5, 1.4, 1.4); ctx.fillRect(1, bob + 0.5, 1.4, 1.4); }
      else { ctx.beginPath(); ctx.arc(0, bob, 2.6, 0, 7); ctx.fill(); ctx.globalAlpha *= 0.6; ctx.fillStyle = "#fff"; const w = Math.sin(this.t * 22) * 1.6; ctx.beginPath(); ctx.ellipse(-3.6, bob + 1, 3, 1.6 + w * 0.3, -0.5, 0, 7); ctx.ellipse(3.6, bob + 1, 3, 1.6 + w * 0.3, 0.5, 0, 7); ctx.fill(); }
    }, 12, { order: 4 }));
  }
  update(dt) {
    const o = this.owner, g = this.game; if (!o || o.gameObject.isDestroyed) return;
    this.t += dt; const op = o.transform.position, c = this.cfg, p = this.transform.position, alive = o.alive;
    this.draw.opacity = alive ? 1 : 0;
    let tx, ty;
    if (c.orbit) { const a = this.t * c.spd + this.idx * 2.4; tx = op.x + Math.cos(a) * c.orbit; ty = op.y + Math.sin(a) * c.orbit; }
    else { tx = op.x - 11 - this.idx * 7; ty = op.y + 9 + Math.sin(this.t * 3 + this.idx) * 2; }
    const k = Math.min(1, dt * (c.orbit ? 14 : 7)), dx = tx - p.x, dy = ty - p.y;
    if (dx * dx + dy * dy > 90 * 90) this.transform.setPosition(tx, ty); else this.transform.setPosition(p.x + dx * k, p.y + dy * k);
    if (!alive) return;
    this.at -= dt; if (this.at > 0) return;
    const mul = o.stats.dmg * (o.sets.familiar ? 1.5 : 1), q = this.transform.position, buf = this.buf, ty2 = this.type;
    if (ty2 === "starbug") {
      this.at = 1.3; let best = null, bd = 130 * 130;
      for (const e of g.enemies) { if (e.dead || e.spawnDelay > 0) continue; const ep = e.transform.position, d = (ep.x - q.x) * (ep.x - q.x) + (ep.y - q.y) * (ep.y - q.y); if (d < bd) { bd = d; best = ep; } }
      if (best) g.spawnProj(q.x, q.y, Math.atan2(best.y - q.y, best.x - q.x), 170, 0.9 * mul, true, { owner: o, life: 0.8, radius: 2, color: "#ffd54f", shape: "star" });
    } else if (ty2 === "shieldbug") {
      this.at = 0.08; const n = Physics.overlapCircle(q.x, q.y, 7, PL.EProj, buf);
      for (let i = 0; i < n; i++) { const pr = buf[i].data; if (pr.fromPlayer || pr.gameObject.isDestroyed || pr.orbit) continue; const pp = pr.transform.position; g.fx.emit(pp.x, pp.y, { count: 3, colors: ["#80cbc4", "#fff"], speed: [15, 40], life: [0.1, 0.25], size: [1, 1.5], fade: true }); pr.gameObject.destroy(); if (this.snd <= 0) { SFX.play("block"); this.snd = 0.15; } }
      this.snd -= 0.08;
    } else if (ty2 === "flamesprite") {
      this.at = 0.3; const n = Physics.overlapCircle(q.x, q.y, 13, PL.Enemy, buf);
      for (let i = 0; i < n; i++) { const e = buf[i].data; if (e.dead || e.spawnDelay > 0) continue; e.addStatus("burn", 1, o); e.damage(0.8 * mul, o, 0, 0, true); }
    } else if (ty2 === "babyghost") {
      this.at = 0.35; const n = Physics.overlapCircle(q.x, q.y, 8, PL.Enemy, buf);
      for (let i = 0; i < n; i++) { const e = buf[i].data; if (e.dead || e.spawnDelay > 0) continue; const ep = e.transform.position; e.damage(1.3 * mul, o, Math.atan2(ep.y - q.y, ep.x - q.x), 50, true); }
    } else this.at = 1;
  }
}

// ============================================================================
// 액티브 아이템: 한 명당 1개. 새로 얻으면 들고 있던 것은 바닥에 떨어진다.
//   kind "charge"  : 방을 클리어하면 충전 1 (큰 방은 2). max까지 모인다.  use 한 번에 충전 1 소모
//   kind "cooldown": 쿨타임(cd초)이 지나면 다시 쓸 수 있다.
//   kind "kill"    : 적을 per마리 처치할 때마다 충전 1 (최대 max)       kind "dmg": 피해를 per만큼 줄 때마다 충전 1 (최대 max)
//   kind "floor"   : 층이 시작될 때 max회로 채워진다 (그 층에서 max번 쓸 수 있다)
//   use(hero, game) → true면 사용됨 (false면 소모 안 함)
// ============================================================================
const ACTIVES = {
  vial:      { tier: 1, icon: "🧪", name: "붉은 약병",   kind: "charge", max: 3, desc: "HP 2 회복",
               use(h, g) { if (h.hp >= h.maxHp) return false; h.heal(2); g.puff(h, ["#ef5350", "#fff"]); SFX.play("swap"); return true; } },
  feather:   { tier: 1, icon: "🪽", name: "도약의 깃털", kind: "cooldown", cd: 8, desc: "바라보는 방향으로 도약 (0.5초 무적)",
               use(h, g) { const p = h.transform.position; g.puff(h, ["#fff", "#b3e5fc"]); const [x, y] = g.pushOut(p.x + Math.cos(h.facing) * 62, p.y + Math.sin(h.facing) * 62, h.radius); h.transform.setPosition(Math.max(-ARENA.w / 2 + 7, Math.min(ARENA.w / 2 - 7, x)), Math.max(-ARENA.h / 2 + 7, Math.min(ARENA.h / 2 - 7, y))); h.invuln = Math.max(h.invuln, 0.5); g.puff(h, ["#fff", "#b3e5fc"]); SFX.play("door"); return true; } },
  bomb:      { tier: 1, icon: "💣", name: "폭탄 가방",   kind: "charge", max: 1, desc: "1초 뒤 터지는 폭탄 설치 (바위·상자 파괴)",
               use(h, g) { const p = h.transform.position; g.spawnBomb(p.x, p.y, h); return true; } },
  coinflip:  { tier: 1, icon: "🪙", name: "동전 던지기", kind: "charge", max: 1, desc: "앞이면 팀 골드 +8G, 뒤면 아무 일도 없음",
               use(h, g) { if (Math.random() < 0.5) { g.addGold(8); g.puff(h, ["#ffca28", "#fff"]); SFX.play("coin"); } else g.puff(h, ["#9e9e9e"]); return true; } },
  shieldgen: { tier: 1, icon: "🔰", name: "휴대용 방패", kind: "charge", max: 2, desc: "보호막 1 (한 번 맞아도 무효, 최대 2)",
               use(h, g) { if (h.shield >= 2) return false; h.shield++; g.puff(h, ["#80deea", "#fff"]); SFX.play("swap"); return true; } },
  gather:    { tier: 1, icon: "📯", name: "집결 나팔",   kind: "cooldown", cd: 15, desc: "모든 아군을 내 곁으로 불러온다 (0.5초 무적)",
               use(h, g) { const p = h.transform.position; let n = 0; for (const o of g.heroes) { if (o === h || !o.alive) continue; const a = (n++) * 2.1; const [x, y] = g.pushOut(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, o.radius); o.transform.setPosition(x, y); o.invuln = Math.max(o.invuln, 0.5); g.puff(o, ["#fff", "#ffe082"]); } SFX.play("door"); return n > 0; } },
  horn:      { tier: 2, icon: "📯", name: "전쟁 나팔",   kind: "cooldown", cd: 20, desc: "주변 적 탄 제거 + 적을 밀어냄",
               use(h, g) { const p = h.transform.position; g.shockwave(p.x, p.y, 95, 3, 240, h); return true; } },
  drum:      { tier: 2, icon: "🥁", name: "분노의 북",   kind: "charge", max: 3, desc: "방 안의 모든 적에게 피해",
               use(h, g) { for (const e of g.enemies) { if (e.dead || e.spawnDelay > 0) continue; const ep = e.transform.position; e.damage(6 * h.stats.dmg, h, Math.atan2(ep.y - h.transform.position.y, ep.x - h.transform.position.x), 40); g.fx.emit(ep.x, ep.y, { count: 4, colors: ["#ff8a65", "#fff"], speed: [20, 60], life: [0.15, 0.3], size: [1, 2], fade: true }); } g.cam.shake(4, 0.3); SFX.play("boom"); return true; } },
  hourglass: { tier: 2, icon: "⏳", name: "모래시계",     kind: "charge", max: 3, desc: "5초간 모든 적 둔화",
               use(h, g) { for (const e of g.enemies) { if (e.dead) continue; e.slowT = 5; e.slowMul = 0.4; } g.cam.shake(1.5, 0.2); SFX.play("warn"); return true; } },
  freezeblast: { tier: 2, icon: "🌨️", name: "서리 폭풍", kind: "cooldown", cd: 22, desc: "주변 90 안의 적을 얼린다 (보스는 둔화)",
               use(h, g) { const p = h.transform.position; itemsAoe(g, p.x, p.y, 90, 0, h, ["#e1f5fe", "#81d4fa"], e => e.addStatus("freeze", 1, h)); g.cam.shake(1.5, 0.2); SFX.play("warn"); return true; } },
  poisoncloud: { tier: 2, icon: "☠️", name: "독안개 병", kind: "charge", max: 2, desc: "방 안의 모든 적을 중독시킨다",
               use(h, g) { let n = 0; for (const e of g.enemies) { if (e.dead || e.spawnDelay > 0) continue; e.addStatus("poison", 1, h); n++; const ep = e.transform.position; g.fx.emit(ep.x, ep.y, { count: 3, colors: ["#9ccc65"], speed: [8, 24], life: [0.3, 0.5], size: [1.5, 2.5], fade: true }); } SFX.play("warn"); return n > 0; } },
  bloodrite: { tier: 2, icon: "🩸", name: "피의 의식",   kind: "cooldown", cd: 25, desc: "HP 1을 바치고 8초간 공격력 +60%, 공격 속도 +25%",
               use(h, g) { if (h.hp <= 1) return false; h.hp -= 1; h.addBuff(8, 0.6, 0.25, 0); g.puff(h, ["#e53935", "#fff"]); SFX.play("warn"); return true; } },
  rally:     { tier: 2, icon: "🚩", name: "응원 깃발",   kind: "cooldown", cd: 25, desc: "6초간 모든 아군 공격력 +10%, 공격 속도 +30%, 이동 +15%",
               use(h, g) { for (const o of g.heroes) if (o.alive) { o.addBuff(6, 0.1, 0.3, 0.15); g.puff(o, ["#ffe082", "#fff"]); } SFX.play("clear"); return true; } },
  lightning: { tier: 3, icon: "⚡", name: "번개 지팡이", kind: "cooldown", cd: 12, desc: "무작위 적 5명에게 번개",
               use(h, g) { const list = g.enemies.filter(e => !e.dead && e.spawnDelay <= 0).sort(() => Math.random() - 0.5).slice(0, 5); if (!list.length) return false; for (const e of list) { const ep = e.transform.position; e.damage(6 * h.stats.dmg, h, -Math.PI / 2, 30); g.fx.emit(ep.x, ep.y + 4, { count: 10, colors: ["#fff59d", "#fff"], speed: [30, 90], life: [0.15, 0.3], size: [1, 2], fade: true, angle: Math.PI / 2, spread: 0.6 }); } g.cam.shake(3, 0.2); SFX.play("boom"); return true; } },
  bell:      { tier: 3, icon: "🔔", name: "수호의 종",   kind: "charge", max: 3, desc: "4초간 무적 + 주변 적 탄 제거",
               use(h, g) { const p = h.transform.position; h.invuln = Math.max(h.invuln, 4); g.cancelProjectiles(p.x, p.y, 70); g.puff(h, ["#fff59d", "#fff"]); SFX.play("clear"); return true; } },
  mirrorshard: { tier: 3, icon: "🪞", name: "거울 조각", kind: "charge", max: 3, desc: "화면의 모든 적 탄을 적에게 되받아친다",
               use(h, g) { let tgt = null, bd = 1e9; const p = h.transform.position; for (const e of g.enemies) { if (e.dead || e.spawnDelay > 0) continue; const ep = e.transform.position, d = Math.hypot(ep.x - p.x, ep.y - p.y); if (d < bd) { bd = d; tgt = ep; } }
                 const dir = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : h.facing; let n = 0;
                 for (const pr of g.projs) { if (pr.fromPlayer || pr.gameObject.isDestroyed || pr.orbit) continue; pr.owner = h; pr.reflect(h, dir); n++; }
                 g.cam.shake(2, 0.2); SFX.play("clear"); return n > 0; } },
  // ── 주사위 · 방/아이템 조작 ──
  d1:        { tier: 1, icon: "🎲", name: "작은 주사위", kind: "charge", max: 2, desc: "가장 가까운 바닥 아이템 하나를 다른 것으로 바꾼다",
               use(h, g) { if (!rerollNearest(h, g)) return false; g.puff(h, ["#ce93d8", "#fff"]); SFX.play("item"); return true; } },
  d6:        { tier: 2, icon: "🎲", name: "붉은 주사위", kind: "charge", max: 4, desc: "가진 패시브를 모두 무작위 다른 아이템으로 바꾼다",
               use(h, g) { if (!rerollItems(h)) return false; g.puff(h, ["#ce93d8", "#fff"]); g.cam.shake(2, 0.2); SFX.play("item"); return true; } },
  bluedice:  { tier: 2, icon: "🎲", name: "푸른 주사위", kind: "charge", max: 3, desc: "현재 방에 떨어진 픽업(코인·열쇠·하트·상자·꾸러미)을 무작위 픽업으로 바꾼다",
               use(h, g) { if (!rerollRoomPickups(g)) return false; SFX.play("item"); return true; } },
  tarot:     { tier: 1, icon: "🃏", name: "점쟁이 카드", kind: "cooldown", cd: 25, desc: "바닥(상점 포함)의 아이템·무기를 다시 뽑는다",
               use(h, g) { return rerollPickups(g); } },
  alchemy:   { tier: 2, icon: "⚗️", name: "연금술 가루", kind: "charge", max: 2, desc: "바닥의 동전→열쇠→하트→동전으로 바꾼다",
               use(h, g) { return convertPickups(g); } },
  exchange:  { tier: 1, icon: "💱", name: "환전소", kind: "cooldown", cd: 10, desc: "6G를 열쇠 1개로 (골드가 모자라면 열쇠 1개를 4G로)",
               use(h, g) { if (g.gold >= 6) { g.gold -= 6; g.addKey(1); } else if (g.keys > 0) { g.keys--; g.gold += 4; } else return false; g.puff(h, ["#ffe082", "#fff"]); SFX.play("coin"); return true; } },
  roulette:  { tier: 1, icon: "🎡", name: "룰렛", kind: "charge", max: 2, desc: "무작위: 회복·골드·열쇠·무적·적 전체 피해 … 가끔 HP -1",
               use(h, g) { const r = Math.floor(Math.random() * 7); g.puff(h, ["#ffee58", "#fff"]); SFX.play("item");
                 if (r === 0) h.heal(2); else if (r === 1) g.addGold(10); else if (r === 2) g.addKey(2); else if (r === 3) h.invuln = Math.max(h.invuln, 4);
                 else if (r === 4) { for (const e of g.enemies) if (!e.dead && e.spawnDelay <= 0) e.damage(5 * h.stats.dmg, h, -Math.PI / 2, 30); } else if (r === 5) g.spawnBomb(h.transform.position.x, h.transform.position.y, h);
                 else if (h.hp > 1) { h.hp--; h.draw.flash = 0.1; } return true; } },
  // ── 이동 · 방 다시 돌기 ──
  scroll:    { tier: 2, icon: "📜", name: "텔레포트 두루마리", kind: "cooldown", cd: 35, desc: "보스방을 뺀 무작위 방으로 순간이동",
               use(h, g) { return warp(g, "random"); } },
  recall:    { tier: 1, icon: "🪨", name: "귀환석", kind: "floor", max: 1, desc: "시작 방으로 돌아간다 (층마다 1회)",
               use(h, g) { return warp(g, "start"); } },
  replay:    { tier: 3, icon: "⏪", name: "되감기 시계", kind: "charge", max: 3, desc: "클리어한 일반·엘리트 방을 한 번 더 — 적이 다시 나오고 보상도 다시 (방마다 1회)",
               use(h, g) { return replayRoom(g); } },
  // ── 소환 · 협동 ──
  clonecall: { tier: 2, icon: "🧍", name: "분신 소환", kind: "charge", max: 2, desc: "10초간 옆에서 내 공격을 따라하는 분신을 부른다",
               use(h, g) { spawnTempClone(g, h, 10); g.puff(h, ["#b39ddb", "#fff"]); SFX.play("swap"); return true; } },
  turretitem: { tier: 2, icon: "🗼", name: "포탑 설치", kind: "charge", max: 2, desc: "10초간 가까운 적을 쏘는 자동 포탑을 세운다",
               use(h, g) { const p = h.transform.position; spawnTurret(g, h, p.x + Math.cos(h.facing) * 14, p.y + Math.sin(h.facing) * 14, 10); SFX.play("swap"); return true; } },
  lifebell:  { tier: 3, icon: "🛎️", name: "부활의 종", kind: "charge", max: 4, desc: "쓰러진 아군 한 명을 HP 절반으로 되살린다",
               use(h, g) { const d = g.heroes.find(o => !o.alive); if (!d) return false; const p = h.transform.position; d.transform.setPosition(p.x + 12, p.y); d.revive(Math.ceil(d.maxHp / 2)); g.puff(d, ["#fff59d", "#fff"]); SFX.play("clear"); return true; } },
  transfusion: { tier: 2, icon: "💉", name: "수혈", kind: "cooldown", cd: 12, desc: "내 HP 1을 가장 아픈 아군에게 준다 (내 HP 2 이상일 때)",
               use(h, g) { const a = lowestAlly(g, h); if (!a || a.hp >= a.maxHp || h.hp < 2) return false; h.hp--; a.heal(1); g.puff(a, ["#ef5350", "#fff"]); SFX.play("swap"); return true; } },
  // ── 공격 ──
  voodoo:    { tier: 2, icon: "🪆", name: "저주 인형", kind: "charge", max: 3, desc: "모든 적에게 저주: 큰 피해 + 출혈 + 중독",
               use(h, g) { let n = 0; for (const e of g.enemies) { if (e.dead || e.spawnDelay > 0) continue; n++; const ep = e.transform.position; e.damage(4 * h.stats.dmg, h, -Math.PI / 2, 20); e.addStatus("bleed", 1, h); e.addStatus("poison", 1, h); g.fx.emit(ep.x, ep.y, { count: 4, colors: ["#7b1fa2", "#ce93d8"], speed: [10, 40], life: [0.2, 0.4], size: [1, 2], fade: true }); } SFX.play("warn"); return n > 0; } },
  vengeance: { tier: 2, icon: "🗡️", name: "복수의 칼날", kind: "kill", per: 12, max: 2, desc: "사방으로 관통 칼날 12발",
               use(h, g) { const p = h.transform.position; for (let k = 0; k < 12; k++) g.spawnProj(p.x, p.y, k * Math.PI / 6, 210, 2.5 * h.stats.dmg, true, { owner: h, pierce: true, life: 0.9, radius: 3, knock: 60, color: "#ef9a9a" }); SFX.play("boom"); return true; } },
  rage:      { tier: 3, icon: "💢", name: "분노 게이지", kind: "dmg", per: 90, max: 2, desc: "8초간 공격력 +70%, 공격 속도 +20%, 이동 +30%",
               use(h, g) { h.addBuff(8, 0.7, 0.2, 0.3); g.puff(h, ["#ff5252", "#fff"]); SFX.play("warn"); return true; } },
};
for (const it of Object.values(ACTIVES)) it.price = ITEM_TIERS[it.tier].price;
const CHARGED = { charge: 1, kill: 1, dmg: 1, floor: 1 }; // 충전 횟수로 쓰는 종류 (cooldown만 시간으로 쓴다)
const activeNote = def => def.kind === "charge" ? `방 클리어 ${def.max}번이면 충전 완료` : def.kind === "kill" ? `적 ${def.per * def.max}마리 처치하면 충전 완료` : def.kind === "dmg" ? `피해 ${def.per * def.max} 누적하면 충전 완료` : def.kind === "floor" ? `층마다 충전` : `쿨타임 ${def.cd}초`;
const activeLabel = a => a ? `${ACTIVES[a.id].icon}${ACTIVES[a.id].name} ${CHARGED[ACTIVES[a.id].kind] ? `${a.charge}/${ACTIVES[a.id].max}` : a.cdLeft > 0 ? Math.ceil(a.cdLeft) + "초" : "준비"}` : "";

// 모든 아이템 확률 균등. exclude: 이미 뽑은 id 집합 (모자라면 중복 허용)
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
const weaponPrice = w => [10, 15, 20, 27, 36][w.tier];
