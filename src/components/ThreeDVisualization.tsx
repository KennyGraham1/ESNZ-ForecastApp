'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, useEffect, memo } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';
import { HIGHCHARTS_CONFIG } from '@/config/performance';
import { safeMin, safeMax } from '@/utils/arrayMath';
import { getColorStops, ColorPaletteName } from '@/utils/colorPalette';

interface ThreeDVisualizationProps {
    earthquakes: EarthquakeData[];
    xAxisField?: keyof EarthquakeData;
    yAxisField?: keyof EarthquakeData;
    zAxisField?: keyof EarthquakeData;
    colorField?: keyof EarthquakeData;
    fullDataForExport?: EarthquakeData[]; // NEW: Full dataset for high-res export
    colorPalette?: 'default' | 'magma' | 'viridis' | 'plasma' | 'inferno' | 'cividis' | 'turbo' | 'deut-prot' | 'tritan';
}

const ThreeDVisualization = memo(function ThreeDVisualization({
    earthquakes,
    xAxisField = 'longitude',
    yAxisField = 'latitude',
    zAxisField = 'depth',
    colorField = 'magnitude',
    fullDataForExport,
    colorPalette = 'viridis' // Default to viridis for backward compatibility (Sandbox)
}: ThreeDVisualizationProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);

    const chartOptions: Highcharts.Options = useMemo(() => {
        // Validate data before processing
        if (!earthquakes || earthquakes.length === 0) {
            return {
                chart: { type: 'scatter3d', height: 500 }, // Fixed type mismatch
                title: { text: '' },
                credits: { enabled: false },
                exporting: { enabled: false },
                series: []
            };
        }

        // Use passed 'earthquakes' directly (external sampling handled by parent)
        const processedEarthquakes = earthquakes;

        // Check for time fields
        const isTimeField = (field: string) => {
            const f = field.toString().toLowerCase();
            return f === 'time' || f.includes('date') || f.includes('timems');
        };

        const isXTime = isTimeField(xAxisField.toString());
        const isYTime = isTimeField(yAxisField.toString());
        const isZTime = isTimeField(zAxisField.toString());
        const isColorTime = colorField ? isTimeField(colorField.toString()) : false; // Handle potential undefined if modified later

        // Helper: safe access and cast, handling dates
        const getVal = (eq: EarthquakeData, field: keyof EarthquakeData) => {
            const val = eq[field];
            if (val instanceof Date) return val.getTime();
            if (typeof val === 'string' && isTimeField(field.toString())) return new Date(val).getTime();
            return typeof val === 'number' ? val : 0;
        };

        const colorValues = processedEarthquakes.map(eq => getVal(eq, colorField));
        const minColor = safeMin(colorValues);
        const maxColor = safeMax(colorValues);

        // Calculate axis ranges
        const xValues = processedEarthquakes.map(eq => getVal(eq, xAxisField));
        const minX = safeMin(xValues);
        const maxX = safeMax(xValues);

        const yValues = processedEarthquakes.map(eq => getVal(eq, yAxisField));
        const minY = safeMin(yValues);
        const maxY = safeMax(yValues);

        const zValues = processedEarthquakes.map(eq => getVal(eq, zAxisField));
        const minZ = safeMin(zValues);
        const maxZ = safeMax(zValues);

        // Exponential marker size scaling based on magnitude
        const getMarkerRadius = (mag: number) => {
            return Math.max(2, Math.pow(2, mag - 2));
        };

        // Data transformation helper
        const transformData = (data: EarthquakeData[]) => {
            return data.map(eq => {
                const x = getVal(eq, xAxisField);
                const y = getVal(eq, yAxisField);
                const z = getVal(eq, zAxisField);
                const cVal = getVal(eq, colorField);

                if (isNaN(x) || isNaN(y) || isNaN(z) || isNaN(cVal)) return null;

                return {
                    x, y, z,
                    colorValue: cVal,
                    marker: {
                        radius: getMarkerRadius(eq.magnitude)
                    },
                    custom: {
                        magnitude: eq.magnitude,
                        depth: eq.depth,
                        latitude: eq.latitude,
                        longitude: eq.longitude,
                        eventID: eq.eventID,
                        xVal: eq[xAxisField],
                        yVal: eq[yAxisField],
                        zVal: eq[zAxisField],
                        cVal: cVal
                    }
                };
            }).filter((p): p is any => p !== null);
        };

        const data = transformData(processedEarthquakes);

        return {
            chart: {
                type: 'scatter3d',
                height: 500,
                backgroundColor: 'white',
                margin: 100,
                style: {
                    fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                },
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
            title: { text: '' },
            subtitle: { text: '' },
            credits: { enabled: false },
            exporting: {
                enabled: true,
                sourceWidth: 2400,
                sourceHeight: 1600,
                scale: 2,
                chartOptions: {
                    title: { text: '3D Earthquake Distribution' },
                    subtitle: { text: '' },
                    style: { fontFamily: 'Arial, Helvetica, sans-serif' },
                    legend: { itemStyle: { fontSize: '18px' } },
                    xAxis: { labels: { style: { fontSize: '14px' } }, title: { style: { fontSize: '18px' } } },
                    yAxis: { labels: { style: { fontSize: '14px' } }, title: { style: { fontSize: '18px' } } },
                    zAxis: { labels: { style: { fontSize: '14px' } }, title: { style: { fontSize: '18px' } } },
                    // Use full data for export if available
                    ...(fullDataForExport ? {
                        series: [{
                            type: 'scatter3d',
                            data: transformData(fullDataForExport)
                        }]
                    } : {})
                }
            },
            xAxis: {
                type: isXTime ? 'datetime' : 'linear',
                min: minX,
                max: maxX,
                title: {
                    text: xAxisField.toString(),
                    style: { fontSize: '12px', fontWeight: 'bold', color: '#374151' }
                },
                gridLineWidth: 1,
                gridLineColor: '#E5E7EB',
                labels: { skew3d: true, format: isXTime ? undefined : '{value}', style: { fontSize: '10px', color: '#6B7280' } }
            },
            yAxis: {
                type: isYTime ? 'datetime' : 'linear',
                min: minY,
                max: maxY,
                title: {
                    text: yAxisField.toString(),
                    style: { fontSize: '12px', fontWeight: 'bold', color: '#374151' }
                },
                labels: { skew3d: true, format: isYTime ? undefined : '{value}', style: { fontSize: '10px', color: '#6B7280' } }
            },
            zAxis: {
                type: isZTime ? 'datetime' : 'linear',
                min: minZ,
                max: maxZ,
                title: {
                    text: zAxisField.toString(),
                    style: { fontSize: '12px', fontWeight: 'bold', color: '#374151' }
                },
                reversed: zAxisField === 'depth',
                showFirstLabel: false,
                labels: { skew3d: true, format: isZTime ? undefined : '{value}', style: { fontSize: '10px', color: '#6B7280' } }
            },
            colorAxis: {
                min: minColor,
                max: maxColor,
                type: (isColorTime ? 'datetime' : 'linear') as any,
                reversed: colorField === 'depth',
                stops: getColorStops(colorPalette as ColorPaletteName),
                labels: { format: isColorTime ? undefined : '{value}' },
                title: { text: colorField.toString() }
            },
            legend: {
                enabled: true,
                align: 'right',
                verticalAlign: 'middle',
                layout: 'vertical'
            },
            tooltip: {
                useHTML: true,
                formatter: function (this: any) {
                    const point = this.point;
                    const custom = point.custom;
                    if (!custom) return '';
                    return `
                        <div style="padding: 4px;">
                            <strong>M${custom.magnitude.toFixed(1)}</strong><br/>
                            Event ID: ${custom.eventID || 'N/A'}<br/>
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
                    turboThreshold: 50000,
                    boostThreshold: HIGHCHARTS_CONFIG.BOOST_THRESHOLD
                },
                scatter3d: {
                    marker: {
                        fillOpacity: 0.7,
                        lineWidth: 0.5,
                        lineColor: 'rgba(255,255,255,0.3)'
                    }
                }
            },
            series: [{
                type: 'scatter3d',
                name: 'Earthquakes',
                data: data,
                colorKey: 'colorValue'
            }],
            accessibility: {
                enabled: true,
                description: '3D visualization of earthquake distribution.'
            }
        };
    }, [earthquakes, xAxisField, yAxisField, zAxisField, colorField, fullDataForExport, colorPalette]);
    // Dependencies updated

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
                    key={`3d-${earthquakes.length}`}
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
                    <li><strong>Color:</strong> {colorPalette.charAt(0).toUpperCase() + colorPalette.slice(1)} color scale represents {colorField ? colorField.toString() : 'value'}</li>
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
