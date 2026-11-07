// 방 코드 <-> PeerJS ID. TV(tv.html)와 폰(pad.html)이 같이 쓴다.
// 헷갈리는 글자(0/O, 1/I/L)는 제외. 31^5 ≈ 2,800만 가지.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LEN = 5, PREFIX = "kuntogether-";
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(CODE_LEN)), b => ALPHABET[b % ALPHABET.length]).join("");
const normalizeCode = s => s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[O]/g, "").slice(0, CODE_LEN);
const codeToPeerId = code => PREFIX + code;
