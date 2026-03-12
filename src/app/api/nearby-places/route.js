import { NextResponse } from 'next/server';

const MAJOR_CHAIN_PATTERNS = [
  'mcdonald', 'burger king', 'wendy', 'taco bell', 'kfc', 'chick-fil-a', 'chipotle',
  'starbucks', 'dunkin', 'subway', 'domino', 'pizza hut', 'papa john', 'little caesars',
  'sonic', 'whataburger', 'jack in the box', 'arbys', 'panera', 'olive garden',
  'red lobster', 'applebee', 'chili', 'buffalo wild wings', 'ihop', 'denny', 'waffle house',
  'outback steakhouse', 'longhorn steakhouse', 'cheddar', 'cracker barrel', 'jimmy john',
  'jersey mike', 'five guys', 'shake shack', 'qdoba', 'raising cane', 'panda express',
  'popeyes', 'del taco', 'dairy queen', 'cold stone', 'baskin-robbins', 'einstein bros',
  'peet\'s coffee', 'smoothie king', 'jamba', 'first watch', 'yard house', 'pf chang',
  'bonefish grill', 'fogo de chao', 'carrabba', 'bj\'s restaurant', 'twin peaks',
  'hooters', 'hard rock cafe'
];

function normalizeName(value = '') {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMajorChain(name = '') {
  const normalized = normalizeName(name);
  return MAJOR_CHAIN_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * Search for nearby restaurants, bars, and cafes using Google Places API
 * Query params:
 *   - lat: latitude
 *   - lng: longitude
 *   - radius: search radius in meters (default 5000)
 *   - type: place type (restaurant, bar, cafe)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const radius = searchParams.get('radius') || '5000';
    const type = searchParams.get('type') || 'restaurant';

    if (!lat || !lng) {
      return NextResponse.json(
        { error: 'Latitude and longitude required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Google Places API key not configured (set GOOGLE_PLACES_API_KEY in .env.local)' },
        { status: 500 }
      );
    }

    // Build the request URL for Google Places Nearby Search
    const types = ['restaurant', 'bar', 'cafe'];
    if (!types.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be one of: restaurant, bar, cafe' },
        { status: 400 }
      );
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.append('location', `${lat},${lng}`);
    url.searchParams.append('radius', radius);
    url.searchParams.append('type', type);
    url.searchParams.append('key', apiKey);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: `HTTP ${response.status}: Failed to fetch from Google Places` },
        { status: response.status }
      );
    }

    if (data.status !== 'OK') {
      const statusMessages = {
        'ZERO_RESULTS': 'No restaurants found in this area',
        'OVER_QUERY_LIMIT': 'API quota exceeded - please try again later',
        'REQUEST_DENIED': 'Request denied - check API key and permissions',
        'INVALID_REQUEST': 'Invalid request parameters',
        'UNKNOWN_ERROR': 'Google Places API encountered an unknown error'
      };
      const errorMsg = statusMessages[data.status] || data.error_message || data.status;
      console.error('Google Places API error:', data.status, errorMsg);
      return NextResponse.json(
        { error: errorMsg },
        { status: 400 }
      );
    }

    const filteredResults = (data.results || [])
      .filter((place) => !isMajorChain(place?.name || ''))
      .map(place => ({
      name: place.name,
      lat: place.geometry.location.lat,
      lng: place.geometry.location.lng,
      address: place.vicinity,
      placeId: place.place_id,
      types: place.types || [],
      isOpen: place.opening_hours?.open_now,
      rating: place.rating,
      photos: place.photos?.map(p => p.photo_reference) || [],
      }));

    return NextResponse.json({
      success: true,
      results: filteredResults,
      count: filteredResults.length,
    });
  } catch (error) {
    console.error('Nearby places search error:', error);
    return NextResponse.json(
      { error: 'Failed to search places' },
      { status: 500 }
    );
  }
}
