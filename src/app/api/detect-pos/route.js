// POS and 3rd-party delivery detection via restaurant website href scanning.
// Fetches the restaurant website and scans anchor href attributes for known platform domains.

const POS_SIGNATURES = [
  { name: "Toast",        patterns: ["toasttab.com"] },
  { name: "Square",       patterns: ["squareup.com", "square.site"] },
  { name: "Clover",       patterns: ["clover.com"] },
  { name: "Lightspeed",   patterns: ["lightspeedpos.com", "lightspeedhq.com", "upserve.com"] },
  { name: "Olo",          patterns: ["olo.com"] },
  { name: "SpotOn",       patterns: ["spoton.com", "spotondine.com"] },
  { name: "Aloha / NCR",  patterns: ["ncrvoyix.com", "alohaenterprise.com"] },
  { name: "TouchBistro",  patterns: ["touchbistro.com"] },
  { name: "BentoBox",     patterns: ["getbento.com", "bentobox.com"] },
  { name: "Revel",        patterns: ["revelsystems.com"] },
  { name: "HungerRush",   patterns: ["hungerrush.com", "revention.com"] },
  { name: "Lavu",         patterns: ["poslavu.com"] },
  { name: "Owner.com",    patterns: ["owner.com"] },
  { name: "PopMenu",      patterns: ["popmenu.com"] },
  { name: "Flipdish",     patterns: ["flipdish.com"] },
  { name: "ChowNow",      patterns: ["chownow.com"] },
  { name: "Menufy",       patterns: ["menufy.com"] },
  { name: "Slice",        patterns: ["slicelife.com"] },
  { name: "Zuppler",      patterns: ["zuppler.com"] },
  { name: "Tillster",     patterns: ["tillster.com"] },
];

const THIRD_PARTY_SIGNATURES = [
  { name: "DoorDash",   patterns: ["doordash.com"] },
  { name: "Uber Eats",  patterns: ["ubereats.com"] },
  { name: "Grubhub",    patterns: ["grubhub.com"] },
  { name: "Postmates",  patterns: ["postmates.com"] },
  { name: "Instacart",  patterns: ["instacart.com"] },
  { name: "EzCater",    patterns: ["ezcater.com"] },
  { name: "Caviar",     patterns: ["trycaviar.com"] },
  { name: "Seamless",   patterns: ["seamless.com"] },
];

const ALL_SIGNATURES = [...POS_SIGNATURES, ...THIRD_PARTY_SIGNATURES];

// Simple in-memory cache (30 min TTL)
const posCache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

// SSRF prevention: block requests to private/loopback IP ranges
function isPrivateHost(hostname) {
  return /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|0\.0\.0\.0)/i.test(hostname);
}

function scanUrl(url, signatures) {
  const lower = url.toLowerCase();
  for (const sig of signatures) {
    for (const pattern of sig.patterns) {
      if (lower.includes(pattern)) return sig.name;
    }
  }
  return null;
}

// Scan HTML for known platform domains — checks hrefs AND raw text (Wix/React sites embed URLs in JS)
function scanHrefs(html) {
  const pos = [];
  const thirdParty = [];

  // Collect candidate URLs from href attributes
  const urlRegex = /(?:href|src|url|action|content)=["']([^"']{8,400})["']/gi;
  let match;
  while ((match = urlRegex.exec(html)) !== null) {
    const href = match[1];
    const posMatch = scanUrl(href, POS_SIGNATURES);
    if (posMatch && !pos.includes(posMatch)) pos.push(posMatch);
    const tpMatch = scanUrl(href, THIRD_PARTY_SIGNATURES);
    if (tpMatch && !thirdParty.includes(tpMatch)) thirdParty.push(tpMatch);
  }

  // Also scan raw text for any remaining platforms not found via attributes
  if (pos.length === 0 || thirdParty.length < 3) {
    for (const sig of ALL_SIGNATURES) {
      const alreadyFound = pos.includes(sig.name) || thirdParty.includes(sig.name);
      if (alreadyFound) continue;
      for (const pattern of sig.patterns) {
        if (html.toLowerCase().includes(pattern)) {
          const isPOS = POS_SIGNATURES.some(s => s.name === sig.name);
          if (isPOS && !pos.includes(sig.name)) pos.push(sig.name);
          else if (!isPOS && !thirdParty.includes(sig.name)) thirdParty.push(sig.name);
          break;
        }
      }
    }
  }

  return { pos: pos[0] || null, thirdParty };
}

async function fetchAndScanHrefs(url) {
  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol) || isPrivateHost(parsedUrl.hostname)) {
      return null;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PocketProspector/1.0)", "Accept": "text/html" },
        redirect: "follow",
      });
      clearTimeout(timer);
      if (!res.ok) return null;

      // Stream up to 900KB — Wix/JS-heavy sites embed ordering links deep in the page
      const reader = res.body.getReader();
      let html = "";
      let bytes = 0;
      while (bytes < 900_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += new TextDecoder().decode(value, { stream: true });
        bytes += value.byteLength;
      }
      reader.cancel().catch(() => {});
      return scanHrefs(html);
    } catch {
      clearTimeout(timer);
      return null;
    }
  } catch {
    return null;
  }
}

// Convert a restaurant name to a likely Toast subdomain slug
function toToastSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const website = (searchParams.get("website") || "").trim();
    const name = (searchParams.get("name") || "").trim();

    if (!website && !name) {
      return Response.json({ pos: null, source: null, thirdParty: [] });
    }

    const cacheKey = website;
    const cached = posCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return Response.json(cached.result);
    }

    let pos = null;
    let posSource = null;
    let thirdParty = [];

    // Pass 1: check if the website URL itself is a known POS platform
    const urlMatch = scanUrl(website, POS_SIGNATURES);
    if (urlMatch) { pos = urlMatch; posSource = "website URL"; }

    // Pass 2: fetch website HTML and scan hrefs for ordering platform links
    if (!pos || thirdParty.length === 0) {
      const htmlResult = website ? await fetchAndScanHrefs(website) : null;
      if (htmlResult) {
        if (!pos && htmlResult.pos) { pos = htmlResult.pos; posSource = "website ordering link"; }
        thirdParty = htmlResult.thirdParty;
      }
    }

    // Pass 3: if website was blocked (Cloudflare etc.) and name is available,
    // probe toasttab.com/{slug} — Toast uses path-based URLs and returns 301 for valid restaurants
    if (!pos && name) {
      const slug = toToastSlug(name);
      const toastUrl = `https://www.toasttab.com/${slug}`;
      try {
        const probe = await fetch(toastUrl, {
          method: 'HEAD',
          redirect: 'manual', // catch the 301 without following to pos.toasttab.com
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PocketProspector/1.0)' },
        });
        // Toast returns 301 → pos.toasttab.com/{slug} for valid restaurants
        if (probe.status === 301 || probe.status === 200) {
          const loc = probe.headers.get('location') || '';
          if (loc.includes('toasttab.com') || probe.status === 200) {
            pos = 'Toast';
            posSource = 'Toast ordering page';
          }
        }
      } catch { /* not on Toast */ }
    }

    const result = { pos, source: posSource, thirdParty };
    posCache.set(cacheKey, { result, timestamp: Date.now() });
    if (posCache.size > 500) posCache.delete(posCache.keys().next().value);

    return Response.json(result);
  } catch (error) {
    console.error('POS detection error:', error);
    return Response.json({ pos: null, source: null, thirdParty: [] });
  }
}

