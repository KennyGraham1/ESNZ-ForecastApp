/**
 * Standalone cache update script — fetches new GeoNet events since lastUpdated
 * and merges them into the existing cache file.
 *
 * Usage: node scripts/update-cache.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, '..', 'data', 'earthquake-cache.json');
const BASE_URL = 'https://quakesearch.geonet.org.nz/geojson';
const NZ_BBOX = [163.0, -49.0, 179.9, -27.0];
const MAX_CONCURRENT_REQUESTS = 5;
const MAX_FEATURES = 20000;
const MAX_RETRIES = 3;
const MIN_SPLIT_INTERVAL_MS = 24 * 60 * 60 * 1000;

function formatDate(date) {
    return date.toISOString().slice(0, 19); // yyyy-MM-ddTHH:mm:ss
}

function addMonths(date, n) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function finiteNumber(value) {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

function optionalNumber(value) {
    return value === undefined || value === null || value === '' ? undefined : finiteNumber(value) ?? undefined;
}

function optionalString(value) {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function isWithinNZBounds(lat, lon) {
    const [minLon, minLat, maxLon, maxLat] = NZ_BBOX;
    return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

function parseFeature(f, eventType = 'earthquake') {
    const props = f?.properties;
    const coords = f?.geometry?.coordinates;
    if (!props || !Array.isArray(coords)) return null;

    const eventID = optionalString(props.publicid);
    const time = optionalString(props.origintime);
    const longitude = finiteNumber(coords[0]);
    const latitude = finiteNumber(coords[1]);
    const depth = finiteNumber(props.depth);
    const magnitude = finiteNumber(props.magnitude);
    const featureEventType = optionalString(props.eventtype);

    if (!eventID || !time || longitude === null || latitude === null || depth === null || magnitude === null) return null;
    if (!isWithinNZBounds(latitude, longitude)) return null;
    if (eventType && featureEventType?.toLowerCase() !== eventType.toLowerCase()) return null;

    const timeMs = new Date(time).getTime();
    if (!Number.isFinite(timeMs)) return null;

    return {
        eventID,
        time,
        timeMs,
        latitude,
        longitude,
        depth,
        magnitude,
        locality: props.locality || 'Unknown Location',
        eventType: featureEventType,
        magnitudeType: optionalString(props.magnitudetype),
        evaluationStatus: optionalString(props.evaluationstatus),
        evaluationMode: optionalString(props.evaluationmode),
        modificationTime: optionalString(props.modificationtime),
        earthModel: optionalString(props.earthmodel),
        azimuthalGap: optionalNumber(props.azimuthalgap),
        magnitudeUncertainty: optionalNumber(props.magnitudeuncertainty),
        magnitudeStationCount: optionalNumber(props.magnitudestationcount),
        minimumDistance: optionalNumber(props.minimumdistance),
        standardError: optionalNumber(props.standarderror),
        originError: optionalNumber(props.originerror),
        evaluationMethod: optionalString(props.evaluationmethod),
        usedPhaseCount: optionalNumber(props.usedphasecount),
        usedStationCount: optionalNumber(props.usedstationcount),
    };
}

async function fetchJsonWithRetry(url) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'ESNZ-ForecastApp cache updater',
                },
            });
            if (response.ok) return response.json();

            lastError = new Error(`HTTP ${response.status}`);
            if (![429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_RETRIES) break;
        } catch (err) {
            lastError = err;
            if (attempt === MAX_RETRIES) break;
        }

        await sleep(600 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
    }

    throw lastError;
}

function splitChunk(chunk) {
    const mid = new Date(chunk.start.getTime() + Math.floor((chunk.end.getTime() - chunk.start.getTime()) / 2));
    return [
        { start: chunk.start, end: mid },
        { start: mid, end: chunk.end },
    ];
}

async function fetchChunk(chunk, index, total, minMagnitude) {
    const params = new URLSearchParams({
        bbox: NZ_BBOX.join(','),
        minmag: minMagnitude.toString(),
        startdate: formatDate(chunk.start),
        enddate: formatDate(chunk.end),
    });
    const url = `${BASE_URL}?${params}`;
    console.log(`  [${index + 1}/${total}] ${formatDate(chunk.start)} → ${formatDate(chunk.end)}`);

    try {
        const data = await fetchJsonWithRetry(url);
        const rawFeatures = data.features || [];

        if (rawFeatures.length >= MAX_FEATURES) {
            if (chunk.end.getTime() - chunk.start.getTime() > MIN_SPLIT_INTERVAL_MS) {
                console.warn(`  ⚠️  Hit 20k limit — splitting chunk`);
                const [left, right] = splitChunk(chunk);
                const [a, b] = await Promise.all([
                    fetchChunk(left, index, total, minMagnitude),
                    fetchChunk(right, index, total, minMagnitude),
                ]);
                return [...a, ...b];
            }

            console.error(`  ❌ Hit 20k limit on a minimum-size chunk; returned data may be incomplete`);
            return [];
        }

        let invalid = 0;
        const features = [];
        for (const f of rawFeatures) {
            const parsed = parseFeature(f);
            if (parsed) features.push(parsed);
            else invalid++;
        }

        if (invalid > 0) console.warn(`  ⚠️  Skipped ${invalid} invalid/non-earthquake feature(s)`);
        console.log(`  ✅ ${features.length} events`);
        return features;
    } catch (err) {
        if (String(err?.message || '').includes('HTTP 400') && chunk.end.getTime() - chunk.start.getTime() > MIN_SPLIT_INTERVAL_MS) {
            console.warn(`  ⚠️  HTTP 400 — splitting chunk in case the result limit was exceeded`);
            const [left, right] = splitChunk(chunk);
            const [a, b] = await Promise.all([
                fetchChunk(left, index, total, minMagnitude),
                fetchChunk(right, index, total, minMagnitude),
            ]);
            return [...a, ...b];
        }
        console.error(`  ❌ Error:`, err.message);
        return [];
    }
}

async function fetchDateRange(startDate, endDate, minMagnitude = 2.0) {
    // Build 1-month chunks
    const chunks = [];
    let cur = new Date(startDate);
    while (cur < endDate) {
        let next = addMonths(cur, 1);
        if (next > endDate) next = new Date(endDate);
        chunks.push({ start: new Date(cur), end: next });
        cur = next;
    }

    console.log(`📦 ${chunks.length} chunk(s) to fetch`);

    const results = new Array(chunks.length).fill(null);
    const executing = [];

    for (let i = 0; i < chunks.length; i++) {
        const idx = i;
        const p = fetchChunk(chunks[idx], idx, chunks.length, minMagnitude).then(data => {
            results[idx] = data;
            const pos = executing.indexOf(p);
            if (pos !== -1) executing.splice(pos, 1);
        });
        executing.push(p);
        if (executing.length >= MAX_CONCURRENT_REQUESTS) {
            await Promise.race(executing);
        }
    }
    await Promise.all(executing);

    const byId = new Map();
    let duplicates = 0;
    for (const event of results.flat()) {
        if (byId.has(event.eventID)) duplicates++;
        byId.set(event.eventID, event);
    }
    if (duplicates > 0) console.warn(`⚠️  Removed ${duplicates} duplicate event(s) by public ID`);
    return Array.from(byId.values()).sort((a, b) => b.timeMs - a.timeMs);
}

async function main() {
    console.log('📂 Reading existing cache...');
    let cache;
    try {
        const raw = await fs.readFile(CACHE_FILE, 'utf-8');
        cache = JSON.parse(raw);
    } catch {
        console.error('❌ Could not read cache file at', CACHE_FILE);
        process.exit(1);
    }

    const lastUpdated = new Date(cache.lastUpdated);
    const now = new Date();
    const daysSince = Math.ceil((now - lastUpdated) / (1000 * 60 * 60 * 24));

    console.log(`📅 Cache last updated: ${lastUpdated.toISOString()}`);
    console.log(`📅 Now:               ${now.toISOString()}`);
    console.log(`🔄 Fetching ~${daysSince} day(s) of new events...\n`);

    // Fetch from 1 day before lastUpdated (buffer) to now
    const fetchFrom = new Date(lastUpdated);
    fetchFrom.setDate(fetchFrom.getDate() - 1);

    const newEvents = await fetchDateRange(fetchFrom, now, 2.0);

    // Deduplicate against existing cache
    const existingIds = new Set(cache.earthquakes.map(eq => eq.eventID));
    const unique = newEvents.filter(eq => !existingIds.has(eq.eventID));

    console.log(`\n📥 Fetched ${newEvents.length} events, ${unique.length} are new`);

    if (unique.length === 0) {
        console.log('✅ Cache is already up to date.');
        return;
    }

    // Merge and sort newest-first
    const merged = [...unique, ...cache.earthquakes].sort((a, b) => {
        const bt = b.timeMs ?? new Date(b.time).getTime();
        const at = a.timeMs ?? new Date(a.time).getTime();
        return bt - at;
    });

    const updated = {
        earthquakes: merged,
        lastUpdated: now.toISOString(),
        initialFetchDate: cache.initialFetchDate,
        totalEvents: merged.length,
    };

    console.log(`💾 Saving updated cache (${merged.length} total events)...`);
    await fs.writeFile(CACHE_FILE, JSON.stringify(updated, null, 2));
    console.log(`✅ Done. Cache updated: ${cache.totalEvents} → ${merged.length} events (+${unique.length} new)`);
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
