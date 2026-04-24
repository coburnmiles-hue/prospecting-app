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

export function buildSocrataWhere(searchTerm, cityFilter) {
  const parts = [];
  if (searchTerm) {
    // Strip apostrophes and hyphens from the search term so it can match DB entries
    // that have them (e.g. user types "JULIOS" → also matches "JULIO'S" in the DB)
    const stripped = searchTerm.replace(/['’\-]/g, '');
    parts.push(
      `(upper(location_name) like '%${searchTerm}%'` +
      ` OR upper(taxpayer_name) like '%${searchTerm}%'` +
      ` OR upper(location_address) like '%${searchTerm}%'` +
      // These two clauses strip apostrophes+hyphens from the DB field before comparing,
      // so a search for JULIOS will match a DB entry named JULIO'S
      ` OR replace(replace(upper(location_name), '''', ''), '-', '') like '%${stripped}%'` +
      ` OR replace(replace(upper(taxpayer_name), '''', ''), '-', '') like '%${stripped}%')`,
    );
  }
  if (cityFilter) {
    parts.push(`upper(location_city) = '${cityFilter}'`);
  }
  return parts.length > 0 ? parts.join(" AND ") : "1=1";
}
