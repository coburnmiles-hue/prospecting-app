import { useState, useRef } from "react";

export function useRoutePlanning(savedAccounts, mapInstance) {
  const [routePlanMode, setRoutePlanMode] = useState(false);
  const [selectedForRoute, setSelectedForRoute] = useState([]);
  const [calculatedRoute, setCalculatedRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const routePolylineRef = useRef(null);

  const calculateRoute = async () => {
    if (selectedForRoute.length < 2) {
      return { error: "Please select at least 2 accounts to plan a route." };
    }

    setRouteLoading(true);

    try {
      const waypoints = selectedForRoute.map(id => {
        const account = savedAccounts.find(a => a.id === id);
        return {
          lat: account.lat,
          lng: account.lng,
          name: account.name,
        };
      });

      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Route calculation failed');
      }

      const route = await res.json();
      setCalculatedRoute(route);

      // Reorder selectedForRoute based on optimized waypoint order
      if (route.waypoint_order && Array.isArray(route.waypoint_order)) {
        const optimizedOrder = route.waypoint_order.map(index => selectedForRoute[index]);
        setSelectedForRoute(optimizedOrder);
      }

      // Draw route on map if map is visible
      if (mapInstance.current && route.polyline) {
        // Remove existing route if any
        if (routePolylineRef.current) {
          mapInstance.current.removeLayer(routePolylineRef.current);
        }

        // Draw new route
        const L = window.L;
        const polyline = L.polyline(route.polyline, {
          color: '#10b981',
          weight: 4,
          opacity: 0.8,
        }).addTo(mapInstance.current);

        routePolylineRef.current = polyline;

        // Fit map to route bounds (only if bounds are valid)
        try {
          const bounds = polyline.getBounds && polyline.getBounds();
          if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
            mapInstance.current.fitBounds(bounds, { padding: [50, 50] });
          } else {
            console.warn('Route polyline bounds invalid, skipping fitBounds');
          }
        } catch (e) {
          console.warn('Failed to fitBounds for route polyline', e);
        }
      }

      return { success: true };
    } catch (err) {
      return { error: err?.message || 'Failed to calculate route' };
    } finally {
      setRouteLoading(false);
    }
  };

  const toggleRoutePlanMode = () => {
    setRoutePlanMode(m => !m);
    setSelectedForRoute([]);
    setCalculatedRoute(null);
    if (routePolylineRef.current && mapInstance.current) {
      mapInstance.current.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }
  };

  return {
    routePlanMode,
    selectedForRoute,
    setSelectedForRoute,
    calculatedRoute,
    routeLoading,
    routePolylineRef,
    calculateRoute,
    toggleRoutePlanMode,
  };
}
