// POS and 3rd-party delivery detection via restaurant website href scanning.
// Fetches the restaurant website and scans anchor href attributes, CDN/script sources,
// preconnect/dns-prefetch hints, and raw text for known platform domains.

const POS_SIGNATURES = [
  { name: "Toast",        patterns: ["toasttab.com", "cdn.toasttab.com", "ws-ast.com"] },
  { name: "Square",       patterns: ["squareup.com", "square.site", "js.squareup.com", "squarespace.com/order"] },
  { name: "Clover",       patterns: ["clover.com", "checkout.clover.com", "static.clover.com"] },
  { name: "Lightspeed",   patterns: ["lightspeedpos.com", "lightspeedhq.com", "upserve.com", "cloud.lightspeedapp.com"] },
  { name: "Olo",          patterns: ["olo.com", "olocdn.net", "api.olo.com"] },
  { name: "SpotOn",       patterns: ["spoton.com", "spotondine.com", "d-hw1.spoton.com"] },
  { name: "Aloha / NCR",  patterns: ["ncrvoyix.com", "alohaenterprise.com", "ncrsilver.com", "ncr.com/restaurant"] },
  { name: "TouchBistro",  patterns: ["touchbistro.com", "tb-cdn.com"] },
  { name: "BentoBox",     patterns: ["getbento.com", "bentobox.com", "bentobox.net"] },
  { name: "Revel",        patterns: ["revelsystems.com"] },
  { name: "HungerRush",   patterns: ["hungerrush.com", "revention.com"] },
  { name: "Lavu",         patterns: ["poslavu.com", "lavopos.com"] },
  { name: "Owner.com",    patterns: ["owner.com"] },
  { name: "PopMenu",      patterns: ["popmenu.com", "assets.popmenu.com"] },
  { name: "Flipdish",     patterns: ["flipdish.com", "flipdish-assets.com"] },
  { name: "ChowNow",      patterns: ["chownow.com", "ordering.chownow.com"] },
  { name: "Menufy",       patterns: ["menufy.com"] },
  { name: "Slice",        patterns: ["slicelife.com"] },
  { name: "Zuppler",      patterns: ["zuppler.com"] },
  { name: "Tillster",     patterns: ["tillster.com", "tillster-cdn.com"] },
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

// Scan HTML for known platform domains — checks hrefs, script/img src, preconnect hints, and raw text
function scanHrefs(html) {
  let posName = null;
  let posUrl = null;
  const thirdParty = [];

  // Pass A: preconnect / dns-prefetch link hints in <head> — very reliable, low noise
  // e.g. <link rel="preconnect" href="https://cdn.toasttab.com">
  const preconnectRegex = /<link[^>]+rel=["'](?:preconnect|dns-prefetch)["'][^>]+href=["']([^"']{4,300})["'][^>]*>/gi;
  let m;
  while ((m = preconnectRegex.exec(html)) !== null) {
    const hint = m[1];
    if (!posName) {
      const posMatch = scanUrl(hint, POS_SIGNATURES);
      if (posMatch) { posName = posMatch; /* no direct page URL from a preconnect hint */ }
    }
    const tpMatch = scanUrl(hint, THIRD_PARTY_SIGNATURES);
    if (tpMatch && !thirdParty.includes(tpMatch)) thirdParty.push(tpMatch);
  }
  // Also handle reversed attribute order: href before rel
  const preconnectRegex2 = /<link[^>]+href=["']([^"']{4,300})["'][^>]+rel=["'](?:preconnect|dns-prefetch)["'][^>]*>/gi;
  while ((m = preconnectRegex2.exec(html)) !== null) {
    const hint = m[1];
    if (!posName) {
      const posMatch = scanUrl(hint, POS_SIGNATURES);
      if (posMatch) { posName = posMatch; }
    }
    const tpMatch = scanUrl(hint, THIRD_PARTY_SIGNATURES);
    if (tpMatch && !thirdParty.includes(tpMatch)) thirdParty.push(tpMatch);
  }

  // Pass B: all URL-bearing attributes (href, src, action, content, data-src, etc.)
  const urlRegex = /(?:href|src|data-src|url|action|content)=["']([^"']{8,400})["']/gi;
  while ((m = urlRegex.exec(html)) !== null) {
    const href = m[1];
    if (!posName) {
      const posMatch = scanUrl(href, POS_SIGNATURES);
      if (posMatch) {
        posName = posMatch;
        if (/^https?:\/\//i.test(href)) posUrl = href;
      }
    }
    const tpMatch = scanUrl(href, THIRD_PARTY_SIGNATURES);
    if (tpMatch && !thirdParty.includes(tpMatch)) thirdParty.push(tpMatch);
  }

  // Pass C: <meta name="generator"> — platforms like BentoBox/ChowNow stamp this tag
  if (!posName) {
    const generatorMatch = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']{2,100})["']/i)
                        || html.match(/<meta[^>]+content=["']([^"']{2,100})["'][^>]+name=["']generator["']/i);
    if (generatorMatch) {
      const gen = generatorMatch[1].toLowerCase();
      for (const sig of POS_SIGNATURES) {
        if (sig.patterns.some(p => gen.includes(p)) || gen.includes(sig.name.toLowerCase())) {
          posName = sig.name;
          break;
        }
      }
    }
  }

  // Pass D: JSON-LD structured data (<script type="application/ld+json">)
  // Restaurant sites often embed orderUrl / menu / sameAs / url fields pointing to the platform
  if (!posName) {
    const ldJsonRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let ldMatch;
    while ((ldMatch = ldJsonRegex.exec(html)) !== null && !posName) {
      try {
        const obj = JSON.parse(ldMatch[1]);
        const urlFields = ['url', 'menu', 'hasMenu', 'orderUrl', 'orderOnlineUrl', 'sameAs', 'potentialAction'];
        const extractUrls = (val) => {
          if (typeof val === 'string' && /^https?:\/\//i.test(val)) return [val];
          if (Array.isArray(val)) return val.flatMap(extractUrls);
          if (val && typeof val === 'object') return Object.values(val).flatMap(extractUrls);
          return [];
        };
        const ldUrls = urlFields.flatMap(f => extractUrls(obj[f]));
        for (const ldUrl of ldUrls) {
          const posMatch = scanUrl(ldUrl, POS_SIGNATURES);
          if (posMatch) { posName = posMatch; if (!posUrl) posUrl = ldUrl; break; }
          const tpMatch = scanUrl(ldUrl, THIRD_PARTY_SIGNATURES);
          if (tpMatch && !thirdParty.includes(tpMatch)) thirdParty.push(tpMatch);
        }
      } catch { /* malformed JSON, skip */ }
    }
  }

  // Pass E: raw text sweep for anything missed (Wix/React JS bundles, inline JSON config)
  if (!posName || thirdParty.length < 3) {
    for (const sig of ALL_SIGNATURES) {
      const alreadyFound = posName === sig.name || thirdParty.includes(sig.name);
      if (alreadyFound) continue;
      for (const pattern of sig.patterns) {
        if (html.toLowerCase().includes(pattern)) {
          const isPOS = POS_SIGNATURES.some(s => s.name === sig.name);
          if (isPOS && !posName) posName = sig.name;
          else if (!isPOS && !thirdParty.includes(sig.name)) thirdParty.push(sig.name);
          break;
        }
      }
    }
  }

  return { pos: posName || null, posUrl: posUrl || null, thirdParty };
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

      // Check HTTP response headers — some platforms host the restaurant site directly
      // and stamp Server / X-Powered-By / X-Generator / X-CMS headers
      const headerHints = [
        res.headers.get('server') || '',
        res.headers.get('x-powered-by') || '',
        res.headers.get('x-generator') || '',
        res.headers.get('x-cms') || '',
      ].join(' ').toLowerCase();
      let headerPos = null;
      if (headerHints.trim()) {
        for (const sig of POS_SIGNATURES) {
          if (
            sig.patterns.some(p => headerHints.includes(p)) ||
            headerHints.includes(sig.name.toLowerCase().split(' / ')[0])
          ) {
            headerPos = sig.name;
            break;
          }
        }
      }
      // If headers alone identified the POS, still stream HTML to gather thirdParty data

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
      const htmlResult = scanHrefs(html);
      // Prefer HTML-detected POS (has an actual URL) over header-only detection
      if (!htmlResult.pos && headerPos) {
        htmlResult.pos = headerPos;
        htmlResult.headerDetected = true;
      }
      // Coming-soon / pre-opening detection: look for strong signals in page text
      const lowerHtml = html.toLowerCase();
      const comingSoonPhrases = [
        'coming soon', 'opening soon', 'grand opening', 'opening in', 'now hiring',
        'opens in', 'open in', 'we\'re opening', "we're coming", 'stay tuned',
        'follow us for updates', 'sign up for updates', 'get notified', 'join our waitlist',
        'under construction', 'website coming soon',
      ];
      htmlResult.comingSoon = comingSoonPhrases.some(phrase => lowerHtml.includes(phrase));
      return htmlResult;
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

// Extract zip code and street number from a free-form address string
function parseAddressTokens(address) {
  if (!address) return { zip: null, streetNum: null };
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  const streetNumMatch = address.match(/^\s*(\d+)\b/);
  return {
    zip: zipMatch ? zipMatch[1] : null,
    streetNum: streetNumMatch ? streetNumMatch[1] : null,
  };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const website = (searchParams.get("website") || "").trim();
    const name = (searchParams.get("name") || "").trim();
    const address = (searchParams.get("address") || "").trim();

    if (!website && !name) {
      return Response.json({ pos: null, source: null, thirdParty: [] });
    }

    const cacheKey = website || name;
    const cached = posCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return Response.json(cached.result);
    }

    let pos = null;
    let posSource = null;
    let posSourceUrl = null;
    let thirdParty = [];
    let comingSoon = false;

    // Pass 1: check if the website URL itself is a known POS platform
    const urlMatch = scanUrl(website, POS_SIGNATURES);
    if (urlMatch) { pos = urlMatch; posSource = "website URL"; posSourceUrl = website; }

    // Pass 2: fetch website HTML — scans preconnect hints, script/CDN src, ordering links, JSON-LD, meta generator, response headers, and raw text
    if (!pos || thirdParty.length === 0) {
      const htmlResult = website ? await fetchAndScanHrefs(website) : null;
      if (htmlResult) {
        if (!pos && htmlResult.pos) {
          pos = htmlResult.pos;
          if (htmlResult.headerDetected) posSource = "website response headers";
          else if (htmlResult.posUrl) posSource = "website ordering link";
          else posSource = "website CDN / preconnect";
          posSourceUrl = htmlResult.posUrl || null;
        }
        thirdParty = htmlResult.thirdParty;
        if (htmlResult.comingSoon) comingSoon = true;
      }
    }

    // Pass 3: if website was blocked (Cloudflare etc.) and name is available,
    // probe toasttab.com/{slug} — Toast uses path-based URLs and returns 301 for valid restaurants.
    // Cross-references address (zip + street number) to avoid false positives from same-named restaurants.
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
          const candidateUrl = loc.includes('toasttab.com') ? loc : toastUrl;
          if (loc.includes('toasttab.com') || probe.status === 200) {
            // Address cross-reference: fetch the Toast page and verify zip/street number match
            const { zip, streetNum } = parseAddressTokens(address);
            let addressVerified = !zip && !streetNum; // skip check if we have no address tokens
            if (!addressVerified && candidateUrl) {
              try {
                const pageRes = await fetch(candidateUrl, {
                  signal: AbortSignal.timeout(5000),
                  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PocketProspector/1.0)', 'Accept': 'text/html' },
                  redirect: 'follow',
                });
                if (pageRes.ok) {
                  const reader = pageRes.body.getReader();
                  let pageHtml = '';
                  let bytes = 0;
                  while (bytes < 200_000) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    pageHtml += new TextDecoder().decode(value, { stream: true });
                    bytes += value.byteLength;
                  }
                  reader.cancel().catch(() => {});
                  // Require at least one of: matching zip OR matching street number
                  if (zip && pageHtml.includes(zip)) addressVerified = true;
                  if (!addressVerified && streetNum) {
                    // Match street number as a word boundary to avoid "12" matching "1234 Main"
                    const snRegex = new RegExp(`\\b${streetNum}\\b`);
                    if (snRegex.test(pageHtml)) addressVerified = true;
                  }
                }
              } catch { /* couldn't verify — skip Toast match */ }
            }
            if (addressVerified) {
              pos = 'Toast';
              posSource = 'Toast ordering page';
              posSourceUrl = candidateUrl;
            }
          }
        }
      } catch { /* not on Toast */ }
    }

    const result = { pos, source: posSource, sourceUrl: posSourceUrl, thirdParty, comingSoon };
    posCache.set(cacheKey, { result, timestamp: Date.now() });
    if (posCache.size > 500) posCache.delete(posCache.keys().next().value);

    return Response.json(result);
  } catch (error) {
    console.error('POS detection error:', error);
    return Response.json({ pos: null, source: null, thirdParty: [] });
  }
}

