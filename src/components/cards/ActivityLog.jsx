import { MessageSquare, Plus } from "lucide-react";

const ACTIVITY_TYPES = [
  { value: "walk-in", label: "Walk-In", color: "#3b82f6" },
  { value: "call", label: "Call", color: "#10b981" },
  { value: "text", label: "Text", color: "#8b5cf6" },
  { value: "email", label: "Email", color: "#f59e0b" },
  { value: "update", label: "Update", color: "#64748b" },
];

export default function ActivityLog({
  notesList,
  currentNote,
  setCurrentNote,
  onAddNote,
  onDeleteNote,
  notesExpanded,
  setNotesExpanded,
  activityType,
  setActivityType
}) {
  return (
    <div className="bg-[#1E293B] p-8 rounded-[2.5rem] border border-slate-700 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 font-black uppercase text-[11px] tracking-widest text-white">
          <MessageSquare size={18} className="text-indigo-400" /> Activity Log
        </div>
      </div>

      <div className="mb-3">
        <select
          value={activityType}
          onChange={(e) => setActivityType(e.target.value)}
          className="w-full bg-[#0F172A] border border-slate-700 rounded-2xl px-4 py-3 text-[11px] font-black text-slate-200 uppercase outline-none cursor-pointer"
        >
          {ACTIVITY_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
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
              {(notesExpanded ? notesList : notesList.slice(0, 5)).map((n) => {
                const activityTypeInfo = ACTIVITY_TYPES.find(t => t.value === n.activity_type) || ACTIVITY_TYPES[4];
                return (
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
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="px-2 py-1 rounded-lg text-[9px] font-black uppercase"
                        style={{ backgroundColor: activityTypeInfo.color + '20', color: activityTypeInfo.color }}
                      >
                        {activityTypeInfo.label}
                      </div>
                      <div className="text-slate-400 text-[10px] font-bold uppercase">
                        {new Date(n.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-slate-200 font-bold text-[11px]">{n.text}</div>
                  </div>
                );
              })}
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
  );
}
