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
  return [lat, lng];
}
