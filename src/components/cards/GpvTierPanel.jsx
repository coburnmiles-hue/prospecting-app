export default function GpvTierPanel({
  gpvTiers,
  selectedGpvTier,
  selectedActiveOpp,
  onToggleActiveOpp,
  selectedActiveAccount,
  onToggleActiveAccount,
  selectedClosedLost,
  onToggleClosedLost,
  selectedReferral,
  onToggleReferral,
  selectedHotLead,
  onToggleHotLead,
  selectedStrategic,
  onToggleStrategic,
  wonGpv,
  setWonGpv,
  wonArr,
  setWonArr,
  wonDateSigned,
  setWonDateSigned,
  isEditingWonValues,
  setIsEditingWonValues,
  onSaveWonValues,
}) {
  // Check if there are saved won values to display
  const hasSavedWonValues = wonGpv || wonArr || wonDateSigned;
  
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
        <div className="flex flex-col gap-3 mb-6">
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

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={onToggleReferral}
                className={`flex-1 px-3 py-2 rounded-xl font-black text-[11px] uppercase transition-all focus:outline-none border ${
                  selectedReferral ? "bg-purple-500 text-white" : "opacity-70"
                }`}
                style={{ borderColor: selectedReferral ? "#a855f7" : "#334155" }}
              >
                Referral
              </button>

              <button
                onClick={onToggleHotLead}
                className={`flex-1 px-3 py-2 rounded-xl font-black text-[11px] uppercase transition-all focus:outline-none border ${
                  selectedHotLead ? "bg-orange-500 text-white" : "opacity-70"
                }`}
                style={{ borderColor: selectedHotLead ? "#f97316" : "#334155" }}
              >
                🔥 Hot Lead
              </button>

              <button
                onClick={onToggleStrategic}
                className={`flex-1 px-3 py-2 rounded-xl font-black text-[11px] uppercase transition-all focus:outline-none border ${
                  selectedStrategic ? "bg-sky-500 text-white" : "opacity-70"
                }`}
                style={{ borderColor: selectedStrategic ? "#0ea5e9" : "#334155" }}
              >
                ⚡ Strategic
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onToggleActiveOpp}
                className={`flex-1 px-3 py-2 rounded-xl font-black text-[11px] uppercase transition-all focus:outline-none border ${
                  selectedActiveOpp ? "bg-emerald-500 text-white" : "opacity-70"
                }`}
                style={{ borderColor: selectedActiveOpp ? "#10b981" : "#334155" }}
              >
                Active Opp
              </button>

              <button
                onClick={onToggleClosedLost}
                className={`flex-1 px-3 py-2 rounded-xl font-black text-[11px] uppercase transition-all focus:outline-none border ${
                  selectedClosedLost ? "bg-rose-600 text-white" : "opacity-70"
                }`}
                style={{ borderColor: selectedClosedLost ? "#e11d48" : "#334155" }}
              >
                Closed Lost
              </button>

              <button
                onClick={onToggleActiveAccount}
                className={`flex-1 px-3 py-2 rounded-xl font-black text-[11px] uppercase transition-all focus:outline-none border ${
                  selectedActiveAccount ? "bg-emerald-500 text-white" : "opacity-70"
                }`}
                style={{ borderColor: selectedActiveAccount ? "#10b981" : "#334155" }}
              >
                Active Account
              </button>
            </div>
          </div>
        </div>

        {/* Won Account Values Section - Show when Active Account is true */}
        {selectedActiveAccount && (
          <div className="mt-6 p-6 bg-[#0F172A] rounded-2xl border border-emerald-700/50">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-black uppercase italic tracking-widest text-emerald-400">
                Won Account Values
              </h4>
              
              {/* Edit Button - Show when there are saved values and not in edit mode */}
              {hasSavedWonValues && !isEditingWonValues && (
                <button
                  onClick={() => setIsEditingWonValues(true)}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-black uppercase rounded-xl transition-all"
                >
                  Edit
                </button>
              )}
            </div>
            
            {/* Display Mode - Show saved values when not editing */}
            {hasSavedWonValues && !isEditingWonValues ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#1E293B] rounded-xl p-4 border border-slate-600">
                    <div className="text-[9px] font-bold uppercase text-slate-400 mb-1">GPV</div>
                    <div className="text-2xl font-extrabold text-emerald-300">
                      ${parseFloat(wonGpv || 0).toLocaleString()}
                    </div>
                  </div>
                  
                  <div className="bg-[#1E293B] rounded-xl p-4 border border-slate-600">
                    <div className="text-[9px] font-bold uppercase text-slate-400 mb-1">ARR</div>
                    <div className="text-2xl font-extrabold text-indigo-300">
                      ${parseFloat(wonArr || 0).toLocaleString()}
                    </div>
                  </div>
                </div>
                
                {wonDateSigned && (
                  <div className="bg-[#1E293B] rounded-xl p-4 border border-slate-600">
                    <div className="text-[9px] font-bold uppercase text-slate-400 mb-1">Date Signed</div>
                    <div className="text-lg font-bold text-slate-200">
                      {new Date(wonDateSigned).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Edit Mode - Show input fields when editing or no saved values */
              <>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-2">
                      GPV (Gross Product Value)
                    </label>
                    <input
                      type="number"
                      value={wonGpv || ''}
                      onChange={(e) => setWonGpv(e.target.value)}
                      placeholder="0"
                      className="w-full bg-[#1E293B] border border-slate-600 rounded-xl px-4 py-2 text-white text-sm font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-2">
                      ARR (Annual Recurring Revenue)
                    </label>
                    <input
                      type="number"
                      value={wonArr || ''}
                      onChange={(e) => setWonArr(e.target.value)}
                      placeholder="0"
                      className="w-full bg-[#1E293B] border border-slate-600 rounded-xl px-4 py-2 text-white text-sm font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-2">
                    Date Signed
                  </label>
                  <input
                    type="date"
                    value={wonDateSigned || ''}
                    onChange={(e) => setWonDateSigned(e.target.value)}
                    className="w-full bg-[#1E293B] border border-slate-600 rounded-xl px-4 py-2 text-white text-sm font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={onSaveWonValues}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                  >
                    Save Won Values
                  </button>
                  
                  {/* Show cancel button if we're editing existing values */}
                  {hasSavedWonValues && isEditingWonValues && (
                    <button
                      onClick={() => setIsEditingWonValues(false)}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
