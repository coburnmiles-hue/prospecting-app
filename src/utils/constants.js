export const VENUE_TYPES = {
  fine_dining: { label: "Fine Dining", alcoholPct: 0.35, foodPct: 0.65, desc: "65% Food / 35% Alcohol" },
  casual_dining: { label: "Casual Dining", alcoholPct: 0.25, foodPct: 0.75, desc: "75% Food / 25% Alcohol" },
  pub_grill: { label: "Pub / Grill", alcoholPct: 0.45, foodPct: 0.55, desc: "55% Food / 45% Alcohol" },
  sports_bar: { label: "Sports Bar", alcoholPct: 0.55, foodPct: 0.45, desc: "45% Food / 55% Alcohol" },
  dive_bar: { label: "Dive Bar / Tavern", alcoholPct: 0.90, foodPct: 0.10, desc: "10% Food / 90% Alcohol" },
  no_food: { label: "No Food", alcoholPct: 1.0, foodPct: 0.0, desc: "0% Food / 100% Alcohol" },
};

export const GPV_TIERS = [
  { id: "nro", label: "NRO", color: "#06b6d4" }, // New Retail Opportunity - cyan
  { id: "tier1", label: "$0-50K", color: "#3b82f6" },
  { id: "tier2", label: "$50-100K", color: "#8b5cf6" },
  { id: "tier3", label: "$100-250K", color: "#ec4899" },
  { id: "tier4", label: "$250-500K", color: "#f59e0b" },
  { id: "tier5", label: "$500K-1M", color: "#10b981" },
  { id: "tier6", label: "$1M+", color: "#ef4444" },
];

export const BASE_URL = "https://data.texas.gov/resource/naix-2893.json";
export const DATE_FIELD = "obligation_end_date_yyyymmdd";
export const TOTAL_FIELD = "total_receipts";
export const TEXAS_CENTER = [31.0, -100.0];
