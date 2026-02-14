import { useState, useEffect } from "react";

export function useSavedAccounts() {
  const [savedAccounts, setSavedAccounts] = useState([]);

  useEffect(() => {
    const fetchSaved = async () => {
      try {
        const res = await fetch("/api/accounts", { cache: "no-store", credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
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
      const data = await res.json();
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
        const data = await res.json();
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
