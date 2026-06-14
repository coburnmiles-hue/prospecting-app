import { useState, useCallback } from "react";
import { BASE_URL, DATE_FIELD, TOTAL_FIELD } from "../utils/constants";
import { safeUpper, buildSocrataWhere, normalizeAddressSearch } from "../utils/formatters";

export function useSearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [searchMode, setSearchMode] = useState("name"); // "name" | "address"
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = useCallback(async (e) => {
    e?.preventDefault?.();
    setError("");
    setResults([]);

    const s = safeUpper(searchTerm);
    if (!s) return;

    setLoading(true);
    try {
      const c = safeUpper(cityFilter);

      let where;
      if (searchMode === "address") {
        // Build multiple OR clauses to handle apostrophes, hyphens, periods,
        // and full street type words ("Street" -> "St", "Avenue" -> "Ave", etc.)
        const sNorm = normalizeAddressSearch(s); // e.g. "MAIN STREET" -> "MAIN ST"
        const stripped = s.replace(/['\u2019\-.]/g, ''); // raw stripped for replace() in Socrata
        // Strip apostrophes, hyphens, and periods from the DB field for comparison
        const dbStripped = `replace(replace(replace(upper(location_address), '''', ''), '-', ''), '.', '')`;
        const clauses = [`upper(location_address) like '%${s}%'`];
        if (stripped !== s) clauses.push(`${dbStripped} like '%${stripped}%'`);
        if (sNorm !== s && sNorm !== stripped) clauses.push(`upper(location_address) like '%${sNorm}%'`);
        const addrPart = `(${clauses.join(' OR ')})`;
        where = c ? `${addrPart} AND upper(location_city) = '${c}'` : addrPart;
      } else {
        where = buildSocrataWhere(s, c);
      }

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

      // If no results from name search, retry with broad any-word fallback
      if (unique.length === 0 && searchMode !== 'address') {
        const broadWhere = buildSocrataWhere(s, c, true);
        const broadQuery = `?$where=${encodeURIComponent(broadWhere)}&$order=${encodeURIComponent(
          `${DATE_FIELD} DESC`
        )}&$limit=100`;
        const broadRes = await fetch(`${BASE_URL}${broadQuery}`);
        if (broadRes.ok) {
          const broadData = await broadRes.json();
          for (const item of Array.isArray(broadData) ? broadData : []) {
            const key = `${item.taxpayer_number}-${item.location_number}`;
            if (!seen.has(key)) {
              seen.add(key);
              unique.push(item);
            }
          }
        }
      }

      // Sort by relevance: exact phrase > stripped phrase > all-words > broad
      const norm = (str) => (str || '').toUpperCase().replace(/['\u2019\-&.\s]/g, '');
      const sNorm = norm(s);
      const sWords = sNorm.split(/\s+/).filter(w => w.length > 1);
      unique.sort((a, b) => {
        const score = (item) => {
          const name = (item.location_name || '').toUpperCase();
          const nameN = norm(name);
          if (name.includes(s)) return 0;                              // exact phrase
          if (nameN.includes(sNorm)) return 1;                        // stripped exact phrase
          if (sWords.length > 1 && sWords.every(w => nameN.includes(w))) return 2; // all words
          return 3;                                                    // partial / broad match
        };
        return score(a) - score(b);
      });

      setResults(unique);
    } catch (err) {
      setError(err?.message || "Search failed.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, cityFilter, searchMode]);

  return {
    searchTerm,
    setSearchTerm,
    cityFilter,
    setCityFilter,
    searchMode,
    setSearchMode,
    results,
    setResults,
    loading,
    error,
    setError,
    handleSearch,
  };
}

export function useTopLeaders() {
  const [topCitySearch, setTopCitySearch] = useState("");
  const [topAccounts, setTopAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleTopSearch = useCallback(async (e) => {
    e?.preventDefault?.();
    setError("");
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
        `&$limit=300`;

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
  }, [topCitySearch]);

  return {
    topCitySearch,
    setTopCitySearch,
    topAccounts,
    loading,
    error,
    setError,
    handleTopSearch,
  };
}
