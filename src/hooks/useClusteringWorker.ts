'use client';

/**
 * useClusteringWorker — hybrid clustering hook
 *
 * Routing strategy:
 *   1. Cache hit → return instantly (no worker/server round-trip)
 *   2. Heavy O(n²) algorithm on a large dataset → POST /api/cluster
 *   3. All other cases → Web Worker (non-blocking, keeps UI responsive)
 *   4. Worker unavailable → synchronous fallback on main thread
 *
 * Heavy algorithms routed server-side when n > SERVER_THRESHOLD:
 *   hdbscan, nearest-neighbor, tmc, hardebeck-2019
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { EarthquakeData } from '@/types/earthquake';
import { SpatialClusteringOptions, ClusterResult } from '@/lib/analysis/clusteringTypes';
import { clusteringCache } from '@/lib/analysis/clusteringCache';
import { CLUSTERING_CONFIG } from '@/config/performance';

// Algorithms whose complexity degrades badly for large n
const HEAVY_ALGORITHMS = new Set<string>([
    'hdbscan',
    'nearest-neighbor',
    'tmc',
    'hardebeck-2019',
]);

// Minimum dataset size to justify a server round-trip for heavy algorithms
const SERVER_THRESHOLD = 10_000;

// ── Worker message types (mirror clustering.worker.ts) ────────────────────────

interface ClusteringRequest {
    earthquakes: EarthquakeData[];
    options: SpatialClusteringOptions;
    requestId: number;
}

interface ClusteringResponse {
    success: boolean;
    result?: ClusterResult;
    error?: string;
    requestId: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface ClusteringWorkerReturn {
    result: ClusterResult | null;
    isCalculating: boolean;
    error: string | null;
    runClustering: (earthquakes: EarthquakeData[], options: SpatialClusteringOptions) => void;
    cancelClustering: () => void;
}

export function useClusteringWorker(): ClusteringWorkerReturn {
    const [result, setResult] = useState<ClusterResult | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const requestIdRef = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Lazily create the Web Worker the first time it is needed
    const getWorker = useCallback((): Worker | null => {
        if (!CLUSTERING_CONFIG.ENABLE_WEB_WORKERS) return null;
        if (typeof window === 'undefined') return null;

        if (!workerRef.current) {
            try {
                workerRef.current = new Worker(
                    new URL('../lib/analysis/clustering.worker.ts', import.meta.url)
                );
            } catch {
                return null;
            }
        }
        return workerRef.current;
    }, []);

    // Tear down the worker when the component unmounts
    useEffect(() => {
        return () => {
            workerRef.current?.terminate();
            abortControllerRef.current?.abort();
        };
    }, []);

    const runClustering = useCallback(
        (earthquakes: EarthquakeData[], options: SpatialClusteringOptions) => {
            if (!earthquakes.length) return;

            // 1. Cache check
            const cached = clusteringCache.get(earthquakes, options);
            if (cached) {
                setResult(cached);
                setIsCalculating(false);
                setError(null);
                return;
            }

            // Bump the request ID so stale responses are discarded
            const thisRequest = ++requestIdRef.current;
            setIsCalculating(true);
            setError(null);

            // Abort any in-flight server request
            abortControllerRef.current?.abort();

            // 2. Server-side path: heavy algorithm on a large dataset
            const useServer =
                HEAVY_ALGORITHMS.has(options.algorithm) &&
                earthquakes.length > SERVER_THRESHOLD;

            if (useServer) {
                const controller = new AbortController();
                abortControllerRef.current = controller;

                // Serialize earthquakes — Date objects don't survive JSON.stringify cleanly
                const serialized = earthquakes.map(eq => ({
                    ...eq,
                    time: eq.time instanceof Date ? eq.time.toISOString() : eq.time,
                }));

                fetch('/api/cluster', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ earthquakes: serialized, options }),
                    signal: controller.signal,
                })
                    .then(async res => {
                        if (!res.ok) {
                            const text = await res.text().catch(() => res.statusText);
                            throw new Error(`Server error ${res.status}: ${text}`);
                        }
                        return res.json() as Promise<ClusterResult>;
                    })
                    .then(serverResult => {
                        if (thisRequest !== requestIdRef.current) return; // stale
                        clusteringCache.set(earthquakes, options, serverResult);
                        setResult(serverResult);
                        setIsCalculating(false);
                    })
                    .catch(err => {
                        if (thisRequest !== requestIdRef.current) return; // stale
                        if (err.name === 'AbortError') return; // cancelled
                        console.error('Server clustering failed, falling back to worker:', err);
                        // Fall through to worker / sync below
                        runViaWorkerOrSync(earthquakes, options, thisRequest);
                    });

                return;
            }

            // 3. Web Worker path (or 4. sync fallback)
            runViaWorkerOrSync(earthquakes, options, thisRequest);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [getWorker]
    );

    function runViaWorkerOrSync(
        earthquakes: EarthquakeData[],
        options: SpatialClusteringOptions,
        thisRequest: number
    ) {
        const worker = getWorker();

        if (worker) {
            // Route via Web Worker
            const handleMessage = (e: MessageEvent<ClusteringResponse>) => {
                const { requestId, success, result: workerResult, error: workerError } = e.data;

                if (requestId !== thisRequest) return; // stale response

                worker.removeEventListener('message', handleMessage);
                worker.removeEventListener('error', handleError);

                if (CLUSTERING_CONFIG.TERMINATE_WORKER_AFTER_USE) {
                    worker.terminate();
                    workerRef.current = null;
                }

                if (!success || !workerResult) {
                    setError(workerError ?? 'Clustering failed');
                    setResult(null);
                } else {
                    clusteringCache.set(earthquakes, options, workerResult);
                    setResult(workerResult);
                    setError(null);
                }
                setIsCalculating(false);
            };

            const handleError = (e: ErrorEvent) => {
                worker.removeEventListener('message', handleMessage);
                worker.removeEventListener('error', handleError);
                if (thisRequest !== requestIdRef.current) return;
                setError(e.message ?? 'Worker error');
                setResult(null);
                setIsCalculating(false);
            };

            worker.addEventListener('message', handleMessage);
            worker.addEventListener('error', handleError);

            const request: ClusteringRequest = { earthquakes, options, requestId: thisRequest };
            worker.postMessage(request);
        } else {
            // Sync fallback — runs on the main thread
            setTimeout(async () => {
                if (thisRequest !== requestIdRef.current) return;
                try {
                    const { calculateSpatialClustering } = await import(
                        '@/lib/analysis/clustering'
                    );
                    const syncResult = calculateSpatialClustering(earthquakes, options);
                    if (thisRequest !== requestIdRef.current) return;
                    if (syncResult) clusteringCache.set(earthquakes, options, syncResult);
                    setResult(syncResult ?? null);
                    setError(null);
                } catch (err) {
                    if (thisRequest !== requestIdRef.current) return;
                    setError(err instanceof Error ? err.message : 'Clustering failed');
                    setResult(null);
                } finally {
                    if (thisRequest === requestIdRef.current) setIsCalculating(false);
                }
            }, 0);
        }
    }

    const cancelClustering = useCallback(() => {
        requestIdRef.current++; // invalidate in-flight requests
        abortControllerRef.current?.abort();
        setIsCalculating(false);
    }, []);

    return { result, isCalculating, error, runClustering, cancelClustering };
}
