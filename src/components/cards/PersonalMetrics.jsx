import { TrendingUp, Users, Target, Clock, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";

const ACTIVITY_TYPES = [
  { value: "walk-in", label: "Walk-In", color: "#3b82f6" },
  { value: "call", label: "Call", color: "#10b981" },
  { value: "text", label: "Text", color: "#8b5cf6" },
  { value: "email", label: "Email", color: "#f59e0b" },
  { value: "update", label: "Update", color: "#64748b" },
];

export default function PersonalMetrics({ data, onActivityClick }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activities, setActivities] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Helper to get date in CST
  const getTodayCST = () => {
    const now = new Date();
    const cstOffset = -6 * 60; // CST is UTC-6
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const cstTime = new Date(utc + (cstOffset * 60000));
    return cstTime;
  };

  // Helper to format date as YYYY-MM-DD in CST
  const formatDateCST = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    // Fetch activities for selected date
    const fetchActivities = async () => {
      try {
        const accounts = await fetch('/api/accounts', { cache: 'no-store' }).then(async (r) => {
          if (!r.ok) {
            const txt = await r.text().catch(() => '');
            throw new Error(`Accounts API error ${r.status}: ${txt}`);
          }
          return r.json();
        });
        const targetDate = formatDateCST(selectedDate);
        
        const activitiesForDate = [];
        
        if (!Array.isArray(accounts)) {
          console.error('Accounts API returned non-array:', accounts);
        } else {
          accounts.forEach(account => {
          try {
            const notes = typeof account.notes === 'string' ? JSON.parse(account.notes) : account.notes;
            if (notes?.notes && Array.isArray(notes.notes)) {
              notes.notes.forEach(note => {
                try {
                  // Convert note.created_at to CST date (YYYY-MM-DD) to match targetDate
                  const d = new Date(note.created_at);
                  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
                  const cstOffset = -6 * 60; // minutes
                  const cst = new Date(utc + (cstOffset * 60000));
                  const noteDate = formatDateCST(cst);
                  if (noteDate === targetDate) {
                    activitiesForDate.push({
                      ...note,
                      account_name: account.name,
                      account_id: account.id
                    });
                  }
                } catch (e) {
                  // skip invalid note date
                }
              });
            }
          } catch (e) {
            // Skip invalid notes
          }
        });
        
        }
        // Sort by most recent first
        activitiesForDate.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setActivities(activitiesForDate);
      } catch (err) {
        console.error('Failed to fetch activities:', err);
        setActivities([]);
      }
    };

    fetchActivities();
    // Refresh every minute
    const interval = setInterval(fetchActivities, 60000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  // Check if selected date is today (CST)
  const isToday = formatDateCST(selectedDate) === formatDateCST(getTodayCST());

  // Count walk-ins for the selected date
  const walkInsCount = activities.filter(a => String(a.activity_type || '').toLowerCase() === 'walk-in').length;
  
  // Count touches (all non-walk-in activities)
  const touchesCount = activities.filter(a => String(a.activity_type || '').toLowerCase() !== 'walk-in').length;

  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    setSelectedDate(getTodayCST());
  };
  return (
    <div className="space-y-6">
      {/* Today's Activity */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 rounded-3xl border border-slate-700 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Clock className="text-indigo-400" size={20} />
            <h3 className="text-sm md:text-base font-black uppercase text-slate-300 tracking-wide">
              {isToday ? "Today's Activity" : "Activity Log"}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 bg-indigo-900/30 rounded-full border border-indigo-700/50 text-xs font-black text-indigo-300">
              {touchesCount} {touchesCount === 1 ? 'Touch' : 'Touches'}
            </div>
            <div className="px-3 py-1 bg-emerald-900/30 rounded-full border border-emerald-700/50 text-xs font-black text-emerald-300">
              {walkInsCount} {walkInsCount === 1 ? 'Walk-In' : 'Walk-Ins'}
            </div>
          </div>
        </div>

        {/* Date Navigation */}
        <div className="flex items-center justify-between mb-4 bg-slate-800/50 rounded-2xl p-3 border border-slate-700">
          <button
            onClick={goToPreviousDay}
            className="p-2 hover:bg-slate-700 rounded-xl transition-colors"
          >
            <ChevronLeft size={18} className="text-slate-400" />
          </button>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 rounded-xl transition-colors"
            >
              <Calendar size={14} className="text-indigo-400" />
              <span className="text-sm font-bold text-slate-300">
                {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </button>
            {!isToday && (
              <button
                onClick={goToToday}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase rounded-xl transition-colors"
              >
                Today
              </button>
            )}
          </div>

          <button
            onClick={goToNextDay}
            className="p-2 hover:bg-slate-700 rounded-xl transition-colors"
          >
            <ChevronRight size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Date Picker */}
        {showDatePicker && (
          <div className="mb-4 bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
            <input
              type="date"
              value={formatDateCST(selectedDate)}
              onChange={(e) => {
                setSelectedDate(new Date(e.target.value + 'T12:00:00'));
                setShowDatePicker(false);
              }}
              className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-slate-300 text-sm"
            />
          </div>
        )}

        <div className="space-y-2 max-h-96 overflow-y-auto custom-scroll">
          {activities.length > 0 ? (
            activities.map((activity) => {
              const activityTypeInfo = ACTIVITY_TYPES.find(t => t.value === activity.activity_type) || ACTIVITY_TYPES[4];
              return (
                <div
                  key={activity.id}
                  onClick={() => onActivityClick && onActivityClick(activity.account_id)}
                  className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 cursor-pointer hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className="px-2 py-1 rounded-lg text-[9px] font-black uppercase"
                      style={{ backgroundColor: activityTypeInfo.color + '20', color: activityTypeInfo.color }}
                    >
                      {activityTypeInfo.label}
                    </div>
                    <div className="text-slate-400 text-[10px] font-bold">
                      {new Date(activity.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="text-slate-300 font-bold text-xs mb-1">{activity.account_name}</div>
                  <div className="text-slate-400 text-[11px]">{activity.text}</div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-slate-500 text-sm">
              No activities logged for this date.
            </div>
          )}
        </div>
      </div>

      {/* Prospecting - full width */}
      {data && (() => {
        const rows = data.rawRows || [];
        const safe = (r, c) => {
          if (!rows[r]) return "";
          return rows[r][c] || "";
        };

        const prospectingMatrix = [1, 2].map((rIdx) => {
          return [3, 4, 5, 6, 7].map((cIdx) => safe(rIdx, cIdx));
        });

        const walkInsPerOpp = { label: safe(1, 9), value: safe(2, 9) };
        const wonValueMatrix = [11, 12].map((cIdx) => [safe(1, cIdx), safe(2, cIdx)]);

        return (
          <>
            <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm md:text-base font-black uppercase text-slate-300 tracking-wide">This Months Prospecting</h3>
                <Target className="text-indigo-300" size={20} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                {prospectingMatrix[0].map((title, i) => {
                  const value = prospectingMatrix[1]?.[i] || "-";
                  return (
                    <div key={`p-col-${i}`} className="bg-white/6 rounded-xl p-4 text-center flex flex-col items-center justify-center gap-1">
                      <div className="text-xs md:text-sm font-semibold uppercase text-slate-300 tracking-wide">{(title || "").toString()}</div>
                      <div className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white mt-1">{value || "-"}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Secondary metrics - two columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl flex flex-col justify-center items-center">
                <div className="flex items-center gap-3 mb-3">
                  <TrendingUp className="text-emerald-300" size={20} />
                  <h3 className="text-xs md:text-sm font-black uppercase text-slate-300 tracking-wide">Walk-Ins Per Opp</h3>
                </div>

                <div className="text-4xl md:text-5xl font-extrabold text-white">{walkInsPerOpp.value || "-"}</div>
                <div className="text-sm text-slate-400 mt-2">{walkInsPerOpp.label || ""}</div>
              </div>

              <div className="bg-gradient-to-br from-purple-900 via-slate-900 to-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs md:text-sm font-black uppercase text-slate-300 tracking-wide">This Months Won Value</h3>
                  <Users className="text-purple-300" size={20} />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {wonValueMatrix.map((row, rIdx) => (
                    <div key={`wonrow-${rIdx}`} className="bg-white/6 rounded-xl p-4">
                      <div className="text-xs text-slate-300">{row[0] || "-"}</div>
                      <div className="text-2xl md:text-3xl font-extrabold text-white mt-2">{row[1] || "-"}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
