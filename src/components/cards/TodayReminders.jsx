import { useMemo, useState } from "react";
import { Bell, MapPin, ChevronRight, Clock, ChevronLeft } from "lucide-react";

function formatNoteDate(note) {
  // Prefer the stored local date string, fall back to created_at shifted to CST
  const dateStr =
    note.created_local_date ||
    (note.created_at
      ? new Date(new Date(note.created_at).getTime() - 6 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10)
      : null);
  if (!dateStr) return null;
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return null;
  }
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_ABBREVS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Returns true if the note text references the given day index (0=Sun...6=Sat)
function noteMatchesDay(text, dayIndex) {
  const lower = (text || "").toLowerCase();
  const name = DAY_NAMES[dayIndex];
  const abbrev = DAY_ABBREVS[dayIndex];

  // Check full name (word boundary — use a simple approach that catches common patterns)
  const nameRegex = new RegExp(`\\b${name}`, "i");
  if (nameRegex.test(lower)) return true;

  // Check abbreviation only when followed by a non-letter (to avoid "monday" partially matching "mon")
  const abbrevRegex = new RegExp(`\\b${abbrev}(?:[^a-z]|$)`, "i");
  if (abbrevRegex.test(lower)) return true;

  // Handle "weekday" / "weekdays" for Mon-Fri
  if (dayIndex >= 1 && dayIndex <= 5) {
    if (/\bweekday(s)?\b/i.test(lower)) return true;
  }

  // Handle "weekend" / "weekends" for Sat-Sun
  if (dayIndex === 0 || dayIndex === 6) {
    if (/\bweekend(s)?\b/i.test(lower)) return true;
  }

  return false;
}

export default function TodayReminders({ savedAccounts, onAccountClick }) {
  const [showTomorrow, setShowTomorrow] = useState(false);

  const todayIndex = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const tomorrowIndex = (todayIndex + 1) % 7;

  const activeIndex = showTomorrow ? tomorrowIndex : todayIndex;
  const activeLabel = DAY_LABELS[activeIndex];

  const matches = useMemo(() => {
    if (!Array.isArray(savedAccounts) || savedAccounts.length === 0) return [];

    const result = [];

    savedAccounts.forEach((account) => {
      let parsed = {};
      try {
        parsed =
          account.notes && typeof account.notes === "object"
            ? account.notes
            : JSON.parse(account.notes || "{}");
      } catch {
        return;
      }

      const allNotes = [...(Array.isArray(parsed.notes) ? parsed.notes : [])];
      const matchingNotes = allNotes.filter((note) =>
        noteMatchesDay(note.text || "", activeIndex)
      );

      if (matchingNotes.length > 0) {
        result.push({
          id: account.id,
          name: account.name,
          address: account.address,
          matchingNotes,
        });
      }
    });

    // Sort alphabetically by account name
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [savedAccounts, activeIndex]);

  return (
    <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-700/50 shadow-refined-lg">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${showTomorrow ? "bg-indigo-500/20" : "bg-amber-500/20"}`}>
          <Bell size={18} className={showTomorrow ? "text-indigo-400" : "text-amber-400"} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black text-white uppercase italic tracking-tighter leading-none">
            {showTomorrow ? "Tomorrow's Reminders" : "Today's Reminders"}
          </h2>
          <p className="text-slate-400 text-[11px] uppercase tracking-widest mt-0.5">
            {activeLabel} &mdash; accounts with notes mentioning {showTomorrow ? "tomorrow" : "today"}
          </p>
        </div>
        {/* Toggle button */}
        <button
          onClick={() => setShowTomorrow((v) => !v)}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
            showTomorrow
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
              : "bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20"
          }`}
        >
          {showTomorrow ? (
            <><ChevronLeft size={12} /> Today</>
          ) : (
            <>Tomorrow <ChevronRight size={12} /></>
          )}
        </button>
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <Bell size={28} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No notes mention {activeLabel}.</p>
          <p className="text-[11px] mt-1 text-slate-600">
            Add notes like &ldquo;owner in on {activeLabel.toLowerCase()} mornings&rdquo; to see reminders here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((account) => (
            <div
              key={account.id}
              onClick={() => onAccountClick && onAccountClick(account.id)}
              className={`bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4 transition-all duration-200 ${
                onAccountClick
                  ? "cursor-pointer hover:border-amber-500/50 hover:bg-slate-800/60 group"
                  : ""
              }`}
            >
              {/* Account name + address */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={12} className="text-amber-400 shrink-0" />
                    <span className="text-white font-bold text-sm truncate">{account.name}</span>
                  </div>
                  {account.address && (
                    <p className="text-slate-500 text-[10px] mt-0.5 pl-[18px] truncate">
                      {account.address}
                    </p>
                  )}
                </div>
                {onAccountClick && (
                  <ChevronRight
                    size={16}
                    className="text-slate-600 group-hover:text-amber-400 shrink-0 transition-colors mt-0.5"
                  />
                )}
              </div>

              {/* Matching notes */}
              <div className="space-y-1.5 pl-[18px]">
                {account.matchingNotes.map((note, i) => {
                  const noteDate = formatNoteDate(note);
                  return (
                    <div
                      key={note.id ?? i}
                      className="flex items-start gap-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-slate-300 text-[12px] leading-snug">{note.text}</p>
                        {noteDate && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Clock size={10} className="text-slate-600 shrink-0" />
                            <span className="text-slate-600 text-[10px]">{noteDate}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <p className="text-[10px] text-slate-600 text-center pt-1">
            {matches.length} account{matches.length !== 1 ? "s" : ""} with {activeLabel} reminders
          </p>
        </div>
      )}
    </div>
  );
}
