// Quote API — Vercel Serverless Function (Node runtime).
// Same x402 logic as the Cloudflare Worker version.
// PAY_TO = kenn's OKX wallet (payout). Facilitator = payai (supports Base mainnet).
// Price: $0.001 USDC per call on Base (eip155:8453).

const PAY_TO = "0x7D5EC74Ff51DaE55205c62048ae6bE66C4DEfD06";
const FACILITATOR = "https://facilitator.payai.network";
const NETWORK = "eip155:8453";
const ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AMOUNT = "1000";

const QUOTES = [
  "The secret of getting ahead is getting started. - Mark Twain",
  "It always seems impossible until it's done. - Nelson Mandela",
  "Well done is better than well said. - Benjamin Franklin",
  "Simplicity is the ultimate sophistication. - Leonardo da Vinci",
  "Act as if what you do makes a difference. It does. - William James",
];

function requirements(url) {
  return {
    scheme: "exact",
    network: NETWORK,
    amount: AMOUNT,
    maxAmountRequired: AMOUNT,
    asset: ASSET,
    payTo: PAY_TO,
    resource: url,
    description: "One random inspirational quote",
    mimeType: "application/json",
    maxTimeoutSeconds: 120,
    extra: { name: "USD Coin", version: "2" },
  };
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
const unb64 = (s) => JSON.parse(Buffer.from(s, "base64").toString("utf8"));

// Normalize the payment header into the envelope the payai facilitator
// expects for /verify and /settle:
//   {x402Version, resource: {url, description, mimeType}, accepted, payload}
// Clients send it two ways:
// - PAYMENT-SIGNATURE: base64 JSON envelope {x402Version, resource, accepted, payload}
//   (resource arrives as a plain URL string; payai requires the object form).
// - X-PAYMENT: JSON (or base64 JSON) v2 scheme payload {x402Version, scheme, network, payload}.
// Sending the bare scheme payload fails with "accepted: expected object",
// and sending maxAmountRequired in paymentRequirements fails with
// "x402Version 2 requires V2 payment requirements" — both verified live
// against the facilitator. So: build the envelope, object-ify resource,
// and strip maxAmountRequired from the requirements sent to the facilitator.
const RESOURCE_OBJ = {
  description: "One random inspirational quote",
  mimeType: "application/json",
};

function v2Requirements(req) {
  const { maxAmountRequired, ...rest } = req;
  return rest;
}

function normalizePaymentPayload(parsed, req, resourceObj) {
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.accepted && parsed.payload) {
    return {
      x402Version: parsed.x402Version || 2,
      resource: resourceObj,
      accepted: parsed.accepted,
      payload: parsed.payload,
    };
  }
  if (parsed.scheme && parsed.payload) {
    return {
      x402Version: parsed.x402Version || 2,
      resource: resourceObj,
      accepted: req,
      payload: parsed.payload,
    };
  }
  return null;
}

function parsePaymentHeader(header) {
  if (!header) return null;
  let obj = null;
  try {
    obj = JSON.parse(header);
  } catch {}
  if (!obj) {
    try {
      obj = unb64(header);
    } catch {
      return null;
    }
  }
  return obj;
}

function send(res, obj, status = 200, extraHeaders = {}) {
  res.status(status);
  res.setHeader("content-type", "application/json");
  res.setHeader("x-quote-api-version", "1.0.1");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader(
    "access-control-expose-headers",
    "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE"
  );
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.json(obj);
}

export default async function handler(req, res) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const base = `${proto}://${host}`;
  const reqUrl = requirements(base + "/quote");

  // Route comes from vercel.json rewrites (?route=...); fall back to pathname.
  let pathname = "/";
  try {
    pathname = new URL(req.url, base).pathname;
  } catch {}
  const route =
    (req.query && req.query.route) ||
    (pathname === "/quote"
      ? "quote"
      : pathname === "/openapi.json"
        ? "openapi"
        : pathname === "/.well-known/x402"
          ? "x402"
          : pathname === "/"
            ? "root"
            : "404");

  if (req.method === "OPTIONS") {
    res.status(204);
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "*");
    res.setHeader("access-control-allow-methods", "GET, OPTIONS");
    res.end();
    return;
  }

  if (route === "root") {
    send(res, { name: "Quote API", paid: "/quote" });
    return;
  }

  if (route === "openapi") {
    send(res, {
      openapi: "3.0.3",
      info: { title: "Quote API", version: "1.0.0" },
      servers: [{ url: base }],
      paths: {
        "/quote": {
          get: {
            summary: "Get a random quote",
            "x-payment-info": {
              scheme: "exact",
              network: NETWORK,
              amount: AMOUNT,
              asset: ASSET,
              payTo: PAY_TO,
              maxTimeoutSeconds: 120,
              extra: { name: "USD Coin", version: "2" },
            },
            responses: {
              200: { description: "Quote" },
              402: { description: "Payment required" },
            },
          },
        },
      },
    });
    return;
  }

  if (route === "x402") {
    send(res, { x402Version: 2, resources: [base + "/quote"], accepts: [reqUrl] });
    return;
  }

  if (route === "quote") {
    const resourceObj = { url: base + "/quote", ...RESOURCE_OBJ };
    // Prefer PAYMENT-SIGNATURE (envelope); fall back to X-PAYMENT (v2 scheme payload).
    const paymentPayload = normalizePaymentPayload(
      parsePaymentHeader(
        req.headers["payment-signature"] || req.headers["x-payment"]
      ),
      reqUrl,
      resourceObj
    );

    const challenge = {
      x402Version: 2,
      error: "Payment required",
      resource: {
        url: reqUrl.resource,
        description: reqUrl.description,
        mimeType: reqUrl.mimeType,
      },
      accepts: [reqUrl],
    };

    if (!paymentPayload) {
      send(res, challenge, 402, { "PAYMENT-REQUIRED": b64(challenge) });
      return;
    }

    const body = JSON.stringify({
      x402Version: paymentPayload.x402Version || 2,
      paymentPayload,
      paymentRequirements: v2Requirements(reqUrl),
    });
    const opts = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    };

    const v = await (await fetch(FACILITATOR + "/verify", opts))
      .json()
      .catch(() => ({}));
    if (!v.isValid) {
      send(
        res,
        { ...challenge, error: v.invalidReason || "Payment invalid" },
        402,
        { "PAYMENT-REQUIRED": b64(challenge) }
      );
      return;
    }

    const s = await (await fetch(FACILITATOR + "/settle", opts))
      .json()
      .catch(() => ({}));
    if (!s.success) {
      send(
        res,
        { ...challenge, error: s.errorReason || "Settlement failed" },
        402,
        { "PAYMENT-REQUIRED": b64(challenge) }
      );
      return;
    }

    const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    send(res, { quote }, 200, {
      "PAYMENT-RESPONSE": b64(s),
      "X-PAYMENT-RESPONSE": b64(s),
    });
    return;
  }

  send(res, { error: "Not found" }, 404);
}
