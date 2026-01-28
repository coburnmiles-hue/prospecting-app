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
  ExternalLink,
  Loader2,
  Map as MapIcon,
  MapPin,
  Navigation,
  Search,
  Trophy,
  Bookmark,
  TrendingUp,
} from "lucide-react";

// Components
import TabButton from "../components/buttons/TabButton";
import SaveButton from "../components/buttons/SaveButton";
import ListItemButton from "../components/buttons/ListItemButton";
import SearchForm from "../components/cards/SearchForm";
import SavedAccountsHeader from "../components/cards/SavedAccountsHeader";
import ForecastCard from "../components/cards/ForecastCard";
import AIIntelPanel from "../components/cards/AIIntelPanel";
import VolumeAdjuster from "../components/cards/VolumeAdjuster";
import ActivityLog from "../components/cards/ActivityLog";
import GpvTierPanel from "../components/cards/GpvTierPanel";
import PersonalMetrics from "../components/cards/PersonalMetrics";

// Utils and Constants
import { 
  formatCurrency, 
  getFullAddress, 
  parseSavedNotes, 
  parseAiSections, 
  pseudoLatLng, 
  safeUpper,
  buildSocrataWhere,
  monthLabelFromDate
} from "../utils/formatters";
import { VENUE_TYPES, GPV_TIERS, BASE_URL, DATE_FIELD, TOTAL_FIELD, TEXAS_CENTER } from "../utils/constants";

// Custom Hooks
import { useSavedAccounts, useMetricsData } from "../hooks/useData";
import { useSearch, useTopLeaders } from "../hooks/useSearchAndTop";
import { useRoutePlanning } from "../hooks/useRoutePlanning";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

