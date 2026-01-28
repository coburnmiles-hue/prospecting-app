import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { waypoints } = await request.json();
    
    if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
      return NextResponse.json({ error: "At least 2 waypoints required" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Google API key not configured" }, { status: 500 });
    }

    // Use Google Directions API to calculate route with optimization
    // All points as waypoints to allow full route optimization
    const origin = `${waypoints[0].lat},${waypoints[0].lng}`;
    const destination = origin; // Return to start for a round trip
    
    // All waypoints for optimization
    const waypointsParam = waypoints
      .map(w => `${w.lat},${w.lng}`)
      .join('|');
    
    let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&waypoints=optimize:true|${waypointsParam}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "OK" && data.routes && data.routes[0]) {
      const route = data.routes[0];
      const leg = route.legs[0];
      
      // Extract polyline points for drawing on map
      const points = [];
      route.legs.forEach(leg => {
        leg.steps.forEach(step => {
          const decoded = decodePolyline(step.polyline.points);
          points.push(...decoded);
        });
      });

      return NextResponse.json({
        distance: route.legs.reduce((sum, leg) => sum + leg.distance.value, 0),
        duration: route.legs.reduce((sum, leg) => sum + leg.duration.value, 0),
        polyline: points,
        waypoint_order: data.routes[0].waypoint_order || [],
        legs: route.legs.map(leg => ({
          distance: leg.distance.text,
          duration: leg.duration.text,
          start_address: leg.start_address,
          end_address: leg.end_address,
        })),
      });
    }

    return NextResponse.json({ error: `Route calculation failed: ${data.status}` }, { status: 404 });
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
