import { Bookmark, Route } from "lucide-react";
import FilterInput from "../inputs/FilterInput";

export default function SavedAccountsHeader({ searchTerm, onSearchChange, onAdd, onPlanRoute, routePlanMode }) {
  console.debug('Rendering SavedAccountsHeader, onAdd present?', !!onAdd);
  return (
    <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-700 shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 font-black uppercase italic text-xs tracking-widest text-indigo-400">
          <Bookmark size={16} /> Portfolio
        </div>
        <div className="flex gap-2">
          <button
            onClick={onPlanRoute}
            className={`${routePlanMode ? 'bg-emerald-600 text-white' : 'bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-600 hover:text-white'} px-2.5 py-1.5 rounded-xl flex items-center gap-1 text-[9px] font-black uppercase tracking-widest transition-all`}
          >
            <Route size={12} /> {routePlanMode ? 'Exit' : 'Route'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              console.debug('SavedAccountsHeader Add clicked, onAdd?', !!onAdd);
              if (typeof onAdd === 'function') onAdd(e);
            }}
            className="bg-indigo-600/10 border border-indigo-500/20 px-2.5 py-1.5 rounded-xl text-indigo-400 hover:bg-indigo-600 hover:text-white text-[9px] font-black uppercase tracking-widest"
          >
            Add
          </button>
        </div>
      </div>

      <FilterInput
        placeholder="Filter saved..."
        value={searchTerm}
        onChange={onSearchChange}
      />
    </div>
  );
}
