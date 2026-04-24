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

      // Sort: direct name matches first, then stripped/fuzzy matches
      const norm = (str) => (str || '').toUpperCase().replace(/['’\-\s]/g, '');
      const sNorm = norm(s);
      unique.sort((a, b) => {
        const aDirect = (a.location_name || '').toUpperCase().includes(s) ? 0 : 1;
        const bDirect = (b.location_name || '').toUpperCase().includes(s) ? 0 : 1;
        if (aDirect !== bDirect) return aDirect - bDirect;
        // Secondary: normalized name contains normalized search
        const aNorm = norm(a.location_name || '').includes(sNorm) ? 0 : 1;
        const bNorm = norm(b.location_name || '').includes(sNorm) ? 0 : 1;
        return aNorm - bNorm;
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
