// POS detection via website HTML scanning and online ordering URL recognition.
// Methods used:
//   1. menuUrl (Google ordering/menu URI) — URL check
//   2. website URL — quick pattern match
//   3. Slug probing — construct candidate ordering URLs from name/city and HEAD-check them
//   4. Fetch Google ordering page HTML — scan embedded scripts
//   5. Fetch website HTML — scan embedded scripts
//   6. Gemini AI + Google Search grounding — last-resort web search

const POS_SIGNATURES = [
  { name: "Toast",        patterns: ["toasttab.com"] },
  { name: "Square",       patterns: ["squareup.com", "square.site"] },
  { name: "Clover",       patterns: ["clover.com/order", "clovercdn.com"] },
  { name: "Lightspeed",   patterns: ["lightspeedpos.com", "lightspeedhq.com", "upserve.com"] },
  { name: "Olo",          patterns: ["olo.com"] },
  { name: "SpotOn",       patterns: ["spoton.com"] },
  { name: "Aloha / NCR",  patterns: ["ncrvoyix.com", "alohaenterprise.com"] },
  { name: "TouchBistro",  patterns: ["touchbistro.com"] },
  { name: "BentoBox",     patterns: ["getbento.com", "bentobox.com"] },
  { name: "Revel",        patterns: ["revelsystems.com"] },
  { name: "HungerRush",   patterns: ["hungerrush.com", "revention.com"] },
  { name: "Lavu",         patterns: ["poslavu.com"] },
  { name: "Owner.com",    patterns: ["owner.com"] },
  { name: "PopMenu",      patterns: ["popmenu.com"] },
];

// SSRF prevention: block requests to private/loopback IP ranges
function isPrivateHost(hostname) {
  return /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|0\.0\.0\.0)/i.test(hostname);
}

function scanForPos(text) {
  const lower = text.toLowerCase();
  for (const sig of POS_SIGNATURES) {
    for (const pattern of sig.patterns) {
      if (lower.includes(pattern)) {
        return sig.name;
      }
    }
  }
  return null;
}

// Turn a business name + optional city into a URL-safe slug
function toSlug(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')  // strip special chars
    .trim()
    .replace(/\s+/g, '-');          // spaces → hyphens
}

// Build candidate ordering URLs for the highest-coverage POS platforms
function buildSlugCandidates(name, city) {
  const nameSlug = toSlug(name);
  const citySlug = toSlug(city);
  const candidates = [];

  if (!nameSlug) return candidates;

  // NOTE: Toast slug probing removed — toasttab.com is behind Cloudflare and returns 301
  // for ALL slugs (valid and invalid alike), making discrimination impossible.
  // Toast is detected via Gemini search grounding (Pass 6) instead.

  // Square: {slug}.square.site
  candidates.push({ url: `https://${nameSlug}.square.site`, pos: "Square" });
  if (citySlug) {
    candidates.push({ url: `https://${nameSlug}-${citySlug}.square.site`, pos: "Square" });
  }

  return candidates;
}

async function probeSlugCandidates(name, city) {
  const candidates = buildSlugCandidates(name, city);
  // Run all HEAD probes in parallel with 4s timeout each
  const results = await Promise.all(
    candidates.map(async ({ url, pos }) => {
      try {
        const parsedUrl = new URL(url);
        if (isPrivateHost(parsedUrl.hostname)) return null;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        try {
          const res = await fetch(url, {
            method: "HEAD",
            signal: controller.signal,
            redirect: "follow",
            headers: { "User-Agent": "Mozilla/5.0 (compatible; PocketProspector/1.0)" },
          });
          clearTimeout(timer);
          // 200 or 301/302 landing page = exists; 404 = not found
          if (res.ok || res.status === 301 || res.status === 302) {
            // Extra guard: ensure the final URL is still on the expected domain
            const finalUrl = res.url || url;
            if (finalUrl.includes(parsedUrl.hostname)) {
              return { pos, source: "ordering page" };
            }
          }
          return null;
        } catch {
          clearTimeout(timer);
          return null;
        }
      } catch {
        return null;
      }
    })
  );
  return results.find(Boolean) || null;
}

// Pass 6: Use Gemini + Google Search grounding as a last-resort fallback.
// Called only when all URL and HTML scanning passes fail.
async function detectViaGeminiSearch(name, city) {
  const geminiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!geminiKey || !name) return null;

  const location = city ? `${name} in ${city}` : name;
  const prompt = `What online ordering platform or POS system does the restaurant "${location}" use? ` +
    `Is it Toast (toasttab.com), Square (square.site), Clover, Lightspeed, Olo, SpotOn, or another? ` +
    `Reply with just the POS system name, e.g. "Toast", "Square", "Clover". If you cannot determine it, say "Unknown".`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
        }),
      }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || "";
    const detected = scanForPos(text);
    if (detected) return { pos: detected, source: "web search" };
    return null;
  } catch {
    return null;
  }
}

async function fetchAndScan(url, sourceLabel) {
  try {
    const parsedUrl = new URL(url);
    if (
      !["http:", "https:"].includes(parsedUrl.protocol) ||
      isPrivateHost(parsedUrl.hostname)
    ) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PocketProspector/1.0)", Accept: "text/html" },
        redirect: "follow",
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const reader = res.body.getReader();
      let html = "";
      let bytes = 0;
      while (bytes < 200_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += new TextDecoder().decode(value);
        bytes += value.byteLength;
      }
      reader.cancel().catch(() => {});
      const detected = scanForPos(html);
      return detected ? { pos: detected, source: sourceLabel } : null;
    } catch {
      clearTimeout(timer);
      return null;
    }
  } catch {
    return null;
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const website  = (searchParams.get("website")  || "").trim();
    const menuUrl  = (searchParams.get("menuUrl")  || "").trim();
    const name     = (searchParams.get("name")     || "").trim();
    const city     = (searchParams.get("city")     || "").trim();

    if (!website && !menuUrl && !name) {
      return Response.json({ pos: "Unknown", source: null });
    }

    // --- Pass 1: check if the menuUrl itself is a POS/ordering platform (highest signal) ---
    if (menuUrl) {
      const menuUrlDetected = scanForPos(menuUrl);
      if (menuUrlDetected) {
        return Response.json({ pos: menuUrlDetected, source: "Google ordering link" });
      }
    }

    // --- Pass 2: check if the website URL itself is a POS/ordering platform ---
    if (website) {
      const urlDetected = scanForPos(website);
      if (urlDetected) {
        return Response.json({ pos: urlDetected, source: "ordering page" });
      }
    }

    // --- Pass 3: slug probe — construct known ordering URLs and HEAD-check them ---
    if (name) {
      const probeResult = await probeSlugCandidates(name, city);
      if (probeResult) return Response.json(probeResult);
    }

    // --- Pass 4: fetch Google ordering/menu page HTML and scan ---
    if (menuUrl) {
      const result = await fetchAndScan(menuUrl, "Google ordering link");
      if (result) return Response.json(result);
    }

    // --- Pass 5: fetch website HTML and scan for embedded POS signatures ---
    if (website) {
      const result = await fetchAndScan(website, "website");
      if (result) return Response.json(result);
    }

    // --- Pass 6: Gemini AI + Google Search grounding (last resort) ---
    if (name) {
      const searchResult = await detectViaGeminiSearch(name, city);
      if (searchResult) return Response.json(searchResult);
    }

    return Response.json({ pos: "Unknown", source: null });
  } catch {
    return Response.json({ pos: "Unknown", source: null });
  }
}
