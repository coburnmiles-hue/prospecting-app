import { Search, MapPin } from "lucide-react";
import SearchInput from "../inputs/SearchInput";
import PrimaryButton from "../buttons/PrimaryButton";

export default function SearchForm({ 
  onSubmit, 
  searchTerm, 
  onSearchChange, 
  cityFilter, 
  onCityChange, 
  loading, 
  error,
  viewMode,
  searchMode,
  onSearchModeChange,
}) {
  const isSearchMode = viewMode === "search";
  
  return (
    <section className="bg-[#1E293B] p-6 rounded-3xl border border-slate-700 shadow-lg">
      <form onSubmit={onSubmit} className="space-y-4">
        {isSearchMode && (
          <div className="flex gap-1 glass-toggle rounded-xl p-1">
            <button
              type="button"
              onClick={() => onSearchModeChange?.("name")}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${
                searchMode === "name"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              By Name
            </button>
            <button
              type="button"
              onClick={() => onSearchModeChange?.("address")}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${
                searchMode === "address"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              By Address
            </button>
          </div>
        )}

        <div className="space-y-3">
          <SearchInput
            icon={Search}
            id="business-search"
            name="searchTerm"
            placeholder={
              !isSearchMode
                ? "City or Zip Code..."
                : searchMode === "address"
                ? "Street address..."
                : "Business name..."
            }
            value={searchTerm}
            onChange={onSearchChange}
          />

          {isSearchMode && (
            <SearchInput
              icon={MapPin}
              id="city-filter"
              name="cityFilter"
              placeholder="City Filter (Optional)..."
              value={cityFilter}
              onChange={onCityChange}
            />
          )}
        </div>

        <PrimaryButton type="submit" loading={loading}>
          {viewMode === "top" ? "Rank Accounts" : "Search Records"}
        </PrimaryButton>

        {!!error && (
          <div className="text-[11px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3">
            {error}
          </div>
        )}
      </form>
    </section>
  );
}
