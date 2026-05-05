'use client';

/**
 * useClusteringWorker — hybrid clustering hook
 *
 * Routing strategy:
 *   1. Cache hit → return instantly, no computation needed.
 *   2. Heavy O(n²) algorithm → POST /api/cluster (server-side, always, regardless of n).
 *      These would freeze the main thread even inside a Worker for typical dataset sizes.
 *   3. Everything else → Web Worker (non-blocking, keeps UI responsive).
 *   4. Worker unavailable / timed-out / errored → synchronous fallback on main thread.
 *
 * Heavy algorithms always sent to server:
 *   hdbscan, nearest-neighbor, tmc, hardebeck-2019
 *
 * Bugs fixed vs. previous version:
 *   • Heavy algorithms were never reaching the server because SERVER_THRESHOLD (10k)
 *     was always above the component's SAMPLE_THRESHOLD (3k). Now heavy algorithms
 *     ALWAYS go to the server regardless of dataset size.
 *   • Broken worker was never reset — handleError now terminates + nulls the worker ref
 *     so subsequent calls don't reuse a dead worker.
 *   • No timeout — a 30s watchdog now fires if the worker never responds, resets the
 *     worker, and triggers the sync fallback.
 *   • Listener accumulation — event listeners are now registered with { once: true }
 *     so they self-clean after the first message/error, and the watchdog also removes
 *     them if it fires first.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { EarthquakeData } from '@/types/earthquake';
import { SpatialClusteringOptions, ClusterResult } from '@/lib/analysis/clusteringTypes';
import { clusteringCache } from '@/lib/analysis/clusteringCache';
import { CLUSTERING_CONFIG } from '@/config/performance';

// ── Routing constants ─────────────────────────────────────────────────────────

/**
 * Algorithms whose worst-case complexity is O(n²) or worse.
 * These are ALWAYS sent to the server regardless of dataset size.
 * Sending them to a Worker would still block progress for the typical ~3 000-event
 * datasets used in this app, because the Worker has the same single-threaded JS engine.
 */
const HEAVY_ALGORITHMS = new Set<string>([
    'hdbscan',
    'nearest-neighbor',
    'tmc',
    'hardebeck-2019',
]);

/** How long (ms) to wait for a worker response before giving up and falling back. */
const WORKER_TIMEOUT_MS = 30_000;

// ── Worker message shapes ─────────────────────────────────────────────────────

// Packed (Transferable) format: numeric fields encoded into a Float64Array.
// Fields per event (5): lat, lon, depth, mag, timeMs
const WORKER_FIELDS = 5;

interface PackedClusteringRequest {
    buf: Float64Array;   // transferred (zero-copy)
    n: number;
    options: SpatialClusteringOptions;
    requestId: number;
}

interface ClusteringResponse {
    success: boolean;
    result?: ClusterResult;
    error?: string;
    requestId: number;
}

// ── Public types ──────────────────────────────────────────────────────────────

export type ClusteringRoute = 'worker' | 'server' | 'sync';

export interface ClusteringComputeInfo {
    algorithm: string;
    datasetSize: number;
    route: ClusteringRoute;
    startedAt: number;
}

export interface ClusteringWorkerReturn {
    result: ClusterResult | null;
    isCalculating: boolean;
    error: string | null;
    computeInfo: ClusteringComputeInfo | null;
    runClustering: (earthquakes: EarthquakeData[], options: SpatialClusteringOptions) => void;
    cancelClustering: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useClusteringWorker(): ClusteringWorkerReturn {
    const [result, setResult] = useState<ClusterResult | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [computeInfo, setComputeInfo] = useState<ClusteringComputeInfo | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const requestIdRef = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);

    // ── Worker lifecycle ──────────────────────────────────────────────────────

    /** Create the Web Worker on first use; return null if unavailable. */
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

