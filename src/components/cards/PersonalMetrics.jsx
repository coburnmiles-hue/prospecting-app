import { TrendingUp, Users, Target, Clock } from "lucide-react";
import { useState, useEffect } from "react";

const ACTIVITY_TYPES = [
  { value: "walk-in", label: "Walk-In", color: "#3b82f6" },
  { value: "call", label: "Call", color: "#10b981" },
  { value: "text", label: "Text", color: "#8b5cf6" },
  { value: "email", label: "Email", color: "#f59e0b" },
  { value: "update", label: "Update", color: "#64748b" },
];

export default function PersonalMetrics({ data, onActivityClick }) {
  const [todaysActivities, setTodaysActivities] = useState([]);

  useEffect(() => {
    // Fetch today's activities from all saved accounts
    const fetchTodaysActivities = async () => {
      try {
        const accounts = await fetch('/api/accounts', { cache: 'no-store' }).then(r => r.json());
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        const activities = [];
        
        accounts.forEach(account => {
          try {
            const notes = typeof account.notes === 'string' ? JSON.parse(account.notes) : account.notes;
            if (notes?.notes && Array.isArray(notes.notes)) {
              notes.notes.forEach(note => {
                const noteDate = new Date(note.created_at).toISOString().split('T')[0];
                if (noteDate === today) {
                  activities.push({
                    ...note,
                    account_name: account.name,
                    account_id: account.id
                  });
                }
              });
            }
          } catch (e) {
            // Skip invalid notes
          }
        });
        
        // Sort by most recent first
        activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setTodaysActivities(activities);
      } catch (err) {
        console.error('Failed to fetch activities:', err);
      }
    };

    fetchTodaysActivities();
    // Refresh every minute
    const interval = setInterval(fetchTodaysActivities, 60000);
    return () => clearInterval(interval);
  }, []);
  if (!data) return null;

  const rows = data.rawRows || [];

  const safe = (r, c) => {
    if (!rows[r]) return "";
    return rows[r][c] || "";
  };

  // Section 1: This Months Prospecting -> cells B2:F3 (rows index 1..2, cols 1..5)
  const prospectingMatrix = [1, 2].map((rIdx) => {
    return [1, 2, 3, 4, 5].map((cIdx) => safe(rIdx, cIdx));
  });

  // Section 2: Walk-Ins Per Opp -> H2:H3 (col 7, rows 1..2)
  const walkInsPerOpp = { label: safe(1, 7), value: safe(2, 7) };

  // Section 3: This Months Won Value -> J2:K3 (cols 9..10, rows 1..2)
  // transpose so each entry is [label, value] per column
  const wonValueMatrix = [9, 10].map((cIdx) => [safe(1, cIdx), safe(2, cIdx)]);

  return (
    <div className="space-y-6">
      {/* Today's Activity */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 rounded-3xl border border-slate-700 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Clock className="text-indigo-400" size={20} />
            <h3 className="text-sm md:text-base font-black uppercase text-slate-300 tracking-wide">Today's Activity</h3>
          </div>
          <div className="px-3 py-1 bg-indigo-900/30 rounded-full border border-indigo-700/50 text-xs font-black text-indigo-300">
            {todaysActivities.length} {todaysActivities.length === 1 ? 'Activity' : 'Activities'}
          </div>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto custom-scroll">
          {todaysActivities.length > 0 ? (
            todaysActivities.map((activity) => {
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
              No activities logged today yet.
            </div>
          )}
        </div>
      </div>

      {/* Prospecting - full width */}
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
    </div>
  );
}
