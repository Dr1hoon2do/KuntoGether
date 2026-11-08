// 방 코드 <-> PeerJS ID. TV(tv.html)와 폰(pad.html)이 같이 쓴다.
// 헷갈리는 글자(0/O, 1/I/L)는 제외. 31^5 ≈ 2,800만 가지.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LEN = 5, PREFIX = "kuntogether-";
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(CODE_LEN)), b => ALPHABET[b % ALPHABET.length]).join("");
const normalizeCode = s => s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[O]/g, "").slice(0, CODE_LEN);
const codeToPeerId = code => PREFIX + code;

// PeerJS 공통 설정. config를 지정하면 PeerJS 기본 iceServers가 통째로 덮어써지므로, 기본값(STUN + 무료 TURN 중계)을 그대로 다시 적고 STUN만 더한다.
// TURN이 빠지면 서로 다른 네트워크(LTE <-> 와이파이)에서 직접 연결이 막힐 때 negotiation-failed가 난다.
const PEER_OPTIONS = {
  config: { iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
    // PeerJS 라이브러리 기본값에 들어 있는 공용 TURN (개발용, 안정성 보장 없음)
    { urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" },
    ...(typeof TURN_SERVERS !== "undefined" ? TURN_SERVERS : []), // shared/turn.js 에 채운 개인 TURN
  ] },
};
