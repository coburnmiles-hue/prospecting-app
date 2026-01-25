export async function POST(req) {
  try {
    const body = await req.json();
    const key = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";

    const name = body.name || "(unknown)";
    const address = body.address || "";
    const city = body.city || "Texas";
    const custom = Boolean(body.isCustom);
    const question = body.question || "";

    // If no key is configured return a safe mock so the UI can be tested locally
    if (!key) {
      const mockText = `OWNERS: Not found\nLOCATION COUNT: —\nACCOUNT DETAILS: Mock response for "${name}" (no server API key configured).`;
      return new Response(JSON.stringify({ mock: true, text: mockText }), { status: 200 });
    }

    const fewShot = `EXAMPLE:\n\nOWNERS: Alice Johnson, Bob Smith\nLOCATION COUNT: 3\nACCOUNT DETAILS: Family-owned; flagship location is downtown; recently opened a second bar.`;

    const defaultPrompt = `You are a concise, cautious web researcher. For the account "${name}" at ${address} in ${city}, produce exactly three labeled sections with these headings and formats. Be factual and if you don't know an item, reply with 'Not found' (for OWNERS) or '—' (for others). Do not invent people or numbers.\n\nOWNERS: Output only owner names, comma- or newline-separated, or 'Not found'.\n\nLOCATION COUNT: Output a single digit or number (digits only), or '—' if unknown.\n\nACCOUNT DETAILS: 2–3 brief, actionable or interesting facts for prospecting; if unknown output '—'.\n\nOutput only these three labeled sections and nothing else.`;

    const prompt = custom ? String(question) : fewShot + "\n\n" + defaultPrompt;

    // Helper: call Gemini with retry/backoff
    const callGeminiWithRetry = async (payload, retries = 4, delay = 800) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${key}`;
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const textBody = await resp.text().catch(() => "");
        let parsed = null;
        try { parsed = textBody ? JSON.parse(textBody) : null; } catch (e) { parsed = null; }

        if (!resp.ok) {
          // Retry on rate limit or server errors
          if (retries > 0 && (resp.status === 429 || resp.status >= 500)) {
            await new Promise((r) => setTimeout(r, delay));
            return callGeminiWithRetry(payload, retries - 1, Math.min(delay * 2, 8000));
          }
          // Return parsed error body if present
          return { ok: false, status: resp.status, bodyText: textBody, parsed };
        }

        return { ok: true, parsed };
      } catch (err) {
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, delay));
          return callGeminiWithRetry(payload, retries - 1, Math.min(delay * 2, 8000));
        }
        return { ok: false, error: String(err) };
      }
    };

    // Compose payload in the same shape used by the older client code
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: "You are Pocket Prospector, a sales tool. Find individual owners/management for Texas businesses. Use labels: OWNERS:, LOCATION COUNT:, ACCOUNT DETAILS:" }] },
    };

    const result = await callGeminiWithRetry(payload);
    if (!result.ok) {
      const bodyText = result.bodyText || result.error || "Unknown error";
      return new Response(JSON.stringify({ error: bodyText, status: result.status || 500, parsed: result.parsed || null }), { status: 502 });
    }

    const parsed = result.parsed || {};
    const candidateText = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || parsed?.candidates?.[0]?.output || "";

    return new Response(JSON.stringify({ raw: parsed, text: candidateText }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), { status: 500 });
  }
}
