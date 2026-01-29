import React from "react";
import { Loader2 } from "lucide-react";

export default function ManualAddPanel({
  manualQuery,
  setManualQuery,
  manualCityFilter,
  setManualCityFilter,
  manualResults,
  setManualResults,
  manualSelected,
  setManualSelected,
  manualGpvTier,
  setManualGpvTier,
  manualSearching,
  manualSearchTimeout,
  aiLoading,
  fetchAiForInfo,
  pseudoLatLng,
  selectedGpvTier,
  venueType,
  selectedActiveOpp,
  venueTypeLocked,
  setError,
  refreshSavedAccounts,
  setManualAddOpen,
  setSelectedGpvTier,
  setSelectedEstablishment,
  aiResponse,
  selectedActiveAccount,
}) {
  return (
    <div className="mt-4 bg-[#0b1220] p-4 rounded-2xl border border-slate-700">
      <h4 className="text-xs font-black uppercase text-indigo-300 mb-3">Add Account</h4>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <input
          value={manualQuery}
          onChange={(e) => {
            const val = e.target.value;
            setManualQuery(val);
            // Debounced auto-search
            if (manualSearchTimeout.current) clearTimeout(manualSearchTimeout.current);
            if (val.trim().length >= 3) {
              manualSearchTimeout.current = setTimeout(async () => {
                setManualResults([]);
                setError("");
                try {
                  const params = new URLSearchParams({
                    query: val.trim(),
                    ...(manualCityFilter.trim() && { city: manualCityFilter.trim() }),
                  });
                  const url = `/api/places?${params}`;
                  const res = await fetch(url);
                  if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || `Search failed: ${res.status}`);
                  }
                  const data = await res.json();
                  const results = data.results || [];
                  setManualResults(results);
                  if (results.length === 0) {
                    setError("No results found. Try a different search term or city.");
                  }
                } catch (e) {
                  setError(e?.message || "Search failed");
                  setManualResults([]);
                } finally {
                  // nothing
                }
              }, 400);
            } else {
              setManualResults([]);
            }
          }}
          placeholder="Search business name or address..."
          className="col-span-2 bg-[#071126] border border-slate-700 px-3 py-2 rounded-xl text-[12px]"
        />
        <input
          value={manualCityFilter}
          onChange={(e) => setManualCityFilter(e.target.value.toUpperCase())}
          placeholder="Filter by city (optional)"
          className="bg-[#071126] border border-slate-700 px-3 py-2 rounded-xl text-[12px]"
        />
        <button
          onClick={() => {
            setManualQuery("");
            setManualCityFilter("");
            setManualResults([]);
            setManualSelected(null);
            setManualGpvTier(null);
          }}
          className="bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl text-[10px] font-bold uppercase"
        >
          Clear
        </button>
      </div>

      {manualSearching && (
        <div className="text-indigo-400 text-[11px] mb-2 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Searching...
        </div>
      )}

      {manualResults.length > 0 && (
        <div className="max-h-64 overflow-y-auto mb-3 bg-[#020617] border border-slate-800 rounded-xl">
          {manualResults.map((r, i) => (
            <div
              key={i}
              className={`p-3 border-b border-slate-800 last:border-0 cursor-pointer transition-colors ${manualSelected === r ? 'bg-indigo-900/30 border-indigo-700' : 'hover:bg-slate-900'}`}
              onClick={() => {
                setManualSelected(r);
                setManualResults([]);
                setManualQuery("");
              }}
            >
              <div className="font-bold text-sm text-white">{r.name || 'Unnamed'}</div>
              <div className="text-[11px] text-slate-400 mt-1">{r.address || ''}</div>
              {r.types && r.types.length > 0 && (
                <div className="text-[10px] text-slate-500 mt-1">
                  {r.types.slice(0, 3).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 mt-4">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Selected Account</div>
        <input
          value={manualSelected ? (manualSelected.name || '') : ''}
          onChange={(e) => setManualSelected({ ...manualSelected, name: e.target.value })}
          placeholder="Business Name"
          className="w-full bg-[#071126] border border-slate-700 px-3 py-2 rounded-xl text-[12px]"
        />
        <input
          value={manualSelected ? (manualSelected.address || '') : ''}
          onChange={(e) => setManualSelected({ ...manualSelected, address: e.target.value })}
          placeholder="Address"
          className="w-full bg-[#071126] border border-slate-700 px-3 py-2 rounded-xl text-[12px]"
        />

        <div className="mt-2">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">GPV Tier</div>
          <div className="flex gap-2 flex-wrap">
            {/* GPV tier buttons rendered by parent will be passed via manualGpvTier and setManualGpvTier */}
            {/* For simplicity we assume parent provides GPV_TIERS via closure or global import if needed */}
            {/* Parent should render the tier buttons above or pass a renderer; keeping simple here */}
            <div className="text-[11px] text-slate-400">Select a GPV tier below before saving.</div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={async () => {
              const info = manualSelected || {};
              const name = (info.name || '').trim() || 'Manual Account';
              const address = (info.address || '').trim();

              if (aiLoading) {
                setError('Please wait for AI Intelligence to finish loading before saving.');
                return;
              }

              const chosenTier = manualGpvTier || selectedGpvTier;
              if (!chosenTier) {
                setError('Please select a GPV Tier before saving this account.');
                return;
              }

              if (!venueType) {
                setError('Please select an Account Type before saving this account.');
                return;
              }

              let aiText = "";
              try {
                aiText = await fetchAiForInfo({ location_name: name, location_city: manualCityFilter || '', taxpayer_name: name }, { updateState: true });
              } catch (e) {
                console.error('AI fetch for manual save failed', e);
              }

              let lat = info.lat;
              let lng = info.lng;

              if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                const pseudo = pseudoLatLng(name || address || Date.now());
                lat = pseudo.lat;
                lng = pseudo.lng;
              }

              const payload = {
                name,
                address,
                lat,
                lng,
                notes: JSON.stringify({ manual: true, gpvTier: chosenTier, activeOpp: selectedActiveOpp, activeAccount: selectedActiveAccount, venueType: venueType, venueTypeLocked: venueTypeLocked, aiResponse: aiText || aiResponse || "" }),
              };

              try {
                const res = await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!res.ok) throw new Error('Save failed');
                const created = await res.json();
                await refreshSavedAccounts();
                setManualAddOpen(false);
                setManualQuery('');
                setManualResults([]);
                setManualSelected(null);
                setManualGpvTier(null);
                setSelectedGpvTier(chosenTier);
                setSelectedEstablishment({
                  info: {
                    id: created.id,
                    location_name: created.name,
                    location_address: created.address,
                    lat: created.lat,
                    lng: created.lng,
                    notes: created.notes,
                  },
                  history: [],
                });
              } catch (err) {
                setError(err?.message || 'Could not save account.');
              }
            }}
            className="bg-indigo-600 px-3 py-2 rounded-xl text-[12px] font-black uppercase"
          >
            Save Account
          </button>
          <button onClick={() => { setManualAddOpen(false); setManualGpvTier(null); }} className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700">Cancel</button>
        </div>
      </div>
    </div>
  );
}
