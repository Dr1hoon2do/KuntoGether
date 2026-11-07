// 방 코드 <-> PeerJS ID. TV(tv.html)와 폰(pad.html)이 같이 쓴다.
// 헷갈리는 글자(0/O, 1/I/L)는 제외. 31^5 ≈ 2,800만 가지.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LEN = 5, PREFIX = "kuntogether-";
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(CODE_LEN)), b => ALPHABET[b % ALPHABET.length]).join("");
const normalizeCode = s => s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[O]/g, "").slice(0, CODE_LEN);
const codeToPeerId = code => PREFIX + code;

// PeerJS 공통 설정. STUN만 있으면 같은 와이파이에서는 되지만, 서로 다른 네트워크(LTE ↔ 와이파이)에서는 TURN이 필요할 수 있다.
const PEER_OPTIONS = {
  config: { iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ] },
};
