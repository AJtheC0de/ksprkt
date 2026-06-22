const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const MIN_SUBMIT_MS = 4000;
const MAX_FIELD_LENGTH = 3000;
const buckets = new Map();

const spamTerms = [
  "casino",
  "crypto",
  "viagra",
  "loan",
  "betting",
  "forex",
  "seo package",
  "backlink",
  "porn",
  "telegram",
  "whatsapp marketing",
];

const getClientIp = (request) => {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return request.headers["x-real-ip"] || request.socket?.remoteAddress || "unknown";
};

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20_000) {
        reject(new Error("Body too large"));
        request.destroy();
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });

const parseBody = (request, rawBody) => {
  const contentType = request.headers["content-type"] || "";

  if (contentType.includes("application/json")) {
    return JSON.parse(rawBody || "{}");
  }

  const params = new URLSearchParams(rawBody);
  return Object.fromEntries(params.entries());
};

const rateLimit = (ip) => {
  const now = Date.now();
  const current = buckets.get(ip) || { count: 0, startedAt: now };

  if (now - current.startedAt > RATE_LIMIT_WINDOW_MS) {
    current.count = 0;
    current.startedAt = now;
  }

  current.count += 1;
  buckets.set(ip, current);

  return current.count <= RATE_LIMIT_MAX;
};

const hasSpam = (payload) => {
  const text = Object.values(payload).join(" ").toLowerCase();
  return spamTerms.some((term) => text.includes(term));
};

const verifyTurnstile = async (token, ip) => {
  if (!process.env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip,
      }),
    }
  );
  const result = await response.json();

  return Boolean(result.success);
};

const forwardSubmission = async (payload, ip) => {
  if (!process.env.CONTACT_WEBHOOK_URL) return;

  await fetch(process.env.CONTACT_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: "ks-parkett",
      ip,
      submittedAt: new Date().toISOString(),
      payload,
    }),
  });
};

export default async function handler(request, response) {
  response.setHeader("Allow", "POST");

  if (request.method !== "POST") {
    return response.status(405).json({ ok: false });
  }

  const ip = getClientIp(request);

  if (!rateLimit(ip)) {
    return response.status(429).json({ ok: false });
  }

  try {
    const rawBody = await readBody(request);
    const payload = parseBody(request, rawBody);
    const startedAt = Number(payload.started_at || 0);
    const tooFast = !startedAt || Date.now() - startedAt < MIN_SUBMIT_MS;

    if (payload.website || tooFast || hasSpam(payload)) {
      return response.status(400).json({ ok: false });
    }

    for (const value of Object.values(payload)) {
      if (String(value).length > MAX_FIELD_LENGTH) {
        return response.status(400).json({ ok: false });
      }
    }

    const turnstileOk = await verifyTurnstile(payload.turnstile_token, ip);
    if (!turnstileOk) {
      return response.status(400).json({ ok: false });
    }

    await forwardSubmission(payload, ip);

    return response.status(200).json({ ok: true });
  } catch (error) {
    return response.status(400).json({ ok: false });
  }
}
