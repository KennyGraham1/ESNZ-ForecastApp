/**
 * Browser-side GeoNet earthquake fetching.
 * Routes requests through /api/earthquakes/proxy to avoid CORS issues.
 * Uses bounded concurrency, recursive date splitting, strict feature parsing,
 * local event-type filtering, and structured fetch reports so incomplete
 * catalogue pulls are visible to the UI instead of silently becoming gaps.
 */

import { addMonths, differenceInMilliseconds, format } from 'date-fns';
import { StoredEarthquake } from './earthquakeCache';

const PROXY_BASE = '/api/earthquakes/proxy';
export const GEONET_NZ_BBOX = [163.0, -49.0, 179.9, -27.0] as const;

const MAX_CONCURRENT = 5;
const GEONET_MAX_FEATURES = 20_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 600;
const MIN_SPLIT_INTERVAL_MS = 24 * 60 * 60 * 1000;

type FetchIssueType = 'http' | 'network' | 'parse' | 'truncated' | 'empty';

export interface GeoNetFetchIssue {
    type: FetchIssueType;
    start: string;
    end: string;
    status?: number;
    message: string;
}

export interface GeoNetFetchReport {
    events: StoredEarthquake[];
    chunksTotal: number;
    chunksSucceeded: number;
    chunksFailed: number;
    chunksEmpty: number;
    chunksSplit: number;
    truncatedChunks: number;
    invalidFeatures: number;
    duplicateEvents: number;
    partial: boolean;
    issues: GeoNetFetchIssue[];
}

interface FetchOptions {
    eventType?: string | null;
    onProgress?: (done: number, total: number) => void;
}

interface Chunk {
    start: Date;
    end: Date;
}

interface ChunkResult {
    events: StoredEarthquake[];
    succeeded: boolean;
    empty: boolean;
    splitCount: number;
    truncatedCount: number;
    invalidFeatures: number;
    issues: GeoNetFetchIssue[];
}

interface GeoNetFeature {
    geometry?: { coordinates?: unknown[] };
    properties?: Record<string, unknown>;
}

function isWithinNZBounds(lat: number, lon: number): boolean {
    const [minLon, minLat, maxLon, maxLat] = GEONET_NZ_BBOX;
    return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

function formatUtc(date: Date): string {
    return date.toISOString().slice(0, 19);
}

function labelDate(date: Date): string {
    return format(date, 'yyyy-MM-dd');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function asFiniteNumber(value: unknown): number | null {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

function asOptionalNumber(value: unknown): number | undefined {
    return value === undefined || value === null || value === '' ? undefined : asFiniteNumber(value) ?? undefined;
}

function asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function issue(type: FetchIssueType, chunk: Chunk, message: string, status?: number): GeoNetFetchIssue {
    return {
        type,
        start: formatUtc(chunk.start),
        end: formatUtc(chunk.end),
        status,
        message,
    };
}

function parseGeoNetFeature(feature: GeoNetFeature, eventType?: string | null): StoredEarthquake | null {
    const props = feature.properties;
    const coords = feature.geometry?.coordinates;
    if (!props || !Array.isArray(coords)) return null;

    const eventID = asOptionalString(props.publicid);
    const time = asOptionalString(props.origintime);
    const lon = asFiniteNumber(coords[0]);
    const lat = asFiniteNumber(coords[1]);
    const depth = asFiniteNumber(props.depth);
    const magnitude = asFiniteNumber(props.magnitude);
    const featureEventType = asOptionalString(props.eventtype);

    if (
        !eventID ||
        !time ||
        lon === null ||
        lat === null ||
        depth === null ||
        magnitude === null ||
        !isWithinNZBounds(lat, lon)
    ) {
        return null;
    }

    if (eventType && featureEventType?.toLowerCase() !== eventType.toLowerCase()) {
        return null;
    }

    const timeMs = new Date(time).getTime();
    if (!Number.isFinite(timeMs)) return null;

    return {
        eventID,
        time,
        timeMs,
        latitude: lat,
        longitude: lon,
        depth,
        magnitude,
        locality: asOptionalString(props.locality) || 'Unknown Location',
        eventType: featureEventType,
        magnitudeType: asOptionalString(props.magnitudetype),
        evaluationStatus: asOptionalString(props.evaluationstatus),
        evaluationMode: asOptionalString(props.evaluationmode),
        modificationTime: asOptionalString(props.modificationtime),
        earthModel: asOptionalString(props.earthmodel),
        azimuthalGap: asOptionalNumber(props.azimuthalgap),
        magnitudeUncertainty: asOptionalNumber(props.magnitudeuncertainty),
        magnitudeStationCount: asOptionalNumber(props.magnitudestationcount),
        minimumDistance: asOptionalNumber(props.minimumdistance),
        standardError: asOptionalNumber(props.standarderror),
        originError: asOptionalNumber(props.originerror),
        evaluationMethod: asOptionalString(props.evaluationmethod),
        usedPhaseCount: asOptionalNumber(props.usedphasecount),
        usedStationCount: asOptionalNumber(props.usedstationcount),
    };
}

function buildMonthlyChunks(startDate: Date, endDate: Date): Chunk[] {
    const chunks: Chunk[] = [];
    let cur = new Date(startDate);

    while (cur < endDate) {
        const next = addMonths(cur, 1);
        chunks.push({
            start: new Date(cur),
            end: next > endDate ? new Date(endDate) : new Date(next),
        });
        cur = next;
    }

    return chunks;
}

function splitChunk(chunk: Chunk): [Chunk, Chunk] {
    const mid = new Date(chunk.start.getTime() + Math.floor((chunk.end.getTime() - chunk.start.getTime()) / 2));
    return [
        { start: chunk.start, end: mid },
        { start: mid, end: chunk.end },
    ];
}

async function fetchJsonWithRetry(url: string, chunk: Chunk): Promise<{ data: any; status: number }> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return { data: await response.json(), status: response.status };
            }

            if (![429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_RETRIES) {
                throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
            }

            lastError = Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
        } catch (err) {
            lastError = err;
            if (attempt === MAX_RETRIES) break;
        }

        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
    }

    const status = typeof (lastError as any)?.status === 'number' ? (lastError as any).status : undefined;
    throw Object.assign(
        new Error(`Failed to fetch ${formatUtc(chunk.start)} to ${formatUtc(chunk.end)}: ${(lastError as Error)?.message ?? 'unknown error'}`),
        { status }
    );
}

