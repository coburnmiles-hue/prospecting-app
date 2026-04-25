"use client";
import { useMemo } from "react";
import { parseSavedNotes } from "../../utils/formatters";

// Recommended visit cadence in days by GPV tier
const CADENCE = { tier6: 7, tier5: 10, tier4: 14, tier3: 21, tier2: 28, tier1: 45 };
const DEFAULT_CADENCE = 30;
const TIER_RANK = { tier6: 60, tier5: 50, tier4: 40, tier3: 30, tier2: 20, tier1: 10 };

function getDaysSinceLast(parsedNotes) {
  const notes = Array.isArray(parsedNotes?.notes) ? parsedNotes.notes : [];
  if (!notes.length) return null;
  const latest = notes.reduce((max, n) => {
    const d = new Date(n.created_at || 0);
    return d > max ? d : max;
  }, new Date(0));
  if (latest.getTime() === 0) return null;
  return Math.floor((Date.now() - latest.getTime()) / 86400000);
}

export default function VisitAlertsPanel({ savedAccounts, onAccountClick }) {
  const ranked = useMemo(() => {
    return (savedAccounts || [])
      .map((a) => {
        try {
          const p = parseSavedNotes(a.notes);
          const tier = p?.gpvTier;
          const cadence = CADENCE[tier] || DEFAULT_CADENCE;
          const daysSince = getDaysSinceLast(p);
          const neverVisited = daysSince === null;
          const overdueDays = neverVisited ? 999 : daysSince - cadence;
          if (overdueDays <= 0 && !neverVisited) return null;
          let score = overdueDays + (TIER_RANK[tier] || 0);
          if (p?.activeOpp) score += 30;
          if (p?.hotLead) score += 20;
          if (p?.activeAccount) score += 15;
          return { ...a, _parsed: p, _cadence: cadence, _daysSince: daysSince, _overdueDays: overdueDays, _score: score };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b._score - a._score);
  }, [savedAccounts]);

  if (ranked.length === 0) {
    return (
      <div className="bg-[#1E293B] rounded-2xl border border-emerald-800/30 p-6 text-center">
        <div className="text-2xl mb-2">✓</div>
        <div className="text-[11px] font-black uppercase tracking-widest text-emerald-400">
          All caught up!
        </div>
        <div className="text-[10px] text-slate-500 mt-1">
          Every account is within its visit cadence.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1E293B] rounded-2xl border border-slate-700 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest text-orange-400">
            ⚠ Going Cold
          </div>
          <div className="text-[9px] text-slate-500 mt-0.5">
            Ranked by urgency · tier cadence: T6=7d, T5=10d, T4=14d, T3=21d
          </div>
        </div>
        <span className="text-[9px] font-black text-orange-300 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full shrink-0">
          {ranked.length} overdue
        </span>
      </div>

      <div className="space-y-2 max-h-[360px] overflow-y-auto custom-scroll">
        {ranked.map((a) => {
          const never = a._daysSince === null;
          const urgencyBg =
            a._overdueDays > 14
              ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
              : a._overdueDays > 7
              ? "text-orange-400 bg-orange-500/10 border-orange-500/20"
              : "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";

          const flags = [
            a._parsed?.activeOpp && "Opp",
            a._parsed?.hotLead && "Hot",
            a._parsed?.activeAccount && "Active",
          ].filter(Boolean);

          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onAccountClick?.(a.id)}
              className="w-full text-left flex items-center gap-3 bg-slate-800/30 border border-slate-700/50 rounded-xl p-3 hover:border-slate-500 transition-all group"
            >
              <div className={`text-[9px] font-black w-11 text-center shrink-0 rounded-lg py-1 border ${urgencyBg}`}>
                {never ? "NEW" : `+${a._overdueDays}d`}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-black text-white truncate group-hover:text-indigo-300 transition-colors">
                  {a.name}
                </div>
                <div className="text-[9px] text-slate-500 truncate">
                  {(a.address || "").split(",")[0]}
                </div>
                {flags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {flags.map((f) => (
                      <span key={f} className="text-[8px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                {a._parsed?.gpvTier && (
                  <div className="text-[9px] font-black text-slate-400 uppercase">
                    {a._parsed.gpvTier.replace("tier", "T")}
                  </div>
                )}
                {!never && (
                  <div className="text-[8px] text-slate-600">{a._daysSince}d ago</div>
                )}
                <div className="text-[8px] text-slate-600">/{a._cadence}d cadence</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
