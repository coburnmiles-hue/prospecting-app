import { Utensils, Percent, Lock, Unlock } from "lucide-react";
import { formatCurrency } from "../../utils/formatters";

export default function VolumeAdjuster({ venueTypes, venueType, onVenueChange, stats, isLocked, onToggleLock, isSaved }) {
  return (
    <div className="bg-[#1E293B] p-8 rounded-[2.5rem] border border-slate-700 flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 font-black uppercase italic text-xs tracking-widest text-indigo-400">
          <Utensils size={16} /> Volume Adjuster
        </div>
        <div className="px-3 py-1 bg-slate-800 rounded-full border border-slate-700 text-[8px] font-black uppercase text-emerald-400 flex items-center gap-2 tracking-tighter">
          <Percent size={10} /> {venueTypes[venueType].desc}
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {isLocked ? (
          <div className="flex-1 bg-[#0F172A] border border-slate-700 rounded-2xl p-4 text-[10px] font-black text-slate-200 uppercase flex items-center justify-between">
            <span>{venueTypes[venueType].label}</span>
          </div>
        ) : (
          <select
            className="flex-1 bg-[#0F172A] border border-slate-700 rounded-2xl p-4 text-[10px] font-black text-slate-200 uppercase outline-none cursor-pointer"
            value={venueType}
            onChange={onVenueChange}
          >
            {Object.entries(venueTypes).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        )}
        
        {isSaved && (
          <button
            onClick={onToggleLock}
            className={`px-4 rounded-2xl transition-all border ${
              isLocked 
                ? 'bg-indigo-600 border-indigo-500 text-white' 
                : 'bg-[#0F172A] border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title={isLocked ? "Unlock to change genre" : "Lock current genre"}
          >
            {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
        )}
      </div>

      <div className="bg-[#0F172A]/50 p-5 rounded-2xl border border-slate-800 mt-auto">
        <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">
          Est. Food Revenue
        </p>
        <p className="text-xl font-black text-white italic tracking-tighter">
          {formatCurrency(stats?.estFood || 0)}
        </p>
      </div>

      <div className="mt-6 bg-[#0F172A]/50 p-5 rounded-2xl border border-slate-800">
        <p className="text-[9px] font-black text-emerald-300 uppercase tracking-widest mb-1">
          Est. Alcohol Revenue
        </p>
        <p className="text-xl font-black text-white italic tracking-tighter">
          {formatCurrency(stats?.avgAlc || 0)}
        </p>
      </div>
    </div>
  );
}
