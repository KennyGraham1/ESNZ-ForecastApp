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
import { calculateSpatialClustering } from '@/lib/analysis/clustering';
import type { SpatialClusteringOptions } from '@/lib/analysis/clusteringTypes';
import type { EarthquakeData } from '@/types/earthquake';

// Extend Vercel's function timeout for long-running algorithms
export const maxDuration = 60;

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

    try {
        const result = calculateSpatialClustering(
            earthquakes,
            options as SpatialClusteringOptions
        );

        if (!result) {
            return NextResponse.json(
                { error: 'Clustering returned no result' },
                { status: 422 }
            );
        }

        return NextResponse.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal clustering error';
        console.error('[/api/cluster] Clustering failed:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
