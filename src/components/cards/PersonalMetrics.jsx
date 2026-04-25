import { Users, Target, Clock, Calendar, ChevronLeft, ChevronRight, Copy, Check, ToggleLeft, ToggleRight } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";

const ACTIVITY_TYPES = [
  { value: "walk-in", label: "Walk-In", color: "#3b82f6" },
  { value: "call", label: "Call", color: "#10b981" },
  { value: "text", label: "Text", color: "#8b5cf6" },
  { value: "email", label: "Email", color: "#f59e0b" },
  { value: "update", label: "Update", color: "#64748b" },
  { value: "bdr-note", label: "BDR Note", color: "#ec4899" },
];

export default function PersonalMetrics({ data, onActivityClick, calculatedMetrics, savedAccounts, refreshSavedAccounts }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [completingFollowupId, setCompletingFollowupId] = useState(null);
  const [showAllTime, setShowAllTime] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const dateInputRef = useRef(null);

  // Derive local YYYY-MM-DD from a note
  const noteDate = (note) =>
    note.created_local_date ||
    (note.created_at ? new Date(new Date(note.created_at).getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10) : null);

  // Flatten all pending followups from savedAccounts
  const allPendingAlerts = useMemo(() => {
    if (!Array.isArray(savedAccounts) || savedAccounts.length === 0) return [];
    const flat = [];
    savedAccounts.forEach(account => {
      try {
        const parsed = typeof account.notes === 'string' ? JSON.parse(account.notes || '{}') : (account.notes || {});
        if (Array.isArray(parsed.followups)) {
          parsed.followups.forEach(f => {
            if (!f.completed) {
              flat.push({ ...f, account_id: account.id, account_name: account.name });
            }
          });
        }
      } catch { /* skip */ }
    });
    flat.sort((a, b) => new Date(a.follow_up_at) - new Date(b.follow_up_at));
    return flat;
  }, [savedAccounts]);

  // Flatten all notes from savedAccounts into a single sorted array
  const allNotes = useMemo(() => {
    if (!Array.isArray(savedAccounts) || savedAccounts.length === 0) return [];
    const flat = [];
    savedAccounts.forEach(account => {
      try {
        const parsed = typeof account.notes === 'string' ? JSON.parse(account.notes || '{}') : (account.notes || {});
        if (Array.isArray(parsed.notes)) {
          parsed.notes.forEach(note => {
            flat.push({ ...note, account_id: account.id, account_name: account.name });
          });
        }
      } catch { /* skip unparseable */ }
    });
    flat.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return flat;
  }, [savedAccounts]);

  // Auto-jump to most recent date with notes when allNotes first populates
  useEffect(() => {
    if (allNotes.length === 0) return;
    if (selectedDate !== null) return; // already set
    const latest = allNotes.map(n => noteDate(n)).filter(Boolean).sort().pop();
    setSelectedDate(latest ? new Date(latest + 'T12:00:00') : new Date());
  }, [allNotes]);

  const toDateInputValue = (date) => {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const isToday = (date) => {
    if (!date) return false;
    const today = new Date();
    return date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();
  };

  // Activities for the selected date
  const activities = (selectedDate && allNotes.length > 0)
    ? allNotes.filter(n => noteDate(n) === toDateInputValue(selectedDate))
    : [];

  const shiftDay = (delta) => {
    if (!selectedDate) return;
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + delta);
    if (delta > 0 && isToday(selectedDate)) return;
    setSelectedDate(next);
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(max-width: 640px)');
    const updateIsMobile = () => setIsMobile(mediaQuery.matches);
    updateIsMobile();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateIsMobile);
      return () => mediaQuery.removeEventListener('change', updateIsMobile);
    }
    mediaQuery.addListener(updateIsMobile);
    return () => mediaQuery.removeListener(updateIsMobile);
  }, []);

  const copyNoteText = (text, noteId) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(noteId);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(err => console.error('Failed to copy text: ', err));
  };

  const formatDateCST = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Today's Activity */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 rounded-3xl border border-slate-700 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-white">
            {isToday(selectedDate) ? "Today's Activity" : `Activity — ${formatDateCST(selectedDate)}`}
            {activities.length > 0 && (
              <span className="ml-2 text-xs font-bold text-indigo-400 bg-indigo-900/50 px-2 py-0.5 rounded-full">{activities.length}</span>
            )}
          </h2>
          <div className="flex items-center gap-1">
            {/* Prev day */}
            <button
              onClick={() => shiftDay(-1)}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              title="Previous day"
            >
              <ChevronLeft size={18} className="text-slate-300" />
            </button>

            {/* Date input (calendar icon triggers native picker) */}
            <button
              onClick={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.click()}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              title="Pick a date"
            >
              <Calendar size={18} className="text-slate-300" />
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={toDateInputValue(selectedDate)}
              max={toDateInputValue(new Date())}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(new Date(e.target.value + 'T12:00:00'));
              }}
              className="sr-only"
            />

            {/* Next day */}
            <button
              onClick={() => shiftDay(1)}
              disabled={isToday(selectedDate)}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next day"
            >
              <ChevronRight size={18} className="text-slate-300" />
            </button>

            {/* Reset to today */}
            {!isToday(selectedDate) && (
              <button
                onClick={() => setSelectedDate(new Date())}
                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors"
                title="Back to today"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {!savedAccounts ? (
          <div className="text-center py-8 text-slate-500 text-sm animate-pulse">Loading activities…</div>
        ) : activities.length > 0 ? (
          activities.map((activity) => {
            const activityTypeInfo = ACTIVITY_TYPES.find(t => t.value === activity.activity_type) || ACTIVITY_TYPES[4];
            return (
              <div
                key={activity.id}
                className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: activityTypeInfo.color }}
                    />
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-400">
                        {activity.account_name ? `${activity.account_name} · ` : ''}{activityTypeInfo.label}
                      </div>
                      <div className="text-sm text-slate-300">
                        {activity.text}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(activity.text).then(() => {
                          setCopiedId(activity.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        });
                      }}
                      className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                      title="Copy note"
                    >
                      {copiedId === activity.id
                        ? <Check size={14} className="text-green-400" />
                        : <Copy size={14} className="text-slate-400" />}
                    </button>
                    <div className="text-xs text-slate-400">
                      {new Date(activity.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-slate-400 text-sm">
            No activities logged for {formatDateCST(selectedDate)}.
            <div className="mt-2 text-xs text-slate-500">Use the arrows to navigate to a day with activity.</div>
          </div>
        )}
      </div>

      {/* Follow-up Alerts */}
      {/* Prospecting Metrics - Calculated from App Data */}
      {calculatedMetrics && (
        <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm md:text-base font-black uppercase text-slate-300 tracking-wide">
              {showAllTime ? "All-Time Prospecting" : "This Months Prospecting"}
            </h3>
            <Target className="text-indigo-300" size={20} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="bg-white/6 rounded-xl p-4 text-center flex flex-col items-center justify-center gap-1">
              <div className="text-xs md:text-sm font-semibold uppercase text-slate-300 tracking-wide">Walk-Ins</div>
              <div className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white mt-1">
                {showAllTime ? calculatedMetrics.allTime?.walkIns ?? 0 : calculatedMetrics.walkIns || 0}
              </div>
            </div>
            
            <div className="bg-white/6 rounded-xl p-4 text-center flex flex-col items-center justify-center gap-1">
              <div className="text-xs md:text-sm font-semibold uppercase text-slate-300 tracking-wide">Touches</div>
              <div className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white mt-1">
                {showAllTime ? calculatedMetrics.allTime?.touches ?? 0 : calculatedMetrics.touches || 0}
              </div>
            </div>
            
            <div className="bg-white/6 rounded-xl p-4 text-center flex flex-col items-center justify-center gap-1">
              <div className="text-xs md:text-sm font-semibold uppercase text-slate-300 tracking-wide">Opps</div>
              <div className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white mt-1">
                {showAllTime ? calculatedMetrics.allTime?.opps ?? 0 : calculatedMetrics.opps || 0}
              </div>
            </div>
            
            <div className="bg-white/6 rounded-xl p-4 text-center flex flex-col items-center justify-center gap-1">
              <div className="text-xs md:text-sm font-semibold uppercase text-slate-300 tracking-wide">Closed Won</div>
              <div className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white mt-1">
                {showAllTime ? calculatedMetrics.allTime?.closedWon || 0 : calculatedMetrics.closedWon}
              </div>
            </div>
            
            <div className="bg-white/6 rounded-xl p-4 text-center flex flex-col items-center justify-center gap-1">
              <div className="text-xs md:text-sm font-semibold uppercase text-slate-300 tracking-wide">Walk-Ins per Opp</div>
              <div className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white mt-1">
                {showAllTime
                  ? (calculatedMetrics.allTime?.opps > 0 ? (calculatedMetrics.allTime.walkIns / calculatedMetrics.allTime.opps).toFixed(1) : '-')
                  : (calculatedMetrics.opps > 0 ? (calculatedMetrics.walkIns / calculatedMetrics.opps).toFixed(1) : '-')}
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
              {showAllTime ? "All-Time Won Value" : "This Months Won Value"}
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAllTime(!showAllTime)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 rounded-xl transition-colors group"
                title={`Switch to ${showAllTime ? 'monthly' : 'all-time'} metrics`}
              >
                {showAllTime ? (
                  <ToggleRight size={18} className="text-indigo-400 group-hover:text-indigo-300" />
                ) : (
                  <ToggleLeft size={18} className="text-slate-400 group-hover:text-slate-300" />
                )}
                <span className="text-xs font-bold text-slate-300">
                  {showAllTime ? "All Time" : "This Month"}
                </span>
              </button>
              <Users className="text-purple-300" size={20} />
            </div>
          </div>

          {/* Won Accounts List */}
          {(() => {
            const displayWonAccounts = showAllTime 
              ? (calculatedMetrics.allTime?.wonAccounts || [])
              : (calculatedMetrics.wonAccounts || []);
            
            if (displayWonAccounts.length === 0) {
              return (
                <div className="text-center py-8 text-slate-400 text-sm">
                  No won accounts {showAllTime ? 'yet' : 'this month'}.
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
                          {new Date(account.dateSigned).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: showAllTime ? 'numeric' : undefined })}
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
            const displayTotalGpv = showAllTime 
              ? (calculatedMetrics.allTime?.totalGpv || 0)
              : (calculatedMetrics.totalGpv || 0);
            const displayTotalArr = showAllTime 
              ? (calculatedMetrics.allTime?.totalArr || 0)
              : (calculatedMetrics.totalArr || 0);
            const displayYear1Earnings = Math.round(displayTotalArr * 0.265);
            
            const chartData = [
              { name: isMobile ? "GPV" : "Total GPV", value: displayTotalGpv, fill: "#10b981" },
              { name: isMobile ? "ARR" : "Total ARR", value: displayTotalArr, fill: "#6366f1" },
              { name: isMobile ? "Y1" : "Year 1 Earnings", value: displayYear1Earnings, fill: "#a855f7" },
            ];
            
            const formatCurrency = (value) => {
              if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
              if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
              return `$${value}`;
            };
            
            return (
              <div className="pt-4 border-t border-slate-600">
                <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={200}>
                  <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: isMobile ? 2 : 8, left: isMobile ? 20 : 150, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" stroke="#64748b" domain={[0, 'dataMax']} tickFormatter={formatCurrency} tick={{ fontSize: isMobile ? 10 : 11 }} />
                    <YAxis type="category" dataKey="name" stroke="#64748b" tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 36 : 120} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px", color: "#fff" }}
                      formatter={(value) => `$${value.toLocaleString()}`}
                    />
                    <Bar dataKey="value" radius={8} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
        </div>
      )}

      {/* Follow-up Alerts */}
      {(() => {
        const now = new Date();
        const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const visibleAlerts = showAllAlerts
          ? allPendingAlerts
          : allPendingAlerts.filter(a => new Date(a.follow_up_at) <= in7Days);
        const hiddenCount = allPendingAlerts.length - allPendingAlerts.filter(a => new Date(a.follow_up_at) <= in7Days).length;

        return (
          <div className="bg-gradient-to-br from-amber-900 via-slate-900 to-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-white">
                Follow-up Alerts
                {allPendingAlerts.length > 0 && (
                  <span className="ml-2 text-xs font-bold text-amber-400 bg-amber-900/50 px-2 py-0.5 rounded-full">{allPendingAlerts.length}</span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                {hiddenCount > 0 && (
                  <button
                    onClick={() => setShowAllAlerts(v => !v)}
                    className="text-xs font-bold text-amber-300 bg-amber-900/40 hover:bg-amber-800/60 border border-amber-700/50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {showAllAlerts ? 'Show fewer' : `View all (${allPendingAlerts.length})`}
                  </button>
                )}
                <Target className="text-amber-300" size={20} />
              </div>
            </div>

            {visibleAlerts.length > 0 ? (
              <div className="space-y-3">
                {visibleAlerts.map((alert) => {
                  const followUpDate = new Date(alert.follow_up_at);
                  const msUntil = followUpDate - now;
                  const daysUntil = Math.ceil(msUntil / (1000 * 60 * 60 * 24));
                  const isOverdue = daysUntil < 0;
                  const isDueToday = daysUntil === 0;

                  return (
                    <div
                      key={`alert-${alert.id}-${alert.account_id}`}
                      className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${
                            isOverdue ? 'bg-red-500' : isDueToday ? 'bg-orange-400' : 'bg-amber-400'
                          }`} />
                          <div className="min-w-0">
                            <button
                              onClick={() => onActivityClick && onActivityClick(alert.account_id)}
                              className="text-xs font-semibold uppercase text-slate-400 hover:text-amber-300 transition-colors text-left"
                            >
                              {alert.account_name}
                            </button>
                            <div className="text-sm text-slate-300 mt-0.5 break-words">
                              {alert.follow_up_note || alert.text}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <div className={`text-xs font-bold ${
                            isOverdue ? 'text-red-400' : isDueToday ? 'text-orange-400' : 'text-amber-400'
                          }`}>
                            {isOverdue
                              ? `${Math.abs(daysUntil)}d overdue`
                              : isDueToday
                              ? 'Due today'
                              : `In ${daysUntil}d`}
                          </div>
                          <div className="text-xs text-slate-500">
                            {followUpDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setCompletingFollowupId(alert.id);
                              try {
                                await fetch('/api/notes', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  credentials: 'include',
                                  body: JSON.stringify({ accountId: alert.account_id, followupId: alert.id, complete: true }),
                                });
                                if (refreshSavedAccounts) await refreshSavedAccounts();
                              } catch (err) {
                                console.error('Failed to complete followup:', err);
                              } finally {
                                setCompletingFollowupId(null);
                              }
                            }}
                            disabled={completingFollowupId === alert.id}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                          >
                            {completingFollowupId === alert.id ? '...' : 'Clear'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 text-sm">
                {allPendingAlerts.length === 0
                  ? 'No pending follow-up alerts.'
                  : 'No alerts due in the next 7 days.'}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
