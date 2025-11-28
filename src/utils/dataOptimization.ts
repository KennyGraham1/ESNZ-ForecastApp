import { EarthquakeData } from '@/types/earthquake';

/**
 * Create an indexed structure for faster filtering
 * Groups earthquakes by magnitude ranges and depth categories
 */
export interface IndexedEarthquakeData {
    byMagnitudeRange: Map<string, EarthquakeData[]>;
    byDepthCategory: Map<string, EarthquakeData[]>;
    byYear: Map<number, EarthquakeData[]>;
    all: EarthquakeData[];
}

/**
 * Build indexes for earthquake data to enable faster filtering
 */
export function buildEarthquakeIndexes(earthquakes: EarthquakeData[]): IndexedEarthquakeData {
    const byMagnitudeRange = new Map<string, EarthquakeData[]>();
    const byDepthCategory = new Map<string, EarthquakeData[]>();
    const byYear = new Map<number, EarthquakeData[]>();

    // Initialize maps
    const magnitudeRanges = ['0-2', '2-3', '3-4', '4-5', '5-6', '6-7', '7-8', '8+'];
    const depthCategories = ['shallow', 'intermediate', 'deep'];
    
    magnitudeRanges.forEach(range => byMagnitudeRange.set(range, []));
    depthCategories.forEach(cat => byDepthCategory.set(cat, []));

    // Build indexes
    earthquakes.forEach(eq => {
        // Index by magnitude range
        const mag = eq.magnitude;
        let magRange = '8+';
        if (mag < 2) magRange = '0-2';
        else if (mag < 3) magRange = '2-3';
        else if (mag < 4) magRange = '3-4';
        else if (mag < 5) magRange = '4-5';
        else if (mag < 6) magRange = '5-6';
        else if (mag < 7) magRange = '6-7';
        else if (mag < 8) magRange = '7-8';
        
        byMagnitudeRange.get(magRange)?.push(eq);

        // Index by depth category
        const depth = eq.depth;
        let depthCat = 'deep';
        if (depth <= 70) depthCat = 'shallow';
        else if (depth <= 300) depthCat = 'intermediate';
        
        byDepthCategory.get(depthCat)?.push(eq);

        // Index by year
        const year = new Date(eq.time).getFullYear();
        if (!byYear.has(year)) {
            byYear.set(year, []);
        }
        byYear.get(year)?.push(eq);
    });

    return {
        byMagnitudeRange,
        byDepthCategory,
        byYear,
        all: earthquakes
    };
}

/**
 * Efficiently sample large datasets for visualization
 * Uses stratified sampling to maintain data distribution
 */
export function stratifiedSample(
    earthquakes: EarthquakeData[],
    maxPoints: number
): EarthquakeData[] {
    if (earthquakes.length <= maxPoints) {
        return earthquakes;
    }

    // Group by magnitude bins for stratified sampling
    const bins = new Map<number, EarthquakeData[]>();
    earthquakes.forEach(eq => {
        const bin = Math.floor(eq.magnitude);
        if (!bins.has(bin)) {
            bins.set(bin, []);
        }
        bins.get(bin)?.push(eq);
    });

    // Calculate samples per bin proportionally
    const result: EarthquakeData[] = [];

    bins.forEach((binData) => {
        const proportion = binData.length / earthquakes.length;
        const samplesForBin = Math.max(1, Math.floor(maxPoints * proportion));
        const step = Math.max(1, Math.floor(binData.length / samplesForBin));

        for (let i = 0; i < binData.length && result.length < maxPoints; i += step) {
            result.push(binData[i]);
        }
    });

    return result;
}

/**
 * Batch process large arrays to avoid blocking the UI
 */
export async function batchProcess<T, R>(
    items: T[],
    processor: (item: T) => R,
    batchSize: number = 1000
): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = batch.map(processor);
        results.push(...batchResults);
        
        // Yield to the event loop to keep UI responsive
        if (i + batchSize < items.length) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    
    return results;
}

/**
 * Memoize expensive calculations with a simple cache
 */
export class SimpleCache<K, V> {
    private cache = new Map<string, { value: V; timestamp: number }>();
    private maxAge: number;
    private maxSize: number;

    constructor(maxAge: number = 5 * 60 * 1000, maxSize: number = 100) {
        this.maxAge = maxAge;
        this.maxSize = maxSize;
    }

    get(key: K): V | undefined {
        const keyStr = JSON.stringify(key);
        const cached = this.cache.get(keyStr);
        
        if (!cached) return undefined;
        
        // Check if expired
        if (Date.now() - cached.timestamp > this.maxAge) {
            this.cache.delete(keyStr);
            return undefined;
        }
        
        return cached.value;
    }

    set(key: K, value: V): void {
        const keyStr = JSON.stringify(key);

        // Evict oldest if at max size
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }

        this.cache.set(keyStr, { value, timestamp: Date.now() });
    }

    clear(): void {
        this.cache.clear();
    }
}

