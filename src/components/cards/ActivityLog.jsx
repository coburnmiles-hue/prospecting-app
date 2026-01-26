import { MessageSquare, Plus } from "lucide-react";

export default function ActivityLog({
  notesList,
  currentNote,
  setCurrentNote,
  onAddNote,
  onDeleteNote,
  notesExpanded,
  setNotesExpanded,
  gpvTiers,
  selectedGpvTier,
  onApplyGpvTier,
  selectedActiveOpp,
  onToggleActiveOpp
}) {
  return (
    <div className="bg-[#1E293B] p-8 rounded-[2.5rem] border border-slate-700 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 font-black uppercase text-[11px] tracking-widest text-white">
          <MessageSquare size={18} className="text-indigo-400" /> Activity Log
        </div>
      </div>

      <div className="mt-6">
        <h4 className="text-[10px] font-black uppercase italic tracking-widest text-indigo-400 mb-3">
          GPV Tier
        </h4>
        <div className="flex items-center justify-between mb-6">
          <div className="flex flex-wrap gap-3">
            {gpvTiers.map((t) => (
              <button
                key={t.id}
                onClick={() => onApplyGpvTier(t.id)}
                className={`px-3 py-2 rounded-xl font-black text-[11px] uppercase transition-all focus:outline-none border ${
                  selectedGpvTier === t.id ? "opacity-100 scale-100" : "opacity-70"
                }`}
                style={{
                  background: selectedGpvTier === t.id ? t.color : "transparent",
                  color: selectedGpvTier === t.id ? "#fff" : t.color,
                  borderColor: t.color
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="ml-4">
            <button
              onClick={onToggleActiveOpp}
              className={`px-3 py-2 rounded-xl font-black text-[11px] uppercase transition-all focus:outline-none border ${
                selectedActiveOpp ? "bg-emerald-500 text-white" : "opacity-70"
              }`}
              style={{ borderColor: selectedActiveOpp ? "#10b981" : "#334155" }}
            >
              Active Opp
            </button>
          </div>
        </div>

        <div className="relative mb-6">
          <textarea
            placeholder="Enter follow-up details..."
            className="w-full bg-[#0F172A] border border-slate-700 rounded-3xl p-6 text-[11px] font-bold text-slate-200 outline-none min-h-[110px] resize-none"
            value={currentNote}
            onChange={(e) => setCurrentNote(e.target.value)}
          />
          <button
            onClick={onAddNote}
            className="absolute bottom-4 right-4 bg-indigo-600 text-white p-3 rounded-2xl shadow-xl transition-transform active:scale-95"
            title="Add note"
          >
            <Plus size={20} />
          </button>
        </div>

        <div className="mt-4">
          {notesList.length > 0 ? (
            <div>
              <div
                className="space-y-3 overflow-y-auto pr-2 custom-scroll"
                style={{ maxHeight: notesExpanded ? undefined : "10rem" }}
              >
                {(notesExpanded ? notesList : notesList.slice(0, 5)).map((n) => (
                  <div
                    key={n.id}
                    className="bg-[#0F172A] p-4 rounded-2xl border border-slate-800 relative"
                  >
                    <button
                      onClick={() => onDeleteNote(n.id)}
                      title="Delete note"
                      className="absolute right-3 top-3 text-slate-400 hover:text-rose-400"
                    >
                      ×
                    </button>
                    <div className="text-slate-400 text-[10px] font-bold mb-2 uppercase">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                    <div className="text-slate-200 font-bold text-[11px]">{n.text}</div>
                  </div>
                ))}
              </div>
              {notesList.length > 5 && (
                <div className="mt-3">
                  <button
                    onClick={() => setNotesExpanded((s) => !s)}
                    className="text-[11px] font-black uppercase text-indigo-400"
                  >
                    {notesExpanded ? "Collapse notes" : `Show past notes`}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">
              No notes yet for this account.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
