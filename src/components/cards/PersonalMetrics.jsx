import { Users, Target, Clock, Calendar, ChevronLeft, ChevronRight, Copy, Check } from "lucide-react";
import { useState, useEffect } from "react";

const ACTIVITY_TYPES = [
  { value: "walk-in", label: "Walk-In", color: "#3b82f6" },
  { value: "call", label: "Call", color: "#10b981" },
  { value: "text", label: "Text", color: "#8b5cf6" },
  { value: "email", label: "Email", color: "#f59e0b" },
  { value: "update", label: "Update", color: "#64748b" },
];

export default function PersonalMetrics({ data, onActivityClick, calculatedMetrics }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activities, setActivities] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [earningsView, setEarningsView] = useState('thisMonth'); // 'thisMonth' or 'allTime'

  const copyNoteText = (text, noteId) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(noteId);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {
      // fallback copy method
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(noteId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

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
        const accounts = await fetch('/api/accounts', { 
          cache: 'no-store',
          credentials: 'include'
        }).then(async (r) => {
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
                  className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
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
                    <button
                      onClick={() => copyNoteText(activity.text, activity.id)}
                      title="Copy note text"
                      className="text-slate-400 hover:text-indigo-400 transition-colors p-1"
                    >
                      {copiedId === activity.id ? (
                        <Check size={14} className="text-green-400" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </div>
                  <div 
                    onClick={() => onActivityClick && onActivityClick(activity.account_id)}
                    className="cursor-pointer"
                  >
                    <div className="text-slate-300 font-bold text-xs mb-1">{activity.account_name}</div>
                    <div className="text-slate-400 text-[11px]">{activity.text}</div>
                  </div>
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

      {/* Prospecting Metrics - Calculated from App Data */}
      {calculatedMetrics && (
        <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm md:text-base font-black uppercase text-slate-300 tracking-wide">This Month's Prospecting</h3>
            <Target className="text-indigo-300" size={20} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="bg-white/6 rounded-xl p-4 text-center flex flex-col items-center justify-center gap-1">
              <div className="text-xs md:text-sm font-semibold uppercase text-slate-300 tracking-wide">Walk-Ins</div>
              <div className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white mt-1">{calculatedMetrics.walkIns}</div>
            </div>
            
            <div className="bg-white/6 rounded-xl p-4 text-center flex flex-col items-center justify-center gap-1">
              <div className="text-xs md:text-sm font-semibold uppercase text-slate-300 tracking-wide">Touches</div>
              <div className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white mt-1">{calculatedMetrics.touches}</div>
            </div>
            
            <div className="bg-white/6 rounded-xl p-4 text-center flex flex-col items-center justify-center gap-1">
              <div className="text-xs md:text-sm font-semibold uppercase text-slate-300 tracking-wide">Opps</div>
              <div className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white mt-1">{calculatedMetrics.opps}</div>
            </div>
            
            <div className="bg-white/6 rounded-xl p-4 text-center flex flex-col items-center justify-center gap-1">
              <div className="text-xs md:text-sm font-semibold uppercase text-slate-300 tracking-wide">Closed Won</div>
              <div className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white mt-1">{calculatedMetrics.closedWon}</div>
            </div>
            
            <div className="bg-white/6 rounded-xl p-4 text-center flex flex-col items-center justify-center gap-1">
              <div className="text-xs md:text-sm font-semibold uppercase text-slate-300 tracking-wide">Walk-Ins per Opp</div>
              <div className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white mt-1">
                {calculatedMetrics.opps > 0 ? (calculatedMetrics.walkIns / calculatedMetrics.opps).toFixed(1) : '-'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Won Accounts This Month */}
      {calculatedMetrics && (
        <div className="bg-gradient-to-br from-purple-900 via-slate-900 to-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm md:text-base font-black uppercase text-slate-300 tracking-wide">
              {earningsView === 'thisMonth' ? "This Month's" : "All Time"} Won Value
            </h3>
            <div className="flex items-center gap-3">
              {/* Toggle Button */}
              <div className="flex items-center bg-slate-800/50 rounded-xl p-1 border border-slate-700">
                <button
                  onClick={() => setEarningsView('thisMonth')}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                    earningsView === 'thisMonth'
                      ? 'bg-indigo-600 text-white shadow-lg'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  This Month
                </button>
                <button
                  onClick={() => setEarningsView('allTime')}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                    earningsView === 'allTime'
                      ? 'bg-indigo-600 text-white shadow-lg'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  All Time
                </button>
              </div>
              <Users className="text-purple-300" size={20} />
            </div>
          </div>

          {/* Won Accounts List */}
          {(() => {
            const displayWonAccounts = earningsView === 'thisMonth' 
              ? (calculatedMetrics.wonAccounts || []) 
              : (calculatedMetrics.allTime?.wonAccounts || []);
            
            if (displayWonAccounts.length === 0) {
              return (
                <div className="text-center py-8 text-slate-400 text-sm">
                  No won accounts {earningsView === 'thisMonth' ? 'this month' : 'yet'}.
                </div>
              );
            }
            
            return (
              <div className="space-y-3 mb-4 max-h-60 overflow-y-auto custom-scroll">
                {displayWonAccounts.map((account) => (
              <div
                key={account.id}
                onClick={() => onActivityClick && onActivityClick(account.id)}
                className="bg-white/6 rounded-xl p-4 cursor-pointer hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-slate-200">{account.name}</div>
                  {account.dateSigned && (
                    <div className="text-[9px] text-slate-400">
                      {new Date(account.dateSigned).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase">GPV</div>
                    <div className="text-base font-extrabold text-emerald-300">
                      ${account.gpv.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase">ARR</div>
                    <div className="text-base font-extrabold text-indigo-300">
                      ${account.arr.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
            );
          })()}

          {/* Totals */}
          {(() => {
            const displayTotalGpv = earningsView === 'thisMonth' 
              ? (calculatedMetrics.totalGpv || 0) 
              : (calculatedMetrics.allTime?.totalGpv || 0);
            const displayTotalArr = earningsView === 'thisMonth' 
              ? (calculatedMetrics.totalArr || 0) 
              : (calculatedMetrics.allTime?.totalArr || 0);
            
            return (
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-600">
                <div className="bg-emerald-900/30 rounded-xl p-4">
                  <div className="text-xs text-emerald-200 uppercase font-bold mb-1">Total GPV</div>
                  <div className="text-2xl md:text-3xl font-extrabold text-white">
                    ${displayTotalGpv.toLocaleString()}
                  </div>
                </div>
                <div className="bg-indigo-900/30 rounded-xl p-4">
                  <div className="text-xs text-indigo-200 uppercase font-bold mb-1">Total ARR</div>
                  <div className="text-2xl md:text-3xl font-extrabold text-white">
                    ${displayTotalArr.toLocaleString()}
                  </div>
                </div>
                <div className="bg-purple-900/30 rounded-xl p-4">
                  <div className="text-xs text-purple-200 uppercase font-bold mb-1">Estimated Year 1 Earnings</div>
                  <div className="text-2xl md:text-3xl font-extrabold text-white">
                    ${Math.round(displayTotalArr * 0.265).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
