'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, useState, useEffect, memo, useCallback } from 'react';
import { MainEventInfo } from '@/lib/analysis/omori';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';
import RBush from 'rbush';
import { formatDate } from '@/utils/dateFormat';

interface AftershockSequencePlotProps {
    earthquakes: EarthquakeData[];
    mainEvent: MainEventInfo;
}

const AftershockSequencePlot = memo(function AftershockSequencePlot({ earthquakes, mainEvent }: AftershockSequencePlotProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);
    const depthChartRef = useRef<HighchartsReact.RefObject>(null);
    const mapChartRef = useRef<HighchartsReact.RefObject>(null);
    const [nzMapGeometry, setNzMapGeometry] = useState<any>(null);
    const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

    // Polygon drawing state
    const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
    const [polygonPoints, setPolygonPoints] = useState<Array<{lat: number, lon: number}>>([]);
    const [polygonSeries, setPolygonSeries] = useState<any>(null);

    // Radius circle visibility and size (hidden by default)
    const [showRadiusCircle, setShowRadiusCircle] = useState(false);
    const [aftershockRadius, setAftershockRadius] = useState(100); // Default 100 km
    const [radiusCircleSeries, setRadiusCircleSeries] = useState<any>(null);
    const [debouncedRadius, setDebouncedRadius] = useState(100); // Debounced value for performance

    // Timeline zoom state for linked map filtering
    const [timelineZoomRange, setTimelineZoomRange] = useState<{ min: number; max: number } | null>(null);

    // Debounce radius changes for performance (500ms delay)
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedRadius(aftershockRadius);
        }, 500);

        return () => clearTimeout(timer);
    }, [aftershockRadius]);

    // Load New Zealand map data
    useEffect(() => {
        const loadMapData = async () => {
            try {
                const mapModule = await import('@highcharts/map-collection/countries/nz/nz-all.geo.json');
                const nzMap = mapModule.default || mapModule;
                console.log('Map data loaded:', {
                    hasData: !!nzMap,
                    type: nzMap?.type,
                    features: nzMap?.features?.length
                });
                setNzMapGeometry(nzMap);
            } catch (error) {
                console.error('Failed to load New Zealand map:', error);
            }
        };
        loadMapData();
    }, []);

    // Optimized circle point generation using memoization
    const generateCirclePoints = useCallback((lat: number, lon: number, radiusKm: number): [number, number][] => {
        const circlePoints: [number, number][] = [];
        const numPoints = 64; // Reduced from 72 for better performance

        for (let i = 0; i <= numPoints; i++) {
            const angle = (i * 360 / numPoints) * Math.PI / 180;
            // Approximate conversion: 1 degree latitude ≈ 111 km
            const latOffset = (radiusKm / 111) * Math.cos(angle);
            const lonOffset = (radiusKm / (111 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle);
            circlePoints.push([
                lon + lonOffset,
                lat + latOffset
            ]);
        }

        return circlePoints;
    }, []);

    // Effect to manage radius circle on map (optimized with debouncing)
    useEffect(() => {
        // Add a small delay to ensure chart is fully rendered
        const timer = setTimeout(() => {
            const chart = mapChartRef.current?.chart;
            if (!chart || !nzMapGeometry) {
                return;
            }

            // Remove existing radius circle series
            const existingCircle = chart.get('radius-circle-series');
            if (existingCircle) {
                existingCircle.remove(false);
            }

            // Add new radius circle if enabled and coordinates are valid
            if (showRadiusCircle && typeof mainEvent.latitude === 'number' && typeof mainEvent.longitude === 'number') {
                const circlePoints = generateCirclePoints(mainEvent.latitude, mainEvent.longitude, debouncedRadius);

                try {
                    // Use geometry format for mapline
                    const newSeries = chart.addSeries({
                        type: 'mapline',
                        id: 'radius-circle-series',
                        name: `${debouncedRadius} km Radius`,
                        data: [{
                            geometry: {
                                type: 'LineString',
                                coordinates: circlePoints
                            }
                        }],
                        color: '#0066ff',
                        lineWidth: 3,
                        dashStyle: 'Dash',
                        enableMouseTracking: false,
                        showInLegend: true,
                        zIndex: 100,
                        states: {
                            inactive: {
                                opacity: 1
                            }
                        }
                    } as any, false);

                    setRadiusCircleSeries(newSeries);
                    chart.redraw();
                } catch (error) {
                    console.error('Error adding circle series:', error);
                }
            } else {
                setRadiusCircleSeries(null);
                chart.redraw();
            }
        }, 100);

        return () => clearTimeout(timer);
    }, [showRadiusCircle, debouncedRadius, mainEvent.latitude, mainEvent.longitude, nzMapGeometry, generateCirclePoints]);

    // Effect to attach zoom event handler to timeline chart
    useEffect(() => {
        // Use a small delay to ensure chart is fully initialized
        const timer = setTimeout(() => {
            const chart = chartRef.current?.chart;
            if (!chart) {
                console.log('Timeline zoom handler: Chart not ready yet');
                return;
            }

            const xAxis = chart.xAxis[0];
            if (!xAxis) {
                console.log('Timeline zoom handler: xAxis not found');
                return;
            }

            // Store the original min/max for comparison
            const originalMin = xAxis.min;
            const originalMax = xAxis.max;

            console.log('Timeline zoom handler attached:', { originalMin, originalMax });

            // Add event handler for zoom changes
            const handleAfterSetExtremes = (e: any) => {
                console.log('afterSetExtremes event:', e);

                // Check if this is a user-triggered zoom
                if (e.trigger === 'zoom') {
                    const min = e.min;
                    const max = e.max;

                    // Only set zoom range if it's different from the full range
                    const threshold = 0.1;
                    // Check if originalMin and originalMax are defined before comparison
                    if (originalMin !== undefined && originalMax !== undefined) {
                        if (Math.abs(min - originalMin) > threshold || Math.abs(max - originalMax) > threshold) {
                            console.log('Timeline zoomed:', { min, max });
                            setTimelineZoomRange({ min, max });
                        } else {
                            console.log('Timeline reset to full range');
                            setTimelineZoomRange(null);
                        }
                    } else {
                        // If original range is not defined, always set the zoom range
                        console.log('Timeline zoomed (no original range):', { min, max });
                        setTimelineZoomRange({ min, max });
                    }
                } else if (e.trigger === 'reset') {
                    // Reset zoom
                    console.log('Timeline zoom reset');
                    setTimelineZoomRange(null);
                }
            };

            // Attach the event handler
            Highcharts.addEvent(xAxis, 'afterSetExtremes', handleAfterSetExtremes);

            console.log('Timeline zoom handler: Event listener attached');
        }, 100);

        return () => clearTimeout(timer);
    }, [mainEvent]); // Removed sequenceData - not used in this effect

    // Effect to auto-zoom map when main event changes
    useEffect(() => {
        const timer = setTimeout(() => {
            const chart = mapChartRef.current?.chart as any;
            const mapView = chart?.mapView;

            if (!chart || !mapView || !nzMapGeometry) {
                console.log('Auto-zoom (useEffect): chart or mapView not ready', {
                    hasChart: !!chart,
                    hasMapView: !!mapView,
                    hasGeometry: !!nzMapGeometry
                });
                return;
            }

            // Validate coordinates
            if (typeof mainEvent.latitude !== 'number' || typeof mainEvent.longitude !== 'number') {
                console.log('Auto-zoom (useEffect): Invalid main event coordinates');
                return;
            }

            try {
                if (typeof mapView.lonLatToProjectedUnits !== 'function') {
                    console.log('Auto-zoom (useEffect): lonLatToProjectedUnits not available');
                    return;
                }

                console.log('Auto-zoom (useEffect): Zooming to main event', {
                    lat: mainEvent.latitude,
                    lon: mainEvent.longitude
                });

                // ~275 km radius ≈ 2.5 degrees
                const radiusDegrees = 2.5;

                // Convert lat/lon bounds to projected units
                const min = mapView.lonLatToProjectedUnits({
                    lon: mainEvent.longitude - radiusDegrees,
                    lat: mainEvent.latitude - radiusDegrees
                });
                const max = mapView.lonLatToProjectedUnits({
                    lon: mainEvent.longitude + radiusDegrees,
                    lat: mainEvent.latitude + radiusDegrees
                });

                console.log('Auto-zoom (useEffect): Projected bounds', {
                    min,
                    max
                });

                // Fit to bounds with 10% padding
                mapView.fitToBounds({
                    x1: min.x,
                    x2: max.x,
                    y1: min.y,
                    y2: max.y
                }, '10%');

                console.log('Auto-zoom (useEffect): Successfully zoomed to main event');
            } catch (error) {
                console.error('Auto-zoom (useEffect) error:', error);
            }
        }, 200); // Small delay to ensure chart is ready

        return () => clearTimeout(timer);
    }, [mainEvent.latitude, mainEvent.longitude, nzMapGeometry]);

    // Haversine formula to calculate distance between two lat/lon points in kilometers
    const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    };

    // Build R-tree spatial index for efficient radius queries (memoized)
    const spatialIndex = useMemo(() => {
        const tree = new RBush<{
            minX: number;
            minY: number;
            maxX: number;
            maxY: number;
            earthquake: EarthquakeData;
            index: number;
        }>();

        const items = earthquakes
            .map((eq, index) => {
                if (typeof eq.latitude === 'number' && typeof eq.longitude === 'number') {
                    return {
                        minX: eq.longitude,
                        minY: eq.latitude,
                        maxX: eq.longitude,
                        maxY: eq.latitude,
                        earthquake: eq,
                        index
                    };
                }
                return null;
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

        tree.load(items);
        console.log('🌳 R-tree spatial index built:', { totalItems: items.length });
        return tree;
    }, [earthquakes]);

    const sequenceData = useMemo(() => {
        const startPerf = performance.now();
        const mainEventTime = mainEvent.time instanceof Date ? mainEvent.time : new Date(mainEvent.time);

        // Filter earthquakes around the main event (30 days before, 365 days after)
        const startTime = new Date(mainEventTime.getTime() - 30 * 24 * 60 * 60 * 1000);
        const endTime = new Date(mainEventTime.getTime() + 365 * 24 * 60 * 60 * 1000);

        // Validate main event coordinates
        if (typeof mainEvent.latitude !== 'number' || typeof mainEvent.longitude !== 'number') {
            console.log('⚠️ Invalid main event coordinates');
            return [];
        }

        // Type assertion after validation
        const mainLat = mainEvent.latitude as number;
        const mainLon = mainEvent.longitude as number;

        // OPTIMIZATION: Use R-tree for spatial filtering
        // Convert radius from km to approximate degrees (1 degree ≈ 111 km)
        const radiusDegrees = debouncedRadius / 111;

        // Query R-tree for earthquakes within bounding box
        const candidateItems = spatialIndex.search({
            minX: mainLon - radiusDegrees,
            minY: mainLat - radiusDegrees,
            maxX: mainLon + radiusDegrees,
            maxY: mainLat + radiusDegrees
        });

        console.log('🔍 R-tree query:', {
            totalEarthquakes: earthquakes.length,
            candidatesFromRTree: candidateItems.length,
            radiusKm: debouncedRadius,
            radiusDegrees: radiusDegrees.toFixed(3)
        });

        // Filter candidates by exact distance and time window
        const filtered = candidateItems
            .map(item => {
                const eq = item.earthquake;
                try {
                    const eqTime = eq.time instanceof Date ? eq.time : new Date(eq.time);
                    if (isNaN(eqTime.getTime())) {
                        return null;
                    }

                    // Filter by time window
                    if (eqTime >= startTime && eqTime <= endTime) {
                        // Calculate exact distance using Haversine formula
                        const distance = haversineDistance(
                            mainLat,
                            mainLon,
                            eq.latitude,
                            eq.longitude
                        );

                        // Filter by exact spatial radius
                        if (distance <= debouncedRadius) {
                            const daysSince = (eqTime.getTime() - mainEventTime.getTime()) / (1000 * 60 * 60 * 24);
                            return { ...eq, daysSince, eqTime, distance };
                        }
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            })
            .filter((eq): eq is EarthquakeData & { daysSince: number; eqTime: Date; distance: number } => eq !== null);

        const endPerf = performance.now();
        console.log('✅ Aftershock filtering complete:', {
            filteredCount: filtered.length,
            performanceMs: (endPerf - startPerf).toFixed(2),
            timeWindow: `${startTime.toISOString().split('T')[0]} to ${endTime.toISOString().split('T')[0]}`,
            radiusKm: debouncedRadius
        });

        return filtered;
    }, [earthquakes, mainEvent, debouncedRadius, spatialIndex]);

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
        sequenceData.forEach((eq, index) => {
            if (isPointInPolygon({ lat: eq.latitude, lon: eq.longitude }, polygonPoints)) {
                indicesInPolygon.add(index);
            }
        });

        // Add to existing selection
        setSelectedIndices(prev => {
            const newSet = new Set(prev);
            indicesInPolygon.forEach(idx => newSet.add(idx));
            return newSet;
        });

        setIsDrawingPolygon(false);
    };

    // Clear polygon
    const clearPolygon = () => {
        setPolygonPoints([]);
        setIsDrawingPolygon(false);

        // Remove polygon series from map
        if (mapChartRef.current?.chart) {
            const chart = mapChartRef.current.chart;
            const polygonSeriesObj = chart.get('polygon-series');
            if (polygonSeriesObj) {
                polygonSeriesObj.remove();
            }
            const markerSeriesObj = chart.get('polygon-markers');
            if (markerSeriesObj) {
                markerSeriesObj.remove();
            }
        }
        setPolygonSeries(null);
    };

    // Toggle polygon drawing mode
    const togglePolygonDrawing = () => {
        if (isDrawingPolygon) {
            // Cancel drawing
            clearPolygon();
        } else {
            // Start drawing
            setIsDrawingPolygon(true);
            setPolygonPoints([]);
        }
    };

    const chartOptions: Highcharts.Options = useMemo(() => {
        // Validate data before processing
        if (!sequenceData || sequenceData.length === 0) {
            return {
                chart: { type: 'scatter', zoomType: 'xy', height: 500 },
                title: { text: '' },
                credits: { enabled: false },
                exporting: { enabled: false }, // Disable built-in export menu
                series: []
            };
        }

        // Calculate dynamic ranges
        const maxDays = Math.max(...sequenceData.map(eq => eq.daysSince));
        const minDays = Math.min(...sequenceData.map(eq => eq.daysSince));
        const maxMag = Math.max(...sequenceData.map(eq => eq.magnitude));
        const minMag = Math.min(...sequenceData.map(eq => eq.magnitude));

        // Find 6 largest events for labeling
        const sortedByMag = [...sequenceData].sort((a, b) => b.magnitude - a.magnitude);
        const largestEvents = sortedByMag.slice(0, 6);
        const largestEventIds = new Set(largestEvents.map(eq => eq.eventID));

        // Helper function to map days to color
        const getColorForDays = (days: number) => {
            const normalized = (days - minDays) / (maxDays - minDays); // Dynamic normalization
            if (normalized < 0.25) return 'rgba(100, 100, 255, 0.7)'; // Blue for early
            if (normalized < 0.5) return 'rgba(50, 200, 255, 0.7)'; // Light blue
            if (normalized < 0.75) return 'rgba(50, 255, 200, 0.7)'; // Teal
            return 'rgba(50, 255, 50, 0.7)'; // Green for later
        };

        const data = sequenceData.map((eq, index) => {
            const isSelected = selectedIndices.has(index);
            return {
                x: eq.daysSince,
                y: eq.magnitude,
                marker: {
                    radius: isSelected ? Math.pow(2, eq.magnitude - 1) * 1.5 : Math.pow(2, eq.magnitude - 1),
                    fillColor: isSelected ? '#ff0000' : getColorForDays(eq.daysSince),
                    fillOpacity: isSelected ? 1 : 0.7,
                    lineWidth: isSelected ? 2 : 0,
                    lineColor: isSelected ? '#cc0000' : undefined
                },
                dataLabels: {
                    enabled: largestEventIds.has(eq.eventID),
                    format: 'M{point.y:.1f}',
                    style: {
                        fontSize: '11px',
                        fontWeight: 'bold',
                        color: '#000',
                        textOutline: '2px white'
                    },
                    y: -10
                },
                custom: {
                    magnitude: eq.magnitude,
                    date: formatDate(eq.eqTime), // Format as dd/mm/yyyy
                    depth: eq.depth,
                    daysSince: eq.daysSince,
                    latitude: eq.latitude,
                    longitude: eq.longitude,
                    eventID: eq.eventID,
                    index
                }
            };
        });

        return {
            chart: {
                type: 'scatter',
                zoomType: 'xy',
                height: 500,
                backgroundColor: 'white',
                events: {
                    load: function(this: any) {
                        const chart = this;
                        // Store chart reference for synchronization
                        (window as any).aftershockSequenceChart = chart;
                    }
                },
                resetZoomButton: {
                    theme: {
                        fill: '#3b82f6',
                        stroke: '#2563eb',
                        style: {
                            color: 'white',
                            fontWeight: 'bold'
                        },
                        r: 4,
                        states: {
                            hover: {
                                fill: '#2563eb',
                                style: {
                                    color: 'white'
                                }
                            }
                        }
                    },
                    position: {
                        align: 'right',
                        verticalAlign: 'top',
                        x: -10,
                        y: 10
                    }
                }
            },
            title: {
                text: `Aftershock Sequence: ${mainEvent.name}`,
                style: {
                    fontSize: '18px',
                    fontWeight: 'bold'
                }
            },
            credits: {
                enabled: false
            },
            // Disable Highcharts built-in export menu - use custom export buttons
            exporting: {
                enabled: false
            },
            xAxis: {
                title: {
                    text: 'Days since main event'
                },
                min: minDays - 5,
                max: maxDays + 5,
                gridLineWidth: 1,
                gridLineColor: 'rgba(200, 200, 200, 0.2)',
                plotLines: [{
                    color: 'red',
                    width: 2,
                    value: 0,
                    dashStyle: 'Dash',
                    zIndex: 5,
                    label: {
                        text: 'Main Event',
                        align: 'center',
                        style: {
                            color: 'red'
                        }
                    }
                }]
            },
            yAxis: {
                title: {
                    text: 'Magnitude'
                },
                min: Math.min(1.5, minMag - 0.5),
                max: maxMag + 0.5,
                gridLineWidth: 1,
                gridLineColor: 'rgba(200, 200, 200, 0.2)',
                plotLines: [{
                    color: 'rgba(255, 0, 0, 0.3)',
                    width: 1,
                    value: mainEvent.magnitude,
                    dashStyle: 'Dot',
                    zIndex: 4
                }]
            },
            colorAxis: {
                min: minDays,
                max: maxDays,
                stops: [
                    [0, 'rgba(100, 100, 255, 0.7)'],
                    [0.25, 'rgba(50, 200, 255, 0.7)'],
                    [0.5, 'rgba(50, 255, 200, 0.7)'],
                    [0.75, 'rgba(50, 255, 50, 0.7)'],
                    [1, 'rgba(50, 255, 50, 0.7)']
                ],
                labels: {
                    format: '{value:.0f} days'
                },
                title: {
                    text: 'Days Since Main Event'
                }
            },
            legend: {
                enabled: true,
                align: 'right',
                verticalAlign: 'middle',
                layout: 'vertical'
            },
            tooltip: {
                useHTML: true,
                formatter: function(this: any) {
                    const point = this.point;
                    const custom = point?.custom;
                    if (!custom) return '';
                    return `
                        <div style="padding: 4px;">
                            <strong>M${custom.magnitude?.toFixed(1) || 'N/A'}</strong><br/>
                            ${custom.date || 'N/A'}<br/>
                            Depth: ${custom.depth?.toFixed(1) || 'N/A'} km<br/>
                            Days since main event: ${custom.daysSince?.toFixed(1) || 'N/A'}
                        </div>
                    `;
                }
            },
            plotOptions: {
                scatter: {
                    marker: {
                        radius: 5,
                        states: {
                            hover: {
                                enabled: true,
                                lineWidth: 2,
                                lineColor: '#000000',
                                radiusPlus: 2
                            }
                        }
                    },
                    cursor: 'pointer',
                    point: {
                        events: {
                            click: function(this: any) {
                                const index = this.custom.index;
                                setSelectedIndices(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(index)) {
                                        newSet.delete(index);
                                    } else {
                                        newSet.add(index);
                                    }
                                    return newSet;
                                });
                            },
                            mouseOver: function(this: any) {
                                const index = this.custom.index;
                                setHighlightedIndex(index);
                                // Highlight in other charts
                                if ((window as any).aftershockDepthChart) {
                                    const depthChart = (window as any).aftershockDepthChart;
                                    if (depthChart.series && depthChart.series[0] && depthChart.series[0].data && depthChart.series[0].data[index]) {
                                        depthChart.series[0].data[index].setState('hover');
                                    }
                                }
                                if ((window as any).aftershockMapChart) {
                                    const mapChart = (window as any).aftershockMapChart;
                                    if (mapChart.series) {
                                        const mapSeries = mapChart.series.find((s: any) => s.name === 'Aftershocks');
                                        if (mapSeries && mapSeries.data && mapSeries.data[index]) {
                                            mapSeries.data[index].setState('hover');
                                        }
                                    }
                                }
                            },
                            mouseOut: function(this: any) {
                                setHighlightedIndex(null);
                                // Remove highlight from other charts
                                if ((window as any).aftershockDepthChart) {
                                    const depthChart = (window as any).aftershockDepthChart;
                                    if (depthChart.series && depthChart.series[0] && depthChart.series[0].data && depthChart.series[0].data[this.custom.index]) {
                                        depthChart.series[0].data[this.custom.index].setState('');
                                    }
                                }
                                if ((window as any).aftershockMapChart) {
                                    const mapChart = (window as any).aftershockMapChart;
                                    if (mapChart.series) {
                                        const mapSeries = mapChart.series.find((s: any) => s.name === 'Aftershocks');
                                        if (mapSeries && mapSeries.data && mapSeries.data[this.custom.index]) {
                                            mapSeries.data[this.custom.index].setState('');
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            series: [{
                type: 'scatter',
                name: 'Earthquakes',
                data: data.map(d => ({
                    ...d,
                    colorValue: d.custom.daysSince
                })),
                colorKey: 'colorValue'
            }],
            annotations: [{
                labels: [
                    {
                        point: {
                            x: -15,
                            y: mainEvent.magnitude + 0.3,
                            xAxis: 0,
                            yAxis: 0
                        },
                        text: `Magnitude ${mainEvent.magnitude}<br/>${mainEvent.name}`,
                        style: {
                            color: 'black',
                            fontSize: '12px'
                        }
                    },
                    {
                        point: {
                            x: 120,
                            y: maxMag - 0.5,
                            xAxis: 0,
                            yAxis: 0
                        },
                        text: 'On average, aftershock activity decreases<br/>with time from the mainshock.',
                        style: {
                            color: 'gray',
                            fontSize: '12px'
                        }
                    },
                    {
                        point: {
                            x: 300,
                            y: maxMag - 0.3,
                            xAxis: 0,
                            yAxis: 0
                        },
                        text: 'Even late in the sequence,<br/>large aftershocks are possible.',
                        style: {
                            color: 'gray',
                            fontSize: '12px'
                        }
                    }
                ]
            }],
            accessibility: {
                enabled: true,
                description: 'Aftershock sequence plot showing magnitude vs time since main event'
            }
        };
    }, [sequenceData, mainEvent, setHighlightedIndex, selectedIndices, setSelectedIndices]);

    // Magnitude vs Depth Chart Options
    const depthChartOptions: Highcharts.Options = useMemo(() => {
        // Validate data before processing
        if (!sequenceData || sequenceData.length === 0) {
            return {
                chart: { type: 'scatter', zoomType: 'xy', height: 400 },
                title: { text: '' },
                credits: { enabled: false },
                exporting: { enabled: false }, // Disable built-in export menu
                series: []
            };
        }

        const maxDays = Math.max(...sequenceData.map(eq => eq.daysSince));
        const minDays = Math.min(...sequenceData.map(eq => eq.daysSince));

        const getColorForDays = (days: number) => {
            const normalized = (days - minDays) / (maxDays - minDays);
            if (normalized < 0.25) return 'rgba(100, 100, 255, 0.7)';
            if (normalized < 0.5) return 'rgba(50, 200, 255, 0.7)';
            if (normalized < 0.75) return 'rgba(50, 255, 200, 0.7)';
            return 'rgba(50, 255, 50, 0.7)';
        };

        const data = sequenceData.map((eq, index) => {
            const isSelected = selectedIndices.has(index);
            return {
                x: eq.magnitude,
                y: -eq.depth, // Inverted depth (negative so shallow is at top)
                marker: {
                    radius: isSelected ? Math.max(3, eq.magnitude * 1.5) * 1.5 : Math.max(3, eq.magnitude * 1.5),
                    fillColor: isSelected ? '#ff0000' : getColorForDays(eq.daysSince),
                    fillOpacity: isSelected ? 1 : 0.7,
                    lineWidth: isSelected ? 2 : 0,
                    lineColor: isSelected ? '#cc0000' : undefined
                },
                custom: {
                    magnitude: eq.magnitude,
                    depth: eq.depth,
                    daysSince: eq.daysSince,
                    date: formatDate(eq.eqTime), // Format as dd/mm/yyyy
                    index
                }
            };
        });

        return {
            chart: {
                type: 'scatter',
                zoomType: 'xy',
                height: 500,
                backgroundColor: 'white',
                events: {
                    load: function(this: any) {
                        (window as any).aftershockDepthChart = this;
                    }
                }
            },
            title: {
                text: 'Magnitude vs Depth',
                style: { fontSize: '16px', fontWeight: 'bold' }
            },
            credits: { enabled: false },
            // Disable Highcharts built-in export menu - use custom export buttons
            exporting: {
                enabled: false
            },
            xAxis: {
                title: { text: 'Magnitude' },
                gridLineWidth: 1,
                gridLineColor: 'rgba(200, 200, 200, 0.2)'
            },
            yAxis: {
                title: { text: 'Depth (km)' },
                reversed: false, // Don't reverse since we're using negative values
                labels: {
                    formatter: function(this: any) {
                        return Math.abs(this.value).toString(); // Show positive values
                    }
                },
                gridLineWidth: 1,
                gridLineColor: 'rgba(200, 200, 200, 0.2)'
            },
            colorAxis: {
                min: minDays,
                max: maxDays,
                stops: [
                    [0, 'rgba(100, 100, 255, 0.7)'],
                    [0.25, 'rgba(50, 200, 255, 0.7)'],
                    [0.5, 'rgba(50, 255, 200, 0.7)'],
                    [0.75, 'rgba(50, 255, 50, 0.7)'],
                    [1, 'rgba(50, 255, 50, 0.7)']
                ],
                labels: { format: '{value:.0f} days' },
                title: { text: 'Days Since Main Event' }
            },
            tooltip: {
                useHTML: true,
                formatter: function(this: any) {
                    const custom = this.point?.custom;
                    if (!custom) return '';
                    return `
                        <div style="padding: 4px;">
                            <strong>M${custom.magnitude?.toFixed(1) || 'N/A'}</strong><br/>
                            Depth: ${custom.depth?.toFixed(1) || 'N/A'} km<br/>
                            Days since main event: ${custom.daysSince?.toFixed(1) || 'N/A'}<br/>
                            ${custom.date || 'N/A'}
                        </div>
                    `;
                }
            },
            plotOptions: {
                scatter: {
                    marker: {
                        states: {
                            hover: {
                                enabled: true,
                                lineWidth: 2,
                                lineColor: '#000000',
                                radiusPlus: 2
                            }
                        }
                    },
                    cursor: 'pointer',
                    point: {
                        events: {
                            click: function(this: any) {
                                const index = this.custom.index;
                                setSelectedIndices(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(index)) {
                                        newSet.delete(index);
                                    } else {
                                        newSet.add(index);
                                    }
                                    return newSet;
                                });
                            },
                            mouseOver: function(this: any) {
                                const index = this.custom.index;
                                setHighlightedIndex(index);
                                if ((window as any).aftershockSequenceChart) {
                                    const seqChart = (window as any).aftershockSequenceChart;
                                    if (seqChart.series && seqChart.series[0] && seqChart.series[0].data && seqChart.series[0].data[index]) {
                                        seqChart.series[0].data[index].setState('hover');
                                    }
                                }
                                if ((window as any).aftershockMapChart) {
                                    const mapChart = (window as any).aftershockMapChart;
                                    if (mapChart.series) {
                                        const mapSeries = mapChart.series.find((s: any) => s.name === 'Aftershocks');
                                        if (mapSeries && mapSeries.data && mapSeries.data[index]) {
                                            mapSeries.data[index].setState('hover');
                                        }
                                    }
                                }
                            },
                            mouseOut: function(this: any) {
                                setHighlightedIndex(null);
                                if ((window as any).aftershockSequenceChart) {
                                    const seqChart = (window as any).aftershockSequenceChart;
                                    if (seqChart.series && seqChart.series[0] && seqChart.series[0].data && seqChart.series[0].data[this.custom.index]) {
                                        seqChart.series[0].data[this.custom.index].setState('');
                                    }
                                }
                                if ((window as any).aftershockMapChart) {
                                    const mapChart = (window as any).aftershockMapChart;
                                    if (mapChart.series) {
                                        const mapSeries = mapChart.series.find((s: any) => s.name === 'Aftershocks');
                                        if (mapSeries && mapSeries.data && mapSeries.data[this.custom.index]) {
                                            mapSeries.data[this.custom.index].setState('');
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            series: [{
                type: 'scatter',
                name: 'Aftershocks',
                data: data.map(d => ({ ...d, colorValue: d.custom.daysSince })),
                colorKey: 'colorValue'
            }],
            accessibility: {
                enabled: true,
                description: 'Magnitude vs depth scatter plot for aftershocks'
            }
        };
    }, [sequenceData, setHighlightedIndex, selectedIndices, setSelectedIndices]);

    // Aftershock Map Chart Options
    const mapChartOptions: Highcharts.Options = useMemo(() => {
        if (!nzMapGeometry) {
            console.log('Map options: No geometry data yet');
            return {};
        }

        console.log('Building map options with geometry:', {
            hasGeometry: !!nzMapGeometry,
            geometryType: nzMapGeometry?.type,
            featuresCount: nzMapGeometry?.features?.length
        });

        const maxDays = Math.max(...sequenceData.map(eq => eq.daysSince));
        const minDays = Math.min(...sequenceData.map(eq => eq.daysSince));

        const getColorForDays = (days: number) => {
            const normalized = (days - minDays) / (maxDays - minDays);
            if (normalized < 0.25) return 'rgba(100, 100, 255, 0.7)';
            if (normalized < 0.5) return 'rgba(50, 200, 255, 0.7)';
            if (normalized < 0.75) return 'rgba(50, 255, 200, 0.7)';
            return 'rgba(50, 255, 50, 0.7)';
        };

        // Log timeline zoom range for debugging
        if (timelineZoomRange) {
            console.log('Map filtering by timeline zoom:', timelineZoomRange);
        }

        const mapData = sequenceData
            .filter(eq => {
                // Filter out invalid coordinates
                const validCoords = (
                    typeof eq.latitude === 'number' &&
                    typeof eq.longitude === 'number' &&
                    isFinite(eq.latitude) &&
                    isFinite(eq.longitude) &&
                    eq.latitude >= -90 &&
                    eq.latitude <= 90 &&
                    eq.longitude >= -180 &&
                    eq.longitude <= 180
                );

                // Filter by timeline zoom range if active
                if (timelineZoomRange && validCoords) {
                    return eq.daysSince >= timelineZoomRange.min && eq.daysSince <= timelineZoomRange.max;
                }

                return validCoords;
            })

        console.log('Map data filtered:', {
            totalSequenceData: sequenceData.length,
            filteredMapData: mapData.length,
            timelineZoomRange
        });

        const mapDataWithMarkers = mapData
            .map((eq, index) => {
                const isSelected = selectedIndices.has(index);
                return {
                    lat: eq.latitude,
                    lon: eq.longitude,
                    z: eq.magnitude,
                    magnitude: eq.magnitude,
                    depth: eq.depth,
                    daysSince: eq.daysSince,
                    date: formatDate(eq.eqTime), // Format as dd/mm/yyyy
                    index,
                    color: isSelected ? '#ff0000' : getColorForDays(eq.daysSince),
                    marker: {
                        radius: isSelected ? Math.max(3, eq.magnitude * 1.5) * 1.5 : Math.max(3, eq.magnitude * 1.5),
                        fillColor: isSelected ? '#ff0000' : getColorForDays(eq.daysSince),
                        fillOpacity: isSelected ? 1 : 0.7,
                        lineWidth: isSelected ? 2 : 0,
                        lineColor: isSelected ? '#cc0000' : undefined
                    }
                };
            });

        console.log('Map data prepared:', {
            mapDataPoints: mapData.length,
            mainEventLat: mainEvent.latitude,
            mainEventLon: mainEvent.longitude,
            hasMapGeometry: !!nzMapGeometry
        });

        return {
            chart: {
                map: nzMapGeometry,
                backgroundColor: '#ffffff',
                height: 600,
                events: {
                    load: function(this: any) {
                        const chart = this;
                        (window as any).aftershockMapChart = chart;

                        // Auto-zoom to main event region (~275 km radius)
                        try {
                            const mapView = chart.mapView;
                            if (!mapView || typeof mapView.lonLatToProjectedUnits !== 'function') {
                                console.log('Auto-zoom: mapView or lonLatToProjectedUnits not available');
                                return;
                            }

                            // Validate coordinates
                            if (typeof mainEvent.latitude !== 'number' || typeof mainEvent.longitude !== 'number') {
                                console.log('Auto-zoom: Invalid main event coordinates');
                                return;
                            }

                            console.log('Auto-zoom: Attempting to zoom to main event', {
                                lat: mainEvent.latitude,
                                lon: mainEvent.longitude
                            });

                            // ~275 km radius ≈ 2.5 degrees
                            const radiusDegrees = 2.5;

                            // Convert lat/lon bounds to projected units
                            const min = mapView.lonLatToProjectedUnits({
                                lon: mainEvent.longitude - radiusDegrees,
                                lat: mainEvent.latitude - radiusDegrees
                            });
                            const max = mapView.lonLatToProjectedUnits({
                                lon: mainEvent.longitude + radiusDegrees,
                                lat: mainEvent.latitude + radiusDegrees
                            });

                            console.log('Auto-zoom: Projected bounds', {
                                min,
                                max,
                                bounds: { x1: min.x, y1: min.y, x2: max.x, y2: max.y }
                            });

                            // Fit to bounds with 10% padding
                            mapView.fitToBounds({
                                x1: min.x,
                                x2: max.x,
                                y1: min.y,
                                y2: max.y
                            }, '10%');

                            console.log('Auto-zoom: Successfully zoomed to main event');
                        } catch (error) {
                            console.error('Auto-zoom error:', error);
                        }
                    },
                    click: function(this: any, event: any) {
                        if (!isDrawingPolygon) return;

                        // Get lat/lon from click event
                        const chart = this;
                        if (!event.xAxis || !event.yAxis) return;

                        const lon = event.xAxis[0].value;
                        const lat = event.yAxis[0].value;

                        if (typeof lat !== 'number' || typeof lon !== 'number') return;

                        // Add point to polygon
                        const newPoint = { lat, lon };
                        const allPoints = [...polygonPoints, newPoint];
                        setPolygonPoints(allPoints);

                        // Remove old polygon series if exists
                        const existingSeries = chart.get('polygon-series');
                        if (existingSeries) {
                            existingSeries.remove(false);
                        }

                        // Draw polygon outline
                        if (allPoints.length >= 2) {
                            // Create closed polygon path for visualization
                            const polygonData = [...allPoints, allPoints[0]].map(p => [p.lon, p.lat]);

                            const newSeries = chart.addSeries({
                                type: 'mapline',
                                id: 'polygon-series',
                                name: 'Selection Polygon',
                                data: [polygonData],
                                color: '#ff0000',
                                lineWidth: 3,
                                enableMouseTracking: false,
                                showInLegend: false,
                                dashStyle: 'Solid',
                                zIndex: 100
                            }, false);
                            setPolygonSeries(newSeries);
                        }

                        // Add point markers
                        const markerSeries = chart.get('polygon-markers');
                        if (markerSeries) {
                            markerSeries.remove(false);
                        }

                        const markerData = allPoints.map(p => ({ lat: p.lat, lon: p.lon }));
                        chart.addSeries({
                            type: 'mappoint',
                            id: 'polygon-markers',
                            name: 'Polygon Points',
                            data: markerData,
                            color: '#ff0000',
                            marker: {
                                radius: 5,
                                symbol: 'circle',
                                fillColor: '#ff0000',
                                lineWidth: 2,
                                lineColor: '#ffffff'
                            },
                            enableMouseTracking: false,
                            showInLegend: false,
                            zIndex: 101
                        }, false);

                        chart.redraw();
                    }
                }
            },
            title: {
                text: 'Aftershock Locations',
                style: { fontSize: '16px', fontWeight: 'bold' }
            },
            credits: { enabled: false },
            // Disable Highcharts built-in export menu - use custom export buttons
            exporting: {
                enabled: false
            },
            mapNavigation: {
                enabled: true,
                buttonOptions: {
                    verticalAlign: 'bottom'
                }
            },
            colorAxis: {
                min: minDays,
                max: maxDays,
                stops: [
                    [0, 'rgba(100, 100, 255, 0.7)'],
                    [0.25, 'rgba(50, 200, 255, 0.7)'],
                    [0.5, 'rgba(50, 255, 200, 0.7)'],
                    [0.75, 'rgba(50, 255, 50, 0.7)'],
                    [1, 'rgba(50, 255, 50, 0.7)']
                ],
                labels: { format: '{value:.0f} days' },
                title: { text: 'Days Since Main Event' }
            },
            tooltip: {
                useHTML: true,
                formatter: function(this: any) {
                    const point = this.point;
                    if (!point || !point.magnitude) return '';
                    return `
                        <div style="padding: 4px;">
                            <strong>M${point.magnitude?.toFixed(1) || 'N/A'}</strong><br/>
                            Depth: ${point.depth?.toFixed(1) || 'N/A'} km<br/>
                            Days since main event: ${point.daysSince?.toFixed(1) || 'N/A'}<br/>
                            ${point.date || 'N/A'}
                        </div>
                    `;
                }
            },
            plotOptions: {
                mappoint: {
                    turboThreshold: 20000, // Increase threshold for large datasets (20+ years)
                    cursor: 'pointer',
                    states: {
                        hover: {
                            enabled: true,
                            lineWidth: 2,
                            lineColor: '#000000',
                            radiusPlus: 2
                        }
                    },
                    point: {
                        events: {
                            click: function(this: any) {
                                // Don't select individual points when drawing polygon
                                if (isDrawingPolygon) return;

                                const index = this.index;
                                setSelectedIndices(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(index)) {
                                        newSet.delete(index);
                                    } else {
                                        newSet.add(index);
                                    }
                                    return newSet;
                                });
                            },
                            mouseOver: function(this: any) {
                                const index = this.index;
                                setHighlightedIndex(index);
                                if ((window as any).aftershockSequenceChart) {
                                    const seqChart = (window as any).aftershockSequenceChart;
                                    if (seqChart.series && seqChart.series[0] && seqChart.series[0].data && seqChart.series[0].data[index]) {
                                        seqChart.series[0].data[index].setState('hover');
                                    }
                                }
                                if ((window as any).aftershockDepthChart) {
                                    const depthChart = (window as any).aftershockDepthChart;
                                    if (depthChart.series && depthChart.series[0] && depthChart.series[0].data && depthChart.series[0].data[index]) {
                                        depthChart.series[0].data[index].setState('hover');
                                    }
                                }
                            },
                            mouseOut: function(this: any) {
                                setHighlightedIndex(null);
                                if ((window as any).aftershockSequenceChart) {
                                    const seqChart = (window as any).aftershockSequenceChart;
                                    if (seqChart.series && seqChart.series[0] && seqChart.series[0].data && seqChart.series[0].data[this.index]) {
                                        seqChart.series[0].data[this.index].setState('');
                                    }
                                }
                                if ((window as any).aftershockDepthChart) {
                                    const depthChart = (window as any).aftershockDepthChart;
                                    if (depthChart.series && depthChart.series[0] && depthChart.series[0].data && depthChart.series[0].data[this.index]) {
                                        depthChart.series[0].data[this.index].setState('');
                                    }
                                }
                            }
                        }
                    }
                }
            },
            series: [
                {
                    type: 'map',
                    name: 'New Zealand',
                    borderColor: '#606060',
                    nullColor: 'rgba(200, 200, 200, 0.2)',
                    showInLegend: false
                },
                // Radius circle is added dynamically via useEffect
                // Main event marker
                {
                    type: 'mappoint',
                    name: 'Main Event',
                    data: [{
                        lat: mainEvent.latitude,
                        lon: mainEvent.longitude,
                        name: mainEvent.name,
                        magnitude: mainEvent.magnitude
                    }],
                    color: '#ff0000',
                    marker: {
                        symbol: 'diamond',
                        radius: 8,
                        fillColor: '#ff0000',
                        lineWidth: 2,
                        lineColor: '#ffffff'
                    },
                    enableMouseTracking: true,
                    showInLegend: true,
                    zIndex: 60,
                    tooltip: {
                        pointFormat: '<b>{point.name}</b><br/>M{point.magnitude}<br/>Main Event'
                    }
                },
                {
                    type: 'mappoint',
                    name: 'Aftershocks',
                    data: mapDataWithMarkers.map(d => ({ ...d, colorValue: d.daysSince })),
                    colorKey: 'colorValue'
                }
            ],
            accessibility: {
                enabled: true,
                description: 'Map showing aftershock locations color-coded by time since main event'
            }
        };
    }, [sequenceData, nzMapGeometry, setHighlightedIndex, selectedIndices, setSelectedIndices, isDrawingPolygon, polygonPoints, polygonSeries, mainEvent.latitude, mainEvent.longitude, mainEvent.magnitude, mainEvent.name, timelineZoomRange]);

    if (sequenceData.length === 0) {
        return (
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Aftershock Sequence</h3>
                <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                    <p className="text-yellow-800 font-medium mb-2">No earthquakes found in the sequence time range.</p>
                    <div className="text-sm text-yellow-700 space-y-1">
                        <p><strong>Main Event:</strong> {mainEvent.name} (M{mainEvent.magnitude})</p>
                        <p><strong>Total Loaded Events:</strong> {earthquakes.length}</p>
                    </div>
                </div>
                <p className="text-gray-600 text-sm">
                    Try loading a longer time range (e.g., &ldquo;Last 30 Years&rdquo;) or lowering the minimum magnitude.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Info with Selection Controls */}
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">{mainEvent.name}</h2>
                        <div className="flex items-center gap-4 mt-1">
                            <p className="text-sm text-gray-600">
                                <span className="font-semibold text-gray-800">{sequenceData.length}</span> events loaded
                                <span className="text-gray-400 ml-1">(within {aftershockRadius} km, 30 days before to 365 days after mainshock)</span>
                            </p>
                            {selectedIndices.size > 0 && (
                                <p className="text-sm text-blue-600 font-medium">
                                    {selectedIndices.size} event{selectedIndices.size !== 1 ? 's' : ''} selected
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {selectedIndices.size > 0 && (
                            <button
                                onClick={() => setSelectedIndices(new Set())}
                                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-200 text-sm font-medium"
                            >
                                Clear Selection
                            </button>
                        )}
                    </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                    💡 Click on any point in any chart to select/deselect events. Selected events appear in red across all charts.
                </p>
            </div>

            {/* Polygon Drawing Controls */}
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h3 className="text-md font-semibold text-gray-800">Polygon Selection Tool</h3>
                        {isDrawingPolygon && (
                            <span className="text-sm text-blue-600 font-medium">
                                {polygonPoints.length} point{polygonPoints.length !== 1 ? 's' : ''} added
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {!isDrawingPolygon ? (
                            <>
                                <button
                                    onClick={togglePolygonDrawing}
                                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200 text-sm font-medium flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                    </svg>
                                    Draw Polygon
                                </button>
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium text-gray-700">Radius (km):</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="10"
                                            max="500"
                                            step="10"
                                            value={aftershockRadius}
                                            onChange={(e) => setAftershockRadius(Number(e.target.value))}
                                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        />
                                        {aftershockRadius !== debouncedRadius && (
                                            <div className="absolute -right-6 top-1/2 -translate-y-1/2">
                                                <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse" title="Updating..."></div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowRadiusCircle(!showRadiusCircle)}
                                    className={`px-4 py-2 rounded-lg transition-colors duration-200 text-sm font-medium flex items-center gap-2 ${
                                        showRadiusCircle
                                            ? 'bg-purple-500 text-white hover:bg-purple-600'
                                            : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                                    }`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <circle cx="12" cy="12" r="10" strokeWidth={2} strokeDasharray="4 2" />
                                    </svg>
                                    {showRadiusCircle ? 'Hide' : 'Show'} Radius Circle
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={completePolygon}
                                    disabled={polygonPoints.length < 3}
                                    className={`px-4 py-2 rounded-lg transition-colors duration-200 text-sm font-medium ${
                                        polygonPoints.length >= 3
                                            ? 'bg-green-500 text-white hover:bg-green-600'
                                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    }`}
                                >
                                    Complete Polygon ({polygonPoints.length >= 3 ? 'Ready' : 'Need ' + (3 - polygonPoints.length) + ' more'})
                                </button>
                                <button
                                    onClick={clearPolygon}
                                    className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-200 text-sm font-medium"
                                >
                                    Cancel
                                </button>
                            </>
                        )}
                        {polygonPoints.length > 0 && !isDrawingPolygon && (
                            <button
                                onClick={clearPolygon}
                                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors duration-200 text-sm font-medium"
                            >
                                Clear Polygon
                            </button>
                        )}
                    </div>
                </div>
                {isDrawingPolygon && (
                    <p className="text-xs text-gray-500 mt-2">
                        🖱️ Click on the map below to add points to your polygon. You need at least 3 points to complete the selection.
                    </p>
                )}
                {!isDrawingPolygon && polygonPoints.length === 0 && (
                    <p className="text-xs text-gray-500 mt-2">
                        Draw a custom polygon on the map to select multiple earthquake events at once.
                    </p>
                )}
            </div>

            {/* Main Aftershock Sequence Plot - Full Width */}
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Aftershock Sequence Timeline</h3>
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
                    filename="aftershock-sequence"
                />
            </div>

            {/* Magnitude vs Depth Scatter Plot - Full Width */}
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Magnitude vs Depth</h3>
                <div className="h-[500px]">
                    <HighchartsReact
                        highcharts={Highcharts}
                        options={depthChartOptions}
                        ref={depthChartRef}
                    />
                </div>
                <ChartExportButtons
                    chartRef={depthChartRef}
                    data={earthquakes}
                    filename="aftershock-magnitude-depth"
                />
            </div>

            {/* Aftershock Map - Full Width */}
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Aftershock Locations</h3>
                    <div className="flex items-center gap-2">
                        {timelineZoomRange && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-300 rounded-lg">
                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                <span className="text-sm font-medium text-blue-700">
                                    Filtered: {timelineZoomRange.min.toFixed(1)} - {timelineZoomRange.max.toFixed(1)} days
                                </span>
                                <button
                                    onClick={() => {
                                        setTimelineZoomRange(null);
                                        // Reset zoom on timeline chart
                                        const chart = chartRef.current?.chart;
                                        if (chart) {
                                            chart.zoomOut();
                                        }
                                    }}
                                    className="ml-1 text-blue-700 hover:text-blue-900 font-bold"
                                    title="Clear timeline filter"
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                        {isDrawingPolygon && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-300 rounded-lg">
                                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                <span className="text-sm font-medium text-red-700">Drawing Mode Active</span>
                            </div>
                        )}
                    </div>
                </div>
                {nzMapGeometry ? (
                    <>
                        <div className={`h-[600px] ${isDrawingPolygon ? 'cursor-crosshair' : ''}`}>
                            <HighchartsReact
                                highcharts={Highcharts}
                                options={mapChartOptions}
                                ref={mapChartRef}
                                constructorType="mapChart"
                            />
                        </div>
                        <ChartExportButtons
                            chartRef={mapChartRef}
                            data={earthquakes}
                            filename="aftershock-map"
                        />
                    </>
                ) : (
                    <div className="h-[600px] flex items-center justify-center bg-gray-50 rounded">
                        <p className="text-gray-500">Loading map...</p>
                    </div>
                )}
            </div>
        </div>
    );
});

// Export memoized version to prevent unnecessary re-renders
export default AftershockSequencePlot;
