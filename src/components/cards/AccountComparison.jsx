"use client";
import { useState, useMemo } from "react";
import { parseSavedNotes, formatCurrency } from "../../utils/formatters";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { X } from "lucide-react";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"];

export default function AccountComparison({ savedAccounts, onClose }) {
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return savedAccounts || [];
    const s = search.toUpperCase();
    return (savedAccounts || []).filter((a) =>
      (a.name || "").toUpperCase().includes(s) ||
      (a.address || "").toUpperCase().includes(s)
    );
  }, [savedAccounts, search]);

  const toggle = (account) => {
    setSelected((prev) => {
      if (prev.find((a) => a.id === account.id))
        return prev.filter((a) => a.id !== account.id);
      if (prev.length >= 5) return prev;
      return [...prev, account];
    });
  };

  const chartData = useMemo(() => {
    if (selected.length === 0) return [];

    // Convert "Apr 24" → "2024-04" for chronological sorting
    const MONTH_IDX = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
    const toSortKey = (label) => {
      const [mon, yr] = (label || '').split(' ');
      const m = MONTH_IDX[mon];
      const y = parseInt(yr, 10);
      if (m === undefined || isNaN(y)) return label;
      return `${y + 2000}-${String(m + 1).padStart(2, '0')}`;
    };

    const monthMap = new Map(); // sortKey → display label
    const accountHistory = selected.map((a) => {
      try {
        const p = parseSavedNotes(a.notes);
        const hist = Array.isArray(p?.history) ? p.history : [];
        hist.forEach((h) => {
          if (h.month) monthMap.set(toSortKey(h.month), h.month);
        });
        return { id: a.id, name: a.name, hist };
      } catch {
        return { id: a.id, name: a.name, hist: [] };
      }
    });

    return [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, month]) => {
        const row = { month };
        accountHistory.forEach((ah) => {
          const entry = ah.hist.find((h) => h.month === month);
          row[ah.name] = entry ? Math.round(entry.total) : 0;
        });
        return row;
      });
  }, [selected]);

  return (
    <div className="bg-[#0F172A] rounded-3xl border border-slate-700 p-4 sm:p-6 space-y-4 w-full overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-black uppercase tracking-widest text-white">
            Account Comparison
          </div>
          <div className="text-[9px] text-slate-500 mt-0.5">
            Overlay monthly sales history for up to 5 accounts
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Selector — full width on mobile, 2/5 on lg */}
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Search accounts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
        />
        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
          {selected.length} / 5 selected
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto custom-scroll">
          {filtered.map((a) => {
            const idx = selected.findIndex((s) => s.id === a.id);
            const isSelected = idx >= 0;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(a)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all text-[10px] ${
                  isSelected
                    ? "border-indigo-500/50 bg-indigo-900/20 text-white"
                    : "border-slate-700/50 bg-slate-800/30 text-slate-400 hover:text-white hover:border-slate-500"
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 border-2"
                  style={
                    isSelected
                      ? { backgroundColor: COLORS[idx], borderColor: COLORS[idx] }
                      : { borderColor: "#475569" }
                  }
                />
                <span className="truncate font-bold max-w-[120px]">{a.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart — always full width */}
      <div className="w-full" style={{ minWidth: 0 }}>
        {selected.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-slate-600 text-[11px] font-bold uppercase tracking-widest text-center leading-6">
            Select accounts<br />to compare
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-slate-600 text-[11px] font-bold uppercase tracking-widest">
            No stored sales data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 5, right: 8, left: -8, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="month"
                tick={{ fill: "#64748b", fontSize: 8 }}
                interval="preserveStartEnd"
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                tick={{ fill: "#64748b", fontSize: 8 }}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  background: "#1E293B",
                  border: "1px solid #475569",
                  borderRadius: 8,
                  fontSize: 10,
                }}
                formatter={(v) => [formatCurrency(v), ""]}
              />
              <Legend wrapperStyle={{ fontSize: 8, color: "#94a3b8" }} />
              {selected.map((a, i) => (
                <Line
                  key={a.id}
                  type="monotone"
                  dataKey={a.name}
                  stroke={COLORS[i]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
