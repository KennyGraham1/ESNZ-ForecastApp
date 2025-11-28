'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, memo, useState, useEffect } from 'react';
import { calculateSpatialClustering, ClusterResult } from '@/lib/analysis/clustering';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';
import { useClusteringContext } from '@/contexts/ClusteringContext';
import { perfMonitor } from '@/lib/monitoring/performance';
import { trackError } from '@/lib/monitoring/errors';
import { CLUSTERING_CONFIG } from '@/config/performance';

interface SpatialClusteringPlotProps {
    earthquakes: EarthquakeData[];
}

const SpatialClusteringPlot = memo(function SpatialClusteringPlot({ earthquakes }: SpatialClusteringPlotProps) {
    // Use shared clustering context
    const {
        algorithm,
        epsilon,
        minSamples,
        k,
        nnThreshold,
        selectedIndices,
        setAlgorithm,
        setEpsilon,
        setMinSamples,
        setK,
        setNnThreshold,
        toggleSelection,
    } = useClusteringContext();

    const chartRef = useRef<HighchartsReact.RefObject>(null);
    const workerRef = useRef<Worker | null>(null);
    const requestIdRef = useRef<number>(0); // Track request sequence to handle race conditions

    // OPTIMIZATION: Use Web Worker for non-blocking clustering
    const [clusteringResult, setClusteringResult] = useState<ClusterResult | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [calculationError, setCalculationError] = useState<string | null>(null);
    const [useWebWorker] = useState(CLUSTERING_CONFIG.ENABLE_WEB_WORKERS); // Toggle to enable/disable Web Worker

    useEffect(() => {
        // Reset error state
        setCalculationError(null);

        // Check if dataset is too large for clustering
        if (earthquakes.length > CLUSTERING_CONFIG.MAX_CLUSTERING_SIZE) {
            console.warn(`⚠️ Dataset too large for clustering: ${earthquakes.length} events (max: ${CLUSTERING_CONFIG.MAX_CLUSTERING_SIZE})`);
            setCalculationError(`Dataset too large for clustering (${earthquakes.length.toLocaleString()} events). Please filter to fewer than ${CLUSTERING_CONFIG.MAX_CLUSTERING_SIZE.toLocaleString()} events.`);
            setClusteringResult(null);
            return;
        }

        // For small datasets or when Web Worker is disabled, use synchronous calculation
        if (!useWebWorker || earthquakes.length < CLUSTERING_CONFIG.WEB_WORKER_THRESHOLD) {
            console.log(`🔄 Running spatial clustering (sync): ${earthquakes.length} events`, { algorithm, epsilon, minSamples, k });

            try {
                // MONITORING: Track clustering performance
                const result = perfMonitor.track(
                    `clustering-${algorithm}-sync`,
                    earthquakes.length,
                    () => calculateSpatialClustering(earthquakes, {
                        algorithm,
                        epsilon,
                        minSamples,
                        k,
                        nnThreshold,
                    }),
                    { algorithm, epsilon, minSamples, k, nnThreshold }
                );

                setClusteringResult(result);
            } catch (error) {
                console.error('❌ Clustering error:', error);

                // MONITORING: Track error
                trackError(
                    error instanceof Error ? error : new Error('Unknown clustering error'),
                    { component: 'SpatialClusteringPlot', operation: 'clustering-sync' },
                    { algorithm, epsilon, minSamples, k, nnThreshold, dataSize: earthquakes.length },
                    'high'
                );

                setCalculationError(error instanceof Error ? error.message : 'Unknown clustering error');
                setClusteringResult(null);
            }
            return;
        }

        // OPTIMIZATION: Use Web Worker for large datasets (non-blocking)
        console.log(`🔄 Running spatial clustering (Web Worker): ${earthquakes.length} events`, { algorithm, epsilon, minSamples, k, nnThreshold });
        setIsCalculating(true);

        // Increment request ID to handle race conditions
        const currentRequestId = ++requestIdRef.current;

        // Create Web Worker if not exists
        if (!workerRef.current) {
            try {
                workerRef.current = new Worker(
                    new URL('../lib/analysis/clustering.worker.ts', import.meta.url)
                );

                // Handle worker errors (crashes, syntax errors, etc.)
                workerRef.current.onerror = (error) => {
                    console.error('❌ Worker crashed:', error);
                    setCalculationError(`Worker error: ${error.message || 'Unknown worker error'}`);
                    setClusteringResult(null);
                    setIsCalculating(false);

                    // Terminate and reset worker
                    if (workerRef.current) {
                        workerRef.current.terminate();
                        workerRef.current = null;
                    }
                };
            } catch (error) {
                console.error('❌ Failed to create worker:', error);
                setCalculationError('Failed to initialize clustering worker');
                setIsCalculating(false);
                return;
            }
        }

        const worker = workerRef.current;

        // Handle worker messages
        const messageHandler = (e: MessageEvent) => {
            const { success, result, error, duration, requestId } = e.data;

            // Ignore stale responses (race condition protection)
            if (requestId && requestId !== currentRequestId) {
                console.log(`⏭️ Ignoring stale clustering result (request ${requestId} vs current ${currentRequestId})`);
                return;
            }

            if (success && result) {
                console.log(`✅ Worker: Clustering completed in ${duration?.toFixed(2)}ms`);
                setClusteringResult(result);
                setCalculationError(null);
            } else {
                console.error('❌ Worker: Clustering error:', error);
                setCalculationError(error || 'Clustering failed');
                setClusteringResult(null);
            }

            setIsCalculating(false);
        };

        worker.onmessage = messageHandler;

        // Start clustering in worker
        console.log('🔄 Worker: Starting clustering...', { algorithm, epsilon, minSamples, k, nnThreshold, requestId: currentRequestId });

        try {
            worker.postMessage({
                earthquakes,
                options: { algorithm, epsilon, minSamples, k, nnThreshold },
                requestId: currentRequestId
            });
        } catch (error) {
            console.error('❌ Failed to post message to worker:', error);
            setCalculationError('Failed to send data to worker');
            setIsCalculating(false);
        }

        // Cleanup
        return () => {
            // Don't terminate worker on cleanup, reuse it
            // Only terminate on component unmount
        };
    }, [earthquakes, algorithm, epsilon, minSamples, k, nnThreshold, useWebWorker]);

    // Cleanup worker on unmount
    useEffect(() => {
        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, []);

    const chartOptions: Highcharts.Options = useMemo(() => {
        // Validate data before processing
        if (!clusteringResult || !clusteringResult.labels || clusteringResult.labels.length === 0) {
            return {
                chart: { type: 'scatter', zoomType: 'xy', height: 500 },
                title: { text: '' },
                credits: { enabled: false },
                exporting: { enabled: false }, // Disable built-in export menu
                series: []
            };
        }

        const { labels } = clusteringResult;

        // Generate distinct colors for clusters using Viridis-like palette
        const getClusterColor = (clusterLabel: number) => {
            const colors = [
                '#440154', '#482878', '#3e4989', '#31688e', '#26828e',
                '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde724'
            ];
            return colors[clusterLabel % colors.length];
        };

        // Create data points with selection state
        const allPoints = earthquakes.map((eq, i) => {
            const cluster = labels[i];
            const isSelected = selectedIndices.has(i);
            const isNoise = cluster === -1;

            return {
                x: eq.longitude,
                y: eq.latitude,
                color: isSelected ? '#ef4444' : (isNoise ? '#9ca3af' : getClusterColor(cluster)),
                marker: {
                    radius: isSelected ? 7 : (isNoise ? 4 : 5),
                    fillOpacity: isSelected ? 0.95 : (isNoise ? 0.3 : 0.8),
                    lineWidth: isSelected ? 2 : 0,
                    lineColor: isSelected ? '#dc2626' : undefined,
                },
                custom: {
                    magnitude: eq.magnitude,
                    locality: eq.locality,
                    depth: eq.depth,
                    cluster,
                    index: i,
                }
            };
        });

        const noiseSeries = {
            type: 'scatter' as const,
            name: 'Noise',
            data: allPoints.filter(p => p.custom.cluster === -1),
        };

        const clusteredSeries = {
            type: 'scatter' as const,
            name: 'Clustered',
            data: allPoints.filter(p => p.custom.cluster !== -1),
        };

        return {
            chart: {
                type: 'scatter',
                zoomType: 'xy',
                height: 500
            },
            title: {
                text: ''
            },
            credits: {
                enabled: false
            },
            // CRITICAL FIX: Disable Highcharts built-in export menu
            // Reason: The built-in CSV export exports chart series data (x, y, custom)
            // instead of the original earthquake data. We use custom export buttons below.
            exporting: {
                enabled: false
            },
            // OPTIMIZATION: Boost module disabled for this chart
            // Reason: Boost module conflicts with individual point markers and cluster colors
            // Each point has custom marker configuration based on cluster assignment
            boost: {
                enabled: false
            },
            xAxis: {
                title: {
                    text: 'Longitude'
                },
                gridLineWidth: 1
            },
            yAxis: {
                title: {
                    text: 'Latitude'
                }
            },
            legend: {
                enabled: true,
                align: 'left',
                verticalAlign: 'top'
            },
            tooltip: {
                useHTML: true,
                formatter: function(this: any) {
                    const point = this.point;
                    const custom = point.custom;
                    const clusterInfo = custom.cluster !== undefined
                        ? `Cluster ${custom.cluster}<br/>`
                        : 'Noise<br/>';

                    return `
                        <div style="padding: 4px;">
                            ${clusterInfo}
                            <strong>${custom.locality}</strong><br/>
                            M${custom.magnitude.toFixed(1)}<br/>
                            Depth: ${custom.depth.toFixed(1)} km
                        </div>
                    `;
                }
            },
            plotOptions: {
                scatter: {
                    turboThreshold: 20000, // Increase threshold for large datasets (20+ years)
                    marker: {
                        radius: 5
                    },
                    point: {
                        events: {
                            click: function(this: any) {
                                const idx = this.custom.index;
                                if (idx !== undefined) {
                                    toggleSelection(idx);
                                }
                            }
                        }
                    }
                }
            },
            series: [noiseSeries, clusteredSeries],
            accessibility: {
                enabled: true,
                description: 'Spatial clustering map showing earthquake clusters identified by DBSCAN algorithm'
            }
        };
    }, [earthquakes, clusteringResult, selectedIndices, toggleSelection]);

    // OPTIMIZATION: Show loading indicator while clustering in Web Worker
    if (isCalculating) {
        return (
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200 h-[500px] flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 font-medium">Calculating clusters...</p>
                    <p className="text-gray-500 text-sm mt-2">Processing {earthquakes.length.toLocaleString()} events</p>
                    <p className="text-gray-400 text-xs mt-1">Using {useWebWorker && earthquakes.length >= 1000 ? 'Web Worker (non-blocking)' : 'synchronous calculation'}</p>
                </div>
            </div>
        );
    }

    // Show error state with helpful message
    if (calculationError) {
        return (
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200 h-[500px] flex items-center justify-center">
                <div className="text-center max-w-md">
                    <div className="text-red-500 text-4xl mb-4">⚠️</div>
                    <p className="text-gray-700 font-medium mb-2">Clustering Error</p>
                    <p className="text-gray-600 text-sm mb-4">{calculationError}</p>
                    <button
                        onClick={() => {
                            setCalculationError(null);
                            setClusteringResult(null);
                            // Force re-calculation by updating a dependency
                            setIsCalculating(true);
                            setTimeout(() => setIsCalculating(false), 100);
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!clusteringResult) {
        return (
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200 h-[500px] flex items-center justify-center">
                <p className="text-gray-500">Insufficient data for clustering (need at least 10 events)</p>
            </div>
        );
    }

    const { nClusters, clusterPercent, noisePercent } = clusteringResult;

    return (
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <div className="flex justify-between items-start mb-4 gap-4 flex-wrap">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        Spatial Clustering
                        {isCalculating && (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-normal">
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                                Computing...
                            </span>
                        )}
                    </h3>
                    <p className="text-sm text-gray-600">
                        Algorithm: <span className="font-semibold uppercase">{algorithm}</span> · {nClusters} clusters · {clusterPercent.toFixed(1)}% clustered, {noisePercent.toFixed(1)}% noise
                    </p>
                </div>
                <div className="flex flex-col md:flex-row gap-4 text-xs text-gray-600 items-start md:items-center">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold">Algorithm</span>
                        <select
                            value={algorithm}
                            onChange={(e) => setAlgorithm(e.target.value as any)}
                            className="border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                            title="Select clustering algorithm"
                        >
                            <optgroup label="Density-Based">
                                <option value="dbscan">DBSCAN - Density clusters</option>
                                <option value="optics">OPTICS - Variable density</option>
                            </optgroup>
                            <optgroup label="Hierarchical">
                                <option value="hierarchical-single">Single Linkage - Min distance</option>
                                <option value="hierarchical-complete">Complete Linkage - Max distance</option>
                                <option value="hierarchical-average">Average Linkage - Avg distance</option>
                                <option value="hierarchical-ward">Ward Linkage - Min variance</option>
                            </optgroup>
                            <optgroup label="Other">
                                <option value="kmeans">K-Means - Partition-based</option>
                                <option value="nearest-neighbor">Nearest-Neighbor - Seismology</option>
                            </optgroup>
                        </select>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        {(algorithm === 'dbscan' || algorithm === 'optics') && (
                            <>
                                <div className="flex flex-col">
                                    <span>Epsilon: <span className="font-semibold">{epsilon} km</span></span>
                                    <input
                                        type="range"
                                        min={5}
                                        max={100}
                                        step={5}
                                        value={epsilon}
                                        onChange={(e) => setEpsilon(parseInt(e.target.value))}
                                        title="Search radius for density-based clustering"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <span>Min pts: <span className="font-semibold">{minSamples}</span></span>
                                    <input
                                        type="range"
                                        min={3}
                                        max={20}
                                        step={1}
                                        value={minSamples}
                                        onChange={(e) => setMinSamples(parseInt(e.target.value))}
                                        title="Minimum points to form a cluster"
                                    />
                                </div>
                            </>
                        )}
                        {(algorithm === 'kmeans' || algorithm.startsWith('hierarchical-')) && (
                            <div className="flex flex-col">
                                <span>Clusters (k): <span className="font-semibold">{k}</span></span>
                                <input
                                    type="range"
                                    min={2}
                                    max={15}
                                    step={1}
                                    value={k}
                                    onChange={(e) => setK(parseInt(e.target.value))}
                                    title="Number of clusters to create"
                                />
                            </div>
                        )}
                        {algorithm === 'nearest-neighbor' && (
                            <div className="flex flex-col">
                                <span>NN Threshold: <span className="font-semibold">{nnThreshold.toFixed(2)}</span></span>
                                <input
                                    type="range"
                                    min={0.1}
                                    max={5.0}
                                    step={0.1}
                                    value={nnThreshold}
                                    onChange={(e) => setNnThreshold(parseFloat(e.target.value))}
                                    title="Nearest-neighbor distance threshold (space-time-magnitude)"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {(algorithm === 'dbscan' || algorithm === 'optics') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Search Radius (epsilon): {epsilon} km
                        </label>
                        <input
                            type="range"
                            min="5"
                            max="100"
                            step="5"
                            value={epsilon}
                            onChange={(e) => setEpsilon(parseInt(e.target.value))}
                            className="w-full"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Min Points per Cluster: {minSamples}
                        </label>
                        <input
                            type="range"
                            min="3"
                            max="20"
                            step="1"
                            value={minSamples}
                            onChange={(e) => setMinSamples(parseInt(e.target.value))}
                            className="w-full"
                        />
                    </div>
                </div>
            )}
            {algorithm === 'kmeans' && (
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Number of Clusters (k): {k}
                    </label>
                    <input
                        type="range"
                        min="2"
                        max="15"
                        step="1"
                        value={k}
                        onChange={(e) => setK(parseInt(e.target.value))}
                        className="w-full"
                    />
                </div>
            )}

            <div className="h-[500px]">
                <HighchartsReact
                    highcharts={Highcharts}
                    options={chartOptions}
                    ref={chartRef}
                />
            </div>
            <ChartExportButtons
                chartRef={chartRef}
                data={earthquakes}
                filename="spatial-clustering"
                clusteringMetadata={clusteringResult?.metadata}
                clusterLabels={clusteringResult?.labels}
            />
        </div>
    );
});

// Export memoized version to prevent unnecessary re-renders
export default SpatialClusteringPlot;
