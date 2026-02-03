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

// Recharts components used for charts
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";

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



// -------------------- Component --------------------
export default function ProspectingApp() {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || ""; // do NOT hardcode keys
  const MAPBOX_KEY = process.env.NEXT_PUBLIC_MAPBOX_KEY || "";

  const [viewMode, setViewMode] = useState("search"); // search | top | saved | metrics | map
  const [savedSubView, setSavedSubView] = useState("list"); // list | info

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
  const [localLoading, setLoading] = useState(false);
  const loading = searchLoading || topLoading || localLoading;
  const error = searchError || topError;
  const setError = (err) => {
    setSearchError(err);
    setTopError(err);
  };

  const [savedSearchTerm, setSavedSearchTerm] = useState("");
  const [selectedEstablishment, setSelectedEstablishment] = useState(null); // { info, history, notes? }

  const [venueType, setVenueType] = useState("casual_dining");

  // AI
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");

  // Notes (client only in this version)
  const [currentNote, setCurrentNote] = useState("");
  const [activityType, setActivityType] = useState("walk-in");
  const [notesList, setNotesList] = useState([]);
  const [notesExpanded, setNotesExpanded] = useState(false);
  // notesOwner tracks which account the notesList belongs to: { id?: number|null, key?: string }
  const [notesOwner, setNotesOwner] = useState({ id: null, key: null });
  const [selectedGpvTier, setSelectedGpvTier] = useState(null);
  const [selectedActiveOpp, setSelectedActiveOpp] = useState(false);
  const [selectedActiveAccount, setSelectedActiveAccount] = useState(false);
  const [venueTypeLocked, setVenueTypeLocked] = useState(false);
  const savingLockStateRef = useRef(false);
  const skipAiLookupRef = useRef(false);

  // Route planning
  const [routePlanMode, setRoutePlanMode] = useState(false);
  const [selectedForRoute, setSelectedForRoute] = useState([]);
  const [calculatedRoute, setCalculatedRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const routePolylineRef = useRef(null);
  const [routeError, setRouteError] = useState("");
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [savedRoutesLoading, setSavedRoutesLoading] = useState(false);

  // Map
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});
  const userLocationLayerRef = useRef(null);
  const LABEL_ZOOM_THRESHOLD = 13;
  const [legendOpen, setLegendOpen] = useState(true);
  const [mapSearch, setMapSearch] = useState("");
  const [mapSearchSuggestions, setMapSearchSuggestions] = useState([]);
  const [showMapSuggestions, setShowMapSuggestions] = useState(false);
  
  // GPV Tier visibility
  const [visibleTiers, setVisibleTiers] = useState(new Set(GPV_TIERS.map(t => t.id)));
  const [visibleActiveAccounts, setVisibleActiveAccounts] = useState(true);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [showUnvisitedOnly, setShowUnvisitedOnly] = useState(false);
  const [showOpenOnly, setShowOpenOnly] = useState(false);

  // Hours of operation
  const [businessHours, setBusinessHours] = useState(null);
  const [hoursLoading, setHoursLoading] = useState(false);

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
  const [manualSearching, setManualSearching] = useState(false);
  const [manualGpvTier, setManualGpvTier] = useState(null);
  const [manualSaving, setManualSaving] = useState(false);
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
    // For manual accounts (no taxpayer_number), check by id or name+address
    if (!est.taxpayer_number || !est.location_number) {
      if (est.id) {
        return savedAccounts.some((a) => a.id === est.id);
      }
      // Check by name and address for unsaved manual accounts
      const name = est.location_name || est.name || '';
      const addr = est.location_address || est.address || '';
      return savedAccounts.some((a) => 
        a.name === name && a.address === addr
      );
    }
    const key = `${est.taxpayer_number}-${est.location_number}`;
    return savedAccounts.some((a) => `${a.notes || ""}`.includes(key) || false);
  };

  const toggleSaveAccount = async () => {
    if (!selectedEstablishment?.info) return;

    // This version uses Neon as a simple “saved pins” store.
    // Your table is: accounts(id, name, address, lat, lng, notes, created_at)
    // We store the taxpayer/location ids inside "notes" so we can match later.
    const info = selectedEstablishment.info;
    
    // For manual accounts (no taxpayer_number), generate a unique key from name and address
    const isManual = !info.taxpayer_number;
    const key = isManual 
      ? `MANUAL:${info.location_name || ''}-${info.location_address || ''}` 
      : `${info.taxpayer_number}-${info.location_number}`;

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
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.lat && data.lng) {
          lat = data.lat;
          lng = data.lng;
        }
      } else {
        console.error("Geocoding failed:", response.status, await response.text());
      }
    } catch (e) {
      console.error("Geocoding error:", e);
    }

    // For manual accounts, use the lat/lng from the info if available
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      if (Number.isFinite(info.lat) && Number.isFinite(info.lng)) {
        lat = info.lat;
        lng = info.lng;
        console.log("Using coordinates from info:", lat, lng);
      } else {
        console.log("Falling back to pseudo coordinates");
        const pseudo = pseudoLatLng(info.taxpayer_number || info.location_name || addr);
        lat = pseudo.lat;
        lng = pseudo.lng;
      }
    }

    try {
      // Require AI intel to be loaded before saving a new account
      if (aiLoading) {
        setError("Please wait for AI Intelligence to finish loading before saving.");
        return;
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
          aiResponse: aiResponse || "",
          manual: !info.taxpayer_number // mark as manual if no taxpayer number
        }),
      };



      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Save failed.");

      // Reload saved
      await refreshSavedAccounts();
      
      // For manual accounts, keep the account selected and load the saved data
      if (isManual) {
        // Find the newly saved account
        const updatedAccounts = await fetch('/api/accounts').then(r => r.json());
        const newlySaved = updatedAccounts.find(a => {
          const aName = (a.name || '').toLowerCase();
          const aAddr = (a.address || '').toLowerCase();
          const infoName = (info.location_name || '').toLowerCase();
          const infoAddr = (info.location_address || '').toLowerCase();
          return aName === infoName && aAddr === infoAddr;
        });
        
        if (newlySaved) {
          const parsed = parseSavedNotes(newlySaved.notes);
          // Keep the establishment selected with the saved GPV tier
          setSelectedEstablishment({
            info: {
              id: newlySaved.id,
              location_name: newlySaved.name,
              location_address: newlySaved.address,
              lat: newlySaved.lat,
              lng: newlySaved.lng,
              notes: newlySaved.notes,
            },
            history: parsed?.history || [],
          });
          // Restore the saved GPV tier to the UI
          if (parsed?.gpvTier) {
            setSelectedGpvTier(parsed.gpvTier);
            setManualGpvTier(parsed.gpvTier);
          }
        }
        
        // Close manual add panel
        setManualAddOpen(false);
        setManualQuery('');
        setManualResults([]);
        setManualSelected(null);
      } else {
        // For regular accounts, keep existing behavior
        setManualAddOpen(false);
        setManualQuery('');
        setManualResults([]);
        setManualSelected(null);
        setManualGpvTier(null);
      }
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
        setSelectedActiveAccount(parsed?.activeAccount || false);
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
      setActivityType("walk-in");

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

      // Try to get user's current location as the route origin
      const getUserLocation = () => new Promise((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('Geolocation not available'));
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 5000 }
        );
      });

      let origin = null;
      try {
        origin = await getUserLocation();
      } catch (e) {
        console.warn('Could not get user location for route origin, falling back to first waypoint', e);
        // fall back to first waypoint if available
        if (waypoints.length > 0) origin = { lat: waypoints[0].lat, lng: waypoints[0].lng };
      }

      // Log what we're sending so we can debug origin issues locally


      // If origin equals the first waypoint then geolocation likely failed or was denied
      try {
        const usedFallback = origin && waypoints.length > 0 && Number(origin.lat) === Number(waypoints[0].lat) && Number(origin.lng) === Number(waypoints[0].lng);
        if (usedFallback && typeof navigator !== 'undefined' && navigator.geolocation) {
          const msg = 'Could not access your location. Allow location access to use your current location as route start.';
          setRouteError(msg);
          // also propagate to global search/top error so it appears in SearchForm when visible
          setError(msg);
        } else {
          setRouteError("");
        }
      } catch (e) {}

      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, waypoints }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('Route API error response:', body);
        const msg = body?.error || body?.details || body?.message || 'Route calculation failed';
        setError(`Route API: ${msg}`);
        throw new Error(msg);
      }

      const route = body;
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
  // Fetch AI text for a given info object. If updateState is true, set `aiLoading`/`aiResponse`.
  const fetchAiForInfo = async (info = {}, options = { updateState: false }) => {
    const { updateState } = options || {};
    if (updateState) {
      setAiLoading(true);
      setAiResponse("");
    }

    try {
      const businessName = info.location_name || info.name || "(unknown)";
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
      const finalText = String(text || "No response received.").trim();
      if (updateState) setAiResponse(finalText);
      return finalText;
    } catch (err) {
      const msg = `Error: ${err?.message || "AI request failed"}`;
      if (updateState) setAiResponse(msg);
      return msg;
    } finally {
      if (updateState) setAiLoading(false);
    }
  };

  // Refresh AI for a saved account and update the database
  const refreshAiForSavedAccount = async () => {
    if (!selectedEstablishment || !selectedEstablishment.info) return;
    const info = selectedEstablishment.info;
    
    // Must be a saved account
    if (!info.id) return;
    
    const saved = (Array.isArray(savedAccounts) ? savedAccounts : []).find((a) => a.id === info.id);
    if (!saved) return;
    
    try {
      // Fetch new AI response
      const newAiResponse = await fetchAiForInfo(info, { updateState: true });
      
      // Update the account in the database with new AI response
      const parsed = parseSavedNotes(saved.notes);
      const updatedNotes = JSON.stringify({
        ...parsed,
        aiResponse: newAiResponse
      });
      
      const res = await fetch(`/api/accounts?id=${saved.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: updatedNotes
        })
      });
      
      if (res.ok) {
        // Refresh saved accounts list
        await refreshSavedAccounts();
      }
    } catch (err) {
      console.error('Failed to refresh AI:', err);
      setError(err?.message || 'Failed to refresh AI');
    }
  };

  // Backwards-compatible wrapper: trigger AI lookup for selectedEstablishment using fetchAiForInfo
  const performIntelligenceLookup = async () => {
    if (!selectedEstablishment || !selectedEstablishment.info) return;

    // Skip if AI response already available
    if (aiResponse && aiResponse.trim()) return;

    const info = selectedEstablishment.info;
    if (info.id) {
      const saved = (Array.isArray(savedAccounts) ? savedAccounts : []).find((a) => a.id === info.id);
      if (saved) {
        try {
          const parsed = parseSavedNotes(saved.notes);
          if (parsed?.aiResponse) {
            setAiResponse(parsed.aiResponse);
            return;
          }
        } catch {}
      }
    }

    await fetchAiForInfo(info, { updateState: true });
  };

  // Fetch saved routes
  const fetchSavedRoutes = async () => {
    setSavedRoutesLoading(true);
    try {
      const response = await fetch('/api/saved-routes');
      if (response.ok) {
        const data = await response.json();
        setSavedRoutes(data);
      }
    } catch (error) {
      console.error('Error fetching saved routes:', error);
    } finally {
      setSavedRoutesLoading(false);
    }
  };

  // Auto-trigger AI lookup when an account is selected (but only if no AI response exists)
  useEffect(() => {

    if (skipAiLookupRef.current) {

      skipAiLookupRef.current = false;
      return;
    }
    if (selectedEstablishment && selectedEstablishment.info && !aiResponse) {

      performIntelligenceLookup();
    } else {

    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEstablishment]);

  // Fetch saved routes when Data tab is opened
  useEffect(() => {
    if (viewMode === "metrics") {
      fetchSavedRoutes();
    }
  }, [viewMode]);

  // ---------- Map setup ----------

  useEffect(() => {
    if (viewMode !== "map") return;
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

      let baseLayer = null;
      if (MAPBOX_KEY) {
        baseLayer = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/dark-v10/tiles/{z}/{x}/{y}?access_token=${MAPBOX_KEY}`, {
          tileSize: 512,
          zoomOffset: -1,
          maxZoom: 22,
          attribution: '© Mapbox © OpenStreetMap',
        });
      } else {
        baseLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          maxZoom: 19,
        });
      }

      baseLayer.addTo(mapInstance.current);
      // Debug tile events and fallback to OSM if tiles don't load
      try {
        let tileLoaded = false;
        baseLayer.on && baseLayer.on('tileerror', (err) => console.warn('Leaflet tileerror', err));
        baseLayer.on && baseLayer.on('tileload', (e) => {
          tileLoaded = true;

        });

        // If no tiles load within 2s, add an OSM fallback layer for debugging
        setTimeout(() => {
          try {
            const container = mapInstance.current.getContainer && mapInstance.current.getContainer();

          } catch (e) {}

          if (!tileLoaded) {
            try {
              console.warn('No tiles loaded from primary provider; adding OSM fallback layer for debugging');
              const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
              osm.addTo(mapInstance.current);

              osm.on && osm.on('tileerror', (e) => console.warn('OSM tileerror', e));
            } catch (e) {
              console.error('Failed to add OSM fallback', e);
            }
          }
        }, 2000);
      } catch (e) {
        // ignore
      }

      L.control.zoom({ position: "bottomright" }).addTo(mapInstance.current);

      // Toggle pin label visibility and size based on zoom level
      try {
        mapInstance.current.on && mapInstance.current.on('zoomend', () => {
          try {
            const z = mapInstance.current.getZoom();
            // Calculate pin size: larger when zoomed out, smaller when zoomed in
            const baseSize = 32;
            const scale = Math.max(0.5, Math.min(1, (15 - z) / 8)); // Scale from 0.5 to 1
            const newSize = Math.round(baseSize * scale);
            
            Object.values(markersRef.current || {}).forEach((m) => {
              try {
                if (!m) return;
                // Update tooltip visibility
                if (typeof m.getTooltip === 'function') {
                  if (z >= LABEL_ZOOM_THRESHOLD) m.openTooltip(); else m.closeTooltip();
                }
                // Update pin size
                const icon = m.getIcon();
                if (icon && icon.options) {
                  icon.options.iconSize = [newSize, newSize];
                  icon.options.iconAnchor = [newSize / 2, newSize];
                  m.setIcon(icon);
                }
              } catch (e) {}
            });
          } catch (e) {}
        });
      } catch (e) {}

      // Expose map for console debugging and force a resize/invalidate to fix hidden container issues
      try {
        window._map = mapInstance.current;

        mapInstance.current.whenReady(() => {
          try {

            const container = mapInstance.current.getContainer();
            // If container has zero height, set a reasonable minHeight so tiles render
            if (container && container.clientHeight === 0) {
              console.warn('Map container has zero height; applying fallback minHeight');
              container.style.minHeight = '420px';
            }
          } catch (e) {
            // ignore
          }
          setTimeout(() => {
            try {
              mapInstance.current.invalidateSize();

            } catch (e) {
              console.error('invalidateSize failed', e);
            }
          }, 500);
        });
      } catch (e) {
        // ignore
      }

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
  }, [viewMode]);

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

    // Track coordinates to detect duplicates and apply offset
    const coordsCount = new Map();
    pins.forEach((row) => {
      const key = `${row.lat.toFixed(6)},${row.lng.toFixed(6)}`;
      coordsCount.set(key, (coordsCount.get(key) || 0) + 1);
    });
    const coordsOffset = new Map();

    pins.forEach((row) => {
      // Determine pin color by GPV tier if present
      const parsed = parseSavedNotes(row.notes);
      const tier = parsed?.gpvTier || null;
      
      // If 'show only active' is enabled, skip any non-active pins
      if (showActiveOnly && !parsed?.activeAccount) return;

      // Skip this pin if its tier is not visible
      if (tier && !visibleTiers.has(tier)) return;
      // If this is an Active Account pin and Active Account visibility is off, skip it
      if (parsed?.activeAccount && !visibleActiveAccounts) return;
      
      // Check if account has notes (has been visited)
      const hasNotes = parsed?.notes && Array.isArray(parsed.notes) && parsed.notes.length > 0;
      
      // If 'show unvisited only' is enabled, skip accounts that have notes
      if (showUnvisitedOnly && hasNotes) return;
      
      // If 'show open only' is enabled, skip accounts that are closed
      if (showOpenOnly) {
        const businessHours = parsed?.businessHours;
        console.log('Checking open status for:', row.name, { businessHours, openNow: businessHours?.openNow });
        if (!businessHours || businessHours.openNow !== true) {
          console.log('Filtering out (not open):', row.name);
          return;
        }
        console.log('Keeping (open):', row.name);
      }
      
      const tierColor = GPV_TIERS.find((t) => t.id === tier)?.color || "#4f46e5";
      const active = parsed?.activeOpp || false;
      const halo = active ? '0 0 0 10px rgba(16,185,129,0.32),' : '';

      let markerIcon;
      if (parsed?.activeAccount) {
        // Bright green pin with $ symbol for Active Account
        markerIcon = L.divIcon({
          className: "custom-div-icon",
          html: `<div style="width:32px;height:32px;border-radius:999px;background:#10b981;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px rgba(16,185,129,0.18);">
                   <div style="font-weight:900;color:#052e16;font-size:16px;line-height:1;">$</div>
                 </div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });
      } else {
        markerIcon = L.divIcon({
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
      }

      // Apply small offset if multiple markers share the same coordinates
      let markerLat = row.lat;
      let markerLng = row.lng;
      const coordKey = `${row.lat.toFixed(6)},${row.lng.toFixed(6)}`;
      if (coordsCount.get(coordKey) > 1) {
        const offsetIndex = coordsOffset.get(coordKey) || 0;
        coordsOffset.set(coordKey, offsetIndex + 1);
        // Apply small offset in a circular pattern
        const angle = (offsetIndex * 2 * Math.PI) / coordsCount.get(coordKey);
        const offsetDistance = 0.0008; // approximately 80 meters for better separation
        markerLat += offsetDistance * Math.sin(angle);
        markerLng += offsetDistance * Math.cos(angle);
      }

      const marker = L.marker([markerLat, markerLng], { icon: markerIcon }).addTo(mapInstance.current);

      // Bind a small label under the pin; visibility controlled by zoom level
      try {
        marker.bindTooltip((row.name || "").toString(), {
          permanent: true,
          direction: 'bottom',
          className: 'pin-label',
          offset: [0, 10]
        });
        // initial visibility
        try {
          const z = mapInstance.current.getZoom();
          if (z >= LABEL_ZOOM_THRESHOLD) marker.openTooltip(); else marker.closeTooltip();
        } catch (e) {}
      } catch (e) {}

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
        let estFood = cfg.alcoholPct > 0 ? (avgAlc / cfg.alcoholPct) * cfg.foodPct : 0;
        // For fine dining, multiply food portion by 1.75
        if (vt === 'fine_dining') {
          estFood = estFood * 1.75;
        }
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
          <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${row.lat},${row.lng}" target="_blank" style="display:block;text-align:center;background:#059669;color:white;text-decoration:none;padding:10px;border-radius:10px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">
            Street View
          </a>
          <button onclick="window.dispatchEvent(new CustomEvent('prospect:viewDetails',{detail:{id:${row.id != null ? JSON.stringify(row.id) : 'null'}}}))" style="display:block;width:100%;text-align:center;background:#0b1220;color:white;padding:10px;border-radius:10px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;border:2px solid #374151;margin-bottom:8px;">
            View Details
          </button>
          <button data-prospect-id="${row.id != null ? row.id : ''}" onclick="window.dispatchEvent(new CustomEvent('prospect:addToRoute',{detail:{id:${row.id != null ? JSON.stringify(row.id) : 'null'},lat:${row.lat},lng:${row.lng}}}))" style="display:block;width:100%;text-align:center;background:#111827;color:white;padding:10px;border-radius:10px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;border:2px solid #374151;margin-bottom:8px;">
            Add To Route
          </button>
          <button onclick="window.dispatchEvent(new CustomEvent('prospect:removePin',{detail:{id:${row.id != null ? JSON.stringify(row.id) : 'null'}}}))" style="display:block;width:100%;text-align:center;background:#7f1d1d;color:white;padding:10px;border-radius:10px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;border:2px solid #991b1b;">
            Remove Pin
          </button>
        </div>
      `);

      // When a marker is clicked, surface the account and open the coord editor

  
      // Open popup immediately on marker click - simplified for better responsiveness
      marker.on('click', (e) => {
        // Prevent event bubbling
        if (e.originalEvent) {
          e.originalEvent.stopPropagation();
        }
        
        // Open popup immediately without any map movement
        marker.openPopup();
      });

      // Popup buttons dispatch CustomEvents handled globally; no per-popup DOM wiring needed here.

      const key = row.id?.toString() || `${row.lat},${row.lng}`;
      markersRef.current[key] = marker;
      bounds.extend([row.lat, row.lng]);
    });

    if (pins.length > 0 && bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
      try {
        mapInstance.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      } catch (e) {
        console.warn('fitBounds skipped due to invalid bounds or map state', e);
      }
    }
  };

  const handleMapSearchInput = (value) => {
    setMapSearch(value);
    
    if (!value.trim()) {
      setMapSearchSuggestions([]);
      setShowMapSuggestions(false);
      return;
    }
    
    const term = value.toLowerCase().trim();
    const matches = savedAccounts.filter(acc => 
      (acc.name || '').toLowerCase().includes(term) || 
      (acc.address || '').toLowerCase().includes(term)
    ).slice(0, 8); // Limit to 8 suggestions
    
    setMapSearchSuggestions(matches);
    setShowMapSuggestions(matches.length > 0);
  };

  // Fetch business hours when selectedEstablishment changes
  useEffect(() => {
    const fetchHours = async () => {
      if (!selectedEstablishment?.info) {
        setBusinessHours(null);
        return;
      }

      const name = selectedEstablishment.info.location_name;
      const address = getFullAddress(selectedEstablishment.info);
      
      if (!name || !address) return;

      setHoursLoading(true);
      try {
        const response = await fetch(`/api/place-details?name=${encodeURIComponent(name)}&address=${encodeURIComponent(address)}`);
        if (response.ok) {
          const data = await response.json();
          setBusinessHours(data.hours);
        } else {
          setBusinessHours(null);
        }
      } catch (error) {
        console.error('Failed to fetch hours:', error);
        setBusinessHours(null);
      } finally {
        setHoursLoading(false);
      }
    };

    fetchHours();
  }, [selectedEstablishment?.info?.id]);

  const searchMapAccounts = (searchTerm) => {
    if (!searchTerm || !mapInstance.current) return;
    
    const term = searchTerm.toLowerCase().trim();
    const matches = savedAccounts.filter(acc => 
      (acc.name || '').toLowerCase().includes(term) || 
      (acc.address || '').toLowerCase().includes(term)
    );
    
    if (matches.length > 0) {
      const firstMatch = matches[0];
      const marker = markersRef.current[firstMatch.id?.toString()];
      
      if (marker) {
        // Zoom to the marker
        mapInstance.current.setView([firstMatch.lat, firstMatch.lng], 15);
        // Open the popup
        setTimeout(() => marker.openPopup(), 300);
      }
    }
    
    setShowMapSuggestions(false);
  };
  
  const selectMapSuggestion = (account) => {
    setMapSearch(account.name || '');
    setShowMapSuggestions(false);
    
    if (!mapInstance.current) return;
    
    const marker = markersRef.current[account.id?.toString()];
    if (marker) {
      mapInstance.current.setView([account.lat, account.lng], 15);
      setTimeout(() => marker.openPopup(), 300);
    }
  };

  // Fetch business hours when selectedEstablishment changes
  useEffect(() => {
    const fetchHours = async () => {
      if (!selectedEstablishment?.info) {
        setBusinessHours(null);
        setHoursLoading(false);
        return;
      }

      // Check if hours are already cached in the account data
      try {
        const notes = selectedEstablishment?.info?.notes || '';
        const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes;
        console.log('Checking for cached hours:', { hasNotes: !!notes, parsed, hasBizHours: !!parsed?.businessHours });
        if (parsed?.businessHours) {
          console.log('Using cached hours:', parsed.businessHours);
          setBusinessHours(parsed.businessHours);
          setHoursLoading(false);
          return;
        }
      } catch (e) {
        console.error('Error parsing notes for cached hours:', e);
        // Continue to fetch if parsing fails
      }

      const name = selectedEstablishment.info.location_name;
      const address = getFullAddress(selectedEstablishment.info);
      
      if (!name || !address) {
        setHoursLoading(false);
        return;
      }

      console.log('Fetching hours from API for:', name);
      setHoursLoading(true);
      try {
        const response = await fetch(`/api/place-details?name=${encodeURIComponent(name)}&address=${encodeURIComponent(address)}`);
        if (response.ok) {
          const data = await response.json();
          console.log('Received hours from API:', data.hours);
          setBusinessHours(data.hours);
          
          // Save hours to the database if this is a saved account
          if (selectedEstablishment?.info?.id && data.hours) {
            try {
              const notes = selectedEstablishment?.info?.notes || '';
              const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes || {};
              const updatedNotes = {
                ...parsed,
                businessHours: data.hours
              };
              
              console.log('Saving hours to database:', updatedNotes);
              const saveResponse = await fetch(`/api/accounts?id=${selectedEstablishment.info.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: JSON.stringify(updatedNotes) }),
              });
              
              if (saveResponse.ok) {
                console.log('Hours saved successfully');
                // Refresh saved accounts to get the updated notes
                await refreshSavedAccounts();
                
                // Update local state
                setSelectedEstablishment((s) => s ? {
                  ...s,
                  info: {
                    ...s.info,
                    notes: JSON.stringify(updatedNotes)
                  }
                } : s);
              } else {
                console.error('Failed to save hours, response not ok:', saveResponse.status);
              }
            } catch (saveError) {
              console.error('Failed to save hours to database:', saveError);
            }
          }
        } else {
          setBusinessHours(null);
        }
      } catch (error) {
        console.error('Failed to fetch hours:', error);
        setBusinessHours(null);
      } finally {
        setHoursLoading(false);
      }
    };

    fetchHours();
  }, [selectedEstablishment?.info?.id]);

  useEffect(() => {
    if (viewMode === "map") updateMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAccounts, savedSubView, selectedGpvTier, visibleTiers, visibleActiveAccounts, showActiveOnly, showUnvisitedOnly, showOpenOnly]);

  // Listen for popup-dispatched custom events from leaflet popup buttons
  useEffect(() => {
    const onAdd = (e) => {
      try {
        const entry = e?.detail || {};
        if (!entry || entry.id == null) return;

        setSelectedForRoute((prev) => {
          if (prev.includes(entry.id)) {
            const next = prev.filter(id => id !== entry.id);
            setRoutePlanMode(next.length > 0);
            return next;
          } else {
            // Add new stop: ensure route planning UI is visible
            try {
              setViewMode('saved');
              // Keep the map visible and show routing controls on the side
              setSavedSubView('map');
              // Clear any selected account so the details panel doesn't replace the map
              setSelectedEstablishment(null);
            } catch {}
            const next = [...prev, entry.id];
            setRoutePlanMode(true);
            return next;
          }
        });
      } catch (err) {
        console.error('addToRoute handler failed', err);
      }
    };

    const onView = (e) => {
      try {
        const detail = e?.detail;
        const id = detail?.id;
        if (id != null) {
          // Find the account in savedAccounts
          const account = savedAccounts.find(a => a.id === id);
          if (account) {
            // Parse notes to get history and other data
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
            } catch (parseErr) {
              console.error('Failed to parse account notes:', parseErr);
            }
          }
          setViewMode('saved');
          setSavedSubView('info');
        }
      } catch (err) {
        console.error('viewDetails handler failed', err);
      }
    };

    const onRemove = async (e) => {
      try {
        const id = e?.detail?.id;
        if (id != null) {
          const confirmed = window.confirm('Remove this pin from your saved accounts?');
          if (confirmed) {
            await fetch(`/api/accounts?id=${id}`, { method: 'DELETE' });
            await refreshSavedAccounts();
            // Clear selected if it was the deleted account
            if (selectedEstablishment?.info?.id === id) {
              setSelectedEstablishment(null);
            }
          }
        }
      } catch (err) {
        console.error('removePin handler failed', err);
      }
    };

    window.addEventListener('prospect:addToRoute', onAdd);
    window.addEventListener('prospect:viewDetails', onView);
    window.addEventListener('prospect:removePin', onRemove);
    return () => {
      window.removeEventListener('prospect:addToRoute', onAdd);
      window.removeEventListener('prospect:viewDetails', onView);
      window.removeEventListener('prospect:removePin', onRemove);
    };
  }, [setSelectedForRoute, setRoutePlanMode, setViewMode, setSavedSubView, savedAccounts, refreshSavedAccounts, selectedEstablishment, setSelectedEstablishment]);

  // Reflect selectedForRoute state in any open/populated popup buttons
  useEffect(() => {
    try {
      const buttons = Array.from(document.querySelectorAll('[data-prospect-id]'));
      buttons.forEach((btn) => {
        const idAttr = btn.getAttribute('data-prospect-id');
        if (idAttr == null || idAttr === '') return;
        const idNum = Number(idAttr);
        const selected = selectedForRoute.includes(idNum) || selectedForRoute.includes(idAttr);
        if (selected) btn.classList.add('route-added'); else btn.classList.remove('route-added');
      });
    } catch (e) {
      // ignore
    }
  }, [selectedForRoute]);

  // Fly map to user's current location (if available)
  const handleMyLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      alert('Geolocation not supported in this browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        try {
          if (mapInstance.current) {
            mapInstance.current.flyTo([latitude, longitude], 15, { duration: 1.0 });

            // Add a blue pulsing dot at the user's location (marker only)
            try {
              const L = window.L;
              // remove previous marker
              if (userLocationLayerRef.current) {
                try { userLocationLayerRef.current.remove(); } catch {}
                userLocationLayerRef.current = null;
              }

              const dotHtml = `<div class="user-location-dot"><div class="user-location-pulse"></div></div>`;
              const icon = L.divIcon({ className: 'user-location-icon', html: dotHtml, iconSize: [24, 24], iconAnchor: [12, 12] });
              const marker = L.marker([latitude, longitude], { icon, interactive: false }).addTo(mapInstance.current);
              userLocationLayerRef.current = marker;
            } catch (e) {
              console.error('Failed to add user location marker', e);
            }
          }
        } catch (e) {
          console.error('Failed to move map to current location', e);
        }
      },
      (err) => {
        console.error('Geolocation error', err);
        alert('Unable to determine your location.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Note: popup-based unsave has been removed; saving/unsaving is handled
  // exclusively via the Save button in the account info UI which calls
  // DELETE /api/accounts?id=... and refreshes the saved list.

  // ---------- Derived ----------
  const stats = useMemo(() => {
    if (!selectedEstablishment?.history?.length) return null;
    const h = selectedEstablishment.history;
    const filtered = h.filter((m) => m.total > 0);
    const avgAlc = filtered.length > 0 ? (filtered.reduce((sum, m) => sum + m.total, 0) / filtered.length) : 0;
    const cfg = VENUE_TYPES[venueType] || VENUE_TYPES.casual_dining;
    let estFood = cfg.alcoholPct > 0 ? (avgAlc / cfg.alcoholPct) * cfg.foodPct : 0;
    // For fine dining, multiply food portion by 1.75
    if (venueType === 'fine_dining') {
      estFood = estFood * 1.75;
    }
    return { avgAlc, estFood, total: avgAlc + estFood, cfg };
  }, [selectedEstablishment, venueType]);

  // Auto-select GPV tier based on forecast
  useEffect(() => {
    // Skip auto-selection for manual accounts without history
    const isManual = !selectedEstablishment?.info?.taxpayer_number;
    if (isManual && (!selectedEstablishment?.history || selectedEstablishment.history.length === 0)) {
      return;
    }
    
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

        skipAiLookupRef.current = true;
        setAiResponse(parsed.aiResponse);
        setAiLoading(false);
      } else {

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
              notes: data.notes, // Include notes so cached hours can be accessed
            },
            history: parsed.history,
          });
          // If the map is visible, zoom to the saved pin and open its popup
          if (savedSubView === 'map' && mapInstance.current) {
            try {
              const markerKey = data.id != null ? data.id.toString() : `${data.lat || ''},${data.lng || ''}`;
              const marker = markersRef.current[markerKey];
              if (marker && typeof marker.getLatLng === 'function') {
                const ll = marker.getLatLng();
                mapInstance.current.setView([ll.lat, ll.lng], Math.max(mapInstance.current.getZoom(), 14), { animate: true });
                marker.openPopup();
              } else if (Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng))) {
                mapInstance.current.setView([Number(data.lat), Number(data.lng)], 14, { animate: true });
              }
            } catch (e) {
              // ignore
            }
          }
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

      setSelectedEstablishment({ 
        info: { 
          id: data.id, 
          location_name: data.name || "Saved Account", 
          location_address: data.address || "",
          notes: data.notes, // Include notes so cached hours can be accessed
        }, 
        history: [] 
      });
      // If the map is visible, zoom to the saved pin and open its popup
      if (savedSubView === 'map' && mapInstance.current) {
        try {
          const markerKey = data.id != null ? data.id.toString() : `${data.lat || ''},${data.lng || ''}`;
          const marker = markersRef.current[markerKey];
          if (marker && typeof marker.getLatLng === 'function') {
            const ll = marker.getLatLng();
            mapInstance.current.setView([ll.lat, ll.lng], Math.max(mapInstance.current.getZoom(), 14), { animate: true });
            marker.openPopup();
          } else if (Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng))) {
            mapInstance.current.setView([Number(data.lat), Number(data.lng)], 14, { animate: true });
          }
        } catch (e) {
          // ignore
        }
      }
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

    const metric =
      viewMode === "top" && data.avg_monthly_volume
        ? formatCurrency(data.avg_monthly_volume)
        : viewMode === "search" && data.total_receipts
        ? formatCurrency(data.total_receipts)
        : null;

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
        metric={metric}
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

    // Toggle Active Account flag for selected account
    const toggleActiveAccount = async () => {
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
        setSelectedActiveAccount((s) => !s);
        setNotesOwner((o) => ({ ...o, key }));
        return;
      }

      try {
        const parsed = parseSavedNotes(saved.notes);
        let notesObj = (parsed && parsed.raw && typeof parsed.raw === "object") ? parsed.raw : { key: parsed.key ? `KEY:${parsed.key}` : `KEY:${key}`, notes: parsed.notes || [], history: parsed.history || [], activeAccount: parsed?.activeAccount ?? false };
        notesObj.activeAccount = !!notesObj.activeAccount ? false : true;

        const res = await fetch(`/api/accounts?id=${saved.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: JSON.stringify(notesObj) }),
        });
        if (!res.ok) throw new Error("Could not update active account flag");

        await refreshSavedAccounts();

        setSelectedActiveAccount(notesObj.activeAccount || false);
        setNotesOwner({ id: saved.id, key: parsed.key || null });
      } catch (err) {
        setError(err?.message || "Could not toggle Active Account.");
      }
    };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans p-4 md:p-8 selection:bg-indigo-500/30">
      {/* Header */}
      <header className="max-w-6xl mx-auto mb-10 flex justify-center items-center">
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
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 pb-32">
        {/* Left column */}
        {viewMode !== "metrics" && viewMode !== "map" && (
          <aside className="lg:col-span-4 space-y-6">
            {viewMode === "saved" ? (
                <SavedAccountsHeader
                searchTerm={savedSearchTerm}
                onSearchChange={(e) => setSavedSearchTerm(e.target.value)}
                isAddOpen={manualAddOpen}
                onAdd={() => {
                  setManualAddOpen((s) => !s);
                  setManualSelected(null);
                  setManualQuery("");
                  setManualGpvTier(null);
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
                {!!routeError && (
                  <div className="text-[11px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3">
                    {routeError}
                  </div>
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
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={async () => {
                          try {
                            const today = new Date().toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric' 
                            });
                            const routeData = {
                              accounts: selectedForRoute.map(id => {
                                const account = savedAccounts.find(a => a.id === id);
                                return {
                                  id: account.id,
                                  name: account.name,
                                  address: account.address,
                                  lat: account.lat,
                                  lng: account.lng,
                                };
                              }),
                              distance: calculatedRoute.distance,
                              duration: calculatedRoute.duration,
                              polyline: calculatedRoute.polyline,
                            };
                            
                            const response = await fetch('/api/saved-routes', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                name: `Route - ${today}`,
                                routeData,
                              }),
                            });
                            
                            if (response.ok) {
                              alert('Route saved successfully!');
                            } else {
                              alert('Failed to save route');
                            }
                          } catch (err) {
                            console.error('Save route error:', err);
                            alert('Error saving route');
                          }
                        }}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-widest py-2 px-3 rounded-xl"
                      >
                        Save Route
                      </button>
                      <button
                        onClick={() => {
                          const waypoints = selectedForRoute.map(id => {
                            const account = savedAccounts.find(a => a.id === id);
                            return `${account.lat},${account.lng}`;
                          }).join('/');
                          window.open(`https://www.google.com/maps/dir/${waypoints}`, '_blank');
                        }}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest py-2 px-3 rounded-xl"
                      >
                        Open in Maps
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

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

                            const res = await fetch(url);
                            if (!res.ok) {
                              const errData = await res.json().catch(() => ({}));
                              throw new Error(errData.error || `Search failed: ${res.status}`);
                            }
                            const data = await res.json();

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
                    className="col-span-2 bg-[#071126] border border-slate-700 px-3 py-2 rounded-xl text-base"
                  />
                  <input
                    value={manualCityFilter}
                    onChange={(e) => setManualCityFilter(e.target.value.toUpperCase())}
                    placeholder="Filter by city (optional)"
                    className="bg-[#071126] border border-slate-700 px-3 py-2 rounded-xl text-base"
                  />
                  <button
                    onClick={() => {
                      setManualQuery('');
                      setManualCityFilter('');
                      setManualResults([]);
                      setManualSelected(null);
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
                          
                          // Open in detail view without saving (like searched accounts)
                          setSelectedEstablishment({
                            info: {
                              location_name: r.name || 'Manual Account',
                              location_address: r.address || '',
                              location_city: manualCityFilter || '',
                              taxpayer_name: r.name || 'Manual Account',
                              lat: r.lat,
                              lng: r.lng,
                            },
                            history: [],
                          });
                          
                          // Trigger AI lookup
                          fetchAiForInfo({ 
                            location_name: r.name || 'Manual Account', 
                            location_city: manualCityFilter || '', 
                            taxpayer_name: r.name || 'Manual Account' 
                          }, { updateState: true });
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

                  <div className="mt-3">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">GPV Tier (Required)</div>
                    <div className="flex gap-2 flex-wrap">
                      {GPV_TIERS.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setManualGpvTier(t.id);
                            setSelectedGpvTier(t.id);
                          }}
                          className={`px-3 py-2 rounded-xl font-black text-[11px] uppercase transition-all border ${manualGpvTier === t.id ? 'opacity-100' : 'opacity-40'}`}
                          style={{ background: manualGpvTier === t.id ? t.color : 'transparent', color: manualGpvTier === t.id ? '#fff' : t.color, borderColor: t.color }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 mt-3">
                    Click a search result to preview, select GPV tier, then use the Save button at the top to save the account.
                  </div>
                </div>
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
          </aside>
        )}

        {/* Right column */}
        <section className={viewMode === "metrics" || viewMode === "map" ? "lg:col-span-12" : "lg:col-span-8"}>
          {viewMode === "map" ? (
            <div className="bg-[#1E293B] rounded-[2.5rem] border border-slate-700 shadow-2xl overflow-hidden relative min-h-[720px] h-[720px]">
              
              {/* Floating search bar */}
              <div className="absolute top-6 left-6 right-6 z-[1000] flex items-center gap-3">
                <div className="flex-1 max-w-md relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Search accounts..."
                    value={mapSearch}
                    onChange={(e) => handleMapSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        searchMapAccounts(mapSearch);
                      } else if (e.key === 'Escape') {
                        setShowMapSuggestions(false);
                      }
                    }}
                    onBlur={() => setTimeout(() => setShowMapSuggestions(false), 200)}
                    className="w-full bg-slate-900/90 backdrop-blur-md border border-slate-700 text-white text-base rounded-xl pl-9 pr-3 py-2.5 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xl"
                  />
                  
                  {/* Suggestions dropdown */}
                  {showMapSuggestions && mapSearchSuggestions.length > 0 && (
                    <div className="absolute top-full mt-2 left-0 right-0 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto">
                      {mapSearchSuggestions.map((account) => {
                        const parsed = (() => {
                          try {
                            return typeof account.data === "string"
                              ? JSON.parse(account.data)
                              : account.data || {};
                          } catch { return {}; }
                        })();
                        
                        // Determine GPV tier
                        const total = account.total_receipts || 0;
                        let tierId = 'tier1';
                        if (total >= 1000000) tierId = 'tier6';
                        else if (total >= 500000) tierId = 'tier5';
                        else if (total >= 250000) tierId = 'tier4';
                        else if (total >= 100000) tierId = 'tier3';
                        else if (total >= 50000) tierId = 'tier2';
                        
                        const tierInfo = GPV_TIERS.find(t => t.id === tierId) || GPV_TIERS[0];
                        
                        return (
                          <div
                            key={account.id}
                            onClick={() => selectMapSuggestion(account)}
                            className="px-4 py-3 hover:bg-slate-800/60 cursor-pointer transition-colors border-b border-slate-700/50 last:border-b-0"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <div 
                                    className="w-2.5 h-2.5 rounded-full border-2 border-white flex-shrink-0" 
                                    style={{ backgroundColor: tierInfo.color }}
                                  />
                                  <div className="font-medium text-white text-xs truncate">
                                    {account.name}
                                  </div>
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {account.address}
                                </div>
                                {account.total_receipts && (
                                  <div className="text-[10px] text-emerald-400 mt-1">
                                    {formatCurrency(account.total_receipts)} GPV
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="px-3 py-2 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700 text-[8px] font-black uppercase text-indigo-400 flex items-center gap-2 shadow-xl">
                  <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>{" "}
                  {savedAccounts.length} PINS
                </div>
              </div>

              <div className="absolute top-24 right-6 z-50 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-xl p-3 text-xs text-slate-200 shadow-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-black uppercase text-[10px] text-indigo-300">GPV Legend</div>
                  <button onClick={() => setLegendOpen(o => !o)} className="text-[10px] px-2 py-1 rounded-md bg-slate-800/60">
                    {legendOpen ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className={`flex flex-col gap-2 ${legendOpen ? '' : 'hidden'}`}>
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
                  <div
                    className="flex items-center gap-3 cursor-pointer hover:bg-slate-800/50 px-2 py-1 rounded-lg transition-colors"
                    onClick={() => setVisibleActiveAccounts(v => !v)}
                  >
                    <div style={{
                      width: 14,
                      height: 14,
                      background: visibleActiveAccounts ? '#10b981' : '#334155',
                      borderRadius: 6,
                      border: '2px solid #fff',
                      opacity: visibleActiveAccounts ? 1 : 0.4
                    }} />
                    <div className="text-[11px] font-bold" style={{ opacity: visibleActiveAccounts ? 1 : 0.5 }}>Active Account</div>
                  </div>

                  {/* Buttons placed directly under the GPV legend (stacked) */}
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      onClick={() => setShowUnvisitedOnly(v => !v)}
                      title="Show unvisited accounts only"
                      className={`w-full px-3 py-1.5 rounded-md border text-slate-200 flex items-center justify-center gap-2 text-[12px] font-black ${showUnvisitedOnly ? 'bg-red-500 text-white border-red-500' : 'bg-slate-800/70 hover:bg-slate-700 border-slate-700'}`}
                      style={{ backdropFilter: 'blur(4px)' }}
                    >
                      <span>Unvisited</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowActiveOnly(s => {
                          const next = !s;
                          if (next) setVisibleActiveAccounts(true);
                          return next;
                        });
                      }}
                      title="Show active accounts only"
                      className={`w-full px-3 py-1.5 rounded-md border text-slate-200 flex items-center justify-center gap-2 text-[12px] font-black ${showActiveOnly ? 'bg-amber-500 text-[#081113] border-amber-500' : 'bg-slate-800/70 hover:bg-slate-700 border-slate-700'}`}
                      style={{ backdropFilter: 'blur(4px)' }}
                    >
                      <span className="font-black">$</span>
                      <span>Active Only</span>
                    </button>

                    <button
                      onClick={() => setShowOpenOnly(v => !v)}
                      title="Show only accounts that are currently open"
                      className={`w-full px-3 py-1.5 rounded-md border text-slate-200 flex items-center justify-center gap-2 text-[12px] font-black ${showOpenOnly ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-800/70 hover:bg-slate-700 border-slate-700'}`}
                      style={{ backdropFilter: 'blur(4px)' }}
                    >
                      <span>Open Now</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="absolute inset-0 bg-[#020617] z-10">
                <div ref={mapRef} className="w-full h-full" />
              </div>

              {/* My Location Button - Bottom Left */}
              <button
                onClick={handleMyLocation}
                title="My location"
                className="absolute bottom-6 left-6 z-[1000] p-4 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-slate-700 text-indigo-400 hover:text-indigo-300 hover:bg-slate-800/90 transition-all shadow-2xl"
              >
                <MapPin size={24} />
              </button>
            </div>
          ) : viewMode === "metrics" ? (
            <div className="space-y-6">
              {/* Metrics Section */}
              {metricsLoading ? (
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
              )}

              {/* Saved Routes Section */}
              <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-700 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">Saved Routes</h2>
                  <button
                    onClick={fetchSavedRoutes}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                  >
                    Refresh
                  </button>
                </div>
                {savedRoutesLoading ? (
                  <div className="text-center py-8">
                    <Loader2 size={32} className="text-indigo-600 animate-spin mx-auto" />
                  </div>
                ) : savedRoutes.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <p className="text-sm">No saved routes yet. Create a route in the Saved tab to save it here.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savedRoutes.map((route) => {
                      const routeData = typeof route.route_data === 'string' ? JSON.parse(route.route_data) : route.route_data;
                      return (
                        <div key={route.id} className="bg-slate-900/50 border border-slate-700 rounded-2xl p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h3 className="text-white font-bold text-sm mb-1">{route.name}</h3>
                              <p className="text-slate-400 text-[10px] uppercase tracking-widest">
                                {new Date(route.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            <button
                              onClick={async () => {
                                if (confirm('Delete this route?')) {
                                  try {
                                    const response = await fetch(`/api/saved-routes?id=${route.id}`, { method: 'DELETE' });
                                    if (response.ok) {
                                      await fetchSavedRoutes();
                                    }
                                  } catch (error) {
                                    console.error('Delete error:', error);
                                  }
                                }
                              }}
                              className="text-slate-400 hover:text-red-400 text-sm transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mb-3">
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Distance</div>
                              <div className="text-emerald-400 font-bold text-sm">
                                {(routeData.distance / 1609.34).toFixed(1)} mi
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Duration</div>
                              <div className="text-emerald-400 font-bold text-sm">
                                {Math.round(routeData.duration / 60)} min
                              </div>
                            </div>
                          </div>
                          <div className="mb-3">
                            <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Stops ({routeData.accounts.length})</div>
                            <div className="space-y-1">
                              {routeData.accounts.map((account, idx) => (
                                <div key={idx} className="text-[11px] text-slate-300 flex items-center gap-2">
                                  <span className="bg-indigo-600 rounded-full w-5 h-5 flex items-center justify-center text-white font-bold text-[9px]">
                                    {idx + 1}
                                  </span>
                                  {account.name}
                                </div>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const waypoints = routeData.accounts.map(a => `${a.lat},${a.lng}`).join('/');
                              window.open(`https://www.google.com/maps/dir/${waypoints}`, '_blank');
                            }}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest py-2 px-3 rounded-xl transition-all"
                          >
                            Open in Google Maps
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
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

                    {/* Hours of Operation */}
                    {hoursLoading ? (
                      <div className="mt-4 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                        Loading hours...
                      </div>
                    ) : businessHours?.weekdayDescriptions && businessHours.weekdayDescriptions.length > 0 ? (
                      <div className="mt-4">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                          Hours of Operation
                        </div>
                        <div className="space-y-1">
                          {businessHours.weekdayDescriptions.map((day, idx) => (
                            <div key={idx} className="text-[11px] text-slate-300 font-medium">
                              {day}
                            </div>
                          ))}
                        </div>
                        {businessHours.openNow !== undefined && (
                          <div className="mt-2">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
                              businessHours.openNow 
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                businessHours.openNow ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}></span>
                              {businessHours.openNow ? 'Open Now' : 'Closed'}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>

                    <div className="flex items-center gap-3 shrink-0">
                    <SaveButton
                      onClick={toggleSaveAccount}
                      isSaved={isSaved(selectedEstablishment.info)}
                      disabled={aiLoading && !isSaved(selectedEstablishment.info)}
                    />

                    <ForecastCard total={stats?.total || 0} />
                  </div>
                </div>

                {/* AI Intel Radar */}
                <AIIntelPanel
                  aiLoading={aiLoading}
                  aiResponse={aiResponse}
                  onRefresh={selectedEstablishment?.info?.id ? refreshAiForSavedAccount : null}
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
              <div className="grid grid-cols-1 gap-6">
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
                        margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid vertical={false} stroke="#ffffff08" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 10, fill: "#64748b", fontWeight: 800 }}
                          axisLine={false}
                          tickLine={false}
                          dy={10}
                        />
                        <YAxis 
                          tick={{ fontSize: 10, fill: "#64748b", fontWeight: 800 }}
                          axisLine={false}
                          tickLine={false}
                          domain={[0, "auto"]}
                          tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                        />
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
                selectedActiveAccount={selectedActiveAccount}
                onToggleActiveAccount={toggleActiveAccount}
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

      {/* Fixed Bottom Navigation Dock */}
      <nav className="fixed bottom-0 left-0 right-0 z-[9999] pb-safe">
        <div className="max-w-3xl mx-auto px-4 pb-4">
          <div className="flex gap-2 bg-[#1E293B]/95 backdrop-blur-lg p-2 rounded-3xl border border-slate-700 shadow-2xl">
            <button
              onClick={() => {
                setViewMode("search");
                setSavedSubView("list");
                setSelectedEstablishment(null);
                setAiResponse("");
              }}
              className={`flex-1 flex flex-col items-center justify-center py-3 px-2 rounded-2xl text-[9px] font-black transition-all uppercase tracking-widest ${viewMode === "search" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              <Search size={18} className="mb-1" />
              <span>Search</span>
            </button>

            <button
              onClick={() => {
                setViewMode("top");
                setSavedSubView("list");
                setSelectedEstablishment(null);
                setAiResponse("");
              }}
              className={`flex-1 flex flex-col items-center justify-center py-3 px-2 rounded-2xl text-[9px] font-black transition-all uppercase tracking-widest ${viewMode === "top" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              <Trophy size={18} className="mb-1" />
              <span>Leaders</span>
            </button>

            <button
              onClick={() => {
                setViewMode("saved");
                setSelectedEstablishment(null);
                setAiResponse("");
              }}
              className={`flex-1 flex flex-col items-center justify-center py-3 px-2 rounded-2xl text-[9px] font-black transition-all uppercase tracking-widest ${viewMode === "saved" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              <Bookmark size={18} className="mb-1" />
              <span>Saved</span>
            </button>

            <button
              onClick={() => {
                setViewMode("metrics");
                setSavedSubView("list");
                setSelectedEstablishment(null);
                setAiResponse("");
              }}
              className={`flex-1 flex flex-col items-center justify-center py-3 px-2 rounded-2xl text-[9px] font-black transition-all uppercase tracking-widest ${viewMode === "metrics" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              <TrendingUp size={18} className="mb-1" />
              <span>Data</span>
            </button>

            <button
              onClick={() => {
                setViewMode("map");
                setSelectedEstablishment(null);
              }}
              className={`flex-1 flex flex-col items-center justify-center py-3 px-2 rounded-2xl text-[9px] font-black transition-all uppercase tracking-widest ${viewMode === "map" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              <MapIcon size={18} className="mb-1" />
              <span>Map</span>
            </button>
          </div>
        </div>
      </nav>

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
