"use client";
import { useMemo } from "react";
import { parseSavedNotes, formatCurrency } from "../../utils/formatters";

const STAGES = [
  {
    key: "hotLead",
    label: "🔥 Hot Lead",
    bg: "bg-orange-950/40",
    border: "border-orange-800/40",
    badge: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    text: "text-orange-300",
  },
  {
    key: "activeOpp",
    label: "⚡ Active Opp",
    bg: "bg-emerald-950/40",
    border: "border-emerald-800/40",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    text: "text-emerald-300",
  },
  {
    key: "activeAccount",
    label: "✅ Active Account",
    bg: "bg-indigo-950/40",
    border: "border-indigo-800/40",
    badge: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    text: "text-indigo-300",
  },
  {
    key: "closedLost",
    label: "✗ Closed Lost",
    bg: "bg-rose-950/40",
    border: "border-rose-800/40",
    badge: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    text: "text-rose-300",
  },
];

const TIER_GPV = { tier6: 1000000, tier5: 500000, tier4: 250000, tier3: 100000, tier2: 50000, tier1: 0 };

function getLastActivity(p) {
  const notes = Array.isArray(p?.notes) ? p.notes : [];
  if (!notes.length) return null;
  const latest = notes.reduce((max, n) => {
    const d = new Date(n.created_at || 0);
    return d > max ? d : max;
  }, new Date(0));
  if (latest.getTime() === 0) return null;
  const days = Math.floor((Date.now() - latest.getTime()) / 86400000);
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`;
}

function AccountCard({ account, stage, onClick }) {
  const p = account._parsed;
  const tier = p?.gpvTier;
  const tierGpv = tier != null ? TIER_GPV[tier] : null;
  const notesCount = Array.isArray(p?.notes) ? p.notes.length : 0;
  const lastActivity = getLastActivity(p);

  return (
    <button
      type="button"
      onClick={() => onClick?.(account)}
      className="w-full text-left bg-[#0F172A] border border-slate-700/50 rounded-xl p-3 hover:border-slate-500 hover:bg-slate-800/60 transition-all group"
    >
      <div className="font-black text-[11px] text-white truncate group-hover:text-indigo-300 transition-colors">
        {account.name || "Unknown"}
      </div>
      <div className="text-[9px] text-slate-500 truncate mt-0.5">
        {(account.address || "—").split(",")[0]}
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {tier && (
          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${stage.badge}`}>
            {tier.replace("tier", "T")}
          </span>
        )}
        {tierGpv != null && (
          <span className="text-[9px] font-bold text-slate-400">{formatCurrency(tierGpv)}</span>
        )}
        {lastActivity && (
          <span className="text-[9px] text-slate-500 ml-auto">{lastActivity}</span>
        )}
      </div>
      {notesCount > 0 && (
        <div className="text-[8px] text-slate-600 mt-1">
          {notesCount} note{notesCount !== 1 ? "s" : ""}
        </div>
      )}
    </button>
  );
}

export default function PipelineBoard({ savedAccounts, onAccountClick }) {
  const columns = useMemo(() => {
    const buckets = { hotLead: [], activeOpp: [], activeAccount: [], closedLost: [] };
    (savedAccounts || []).forEach((a) => {
      try {
        const p = parseSavedNotes(a.notes);
        const enriched = { ...a, _parsed: p };
        if (p?.activeAccount) buckets.activeAccount.push(enriched);
        else if (p?.activeOpp) buckets.activeOpp.push(enriched);
        else if (p?.hotLead) buckets.hotLead.push(enriched);
        else if (p?.closedLost) buckets.closedLost.push(enriched);
      } catch {}
    });
    return buckets;
  }, [savedAccounts]);

  const pipelineGpv = useMemo(
    () =>
      [...columns.activeOpp, ...columns.activeAccount].reduce(
        (sum, a) => sum + (TIER_GPV[a._parsed?.gpvTier] || 0),
        0
      ),
    [columns]
  );

  const totalFlagged = STAGES.reduce((s, st) => s + (columns[st.key]?.length ?? 0), 0);
  const untagged = (savedAccounts || []).length - totalFlagged;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="bg-[#1E293B] rounded-2xl border border-slate-700 p-4 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">
            Pipeline Value
          </div>
          <div className="text-2xl font-black text-emerald-400">
            {formatCurrency(pipelineGpv)}
          </div>
          <div className="text-[9px] text-slate-600 mt-0.5">
            Active Opp + Active Account · {untagged} untagged
          </div>
        </div>
        <div className="flex gap-5">
          {STAGES.map((s) => (
            <div key={s.key} className="text-center">
              <div className={`text-xl font-black ${s.text}`}>
                {columns[s.key]?.length ?? 0}
              </div>
              <div className="text-[8px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
                {s.label.split(" ").slice(1).join(" ")}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STAGES.map((stage) => (
          <div
            key={stage.key}
            className={`rounded-2xl border p-3 ${stage.bg} ${stage.border}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`text-[10px] font-black uppercase tracking-widest ${stage.text}`}>
                {stage.label}
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${stage.badge}`}>
                {columns[stage.key]?.length ?? 0}
              </span>
            </div>
            <div className="space-y-2 max-h-[460px] overflow-y-auto custom-scroll pr-0.5">
              {(columns[stage.key] || []).length === 0 ? (
                <div className="text-[9px] text-slate-700 text-center py-8 font-bold uppercase tracking-widest">
                  —
                </div>
              ) : (
                columns[stage.key].map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    stage={stage}
                    onClick={onAccountClick}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
