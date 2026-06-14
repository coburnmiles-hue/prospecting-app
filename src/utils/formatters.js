export function formatCurrency(val) {
  if (!val || isNaN(val)) return "$0";
  const numVal = Number(val);
  
  if (numVal >= 1000000) {
    const millions = (numVal / 1000000).toFixed(1);
    return `$${millions}M`;
  }
  
  const thousands = Math.round(numVal / 1000);
  return `$${thousands}k`;
}

export function safeUpper(str) {
  return (str || "").toString().toUpperCase().trim();
}

export function monthLabelFromDate(d) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  } catch {
    return "";
  }
}

export function getFullAddress(info) {
  const addr = (info.location_address || info.address || "").trim();
  const city = (info.location_city || info.city || "").trim();
  if (!city) return addr || "Unknown";
  // Avoid appending city if it's already in the address string
  if (addr.toUpperCase().includes(city.toUpperCase())) return addr;
  return `${addr}, ${city}, TX`;
}

export function pseudoLatLng(seed) {
  const h = Array.from(seed).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const lat = 29.7 + ((h % 100) / 100) * 3.5;
  const lng = -95.5 - ((h % 200) / 200) * 3.0;
  return { lat, lng };
}

export function parseSavedNotes(raw) {
  let p;
  try {
    // Handle both string (text column) and object (JSONB column from Neon)
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      p = raw;
    } else {
      const s = (raw || "").toString();
      p = JSON.parse(s);
    }
    return {
      key: (p?.key || p?.key?.toString() || "").replace(/^KEY:/, "") || (p?.key ? p.key : undefined),
      notes: Array.isArray(p?.notes) ? p.notes : [],
      followups: Array.isArray(p?.followups) ? p.followups : [],
      history: Array.isArray(p?.history) ? p.history : [],
      gpvTier: p?.gpvTier ?? null,
      activeOpp: p?.activeOpp ?? false,
      activeAccount: p?.activeAccount ?? false,
      referral: p?.referral ?? false,
      hotLead: p?.hotLead ?? false,
      strategic: p?.strategic ?? false,
      closedLost: p?.closedLost ?? false,
      activeOppDate: p?.activeOppDate || null,
      activeAccountDate: p?.activeAccountDate || null,
      wonGpv: p?.wonGpv || null,
      wonArr: p?.wonArr || null,
      wonDateSigned: p?.wonDateSigned || null,
      venueType: p?.venueType || null,
      venueTypeLocked: p?.venueTypeLocked ?? false,
      aiResponse: p?.aiResponse || "",
      businessHours: p?.businessHours || null,
      businessWebsite: p?.businessWebsite || null,
      raw: p,
    };
  } catch (e) {
    const s = (raw || "").toString();
    const m = s.match(/KEY:([^\s",}]+)/);
    return { key: m ? m[1] : undefined, notes: [], followups: [], history: [], activeOpp: false, activeAccount: false, referral: false, hotLead: false, strategic: false, closedLost: false, activeOppDate: null, activeAccountDate: null, wonGpv: null, wonArr: null, wonDateSigned: null, venueType: null, venueTypeLocked: false, aiResponse: "", businessHours: null, businessWebsite: null, raw: s };
  }
}

export function parseAiSections(text) {
  if (!text) return { owners: "No intelligence found.", locations: "—", details: "—" };

  const norm = text.replace(/[*#]/g, "").trim();
  const owners = norm.match(/OWNERS:([\s\S]*?)(?=LOCATION COUNT:|$)/i)?.[1]?.trim();
  const locations = norm.match(/LOCATION COUNT:([\s\S]*?)(?=ACCOUNT DETAILS:|$)/i)?.[1]?.trim();
  const details = norm.match(/ACCOUNT DETAILS:([\s\S]*?)$/i)?.[1]?.trim();

  return {
    owners: owners || norm,
    locations: locations || "—",
    details: details || "—",
  };
}

// Normalize an address search term to match how TABC typically stores addresses
// (abbreviations, no periods). Returns the normalized string.
export function normalizeAddressSearch(input) {
  let s = (input || '').toUpperCase()
    .replace(/\./g, '')          // strip periods: "N. CONGRESS" -> "N CONGRESS"
    .replace(/['\u2019]/g, '')   // strip apostrophes
    .replace(/\s+/g, ' ')
    .trim();
  const abbrevs = [
    [/\bSTREET\b/g, 'ST'], [/\bAVENUE\b/g, 'AVE'], [/\bBOULEVARD\b/g, 'BLVD'],
    [/\bDRIVE\b/g, 'DR'],   [/\bROAD\b/g, 'RD'],   [/\bLANE\b/g, 'LN'],
    [/\bCOURT\b/g, 'CT'],   [/\bPLACE\b/g, 'PL'],  [/\bCIRCLE\b/g, 'CIR'],
    [/\bHIGHWAY\b/g, 'HWY'], [/\bFREEWAY\b/g, 'FWY'], [/\bEXPRESSWAY\b/g, 'EXPY'],
    [/\bNORTH\b/g, 'N'],    [/\bSOUTH\b/g, 'S'],   [/\bEAST\b/g, 'E'],  [/\bWEST\b/g, 'W'],
    [/\bSUITE\b/g, 'STE'],
  ];
  for (const [pattern, abbrev] of abbrevs) s = s.replace(pattern, abbrev);
  return s.replace(/\s+/g, ' ').trim();
}

export function buildSocrataWhere(searchTerm, cityFilter, broadMode = false) {
  const parts = [];
  if (searchTerm) {
    // Escape single quotes for SoQL safety
    const s = searchTerm.replace(/'/g, "''").trim();
    // Strip special chars for normalized matching
    const stripped = s.replace(/['\u2019\-&.,#]/g, '');

    // DB-side stripping functions (strip apostrophes, hyphens, ampersands, periods)
    const nameStripped = `replace(replace(replace(replace(upper(location_name), '''', ''), '-', ''), '&', ''), '.', '')`;
    const taxpayerStripped = `replace(replace(replace(replace(upper(taxpayer_name), '''', ''), '-', ''), '&', ''), '.', '')`;

    // Tokenize into meaningful words (ignore 1-char tokens)
    const words = stripped.split(/\s+/).filter(w => w.length > 1);

    if (broadMode) {
      // Broad fallback: any word matches location_name or taxpayer_name
      const wordClauses = words.flatMap(w => [
        `${nameStripped} like '%${w}%'`,
        `${taxpayerStripped} like '%${w}%'`,
      ]);
      if (wordClauses.length > 0) {
        parts.push(`(${wordClauses.join(' OR ')})`);
      }
    } else {
      const clauses = [];

      // 1. Exact phrase match
      clauses.push(`upper(location_name) like '%${s}%'`);
      clauses.push(`upper(taxpayer_name) like '%${s}%'`);

      // 2. Stripped exact phrase (handles apostrophes, hyphens, &, . in DB entries)
      if (stripped !== s) {
        clauses.push(`${nameStripped} like '%${stripped}%'`);
        clauses.push(`${taxpayerStripped} like '%${stripped}%'`);
      }

      // 3. All words AND -- each word must appear somewhere in the name.
      //    e.g. "JOES BAR GRILL" matches "JOE'S BAR & GRILL" or "THE BAR GRILL BY JOE"
      if (words.length > 1) {
        const allWordsName = words.map(w => `${nameStripped} like '%${w}%'`).join(' AND ');
        clauses.push(`(${allWordsName})`);
        const allWordsTaxpayer = words.map(w => `${taxpayerStripped} like '%${w}%'`).join(' AND ');
        clauses.push(`(${allWordsTaxpayer})`);
      }

      parts.push(`(${clauses.join(' OR ')})`);
    }
  }

  if (cityFilter) {
    const c = cityFilter.replace(/'/g, "''");
    parts.push(`upper(location_city) = '${c}'`);
  }
  return parts.length > 0 ? parts.join(" AND ") : "1=1";
}
