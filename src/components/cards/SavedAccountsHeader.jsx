import React from "react";
import { Bookmark, Route } from "lucide-react";
import FilterInput from "../inputs/FilterInput";

export default function SavedAccountsHeader({ searchTerm, onSearchChange, onAdd, onPlanRoute, routePlanMode, isAddOpen }) {
  const active = !!isAddOpen;

  const handleAddClick = (e) => {
    console.debug('SavedAccountsHeader Add clicked, onAdd?', !!onAdd, 'newActive:', !active);
    if (typeof onAdd === 'function') onAdd(e);
  };

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
            onClick={handleAddClick}
            className={`relative overflow-hidden px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all focus:outline-none flex items-center justify-center gap-1 ${active ? 'bg-indigo-800 text-white border-indigo-700 ring-2 ring-indigo-600 scale-105' : 'bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-600 hover:text-white'}`}
          >
            <span className="relative z-10">Add</span>
            {/* subtle illumination background */}
            <span
              aria-hidden
              className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${active ? 'opacity-70 bg-gradient-to-r from-indigo-700/40 via-indigo-600/30 to-indigo-500/20' : 'opacity-0'}`}
            />
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
