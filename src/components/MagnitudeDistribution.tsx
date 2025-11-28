'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, memo } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';

interface MagnitudeDistributionProps {
    earthquakes: EarthquakeData[];
}

const MagnitudeDistribution = memo(function MagnitudeDistribution({ earthquakes }: MagnitudeDistributionProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);

    const chartOptions: Highcharts.Options = useMemo(() => {
        // Validate data before processing
        if (!earthquakes || earthquakes.length === 0) {
            return {
                chart: { type: 'column', height: 350 },
                title: { text: '' },
                credits: { enabled: false },
                series: []
            };
        }

        const magnitudes = earthquakes.map(eq => eq.magnitude).filter(m => typeof m === 'number' && !isNaN(m));

        // Calculate histogram bins manually
        // CRITICAL FIX: Don't use spread operator with large arrays (causes stack overflow)
        // Use reduce with first element as initial value to avoid Infinity
        const min = magnitudes.length > 0 ? magnitudes.reduce((min, m) => Math.min(min, m), magnitudes[0]) : 0;
        const max = magnitudes.length > 0 ? magnitudes.reduce((max, m) => Math.max(max, m), magnitudes[0]) : 10;
        const binCount = 30;
        const binWidth = (max - min) / binCount;

        const bins: number[] = new Array(binCount).fill(0);
        const binLabels: string[] = [];

        for (let i = 0; i < binCount; i++) {
            const binStart = min + i * binWidth;
            const binEnd = binStart + binWidth;
            binLabels.push(`${binStart.toFixed(1)}-${binEnd.toFixed(1)}`);

            // Count magnitudes in this bin
            bins[i] = magnitudes.filter(m => m >= binStart && m < binEnd).length;
        }

        // Last bin should include the max value
        bins[binCount - 1] = magnitudes.filter(m => m >= min + (binCount - 1) * binWidth).length;

        return {
            chart: {
                type: 'column',
                height: 350
            },
            title: {
                text: ''
            },
            credits: {
                enabled: false
            },
            xAxis: {
                categories: binLabels,
                title: {
                    text: 'Magnitude'
                },
                labels: {
                    rotation: -45,
                    step: Math.ceil(binCount / 10) // Show every nth label
                }
            },
            yAxis: {
                title: {
                    text: 'Frequency'
                }
            },
            legend: {
                enabled: false
            },
            tooltip: {
                headerFormat: '<b>Magnitude {point.category}</b><br/>',
                pointFormat: 'Count: {point.y}'
            },
            plotOptions: {
                column: {
                    pointPadding: 0,
                    borderWidth: 1,
                    borderColor: 'white',
                    groupPadding: 0,
                    shadow: false,
                    color: 'steelblue'
                }
            },
            series: [{
                type: 'column',
                name: 'Magnitude Distribution',
                data: bins
            }],
            accessibility: {
                enabled: true,
                description: 'Histogram showing the distribution of earthquake magnitudes'
            }
        };
    }, [earthquakes]);

    if (earthquakes.length === 0) {
        return (
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Magnitude Distribution</h3>
                <p className="text-gray-500">No data available</p>
            </div>
        );
    }

    // Calculate statistics
    const magnitudes = earthquakes.map(eq => eq.magnitude);
    const mean = magnitudes.reduce((sum, m) => sum + m, 0) / magnitudes.length;
    const sorted = [...magnitudes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    // CRITICAL FIX: Don't use spread operator with large arrays (causes stack overflow)
    // Use reduce with first element as initial value to avoid Infinity
    const min = magnitudes.length > 0 ? magnitudes.reduce((min, m) => Math.min(min, m), magnitudes[0]) : 0;
    const max = magnitudes.length > 0 ? magnitudes.reduce((max, m) => Math.max(max, m), magnitudes[0]) : 10;

    return (
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Magnitude Distribution</h3>

            <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="bg-blue-50 p-2 rounded text-center">
                    <p className="text-xs text-gray-600">Mean</p>
                    <p className="text-lg font-bold text-blue-700">{mean.toFixed(2)}</p>
                </div>
                <div className="bg-green-50 p-2 rounded text-center">
                    <p className="text-xs text-gray-600">Median</p>
                    <p className="text-lg font-bold text-green-700">{median.toFixed(2)}</p>
                </div>
                <div className="bg-purple-50 p-2 rounded text-center">
                    <p className="text-xs text-gray-600">Min</p>
                    <p className="text-lg font-bold text-purple-700">{min.toFixed(2)}</p>
                </div>
                <div className="bg-orange-50 p-2 rounded text-center">
                    <p className="text-xs text-gray-600">Max</p>
                    <p className="text-lg font-bold text-orange-700">{max.toFixed(2)}</p>
                </div>
            </div>

            <div className="h-[350px]">
                <HighchartsReact
                    highcharts={Highcharts}
                    options={chartOptions}
                    ref={chartRef}
                />
            </div>
            <ChartExportButtons
                chartRef={chartRef}
                data={earthquakes}
                filename="magnitude-distribution"
            />
        </div>
    );
});

// Export memoized version to prevent unnecessary re-renders
export default MagnitudeDistribution;
