export async function POST(req) {
  try {
    const body = await req.json();
    const key = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";

    const businessName = body.name || "(unknown)";
    const city = body.city || "Texas";
    const taxpayer = body.taxpayer || businessName;

    // If no key is configured return a safe mock so the UI can be tested locally
    if (!key) {
      const mockText = `Mock response for "${businessName}" (no server API key configured).`;
      return new Response(JSON.stringify({ mock: true, text: mockText }), { status: 200 });
    }

    // Three-section prompt requesting structured output
    const prompt = `Research this business and provide specific factual information in exactly this format:

Business: ${businessName}
Location: ${city}, Texas
Entity Name: ${taxpayer}

Respond with ONLY the three sections below - no introduction, no acknowledgment:

OWNERS: [List the individual owners, operators, or key executives with their names and titles. If specific names are not available, describe the ownership structure (e.g., "Private LLC", "Family-owned")]

LOCATION COUNT: [State exactly how many physical locations this business operates. Examples: "Single location", "3 locations in Texas", "15+ locations nationwide"]

ACCOUNT DETAILS: [Provide: Business type/industry, services offered, approximate size/scale, year established if known, notable information about operations]

Do not include any preamble or closing. Start directly with "OWNERS:" and provide factual, specific information for each section.`;

    // Helper: call Gemini with retry/backoff
    const callGeminiWithRetry = async (payload, retries = 4, delay = 800) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
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

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { 
        parts: [{ text: "You are a business research assistant. Provide factual business information in the exact format requested. Do not include preambles or acknowledgments." }] 
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
      tools: [{ googleSearch: {} }]
    };

    const result = await callGeminiWithRetry(payload);
    if (!result.ok) {
      const bodyText = result.bodyText || result.error || "Unknown error";
      console.error('Gemini API Error:', bodyText, 'Status:', result.status);
      return new Response(JSON.stringify({ error: bodyText, status: result.status || 500, parsed: result.parsed || null }), { status: 502 });
    }

    const parsed = result.parsed || {};
    console.log('Gemini response:', JSON.stringify(parsed, null, 2));
    const candidateText = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || parsed?.candidates?.[0]?.output || "";

    return new Response(JSON.stringify({ raw: parsed, text: candidateText }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), { status: 500 });
  }
}