async function fetchChunkRecursive(
    chunk: Chunk,
    minMagnitude: number,
    eventType: string | null | undefined,
    depth = 0
): Promise<ChunkResult> {
    const params = new URLSearchParams({
        bbox: GEONET_NZ_BBOX.join(','),
        minmag: minMagnitude.toString(),
        startdate: formatUtc(chunk.start),
        enddate: formatUtc(chunk.end),
    });

    const url = `${PROXY_BASE}?${params}`;

    try {
        const { data } = await fetchJsonWithRetry(url, chunk);
        const features = Array.isArray(data?.features) ? data.features as GeoNetFeature[] : [];

        if (features.length >= GEONET_MAX_FEATURES) {
            const canSplit = differenceInMilliseconds(chunk.end, chunk.start) > MIN_SPLIT_INTERVAL_MS;
            if (canSplit) {
                const [left, right] = splitChunk(chunk);
                const [a, b] = await Promise.all([
                    fetchChunkRecursive(left, minMagnitude, eventType, depth + 1),
                    fetchChunkRecursive(right, minMagnitude, eventType, depth + 1),
                ]);

                return {
                    events: [...a.events, ...b.events],
                    succeeded: a.succeeded && b.succeeded,
                    empty: a.empty && b.empty,
                    splitCount: a.splitCount + b.splitCount + 1,
                    truncatedCount: a.truncatedCount + b.truncatedCount,
                    invalidFeatures: a.invalidFeatures + b.invalidFeatures,
                    issues: [...a.issues, ...b.issues],
                };
            }

            return {
                events: [],
                succeeded: false,
                empty: false,
                splitCount: 0,
                truncatedCount: 1,
                invalidFeatures: 0,
                issues: [issue('truncated', chunk, 'GeoNet returned the maximum 20,000 features for a minimum-size chunk; data may be incomplete')],
            };
        }

        let invalidFeatures = 0;
        const events: StoredEarthquake[] = [];
        for (const feature of features) {
            const parsed = parseGeoNetFeature(feature, eventType);
            if (parsed) {
                events.push(parsed);
            } else {
                invalidFeatures++;
            }
        }

        const issues = events.length === 0
            ? [issue('empty', chunk, `GeoNet returned ${features.length} features, ${events.length} valid events after local filters`)]
            : [];

        return {
            events,
            succeeded: true,
            empty: events.length === 0,
            splitCount: 0,
            truncatedCount: 0,
            invalidFeatures,
            issues,
        };
    } catch (err) {
        const status = typeof (err as any)?.status === 'number' ? (err as any).status : undefined;
        const canSplit = differenceInMilliseconds(chunk.end, chunk.start) > MIN_SPLIT_INTERVAL_MS;
        if (status === 400 && canSplit) {
            const [left, right] = splitChunk(chunk);
            const [a, b] = await Promise.all([
                fetchChunkRecursive(left, minMagnitude, eventType, depth + 1),
                fetchChunkRecursive(right, minMagnitude, eventType, depth + 1),
            ]);

            return {
                events: [...a.events, ...b.events],
                succeeded: a.succeeded && b.succeeded,
                empty: a.empty && b.empty,
                splitCount: a.splitCount + b.splitCount + 1,
                truncatedCount: a.truncatedCount + b.truncatedCount,
                invalidFeatures: a.invalidFeatures + b.invalidFeatures,
                issues: [...a.issues, ...b.issues],
            };
        }

        return {
            events: [],
            succeeded: false,
            empty: false,
            splitCount: 0,
            truncatedCount: 0,
            invalidFeatures: 0,
            issues: [issue(status ? 'http' : 'network', chunk, err instanceof Error ? err.message : 'Unknown GeoNet fetch error', status)],
        };
    }
}

