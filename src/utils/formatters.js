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
  const addr = info.location_address || info.address || "";
  const city = info.location_city || info.city || "";
  return city ? `${addr}, ${city}, TX` : addr || "Unknown";
}

export function pseudoLatLng(seed) {
  const h = Array.from(seed).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const lat = 29.7 + ((h % 100) / 100) * 3.5;
  const lng = -95.5 - ((h % 200) / 200) * 3.0;
  return { lat, lng };
}

export function parseSavedNotes(raw) {
  const s = (raw || "").toString();
  try {
    const p = JSON.parse(s);
    return {
      key: (p?.key || p?.key?.toString() || "").replace(/^KEY:/, "") || (p?.key ? p.key : undefined),
      notes: Array.isArray(p?.notes) ? p.notes : [],
      history: Array.isArray(p?.history) ? p.history : [],
      gpvTier: p?.gpvTier ?? null,
      activeOpp: p?.activeOpp ?? false,
      activeAccount: p?.activeAccount ?? false,
      venueType: p?.venueType || null,
      venueTypeLocked: p?.venueTypeLocked ?? false,
      aiResponse: p?.aiResponse || "",
      raw: p,
    };
  } catch (e) {
    const m = s.match(/KEY:([^\s",}]+)/);
    return { key: m ? m[1] : undefined, notes: [], history: [], activeOpp: false, activeAccount: false, venueType: null, venueTypeLocked: false, aiResponse: "", raw: s };
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

export function buildSocrataWhere(searchTerm, cityFilter) {
  const parts = [];
  if (searchTerm) {
    parts.push(
      `(upper(location_name) like '%${searchTerm}%' OR upper(taxpayer_name) like '%${searchTerm}%' OR upper(location_address) like '%${searchTerm}%')`
    );
  }
  if (cityFilter) {
    parts.push(`upper(location_city) = '${cityFilter}'`);
  }
  return parts.length > 0 ? parts.join(" AND ") : "1=1";
}
