// AI Agent endpoint — parses a natural-language activity command into structured JSON
// using Gemini, then the client fuzzy-matches the account and POSTs to /api/notes.

export async function POST(req) {
  try {
    const body = await req.json();
    const command = (body?.command || "").trim();

    if (!command) {
      return Response.json({ error: "command is required" }, { status: 400 });
    }

    const key = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
    if (!key) {
      return Response.json({ error: "AI not configured" }, { status: 503 });
    }

    const prompt = `You are a field sales assistant. Parse this voice/text command from a sales rep into structured JSON.

Command: "${command}"

Extract the following and return ONLY valid JSON, nothing else:
{
  "accountName": "the business name mentioned (null if not found)",
  "activityType": "one of: walk-in | call | text | email | update | bdr-note (infer from context; default walk-in)",
  "noteText": "the note/description of what happened, cleaned up and written in past tense (null if none)",
  "followUpDate": "a date string like 2026-05-20 if a follow-up date was mentioned, otherwise null"
}

Rules:
- activityType should be "walk-in" if they say stopped by, visited, popped in, walked in, or similar
- activityType should be "call" if they say called, phoned, reached out by phone
- activityType should be "text" if they say texted
- activityType should be "email" if they say emailed
- noteText should capture everything said about what happened, who was met, what was discussed
- Do not include the account name or activity type label in noteText
- Return ONLY the JSON object, no markdown, no explanation`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      console.error("Gemini agent error:", geminiRes.status, errText);
      return Response.json({ error: "AI request failed" }, { status: 502 });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Strip markdown code fences if Gemini wraps in ```json ... ```
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Agent JSON parse failed:", rawText);
      return Response.json({ error: "Could not parse AI response", raw: rawText }, { status: 422 });
    }

    return Response.json({
      accountName: parsed.accountName || null,
      activityType: parsed.activityType || "walk-in",
      noteText: parsed.noteText || null,
      followUpDate: parsed.followUpDate || null,
    });
  } catch (err) {
    console.error("Agent route error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
