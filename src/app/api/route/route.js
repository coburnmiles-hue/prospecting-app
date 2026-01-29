import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { waypoints } = await request.json();
    
    if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
      return NextResponse.json({ error: "At least 2 waypoints required" }, { status: 400 });
    }

    // Google Directions limits waypoints for optimization (commonly 23 waypoints for standard accounts)
    const MAX_WAYPOINTS = 23;
    if (waypoints.length > MAX_WAYPOINTS) {
      return NextResponse.json({ error: `Too many waypoints (max ${MAX_WAYPOINTS}). Reduce selection.` }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Google API key not configured" }, { status: 500 });
    }

    // Build Directions API request safely with URL-encoded coordinates
    const origin = `${encodeURIComponent(`${waypoints[0].lat},${waypoints[0].lng}`)}`;
    const destination = origin; // round-trip

    const waypointsParam = waypoints.map(w => encodeURIComponent(`${w.lat},${w.lng}`)).join('%7C'); // '|' encoded as %7C

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&waypoints=optimize:true%7C${waypointsParam}&key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    const data = await response.json();

    // Return detailed error info for debugging when Google returns non-OK
    if (!(data && data.status === "OK" && data.routes && data.routes[0])) {
      return NextResponse.json({ error: `Route calculation failed`, details: data.status, message: data.error_message || null }, { status: 502 });
    }

    const route = data.routes[0];

    // Extract polyline points for drawing on map
    const points = [];
    route.legs.forEach(leg => {
      leg.steps.forEach(step => {
        const decoded = decodePolyline(step.polyline.points);
        points.push(...decoded);
      });
    });

    return NextResponse.json({
      distance: route.legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0),
      duration: route.legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0),
      polyline: points,
      waypoint_order: data.routes[0].waypoint_order || [],
      legs: route.legs.map(leg => ({
        distance: leg.distance?.text || null,
        duration: leg.duration?.text || null,
        start_address: leg.start_address,
        end_address: leg.end_address,
      })),
    });
  } catch (error) {
    console.error("Route calculation error:", error);
    return NextResponse.json({ error: "Route calculation failed" }, { status: 500 });
  }
}

// Decode Google polyline format
function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}
