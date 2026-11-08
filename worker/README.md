# TURN 자격 증명 Worker

폰과 TV가 직접 연결(P2P)이 안 되는 네트워크에서 쓰는 Cloudflare TURN의 **짧은 수명 자격 증명**을 발급해 주는 Worker.
API 토큰은 Worker 안에만 있고 사이트에는 들어가지 않는다.

## 배포 (대시보드에서)
1. Cloudflare 대시보드 → **Realtime → TURN** 에서 TURN 키를 만들고, **키 ID**와 **API 토큰**을 메모한다 (채팅·레포에 올리지 말 것).
2. **Workers & Pages → Create → Worker** 를 만들고, 이름은 예: `kuntogether-turn`. 에디터에 `turn-worker.js` 내용을 붙여넣고 Deploy.
3. Worker → **Settings → Variables and Secrets** 에 추가:
   - `TURN_KEY_ID` (Text) = 키 ID
   - `TURN_API_TOKEN` (**Secret**) = API 토큰
   - `ALLOWED_ORIGINS` (Text) = `https://dr1hoon2do.github.io` (사이트 주소, 여러 개면 쉼표로)
4. Worker 주소(`https://kuntogether-turn.<계정>.workers.dev`)를 `shared/turn.js`의 `TURN_ENDPOINT`에 넣고 푸시.

## 확인
- 사이트와 다른 주소에서 호출하면 403이어야 한다.
- 폰 접속 실패 시 뜨는 진단 줄에 `중계(TURN) 경로 있음`이 나오면 TURN이 붙은 것.

## 비상 정지
대시보드에서 TURN 키를 삭제(폐기)하면 즉시 발급이 막힌다. 사용량·청구 알림도 켜 둘 것.
