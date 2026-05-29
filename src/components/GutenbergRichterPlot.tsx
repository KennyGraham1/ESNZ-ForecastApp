'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, memo, useEffect, useState } from 'react';
import { GutenbergRichterResult, calculateGutenbergRichter } from '@/lib/analysis/gutenbergRichter';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';
import { HIGHCHARTS_CONFIG } from '@/config/performance';
import { registerChart, unregisterChart } from '@/utils/chartRegistry';

interface GutenbergRichterPlotProps {
    earthquakes: EarthquakeData[];
    binWidth?: number;
    completenessMethod?: 'maximum_curvature' | 'goodness_of_fit';
    analysisType?: 'cumulative' | 'interval';
    magnitudeCompleteness?: number;
    onCalculationComplete?: (result: GutenbergRichterResult | null) => void;
}

const GutenbergRichterPlot = memo(function GutenbergRichterPlot({
    earthquakes,
    binWidth = 0.1,
    completenessMethod = 'maximum_curvature',
    analysisType = 'cumulative',
    magnitudeCompleteness,
    onCalculationComplete
}: GutenbergRichterPlotProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);

    // Interactive controls (seeded from props). Let the user switch the Mc method
    // and bin width directly in the panel rather than relying on fixed defaults.
    const [method, setMethod] = useState<'maximum_curvature' | 'goodness_of_fit'>(completenessMethod);
    const [bw, setBw] = useState<number>(binWidth);

    // Memoize expensive G-R calculation
    const result = useMemo(() => {
        return calculateGutenbergRichter(earthquakes, { binWidth: bw, completenessMethod: method, magnitudeCompleteness });
    }, [earthquakes, bw, method, magnitudeCompleteness]);

    useEffect(() => {
        if (onCalculationComplete) {
            onCalculationComplete(result);
        }
    }, [result, onCalculationComplete]);

    // Register chart for PDF export
    // Use callback in HighchartsReact for registration to ensure chart is ready
    useEffect(() => {
        return () => unregisterChart('gr-plot');
    }, []);

    const chartOptions: Highcharts.Options = useMemo(() => {
        // Validate data before processing
        if (!result || !result.binCenters || result.binCenters.length === 0) {
            return {
                chart: { type: 'scatter', zooming: { type: 'xy' }, height: 400 },
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
                chart: { type: 'scatter', zooming: { type: 'xy' }, height: 400 },
                title: { text: '' },
                credits: { enabled: false },
                exporting: { enabled: false },
                series: []
            };
        }

        const observedData = binCenters.map((m, i) => ({ magnitude: m, count: cumulativeCounts[i] }));
        const fittedLineData = binCenters.map((m, i) => ({ magnitude: m, count: fittedLine[i] }));
        // Incremental (non-cumulative) FMD per bin, derived from the cumulative
        // N(≥M): inc[i] = N(≥M_i) − N(≥M_{i+1}). This is the distribution whose peak
        // the maximum-curvature Mc estimator picks out.
        const incrementalData: [number, number][] = binCenters
            .map((m, i): [number, number] => [m, cumulativeCounts[i] - (cumulativeCounts[i + 1] ?? 0)])
            .filter(([, c]) => c > 0);

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
                    type: 'scatter',
                    name: 'Incremental (per bin)',
                    data: incrementalData,
                    color: 'rgba(148, 163, 184, 0.9)',
                    marker: {
                        symbol: 'diamond',
                        radius: 3,
                        fillColor: 'rgba(148, 163, 184, 0.9)',
                        lineWidth: 0
                    },
                    tooltip: {
                        pointFormat: 'Per-bin count: {point.y}'
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

    const { bValue, bUncertainty, aValue, magnitudeOfCompleteness, rSquared, earthquakesAboveMc } = result;

    return (
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Gutenberg-Richter Analysis</h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-blue-50 p-3 rounded">
                    <p className="text-sm text-gray-600">b-value (Aki MLE)</p>
                    <p className="text-xl font-bold text-blue-700">
                        {bValue.toFixed(2)}
                        {Number.isFinite(bUncertainty) && (
                            <span className="text-sm font-normal text-blue-500"> ± {bUncertainty.toFixed(2)}</span>
                        )}
                    </p>
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

            <div className="flex flex-wrap items-end gap-4 mb-4">
                <div className="flex flex-col">
                    <label className="text-xs font-medium text-gray-500 mb-1">Mc method</label>
                    <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value as 'maximum_curvature' | 'goodness_of_fit')}
                        className="rounded-md border border-gray-300 bg-white p-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                        <option value="maximum_curvature">Maximum Curvature</option>
                        <option value="goodness_of_fit">Goodness of Fit (KSTOTAL)</option>
                    </select>
                </div>
                <div className="flex flex-col">
                    <label className="text-xs font-medium text-gray-500 mb-1">Bin width: <span className="font-semibold">{bw.toFixed(2)}</span></label>
                    <input
                        type="range"
                        min={0.05}
                        max={0.5}
                        step={0.05}
                        value={bw}
                        onChange={(e) => setBw(parseFloat(e.target.value))}
                        className="w-40 accent-indigo-600"
                        title="Magnitude bin width for the frequency-magnitude distribution"
                    />
                </div>
            </div>

            <div className="h-[500px] w-full">
                <HighchartsReact
                    highcharts={Highcharts}
                    options={chartOptions}
                    ref={chartRef}
                    callback={(chart: Highcharts.Chart) => {
                        registerChart('gr-plot', chart);
                    }}
                />
            </div>

            <div className="mt-4 text-sm text-gray-600">
                <p><strong>Gutenberg-Richter Law:</strong> log₁₀(N) = {aValue.toFixed(2)} - {bValue.toFixed(2)} × M</p>
                <p className="mt-1"><strong>Method:</strong> {method === 'maximum_curvature' ? 'Maximum Curvature' : 'Goodness of Fit'} · <strong>Bin:</strong> {bw.toFixed(2)}</p>
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
