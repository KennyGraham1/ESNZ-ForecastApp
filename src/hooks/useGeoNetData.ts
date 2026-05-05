'use client';

/**
 * useGeoNetData — replaces useCachedEarthquakes.
 *
 * Architecture:
 *   1. On mount (or minMagnitude change): read from IndexedDB immediately.
 *      If data is present the UI renders at once (no loading spinner for repeat visits).
 *   2. If the IndexedDB has no data for this magnitude: fetch 1 year from GeoNet
 *      via the /api/earthquakes/proxy route, then save to IndexedDB.
 *   3. When the requested date range exceeds what is cached (gap-fill): fetch
 *      only the missing historical period from GeoNet and merge it in.
 *   4. "Refresh" (user clicks "Check for New Events"): fetch only events since
 *      `lastUpdated`, merge, save, and expose `newEventsAdded`.
 *
 * The returned `data` object is filtered to the requested date window so
 * page.tsx receives the same shape it expected from useCachedEarthquakes.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { EarthquakeData } from '@/types/earthquake';
import { enhanceEarthquakeData } from '@/utils/earthquakeEnhancement';
import {
    getCachedCatalog,
    saveCatalog,
    StoredCatalog,
    StoredEarthquake,
} from '@/lib/earthquakeCache';
import { fetchFromGeoNetWithReport, GeoNetFetchReport } from '@/lib/geonetClient';

// Default initial fetch window (matches the old server-side INITIAL_FETCH_DAYS).
const DEFAULT_FETCH_DAYS = 365;

// ─── Public types ────────────────────────────────────────────────────────────

export interface GeoNetFilterOptions {
    daysBack?: number;
    startDate?: string;  // ISO YYYY-MM-DD
    endDate?: string;    // ISO YYYY-MM-DD
    minMagnitude: number;
}

/** Shape returned by the hook — mirrors the old CachedEarthquakeResponse so
 *  page.tsx requires minimal changes. */
export interface CatalogResponse {
    data: EarthquakeData[];
    lastUpdated: string;
    initialFetchDate: string;
    totalEvents: number;
    newEventsAdded: number;
    filteredCount: number;
    returnedCount: number;
    cached: boolean;
    fetchReport?: GeoNetFetchReport;
    fetchWarnings: string[];
}

export interface UseGeoNetDataResult {
    data: CatalogResponse | undefined;
    isLoading: boolean;
    isRefreshing: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert StoredEarthquake[] → EarthquakeData[] (time: string → Date). */
function toEarthquakeData(stored: StoredEarthquake[]): EarthquakeData[] {
    return stored.map(eq => ({
        ...eq,
        time: new Date(eq.time),
    }));
}

/** Narrow the catalog to the requested date window using pre-computed timeMs. */
function applyDateFilter(
    earthquakes: StoredEarthquake[],
    daysBack?: number,
    startDate?: string,
    endDate?: string
): StoredEarthquake[] {
    let cutoffMs = -Infinity;
    let endMs = Infinity;

    if (daysBack !== undefined) {
        cutoffMs = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    } else if (startDate) {
        cutoffMs = new Date(startDate).getTime();
    }

    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        endMs = end.getTime();
    }

    if (cutoffMs === -Infinity && endMs === Infinity) return earthquakes;

    return earthquakes.filter(eq => eq.timeMs >= cutoffMs && eq.timeMs <= endMs);
}

/** Deduplicate and merge two event arrays (newer events first). */
function mergeEvents(
    existing: StoredEarthquake[],
    incoming: StoredEarthquake[]
): StoredEarthquake[] {
    const seen = new Set(existing.map(e => e.eventID));
    const unique = incoming.filter(e => !seen.has(e.eventID));
    if (unique.length === 0) return existing;
    return [...existing, ...unique].sort((a, b) => b.timeMs - a.timeMs);
}

