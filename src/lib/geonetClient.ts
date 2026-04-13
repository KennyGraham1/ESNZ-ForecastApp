/**
 * Browser-side GeoNet earthquake fetching.
 * Routes requests through /api/earthquakes/proxy to avoid CORS issues.
 * Uses the same 1-month chunking strategy as the original geonet.ts to stay
 * within GeoNet's 20 000-event-per-request limit.
 */

import { addMonths, format } from 'date-fns';
import { StoredEarthquake } from './earthquakeCache';

const PROXY_BASE = '/api/earthquakes/proxy';
const NZ_BBOX = [163.0, -49.0, 179.9, -27.0];
const MAX_CONCURRENT = 5;

function isWithinNZBounds(lat: number, lon: number): boolean {
    return lon >= 163.0 && lon <= 179.9 && lat >= -49.0 && lat <= -27.0;
}

/**
 * Fetch earthquake events from GeoNet via the server proxy.
 *
 * @param minMagnitude  Minimum magnitude to retrieve.
 * @param startDate     Start of the date range (inclusive).
 * @param endDate       End of the date range (inclusive).
 * @param onProgress    Optional progress callback (chunks completed, chunks total).
 * @returns             Array of StoredEarthquake sorted newest-first.
 */
export async function fetchFromGeoNet(
    minMagnitude: number,
    startDate: Date,
    endDate: Date,
    onProgress?: (done: number, total: number) => void
): Promise<StoredEarthquake[]> {
    // Build 1-month chunks so we stay under the 20k event limit per request
    const chunks: { start: Date; end: Date }[] = [];
    let cur = new Date(startDate);
    while (cur < endDate) {
        const next = addMonths(cur, 1);
        chunks.push({
            start: new Date(cur),
            end: next > endDate ? new Date(endDate) : new Date(next),
        });
        cur = next;
    }

    console.log(
        `📦 Fetching ${chunks.length} monthly chunks from GeoNet ` +
        `(M${minMagnitude}+, ${format(startDate, 'yyyy-MM-dd')} → ${format(endDate, 'yyyy-MM-dd')})`
    );

    const results: StoredEarthquake[][] = new Array(chunks.length).fill(null);
    let done = 0;

    const fetchChunk = async (chunk: { start: Date; end: Date }, i: number) => {
        const params = new URLSearchParams({
            bbox: NZ_BBOX.join(','),
            minmag: minMagnitude.toString(),
            startdate: format(chunk.start, "yyyy-MM-dd'T'HH:mm:ss"),
            enddate: format(chunk.end, "yyyy-MM-dd'T'HH:mm:ss"),
        });

        try {
            const response = await fetch(`${PROXY_BASE}?${params}`);
            if (!response.ok) {
                console.error(`❌ Chunk ${i + 1}/${chunks.length} failed: HTTP ${response.status}`);
                results[i] = [];
                return;
            }

            const data = await response.json();
            const count = data.features?.length ?? 0;

            if (count >= 20000) {
                console.warn(`⚠️ Chunk ${i + 1}/${chunks.length} hit 20k limit — data may be truncated`);
            }

            results[i] = (data.features || [])
                .map((f: any): StoredEarthquake => {
                    const timeMs = new Date(f.properties.origintime).getTime();
                    return {
                        eventID: f.properties.publicid,
                        time: f.properties.origintime,
                        timeMs,
                        latitude: f.geometry.coordinates[1],
                        longitude: f.geometry.coordinates[0],
                        depth: f.properties.depth,
                        magnitude: f.properties.magnitude,
                        locality: f.properties.locality || 'Unknown Location',
                        azimuthalGap: f.properties.azimuthalgap,
                        magnitudeStationCount: f.properties.magnitudestationcount,
                        minimumDistance: f.properties.minimumdistance,
                        standardError: f.properties.standarderror,
                        originError: f.properties.originerror,
                        evaluationMethod: f.properties.evaluationmethod,
                        usedPhaseCount: f.properties.usedphasecount,
                    };
                })
                .filter((eq: StoredEarthquake) => !isNaN(eq.timeMs))
                .filter((eq: StoredEarthquake) => isWithinNZBounds(eq.latitude, eq.longitude));

            done++;
            onProgress?.(done, chunks.length);
            console.log(`  ✅ Chunk ${i + 1}/${chunks.length}: ${results[i].length} events`);
        } catch (err) {
            console.error(`  ❌ Chunk ${i + 1}/${chunks.length} error:`, err);
            results[i] = [];
        }
    };

    // Execute with concurrency limit
    const executing: Promise<void>[] = [];
    for (let i = 0; i < chunks.length; i++) {
        const p = fetchChunk(chunks[i], i).then(() => {
            executing.splice(executing.indexOf(p), 1);
        });
        executing.push(p);
        if (executing.length >= MAX_CONCURRENT) {
            await Promise.race(executing);
        }
    }
    await Promise.all(executing);

    const all = results.flat().sort((a, b) => b.timeMs - a.timeMs);
    console.log(`✨ GeoNet fetch complete: ${all.length} total events`);
    return all;
}
