'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, memo } from 'react';
import { calculateGutenbergRichter } from '@/lib/analysis/gutenbergRichter';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';

interface GutenbergRichterPlotProps {
    earthquakes: EarthquakeData[];
    binWidth?: number;
    completenessMethod?: 'maximum_curvature' | 'goodness_of_fit';
}

const GutenbergRichterPlot = memo(function GutenbergRichterPlot({
    earthquakes,
    binWidth = 0.1,
    completenessMethod = 'maximum_curvature'
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
                series: []
            };
        }

        const { bValue, aValue, magnitudeOfCompleteness, rSquared, earthquakesAboveMc, binCenters, cumulativeCounts, fittedLine } = result;

        const minY = Math.min(...cumulativeCounts.filter(c => c > 0));
        const maxY = Math.max(...cumulativeCounts);

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
            xAxis: {
                title: {
                    text: 'Magnitude'
                },
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
                type: 'logarithmic',
                title: {
                    text: 'Cumulative Number'
                }
            },
            legend: {
                enabled: true
            },
            tooltip: {
                shared: false,
                formatter: function(this: any) {
                    return `<b>${this.series.name}</b><br/>Magnitude: ${this.x?.toFixed(2)}<br/>Count: ${this.y?.toFixed(0)}`;
                }
            },
            plotOptions: {
                scatter: {
                    marker: {
                        radius: 4
                    }
                },
                line: {
                    marker: {
                        enabled: false
                    }
                }
            },
            series: [
                {
                    type: 'scatter',
                    name: 'Observed',
                    data: binCenters.map((x, i) => [x, cumulativeCounts[i]]),
                    color: 'steelblue',
                    marker: {
                        radius: 6
                    }
                },
                {
                    type: 'line',
                    name: 'Fitted (G-R Law)',
                    data: binCenters.map((x, i) => [x, fittedLine[i]]),
                    color: 'red',
                    dashStyle: 'Dash',
                    lineWidth: 2
                }
            ],
            accessibility: {
                enabled: true,
                description: 'Gutenberg-Richter plot showing observed vs fitted earthquake frequency-magnitude distribution'
            }
        };
    }, [result]);

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

            <div className="h-[400px] w-full">
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
