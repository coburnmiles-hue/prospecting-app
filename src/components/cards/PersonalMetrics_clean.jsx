import { MessageSquare, Plus, X } from "lucide-react";
import { useState } from "react";

const ACTIVITY_TYPES = [
  { value: "walk-in", label: "Walk-In", color: "#3b82f6" },
  { value: "call", label: "Call", color: "#10b981" },
  { value: "text", label: "Text", color: "#8b5cf6" },
  { value: "email", label: "Email", color: "#f59e0b" },
  { value: "update", label: "Update", color: "#64748b" },
  { value: "bdr-note", label: "BDR Note", color: "#ec4899" },
];

export default function ActivityLog({
  notesList,
  followupsList,
  onAddNote,
  onAddFollowup,
  onDeleteNote,
  notesExpanded,
  setNotesExpanded,
  activityType,
  setActivityType
}) {
  const [noteDraft, setNoteDraft] = useState("");
  const [followUpDateTime, setFollowUpDateTime] = useState("");
  const [followUpPurpose, setFollowUpPurpose] = useState("");

  const handleAddActivity = async () => {
    const ok = await onAddNote(noteDraft);
    if (ok) {
      setNoteDraft("");
    }
  };

  const handleAddFollowUp = async () => {
    const trimmedPurpose = (followUpPurpose || "").trim();
    if (!trimmedPurpose || !followUpDateTime) return;

    const ok = await onAddFollowup(followUpDateTime, trimmedPurpose);
    if (ok) {
      setFollowUpDateTime("");
      setFollowUpPurpose("");
    }
  };

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
          placeholder="Enter activity details..."
          className="w-full bg-[#0F172A] border border-slate-700 rounded-3xl p-6 text-base font-bold text-slate-200 outline-none min-h-[110px] resize-none"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
        />
        {noteDraft && (
          <button
            onClick={() => setNoteDraft('')}
            className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors"
            type="button"
            title="Clear"
          >
            <X size={16} />
          </button>
        )}
        <button
          onClick={handleAddActivity}
          className="absolute bottom-4 right-4 bg-indigo-600 text-white p-3 rounded-2xl shadow-xl transition-transform active:scale-95"
          title="Add note"
          type="button"
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
                      type="button"
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

      <div className="mt-8 pt-6 border-t border-slate-700">
        <div className="flex items-center gap-3 font-black uppercase text-[11px] tracking-widest text-white mb-4">
          <MessageSquare size={16} className="text-amber-400" /> Followup
        </div>

        <div className="mb-3">
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
            Follow-up Date & Time
          </label>
          <input
            type="datetime-local"
            value={followUpDateTime}
            onChange={(e) => setFollowUpDateTime(e.target.value)}
            className="w-full bg-[#0F172A] border border-slate-700 rounded-2xl px-4 py-3 text-[11px] font-bold text-slate-200 outline-none"
          />
        </div>

        <div className="relative">
          <textarea
            value={followUpPurpose}
            onChange={(e) => setFollowUpPurpose(e.target.value)}
            placeholder="What is this follow-up for?"
            className="w-full bg-[#0F172A] border border-slate-700 rounded-2xl p-4 pr-16 text-[11px] font-bold text-slate-200 outline-none min-h-[88px] resize-none"
          />
          <button
            onClick={handleAddFollowUp}
            className="absolute bottom-3 right-3 bg-amber-600 text-white p-2 rounded-xl shadow-xl transition-transform active:scale-95"
            title="Add follow-up"
            type="button"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="mt-4">
          {Array.isArray(followupsList) && followupsList.length > 0 ? (
            <div className="space-y-3 max-h-40 overflow-y-auto pr-2 custom-scroll">
              {followupsList.slice(0, 20).map((f) => (
                <div
                  key={f.id}
                  className="bg-[#0F172A] p-4 rounded-2xl border border-slate-800"
                >
                  <div className="text-amber-300 text-[10px] font-black uppercase tracking-wide mb-1">
                    Follow-up: {f.follow_up_at ? new Date(f.follow_up_at).toLocaleString() : 'Not set'}
                  </div>
                  <div className="text-slate-200 font-bold text-[11px]">{f.follow_up_note || f.text}</div>
                  {f.completed && (
                    <div className="mt-1 text-[10px] font-black uppercase text-emerald-300">Completed</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">
              No follow-ups logged yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
