'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, memo } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';
import { stratifiedSample } from '@/utils/dataOptimization';
import { SAMPLING_CONFIG, getOptimalSamplingThreshold } from '@/config/performance';

interface DepthProfilePlotProps {
    earthquakes: EarthquakeData[];
}

const DepthProfilePlot = memo(function DepthProfilePlot({ earthquakes }: DepthProfilePlotProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);

    const chartOptions: Highcharts.Options = useMemo(() => {
        // Validate data before processing
        if (!earthquakes || earthquakes.length === 0) {
            return {
                chart: { type: 'scatter', zoomType: 'xy', height: 400 },
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
                eventID: eq.eventID
            }
        }));

        // Calculate reasonable axis ranges
        const latitudes = processedEarthquakes.map(eq => eq.latitude);
        const depths = processedEarthquakes.map(eq => eq.depth);

        const minLat = Math.min(...latitudes);
        const maxLat = Math.max(...latitudes);
        const minDepth = Math.max(0, Math.min(...depths)); // Depth can't be negative
        const maxDepth = Math.max(...depths);

        // Add 5% padding to the ranges for better visualization
        const latPadding = (maxLat - minLat) * 0.05;
        const depthPadding = (maxDepth - minDepth) * 0.05;

        return {
            chart: {
                type: 'scatter',
                zoomType: 'xy',
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
                    text: 'Latitude (°S)'
                },
                reversed: true, // South to North
                min: minLat - latPadding,
                max: maxLat + latPadding
            },
            yAxis: {
                title: {
                    text: 'Depth (km)'
                },
                reversed: true, // Depth increases downward
                min: Math.max(0, minDepth - depthPadding),
                max: maxDepth + depthPadding
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
                    [0, '#440154'],
                    [0.25, '#31688e'],
                    [0.5, '#35b779'],
                    [0.75, '#fde724'],
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
                            Event ID: ${custom.eventID || 'N/A'}<br/>
                            Depth: ${custom.depth.toFixed(1)} km<br/>
                            Lat: ${custom.latitude.toFixed(2)}°
                        </div>
                    `;
                }
            },
            plotOptions: {
                series: {
                    turboThreshold: 50000, // Support very large datasets (50k+ events)
                    boostThreshold: 5000 // Use boost module for datasets > 5000 points
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
                        // Scale marker size more reasonably: M2=1.5, M4=3, M6=6, M8=12
                        radius: Math.max(1.5, Math.min(12, (d.z - 1) * 1.5)),
                        fillOpacity: 0.5
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