    /** Terminate the current worker and reset the ref so a fresh one is created next time. */
    const resetWorker = useCallback(() => {
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            workerRef.current?.terminate();
            abortControllerRef.current?.abort();
        };
    }, []);

    // ── Shared finish helpers ─────────────────────────────────────────────────

    const finishCalculating = useCallback(() => {
        setIsCalculating(false);
        setComputeInfo(null);
    }, []);

    // ── Server path ───────────────────────────────────────────────────────────

    const runViaServer = useCallback((
        earthquakes: EarthquakeData[],
        options: SpatialClusteringOptions,
        thisRequest: number,
        onFailure?: () => void,
    ) => {
        setComputeInfo({
            algorithm: options.algorithm,
            datasetSize: earthquakes.length,
            route: 'server',
            startedAt: Date.now(),
        });

        const controller = new AbortController();
        abortControllerRef.current = controller;

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
                if (thisRequest !== requestIdRef.current) return;
                clusteringCache.set(earthquakes, options, serverResult);
                setResult(serverResult);
                setError(null);
                finishCalculating();
            })
            .catch(err => {
                if (thisRequest !== requestIdRef.current) return;
                if (err.name === 'AbortError') return;
                console.error('[clustering] Server path failed:', err);
                setError(err.message ?? 'Server clustering failed');
                setResult(null);
                finishCalculating();
                onFailure?.();
            });
    }, [finishCalculating]);

    // ── Sync fallback ─────────────────────────────────────────────────────────

    const runSyncFallback = useCallback((
        earthquakes: EarthquakeData[],
        options: SpatialClusteringOptions,
        thisRequest: number,
    ) => {
        setComputeInfo({
            algorithm: options.algorithm,
            datasetSize: earthquakes.length,
            route: 'sync',
            startedAt: Date.now(),
        });

        setTimeout(async () => {
            if (thisRequest !== requestIdRef.current) return;
            try {
                const { calculateSpatialClustering } = await import('@/lib/analysis/clustering');
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
                if (thisRequest === requestIdRef.current) finishCalculating();
            }
        }, 0);
    }, [finishCalculating]);

    // ── Worker path ───────────────────────────────────────────────────────────

    const runViaWorker = useCallback((
        earthquakes: EarthquakeData[],
        options: SpatialClusteringOptions,
        thisRequest: number,
    ) => {
        const worker = getWorker();
        if (!worker) {
            // Worker unavailable — go directly to sync fallback
            runSyncFallback(earthquakes, options, thisRequest);
            return;
        }

        setComputeInfo({
            algorithm: options.algorithm,
            datasetSize: earthquakes.length,
            route: 'worker',
            startedAt: Date.now(),
        });

        const cleanup = () => {
            clearTimeout(watchdogId);
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);
        };

        const handleMessage = (e: MessageEvent<ClusteringResponse>) => {
            const { requestId, success, result: workerResult, error: workerError } = e.data;
            if (requestId !== thisRequest) return; // stale response — ignore
            cleanup();

            if (CLUSTERING_CONFIG.TERMINATE_WORKER_AFTER_USE) resetWorker();

            if (!success || !workerResult) {
                setError(workerError ?? 'Worker returned no result');
                setResult(null);
            } else {
                clusteringCache.set(earthquakes, options, workerResult);
                setResult(workerResult);
                setError(null);
            }
            finishCalculating();
        };

        const handleError = (e: ErrorEvent) => {
            cleanup();
            // Terminate and reset the broken worker so the next call creates a fresh one
            resetWorker();
            if (thisRequest !== requestIdRef.current) return;
            console.warn('[clustering] Worker error, falling back to sync:', e.message);
            runSyncFallback(earthquakes, options, thisRequest);
        };

        // Watchdog: if the worker never responds within WORKER_TIMEOUT_MS, fall back
        const watchdogId = setTimeout(() => {
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);
            if (thisRequest !== requestIdRef.current) return;
            console.warn('[clustering] Worker timed out after', WORKER_TIMEOUT_MS, 'ms, resetting');
            resetWorker();
            runSyncFallback(earthquakes, options, thisRequest);
        }, WORKER_TIMEOUT_MS);

        // { once: true } ensures listeners self-clean even if cleanup() isn't called
        worker.addEventListener('message', handleMessage as EventListener, { once: true });
        worker.addEventListener('error', handleError as EventListener, { once: true });

        // Pack numeric fields into a Float64Array and transfer it zero-copy.
        // For 5 000 events this reduces postMessage time from ~50 ms to <1 ms.
        const n = earthquakes.length;
        const buf = new Float64Array(n * WORKER_FIELDS);
        for (let i = 0; i < n; i++) {
            const eq = earthquakes[i];
            const base = i * WORKER_FIELDS;
            buf[base]     = eq.latitude;
            buf[base + 1] = eq.longitude;
            buf[base + 2] = eq.depth;
            buf[base + 3] = eq.magnitude;
            buf[base + 4] = eq.timeMs ?? (eq.time instanceof Date ? eq.time.getTime() : new Date(eq.time as unknown as string).getTime());
        }

        const req: PackedClusteringRequest = { buf, n, options, requestId: thisRequest };
        worker.postMessage(req, [buf.buffer]); // transfer the ArrayBuffer
    }, [getWorker, resetWorker, finishCalculating, runSyncFallback]);

    // ── Public: runClustering ─────────────────────────────────────────────────

    const runClustering = useCallback((
        earthquakes: EarthquakeData[],
        options: SpatialClusteringOptions,
    ) => {
        if (!earthquakes.length) return;

        // Cache check — avoids any computation for repeated identical requests
        const cached = clusteringCache.get(earthquakes, options);
        if (cached) {
            setResult(cached);
            setIsCalculating(false);
            setComputeInfo(null);
            setError(null);
            return;
        }

        const thisRequest = ++requestIdRef.current;
        setIsCalculating(true);
        setError(null);

        // Cancel any in-flight server request from a previous call
        abortControllerRef.current?.abort();

        if (HEAVY_ALGORITHMS.has(options.algorithm)) {
            // Heavy O(n²) algorithms — always offload to the server.
            // Even inside a Worker, these block the JS engine for seconds on typical
            // ~3 000-event datasets and provide no UI responsiveness benefit.
            runViaServer(earthquakes, options, thisRequest);
        } else {
            // All other algorithms — use the Worker (non-blocking).
            runViaWorker(earthquakes, options, thisRequest);
        }
    }, [runViaServer, runViaWorker]);

    // ── Public: cancelClustering ──────────────────────────────────────────────

    const cancelClustering = useCallback(() => {
        requestIdRef.current++; // stale all in-flight callbacks
        abortControllerRef.current?.abort();
        setIsCalculating(false);
        setComputeInfo(null);
    }, []);

    return { result, isCalculating, error, computeInfo, runClustering, cancelClustering };
}
