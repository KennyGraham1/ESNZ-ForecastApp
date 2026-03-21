'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useState, useMemo, useRef, useEffect, memo } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from '../ChartExportButtons';
import { useClusteringWorker } from '@/hooks/useClusteringWorker';
import { useClusteringContext } from '@/contexts/ClusteringContext';
import { formatDateForTooltip } from '@/utils/dateFormat';
import TemporalSpatial3DPlot from '../TemporalSpatial3DPlot';

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

    // Apply handler
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

    // Performance optimization: Sample data for large datasets
    // Uses reservoir sampling (random) so aftershock bursts are not systematically thinned.
    const SAMPLE_THRESHOLD = 3000;
    const processedEarthquakes = useMemo(() => {
        if (earthquakes.length > SAMPLE_THRESHOLD) {
            // Reservoir sampling: every event has an equal chance of being included,
            // so dense aftershock clusters are not disproportionately discarded.
            const sampled = [...earthquakes];
            for (let i = SAMPLE_THRESHOLD; i < sampled.length; i++) {
                const j = Math.floor(Math.random() * (i + 1));
                if (j < SAMPLE_THRESHOLD) {
                    sampled[j] = earthquakes[i];
                }
            }
            const result = sampled.slice(0, SAMPLE_THRESHOLD);
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
    }, [processedEarthquakes, clearSelection]);

    // POLYGON SELECTION FEATURE - STATE KEPT BUT FEATURE DISABLED
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [polygonPoints, setPolygonPoints] = useState<Array<{ lat: number, lon: number }>>([]);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [polygonSeries, setPolygonSeries] = useState<any>(null);

    // Map state
    const [nzMapGeometry, setNzMapGeometry] = useState<any>(null);

    // Clustering — hybrid worker/server hook
    const {
        result: clusteringResult,
        isCalculating: isClusteringCalculating,
        runClustering,
    } = useClusteringWorker();

    const chartRef = useRef<HighchartsReact.RefObject>(null);
    const mapChartRef = useRef<HighchartsReact.RefObject>(null);

    // Load New Zealand map data
    useEffect(() => {
        import('@highcharts/map-collection/countries/nz/nz-all.geo.json')
            .then((module) => {
                setNzMapGeometry(module.default);
            })
            .catch((error) => {
                console.error('Error loading map data:', error);
            });
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

    // Sync selection state with map points
    useEffect(() => {
        const mapChart = mapChartRef.current?.chart;
        if (!mapChart) return;

        const earthquakeSeries = mapChart.series.find((s: any) => s.name === 'Earthquakes');
        if (!earthquakeSeries) return;

        // Update point colors based on selection and clustering
        earthquakeSeries.points.forEach((point: any) => {
            const isSelected = selectedIndices.has(point.originalIndex);
            const cluster = typeof point.cluster === 'number' ? point.cluster : -1;
            point.update({
                marker: {
                    fillColor: isSelected ? '#ef4444' : getClusterColor(cluster),
                    lineWidth: isSelected ? 2 : 0,
                    lineColor: isSelected ? '#dc2626' : undefined,
                    radius: isSelected ? 6 : 4
                }
            }, false);
        });

        mapChart.redraw();
    }, [selectedIndices]);

    /* POLYGON SELECTION FEATURE - MAP CLICK HANDLER - COMMENTED OUT FOR FUTURE RESTORATION
    // Handle map clicks for polygon drawing
    useEffect(() => {
        const mapChart = mapChartRef.current?.chart;
        if (!mapChart) return;

        const handleMapClick = (event: any) => {
            console.log('Map clicked! isDrawingPolygon:', isDrawingPolygon, 'event:', event);

            if (!isDrawingPolygon) {
                console.log('Not in drawing mode, ignoring click');
                return;
            }

            // Get lat/lon from click event
            if (!event.xAxis || !event.yAxis) {
                console.log('No axis data in click event');
                return;
            }

            const lon = event.xAxis[0].value;
            const lat = event.yAxis[0].value;
            console.log('Click coordinates:', { lat, lon });

            // Validate coordinates
            if (
                typeof lat !== 'number' ||
                typeof lon !== 'number' ||
                !isFinite(lat) ||
                !isFinite(lon) ||
                lat < -90 ||
                lat > 90 ||
                lon < -180 ||
                lon > 180
            ) {
                console.warn('Invalid polygon point coordinates:', { lat, lon });
                return;
            }

            // Add point to polygon
            const newPoint = { lat, lon };
            const allPoints = [...polygonPoints, newPoint];
            setPolygonPoints(allPoints);

            // Remove old polygon series if exists
            const existingSeries = mapChart.get('polygon-series');
            if (existingSeries) {
                existingSeries.remove(false);
            }

            // Draw polygon outline
            if (allPoints.length >= 2) {
                // Create closed polygon path for visualization
                const polygonData = [...allPoints, allPoints[0]].map(p => [p.lon, p.lat]);

                const newSeries = mapChart.addSeries({
                    type: 'mapline',
                    id: 'polygon-series',
                    name: 'Selection Polygon',
                    data: [polygonData] as any,
                    color: '#ef4444',
                    lineWidth: 3,
                    enableMouseTracking: false,
                    showInLegend: false,
                    dashStyle: 'Solid',
                    zIndex: 100
                } as any, false);
                setPolygonSeries(newSeries);
            }

            // Add point markers
            const markerSeries = mapChart.get('polygon-markers');
            if (markerSeries) {
                markerSeries.remove(false);
            }

            const markerData = allPoints.map(p => ({ lat: p.lat, lon: p.lon }));
            mapChart.addSeries({
                type: 'mappoint',
                id: 'polygon-markers',
                name: 'Polygon Points',
                data: markerData,
                color: '#ef4444',
                marker: {
                    radius: 5,
                    symbol: 'circle',
                    fillColor: '#ef4444',
                    lineWidth: 2,
                    lineColor: '#ffffff'
                },
                enableMouseTracking: false,
                showInLegend: false,
                zIndex: 101
            }, false);

            mapChart.redraw();
        };

        // Attach click handler
        (Highcharts as any).addEvent(mapChart, 'click', handleMapClick);

        // Cleanup
        return () => {
            (Highcharts as any).removeEvent(mapChart, 'click', handleMapClick);
        };
    }, [isDrawingPolygon, polygonPoints]);
    END OF POLYGON MAP CLICK HANDLER */

    // Point-in-polygon algorithm (ray casting)
    const isPointInPolygon = (point: { lat: number, lon: number }, polygon: Array<{ lat: number, lon: number }>) => {
        if (polygon.length < 3) return false;

        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].lon, yi = polygon[i].lat;
            const xj = polygon[j].lon, yj = polygon[j].lat;

            const intersect = ((yi > point.lat) !== (yj > point.lat))
                && (point.lon < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    };

    // POLYGON SELECTION FEATURE - FUNCTIONS KEPT BUT DISABLED
    // Handle polygon completion
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const completePolygon = () => {
        if (polygonPoints.length < 3) {
            alert('Please draw at least 3 points to create a polygon');
            return;
        }

        // Find all events within the polygon
        const indicesInPolygon = new Set<number>();
        processedEarthquakes.forEach((eq, index) => {
            // Validate coordinates before checking
            if (
                typeof eq.latitude === 'number' &&
                typeof eq.longitude === 'number' &&
                isFinite(eq.latitude) &&
                isFinite(eq.longitude) &&
                eq.latitude >= -90 &&
                eq.latitude <= 90 &&
                eq.longitude >= -180 &&
                eq.longitude <= 180
            ) {
                if (isPointInPolygon({ lat: eq.latitude, lon: eq.longitude }, polygonPoints)) {
                    indicesInPolygon.add(index);
                }
            }
        });

        // Add to existing selection
        const newSet = new Set(selectedIndices);
        indicesInPolygon.forEach(idx => newSet.add(idx));
        setSelectedIndices(newSet);

        setIsDrawingPolygon(false);
    };

    // Clear polygon
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const clearPolygon = () => {
        setPolygonPoints([]);
        setIsDrawingPolygon(false);

        // Remove polygon series from map
        const chart = mapChartRef.current?.chart;
        if (chart) {
            const existingSeries = chart.get('polygon-series');
            if (existingSeries) {
                existingSeries.remove(false);
            }
            const markerSeries = chart.get('polygon-markers');
            if (markerSeries) {
                markerSeries.remove(false);
            }
            chart.redraw();
        }
        setPolygonSeries(null);
    };

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

        // Return only points that are NOT noise (label != -1)
        // We match by index since labels correspond to processedEarthquakes indices
        return processedEarthquakes.filter((_, index) => {
            const label = clusteringResult.labels[index];
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
            const label = clusteringResult.labels[originalIdx];
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

    // Create temporal plot options
    const temporalPlotOptions: Highcharts.Options = useMemo(() => {
        // Create arrays with valid data only
        const validData = chartData.map((d) => {
            try {
                const time = d.time instanceof Date ? d.time : new Date(d.time);
                if (isNaN(time.getTime())) {
                    return null;
                }
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
            // Reason: Boost module conflicts with individual point markers and selection state
            // The chart has interactive features (click to select) and custom markers per point
            boost: {
                enabled: false
            },
            xAxis: {
                type: 'datetime',
                title: {
                    text: 'Time',
                    style: {
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#374151'
                    }
                },
                gridLineWidth: 0,
                labels: {
                    style: {
                        fontSize: '11px',
                        color: '#6b7280'
                    }
                },
                lineColor: '#d1d5db',
                tickColor: '#d1d5db',
                crosshair: {
                    width: 1,
                    color: '#9ca3af',
                    dashStyle: 'Dash'
                }
            },
            yAxis: {
                title: {
                    text: 'Magnitude',
                    style: {
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#374151'
                    }
                },
                gridLineWidth: 0,
                labels: {
                    style: {
                        fontSize: '11px',
                        color: '#6b7280'
                    }
                },
                lineColor: '#d1d5db',
                tickColor: '#d1d5db',
                crosshair: {
                    width: 1,
                    color: '#9ca3af',
                    dashStyle: 'Dash'
                }
            },
            legend: {
                enabled: false
            },
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
                    const timeStr = formatDateForTooltip(time);
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
                    turboThreshold: 20000, // Increase threshold for large datasets (20+ years)
                    marker: {
                        radius: 5
                    },
                    point: {
                        events: {
                            click: function (this: any) {
                                const idx = this.custom.originalIndex;
                                toggleSelection(idx);
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
                        radius: d.size,
                        fillColor: d.isSelected ? '#ef4444' : getClusterColor(d.cluster),
                        fillOpacity: d.isSelected ? 0.95 : 0.7,
                        lineWidth: d.isSelected ? 2 : 0,
                        lineColor: d.isSelected ? '#dc2626' : undefined
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
                keyboardNavigation: {
                    enabled: true
                }
            }
        };
    }, [chartData, toggleSelection]);

    // Map configuration
    const mapOptions: any = useMemo(() => {
        if (!nzMapGeometry) return null;

        // Prepare earthquake data for map - filter out invalid coordinates
        const mapPoints = chartData
            .map((d) => {
                // Validate coordinates before creating the object
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

        return {
            chart: {
                map: nzMapGeometry,
                backgroundColor: '#ffffff',
                height: 600,
                events: {
                    load: function (this: any) {
                        const chart = this;
                        (window as any).temporalSpatialMapChart = chart;

                        // Comprehensive error handling for coordinate transformations
                        if (chart.pointer) {
                            // Wrap onContainerMouseLeave
                            const originalMouseLeave = chart.pointer.onContainerMouseLeave;
                            if (originalMouseLeave) {
                                chart.pointer.onContainerMouseLeave = function (e: any) {
                                    try {
                                        originalMouseLeave.call(this, e);
                                    } catch (error) {
                                        // Silently catch coordinate transformation errors
                                        console.debug('Mouse leave coordinate error (ignored):', error);
                                    }
                                };
                            }

                            // Wrap setHoverChartIndex
                            const originalSetHover = chart.pointer.setHoverChartIndex;
                            if (originalSetHover) {
                                chart.pointer.setHoverChartIndex = function (...args: any[]) {
                                    try {
                                        originalSetHover.apply(this, args);
                                    } catch (error) {
                                        console.debug('Hover chart index error (ignored):', error);
                                    }
                                };
                            }

                            // Wrap onContainerMouseMove
                            const originalMouseMove = chart.pointer.onContainerMouseMove;
                            if (originalMouseMove) {
                                chart.pointer.onContainerMouseMove = function (e: any) {
                                    try {
                                        originalMouseMove.call(this, e);
                                    } catch (error) {
                                        console.debug('Mouse move coordinate error (ignored):', error);
                                    }
                                };
                            }
                        }

                        // Add global error handler for the chart
                        if (chart.container) {
                            const container = chart.container;
                            const originalOnMouseLeave = container.onmouseleave;
                            container.onmouseleave = function (e: any) {
                                try {
                                    if (originalOnMouseLeave) {
                                        originalOnMouseLeave.call(this, e);
                                    }
                                } catch (error) {
                                    console.debug('Container mouse leave error (ignored):', error);
                                }
                            };
                        }
                    }
                }
            },
            title: {
                text: 'Spatial Distribution',
                style: { fontSize: '16px', fontWeight: 'bold' }
            },
            credits: { enabled: false },
            // CRITICAL FIX: Disable Highcharts built-in export menu
            // Reason: The built-in CSV export exports chart series data (map geometry + points)
            // instead of the original earthquake data. We use custom export buttons below.
            exporting: {
                enabled: false
            },
            mapNavigation: {
                enabled: true,
                enableMouseWheelZoom: true,
                buttonOptions: {
                    verticalAlign: 'bottom'
                },
                mouseWheelSensitivity: 1.1
            },
            tooltip: {
                useHTML: true,
                formatter: function (this: any) {
                    try {
                        const point = this.point;
                        if (!point || !point.magnitude) return '';

                        // Validate point has valid coordinates
                        if (
                            typeof point.lat !== 'number' ||
                            typeof point.lon !== 'number' ||
                            !isFinite(point.lat) ||
                            !isFinite(point.lon)
                        ) {
                            return '';
                        }

                        // Format date as dd/mm/yyyy HH:mm:ss
                        const timeStr = formatDateForTooltip(point.time);
                        const clusterText = point.cluster >= 0 ? `Cluster ${point.cluster}` : 'Noise';
                        return `
                            <div style="padding: 8px;">
                                <strong>${point.locality || 'Unknown location'}</strong><br/>
                                <strong>M${point.magnitude.toFixed(1)}</strong><br/>
                                Event ID: ${point.eventID || 'N/A'}<br/>
                                ${timeStr}<br/>
                                Depth: ${point.depth.toFixed(1)} km<br/>
                                Lat: ${point.lat.toFixed(2)}°, Lon: ${point.lon.toFixed(2)}°<br/>
                                <em>${clusterText}</em>
                            </div>
                        `;
                    } catch (error) {
                        console.error('Tooltip error:', error);
                        return '';
                    }
                }
            },
            series: [
                {
                    type: 'map',
                    name: 'New Zealand',
                    borderColor: '#a0a0a0',
                    nullColor: '#f0f0f0',
                    showInLegend: false,
                    enableMouseTracking: false
                },
                {
                    type: 'mappoint',
                    name: 'Earthquakes',
                    data: mapPoints,
                    colorKey: 'color',
                    marker: {
                        radius: 4,
                        symbol: 'circle'
                    },
                    dataLabels: {
                        enabled: false
                    },
                    point: {
                        events: {
                            click: function (this: any) {
                                // Don't select individual points when drawing polygon
                                if (isDrawingPolygon) {
                                    console.log('Point click ignored - drawing polygon');
                                    return;
                                }

                                const idx = this.originalIndex;
                                toggleSelection(idx);
                            }
                        }
                    },
                    states: {
                        select: {
                            color: '#ef4444',
                            borderColor: '#dc2626'
                        }
                    }
                }
            ],
            accessibility: {
                enabled: true,
                description: 'Interactive map showing earthquake locations in New Zealand. Points are colored by cluster assignment. Click points to select, or use polygon tool for area selection.',
                keyboardNavigation: {
                    enabled: true
                }
            }
        };
    }, [nzMapGeometry, chartData, isDrawingPolygon, toggleSelection]);

    const handleClearSelection = () => {
        clearSelection();
    };

    if (!nzMapGeometry) {
        return (
            <div className="h-[600px] w-full rounded-lg overflow-hidden border border-gray-300 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600 font-medium">Loading map data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Section */}
            <div className="bg-gradient-to-r from-green-50 to-teal-50 p-6 rounded-xl border border-green-200">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Temporal-Spatial Analysis</h2>
                <p className="text-gray-600">Explore earthquake patterns through linked temporal and spatial visualizations with bidirectional selection.</p>
            </div>

            {/* Selection Status and Controls Bar */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                    <div className="flex-1 space-y-2">
                        <div className="text-sm font-medium text-gray-700">
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
                        {isClusteringCalculating ? (
                            <div className="text-xs text-blue-600 flex items-center gap-2">
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                                <span className="font-medium">Computing clustering...</span>
                            </div>
                        ) : clusteringResult && (
                            <div className="text-xs text-gray-500 flex flex-wrap gap-3">
                                <span>
                                    Algorithm: <span className="font-semibold uppercase">{clusteringAlgorithm}</span>
                                </span>
                                <span>
                                    Clusters: <span className="font-semibold">{clusteringResult.nClusters}</span>
                                </span>
                                <span>
                                    In clusters: <span className="font-semibold">{clusteringResult.clusterPercent.toFixed(1)}%</span>
                                </span>
                                <span>
                                    Noise: <span className="font-semibold">{clusteringResult.noisePercent.toFixed(1)}%</span>
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col md:flex-row gap-4 flex-1 justify-end flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Algorithm</label>
                            <select
                                value={clusteringAlgorithm}
                                onChange={(e) => {
                                    const algo = e.target.value as any;
                                    setClusteringAlgorithm(algo);
                                    // Reset selection when algorithm changes to avoid stale indices
                                    clearSelection();
                                }}
                                className="text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
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
                        <div className="flex items-center gap-3 flex-wrap text-xs text-gray-600">
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
                        </div>
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
                    <div className="flex flex-col gap-3 ml-auto items-end">
                        <div className="flex flex-col bg-gray-50 px-3 py-2 rounded-md border border-gray-200 w-fit">
                            <span className="text-xs font-semibold text-gray-500 mb-1">Display Options</span>
                            <select
                                className="px-2 py-1 bg-white border border-gray-300 rounded text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={includeNoise ? "show" : "hide"}
                                onChange={(e) => setIncludeNoise(e.target.value === "show")}
                                title="Control visibility of noise (unclustered) points"
                            >
                                <option value="show">Show All Points</option>
                                <option value="hide">Hide Noise</option>
                            </select>
                        </div>
                        <button
                            onClick={handleApplyParameters}
                            disabled={isClusteringCalculating}
                            className={`px-4 py-2 text-sm font-medium rounded-lg shadow-sm transition-colors w-fit ${isClusteringCalculating
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                                }`}
                        >
                            {isClusteringCalculating ? (
                                <span className="flex items-center gap-2">
                                    <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
                                    Calculating...
                                </span>
                            ) : (
                                'Apply Parameters'
                            )}
                        </button>
                    </div>
                    {/* POLYGON SELECTION FEATURE - UI BUTTONS - COMMENTED OUT FOR FUTURE RESTORATION
                        {!isDrawingPolygon ? (
                            <button
                                onClick={() => setIsDrawingPolygon(true)}
                                className="px-4 py-2 text-sm font-medium bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors shadow-sm hover:shadow-md"
                            >
                                🖊️ Draw Polygon Selection
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={completePolygon}
                                    className="px-4 py-2 text-sm font-medium bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors shadow-sm hover:shadow-md"
                                    disabled={polygonPoints.length < 3}
                                >
                                    ✓ Complete Polygon ({polygonPoints.length} points)
                                </button>
                                <button
                                    onClick={clearPolygon}
                                    className="px-4 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors shadow-sm hover:shadow-md"
                                >
                                    ✕ Cancel
                                </button>
                            </>
                        )}
                        END OF POLYGON UI BUTTONS */}
                    {selectedIndices.size > 0 && (
                        <button
                            onClick={handleClearSelection}
                            className="px-4 py-2 text-sm font-medium bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors shadow-sm hover:shadow-md"
                        >
                            Clear Selection
                        </button>
                    )}

                </div>
                {/* POLYGON SELECTION FEATURE - DRAWING MODE MESSAGE - COMMENTED OUT FOR FUTURE RESTORATION
                {isDrawingPolygon && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                            <strong>Drawing Mode Active:</strong> Click on the map to add polygon points. Need at least 3 points to complete.
                        </p>
                    </div>
                )}
                END OF POLYGON DRAWING MODE MESSAGE */}
            </div>

            {/* Panel 1: Spatial Map */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                <div className="mb-4">
                    <h3 className="text-xl font-bold text-gray-800 mb-1">Spatial Map</h3>
                    <p className="text-sm text-gray-500">
                        Click on points to select/deselect earthquakes.
                    </p>
                </div>
                <div className="h-[600px]">
                    <HighchartsReact
                        key={`map-${processedEarthquakes.length}-${clusteringAlgorithm}`}
                        highcharts={Highcharts}
                        constructorType="mapChart"
                        options={mapOptions}
                        ref={mapChartRef}
                    />
                </div>
            </div>

            {/* Panel 2: Temporal Plot */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                <div className="mb-4">
                    <h3 className="text-xl font-bold text-gray-800 mb-1">Temporal Plot</h3>
                    <p className="text-sm text-gray-500">
                        Click on points to select/deselect earthquakes. Selected events are highlighted in red.
                    </p>
                </div>
                <div className="h-[500px]">
                    <HighchartsReact
                        key={`temp-${processedEarthquakes.length}-${clusteringAlgorithm}`}
                        highcharts={Highcharts}
                        options={temporalPlotOptions}
                        ref={chartRef}
                    />
                </div>
                <ChartExportButtons
                    chartRef={chartRef}
                    data={processedEarthquakes}
                    filename="temporal-spatial-plot"
                    clusteringMetadata={clusteringResult?.metadata}
                    clusterLabels={clusteringResult?.labels}
                />
            </div>

            {/* Panel 3: 3D Spatial Distribution */}
            <TemporalSpatial3DPlot
                data={chartData as any} // Cast to any to avoid temporary type mismatch if interface isn't fully propagated in IDE yet
                onPointClick={toggleSelection}
            />
            {/* Info Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl p-6">
                <div className="flex items-start gap-3">
                    <div className="text-3xl">💡</div>
                    <div>
                        <h4 className="font-bold text-blue-900 mb-2">Three-Way Interactive Selection</h4>
                        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                            <li><strong>Click points</strong> in any of the three views (map, temporal plot, or 3D plot) to select/deselect individual earthquakes</li>
                            <li><strong>Draw polygon</strong> on the map to select multiple earthquakes within a custom area</li>
                            <li><strong>Selections sync</strong> automatically across all three visualizations</li>
                            <li>Selected earthquakes are highlighted in <span className="text-red-600 font-bold">red</span> in all views</li>
                            <li><strong>3D Plot:</strong> Drag to rotate, scroll to zoom, and explore the spatial distribution with depth</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div >
    );
});

// Export memoized version to prevent unnecessary re-renders
export default TemporalSpatial;