function deduplicate(events: StoredEarthquake[]): { events: StoredEarthquake[]; duplicates: number } {
    const byId = new Map<string, StoredEarthquake>();
    let duplicates = 0;

    for (const event of events) {
        const existing = byId.get(event.eventID);
        if (existing) {
            duplicates++;
            const existingModified = existing.modificationTime ? new Date(existing.modificationTime).getTime() : -Infinity;
            const eventModified = event.modificationTime ? new Date(event.modificationTime).getTime() : -Infinity;
            if (eventModified >= existingModified) {
                byId.set(event.eventID, event);
            }
        } else {
            byId.set(event.eventID, event);
        }
    }

    return {
        events: Array.from(byId.values()).sort((a, b) => b.timeMs - a.timeMs),
        duplicates,
    };
}

export async function fetchFromGeoNetWithReport(
    minMagnitude: number,
    startDate: Date,
    endDate: Date,
    options: FetchOptions = {}
): Promise<GeoNetFetchReport> {
    const chunks = buildMonthlyChunks(startDate, endDate);
    const results: ChunkResult[] = new Array(chunks.length);
    let done = 0;

    console.log(
        `📦 Fetching ${chunks.length} GeoNet chunk(s) ` +
        `(M${minMagnitude}+, ${labelDate(startDate)} → ${labelDate(endDate)})`
    );

    const executing: Promise<void>[] = [];
    for (let i = 0; i < chunks.length; i++) {
        const p = fetchChunkRecursive(chunks[i], minMagnitude, options.eventType ?? 'earthquake')
            .then(result => {
                results[i] = result;
                done++;
                options.onProgress?.(done, chunks.length);
                console.log(`  ${result.succeeded ? '✅' : '❌'} Chunk ${i + 1}/${chunks.length}: ${result.events.length} event(s)`);
            })
            .finally(() => {
                const pos = executing.indexOf(p);
                if (pos !== -1) executing.splice(pos, 1);
            });

        executing.push(p);
        if (executing.length >= MAX_CONCURRENT) {
            await Promise.race(executing);
        }
    }

    await Promise.all(executing);

    const rawEvents = results.flatMap(result => result?.events ?? []);
    const { events, duplicates } = deduplicate(rawEvents);
    const issues = results.flatMap(result => result?.issues ?? []);
    const chunksFailed = results.filter(result => result && !result.succeeded).length;
    const truncatedChunks = results.reduce((sum, result) => sum + (result?.truncatedCount ?? 0), 0);

    const report: GeoNetFetchReport = {
        events,
        chunksTotal: chunks.length,
        chunksSucceeded: results.filter(result => result?.succeeded).length,
        chunksFailed,
        chunksEmpty: results.filter(result => result?.empty).length,
        chunksSplit: results.reduce((sum, result) => sum + (result?.splitCount ?? 0), 0),
        truncatedChunks,
        invalidFeatures: results.reduce((sum, result) => sum + (result?.invalidFeatures ?? 0), 0),
        duplicateEvents: duplicates,
        partial: chunksFailed > 0 || truncatedChunks > 0,
        issues,
    };

    console.log(
        `✨ GeoNet fetch complete: ${report.events.length} event(s), ` +
        `${report.chunksFailed} failed chunk(s), ${report.truncatedChunks} truncated chunk(s)`
    );

    return report;
}

/**
 * Backward-compatible helper for callers that only need events.
 */
export async function fetchFromGeoNet(
    minMagnitude: number,
    startDate: Date,
    endDate: Date,
    onProgress?: (done: number, total: number) => void
): Promise<StoredEarthquake[]> {
    const report = await fetchFromGeoNetWithReport(minMagnitude, startDate, endDate, { onProgress });
    return report.events;
}
