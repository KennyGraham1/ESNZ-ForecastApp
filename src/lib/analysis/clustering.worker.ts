/**
 * OPTIMIZATION: Web Worker for non-blocking spatial clustering
 * Prevents UI freezes during expensive clustering calculations
 */

import { EarthquakeData } from '@/types/earthquake';
import { calculateSpatialClustering, SpatialClusteringOptions, ClusterResult } from './clustering';

// Worker message types
interface ClusteringRequest {
    earthquakes: EarthquakeData[];
    options: SpatialClusteringOptions;
    requestId?: number; // For race condition handling
}

interface ClusteringResponse {
    success: boolean;
    result?: ClusterResult;
    error?: string;
    duration?: number;
    requestId?: number; // Echo back request ID
}

// Handle messages from main thread
self.onmessage = (e: MessageEvent<ClusteringRequest>) => {
    const { earthquakes, options, requestId } = e.data;

    console.log('🔄 Worker: Starting clustering...', earthquakes.length, 'events', options, 'requestId:', requestId);
    const startTime = performance.now();

    try {
        // Validate input data
        if (!earthquakes || !Array.isArray(earthquakes)) {
            throw new Error('Invalid earthquakes data: expected array');
        }

        if (earthquakes.length === 0) {
            throw new Error('Empty earthquakes array');
        }

        if (!options) {
            throw new Error('Missing clustering options');
        }

        const result = calculateSpatialClustering(earthquakes, options);
        const duration = performance.now() - startTime;

        console.log(`✅ Worker: Clustering completed in ${duration.toFixed(2)}ms`);

        // Send result back to main thread
        const response: ClusteringResponse = {
            success: true,
            result: result || undefined,
            duration,
            requestId
        };

        self.postMessage(response);
    } catch (error) {
        const duration = performance.now() - startTime;
        console.error('❌ Worker: Clustering failed', error);

        const response: ClusteringResponse = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            duration,
            requestId
        };

        self.postMessage(response);
    }
};

// Export empty object to make TypeScript happy
export {};

