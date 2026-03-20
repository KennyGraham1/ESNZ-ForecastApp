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
const NZ_BBOX = [163.0, -49.0, 179.9, -30.0]; // Extended to include Kermadec Islands
const MAX_CONCURRENT_REQUESTS = 5;

function formatDate(date) {
    return date.toISOString().slice(0, 19); // yyyy-MM-ddTHH:mm:ss
}

function addMonths(date, n) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
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
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`  ❌ HTTP ${response.status}`);
            return [];
        }
        const data = await response.json();
        const features = (data.features || []).map(f => ({
            eventID: f.properties.publicid,
            time: f.properties.origintime,
            timeMs: new Date(f.properties.origintime).getTime(),
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
        })).filter(eq => !isNaN(new Date(eq.time).getTime()));

        if (features.length >= 20000) {
            console.warn(`  ⚠️  Hit 20k limit — data may be truncated for this chunk`);
        }
        console.log(`  ✅ ${features.length} events`);
        return features;
    } catch (err) {
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

    return results.flat();
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
