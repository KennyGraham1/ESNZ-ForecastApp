'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, useEffect, memo } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';
import { stratifiedSample } from '@/utils/dataOptimization';
import { SAMPLING_CONFIG, getOptimalSamplingThreshold, HIGHCHARTS_CONFIG } from '@/config/performance';
import { formatDateForTooltip } from '@/utils/dateFormat';

// Define the data interface expected by the component
export interface PlotDataPoint {
    lat: number;
    lon: number;
    depth: number;
    magnitude: number;
    time: Date | number;
    locality: string;
    cluster: number;
    isSelected: boolean;
    originalIndex: number; // The stable index to report back on click
    eventID: string;
}

interface TemporalSpatial3DPlotProps {
    data: PlotDataPoint[];
    onPointClick?: (index: number) => void;
}

const TemporalSpatial3DPlot = memo(function TemporalSpatial3DPlot({
    data,
    onPointClick
}: TemporalSpatial3DPlotProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);

    // Helper to get consistent cluster colors (same as TemporalSpatial.tsx)
    const getClusterColor = (clusterLabel: number) => {
        const colors = [
            '#440154', '#482878', '#3e4989', '#31688e', '#26828e',
            '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde724',
        ];
        if (clusterLabel < 0) return '#9ca3af'; // noise / unassigned
        return colors[clusterLabel % colors.length];
    };

    const chartOptions: Highcharts.Options = useMemo(() => {
        // Validate data before processing
        if (!data || data.length === 0) {
            return {
                chart: { type: 'scatter', height: 500 },
                title: { text: '' },
                credits: { enabled: false },
                exporting: { enabled: false },
                series: []
            };
        }

        // OPTIMIZATION: Use stratified sampling to preserve magnitude distribution
        const maxPoints = getOptimalSamplingThreshold('THREE_D');
        let processedData = data;

        if (data.length > SAMPLING_CONFIG.THREE_D.threshold) {
            // Group by magnitude bins for stratified sampling (preserves distribution)
            const bins = new Map<number, PlotDataPoint[]>();
            data.forEach(point => {
                const bin = Math.floor(point.magnitude);
                if (!bins.has(bin)) {
                    bins.set(bin, []);
                }
                bins.get(bin)?.push(point);
            });

            // Calculate samples per bin proportionally
            const sampled: PlotDataPoint[] = [];
            bins.forEach((binData) => {
                const proportion = binData.length / data.length;
                const samplesForBin = Math.max(1, Math.floor(maxPoints * proportion));
                const step = Math.max(1, Math.floor(binData.length / samplesForBin));

                for (let i = 0; i < binData.length && sampled.length < maxPoints; i += step) {
                    sampled.push(binData[i]);
                }
            });

            processedData = sampled;
            console.log(`📊 3D Temporal-Spatial: Stratified sampling: ${processedData.length} points from ${data.length} total (${bins.size} magnitude bins)`);
        }

        // Get depth range for axis scaling
        // FIXED: Use iterative approach to avoid stack overflow on large datasets
        let maxDepth = -Infinity;
        for (const d of processedData) {
            if (d.depth > maxDepth) maxDepth = d.depth;
        }

        // Exponential marker size scaling based on magnitude
        const getMarkerRadius = (mag: number) => {
            return Math.max(2, Math.pow(2, mag - 2));
        };

        const seriesData = processedData.map((d) => {
            return {
                x: d.lon,
                y: d.lat,
                z: d.depth,
                color: d.isSelected ? '#ef4444' : getClusterColor(d.cluster),
                marker: {
                    // Selected: enlarged + white ring creates a visible halo effect
                    radius: d.isSelected ? getMarkerRadius(d.magnitude) + 3 : getMarkerRadius(d.magnitude),
                    fillOpacity: d.isSelected ? 1 : 0.7,
                    lineWidth: d.isSelected ? 3 : 0.5,
                    lineColor: d.isSelected ? '#ffffff' : 'rgba(255,255,255,0.3)'
                },
                custom: {
                    magnitude: d.magnitude,
                    depth: d.depth,
                    latitude: d.lat,
                    longitude: d.lon,
                    locality: d.locality,
                    time: d.time,
                    cluster: d.cluster,
                    originalIndex: d.originalIndex,
                    isSelected: d.isSelected,
                    eventID: d.eventID
                }
            };
        });

        return {
            chart: {
                type: 'scatter3d',
                height: 500,
                backgroundColor: 'white',
                margin: 100,
                options3d: {
                    enabled: true,
                    alpha: 10,
                    beta: 30,
                    depth: 250,
                    viewDistance: 5,
                    fitToPlot: false,
                    frame: {
                        visible: 'default',
                        bottom: { size: 1, color: 'rgba(0,0,0,0.02)' },
                        back: { size: 1, color: 'rgba(0,0,0,0.04)' },
                        side: { size: 1, color: 'rgba(0,0,0,0.06)' }
                    }
                }
            },
            title: {
                text: ''
            },
            subtitle: {
                text: 'Drag to rotate • Scroll to zoom • Click points to select',
                style: {
                    fontSize: '12px',
                    color: '#666'
                }
            },
            credits: {
                enabled: false
            },
            exporting: {
                enabled: false
            },
            xAxis: {
                title: {
                    text: 'Longitude (°E)'
                },
                min: 160,
                max: 180,
                gridLineWidth: 1,
                labels: {
                    skew3d: true
                }
            },
            yAxis: {
                title: {
                    text: 'Latitude (°S)'
                },
                min: -48,
                max: -32,
                labels: {
                    skew3d: true,
                    format: '{value}°'
                }
            },
            zAxis: {
                title: {
                    text: 'Depth (km)'
                },
                min: 0,
                max: Math.ceil(maxDepth / 50) * 50,
                reversed: true,
                showFirstLabel: false,
                labels: {
                    skew3d: true,
                    format: '{value} km'
                }
            },
            tooltip: {
                useHTML: true,
                formatter: function (this: any) {
                    const point = this.point;
                    const custom = point.custom;
                    const timeStr = formatDateForTooltip(custom.time);
                    const clusterText = custom.cluster >= 0 ? `Cluster ${custom.cluster}` : 'Noise';
                    return `
                        <div style="padding: 8px;">
                            <strong>${custom.locality || 'Unknown location'}</strong><br/>
                            <strong>M${custom.magnitude.toFixed(1)}</strong><br/>
                            Event ID: ${custom.eventID || 'N/A'}<br/>
                            ${timeStr}<br/>
                            Depth: ${custom.depth.toFixed(1)} km<br/>
                            Lat: ${custom.latitude.toFixed(2)}°, Lon: ${custom.longitude.toFixed(2)}°<br/>
                            <em>${clusterText}</em>
                        </div>
                    `;
                }
            },
            boost: {
                useGPUTranslations: true,
                usePreallocated: true
            },
            plotOptions: {
                series: {
                    turboThreshold: 50000, // Support very large datasets (50k+ events)
                    boostThreshold: HIGHCHARTS_CONFIG.BOOST_THRESHOLD // Use centralized boost threshold
                },
                scatter3d: {
                    marker: {
                        fillOpacity: 0.7,
                        lineWidth: 0.5,
                        lineColor: 'rgba(255,255,255,0.3)'
                    },
                    point: {
                        events: {
                            click: function (this: any) {
                                if (onPointClick && this.custom?.originalIndex !== undefined) {
                                    onPointClick(this.custom.originalIndex);
                                }
                            }
                        }
                    }
                }
            },
            series: [{
                type: 'scatter3d',
                name: 'Earthquakes',
                data: seriesData,
                colorKey: 'colorValue'
            }],
            accessibility: {
                enabled: true,
                description: '3D visualization of earthquake distribution showing longitude (X), latitude (Y), and depth (Z). Points are colored by cluster assignment. Click points to select, drag to rotate, scroll to zoom.',
                keyboardNavigation: {
                    enabled: true
                }
            }
        };
    }, [data, onPointClick]);

    // Add interactive rotation and zoom functionality
    useEffect(() => {
        const chart = chartRef.current?.chart;
        if (!chart || data.length === 0) return;

        // Track if we're in a pinch gesture
        let isPinching = false;
        let initialPinchDistance = 0;

        // Function to handle drag rotation
        const handleDragStart = (eStart: MouseEvent | TouchEvent) => {
            // Check if this is a pinch gesture (2 fingers)
            if (eStart instanceof TouchEvent && eStart.touches.length === 2) {
                isPinching = true;
                const touch1 = eStart.touches[0];
                const touch2 = eStart.touches[1];
                initialPinchDistance = Math.hypot(
                    touch2.pageX - touch1.pageX,
                    touch2.pageY - touch1.pageY
                );
                return;
            }

            // Normalize event for both mouse and touch
            const getEventCoords = (e: MouseEvent | TouchEvent) => {
                if (e instanceof MouseEvent) {
                    return { x: e.pageX, y: e.pageY };
                } else {
                    const touch = e.touches[0];
                    return { x: touch.pageX, y: touch.pageY };
                }
            };

            const startCoords = getEventCoords(eStart);
            const posX = startCoords.x;
            const posY = startCoords.y;
            const alpha = chart.options.chart?.options3d?.alpha || 10;
            const beta = chart.options.chart?.options3d?.beta || 30;
            const sensitivity = 3;

            const handleDragMove = (e: MouseEvent | TouchEvent) => {
                // Handle pinch-to-zoom
                if (e instanceof TouchEvent && e.touches.length === 2) {
                    e.preventDefault();
                    const touch1 = e.touches[0];
                    const touch2 = e.touches[1];
                    const currentDistance = Math.hypot(
                        touch2.pageX - touch1.pageX,
                        touch2.pageY - touch1.pageY
                    );

                    if (initialPinchDistance > 0) {
                        const scale = currentDistance / initialPinchDistance;
                        const currentViewDistance = chart.options.chart?.options3d?.viewDistance || 5;
                        const newViewDistance = Math.max(1, Math.min(30, currentViewDistance / scale));

                        if (chart.options.chart?.options3d) {
                            chart.options.chart.options3d.viewDistance = newViewDistance;
                        }

                        initialPinchDistance = currentDistance;
                        chart.redraw(false);
                    }
                    return;
                }

                e.preventDefault();
                const moveCoords = getEventCoords(e);

                // Update beta (horizontal rotation)
                const newBeta = beta + (posX - moveCoords.x) / sensitivity;
                if (chart.options.chart?.options3d) {
                    chart.options.chart.options3d.beta = newBeta;
                }

                // Update alpha (vertical rotation) - constrained to prevent flips
                const newAlpha = Math.max(-90, Math.min(90, alpha + (moveCoords.y - posY) / sensitivity));
                if (chart.options.chart?.options3d) {
                    chart.options.chart.options3d.alpha = newAlpha;
                }

                chart.redraw(false);
            };

            const handleDragEnd = () => {
                isPinching = false;
                initialPinchDistance = 0;
                document.removeEventListener('mousemove', handleDragMove as any);
                document.removeEventListener('touchmove', handleDragMove as any);
                document.removeEventListener('mouseup', handleDragEnd);
                document.removeEventListener('touchend', handleDragEnd);
            };

            document.addEventListener('mousemove', handleDragMove as any);
            document.addEventListener('touchmove', handleDragMove as any, { passive: false });
            document.addEventListener('mouseup', handleDragEnd);
            document.addEventListener('touchend', handleDragEnd);
        };

        // Function to handle mouse wheel zoom
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();

            const currentViewDistance = chart.options.chart?.options3d?.viewDistance || 5;
            const zoomSensitivity = 0.5;
            const delta = e.deltaY > 0 ? 1 : -1;

            const newViewDistance = Math.max(1, Math.min(30, currentViewDistance + delta * zoomSensitivity));

            if (chart.options.chart?.options3d) {
                chart.options.chart.options3d.viewDistance = newViewDistance;
            }

            chart.redraw(false);
        };

        // Attach event listeners to chart container
        const container = chart.container;
        container.addEventListener('mousedown', handleDragStart as any);
        container.addEventListener('touchstart', handleDragStart as any, { passive: false });
        container.addEventListener('wheel', handleWheel, { passive: false });

        // Cleanup
        return () => {
            container.removeEventListener('mousedown', handleDragStart as any);
            container.removeEventListener('touchstart', handleDragStart as any);
            container.removeEventListener('wheel', handleWheel);
        };
    }, [data]);

    if (data.length === 0) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                <h3 className="text-xl font-bold text-gray-800 mb-1">3D Spatial Distribution</h3>
                <p className="text-gray-500">No data available</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
            <div className="mb-4">
                <h3 className="text-xl font-bold text-gray-800 mb-1">3D Spatial Distribution</h3>
                <p className="text-sm text-gray-500">
                    Click on points to select/deselect earthquakes. Drag to rotate, scroll to zoom. Selected events are highlighted in red.
                </p>
            </div>
            <div className="h-[500px] cursor-grab active:cursor-grabbing">
                <HighchartsReact
                    highcharts={Highcharts}
                    options={chartOptions}
                    ref={chartRef}
                />
            </div>
            <div className="mt-2 space-y-1">
                <p className="text-sm text-gray-600">
                    <strong>Interactive 3D Controls:</strong>
                </p>
                <ul className="text-xs text-gray-600 list-disc list-inside space-y-0.5">
                    <li><strong>Rotate:</strong> Click and drag to rotate the view</li>
                    <li><strong>Zoom:</strong> Mouse wheel to zoom in/out (or pinch on touch devices)</li>
                    <li><strong>Select:</strong> Click on points to select/deselect individual earthquakes</li>
                    <li><strong>Marker Size:</strong> Larger circles = higher magnitude earthquakes (exponential scaling)</li>
                    <li><strong>Color:</strong> Points colored by cluster assignment (same as spatial map)</li>
                    <li><strong>Depth:</strong> Z-axis shows depth (deeper earthquakes appear lower in the plot)</li>
                </ul>
            </div>
            <ChartExportButtons
                chartRef={chartRef}
                data={data} // This might need adaptation if ExportButtons expects strict EarthquakeData
                filename="temporal-spatial-3d"
            // clusterLabels are inside data now
            />
        </div>
    );
});

export default TemporalSpatial3DPlot;

