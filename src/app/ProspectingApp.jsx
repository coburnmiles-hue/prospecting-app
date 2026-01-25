"use client";

/**
 * ProspectingApp.jsx
 *
 * Dependencies (run in your project root):
 *   npm i lucide-react recharts
 *
 * Optional (recommended): put your Gemini key in .env.local as:
 *   NEXT_PUBLIC_GEMINI_API_KEY=YOUR_KEY
 *
 * Notes:
 * - This uses Texas Open Data (Socrata) for searching and history.
 * - Saved Accounts load/save uses your existing Next API route: /api/accounts
 *   - GET /api/accounts -> returns array of rows
 *   - POST /api/accounts -> inserts a row (expects { name, address, lat, lng, notes })
 * - If you do NOT have a working /api/accounts yet, the “Saved” tab will be empty.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  ExternalLink,
  Globe,
  Loader2,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Navigation,
  Percent,
  Plus,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  UserCheck,
  Utensils,
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

// Constants
const BASE_URL = "https://data.texas.gov/resource/naix-2893.json";
const DATE_FIELD = "obligation_end_date_yyyymmdd";
const TOTAL_FIELD = "total_receipts";
const TEXAS_CENTER = [31.0, -100.0];

const VENUE_TYPES = {
  casual_dining: { label: "Casual Dining", alcoholPct: 0.15, foodPct: 0.85, desc: "15% Alcohol" },
  fine_dining: { label: "Fine Dining", alcoholPct: 0.25, foodPct: 0.75, desc: "25% Alcohol" },
  bar_heavy: { label: "Bar/Nightclub", alcoholPct: 0.70, foodPct: 0.30, desc: "70% Alcohol" },
};

const GPV_TIERS = [
  { id: "tier1", label: "$0-50K", color: "#3b82f6" },
  { id: "tier2", label: "$50-100K", color: "#8b5cf6" },
  { id: "tier3", label: "$100-250K", color: "#ec4899" },
  { id: "tier4", label: "$250K+", color: "#f59e0b" },
];

// Helper functions
function safeUpper(str) {
  return (str || "").toString().toUpperCase().trim();
}

function buildSocrataWhere(searchTerm, cityFilter) {
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

function monthLabelFromDate(d) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  } catch {
    return "";
  }
}

function formatCurrency(val) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);
}

function getFullAddress(info) {
  const parts = [info.location_address, info.location_city].filter(Boolean);
  if (parts.length) return parts.join(", ") + ", TX";
  return "Texas";
}

function pseudoLatLng(seed) {
  const hash = String(seed || "0").split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  const lat = 29.0 + ((hash & 0xffff) / 0xffff) * 4.0;
  const lng = -99.0 + (((hash >> 16) & 0xffff) / 0xffff) * 6.0;
  return { lat, lng };
}

function parseAiSections(text) {
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

// -------------------- Component --------------------
export default function ProspectingApp() {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || ""; // do NOT hardcode keys

  const [viewMode, setViewMode] = useState("search"); // search | top | saved
  const [savedSubView, setSavedSubView] = useState("list"); // list | map

  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [topCitySearch, setTopCitySearch] = useState("");

  const [results, setResults] = useState([]);
  const [topAccounts, setTopAccounts] = useState([]);

  const [selectedEstablishment, setSelectedEstablishment] = useState(null); // { info, history, notes? }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [venueType, setVenueType] = useState("casual_dining");

  // Saved (Neon)
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [savedSearchTerm, setSavedSearchTerm] = useState("");

  // AI
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");

  // Notes (client only in this version)
  const [currentNote, setCurrentNote] = useState("");
  const [notesList, setNotesList] = useState([]);
  const [notesExpanded, setNotesExpanded] = useState(false);
  // notesOwner tracks which account the notesList belongs to: { id?: number|null, key?: string }
  const [notesOwner, setNotesOwner] = useState({ id: null, key: null });
  const [selectedGpvTier, setSelectedGpvTier] = useState(null);
  const [selectedActiveOpp, setSelectedActiveOpp] = useState(false);

  // Map
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});

  // ---------- Load saved accounts from Neon ----------
  useEffect(() => {
    const fetchSaved = async () => {
      try {
        const res = await fetch("/api/accounts", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setSavedAccounts(Array.isArray(data) ? data : []);
      } catch {
        // ignore
      }
    };
    fetchSaved();
  }, []);

  // ---------- Search ----------
  const handleSearch = async (e) => {
    e?.preventDefault?.();
    setError("");
    setSelectedEstablishment(null);
    setAiResponse("");

    const s = safeUpper(searchTerm);
    if (!s) return;

    setLoading(true);
    try {
      const c = safeUpper(cityFilter);

      const where = buildSocrataWhere(s, c);
      const query = `?$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(
        `${DATE_FIELD} DESC`
      )}&$limit=100`;

      const res = await fetch(`${BASE_URL}${query}`);
      if (!res.ok) throw new Error(`Texas data error (${res.status})`);

      const data = await res.json();

      // de-dupe by taxpayer + location
      const unique = [];
      const seen = new Set();
      for (const item of Array.isArray(data) ? data : []) {
        const key = `${item.taxpayer_number}-${item.location_number}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(item);
        }
      }

      setResults(unique);
    } catch (err) {
      setError(err?.message || "Search failed.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // ---------- Top leaders ----------
  const handleTopSearch = async (e) => {
    e?.preventDefault?.();
    setError("");
    setSelectedEstablishment(null);
    setAiResponse("");
    setTopAccounts([]);

    const input = safeUpper(topCitySearch);
    if (!input) return;

    setLoading(true);
    try {
      const isZip = /^\d{5}$/.test(input);

      // last 12 months
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const dateString = oneYearAgo.toISOString().split("T")[0] + "T00:00:00.000";

      const loc = isZip ? `location_zip = '${input}'` : `upper(location_city) = '${input}'`;

      const query =
        `?$select=location_name, location_address, location_city, location_zip, taxpayer_name, taxpayer_number, location_number, sum(${TOTAL_FIELD}) as annual_sales, count(${TOTAL_FIELD}) as months_count` +
        `&$where=${encodeURIComponent(`${loc} AND ${DATE_FIELD} > '${dateString}'`)}` +
        `&$group=location_name, location_address, location_city, location_zip, taxpayer_name, taxpayer_number, location_number` +
        `&$order=${encodeURIComponent("annual_sales DESC")}` +
        `&$limit=50`;

      const res = await fetch(`${BASE_URL}${query}`);
      if (!res.ok) throw new Error(`Texas data error (${res.status})`);
      const data = await res.json();

      const normalized = (Array.isArray(data) ? data : []).map((a) => ({
        ...a,
        annual_sales: Number(a.annual_sales || 0),
        avg_monthly_volume: Number(a.annual_sales || 0) / (Number(a.months_count || 12) || 12),
      }));

      setTopAccounts(normalized);
    } catch (err) {
      setError(err?.message || "Leaders lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Select + load history ----------
  const analyze = async (est) => {
    setError("");
    setAiResponse("");
    setCurrentNote("");
    setSelectedEstablishment(null);

    if (!est?.taxpayer_number || !est?.location_number) return;

    setLoading(true);
    try {
      const where = `taxpayer_number = '${est.taxpayer_number}' AND location_number = '${est.location_number}'`;
      const query = `?$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(
        `${DATE_FIELD} DESC`
      )}&$limit=12`;

      const res = await fetch(`${BASE_URL}${query}`);
      if (!res.ok) throw new Error(`History error (${res.status})`);
      const hist = await res.json();

      const rows = Array.isArray(hist) ? hist : [];
      const reversed = [...rows].reverse();

      // Normalize into chart-friendly months
      const history = reversed.map((h) => ({
        month: monthLabelFromDate(h[DATE_FIELD]),
        liquor: Number(h.liquor_receipts || 0),
        beer: Number(h.beer_receipts || 0),
        wine: Number(h.wine_receipts || 0),
        total: Number(h[TOTAL_FIELD] || 0),
        rawDate: h[DATE_FIELD],
      }));

      setSelectedEstablishment({
        info: est,
        history,
      });
      // AI now only runs on explicit user action (Ask button or quick-fill buttons)
    } catch (err) {
      setError(err?.message || "Could not load account details.");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Save / Unsave ----------
  const isSaved = (est) => {
    if (!est) return false;
    const key = `${est.taxpayer_number}-${est.location_number}`;
    return savedAccounts.some((a) => `${a.notes || ""}`.includes(key) || false);
  };

  const toggleSaveAccount = async () => {
    if (!selectedEstablishment?.info) return;

    // This version uses Neon as a simple “saved pins” store.
    // Your table is: accounts(id, name, address, lat, lng, notes, created_at)
    // We store the taxpayer/location ids inside "notes" so we can match later.
    const info = selectedEstablishment.info;
    const key = `${info.taxpayer_number}-${info.location_number}`;

    // If already saved, delete from backend and refresh saved list
    if (isSaved(info)) {
      try {
        const existing = (Array.isArray(savedAccounts) ? savedAccounts : []).find((a) => `${a.notes || ""}`.includes(key));
        if (existing && existing.id) {
          await fetch(`/api/accounts?id=${existing.id}`, { method: "DELETE" });
        }
        const refreshed = await fetch("/api/accounts", { cache: "no-store" }).then((r) => r.json());
        setSavedAccounts(Array.isArray(refreshed) ? refreshed : []);
      } catch (err) {
        // ignore
      }
      return;
    }

    const addr = getFullAddress(info);

    // Try to geocode the address with OpenStreetMap Nominatim for more accurate pins.
    // If geocoding fails or is rate-limited, fall back to pseudo coordinates.
    let lat, lng;
    try {
      const q = encodeURIComponent(addr || "" + (info.location_city || ""));
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`;
      const geoRes = await fetch(url, { headers: { "User-Agent": "prospecting-app" } });
      if (geoRes.ok) {
        const geoJson = await geoRes.json();
        if (Array.isArray(geoJson) && geoJson[0]) {
          lat = Number(geoJson[0].lat);
          lng = Number(geoJson[0].lon);
        }
      }
    } catch (e) {
      // ignore geocoding errors
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const pseudo = pseudoLatLng(info.taxpayer_number);
      lat = pseudo.lat;
      lng = pseudo.lng;
    }

    try {
      // Require GPV tier to be selected before saving a new account
      if (!selectedGpvTier) {
        setError("Please select a GPV Tier before saving this account.");
        return;
      }

      // Determine notes to persist only if the current notesOwner matches this account
      const notesToPersist = (notesOwner?.id && Number(notesOwner.id) === Number(info.id)) || (notesOwner?.key && notesOwner.key === key)
        ? notesList
        : [];

      const payload = {
        name: info.location_name || info.taxpayer_name || "Saved Account",
        address: addr,
        lat,
        lng,
        // store key + optional notes/history and GPV tier in the notes field
        notes: JSON.stringify({ key: `KEY:${key}`, notes: Array.isArray(notesToPersist) ? notesToPersist : [], history: Array.isArray(selectedEstablishment?.history) ? selectedEstablishment.history : [], gpvTier: selectedGpvTier, activeOpp: selectedActiveOpp }),
      };

      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Save failed.");

      // Reload saved
      const refreshed = await fetch("/api/accounts", { cache: "no-store" }).then((r) => r.json());
      setSavedAccounts(Array.isArray(refreshed) ? refreshed : []);
      setViewMode("saved");
      setSavedSubView("list");
    } catch (err) {
      setError(err?.message || "Could not save.");
    }
  };

  // ---------- Notes (persisted per saved account) ----------
  const fetchNotesForSelected = async (sel) => {
    if (!sel?.info) return;

    const key = `${sel.info.taxpayer_number || ""}-${sel.info.location_number || ""}`;
    const saved = (Array.isArray(savedAccounts) ? savedAccounts : []).find((a) => {
      try {
        const parsed = parseSavedNotes(a.notes);
        if (parsed?.key && parsed.key === key) return true;
      } catch {}
      if (a.id != null && sel.info.id != null && a.id === sel.info.id) return true;
      return false;
    });

    if (!saved || !saved.id) return;

    // Try to parse notes directly from the saved row (covers rows saved with JSON notes)
    try {
      const parsed = parseSavedNotes(saved.notes);
      // Always restore GPV tier and Active Opp flag from saved payload if present
      setSelectedGpvTier(parsed?.gpvTier || null);
      setSelectedActiveOpp(parsed?.activeOpp || false);
      // If notes are present in the saved JSON, use them and finish
      if (Array.isArray(parsed.notes) && parsed.notes.length) {
        setNotesList(parsed.notes);
        setNotesOwner({ id: saved.id, key: parsed.key || null });
        return;
      }
    } catch {}

    // Fallback to the notes API which reads the DB and returns parsed.notes when present
    try {
      const res = await fetch(`/api/notes?accountId=${saved.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotesList(Array.isArray(data.notes) ? data.notes : []);
      setNotesOwner({ id: saved.id, key: null });
      setSelectedGpvTier(null);
      setSelectedActiveOpp(false);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    setNotesExpanded(false);
    fetchNotesForSelected(selectedEstablishment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEstablishment, savedAccounts]);

  const handleAddNote = async () => {
    if (!currentNote.trim() || !selectedEstablishment?.info) return;

    const key = `${selectedEstablishment.info.taxpayer_number || ""}-${selectedEstablishment.info.location_number || ""}`;

    // Prefer direct ID match when possible, otherwise match by exact parsed key
    const saved = (Array.isArray(savedAccounts) ? savedAccounts : []).find((a) => {
      if (selectedEstablishment.info.id && a.id === selectedEstablishment.info.id) return true;
      try {
        const parsed = parseSavedNotes(a.notes);
        if (parsed?.key && parsed.key === key) return true;
      } catch {}
      return false;
    });

    if (!saved || !saved.id) {
      // not a saved account yet — keep UI-only note and mark owner by key so future save attaches correctly
      const newNote = { id: Math.floor(Date.now() / 1000), text: currentNote, created_at: new Date().toISOString() };
      setNotesList((prev) => [newNote, ...prev]);
      setNotesOwner({ id: null, key });
      setCurrentNote("");
      return;
    }

    try {
      const res = await fetch(`/api/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: saved.id, text: currentNote }),
      });
      if (!res.ok) throw new Error("Note save failed");
      const body = await res.json();
      setNotesList(Array.isArray(body.notes) ? body.notes : []);
      setNotesOwner({ id: saved.id, key: null });

      // refresh current gpv tier from saved row if present
      try {
        const refreshedRow = (await fetch("/api/accounts", { cache: "no-store" }).then((r) => r.json())).find((r) => r.id === saved.id);
        if (refreshedRow) {
          const parsed = parseSavedNotes(refreshedRow.notes);
            setSelectedGpvTier(parsed?.gpvTier || null);
            setSelectedActiveOpp(parsed?.activeOpp || false);
        }
      } catch {}

      const refreshed = await fetch("/api/accounts", { cache: "no-store" }).then((r) => r.json());
      setSavedAccounts(Array.isArray(refreshed) ? refreshed : []);
      setCurrentNote("");
    } catch (err) {
      setError(err?.message || "Could not save note.");
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!noteId || !selectedEstablishment?.info) return;

    const key = `${selectedEstablishment.info.taxpayer_number || ""}-${selectedEstablishment.info.location_number || ""}`;

    const saved = (Array.isArray(savedAccounts) ? savedAccounts : []).find((a) => {
      if (selectedEstablishment.info.id && a.id === selectedEstablishment.info.id) return true;
      try {
        const parsed = parseSavedNotes(a.notes);
        if (parsed?.key && parsed.key === key) return true;
      } catch {}
      return false;
    });

    if (!saved || !saved.id) {
      setNotesList((prev) => prev.filter((n) => n.id !== noteId));
      return;
    }

    try {
      const res = await fetch(`/api/notes?accountId=${saved.id}&noteId=${noteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      const body = await res.json();
      setNotesList(Array.isArray(body.notes) ? body.notes : []);

      const refreshed = await fetch("/api/accounts", { cache: "no-store" }).then((r) => r.json());
      setSavedAccounts(Array.isArray(refreshed) ? refreshed : []);
      try {
        const refreshedRow = refreshed.find((r) => r.id === saved.id);
        if (refreshedRow) {
          const parsed = parseSavedNotes(refreshedRow.notes);
          setSelectedGpvTier(parsed?.gpvTier || null);
          setSelectedActiveOpp(parsed?.activeOpp || false);
        }
      } catch {}
    } catch (err) {
      setError(err?.message || "Could not delete note.");
    }
  };

  // ---------- AI ----------
  const performIntelligenceLookup = async (establishment, customQuestion) => {
    setAiLoading(true);
    try {
      const src = establishment || (selectedEstablishment && selectedEstablishment.info) || {};
      let headerText = null;
      let domAddr = null;
      if (typeof document !== "undefined") {
        try {
          headerText = document.querySelector('h2.text-4xl')?.textContent?.trim() || null;
          const svg = document.querySelector('svg.lucide-map-pin') || document.querySelector('svg[aria-hidden]');
          domAddr = svg?.closest('p')?.textContent?.trim() || document.querySelector('p.text-slate-400')?.textContent?.trim() || null;
        } catch {}
      }
      const acctName = headerText || src.location_name || src.name || "(unknown)";
      const acctCity = src.location_city || src.city || "Texas";
      const acctAddr = (domAddr && domAddr.trim()) || (searchTerm && searchTerm.trim()) || src.location_address || src.address || "";

      const payload = {
        name: acctName,
        address: acctAddr,
        city: acctCity,
        isCustom: Boolean(customQuestion && String(customQuestion).trim()),
        question: customQuestion ? String(customQuestion).trim() : null,
      };

      try {
        console.log("Requesting /api/intel with:", payload);
      } catch {}

      const resp = await fetch(`/api/intel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const bodyText = await resp.text().catch(() => "");
      let bodyJson = null;
      try {
        bodyJson = bodyText ? JSON.parse(bodyText) : null;
      } catch (e) {
        bodyJson = null;
      }

      if (!resp.ok) {
        const errMsg = bodyJson?.error || bodyJson?.body || bodyText || `Server error ${resp.status}`;
        setAiResponse(`OWNERS: Not Found\nLOCATION COUNT: —\nACCOUNT DETAILS: ${errMsg}`);
        return;
      }

      const text = (bodyJson && (bodyJson.text || (bodyJson.raw && bodyJson.raw?.candidates?.[0]?.content?.parts?.[0]?.text))) || "";

      // Normalize output: remove question echoes and trim
      let clean = String(text || "").trim();
      if (customQuestion) {
        try {
          const q = String(customQuestion || "").trim();
          const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          clean = clean.replace(new RegExp(esc, "gi"), "").trim();
          clean = clean.replace(/^[:\-\s]+/, "");
        } catch {}
      }

      // Ensure fields are present in final text; fallback if not
      const parsed = parseAiSections(clean);
      // force LOCATION COUNT to digits-only or '—'
      const locDigits = (parsed.locations || "").match(/\d+/)?.[0] || "—";
      const ownersClean = (parsed.owners || "").replace(/\n/g, ", ").replace(/\s+,/g, ",").trim() || "Not found";
      const detailsClean = parsed.details || "—";

      const final = `OWNERS: ${ownersClean}\nLOCATION COUNT: ${locDigits}\nACCOUNT DETAILS: ${detailsClean}`;
      setAiResponse(final);
    } catch (err) {
      setAiResponse(`OWNERS: Not Found\nLOCATION COUNT: —\nACCOUNT DETAILS: ${err?.message || "AI failed"}`);
    } finally {
      setAiLoading(false);
    }
  };

  // ---------- Map setup ----------
  // Auto-run AI when a new establishment is selected so the client shows
  // OWNERS / LOCATION COUNT / ACCOUNT DETAILS immediately.
  useEffect(() => {
    if (!selectedEstablishment || !selectedEstablishment.info) return;
    // Call server-side proxy to get deterministic Gemini output
    performIntelligenceLookup(selectedEstablishment.info);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEstablishment?.info?.taxpayer_number, selectedEstablishment?.info?.location_number]);

  useEffect(() => {
    if (savedSubView !== "map") return;
    if (!mapRef.current) return;
    if (mapInstance.current) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const L = window.L;
      if (!L || !mapRef.current) return;

      mapInstance.current = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView(TEXAS_CENTER, 6);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(mapInstance.current);

      L.control.zoom({ position: "bottomright" }).addTo(mapInstance.current);

      updateMarkers();
    };

    document.head.appendChild(script);

    return () => {
      try {
        if (mapInstance.current) {
          mapInstance.current.remove();
          mapInstance.current = null;
        }
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSubView]);

  const updateMarkers = () => {
    if (!mapInstance.current || !window.L) return;
    const L = window.L;

    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    const bounds = L.latLngBounds([]);

    const pins = (Array.isArray(savedAccounts) ? savedAccounts : []).map((row) => {
      // Row has lat/lng saved, but fall back to pseudo if missing
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { ...row, lat, lng };
      const pseudo = pseudoLatLng(row.id || "0");
      return { ...row, lat: pseudo.lat, lng: pseudo.lng };
    });

    pins.forEach((row) => {
      // Determine pin color by GPV tier if present
      const parsed = parseSavedNotes(row.notes);
      const tier = parsed?.gpvTier || null;
      const tierColor = GPV_TIERS.find((t) => t.id === tier)?.color || "#4f46e5";
      const active = parsed?.activeOpp || false;
      const halo = active ? '0 0 0 10px rgba(16,185,129,0.32),' : '';

      const markerIcon = L.divIcon({
        className: "custom-div-icon",
        html: `<div style="width:32px;height:32px;border-radius:999px;background:${tierColor};border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:${halo}0 10px 20px rgba(0,0,0,.35);">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                   <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                   <circle cx="12" cy="10" r="3"></circle>
                 </svg>
               </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      const marker = L.marker([row.lat, row.lng], { icon: markerIcon }).addTo(mapInstance.current);

      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(row.address || "")}`;

      // Prefer a stable identifier: DB id, or the stored KEY token (after KEY:), else fallback to lat,lng
      const noteToken = (row.notes || "").toString().match(/KEY:([^\s,]+)/)?.[1];
      const rowId = row.id != null ? row.id.toString() : noteToken || `${row.lat},${row.lng}`;

      marker.bindPopup(`
        <div style="font-family: ui-sans-serif, system-ui; padding: 10px; min-width: 220px;">
          <b style="text-transform: uppercase; display: block; margin-bottom: 6px; color: #fff; font-size: 13px;">${(row.name || "").toString()}</b>
          <span style="color: #94a3b8; font-size: 10px; display: block; margin-bottom: 12px; line-height: 1.4;">${(row.address || "").toString()}</span>
          <a href="${mapsUrl}" target="_blank" style="display:block;text-align:center;background:#4f46e5;color:white;text-decoration:none;padding:10px;border-radius:10px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;">
            Get Directions
          </a>
        </div>
      `);

      const key = row.id?.toString() || `${row.lat},${row.lng}`;
      markersRef.current[key] = marker;
      bounds.extend([row.lat, row.lng]);
    });

    if (pins.length > 0) {
      mapInstance.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  };

  useEffect(() => {
    if (savedSubView === "map") updateMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAccounts, savedSubView]);

  // Note: popup-based unsave has been removed; saving/unsaving is handled
  // exclusively via the Save button in the account info UI which calls
  // DELETE /api/accounts?id=... and refreshes the saved list.

  // ---------- Derived ----------
  // UI-friendly account values for quick-fill buttons
  const uiSrc = (selectedEstablishment && selectedEstablishment.info) || {};
  const uiHeaderText = typeof document !== "undefined" ? document.querySelector('h2.text-4xl')?.textContent?.trim() : null;
  let uiDomAddr = null;
  if (typeof document !== "undefined") {
    try {
      const svg = document.querySelector('svg.lucide-map-pin') || document.querySelector('svg[aria-hidden]');
      uiDomAddr = svg?.closest('p')?.textContent?.trim() || document.querySelector('p.text-slate-400')?.textContent?.trim() || null;
    } catch {}
  }
  const displayAcctName = uiHeaderText || uiSrc.location_name || uiSrc.name || "(unknown)";
  const displayAcctAddr = (uiDomAddr && uiDomAddr.trim()) || (searchTerm && searchTerm.trim()) || uiSrc.location_address || uiSrc.address || "";
  const ownersPromptQuick = `OWNERS: Who owns ${displayAcctName} at ${displayAcctAddr}.`;
  const locCountPromptQuick = `LOCATION COUNT: How many locations does ${displayAcctName} have at ${displayAcctAddr}.`;
  const detailsPromptQuick = `ACCOUNT DETAILS: What are 2–3 brief, actionable or interesting facts I could use for prospecting ${displayAcctName} located at ${displayAcctAddr}?`;

  const aiContent = useMemo(() => {
    if (!aiResponse) return null;
    const s = { owners: "Loading...", locations: "Checking...", details: "Parsing..." };
    const norm = aiResponse.replace(/[*#]/g, '').trim();
    const oM = norm.match(/OWNERS:([\s\S]*?)(?=LOCATION COUNT:|$)/i);
    const lM = norm.match(/LOCATION COUNT:([\s\S]*?)(?=ACCOUNT DETAILS:|$)/i);
    const dM = norm.match(/ACCOUNT DETAILS:([\s\S]*?)$/i);
    if (oM) s.owners = oM[1].trim();
    if (lM) s.locations = lM[1].trim();
    if (dM) s.details = dM[1].trim();
    return s;
  }, [aiResponse]);

  const stats = useMemo(() => {
    if (!selectedEstablishment?.history?.length) return null;
    const h = selectedEstablishment.history;
    const filtered = h.filter((m) => m.total > 0);
    const avgAlc = filtered.length > 0 ? (filtered.reduce((sum, m) => sum + m.total, 0) / filtered.length) : 0;
    const cfg = VENUE_TYPES[venueType] || VENUE_TYPES.casual_dining;
    const estFood = cfg.alcoholPct > 0 ? (avgAlc / cfg.alcoholPct) * cfg.foodPct : 0;
    return { avgAlc, estFood, total: avgAlc + estFood, cfg };
  }, [selectedEstablishment, venueType]);

  const filteredSavedAccounts = useMemo(() => {
    if (!savedSearchTerm.trim()) return savedAccounts;
    const s = savedSearchTerm.toUpperCase();
    return savedAccounts.filter((a) =>
      a.info.location_name.toUpperCase().includes(s) ||
      a.info.location_address.toUpperCase().includes(s)
    );
  }, [savedAccounts, savedSearchTerm]);

  const listToRender = useMemo(() => {
    if (viewMode === "saved") return filteredSavedAccounts;
    if (viewMode === "top") return topAccounts;
    return results;
  }, [viewMode, filteredSavedAccounts, topAccounts, results]);

  // Handle clicks for list items (supports saved items with stored KEY:taxpayer-location)
  const handleListItemClick = (item) => {
    const data = item?.info || item;

    if (viewMode === "saved") {
      const parsed = parseSavedNotes(data.notes);

      // Always restore GPV, Active Opp and notes owner for saved items (if present)
      setSelectedGpvTier(parsed?.gpvTier || null);
      setSelectedActiveOpp(parsed?.activeOpp || false);
      setNotesList(Array.isArray(parsed.notes) ? parsed.notes : []);
      setNotesOwner({ id: data.id, key: parsed.key || null });

      // Restore chart/history immediately when present
      if (Array.isArray(parsed.history) && parsed.history.length) {
        // include DB id and possible taxpayer/location from parsed.key so fetchNotesForSelected can match
        const keyParts = parsed.key ? parsed.key.split("-") : [];
        const taxpayer_number = keyParts[0] || undefined;
        const location_number = keyParts[1] || undefined;

          setSelectedEstablishment({
            info: {
              id: data.id,
              location_name: data.name || "Saved Account",
              location_address: data.address || "",
              taxpayer_number,
              location_number,
            },
            history: parsed.history,
          });
          if (Array.isArray(parsed.notes) && parsed.notes.length) {
            setNotesList(parsed.notes);
            setNotesOwner({ id: data.id, key: parsed.key || null });
          } else {
            setNotesList([]);
            setNotesOwner({ id: data.id, key: parsed.key || null });
          }
          setSelectedGpvTier(parsed?.gpvTier || null);
          setSelectedActiveOpp(parsed?.activeOpp || false);
        return;
      }

      // Fallback: try KEY:taxpayer-location pattern and run remote analyze
      const m = (data.notes || "").toString().match(/KEY:([^\-\s]+)-([^\-\s]+)/);
      if (m) {
        const taxpayer_number = m[1];
        const location_number = m[2];

        analyze({
          taxpayer_number,
          location_number,
          location_name: data.name,
          location_address: data.address,
          location_city: data.address ? (data.address.split(",").slice(-2, -1)[0] || "").trim() : "",
        });
        return;
      }

      setSelectedEstablishment({ info: { id: data.id, location_name: data.name || "Saved Account", location_address: data.address || "" }, history: [] });
      return;
    }

    analyze(item?.info || item);
  };

  // Render item label for each mode
  const renderListItem = (item) => {
    const data = item?.info || item;

    const isActive =
      viewMode === "saved" &&
      selectedEstablishment?.info &&
      ((selectedEstablishment.info.id && data.id && selectedEstablishment.info.id === data.id) ||
        (selectedEstablishment.info.location_name === data.name && selectedEstablishment.info.location_address === data.address));

    const title =
      viewMode === "saved"
        ? data.name || "Saved Account"
        : data.location_name || data.taxpayer_name || "Unknown";

    const subtitle =
      viewMode === "saved"
        ? data.address || ""
        : `${data.location_city || ""}${data.location_city ? ", " : ""}TX`;

    return (
        <button
          key={
            viewMode === "saved"
              ? `${data.id || data.name}-${data.created_at || ""}`
              : `${data.taxpayer_number}-${data.location_number}`
          }
          onClick={() => handleListItemClick(item)}
        className={`w-full text-left p-5 rounded-3xl border transition-all flex items-center justify-between group ${
          isActive ? "bg-indigo-700 border-indigo-500 text-white" : "bg-[#1E293B] border-slate-700 hover:border-slate-500"
        }`}
      >
        <div className="truncate">
          <h4 className="font-black uppercase truncate text-sm italic tracking-tight text-slate-100">
            {title}
          </h4>
          <p className="text-[9px] uppercase font-bold truncate mt-0.5 text-slate-500">{subtitle}</p>
        </div>
        <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-300" />
      </button>
    );
  };

    // Apply GPV tier to selected account (persist for saved accounts)
    const applyGpvTier = async (tierId) => {
      if (!selectedEstablishment?.info) return;

      const key = `${selectedEstablishment.info.taxpayer_number || ""}-${selectedEstablishment.info.location_number || ""}`;

      const saved = (Array.isArray(savedAccounts) ? savedAccounts : []).find((a) => {
        if (selectedEstablishment.info.id && a.id === selectedEstablishment.info.id) return true;
        try {
          const parsed = parseSavedNotes(a.notes);
          if (parsed?.key && parsed.key === key) return true;
        } catch {}
        return false;
      });

      // Local-only selection for unsaved account
      if (!saved || !saved.id) {
        setSelectedGpvTier((s) => (s === tierId ? null : tierId));
        setNotesOwner((o) => ({ ...o, key }));
        return;
      }

      // Update saved account notes JSON to include gpvTier
      try {
        const parsed = parseSavedNotes(saved.notes);
          let notesObj = (parsed && parsed.raw && typeof parsed.raw === "object") ? parsed.raw : { key: parsed.key ? `KEY:${parsed.key}` : `KEY:${key}`, notes: parsed.notes || [], history: parsed.history || [] };
          notesObj.gpvTier = notesObj.gpvTier === tierId ? null : tierId;

        const res = await fetch(`/api/accounts?id=${saved.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: JSON.stringify(notesObj) }),
        });
        if (!res.ok) throw new Error("Could not update tier");

        const refreshed = await fetch("/api/accounts", { cache: "no-store" }).then((r) => r.json());
        setSavedAccounts(Array.isArray(refreshed) ? refreshed : []);

        // set UI state
        setSelectedGpvTier(notesObj.gpvTier || null);
        setNotesOwner({ id: saved.id, key: parsed.key || null });
      } catch (err) {
        setError(err?.message || "Could not set GPV tier.");
      }
    };

    // Toggle Active Opportunity flag for selected account
    const toggleActiveOpp = async () => {
      if (!selectedEstablishment?.info) return;
      const key = `${selectedEstablishment.info.taxpayer_number || ""}-${selectedEstablishment.info.location_number || ""}`;

      const saved = (Array.isArray(savedAccounts) ? savedAccounts : []).find((a) => {
        if (selectedEstablishment.info.id && a.id === selectedEstablishment.info.id) return true;
        try {
          const parsed = parseSavedNotes(a.notes);
          if (parsed?.key && parsed.key === key) return true;
        } catch {}
        return false;
      });

      // Local-only toggle for unsaved account
      if (!saved || !saved.id) {
        setSelectedActiveOpp((s) => !s);
        setNotesOwner((o) => ({ ...o, key }));
        return;
      }

      try {
        const parsed = parseSavedNotes(saved.notes);
        let notesObj = (parsed && parsed.raw && typeof parsed.raw === "object") ? parsed.raw : { key: parsed.key ? `KEY:${parsed.key}` : `KEY:${key}`, notes: parsed.notes || [], history: parsed.history || [], activeOpp: parsed?.activeOpp ?? false };
        notesObj.activeOpp = !!notesObj.activeOpp ? false : true;

        const res = await fetch(`/api/accounts?id=${saved.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: JSON.stringify(notesObj) }),
        });
        if (!res.ok) throw new Error("Could not update active flag");

        const refreshed = await fetch("/api/accounts", { cache: "no-store" }).then((r) => r.json());
        setSavedAccounts(Array.isArray(refreshed) ? refreshed : []);

        setSelectedActiveOpp(notesObj.activeOpp || false);
        setNotesOwner({ id: saved.id, key: parsed.key || null });
      } catch (err) {
        setError(err?.message || "Could not toggle Active Opp.");
      }
    };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans p-4 md:p-8 selection:bg-indigo-500/30">
      {/* Header */}
      <header className="max-w-6xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-600/20">
            <Navigation className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic leading-none">
              Pocket Prospector
            </h1>
            <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] mt-1 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              Live GIS Intelligence
            </p>
          </div>
        </div>

        <div className="flex bg-[#1E293B] p-1.5 rounded-2xl border border-slate-700 shadow-xl overflow-hidden">
          <button
            onClick={() => {
              setViewMode("search");
              setSavedSubView("list");
              setSelectedEstablishment(null);
              setAiResponse("");
            }}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest ${
              viewMode === "search" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Search size={14} className="inline mr-2 -mt-0.5" /> Search
          </button>

          <button
            onClick={() => {
              setViewMode("top");
              setSavedSubView("list");
              setSelectedEstablishment(null);
              setAiResponse("");
            }}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest ${
              viewMode === "top" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Trophy size={14} className="inline mr-2 -mt-0.5" /> Leaders
          </button>

          <button
            onClick={() => {
              setViewMode("saved");
              setSelectedEstablishment(null);
              setAiResponse("");
            }}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest relative ${
              viewMode === "saved" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Bookmark size={14} className="inline mr-2 -mt-0.5" /> Saved
            {savedAccounts.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-pink-500 text-[8px] text-white w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#1E293B]">
                {savedAccounts.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setSavedSubView(savedSubView === "map" ? "list" : "map")}
            className={`ml-2 px-5 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest border-l border-slate-700 ${
              savedSubView === "map" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <MapIcon size={14} className="inline mr-2 -mt-0.5" />{" "}
            {savedSubView === "map" ? "Map Active" : "Show Map"}
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 pb-12">
        {/* Left column */}
        <aside className="lg:col-span-4 space-y-6">
          {viewMode === "saved" ? (
            <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-700 shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 font-black uppercase italic text-xs tracking-widest text-indigo-400">
                  <Bookmark size={16} /> Portfolio
                </div>
              </div>

              <input
                type="text"
                placeholder="Filter saved..."
                className="w-full px-4 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-[10px] font-bold text-white outline-none focus:ring-1 focus:ring-indigo-600 uppercase placeholder:text-slate-600"
                value={savedSearchTerm}
                onChange={(e) => setSavedSearchTerm(e.target.value)}
              />
            </div>
          ) : (
            <section className="bg-[#1E293B] p-6 rounded-3xl border border-slate-700 shadow-lg">
              <form onSubmit={viewMode === "search" ? handleSearch : handleTopSearch} className="space-y-4">
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                      type="text"
                      placeholder={viewMode === "search" ? "Business or Address..." : "City or Zip Code..."}
                      className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-[#0F172A] border border-slate-700 text-white outline-none focus:ring-2 focus:ring-indigo-600 transition-all uppercase placeholder:text-slate-600"
                      value={viewMode === "search" ? searchTerm : topCitySearch}
                      onChange={(e) =>
                        viewMode === "search"
                          ? setSearchTerm(e.target.value.toUpperCase())
                          : setTopCitySearch(e.target.value.toUpperCase())
                      }
                    />
                  </div>

                  {viewMode === "search" && (
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                      <input
                        type="text"
                        placeholder="City Filter..."
                        className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-[#0F172A] border border-slate-700 text-white outline-none focus:ring-2 focus:ring-indigo-600 transition-all uppercase placeholder:text-slate-600"
                        value={cityFilter}
                        onChange={(e) => setCityFilter(e.target.value.toUpperCase())}
                      />
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] flex justify-center items-center gap-2 transition-all disabled:opacity-70"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : viewMode === "top" ? "Rank Accounts" : "Search Records"}
                </button>

                {!!error && (
                  <div className="text-[11px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3">
                    {error}
                  </div>
                )}
              </form>
            </section>
          )}

          <div className="space-y-3 max-h-[550px] overflow-y-auto pr-2 custom-scroll">
            {listToRender.map(renderListItem)}
            {listToRender.length === 0 && (
              <div className="text-slate-500 text-[11px] font-bold uppercase tracking-widest bg-[#1E293B] border border-slate-700 rounded-3xl p-6">
                {viewMode === "saved"
                  ? "No saved accounts yet."
                  : viewMode === "top"
                  ? "Run a city or zip ranking to see leaders."
                  : "Search for a business or address to see results."}
              </div>
            )}
          </div>
        </aside>

        {/* Right column */}
        <section className="lg:col-span-8">
          {savedSubView === "map" ? (
            <div className="bg-[#1E293B] rounded-[2.5rem] border border-slate-700 shadow-2xl overflow-hidden relative min-h-[600px] flex flex-col">
              <div className="p-6 border-b border-slate-700 bg-slate-900/80 flex items-center justify-between z-[1000] backdrop-blur-md">
                <div>
                  <h2 className="text-xs font-black text-white uppercase italic tracking-[0.2em] flex items-center gap-2">
                    <Navigation size={14} className="text-indigo-500" /> PORTFOLIO TERRITORY
                  </h2>
                </div>
                <div className="flex gap-2">
                  <div className="px-3 py-1 bg-slate-800 rounded-full border border-slate-700 text-[8px] font-black uppercase text-indigo-400 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>{" "}
                    {savedAccounts.length} SAVED PINS
                  </div>
                </div>
              </div>

              <div className="absolute top-20 right-6 z-30 bg-slate-900/80 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 shadow-xl">
                <div className="font-black uppercase text-[10px] text-indigo-300 mb-2">GPV Legend</div>
                <div className="flex flex-col gap-2">
                  {GPV_TIERS.map((t) => (
                    <div key={t.id} className="flex items-center gap-3">
                      <div style={{ width: 14, height: 14, background: t.color, borderRadius: 6, border: '2px solid #fff' }} />
                      <div className="text-[11px] font-bold">{t.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div ref={mapRef} className="flex-1 bg-[#020617] relative z-10" />
            </div>
          ) : selectedEstablishment ? (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              {/* Account hero */}
              <div className="bg-[#1E293B] p-8 md:p-10 rounded-[2.5rem] border border-slate-700 shadow-2xl relative">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="max-w-md">
                    <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase italic leading-none">
                      {selectedEstablishment.info.location_name}
                    </h2>

                    <div className="flex flex-wrap gap-4 mt-5">
                      <p className="text-slate-400 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest leading-relaxed">
                        <MapPin size={16} className="text-indigo-400" />{" "}
                        {getFullAddress(selectedEstablishment.info)}
                      </p>

                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                          getFullAddress(selectedEstablishment.info)
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-indigo-600/10 border border-indigo-500/20 px-4 py-2 rounded-xl text-indigo-400 hover:bg-indigo-600 hover:text-white flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                      >
                        <ExternalLink size={14} /> Navigate Now
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={toggleSaveAccount}
                      className={`flex flex-col items-center justify-center w-16 h-16 rounded-[1.5rem] border transition-all ${
                        isSaved(selectedEstablishment.info)
                          ? "bg-pink-600 border-pink-500 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                      }`}
                    >
                      {isSaved(selectedEstablishment.info) ? <BookmarkCheck size={24} /> : <Bookmark size={24} />}
                      <span className="text-[8px] font-black uppercase mt-1">
                        {isSaved(selectedEstablishment.info) ? "Saved" : "Save"}
                      </span>
                    </button>

                    <div className="bg-emerald-600 p-6 rounded-[2rem] shadow-xl shrink-0 min-w-[180px]">
                      <p className="text-[9px] font-black text-emerald-100 uppercase tracking-widest mb-1 flex items-center gap-2">
                        <TrendingUp size={12} /> Monthly Forecast
                      </p>
                      <p className="text-3xl font-black text-white italic tracking-tighter leading-none">
                        {formatCurrency(stats?.total || 0)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* AI Intel Radar */}
                <div className="bg-[#0F172A]/80 rounded-[2rem] border border-slate-700 p-8 mt-10">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="bg-indigo-600 p-2.5 rounded-xl">
                      {aiLoading ? (
                        <Loader2 className="text-white animate-spin" size={20} />
                      ) : (
                        <Sparkles className="text-white" size={20} />
                      )}
                    </div>
                    <h3 className="text-[11px] font-black uppercase italic tracking-[0.2em] text-white">
                      AI Intel Radar
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                        <button
                          onClick={() => setAiQuestion(ownersPromptQuick)}
                          className="flex items-center gap-2 mb-3 font-black text-[9px] text-slate-500 uppercase tracking-widest hover:opacity-80"
                        >
                          <UserCheck size={14} className="text-indigo-400" /> Ownership
                        </button>
                        <div className="h-3" />
                    </div>

                    <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                      <button
                        onClick={() => setAiQuestion(locCountPromptQuick)}
                        className="flex items-center gap-2 mb-3 font-black text-[9px] text-slate-500 uppercase tracking-widest hover:opacity-80"
                      >
                        <Globe size={14} className="text-emerald-400" /> Network Size
                      </button>
                      <div className="h-3" />
                    </div>

                    <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                      <button
                        onClick={() => setAiQuestion(detailsPromptQuick)}
                        className="flex items-center gap-2 mb-3 font-black text-[9px] text-slate-500 uppercase tracking-widest hover:opacity-80"
                      >
                        <Target size={14} className="text-amber-400" /> Strategy
                      </button>
                      <div className="h-3" />
                    </div>
                  </div>
                <div className="mt-6">
                  <textarea
                    placeholder="Ask AI a question..."
                    value={aiQuestion}
                    onChange={(e) => setAiQuestion(e.target.value)}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-2xl p-4 text-[11px] font-bold text-slate-200 outline-none min-h-[70px] resize-none"
                  />
                  <div className="flex justify-end mt-3">
                    <button
                      onClick={() => {
                        if (!aiQuestion || !aiQuestion.trim()) return;
                        setAiResponse("");
                        performIntelligenceLookup(null, aiQuestion).catch(() => {});
                      }}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-black py-2 px-4 rounded-2xl uppercase tracking-widest text-[10px]"
                    >
                      Ask
                    </button>
                  </div>
                </div>
                <div className="mt-4 bg-[#071126] border border-slate-800 rounded-2xl p-4">
                  <div className="text-[10px] font-black uppercase text-indigo-300 mb-2">Results</div>
                  <pre className="whitespace-pre-wrap text-[11px] font-bold text-slate-200">{aiResponse || "No results yet."}</pre>
                </div>
                </div>
              </div>

              {/* Volume Adjuster + Historical Volume */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#1E293B] p-8 rounded-[2.5rem] border border-slate-700 flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3 font-black uppercase italic text-xs tracking-widest text-indigo-400">
                      <Utensils size={16} /> Volume Adjuster
                    </div>
                    <div className="px-3 py-1 bg-slate-800 rounded-full border border-slate-700 text-[8px] font-black uppercase text-emerald-400 flex items-center gap-2 tracking-tighter">
                      <Percent size={10} /> {VENUE_TYPES[venueType].desc}
                    </div>
                  </div>

                  <select
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-2xl p-4 text-[10px] font-black text-slate-200 uppercase outline-none mb-6 cursor-pointer"
                    value={venueType}
                    onChange={(e) => setVenueType(e.target.value)}
                  >
                    {Object.entries(VENUE_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>

                  <div className="bg-[#0F172A]/50 p-5 rounded-2xl border border-slate-800 mt-auto">
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">
                      Est. Food Revenue
                    </p>
                    <p className="text-xl font-black text-white italic tracking-tighter">
                      {formatCurrency(stats?.estFood || 0)}
                    </p>
                  </div>

                  <div className="mt-6 bg-[#0F172A]/50 p-5 rounded-2xl border border-slate-800">
                    <p className="text-[9px] font-black text-emerald-300 uppercase tracking-widest mb-1">
                      Est. Alcohol Revenue
                    </p>
                    <p className="text-xl font-black text-white italic tracking-tighter">
                      {formatCurrency(stats?.avgAlc || 0)}
                    </p>
                  </div>
                </div>

                <div className="bg-[#1E293B] p-8 rounded-[2.5rem] border border-slate-700">
                  <h3 className="text-[10px] font-black uppercase italic tracking-widest text-white mb-6">
                    Historical Volume
                  </h3>

                  <div className="h-[260px] w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={selectedEstablishment.history || []}
                        margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                      >
                        <CartesianGrid vertical={false} stroke="#ffffff08" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 10, fill: "#64748b", fontWeight: 800 }}
                          axisLine={false}
                          tickLine={false}
                          dy={10}
                        />
                        <YAxis hide domain={[0, "auto"]} />
                        <RechartsTooltip
                          cursor={{ fill: "#ffffff08" }}
                          contentStyle={{
                            backgroundColor: "#0F172A",
                            border: "1px solid #1e293b",
                            borderRadius: "12px",
                            fontSize: "10px",
                          }}
                          formatter={(value) => formatCurrency(value)}
                        />
                        <Bar dataKey="liquor" stackId="a" fill="#6366f1" stroke="#6366f1" fillOpacity={1} />
                        <Bar dataKey="beer" stackId="a" fill="#10b981" stroke="#10b981" fillOpacity={1} />
                        <Bar dataKey="wine" stackId="a" fill="#ec4899" stroke="#ec4899" fillOpacity={1} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Notes / GPV */}
              <div className="bg-[#1E293B] p-8 rounded-[2.5rem] border border-slate-700 shadow-xl">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3 font-black uppercase text-[11px] tracking-widest text-white">
                    <MessageSquare size={18} className="text-indigo-400" /> Activity Log
                  </div>
                </div>

                <div className="mt-6">
                  <h4 className="text-[10px] font-black uppercase italic tracking-widest text-indigo-400 mb-3">GPV Tier</h4>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex flex-wrap gap-3">
                      {GPV_TIERS.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => applyGpvTier(t.id)}
                          className={`px-3 py-2 rounded-xl font-black text-[11px] uppercase transition-all focus:outline-none border ${
                            selectedGpvTier === t.id ? "opacity-100 scale-100" : "opacity-70"
                          }`}
                          style={{ background: selectedGpvTier === t.id ? t.color : "transparent", color: selectedGpvTier === t.id ? "#fff" : t.color, borderColor: t.color }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    <div className="ml-4">
                      <button
                        onClick={toggleActiveOpp}
                        className={`px-3 py-2 rounded-xl font-black text-[11px] uppercase transition-all focus:outline-none border ${
                          selectedActiveOpp ? "bg-emerald-500 text-white" : "opacity-70"
                        }`}
                        style={{ borderColor: selectedActiveOpp ? "#10b981" : "#334155" }}
                      >
                        Active Opp
                      </button>
                    </div>
                  </div>

                  <div className="relative mb-6">
                    <textarea
                      placeholder="Enter follow-up details..."
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-3xl p-6 text-[11px] font-bold text-slate-200 outline-none min-h-[110px] resize-none"
                      value={currentNote}
                      onChange={(e) => setCurrentNote(e.target.value)}
                    />
                    <button
                      onClick={handleAddNote}
                      className="absolute bottom-4 right-4 bg-indigo-600 text-white p-3 rounded-2xl shadow-xl transition-transform active:scale-95"
                      title="Add note"
                    >
                      <Plus size={20} />
                    </button>
                  </div>

                  <div className="mt-4">
                    {notesList.length > 0 ? (
                      <div>
                        <div className="space-y-3 overflow-y-auto pr-2 custom-scroll" style={{ maxHeight: notesExpanded ? undefined : "10rem" }}>
                          {(notesExpanded ? notesList : notesList.slice(0, 5)).map((n) => (
                            <div key={n.id} className="bg-[#0F172A] p-4 rounded-2xl border border-slate-800 relative">
                              <button onClick={() => handleDeleteNote(n.id)} title="Delete note" className="absolute right-3 top-3 text-slate-400 hover:text-rose-400">×</button>
                              <div className="text-slate-400 text-[10px] font-bold mb-2 uppercase">{new Date(n.created_at).toLocaleString()}</div>
                              <div className="text-slate-200 font-bold text-[11px]">{n.text}</div>
                            </div>
                          ))}
                        </div>
                        {notesList.length > 5 && (
                          <div className="mt-3">
                            <button onClick={() => setNotesExpanded((s) => !s)} className="text-[11px] font-black uppercase text-indigo-400">
                              {notesExpanded ? "Collapse notes" : `Show past notes`}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">No notes yet for this account.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[600px] flex flex-col items-center justify-center text-center bg-[#1E293B]/20 rounded-[3rem] border border-dashed border-slate-700">
              <Navigation size={40} className="text-indigo-600 opacity-20 mb-6" />
              <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">System Idle</h2>
              <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-2 max-w-[320px]">
                Search for a Texas establishment to begin intelligence gathering.
              </p>
            </div>
          )}
        </section>
      </main>

      {/* Small CSS helpers */}
      <style>{`
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .leaflet-container { background: #020617 !important; border: none; }
        .leaflet-popup-content-wrapper { background: #1E293B; color: #fff; border-radius: 12px; border: 1px solid #475569; overflow: hidden; padding: 0; }
        .leaflet-popup-content { margin: 0; padding: 0; }
        .leaflet-popup-tip { background: #1E293B; }
        .custom-div-icon { background: transparent; border: none; }
      `}</style>
    </div>
  );
}
