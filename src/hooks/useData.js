import { useState, useEffect } from "react";

async function safeJson(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function useSavedAccounts() {
  const [savedAccounts, setSavedAccounts] = useState([]);

  useEffect(() => {
    const fetchSaved = async () => {
      try {
        const res = await fetch("/api/accounts", { cache: "no-store", credentials: 'include' });
        if (!res.ok) return;
        const data = await safeJson(res);
        setSavedAccounts(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to fetch saved accounts:", err);
      }
    };
    fetchSaved();
  }, []);

  const refreshSavedAccounts = async () => {
    try {
      const res = await fetch("/api/accounts", { cache: "no-store", credentials: 'include' });
      if (!res.ok) return;
      const data = await safeJson(res);
      setSavedAccounts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to refresh saved accounts:", err);
    }
  };

  return { savedAccounts, setSavedAccounts, refreshSavedAccounts };
}

export function useMetricsData() {
  const [metricsData, setMetricsData] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    const fetchMetrics = async () => {
      setMetricsLoading(true);
      try {
        const res = await fetch("/api/sheets", { cache: "no-store", credentials: 'include' });
        if (!res.ok) return;
        const data = await safeJson(res);
        setMetricsData(data);
      } catch (err) {
        console.error("Failed to fetch metrics:", err);
      } finally {
        setMetricsLoading(false);
      }
    };
    fetchMetrics();
  }, []);

  return { metricsData, metricsLoading };
}

// Calculate metrics from app data instead of Google Sheets
export function useCalculatedMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const calculateMetrics = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/accounts", { cache: "no-store", credentials: 'include' });
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const accounts = await safeJson(res);
        if (!Array.isArray(accounts)) {
          setMetrics(null);
          return;
        }

        // Get current month start and end dates in CST
        const now = new Date();
        const cstOffset = -6 * 60;
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const cstTime = new Date(utc + (cstOffset * 60000));
        
        const monthStart = new Date(cstTime.getFullYear(), cstTime.getMonth(), 1);
        const monthEnd = new Date(cstTime.getFullYear(), cstTime.getMonth() + 1, 0, 23, 59, 59);

        let walkIns = 0;
        let touches = 0;
        let opps = 0;
        let closedWon = 0;
        let wonAccounts = [];

        // All-time metrics
        let allTimeWalkIns = 0;
        let allTimeTouches = 0;
        let allTimeOpps = 0;
        let allTimeClosedWon = 0;
        let allTimeWonAccounts = [];

        // Process each account
        accounts.forEach(account => {
          try {
            const notes = typeof account.notes === 'string' ? JSON.parse(account.notes) : account.notes;
            
            // Count activities this month
            if (notes?.notes && Array.isArray(notes.notes)) {
              notes.notes.forEach(note => {
                try {
                  const noteDate = new Date(note.created_at);
                  if (noteDate >= monthStart && noteDate <= monthEnd) {
                    if (note.activity_type === 'walk-in') {
                      walkIns++;
                    } else {
                      touches++;
                    }
                  }
                } catch (e) {
                  // skip invalid dates
                }
              });
            }

            // Count opps turned on this month
            if (notes?.activeOpp && notes?.activeOppDate) {
              try {
                const oppDate = new Date(notes.activeOppDate);
                if (oppDate >= monthStart && oppDate <= monthEnd) {
                  opps++;
                }
              } catch (e) {
                // skip invalid dates
              }
            }

            // Count closed won turned on this month and collect won account details
            // Use wonDateSigned instead of activeAccountDate
            if (notes?.activeAccount && notes?.wonDateSigned) {
              try {
                const signedDate = new Date(notes.wonDateSigned);
                if (signedDate >= monthStart && signedDate <= monthEnd) {
                  closedWon++;
                  wonAccounts.push({
                    id: account.id,
                    name: account.name,
                    gpv: notes.wonGpv || 0,
                    arr: notes.wonArr || 0,
                    dateSigned: notes.wonDateSigned,
                  });
                }
              } catch (e) {
                // skip invalid dates
              }
            }

            // All-time: Count all active accounts (regardless of when signed)
            if (notes?.activeAccount) {
              allTimeClosedWon++;
              allTimeWonAccounts.push({
                id: account.id,
                name: account.name,
                gpv: notes.wonGpv || 0,
                arr: notes.wonArr || 0,
                dateSigned: notes.wonDateSigned,
              });
            }
          } catch (e) {
            // Skip invalid notes
          }
        });

        // Calculate walk-ins per opp
        const walkInsPerOpp = opps > 0 ? (walkIns / opps).toFixed(1) : '-';
        
        // Calculate totals (this month)
        const totalGpv = wonAccounts.reduce((sum, acc) => sum + acc.gpv, 0);
        const totalArr = wonAccounts.reduce((sum, acc) => sum + acc.arr, 0);

        // Calculate all-time totals
        const allTimeTotalGpv = allTimeWonAccounts.reduce((sum, acc) => sum + acc.gpv, 0);
        const allTimeTotalArr = allTimeWonAccounts.reduce((sum, acc) => sum + acc.arr, 0);

        setMetrics({
          walkIns,
          touches,
          opps,
          closedWon,
          walkInsPerOpp,
          wonAccounts,
          totalGpv,
          totalArr,
          // All-time metrics
          allTime: {
            closedWon: allTimeClosedWon,
            wonAccounts: allTimeWonAccounts,
            totalGpv: allTimeTotalGpv,
            totalArr: allTimeTotalArr,
          }
        });
      } catch (err) {
        console.error("Failed to calculate metrics:", err);
      } finally {
        setLoading(false);
      }
    };

    calculateMetrics();
    
    // No auto-refresh - user can manually refresh if needed
  }, []);

  return { metrics, loading };
}
