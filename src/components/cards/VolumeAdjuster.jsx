import { useState, useEffect } from "react";
import { Utensils, Percent, Lock, Unlock } from "lucide-react";
import { formatCurrency } from "../../utils/formatters";

export default function VolumeAdjuster({ venueTypes, venueType, onVenueChange, stats, isLocked, onToggleLock, isSaved, customFoodPct, onCustomFoodPctChange, learnedInfo }) {
  const [learnedUnlocked, setLearnedUnlocked] = useState(false);

  // Reset to learned-locked mode whenever the account changes
  useEffect(() => {
    setLearnedUnlocked(false);
  }, [learnedInfo]);

  const isLearnedMode = !!learnedInfo && !learnedUnlocked;

  const handleLearnedUnlock = () => {
    if (window.confirm('This will override the learned data split and let you choose a venue template manually. Are you sure?')) {
      setLearnedUnlocked(true);
    }
  };

  return (
    <div className="bg-[#1E293B] p-8 rounded-[2.5rem] border border-slate-700 flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 font-black uppercase italic text-xs tracking-widest text-indigo-400">
          <Utensils size={16} /> Volume Adjuster
        </div>
        <div className="px-3 py-1 bg-slate-800 rounded-full border border-slate-700 text-[8px] font-black uppercase text-emerald-400 flex items-center gap-2 tracking-tighter">
          <Percent size={10} /> {isLearnedMode
            ? Math.round(learnedInfo.learnedFoodPct * 100) + '% Food / ' + Math.round((1 - learnedInfo.learnedFoodPct) * 100) + '% Alcohol'
            : venueTypes[venueType].desc
          }
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {isLearnedMode ? (
          <div className="flex-1 bg-[#0F172A] border border-emerald-600/40 rounded-2xl p-4 text-[10px] font-black text-emerald-300 uppercase flex items-center gap-2">
            <span className="text-emerald-400">✦</span>
            <span>Internal Data</span>
          </div>
        ) : isLocked ? (
          <div className="flex-1 bg-[#0F172A] border border-slate-700 rounded-2xl p-4 text-[10px] font-black text-slate-200 uppercase flex items-center justify-between">
            <span>{venueTypes[venueType].label}</span>
          </div>
        ) : (
          <select
            className="flex-1 bg-[#0F172A] border border-slate-700 rounded-2xl p-4 text-[10px] font-black text-slate-200 uppercase outline-none cursor-pointer"
            value={venueType}
            onChange={(e) => {
              if (e.target.value === '__learned__') {
                setLearnedUnlocked(false);
              } else {
                onVenueChange(e);
              }
            }}
          >
            {learnedInfo && (
              <option value="__learned__">✦ Internal Data</option>
            )}
            {Object.entries(venueTypes).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        )}

        {(isLearnedMode || isSaved) && (
          <button
            onClick={isLearnedMode ? handleLearnedUnlock : onToggleLock}
            className={`px-4 rounded-2xl transition-all border ${
              isLearnedMode || isLocked
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-[#0F172A] border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title={isLearnedMode ? 'Unlock to override with a venue template' : isLocked ? 'Unlock to change genre' : 'Lock current genre'}
          >
            {(isLearnedMode || isLocked) ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
        )}
      </div>

      {venueType === 'custom' && (
        <div className="mb-6">
          <label className="block text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">
            Monthly Food Sales ($)
          </label>
          <input
            type="number"
            value={customFoodPct}
            onChange={onCustomFoodPctChange}
            placeholder="Enter monthly food sales amount"
            className="w-full bg-[#0F172A] border border-slate-700 rounded-2xl p-4 text-[12px] font-bold text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none transition-colors"
          />
        </div>
      )}

      <div className="bg-[#0F172A]/50 p-5 rounded-2xl border border-slate-800 mt-auto">
        <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">
          Est. Food Revenue {(stats?.isOverride || stats?.isActualGpv) && '(N/A)'}
        </p>
        <p className="text-xl font-black text-white italic tracking-tighter">
          {(stats?.isOverride || stats?.isActualGpv) ? '—' : formatCurrency(stats?.estFood || 0)}
        </p>
      </div>

      <div className="mt-6 bg-[#0F172A]/50 p-5 rounded-2xl border border-slate-800">
        <p className="text-[9px] font-black text-emerald-300 uppercase tracking-widest mb-1">
          Est. Alcohol Revenue {(stats?.isOverride || stats?.isActualGpv) && '(N/A)'}
        </p>
        <p className="text-xl font-black text-white italic tracking-tighter">
          {(stats?.isOverride || stats?.isActualGpv) ? '—' : formatCurrency(stats?.avgAlc || 0)}
        </p>
      </div>

      {learnedInfo && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-900/20 border border-emerald-600/25">
          <span className="text-emerald-400 text-[10px]">✦</span>
          <div className="flex-1 min-w-0">
            <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400">
              {learnedUnlocked ? 'Available (not applied) · ' : 'Active · '}{learnedInfo.sampleCount} signed {learnedInfo.sampleCount === 1 ? 'account' : 'accounts'}
            </p>
            <p className="text-[9px] font-bold text-emerald-300 mt-0.5">
              {Math.round(learnedInfo.learnedFoodPct * 100)}% food · {Math.round((1 - learnedInfo.learnedFoodPct) * 100)}% alcohol
              {learnedInfo.trustFactor < 1 && (
                <span className="text-slate-500 font-normal"> ({learnedInfo.sampleCount < 5 ? `${learnedInfo.sampleCount} sample${learnedInfo.sampleCount === 1 ? '' : 's'}` : 'confident'})</span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
