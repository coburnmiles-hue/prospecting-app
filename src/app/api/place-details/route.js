export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name');
    const address = searchParams.get('address');

    if (!name || !address) {
      return Response.json({ error: 'Name and address required' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'Google Places API key not configured' }, { status: 500 });
    }

    // First, search for the place to get its place_id
    const searchQuery = `${name} ${address}`;
    const searchUrl = `https://places.googleapis.com/v1/places:searchText`;
    
    const searchResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.regularOpeningHours,places.currentOpeningHours,places.websiteUri'
      },
      body: JSON.stringify({
        textQuery: searchQuery,
        maxResultCount: 1
      })
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('Google Places search error:', searchResponse.status, errorText);
      return Response.json({ error: 'Failed to find place' }, { status: searchResponse.status });
    }

    const searchData = await searchResponse.json();
    
    if (!searchData.places || searchData.places.length === 0) {
      return Response.json({ error: 'Place not found' }, { status: 404 });
    }

    const place = searchData.places[0];
    const hours = place.regularOpeningHours || place.currentOpeningHours;
    
    if (!hours) {
      return Response.json({ hours: null, message: 'Hours not available' }, { status: 200 });
    }

    // Format the hours data
    const formattedHours = {
      weekdayDescriptions: hours.weekdayDescriptions || [],
      openNow: hours.openNow,
      periods: hours.periods || []
    };

    return Response.json({ 
      hours: formattedHours, 
      website: place.websiteUri || null 
    }, { status: 200 });
  } catch (err) {
    console.error('Place details API error:', err);
    return Response.json({ error: 'Failed to fetch place details' }, { status: 500 });
  }
}
