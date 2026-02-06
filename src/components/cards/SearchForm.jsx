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
  viewMode 
}) {
  const isSearchMode = viewMode === "search";
  
  return (
    <section className="bg-[#1E293B] p-6 rounded-3xl border border-slate-700 shadow-lg">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-3">
          <SearchInput
            icon={Search}
            id="business-search"
            name="searchTerm"
            placeholder={isSearchMode ? "Business or Address..." : "City or Zip Code..."}
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
