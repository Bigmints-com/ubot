/**
 * Google Places API Service
 * 
 * Search for businesses/places, get details, find nearby places.
 * Uses the Places API (New) via the googleapis library.
 */

// Auth type uses any to avoid version conflicts

// The Places API (New) uses REST endpoints directly
const PLACES_BASE = 'https://places.googleapis.com/v1';

/** Helper to make authenticated Places API requests */
async function placesRequest(
  auth: any,
  path: string,
  method: 'GET' | 'POST' = 'POST',
  body?: any,
  fieldMask?: string,
): Promise<any> {
  const token = await auth.getAccessToken();
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token.token}`,
    'Content-Type': 'application/json',
  };
  if (fieldMask) {
    headers['X-Goog-FieldMask'] = fieldMask;
  }

  const response = await fetch(`${PLACES_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Places API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/** Format a place for display */
function formatPlace(place: any): string {
  const name = place.displayName?.text || place.name || '(unnamed)';
  const address = place.formattedAddress || '';
  const rating = place.rating ? `⭐ ${place.rating}` : '';
  const types = (place.types || []).slice(0, 3).join(', ');
  const phone = place.internationalPhoneNumber || place.nationalPhoneNumber || '';
  const website = place.websiteUri || '';
  const status = place.businessStatus || '';
  const openNow = place.currentOpeningHours?.openNow;

  const parts = [`📍 **${name}**`];
  if (address) parts.push(`   ${address}`);
  if (rating) parts.push(`   ${rating} ${place.userRatingCount ? `(${place.userRatingCount} reviews)` : ''}`);
  if (types) parts.push(`   Type: ${types}`);
  if (phone) parts.push(`   📞 ${phone}`);
  if (website) parts.push(`   🌐 ${website}`);
  if (openNow !== undefined) parts.push(`   ${openNow ? '🟢 Open now' : '🔴 Closed'}`);
  if (status === 'CLOSED_TEMPORARILY') parts.push('   ⚠️ Temporarily closed');
  if (status === 'CLOSED_PERMANENTLY') parts.push('   ❌ Permanently closed');

  return parts.join('\n');
}

/**
 * Search for places (text search).
 */
export async function placesSearch(
  auth: any,
  query: string,
  maxResults?: number,
): Promise<string> {
  const fieldMask = 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.types,places.internationalPhoneNumber,places.websiteUri,places.businessStatus,places.currentOpeningHours';

  const data = await placesRequest(
    auth,
    '/places:searchText',
    'POST',
    {
      textQuery: query,
      maxResultCount: maxResults ?? 10,
    },
    fieldMask,
  );

  const places = data.places || [];
  if (places.length === 0) {
    return `No places found for "${query}".`;
  }

  const formatted = places.map(formatPlace).join('\n\n');
  return `Found ${places.length} place(s) for "${query}":\n\n${formatted}`;
}

/**
 * Get details for a specific place.
 */
export async function placesDetails(
  auth: any,
  placeId: string,
): Promise<string> {
  const fieldMask = 'displayName,formattedAddress,rating,userRatingCount,types,internationalPhoneNumber,websiteUri,businessStatus,currentOpeningHours,editorialSummary,reviews';

  const data = await placesRequest(
    auth,
    `/places/${placeId}`,
    'GET',
    undefined,
    fieldMask,
  );

  const result = formatPlace(data);

  // Add editorial summary
  let extra = '';
  if (data.editorialSummary?.text) {
    extra += `\n   📝 ${data.editorialSummary.text}`;
  }

  // Add recent reviews
  const reviews = data.reviews || [];
  if (reviews.length > 0) {
    extra += '\n\n**Recent Reviews:**';
    for (const review of reviews.slice(0, 3)) {
      const author = review.authorAttribution?.displayName || 'Anonymous';
      const stars = '⭐'.repeat(review.rating || 0);
      const text = review.text?.text || '';
      extra += `\n   ${stars} — **${author}**: ${text.slice(0, 150)}`;
    }
  }

  return `${result}${extra}`;
}

/**
 * Find places nearby a location.
 */
export async function placesNearby(
  auth: any,
  options: { latitude: number; longitude: number; radius?: number; type?: string; maxResults?: number },
): Promise<string> {
  const fieldMask = 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.types,places.internationalPhoneNumber,places.websiteUri,places.businessStatus,places.currentOpeningHours';

  const body: any = {
    locationRestriction: {
      circle: {
        center: {
          latitude: options.latitude,
          longitude: options.longitude,
        },
        radius: options.radius || 1000, // default 1km
      },
    },
    maxResultCount: options.maxResults ?? 10,
  };

  if (options.type) {
    body.includedTypes = [options.type];
  }

  const data = await placesRequest(
    auth,
    '/places:searchNearby',
    'POST',
    body,
    fieldMask,
  );

  const places = data.places || [];
  if (places.length === 0) {
    return `No places found nearby (${options.latitude}, ${options.longitude}).`;
  }

  const formatted = places.map(formatPlace).join('\n\n');
  return `Found ${places.length} place(s) nearby:\n\n${formatted}`;
}
