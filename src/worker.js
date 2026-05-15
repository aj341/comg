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

  const email = await sendLeadEmail(env, lead, payload);

  return json({
    ok: true,
    stored,
    emailSent: email.sent,
    emailProvider: email.provider,
    message: email.sent
      ? "Lead captured and email sent"
      : "Lead captured. Email delivery is not configured yet.",
  });
}

async function sendLeadEmail(env, lead, payload) {
  if (!env.RESEND_API_KEY) {
    return { sent: false, provider: null };
  }

  const from = env.LEAD_FROM_EMAIL || "Claude Mastery <hello@howtolearnclaude.com>";
  const subject = emailSubject(payload);
  const html = emailHtml(lead, payload);
  const text = emailText(lead, payload);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [lead.email],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      console.warn("Resend email failed", response.status, await response.text());
      return { sent: false, provider: "resend" };
    }

    return { sent: true, provider: "resend" };
  } catch (error) {
    console.warn("Resend email error", error);
    return { sent: false, provider: "resend" };
  }
}

function emailSubject(payload) {
  const variation = payload?.answers?.variation;
  if (variation === "readiness-diagnostic") {
    const score = payload?.score ? ` - ${payload.score}/100` : "";
    return `Your automation readiness report${score}`;
  }
  return "Your Lesson 5.3 automation prompt template";
}

function emailHtml(lead, payload) {
  const answers = payload?.answers || {};
  const isDiagnostic = answers.variation === "readiness-diagnostic";
  const title = escapeHtml(answers.resultTitle || (isDiagnostic ? "Your readiness report" : "Your automation map"));
  const summary = escapeHtml(answers.resultSummary || "");
  const resultText = escapeHtml(answers.resultText || "").replace(/\n/g, "<br>");
  const prompt = escapeHtml(buildPromptTemplate(answers, isDiagnostic)).replace(/\n/g, "<br>");

  return `<!doctype html>
<html>
<body style="margin:0;background:#f8fafc;color:#374151;font-family:Arial,sans-serif;line-height:1.6">
  <div style="max-width:680px;margin:0 auto;padding:28px 18px">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <div style="background:#0f1623;color:white;padding:24px">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#3bb9f5;font-weight:700">Claude Mastery - Lesson 5.3</div>
        <h1 style="margin:8px 0 0;font-size:26px;line-height:1.15">${title}</h1>
        ${summary ? `<p style="color:rgba(255,255,255,.76);margin:10px 0 0">${summary}</p>` : ""}
      </div>
      <div style="padding:24px">
        <p>Hi${lead.name ? ` ${escapeHtml(lead.name)}` : ""},</p>
        <p>Here is the Lesson 5.3 output you requested.</p>
        ${payload?.score ? `<p><strong>Readiness score:</strong> ${payload.score}/100<br><strong>Verdict:</strong> ${escapeHtml(payload.verdict || "")}</p>` : ""}
        <h2 style="font-size:18px;color:#111827">Your result</h2>
        <p>${resultText}</p>
        <h2 style="font-size:18px;color:#111827">Prompt template to try manually first</h2>
        <div style="background:#0f1623;color:#f8fafc;border-radius:10px;padding:16px;font-family:Consolas,monospace;font-size:13px;line-height:1.55">${prompt}</div>
        <p style="margin-top:22px">The important bit: run this manually with real examples before wiring it into Zapier, Make, n8n, or a CRM.</p>
        <p>AJ<br>Claude Mastery</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function emailText(lead, payload) {
  const answers = payload?.answers || {};
  const isDiagnostic = answers.variation === "readiness-diagnostic";
  return [
    `Hi${lead.name ? ` ${lead.name}` : ""},`,
    "",
    answers.resultTitle || (isDiagnostic ? "Your readiness report" : "Your automation map"),
    answers.resultSummary || "",
    payload?.score ? `Score: ${payload.score}/100` : "",
    payload?.verdict ? `Verdict: ${payload.verdict}` : "",
    "",
    "Your result:",
    answers.resultText || "",
    "",
    "Prompt template to try manually first:",
    buildPromptTemplate(answers, isDiagnostic),
    "",
    "Run this manually with real examples before wiring it into an automation.",
    "",
    "AJ",
    "Claude Mastery",
  ].filter(Boolean).join("\n");
}

function buildPromptTemplate(answers, isDiagnostic) {
  if (isDiagnostic) {
    return `Role:
You are an automation adviser helping me decide whether this Claude workflow is ready to automate.

Task:
Review my proposed workflow and identify the next manual step before automation.

Context:
Use my readiness report and score as the source of truth.

Output:
- 3 risks to fix before automation
- 1 manual test to run this week
- The exact review rule I should use before turning this into a Zapier/Make/n8n workflow

Constraints:
- Do not recommend full automation until the manual reps and quality standard are clear.
- Keep the advice practical and specific.`;
  }

  const industry = answers.industry || "my industry";
  return `Role:
You are helping a ${industry} business design a safe Claude automation.

Task:
Turn the automation map below into a constrained Claude prompt.

Automation map:
${answers.resultText || "[paste your automation map here]"}

Output:
- Trigger
- Data Claude receives
- Draft output Claude should produce
- Human review step
- Failure cases where Claude should ask for help

Constraints:
- Do not invent missing details.
- Keep the first version as a draft for human review.
- Run this manually 15 times before connecting it to automation.`;
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

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
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
