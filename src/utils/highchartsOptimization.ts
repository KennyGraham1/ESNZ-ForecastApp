import Highcharts from '@/utils/highchartsInit';

/**
 * Performance-optimized Highcharts configuration
 * Apply these settings to charts with large datasets (>1000 points)
 */
export const getOptimizedChartConfig = (dataSize: number): Partial<Highcharts.Options> => {
    const shouldUseBoost = dataSize > 5000;
    const shouldDisableAnimation = dataSize > 1000;

    return {
        // Boost module configuration (GPU acceleration)
        boost: shouldUseBoost ? {
            enabled: true,
            useGPUTranslations: true,
            usePreallocated: true,
            seriesThreshold: 1,
        } : undefined,

        // Plot options for performance
        plotOptions: {
            series: {
                animation: shouldDisableAnimation ? false : {
                    duration: 200,
                },
                turboThreshold: 0, // Remove default 1000 point limit
                boostThreshold: 5000, // Enable boost for >5000 points
                dataLabels: {
                    enabled: false, // Disable for performance
                },
                states: {
                    hover: {
                        enabled: dataSize < 10000, // Disable hover for very large datasets
                    },
                    inactive: {
                        enabled: dataSize < 10000,
                    },
                },
                marker: {
                    enabled: dataSize < 5000, // Only show markers for smaller datasets
                    enabledThreshold: 5000,
                },
            },
            scatter: {
                marker: {
                    enabled: true, // Always show for scatter plots
                    states: {
                        hover: {
                            enabled: dataSize < 10000,
                        },
                    },
                },
            },
        },

        // Chart-level optimizations
        chart: {
            animation: shouldDisableAnimation ? false : {
                duration: 200,
            },
            // Reduce reflow operations
            reflow: true,
        },

        // Tooltip optimizations
        tooltip: {
            animation: false, // Disable tooltip animation
            followPointer: dataSize < 5000, // Disable for large datasets
            useHTML: false, // Faster rendering without HTML
        },
    };
};

/**
 * Merge optimized config with user config
 * Optimizations are applied intelligently based on data size
 */
export const applyChartOptimizations = (
    userConfig: Highcharts.Options,
    dataSize: number
): Highcharts.Options => {
    const optimizations = getOptimizedChartConfig(dataSize);

    return {
        ...userConfig,
        ...optimizations,
        plotOptions: {
            ...userConfig.plotOptions,
            ...optimizations.plotOptions,
            series: {
                ...(userConfig.plotOptions?.series || {}),
                ...(optimizations.plotOptions?.series || {}),
            },
        },
        chart: {
            ...userConfig.chart,
            ...optimizations.chart,
        },
        tooltip: {
            ...userConfig.tooltip,
            ...optimizations.tooltip,
        },
    };
};

/**
 * Check if boost module should be used for a given dataset
 */
export const shouldUseBoost = (dataSize: number): boolean => {
    return dataSize > 5000;
};

/**
 * Log performance optimization applied
 */
export const logChartOptimization = (chartType: string, dataSize: number): void => {
    const optimizations: string[] = [];

    if (dataSize > 1000) optimizations.push('animations disabled');
    if (dataSize > 5000) optimizations.push('GPU boost enabled');
    if (dataSize > 10000) optimizations.push('hover states disabled');

    if (optimizations.length > 0) {
        console.log(
            `📊 Chart optimization (${chartType}): ${dataSize.toLocaleString()} points - ${optimizations.join(', ')}`
        );
    }
};