function buildFetchWarnings(report?: GeoNetFetchReport): string[] {
    if (!report) return [];

    const warnings: string[] = [];
    if (report.partial) {
        warnings.push('GeoNet catalog may be incomplete because one or more chunks failed or hit the service result limit.');
    }
    if (report.chunksFailed > 0) {
        warnings.push(`${report.chunksFailed} GeoNet chunk${report.chunksFailed === 1 ? '' : 's'} failed after retries.`);
    }
    if (report.truncatedChunks > 0) {
        warnings.push(`${report.truncatedChunks} GeoNet chunk${report.truncatedChunks === 1 ? '' : 's'} still reached the 20,000-event limit after splitting.`);
    }
    if (report.invalidFeatures > 0) {
        warnings.push(`${report.invalidFeatures} GeoNet feature${report.invalidFeatures === 1 ? ' was' : 's were'} skipped due to missing or unparseable required fields.`);
    }
    if (report.duplicateEvents > 0) {
        warnings.push(`${report.duplicateEvents} duplicate GeoNet event${report.duplicateEvents === 1 ? '' : 's'} were removed by public ID.`);
    }

    return warnings;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useGeoNetData({
    daysBack,
    startDate,
    endDate,
    minMagnitude,
}: GeoNetFilterOptions): UseGeoNetDataResult {
    // Full catalog for this magnitude level (all dates).
    const [catalog, setCatalog] = useState<StoredCatalog | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [newEventsAdded, setNewEventsAdded] = useState(0);
    const [fetchReport, setFetchReport] = useState<GeoNetFetchReport | undefined>(undefined);

    // Track which magnitude is currently being loaded so we can:
    //  - skip duplicate loads for the same magnitude (null = not loading)
    //  - allow a NEW magnitude to start loading even while the old one is mid-flight
    const loadingMagRef = useRef<number | null>(null);
    const gapFillRef = useRef(false);
    // Track the currently-wanted magnitude so in-flight callbacks can detect
    // that the user has moved on and discard stale results.
    const magnitudeRef = useRef(minMagnitude);
    // Prevent concurrent refreshes without coupling refetch's identity to isRefreshing.
    const isRefreshingRef = useRef(false);

    // ── Derived: filtered view of the full catalog ───────────────────────────
    const data = useMemo<CatalogResponse | undefined>(() => {
        if (!catalog) return undefined;

        const filtered = applyDateFilter(catalog.earthquakes, daysBack, startDate, endDate);
        const earthquakeData = toEarthquakeData(filtered);
        const enhanced = enhanceEarthquakeData(earthquakeData);

        return {
            data: enhanced,
            lastUpdated: catalog.lastUpdated,
            initialFetchDate: catalog.initialFetchDate,
            totalEvents: catalog.totalEvents,
            newEventsAdded,
            filteredCount: filtered.length,
            returnedCount: filtered.length,
            cached: true,
            fetchReport,
            fetchWarnings: buildFetchWarnings(fetchReport),
        };
    }, [catalog, daysBack, startDate, endDate, newEventsAdded, fetchReport]);

    // ── Load catalog ─────────────────────────────────────────────────────────
    const loadCatalog = useCallback(async (magnitude: number) => {
        // Skip only if this exact magnitude is already in-flight.
        // A different magnitude must be allowed through even while another loads.
        if (loadingMagRef.current === magnitude) return;
        loadingMagRef.current = magnitude;
        magnitudeRef.current = magnitude;
        setIsLoading(true);
        setError(null);
        setNewEventsAdded(0);
        setFetchReport(undefined);

        try {
            // 1. Try IndexedDB first — instant if data is already there.
            let cached = await getCachedCatalog(magnitude);

            if (magnitudeRef.current !== magnitude) return; // user switched away mid-await

            if (!cached) {
                // 2. First-ever load for this magnitude: fetch DEFAULT_FETCH_DAYS from GeoNet.
                console.log(`📥 No IndexedDB data for M${magnitude}+. Fetching initial ${DEFAULT_FETCH_DAYS} days…`);
                const now = new Date();
                const fetchStart = new Date(Date.now() - DEFAULT_FETCH_DAYS * 24 * 60 * 60 * 1000);
                const report = await fetchFromGeoNetWithReport(magnitude, fetchStart, now);

                if (magnitudeRef.current !== magnitude) return; // stale, abort
                setFetchReport(report);

                cached = {
                    minMagnitude: magnitude,
                    earthquakes: report.events,
                    initialFetchDate: fetchStart.toISOString(),
                    lastUpdated: now.toISOString(),
                    totalEvents: report.events.length,
                };
                await saveCatalog(cached);
                console.log(`💾 Saved ${report.events.length} events to IndexedDB (M${magnitude}+)`);
            } else {
                console.log(`✅ IndexedDB hit: ${cached.totalEvents} events for M${magnitude}+ (since ${cached.initialFetchDate.slice(0, 10)})`);
            }

            if (magnitudeRef.current !== magnitude) return;
            setCatalog(cached);
        } catch (err) {
            if (magnitudeRef.current === magnitude) {
                console.error('❌ Error loading catalog:', err);
                setError(err instanceof Error ? err : new Error('Failed to load earthquake data'));
            }
        } finally {
            if (loadingMagRef.current === magnitude) loadingMagRef.current = null;
            if (magnitudeRef.current === magnitude) setIsLoading(false);
        }
    }, []);

    // ── Gap-fill when requested date range exceeds cached range ──────────────
    const gapFill = useCallback(async (
        existingCatalog: StoredCatalog,
        requestedStart: Date
    ) => {
        if (gapFillRef.current) return;
        const cacheStart = new Date(existingCatalog.initialFetchDate);
        if (requestedStart >= cacheStart) return; // nothing to fill

        gapFillRef.current = true;
        const magnitude = existingCatalog.minMagnitude;
        console.log(
            `📊 Gap-fill needed for M${magnitude}+: ` +
            `${requestedStart.toISOString().slice(0, 10)} → ${cacheStart.toISOString().slice(0, 10)}`
        );

        try {
            const report = await fetchFromGeoNetWithReport(magnitude, requestedStart, cacheStart);

            if (magnitudeRef.current !== magnitude) return;
            setFetchReport(report);

            const merged = mergeEvents(existingCatalog.earthquakes, report.events);
            const updated: StoredCatalog = {
                ...existingCatalog,
                earthquakes: merged,
                initialFetchDate: requestedStart.toISOString(),
                totalEvents: merged.length,
            };
            await saveCatalog(updated);
            setCatalog(updated);
            console.log(`💾 Gap-fill complete: +${report.events.length} events, total ${merged.length}`);
        } catch (err) {
            console.error('❌ Gap-fill fetch failed:', err);
            // Non-fatal — user sees whatever data is already cached.
        } finally {
            gapFillRef.current = false;
        }
    }, []);

    // ── Effect: reload when minMagnitude changes ──────────────────────────────
    useEffect(() => {
        setCatalog(null);
        gapFillRef.current = false; // stale gap-fill for old magnitude must not block the new one
        loadCatalog(minMagnitude);
    }, [minMagnitude, loadCatalog]);

    // ── Effect: check if gap-fill is needed when date params change ───────────
    useEffect(() => {
        if (!catalog) return;
        if (catalog.minMagnitude !== minMagnitude) return;

        // Determine the earliest date the user is requesting.
        let requestedStart: Date | null = null;
        if (daysBack !== undefined) {
            requestedStart = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
        } else if (startDate) {
            requestedStart = new Date(startDate);
        }

        if (!requestedStart) return;

        const cacheStart = new Date(catalog.initialFetchDate);
        if (requestedStart < cacheStart) {
            gapFill(catalog, requestedStart);
        }
    }, [daysBack, startDate, endDate, catalog, minMagnitude, gapFill]);

    // ── Incremental refresh (user-triggered) ─────────────────────────────────
    const refetch = useCallback(async () => {
        if (!catalog || isRefreshingRef.current) return;
        isRefreshingRef.current = true;
        setIsRefreshing(true);
        setNewEventsAdded(0);

        try {
            const now = new Date();
            const lastUpdated = new Date(catalog.lastUpdated);
            const daysSince = Math.max(
                Math.ceil((now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)),
                1
            );
            console.log(`🔄 Incremental refresh: fetching ~${daysSince} days of new events…`);

            const report = await fetchFromGeoNetWithReport(catalog.minMagnitude, lastUpdated, now);
            setFetchReport(report);

            const merged = mergeEvents(catalog.earthquakes, report.events);
            const added = merged.length - catalog.earthquakes.length;

            const updated: StoredCatalog = {
                ...catalog,
                earthquakes: merged,
                lastUpdated: now.toISOString(),
                totalEvents: merged.length,
            };
            await saveCatalog(updated);
            setCatalog(updated);
            setNewEventsAdded(added);
            console.log(`✅ Refresh complete: +${added} new events`);
        } catch (err) {
            console.error('❌ Refresh failed:', err);
        } finally {
            isRefreshingRef.current = false;
            setIsRefreshing(false);
        }
    }, [catalog]); // isRefreshing removed — guarded by ref to keep identity stable

    return { data, isLoading, isRefreshing, error, refetch };
}
