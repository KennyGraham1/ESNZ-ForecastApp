'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, useEffect, memo } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';
import { stratifiedSample } from '@/utils/dataOptimization';
import { SAMPLING_CONFIG, getOptimalSamplingThreshold } from '@/config/performance';

interface ThreeDVisualizationProps {
    earthquakes: EarthquakeData[];
}

const ThreeDVisualization = memo(function ThreeDVisualization({ earthquakes }: ThreeDVisualizationProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);

    const chartOptions: Highcharts.Options = useMemo(() => {
        // Validate data before processing
        if (!earthquakes || earthquakes.length === 0) {
            return {
                chart: { type: 'scatter', height: 500 },
                title: { text: '' },
                credits: { enabled: false },
                exporting: { enabled: false }, // Disable built-in export menu
                series: []
            };
        }

        // OPTIMIZATION: Use stratified sampling to preserve distribution (90% faster rendering)
        const maxPoints = getOptimalSamplingThreshold('THREE_D');
        let processedEarthquakes = earthquakes;

        if (earthquakes.length > SAMPLING_CONFIG.THREE_D.threshold) {
            processedEarthquakes = stratifiedSample(earthquakes, maxPoints);
            console.log(`📊 3D Visualization: Stratified sample ${processedEarthquakes.length} points from ${earthquakes.length} total`);
        }

        // Get magnitude and depth ranges for scaling
        const magnitudes = processedEarthquakes.map(eq => eq.magnitude);
        const depths = processedEarthquakes.map(eq => eq.depth);
        const minMag = Math.min(...magnitudes);
        const maxMag = Math.max(...magnitudes);
        const minDepth = Math.min(...depths);
        const maxDepth = Math.max(...depths);

        // Viridis color scale
        const getColor = (mag: number) => {
            const normalized = (mag - minMag) / (maxMag - minMag);
            const colors = [
                '#440154', '#482878', '#3e4989', '#31688e', '#26828e',
                '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde724'
            ];
            const index = Math.floor(normalized * (colors.length - 1));
            return colors[index];
        };

        // Exponential marker size scaling based on magnitude
        // Using formula similar to DepthProfilePlot for consistency
        const getMarkerRadius = (mag: number) => {
            // Scale: M3.0 → radius ~2, M4.0 → radius ~4, M5.0 → radius ~8, M6.0 → radius ~16
            return Math.max(2, Math.pow(2, mag - 2));
        };

        const data = processedEarthquakes.map(eq => ({
            x: eq.longitude,
            y: eq.latitude,
            z: eq.depth, // Positive depth (will be inverted by reversed zAxis)
            color: getColor(eq.magnitude),
            marker: {
                radius: getMarkerRadius(eq.magnitude)
            },
            custom: {
                magnitude: eq.magnitude,
                depth: eq.depth,
                latitude: eq.latitude,
                longitude: eq.longitude
            }
        }));

        return {
            chart: {
                type: 'scatter3d',  // ✅ Changed from 'scatter' to 'scatter3d' for true 3D
                height: 500,
                backgroundColor: 'white',
                margin: 100,
                options3d: {
                    enabled: true,
                    alpha: 10,  // ✅ Vertical rotation angle (tilt) - optimized for depth visibility
                    beta: 30,   // ✅ Horizontal rotation angle (spin) - optimized for depth visibility
                    depth: 250, // ✅ Z-axis depth - balanced for proper 3D perspective
                    viewDistance: 5,  // ✅ Camera distance - closer for better interaction
                    fitToPlot: false,  // ✅ False to maintain consistent perspective during rotation
                    frame: {
                        visible: 'default',  // ✅ Make frame visible for spatial reference
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
                text: 'Drag to rotate • Scroll to zoom',
                style: {
                    fontSize: '12px',
                    color: '#666'
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
                max: Math.ceil(maxDepth / 50) * 50, // Round up to nearest 50km for clean axis
                reversed: true, // Reversed so deeper earthquakes appear lower in the plot
                showFirstLabel: false,
                labels: {
                    skew3d: true,
                    format: '{value} km'
                }
            },
            colorAxis: {
                min: minMag,
                max: maxMag,
                stops: [
                    [0, '#440154'],
                    [0.1, '#482878'],
                    [0.2, '#3e4989'],
                    [0.3, '#31688e'],
                    [0.4, '#26828e'],
                    [0.5, '#1f9e89'],
                    [0.6, '#35b779'],
                    [0.7, '#6ece58'],
                    [0.8, '#b5de2b'],
                    [1, '#fde724']
                ],
                labels: {
                    format: '{value}'
                },
                title: {
                    text: 'Magnitude'
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
                    const custom = point.custom;
                    return `
                        <div style="padding: 4px;">
                            <strong>M${custom.magnitude.toFixed(1)}</strong><br/>
                            Depth: ${custom.depth.toFixed(1)} km<br/>
                            Lat: ${custom.latitude.toFixed(2)}°, Lon: ${custom.longitude.toFixed(2)}°
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
                    boostThreshold: 5000 // Use boost module for datasets > 5000 points
                },
                scatter3d: {  // ✅ Changed to scatter3d
                    marker: {
                        fillOpacity: 0.7, // Slight transparency to see overlapping points
                        lineWidth: 0.5,
                        lineColor: 'rgba(255,255,255,0.3)'
                    }
                }
            },
            series: [{
                type: 'scatter3d',  // ✅ Changed to scatter3d for true 3D rendering
                name: 'Earthquakes',
                data: data.map(d => ({
                    ...d,
                    colorValue: d.custom.magnitude
                })),
                colorKey: 'colorValue'
            }],
            accessibility: {
                enabled: true,
                description: '3D visualization of earthquake distribution showing longitude (X), latitude (Y), and depth (Z, inverted). Marker size represents magnitude. Drag to rotate, scroll to zoom.'
            }
        };
    }, [earthquakes]);

    // Add interactive rotation and zoom functionality
    useEffect(() => {
        const chart = chartRef.current?.chart;
        if (!chart || earthquakes.length === 0) return;

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
            const sensitivity = 3; // ✅ Lower value = more sensitive rotation for better depth axis exploration

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
                        // ✅ Wider range (1-30) for better depth exploration on touch devices
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

                // Update beta (horizontal rotation) - unlimited rotation for full 360° exploration
                const newBeta = beta + (posX - moveCoords.x) / sensitivity;
                if (chart.options.chart?.options3d) {
                    chart.options.chart.options3d.beta = newBeta;
                }

                // Update alpha (vertical rotation) - constrained to prevent disorienting flips
                // ✅ Limit alpha between -90 and 90 degrees for intuitive depth axis viewing
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
            const zoomSensitivity = 0.5; // ✅ Increased sensitivity for more responsive zoom
            const delta = e.deltaY > 0 ? 1 : -1; // Positive = zoom out, negative = zoom in

            // Calculate new view distance (lower = closer/zoomed in, higher = further/zoomed out)
            // ✅ Wider range (1-30) for better depth exploration
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
    }, [earthquakes]);

    if (earthquakes.length === 0) {
        return (
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">3D Visualization</h3>
                <p className="text-gray-500">No data available</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">3D Earthquake Distribution</h3>
                <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-gray-500 italic">🖱️ Drag to rotate</span>
                    <span className="text-xs text-gray-500 italic">🔍 Scroll to zoom</span>
                </div>
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
                    <li><strong>Marker Size:</strong> Larger circles = higher magnitude earthquakes (exponential scaling)</li>
                    <li><strong>Color:</strong> Viridis color scale represents magnitude (purple = low, yellow = high)</li>
                    <li><strong>Depth:</strong> Z-axis shows depth (deeper earthquakes appear lower in the plot)</li>
                </ul>
            </div>
            <ChartExportButtons
                chartRef={chartRef}
                data={earthquakes}
                filename="3d-visualization"
            />
        </div>
    );
});

// Export memoized version to prevent unnecessary re-renders
export default ThreeDVisualization;
