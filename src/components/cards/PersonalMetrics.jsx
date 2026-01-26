import { TrendingUp, Users, Target } from "lucide-react";

export default function PersonalMetrics({ data }) {
  if (!data) return null;

  const rows = data.rawRows || [];

  const safe = (r, c) => {
    if (!rows[r]) return "";
    return rows[r][c] || "";
  };

  // Section 1: This Months Prospecting -> cells B2:F3 (rows index 1..2, cols 1..5)
  const prospectingMatrix = [1, 2].map((rIdx) => {
    return [1, 2, 3, 4, 5].map((cIdx) => safe(rIdx, cIdx));
  });

  // Section 2: Walk-Ins Per Opp -> H2:H3 (col 7, rows 1..2)
  const walkInsPerOpp = { label: safe(1, 7), value: safe(2, 7) };

  // Section 3: This Months Won Value -> J2:K3 (cols 9..10, rows 1..2)
  // transpose so each entry is [label, value] per column
  const wonValueMatrix = [9, 10].map((cIdx) => [safe(1, cIdx), safe(2, cIdx)]);

  return (
    <div className="space-y-6">
      {/* Prospecting - full width */}
      <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm md:text-base font-black uppercase text-slate-300 tracking-wide">This Months Prospecting</h3>
          <Target className="text-indigo-300" size={20} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          {prospectingMatrix[0].map((title, i) => {
            const value = prospectingMatrix[1]?.[i] || "-";
            return (
              <div key={`p-col-${i}`} className="bg-white/6 rounded-xl p-4 text-center flex flex-col items-center justify-center gap-1">
                <div className="text-xs md:text-sm font-semibold uppercase text-slate-300 tracking-wide">{(title || "").toString()}</div>
                <div className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white mt-1">{value || "-"}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Secondary metrics - two columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl flex flex-col justify-center items-center">
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp className="text-emerald-300" size={20} />
            <h3 className="text-xs md:text-sm font-black uppercase text-slate-300 tracking-wide">Walk-Ins Per Opp</h3>
          </div>

          <div className="text-4xl md:text-5xl font-extrabold text-white">{walkInsPerOpp.value || "-"}</div>
          <div className="text-sm text-slate-400 mt-2">{walkInsPerOpp.label || ""}</div>
        </div>

        <div className="bg-gradient-to-br from-purple-900 via-slate-900 to-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs md:text-sm font-black uppercase text-slate-300 tracking-wide">This Months Won Value</h3>
            <Users className="text-purple-300" size={20} />
          </div>

          <div className="grid grid-cols-2 gap-6">
            {wonValueMatrix.map((row, rIdx) => (
              <div key={`wonrow-${rIdx}`} className="bg-white/6 rounded-xl p-4">
                <div className="text-xs text-slate-300">{row[0] || "-"}</div>
                <div className="text-2xl md:text-3xl font-extrabold text-white mt-2">{row[1] || "-"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
