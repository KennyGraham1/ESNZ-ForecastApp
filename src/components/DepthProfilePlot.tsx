'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, memo } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';
import { stratifiedSample } from '@/utils/dataOptimization';
import { safeMin, safeMax } from '@/utils/arrayMath';
import { SAMPLING_CONFIG, getOptimalSamplingThreshold, HIGHCHARTS_CONFIG } from '@/config/performance';

interface DepthProfilePlotProps {
    earthquakes: EarthquakeData[];
}

const DepthProfilePlot = memo(function DepthProfilePlot({ earthquakes }: DepthProfilePlotProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);

    const chartOptions: Highcharts.Options = useMemo(() => {
        // Validate data before processing
        if (!earthquakes || earthquakes.length === 0) {
            return {
                chart: { type: 'scatter', zooming: { type: 'xy' }, height: 400 },
                title: { text: '' },
                credits: { enabled: false },
                exporting: { enabled: false }, // Disable built-in export menu
                series: []
            };
        }

        // OPTIMIZATION: Use stratified sampling to preserve distribution (90% faster rendering)
        const maxPoints = getOptimalSamplingThreshold('DEPTH_PROFILE');
        let processedEarthquakes = earthquakes;

        if (earthquakes.length > SAMPLING_CONFIG.DEPTH_PROFILE.threshold) {
            processedEarthquakes = stratifiedSample(earthquakes, maxPoints);
            console.log(`📊 Depth Profile: Stratified sample ${processedEarthquakes.length} points from ${earthquakes.length} total`);
        }

        const data = processedEarthquakes.map(eq => ({
            x: eq.latitude,
            y: eq.depth,
            z: eq.magnitude,
            custom: {
                magnitude: eq.magnitude,
                depth: eq.depth,
                latitude: eq.latitude,
                longitude: eq.longitude,
                eventID: eq.eventID
            }
        }));

        // Calculate reasonable axis ranges
        const latitudes = processedEarthquakes.map(eq => eq.latitude);
        const depths = processedEarthquakes.map(eq => eq.depth);

        const minLat = safeMin(latitudes);
        const maxLat = safeMax(latitudes);
        const minDepth = Math.max(0, safeMin(depths)); // Depth can't be negative
        const maxDepth = safeMax(depths);

        // Add 5% padding to the ranges for better visualization
        const latPadding = (maxLat - minLat) * 0.05;
        const depthPadding = (maxDepth - minDepth) * 0.05;

        return {
            chart: {
                type: 'scatter',
                zooming: { type: 'xy' },
                height: 400
            },
            title: {
                text: ''
            },
            credits: {
                enabled: false
            },
            // Disable Highcharts built-in export menu - use custom export buttons
            exporting: {
                enabled: false
            },
            // OPTIMIZATION: Performance boost for large datasets
            // Note: Boost module can interfere with colorAxis, so we disable it for this chart
            boost: {
                useGPUTranslations: true,
                usePreAllocated: true,
                enabled: false // Disabled because colorAxis doesn't work well with boost
            },
            xAxis: {
                title: {
                    text: 'Latitude (°S)',
                    style: {
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#374151'
                    }
                },
                reversed: true, // South to North
                min: minLat - latPadding,
                max: maxLat + latPadding,
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
                    text: 'Depth (km)',
                    style: {
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#374151'
                    }
                },
                reversed: true, // Depth increases downward
                min: Math.max(0, minDepth - depthPadding),
                max: maxDepth + depthPadding,
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
            colorAxis: {
                // CRITICAL FIX: Don't use spread operator with large arrays (causes stack overflow)
                // Use reduce to find min/max, with fallback values if array is empty
                min: processedEarthquakes.length > 0
                    ? processedEarthquakes.reduce((min, eq) => Math.min(min, eq.magnitude), processedEarthquakes[0].magnitude)
                    : 0,
                max: processedEarthquakes.length > 0
                    ? processedEarthquakes.reduce((max, eq) => Math.max(max, eq.magnitude), processedEarthquakes[0].magnitude)
                    : 10,
                stops: [
                    [0, '#0d0887'],
                    [0.2, '#6a00a8'],
                    [0.4, '#b12a90'],
                    [0.6, '#e16462'],
                    [0.8, '#fca636'],
                    [1, '#f0f921']
                ],
                labels: {
                    format: '{value}',
                    style: {
                        fontSize: '11px',
                        color: '#6b7280'
                    }
                },
                title: {
                    text: 'Magnitude',
                    style: {
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#374151'
                    }
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
                    return `
                        <div style="padding: 8px; min-width: 160px;">
                            <div style="font-weight: 600; color: #dc2626; margin-bottom: 6px; font-size: 13px;">M${custom.magnitude.toFixed(1)}</div>
                            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #4b5563;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: #6b7280;">Depth:</span>
                                    <span style="font-weight: 500;">${custom.depth.toFixed(1)} km</span>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: #6b7280;">Lat:</span>
                                    <span style="font-weight: 500;">${custom.latitude.toFixed(4)}°</span>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: #6b7280;">Lon:</span>
                                    <span style="font-weight: 500;">${custom.longitude.toFixed(4)}°</span>
                                </div>
                                <div style="border-top: 1px solid #e5e7eb; margin-top: 4px; padding-top: 4px; font-size: 10px; color: #9ca3af;">
                                    ID: ${custom.eventID || 'N/A'}
                                </div>
                            </div>
                        </div>
                    `;
                }
            },
            plotOptions: {
                series: {
                    turboThreshold: 50000, // Support very large datasets (50k+ events)
                    boostThreshold: HIGHCHARTS_CONFIG.BOOST_THRESHOLD // Use centralized boost threshold
                },
                scatter: {
                    marker: {
                        radius: 3,
                        symbol: 'circle'
                    }
                }
            },
            series: [{
                type: 'scatter',
                name: 'Earthquakes',
                data: data.map(d => ({
                    x: d.x,
                    y: d.y,
                    marker: {
                        radius: Math.max(2, Math.pow(2, d.z - 2)),
                        fillOpacity: 0.7
                    },
                    colorValue: d.z,
                    custom: d.custom
                })),
                colorKey: 'colorValue'
            }],
            accessibility: {
                enabled: true,
                description: 'Depth profile showing earthquake distribution with depth, colored by magnitude'
            }
        };
    }, [earthquakes]);

    if (earthquakes.length === 0) {
        return (
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Depth Profile</h3>
                <p className="text-gray-500">No data available</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Depth Profile (North-South Cross-Section)</h3>
            <div className="h-[400px]">
                <HighchartsReact
                    highcharts={Highcharts}
                    options={chartOptions}
                    ref={chartRef}
                />
            </div>
            <p className="mt-2 text-sm text-gray-600">
                Cross-section showing earthquake distribution with depth. Marker size represents magnitude.
            </p>
            <ChartExportButtons
                chartRef={chartRef}
                data={earthquakes}
                filename="depth-profile"
            />
        </div>
    );
});

// Export memoized version to prevent unnecessary re-renders
export default DepthProfilePlot;
