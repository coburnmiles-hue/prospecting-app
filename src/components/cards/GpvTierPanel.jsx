export default function GpvTierPanel({
  gpvTiers,
  selectedGpvTier,
  selectedActiveOpp,
  onToggleActiveOpp
}) {
  return (
    <div className="bg-[#1E293B] p-8 rounded-[2.5rem] border border-slate-700 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 font-black uppercase text-[11px] tracking-widest text-white">
          GPV Tier & Opportunity
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-black uppercase italic tracking-widest text-indigo-400 mb-3">
          GPV Tier (Auto-Selected)
        </h4>
        <div className="flex items-center justify-between mb-6">
          <div className="flex flex-wrap gap-3">
            {gpvTiers.map((t) => (
              <div
                key={t.id}
                className={`px-3 py-2 rounded-xl font-black text-[11px] uppercase transition-all border cursor-default ${
                  selectedGpvTier === t.id ? "opacity-100 scale-100" : "opacity-40"
                }`}
                style={{
                  background: selectedGpvTier === t.id ? t.color : "transparent",
                  color: selectedGpvTier === t.id ? "#fff" : t.color,
                  borderColor: t.color
                }}
              >
                {t.label}
              </div>
            ))}
          </div>

          <div className="ml-4">
            <button
              onClick={onToggleActiveOpp}
              className={`px-3 py-2 rounded-xl font-black text-[11px] uppercase transition-all focus:outline-none border ${
                selectedActiveOpp ? "bg-emerald-500 text-white" : "opacity-70"
              }`}
              style={{ borderColor: selectedActiveOpp ? "#10b981" : "#334155" }}
            >
              Active Opp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
