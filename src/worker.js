const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/lesson53-submissions") {
      if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
      if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
      return handleLessonSubmission(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleLessonSubmission(request, env, ctx) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const lead = normalizeLead(payload);
  if (!lead.email) return json({ ok: false, error: "Email is required" }, 400);

  const stored = [];

  if (env.LEADS_DB) {
    try {
      await env.LEADS_DB.prepare(
        `insert into lesson53_leads
          (created_at, email, name, business, industry, score, verdict, payload_json)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          new Date().toISOString(),
          lead.email,
          lead.name,
          lead.business,
          lead.industry,
          lead.score,
          lead.verdict,
          JSON.stringify(payload),
        )
        .run();
      stored.push("d1");
    } catch (error) {
      console.warn("D1 lead storage failed", error);
    }
  }

  if (env.LEAD_WEBHOOK_URL) {
    ctx.waitUntil(
      fetch(env.LEAD_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "lesson-5-3-mini",
          receivedAt: new Date().toISOString(),
          lead,
          payload,
        }),
      }).then((response) => {
        if (!response.ok) console.warn("Lead webhook failed", response.status);
      }).catch((error) => console.warn("Lead webhook error", error)),
    );
    stored.push("webhook");
  }

  return json({
    ok: true,
    stored,
    message: stored.length
      ? "Lead captured"
      : "Report generated. Add LEADS_DB or LEAD_WEBHOOK_URL to persist leads.",
  });
}

function normalizeLead(payload) {
  const answers = payload?.answers || {};
  return {
    email: clean(payload?.email).toLowerCase(),
    name: clean(payload?.name),
    business: clean(payload?.business),
    industry: clean(answers.industry || payload?.industry),
    score: Number(payload?.score || 0),
    verdict: clean(payload?.verdict),
  };
}

function clean(value) {
  return String(value || "").trim().slice(0, 500);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "*";
  return {
    ...JSON_HEADERS,
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}
