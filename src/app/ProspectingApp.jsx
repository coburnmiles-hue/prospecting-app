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
import { useRouter } from "next/navigation";
import {
  Sparkles,
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
import { useSavedAccounts, useMetricsData, useCalculatedMetrics } from "../hooks/useData";
import { useSearch, useTopLeaders } from "../hooks/useSearchAndTop";



// -------------------- Component --------------------
export default function ProspectingApp() {
  const router = useRouter();
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || ""; // do NOT hardcode keys
  const MAPBOX_KEY = process.env.NEXT_PUBLIC_MAPBOX_KEY || "";

  // Logout handler
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // Handle setting custom start point for routes
  const handleSetCustomStartPoint = async () => {
    if (!startPointAddress.trim()) return;

    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: startPointAddress })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.lat && data.lng) {
          setCustomStartPoint({
            lat: data.lat,
            lng: data.lng,
            address: data.address || startPointAddress
          });
          setShowStartPointModal(false);
          setStartPointAddress("");
        } else {
          setError('Could not geocode address');
        }
      } else {
        setError('Failed to geocode address');
      }
    } catch (err) {
      setError('Error geocoding address');
      console.error('Geocode error:', err);
    }
  };

  const [viewMode, setViewMode] = useState("saved"); // search | top | saved | metrics | map | nro
  const [savedSubView, setSavedSubView] = useState("list"); // list | info

  // Custom hooks for data fetching
  const { savedAccounts, setSavedAccounts, refreshSavedAccounts } = useSavedAccounts();
  const { metricsData, metricsLoading } = useMetricsData();
  const { metrics: calculatedMetrics, loading: calculatedLoading } = useCalculatedMetrics();
  
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

  // NRO Search (New Retail Opportunities)
  const [nroSearchTerm, setNroSearchTerm] = useState("");
  const [nroSearchType, setNroSearchType] = useState("city"); // city, county, or zip
  const [nroResults, setNroResults] = useState([]);
  const [nroLoading, setNroLoading] = useState(false);
  const [nroError, setNroError] = useState("");

  // Combine loading and error states for backward compatibility
  const [localLoading, setLoading] = useState(false);
  const loading = searchLoading || topLoading || localLoading || nroLoading;
  // Always coerce error to string to prevent "Objects are not valid as React child" error
  const errorRaw = searchError || topError || nroError;
  const error = typeof errorRaw === 'string' ? errorRaw : (errorRaw && errorRaw?.message ? errorRaw.message : errorRaw ? JSON.stringify(errorRaw) : '');
  const setError = (err) => {
    setSearchError(err);
    setTopError(err);
    setNroError(err);
  };

  const [savedSearchTerm, setSavedSearchTerm] = useState("");
  const [selectedEstablishment, setSelectedEstablishment] = useState(null); // { info, history, notes? }
  const [topViewMode, setTopViewMode] = useState("list"); // list | map
  const [topMapPinsLoading, setTopMapPinsLoading] = useState(false);
  const topMapRef = useRef(null);
  const topMapInstance = useRef(null);
  const topMapMarkersRef = useRef([]); // [{marker, row}]
  const savedAccountsRef = useRef([]);

  // NRO map view
  const [nroViewMode, setNroViewMode] = useState("list"); // list | map
  const [nroMapPinsLoading, setNroMapPinsLoading] = useState(false);
  const nroMapRef = useRef(null);
  const nroMapInstance = useRef(null);
  const nroMapMarkersRef = useRef([]); // [{marker, row}]

  const [venueType, setVenueType] = useState("casual_dining");
  const [customFoodPct, setCustomFoodPct] = useState("");

  // AI
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");

  // Notes (client only in this version)
  const [activityType, setActivityType] = useState("walk-in");
  const [notesList, setNotesList] = useState([]);
  const [followupsList, setFollowupsList] = useState([]);
  const [notesExpanded, setNotesExpanded] = useState(false);
  // notesOwner tracks which account the notesList belongs to: { id?: number|null, key?: string }
  const [notesOwner, setNotesOwner] = useState({ id: null, key: null });
  const [selectedGpvTier, setSelectedGpvTier] = useState(null);
  const [selectedActiveOpp, setSelectedActiveOpp] = useState(false);
  const [selectedActiveAccount, setSelectedActiveAccount] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState(false);
  const [selectedHotLead, setSelectedHotLead] = useState(false);
  const [wonGpv, setWonGpv] = useState('');
  const [wonArr, setWonArr] = useState('');
  const [wonDateSigned, setWonDateSigned] = useState('');
  const [isEditingWonValues, setIsEditingWonValues] = useState(false);
  const [venueTypeLocked, setVenueTypeLocked] = useState(false);
  const savingLockStateRef = useRef(false);
  const skipAiLookupRef = useRef(false);

  // Route planning (map only)
  const [calculatedRoute, setCalculatedRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const routePolylineRef = useRef(null);
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [savedRoutesLoading, setSavedRoutesLoading] = useState(false);
  const [customStartPoint, setCustomStartPoint] = useState(null); // {lat, lng, address}
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [mapRoutePlanMode, setMapRoutePlanMode] = useState(false);
  const mapRoutePlanModeRef = useRef(false);
  const [mapRouteStops, setMapRouteStops] = useState([]);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [showStartPointModal, setShowStartPointModal] = useState(false);
  const [startPointAddress, setStartPointAddress] = useState("");

  // Map
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});
  const restaurantMarkersRef = useRef([]);
  const userLocationLayerRef = useRef(null);
  const LABEL_ZOOM_THRESHOLD = 13;
  const [legendOpen, setLegendOpen] = useState(true);
  const [gpvTiersOpen, setGpvTiersOpen] = useState(false);
  const [hoursFilterOpen, setHoursFilterOpen] = useState(false);
  const [mapSearch, setMapSearch] = useState("");
  const [mapSearchSuggestions, setMapSearchSuggestions] = useState([]);
  const [showMapSuggestions, setShowMapSuggestions] = useState(false);
  const [restaurantSearchMode, setRestaurantSearchMode] = useState(false);
  const [restaurantSearchQuery, setRestaurantSearchQuery] = useState("");
  const [restaurantMarkers, setRestaurantMarkers] = useState([]);
  const [searchingRestaurants, setSearchingRestaurants] = useState(false);
  
  // GPV Tier visibility
  const [visibleTiers, setVisibleTiers] = useState(new Set(GPV_TIERS.map(t => t.id)));
  const [visibleActiveAccounts, setVisibleActiveAccounts] = useState(true);
  const [showSavedPins, setShowSavedPins] = useState(true);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [showUnvisitedOnly, setShowUnvisitedOnly] = useState(false);
  const [showNroOnly, setShowNroOnly] = useState(false);
  const [showReferralOnly, setShowReferralOnly] = useState(false);
  const [showHotLeadOnly, setShowHotLeadOnly] = useState(false);
  const [showOpenOnly, setShowOpenOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [customDayFilter, setCustomDayFilter] = useState(null); // 0-6 (Sunday-Saturday)
  const [customHourFilter, setCustomHourFilter] = useState(""); // 1-12
  const [customPeriodFilter, setCustomPeriodFilter] = useState("AM"); // AM or PM
  const [customFilterActive, setCustomFilterActive] = useState(false); // Whether custom filter is running

  // Hours of operation
  const [businessHours, setBusinessHours] = useState(null);
  const [businessWebsite, setBusinessWebsite] = useState(null);
  const [hoursLoading, setHoursLoading] = useState(false);

  // POS detection
  const [posSystem, setPosSystem] = useState(null); // { pos: string, source: string|null }
  const [posLoading, setPosLoading] = useState(false);

  // Coordinate editor state
  const [coordLat, setCoordLat] = useState(0);
  const [coordLng, setCoordLng] = useState(0);
  const [coordSaving, setCoordSaving] = useState(false);
  const [coordSaved, setCoordSaved] = useState(false);
  const [coordEditorOpen, setCoordEditorOpen] = useState(false);
  const historicalChartRef = useRef(null);
  const [historicalChartWidth, setHistoricalChartWidth] = useState(0);
  // Manual add account state
  const [manualAddOpen, setManualAddOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [manualCityFilter, setManualCityFilter] = useState("");
  const [manualResults, setManualResults] = useState([]);
  const [manualSelected, setManualSelected] = useState(null);
  const [manualSearching, setManualSearching] = useState(false);
  const [manualGpvTier, setManualGpvTier] = useState(null);
  const [manualSaving, setManualSaving] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const manualSearchTimeout = useRef(null);
  const addressSuggestionsTimeout = useRef(null);

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

  useEffect(() => {
    const element = historicalChartRef.current;
    if (!element) return;

    const updateWidth = () => {
      const nextWidth = Math.floor(element.getBoundingClientRect().width);
      setHistoricalChartWidth(nextWidth > 0 ? nextWidth : 0);
    };

    updateWidth();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => updateWidth());
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [selectedEstablishment?.info?.id, viewMode]);

  // NRO Search handler - searches TABC License Information, Austin building permits,
  // TABC Pending Applications, and Austin Food Inspection first-timers
  const handleNroSearch = async (e) => {
    if (e) e.preventDefault();
    if (!nroSearchTerm.trim()) return;

    setNroLoading(true);
    setNroError("");
    setNroResults([]);

    try {
      // Calculate date 4 months ago
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
      const dateFilter = fourMonthsAgo.toISOString().split('T')[0]; // Format: YYYY-MM-DD

      // Search 1: TABC License Information (issued licenses)
      const licenseTypes = ['BE', 'BG', 'MB', 'N', 'NB', 'NE', 'BW'];
      const licenseFilter = licenseTypes.map(type => `license_type='${type}'`).join(' OR ');
      
      // Build location filter based on selected search type
      let locationFilter = '';
      if (nroSearchType === 'city') {
        locationFilter = `upper(city) LIKE '%${nroSearchTerm.toUpperCase()}%'`;
      } else if (nroSearchType === 'county') {
        locationFilter = `upper(county) LIKE '%${nroSearchTerm.toUpperCase()}%'`;
      } else if (nroSearchType === 'zip') {
        locationFilter = `zip LIKE '${nroSearchTerm}%'`;
      }
      
      const where = `${locationFilter} AND (${licenseFilter})`;
      const query = `?$where=${encodeURIComponent(where)}&$order=original_issue_date DESC&$limit=500`;
      
      const tabcUrl = `https://data.texas.gov/resource/7hf9-qc9f.json${query}`;
      
      // Fetch TABC license data
      const tabcRes = await fetch(tabcUrl);
      if (!tabcRes.ok) {
        const errorText = await tabcRes.text();
        console.error('TABC Search error response:', errorText);
        throw new Error(`TABC Search error (${tabcRes.status})`);
      }
      
      const tabcData = await tabcRes.json();
      
      // Filter TABC data by date
      const filteredTabc = tabcData.filter(item => {
        if (!item.original_issue_date) return false;
        const issueDate = new Date(item.original_issue_date);
        return issueDate > fourMonthsAgo;
      });
      
      // Search 2: Austin Building Permits (if searching in Austin)
      let permitData = [];
      const isAustinSearch = nroSearchType === 'city' && nroSearchTerm.toUpperCase().includes('AUSTIN');
      
      if (isAustinSearch) {
        try {
          const permitWhere = `lower(description) like '%restaurant%' AND issue_date > '${dateFilter}'`;
          const permitQuery = `?$where=${encodeURIComponent(permitWhere)}&$order=issue_date DESC&$limit=200`;
          const permitUrl = `https://data.austintexas.gov/resource/3syk-w9eu.json${permitQuery}`;
          const permitRes = await fetch(permitUrl);
          if (permitRes.ok) {
            permitData = await permitRes.json();
          }
        } catch (err) {
          console.warn('Austin permit search error:', err);
        }
      }

      // Search 3: TABC Pending License Applications (early-stage NROs not yet issued)
      let pendingTabcData = [];
      try {
        const pendingLicenseFilter = licenseTypes.map(type => `license_type='${type}'`).join(' OR ');
        // Note: this Socrata endpoint does not support upper() — use case-insensitive LIKE instead
        let pendingLocationFilter = '';
        if (nroSearchType === 'city') {
          // Capitalize first letter of each word to match the dataset's stored casing (e.g. "Austin")
          const term = nroSearchTerm.trim().replace(/\b\w/g, c => c.toUpperCase());
          pendingLocationFilter = `city='${term}'`;
        } else if (nroSearchType === 'county') {
          pendingLocationFilter = `county LIKE '%${nroSearchTerm.trim()}%'`;
        } else if (nroSearchType === 'zip') {
          pendingLocationFilter = `zip LIKE '${nroSearchTerm.trim()}%'`;
        }
        const pendingWhere = `${pendingLocationFilter} AND (${pendingLicenseFilter}) AND submission_date > '${dateFilter}'`;
        const pendingQuery = `?$where=${encodeURIComponent(pendingWhere)}&$order=submission_date DESC&$limit=200`;
        const pendingUrl = `https://data.texas.gov/resource/mxm5-tdpj.json${pendingQuery}`;
        const pendingRes = await fetch(pendingUrl);
        if (pendingRes.ok) {
          pendingTabcData = await pendingRes.json();
        } else {
          console.warn('TABC pending response error:', pendingRes.status, await pendingRes.text().catch(() => ''));
        }
      } catch (err) {
        console.warn('TABC pending applications search error:', err);
      }

      // Search 4: Austin Food Establishment Inspection Scores — first-time inspections (Austin only)
      let newInspectionData = [];
      if (isAustinSearch) {
        try {
          // Find establishments whose very first inspection falls within the last 4 months
          const inspectionWhere = `min(inspection_date) > '${dateFilter}'`;
          const inspectionQuery = `?$select=facility_id,restaurant_name,address,zip_code,min(inspection_date) as first_inspection&$group=facility_id,restaurant_name,address,zip_code&$having=${encodeURIComponent(inspectionWhere)}&$limit=200`;
          const inspectionUrl = `https://data.austintexas.gov/resource/ecmv-9xxi.json${inspectionQuery}`;
          const inspectionRes = await fetch(inspectionUrl);
          if (inspectionRes.ok) {
            newInspectionData = await inspectionRes.json();
          } else {
            console.warn('Food inspection response error:', inspectionRes.status, await inspectionRes.text().catch(() => ''));
          }
        } catch (err) {
          console.warn('Food inspection search error:', err);
        }
      }
      
      // Transform TABC issued license data
      const tabcTransformedPromises = filteredTabc.map(async (item) => {
        const transformed = {
          source: 'TABC License',
          location_name: item.trade_name || "Unknown",
          location_address: item.address || "",
          location_city: item.city || "",
          location_zip: item.zip || "",
          license_type: item.license_type || "",
          license_id: item.license_id || "",
          original_issue_date: item.original_issue_date || "",
          taxpayer_number: item.license_id || null,
          location_number: "1",
          has_sales: false,
          total_receipts: 0,
        };

        // Check for sales data
        try {
          const searchName = (item.trade_name || "").toUpperCase();
          const searchCity = (item.city || "").toUpperCase();
          
          if (searchName && searchCity) {
            const where = buildSocrataWhere(searchName, searchCity);
            const query = `?$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(
              `${DATE_FIELD} DESC`
            )}&$limit=12`;

            const salesRes = await fetch(`${BASE_URL}${query}`);
            if (salesRes.ok) {
              const salesData = await salesRes.json();
              const exactMatch = salesData.filter(row => 
                (row.location_name || '').toUpperCase() === searchName
              );
              
              if (exactMatch.length > 0) {
                transformed.has_sales = true;
                const recent = exactMatch[0];
                transformed.total_receipts = Number(recent.total_receipts || 0);
              }
            }
          }
        } catch (err) {
          console.error('Error checking sales for', item.trade_name, err);
        }

        return transformed;
      });

      // Transform Austin building permit data
      const permitTransformedPromises = permitData.map(async (item) => {
        const transformed = {
          source: 'Austin Building Permit',
          location_name: item.project_name || item.description || "Unknown Project",
          location_address: item.original_address1 || item.address || "",
          location_city: "AUSTIN",
          location_zip: item.original_zip || item.zip || "",
          permit_number: item.permit_num || item.permit_number || "",
          issue_date: item.issue_date || "",
          description: item.description || "",
          work_class: item.work_class || "",
          taxpayer_number: `PERMIT-${item.permit_num || item.permit_number || ''}`,
          location_number: "1",
          has_sales: false,
          total_receipts: 0,
        };

        try {
          const searchAddress = (item.original_address1 || item.address || "").toUpperCase();
          if (searchAddress) {
            const where = `upper(location_address) LIKE '%${searchAddress.split(' ')[0]}%' AND upper(location_city) LIKE '%AUSTIN%'`;
            const query = `?$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(
              `${DATE_FIELD} DESC`
            )}&$limit=12`;
            const salesRes = await fetch(`${BASE_URL}${query}`);
            if (salesRes.ok) {
              const salesData = await salesRes.json();
              if (salesData.length > 0) {
                transformed.has_sales = true;
                const recent = salesData[0];
                transformed.total_receipts = Number(recent.total_receipts || 0);
                if (recent.location_name) transformed.location_name = recent.location_name;
              }
            }
          }
        } catch (err) {
          console.error('Error checking sales for permit', item.permit_num, err);
        }

        return transformed;
      });

      // Transform TABC pending application data
      const pendingTransformedPromises = pendingTabcData.map(async (item) => {
        const transformed = {
          source: 'TABC Pending',
          location_name: item.trade_name || item.owner || "Unknown",
          location_address: item.address || "",
          location_city: item.city || "",
          location_zip: item.zip || "",
          license_type: item.license_type || "",
          application_id: item.applicationid || "",
          submission_date: item.submission_date || "",
          application_status: item.applicationstatus || "",
          taxpayer_number: `PENDING-${item.applicationid || ''}`,
          location_number: "1",
          has_sales: false,
          total_receipts: 0,
        };

        // Check for sales data to see if this is truly new
        try {
          const searchName = (item.trade_name || "").toUpperCase();
          const searchCity = (item.city || "").toUpperCase();
          if (searchName && searchCity) {
            const where = buildSocrataWhere(searchName, searchCity);
            const query = `?$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(`${DATE_FIELD} DESC`)}&$limit=6`;
            const salesRes = await fetch(`${BASE_URL}${query}`);
            if (salesRes.ok) {
              const salesData = await salesRes.json();
              const exactMatch = salesData.filter(row => (row.location_name || '').toUpperCase() === searchName);
              if (exactMatch.length > 0) {
                transformed.has_sales = true;
                transformed.total_receipts = Number(exactMatch[0].total_receipts || 0);
              }
            }
          }
        } catch (err) {
          console.warn('Error checking sales for pending app', item.trade_name, err);
        }

        return transformed;
      });

      // Transform Food Establishment first-inspection data (Austin only)
      const inspectionTransformed = newInspectionData.map((item) => ({
        source: 'First Inspection',
        location_name: item.restaurant_name || "Unknown",
        location_address: item.address || "",
        location_city: "AUSTIN",
        location_zip: item.zip_code || "",
        facility_id: item.facility_id || "",
        first_inspection: item.first_inspection || "",
        taxpayer_number: `INSPECT-${item.facility_id || ''}`,
        location_number: "1",
        has_sales: false,
        total_receipts: 0,
      }));

      // Combine results from all sources
      const tabcResults = await Promise.all(tabcTransformedPromises);
      const permitResults = await Promise.all(permitTransformedPromises);
      const pendingResults = await Promise.all(pendingTransformedPromises);
      const allResults = [...tabcResults, ...permitResults, ...pendingResults, ...inspectionTransformed];
      
      setNroResults(allResults);
    } catch (err) {
      console.error('NRO Search error:', err);
      setNroError(err?.message || "Could not search NRO data.");
    } finally {
      setNroLoading(false);
    }
  };

  // ---------- Select + load history ----------
  const analyze = async (est) => {
    setError("");
    setAiResponse("");
    skipAiLookupRef.current = false;
    setSelectedEstablishment(null);
    // Clear transient selection state so new account starts with no GPV/opp/notes selected
    setSelectedGpvTier(null);
    setSelectedActiveOpp(false);
    setSelectedActiveAccount(false);
    setSelectedReferral(false);
    setWonGpv('');
    setWonArr('');
    setWonDateSigned('');
    setIsEditingWonValues(false);
    setNotesList([]);
    setFollowupsList([]);
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
          await fetch(`/api/accounts?id=${existing.id}`, { method: "DELETE", credentials: 'include' });
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
      } else {
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
          businessHours: businessHours || null, // Save hours of operation
          businessWebsite: businessWebsite || null, // Save website
          manual: !info.taxpayer_number, // mark as manual if no taxpayer number
          isNro: viewMode === "nro" // mark as NRO if saved from NRO search
        }),
      };



      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      if (!res.ok) throw new Error("Save failed.");

      // Reload saved
      await refreshSavedAccounts();
      
      // For manual accounts, keep the account selected and load the saved data
      if (isManual) {
        // Find the newly saved account
        const updatedRes = await fetch('/api/accounts', { credentials: 'include' });
        let updatedAccounts = [];
        if (updatedRes.ok) {
          const ct = updatedRes.headers.get('content-type') || '';
          if (ct.toLowerCase().includes('application/json')) {
            const parsed = await updatedRes.json().catch(() => []);
            updatedAccounts = Array.isArray(parsed) ? parsed : [];
          }
        }
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
      setSelectedActiveAccount(false);
      setSelectedReferral(false);
      setSelectedHotLead(false);
      setSelectedHotLead(false);
      setWonGpv('');
      setWonArr('');
      setWonDateSigned('');
      setIsEditingWonValues(false);
      setNotesList([]);
      setFollowupsList([]);
      setVenueTypeLocked(false);
      setNotesOwner({ id: null, key: null });
      return;
    }

    // Try to parse notes directly from the saved row (covers rows saved with JSON notes)
    try {
      const parsed = parseSavedNotes(saved.notes);
      // Always restore GPV tier, Active Opp flag, Active Account, and venue type from saved payload if present
      setSelectedGpvTier(parsed?.gpvTier || null);
      setSelectedActiveOpp(parsed?.activeOpp || false);
      setSelectedActiveAccount(parsed?.activeAccount || false);
      setSelectedReferral(parsed?.referral || false);
      setSelectedHotLead(parsed?.hotLead || false);
      setWonGpv(parsed?.wonGpv || '');
      setWonArr(parsed?.wonArr || '');
      setWonDateSigned(parsed?.wonDateSigned || '');
      // If there's saved won data, don't start in edit mode. If no saved data but activeAccount is on, enter edit mode
      if (parsed?.wonGpv || parsed?.wonArr || parsed?.wonDateSigned) {
        setIsEditingWonValues(false);
      } else if (parsed?.activeAccount) {
        setIsEditingWonValues(true);
      } else {
        setIsEditingWonValues(false);
      }
      if (parsed?.venueType) {
        setVenueType(parsed.venueType);
      }
      // Only update lock state if we're not actively saving it (prevents race condition)
      if (!savingLockStateRef.current) {
        setVenueTypeLocked(parsed?.venueTypeLocked || false);
      }
      // Set notes and owner, even if empty
      setNotesList(Array.isArray(parsed.notes) ? parsed.notes : []);
      setFollowupsList(Array.isArray(parsed.followups) ? parsed.followups : []);
      setNotesOwner({ id: saved.id, key: parsed.key || null });
      return;
    } catch {}

    // Fallback only if parsing completely failed - just set empty notes without resetting other state
    setNotesList([]);
    setFollowupsList([]);
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

  const handleAddNote = async (noteText) => {
    const trimmedNote = (noteText || "").trim();
    if (!trimmedNote || !selectedEstablishment?.info) return false;

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
          credentials: 'include'
        });

        if (!res.ok) throw new Error("Auto-save failed");
        
        const created = await res.json();
        await refreshSavedAccounts();
        
        // Update selected establishment with new ID
        setSelectedEstablishment(s => s ? { ...s, info: { ...s.info, id: created.id } } : s);
        
        saved = created;
      } catch (err) {
        setError(err?.message || "Could not save account for notes.");
        return false;
      }
    }

    try {
      const res = await fetch(`/api/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: saved.id,
          text: trimmedNote,
          activity_type: activityType,
          entry_type: 'activity',
        }),
        credentials: 'include'
      });
      
      if (!res.ok) throw new Error("Note save failed");
      
      const body = await res.json();
      
      setNotesList(Array.isArray(body.notes) ? body.notes : []);
      setFollowupsList(Array.isArray(body.followups) ? body.followups : followupsList);
      setNotesOwner({ id: saved.id, key: null });
      
      // Reset activity type to default after adding note
      setActivityType("walk-in");

      // refresh current gpv tier from saved row if present
      try {
        const refreshedRes = await fetch("/api/accounts", { cache: "no-store", credentials: 'include' });
        let refreshedAccounts = [];
        if (refreshedRes.ok) {
          const ct = refreshedRes.headers.get('content-type') || '';
          if (ct.toLowerCase().includes('application/json')) {
            const parsed = await refreshedRes.json().catch(() => []);
            refreshedAccounts = Array.isArray(parsed) ? parsed : [];
          }
        }
        const refreshedRow = refreshedAccounts.find((r) => r.id === saved.id);
        if (refreshedRow) {
          const parsed = parseSavedNotes(refreshedRow.notes);
            if (parsed?.gpvTier !== selectedGpvTier) {
              setSelectedGpvTier(parsed?.gpvTier || null);
            }
            if (parsed?.activeOpp !== selectedActiveOpp) {
              setSelectedActiveOpp(parsed?.activeOpp || false);
            }
            if (parsed?.referral !== selectedReferral) {
              setSelectedReferral(parsed?.referral || false);
            }
            if (parsed?.hotLead !== selectedHotLead) {
              setSelectedHotLead(parsed?.hotLead || false);
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
      return true;
    } catch (err) {
      setError(err?.message || "Could not save note.");
      return false;
    }
  };

  const handleAddFollowup = async (followUpAt, followUpNote) => {
    const trimmedNote = (followUpNote || "").trim();
    if (!trimmedNote || !followUpAt || !selectedEstablishment?.info) return false;

    const key = `${selectedEstablishment.info.taxpayer_number || ""}-${selectedEstablishment.info.location_number || ""}`;

    let saved = (Array.isArray(savedAccounts) ? savedAccounts : []).find((a) => {
      if (selectedEstablishment.info.id && a.id === selectedEstablishment.info.id) return true;
      try {
        const parsed = parseSavedNotes(a.notes);
        if (parsed?.key && parsed.key === key) return true;
      } catch {}
      return false;
    });

    if (!saved || !saved.id) {
      return false;
    }

    try {
      const res = await fetch(`/api/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: saved.id,
          text: trimmedNote,
          activity_type: activityType,
          entry_type: 'followup',
          follow_up_at: followUpAt,
          follow_up_note: trimmedNote,
        }),
        credentials: 'include'
      });

      if (!res.ok) throw new Error("Follow-up save failed");

      const body = await res.json();
      setNotesList(Array.isArray(body.notes) ? body.notes : notesList);
      setFollowupsList(Array.isArray(body.followups) ? body.followups : []);
      setNotesOwner({ id: saved.id, key: null });
      await refreshSavedAccounts();
      return true;
    } catch (err) {
      setError(err?.message || "Could not save follow-up.");
      return false;
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
      const res = await fetch(`/api/notes?accountId=${saved.id}&noteId=${noteId}`, { method: "DELETE", credentials: 'include' });
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
          setSelectedReferral(parsed?.referral || false);
          setSelectedHotLead(parsed?.hotLead || false);
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
  // Old route planning functions removed - route planning is now map-only

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
        }),
        credentials: 'include'
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
      const response = await fetch('/api/saved-routes', { credentials: 'include' });
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

  // Initialize background maps for saved routes
  useEffect(() => {
    if (viewMode !== "metrics" || savedRoutes.length === 0) return;

    const initRouteMaps = async () => {
      // Ensure Leaflet is loaded
      if (!window.L) {
        // Load Leaflet if not already loaded
        if (!document.querySelector('link[href*="leaflet.css"]')) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          document.head.appendChild(link);
        }

        if (!document.querySelector('script[src*="leaflet.js"]')) {
          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          document.head.appendChild(script);
        }

        // Wait for Leaflet to load (even if script tag already existed)
        await new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (window.L) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
        });
      }

      const L = window.L;
      if (!L) return;

      // Initialize map for each route
      for (const route of savedRoutes) {
        const mapId = `route-map-${route.id}`;
        const mapElement = document.getElementById(mapId);

        if (!mapElement || mapElement._leaflet_id) continue; // Skip if already initialized

        try {
          let routeData = route.route_data;
          if (typeof routeData === 'string') {
            try { routeData = JSON.parse(routeData); } catch { routeData = {}; }
          }
          routeData = routeData || {};

          const map = L.map(mapElement, {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            touchZoom: false,
            boxZoom: false,
            keyboard: false,
          }).setView(TEXAS_CENTER, 10);

          // Add tile layer
          if (MAPBOX_KEY) {
            L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/dark-v10/tiles/{z}/{x}/{y}?access_token=${MAPBOX_KEY}`, {
              tileSize: 512,
              zoomOffset: -1,
              maxZoom: 22,
            }).addTo(map);
          } else {
            L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
              maxZoom: 19,
            }).addTo(map);
          }

          const stops = Array.isArray(routeData.stops)
            ? routeData.stops
            : (Array.isArray(routeData.accounts) ? routeData.accounts : []);

          const validStops = stops.filter(s => Number.isFinite(Number(s?.lat)) && Number.isFinite(Number(s?.lng)));

          const drawPolyline = (points) => {
            if (!points || points.length === 0) return;
            const routeLine = L.polyline(points, {
              color: '#10b981',
              weight: 3,
              opacity: 0.9,
            }).addTo(map);
            map.fitBounds(routeLine.getBounds(), { padding: [20, 20] });
            setTimeout(() => map.invalidateSize(), 100);
          };

          // Use stored road polyline if available, otherwise fetch from directions API
          if (Array.isArray(routeData.polyline) && routeData.polyline.length > 0) {
            drawPolyline(routeData.polyline);
          } else if (validStops.length >= 2) {
            // Fetch real road directions for this route
            fetch('/api/route', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ waypoints: validStops, origin: validStops[0] }),
            })
              .then(r => r.ok ? r.json() : null)
              .then(data => {
                if (data?.polyline?.length > 0) {
                  drawPolyline(data.polyline);
                } else {
                  // Last resort: straight lines
                  drawPolyline(validStops.map(s => [Number(s.lat), Number(s.lng)]));
                }
              })
              .catch(() => {
                drawPolyline(validStops.map(s => [Number(s.lat), Number(s.lng)]));
              });
          } else {
            // Not enough stops to draw anything meaningful
            setTimeout(() => map.invalidateSize(), 100);
          }
        } catch (error) {
          console.error('Error initializing route map:', error);
        }
      }
    };

    // Delay initialization to ensure DOM is ready
    const timer = setTimeout(initRouteMaps, 100);
    return () => clearTimeout(timer);
  }, [viewMode, savedRoutes, MAPBOX_KEY]);

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
            
            const allMarkers = [
              ...Object.values(markersRef.current || {}),
              ...(restaurantMarkersRef.current || []),
            ];

            allMarkers.forEach((m) => {
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
              if (mapInstance.current) {
                mapInstance.current.invalidateSize();
              }
            } catch (e) {
              console.error('invalidateSize failed', e);
            }
          }, 500);
        });
      } catch (e) {
        // ignore
      }

      updateMarkers(true); // Fit bounds on initial load
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

  // Auto-zoom to current location when map tab is opened
  useEffect(() => {
    if (viewMode !== "map") return;

    // Wait for map to be fully initialized before attempting geolocation
    const timeout = setTimeout(() => {
      if (!mapInstance.current) {
        return;
      }


      // Get current location and zoom to it
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            if (mapInstance.current && window.L) {
              mapInstance.current.setView([lat, lng], 15);
            }
          },
          (err) => {
            if (err.code === 1) {
              // Permission denied — not an app error, silently ignore
              console.warn('Geolocation: permission denied. User can enable location in browser settings.');
            } else {
              const errorMessages = {
                2: 'Position unavailable - location services may be unavailable',
                3: 'Request timeout - geolocation took too long'
              };
              console.warn('Geolocation:', errorMessages[err.code] || err.message);
            }
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
        );
      }
    }, 1500); // Wait 1.5 seconds for map to initialize

    return () => clearTimeout(timeout);
  }, [viewMode]);

  // Top tab map mode for leader pins
  useEffect(() => {
    if (viewMode !== "top" || topViewMode !== "map") return;
    if (!topMapRef.current) return;

    const setupMap = async () => {
      if (!window.L) {
        if (!document.querySelector('link[href*="leaflet.css"]')) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          document.head.appendChild(link);
        }
        if (!document.querySelector('script[src*="leaflet.js"]')) {
          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          document.head.appendChild(script);
        }
        await new Promise((resolve) => {
          const interval = setInterval(() => {
            if (window.L) {
              clearInterval(interval);
              resolve();
            }
          }, 100);
        });
      }

      const L = window.L;
      if (!L || !topMapRef.current) return;

      if (topMapInstance.current) {
        topMapInstance.current.remove();
      }
      topMapMarkersRef.current.forEach((m) => m.remove());
      topMapMarkersRef.current = [];

      topMapInstance.current = L.map(topMapRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView(TEXAS_CENTER, 7);

      if (MAPBOX_KEY) {
        L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/dark-v10/tiles/{z}/{x}/{y}?access_token=${MAPBOX_KEY}`, {
          tileSize: 512,
          zoomOffset: -1,
          maxZoom: 22,
        }).addTo(topMapInstance.current);
      } else {
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(topMapInstance.current);
      }

      const bounds = L.latLngBounds([]);
      const accounts = Array.isArray(topAccounts) ? topAccounts : [];
      const pinnedRows = [];

      const geocodeAddress = async (address) => {
        if (!address) return null;
        try {
          const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
          const data = await res.json();
          if (res.ok && Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng))) {
            return { lat: Number(data.lat), lng: Number(data.lng) };
          }
        } catch (e) {
          console.warn('Top map geocode failed', e);
        }
        return null;
      };

      for (const row of accounts) {
        let lat = Number(row.lat);
        let lng = Number(row.lng);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          const addressParts = [row.location_address, row.location_city, row.location_zip, 'TX'];
          const fullAddress = addressParts.filter((p) => p).join(', ');
          const coords = await geocodeAddress(fullAddress);
          if (coords) {
            lat = coords.lat;
            lng = coords.lng;
          }
        }

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          pinnedRows.push({ ...row, lat, lng });
        }
      }

      // Pre-count duplicate coordinates so stacked pins can be spread
      const topCoordsCount = new Map();
      pinnedRows.forEach((r) => {
        const k = `${r.lat.toFixed(6)},${r.lng.toFixed(6)}`;
        topCoordsCount.set(k, (topCoordsCount.get(k) || 0) + 1);
      });
      const topCoordsOffset = new Map();

      pinnedRows.forEach((row) => {

        const annualSales = Number(row.annual_sales || row.total_receipts || 0);
        const monthlySales = Math.round(annualSales / 12);
        const tierColor = annualSales >= 1000000 ? '#f59e0b' : annualSales >= 500000 ? '#f97316' : annualSales >= 250000 ? '#fb7185' : '#60a5fa';

        const alreadySaved = (Array.isArray(savedAccountsRef.current) ? savedAccountsRef.current : []).some((saved) => {
          if (!saved) return false;
          if (saved.id && row.id && saved.id === row.id) return true;
          if (saved.location_name && row.location_name && saved.location_name.toLowerCase() === row.location_name.toLowerCase()) return true;
          if (saved.location_address && row.location_address && saved.location_address.toLowerCase() === row.location_address.toLowerCase()) return true;
          // fallback geo match by coordinates
          if (saved.lat && saved.lng && row.lat && row.lng) {
            const dlat = Math.abs(Number(saved.lat) - Number(row.lat));
            const dlng = Math.abs(Number(saved.lng) - Number(row.lng));
            if (dlat < 0.0007 && dlng < 0.0007) return true;
          }
          return false;
        });

        let markerIcon;
        if (alreadySaved) {
          // Green pin with white checkmark
          markerIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="width:26px;height:26px;border-radius:999px;background:#10b981;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px rgba(16,185,129,0.18);">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="10" cy="10" r="10" fill="#10b981"/>
                <path d="M6 10.5l2.5 2.5 5-5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 26],
            popupAnchor: [0, -24],
          });
        } else {
          // Default colored pin
          markerIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="width:26px;height:26px;border-radius:999px;background:${tierColor};border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px rgba(0,0,0,0.35);">
              <div style="width:10px;height:10px;border-radius:999px;background:#fff"></div>
            </div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 26],
            popupAnchor: [0, -24],
          });
        }

        // Spread pins that share the same coordinates
        let markerLat = row.lat;
        let markerLng = row.lng;
        const coordKey = `${row.lat.toFixed(6)},${row.lng.toFixed(6)}`;
        if (topCoordsCount.get(coordKey) > 1) {
          const offsetIndex = topCoordsOffset.get(coordKey) || 0;
          topCoordsOffset.set(coordKey, offsetIndex + 1);
          const angle = (offsetIndex * 2 * Math.PI) / topCoordsCount.get(coordKey);
          const offsetDistance = 0.0015;
          markerLat += offsetDistance * Math.sin(angle);
          markerLng += offsetDistance * Math.cos(angle);
        }

        const marker = L.marker([markerLat, markerLng], { icon: markerIcon }).addTo(topMapInstance.current);

        const mapsUrl = (Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)))
          ? `https://www.google.com/maps/dir/?api=1&destination=${Number(row.lat)},${Number(row.lng)}`
          : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(row.location_address || row.location_name || '')}`;
        const displayName = (row.location_name || row.taxpayer_name || 'Account').toString();
        const displayAddress = (row.location_address || row.location_city || '').toString();

        const label = displayName;
        marker.bindTooltip(label, {
          permanent: true,
          direction: 'bottom',
          className: 'pin-label',
          offset: [0, 10],
        });

        marker.on('click', () => {
          analyze({
            location_name: row.location_name || row.taxpayer_name || '',
            location_address: row.location_address || '',
            location_city: row.location_city || '',
            location_zip: row.location_zip || '',
            taxpayer_number: row.taxpayer_number || '',
            location_number: row.location_number || '',
            id: row.id || null,
            tier: row.tier || null,
            annual_sales: row.annual_sales || row.total_receipts || 0,
            avg_monthly_volume: monthlySales,
            lat: row.lat,
            lng: row.lng,
          });
        });

        topMapMarkersRef.current.push({ marker, row });
        bounds.extend([row.lat, row.lng]);
      });

      topMapInstance.current.on('zoomend', () => {
        const z = topMapInstance.current.getZoom();
        topMapMarkersRef.current.forEach(({ marker }) => {
          try {
            if (!marker) return;
            const tooltip = marker.getTooltip();
            if (tooltip && typeof tooltip.options !== 'undefined') {
              if (z >= 14) {
                marker.openTooltip();
              } else {
                marker.closeTooltip();
              }
            }
          } catch (e) {
            // ignore
          }
        });
      });

      if (bounds.isValid()) {
        topMapInstance.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
      }

      setTimeout(() => {
        try { topMapInstance.current.invalidateSize(); } catch (e) {}
      }, 100);
    };

    setupMap().finally(() => setTopMapPinsLoading(false));

    return () => {
      if (topMapInstance.current) {
        topMapInstance.current.remove();
        topMapInstance.current = null;
      }
      topMapMarkersRef.current.forEach(({ marker }) => marker.remove());
      topMapMarkersRef.current = [];
    };
  }, [viewMode, topViewMode, topAccounts, MAPBOX_KEY]);

  // When top leaders fetch begins, show the loading overlay until pins are fully placed
  useEffect(() => {
    if (topLoading) setTopMapPinsLoading(true);
  }, [topLoading]);

  // NRO map mode
  useEffect(() => {
    if (viewMode !== "nro" || nroViewMode !== "map") return;
    if (!nroMapRef.current) return;

    const setupNroMap = async () => {
      if (!window.L) {
        if (!document.querySelector('link[href*="leaflet.css"]')) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          document.head.appendChild(link);
        }
        if (!document.querySelector('script[src*="leaflet.js"]')) {
          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          document.head.appendChild(script);
        }
        await new Promise((resolve) => {
          const interval = setInterval(() => {
            if (window.L) { clearInterval(interval); resolve(); }
          }, 100);
        });
      }

      const L = window.L;
      if (!L || !nroMapRef.current) return;

      if (nroMapInstance.current) { nroMapInstance.current.remove(); }
      nroMapMarkersRef.current.forEach((m) => m.remove());
      nroMapMarkersRef.current = [];

      nroMapInstance.current = L.map(nroMapRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView(TEXAS_CENTER, 7);

      if (MAPBOX_KEY) {
        L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/dark-v10/tiles/{z}/{x}/{y}?access_token=${MAPBOX_KEY}`, {
          tileSize: 512, zoomOffset: -1, maxZoom: 22,
        }).addTo(nroMapInstance.current);
      } else {
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(nroMapInstance.current);
      }

      const bounds = L.latLngBounds([]);
      const pinnedRows = [];

      const geocodeAddress = async (address) => {
        if (!address) return null;
        try {
          const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
          const data = await res.json();
          if (res.ok && Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng))) {
            return { lat: Number(data.lat), lng: Number(data.lng) };
          }
        } catch (e) { console.warn('NRO map geocode failed', e); }
        return null;
      };

      for (const row of nroResults) {
        let lat = Number(row.lat);
        let lng = Number(row.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          const parts = [row.location_address, row.location_city, row.location_zip, 'TX'];
          const coords = await geocodeAddress(parts.filter(Boolean).join(', '));
          if (coords) { lat = coords.lat; lng = coords.lng; }
        }
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          pinnedRows.push({ ...row, lat, lng });
        }
      }

      // Spread stacked pins
      const coordsCount = new Map();
      pinnedRows.forEach((r) => {
        const k = `${r.lat.toFixed(6)},${r.lng.toFixed(6)}`;
        coordsCount.set(k, (coordsCount.get(k) || 0) + 1);
      });
      const coordsOffset = new Map();

      pinnedRows.forEach((row) => {
        const isPermit = row.source === 'Austin Building Permit';
        const pinColor = isPermit ? '#f97316' : '#06b6d4'; // orange for permits, cyan for TABC

        const alreadySaved = (Array.isArray(savedAccountsRef.current) ? savedAccountsRef.current : []).some((saved) => {
          if (!saved) return false;
          if (saved.location_name && row.location_name && saved.location_name.toLowerCase() === row.location_name.toLowerCase()) return true;
          if (saved.location_address && row.location_address && saved.location_address.toLowerCase() === row.location_address.toLowerCase()) return true;
          return false;
        });

        const markerIcon = alreadySaved
          ? L.divIcon({
              className: 'custom-div-icon',
              html: `<div style="width:26px;height:26px;border-radius:999px;background:#10b981;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px rgba(16,185,129,0.18);">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="10" r="10" fill="#10b981"/>
                  <path d="M6 10.5l2.5 2.5 5-5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>`,
              iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24],
            })
          : L.divIcon({
              className: 'custom-div-icon',
              html: `<div style="width:26px;height:26px;border-radius:999px;background:${pinColor};border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px rgba(0,0,0,0.35);">
                <div style="width:10px;height:10px;border-radius:999px;background:#fff"></div>
              </div>`,
              iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24],
            });

        // Spread pins sharing the same coordinate
        let markerLat = row.lat;
        let markerLng = row.lng;
        const coordKey = `${row.lat.toFixed(6)},${row.lng.toFixed(6)}`;
        if (coordsCount.get(coordKey) > 1) {
          const offsetIndex = coordsOffset.get(coordKey) || 0;
          coordsOffset.set(coordKey, offsetIndex + 1);
          const angle = (offsetIndex * 2 * Math.PI) / coordsCount.get(coordKey);
          markerLat += 0.0015 * Math.sin(angle);
          markerLng += 0.0015 * Math.cos(angle);
        }

        const marker = L.marker([markerLat, markerLng], { icon: markerIcon }).addTo(nroMapInstance.current);

        const displayName = (row.location_name || '').toString();
        marker.bindTooltip(displayName, {
          permanent: true, direction: 'bottom', className: 'pin-label', offset: [0, 10],
        });

        marker.on('click', async () => {
          setNroViewMode("list");
          // Trigger the same click handler logic as the list item
          setLoading(true);
          try {
            const searchName = row.location_name.toUpperCase();
            const searchCity = row.location_city.toUpperCase();
            const where = buildSocrataWhere(searchName, searchCity);
            const query = `?$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(`${DATE_FIELD} DESC`)}&$limit=12`;
            const res = await fetch(`${BASE_URL}${query}`);
            let history = [];
            if (res.ok) {
              const hist = await res.json();
              const rows = Array.isArray(hist) ? hist : [];
              const exactMatch = rows.filter(r => (r.location_name || '').toUpperCase() === searchName);
              if (exactMatch.length > 0) {
                const reversed = [...exactMatch].reverse();
                history = reversed.map((h) => ({
                  month: monthLabelFromDate(h[DATE_FIELD]),
                  liquor: Number(h.liquor_receipts || 0),
                  beer: Number(h.beer_receipts || 0),
                  wine: Number(h.wine_receipts || 0),
                  total: Number(h[TOTAL_FIELD] || 0),
                  rawDate: h[DATE_FIELD],
                }));
              }
            }
            setSelectedEstablishment({ info: row, history });
            if (history.length === 0) {
              setSelectedGpvTier('nro');
            } else {
              const total = history.reduce((sum, h) => sum + h.total, 0);
              const avg = total / history.length;
              const annualForecast = avg * 12;
              let tier = 'tier1';
              if (annualForecast >= 1000000) tier = 'tier6';
              else if (annualForecast >= 500000) tier = 'tier5';
              else if (annualForecast >= 250000) tier = 'tier4';
              else if (annualForecast >= 100000) tier = 'tier3';
              else if (annualForecast >= 50000) tier = 'tier2';
              setSelectedGpvTier(tier);
            }
            await fetchAiForInfo(row, { updateState: true });
          } catch {
            setSelectedEstablishment({ info: row, history: [] });
            setSelectedGpvTier('nro');
            try { await fetchAiForInfo(row, { updateState: true }); } catch {}
          } finally {
            setLoading(false);
          }
        });

        nroMapMarkersRef.current.push({ marker, row });
        bounds.extend([row.lat, row.lng]);
      });

      nroMapInstance.current.on('zoomend', () => {
        const z = nroMapInstance.current.getZoom();
        nroMapMarkersRef.current.forEach(({ marker }) => {
          try {
            const tooltip = marker.getTooltip();
            if (tooltip) { z >= 14 ? marker.openTooltip() : marker.closeTooltip(); }
          } catch {}
        });
      });

      if (bounds.isValid()) {
        nroMapInstance.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
      }
      setTimeout(() => { try { nroMapInstance.current.invalidateSize(); } catch {} }, 100);
    };

    setupNroMap().finally(() => setNroMapPinsLoading(false));

    return () => {
      if (nroMapInstance.current) { nroMapInstance.current.remove(); nroMapInstance.current = null; }
      nroMapMarkersRef.current.forEach(({ marker }) => marker.remove());
      nroMapMarkersRef.current = [];
    };
  }, [viewMode, nroViewMode, nroResults, MAPBOX_KEY]);

  // Keep savedAccountsRef current and update pin icons without rebuilding the map
  useEffect(() => {
    savedAccountsRef.current = savedAccounts;
    if (!topMapInstance.current || !window.L || topViewMode !== 'map') return;
    const L = window.L;
    topMapMarkersRef.current.forEach(({ marker, row }) => {
      const annualSales = Number(row.annual_sales || row.total_receipts || 0);
      const tierColor = annualSales >= 1000000 ? '#f59e0b' : annualSales >= 500000 ? '#f97316' : annualSales >= 250000 ? '#fb7185' : '#60a5fa';
      const alreadySaved = (Array.isArray(savedAccounts) ? savedAccounts : []).some((saved) => {
        if (!saved) return false;
        if (saved.id && row.id && saved.id === row.id) return true;
        if (saved.location_name && row.location_name && saved.location_name.toLowerCase() === row.location_name.toLowerCase()) return true;
        if (saved.location_address && row.location_address && saved.location_address.toLowerCase() === row.location_address.toLowerCase()) return true;
        if (saved.lat && saved.lng && row.lat && row.lng) {
          const dlat = Math.abs(Number(saved.lat) - Number(row.lat));
          const dlng = Math.abs(Number(saved.lng) - Number(row.lng));
          if (dlat < 0.0007 && dlng < 0.0007) return true;
        }
        return false;
      });
      const newIcon = alreadySaved
        ? L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="width:26px;height:26px;border-radius:999px;background:#10b981;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px rgba(16,185,129,0.18);"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="10" fill="#10b981"/><path d="M6 10.5l2.5 2.5 5-5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`,
            iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24],
          })
        : L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="width:26px;height:26px;border-radius:999px;background:${tierColor};border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px rgba(0,0,0,0.35);"><div style="width:10px;height:10px;border-radius:999px;background:#fff"></div></div>`,
            iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24],
          });
      marker.setIcon(newIcon);
    });
  }, [savedAccounts, topViewMode]);

  const updateMarkers = (shouldFitBounds = false) => {
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

    if (!showSavedPins) {
      return;
    }

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
      
      // Calculate if business is currently open
      if (parsed?.businessHours?.periods && Array.isArray(parsed.businessHours.periods)) {
        const now = new Date();
        const currentDay = now.getDay();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        const yesterday = currentDay === 0 ? 6 : currentDay - 1;
        
        let isOpen = false;
        
        parsed.businessHours.periods.forEach(period => {
          const periodDay = period.open?.day !== undefined ? period.open.day : null;
          let openTime = 0;
          let closeTime = 0;

          // Parse open time
          if (period.open?.time) {
            const openStr = period.open.time.toString().padStart(4, '0');
            openTime = parseInt(openStr.substring(0, 2)) * 60 + parseInt(openStr.substring(2, 4));
          } else if (period.open?.hour !== undefined && period.open?.minute !== undefined) {
            openTime = period.open.hour * 60 + period.open.minute;
          }

          // Parse close time
          if (period.close?.time) {
            const closeStr = period.close.time.toString().padStart(4, '0');
            closeTime = parseInt(closeStr.substring(0, 2)) * 60 + parseInt(closeStr.substring(2, 4));
          } else if (period.close?.hour !== undefined && period.close?.minute !== undefined) {
            closeTime = period.close.hour * 60 + period.close.minute;
          }

          // Check if currently open
          if (periodDay === currentDay) {
            if (closeTime > openTime) {
              if (currentTimeInMinutes >= openTime && currentTimeInMinutes < closeTime) {
                isOpen = true;
              }
            } else if (closeTime < openTime) {
              if (currentTimeInMinutes >= openTime) {
                isOpen = true;
              }
            }
          } else if (periodDay === yesterday) {
            if (closeTime < openTime) {
              if (currentTimeInMinutes < closeTime) {
                isOpen = true;
              }
            }
          }
        });
        
        parsed.businessHours.openNow = isOpen;
      }
      
      // If 'show only active' is enabled, skip any non-active pins
      if (showActiveOnly && !parsed?.activeAccount) return;

      // If 'show referral only' is enabled, skip any non-referral pins
      if (showReferralOnly && !parsed?.referral) return;

      // If 'show hot lead only' is enabled, skip any non-hot-lead pins
      if (showHotLeadOnly && !parsed?.hotLead) return;

      // If 'show NRO only' is enabled, only show NRO tier pins
      if (showNroOnly) {
        if (tier !== 'nro') return;
      } else {
        // Normal tier visibility filtering (only when NRO filter is off)
        if (tier && !visibleTiers.has(tier)) return;
      }
      
      // If this is an Active Account pin and Active Account visibility is off, skip it
      if (parsed?.activeAccount && !visibleActiveAccounts) return;
      
      // Check if account has notes (has been visited)
      const hasNotes = parsed?.notes && Array.isArray(parsed.notes) && parsed.notes.length > 0;
      
      // If 'show unvisited only' is enabled, skip accounts that have notes
      if (showUnvisitedOnly && hasNotes) return;
      
      // If 'show open only' is enabled, skip accounts that are closed
      if (showOpenOnly) {
        const businessHours = parsed?.businessHours;
        if (!businessHours || businessHours.openNow !== true) {
          return;
        }
      }
      
      // If custom day/time filter is enabled, check if open at that time
      if (customFilterActive && customDayFilter !== null && customHourFilter) {
        const businessHours = parsed?.businessHours;
        if (!businessHours?.periods || !Array.isArray(businessHours.periods)) {
          return;
        }
        
        // Convert hour + AM/PM to minutes for comparison
        const hour = parseInt(customHourFilter);
        let filterHours24 = hour;
        if (customPeriodFilter === 'PM' && hour !== 12) {
          filterHours24 = hour + 12;
        } else if (customPeriodFilter === 'AM' && hour === 12) {
          filterHours24 = 0;
        }
        const filterTimeInMinutes = filterHours24 * 60;
        
        // Check if any period covers the selected day and time
        const isOpen = businessHours.periods.some(period => {
          const openDay = period.open?.day;
          const closeDay = period.close?.day;
          
          // Google API can return either time string or hour/minute objects
          let openTime, closeTime, openMinutes, closeMinutes;
          
          if (period.open?.time) {
            openTime = period.open.time;
            openMinutes = parseInt(openTime.slice(0, 2)) * 60 + parseInt(openTime.slice(2));
          } else if (period.open?.hour !== undefined) {
            openMinutes = (period.open.hour * 60) + (period.open.minute || 0);
            openTime = String(period.open.hour).padStart(2, '0') + String(period.open.minute || 0).padStart(2, '0');
          } else {
            openTime = '0000';
            openMinutes = 0;
          }
          
          if (period.close?.time) {
            closeTime = period.close.time;
            closeMinutes = parseInt(closeTime.slice(0, 2)) * 60 + parseInt(closeTime.slice(2));
          } else if (period.close?.hour !== undefined) {
            closeMinutes = (period.close.hour * 60) + (period.close.minute || 0);
            closeTime = String(period.close.hour).padStart(2, '0') + String(period.close.minute || 0).padStart(2, '0');
          } else {
            closeTime = '2359';
            closeMinutes = 1439;
          }
          
          // Skip periods that appear to be 24-hour placeholder data (0000-2359 on same day)
          // These are often incorrect default values from Google when real hours aren't available
          if (openDay === closeDay && openTime === '0000' && closeTime === '2359') {
            return false;
          }
          
          // Case 1: Period opens and closes on the same day
          if (openDay === closeDay) {
            if (openDay !== customDayFilter) {
              return false;
            }
            // For same-day periods, check if filter time is within the range
            // Note: closeMinutes should be exclusive (before close time, not at)
            return filterTimeInMinutes >= openMinutes && filterTimeInMinutes <= closeMinutes;
          }
          
          // Case 2: Period spans multiple days (overnight)
          // Check if we're on the opening day after the opening time
          if (openDay === customDayFilter && filterTimeInMinutes >= openMinutes) {
            return true;
          }
          
          // Check if we're on the closing day before the closing time
          if (closeDay === customDayFilter && filterTimeInMinutes < closeMinutes) {
            return true;
          }
          
          // Check if we're on a day between open and close
          // (for periods that span more than 2 days, though rare)
          if (openDay < closeDay) {
            // Normal week span (e.g., Monday to Wednesday)
            if (customDayFilter > openDay && customDayFilter < closeDay) {
              return true;
            }
          } else {
            // Week wrap (e.g., Saturday to Monday)
            if (customDayFilter > openDay || customDayFilter < closeDay) {
              return true;
            }
          }
          
          return false;
        });
        
        if (!isOpen) {
          return;
        }
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
        const offsetDistance = 0.0015; // approximately 150 meters for better separation
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

      const mapsUrl = (Number.isFinite(row.lat) && Number.isFinite(row.lng))
        ? `https://www.google.com/maps/dir/?api=1&destination=${row.lat},${row.lng}`
        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(row.address || "")}`;

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

      // Check business hours status
      let hoursStatusHtml = '';
      let todayHours = '';
      
      try {
        const now = new Date();
        const currentDay = now.getDay();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        
        // Extract today's hours display
        if (parsed?.businessHours?.periods && Array.isArray(parsed.businessHours.periods)) {
          const todayPeriods = parsed.businessHours.periods.filter(p => p.open?.day === currentDay);
          
          if (todayPeriods.length > 0) {
            const hours = todayPeriods.map(p => {
              // Use hour/minute properties instead of time
              const oh = p.open?.hour;
              const om = p.open?.minute;
              const ch = p.close?.hour;
              const cm = p.close?.minute;
              
              if (oh === undefined || om === undefined || ch === undefined || cm === undefined) return '';
              
              const openStr = om === 0 ? `${oh === 0 ? 12 : oh > 12 ? oh - 12 : oh}${oh >= 12 ? 'p' : 'a'}` : `${oh === 0 ? 12 : oh > 12 ? oh - 12 : oh}:${om.toString().padStart(2, '0')}${oh >= 12 ? 'p' : 'a'}`;
              const closeStr = cm === 0 ? `${ch === 0 ? 12 : ch > 12 ? ch - 12 : ch}${ch >= 12 ? 'p' : 'a'}` : `${ch === 0 ? 12 : ch > 12 ? ch - 12 : ch}:${cm.toString().padStart(2, '0')}${ch >= 12 ? 'p' : 'a'}`;
              
              return `${openStr}-${closeStr}`;
            }).filter(h => h);
            
            if (hours.length > 0) todayHours = ` • ${hours.join(', ')}`;
          }
          
          // Check if currently open
          const yesterday = currentDay === 0 ? 6 : currentDay - 1;
          let isOpen = false;
          let opensWithinHour = false;
          let nextOpenTime = null;
          
          parsed.businessHours.periods.forEach(period => {
            const pDay = period.open?.day;
            if (pDay !== currentDay && pDay !== yesterday) return;
            
            // Use hour/minute properties
            const openTime = (period.open?.hour || 0) * 60 + (period.open?.minute || 0);
            const closeTime = (period.close?.hour || 0) * 60 + (period.close?.minute || 0);
            
            if (pDay === currentDay) {
              if (closeTime > openTime && currentTimeInMinutes >= openTime && currentTimeInMinutes < closeTime) {
                isOpen = true;
              } else if (closeTime < openTime && currentTimeInMinutes >= openTime) {
                isOpen = true;
              }
              
              if (!isOpen && openTime > currentTimeInMinutes && openTime <= currentTimeInMinutes + 60) {
                opensWithinHour = true;
                nextOpenTime = openTime;
              }
            } else if (pDay === yesterday && closeTime < openTime && currentTimeInMinutes < closeTime) {
              isOpen = true;
            }
          });
          
          if (isOpen) {
            hoursStatusHtml = `<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;"><span style="color: #10b981; font-size: 11px; font-weight: 800;">● OPEN NOW</span><span style="color: #94a3b8; font-size: 10px;">${todayHours}</span></div>`;
          } else if (opensWithinHour && nextOpenTime) {
            const minsUntil = (nextOpenTime - currentTimeInMinutes);
            const hoursStr = Math.floor(minsUntil / 60) > 0 ? `${Math.floor(minsUntil / 60)}h ${minsUntil % 60}m` : `${minsUntil % 60}m`;
            hoursStatusHtml = `<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;"><span style="color: #eab308; font-size: 11px; font-weight: 800;">◐ OPENING SOON (${hoursStr})</span><span style="color: #94a3b8; font-size: 10px;">${todayHours}</span></div>`;
          } else {
            hoursStatusHtml = `<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;"><span style="color: #ef4444; font-size: 11px; font-weight: 800;">● CLOSED</span><span style="color: #94a3b8; font-size: 10px;">${todayHours}</span></div>`;
          }
        }
      } catch (e) {}

      marker.bindPopup(`
        <div style="font-family: ui-sans-serif, system-ui; padding: 10px; min-width: 220px;">
          <b style="text-transform: uppercase; display: block; margin-bottom: 6px; color: #fff; font-size: 13px;">${(row.name || "").toString()}</b>
          <span style="color: #94a3b8; font-size: 10px; display: block; margin-bottom: 12px; line-height: 1.4;">${(row.address || "").toString()}</span>
          ${hoursStatusHtml}
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
          <button onclick="window.dispatchEvent(new CustomEvent('prospect:toggleHotLeadById',{detail:{id:${row.id != null ? JSON.stringify(row.id) : 'null'}}}))" style="display:block;width:100%;text-align:center;background:${parsed?.hotLead ? '#f97316' : '#0b1220'};color:white;padding:10px;border-radius:10px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;border:2px solid ${parsed?.hotLead ? '#f97316' : '#374151'};margin-bottom:8px;">
            🔥 ${parsed?.hotLead ? 'Hot Lead ✓' : 'Hot Lead'}
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
        
        // If in map route planning mode, add/remove from route instead of opening popup
        if (mapRoutePlanModeRef.current) {
          e.originalEvent?.preventDefault();
          
          // Close any open popups
          marker.closePopup();
          mapInstance.current.closePopup();
          
          const existingIndex = mapRouteStops.findIndex(s => s.id === row.id);
          
          // Simple visual feedback - scale and color change
          const markerEl = marker.getElement();
          if (markerEl) {
            const iconDiv = markerEl.querySelector('div');
            if (iconDiv) {
              // Remove any existing animation class
              iconDiv.classList.remove('route-marker-added', 'route-marker-removed');
              
              if (existingIndex >= 0) {
                // Removing - quick scale pulse
                iconDiv.classList.add('route-marker-removed');
                setTimeout(() => {
                  if (iconDiv) iconDiv.classList.remove('route-marker-removed');
                }, 300);
              } else {
                // Adding - quick scale pulse with checkmark
                iconDiv.classList.add('route-marker-added');
                setTimeout(() => {
                  if (iconDiv) iconDiv.classList.remove('route-marker-added');
                }, 300);
              }
            }
          }
          
          if (existingIndex >= 0) {
            // Remove from route
            setMapRouteStops(stops => stops.filter((_, i) => i !== existingIndex));
          } else {
            // Add to route
            setMapRouteStops(stops => [...stops, {
              id: row.id,
              name: row.name,
              address: row.address,
              lat: row.lat,
              lng: row.lng
            }]);
          }
          // Don't open popup in route mode
          return;
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
      if (shouldFitBounds) {
        try {
          mapInstance.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
        } catch (e) {
          console.warn('fitBounds skipped due to invalid bounds or map state', e);
        }
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

  // Recalculate openNow status based on current time
  const recalculateOpenNow = (hours) => {
    if (!hours || !hours.periods || !Array.isArray(hours.periods)) {
      return hours;
    }

    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    
    // Find periods for today and yesterday (for overnight hours)
    const yesterday = currentDay === 0 ? 6 : currentDay - 1;
    const relevantPeriods = hours.periods.filter(period => {
      const dayValue = period.open?.day !== undefined ? period.open.day : null;
      return dayValue === currentDay || dayValue === yesterday;
    });

    let isOpen = false;

    relevantPeriods.forEach(period => {
      const periodDay = period.open?.day !== undefined ? period.open.day : null;
      
      let openTime = 0;
      let closeTime = 0;

      // Parse open time
      if (period.open?.time) {
        const openStr = period.open.time.toString().padStart(4, '0');
        openTime = parseInt(openStr.substring(0, 2)) * 60 + parseInt(openStr.substring(2, 4));
      } else if (period.open?.hour !== undefined && period.open?.minute !== undefined) {
        openTime = period.open.hour * 60 + period.open.minute;
      }

      // Parse close time
      if (period.close?.time) {
        const closeStr = period.close.time.toString().padStart(4, '0');
        closeTime = parseInt(closeStr.substring(0, 2)) * 60 + parseInt(closeStr.substring(2, 4));
      } else if (period.close?.hour !== undefined && period.close?.minute !== undefined) {
        closeTime = period.close.hour * 60 + period.close.minute;
      }

      // Check if currently open
      if (periodDay === currentDay) {
        // Period starts today
        if (closeTime > openTime) {
          // Same day hours (e.g., 9:00 AM - 5:00 PM)
          if (currentTimeInMinutes >= openTime && currentTimeInMinutes < closeTime) {
            isOpen = true;
          }
        } else if (closeTime < openTime) {
          // Overnight hours starting today (e.g., 10:00 PM - 2:00 AM)
          if (currentTimeInMinutes >= openTime) {
            isOpen = true;
          }
        }
      } else if (periodDay === yesterday) {
        // Period started yesterday - check if still open from overnight
        if (closeTime < openTime) {
          // This was an overnight period, check if we're still in the closing time
          if (currentTimeInMinutes < closeTime) {
            isOpen = true;
          }
        }
      }
    });

    return {
      ...hours,
      openNow: isOpen
    };
  };

  // Fetch business hours when selectedEstablishment changes
  useEffect(() => {
    const runPosDetection = (name, city, website, menuUri) => {
      if (!name) return;
      setPosLoading(true);
      setPosSystem(null);
      
      const params = new URLSearchParams({ name });
      if (city) params.set('city', city);
      if (website) params.set('website', website);
      if (menuUri) params.set('menuUrl', menuUri);
      
      // Add retry logic with exponential backoff
      const maxRetries = 2;
      let retryCount = 0;
      
      const attemptDetection = async () => {
        try {
          const response = await fetch(`/api/detect-pos?${params}`);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const data = await response.json();
          setPosSystem(data);
        } catch (error) {
          console.warn(`POS detection attempt ${retryCount + 1} failed:`, error.message);
          
          if (retryCount < maxRetries) {
            retryCount++;
            // Exponential backoff: 1s, 2s
            const delay = Math.pow(2, retryCount - 1) * 1000;
            setTimeout(attemptDetection, delay);
          } else {
            // Final fallback
            setPosSystem({ pos: 'Unknown', source: null });
          }
        } finally {
          if (retryCount === 0 || (retryCount >= maxRetries)) {
            setPosLoading(false);
          }
        }
      };
      
      attemptDetection();
    };

    const fetchHours = async () => {
      if (!selectedEstablishment?.info) {
        setBusinessHours(null);
        setPosSystem(null);
        return;
      }

      // First check if we have cached hours in notes
      try {
        const notes = selectedEstablishment?.info?.notes || '';
        const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes;
        if (parsed?.businessHours) {
          // Recalculate openNow status with current time
          const hoursWithCurrentStatus = recalculateOpenNow(parsed.businessHours);
          setBusinessHours(hoursWithCurrentStatus);
          setBusinessWebsite(parsed.businessWebsite || null);
          setHoursLoading(false);
          runPosDetection(
            selectedEstablishment.info.location_name,
            selectedEstablishment.info.location_city || '',
            parsed.businessWebsite || null,
            null
          );
          return;
        }
      } catch {}

      const name = selectedEstablishment.info.location_name;
      const address = getFullAddress(selectedEstablishment.info);
      
      if (!name || !address) return;

      setHoursLoading(true);
      try {
        const response = await fetch(`/api/place-details?name=${encodeURIComponent(name)}&address=${encodeURIComponent(address)}`);
        if (response.ok) {
          const data = await response.json();
          // Recalculate openNow status with current time
          const hoursWithCurrentStatus = recalculateOpenNow(data.hours);
          setBusinessHours(hoursWithCurrentStatus);
          setBusinessWebsite(data.website || null);
          runPosDetection(name, selectedEstablishment.info.location_city || '', data.website || null, data.menuUri || null);
        } else {
          setBusinessHours(null);
          setBusinessWebsite(null);
          runPosDetection(name, selectedEstablishment.info.location_city || '', null, null);
        }
      } catch (error) {
        console.error('Failed to fetch hours:', error);
        setBusinessHours(null);
        setBusinessWebsite(null);
        runPosDetection(name, selectedEstablishment.info.location_city || '', null, null);
      } finally {
        setHoursLoading(false);
      }
    };

    fetchHours();
  }, [selectedEstablishment?.info?.id, selectedEstablishment?.info?.location_name, selectedEstablishment?.info?.location_address]);

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

  const clearRestaurantMarkers = () => {
    (restaurantMarkersRef.current || []).forEach((marker) => {
      try {
        if (marker) marker.remove();
      } catch (e) {}
    });
    restaurantMarkersRef.current = [];
    setRestaurantMarkers([]);
  };

  const searchNearbyRestaurants = async (lat, lng, placeType = 'restaurant') => {
    if (!lat || !lng || !mapInstance.current || !window.L) {
      console.warn('Invalid search parameters:', { lat, lng, mapReady: !!mapInstance.current, lReady: !!window.L });
      return;
    }
    
    setSearchingRestaurants(true);
    try {
      const response = await fetch(
        `/api/nearby-places?lat=${lat}&lng=${lng}&radius=5000&type=${placeType}`,
        { credentials: 'include' }
      );
      
      if (!response.ok) {
        try {
          const errorData = await response.json();
          console.error('Restaurant search failed:', errorData.error || `HTTP ${response.status}`);
        } catch (e) {
          console.error('Restaurant search failed:', `HTTP ${response.status}`);
        }
        setSearchingRestaurants(false);
        return;
      }
      
      const data = await response.json();
      if (!data.results || data.results.length === 0) {
        clearRestaurantMarkers();
        return;
      }
      
      const L = window.L;
      
      // Clear previous restaurant markers
      clearRestaurantMarkers();
      
      // Add new restaurant markers
      const newMarkers = data.results.map(place => {
        // Check if this place is already saved
        const isSaved = savedAccounts.some(
          acc => acc.name?.toLowerCase() === place.name.toLowerCase()
        );
        
        if (isSaved) return null; // Skip saved accounts
        
        try {
          const restaurantIcon = L.divIcon({
            className: 'restaurant-icon',
            html: `<div style="
              background-color: #f97316;
              border: 2px solid white;
              border-radius: 50%;
              width: 24px;
              height: 24px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
              font-weight: bold;
              color: white;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
            ">🍽️</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -12],
          });
          
          const marker = L.marker([place.lat, place.lng], {
            icon: restaurantIcon,
            title: place.name,
          });
          marker._prospectPlaceId = place.placeId;

          try {
            marker.bindTooltip((place.name || "").toString(), {
              permanent: true,
              direction: 'bottom',
              className: 'pin-label',
              offset: [0, 10],
            });

            const z = mapInstance.current.getZoom();
            if (z >= LABEL_ZOOM_THRESHOLD) marker.openTooltip(); else marker.closeTooltip();
          } catch (e) {}
          
          const popupContent = `
            <div style="padding: 8px; min-width: 150px;">
              <h3 style="margin: 0 0 8px 0; font-weight: bold; font-size: 13px;">${place.name}</h3>
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #666;">${place.address}</p>
              ${place.rating ? `<p style="margin: 0 0 6px 0; font-size: 12px;">⭐ ${place.rating.toFixed(1)}</p>` : ''}
              ${place.isOpen !== undefined ? `<p style="margin: 0; font-size: 12px; color: ${place.isOpen ? '#10b981' : '#ef4444'};">${place.isOpen ? '🟢 Open' : '🔴 Closed'}</p>` : ''}
              <button onclick="window.dispatchEvent(new CustomEvent('prospect:saveRestaurant',{detail:{name:${JSON.stringify(place.name || '')},address:${JSON.stringify(place.address || '')},lat:${Number(place.lat)},lng:${Number(place.lng)},placeId:${JSON.stringify(place.placeId || '')},types:${JSON.stringify(Array.isArray(place.types) ? place.types : [])},rating:${place.rating != null ? Number(place.rating) : 'null'},isOpen:${place.isOpen === true ? 'true' : place.isOpen === false ? 'false' : 'null'}}}))" style="display:block;width:100%;text-align:center;background:#ea580c;color:white;padding:8px;border-radius:8px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;border:2px solid #fb923c;margin-top:8px;">
                Save Account
              </button>
            </div>
          `;
          
          marker.bindPopup(popupContent);
          marker.addTo(mapInstance.current);
          
          return marker;
        } catch (e) {
          console.error('Error creating marker:', e);
          return null;
        }
      }).filter(m => m !== null);
      
      restaurantMarkersRef.current = newMarkers;
      setRestaurantMarkers(newMarkers);
    } catch (error) {
      console.error('Restaurant search error:', error?.message || String(error));
    } finally {
      setSearchingRestaurants(false);
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
        if (notes && notes.trim()) {
          const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes;
          if (parsed?.businessHours) {
            // Recalculate openNow status with current time
            const hoursWithCurrentStatus = recalculateOpenNow(parsed.businessHours);
            setBusinessHours(hoursWithCurrentStatus);
            setHoursLoading(false);
            return;
          }
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

      setHoursLoading(true);
      try {
        const response = await fetch(`/api/place-details?name=${encodeURIComponent(name)}&address=${encodeURIComponent(address)}`);
        if (response.ok) {
          const data = await response.json();
          // Recalculate openNow status with current time
          const hoursWithCurrentStatus = recalculateOpenNow(data.hours);
          setBusinessHours(hoursWithCurrentStatus);
          
          // Save hours to the database if this is a saved account
          if (selectedEstablishment?.info?.id && data.hours) {
            try {
              const notes = selectedEstablishment?.info?.notes || '{}';
              const parsed = (notes && notes.trim()) ? JSON.parse(notes) : {};
              const updatedNotes = {
                ...parsed,
                businessHours: data.hours
              };
              
              const saveResponse = await fetch(`/api/accounts?id=${selectedEstablishment.info.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: JSON.stringify(updatedNotes) }),
              });
              
              if (saveResponse.ok) {
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
    if (viewMode === "map") updateMarkers(false); // Don't fit bounds on filter changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAccounts, savedSubView, selectedGpvTier, visibleTiers, visibleActiveAccounts, showSavedPins, showActiveOnly, showUnvisitedOnly, showNroOnly, showReferralOnly, showHotLeadOnly, showOpenOnly, customFilterActive]);

  // Listen for popup-dispatched custom events from leaflet popup buttons
  useEffect(() => {
    // Old route event handler removed - route planning is now map-only

    const onView = (e) => {
      try {
        // Skip if in route planning mode - don't open details panel
        if (mapRoutePlanModeRef.current) {
          return;
        }
        
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
              
              // Load saved AI response if available
              if (parsed?.aiResponse) {
                skipAiLookupRef.current = true;
                setAiResponse(parsed.aiResponse);
                setAiLoading(false);
              } else {
                skipAiLookupRef.current = false;
                setAiResponse("");
              }
              
              setSelectedEstablishment({
                info: {
                  id: account.id,
                  location_name: account.name,
                  location_address: account.address,
                  taxpayer_number: keyParts[0] || undefined,
                  location_number: keyParts[1] || undefined,
                  lat: account.lat,
                  lng: account.lng,
                  notes: account.notes, // Include notes for hours/website caching
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
            await fetch(`/api/accounts?id=${id}`, { method: 'DELETE', credentials: 'include' });
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

    const onSaveRestaurant = async (e) => {
      try {
        const detail = e?.detail || {};
        const name = (detail.name || '').toString().trim();
        const address = (detail.address || '').toString().trim();
        const lat = Number(detail.lat);
        const lng = Number(detail.lng);

        if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          return;
        }

        const normalizedName = name.toLowerCase();
        const normalizedAddress = address.toLowerCase();
        const exists = savedAccounts.some((account) => {
          const accountName = (account?.name || '').toString().trim().toLowerCase();
          const accountAddress = (account?.address || '').toString().trim().toLowerCase();
          return accountName === normalizedName && accountAddress === normalizedAddress;
        });

        if (exists) {
          alert('This account is already saved.');
          return;
        }

        const notesPayload = JSON.stringify({
          source: 'google_places_restaurant_search',
          placeId: detail.placeId || null,
          placeTypes: Array.isArray(detail.types) ? detail.types : [],
          placeRating: Number.isFinite(Number(detail.rating)) ? Number(detail.rating) : null,
          placeOpenNow: detail.isOpen === true ? true : detail.isOpen === false ? false : null,
        });

        const saveRes = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name,
            address,
            lat,
            lng,
            notes: notesPayload,
          }),
        });

        if (!saveRes.ok) {
          let message = 'Failed to save account.';
          try {
            const errJson = await saveRes.json();
            if (errJson?.error) message = errJson.error;
          } catch {}
          alert(message);
          return;
        }

        await refreshSavedAccounts();

        const placeId = (detail.placeId || '').toString();
        const nextRestaurantMarkers = (restaurantMarkersRef.current || []).filter((marker) => {
          const markerPlaceId = (marker?._prospectPlaceId || '').toString();
          const shouldRemove = placeId && markerPlaceId === placeId;
          if (shouldRemove) {
            try { marker.remove(); } catch {}
            return false;
          }
          return true;
        });

        restaurantMarkersRef.current = nextRestaurantMarkers;
        setRestaurantMarkers(nextRestaurantMarkers);
      } catch (err) {
        console.error('saveRestaurant handler failed', err);
      }
    };

    const onToggleHotLeadById = async (e) => {
      try {
        const id = e?.detail?.id;
        if (id == null) return;
        const account = (Array.isArray(savedAccounts) ? savedAccounts : []).find(a => a.id === id);
        if (!account) return;
        const parsed = parseSavedNotes(account.notes);
        const notesObj = (parsed?.raw && typeof parsed.raw === 'object') ? { ...parsed.raw } : {
          key: parsed.key ? `KEY:${parsed.key}` : '',
          notes: parsed.notes || [],
          followups: parsed.followups || [],
          history: parsed.history || [],
        };
        notesObj.hotLead = !notesObj.hotLead;
        const res = await fetch(`/api/accounts?id=${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: JSON.stringify(notesObj) }),
        });
        if (!res.ok) throw new Error('Could not update hot lead flag');
        await refreshSavedAccounts();
      } catch (err) {
        console.error('toggleHotLeadById handler failed', err);
      }
    };

    window.addEventListener('prospect:viewDetails', onView);
    window.addEventListener('prospect:removePin', onRemove);
    window.addEventListener('prospect:saveRestaurant', onSaveRestaurant);
    window.addEventListener('prospect:toggleHotLeadById', onToggleHotLeadById);
    return () => {
      window.removeEventListener('prospect:viewDetails', onView);
      window.removeEventListener('prospect:removePin', onRemove);
      window.removeEventListener('prospect:saveRestaurant', onSaveRestaurant);
      window.removeEventListener('prospect:toggleHotLeadById', onToggleHotLeadById);
    };
  }, [setViewMode, setSavedSubView, savedAccounts, refreshSavedAccounts, selectedEstablishment, setSelectedEstablishment]);

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
    
    let estFood;
    if (venueType === 'custom' && customFoodPct) {
      // Use custom food sales amount directly
      estFood = parseFloat(customFoodPct) || 0;
    } else {
      estFood = cfg.alcoholPct > 0 ? (avgAlc / cfg.alcoholPct) * cfg.foodPct : 0;
      // For fine dining, multiply food portion by 1.75
      if (venueType === 'fine_dining') {
        estFood = estFood * 1.75;
      }
    }
    
    return { avgAlc, estFood, total: avgAlc + estFood, cfg };
  }, [selectedEstablishment, venueType, customFoodPct]);

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
                credentials: 'include'
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
          credentials: 'include'
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
      setSelectedReferral(parsed?.referral || false);
      setSelectedHotLead(parsed?.hotLead || false);
      if (parsed?.venueType) {
        setVenueType(parsed.venueType);
      }
      setVenueTypeLocked(parsed?.venueTypeLocked || false);
      setNotesList(Array.isArray(parsed.notes) ? parsed.notes : []);
      setFollowupsList(Array.isArray(parsed.followups) ? parsed.followups : []);
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
          
          // Auto-update tier if currently NRO but now has sales data
          if (parsed?.gpvTier === 'nro' && parsed.history.length > 0) {
            const total = parsed.history.reduce((sum, h) => sum + h.total, 0);
            const avg = total / parsed.history.length;
            const annualForecast = avg * 12;
            
            // Only upgrade if there's significant sales (> $10k annual forecast)
            if (annualForecast > 10000) {
              let newTier = 'tier1';
              if (annualForecast >= 1000000) newTier = 'tier6';
              else if (annualForecast >= 500000) newTier = 'tier5';
              else if (annualForecast >= 250000) newTier = 'tier4';
              else if (annualForecast >= 100000) newTier = 'tier3';
              else if (annualForecast >= 50000) newTier = 'tier2';
              
              // Update tier in database
              const updatedNotes = {
                ...parsed,
                gpvTier: newTier
              };
              
              fetch(`/api/accounts?id=${data.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notes: JSON.stringify(updatedNotes) }),
              }).then(() => refreshSavedAccounts()).catch(() => {});
              
              setSelectedGpvTier(newTier);
            } else {
              // Keep as NRO if sales are too low
              setSelectedGpvTier('nro');
            }
          } else {
            setSelectedGpvTier(parsed?.gpvTier || null);
          }
          
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
          setFollowupsList(Array.isArray(parsed.followups) ? parsed.followups : []);
          setSelectedGpvTier(parsed?.gpvTier || null);
          setSelectedActiveOpp(parsed?.activeOpp || false);
          setSelectedReferral(parsed?.referral || false);
          setSelectedHotLead(parsed?.hotLead || false);
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
              setFollowupsList([]);
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
        const wasActive = !!notesObj.activeOpp;
        notesObj.activeOpp = !wasActive;
        
        // Track timestamp when turning ON activeOpp
        if (!wasActive && notesObj.activeOpp) {
          notesObj.activeOppDate = new Date().toISOString();
        }

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
        setSelectedActiveAccount((s) => {
          const newValue = !s;
          // If turning ON activeAccount, enter edit mode
          if (newValue) {
            setIsEditingWonValues(true);
          }
          return newValue;
        });
        setNotesOwner((o) => ({ ...o, key }));
        return;
      }

      try {
        const parsed = parseSavedNotes(saved.notes);
        let notesObj = (parsed && parsed.raw && typeof parsed.raw === "object") ? parsed.raw : { key: parsed.key ? `KEY:${parsed.key}` : `KEY:${key}`, notes: parsed.notes || [], history: parsed.history || [], activeAccount: parsed?.activeAccount ?? false };
        const wasActive = !!notesObj.activeAccount;
        notesObj.activeAccount = !wasActive;
        
        // Track timestamp when turning ON activeAccount
        if (!wasActive && notesObj.activeAccount) {
          notesObj.activeAccountDate = new Date().toISOString();
        }

        const res = await fetch(`/api/accounts?id=${saved.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: JSON.stringify(notesObj) }),
        });
        if (!res.ok) throw new Error("Could not update active account flag");

        await refreshSavedAccounts();

        setSelectedActiveAccount(notesObj.activeAccount || false);
        setNotesOwner({ id: saved.id, key: parsed.key || null });
        
        // If turning ON activeAccount and no saved won values yet, enter edit mode
        if (notesObj.activeAccount && !notesObj.wonGpv && !notesObj.wonArr && !notesObj.wonDateSigned) {
          setIsEditingWonValues(true);
        }
        // If turning OFF activeAccount, exit edit mode
        if (!notesObj.activeAccount) {
          setIsEditingWonValues(false);
        }
      } catch (err) {
        setError(err?.message || "Could not toggle Active Account.");
      }
    };

    // Toggle Referral flag for selected account
    const toggleReferral = async () => {
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
        setSelectedReferral((s) => !s);
        setNotesOwner((o) => ({ ...o, key }));
        return;
      }

      try {
        const parsed = parseSavedNotes(saved.notes);
        let notesObj = (parsed && parsed.raw && typeof parsed.raw === "object") ? parsed.raw : { key: parsed.key ? `KEY:${parsed.key}` : `KEY:${key}`, notes: parsed.notes || [], history: parsed.history || [], referral: parsed?.referral ?? false };
        notesObj.referral = !notesObj.referral;

        const res = await fetch(`/api/accounts?id=${saved.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: JSON.stringify(notesObj) }),
        });
        if (!res.ok) throw new Error("Could not update referral flag");

        await refreshSavedAccounts();

        setSelectedReferral(notesObj.referral || false);
        setNotesOwner({ id: saved.id, key: parsed.key || null });
      } catch (err) {
        setError(err?.message || "Could not toggle Referral.");
      }
    };

    const toggleHotLead = async () => {
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

      if (!saved || !saved.id) {
        setSelectedHotLead((s) => !s);
        setNotesOwner((o) => ({ ...o, key }));
        return;
      }

      try {
        const parsed = parseSavedNotes(saved.notes);
        let notesObj = (parsed && parsed.raw && typeof parsed.raw === "object") ? parsed.raw : { key: parsed.key ? `KEY:${parsed.key}` : `KEY:${key}`, notes: parsed.notes || [], history: parsed.history || [], hotLead: parsed?.hotLead ?? false };
        notesObj.hotLead = !notesObj.hotLead;

        const res = await fetch(`/api/accounts?id=${saved.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: JSON.stringify(notesObj) }),
        });
        if (!res.ok) throw new Error("Could not update hot lead flag");

        await refreshSavedAccounts();

        setSelectedHotLead(notesObj.hotLead || false);
        setNotesOwner({ id: saved.id, key: parsed.key || null });
      } catch (err) {
        setError(err?.message || "Could not toggle Hot Lead.");
      }
    };

    // Save GPV and ARR values for active account
    const saveWonValues = async () => {
      if (!selectedEstablishment?.info) return;
      if (!selectedActiveAccount) {
        setError("Please activate this account before saving won values.");
        return;
      }

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
        setError("Please save this account first before adding won values.");
        return;
      }

      try {
        const parsed = parseSavedNotes(saved.notes);
        let notesObj = (parsed && parsed.raw && typeof parsed.raw === "object") ? parsed.raw : { key: parsed.key ? `KEY:${parsed.key}` : `KEY:${key}`, notes: parsed.notes || [], history: parsed.history || [] };
        
        // Save GPV, ARR, and date signed values
        notesObj.wonGpv = wonGpv ? parseFloat(wonGpv) : 0;
        notesObj.wonArr = wonArr ? parseFloat(wonArr) : 0;
        notesObj.wonDateSigned = wonDateSigned || new Date().toISOString().split('T')[0]; // Use provided date or today

        const res = await fetch(`/api/accounts?id=${saved.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: JSON.stringify(notesObj) }),
        });
        if (!res.ok) throw new Error("Could not save won values");

        await refreshSavedAccounts();
        setIsEditingWonValues(false); // Exit edit mode after saving
        setError(""); // Clear any previous errors on success
      } catch (err) {
        setError(err?.message || "Could not save won values.");
      }
    };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans p-4 md:p-8 selection:bg-indigo-500/30">
      {/* Header with Logout Button */}
      <header className="max-w-6xl mx-auto mb-10 flex justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 p-2 sm:p-3 rounded-2xl shadow-lg shadow-indigo-600/30 flex-shrink-0">
            <Navigation className="text-white w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl text-white tracking-tighter uppercase italic leading-tight">
              <span className="font-black">Pocket</span> <span className="font-normal">Prospector</span>
            </h1>
            <p className="text-[10px] sm:text-xs font-normal text-slate-500 normal-case not-italic tracking-wider mt-0.5">v5.0.15</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center justify-center w-8 h-8 sm:w-auto sm:h-auto sm:gap-1.5 sm:px-2.5 sm:py-1.5 md:gap-2 md:px-4 md:py-2 rounded-lg sm:rounded-xl text-xs md:text-sm font-bold text-red-400 hover:text-red-300 hover:bg-red-600/10 transition-all duration-200 border border-red-600/30 hover:border-red-500/50 flex-shrink-0"
          title="Logout"
        >
          <svg className="w-4 h-4 sm:w-4 sm:h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden sm:inline">Logout</span>
        </button>
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
              />
            ) : viewMode === "nro" ? (
              <div className="bg-gradient-to-br from-indigo-600/15 to-indigo-600/5 border border-indigo-500/30 rounded-3xl p-6 shadow-refined-lg">
                <div className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-4">
                  New Retail Opportunities Search
                </div>
                <form onSubmit={handleNroSearch}>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <select
                        value={nroSearchType}
                        onChange={(e) => setNroSearchType(e.target.value)}
                        className="bg-[#0F172A] border border-slate-700 px-4 py-3 rounded-xl text-[12px] font-bold text-slate-200 focus:border-indigo-500 focus:outline-none transition-colors uppercase cursor-pointer"
                      >
                        <option value="city">City</option>
                        <option value="county">County</option>
                        <option value="zip">Zip Code</option>
                      </select>
                      <input
                        type="text"
                        id="nro-search"
                        name="nroSearch"
                        placeholder={
                          nroSearchType === 'city' ? 'CITY (e.g., AUSTIN)' :
                          nroSearchType === 'county' ? 'COUNTY (e.g., TRAVIS)' :
                          'ZIP CODE (e.g., 78701)'
                        }
                        value={nroSearchTerm}
                        onChange={(e) => setNroSearchTerm(nroSearchType === 'zip' ? e.target.value : e.target.value.toUpperCase())}
                        className="flex-1 bg-[#071126] border border-slate-700 px-4 py-3 rounded-xl text-[12px] font-bold placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none transition-colors"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={nroLoading || !nroSearchTerm.trim()}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-[11px] uppercase tracking-widest py-3 px-4 rounded-xl transition-all duration-200 shadow-refined hover:shadow-refined-lg"
                    >
                      {nroLoading ? 'Searching...' : 'Search New Licenses (Last 4 Months)'}
                    </button>
                    {nroError && (
                      <div className="text-[11px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3">
                        {nroError}
                      </div>
                    )}
                  </div>
                </form>
              </div>
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

            {/* Top Leaders View Mode Toggle */}
            {viewMode === 'top' && topAccounts.length > 0 && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setTopViewMode("list")}
                  className={`flex-1 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                    topViewMode === "list"
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-slate-900/70 border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  📋 List
                </button>
                <button
                  onClick={() => setTopViewMode("map")}
                  className={`flex-1 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                    topViewMode === "map"
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-slate-900/70 border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  🗺️ Map
                </button>
              </div>
            )}

            {/* NRO View Mode Toggle */}
            {viewMode === 'nro' && nroResults.length > 0 && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setNroViewMode("list")}
                  className={`flex-1 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                    nroViewMode === "list"
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-slate-900/70 border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  📋 List
                </button>
                <button
                  onClick={() => { setNroMapPinsLoading(true); setNroViewMode("map"); }}
                  className={`flex-1 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                    nroViewMode === "map"
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-slate-900/70 border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  🗺️ Map
                </button>
              </div>
            )}

            {/* Route Planning Panel removed - route planning is now map-only */}

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
                  <div className="relative">
                    <input 
                      value={manualSelected ? (manualSelected.address || '') : ''} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setManualSelected({...manualSelected, address: val});
                        
                        // Debounced address suggestions
                        if (addressSuggestionsTimeout.current) clearTimeout(addressSuggestionsTimeout.current);
                        
                        if (val.trim().length >= 3) {
                          addressSuggestionsTimeout.current = setTimeout(async () => {
                            try {
                              const params = new URLSearchParams({
                                query: val.trim(),
                                ...(manualCityFilter.trim() && { city: manualCityFilter.trim() })
                              });
                              const url = `/api/places?${params}`;
                              const res = await fetch(url);
                              if (!res.ok) throw new Error('Failed to fetch suggestions');
                              const data = await res.json();
                              const results = data.results || [];
                              setAddressSuggestions(results.map(r => ({
                                address: r.address || '',
                                name: r.name || '',
                                lat: r.lat,
                                lng: r.lng
                              })));
                              setShowAddressSuggestions(true);
                            } catch (e) {
                              console.error('Address suggestions error:', e);
                              setAddressSuggestions([]);
                            }
                          }, 300);
                        } else {
                          setAddressSuggestions([]);
                          setShowAddressSuggestions(false);
                        }
                      }}
                      onFocus={() => {
                        if (addressSuggestions.length > 0) {
                          setShowAddressSuggestions(true);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowAddressSuggestions(false), 200);
                      }}
                      placeholder="Address" 
                      className="w-full bg-[#071126] border border-slate-700 px-3 py-2 rounded-xl text-[12px]" 
                    />
                    
                    {/* Address Suggestions Dropdown */}
                    {showAddressSuggestions && addressSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full bg-[#020617] border border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto mt-1">
                        {addressSuggestions.map((suggestion, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setManualSelected({
                                ...manualSelected,
                                address: suggestion.address,
                                name: manualSelected.name || suggestion.name,
                                lat: suggestion.lat,
                                lng: suggestion.lng
                              });
                              setShowAddressSuggestions(false);
                              setAddressSuggestions([]);
                            }}
                            className="p-3 border-b border-slate-800 last:border-0 cursor-pointer hover:bg-slate-900/50 transition-colors"
                          >
                            <div className="text-[11px] font-bold text-white truncate">{suggestion.address}</div>
                            {suggestion.name && <div className="text-[10px] text-slate-400 truncate">{suggestion.name}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

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

                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={async () => {
                        if (!manualSelected || !manualSelected.name) {
                          setError('Please enter a business name');
                          return;
                        }
                        if (!manualGpvTier) {
                          setError('Please select a GPV Tier');
                          return;
                        }

                        const name = manualSelected.name.trim();
                        const address = manualSelected.address?.trim() || '';

                        let lat = manualSelected.lat;
                        let lng = manualSelected.lng;

                        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                          const pseudo = pseudoLatLng(name || address || Date.now());
                          lat = pseudo.lat;
                          lng = pseudo.lng;
                        }

                        setError('');
                        let aiText = "";
                        try {
                          aiText = await fetchAiForInfo({ location_name: name, location_city: manualCityFilter || '', taxpayer_name: name }, { updateState: false });
                        } catch (e) {
                          console.error('AI fetch failed', e);
                        }

                        const payload = {
                          name,
                          address,
                          lat,
                          lng,
                          notes: JSON.stringify({ manual: true, gpvTier: manualGpvTier, activeOpp: selectedActiveOpp, activeAccount: selectedActiveAccount, venueType: venueType, venueTypeLocked: venueTypeLocked, aiResponse: aiText || aiResponse || "" }),
                        };

                        try {
                          const res = await fetch('/api/accounts', { 
                            method: 'POST', 
                            headers: { 'Content-Type': 'application/json' }, 
                            body: JSON.stringify(payload),
                            credentials: 'include'
                          });
                          if (!res.ok) throw new Error('Save failed');
                          const created = await res.json();
                          await refreshSavedAccounts();
                          setManualAddOpen(false);
                          setManualQuery('');
                          setManualResults([]);
                          setManualSelected(null);
                          setManualGpvTier(null);
                          setSelectedGpvTier(manualGpvTier);
                          setSelectedEstablishment({
                            info: {
                              id: created.id,
                              location_name: created.name,
                              location_address: created.address,
                              lat: created.lat,
                              lng: created.lng,
                              notes: created.notes,
                            },
                            history: [],
                          });
                        } catch (err) {
                          setError(err?.message || 'Could not create account.');
                        }
                      }}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-xl text-[12px] font-black uppercase text-white transition-all"
                    >
                      Create Account
                    </button>
                    <button
                      onClick={() => {
                        setManualSelected(null);
                        setManualQuery('');
                        setManualCityFilter('');
                        setManualGpvTier(null);
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-[10px] font-bold uppercase"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* List — hidden in map mode */}
            {!(viewMode === "top" && topViewMode === "map") && !(viewMode === "nro" && nroViewMode === "map") && (
            <div className="space-y-3 max-h-[550px] overflow-y-auto pr-2 custom-scroll">
              {viewMode === "nro" ? (
                nroResults.length > 0 ? (
                  nroResults.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={async () => {
                        // Search for sales data using business name and city to verify if truly new
                        setLoading(true);
                        try {
                          // Try to find sales records by searching for the business name in the city
                          const searchName = item.location_name.toUpperCase();
                          const searchCity = item.location_city.toUpperCase();
                          
                          // Search the sales database by name and city
                          const where = buildSocrataWhere(searchName, searchCity);
                          const query = `?$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(
                            `${DATE_FIELD} DESC`
                          )}&$limit=12`;

                          const res = await fetch(`${BASE_URL}${query}`);
                          let history = [];
                          
                          if (res.ok) {
                            const hist = await res.json();
                            const rows = Array.isArray(hist) ? hist : [];
                            
                            // Only use results if we found an exact name match
                            const exactMatch = rows.filter(row => 
                              (row.location_name || '').toUpperCase() === searchName
                            );
                            
                            if (exactMatch.length > 0) {
                              const reversed = [...exactMatch].reverse();
                              history = reversed.map((h) => ({
                                month: monthLabelFromDate(h[DATE_FIELD]),
                                liquor: Number(h.liquor_receipts || 0),
                                beer: Number(h.beer_receipts || 0),
                                wine: Number(h.wine_receipts || 0),
                                total: Number(h[TOTAL_FIELD] || 0),
                                rawDate: h[DATE_FIELD],
                              }));
                            }
                          }
                          
                          setSelectedEstablishment({ 
                            info: item, 
                            history 
                          });
                          
                          // Auto-select NRO tier for new opportunities, or calculate tier if sales exist
                          if (history.length === 0) {
                            // No sales data - set to NRO tier
                            setSelectedGpvTier('nro');
                          } else {
                            // Has sales data - calculate appropriate tier based on forecast
                            const total = history.reduce((sum, h) => sum + h.total, 0);
                            const avg = total / history.length;
                            const annualForecast = avg * 12;
                            
                            // Determine tier based on annual forecast
                            let tier = 'tier1';
                            if (annualForecast >= 1000000) tier = 'tier6';
                            else if (annualForecast >= 500000) tier = 'tier5';
                            else if (annualForecast >= 250000) tier = 'tier4';
                            else if (annualForecast >= 100000) tier = 'tier3';
                            else if (annualForecast >= 50000) tier = 'tier2';
                            
                            setSelectedGpvTier(tier);
                          }
                          
                          // Fetch AI info for NRO account
                          await fetchAiForInfo(item, { updateState: true });
                        } catch (err) {
                          // If search fails, just show with empty history and NRO tier
                          setSelectedEstablishment({ 
                            info: item, 
                            history: [] 
                          });
                          setSelectedGpvTier('nro');
                          
                          // Still fetch AI info even on error
                          try {
                            await fetchAiForInfo(item, { updateState: true });
                          } catch {}
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="bg-[#0F172A] border border-slate-700/50 shadow-refined rounded-3xl p-5 cursor-pointer transition-all duration-200 hover:border-indigo-500 hover:shadow-refined-lg hover:scale-[1.01]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-[11px] font-black uppercase text-white tracking-wider leading-tight">
                              {item.location_name}
                            </div>
                            {item.source === 'Austin Building Permit' && (
                              <span className="text-orange-400 font-black text-[8px] px-1.5 py-0.5 bg-orange-500/10 rounded border border-orange-500/30 whitespace-nowrap">
                                PERMIT
                              </span>
                            )}
                            {item.source === 'TABC Pending' && (
                              <span className="text-yellow-400 font-black text-[8px] px-1.5 py-0.5 bg-yellow-500/10 rounded border border-yellow-500/30 whitespace-nowrap">
                                PENDING
                              </span>
                            )}
                            {item.source === 'First Inspection' && (
                              <span className="text-purple-400 font-black text-[8px] px-1.5 py-0.5 bg-purple-500/10 rounded border border-purple-500/30 whitespace-nowrap">
                                NEW OPEN
                              </span>
                            )}
                            {item.has_sales ? (
                              <span className="text-emerald-400 font-black text-xs px-2 py-0.5 bg-emerald-500/10 rounded-lg border border-emerald-500/30 whitespace-nowrap">
                                {formatCurrency(item.total_receipts)}
                              </span>
                            ) : (
                              <span className="text-cyan-400 font-black text-xs px-2 py-0.5 bg-cyan-500/10 rounded-lg border border-cyan-500/30 whitespace-nowrap">
                                No Sales
                              </span>
                            )}
                          </div>
                          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                            {item.location_address ? `${item.location_address}, ` : ''}{item.location_city}, TX {item.location_zip}
                          </div>
                          <div className="flex gap-3 mt-3 flex-wrap">
                            {item.source === 'Austin Building Permit' ? (
                              <>
                                <div className="text-[9px] font-bold text-orange-400">
                                  Permit #{item.permit_number}
                                </div>
                                <div className="text-[9px] font-bold text-slate-400">
                                  Issued: {new Date(item.issue_date).toLocaleDateString()}
                                </div>
                                {item.work_class && (
                                  <div className="text-[9px] font-bold text-slate-500">
                                    {item.work_class}
                                  </div>
                                )}
                              </>
                            ) : item.source === 'TABC Pending' ? (
                              <>
                                <div className="text-[9px] font-bold text-yellow-400">
                                  {item.license_type} — {item.application_status}
                                </div>
                                <div className="text-[9px] font-bold text-slate-400">
                                  Submitted: {new Date(item.submission_date).toLocaleDateString()}
                                </div>
                              </>
                            ) : item.source === 'First Inspection' ? (
                              <>
                                <div className="text-[9px] font-bold text-purple-400">
                                  First Inspection
                                </div>
                                <div className="text-[9px] font-bold text-slate-400">
                                  {new Date(item.first_inspection).toLocaleDateString()}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="text-[9px] font-bold text-indigo-400">
                                  {item.license_type}
                                </div>
                                <div className="text-[9px] font-bold text-slate-400">
                                  Issued: {new Date(item.original_issue_date).toLocaleDateString()}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 text-[11px] font-bold uppercase tracking-widest bg-[#1E293B] border border-slate-700 rounded-3xl p-6">
                    Search for a city to find new retail opportunities.
                  </div>
                )
              ) : (
                <>
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
                </>
              )}
            </div>
            )}
          </aside>
        )}

        {/* Right column */}
        <section className={(viewMode === "metrics" || viewMode === "map") ? "lg:col-span-12" : "lg:col-span-8"}>
          {viewMode === "top" && topViewMode === "map" && (
            <>
              <div className="bg-[#1E293B] rounded-[2.5rem] border border-slate-700 shadow-2xl overflow-hidden mb-3" style={{ height: 480, isolation: "isolate", zIndex: 0, position: "relative" }}>
                <div ref={topMapRef} className="w-full h-full" />
                {(topLoading || topMapPinsLoading) && (
                  <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-[2.5rem]">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 size={48} className="text-indigo-400 animate-spin" />
                      <span className="text-white font-black text-[11px] uppercase tracking-widest">Loading Pins...</span>
                    </div>
                  </div>
                )}
              </div>
              {/* GPV Tier Color Key */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 mb-4 bg-[#1E293B] rounded-2xl border border-slate-700">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mr-1">GPV Tier</span>
                {GPV_TIERS.filter(t => t.id !== "nro").map(t => (
                  <div key={t.id} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full border-2 border-white/30 flex-shrink-0" style={{ backgroundColor: t.color }} />
                    <span className="text-[10px] font-bold text-slate-300">{t.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5 ml-1 pl-3 border-l border-slate-700">
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-white/30 flex-shrink-0" style={{ backgroundColor: "#06b6d4" }} />
                  <span className="text-[10px] font-bold text-slate-300">NRO</span>
                </div>
              </div>
            </>
          )}
          {viewMode === "nro" && nroViewMode === "map" && (
            <>
              <div className="bg-[#1E293B] rounded-[2.5rem] border border-slate-700 shadow-2xl overflow-hidden mb-3" style={{ height: 480, isolation: "isolate", zIndex: 0, position: "relative" }}>
                <div ref={nroMapRef} className="w-full h-full" />
                {nroMapPinsLoading && (
                  <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-[2.5rem]">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 size={48} className="text-indigo-400 animate-spin" />
                      <span className="text-white font-black text-[11px] uppercase tracking-widest">Loading Pins...</span>
                    </div>
                  </div>
                )}
              </div>
              {/* NRO Map Legend */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 mb-4 bg-[#1E293B] rounded-2xl border border-slate-700">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mr-1">Legend</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-white/30 flex-shrink-0" style={{ backgroundColor: "#06b6d4" }} />
                  <span className="text-[10px] font-bold text-slate-300">New TABC License</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-white/30 flex-shrink-0" style={{ backgroundColor: "#f97316" }} />
                  <span className="text-[10px] font-bold text-slate-300">Building Permit</span>
                </div>
                <div className="flex items-center gap-1.5 ml-1 pl-3 border-l border-slate-700">
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-white/30 flex-shrink-0" style={{ backgroundColor: "#10b981" }} />
                  <span className="text-[10px] font-bold text-slate-300">Already Saved</span>
                </div>
              </div>
            </>
          )}
          {viewMode === "map" ? (
            <>
              <div className="bg-[#1E293B] rounded-[2.5rem] border border-slate-700 shadow-2xl overflow-hidden relative min-h-[720px] h-[720px]" style={{ isolation: "isolate" }}>
              
              {/* Floating search bar */}
              <div className="absolute top-6 left-6 right-6 z-[1000] flex items-center gap-3 pointer-events-none">
                <div className="flex-1 max-w-md relative pointer-events-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder={restaurantSearchMode ? "Search for restaurants, bars, or cafes..." : "Search accounts..."}
                    value={restaurantSearchMode ? restaurantSearchQuery : mapSearch}
                    onChange={(e) => {
                      if (restaurantSearchMode) {
                        setRestaurantSearchQuery(e.target.value);
                      } else {
                        handleMapSearchInput(e.target.value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && restaurantSearchMode) {
                        if (mapInstance.current) {
                          const center = mapInstance.current.getCenter();
                          searchNearbyRestaurants(center.lat, center.lng, 'restaurant');
                        }
                      } else if (e.key === 'Enter' && !restaurantSearchMode) {
                        searchMapAccounts(mapSearch);
                      } else if (e.key === 'Escape') {
                        setShowMapSuggestions(false);
                      }
                    }}
                    onBlur={() => setTimeout(() => setShowMapSuggestions(false), 200)}
                    className="w-full bg-slate-900/90 backdrop-blur-md border border-slate-700 text-white text-base rounded-xl pl-9 pr-3 py-2.5 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xl"
                  />
                  
                  {/* Suggestions dropdown */}
                  {!restaurantSearchMode && showMapSuggestions && mapSearchSuggestions.length > 0 && (
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
                  {restaurantSearchMode ? `${restaurantMarkers.length} RESTAURANTS` : `${savedAccounts.length} PINS`}
                </div>
              </div>

              <div className="absolute top-24 right-6 z-50 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-xl p-3 text-xs text-slate-200 shadow-xl max-w-xs">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-black uppercase text-[10px] text-indigo-300">Map Filters</div>
                  <button onClick={() => setLegendOpen(o => !o)} className="text-[10px] px-2 py-1 rounded-md bg-slate-800/60">
                    {legendOpen ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className={`flex flex-col gap-2 ${legendOpen ? '' : 'hidden'}`}>
                  
                  {/* GPV Tiers Collapsible Section */}
                  <div className="border-b border-slate-700 pb-2">
                    <button
                      onClick={() => setGpvTiersOpen(o => !o)}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-800/50 transition-colors"
                    >
                      <span className="text-[10px] font-black uppercase text-slate-300">GPV Tiers</span>
                      <span className="text-[10px] text-slate-400">{gpvTiersOpen ? '−' : '+'}</span>
                    </button>
                    {gpvTiersOpen && (
                      <div className="mt-2 space-y-1">
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
                      </div>
                    )}
                  </div>

                  {/* Filters Collapsible Section */}
                  <div className="border-t border-slate-700 pt-2">
                    <button
                      onClick={() => setFiltersOpen(o => !o)}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-800/50 transition-colors"
                    >
                      <span className="text-[10px] font-black uppercase text-slate-300">Filters</span>
                      <span className="text-[10px] text-slate-400">{filtersOpen ? '−' : '+'}</span>
                    </button>
                    {filtersOpen && (
                  <div className="flex flex-col gap-2 mt-2">
                    <button
                      onClick={() => setShowSavedPins(v => !v)}
                      title={showSavedPins ? "Hide all saved pins" : "Show all saved pins"}
                      className={`w-full px-3 py-1.5 rounded-md border text-slate-200 flex items-center justify-center gap-2 text-[12px] font-black ${showSavedPins ? 'bg-slate-800/70 hover:bg-slate-700 border-slate-700' : 'bg-rose-500 text-white border-rose-500'}`}
                      style={{ backdropFilter: 'blur(4px)' }}
                    >
                      <span>{showSavedPins ? 'Hide All' : 'Show All'}</span>
                    </button>

                    <button
                      onClick={() => setShowNroOnly(v => !v)}
                      title="Show NRO accounts only"
                      className={`w-full px-3 py-1.5 rounded-md border text-slate-200 flex items-center justify-center gap-2 text-[12px] font-black ${showNroOnly ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-800/70 hover:bg-slate-700 border-slate-700'}`}
                      style={{ backdropFilter: 'blur(4px)' }}
                    >
                      <span>NRO</span>
                    </button>

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
                      onClick={() => setShowReferralOnly(v => !v)}
                      title="Show referral accounts only"
                      className={`w-full px-3 py-1.5 rounded-md border text-slate-200 flex items-center justify-center gap-2 text-[12px] font-black ${showReferralOnly ? 'bg-purple-500 text-white border-purple-500' : 'bg-slate-800/70 hover:bg-slate-700 border-slate-700'}`}
                      style={{ backdropFilter: 'blur(4px)' }}
                    >
                      <span>Referral</span>
                    </button>

                    <button
                      onClick={() => setShowHotLeadOnly(v => !v)}
                      title="Show hot leads only"
                      className={`w-full px-3 py-1.5 rounded-md border text-slate-200 flex items-center justify-center gap-2 text-[12px] font-black ${showHotLeadOnly ? 'bg-orange-500 text-white border-orange-500' : 'bg-slate-800/70 hover:bg-slate-700 border-slate-700'}`}
                      style={{ backdropFilter: 'blur(4px)' }}
                    >
                      <span>🔥 Hot Lead</span>
                    </button>
                  </div>
                    )}
                  </div>

                  {/* Account Hours Collapsible Section */}
                  <div className="border-t border-slate-700 pt-2">
                    <button
                      onClick={() => setHoursFilterOpen(o => !o)}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-800/50 transition-colors"
                    >
                      <span className="text-[10px] font-black uppercase text-slate-300">Account Hours</span>
                      <span className="text-[10px] text-slate-400">{hoursFilterOpen ? '−' : '+'}</span>
                    </button>
                    {hoursFilterOpen && (
                      <div className="mt-2 space-y-2">
                        <button
                          onClick={() => setShowOpenOnly(v => !v)}
                          title="Show only accounts that are currently open"
                          className={`w-full px-3 py-1.5 rounded-md border text-slate-200 flex items-center justify-center gap-2 text-[12px] font-black ${showOpenOnly ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-800/70 hover:bg-slate-700 border-slate-700'}`}
                          style={{ backdropFilter: 'blur(4px)' }}
                        >
                          <span>Open Now</span>
                        </button>

                        <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                          <div className="text-[10px] font-black uppercase text-slate-400 mb-2">Custom Time Filter</div>
                          <div className="space-y-2">
                            <select
                              value={customDayFilter ?? ''}
                              onChange={(e) => setCustomDayFilter(e.target.value === '' ? null : Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-[11px] font-bold px-2 py-1.5 rounded-md"
                            >
                              <option value="">Select Day</option>
                              <option value="0">Sunday</option>
                              <option value="1">Monday</option>
                              <option value="2">Tuesday</option>
                              <option value="3">Wednesday</option>
                              <option value="4">Thursday</option>
                              <option value="5">Friday</option>
                              <option value="6">Saturday</option>
                            </select>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                min="1"
                                max="12"
                                placeholder="Hour"
                                value={customHourFilter}
                                onChange={(e) => setCustomHourFilter(e.target.value)}
                                className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 text-base font-bold px-2 py-1.5 rounded-md"
                              />
                              <select
                                value={customPeriodFilter}
                                onChange={(e) => setCustomPeriodFilter(e.target.value)}
                                className="bg-slate-900 border border-slate-700 text-slate-200 text-[11px] font-bold px-2 py-1.5 rounded-md"
                              >
                                <option value="AM">AM</option>
                                <option value="PM">PM</option>
                              </select>
                            </div>
                            <button
                              onClick={() => setCustomFilterActive(true)}
                              disabled={customDayFilter === null || !customHourFilter}
                              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[11px] font-black uppercase px-3 py-2 rounded-md transition-colors"
                            >
                              Run Filter
                            </button>
                            {(customDayFilter !== null || customHourFilter) && (
                              <button
                                onClick={() => {
                                  setCustomDayFilter(null);
                                  setCustomHourFilter('');
                                  setCustomPeriodFilter('AM');
                                  setCustomFilterActive(false);
                                }}
                                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-black uppercase px-2 py-1 rounded-md"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="absolute inset-0 bg-[#020617] z-10">
                <div ref={mapRef} className="w-full h-full" />
              </div>

              {/* My Location Button - Bottom Left */}
              <div className="absolute bottom-6 left-6 z-[1000] flex items-end gap-3">
                <button
                  onClick={handleMyLocation}
                  title="My location"
                  className="p-4 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-slate-700 text-indigo-400 hover:text-indigo-300 hover:bg-slate-800/90 transition-all shadow-2xl"
                >
                  <MapPin size={24} />
                </button>

                {/* Find Restaurants Button */}
                <div className="flex flex-col items-start gap-2">
                  {restaurantSearchMode && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (mapInstance.current) {
                            const center = mapInstance.current.getCenter();
                            searchNearbyRestaurants(center.lat, center.lng, 'restaurant');
                          }
                        }}
                        disabled={searchingRestaurants}
                        className="px-2.5 py-2 rounded-xl border border-slate-700 bg-slate-900/90 backdrop-blur-md text-[7px] font-black uppercase text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50 shadow-xl"
                      >
                        {searchingRestaurants ? '⏳' : '🍽️'} Restaurants
                      </button>
                      <button
                        onClick={() => {
                          if (mapInstance.current) {
                            const center = mapInstance.current.getCenter();
                            searchNearbyRestaurants(center.lat, center.lng, 'bar');
                          }
                        }}
                        disabled={searchingRestaurants}
                        className="px-2.5 py-2 rounded-xl border border-slate-700 bg-slate-900/90 backdrop-blur-md text-[7px] font-black uppercase text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50 shadow-xl"
                      >
                        {searchingRestaurants ? '⏳' : '🍸'} Bars
                      </button>
                      <button
                        onClick={() => {
                          if (mapInstance.current) {
                            const center = mapInstance.current.getCenter();
                            searchNearbyRestaurants(center.lat, center.lng, 'cafe');
                          }
                        }}
                        disabled={searchingRestaurants}
                        className="px-2.5 py-2 rounded-xl border border-slate-700 bg-slate-900/90 backdrop-blur-md text-[7px] font-black uppercase text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50 shadow-xl"
                      >
                        {searchingRestaurants ? '⏳' : '☕'} Cafes
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setRestaurantSearchMode(!restaurantSearchMode);
                      clearRestaurantMarkers();
                      setRestaurantSearchQuery('');
                      setMapSearch('');
                    }}
                    className={`px-3 py-2.5 rounded-2xl border text-[8px] font-black uppercase flex items-center gap-2 shadow-2xl whitespace-nowrap transition-colors backdrop-blur-md ${
                      restaurantSearchMode
                        ? 'bg-orange-900/60 border-orange-600 text-orange-300'
                        : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:bg-slate-800/90'
                    }`}
                  >
                    🍽️ {restaurantSearchMode ? 'Restaurant Mode' : 'Find Restaurants'}
                  </button>
                </div>
              </div>
            </div>

            {/* Route Planning Section - Below Map */}
            <div className="mt-6">
              {/* Route Planning Button */}
              <button
                onClick={() => {
                  const newMode = !mapRoutePlanMode;
                  setMapRoutePlanMode(newMode);
                  mapRoutePlanModeRef.current = newMode;
                  if (mapRoutePlanMode) {
                    setMapRouteStops([]);
                    setCalculatedRoute(null);
                    if (routePolylineRef.current && mapInstance.current) {
                      mapInstance.current.removeLayer(routePolylineRef.current);
                      routePolylineRef.current = null;
                    }
                  }
                }}
                title="Plan route"
                className={`w-full px-6 py-4 rounded-2xl border text-white font-black text-sm uppercase tracking-widest transition-all shadow-lg ${
                  mapRoutePlanMode 
                    ? 'bg-emerald-600 border-emerald-500 hover:bg-emerald-500' 
                    : 'bg-slate-900/90 border-slate-700 hover:bg-slate-800/90'
                }`}
              >
                {mapRoutePlanMode ? '✓ Route Planning Active' : '🗺️ Plan Route'}
              </button>

              {/* Route Planning Panel */}
              {mapRoutePlanMode && (
                <div className="mt-6 w-full bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-3xl p-5 shadow-2xl">
                  <div className="text-[10px] font-black uppercase text-emerald-400 tracking-widest mb-4">
                    Route Planning: {mapRouteStops.length} Stop{mapRouteStops.length !== 1 ? 's' : ''}
                  </div>

                  {/* Starting Point and Round Trip buttons */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button
                      onClick={() => setShowStartPointModal(true)}
                      className="bg-slate-700 hover:bg-slate-600 text-white font-black text-[10px] uppercase tracking-widest py-2.5 px-3 rounded-xl transition-all duration-200 shadow-refined hover:shadow-refined-lg"
                    >
                      {customStartPoint ? '📍 Custom' : 'Start Point'}
                    </button>
                    <button
                      onClick={() => setIsRoundTrip(!isRoundTrip)}
                      className={`font-black text-[10px] uppercase tracking-widest py-2.5 px-3 rounded-xl transition-all duration-200 shadow-refined hover:shadow-refined-lg ${
                        isRoundTrip 
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                          : 'bg-slate-700 hover:bg-slate-600 text-white'
                      }`}
                    >
                      {isRoundTrip ? '✓ Round' : 'Round Trip'}
                    </button>
                  </div>

                  {customStartPoint && (
                    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-[10px] mb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-emerald-400 font-bold uppercase tracking-widest mb-1">Custom Start:</div>
                          <div className="text-slate-300">{customStartPoint.address}</div>
                        </div>
                        <button
                          onClick={() => setCustomStartPoint(null)}
                          className="text-slate-400 hover:text-red-400 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Optimize Route button */}
                  {mapRouteStops.length >= 2 && (
                    <button
                      onClick={async () => {
                        setRouteLoading(true);
                        try {
                          let waypoints = mapRouteStops.map(stop => ({
                            lat: stop.lat,
                            lng: stop.lng,
                            name: stop.name,
                          }));

                          let origin = customStartPoint ? { lat: customStartPoint.lat, lng: customStartPoint.lng } : null;
                          
                          if (!origin && typeof navigator !== 'undefined' && navigator.geolocation) {
                            try {
                              const pos = await new Promise((resolve, reject) => {
                                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 });
                              });
                              origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                            } catch (e) {
                              if (waypoints.length > 0) origin = { lat: waypoints[0].lat, lng: waypoints[0].lng };
                            }
                          }

                          if (isRoundTrip && origin) {
                            waypoints = [...waypoints, { lat: origin.lat, lng: origin.lng, name: 'Return to Start' }];
                          }

                          const res = await fetch('/api/route', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ origin, waypoints, optimize: true }),
                          });

                          const route = await res.json();
                          if (res.ok) {
                            setCalculatedRoute(route);

                            if (route.waypoint_order && Array.isArray(route.waypoint_order)) {
                              const numToReorder = isRoundTrip ? mapRouteStops.length : mapRouteStops.length;
                              const optimizedOrder = route.waypoint_order
                                .slice(0, numToReorder)
                                .map(index => mapRouteStops[index]);
                              setMapRouteStops(optimizedOrder);
                            }

                            if (mapInstance.current && route.polyline) {
                              if (routePolylineRef.current) {
                                mapInstance.current.removeLayer(routePolylineRef.current);
                              }
                              const L = window.L;
                              const polyline = L.polyline(route.polyline, {
                                color: '#10b981',
                                weight: 4,
                                opacity: 0.8,
                              }).addTo(mapInstance.current);
                              routePolylineRef.current = polyline;
                              mapInstance.current.fitBounds(polyline.getBounds(), { padding: [50, 50] });
                            }
                          }
                        } catch (err) {
                          setError(err?.message || 'Failed to optimize route');
                        } finally {
                          setRouteLoading(false);
                        }
                      }}
                      disabled={routeLoading}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black text-[10px] uppercase tracking-widest py-2.5 px-3 rounded-xl shadow-refined hover:shadow-refined-lg transition-all duration-200 mb-3"
                    >
                      {routeLoading ? 'Optimizing...' : '⚡ Optimize Route'}
                    </button>
                  )}

                  {/* Calculate Route button */}
                  {mapRouteStops.length >= 2 && (
                    <button
                      onClick={async () => {
                        setRouteLoading(true);
                        try {
                          let waypoints = mapRouteStops.map(stop => ({
                            lat: stop.lat,
                            lng: stop.lng,
                            name: stop.name,
                          }));

                          let origin = customStartPoint ? { lat: customStartPoint.lat, lng: customStartPoint.lng } : null;
                          
                          if (!origin && typeof navigator !== 'undefined' && navigator.geolocation) {
                            try {
                              const pos = await new Promise((resolve, reject) => {
                                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 });
                              });
                              origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                            } catch (e) {
                              if (waypoints.length > 0) origin = { lat: waypoints[0].lat, lng: waypoints[0].lng };
                            }
                          }

                          if (isRoundTrip && origin) {
                            waypoints = [...waypoints, { lat: origin.lat, lng: origin.lng, name: 'Return to Start' }];
                          }

                          const res = await fetch('/api/route', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ origin, waypoints }),
                          });

                          const route = await res.json();
                          if (res.ok) {
                            setCalculatedRoute(route);

                            if (mapInstance.current && route.polyline) {
                              if (routePolylineRef.current) {
                                mapInstance.current.removeLayer(routePolylineRef.current);
                              }
                              const L = window.L;
                              const polyline = L.polyline(route.polyline, {
                                color: '#10b981',
                                weight: 4,
                                opacity: 0.8,
                              }).addTo(mapInstance.current);
                              routePolylineRef.current = polyline;
                              mapInstance.current.fitBounds(polyline.getBounds(), { padding: [50, 50] });
                            }
                          }
                        } catch (err) {
                          setError(err?.message || 'Failed to calculate route');
                        } finally {
                          setRouteLoading(false);
                        }
                      }}
                      disabled={routeLoading}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black text-[11px] uppercase tracking-widest py-3 px-4 rounded-xl shadow-refined hover:shadow-refined-lg transition-all duration-200 mb-3"
                    >
                      {routeLoading ? 'Calculating...' : '🧭 Calculate Route'}
                    </button>
                  )}

                  {/* Route info */}
                  {calculatedRoute && (
                    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 mb-3">
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <div className="text-slate-400 font-bold uppercase tracking-wider">Distance</div>
                          <div className="text-white font-black">{(calculatedRoute.distance / 1609.34).toFixed(1)} mi</div>
                        </div>
                        <div>
                          <div className="text-slate-400 font-bold uppercase tracking-wider">Time</div>
                          <div className="text-white font-black">{Math.round(calculatedRoute.duration / 60)} min</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Draggable Route Stops List */}
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Route Stops (Drag to Reorder)</div>
                  <div className="space-y-2 max-h-96 overflow-y-auto custom-scroll">
                    {mapRouteStops.map((stop, index) => (
                      <div
                        key={`${stop.id}-${index}`}
                        draggable
                        onDragStart={() => setDraggedIndex(index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (draggedIndex !== null && draggedIndex !== index) {
                            const newStops = [...mapRouteStops];
                            const draggedStop = newStops[draggedIndex];
                            newStops.splice(draggedIndex, 1);
                            newStops.splice(index, 0, draggedStop);
                            setMapRouteStops(newStops);
                            setDraggedIndex(null);
                          }
                        }}
                        className="bg-slate-800/70 border border-slate-700 rounded-xl p-3 cursor-move hover:border-emerald-500 transition-all"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-black text-white truncate">{stop.name}</div>
                            <div className="text-[9px] font-bold text-slate-400 truncate">{stop.address}</div>
                          </div>
                          <button
                            onClick={() => setMapRouteStops(stops => stops.filter((_, i) => i !== index))}
                            className="flex-shrink-0 text-slate-400 hover:text-red-400 transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                    {mapRouteStops.length === 0 && (
                      <div className="text-[11px] text-slate-500 text-center py-4">
                        Click pins on the map to add stops
                      </div>
                    )}
                  </div>

                  {/* Action Buttons - Save & Open in Maps */}
                  {mapRouteStops.length >= 2 && (
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={async () => {
                          try {
                            const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            const cities = new Set();
                            
                            for (const stop of mapRouteStops) {
                              if (stop.address) {
                                const parts = stop.address.split(',');
                                if (parts.length >= 2) {
                                  const city = parts[1].trim();
                                  if (city) cities.add(city);
                                }
                              }
                            }
                            
                            const routeData = {
                              stops: mapRouteStops.map(s => ({
                                id: s.id,
                                name: s.name,
                                address: s.address,
                                lat: s.lat,
                                lng: s.lng
                              })),
                              customStartPoint,
                              isRoundTrip,
                              polyline: calculatedRoute?.polyline || null,
                              calculatedRoute: calculatedRoute ? {
                                distance: calculatedRoute.distance,
                                duration: calculatedRoute.duration
                              } : null
                            };
                            
                            let routeName;
                            if (cities.size === 0) {
                              routeName = `Route - ${today}`;
                            } else if (cities.size === 1) {
                              routeName = `${[...cities][0]} Route`;
                            } else if (cities.size === 2) {
                              routeName = `${[...cities].join(' & ')} Route`;
                            } else {
                              routeName = `${[...cities].slice(0, 2).join(' & ')} + ${cities.size - 2} More`;
                            }
                            
                            const response = await fetch('/api/saved-routes', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                name: routeName,
                                routeData,
                              }),
                              credentials: 'include'
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
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest py-2 px-3 rounded-xl shadow-refined hover:shadow-refined-lg transition-all duration-200 hover:scale-[1.02]"
                      >
                        💾 Save Route
                      </button>
                      <button
                        onClick={async () => {
                          // Open the window synchronously before any await so iOS Safari won't block it
                          const win = window.open('', '_blank');

                          const waypointCoords = [];
                          
                          // Add custom start point as first waypoint if set
                          if (customStartPoint && customStartPoint.lat && customStartPoint.lng) {
                            waypointCoords.push(`${customStartPoint.lat},${customStartPoint.lng}`);
                          } else if (typeof navigator !== 'undefined' && navigator.geolocation) {
                            // Get current location as start point
                            try {
                              const pos = await new Promise((resolve, reject) => {
                                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 });
                              });
                              waypointCoords.push(`${pos.coords.latitude},${pos.coords.longitude}`);
                            } catch (e) {
                              // If geolocation fails, don't add a start point
                            }
                          }
                          
                          // Add map route stops
                          mapRouteStops.forEach(stop => {
                            if (stop.lat && stop.lng) {
                              waypointCoords.push(`${stop.lat},${stop.lng}`);
                            }
                          });
                          
                          // Add starting point as final destination if round trip
                          if (isRoundTrip) {
                            if (customStartPoint && customStartPoint.lat && customStartPoint.lng) {
                              waypointCoords.push(`${customStartPoint.lat},${customStartPoint.lng}`);
                            } else if (waypointCoords.length > 0) {
                              // Round trip back to first waypoint
                              waypointCoords.push(waypointCoords[0]);
                            }
                          }
                          
                          if (waypointCoords.length > 0) {
                            win.location.href = `https://www.google.com/maps/dir/${waypointCoords.join('/')}`;
                          } else if (win) {
                            win.close();
                          }
                        }}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest py-2 px-3 rounded-xl shadow-refined hover:shadow-refined-lg transition-all duration-200 hover:scale-[1.02]"
                      >
                        🗺️ Open in Maps
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            </>
          ) : viewMode === "metrics" ? (
            <div className="space-y-6">
              {/* Metrics Section */}
              <PersonalMetrics 
                data={metricsData}
                calculatedMetrics={calculatedMetrics}
                savedAccounts={savedAccounts}
                refreshSavedAccounts={refreshSavedAccounts}
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
                      
                      // Load saved AI response if available
                      if (parsed?.aiResponse) {
                        skipAiLookupRef.current = true;
                        setAiResponse(parsed.aiResponse);
                        setAiLoading(false);
                      } else {
                        skipAiLookupRef.current = false;
                        setAiResponse("");
                      }
                      
                      // Load notes list
                      setNotesList(Array.isArray(parsed.notes) ? parsed.notes : []);
                      setFollowupsList(Array.isArray(parsed.followups) ? parsed.followups : []);
                      setNotesOwner({ id: account.id, key: parsed.key || null });
                      
                      setSelectedEstablishment({
                        info: {
                          id: account.id,
                          location_name: account.name,
                          location_address: account.address,
                          taxpayer_number: keyParts[0] || undefined,
                          location_number: keyParts[1] || undefined,
                          lat: account.lat,
                          lng: account.lng,
                          notes: account.notes, // Include notes for hours/website caching
                        },
                        history: Array.isArray(parsed?.history) ? parsed.history : [],
                      });
                    } catch (e) {
                      console.error('Failed to load account:', e);
                    }
                  }
                }}
              />

              {/* Saved Routes Section */}
              <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-700/50 shadow-refined-lg">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">Saved Routes</h2>
                  <button
                    onClick={fetchSavedRoutes}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-refined hover:shadow-refined-lg hover:scale-105"
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
                  <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scroll pr-2">
                    {savedRoutes.map((route) => {
                      const routeData = typeof route.route_data === 'string' ? JSON.parse(route.route_data) : route.route_data;
                      const mapId = `route-map-${route.id}`;
                      return (
                        <div key={route.id} className="relative bg-slate-900/50 border border-slate-700/50 rounded-2xl overflow-hidden shadow-refined-lg hover:border-slate-600/50 transition-all duration-300">
                          {/* Background Map */}
                          <div 
                            id={mapId}
                            className="absolute inset-0"
                            style={{ zIndex: 0 }}
                          />
                          
                          {/* Content */}
                          <div className="relative p-5 bg-gradient-to-r from-slate-900/90 via-slate-900/50 to-slate-900/90" style={{ zIndex: 2 }}>
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h3 className="text-white font-bold text-sm mb-1">{route.name}</h3>
                                <p className="text-slate-400 text-[10px] uppercase tracking-widest">
                                  {new Date(route.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    // Load route into map edit mode
                                    const routeAccountIds = (routeData.stops || routeData.accounts || []).map(a => a.id);
                                    mapRoutePlanModeRef.current = true;
                                    setSelectedIds(routeAccountIds);
                                    setViewMode('map');
                                  }}
                                  className="text-indigo-400 hover:text-indigo-300 text-sm font-bold transition-colors"
                                  title="Edit route on map"
                                >
                                  ✎
                                </button>
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
                            </div>
                            {(routeData.calculatedRoute || routeData.distance) && (
                              <div className="flex items-center gap-4 mb-3">
                                <div className="text-emerald-400 font-bold text-sm">
                                  {((routeData.calculatedRoute?.distance || routeData.distance) / 1609.34).toFixed(1)} mi
                                </div>
                                <div className="text-slate-500">•</div>
                                <div className="text-emerald-400 font-bold text-sm">
                                  {Math.round((routeData.calculatedRoute?.duration || routeData.duration) / 60)} min
                                </div>
                              </div>
                            )}
                            <div className="mb-3">
                              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Stops ({(routeData.stops || routeData.accounts || []).length})</div>
                              <div className="space-y-1">
                                {(routeData.stops || routeData.accounts || []).map((account, idx) => (
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
                              onClick={async () => {
                                // Open the window synchronously (must happen before any await,
                                // otherwise iOS Safari's popup blocker will suppress it)
                                const win = window.open('', '_blank');

                                const waypointCoords = [];
                                
                                // Add custom start point if available
                                if (routeData.customStartPoint && routeData.customStartPoint.lat && routeData.customStartPoint.lng) {
                                  waypointCoords.push(`${routeData.customStartPoint.lat},${routeData.customStartPoint.lng}`);
                                } else if (typeof navigator !== 'undefined' && navigator.geolocation) {
                                  // Get current location as start point
                                  try {
                                    const pos = await new Promise((resolve, reject) => {
                                      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 });
                                    });
                                    waypointCoords.push(`${pos.coords.latitude},${pos.coords.longitude}`);
                                  } catch (e) {
                                    // If geolocation fails, don't add a start point
                                  }
                                }
                                
                                // Add route stops
                                (routeData.stops || routeData.accounts || []).forEach(a => {
                                  waypointCoords.push(`${a.lat},${a.lng}`);
                                });
                                
                                // Add round trip back to start if needed
                                if (routeData.isRoundTrip && waypointCoords.length > 0) {
                                  waypointCoords.push(waypointCoords[0]);
                                }
                                
                                if (waypointCoords.length > 0) {
                                  win.location.href = `https://www.google.com/maps/dir/${waypointCoords.join('/')}`;
                                } else if (win) {
                                  win.close();
                                }
                              }}
                              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest py-2 px-3 rounded-xl transition-all shadow-refined hover:shadow-refined-lg hover:scale-[1.02]"
                            >
                              Open in Google Maps
                            </button>
                          </div>
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

                    {/* Website */}
                    {businessWebsite && (
                      <div className="mt-4">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                          Website
                        </div>
                        <a
                          href={businessWebsite}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium underline break-all"
                        >
                          {businessWebsite.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                      </div>
                    )}

                    {/* POS System */}
                    {(() => {
                      const POS_LOGOS = {
                        "Toast":          "https://www.toasttab.com/favicon.ico",
                        "Square":         "https://squareup.com/favicon.ico",
                        "Clover":         "https://www.clover.com/favicon.ico",
                        "Lightspeed":     "https://www.lightspeedhq.com/favicon.ico",
                        "Olo":            "https://www.olo.com/favicon.ico",
                        "SpotOn":         "https://www.spoton.com/favicon.ico",
                        "Aloha / NCR":    "https://www.ncr.com/favicon.ico",
                        "TouchBistro":    "https://www.touchbistro.com/favicon.ico",
                        "BentoBox":       "https://www.getbento.com/favicon.ico",
                        "Revel":          "https://revelsystems.com/favicon.ico",
                        "HungerRush":     "https://www.hungerrush.com/favicon.ico",
                        "Lavu":           "https://poslavu.com/favicon.ico",
                        "Owner.com":      "https://www.owner.com/favicon.ico",
                        "PopMenu":        "https://popmenu.com/favicon.ico",
                        "Flipdish":       "https://www.flipdish.com/favicon.ico",
                        "Deliverect":     "https://www.deliverect.com/favicon.ico",
                        "ChowNow":        "https://www.chownow.com/favicon.ico",
                        "Menufy":         "https://www.menufy.com/favicon.ico",
                        "Slice":          "https://www.slicelife.com/favicon.ico",
                        "Allset":         "https://www.allsetnow.com/favicon.ico",
                        "Zuppler":        "https://www.zuppler.com/favicon.ico",
                      };
                      const logoUrl = posSystem?.pos ? POS_LOGOS[posSystem.pos] : null;
                      return (
                        <div className="mt-4">
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                            POS System
                          </div>
                          {posLoading ? (
                            <span className="text-[11px] text-slate-500 font-medium italic">Detecting...</span>
                          ) : posSystem ? (
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                                posSystem.pos === 'Unknown'
                                  ? 'bg-slate-700/50 text-slate-400 border border-slate-600'
                                  : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              }`}>
                                {logoUrl && (
                                  <img
                                    src={logoUrl}
                                    alt=""
                                    width={14}
                                    height={14}
                                    className="rounded-sm object-contain"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                )}
                                {posSystem.pos}
                              </span>
                              {posSystem.source && posSystem.pos !== 'Unknown' && (
                                <span className="text-[9px] text-slate-500 font-medium">via {posSystem.source}</span>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}

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
                    <div className="flex flex-col gap-2">
                      <SaveButton
                        onClick={toggleSaveAccount}
                        isSaved={isSaved(selectedEstablishment.info)}
                        disabled={aiLoading && !isSaved(selectedEstablishment.info)}
                      />
                      {viewMode === "nro" && (
                        <button
                          onClick={() => {
                            // Always set to NRO tier when using NRO button
                            setSelectedGpvTier('nro');
                            // Use setTimeout to ensure state is updated before saving
                            setTimeout(() => toggleSaveAccount(), 50);
                          }}
                          disabled={aiLoading && !isSaved(selectedEstablishment.info)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500 rounded-lg text-white text-[9px] font-black uppercase tracking-widest text-center transition-all"
                        >
                          NRO
                        </button>
                      )}
                    </div>

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
                  customFoodPct={customFoodPct}
                  onCustomFoodPctChange={(e) => setCustomFoodPct(e.target.value)}
                />

                <div className="bg-[#1E293B] p-8 rounded-[2.5rem] border border-slate-700">
                  <h3 className="text-[10px] font-black uppercase italic tracking-widest text-white mb-6">
                    Historical Volume
                  </h3>

                  {(() => {
                    const history = selectedEstablishment.history || [];
                    const hasBreakdown = history.some(h => h.liquor > 0 || h.beer > 0 || h.wine > 0);
                    const hasAnyData = history.some(h => h.total > 0);

                    if (history.length === 0 || !hasAnyData) {
                      return (
                        <div ref={historicalChartRef} className="h-[260px] min-h-[260px] w-full min-w-0 mt-2 flex items-center justify-center text-slate-600 text-[11px] font-black uppercase tracking-widest">
                          No Sales Data Available
                        </div>
                      );
                    }

                    return (
                      <div ref={historicalChartRef} className="h-[260px] min-h-[260px] w-full min-w-0 mt-2">
                        {historicalChartWidth > 0 && (
                          <BarChart
                            width={historicalChartWidth}
                            height={260}
                            data={history}
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
                            {hasBreakdown ? (
                              <>
                                <Bar dataKey="liquor" stackId="a" fill="#6366f1" stroke="#6366f1" fillOpacity={1} />
                                <Bar dataKey="beer" stackId="a" fill="#10b981" stroke="#10b981" fillOpacity={1} />
                                <Bar dataKey="wine" stackId="a" fill="#ec4899" stroke="#ec4899" fillOpacity={1} />
                              </>
                            ) : (
                              <Bar dataKey="total" fill="#06b6d4" stroke="#06b6d4" fillOpacity={1} radius={[4, 4, 0, 0]} />
                            )}
                          </BarChart>
                        )}
                      </div>
                    );
                  })()}
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
                selectedReferral={selectedReferral}
                onToggleReferral={toggleReferral}
                selectedHotLead={selectedHotLead}
                onToggleHotLead={toggleHotLead}
                wonGpv={wonGpv}
                setWonGpv={setWonGpv}
                wonArr={wonArr}
                setWonArr={setWonArr}
                wonDateSigned={wonDateSigned}
                setWonDateSigned={setWonDateSigned}
                isEditingWonValues={isEditingWonValues}
                setIsEditingWonValues={setIsEditingWonValues}
                onSaveWonValues={saveWonValues}
              />

              {/* Notes (for saved accounts and selected NRO accounts) */}
              {(selectedEstablishment?.info?.id || selectedEstablishment?.info?.location_name) && (
                <ActivityLog
                  key={`${selectedEstablishment?.info?.id || ''}-${selectedEstablishment?.info?.taxpayer_number || ''}-${selectedEstablishment?.info?.location_number || ''}`}
                  notesList={notesList}
                  followupsList={followupsList}
                  onAddNote={handleAddNote}
                  onAddFollowup={handleAddFollowup}
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
              {viewMode === "top" && topViewMode === "map" ? (
                <>
                  <MapPin size={40} className="text-indigo-600 opacity-20 mb-6" />
                  <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">Select a Pin</h2>
                  <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-2 max-w-[320px]">
                    Click any pin on the map to view account details.
                  </p>
                </>
              ) : (
                <>
                  <Navigation size={40} className="text-indigo-600 opacity-20 mb-6" />
                  <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">System Idle</h2>
                  <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-2 max-w-[320px]">
                    Search for a Texas establishment to begin intelligence gathering.
                  </p>
                </>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Fixed Bottom Navigation Dock */}
      <nav className="fixed bottom-0 left-0 right-0 z-[9999] pb-safe pointer-events-none">
        <div className="max-w-3xl mx-auto px-4 pb-4">
          <div className="flex gap-2 bg-[#1E293B]/95 backdrop-blur-lg p-2 rounded-3xl border border-slate-700 shadow-2xl pointer-events-auto">
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
                setViewMode("nro");
                setSavedSubView("list");
                setSelectedEstablishment(null);
                setAiResponse("");
              }}
              className={`flex-1 flex flex-col items-center justify-center py-3 px-2 rounded-2xl text-[9px] font-black transition-all uppercase tracking-widest ${viewMode === "nro" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              <Sparkles size={18} className="mb-1" />
              <span>NRO</span>
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

      {/* Starting Point Modal */}
      {showStartPointModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4">
          <div className="bg-[#0F172A] border border-slate-700 rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-black uppercase text-emerald-400 tracking-widest">
                Set Starting Point
              </h3>
              <button
                onClick={() => {
                  setShowStartPointModal(false);
                  setStartPointAddress("");
                }}
                className="text-slate-400 hover:text-white text-lg transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">
                  Enter Address
                </label>
                <input
                  type="text"
                  value={startPointAddress}
                  onChange={(e) => setStartPointAddress(e.target.value)}
                  placeholder="123 Main St, Austin, TX"
                  className="w-full bg-[#071126] border border-slate-700 px-4 py-3 rounded-xl text-[12px] font-bold placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none transition-colors"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && startPointAddress.trim()) {
                      handleSetCustomStartPoint();
                    }
                  }}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      if (typeof navigator === 'undefined' || !navigator.geolocation) {
                        setError('Geolocation not available');
                        return;
                      }
                      
                      navigator.geolocation.getCurrentPosition(
                        async (position) => {
                          const lat = position.coords.latitude;
                          const lng = position.coords.longitude;
                          
                          // Reverse geocode to get address
                          try {
                            const response = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
                            if (response.ok) {
                              const data = await response.json();
                              setCustomStartPoint({
                                lat,
                                lng,
                                address: data.address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                              });
                              setShowStartPointModal(false);
                              setStartPointAddress("");
                            } else {
                              // Fallback to coordinates
                              setCustomStartPoint({
                                lat,
                                lng,
                                address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                              });
                              setShowStartPointModal(false);
                              setStartPointAddress("");
                            }
                          } catch (err) {
                            setCustomStartPoint({
                              lat,
                              lng,
                              address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                            });
                            setShowStartPointModal(false);
                            setStartPointAddress("");
                          }
                        },
                        (err) => {
                          setError('Could not get your location. Please allow location access.');
                        },
                        { enableHighAccuracy: true, timeout: 5000 }
                      );
                    } catch (err) {
                      setError('Failed to get current location');
                    }
                  }}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[11px] uppercase tracking-widest py-3 px-4 rounded-xl transition-all duration-200"
                >
                  📍 Use Current Location
                </button>
              </div>

              <button
                onClick={handleSetCustomStartPoint}
                disabled={!startPointAddress.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-[11px] uppercase tracking-widest py-3 px-4 rounded-xl transition-all duration-200"
              >
                Set Starting Point
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
