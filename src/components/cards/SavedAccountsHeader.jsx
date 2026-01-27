import { Bookmark } from "lucide-react";
import FilterInput from "../inputs/FilterInput";

export default function SavedAccountsHeader({ searchTerm, onSearchChange, onAdd }) {
  return (
    <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-700 shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 font-black uppercase italic text-xs tracking-widest text-indigo-400">
          <Bookmark size={16} /> Portfolio
        </div>
        <div>
          <button
            onClick={onAdd}
            className="bg-indigo-600/10 border border-indigo-500/20 px-3 py-2 rounded-xl text-indigo-400 hover:bg-indigo-600 hover:text-white text-[10px] font-black uppercase tracking-widest"
          >
            Add Account
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
