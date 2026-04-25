"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { MapPin, RefreshCw, Plus, X, CheckCircle, AlertTriangle, Loader2, Clock, ChevronDown } from "lucide-react";

const LICENSE_TYPE_LABELS = {
  BE: "Beer/Wine – Eating Place",
  BG: "Beer/Wine – Retailer",
  MB: "Mixed Beverage",
  N: "Non-Profit",
  NB: "Non-Profit Beer",
  NE: "Non-Profit Eating",
  BW: "Beer/Wine",
};

function shouldAutoSearch(lastSearchedAt) {
  if (!lastSearchedAt) return true;
  const last = new Date(lastSearchedAt);
  const now = new Date();
  // Build today's 7am
  const todaySeven = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0, 0, 0);
  // If last search was before today's 7am, and now is after 7am → auto-search
  return now >= todaySeven && last < todaySeven;
}

function formatDate(iso) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Unknown";
  }
}

export default function TerritoryPanel({ savedAccounts, onAccountClick, onUnacknowledgedChange }) {
  const [zipCodes, setZipCodes] = useState([]);
  const [newZip, setNewZip] = useState("");
  const [zipsOpen, setZipsOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [acknowledgedIds, setAcknowledgedIds] = useState([]);
  const [lastSearchedAt, setLastSearchedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");

  // Load territory config on mount
  const loadTerritory = useCallback(async () => {
    try {
      const res = await fetch("/api/territory", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setZipCodes(Array.isArray(data.zip_codes) ? data.zip_codes : []);
      setResults(Array.isArray(data.results) ? data.results : []);
      setAcknowledgedIds(Array.isArray(data.acknowledged_ids) ? data.acknowledged_ids : []);
      setLastSearchedAt(data.last_searched_at || null);

      // Auto-search if needed (7am daily trigger)
      if (
        Array.isArray(data.zip_codes) &&
        data.zip_codes.length > 0 &&
        shouldAutoSearch(data.last_searched_at)
      ) {
        await runSearch();
      }
    } catch (err) {
      console.error("Failed to load territory:", err);
    } finally {
      setInitialLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadTerritory();
  }, [loadTerritory]);

  const runSearch = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/territory", { method: "PUT", credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Search failed");
        return;
      }
      setResults(Array.isArray(data.results) ? data.results : []);
      setAcknowledgedIds(Array.isArray(data.acknowledged_ids) ? data.acknowledged_ids : []);
      setLastSearchedAt(data.last_searched_at || null);
    } catch (err) {
      setError("Failed to run search");
    } finally {
      setLoading(false);
    }
  };

  const saveZipCodes = async (updated) => {
    setSaving(true);
    try {
      const res = await fetch("/api/territory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ zip_codes: updated }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch (err) {
      console.error("Failed to save zip codes:", err);
    } finally {
      setSaving(false);
    }
  };

  const addZip = () => {
    const z = newZip.trim().replace(/\D/g, "").slice(0, 5);
    if (!z || z.length < 5) return;
    if (zipCodes.includes(z)) { setNewZip(""); return; }
    const updated = [...zipCodes, z];
    setZipCodes(updated);
    setNewZip("");
    saveZipCodes(updated);
  };

  const removeZip = (zip) => {
    const updated = zipCodes.filter((z) => z !== zip);
    setZipCodes(updated);
    saveZipCodes(updated);
  };

  const acknowledge = async (accountId) => {
    try {
      const res = await fetch("/api/territory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: accountId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setAcknowledgedIds(Array.isArray(data.acknowledged_ids) ? data.acknowledged_ids : []);
    } catch (err) {
      console.error("Failed to acknowledge:", err);
    }
  };

  // Check if a result is already in savedAccounts
  const isSavedAccount = (result) => {
    if (!Array.isArray(savedAccounts)) return false;
    return savedAccounts.some((a) => {
      const aName = (a.name || "").toLowerCase().trim();
      const rName = (result.name || "").toLowerCase().trim();
      const aAddr = (a.address || "").toLowerCase().trim();
      const rAddr = (result.address || "").toLowerCase().trim();
      return aName === rName || (rAddr && aAddr && aAddr.includes(rAddr.split(",")[0]));
    });
  };

  const unacknowledgedResults = useMemo(
    () => results.filter((r) => !acknowledgedIds.includes(r.id)),
    [results, acknowledgedIds]
  );
  const acknowledgedResults = useMemo(
    () => results.filter((r) => acknowledgedIds.includes(r.id)),
    [results, acknowledgedIds]
  );

  // Notify parent when unacknowledged count changes
  useEffect(() => {
    if (onUnacknowledgedChange) onUnacknowledgedChange(unacknowledgedResults.length);
  }, [unacknowledgedResults.length, onUnacknowledgedChange]);

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Zip Code Manager */}
      <div className="bg-[#1E293B] p-5 rounded-3xl border border-slate-700/50">
        {/* Header row — always visible, click to toggle */}
        <button
          type="button"
          onClick={() => setZipsOpen((o) => !o)}
          className="w-full flex items-center justify-between mb-0 group"
        >
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-400">
              My Territory Zip Codes
              {zipCodes.length > 0 && (
                <span className="ml-2 text-slate-500 normal-case font-bold text-[10px]">
                  ({zipCodes.length})
                </span>
              )}
            </h3>
            {!zipsOpen && (
              <p className="text-slate-500 text-[10px] mt-0.5">
                Searches run automatically every morning at 7 AM
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-[10px] text-slate-500 italic">Saving…</span>}
            <ChevronDown
              size={14}
              className={`text-slate-500 transition-transform duration-200 ${zipsOpen ? "rotate-180" : ""}`}
            />
          </div>
        </button>

        {/* Collapsible body */}
        {zipsOpen && (
          <div className="mt-4 space-y-3">
            <p className="text-slate-500 text-[10px]">
              Searches run automatically every morning at 7 AM
            </p>

            {/* Zip input */}
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={newZip}
                onChange={(e) => setNewZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                onKeyDown={(e) => e.key === "Enter" && addZip()}
                placeholder="Add zip code (e.g. 78701)"
                className="flex-1 bg-[#0F172A] border border-slate-700 px-4 py-2.5 rounded-xl text-[12px] font-bold text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none transition-colors"
              />
              <button
                onClick={addZip}
                disabled={newZip.length !== 5}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl transition-all"
              >
                <Plus size={16} />
              </button>
            </div>

            {/* Zip tags */}
            {zipCodes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {zipCodes.map((zip) => (
                  <div
                    key={zip}
                    className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl"
                  >
                    <span className="text-[11px] font-black text-slate-200">{zip}</span>
                    <button
                      onClick={() => removeZip(zip)}
                      className="text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-600 text-[11px] italic">No zip codes added yet.</p>
            )}
          </div>
        )}
      </div>

      {/* Search Controls */}
      {zipCodes.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-500 text-[10px]">
            <Clock size={12} />
            <span>Last search: {formatDate(lastSearchedAt)}</span>
          </div>
          <button
            onClick={runSearch}
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            {loading ? "Searching…" : "Refresh Now"}
          </button>
        </div>
      )}

      {error && (
        <div className="text-[11px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3">
          {error}
        </div>
      )}

      {/* Results */}
      {zipCodes.length === 0 && (
        <div className="text-center py-10 text-slate-500">
          <MapPin size={28} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Add zip codes above to start monitoring your territory.</p>
        </div>
      )}

      {zipCodes.length > 0 && results.length === 0 && !loading && (
        <div className="text-center py-10 text-slate-500">
          <p className="text-sm">No new permits found in the last 30 days.</p>
          <p className="text-[10px] mt-1 text-slate-600">Click Refresh Now to run a fresh search.</p>
        </div>
      )}

      {/* Unacknowledged (NEW) */}
      {unacknowledgedResults.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} className="text-amber-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
              New — {unacknowledgedResults.length} unreviewed
            </span>
          </div>
          {unacknowledgedResults.map((result) => {
            const saved = isSavedAccount(result);
            return (
              <ResultCard
                key={result.id}
                result={result}
                saved={saved}
                acknowledged={false}
                onAcknowledge={() => acknowledge(result.id)}
                onViewAccount={onAccountClick ? () => onAccountClick(result) : null}
              />
            );
          })}
        </div>
      )}

      {/* Acknowledged */}
      {acknowledgedResults.length > 0 && (
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Reviewed — {acknowledgedResults.length}
          </span>
          {acknowledgedResults.map((result) => {
            const saved = isSavedAccount(result);
            return (
              <ResultCard
                key={result.id}
                result={result}
                saved={saved}
                acknowledged={true}
                onAcknowledge={null}
                onViewAccount={onAccountClick ? () => onAccountClick(result) : null}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResultCard({ result, saved, acknowledged, onAcknowledge, onViewAccount }) {
  const borderColor = saved ? "border-emerald-500/40" : acknowledged ? "border-slate-700/50" : "border-amber-500/40";
  const bgColor = saved ? "bg-emerald-900/10" : acknowledged ? "bg-slate-900/40" : "bg-amber-900/10";
  const badge = saved
    ? { label: "Saved", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" }
    : acknowledged
    ? { label: "Reviewed", color: "bg-slate-700/50 text-slate-500 border-slate-600/30" }
    : { label: "New", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" };

  const issueDate = result.issue_date
    ? new Date(result.issue_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div
      onClick={onViewAccount || undefined}
      className={`rounded-2xl border p-4 transition-all duration-200 ${borderColor} ${bgColor} ${
        onViewAccount ? "cursor-pointer hover:border-indigo-500/60 hover:scale-[1.01] hover:shadow-md" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-bold text-sm truncate">{result.name}</span>
            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border ${badge.color}`}>
              {badge.label}
            </span>
          </div>
          {result.address && (
            <p className="text-slate-400 text-[10px] mt-0.5 truncate">
              {result.address}{result.city ? `, ${result.city}` : ""}{result.zip ? ` ${result.zip}` : ""}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {result.license_type && (
              <span className="text-[10px] text-indigo-400 font-bold">
                {LICENSE_TYPE_LABELS[result.license_type] || result.license_type}
              </span>
            )}
            {issueDate && (
              <span className="text-[10px] text-slate-500">
                Issued {issueDate}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 shrink-0">
          {!acknowledged && onAcknowledge && (
            <button
              onClick={(e) => { e.stopPropagation(); onAcknowledge(); }}
              className="flex items-center gap-1 bg-slate-800 hover:bg-emerald-800/50 border border-slate-700 hover:border-emerald-600/50 text-slate-300 hover:text-emerald-300 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              <CheckCircle size={11} />
              Seen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
