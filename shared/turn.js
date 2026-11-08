// TURN 중계 서버 설정. 폰과 TV가 직접 연결(P2P)이 안 되는 네트워크(통신사망, 공유기 격리 등)에서 중계해 주는 서버.
// TURN 서비스(예: Metered, Cloudflare Realtime TURN 등)에서 발급받은 값을 아래에 채운다. 비워 두면 PeerJS 기본 공용 TURN만 쓴다.
// 주의: 이 파일은 공개 사이트에 그대로 올라가므로 값이 노출된다. 무료 한도용 키만 쓰고, 노출돼도 되는 키인지 확인할 것.
//
// 예)
// const TURN_SERVERS = [
//   { urls: ["turn:xxxx.relay.metered.ca:80", "turn:xxxx.relay.metered.ca:443", "turns:xxxx.relay.metered.ca:443?transport=tcp"],
//     username: "발급받은_username", credential: "발급받은_credential" },
// ];
const TURN_SERVERS = [];
