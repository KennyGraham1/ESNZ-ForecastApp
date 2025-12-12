/**
 * Performance Configuration
 * 
 * Centralized configuration for all performance-related settings.
 * Adjust these values based on your deployment environment and user base.
 */

/**
 * Detect device capabilities for dynamic threshold adjustment
 */
export function getDeviceCapabilities() {
    if (typeof window === 'undefined') {
        // Server-side defaults
        return { memory: 4, cores: 4, tier: 'mid' as const };
    }

    const memory = (navigator as any).deviceMemory || 4; // GB
    const cores = navigator.hardwareConcurrency || 4;
    
    let tier: 'low' | 'mid' | 'high';
    if (memory >= 8 && cores >= 8) {
        tier = 'high';
    } else if (memory >= 4 && cores >= 4) {
        tier = 'mid';
    } else {
        tier = 'low';
    }
    
    return { memory, cores, tier };
}

/**
 * Main Performance Configuration
 */
export const PERFORMANCE_CONFIG = {
    /**
     * Cache Settings
     */
    CACHE: {
        // In-memory cache TTL (milliseconds)
        MEMORY_TTL: parseInt(process.env.NEXT_PUBLIC_CACHE_TTL_MS || '60000', 10),
        
        // Disk cache file path
        DISK_PATH: 'data/earthquake-cache.json',
        
        // Enable request coalescing to prevent concurrent disk reads
        ENABLE_COALESCING: true,
    },

    /**
     * Data Fetch Settings
     */
    FETCH: {
        // Initial fetch: ~125 years of historical data (1900 to present)
        INITIAL_DAYS: 45625,
        
        // Incremental fetch: last 30 days
        INCREMENTAL_DAYS: 30,
        
        // Batch size for paginated fetches
        BATCH_SIZE: 1000,
    },

    /**
     * Chart Sampling Thresholds
     * Format: { threshold: when to start sampling, maxPoints: target sample size }
     */
    SAMPLING: {
        MAP: {
            threshold: 50000,
            maxPoints: 25000,
            useBoost: true, // Enable Highcharts boost module
        },
        DEPTH_PROFILE: {
            threshold: 50000,
            maxPoints: 25000,
        },
        TEMPORAL: {
            threshold: 50000,
            maxPoints: 25000,
        },
        THREE_D: {
            threshold: 20000,
            maxPoints: 15000,
        },
        CLUSTERING: {
            threshold: 1000, // Don't sample clustering data (needs full dataset)
            maxPoints: Infinity,
        },
    },

    /**
     * Clustering Algorithm Settings
     */
    CLUSTERING: {
        // Use Web Worker for datasets larger than this (lowered to 500 for better performance)
        // Web Workers prevent UI freezing during clustering calculations
        WEB_WORKER_THRESHOLD: 500,

        // Enable Web Workers (can be disabled for debugging)
        ENABLE_WEB_WORKERS: process.env.NEXT_PUBLIC_ENABLE_WEB_WORKERS !== 'false',

        // Use R-tree spatial indexing by default (90-95% faster than brute force)
        USE_RTREE: process.env.NEXT_PUBLIC_USE_RTREE !== 'false',

        // Default DBSCAN parameters
        DEFAULT_EPSILON: 25, // km
        DEFAULT_MIN_SAMPLES: 5,
        DEFAULT_K: 5, // for k-means

        // Terminate worker after each use to free memory
        TERMINATE_WORKER_AFTER_USE: false,

        // Maximum dataset size for clustering (prevent memory issues)
        MAX_CLUSTERING_SIZE: 50000,
    },

    /**
     * Highcharts Boost Module Settings
     */
    HIGHCHARTS: {
        // Enable boost module for datasets larger than this
        BOOST_THRESHOLD: 5000,

        // Boost module settings
        BOOST_CONFIG: {
            useGPUTranslations: true,
            usePreAllocated: true,
        },
    },

    /**
     * Performance Monitoring
     */
    MONITORING: {
        // Enable performance tracking
        ENABLED: process.env.NODE_ENV === 'development',
        
        // Log slow operations (milliseconds)
        SLOW_OPERATION_THRESHOLD: 1000,
        
        // Maximum metrics to keep in memory
        MAX_METRICS: 1000,
    },
};

/**
 * Get optimal sampling threshold based on device capabilities
 */
export function getOptimalSamplingThreshold(chartType: keyof typeof PERFORMANCE_CONFIG.SAMPLING): number {
    const device = getDeviceCapabilities();
    const baseConfig = PERFORMANCE_CONFIG.SAMPLING[chartType];
    
    // Adjust thresholds based on device tier
    const multiplier = device.tier === 'high' ? 2 : device.tier === 'low' ? 0.5 : 1;
    
    return Math.floor(baseConfig.maxPoints * multiplier);
}

/**
 * Export individual configs for convenience
 */
export const CACHE_CONFIG = PERFORMANCE_CONFIG.CACHE;
export const FETCH_CONFIG = PERFORMANCE_CONFIG.FETCH;
export const SAMPLING_CONFIG = PERFORMANCE_CONFIG.SAMPLING;
export const CLUSTERING_CONFIG = PERFORMANCE_CONFIG.CLUSTERING;
export const HIGHCHARTS_CONFIG = PERFORMANCE_CONFIG.HIGHCHARTS;
export const MONITORING_CONFIG = PERFORMANCE_CONFIG.MONITORING;

