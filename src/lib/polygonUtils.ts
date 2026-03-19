export type Point = [number, number]; // [longitude, latitude]
export type Polygon = Point[];

// Generic parser for polygon strings
// Supports:
// 1. WKT format: POLYGON((x y, ...)) or ((x y, ...))
// 2. Simple format: line-separated "lon lat" with # comments
export function parsePolygonString(input: string): { polygon: Polygon | null; error: string | null } {
    if (!input) return { polygon: null, error: null }; // Empty string is not an error, just no polygon

    const trimmed = input.trim();
    const upper = trimmed.toUpperCase();

    // 1. Try WKT-style parsing if it looks like WKT
    if (upper.startsWith('POLYGON') || upper.startsWith('((')) {
        return parseWKTPolygon(trimmed);
    }

    // 2. Try Simple List parsing
    return parseSimplePolygonList(trimmed);
}

// Internal helper for WKT
function parseWKTPolygon(wkt: string): { polygon: Polygon | null; error: string | null } {
    let cleanWkt = wkt.toUpperCase();

    // Remove POLYGON prefix if present
    if (cleanWkt.startsWith('POLYGON')) {
        cleanWkt = cleanWkt.substring(7).trim();
    }

    try {
        const contentMatch = cleanWkt.match(/\(\((.*?)\)\)/);
        if (!contentMatch) {
            return { polygon: null, error: "Invalid WKT format: Must use ((lon lat, ...))" };
        }

        const coordsString = contentMatch[1];
        const pairs = coordsString.split(',');

        const polygon: Polygon = [];
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i].trim();
            if (!pair) continue;

            // Handle space, tab, or comma-separated lon lat
            const parts = pair.split(/[\s,\t]+/);
            if (parts.length < 2) return { polygon: null, error: `Invalid coordinate: "${pair}"` };

            const point = parsePoint(parts[0], parts[1], i);
            if (point.error) return { polygon: null, error: point.error };
            if (point.point) polygon.push(point.point);
        }

        if (polygon.length < 3) return { polygon: null, error: "Polygon must have at least 3 points" };
        return { polygon, error: null };
    } catch (e) {
        return { polygon: null, error: "Error parsing WKT string" };
    }
}

// Internal helper for Simple List
function parseSimplePolygonList(text: string): { polygon: Polygon | null; error: string | null } {
    const lines = text.split(/\r?\n/);
    const polygon: Polygon = [];
    let validLines = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue; // Skip empty lines and comments

        // Split by common delimiters: spaces, tabs, commas, semicolons
        const parts = line.split(/[\s,;\t]+/);
        if (parts.length < 2) {
            return { polygon: null, error: `Invalid format at line ${i + 1}: "${line}"` };
        }

        const point = parsePoint(parts[0], parts[1], validLines);
        if (point.error) return { polygon: null, error: `Line ${i + 1}: ${point.error}` };
        if (point.point) polygon.push(point.point);
        validLines++;
    }

    if (polygon.length < 3) return { polygon: null, error: "Polygon must have at least 3 points" };
    return { polygon, error: null };
}

function parsePoint(lonStr: string, latStr: string, index: number): { point: Point | null, error: string | null } {
    const lon = parseFloat(lonStr);
    const lat = parseFloat(latStr);

    if (isNaN(lon) || isNaN(lat)) return { point: null, error: "Invalid numbers" };

    if (lat < -90 || lat > 90) return { point: null, error: `Lat ${lat} out of bounds` };
    // Allow extended Leaflet coordinates (> 180°) that occur when drawing near the antimeridian.
    // The ray-casting test handles these correctly without normalisation.
    if (lon < -360 || lon > 360) return { point: null, error: `Lon ${lon} out of bounds` };

    return { point: [lon, lat], error: null };
}

// Ray-casting algorithm for point in polygon (single reference frame)
function raycast(point: Point, polygon: Polygon): boolean {
    const x = point[0];
    const y = point[1];
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Point-in-polygon test that handles Leaflet's extended longitude coordinates.
// When drawing near 180° Leaflet emits vertices > 180° (or < -180°). Earthquake
// coordinates from GeoNet are in the standard [-180, 180] range. Testing with
// lon ± 360° covers any mismatch between the two reference frames.
export function isPointInPolygon(point: Point, polygon: Polygon): boolean {
    const lon = point[0];
    const lat = point[1];
    return raycast([lon, lat], polygon)
        || raycast([lon + 360, lat], polygon)
        || raycast([lon - 360, lat], polygon);
}
