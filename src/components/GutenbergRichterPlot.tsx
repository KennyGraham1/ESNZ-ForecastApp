'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, memo } from 'react';
import { GutenbergRichterResult, calculateGutenbergRichter } from '@/lib/analysis/gutenbergRichter';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';
import { HIGHCHARTS_CONFIG } from '@/config/performance';

interface GutenbergRichterPlotProps {
    earthquakes: EarthquakeData[];
    binWidth?: number;
    completenessMethod?: 'maximum_curvature' | 'goodness_of_fit';
    analysisType?: 'cumulative' | 'interval';
    magnitudeCompleteness?: number;
}

const GutenbergRichterPlot = memo(function GutenbergRichterPlot({
    earthquakes,
    binWidth = 0.1,
    completenessMethod = 'maximum_curvature',
    analysisType = 'cumulative',
    magnitudeCompleteness
}: GutenbergRichterPlotProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);

    // Memoize expensive G-R calculation
    const result = useMemo(() => {
        return calculateGutenbergRichter(earthquakes, { binWidth, completenessMethod });
    }, [earthquakes, binWidth, completenessMethod]);

    const chartOptions: Highcharts.Options = useMemo(() => {
        // Validate data before processing
        if (!result || !result.binCenters || result.binCenters.length === 0) {
            return {
                chart: { type: 'scatter', zoomType: 'xy', height: 400 },
                title: { text: '' },
                credits: { enabled: false },
                exporting: { enabled: false }, // Disable built-in export menu
                series: []
            };
        }

        const { bValue, aValue, magnitudeOfCompleteness, rSquared, earthquakesAboveMc, binCenters, cumulativeCounts, fittedLine } = result;

        // Additional validation for arrays and matching lengths
        if (!Array.isArray(binCenters) || !Array.isArray(cumulativeCounts) || !Array.isArray(fittedLine)) {
            return {
                chart: { type: 'scatter', zoomType: 'xy', height: 400 },
                title: { text: '' },
                credits: { enabled: false },
                exporting: { enabled: false },
                series: []
            };
        }

        const observedData = binCenters.map((m, i) => ({ magnitude: m, count: cumulativeCounts[i] }));
        const fittedLineData = binCenters.map((m, i) => ({ magnitude: m, count: fittedLine[i] }));

        return {
            chart: {
                type: 'scatter',
                backgroundColor: '#FFFFFF',
                height: 500,
                style: {
                    fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                }
            },
            title: { text: '' },
            subtitle: { text: '' },
            credits: { enabled: false },
            xAxis: {
                title: {
                    text: 'Magnitude (M)',
                    style: { fontSize: '12px', fontWeight: '600', color: '#374151' }
                },
                gridLineWidth: 1,
                gridLineColor: '#F3F4F6',
                lineColor: '#D1D5DB',
                lineWidth: 1,
                tickColor: '#D1D5DB',
                tickWidth: 1,
                labels: { style: { fontSize: '11px', color: '#6B7280' } },
                plotLines: [{
                    color: 'green',
                    width: 2,
                    value: magnitudeOfCompleteness,
                    dashStyle: 'Dot',
                    label: {
                        text: `Mc = ${magnitudeOfCompleteness.toFixed(1)}`,
                        align: 'right',
                        style: {
                            color: 'green'
                        }
                    },
                    zIndex: 5
                }]
            },
            yAxis: {
                title: {
                    text: analysisType === 'cumulative' ? 'Cumulative Count (N ≥ M)' : 'Count (N)',
                    style: { fontSize: '12px', fontWeight: '600', color: '#374151' }
                },
                type: 'logarithmic',
                gridLineWidth: 1,
                gridLineColor: '#F3F4F6',
                lineColor: '#D1D5DB',
                lineWidth: 1,
                tickColor: '#D1D5DB',
                tickWidth: 1,
                labels: { style: { fontSize: '11px', color: '#6B7280' } }
            },
            legend: {
                enabled: true,
                align: 'center',
                verticalAlign: 'bottom',
                layout: 'horizontal',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderColor: '#CCC',
                borderWidth: 1,
                itemStyle: { fontSize: '11px', fontWeight: 'normal', color: '#333' }
            },
            tooltip: {
                shared: false,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderColor: '#999',
                borderWidth: 1,
                style: { fontSize: '11px' },
                headerFormat: '<b>Magnitude {point.x}</b><br/>',
                formatter: function (this: any) {
                    return `<b>${this.series.name}</b><br/>Magnitude: ${this.x?.toFixed(2)}<br/>Count: ${this.y?.toFixed(0)}`;
                }
            },
            boost: {
                useGPUTranslations: true,
                usePreallocated: true
            },
            plotOptions: {
                series: {
                    turboThreshold: 50000,
                    boostThreshold: HIGHCHARTS_CONFIG.BOOST_THRESHOLD // Use centralized boost threshold
                }
            },
            series: [
                {
                    type: 'scatter',
                    name: 'Observed Data',
                    data: observedData.map(d => [d.magnitude, d.count]).filter((point): point is [number, number] => point[1] > 0), // Filter out zero counts for log scale
                    color: 'steelblue',
                    marker: {
                        symbol: 'circle',
                        radius: 3,
                        fillColor: 'steelblue',
                        lineWidth: 0
                    },
                    tooltip: {
                        pointFormat: 'Count: {point.y}'
                    },
                    zIndex: 1
                },
                {
                    type: 'line',
                    name: `G-R Fit (b=${bValue.toFixed(2)})`,
                    data: fittedLineData.map(d => [d.magnitude, d.count]),
                    color: 'red',
                    lineWidth: 2.5,
                    dashStyle: 'Solid',
                    marker: { enabled: false },
                    enableMouseTracking: true,
                    tooltip: {
                        pointFormat: 'Fit: {point.y:.1f}'
                    },
                    zIndex: 2
                }
            ],
            accessibility: {
                enabled: true,
                description: 'Gutenberg-Richter plot showing observed vs fitted earthquake frequency-magnitude distribution'
            }
        };
    }, [result, analysisType]);

    if (!result) {
        return (
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Gutenberg-Richter Analysis</h3>
                <p className="text-gray-500">Insufficient data for analysis</p>
            </div>
        );
    }

    const { bValue, aValue, magnitudeOfCompleteness, rSquared, earthquakesAboveMc } = result;

    return (
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Gutenberg-Richter Analysis</h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-blue-50 p-3 rounded">
                    <p className="text-sm text-gray-600">b-value</p>
                    <p className="text-xl font-bold text-blue-700">{bValue.toFixed(2)}</p>
                </div>
                <div className="bg-green-50 p-3 rounded">
                    <p className="text-sm text-gray-600">Mc</p>
                    <p className="text-xl font-bold text-green-700">{magnitudeOfCompleteness.toFixed(1)}</p>
                </div>
                <div className="bg-purple-50 p-3 rounded">
                    <p className="text-sm text-gray-600">R²</p>
                    <p className="text-xl font-bold text-purple-700">{rSquared.toFixed(3)}</p>
                </div>
                <div className="bg-orange-50 p-3 rounded">
                    <p className="text-sm text-gray-600">Events ≥ Mc</p>
                    <p className="text-xl font-bold text-orange-700">{earthquakesAboveMc}</p>
                </div>
            </div>

            <div className="h-[500px] w-full">
                <HighchartsReact
                    highcharts={Highcharts}
                    options={chartOptions}
                    ref={chartRef}
                />
            </div>

            <div className="mt-4 text-sm text-gray-600">
                <p><strong>Gutenberg-Richter Law:</strong> log₁₀(N) = {aValue.toFixed(2)} - {bValue.toFixed(2)} × M</p>
                <p className="mt-1"><strong>Method:</strong> {completenessMethod === 'maximum_curvature' ? 'Maximum Curvature' : 'Goodness of Fit'}</p>
            </div>

            <ChartExportButtons
                chartRef={chartRef}
                data={earthquakes}
                filename="gutenberg-richter"
            />
        </div>
    );
});

// Export memoized version to prevent unnecessary re-renders
export default GutenbergRichterPlot;
