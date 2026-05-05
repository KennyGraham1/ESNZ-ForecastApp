/**
 * Web Worker for non-blocking spatial clustering.
 *
 * Two input formats are accepted from the main thread:
 *
 *   1. Legacy (structured clone):
 *      { earthquakes: EarthquakeData[], options, requestId }
 *      Used as a fallback when Transferable support is unavailable.
 *
 *   2. Packed (zero-copy Transferable):
 *      { buf: Float64Array, n: number, options, requestId }
 *      buf layout per event (5 floats × n):  lat, lon, depth, mag, timeMs
 *      The ArrayBuffer is transferred — no serialisation overhead.
 *
 * The response is always a ClusterResult (structured clone — it is small).
 */

import type { EarthquakeData } from '@/types/earthquake';
import { calculateSpatialClustering } from './clustering';
import type { SpatialClusteringOptions, ClusterResult } from './clusteringTypes';

const FIELDS = 5; // lat, lon, depth, mag, timeMs per event

interface PackedRequest {
    buf: Float64Array;
    n: number;
    options: SpatialClusteringOptions;
    requestId: number;
}

interface LegacyRequest {
    earthquakes: EarthquakeData[];
    options: SpatialClusteringOptions;
    requestId?: number;
}

interface ClusteringResponse {
    success: boolean;
    result?: ClusterResult;
    error?: string;
    duration?: number;
    requestId?: number;
}

self.onmessage = (e: MessageEvent<PackedRequest | LegacyRequest>) => {
    const startTime = performance.now();
    const data = e.data;
    const requestId = (data as any).requestId;

    try {
        let earthquakes: EarthquakeData[];

        if ('buf' in data && 'n' in data) {
            // ── Packed format — reconstruct from Float64Array ─────────────────
            const { buf, n } = data as PackedRequest;
            earthquakes = new Array(n);
            for (let i = 0; i < n; i++) {
                const base = i * FIELDS;
                const timeMs = buf[base + 4];
                earthquakes[i] = {
                    latitude:  buf[base],
                    longitude: buf[base + 1],
                    depth:     buf[base + 2],
                    magnitude: buf[base + 3],
                    timeMs,
                    time:      new Date(timeMs),
                    // Stub string fields — no clustering algorithm reads these
                    eventID:   String(i),
                    publicID:  String(i),
                    locality:  '',
                } as EarthquakeData;
            }
        } else {
            // ── Legacy format (structured clone) ─────────────────────────────
            const req = data as LegacyRequest;
            if (!Array.isArray(req.earthquakes) || req.earthquakes.length === 0) {
                throw new Error('Invalid or empty earthquakes array');
            }
            earthquakes = req.earthquakes;
        }

        if (!data.options) throw new Error('Missing clustering options');

        const result = calculateSpatialClustering(earthquakes, data.options);
        const duration = performance.now() - startTime;

        const response: ClusteringResponse = {
            success: true,
            result: result ?? undefined,
            duration,
            requestId,
        };
        self.postMessage(response);

    } catch (error) {
        const duration = performance.now() - startTime;
        console.error('Worker: clustering failed', error);
        self.postMessage({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            duration,
            requestId,
        } as ClusteringResponse);
    }
};

export {};
