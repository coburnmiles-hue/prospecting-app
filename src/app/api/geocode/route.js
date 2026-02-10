import { NextResponse } from "next/server";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const address = searchParams.get('address');

    // Reverse geocoding (lat/lng to address)
    if (lat && lng) {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      
      // Try Google Reverse Geocoding if key is present
      if (apiKey) {
        try {
          const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
          const response = await fetch(url);
          const data = await response.json();
          if (data.status === "OK" && data.results && data.results[0]) {
            return NextResponse.json({
              address: data.results[0].formatted_address,
              lat: parseFloat(lat),
              lng: parseFloat(lng),
              source: 'google'
            });
          }
        } catch (e) {
          console.warn('Google reverse geocoding failed, falling back to Nominatim', e);
        }
      }

      // Fallback to Nominatim
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
        const nomRes = await fetch(nomUrl, {
          headers: { 'User-Agent': 'prospecting-app/1.0 (you@domain.com)' }
        });
        const nomData = await nomRes.json();
        if (nomData && nomData.display_name) {
          return NextResponse.json({
            address: nomData.display_name,
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            source: 'nominatim'
          });
        }
      } catch (e) {
        console.error('Nominatim reverse geocoding failed', e);
      }

      return NextResponse.json({ error: "Reverse geocoding failed" }, { status: 404 });
    }

    // Forward geocoding (address to lat/lng)
    if (address) {
      return forwardGeocode(address);
    }

    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  } catch (error) {
    console.error("Geocoding error:", error);
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
  }
}

async function forwardGeocode(address) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  // Try Google Geocoding if key is present
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === "OK" && data.results && data.results[0]) {
        const location = data.results[0].geometry.location;
        return NextResponse.json({
          lat: location.lat,
          lng: location.lng,
          formatted_address: data.results[0].formatted_address,
          source: 'google'
        });
      }
    } catch (e) {
      console.warn('Google geocoding failed, falling back to Nominatim', e);
    }
  }

  // Fallback to Nominatim (OpenStreetMap) when Google key missing or fails
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const nomRes = await fetch(nomUrl, {
      headers: { 'User-Agent': 'prospecting-app/1.0 (you@domain.com)' }
    });
    const nomData = await nomRes.json();
    if (Array.isArray(nomData) && nomData[0]) {
      const item = nomData[0];
      return NextResponse.json({ lat: Number(item.lat), lng: Number(item.lon), formatted_address: item.display_name, source: 'nominatim' });
    }
  } catch (e) {
    console.error('Nominatim geocoding failed', e);
  }

  return NextResponse.json({ error: "Geocoding failed" }, { status: 404 });
}

export async function POST(request) {
  try {
    const { address } = await request.json();
    
    if (!address) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    return forwardGeocode(address);
  } catch (error) {
    console.error("Geocoding error:", error);
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
  }
}
