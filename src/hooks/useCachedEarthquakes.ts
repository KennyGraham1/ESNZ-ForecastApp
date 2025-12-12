import { useQuery } from '@tanstack/react-query';
import { EarthquakeData } from '@/types/earthquake';
import { enhanceEarthquakeData } from '@/utils/earthquakeEnhancement';

interface CachedEarthquakeResponse {
    data: EarthquakeData[];
    cached: boolean;
    lastUpdated: string;
    initialFetchDate: string;
    totalEvents: number;
    isIncremental?: boolean;
    newEventsAdded?: number;
    filteredCount?: number;
    returnedCount?: number;
    hasMore?: boolean;
    offset?: number;
    limit?: number;
}

export interface EarthquakeFilterParams {
    minMagnitude?: number;
    maxMagnitude?: number;
    startDate?: string;
    endDate?: string;
    daysBack?: number;
    depthCategory?: 'all' | 'shallow' | 'intermediate' | 'deep';
    limit?: number;
    offset?: number;
}

/**
 * Fetches the cached earthquake catalog with optional server-side filtering
 */
async function fetchCachedEarthquakes(filters?: EarthquakeFilterParams): Promise<CachedEarthquakeResponse> {
    // Build query string from filters
    const params = new URLSearchParams();
    if (filters) {
        if (filters.minMagnitude !== undefined) params.set('minMagnitude', filters.minMagnitude.toString());
        if (filters.maxMagnitude !== undefined) params.set('maxMagnitude', filters.maxMagnitude.toString());
        if (filters.startDate) params.set('startDate', filters.startDate);
        if (filters.endDate) params.set('endDate', filters.endDate);
        if (filters.daysBack !== undefined) params.set('daysBack', filters.daysBack.toString());
        if (filters.depthCategory && filters.depthCategory !== 'all') params.set('depthCategory', filters.depthCategory);
        if (filters.limit !== undefined) params.set('limit', filters.limit.toString());
        if (filters.offset !== undefined) params.set('offset', filters.offset.toString());
    }

    const url = `/api/earthquakes/cached${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch earthquake data: ${response.statusText}`);
    }

    const result = await response.json();

    // Convert time strings back to Date objects
    const earthquakesWithDates = result.data.map((eq: any) => ({
        ...eq,
        time: new Date(eq.time)
    }));

    // Enhance earthquake data with computed fields and improved localities
    result.data = enhanceEarthquakeData(earthquakesWithDates);

    return result;
}

/**
 * Custom hook to fetch the cached earthquake catalog with optional server-side filtering
 * Server-side filtering significantly reduces data transfer and improves performance
 */
export function useCachedEarthquakes(filters?: EarthquakeFilterParams) {
    return useQuery({
        queryKey: ['earthquakes-cached', filters],
        queryFn: () => fetchCachedEarthquakes(filters),
        staleTime: Infinity, // Cache never goes stale - only refresh manually
        gcTime: 1000 * 60 * 60 * 24, // Keep in memory for 24 hours
    });
}

/**
 * Function to manually refresh the cache (incremental update)
 * Fetches only new events since last update
 */
export async function refreshEarthquakeCache(): Promise<CachedEarthquakeResponse> {
    const response = await fetch('/api/earthquakes/cached?refresh=true');

    if (!response.ok) {
        throw new Error(`Failed to refresh earthquake data: ${response.statusText}`);
    }

    const result = await response.json();

    // Convert time strings back to Date objects
    const earthquakesWithDates = result.data.map((eq: any) => ({
        ...eq,
        time: new Date(eq.time)
    }));

    // Enhance earthquake data with computed fields and improved localities
    result.data = enhanceEarthquakeData(earthquakesWithDates);

    return result;
}

