// Cloudflare Worker: TURN 서버용 "수명이 짧은" 자격 증명을 발급해 준다.
// API 토큰은 Worker 비밀 변수에만 있고 사이트(공개 파일)에는 들어가지 않는다.
//
// 필요한 설정 (Worker → Settings → Variables and Secrets):
//   TURN_KEY_ID      (Text)    Cloudflare 대시보드 > Realtime > TURN 에서 만든 키의 ID
//   TURN_API_TOKEN   (Secret)  그 키의 API 토큰
//   ALLOWED_ORIGINS  (Text)    허용할 사이트 주소, 쉼표로 구분. 예: https://dr1hoon2do.github.io
//
// 요청: GET /  →  { iceServers: [...] }

const TTL = 4 * 60 * 60;           // 발급하는 자격 증명 유효 시간(초)
const CACHE_MS = 30 * 60 * 1000;   // 같은 자격 증명을 재사용하는 시간 (API 호출·남용 감소, 받는 쪽은 항상 3.5시간 이상 남음)
const RATE_LIMIT = 30;             // 같은 IP가 1분에 부를 수 있는 횟수 (Worker 인스턴스 단위의 간단한 제한)

let cache = null;                  // { at, iceServers }
const hits = new Map();            // ip -> { t0, n }

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const originOk = allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": originOk ? origin : "null",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
    if (!originOk) return json({ error: "forbidden origin" }, 403);
    if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) return json({ error: "worker not configured" }, 500);

    // 간단한 빈도 제한
    const ip = request.headers.get("CF-Connecting-IP") || "?", now = Date.now();
    let h = hits.get(ip);
    if (!h || now - h.t0 > 60000) { h = { t0: now, n: 0 }; hits.set(ip, h); }
    if (++h.n > RATE_LIMIT) return json({ error: "too many requests" }, 429);
    if (hits.size > 5000) hits.clear();

    if (cache && now - cache.at < CACHE_MS) return json({ iceServers: cache.iceServers });

    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.TURN_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: TTL }),
    });
    if (!res.ok) return json({ error: "upstream error", status: res.status }, 502);
    const data = await res.json();
    const iceServers = normalize(data);
    if (!iceServers.length) return json({ error: "empty response" }, 502);
    cache = { at: now, iceServers };
    return json({ iceServers });
  },
};

// 응답이 배열/객체 어느 쪽이든 받아 주고, 일부 브라우저에서 문제가 되는 53번 포트 주소는 뺀다.
function normalize(data) {
  const list = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
  return list.map(s => {
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(u => u && !/:53(\?|$)/.test(u));
    return { ...s, urls };
  }).filter(s => s.urls.length);
}
