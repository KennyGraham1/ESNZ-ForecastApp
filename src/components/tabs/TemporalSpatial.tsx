'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useState, useMemo, useRef, useEffect, memo, useCallback } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from '../ChartExportButtons';
import { useClusteringWorker } from '@/hooks/useClusteringWorker';
import ClusteringProgressPanel from '@/components/ClusteringProgressPanel';
import { useClusteringContext } from '@/contexts/ClusteringContext';
import { formatDateTime } from '@/utils/dateFormat';
import TemporalSpatial3DPlot from '../TemporalSpatial3DPlot';
import dynamic from 'next/dynamic';
import { useDebounce } from '@/hooks/useDebounce';
import { applyChartOptimizations } from '@/utils/highchartsOptimization';
import { CLUSTERING_CONFIG } from '@/config/performance';

const LeafletClusterMap = dynamic(() => import('@/components/LeafletClusterMap'), {
    ssr: false,
    loading: () => <div className="h-[600px] w-full bg-gray-50 flex items-center justify-center animate-pulse rounded"><p className="text-gray-500">Loading interactive map...</p></div>
});
interface TemporalSpatialProps {
    earthquakes: EarthquakeData[];
}

const TemporalSpatial = memo(function TemporalSpatial({ earthquakes }: TemporalSpatialProps) {
    // Use shared clustering context
    const {
        algorithm: clusteringAlgorithm,
        epsilon,
        minSamples,
        k,
        nnThreshold,
        stepMinMag,
        stepT1,
        stepT2,
        epsilonTemporal,
        tmcRfact,
        tmcTau0,
        tmcTauMax,
        tmcP1,
        tmcXk,
        hardebeckMinMag,
        hardebeckTimeWindow,
        hardebeckRuptureMult,
        hardebeckMainshockTimeYears,
        hdbscanMinClusterSize,
        hdbscanMinSamples,
        includeNoise,
        selectedIndices,
        setAlgorithm: setClusteringAlgorithm,
        setEpsilon,
        setMinSamples,
        setK,
        setNnThreshold,
        setStepMinMag,
        setStepT1,
        setStepT2,
        setEpsilonTemporal,
        setTmcRfact,
        setTmcTau0,
        setTmcTauMax,
        setTmcP1,
        setTmcXk,
        setHardebeckMinMag,
        setHardebeckTimeWindow,
        setHardebeckRuptureMult,
        setHardebeckMainshockTimeYears,
        setHdbscanMinClusterSize,
        setHdbscanMinSamples,
        setIncludeNoise,
        setSelectedIndices,
        toggleSelection,
        clearSelection,
        addToSelection,
    } = useClusteringContext();

    // Local state for parameters (to allow "Apply" behavior)
    const [localEpsilon, setLocalEpsilon] = useState(epsilon);
    const [localMinSamples, setLocalMinSamples] = useState(minSamples);
    const [localK, setLocalK] = useState(k);
    const [localNnThreshold, setLocalNnThreshold] = useState(nnThreshold);
    const [localStepMinMag, setLocalStepMinMag] = useState(stepMinMag);
    const [localStepT1, setLocalStepT1] = useState(stepT1);
    const [localStepT2, setLocalStepT2] = useState(stepT2);
    const [localEpsilonTemporal, setLocalEpsilonTemporal] = useState(epsilonTemporal);
    const [localTmcRfact, setLocalTmcRfact] = useState(tmcRfact);
    const [localTmcTau0, setLocalTmcTau0] = useState(tmcTau0);
    const [localTmcTauMax, setLocalTmcTauMax] = useState(tmcTauMax);
    const [localTmcP1, setLocalTmcP1] = useState(tmcP1);
    const [localTmcXk, setLocalTmcXk] = useState(tmcXk);
    const [localHardebeckMinMag, setLocalHardebeckMinMag] = useState(hardebeckMinMag);
    const [localHardebeckTimeWindow, setLocalHardebeckTimeWindow] = useState(hardebeckTimeWindow);
    const [localHardebeckRuptureMult, setLocalHardebeckRuptureMult] = useState(hardebeckRuptureMult);
    const [localHardebeckMainshockTimeYears, setLocalHardebeckMainshockTimeYears] = useState(hardebeckMainshockTimeYears);
    const [localHdbscanMinClusterSize, setLocalHdbscanMinClusterSize] = useState(hdbscanMinClusterSize);
    const [localHdbscanMinSamples, setLocalHdbscanMinSamples] = useState(hdbscanMinSamples);

    // Selection mode: 'individual' selects one point; 'cluster' selects all events in the same cluster
    const [selectionMode, setSelectionMode] = useState<'individual' | 'cluster'>('individual');
    const [showOnlySelectedCluster, setShowOnlySelectedCluster] = useState(false);
    const [isolatedClusterLabel, setIsolatedClusterLabel] = useState<number | null>(null);

    // Sync local state when context values change (e.g. initial load or external update)
    useEffect(() => {
        setLocalEpsilon(epsilon);
        setLocalMinSamples(minSamples);
        setLocalK(k);
        setLocalNnThreshold(nnThreshold);
        setLocalStepMinMag(stepMinMag);
        setLocalStepT1(stepT1);
        setLocalStepT2(stepT2);
        setLocalEpsilonTemporal(epsilonTemporal);
        setLocalTmcRfact(tmcRfact);
        setLocalTmcTau0(tmcTau0);
        setLocalTmcTauMax(tmcTauMax);
        setLocalTmcP1(tmcP1);
        setLocalTmcXk(tmcXk);
        setLocalHardebeckMinMag(hardebeckMinMag);
        setLocalHardebeckTimeWindow(hardebeckTimeWindow);
        setLocalHardebeckRuptureMult(hardebeckRuptureMult);
        setLocalHardebeckMainshockTimeYears(hardebeckMainshockTimeYears);
        setLocalHdbscanMinClusterSize(hdbscanMinClusterSize);
        setLocalHdbscanMinSamples(hdbscanMinSamples);
    }, [epsilon, minSamples, k, nnThreshold, stepMinMag, stepT1, stepT2, epsilonTemporal, tmcRfact, tmcTau0, tmcTauMax, tmcP1, tmcXk, hardebeckMinMag, hardebeckTimeWindow, hardebeckRuptureMult, hardebeckMainshockTimeYears, hdbscanMinClusterSize, hdbscanMinSamples]);

    // Snapshot of all local slider values — changes reference only when a value actually changes
    const localParamsSnapshot = useMemo(() => ({
        epsilon: localEpsilon,
        minSamples: localMinSamples,
        k: localK,
        nnThreshold: localNnThreshold,
        stepMinMag: localStepMinMag,
        stepT1: localStepT1,
        stepT2: localStepT2,
        epsilonTemporal: localEpsilonTemporal,
        tmcRfact: localTmcRfact,
        tmcTau0: localTmcTau0,
        tmcTauMax: localTmcTauMax,
        tmcP1: localTmcP1,
        tmcXk: localTmcXk,
        hardebeckMinMag: localHardebeckMinMag,
        hardebeckTimeWindow: localHardebeckTimeWindow,
        hardebeckRuptureMult: localHardebeckRuptureMult,
        hardebeckMainshockTimeYears: localHardebeckMainshockTimeYears,
        hdbscanMinClusterSize: localHdbscanMinClusterSize,
        hdbscanMinSamples: localHdbscanMinSamples,
    }), [localEpsilon, localMinSamples, localK, localNnThreshold, localStepMinMag, localStepT1, localStepT2, localEpsilonTemporal, localTmcRfact, localTmcTau0, localTmcTauMax, localTmcP1, localTmcXk, localHardebeckMinMag, localHardebeckTimeWindow, localHardebeckRuptureMult, localHardebeckMainshockTimeYears, localHdbscanMinClusterSize, localHdbscanMinSamples]);

    // Debounce: auto-apply to context 600ms after the user stops moving any slider,
    // so clustering re-runs without requiring an explicit "Apply" click.
    const debouncedLocalParams = useDebounce(localParamsSnapshot, 600);

    useEffect(() => {
        setEpsilon(debouncedLocalParams.epsilon);
        setMinSamples(debouncedLocalParams.minSamples);
        setK(debouncedLocalParams.k);
        setNnThreshold(debouncedLocalParams.nnThreshold);
        setStepMinMag(debouncedLocalParams.stepMinMag);
        setStepT1(debouncedLocalParams.stepT1);
        setStepT2(debouncedLocalParams.stepT2);
        setEpsilonTemporal(debouncedLocalParams.epsilonTemporal);
        setTmcRfact(debouncedLocalParams.tmcRfact);
        setTmcTau0(debouncedLocalParams.tmcTau0);
        setTmcTauMax(debouncedLocalParams.tmcTauMax);
        setTmcP1(debouncedLocalParams.tmcP1);
        setTmcXk(debouncedLocalParams.tmcXk);
        setHardebeckMinMag(debouncedLocalParams.hardebeckMinMag);
        setHardebeckTimeWindow(debouncedLocalParams.hardebeckTimeWindow);
        setHardebeckRuptureMult(debouncedLocalParams.hardebeckRuptureMult);
        setHardebeckMainshockTimeYears(debouncedLocalParams.hardebeckMainshockTimeYears);
        setHdbscanMinClusterSize(debouncedLocalParams.hdbscanMinClusterSize);
        setHdbscanMinSamples(debouncedLocalParams.hdbscanMinSamples);
    }, [debouncedLocalParams, setEpsilon, setMinSamples, setK, setNnThreshold, setStepMinMag, setStepT1, setStepT2, setEpsilonTemporal, setTmcRfact, setTmcTau0, setTmcTauMax, setTmcP1, setTmcXk, setHardebeckMinMag, setHardebeckTimeWindow, setHardebeckRuptureMult, setHardebeckMainshockTimeYears, setHdbscanMinClusterSize, setHdbscanMinSamples]);

    // Apply handler — immediate application without waiting for the debounce delay
    const handleApplyParameters = () => {
        setEpsilon(localEpsilon);
        setMinSamples(localMinSamples);
        setK(localK);
        setNnThreshold(localNnThreshold);
        setStepMinMag(localStepMinMag);
        setStepT1(localStepT1);
        setStepT2(localStepT2);
        setEpsilonTemporal(localEpsilonTemporal);
        setTmcRfact(localTmcRfact);
        setTmcTau0(localTmcTau0);
        setTmcTauMax(localTmcTauMax);
        setTmcP1(localTmcP1);
        setTmcXk(localTmcXk);
        setHardebeckMinMag(localHardebeckMinMag);
        setHardebeckTimeWindow(localHardebeckTimeWindow);
        setHardebeckRuptureMult(localHardebeckRuptureMult);
        setHardebeckMainshockTimeYears(localHardebeckMainshockTimeYears);
        setHdbscanMinClusterSize(localHdbscanMinClusterSize);
        setHdbscanMinSamples(localHdbscanMinSamples);
    };

    // Reservoir-sample incoming events to keep the clustering + rendering budget manageable.
    // Threshold comes from centralised config (was hard-coded 3 000; now 5 000 by default).
    const processedEarthquakes = useMemo(() => {
        const threshold = CLUSTERING_CONFIG.TEMPORAL_SPATIAL_SAMPLE_SIZE;
        if (earthquakes.length > threshold) {
            const sampled = [...earthquakes];
            for (let i = threshold; i < sampled.length; i++) {
                const j = Math.floor(Math.random() * (i + 1));
                if (j < threshold) sampled[j] = earthquakes[i];
            }
            const result = sampled.slice(0, threshold);
            console.log(`TemporalSpatial: Reservoir-sampled ${result.length} from ${earthquakes.length} events`);
            return result;
        }
        return earthquakes;
    }, [earthquakes]);
    // Clear selection when data changes to prevent stale indices/crashes
    useEffect(() => {
        if (selectedIndices.size > 0) {
            clearSelection();
        }
        setIsolatedClusterLabel(null);
    }, [processedEarthquakes, clearSelection]);

    // Map state (no longer needs NZ geometry — LeafletClusterMap handles tiles natively)

    // Clustering — hybrid worker/server hook
    const {
        result: clusteringResult,
        isCalculating: isClusteringCalculating,
        computeInfo: clusteringComputeInfo,
        runClustering,
        cancelClustering,
    } = useClusteringWorker();

    // Unified point-click handler for all three views.
    // In 'individual' mode: toggles the single clicked event.
    // In 'cluster' mode: exclusively selects every event sharing the same clusterLabel.
    // Noise points (label -1) always behave as individual selections.
    const handlePointClick = useCallback((originalIndex: number) => {
        if (originalIndex < 0) return;

        if (selectionMode === 'individual' || !clusteringResult) {
            toggleSelection(originalIndex);
            return;
        }

        const clickedLabel = clusteringResult.labels[originalIndex] ?? -1;

        if (clickedLabel === -1) {
            // Noise point — fall back to individual toggle
            toggleSelection(originalIndex);
            return;
        }

        const clusterIndices: number[] = [];
        clusteringResult.labels.forEach((label, idx) => {
            if (label === clickedLabel) clusterIndices.push(idx);
        });

        const exactClusterSelected =
            selectedIndices.size === clusterIndices.length &&
            clusterIndices.every(idx => selectedIndices.has(idx));

        if (exactClusterSelected) {
            clearSelection();
            setIsolatedClusterLabel(null);
        } else {
            setSelectedIndices(new Set(clusterIndices));
            if (showOnlySelectedCluster) {
                setIsolatedClusterLabel(clickedLabel);
            }
        }
    }, [selectionMode, clusteringResult, toggleSelection, selectedIndices, setSelectedIndices, clearSelection, showOnlySelectedCluster]);

    const chartRef = useRef<HighchartsReact.RefObject>(null);

    // Load New Zealand map data
    useEffect(() => {
        // Highcharts map removed; no geometry needed
    }, []);

    // Add global error handler for Highcharts coordinate errors
    useEffect(() => {
        const handleError = (event: ErrorEvent) => {
            // Suppress specific Highcharts coordinate transformation errors
            if (
                event.message &&
                (event.message.includes('coordinates must be finite numbers') ||
                    event.message.includes('coordinate') ||
                    event.message.includes('transformToLatLon') ||
                    event.message.includes('projectedUnitsToLonLat'))
            ) {
                console.debug('Suppressed Highcharts coordinate error:', event.message);
                event.preventDefault();
                event.stopPropagation();
                return false;
            }
        };

        window.addEventListener('error', handleError);
        return () => window.removeEventListener('error', handleError);
    }, []);



    // K-Means produces no noise — if the user had "Hide Noise" on, reset it to avoid
    // showing an empty chart when they switch to K-Means.
    useEffect(() => {
        if (clusteringAlgorithm === 'kmeans' && !includeNoise) {
            setIncludeNoise(true);
        }
    }, [clusteringAlgorithm, includeNoise, setIncludeNoise]);

    // Trigger clustering whenever inputs change
    useEffect(() => {
        if (!processedEarthquakes.length) return;
        runClustering(processedEarthquakes, {
            algorithm: clusteringAlgorithm,
            epsilon,
            minSamples,
            k,
            nnThreshold,
            stepMinMag,
            stepT1,
            stepT2,
            epsilonTemporal,
            tmcRfact,
            tmcTau0,
            tmcTauMax,
            tmcP1,
            tmcXk,
            hardebeckMinMag,
            hardebeckTimeWindow,
            hardebeckRuptureMult,
            hardebeckMainshockTimeYears,
            hdbscanMinClusterSize,
            hdbscanMinSamples,
        });
    }, [processedEarthquakes, clusteringAlgorithm, epsilon, minSamples, k, nnThreshold, stepMinMag, stepT1, stepT2, epsilonTemporal, tmcRfact, tmcTau0, tmcTauMax, tmcP1, tmcXk, hardebeckMinMag, hardebeckTimeWindow, hardebeckRuptureMult, hardebeckMainshockTimeYears, hdbscanMinClusterSize, hdbscanMinSamples, runClustering]);

    // Helper to get consistent cluster colors
    const getClusterColor = (clusterLabel: number) => {
        const colors = [
            '#440154', '#482878', '#3e4989', '#31688e', '#26828e',
            '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde724',
        ];
        if (clusterLabel < 0) return '#9ca3af'; // noise / unassigned
        return colors[clusterLabel % colors.length];
    };

    // Filter earthquakes for display based on noise setting
    const filteredEarthquakes = useMemo(() => {
        if (!clusteringResult || includeNoise) {
            return processedEarthquakes;
        }

        // Return only points that are NOT noise (label != -1).
        // Guard against a stale result whose labels array is shorter than processedEarthquakes:
        // treat any missing label as noise (-1) so we don't accidentally show orphaned points.
        return processedEarthquakes.filter((_, index) => {
            const label = clusteringResult.labels[index] ?? -1;
            return label !== -1;
        });
    }, [processedEarthquakes, clusteringResult, includeNoise]);

    // Create a map from original indices to filtered indices (if filtering is active)
    // This is needed because interaction handlers (clicks etc) might give original indices
    const originalToFilteredIndex = useMemo(() => {
        if (!clusteringResult || includeNoise) return null;

        const map = new Map<number, number>();
        let filteredIdx = 0; // Index in the filtered array

        processedEarthquakes.forEach((_, originalIdx) => {
            const label = clusteringResult.labels[originalIdx] ?? -1;
            if (label !== -1) {
                map.set(originalIdx, filteredIdx++);
            }
        });

        return map;
    }, [processedEarthquakes, clusteringResult, includeNoise]);

    // Pre-compute eventID → index map once (O(n)) to avoid O(n²) findIndex calls below
    const eventIndexMap = useMemo(() => {
        const map = new Map<string, number>();
        processedEarthquakes.forEach((eq, idx) => map.set(eq.eventID, idx));
        return map;
    }, [processedEarthquakes]);

    // Re-implementing data preparation correctly for all charts
    const chartData = useMemo(() => {
        return filteredEarthquakes.map(eq => {
            const originalIndex = eventIndexMap.get(eq.eventID) ?? -1;
            const clusterLabel = (clusteringResult && originalIndex !== -1)
                ? clusteringResult.labels[originalIndex]
                : -1;
            const isSelected = selectedIndices.has(originalIndex);

            return {
                lat: eq.latitude,
                lon: eq.longitude,
                z: isSelected ? 1000 : clusterLabel + 2,
                cluster: clusterLabel,
                magnitude: eq.magnitude,
                depth: eq.depth,
                time: eq.time,
                locality: eq.locality,
                eventID: eq.eventID,
                isSelected: isSelected,
                originalIndex
            };
        });
    }, [filteredEarthquakes, clusteringResult, selectedIndices, eventIndexMap]);

    const selectedClusterLabel = useMemo(() => {
        if (!clusteringResult || selectedIndices.size === 0) return null;

        let label: number | null = null;
        for (const idx of selectedIndices) {
            const currentLabel = clusteringResult.labels[idx] ?? -1;
            if (currentLabel < 0) return null;
            if (label === null) {
                label = currentLabel;
            } else if (label !== currentLabel) {
                return null;
            }
        }

        if (label === null) return null;

        let clusterSize = 0;
        clusteringResult.labels.forEach(currentLabel => {
            if (currentLabel === label) clusterSize++;
        });

        return selectedIndices.size === clusterSize ? label : null;
    }, [clusteringResult, selectedIndices]);

    useEffect(() => {
        if (!showOnlySelectedCluster) {
            if (isolatedClusterLabel !== null) setIsolatedClusterLabel(null);
            return;
        }

        setIsolatedClusterLabel(selectedClusterLabel);
    }, [showOnlySelectedCluster, selectedClusterLabel, isolatedClusterLabel]);

    const visibleChartData = useMemo(() => {
        if (!showOnlySelectedCluster || isolatedClusterLabel === null) {
            return chartData;
        }

        return chartData.filter(d => d.cluster === isolatedClusterLabel);
    }, [chartData, showOnlySelectedCluster, isolatedClusterLabel]);

    const visibleExportEarthquakes = useMemo(() => {
        return visibleChartData
            .map(d => processedEarthquakes[d.originalIndex])
            .filter((eq): eq is EarthquakeData => Boolean(eq));
    }, [visibleChartData, processedEarthquakes]);

    const visibleClusterLabels = useMemo(() => {
        if (!clusteringResult) return undefined;
        return visibleChartData.map(d => d.cluster);
    }, [visibleChartData, clusteringResult]);

    // Create temporal plot options
    const temporalPlotOptions: Highcharts.Options = useMemo(() => {
        const validData = visibleChartData.map((d) => {
            try {
                const time = d.time instanceof Date ? d.time : new Date(d.time);
                if (isNaN(time.getTime())) return null;
                return {
                    time: time.getTime(),
                    timeStr: time.toISOString(),
                    magnitude: d.magnitude,
                    depth: d.depth,
                    latitude: d.lat,
                    longitude: d.lon,
                    locality: d.locality,
                    size: Math.max(2, Math.pow(2, d.magnitude - 2)),
                    isSelected: d.isSelected,
                    originalIndex: d.originalIndex,
                    cluster: d.cluster,
                    eventID: d.eventID,
                };
            } catch (e) {
                return null;
            }
        }).filter((item): item is NonNullable<typeof item> => item !== null);

        const baseOptions: Highcharts.Options = {
            chart: {
                type: 'scatter',
                zooming: { type: 'xy' },
                height: 500
            },
            title: { text: '' },
            credits: { enabled: false },
            // Custom export buttons replace the built-in menu (which exports series coords, not raw data)
            exporting: { enabled: false },
            // Boost disabled: conflicts with per-point marker customisation and click selection
            boost: { enabled: false },
            xAxis: {
                type: 'datetime',
                title: {
                    text: 'Time',
                    style: { fontSize: '13px', fontWeight: '600', color: '#374151' }
                },
                gridLineWidth: 0,
                labels: { style: { fontSize: '11px', color: '#6b7280' } },
                lineColor: '#d1d5db',
                tickColor: '#d1d5db',
                crosshair: { width: 1, color: '#9ca3af', dashStyle: 'Dash' }
            },
            yAxis: {
                title: {
                    text: 'Magnitude',
                    style: { fontSize: '13px', fontWeight: '600', color: '#374151' }
                },
                gridLineWidth: 0,
                labels: { style: { fontSize: '11px', color: '#6b7280' } },
                lineColor: '#d1d5db',
                tickColor: '#d1d5db',
                crosshair: { width: 1, color: '#9ca3af', dashStyle: 'Dash' }
            },
            legend: { enabled: false },
            tooltip: {
                useHTML: true,
                backgroundColor: 'rgba(255, 255, 255, 0.96)',
                borderColor: '#d1d5db',
                borderRadius: 8,
                borderWidth: 1,
                shadow: {
                    color: 'rgba(0, 0, 0, 0.1)',
                    offsetX: 0,
                    offsetY: 2,
                    opacity: 0.5,
                    width: 4
                },
                formatter: function (this: any) {
                    const point = this.point;
                    const custom = point.custom;
                    const time = new Date(custom.timeStr);
                    const timeStr = formatDateTime(time);
                    const clusterText = custom.cluster >= 0 ? `Cluster ${custom.cluster}` : 'Noise';
                    return `
                        <div style="padding: 8px; min-width: 200px;">
                            <div style="font-weight: 600; color: #1f2937; margin-bottom: 6px; font-size: 13px;">${custom.locality || 'Unknown location'}</div>
                            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #4b5563;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: #6b7280;">Magnitude:</span>
                                    <span style="font-weight: 600; color: #dc2626;">M ${custom.magnitude.toFixed(1)}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: #6b7280;">Depth:</span>
                                    <span style="font-weight: 500;">${custom.depth.toFixed(1)} km</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                                    <span style="color: #6b7280;">Lat:</span>
                                    <span>${custom.latitude.toFixed(2)}°</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                                    <span style="color: #6b7280;">Lon:</span>
                                    <span>${custom.longitude.toFixed(2)}°</span>
                                </div>
                                <div style="border-top: 1px solid #e5e7eb; margin-top: 4px; padding-top: 4px; font-size: 11px; color: #6b7280;">
                                    ${timeStr}
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af;">
                                    <span>ID: ${custom.eventID || 'N/A'}</span>
                                    <span><em>${clusterText}</em></span>
                                </div>
                            </div>
                        </div>
                    `;
                }
            },
            plotOptions: {
                scatter: {
                    turboThreshold: 20000,
                    marker: { radius: 5 },
                    point: {
                        events: {
                            click: function (this: any) {
                                handlePointClick(this.custom.originalIndex);
                            }
                        }
                    }
                }
            },
            series: [{
                type: 'scatter',
                name: 'Earthquakes',
                data: validData.map(d => ({
                    x: d.time,
                    y: d.magnitude,
                    marker: {
                        // Selected points: larger radius + white ring = glowing halo effect
                        radius: d.isSelected ? Math.max(d.size + 2, 7) : d.size,
                        fillColor: d.isSelected ? '#ef4444' : getClusterColor(d.cluster),
                        fillOpacity: d.isSelected ? 1 : 0.7,
                        lineWidth: d.isSelected ? 2.5 : 0,
                        lineColor: d.isSelected ? '#ffffff' : undefined,
                    },
                    custom: {
                        magnitude: d.magnitude,
                        depth: d.depth,
                        timeStr: d.timeStr,
                        latitude: d.latitude,
                        longitude: d.longitude,
                        locality: d.locality,
                        originalIndex: d.originalIndex,
                        cluster: d.cluster,
                        eventID: d.eventID,
                    }
                }))
            }],
            accessibility: {
                enabled: true,
                description: 'Temporal plot showing earthquake magnitude over time. Points are colored by cluster assignment. Click points to select.',
                keyboardNavigation: { enabled: true }
            }
        };

        // Apply GPU/animation optimisations based on dataset size, but preserve
        // our scatter config (per-point markers) and keep boost disabled.
        const optimized = applyChartOptimizations(baseOptions, validData.length);
        return {
            ...optimized,
            boost: { enabled: false },
            plotOptions: {
                ...optimized.plotOptions,
                scatter: baseOptions.plotOptions?.scatter,
            },
            tooltip: {
                ...optimized.tooltip,
                useHTML: true,
            },
        };
    }, [visibleChartData, handlePointClick]);

    // Prepare earthquake data for map
    const mapPoints = useMemo(() => {
        return visibleChartData
            .map((d) => {
                const lat = d.lat;
                const lon = d.lon;

                if (
                    typeof lat !== 'number' ||
                    typeof lon !== 'number' ||
                    !isFinite(lat) ||
                    !isFinite(lon) ||
                    isNaN(lat) ||
                    isNaN(lon) ||
                    lat < -90 ||
                    lat > 90 ||
                    lon < -180 ||
                    lon > 180
                ) {
                    return null;
                }

                return {
                    lat,
                    lon,
                    magnitude: d.magnitude,
                    depth: d.depth,
                    time: d.time,
                    locality: d.locality,
                    isSelected: d.isSelected,
                    originalIndex: d.originalIndex,
                    cluster: d.cluster,
                    color: getClusterColor(d.cluster),
                    eventID: d.eventID,
                };
            })
            .filter((eq): eq is NonNullable<typeof eq> => eq !== null);
    }, [visibleChartData]);

    const handleClearSelection = useCallback(() => {
        clearSelection();
        setIsolatedClusterLabel(null);
    }, [clearSelection]);



    return (
        <div className="space-y-6">
            {/* Clustering progress popup */}
            {clusteringComputeInfo && (
                <ClusteringProgressPanel
                    computeInfo={clusteringComputeInfo}
                    onCancel={cancelClustering}
                />
            )}

            {/* Header Section */}
            <div className="bg-gradient-to-r from-green-50 to-teal-50 p-6 rounded-xl border border-green-200">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Temporal-Spatial Analysis</h2>
                <p className="text-gray-600">Explore earthquake patterns through linked temporal and spatial visualizations with bidirectional selection.</p>
            </div>

            {/* Selection Status and Controls Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="grid gap-4 xl:grid-cols-[minmax(220px,0.75fr)_minmax(0,1.65fr)_minmax(260px,0.85fr)] items-start">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3.5 space-y-2.5">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Selection Summary</div>
                        <div className="text-sm font-medium text-gray-800">
                            {selectedIndices.size > 0 ? (
                                <span className="flex items-center gap-2">
                                    <span className="inline-block w-3 h-3 bg-red-500 rounded-full"></span>
                                    <strong className="text-red-600">{selectedIndices.size}</strong> earthquakes selected
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <span className="inline-block w-3 h-3 bg-blue-500 rounded-full"></span>
                                    Showing <strong className="text-blue-600">{filteredEarthquakes.length}</strong> earthquakes
                                    {processedEarthquakes.length < earthquakes.length && (
                                        <span className="text-xs text-gray-500">(sampled from {earthquakes.length})</span>
                                    )}
                                </span>
                            )}
                        </div>
                        {clusteringResult && !isClusteringCalculating && (
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-gray-500">
                                <span>
                                    Algorithm: <span className="font-semibold uppercase">{clusteringAlgorithm}</span>
                                </span>
                                <span>
                                    Clusters: <span className="font-semibold">{clusteringResult.nClusters}</span>
                                </span>
                                <span>
                                    In clusters: <span className="font-semibold">{clusteringResult.clusterPercent.toFixed(1)}%</span>
                                </span>
                                {clusteringResult.noisePercent > 0 ? (
                                    <span>
                                        Noise:{' '}
                                        <span className="font-semibold">{clusteringResult.noisePercent.toFixed(1)}%</span>
                                        {!includeNoise && (
                                            <span className="ml-1 italic text-gray-400">(hidden — {Math.max(0, processedEarthquakes.length - filteredEarthquakes.length)} events)</span>
                                        )}
                                    </span>
                                ) : (
                                    <span className="italic text-gray-400">No noise — all points clustered</span>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 space-y-3 rounded-lg border border-gray-200 bg-white p-3.5">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Algorithm</label>
                            <select
                                value={clusteringAlgorithm}
                                onChange={(e) => {
                                    const algo = e.target.value as any;
                                    setClusteringAlgorithm(algo);
                                    clearSelection();
                                    setIsolatedClusterLabel(null);
                                }}
                                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                title="Select clustering algorithm"
                            >
                                <optgroup label="Density-Based">
                                    <option value="dbscan">DBSCAN - Density-Based</option>
                                    <option value="optics">OPTICS - Hierarchical Density</option>
                                </optgroup>
                                {/* HIERARCHICAL CLUSTERING OPTIONS - COMMENTED OUT FOR FUTURE RESTORATION
                                <optgroup label="Hierarchical">
                                    <option value="hierarchical-single">Single Linkage - Min distance</option>
                                    <option value="hierarchical-complete">Complete Linkage - Max distance</option>
                                    <option value="hierarchical-average">Average Linkage - Avg distance</option>
                                    <option value="hierarchical-ward">Ward Linkage - Min variance</option>
                                </optgroup>
                                */}
                                <optgroup label="STEP Seismology">
                                    <option value="step-mag">STEP Magnitude - Largest first</option>
                                    <option value="step-time">STEP Time - Time-ordered</option>
                                </optgroup>
                                <optgroup label="Other">
                                    <option value="kmeans">K-Means - Partition-based</option>
                                    <option value="nearest-neighbor">Nearest-Neighbor - Seismology</option>
                                    <option value="st-dbscan">ST-DBSCAN - Spatio-Temporal Density</option>
                                    <option value="tmc">TMC - Reasenberg Style</option>
                                    <option value="hardebeck-2019">Hardebeck (2019)</option>
                                    <option value="hdbscan">HDBSCAN - Hierarchical Density</option>
                                </optgroup>
                            </select>
                        </div>
                        <div className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-3 text-xs text-gray-600 [&>div]:min-w-0 [&>div]:rounded-md [&>div]:border [&>div]:border-gray-200 [&>div]:bg-gray-50 [&>div]:px-3 [&>div]:py-2 [&>div]:space-y-1 [&_input[type=range]]:w-full">
                            {(clusteringAlgorithm === 'dbscan' || clusteringAlgorithm === 'optics') && (
                                <>
                                    <div className="flex flex-col">
                                        <span>Epsilon: <span className="font-semibold">{localEpsilon} km</span></span>
                                        <input
                                            type="range"
                                            min={5}
                                            max={100}
                                            step={5}
                                            value={localEpsilon}
                                            onChange={(e) => setLocalEpsilon(parseInt(e.target.value))}
                                            title="Search radius for density-based clustering"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span>Min pts: <span className="font-semibold">{localMinSamples}</span></span>
                                        <input
                                            type="range"
                                            min={3}
                                            max={20}
                                            step={1}
                                            value={localMinSamples}
                                            onChange={(e) => setLocalMinSamples(parseInt(e.target.value))}
                                            title="Minimum points to form a cluster"
                                        />
                                    </div>
                                </>
                            )}
                            {(clusteringAlgorithm === 'kmeans' || clusteringAlgorithm.startsWith('hierarchical-')) && (
                                <div className="flex flex-col">
                                    <span>Clusters (k): <span className="font-semibold">{localK}</span></span>
                                    <input
                                        type="range"
                                        min={2}
                                        max={15}
                                        step={1}
                                        value={localK}
                                        onChange={(e) => setLocalK(parseInt(e.target.value))}
                                        title="Number of clusters to create"
                                    />
                                </div>
                            )}
                            {clusteringAlgorithm === 'nearest-neighbor' && (
                                <div className="flex flex-col">
                                    <span>NN Threshold: <span className="font-semibold">{localNnThreshold.toFixed(2)}</span></span>
                                    <input
                                        type="range"
                                        min={0.1}
                                        max={5.0}
                                        step={0.1}
                                        value={localNnThreshold}
                                        onChange={(e) => setLocalNnThreshold(parseFloat(e.target.value))}
                                        title="Nearest-neighbor distance threshold (space-time-magnitude)"
                                    />
                                </div>
                            )}
                            {(clusteringAlgorithm === 'step-mag' || clusteringAlgorithm === 'step-time') && (
                                <>
                                    <div className="flex flex-col">
                                        <span>Min Mag: <span className="font-semibold">{localStepMinMag.toFixed(1)}</span></span>
                                        <input
                                            type="range"
                                            min={1.0}
                                            max={5.0}
                                            step={0.1}
                                            value={localStepMinMag}
                                            onChange={(e) => setLocalStepMinMag(parseFloat(e.target.value))}
                                            title="Minimum magnitude for mainshock detection"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span>T1 (days): <span className="font-semibold">{localStepT1}</span></span>
                                        <input
                                            type="range"
                                            min={1}
                                            max={30}
                                            step={1}
                                            value={localStepT1}
                                            onChange={(e) => setLocalStepT1(parseInt(e.target.value))}
                                            title="Time window before earthquake (days)"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span>T2 (days): <span className="font-semibold">{localStepT2}</span></span>
                                        <input
                                            type="range"
                                            min={1}
                                            max={365}
                                            step={1}
                                            value={localStepT2}
                                            onChange={(e) => setLocalStepT2(parseInt(e.target.value))}
                                            title="Time window after earthquake (days)"
                                        />
                                    </div>
                                </>
                            )}
                            {(clusteringAlgorithm === 'st-dbscan') && (
                                <>
                                    <div className="flex flex-col">
                                        <span>Spatial Epsilon: <span className="font-semibold">{localEpsilon} km</span></span>
                                        <input
                                            type="range"
                                            min={5}
                                            max={100}
                                            step={5}
                                            value={localEpsilon}
                                            onChange={(e) => setLocalEpsilon(parseInt(e.target.value))}
                                            title="Spatial search radius"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span>Temporal Epsilon: <span className="font-semibold">{localEpsilonTemporal} days</span></span>
                                        <input
                                            type="range"
                                            min={1}
                                            max={30}
                                            step={1}
                                            value={localEpsilonTemporal}
                                            onChange={(e) => setLocalEpsilonTemporal(parseInt(e.target.value))}
                                            title="Temporal search window"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span>Min pts: <span className="font-semibold">{localMinSamples}</span></span>
                                        <input
                                            type="range"
                                            min={3}
                                            max={20}
                                            step={1}
                                            value={localMinSamples}
                                            onChange={(e) => setLocalMinSamples(parseInt(e.target.value))}
                                            title="Minimum neighbors (space-time)"
                                        />
                                    </div>
                                </>
                            )}
                            {(clusteringAlgorithm === 'tmc') && (
                                <>
                                    <div className="flex flex-col">
                                        <span>Radius Factor (rfact): <span className="font-semibold">{localTmcRfact}</span></span>
                                        <input
                                            type="range"
                                            min={1}
                                            max={20}
                                            step={1}
                                            value={localTmcRfact}
                                            onChange={(e) => setLocalTmcRfact(parseInt(e.target.value))}
                                            title="Multiplier for crack radius interaction"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span>Base Look-ahead (tau0): <span className="font-semibold">{localTmcTau0} days</span></span>
                                        <input
                                            type="range"
                                            min={0.5}
                                            max={10}
                                            step={0.5}
                                            value={localTmcTau0}
                                            onChange={(e) => setLocalTmcTau0(parseFloat(e.target.value))}
                                            title="Minimum look-ahead time"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span>Max Look-ahead: <span className="font-semibold">{localTmcTauMax} days</span></span>
                                        <input
                                            type="range"
                                            min={5}
                                            max={60}
                                            step={1}
                                            value={localTmcTauMax}
                                            onChange={(e) => setLocalTmcTauMax(parseInt(e.target.value))}
                                            title="Maximum look-ahead time"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span>Probability (p1): <span className="font-semibold">{localTmcP1}</span></span>
                                        <input
                                            type="range"
                                            min={0.5}
                                            max={0.999}
                                            step={0.001}
                                            value={localTmcP1}
                                            onChange={(e) => setLocalTmcP1(parseFloat(e.target.value))}
                                            title="Probability of observing next event in sequence"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span>Mag Scale (xk): <span className="font-semibold">{localTmcXk.toFixed(2)}</span></span>
                                        <input
                                            type="range"
                                            min={0.1}
                                            max={1.0}
                                            step={0.05}
                                            value={localTmcXk}
                                            onChange={(e) => setLocalTmcXk(parseFloat(e.target.value))}
                                            title="Magnitude scaling factor for interaction zone (xk)"
                                        />
                                    </div>
                                </>
                            )}
                            {(clusteringAlgorithm === 'hardebeck-2019') && (
                                <>
                                    <div className="flex flex-col">
                                        <span>Min Mag: <span className="font-semibold">{localHardebeckMinMag.toFixed(1)}</span></span>
                                        <input
                                            type="range"
                                            min={4.0}
                                            max={8.0}
                                            step={0.1}
                                            value={localHardebeckMinMag}
                                            onChange={(e) => setLocalHardebeckMinMag(parseFloat(e.target.value))}
                                            title="Minimum mainshock magnitude to identifying clusters"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span>Mainshock Exclusion: <span className="font-semibold">{localHardebeckMainshockTimeYears} years</span></span>
                                        <input
                                            type="range"
                                            min={1}
                                            max={10}
                                            step={0.5}
                                            value={localHardebeckMainshockTimeYears}
                                            onChange={(e) => setLocalHardebeckMainshockTimeYears(parseFloat(e.target.value))}
                                            title="Time window to exclude events near larger mainshocks"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span>Aftershock Window: <span className="font-semibold">{localHardebeckTimeWindow} days</span></span>
                                        <input
                                            type="range"
                                            min={1}
                                            max={60}
                                            step={1}
                                            value={localHardebeckTimeWindow}
                                            onChange={(e) => setLocalHardebeckTimeWindow(parseInt(e.target.value))}
                                            title="Duration after mainshock to associate events"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span>Rupture Mult: <span className="font-semibold">{localHardebeckRuptureMult}x</span></span>
                                        <input
                                            type="range"
                                            min={1}
                                            max={10}
                                            step={0.5}
                                            value={localHardebeckRuptureMult}
                                            onChange={(e) => setLocalHardebeckRuptureMult(parseFloat(e.target.value))}
                                            title="Multiplier for Wells & Coppersmith rupture length"
                                        />
                                    </div>
                                </>
                            )}
                            {(clusteringAlgorithm === 'hdbscan') && (
                                <>
                                    <div className="flex flex-col">
                                        <span>Min Cluster Size: <span className="font-semibold">{localHdbscanMinClusterSize}</span></span>
                                        <input
                                            type="range"
                                            min={2}
                                            max={50}
                                            step={1}
                                            value={localHdbscanMinClusterSize}
                                            onChange={(e) => setLocalHdbscanMinClusterSize(parseInt(e.target.value))}
                                            title="Smallest grouping considered a true cluster (larger = fewer, more stable clusters)"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span>Min Samples: <span className="font-semibold">{localHdbscanMinSamples}</span></span>
                                        <input
                                            type="range"
                                            min={1}
                                            max={30}
                                            step={1}
                                            value={localHdbscanMinSamples}
                                            onChange={(e) => setLocalHdbscanMinSamples(parseInt(e.target.value))}
                                            title="k-NN neighbourhood size for core-distance (larger = more conservative, fewer noise points)"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3.5">
                        <div className="space-y-2">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Display Options</span>
                            <select
                                className={`w-full px-2 py-1.5 bg-white border border-gray-300 rounded-md text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${clusteringAlgorithm === 'kmeans' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                value={includeNoise ? "show" : "hide"}
                                onChange={(e) => setIncludeNoise(e.target.value === "show")}
                                disabled={clusteringAlgorithm === 'kmeans'}
                                title={clusteringAlgorithm === 'kmeans'
                                    ? 'K-Means assigns every point to a cluster — no noise is produced'
                                    : 'Control visibility of noise (unclustered) points'}
                            >
                                <option value="show">Show All Points</option>
                                <option value="hide">Hide Noise</option>
                            </select>
                            {clusteringAlgorithm === 'kmeans' && (
                                <span className="text-xs text-amber-600 mt-1">K-Means has no noise</span>
                            )}
                        </div>
                        <div className="space-y-2">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Selection Mode</span>
                            <div className="grid grid-cols-2 gap-2" title="Choose whether clicking a point selects the individual event or every event in the same cluster">
                                <button
                                    onClick={() => {
                                        setSelectionMode('individual');
                                        setShowOnlySelectedCluster(false);
                                    }}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${selectionMode === 'individual'
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                                    }`}
                                    title="Click selects/deselects a single event"
                                >
                                    Individual
                                </button>
                                <button
                                    onClick={() => setSelectionMode('cluster')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${selectionMode === 'cluster'
                                        ? 'bg-purple-600 text-white shadow-sm'
                                        : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                                    }`}
                                    title="Click selects/deselects every event in the same cluster (noise points remain individual)"
                                >
                                    Cluster
                                </button>
                            </div>
                            {selectionMode === 'cluster' && (
                                <span className="text-xs text-purple-600 mt-1">Click any point to select its cluster</span>
                            )}
                        </div>
                        <label className="flex items-start gap-2 rounded-md border border-gray-200 bg-white p-2.5 text-xs text-gray-700">
                            <input
                                type="checkbox"
                                className="mt-0.5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                checked={showOnlySelectedCluster}
                                disabled={!clusteringResult}
                                onChange={(e) => {
                                    const enabled = e.target.checked;
                                    setShowOnlySelectedCluster(enabled);
                                    if (enabled) {
                                        setSelectionMode('cluster');
                                        setIsolatedClusterLabel(selectedClusterLabel);
                                    } else {
                                        setIsolatedClusterLabel(null);
                                    }
                                }}
                            />
                            <span>
                                <span className="font-semibold">Show Only Selected Cluster</span>
                                <span className="block text-gray-500">
                                    {showOnlySelectedCluster
                                        ? isolatedClusterLabel !== null
                                            ? `Views isolated to Cluster ${isolatedClusterLabel}`
                                            : 'Click a clustered event to isolate it in all plots'
                                        : 'All plots show visible events'}
                                </span>
                            </span>
                        </label>
                        <div className="grid gap-2 pt-1">
                            <button
                                onClick={handleApplyParameters}
                                disabled={isClusteringCalculating}
                                className={`w-full px-4 py-2 text-sm font-medium rounded-lg shadow-sm transition-colors ${isClusteringCalculating
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                                    }`}
                            >
                                {isClusteringCalculating ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
                                        Calculating...
                                    </span>
                                ) : (
                                    'Apply Parameters'
                                )}
                            </button>
                            {selectedIndices.size > 0 && (
                                <button
                                    onClick={handleClearSelection}
                                    className="w-full px-4 py-2 text-sm font-medium bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition-colors shadow-sm"
                                >
                                    Clear Selection
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Panel 1: Spatial Map */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                <div className="mb-4">
                    <h3 className="text-xl font-bold text-gray-800 mb-1">Spatial Map</h3>
                    <p className="text-sm text-gray-500">
                        {showOnlySelectedCluster && isolatedClusterLabel !== null
                            ? `Showing only Cluster ${isolatedClusterLabel}. Turn off the isolate toggle to restore all visible events.`
                            : 'Click on points to select/deselect earthquakes.'}
                    </p>
                </div>
                <div className="h-[600px] border border-gray-200 rounded-lg overflow-hidden relative">
                    <LeafletClusterMap
                        points={mapPoints}
                        onPointClick={handlePointClick}
                        onMapClick={handleClearSelection}
                    />
                </div>
            </div>

            {/* Panel 2: Temporal Plot */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                <div className="mb-4">
                    <h3 className="text-xl font-bold text-gray-800 mb-1">Temporal Plot</h3>
                    <p className="text-sm text-gray-500">
                        {showOnlySelectedCluster && isolatedClusterLabel !== null
                            ? `Showing only Cluster ${isolatedClusterLabel}. Turn off the isolate toggle to restore all visible events.`
                            : 'Click on points to select/deselect earthquakes. Selected events are highlighted in red.'}
                    </p>
                </div>
                <div className="h-[500px]">
                    <HighchartsReact
                        key={`temp-${processedEarthquakes.length}-${clusteringAlgorithm}-${showOnlySelectedCluster ? isolatedClusterLabel ?? 'pending' : 'all'}`}
                        highcharts={Highcharts}
                        options={temporalPlotOptions}
                        ref={chartRef}
                    />
                </div>
                <ChartExportButtons
                    chartRef={chartRef}
                    data={visibleExportEarthquakes}
                    filename="temporal-spatial-plot"
                    clusteringMetadata={clusteringResult?.metadata}
                    clusterLabels={visibleClusterLabels}
                />
            </div>

            {/* Panel 3: 3D Spatial Distribution */}
            <TemporalSpatial3DPlot
                data={visibleChartData as any}
                onPointClick={handlePointClick}
            />
            {/* Info Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl p-6">
                <div className="flex items-start gap-3">
                    <div className="text-3xl">💡</div>
                    <div>
                        <h4 className="font-bold text-blue-900 mb-2">Three-Way Interactive Selection</h4>
                        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                            <li><strong>Individual mode:</strong> click any point to select/deselect that single event across all three views</li>
                            <li><strong>Cluster mode:</strong> click any point to exclusively select every event in its cluster; selecting another cluster replaces the previous selection, and clicking the selected cluster again clears it</li>
                            <li><strong>Selections sync</strong> automatically across the map, temporal plot, and 3D plot</li>
                            <li>Selected events are highlighted in <span className="text-red-600 font-bold">red with a white halo</span> for clear visual distinction</li>
                            <li>Sliders <strong>auto-apply</strong> 600 ms after you stop moving them — the Apply button still provides instant commit</li>
                            <li><strong>3D Plot:</strong> drag to rotate, scroll to zoom, explore spatial distribution with depth</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div >
    );
});

// Export memoized version to prevent unnecessary re-renders
export default TemporalSpatial;
