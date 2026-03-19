import { GeoNetResponse, EarthquakeData } from '@/types/earthquake';
import { addMonths, format } from 'date-fns';

const BASE_URL = 'https://quakesearch.geonet.org.nz/geojson';

// New Zealand Bounding Box (minLon, minLat, maxLon, maxLat)
// Covers New Zealand mainland, surrounding seismic zones, and the Kermadec Islands/Arc (~-25°S)
const NZ_BBOX = [163.0, -49.0, 179.9, -30.0];

// Bounding box validation constants
const MIN_LONGITUDE = 163.0;
const MAX_LONGITUDE = 179.9;
const MIN_LATITUDE = -49.0;
const MAX_LATITUDE = -30.0;

// Maximum number of concurrent requests to GeoNet API
const MAX_CONCURRENT_REQUESTS = 5;

/**
 * Validates if an earthquake event is within the New Zealand bounding box
 */
function isWithinNZBounds(latitude: number, longitude: number): boolean {
    return (
        longitude >= MIN_LONGITUDE &&
        longitude <= MAX_LONGITUDE &&
        latitude >= MIN_LATITUDE &&
        latitude <= MAX_LATITUDE
    );
}

interface FetchOptions {
    minMagnitude?: number;
    daysBack?: number;
    startDate?: Date;
    endDate?: Date;
}

export async function fetchEarthquakeData(options: FetchOptions = {}): Promise<EarthquakeData[]> {
    const { minMagnitude = 3.0, daysBack = 365 } = options;

    console.log('🔍 fetchEarthquakeData called with:', { minMagnitude, daysBack, customRange: !!options.startDate });

    let endDate = options.endDate || new Date();
    let startDate = options.startDate;

    if (!startDate) {
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - daysBack);
    }

    console.log('📅 Date range:', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
    });

    // Chunking strategy: Fetch in 1-month chunks to avoid API limits (20k events)
    // GeoNet truncates results at ~20k events. In busy years (e.g., 2016), a year can have >80k events.
    const chunks: { start: Date; end: Date }[] = [];
    let currentStart = startDate;

    while (currentStart < endDate) {
        let currentEnd = addMonths(currentStart, 1);
        if (currentEnd > endDate) {
            currentEnd = endDate;
        }
        chunks.push({ start: currentStart, end: currentEnd });
        currentStart = currentEnd;
    }

    console.log(`📦 Created ${chunks.length} chunks (1-month intervals)`);
    console.log(`🚀 Fetching chunks with concurrency limit: ${MAX_CONCURRENT_REQUESTS}`);

    // Process chunks with concurrency limit
    const chunkResults: EarthquakeData[][] = [];
    const executing: Promise<void>[] = [];

    // Helper to fetch a single chunk
    const fetchChunk = async (chunk: { start: Date; end: Date }, index: number) => {
        const params = new URLSearchParams({
            bbox: NZ_BBOX.join(','),
            minmag: minMagnitude.toString(),
            startdate: format(chunk.start, "yyyy-MM-dd'T'HH:mm:ss"),
            enddate: format(chunk.end, "yyyy-MM-dd'T'HH:mm:ss"),
        });

        const url = `${BASE_URL}?${params.toString()}`;
        console.log(`  🌐 [${index + 1}/${chunks.length}] Fetching: ${format(chunk.start, 'yyyy-MM-dd')} to ${format(chunk.end, 'yyyy-MM-dd')}`);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`  ❌ [${index + 1}/${chunks.length}] HTTP ${response.status}: ${response.statusText}`);
                chunkResults[index] = [];
                return;
            }

            const data: GeoNetResponse = await response.json();
            const count = data.features?.length || 0;

            if (count >= 20000) {
                console.warn(`  ⚠️ [${index + 1}/${chunks.length}] WARNING: Chunk Hit 20k Limit! Data may be truncated.`);
            }

            console.log(`  ✅ [${index + 1}/${chunks.length}] Got ${count} events`);

            const features = (data.features || []).map((feature: any) => ({
                eventID: feature.properties.publicid,
                time: new Date(feature.properties.origintime),
                latitude: feature.geometry.coordinates[1],
                longitude: feature.geometry.coordinates[0],
                depth: feature.properties.depth,
                magnitude: feature.properties.magnitude,
                locality: feature.properties.locality || 'Unknown Location',
                // Statistical statistical seismology fields
                azimuthalGap: feature.properties.azimuthalgap,
                magnitudeStationCount: feature.properties.magnitudestationcount,
                minimumDistance: feature.properties.minimumdistance,
                standardError: feature.properties.standarderror,
                originError: feature.properties.originerror,
                evaluationMethod: feature.properties.evaluationmethod,
                usedPhaseCount: feature.properties.usedphasecount,
            }))
                .filter((eq: EarthquakeData) => !isNaN(eq.time.getTime()))
                .filter((eq: EarthquakeData) => {
                    // Validate bounding box (client-side validation as backup)
                    const isValid = isWithinNZBounds(eq.latitude, eq.longitude);
                    if (!isValid) {
                        // console.warn(`  ⚠️ Outlier detected and filtered`); 
                        // Lower log noise
                    }
                    return isValid;
                });

            chunkResults[index] = features;

        } catch (error) {
            console.error(`  ❌ [${index + 1}/${chunks.length}] Error fetching chunk:`, error);
            chunkResults[index] = [];
        }
    };

    // Execute with concurrency limit
    for (let i = 0; i < chunks.length; i++) {
        const p = fetchChunk(chunks[i], i).then(() => {
            // Remove self from executing list
            const idx = executing.indexOf(p);
            if (idx !== -1) executing.splice(idx, 1);
        });

        executing.push(p);

        if (executing.length >= MAX_CONCURRENT_REQUESTS) {
            await Promise.race(executing);
        }
    }

    // Wait for remaining
    await Promise.all(executing);

    // Flatten all results into single array
    const allEarthquakes: EarthquakeData[] = chunkResults.flat();

    console.log(`✨ Fetch complete! Total: ${allEarthquakes.length} earthquakes`);
    console.log(`📊 Bounding box: Lon [${MIN_LONGITUDE}°E, ${MAX_LONGITUDE}°E], Lat [${MIN_LATITUDE}°S, ${MAX_LATITUDE}°S]`);

    // Sort by time descending
    return allEarthquakes.sort((a, b) => b.time.getTime() - a.time.getTime());
}
