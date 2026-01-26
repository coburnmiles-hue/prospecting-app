import { Bookmark } from "lucide-react";
import FilterInput from "../inputs/FilterInput";

export default function SavedAccountsHeader({ searchTerm, onSearchChange }) {
  return (
    <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-700 shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 font-black uppercase italic text-xs tracking-widest text-indigo-400">
          <Bookmark size={16} /> Portfolio
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
