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
import { fetchFromGeoNet } from '@/lib/geonetClient';

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

    // Guard against concurrent loads for the same magnitude.
    const loadingRef = useRef(false);
    // Track which minMagnitude is currently mounted so async callbacks don't
    // apply results for a stale magnitude after a rapid switch.
    const magnitudeRef = useRef(minMagnitude);

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
        };
    }, [catalog, daysBack, startDate, endDate, newEventsAdded]);

    // ── Load / gap-fill catalog ───────────────────────────────────────────────
    const loadCatalog = useCallback(async (magnitude: number) => {
        if (loadingRef.current) return;
        loadingRef.current = true;
        magnitudeRef.current = magnitude;
        setIsLoading(true);
        setError(null);
        setNewEventsAdded(0);

        try {
            // 1. Try IndexedDB first — instant if data is already there.
            let cached = await getCachedCatalog(magnitude);

            if (!cached) {
                // 2. First-ever load for this magnitude: fetch 1 year from GeoNet.
                console.log(`📥 No IndexedDB data for M${magnitude}+. Fetching initial ${DEFAULT_FETCH_DAYS} days…`);
                const now = new Date();
                const fetchStart = new Date(Date.now() - DEFAULT_FETCH_DAYS * 24 * 60 * 60 * 1000);
                const events = await fetchFromGeoNet(magnitude, fetchStart, now);

                if (magnitudeRef.current !== magnitude) return; // stale, abort

                cached = {
                    minMagnitude: magnitude,
                    earthquakes: events,
                    initialFetchDate: fetchStart.toISOString(),
                    lastUpdated: now.toISOString(),
                    totalEvents: events.length,
                };
                await saveCatalog(cached);
                console.log(`💾 Saved ${events.length} events to IndexedDB (M${magnitude}+)`);
            } else {
                console.log(`✅ IndexedDB hit: ${cached.totalEvents} events for M${magnitude}+ (since ${cached.initialFetchDate.slice(0, 10)})`);
            }

            if (magnitudeRef.current !== magnitude) return;
            setCatalog(cached);
        } catch (err) {
            console.error('❌ Error loading catalog:', err);
            setError(err instanceof Error ? err : new Error('Failed to load earthquake data'));
        } finally {
            if (magnitudeRef.current === magnitude) {
                setIsLoading(false);
            }
            loadingRef.current = false;
        }
    }, []);

    // ── Gap-fill when requested date range exceeds cached range ──────────────
    const gapFill = useCallback(async (
        existingCatalog: StoredCatalog,
        requestedStart: Date
    ) => {
        const cacheStart = new Date(existingCatalog.initialFetchDate);
        if (requestedStart >= cacheStart) return; // nothing to fill

        const magnitude = existingCatalog.minMagnitude;
        console.log(
            `📊 Gap-fill needed for M${magnitude}+: ` +
            `${requestedStart.toISOString().slice(0, 10)} → ${cacheStart.toISOString().slice(0, 10)}`
        );

        try {
            const gapEvents = await fetchFromGeoNet(magnitude, requestedStart, cacheStart);

            if (magnitudeRef.current !== magnitude) return;

            const merged = mergeEvents(existingCatalog.earthquakes, gapEvents);
            const updated: StoredCatalog = {
                ...existingCatalog,
                earthquakes: merged,
                initialFetchDate: requestedStart.toISOString(),
                totalEvents: merged.length,
            };
            await saveCatalog(updated);
            setCatalog(updated);
            console.log(`💾 Gap-fill complete: +${gapEvents.length} events, total ${merged.length}`);
        } catch (err) {
            console.error('❌ Gap-fill fetch failed:', err);
            // Non-fatal — user sees whatever data is already cached.
        }
    }, []);

    // ── Effect: reload when minMagnitude changes ──────────────────────────────
    useEffect(() => {
        setCatalog(null);
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
        if (!catalog || isRefreshing) return;
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

            const newEvents = await fetchFromGeoNet(catalog.minMagnitude, lastUpdated, now);
            const merged = mergeEvents(catalog.earthquakes, newEvents);
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
            setIsRefreshing(false);
        }
    }, [catalog, isRefreshing]);

    return { data, isLoading, isRefreshing, error, refetch };
}
