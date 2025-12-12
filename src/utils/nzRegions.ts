/**
 * New Zealand region and locality determination from latitude/longitude
 * Based on approximate geographic boundaries
 */

interface Region {
    name: string;
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    priority: number; // Higher priority regions checked first
}

interface City {
    name: string;
    lat: number;
    lon: number;
    region: string;
}

// Major New Zealand regions with approximate boundaries
const NZ_REGIONS: Region[] = [
    // North Island - from north to south
    { name: 'Northland', minLat: -34.4, maxLat: -36.5, minLon: 172.5, maxLon: 174.8, priority: 2 },
    { name: 'Auckland', minLat: -36.5, maxLat: -37.5, minLon: 174.0, maxLon: 175.5, priority: 3 },
    { name: 'Waikato', minLat: -37.3, maxLat: -38.7, minLon: 174.5, maxLon: 176.3, priority: 2 },
    { name: 'Bay of Plenty', minLat: -37.5, maxLat: -38.3, minLon: 176.0, maxLon: 177.5, priority: 2 },
    { name: 'Gisborne', minLat: -37.8, maxLat: -38.8, minLon: 177.5, maxLon: 178.6, priority: 2 },
    { name: 'Taranaki', minLat: -38.7, maxLat: -39.8, minLon: 173.5, maxLon: 175.0, priority: 2 },
    { name: 'Hawke\'s Bay', minLat: -38.8, maxLat: -40.2, minLon: 176.0, maxLon: 177.5, priority: 2 },
    { name: 'Manawatū-Whanganui', minLat: -39.2, maxLat: -40.5, minLon: 174.5, maxLon: 176.5, priority: 2 },
    { name: 'Wellington', minLat: -40.5, maxLat: -41.6, minLon: 174.5, maxLon: 175.8, priority: 3 },

    // South Island - from north to south
    { name: 'Tasman', minLat: -40.7, maxLat: -41.8, minLon: 172.0, maxLon: 173.5, priority: 2 },
    { name: 'Nelson', minLat: -41.0, maxLat: -41.6, minLon: 172.8, maxLon: 173.5, priority: 2 },
    { name: 'Marlborough', minLat: -41.0, maxLat: -42.3, minLon: 173.3, maxLon: 174.5, priority: 2 },
    { name: 'West Coast', minLat: -41.7, maxLat: -44.3, minLon: 168.5, maxLon: 171.5, priority: 2 },
    { name: 'Canterbury', minLat: -42.5, maxLat: -44.5, minLon: 170.5, maxLon: 173.5, priority: 2 },
    { name: 'Otago', minLat: -44.5, maxLat: -46.3, minLon: 168.0, maxLon: 171.0, priority: 2 },
    { name: 'Southland', minLat: -45.5, maxLat: -47.0, minLon: 166.5, maxLon: 169.5, priority: 2 },

    // Offshore regions
    { name: 'Fiordland', minLat: -44.5, maxLat: -46.5, minLon: 166.0, maxLon: 168.5, priority: 2 },
    { name: 'Kermadec Islands', minLat: -29.0, maxLat: -32.0, minLon: -178.5, maxLon: -177.0, priority: 1 },
    { name: 'Chatham Islands', minLat: -44.5, maxLat: -43.5, minLon: -177.0, maxLon: -176.0, priority: 1 },

    // Generic offshore areas
    { name: 'East of North Island', minLat: -34.0, maxLat: -41.5, minLon: 178.0, maxLon: 180.0, priority: 1 },
    { name: 'East of South Island', minLat: -41.5, maxLat: -47.0, minLon: 174.0, maxLon: 180.0, priority: 1 },
    { name: 'North of New Zealand', minLat: -34.0, maxLat: -29.0, minLon: 172.0, maxLon: 179.0, priority: 1 },
];

