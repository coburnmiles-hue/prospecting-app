"use client";
import { useMemo } from "react";
import { parseSavedNotes, formatCurrency } from "../../utils/formatters";

function computeTrend(history) {
  if (!Array.isArray(history) || history.length < 4) return null;
  const sorted = [...history].sort(
    (a, b) => new Date(a.rawDate || 0) - new Date(b.rawDate || 0)
  );
  const recent = sorted.slice(-2);
  const prior = sorted.slice(-4, -2);
  if (prior.length < 2) return null;
  const recentAvg = recent.reduce((s, h) => s + (h.total || 0), 0) / recent.length;
  const priorAvg = prior.reduce((s, h) => s + (h.total || 0), 0) / prior.length;
  if (priorAvg === 0) return null;
  const pct = Math.round(((recentAvg - priorAvg) / priorAvg) * 100);
  return { pct, recentAvg, priorAvg };
}

function Row({ account, type, onClick }) {
  const { pct, recentAvg, priorAvg } = account._trend;
  const isDown = type === "declining";
  return (
    <button
      type="button"
      onClick={() => onClick?.(account.id)}
      className={`w-full text-left flex items-center gap-3 rounded-xl p-3 border transition-all group ${
        isDown
          ? "bg-rose-950/20 border-rose-800/30 hover:border-rose-600/50"
          : "bg-emerald-950/20 border-emerald-800/30 hover:border-emerald-600/50"
      }`}
    >
      <div
        className={`text-[13px] font-black w-12 text-center shrink-0 ${
          isDown ? "text-rose-400" : "text-emerald-400"
        }`}
      >
        {isDown ? "" : "+"}{pct}%
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`text-[11px] font-black truncate transition-colors ${
            isDown
              ? "text-white group-hover:text-rose-300"
              : "text-white group-hover:text-emerald-300"
          }`}
        >
          {account.name}
        </div>
        <div className="text-[9px] text-slate-500">
          {formatCurrency(recentAvg)}/mo &nbsp;
          {isDown ? "↘" : "↗"} was {formatCurrency(priorAvg)}/mo
        </div>
      </div>
    </button>
  );
}

export default function TrendAlertsPanel({ savedAccounts, onAccountClick }) {
  const { declining, growing } = useMemo(() => {
    const all = (savedAccounts || [])
      .map((a) => {
        try {
          const p = parseSavedNotes(a.notes);
          const trend = computeTrend(p?.history);
          if (!trend) return null;
          return { ...a, _parsed: p, _trend: trend };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return {
      declining: all
        .filter((a) => a._trend.pct <= -15)
        .sort((a, b) => a._trend.pct - b._trend.pct),
      growing: all
        .filter((a) => a._trend.pct >= 15)
        .sort((a, b) => b._trend.pct - a._trend.pct),
    };
  }, [savedAccounts]);

  if (declining.length === 0 && growing.length === 0) {
    return (
      <div className="bg-[#1E293B] rounded-2xl border border-slate-700 p-6 text-center">
        <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">
          No significant trends detected
        </div>
        <div className="text-[10px] text-slate-600 mt-1">
          Accounts need 4+ months of stored sales history.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1E293B] rounded-2xl border border-slate-700 p-5 space-y-4">
      <div className="text-[11px] font-black uppercase tracking-widest text-white">
        Sales Trends
      </div>

      {declining.length > 0 && (
        <div className="space-y-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-rose-400">
            ↘ At Risk — {declining.length} account{declining.length !== 1 ? "s" : ""} down ≥15%
          </div>
          {declining.slice(0, 6).map((a) => (
            <Row key={a.id} account={a} type="declining" onClick={onAccountClick} />
          ))}
        </div>
      )}

      {growing.length > 0 && (
        <div className="space-y-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
            ↗ On the Rise — {growing.length} account{growing.length !== 1 ? "s" : ""} up ≥15%
          </div>
          {growing.slice(0, 6).map((a) => (
            <Row key={a.id} account={a} type="growing" onClick={onAccountClick} />
          ))}
        </div>
      )}
    </div>
  );
}
