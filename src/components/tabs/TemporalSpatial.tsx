'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useState, useMemo, useRef, useEffect, memo } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from '../ChartExportButtons';
import { calculateSpatialClustering } from '@/lib/analysis/clustering';
import { useClusteringContext } from '@/contexts/ClusteringContext';
import { formatDateForTooltip } from '@/utils/dateFormat';

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
        selectedIndices,
        setAlgorithm: setClusteringAlgorithm,
        setEpsilon,
        setMinSamples,
        setK,
        setNnThreshold,
        setSelectedIndices,
        toggleSelection,
        clearSelection,
    } = useClusteringContext();

    // Performance optimization: Sample data for large datasets
    const SAMPLE_THRESHOLD = 3000;
    const processedEarthquakes = useMemo(() => {
        if (earthquakes.length > SAMPLE_THRESHOLD) {
            const step = Math.ceil(earthquakes.length / SAMPLE_THRESHOLD);
            const sampled = earthquakes.filter((_, index) => index % step === 0);
            console.log(`TemporalSpatial: Sampled ${sampled.length} from ${earthquakes.length} events`);
            return sampled;
        }
        return earthquakes;
    }, [earthquakes]);

    // Polygon drawing state
    const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
    const [polygonPoints, setPolygonPoints] = useState<Array<{lat: number, lon: number}>>([]);
    const [polygonSeries, setPolygonSeries] = useState<any>(null);

    // Map state
    const [nzMapGeometry, setNzMapGeometry] = useState<any>(null);

    // Clustering loading state
    const [isClusteringCalculating, setIsClusteringCalculating] = useState(false);

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

    // Point-in-polygon algorithm (ray casting)
    const isPointInPolygon = (point: {lat: number, lon: number}, polygon: Array<{lat: number, lon: number}>) => {
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

    // Handle polygon completion
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

    // Compute clustering on the processed earthquakes with loading state
    const [clusteringResult, setClusteringResult] = useState<any>(null);

    useEffect(() => {
        // Show loading indicator
        setIsClusteringCalculating(true);

        // Use setTimeout to allow UI to update before heavy computation
        const timeoutId = setTimeout(() => {
            try {
                const result = calculateSpatialClustering(processedEarthquakes, {
                    algorithm: clusteringAlgorithm,
                    epsilon,
                    minSamples,
                    k,
                    nnThreshold,
                });
                setClusteringResult(result);
            } catch (error) {
                console.error('Clustering error:', error);
                setClusteringResult(null);
            } finally {
                setIsClusteringCalculating(false);
            }
        }, 50); // Small delay to allow loading indicator to render

        return () => clearTimeout(timeoutId);
    }, [processedEarthquakes, clusteringAlgorithm, epsilon, minSamples, k, nnThreshold]);

    // Helper to get consistent cluster colors
    const getClusterColor = (clusterLabel: number) => {
        const colors = [
            '#440154', '#482878', '#3e4989', '#31688e', '#26828e',
            '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde724',
        ];
        if (clusterLabel < 0) return '#9ca3af'; // noise / unassigned
        return colors[clusterLabel % colors.length];
    };

    // Create temporal plot options
    const temporalPlotOptions: Highcharts.Options = useMemo(() => {
        // Create arrays with valid data only
        const validData = processedEarthquakes.map((eq, idx) => {
            try {
                const time = eq.time instanceof Date ? eq.time : new Date(eq.time);
                if (isNaN(time.getTime())) {
                    return null;
                }
                const cluster = clusteringResult?.labels[idx] ?? -1;
                return {
                    time: time.getTime(),
                    timeStr: time.toISOString(),
                    magnitude: eq.magnitude,
                    depth: eq.depth,
                    latitude: eq.latitude,
                    longitude: eq.longitude,
                    locality: eq.locality,
                    size: Math.max(4, eq.magnitude * 1.5),
                    isSelected: selectedIndices.has(idx),
                    originalIndex: idx,
                    cluster,
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
            // OPTIMIZATION: Boost module disabled for this chart
            // Reason: Boost module conflicts with individual point markers and selection state
            // The chart has interactive features (click to select) and custom markers per point
            boost: {
                enabled: false
            },
            xAxis: {
                type: 'datetime',
                title: {
                    text: 'Time'
                }
            },
            yAxis: {
                title: {
                    text: 'Magnitude'
                }
            },
            legend: {
                enabled: false
            },
            tooltip: {
                useHTML: true,
                formatter: function(this: any) {
                    const point = this.point;
                    const custom = point.custom;
                    const dateStr = custom.timeStr.split('T')[0];
                    return `
                        <div style="padding: 8px;">
                            <strong>${custom.locality || 'Unknown location'}</strong><br/>
                            <strong>M${custom.magnitude.toFixed(1)}</strong><br/>
                            ${dateStr}<br/>
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
                        fillOpacity: d.isSelected ? 0.95 : 0.75,
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
                    }
                }))
            }],
            accessibility: {
                enabled: true,
                description: 'Temporal plot showing earthquake magnitude over time with selection capability'
            }
        };
    }, [processedEarthquakes, selectedIndices, clusteringResult?.labels, toggleSelection]);

    // Map configuration
    const mapOptions: any = useMemo(() => {
        if (!nzMapGeometry) return null;

        // Prepare earthquake data for map - filter out invalid coordinates
        const earthquakeData = processedEarthquakes
            .map((eq, idx) => {
                const cluster = clusteringResult?.labels[idx] ?? -1;

                // Validate coordinates before creating the object
                const lat = eq.latitude;
                const lon = eq.longitude;

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
                    magnitude: eq.magnitude,
                    depth: eq.depth,
                    time: eq.time,
                    locality: eq.locality,
                    isSelected: selectedIndices.has(idx),
                    originalIndex: idx,
                    cluster,
                    color: getClusterColor(cluster),
                };
            })
            .filter((eq): eq is NonNullable<typeof eq> => eq !== null);

        return {
            chart: {
                map: nzMapGeometry,
                backgroundColor: '#ffffff',
                height: 600,
                events: {
                    load: function(this: any) {
                        const chart = this;
                        (window as any).temporalSpatialMapChart = chart;

                        // Comprehensive error handling for coordinate transformations
                        if (chart.pointer) {
                            // Wrap onContainerMouseLeave
                            const originalMouseLeave = chart.pointer.onContainerMouseLeave;
                            if (originalMouseLeave) {
                                chart.pointer.onContainerMouseLeave = function(e: any) {
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
                                chart.pointer.setHoverChartIndex = function(...args: any[]) {
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
                                chart.pointer.onContainerMouseMove = function(e: any) {
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
                            container.onmouseleave = function(e: any) {
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
                formatter: function(this: any) {
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
                        return `
                            <div style="padding: 8px;">
                                <strong>${point.locality || 'Unknown location'}</strong><br/>
                                <strong>M${point.magnitude.toFixed(1)}</strong><br/>
                                Depth: ${point.depth.toFixed(1)} km<br/>
                                ${timeStr}
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
                    data: earthquakeData,
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
                            click: function(this: any) {
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
            ]
        };
    }, [nzMapGeometry, processedEarthquakes, selectedIndices, isDrawingPolygon, clusteringResult?.labels, toggleSelection]);

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
                                    Showing <strong className="text-blue-600">{processedEarthquakes.length}</strong> earthquakes
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
                    <div className="flex flex-col md:flex-row gap-4 flex-1 justify-end">
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
                        <div className="flex items-center gap-3 flex-wrap text-xs text-gray-600">
                            {(clusteringAlgorithm === 'dbscan' || clusteringAlgorithm === 'optics') && (
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
                            {(clusteringAlgorithm === 'kmeans' || clusteringAlgorithm.startsWith('hierarchical-')) && (
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
                            {clusteringAlgorithm === 'nearest-neighbor' && (
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
                    <div className="flex gap-2 flex-wrap">
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
                        {selectedIndices.size > 0 && (
                            <button
                                onClick={handleClearSelection}
                                className="px-4 py-2 text-sm font-medium bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors shadow-sm hover:shadow-md"
                            >
                                Clear Selection
                            </button>
                        )}
                    </div>
                </div>
                {isDrawingPolygon && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                            <strong>Drawing Mode Active:</strong> Click on the map to add polygon points. Need at least 3 points to complete.
                        </p>
                    </div>
                )}
            </div>

            {/* Panel 1: Spatial Map */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                <div className="mb-4">
                    <h3 className="text-xl font-bold text-gray-800 mb-1">Spatial Map</h3>
                    <p className="text-sm text-gray-500">
                        {isDrawingPolygon
                            ? 'Click on the map to draw a polygon selection area'
                            : 'Click on points to select/deselect earthquakes. Use polygon tool for area selection.'}
                    </p>
                </div>
                <div className={`h-[600px] ${isDrawingPolygon ? 'cursor-crosshair' : ''}`}>
                    <HighchartsReact
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

            {/* Info Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl p-6">
                <div className="flex items-start gap-3">
                    <div className="text-3xl">💡</div>
                    <div>
                        <h4 className="font-bold text-blue-900 mb-2">Bidirectional Interactive Selection</h4>
                        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                            <li><strong>Click points</strong> in either the temporal plot or spatial map to select/deselect individual earthquakes</li>
                            <li><strong>Draw polygon</strong> on the map to select multiple earthquakes within a custom area</li>
                            <li><strong>Selections sync</strong> automatically between temporal and spatial views</li>
                            <li>Selected earthquakes are highlighted in <span className="text-red-600 font-bold">red</span> in both views</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
});

// Export memoized version to prevent unnecessary re-renders
export default TemporalSpatial;
