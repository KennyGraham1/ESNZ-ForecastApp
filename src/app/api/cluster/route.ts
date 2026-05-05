/**
 * POST /api/cluster
 *
 * Server-side clustering endpoint for heavy O(n²) algorithms on large datasets.
 * Called by useClusteringWorker when: algorithm ∈ {hdbscan, nearest-neighbor,
 * tmc, hardebeck-2019} AND n > 10,000.
 *
 * Request body:
 *   { earthquakes: EarthquakeData[], options: SpatialClusteringOptions }
 *   Dates arrive as ISO strings and are re-hydrated before computation.
 *
 * Response:
 *   ClusterResult JSON on success, { error: string } with 4xx/5xx on failure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { calculateSpatialClustering } from '@/lib/analysis/clustering';
import type { SpatialClusteringOptions } from '@/lib/analysis/clusteringTypes';
import type { ClusterResult } from '@/lib/analysis/clusteringTypes';
import type { EarthquakeData } from '@/types/earthquake';

// Extend Vercel's function timeout for long-running algorithms
export const maxDuration = 60;

// ── Server-side in-memory LRU cache ──────────────────────────────────────────
// Keyed by SHA-256(sortedEventIDs + algorithm + params).
// Survives multiple requests on the same Node.js instance (single Vercel function
// invocation) — gives instant responses for identical repeated queries from
// different browser sessions without re-running O(n²) algorithms.

const SERVER_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const SERVER_CACHE_MAX = 30;

interface ServerCacheEntry { result: ClusterResult; expiresAt: number; }
const serverCache = new Map<string, ServerCacheEntry>();

function serverCacheKey(earthquakes: EarthquakeData[], options: SpatialClusteringOptions): string {
    const payload = JSON.stringify({
        algo: options.algorithm,
        opts: options,
        ids: earthquakes.map(e => e.eventID).sort(),
    });
    return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function serverCacheGet(key: string): ClusterResult | null {
    const entry = serverCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { serverCache.delete(key); return null; }
    return entry.result;
}

function serverCacheSet(key: string, result: ClusterResult): void {
    if (serverCache.size >= SERVER_CACHE_MAX) {
        serverCache.delete(serverCache.keys().next().value as string);
    }
    serverCache.set(key, { result, expiresAt: Date.now() + SERVER_CACHE_TTL });
}

export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
        return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
    }

    const { earthquakes: rawEarthquakes, options } = body as {
        earthquakes: unknown;
        options: unknown;
    };

    if (!Array.isArray(rawEarthquakes) || rawEarthquakes.length === 0) {
        return NextResponse.json(
            { error: 'earthquakes must be a non-empty array' },
            { status: 400 }
        );
    }

    if (!options || typeof options !== 'object' || !('algorithm' in options)) {
        return NextResponse.json(
            { error: 'options must be an object with at least an algorithm field' },
            { status: 400 }
        );
    }

    // Re-hydrate Date objects — they arrive as ISO strings over JSON
    const earthquakes: EarthquakeData[] = (rawEarthquakes as Record<string, unknown>[]).map(eq => ({
        ...(eq as EarthquakeData),
        time: typeof eq.time === 'string' ? new Date(eq.time) : eq.time as Date,
        timeMs:
            typeof eq.timeMs === 'number'
                ? eq.timeMs
                : typeof eq.time === 'string'
                ? new Date(eq.time).getTime()
                : undefined,
    }));

    const clusterOptions = options as SpatialClusteringOptions;

    // Check server-side cache first — avoids recomputing expensive O(n²) algorithms
    const cacheKey = serverCacheKey(earthquakes, clusterOptions);
    const cached = serverCacheGet(cacheKey);
    if (cached) {
        return NextResponse.json(cached, { headers: { 'X-Cluster-Cache': 'HIT' } });
    }

    try {
        const result = calculateSpatialClustering(earthquakes, clusterOptions);

        if (!result) {
            return NextResponse.json(
                { error: 'Clustering returned no result' },
                { status: 422 }
            );
        }

        serverCacheSet(cacheKey, result);
        return NextResponse.json(result, { headers: { 'X-Cluster-Cache': 'MISS' } });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal clustering error';
        console.error('[/api/cluster] Clustering failed:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