// -------------------- Component --------------------
export default function ProspectingApp() {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || ""; // do NOT hardcode keys
  const MAPBOX_KEY = process.env.NEXT_PUBLIC_MAPBOX_KEY || "";

  const [viewMode, setViewMode] = useState("search"); // search | top | saved | metrics
  const [savedSubView, setSavedSubView] = useState("list"); // list | map

  // Custom hooks for data fetching
  const { savedAccounts, setSavedAccounts, refreshSavedAccounts } = useSavedAccounts();
  const { metricsData, metricsLoading } = useMetricsData();
  
  // Search hook
  const {
    searchTerm,
    setSearchTerm,
    cityFilter,
    setCityFilter,
    results,
    loading: searchLoading,
    error: searchError,
    setError: setSearchError,
    handleSearch,
  } = useSearch();

  // Top leaders hook
  const {
    topCitySearch,
    setTopCitySearch,
    topAccounts,
    loading: topLoading,
    error: topError,
    setError: setTopError,
    handleTopSearch,
  } = useTopLeaders();

  // Combine loading and error states for backward compatibility
  const loading = searchLoading || topLoading;
  const error = searchError || topError;
  const setError = (err) => {
    setSearchError(err);
    setTopError(err);
  };

  const [savedSearchTerm, setSavedSearchTerm] = useState("");
  const [selectedEstablishment, setSelectedEstablishment] = useState(null); // { info, history, notes? }

  const [venueType, setVenueType] = useState("casual_dining");

  // Detail view loading (used when loading account history/details)
  const [detailLoading, setDetailLoading] = useState(false);

  // AI
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");

  // Notes (client only in this version)
  const [currentNote, setCurrentNote] = useState("");
  const [activityType, setActivityType] = useState("Walk-In");
  const [notesList, setNotesList] = useState([]);
  const [notesExpanded, setNotesExpanded] = useState(false);
  // notesOwner tracks which account the notesList belongs to: { id?: number|null, key?: string }
  const [notesOwner, setNotesOwner] = useState({ id: null, key: null });
  const [selectedGpvTier, setSelectedGpvTier] = useState(null);
  const [selectedActiveOpp, setSelectedActiveOpp] = useState(false);
  const [venueTypeLocked, setVenueTypeLocked] = useState(false);
  const savingLockStateRef = useRef(false);
  const skipAiLookupRef = useRef(false);

  // Route planning
  const [routePlanMode, setRoutePlanMode] = useState(false);
  const [selectedForRoute, setSelectedForRoute] = useState([]);
  const [calculatedRoute, setCalculatedRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const routePolylineRef = useRef(null);

  // Map
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});
  
  // GPV Tier visibility
  const [visibleTiers, setVisibleTiers] = useState(new Set(GPV_TIERS.map(t => t.id)));

  // Coordinate editor state
  const [coordLat, setCoordLat] = useState(0);
  const [coordLng, setCoordLng] = useState(0);
  const [coordSaving, setCoordSaving] = useState(false);
  const [coordSaved, setCoordSaved] = useState(false);
  const [coordEditorOpen, setCoordEditorOpen] = useState(false);
  // Manual add account state
  const [manualAddOpen, setManualAddOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [manualCityFilter, setManualCityFilter] = useState("");
  const [manualResults, setManualResults] = useState([]);
  const [manualSelected, setManualSelected] = useState(null);
  const [manualGpvTier, setManualGpvTier] = useState(null);
  const [manualSearching, setManualSearching] = useState(false);
  const [manualForecastOverride, setManualForecastOverride] = useState(null);
  const [manualForecastEditing, setManualForecastEditing] = useState(false);
  const manualSearchTimeout = useRef(null);

  // Wrapper for handleSearch to clear state
  const wrappedHandleSearch = async (e) => {
    setError("");
    setSelectedEstablishment(null);
    setAiResponse("");
    await handleSearch(e);
  };

  // Wrapper for handleTopSearch to clear state
  const wrappedHandleTopSearch = async (e) => {
    setError("");
    setSelectedEstablishment(null);
    setAiResponse("");
    await handleTopSearch(e);
  };

  // ---------- Select + load history ----------
  const analyze = async (est) => {
    setError("");
    setAiResponse("");
    skipAiLookupRef.current = false;
    setCurrentNote("");
    setSelectedEstablishment(null);
    // Clear transient selection state so new account starts with no GPV/opp/notes selected
    setSelectedGpvTier(null);
    setSelectedActiveOpp(false);
    setNotesList([]);
    setVenueTypeLocked(false);
    setNotesOwner({ id: null, key: null });

    if (!est?.taxpayer_number || !est?.location_number) return;

    setDetailLoading(true);
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
      setDetailLoading(false);
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
        await refreshSavedAccounts();
      } catch (err) {
        // ignore
      }
      return;
    }

    const addr = getFullAddress(info);

    // Use Google Geocoding API for accurate coordinates
    let lat, lng;
    try {
      console.log("Geocoding address:", addr);
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("Geocoding response:", data);
        if (data.lat && data.lng) {
          lat = data.lat;
          lng = data.lng;
          console.log("Using geocoded coordinates:", lat, lng);
        }
      } else {
        console.error("Geocoding failed:", response.status, await response.text());
      }
    } catch (e) {
      console.error("Geocoding error:", e);
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.log("Falling back to pseudo coordinates");
      const pseudo = pseudoLatLng(info.taxpayer_number);
      lat = pseudo.lat;
      lng = pseudo.lng;
    }

    try {

      // If AI is currently running, ask user to wait
      if (aiLoading) {
        setError("Please wait for AI Intelligence to finish loading before saving.");
        return;
      }

      // If we don't yet have an AI response for this selection, fetch it now so it is saved with the account
      if (!aiResponse || !aiResponse.trim()) {
        try {
          await fetchAiForInfo(info, { updateState: true });
        } catch (e) {
          // ignore - we'll still save without AI if it fails
          console.error('AI fetch before save failed', e);
        }
      }

      // Require GPV tier to be selected before saving a new account
      if (!selectedGpvTier) {
        setError("Please select a GPV Tier before saving this account.");
        return;
      }

      // Require venue type to be selected before saving a new account
      if (!venueType) {
        setError("Please select an Account Type before saving this account.");
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
        // store key + optional notes/history, GPV tier, and AI response in the notes field
        notes: JSON.stringify({ 
          key: `KEY:${key}`, 
          notes: Array.isArray(notesToPersist) ? notesToPersist : [], 
          history: Array.isArray(selectedEstablishment?.history) ? selectedEstablishment.history : [], 
          gpvTier: selectedGpvTier, 
          activeOpp: selectedActiveOpp, 
          venueType: venueType, 
          venueTypeLocked: venueTypeLocked,
          aiResponse: aiResponse || ""
        }),
      };

      console.log("Saving account with AI response:", aiResponse ? `${aiResponse.substring(0, 100)}...` : "EMPTY");
      console.log("Full payload notes:", payload.notes);

      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Save failed.");

      // Reload saved
      await refreshSavedAccounts();
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

    if (!saved || !saved.id) {
      // ensure UI state is cleared when no saved notes exist for this selection
      setSelectedGpvTier(null);
      setSelectedActiveOpp(false);
      setNotesList([]);
      setVenueTypeLocked(false);
      setNotesOwner({ id: null, key: null });
      return;
    }

    // Try to parse notes directly from the saved row (covers rows saved with JSON notes)
    try {
      const parsed = parseSavedNotes(saved.notes);
      // Always restore GPV tier, Active Opp flag, and venue type from saved payload if present
      setSelectedGpvTier(parsed?.gpvTier || null);
      setSelectedActiveOpp(parsed?.activeOpp || false);
      if (parsed?.venueType) {
        setVenueType(parsed.venueType);
      }
      // Only update lock state if we're not actively saving it (prevents race condition)
      if (!savingLockStateRef.current) {
        setVenueTypeLocked(parsed?.venueTypeLocked || false);
      }
      // Set notes and owner, even if empty
      setNotesList(Array.isArray(parsed.notes) ? parsed.notes : []);
      setNotesOwner({ id: saved.id, key: parsed.key || null });
      return;
    } catch {}

    // Fallback only if parsing completely failed - just set empty notes without resetting other state
    setNotesList([]);
    setNotesOwner({ id: saved.id, key: null });
  };

  useEffect(() => {
    setNotesExpanded(false);
    fetchNotesForSelected(selectedEstablishment);
    // populate coordinate editor from selectedEstablishment or savedAccounts
    if (selectedEstablishment && selectedEstablishment.info) {
      const info = selectedEstablishment.info;
      // Prefer explicit lat/lng on the selected info, otherwise try savedAccounts by id
      let lat = Number(info.lat);
      let lng = Number(info.lng);
      if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && info.id) {
        const saved = (Array.isArray(savedAccounts) ? savedAccounts : []).find((a) => a.id === info.id);
        if (saved) {
          lat = Number(saved.lat);
          lng = Number(saved.lng);
        }
      }
      setCoordLat(Number.isFinite(lat) ? lat : 0);
      setCoordLng(Number.isFinite(lng) ? lng : 0);
    } else {
      setCoordLat(0);
      setCoordLng(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEstablishment, savedAccounts]);

  const handleAddNote = async () => {
    if (!currentNote.trim() || !selectedEstablishment?.info) return;

    const key = `${selectedEstablishment.info.taxpayer_number || ""}-${selectedEstablishment.info.location_number || ""}`;

    // Prefer direct ID match when possible, otherwise match by exact parsed key
    let saved = (Array.isArray(savedAccounts) ? savedAccounts : []).find((a) => {
      if (selectedEstablishment.info.id && a.id === selectedEstablishment.info.id) return true;
      try {
        const parsed = parseSavedNotes(a.notes);
        if (parsed?.key && parsed.key === key) return true;
      } catch {}
      return false;
    });

    // If not saved yet, auto-save the account first so notes can persist
    if (!saved || !saved.id) {
      try {
        const info = selectedEstablishment.info;
        const addr = getFullAddress(info);
        let lat, lng;
        
        // Try to get coords from info or geocode
        lat = Number(info.lat);
        lng = Number(info.lng);
        
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          try {
            const q = encodeURIComponent(addr || "");
            const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`;
            const geoRes = await fetch(url, { headers: { "User-Agent": "prospecting-app" } });
            if (geoRes.ok) {
              const geoJson = await geoRes.json();
              if (Array.isArray(geoJson) && geoJson[0]) {
                lat = Number(geoJson[0].lat);
                lng = Number(geoJson[0].lon);
              }
            }
          } catch (e) {}
        }

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          const pseudo = pseudoLatLng(info.taxpayer_number || info.location_number || addr);
          lat = pseudo.lat;
          lng = pseudo.lng;
        }

        const payload = {
          name: info.location_name || info.name || "Account",
          address: addr,
          lat,
          lng,
          notes: JSON.stringify({ 
            key: `KEY:${key}`, 
            notes: [], 
            history: Array.isArray(selectedEstablishment?.history) ? selectedEstablishment.history : [],
            gpvTier: selectedGpvTier,
            activeOpp: selectedActiveOpp,
            venueType: venueType,
            venueTypeLocked: venueTypeLocked,
            aiResponse: aiResponse || ""
          }),
        };

        const res = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error("Auto-save failed");
        
        const created = await res.json();
        await refreshSavedAccounts();
        
        // Update selected establishment with new ID
        setSelectedEstablishment(s => s ? { ...s, info: { ...s.info, id: created.id } } : s);
        
        saved = created;
      } catch (err) {
        setError(err?.message || "Could not save account for notes.");
        return;
      }
    }

    try {
      const res = await fetch(`/api/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: saved.id, text: currentNote, activity_type: activityType }),
      });
      
      if (!res.ok) throw new Error("Note save failed");
      
      const body = await res.json();
      
      setNotesList(Array.isArray(body.notes) ? body.notes : []);
      setNotesOwner({ id: saved.id, key: null });
      
      // Reset activity type to default after adding note
      setActivityType("update");

      // refresh current gpv tier from saved row if present
      try {
        const refreshedRow = (await fetch("/api/accounts", { cache: "no-store" }).then((r) => r.json())).find((r) => r.id === saved.id);
        if (refreshedRow) {
          const parsed = parseSavedNotes(refreshedRow.notes);
            if (parsed?.gpvTier !== selectedGpvTier) {
              setSelectedGpvTier(parsed?.gpvTier || null);
            }
            if (parsed?.activeOpp !== selectedActiveOpp) {
              setSelectedActiveOpp(parsed?.activeOpp || false);
            }
            if (parsed?.venueType && parsed.venueType !== venueType) {
              setVenueType(parsed.venueType);
            }
            if (parsed?.venueTypeLocked !== venueTypeLocked) {
              setVenueTypeLocked(parsed?.venueTypeLocked || false);
            }
        }
      } catch {}

      await refreshSavedAccounts();
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

      await refreshSavedAccounts();
      const refreshed = savedAccounts;
      try {
        const refreshedRow = refreshed.find((r) => r.id === saved.id);
        if (refreshedRow) {
          const parsed = parseSavedNotes(refreshedRow.notes);
          setSelectedGpvTier(parsed?.gpvTier || null);
          setSelectedActiveOpp(parsed?.activeOpp || false);
          if (parsed?.venueType) {
            setVenueType(parsed.venueType);
          }
        }
      } catch {}
    } catch (err) {
      setError(err?.message || "Could not delete note.");
    }
  };

  // ---------- Route Planning ----------
  const calculateRoute = async () => {
    if (selectedForRoute.length < 2) {
      setError("Please select at least 2 accounts to plan a route.");
      return;
    }

    setRouteLoading(true);
    setError("");

    try {
      const waypoints = selectedForRoute.map(id => {
        const account = savedAccounts.find(a => a.id === id);
        return {
          lat: account.lat,
          lng: account.lng,
          name: account.name,
        };
      });

      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Route calculation failed');
      }

      const route = await res.json();
      setCalculatedRoute(route);

      // Reorder selectedForRoute based on optimized waypoint order
      if (route.waypoint_order && Array.isArray(route.waypoint_order)) {
        const optimizedOrder = route.waypoint_order.map(index => selectedForRoute[index]);
        setSelectedForRoute(optimizedOrder);
      }

      // Draw route on map if map is visible
      if (mapInstance.current && savedSubView === 'map' && route.polyline) {
        // Remove existing route if any
        if (routePolylineRef.current) {
          mapInstance.current.removeLayer(routePolylineRef.current);
        }

        // Draw new route
        const L = window.L;
        const polyline = L.polyline(route.polyline, {
          color: '#10b981',
          weight: 4,
          opacity: 0.8,
        }).addTo(mapInstance.current);

        routePolylineRef.current = polyline;

        // Fit map to route bounds
        mapInstance.current.fitBounds(polyline.getBounds(), { padding: [50, 50] });
      }
    } catch (err) {
      setError(err?.message || 'Failed to calculate route');
    } finally {
      setRouteLoading(false);
    }
  };

  // ---------- AI ----------
  // Fetch AI text for a given info object (returns the text). Also sets `aiResponse`/`aiLoading` when used with current selection.
  const fetchAiForInfo = async (info, { updateState = true } = {}) => {
    if (!info) return "";

    // If this is a saved account with existing AI response, return it
    if (info.id) {
      const saved = (Array.isArray(savedAccounts) ? savedAccounts : []).find((a) => a.id === info.id);
      if (saved) {
        try {
          const parsed = parseSavedNotes(saved.notes);
          if (parsed?.aiResponse) {
            if (updateState) {
              skipAiLookupRef.current = true;
              setAiResponse(parsed.aiResponse);
              setAiLoading(false);
            }
            return parsed.aiResponse;
          }
        } catch {}
      }
    }

    if (updateState) {
      setAiLoading(true);
      setAiResponse("");
    }

    try {
      const businessName = info.location_name || info.name || info.taxpayer_name || "(unknown)";
      const city = info.location_city || info.city || "Texas";
      const taxpayer = info.taxpayer_name || businessName;

      const payload = { name: businessName, city, taxpayer };

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
        const msg = `Error: ${errMsg}`;
        if (updateState) setAiResponse(msg);
        return msg;
      }

      const text = (bodyJson && (bodyJson.text || (bodyJson.raw && bodyJson.raw?.candidates?.[0]?.content?.parts?.[0]?.text))) || "";
      const trimmed = String(text || "No response received.").trim();
      if (updateState) setAiResponse(trimmed);
      return trimmed;
    } catch (err) {
      const msg = `Error: ${err?.message || "AI request failed"}`;
      if (updateState) setAiResponse(msg);
      return msg;
    } finally {
      if (updateState) setAiLoading(false);
    }
  };

  const performIntelligenceLookup = async () => {
    if (!selectedEstablishment || !selectedEstablishment.info) return;
    if (aiResponse && aiResponse.trim()) return;
    await fetchAiForInfo(selectedEstablishment.info, { updateState: true });
  };

  // Auto-trigger AI lookup when an account is selected (but only if no AI response exists)
  useEffect(() => {
    console.log("AI lookup useEffect triggered. selectedEstablishment:", !!selectedEstablishment, "aiResponse:", aiResponse ? "HAS VALUE" : "EMPTY", "skipFlag:", skipAiLookupRef.current);
    if (skipAiLookupRef.current) {
      console.log("Skipping AI lookup - using cached response");
      skipAiLookupRef.current = false;
      return;
    }
    if (selectedEstablishment && selectedEstablishment.info && !aiResponse) {
      console.log("Triggering AI lookup");
      performIntelligenceLookup();
    } else {
      console.log("Skipping AI lookup - already have response or no establishment selected");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEstablishment]);

  // ---------- Map setup ----------

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

      if (MAPBOX_KEY) {
        L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/dark-v10/tiles/{z}/{x}/{y}?access_token=${MAPBOX_KEY}`, {
          tileSize: 512,
          zoomOffset: -1,
          maxZoom: 22,
          attribution: '© Mapbox © OpenStreetMap',
        }).addTo(mapInstance.current);
      } else {
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          maxZoom: 19,
        }).addTo(mapInstance.current);
      }

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
      // Row has lat/lng saved, but fall back to pseudo if missing. Prefer the stored KEY (taxpayer-location)
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { ...row, lat, lng };
      const noteToken = (row.notes || "").toString().match(/KEY:([^\s,]+)/)?.[1];
      const seed = noteToken || row.id || row.name || "0";
      const pseudo = pseudoLatLng(seed);
      return { ...row, lat: pseudo.lat, lng: pseudo.lng };
    });

    pins.forEach((row) => {
      // Determine pin color by GPV tier if present
      const parsed = parseSavedNotes(row.notes);
      const tier = parsed?.gpvTier || null;
      
      // Skip this pin if its tier is not visible
      if (tier && !visibleTiers.has(tier)) return;
      
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

      // Calculate forecast if history is available
      let forecastHtml = '';
      if (parsed?.history && Array.isArray(parsed.history) && parsed.history.length > 0) {
        const h = parsed.history;
        const filtered = h.filter((m) => m.total > 0);
        const avgAlc = filtered.length > 0 ? (filtered.reduce((sum, m) => sum + m.total, 0) / filtered.length) : 0;
        // Use saved venue type or default
        const vt = parsed?.venueType || 'casual_dining';
        const cfg = VENUE_TYPES[vt] || VENUE_TYPES.casual_dining;
        const estFood = cfg.alcoholPct > 0 ? (avgAlc / cfg.alcoholPct) * cfg.foodPct : 0;
        const forecast = avgAlc + estFood;
        if (forecast > 0) {
          forecastHtml = `<div style="color: #10b981; font-size: 11px; font-weight: 800; margin-bottom: 8px;">Monthly Forecast: ${formatCurrency(forecast)}</div>`;
        }
      }

      marker.bindPopup(`
        <div style="font-family: ui-sans-serif, system-ui; padding: 10px; min-width: 220px;">
          <b style="text-transform: uppercase; display: block; margin-bottom: 6px; color: #fff; font-size: 13px;">${(row.name || "").toString()}</b>
          <span style="color: #94a3b8; font-size: 10px; display: block; margin-bottom: 12px; line-height: 1.4;">${(row.address || "").toString()}</span>
          ${forecastHtml}
          <a href="${mapsUrl}" target="_blank" style="display:block;text-align:center;background:#4f46e5;color:white;text-decoration:none;padding:10px;border-radius:10px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">
            Get Directions
          </a>
          <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${row.lat},${row.lng}" target="_blank" style="display:block;text-align:center;background:#059669;color:white;text-decoration:none;padding:10px;border-radius:10px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;">
            Street View
          </a>
        </div>
      `);

      // When a marker is clicked, surface the account and open the coord editor
      marker.on('click', () => {
        try {
          const parsed = parseSavedNotes(row.notes);
          const keyParts = parsed?.key ? parsed.key.split('-') : [];
          setSelectedEstablishment({
            info: {
              id: row.id,
              location_name: row.name || row.location_name,
              location_address: row.address || row.location_address,
              taxpayer_number: keyParts[0] || undefined,
              location_number: keyParts[1] || undefined,
              lat: row.lat,
              lng: row.lng,
            },
            history: Array.isArray(parsed?.history) ? parsed.history : [],
          });
          setCoordLat(row.lat || 0);
          setCoordLng(row.lng || 0);
          setCoordEditorOpen(true);
        } catch (e) {
          // ignore
        }
      });

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
  }, [savedAccounts, savedSubView, selectedGpvTier, visibleTiers]);

  // Note: popup-based unsave has been removed; saving/unsaving is handled
  // exclusively via the Save button in the account info UI which calls
  // DELETE /api/accounts?id=... and refreshes the saved list.

  // ---------- Derived ----------
  const stats = useMemo(() => {
    // If a manual forecast override exists for this account, use it as the total
    if (typeof manualForecastOverride === "number" && manualForecastOverride >= 0) {
      const cfg = VENUE_TYPES[venueType] || VENUE_TYPES.casual_dining;
      return { avgAlc: 0, estFood: 0, total: manualForecastOverride, cfg };
    }

    if (!selectedEstablishment?.history?.length) return null;
    const h = selectedEstablishment.history;
    const filtered = h.filter((m) => m.total > 0);
    const avgAlc = filtered.length > 0 ? (filtered.reduce((sum, m) => sum + m.total, 0) / filtered.length) : 0;
    const cfg = VENUE_TYPES[venueType] || VENUE_TYPES.casual_dining;
    const estFood = cfg.alcoholPct > 0 ? (avgAlc / cfg.alcoholPct) * cfg.foodPct : 0;
    return { avgAlc, estFood, total: avgAlc + estFood, cfg };
  }, [selectedEstablishment, venueType]);

  // Load manual forecast override from saved notes when selection changes
  useEffect(() => {
    try {
      const notes = selectedEstablishment?.info?.notes || "";
      const parsed = typeof notes === "string" ? JSON.parse(notes) : notes;
      if (parsed && typeof parsed.manualForecast === "number") {
        setManualForecastOverride(parsed.manualForecast);
      } else {
        setManualForecastOverride(null);
      }
      setManualForecastEditing(false);
    } catch (e) {
      setManualForecastOverride(null);
      setManualForecastEditing(false);
    }
  }, [selectedEstablishment]);

  // Auto-select GPV tier based on forecast
  useEffect(() => {
    if (stats?.total) {
      const total = stats.total;
      let tier = null;
      if (total >= 1000000) tier = 'tier6';
      else if (total >= 500000) tier = 'tier5';
      else if (total >= 250000) tier = 'tier4';
      else if (total >= 100000) tier = 'tier3';
      else if (total >= 50000) tier = 'tier2';
      else tier = 'tier1';
      
      // Update tier if it changed
      if (tier !== selectedGpvTier) {
        setSelectedGpvTier(tier);
        
        // Update saved account tier and trigger map marker refresh
        if (selectedEstablishment?.info?.id) {
          const key = `${selectedEstablishment.info.taxpayer_number || ""}-${selectedEstablishment.info.location_number || ""}`;
          const saved = (Array.isArray(savedAccounts) ? savedAccounts : []).find((a) => {
            if (selectedEstablishment.info.id && a.id === selectedEstablishment.info.id) return true;
            try {
              const parsed = parseSavedNotes(a.notes);
              if (parsed?.key && parsed.key === key) return true;
            } catch {}
            return false;
          });
          
          if (saved && saved.id) {
            try {
              const parsed = parseSavedNotes(saved.notes);
              let notesObj = (parsed && parsed.raw && typeof parsed.raw === "object") ? parsed.raw : { key: parsed.key ? `KEY:${parsed.key}` : `KEY:${key}`, notes: parsed.notes || [], history: parsed.history || [], venueType: venueType };
              notesObj.gpvTier = tier;
              notesObj.activeOpp = selectedActiveOpp;
              
              fetch(`/api/accounts?id=${saved.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: JSON.stringify(notesObj) }),
              }).then(async (res) => {
                if (res.ok) {
                  await refreshSavedAccounts();
                }
              }).catch(() => {});
            } catch {}
          }
        }
      }
    }
  }, [stats, selectedGpvTier, selectedEstablishment, savedAccounts, selectedActiveOpp, venueType]);

  // Persist venue type changes to saved account
  useEffect(() => {
    if (!selectedEstablishment?.info?.id || !venueType) return;
    
    const accountId = selectedEstablishment.info.id;
    const key = `${selectedEstablishment.info.taxpayer_number || ""}-${selectedEstablishment.info.location_number || ""}`;
    const saved = (Array.isArray(savedAccounts) ? savedAccounts : []).find((a) => {
      if (accountId && a.id === accountId) return true;
      try {
        const parsed = parseSavedNotes(a.notes);
        if (parsed?.key && parsed.key === key) return true;
      } catch {}
      return false;
    });
    
    if (saved && saved.id) {
      try {
        const parsed = parseSavedNotes(saved.notes);
        // Only update if venue type or lock state actually changed
        if (parsed?.venueType === venueType && parsed?.venueTypeLocked === venueTypeLocked) return;
        
        // Set flag to prevent fetch from overriding during save
        savingLockStateRef.current = true;
        
        let notesObj = (parsed && parsed.raw && typeof parsed.raw === "object") ? parsed.raw : { key: parsed.key ? `KEY:${parsed.key}` : `KEY:${key}`, notes: parsed.notes || [], history: parsed.history || [] };
        notesObj.venueType = venueType;
        notesObj.venueTypeLocked = venueTypeLocked;
        notesObj.gpvTier = selectedGpvTier;
        notesObj.activeOpp = selectedActiveOpp;
        
        fetch(`/api/accounts?id=${saved.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: JSON.stringify(notesObj) }),
        }).then(async (res) => {
          if (res.ok) {
            await refreshSavedAccounts();
          }
        }).catch(() => {}).finally(() => {
          // Clear flag after save completes (with slight delay to ensure state is synced)
          setTimeout(() => {
            savingLockStateRef.current = false;
          }, 100);
        });
      } catch {}
    }
  }, [venueType, venueTypeLocked, selectedGpvTier, selectedActiveOpp]);

  const filteredSavedAccounts = useMemo(() => {
    if (!savedSearchTerm.trim()) return savedAccounts;
    const s = savedSearchTerm.toUpperCase();
    return savedAccounts.filter((a) =>
      (a.name || "").toUpperCase().includes(s) ||
      (a.address || "").toUpperCase().includes(s)
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

      console.log("Clicked saved account, parsed data:", parsed);
      console.log("AI Response in saved data:", parsed?.aiResponse);

      // Always restore GPV, Active Opp, venue type and notes owner for saved items (if present)
      setSelectedGpvTier(parsed?.gpvTier || null);
      setSelectedActiveOpp(parsed?.activeOpp || false);
      if (parsed?.venueType) {
        setVenueType(parsed.venueType);
      }
      setVenueTypeLocked(parsed?.venueTypeLocked || false);
      setNotesList(Array.isArray(parsed.notes) ? parsed.notes : []);
      setNotesOwner({ id: data.id, key: parsed.key || null });
      
      // Restore AI response FIRST for all saved accounts
      if (parsed?.aiResponse) {
        console.log("Restoring cached AI response");
        skipAiLookupRef.current = true;
        setAiResponse(parsed.aiResponse);
        setAiLoading(false);
      } else {
        console.log("No cached AI response found");
        skipAiLookupRef.current = false;
        setAiResponse("");
      }
      
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
          if (parsed?.venueType) {
            setVenueType(parsed.venueType);
          }
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
      selectedEstablishment?.info &&
      (
        // Exact DB id match when available
        (data.id != null && selectedEstablishment.info.id != null && selectedEstablishment.info.id === data.id) ||
        // Match by taxpayer + location numbers for search/top results
        (selectedEstablishment.info.taxpayer_number && selectedEstablishment.info.location_number && data.taxpayer_number && data.location_number && selectedEstablishment.info.taxpayer_number === data.taxpayer_number && selectedEstablishment.info.location_number === data.location_number) ||
        // Fallback: match by name/address equality
        (selectedEstablishment.info.location_name === (data.name || data.location_name) && selectedEstablishment.info.location_address === (data.address || data.location_address))
      );

    const title =
      viewMode === "saved"
        ? data.name || "Saved Account"
        : data.location_name || data.taxpayer_name || "Unknown";

    const subtitle =
      viewMode === "saved"
        ? data.address || ""
        : `${data.location_city || ""}${data.location_city ? ", " : ""}TX`;

    const itemKey =
      viewMode === "saved"
        ? `${data.id || data.name}-${data.created_at || ""}`
        : `${data.taxpayer_number}-${data.location_number}`;

    // Route planning mode - show checkbox instead of normal click
    if (routePlanMode && viewMode === "saved") {
      const isSelected = selectedForRoute.includes(data.id);
      return (
        <div
          key={itemKey}
          className={`relative bg-[#0F172A] border ${isSelected ? 'border-emerald-500 bg-emerald-600/10' : 'border-slate-700'} rounded-3xl p-5 cursor-pointer transition-all hover:border-emerald-400`}
          onClick={() => {
            setSelectedForRoute(prev => 
              prev.includes(data.id) 
                ? prev.filter(id => id !== data.id)
                : [...prev, data.id]
            );
          }}
        >
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {}}
              className="mt-1 w-4 h-4 rounded border-slate-600 text-emerald-600 focus:ring-emerald-600"
            />
            <div className="flex-1">
              <div className="text-[11px] font-black uppercase text-white tracking-wider leading-tight">
                {title}
              </div>
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                {subtitle}
              </div>
              {selectedForRoute.includes(data.id) && (
                <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mt-2">
                  Stop #{selectedForRoute.indexOf(data.id) + 1}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <ListItemButton
        key={itemKey}
        itemKey={itemKey}
        onClick={() => handleListItemClick(item)}
        isActive={isActive}
        title={title}
        subtitle={subtitle}
        showDelete={viewMode === "saved"}
        onDelete={viewMode === "saved" ? async () => {
          if (!data.id) return;
          
          // Show confirmation dialog
          const confirmed = window.confirm("Are you sure you want to remove this account from the saved folder?");
          if (!confirmed) return;
          
          try {
            // Delete the account (notes are stored in the same row, so they're deleted automatically)
            await fetch(`/api/accounts?id=${data.id}`, { method: 'DELETE' });
            await refreshSavedAccounts();
            // Clear selected if it was the deleted account
            if (selectedEstablishment?.info?.id === data.id) {
              setSelectedEstablishment(null);
              setNotesList([]);
            }
          } catch (err) {
            setError(err?.message || 'Could not delete account.');
          }
        } : undefined}
      />
    );
  };

    // Note: GPV tier is now auto-selected based on forecast, not manually clickable

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

        await refreshSavedAccounts();

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
          <TabButton
            onClick={() => {
              setViewMode("search");
              setSavedSubView("list");
              setSelectedEstablishment(null);
              setAiResponse("");
            }}
            active={viewMode === "search"}
          >
            <Search size={14} className="inline mr-2 -mt-0.5" /> Search
          </TabButton>

          <TabButton
            onClick={() => {
              setViewMode("top");
              setSavedSubView("list");
              setSelectedEstablishment(null);
              setAiResponse("");
            }}
            active={viewMode === "top"}
          >
            <Trophy size={14} className="inline mr-2 -mt-0.5" /> Leaders
          </TabButton>

          <TabButton
            onClick={() => {
              setViewMode("saved");
              setSelectedEstablishment(null);
              setAiResponse("");
            }}
            active={viewMode === "saved"}
            badge={savedAccounts.length}
          >
            <Bookmark size={14} className="inline mr-2 -mt-0.5" /> Saved
          </TabButton>

          <TabButton
            onClick={() => {
              setViewMode("metrics");
              setSavedSubView("list");
              setSelectedEstablishment(null);
              setAiResponse("");
            }}
            active={viewMode === "metrics"}
          >
            <TrendingUp size={14} className="inline mr-2 -mt-0.5" /> Metrics
          </TabButton>

          <TabButton
            onClick={() => setSavedSubView(savedSubView === "map" ? "list" : "map")}
            active={savedSubView === "map"}
          >
            <MapIcon size={14} className="inline mr-2 -mt-0.5" />{" "}
            {savedSubView === "map" ? "Map Active" : "Show Map"}
          </TabButton>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 pb-12">
        {/* Left column */}
        {viewMode !== "metrics" && (
          <aside className="lg:col-span-4 space-y-6">
            {viewMode === "saved" ? (
              <SavedAccountsHeader
                searchTerm={savedSearchTerm}
                onSearchChange={(e) => setSavedSearchTerm(e.target.value)}
                onAdd={() => {
                  setManualAddOpen((s) => !s);
                  setManualSelected(null);
                  setManualGpvTier(null);
                  setManualQuery("");
                }}
                onPlanRoute={() => {
                  setRoutePlanMode((m) => !m);
                  setSelectedForRoute([]);
                  setCalculatedRoute(null);
                  if (routePolylineRef.current && mapInstance.current) {
                    mapInstance.current.removeLayer(routePolylineRef.current);
                    routePolylineRef.current = null;
                  }
                }}
                routePlanMode={routePlanMode}
              />
            ) : (
              <SearchForm
                onSubmit={viewMode === "search" ? wrappedHandleSearch : wrappedHandleTopSearch}
                searchTerm={viewMode === "search" ? searchTerm : topCitySearch}
                onSearchChange={(e) =>
                  viewMode === "search"
                    ? setSearchTerm(e.target.value.toUpperCase())
                    : setTopCitySearch(e.target.value.toUpperCase())
                }
                cityFilter={cityFilter}
                onCityChange={(e) => setCityFilter(e.target.value.toUpperCase())}
                loading={loading}
                error={error}
                viewMode={viewMode}
              />
            )}

            {/* Route Planning Panel */}
            {routePlanMode && viewMode === "saved" && (
              <div className="bg-emerald-600/10 border border-emerald-500/20 rounded-3xl p-5 space-y-3">
                <div className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">
                  Route Planning: {selectedForRoute.length} Stop{selectedForRoute.length !== 1 ? 's' : ''} Selected
                </div>
                {selectedForRoute.length >= 2 && (
                  <button
                    onClick={calculateRoute}
                    disabled={routeLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-[11px] uppercase tracking-widest py-3 px-4 rounded-xl transition-all"
                  >
                    {routeLoading ? 'Calculating...' : 'Calculate Route'}
                  </button>
                )}
                {calculatedRoute && (
                  <div className="mt-3 space-y-2 text-[10px]">
                    <div className="flex justify-between text-emerald-300 font-bold">
                      <span>Total Distance:</span>
                      <span>{(calculatedRoute.distance / 1609.34).toFixed(1)} mi</span>
                    </div>
                    <div className="flex justify-between text-emerald-300 font-bold">
                      <span>Est. Time:</span>
                      <span>{Math.round(calculatedRoute.duration / 60)} min</span>
                    </div>
                    <button
                      onClick={() => {
                        const waypoints = selectedForRoute.map(id => {
                          const account = savedAccounts.find(a => a.id === id);
                          return `${account.lat},${account.lng}`;
                        }).join('/');
                        window.open(`https://www.google.com/maps/dir/${waypoints}`, '_blank');
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest py-2 px-3 rounded-xl mt-2"
                    >
                      Open in Google Maps
                    </button>
                  </div>
                )}
              </div>
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

            {/* Manual Add Panel */}
            {viewMode === 'saved' && manualAddOpen && (
              <div className="mt-4 bg-[#0b1220] p-4 rounded-2xl border border-slate-700">
                <h4 className="text-xs font-black uppercase text-indigo-300 mb-3">Add Account</h4>
                
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <input
                    value={manualQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setManualQuery(val);
                      // Debounced auto-search
                      if (manualSearchTimeout.current) clearTimeout(manualSearchTimeout.current);
                      if (val.trim().length >= 3) {
                        manualSearchTimeout.current = setTimeout(async () => {
                          setManualSearching(true);
                          setManualResults([]);
                          setError('');
                          try {
                            const params = new URLSearchParams({
                              query: val.trim(),
                              ...(manualCityFilter.trim() && { city: manualCityFilter.trim() })
                            });
                            const url = `/api/places?${params}`;
                            console.log('Manual search URL:', url);
                            const res = await fetch(url);
                            if (!res.ok) {
                              const errData = await res.json().catch(() => ({}));
                              throw new Error(errData.error || `Search failed: ${res.status}`);
                            }
                            const data = await res.json();
                            console.log('Manual search results:', data);
                            const results = data.results || [];
                            setManualResults(results);
                            if (results.length === 0) {
                              setError('No results found. Try a different search term or city.');
                            }
                          } catch (e) {
                            console.error('Manual search error:', e);
                            setError(e?.message || 'Search failed');
                            setManualResults([]);
                          } finally {
                            setManualSearching(false);
                          }
                        }, 400);
                      } else {
                        setManualResults([]);
                      }
                    }}
                    placeholder="Search business name or address..."
                    className="col-span-2 bg-[#071126] border border-slate-700 px-3 py-2 rounded-xl text-[12px]"
                  />
                  <input
                    value={manualCityFilter}
                    onChange={(e) => setManualCityFilter(e.target.value.toUpperCase())}
                    placeholder="Filter by city (optional)"
                    className="bg-[#071126] border border-slate-700 px-3 py-2 rounded-xl text-[12px]"
                  />
                  <button
                    onClick={() => {
                      setManualQuery('');
                      setManualCityFilter('');
                      setManualResults([]);
                      setManualSelected(null);
                      setManualGpvTier(null);
                    }}
                    className="bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl text-[10px] font-bold uppercase"
                  >
                    Clear
                  </button>
                </div>

                {manualSearching && (
                  <div className="text-indigo-400 text-[11px] mb-2 flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Searching...
                  </div>
                )}

                  {manualResults.length > 0 && (
                  <div className="max-h-64 overflow-y-auto mb-3 bg-[#020617] border border-slate-800 rounded-xl">
                    {manualResults.map((r, i) => (
                      <div 
                        key={i} 
                        className={`p-3 border-b border-slate-800 last:border-0 cursor-pointer transition-colors ${manualSelected === r ? 'bg-indigo-900/30 border-indigo-700' : 'hover:bg-slate-900'}`} 
                        onClick={() => {
                          setManualSelected(r);
                          setManualResults([]);
                          setManualQuery('');
                        }}
                      >
                        <div className="font-bold text-sm text-white">{r.name || 'Unnamed'}</div>
                        <div className="text-[11px] text-slate-400 mt-1">{r.address || ''}</div>
                        {r.types && r.types.length > 0 && (
                          <div className="text-[10px] text-slate-500 mt-1">
                            {r.types.slice(0, 3).join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 mt-4">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Selected Account</div>
                  <input 
                    value={manualSelected ? (manualSelected.name || '') : ''} 
                    onChange={(e) => setManualSelected({...manualSelected, name: e.target.value})} 
                    placeholder="Business Name" 
                    className="w-full bg-[#071126] border border-slate-700 px-3 py-2 rounded-xl text-[12px]" 
                  />
                  <input 
                    value={manualSelected ? (manualSelected.address || '') : ''} 
                    onChange={(e) => setManualSelected({...manualSelected, address: e.target.value})} 
                    placeholder="Address" 
                    className="w-full bg-[#071126] border border-slate-700 px-3 py-2 rounded-xl text-[12px]" 
                  />

                  <div className="mt-2">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">GPV Tier</div>
                    <div className="flex gap-2 flex-wrap">
                      {GPV_TIERS.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setManualGpvTier(t.id)}
                          className={`px-3 py-1 rounded-xl text-[11px] font-black uppercase flex items-center gap-2 border ${manualGpvTier === t.id ? 'border-emerald-500 bg-emerald-600/10' : 'border-slate-700'} `}
                        >
                          <span style={{width:12,height:12,background:t.color,borderRadius:6,display:'inline-block'}}></span>
                          <span>{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        // Prepare payload and save (mirror validations from toggleSaveAccount)
                        const info = manualSelected || {};
                        const name = (info.name || '').trim() || 'Manual Account';
                        const address = (info.address || '').trim();

                        // Require AI to not already be running
                        if (aiLoading) {
                          setError('Please wait for AI Intelligence to finish loading before saving.');
                          return;
                        }

                        // Require GPV tier selection
                        const chosenTier = manualGpvTier || selectedGpvTier;
                        if (!chosenTier) {
                          setError('Please select a GPV Tier before saving this account.');
                          return;
                        }

                        // Require venue type
                        if (!venueType) {
                          setError('Please select an Account Type before saving this account.');
                          return;
                        }

                        // Run AI for this manual info so the response is saved with the account
                        let aiText = "";
                        try {
                          aiText = await fetchAiForInfo({ location_name: name, location_city: manualCityFilter || '', taxpayer_name: name }, { updateState: true });
                        } catch (e) {
                          console.error('AI fetch for manual save failed', e);
                        }

                        // Use coordinates from Google Places if available, otherwise geocode
                        let lat = info.lat;
                        let lng = info.lng;

                        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                          // Fallback to pseudo coords if no valid coordinates
                          const pseudo = pseudoLatLng(name || address || Date.now());
                          lat = pseudo.lat; 
                          lng = pseudo.lng;
                        }

                        const payload = {
                          name,
                          address,
                          lat,
                          lng,
                          notes: JSON.stringify({ manual: true, gpvTier: chosenTier, activeOpp: selectedActiveOpp, venueType: venueType, venueTypeLocked: venueTypeLocked, aiResponse: aiText || aiResponse || "" })
                        };
                        try {
                          const res = await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                          if (!res.ok) throw new Error('Save failed');
                          const created = await res.json();
                          await refreshSavedAccounts();
                          setManualAddOpen(false);
                          setManualQuery('');
                          setManualResults([]);
                          setManualSelected(null);
                          setManualGpvTier(null);
                          // restore selected gpv tier for UI so pin color matches immediately
                          setSelectedGpvTier(chosenTier);
                          // open the newly created account in the detail panel with proper ID so SaveButton shows as saved
                          setSelectedEstablishment({ 
                            info: { 
                              id: created.id, 
                              location_name: created.name, 
                              location_address: created.address, 
                              lat: created.lat, 
                              lng: created.lng,
                              // Include the notes field so isSaved can match it
                              notes: created.notes
                            }, 
                            history: [] 
                          });
                        } catch (err) {
                          setError(err?.message || 'Could not save account.');
                        }
                      }}
                      className="bg-indigo-600 px-3 py-2 rounded-xl text-[12px] font-black uppercase"
                    >
                      Save Account
                    </button>
                    <button onClick={() => { setManualAddOpen(false); setManualGpvTier(null); }} className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700">Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Right column */}
        <section className={viewMode === "metrics" ? "lg:col-span-12" : "lg:col-span-8"}>
          {viewMode === "metrics" ? (
            metricsLoading ? (
              <div className="h-[600px] flex flex-col items-center justify-center text-center bg-[#1E293B]/20 rounded-[3rem] border border-dashed border-slate-700">
                <Loader2 size={40} className="text-indigo-600 animate-spin mb-6" />
                <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">Loading Metrics</h2>
                <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-2">
                  Fetching data from Google Sheets...
                </p>
              </div>
            ) : (
              <PersonalMetrics 
                data={metricsData} 
                onActivityClick={async (accountId) => {
                  // Switch to saved view and select the account
                  setViewMode('saved');
                  setSavedSubView('info');
                  
                  // Find the account in savedAccounts
                  const account = savedAccounts.find(a => a.id === accountId);
                  if (account) {
                    // Create establishment object from saved account
                    try {
                      const parsed = typeof account.notes === 'string' ? JSON.parse(account.notes) : account.notes;
                      const keyParts = parsed?.key ? parsed.key.split('-') : [];
                      
                      setSelectedEstablishment({
                        info: {
                          id: account.id,
                          location_name: account.name,
                          location_address: account.address,
                          taxpayer_number: keyParts[0] || undefined,
                          location_number: keyParts[1] || undefined,
                          lat: account.lat,
                          lng: account.lng,
                        },
                        history: Array.isArray(parsed?.history) ? parsed.history : [],
                      });
                    } catch (e) {
                      console.error('Failed to load account:', e);
                    }
                  }
                }}
              />
            )
          ) : savedSubView === "map" ? (
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
                  {GPV_TIERS.map((t) => {
                    const isVisible = visibleTiers.has(t.id);
                    return (
                      <div 
                        key={t.id} 
                        className="flex items-center gap-3 cursor-pointer hover:bg-slate-800/50 px-2 py-1 rounded-lg transition-colors"
                        onClick={() => {
                          setVisibleTiers(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(t.id)) {
                              newSet.delete(t.id);
                            } else {
                              newSet.add(t.id);
                            }
                            return newSet;
                          });
                        }}
                      >
                        <div style={{ 
                          width: 14, 
                          height: 14, 
                          background: isVisible ? t.color : '#334155', 
                          borderRadius: 6, 
                          border: '2px solid #fff',
                          opacity: isVisible ? 1 : 0.4
                        }} />
                        <div className="text-[11px] font-bold" style={{ opacity: isVisible ? 1 : 0.5 }}>{t.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div ref={mapRef} className="flex-1 bg-[#020617] relative z-10" />
            </div>
          ) : selectedEstablishment ? (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              {/* Manual account banner */}
              {(() => {
                try {
                  const notes = selectedEstablishment?.info?.notes || '';
                  const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes;
                  if (parsed?.manual) {
                    return (
                      <div className="bg-amber-900/20 border border-amber-700/50 rounded-2xl px-4 py-2 text-center">
                        <span className="text-amber-400 font-black text-[10px] uppercase tracking-widest">⚡ Manually Created</span>
                      </div>
                    );
                  }
                } catch (e) {}
                return null;
              })()}
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

                      <button
                        onClick={() => setCoordEditorOpen((s) => !s)}
                        className="bg-indigo-600/10 border border-indigo-500/20 px-4 py-2 rounded-xl text-indigo-400 hover:bg-indigo-600 hover:text-white flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                      >
                        Adjust Pin Location
                      </button>
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
                    <SaveButton
                      onClick={toggleSaveAccount}
                      isSaved={isSaved(selectedEstablishment.info)}
                      disabled={aiLoading && !isSaved(selectedEstablishment.info)}
                    />

                    <div className="flex flex-col">
                      <ForecastCard total={stats?.total || 0} />
                      {/* Always-visible Edit shortcut to ensure users can find forecast control */}
                      {selectedEstablishment && selectedEstablishment.info && (
                        <div className="mt-2 text-right">
                          {!manualForecastEditing && (
                            <button
                              type="button"
                              onMouseDown={(e) => { e.stopPropagation(); console.log('Edit Forecast mousedown'); setManualForecastEditing(true); }}
                              onClick={(e) => { e.stopPropagation(); console.log('Edit Forecast click'); }}
                              style={{ zIndex: 1000, pointerEvents: 'auto' }}
                              className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-[11px] font-bold uppercase"
                            >
                              Edit Forecast
                            </button>
                          )}
                        </div>
                      )}
                      {(() => {
                        try {
                          const notes = selectedEstablishment?.info?.notes || '';
                          const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes;
                          const isSavedAccount = !!selectedEstablishment?.info?.id;
                          // Show edit control for any selected account (saved or not)
                          if (selectedEstablishment && selectedEstablishment.info) {
                            return (
                              <div className="mt-2 text-right">
                                {manualForecastEditing ? (
                                  <div className="flex items-center gap-2 justify-end">
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={manualForecastOverride != null ? manualForecastOverride : ''}
                                      onChange={(e) => setManualForecastOverride(e.target.value === '' ? null : Number(e.target.value))}
                                      className="w-32 bg-[#020617] border border-slate-700 text-[12px] font-bold px-3 py-2 rounded-xl"
                                    />
                                    <button type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        // Persist manualForecastOverride to saved row if saved, otherwise just close editor
                                        setManualForecastEditing(false);
                                        if (!selectedEstablishment?.info) return;
                                        const id = selectedEstablishment.info.id;
                                        const value = Number(manualForecastOverride) || 0;
                                        try {
                                          if (id) {
                                            // Patch saved account notes
                                            const saved = (Array.isArray(savedAccounts) ? savedAccounts : []).find(a => a.id === id);
                                            let parsedSaved = {};
                                            try { parsedSaved = parseSavedNotes(saved.notes) || {}; } catch {};
                                            parsedSaved.manualForecast = value;
                                            await fetch(`/api/accounts?id=${id}`, {
                                              method: 'PATCH',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ notes: JSON.stringify(parsedSaved) }),
                                            });
                                            await refreshSavedAccounts();
                                            // refresh selectedEstablishment notes
                                            setSelectedEstablishment(s => s ? { ...s, info: { ...s.info, notes: JSON.stringify(parsedSaved) } } : s);
                                          } else {
                                            // Not saved yet - just keep override in state
                                            // nothing else to do
                                          }
                                        } catch (err) {
                                          setError(err?.message || 'Could not save forecast.');
                                        }
                                      }}
                                      className="bg-emerald-600 px-3 py-2 rounded-xl text-[12px] font-black uppercase"
                                    >
                                      Save
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setManualForecastEditing(false); }} className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700">Cancel</button>
                                  </div>
                                  ) : (
                                  <div className="flex items-center gap-2 justify-end">
                                    <div className="text-[12px] font-black text-emerald-400">{formatCurrency(stats?.total || 0)}</div>
                                    <button
                                      type="button"
                                      onMouseDown={(e) => { e.stopPropagation(); console.log('Inline Edit mousedown'); setManualForecastEditing(true); }}
                                      onClick={(e) => { e.stopPropagation(); console.log('Inline Edit click'); }}
                                      style={{ zIndex: 1000, pointerEvents: 'auto' }}
                                      className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-[11px] font-bold uppercase"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          }
                        } catch (e) {}
                        return null;
                      })()}
                    </div>
                  </div>
                </div>

                {/* AI Intel Radar */}
                <AIIntelPanel
                  aiLoading={aiLoading}
                  aiResponse={aiResponse}
                />
                {coordEditorOpen && (
                  <div className="mt-6 bg-[#071126] p-4 rounded-2xl border border-slate-700">
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        step="0.000001"
                        value={coordLat}
                        onChange={(e) => setCoordLat(Number(e.target.value))}
                        className="w-36 bg-[#020617] border border-slate-700 text-[11px] font-bold px-3 py-2 rounded-xl"
                        placeholder="Latitude"
                      />
                      <input
                        type="number"
                        step="0.000001"
                        value={coordLng}
                        onChange={(e) => setCoordLng(Number(e.target.value))}
                        className="w-36 bg-[#020617] border border-slate-700 text-[11px] font-bold px-3 py-2 rounded-xl"
                        placeholder="Longitude"
                      />
                      <button
                        onClick={async () => {
                          if (!selectedEstablishment?.info || !selectedEstablishment.info.id) {
                            setError('Coordinate editing only supported for saved accounts.');
                            return;
                          }
                          if (!Number.isFinite(coordLat) || coordLat < -90 || coordLat > 90) {
                            setError('Latitude must be a number between -90 and 90.');
                            return;
                          }
                          if (!Number.isFinite(coordLng) || coordLng < -180 || coordLng > 180) {
                            setError('Longitude must be a number between -180 and 180.');
                            return;
                          }
                          setError('');
                          setCoordSaving(true);
                          setCoordSaved(false);
                          try {
                            const id = selectedEstablishment.info.id;
                            const res = await fetch(`/api/accounts?id=${id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ lat: coordLat, lng: coordLng }),
                            });
                            if (!res.ok) throw new Error('Failed to update coordinates');
                            const updated = await res.json();
                            await refreshSavedAccounts();
                            setSelectedEstablishment((s) => s ? { ...s, info: { ...s.info, lat: coordLat, lng: coordLng } } : s);
                            setCoordSaved(true);
                            setTimeout(() => setCoordSaved(false), 2500);
                            // close editor after save
                            setCoordEditorOpen(false);
                          } catch (err) {
                            setError(err?.message || 'Could not update coordinates.');
                          } finally {
                            setCoordSaving(false);
                          }
                        }}
                        disabled={coordSaving}
                        className={`bg-indigo-600 px-3 py-2 rounded-xl text-[12px] font-black uppercase tracking-wider ${coordSaving ? 'opacity-70 cursor-wait' : ''}`}
                      >
                        {coordSaving ? 'Saving...' : 'Save Coords'}
                      </button>
                      <button onClick={() => setCoordEditorOpen(false)} className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-[12px] font-bold">Cancel</button>
                      {coordSaved && <div className="text-emerald-400 font-bold text-[12px] ml-2">Saved</div>}
                    </div>
                  </div>
                )}
              </div>

              {/* Volume Adjuster + Historical Volume */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <VolumeAdjuster
                  venueTypes={VENUE_TYPES}
                  venueType={venueType}
                  onVenueChange={(e) => setVenueType(e.target.value)}
                  stats={stats}
                  isLocked={venueTypeLocked}
                  onToggleLock={() => setVenueTypeLocked(!venueTypeLocked)}
                  isSaved={!!selectedEstablishment?.info?.id}
                />

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

              {/* GPV Tier & Opportunity */}
              <GpvTierPanel
                gpvTiers={GPV_TIERS}
                selectedGpvTier={selectedGpvTier}
                selectedActiveOpp={selectedActiveOpp}
                onToggleActiveOpp={toggleActiveOpp}
              />

              {/* Notes (only for saved accounts) */}
              {selectedEstablishment?.info?.id && (
                <ActivityLog
                  notesList={notesList}
                  currentNote={currentNote}
                  setCurrentNote={setCurrentNote}
                  onAddNote={handleAddNote}
                  onDeleteNote={handleDeleteNote}
                  notesExpanded={notesExpanded}
                  setNotesExpanded={setNotesExpanded}
                  activityType={activityType}
                  setActivityType={setActivityType}
                />
              )}
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
