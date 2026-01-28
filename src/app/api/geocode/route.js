import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { address } = await request.json();
    
    if (!address) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Google API key not configured" }, { status: 500 });
    }

    // Use Google Geocoding API
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "OK" && data.results && data.results[0]) {
      const location = data.results[0].geometry.location;
      return NextResponse.json({
        lat: location.lat,
        lng: location.lng,
        formatted_address: data.results[0].formatted_address
      });
    }

    return NextResponse.json({ error: `Geocoding failed: ${data.status}` }, { status: 404 });
  } catch (error) {
    console.error("Geocoding error:", error);
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
  }
}