// Major cities and localities for more specific location naming
const NZ_CITIES: City[] = [
    // North Island
    { name: 'Auckland', lat: -36.85, lon: 174.76, region: 'Auckland' },
    { name: 'Wellington', lat: -41.29, lon: 174.78, region: 'Wellington' },
    { name: 'Hamilton', lat: -37.78, lon: 175.28, region: 'Waikato' },
    { name: 'Tauranga', lat: -37.69, lon: 176.17, region: 'Bay of Plenty' },
    { name: 'Rotorua', lat: -38.14, lon: 176.25, region: 'Bay of Plenty' },
    { name: 'Gisborne', lat: -38.66, lon: 178.02, region: 'Gisborne' },
    { name: 'New Plymouth', lat: -39.06, lon: 174.08, region: 'Taranaki' },
    { name: 'Napier', lat: -39.49, lon: 176.92, region: 'Hawke\'s Bay' },
    { name: 'Hastings', lat: -39.64, lon: 176.84, region: 'Hawke\'s Bay' },
    { name: 'Palmerston North', lat: -40.35, lon: 175.61, region: 'Manawatū-Whanganui' },
    { name: 'Whanganui', lat: -39.93, lon: 175.05, region: 'Manawatū-Whanganui' },

    // South Island
    { name: 'Christchurch', lat: -43.53, lon: 172.64, region: 'Canterbury' },
    { name: 'Dunedin', lat: -45.87, lon: 170.50, region: 'Otago' },
    { name: 'Invercargill', lat: -46.41, lon: 168.35, region: 'Southland' },
    { name: 'Nelson', lat: -41.27, lon: 173.28, region: 'Nelson' },
    { name: 'Queenstown', lat: -45.03, lon: 168.66, region: 'Otago' },
    { name: 'Blenheim', lat: -41.52, lon: 173.95, region: 'Marlborough' },
    { name: 'Timaru', lat: -44.40, lon: 171.25, region: 'Canterbury' },
    { name: 'Greymouth', lat: -42.45, lon: 171.21, region: 'West Coast' },

    // Notable geological features
    { name: 'Kaikōura', lat: -42.40, lon: 173.68, region: 'Canterbury' },
    { name: 'Lake Taupō', lat: -38.82, lon: 176.08, region: 'Waikato' },
    { name: 'Mt Ruapehu', lat: -39.28, lon: 175.57, region: 'Manawatū-Whanganui' },
    { name: 'Fiordland', lat: -45.42, lon: 167.72, region: 'Fiordland' },
    { name: 'Cook Strait', lat: -41.35, lon: 174.50, region: 'Wellington' },
];

/**
 * Calculate distance between two points using Haversine formula
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
             Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
             Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Find the region for a given latitude and longitude
 */
function getRegion(lat: number, lon: number): string | null {
    // Normalize longitude to -180 to 180 range
    let normLon = lon;
    while (normLon > 180) normLon -= 360;
    while (normLon < -180) normLon += 360;

    // Sort regions by priority (higher first)
    const sortedRegions = [...NZ_REGIONS].sort((a, b) => b.priority - a.priority);

    // Find matching regions
    for (const region of sortedRegions) {
        if (lat >= region.minLat && lat <= region.maxLat &&
            normLon >= region.minLon && normLon <= region.maxLon) {
            return region.name;
        }
    }

    return null;
}

/**
 * Find the nearest city to a given latitude and longitude
 */
function getNearestCity(lat: number, lon: number, maxDistance: number = 100): { name: string; distance: number } | null {
    let nearestCity: { name: string; distance: number } | null = null;
    let minDistance = maxDistance;

    for (const city of NZ_CITIES) {
        const distance = haversineDistance(lat, lon, city.lat, city.lon);
        if (distance < minDistance) {
            minDistance = distance;
            nearestCity = { name: city.name, distance };
        }
    }

    return nearestCity;
}

/**
 * Get compass direction from a point
 */
function getDirection(lat1: number, lon1: number, lat2: number, lon2: number): string {
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const angle = Math.atan2(dLon, dLat) * 180 / Math.PI;

    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((angle + 360) % 360) / 45) % 8;
    return directions[index];
}

/**
 * Determine locality name from latitude and longitude
 * Returns a human-readable location string for New Zealand earthquakes
 */
export function getLocalityFromCoordinates(lat: number, lon: number): string {
    // Find nearest city within 100km
    const nearestCity = getNearestCity(lat, lon, 100);

    if (nearestCity && nearestCity.distance < 30) {
        // Very close to a major city
        return `Near ${nearestCity.name}`;
    } else if (nearestCity && nearestCity.distance < 100) {
        // Within 100km of a city - give direction and distance
        const cityData = NZ_CITIES.find(c => c.name === nearestCity.name);
        if (cityData) {
            const direction = getDirection(cityData.lat, cityData.lon, lat, lon);
            return `${Math.round(nearestCity.distance)} km ${direction} of ${nearestCity.name}`;
        }
    }

    // Fall back to region
    const region = getRegion(lat, lon);
    if (region) {
        return region;
    }

    // Offshore or outside known regions
    if (lat < -47) {
        return 'South of New Zealand';
    } else if (lat > -34) {
        return 'North of New Zealand';
    } else if (lon > 179 || lon < -175) {
        return 'East of New Zealand';
    } else if (lon < 166) {
        return 'West of New Zealand';
    }

    return 'New Zealand region';
}

/**
 * Enhance earthquake locality if it's unknown
 */
export function enhanceEarthquakeLocality(locality: string, lat: number, lon: number): string {
    if (locality && locality !== 'Unknown Location' && locality.trim() !== '') {
        return locality;
    }

    return getLocalityFromCoordinates(lat, lon);
}
