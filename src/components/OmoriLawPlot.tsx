'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, useState, memo } from 'react';
import { MainEventInfo, calculateOmoriParameters, OptimizationMethod } from '@/lib/analysis/omori';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';

interface OmoriLawPlotProps {
    earthquakes: EarthquakeData[];
    mainEvent: MainEventInfo;
}

const OmoriLawPlot = memo(function OmoriLawPlot({ earthquakes, mainEvent }: OmoriLawPlotProps) {
    const chartRef1 = useRef<HighchartsReact.RefObject>(null);
    const chartRef2 = useRef<HighchartsReact.RefObject>(null);
    const [activeTab, setActiveTab] = useState<'fit' | 'residuals' | 'stats' | 'uncertainty'>('fit');
    const [optimizationMethod, setOptimizationMethod] = useState<OptimizationMethod>('hybrid');

    const omoriParams = useMemo(() => {
        return calculateOmoriParameters(earthquakes, mainEvent, 365, optimizationMethod);
    }, [earthquakes, mainEvent, optimizationMethod]);

    const dailyRateOptions: Highcharts.Options = useMemo(() => {
        // Validate data before processing
        if (!omoriParams || !omoriParams.dailyCounts || omoriParams.dailyCounts.length === 0) {
            return {
                chart: { type: 'scatter', height: 350 },
                title: { text: '' },
                credits: { enabled: false },
                series: []
            };
        }

        const { dailyCounts, fittedCounts } = omoriParams;

        return {
            chart: {
                type: 'scatter',
                height: 380,
                backgroundColor: '#FFFFFF',
                style: {
                    fontFamily: '"DejaVu Sans", Arial, sans-serif'
                }
            },
            title: {
                text: 'Daily aftershock rate (log-log scale)',
                style: {
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#333'
                }
            },
            credits: {
                enabled: false
            },
            xAxis: {
                type: 'logarithmic',
                title: {
                    text: 'Days since mainshock',
                    style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                },
                gridLineWidth: 1,
                gridLineColor: '#E0E0E0',
                lineColor: '#000',
                lineWidth: 1.5,
                tickColor: '#000',
                tickWidth: 1.5,
                labels: { style: { fontSize: '11px', color: '#333' } }
            },
            yAxis: {
                type: 'logarithmic',
                title: {
                    text: 'Aftershocks per day',
                    style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                },
                gridLineWidth: 1,
                gridLineColor: '#E0E0E0',
                lineColor: '#000',
                lineWidth: 1.5,
                tickColor: '#000',
                tickWidth: 1.5,
                labels: { style: { fontSize: '11px', color: '#333' } }
            },
            legend: {
                enabled: true,
                align: 'right',
                verticalAlign: 'top',
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
                style: { fontSize: '11px' }
            },
            series: [
                {
                    type: 'scatter',
                    name: 'Observed',
                    data: dailyCounts.map(d => [d.day, d.count]),
                    color: '#4682B4', // Steel blue
                    marker: {
                        symbol: 'circle',
                        radius: 3,
                        fillColor: '#4682B4',
                        lineWidth: 0
                    }
                },
                {
                    type: 'line',
                    name: 'Omori-Utsu Fit',
                    data: fittedCounts.map(d => [d.day, d.count]),
                    color: '#DC143C', // Crimson red
                    lineWidth: 2.5,
                    marker: {
                        enabled: false
                    }
                }
            ],
            accessibility: {
                enabled: true,
                description: 'Log-log plot of daily aftershock rate with Omori-Utsu law fit'
            }
        };
    }, [omoriParams]);

    // -------------------------
    // Chart 2: Cumulative Counts - Observed vs Expected (Q-Q style) - Matplotlib-style
    // -------------------------
    const cumulativeOptions: Highcharts.Options = useMemo(() => {
        if (!omoriParams || !omoriParams.cumulativeCounts || omoriParams.cumulativeCounts.length === 0) {
            return {
                chart: { type: 'line', height: 350 },
                title: { text: '' },
                credits: { enabled: false },
                series: []
            };
        }

        const { cumulativeCounts, expectedCumulativeCounts } = omoriParams;

        // Create observed vs expected data points
        const qqData: [number, number][] = [];
        for (let i = 0; i < cumulativeCounts.length; i++) {
            const expected = expectedCumulativeCounts?.[i]?.count ?? 0;
            const observed = cumulativeCounts[i].count;
            qqData.push([expected, observed]);
        }

        // Find max value for 1:1 reference line
        const maxExpected = Math.max(...qqData.map(d => d[0]));
        const maxObserved = Math.max(...qqData.map(d => d[1]));
        const maxVal = Math.max(maxExpected, maxObserved);

        return {
            chart: {
                type: 'line',
                height: 380,
                backgroundColor: '#FFFFFF',
                style: {
                    fontFamily: '"DejaVu Sans", Arial, sans-serif'
                }
            },
            title: {
                text: 'Cumulative counts: Observed vs Expected',
                style: { fontSize: '13px', fontWeight: '600', color: '#333' }
            },
            credits: { enabled: false },
            xAxis: {
                title: {
                    text: 'Expected cumulative count',
                    style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                },
                type: 'linear',
                min: 0,
                gridLineWidth: 1,
                gridLineColor: '#E0E0E0',
                lineColor: '#000',
                lineWidth: 1.5,
                tickColor: '#000',
                tickWidth: 1.5,
                labels: { style: { fontSize: '11px', color: '#333' } }
            },
            yAxis: {
                title: {
                    text: 'Observed cumulative count',
                    style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                },
                type: 'linear',
                min: 0,
                gridLineWidth: 1,
                gridLineColor: '#E0E0E0',
                lineColor: '#000',
                lineWidth: 1.5,
                tickColor: '#000',
                tickWidth: 1.5,
                labels: { style: { fontSize: '11px', color: '#333' } }
            },
            legend: {
                enabled: true,
                align: 'right',
                verticalAlign: 'top',
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
                formatter: function() {
                    return `<b>Expected:</b> ${this.x?.toFixed(1)}<br/><b>Observed:</b> ${this.y?.toFixed(1)}`;
                }
            },
            series: [
                {
                    type: 'line',
                    name: '1:1 Reference',
                    data: [[0, 0], [maxVal, maxVal]],
                    color: '#DC143C', // Crimson red
                    dashStyle: 'Dash',
                    lineWidth: 2,
                    marker: { enabled: false },
                    enableMouseTracking: false,
                    zIndex: 1
                },
                {
                    type: 'line',
                    name: 'Observed vs Expected',
                    data: qqData,
                    color: '#4682B4', // Steel blue
                    lineWidth: 2.5,
                    marker: { enabled: false },
                    zIndex: 2
                }
            ],
            accessibility: {
                enabled: true,
                description: 'Q-Q plot comparing observed vs expected cumulative counts'
            }
        };
    }, [omoriParams]);

    // -------------------------
    // Chart 1: Counts vs OU expected (Bar chart with fitted line overlay)
    // Matches reference: Blue bars for empirical counts, red line for OU fitted
    // -------------------------
    const countsVsExpectedOptions: Highcharts.Options = useMemo(() => {
        if (!omoriParams?.dailyCounts) return {};

        const { dailyCounts, fittedCounts } = omoriParams;

        // Dynamic binning: Target ~40 bars for optimal visibility
        const totalDays = dailyCounts.length;
        const targetBins = 40;
        const binSize = Math.max(1, Math.ceil(totalDays / targetBins));

        let displayDataObserved = [];
        let displayDataExpected = [];

        // Aggregate data into bins
        for (let i = 0; i < totalDays; i += binSize) {
            let obsSum = 0;
            let expSum = 0;
            const startDay = dailyCounts[i].day;

            for (let j = 0; j < binSize && (i + j) < totalDays; j++) {
                obsSum += dailyCounts[i + j].count;
                expSum += fittedCounts[i + j].count;
            }

            displayDataObserved.push([startDay, obsSum]);
            displayDataExpected.push([startDay, expSum]);
        }

        return {
            chart: {
                type: 'column',
                height: 380,
                backgroundColor: '#FFFFFF',
                style: {
                    fontFamily: '"DejaVu Sans", Arial, sans-serif'
                }
            },
            title: {
                text: 'Aftershock counts vs Omori-Utsu expected',
                style: { fontSize: '13px', fontWeight: '600', color: '#333' }
            },
            credits: { enabled: false },
            xAxis: {
                title: {
                    text: 'Time since mainshock (days)',
                    style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                },
                type: 'linear',
                gridLineWidth: 0,
                lineColor: '#000',
                lineWidth: 1.5,
                tickColor: '#000',
                tickWidth: 1.5,
                labels: { style: { fontSize: '11px', color: '#333' } }
            },
            yAxis: {
                title: {
                    text: 'Count per bin',
                    style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                },
                type: 'linear',
                gridLineWidth: 1,
                gridLineColor: '#E0E0E0',
                lineColor: '#000',
                lineWidth: 1.5,
                tickColor: '#000',
                tickWidth: 1.5,
                labels: { style: { fontSize: '11px', color: '#333' } }
            },
            legend: {
                enabled: true,
                align: 'right',
                verticalAlign: 'top',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderColor: '#CCC',
                borderWidth: 1,
                itemStyle: { fontSize: '11px', fontWeight: 'normal', color: '#333' }
            },
            tooltip: {
                shared: true,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderColor: '#999',
                borderWidth: 1,
                style: { fontSize: '11px' },
                valueDecimals: 1
            },
            plotOptions: {
                column: {
                    pointRange: binSize,
                    groupPadding: 0,
                    pointPadding: 0,
                    borderWidth: 0
                }
            },
            series: [
                {
                    type: 'column',
                    name: 'Observed counts',
                    data: displayDataObserved,
                    color: 'rgba(70, 130, 180, 0.75)', // Steel blue with transparency
                    zIndex: 1
                },
                {
                    type: 'line',
                    name: 'Omori-Utsu fit',
                    data: displayDataExpected,
                    color: '#DC143C', // Crimson red
                    lineWidth: 2.5,
                    marker: { enabled: false },
                    zIndex: 2
                }
            ]
        };
    }, [omoriParams]);

    // -------------------------
    // 1. Residual Plots Options - Matplotlib-style
    // -------------------------
    const residualOptions: Highcharts.Options = useMemo(() => {
        if (!omoriParams?.standardizedResiduals) return {};

        const { standardizedResiduals, residualProcess } = omoriParams;

        return {
            chart: {
                height: 450,
                backgroundColor: '#FFFFFF',
                style: {
                    fontFamily: '"DejaVu Sans", Arial, sans-serif'
                }
            },
            title: { text: '' },
            credits: { enabled: false },
            xAxis: [
                {
                    title: {
                        text: 'Time since mainshock (days)',
                        style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                    },
                    gridLineWidth: 0,
                    lineColor: '#000',
                    lineWidth: 1.5,
                    tickColor: '#000',
                    tickWidth: 1.5,
                    labels: { style: { fontSize: '11px', color: '#333' } }
                },
                {
                    title: {
                        text: 'Time since mainshock (days)',
                        style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                    },
                    gridLineWidth: 0,
                    lineColor: '#000',
                    lineWidth: 1.5,
                    tickColor: '#000',
                    tickWidth: 1.5,
                    labels: { style: { fontSize: '11px', color: '#333' } },
                    top: '60%',
                    height: '40%',
                    offset: 0
                }
            ],
            yAxis: [
                {
                    title: {
                        text: 'Standardized residuals',
                        style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                    },
                    height: '55%',
                    gridLineWidth: 1,
                    gridLineColor: '#E0E0E0',
                    lineColor: '#000',
                    lineWidth: 1.5,
                    tickColor: '#000',
                    tickWidth: 1.5,
                    labels: { style: { fontSize: '11px', color: '#333' } },
                    plotLines: [
                        { value: 0, width: 2, color: '#000', zIndex: 5 },
                        { value: 2, width: 1.5, color: '#DC143C', dashStyle: 'Dash', zIndex: 4, label: { text: '+2σ', style: { color: '#DC143C', fontSize: '10px' } } },
                        { value: -2, width: 1.5, color: '#DC143C', dashStyle: 'Dash', zIndex: 4, label: { text: '-2σ', style: { color: '#DC143C', fontSize: '10px' } } }
                    ]
                },
                {
                    title: {
                        text: 'Cumulative residuals',
                        style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                    },
                    top: '60%',
                    height: '40%',
                    offset: 0,
                    gridLineWidth: 1,
                    gridLineColor: '#E0E0E0',
                    lineColor: '#000',
                    lineWidth: 1.5,
                    tickColor: '#000',
                    tickWidth: 1.5,
                    labels: { style: { fontSize: '11px', color: '#333' } },
                    plotLines: [
                        { value: 0, width: 2, color: '#000', zIndex: 5 }
                    ]
                }
            ],
            legend: {
                enabled: true,
                align: 'right',
                verticalAlign: 'top',
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
                style: { fontSize: '11px' }
            },
            series: [
                {
                    type: 'scatter',
                    name: 'Standardized Residuals',
                    data: standardizedResiduals.map(r => [r.day, r.residual]),
                    yAxis: 0,
                    xAxis: 0,
                    color: '#4682B4', // Steel blue - matplotlib default
                    marker: {
                        symbol: 'circle',
                        radius: 3,
                        fillColor: '#4682B4',
                        lineWidth: 0
                    },
                    tooltip: {
                        pointFormat: 'Day: {point.x:.1f}<br/>Residual: {point.y:.2f}'
                    }
                },
                {
                    type: 'line',
                    name: 'Cumulative Residual Process',
                    data: residualProcess.map(r => [r.t, r.residual]),
                    yAxis: 1,
                    xAxis: 1,
                    color: '#D62728', // Matplotlib red
                    lineWidth: 2,
                    marker: { enabled: false },
                    tooltip: {
                        pointFormat: 'Day: {point.x:.1f}<br/>Cumulative: {point.y:.2f}'
                    }
                }
            ]
        };
    }, [omoriParams]);

    // -------------------------
    // 2. Q-Q Plot Options - Matplotlib-style
    // -------------------------
    const qqOptions: Highcharts.Options = useMemo(() => {
        if (!omoriParams?.qqPlotData) return {};
        const { qqPlotData } = omoriParams;

        // Find max value for 1:1 line reference
        const maxVal = Math.max(
            ...qqPlotData.map(d => Math.max(d.x, d.y))
        );

        return {
            chart: {
                type: 'scatter',
                height: 400,
                backgroundColor: '#FFFFFF',
                style: {
                    fontFamily: '"DejaVu Sans", Arial, sans-serif'
                }
            },
            title: { text: '' },
            credits: { enabled: false },
            xAxis: {
                title: {
                    text: 'Theoretical quantiles (Exp(1))',
                    style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                },
                min: 0,
                gridLineWidth: 1,
                gridLineColor: '#E0E0E0',
                lineColor: '#000',
                lineWidth: 1.5,
                tickColor: '#000',
                tickWidth: 1.5,
                labels: { style: { fontSize: '11px', color: '#333' } }
            },
            yAxis: {
                title: {
                    text: 'Transformed inter-event times',
                    style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                },
                min: 0,
                gridLineWidth: 1,
                gridLineColor: '#E0E0E0',
                lineColor: '#000',
                lineWidth: 1.5,
                tickColor: '#000',
                tickWidth: 1.5,
                labels: { style: { fontSize: '11px', color: '#333' } }
            },
            legend: {
                enabled: true,
                align: 'right',
                verticalAlign: 'top',
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
                style: { fontSize: '11px' }
            },
            series: [
                {
                    type: 'line',
                    name: '1:1 Reference Line',
                    data: [[0, 0], [maxVal, maxVal]],
                    color: '#DC143C', // Crimson red for reference line
                    lineWidth: 2,
                    dashStyle: 'Dash',
                    marker: { enabled: false },
                    enableMouseTracking: false,
                    zIndex: 1
                },
                {
                    type: 'scatter',
                    name: 'Sample Quantiles',
                    data: qqPlotData.map(d => [d.x, d.y]),
                    color: '#4682B4', // Steel blue - matplotlib default
                    marker: {
                        symbol: 'circle',
                        radius: 3,
                        fillColor: '#4682B4',
                        lineWidth: 0
                    },
                    zIndex: 2,
                    tooltip: {
                        pointFormat: 'Theoretical: {point.x:.3f}<br/>Observed: {point.y:.3f}'
                    }
                }
            ]
        };
    }, [omoriParams]);

    // -------------------------
    // Chart 3: Profile log-likelihood contour for (p,c) - Matplotlib-style
    // -------------------------
    const likelihoodOptions: Highcharts.Options = useMemo(() => {
        if (!omoriParams?.profileLikelihood) return {};
        const { profileLikelihood } = omoriParams;

        // Finding the max log-likelihood for coloring relative to peak
        const maxLogL = Math.max(...profileLikelihood.map(p => p.logLikelihood));

        // Normalize to peak = 0 (relative log-likelihood)
        const filteredData = profileLikelihood.map(p => ({
            ...p,
            val: p.logLikelihood - maxLogL
        })).filter(p => p.val > -20);

        // Auto-detect axis ranges based on data
        const pValues = profileLikelihood.map(d => d.p);
        const cValues = profileLikelihood.map(d => d.c);
        const pMin = Math.min(...pValues);
        const pMax = Math.max(...pValues);
        const cMin = Math.min(...cValues);
        const cMax = Math.max(...cValues);

        return {
            chart: {
                type: 'scatter',
                height: 450,
                backgroundColor: '#FFFFFF',
                style: {
                    fontFamily: '"DejaVu Sans", Arial, sans-serif'
                }
            },
            title: {
                text: 'Profile log-likelihood surface',
                style: { fontSize: '13px', fontWeight: '600', color: '#333' }
            },
            credits: { enabled: false },
            xAxis: {
                title: {
                    text: 'p (decay exponent)',
                    style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                },
                min: pMin,
                max: pMax,
                gridLineWidth: 1,
                gridLineColor: '#E0E0E0',
                lineColor: '#000',
                lineWidth: 1.5,
                tickColor: '#000',
                tickWidth: 1.5,
                labels: { style: { fontSize: '11px', color: '#333' } }
            },
            yAxis: {
                title: {
                    text: 'c (time offset, days)',
                    style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                },
                min: cMin,
                max: cMax,
                gridLineWidth: 1,
                gridLineColor: '#E0E0E0',
                lineColor: '#000',
                lineWidth: 1.5,
                tickColor: '#000',
                tickWidth: 1.5,
                labels: { style: { fontSize: '11px', color: '#333' } }
            },
            colorAxis: {
                min: -10,
                max: 0,
                stops: [
                    [0, '#0C0887'],    // Viridis: dark blue (lowest)
                    [0.2, '#5302A3'],  // Viridis: purple
                    [0.4, '#8B0AA5'],  // Viridis: magenta
                    [0.6, '#B83289'],  // Viridis: pink
                    [0.8, '#DB5C68'],  // Viridis: salmon
                    [1, '#FCA636']     // Viridis: yellow (highest/MLE)
                ],
                labels: {
                    format: '{value:.1f}',
                    style: { fontSize: '11px', color: '#333' }
                },
                gridLineWidth: 0
            },
            legend: {
                enabled: true,
                align: 'right',
                verticalAlign: 'middle',
                layout: 'vertical',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderColor: '#CCC',
                borderWidth: 1,
                itemStyle: { fontSize: '11px', fontWeight: 'normal', color: '#333' },
                title: {
                    text: 'Δ log L',
                    style: { fontSize: '11px', fontWeight: '500', color: '#333' }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderColor: '#999',
                borderWidth: 1,
                style: { fontSize: '11px' },
                pointFormat: '<b>p:</b> {point.x:.2f}<br/><b>c:</b> {point.y:.3f}<br/><b>Δ log L:</b> {point.v:.2f}'
            },
            series: [
                {
                    type: 'scatter',
                    name: 'Log-likelihood Surface',
                    data: filteredData.map(d => ({ x: d.p, y: d.c, v: d.val, colorValue: d.val })),
                    // @ts-ignore - ColorAxis is supported but types might be strict
                    colorKey: 'colorValue',
                    marker: {
                        symbol: 'square',
                        radius: 6,
                        lineWidth: 0
                    },
                    showInLegend: false
                },
                {
                    type: 'scatter',
                    name: `MLE: p=${omoriParams.p.toFixed(3)}, c=${omoriParams.c.toFixed(4)}`,
                    data: [{ x: omoriParams.p, y: omoriParams.c }],
                    color: '#FFFFFF',
                    marker: {
                        symbol: 'circle',
                        radius: 6,
                        lineWidth: 2.5,
                        lineColor: '#000000',
                        fillColor: '#FFFFFF'
                    },
                    zIndex: 10,
                    tooltip: {
                        pointFormat: '<b>MLE Point</b><br/><b>p:</b> {point.x:.3f}<br/><b>c:</b> {point.y:.4f}'
                    }
                }
            ]
        };
    }, [omoriParams]);

    // Early return if no data
    if (!omoriParams) {
        return (
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Omori&apos;s Law Analysis</h3>
                <p className="text-gray-500">Insufficient aftershock data for analysis (minimum 10 events required)</p>
            </div>
        );
    }

    // Extract parameters for display
    const { K, c, p, rSquared } = omoriParams;

    return (
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Omori&apos;s Law Analysis</h3>
                <div className="flex items-center gap-2">
                    <label htmlFor="opt-method" className="text-sm text-gray-600">Optimization:</label>
                    <select
                        id="opt-method"
                        value={optimizationMethod}
                        onChange={(e) => setOptimizationMethod(e.target.value as OptimizationMethod)}
                        className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="hybrid">Hybrid (Grid + LM)</option>
                        <option value="levenberg-marquardt">Levenberg-Marquardt</option>
                        <option value="nelder-mead">Nelder-Mead</option>
                        <option value="grid-search">Grid Search</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-blue-50 p-3 rounded">
                    <p className="text-sm text-gray-600">K (Productivity)</p>
                    <p className="text-xl font-bold text-blue-700">{K.toFixed(2)}</p>
                </div>
                <div className="bg-green-50 p-3 rounded">
                    <p className="text-sm text-gray-600">c (Time Offset)</p>
                    <p className="text-xl font-bold text-green-700">{c.toFixed(3)} days</p>
                </div>
                <div className="bg-purple-50 p-3 rounded">
                    <p className="text-sm text-gray-600">p (Decay)</p>
                    <p className="text-xl font-bold text-purple-700">{p.toFixed(2)}</p>
                </div>
                <div className="bg-orange-50 p-3 rounded">
                    <p className="text-sm text-gray-600">R²</p>
                    <p className="text-xl font-bold text-orange-700">{rSquared.toFixed(3)}</p>
                </div>
            </div>

            {omoriParams.iterations !== undefined && (
                <div className="mb-6 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                    <span className="font-medium">Optimization info:</span> {omoriParams.iterations} iterations using {omoriParams.optimizationMethod}
                </div>
            )}

            {/* TABS */}
            <div className="flex border-b border-gray-200 mb-4">
                <button
                    className={`px-4 py-2 text-sm font-medium ${activeTab === 'fit' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    onClick={() => setActiveTab('fit')}
                >
                    Model Fit
                </button>
                <button
                    className={`px-4 py-2 text-sm font-medium ${activeTab === 'residuals' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    onClick={() => setActiveTab('residuals')}
                >
                    Residuals
                </button>
                <button
                    className={`px-4 py-2 text-sm font-medium ${activeTab === 'stats' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    onClick={() => setActiveTab('stats')}
                >
                    Q-Q Plot
                </button>
                <button
                    className={`px-4 py-2 text-sm font-medium ${activeTab === 'uncertainty' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    onClick={() => setActiveTab('uncertainty')}
                >
                    Parameters
                </button>
            </div>

            <div className="space-y-6">
                {activeTab === 'fit' && (
                    <>
                        <div className="bg-white rounded-lg border border-gray-100">
                            <div className="h-[350px]">
                                <HighchartsReact highcharts={Highcharts} options={countsVsExpectedOptions} />
                            </div>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-100">
                            <div className="h-[350px]">
                                <HighchartsReact highcharts={Highcharts} options={cumulativeOptions} ref={chartRef2} />
                            </div>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-100">
                            <h4 className="text-md font-semibold text-gray-700 mb-3 px-4 pt-4">Daily Aftershock Rate (Log-Log)</h4>
                            <div className="h-[350px]">
                                <HighchartsReact highcharts={Highcharts} options={dailyRateOptions} ref={chartRef1} />
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'residuals' && (
                    <div className="bg-white rounded-lg border border-gray-100">
                        <h4 className="text-md font-semibold text-gray-700 mb-3 px-4 pt-4">Residual Analysis</h4>
                        <p className="text-xs text-gray-500 px-4 mb-2">Top: Standardized residuals (should be within ±2). Bottom: Cumulative residual process.</p>
                        <div className="h-[400px]">
                            <HighchartsReact highcharts={Highcharts} options={residualOptions} />
                        </div>
                    </div>
                )}

                {activeTab === 'stats' && (
                    <div className="bg-white rounded-lg border border-gray-100">
                        <h4 className="text-md font-semibold text-gray-700 mb-3 px-4 pt-4">Time-Rescaling Q-Q Plot</h4>
                        <p className="text-xs text-gray-500 px-4 mb-2">Transformed inter-event times vs Exponential(1). Deviations from 1:1 line indicate model misfit.</p>
                        <div className="h-[400px]">
                            <HighchartsReact highcharts={Highcharts} options={qqOptions} />
                        </div>
                    </div>
                )}

                {activeTab === 'uncertainty' && (
                    <div className="bg-white rounded-lg border border-gray-100">
                        <div className="h-[400px]">
                            <HighchartsReact highcharts={Highcharts} options={likelihoodOptions} />
                        </div>
                        <p className="text-xs text-gray-500 px-4 py-2">
                            Contour plot shows the profile log-likelihood surface for parameters p (decay exponent) and c (time offset).
                            The red point marks the maximum likelihood estimate (MLE). Warmer colors indicate higher likelihood.
                        </p>
                    </div>
                )}
            </div>

            <div className="mt-4 text-sm text-gray-600">
                <p><strong>Modified Omori Law:</strong> n(t) = {K.toFixed(2)} / (t + {c.toFixed(3)})^{p.toFixed(2)}</p>
                <p className="mt-1">where n(t) is the aftershock rate at time t (days since mainshock)</p>
            </div>
        </div>
    );
});

// Export memoized version to prevent unnecessary re-renders
export default OmoriLawPlot;
