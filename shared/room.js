// 방 코드 <-> PeerJS ID. TV(tv.html)와 폰(pad.html)이 같이 쓴다.
// 헷갈리는 글자(0/O, 1/I/L)는 제외. 31^5 ≈ 2,800만 가지.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LEN = 5, PREFIX = "kuntogether-";
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(CODE_LEN)), b => ALPHABET[b % ALPHABET.length]).join("");
const normalizeCode = s => s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[O]/g, "").slice(0, CODE_LEN);
const codeToPeerId = code => PREFIX + code;

// PeerJS 공통 설정. config를 지정하면 PeerJS 기본 iceServers가 통째로 덮어써지므로, 기본값(STUN + 공용 TURN)을 다시 적고 개인 TURN을 더한다.
// TURN이 없으면 서로 다른 네트워크(LTE <-> 와이파이)에서 직접 연결이 막힐 때 negotiation-failed가 난다.
const BASE_ICE = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
  // PeerJS 라이브러리 기본값에 들어 있는 공용 TURN (개발용, 안정성 보장 없음)
  { urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" },
];
let _peerOptions = null;
// Worker에서 수명이 짧은 TURN 자격 증명을 받아 와서 PeerJS 옵션을 만든다. 실패해도(3초 제한) 기본값으로 진행한다.
async function getPeerOptions() {
  if (_peerOptions) return _peerOptions;
  let extra = [];
  if (typeof TURN_ENDPOINT !== "undefined" && TURN_ENDPOINT) {
    try {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 3000);
      const res = await fetch(TURN_ENDPOINT, { signal: ctl.signal }); clearTimeout(timer);
      if (res.ok) extra = (await res.json()).iceServers || [];
    } catch (e) { console.warn("TURN 자격 증명을 못 받았어요. 기본 설정으로 진행:", e); }
  }
  return (_peerOptions = { config: { iceServers: [...BASE_ICE, ...extra] } });
}
