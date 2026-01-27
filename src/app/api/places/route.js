export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query');
    const city = searchParams.get('city');

    if (!query || query.trim().length < 3) {
      return Response.json({ error: 'Query must be at least 3 characters' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      console.error('GOOGLE_PLACES_API_KEY not set');
      return Response.json({ error: 'Places API key not configured' }, { status: 500 });
    }

    // Build search query - add city filter and restrict to Texas
    let searchQuery = query.trim();
    if (city && city.trim()) {
      searchQuery += ` ${city.trim()} TX`;
    } else {
      searchQuery += ' Texas';
    }

    // Use Google Places API (new) Text Search
    const url = `https://places.googleapis.com/v1/places:searchText`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.id,places.types'
      },
      body: JSON.stringify({
        textQuery: searchQuery,
        maxResultCount: 20,
        locationBias: {
          rectangle: {
            low: { latitude: 25.8371, longitude: -106.6456 },
            high: { latitude: 36.5007, longitude: -93.5083 }
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Places API error:', response.status, errorText);
      return Response.json({ error: `Places API error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    
    // Transform to our format
    const results = (data.places || []).map(place => ({
      name: place.displayName?.text || 'Unnamed',
      address: place.formattedAddress || '',
      lat: place.location?.latitude || null,
      lng: place.location?.longitude || null,
      place_id: place.id || '',
      types: place.types || []
    }));

    return Response.json({ results }, { status: 200 });
  } catch (err) {
    console.error('Places API route error:', err);
    return Response.json({ error: 'Failed to search places' }, { status: 500 });
  }
}
