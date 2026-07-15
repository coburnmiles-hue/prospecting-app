export async function POST(req) {
  try {
    const body = await req.json();
    const key = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";

    const businessName = body.name || "(unknown)";
    const city = body.city || "Texas";
    const taxpayer = body.taxpayer || businessName;
    const mode = body.mode || "business"; // "business" | "area_radar"

    // If no key is configured return a safe mock so the UI can be tested locally
    if (!key) {
      const mockText = `Mock response for "${businessName}" (no server API key configured).`;
      return new Response(JSON.stringify({ mock: true, text: mockText }), { status: 200 });
    }

    let prompt;

    if (mode === "area_radar") {
      // Area Opening Radar: find upcoming restaurants NOT yet open in a given city/area
      prompt = `You are a restaurant industry market researcher. Find restaurants and food & beverage concepts that are COMING SOON or OPENING SOON in ${city}, Texas. Focus on independent restaurants, not national chains.

Research specifically:
1. Announced new restaurant openings, pop-ups turning permanent, chef-driven concepts
2. Social media announcements (Instagram, Facebook) hinting at upcoming openings
3. Recent news articles about restaurant openings in ${city}
4. Any notable chef or restaurateur activity in ${city}
5. New mixed-use or commercial developments with restaurant tenants announced

Respond in EXACTLY this format (no introduction, start directly with UPCOMING:):

UPCOMING: [List 3-6 specific upcoming concepts. For each: Name — brief description — location/neighborhood if known — estimated opening timeframe if known. One entry per line.]

MARKET INTEL: [2-3 sentences about the current restaurant climate in ${city} — is it growing, what cuisine categories are trending, what neighborhoods are hot for new openings]

TIPS: [2-3 actionable prospecting tips specific to finding pre-opening restaurants in ${city}, Texas right now]

Use real, specific information from current sources. If you cannot find specific upcoming openings, say so clearly in the UPCOMING section.`;
    } else {
      // Standard business research prompt
      prompt = `Research this business and provide specific factual information in exactly this format:

Business: ${businessName}
Location: ${city}, Texas
Entity Name: ${taxpayer}

Respond with ONLY the three sections below - no introduction, no acknowledgment:

OWNERS: [List the individual owners, operators, or key executives with their names and titles. If specific names are not available, describe the ownership structure (e.g., "Private LLC", "Family-owned")]

LOCATION COUNT: [State exactly how many physical locations this business operates. Examples: "Single location", "3 locations in Texas", "15+ locations nationwide"]

ACCOUNT DETAILS: [Provide: Business type/industry, services offered, approximate size/scale, year established if known, notable information about operations]

Do not include any preamble or closing. Start directly with "OWNERS:" and provide factual, specific information for each section.`;
    }

    // Helper: call Gemini with retry/backoff
    const callGeminiWithRetry = async (payload, retries = 4, delay = 800) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
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
        parts: [{ text: mode === "area_radar" 
          ? "You are a restaurant industry market researcher with deep knowledge of the Texas dining scene. Use Google Search to find current, real information about upcoming restaurant openings. Be specific and factual."
          : "You are a business research assistant. Provide factual business information in the exact format requested. Do not include preambles or acknowledgments." 
        }] 
      },
      generationConfig: {
        temperature: mode === "area_radar" ? 0.5 : 0.7,
        maxOutputTokens: mode === "area_radar" ? 3000 : 2048,
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

    return new Response(JSON.stringify({ raw: parsed, text: candidateText, mode }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), { status: 500 });
  }
}
