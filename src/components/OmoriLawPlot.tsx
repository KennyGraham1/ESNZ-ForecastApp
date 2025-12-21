'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, useState, memo, useEffect } from 'react';
import { MainEventInfo, calculateOmoriParameters, OptimizationMethod, OmoriParameters } from '@/lib/analysis/omori';
import { ReferenceModel, calculateReferenceRate, generateReferenceSeries } from '@/lib/analysis/referenceModels';
import { getPaletteThemeColors, ColorPaletteName } from '@/utils/colorPalette';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';
import LoadingProgress from './LoadingProgress';
import { HIGHCHARTS_CONFIG } from '@/config/performance';

interface OmoriLawPlotProps {
    earthquakes: EarthquakeData[];
    mainEvent: MainEventInfo;
    optimizationMethod?: OptimizationMethod;
    magnitudeCompleteness?: number;
    onOptimizationMethodChange?: (method: OptimizationMethod) => void;
    onMagnitudeCompletenessChange?: (mc: number | undefined) => void;
    referenceModel?: ReferenceModel | null;
    colorPalette?: ColorPaletteName;
}

const OmoriLawPlot = memo(function OmoriLawPlot({
    earthquakes,
    mainEvent,
    optimizationMethod: externalOptimizationMethod,
    magnitudeCompleteness: externalMagnitudeCompleteness,
    onMagnitudeCompletenessChange,
    referenceModel,
    onCalculationComplete,
    colorPalette = 'default'
}: OmoriLawPlotProps & { onCalculationComplete?: (params: OmoriParameters | null) => void }) {
    const chartRef1 = useRef<HighchartsReact.RefObject>(null);
    const chartRef2 = useRef<HighchartsReact.RefObject>(null);
    const chartRef3 = useRef<HighchartsReact.RefObject>(null);
    const chartRef4 = useRef<HighchartsReact.RefObject>(null);
    const chartRef5 = useRef<HighchartsReact.RefObject>(null);
    const [activeTab, setActiveTab] = useState<'fit' | 'residuals' | 'stats'>('fit');

    // Input state (controlled inputs)
    // DEFAULT CHANGED TO MLE AS REQUESTED
    const [inputOptimizationMethod, setInputOptimizationMethod] = useState<OptimizationMethod>(
        externalOptimizationMethod || 'mle'
    );
    const [inputMagnitudeCompleteness, setInputMagnitudeCompleteness] = useState<string>(
        externalMagnitudeCompleteness?.toString() || ''
    );

    // Applied state (used for calculations)
    const [appliedOptimizationMethod, setAppliedOptimizationMethod] = useState<OptimizationMethod>(
        externalOptimizationMethod || 'mle'
    );
    const [appliedMagnitudeCompleteness, setAppliedMagnitudeCompleteness] = useState<string>(
        externalMagnitudeCompleteness?.toString() || ''
    );

    // Progress tracking state
    const [isCalculating, setIsCalculating] = useState(false);
    const [calculationProgress, setCalculationProgress] = useState(0);
    const [omoriParams, setOmoriParams] = useState<OmoriParameters | null>(null);

    const handleApply = () => {
        setAppliedOptimizationMethod(inputOptimizationMethod);
        setAppliedMagnitudeCompleteness(inputMagnitudeCompleteness);

        // Notify parent component of changes
        // onOptimizationMethodChange removed in favor of onCalculationComplete flow
        if (onMagnitudeCompletenessChange) {
            const mc = inputMagnitudeCompleteness ? parseFloat(inputMagnitudeCompleteness) : undefined;
            onMagnitudeCompletenessChange(mc);
        }
    };

    // Calculate Omori parameters with progress tracking
    useEffect(() => {
        const calculateWithProgress = async () => {
            setIsCalculating(true);
            setCalculationProgress(0);

            // Simulate progress updates
            const progressInterval = setInterval(() => {
                setCalculationProgress((prev) => Math.min(prev + 10, 90));
            }, 100);

            try {
                // Run calculation in next tick to allow UI to update
                await new Promise(resolve => setTimeout(resolve, 0));

                const mc = appliedMagnitudeCompleteness ? parseFloat(appliedMagnitudeCompleteness) : undefined;
                const result = calculateOmoriParameters(earthquakes, mainEvent, 365, appliedOptimizationMethod, mc);

                setOmoriParams(result);
                // NOTIFY PARENT COMPONENT
                if (onCalculationComplete) {
                    onCalculationComplete(result);
                }
                setCalculationProgress(100);
            } catch (error) {
                console.error('Omori calculation error:', error);
                setOmoriParams(null);
            } finally {
                clearInterval(progressInterval);
                setTimeout(() => setIsCalculating(false), 300); // Brief delay to show 100%
            }
        };

        calculateWithProgress();
    }, [earthquakes, mainEvent, appliedOptimizationMethod, appliedMagnitudeCompleteness]);

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

        // Additional validation
        if (!Array.isArray(dailyCounts) || !Array.isArray(fittedCounts) || dailyCounts.length === 0) {
            return {
                chart: { type: 'scatter', height: 350 },
                title: { text: '' },
                credits: { enabled: false },
                series: []
            };
        }

        const themeColors = getPaletteThemeColors(colorPalette);

        // Calculate reference model series if selected
        let referenceSeries: [number, number][] = [];
        if (referenceModel && mainEvent) {
            const days = dailyCounts.map(d => d.day);
            const Mc = appliedMagnitudeCompleteness ? parseFloat(appliedMagnitudeCompleteness) :
                (earthquakes.length > 0 ? Math.min(...earthquakes.map(e => e.magnitude)) : 0);

            if (!isNaN(Mc) && mainEvent.magnitude) {
                const refData = generateReferenceSeries(
                    referenceModel,
                    days,
                    mainEvent.magnitude,
                    Mc
                );
                referenceSeries = refData.map(d => [d.day, d.count]);
            }
        }

        return {
            chart: {
                type: 'scatter',
                height: 500,
                backgroundColor: '#FFFFFF',
                style: {
                    fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                }
            },
            title: { text: '' },
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
            boost: {
                useGPUTranslations: true,
                usePreallocated: true
            },
            plotOptions: {
                series: {
                    turboThreshold: 50000, // Support very large datasets (50k+ events)
                    boostThreshold: HIGHCHARTS_CONFIG.BOOST_THRESHOLD // Use centralized boost threshold
                }
            },
            series: [
                {
                    type: 'scatter',
                    name: 'Observed',
                    data: dailyCounts.map(d => {
                        // Ensure valid numbers
                        if (typeof d.day !== 'number' || typeof d.count !== 'number' || !isFinite(d.day) || !isFinite(d.count)) {
                            return null;
                        }
                        return [d.day, d.count];
                    }).filter((point): point is [number, number] => point !== null),
                    color: themeColors.mainColor, // Palette color
                    marker: {
                        symbol: 'circle',
                        radius: 3,
                        fillColor: themeColors.mainColor,
                        lineWidth: 0
                    }
                },
                {
                    type: 'line',
                    name: 'Omori-Utsu Fit',
                    data: fittedCounts.map(d => {
                        // Ensure valid numbers
                        if (typeof d.day !== 'number' || typeof d.count !== 'number' || !isFinite(d.day) || !isFinite(d.count)) {
                            return null;
                        }
                        return [d.day, d.count];
                    }).filter((point): point is [number, number] => point !== null),
                    color: themeColors.secondaryColor, // Palette color
                    lineWidth: 2.5,
                    marker: {
                        enabled: false
                    }
                },
                ...(referenceSeries.length > 0 ? [{
                    type: 'line',
                    name: referenceModel?.name || 'Reference Model',
                    data: referenceSeries,
                    color: '#32CD32', // Lime Green
                    dashStyle: 'ShortDash',
                    lineWidth: 2,
                    marker: {
                        enabled: false
                    }
                } as any] : [])
            ],
            accessibility: {
                enabled: true,
                description: 'Log-log plot of daily aftershock rate with Omori-Utsu law fit'
            }
        };
    }, [omoriParams, referenceModel, mainEvent, appliedMagnitudeCompleteness, earthquakes]);

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

        const themeColors = getPaletteThemeColors(colorPalette);
        const { cumulativeCounts, expectedCumulativeCounts } = omoriParams;

        // Create observed vs expected data points
        const qqData: [number, number][] = [];
        for (let i = 0; i < cumulativeCounts.length; i++) {
            const expected = expectedCumulativeCounts?.[i]?.count ?? 0;
            const observed = cumulativeCounts[i].count;
            // Ensure valid numbers
            if (typeof expected === 'number' && typeof observed === 'number' &&
                isFinite(expected) && isFinite(observed)) {
                qqData.push([expected, observed]);
            }
        }

        // Find max value for 1:1 reference line
        // FIXED: Use iterative approach to avoid stack overflow on large datasets
        let maxExpected = -Infinity;
        let maxObserved = -Infinity;
        for (const [expected, observed] of qqData) {
            if (expected > maxExpected) maxExpected = expected;
            if (observed > maxObserved) maxObserved = observed;
        }
        const maxVal = Math.max(maxExpected, maxObserved);

        return {
            chart: {
                type: 'line',
                height: 500,
                backgroundColor: '#FFFFFF',
                style: {
                    fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                }
            },
            title: { text: '' },
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
                formatter: function () {
                    return `<b>Expected:</b> ${this.x?.toFixed(1)}<br/><b>Observed:</b> ${this.y?.toFixed(1)}`;
                }
            },
            series: [
                {
                    type: 'line',
                    name: '1:1 Reference',
                    data: [[0, 0], [maxVal, maxVal]],
                    color: themeColors.secondaryColor, // Palette color
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
                    color: themeColors.mainColor, // Palette color
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
    }, [omoriParams, colorPalette]);

    // -------------------------
    // Chart 1: Counts vs OU expected (Bar chart with fitted line overlay)
    // Matches reference: Blue bars for empirical counts, red line for OU fitted
    // -------------------------
    const countsVsExpectedOptions: Highcharts.Options = useMemo(() => {
        if (!omoriParams?.dailyCounts) return {};

        const themeColors = getPaletteThemeColors(colorPalette);
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
                height: 500,
                backgroundColor: '#FFFFFF',
                style: {
                    fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                }
            },
            title: { text: '' },
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
            boost: {
                useGPUTranslations: true,
                usePreallocated: true
            },
            plotOptions: {
                series: {
                    turboThreshold: 50000, // Support very large datasets (50k+ events)
                    boostThreshold: HIGHCHARTS_CONFIG.BOOST_THRESHOLD // Use centralized boost threshold
                },
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
                    color: themeColors.mainColor + 'BF', // Transparent (BF is approx 0.75 alpha)
                    zIndex: 1
                },
                {
                    type: 'line',
                    name: 'Omori-Utsu fit',
                    data: displayDataExpected,
                    color: themeColors.secondaryColor, // Palette color
                    lineWidth: 2.5,
                    marker: { enabled: false },
                    zIndex: 2
                }
            ]
        };
    }, [omoriParams, colorPalette]);

    // -------------------------
    // 1. Residual Plots Options - Matplotlib-style
    // -------------------------
    const residualOptions: Highcharts.Options = useMemo(() => {
        if (!omoriParams?.standardizedResiduals) return {};

        const themeColors = getPaletteThemeColors(colorPalette);
        const { standardizedResiduals, residualProcess } = omoriParams;

        return {
            chart: {
                height: 600,
                backgroundColor: '#FFFFFF',
                style: {
                    fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                },
                marginBottom: 80,
                spacingBottom: 15
            },
            title: { text: '' },
            credits: { enabled: false },
            xAxis: [
                {
                    title: {
                        text: '',
                        style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                    },
                    gridLineWidth: 0,
                    lineColor: '#000',
                    lineWidth: 1.5,
                    tickColor: '#000',
                    tickWidth: 1.5,
                    labels: { enabled: false },
                    height: '52%'
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
                    labels: {
                        style: { fontSize: '11px', color: '#333' },
                        y: 25
                    },
                    top: '57%',
                    height: '43%',
                    offset: 0
                }
            ],
            yAxis: [
                {
                    title: {
                        text: 'Standardized residuals',
                        style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                    },
                    height: '52%',
                    gridLineWidth: 1,
                    gridLineColor: '#E0E0E0',
                    lineColor: '#000',
                    lineWidth: 1.5,
                    tickColor: '#000',
                    tickWidth: 1.5,
                    labels: { style: { fontSize: '11px', color: '#333' } },
                    plotLines: [
                        { value: 0, width: 2, color: '#000', zIndex: 5 },
                        { value: 2, width: 1.5, color: themeColors.secondaryColor, dashStyle: 'Dash', zIndex: 4, label: { text: '+2σ', style: { color: themeColors.secondaryColor, fontSize: '10px' } } },
                        { value: -2, width: 1.5, color: themeColors.secondaryColor, dashStyle: 'Dash', zIndex: 4, label: { text: '-2σ', style: { color: themeColors.secondaryColor, fontSize: '10px' } } }
                    ]
                },
                {
                    title: {
                        text: 'Cumulative residuals',
                        style: { fontSize: '12px', fontWeight: '500', color: '#333' }
                    },
                    top: '57%',
                    height: '43%',
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
            boost: {
                useGPUTranslations: true,
                usePreallocated: true
            },
            plotOptions: {
                series: {
                    turboThreshold: 50000, // Support very large datasets (50k+ events)
                    boostThreshold: HIGHCHARTS_CONFIG.BOOST_THRESHOLD // Use centralized boost threshold
                }
            },
            series: [
                {
                    type: 'scatter',
                    name: 'Standardized Residuals',
                    data: standardizedResiduals.map(r => [r.day, r.residual]),
                    yAxis: 0,
                    xAxis: 0,
                    color: themeColors.mainColor, // Palette color
                    marker: {
                        symbol: 'circle',
                        radius: 3,
                        fillColor: themeColors.mainColor,
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
                    color: themeColors.secondaryColor, // Palette color
                    lineWidth: 2,
                    marker: { enabled: false },
                    tooltip: {
                        pointFormat: 'Day: {point.x:.1f}<br/>Cumulative: {point.y:.2f}'
                    }
                }
            ]
        };
    }, [omoriParams, colorPalette]);

    // -------------------------
    // 2. Q-Q Plot Options - Matplotlib-style
    // -------------------------
    const qqOptions: Highcharts.Options = useMemo(() => {
        if (!omoriParams?.qqPlotData) return {};
        const themeColors = getPaletteThemeColors(colorPalette);
        const { qqPlotData } = omoriParams;

        // Find max value for 1:1 line reference
        const maxVal = Math.max(
            ...qqPlotData.map(d => Math.max(d.x, d.y))
        );

        return {
            chart: {
                type: 'scatter',
                height: 500,
                backgroundColor: '#FFFFFF',
                style: {
                    fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
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
            boost: {
                useGPUTranslations: true,
                usePreallocated: true
            },
            plotOptions: {
                series: {
                    turboThreshold: 50000, // Support very large datasets (50k+ events)
                    boostThreshold: HIGHCHARTS_CONFIG.BOOST_THRESHOLD // Use centralized boost threshold
                }
            },
            series: [
                {
                    type: 'line',
                    name: '1:1 Reference Line',
                    data: [[0, 0], [maxVal, maxVal]],
                    color: themeColors.secondaryColor, // Palette color
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
                    color: themeColors.mainColor, // Palette color
                    marker: {
                        symbol: 'circle',
                        radius: 3,
                        fillColor: themeColors.mainColor,
                        lineWidth: 0
                    },
                    zIndex: 2,
                    tooltip: {
                        pointFormat: 'Theoretical: {point.x:.3f}<br/>Observed: {point.y:.3f}'
                    }
                }
            ]
        };
    }, [omoriParams, colorPalette]);

    // Show loading progress while calculating
    if (isCalculating) {
        const getMethodName = (method: OptimizationMethod): string => {
            const names: Record<OptimizationMethod, string> = {
                'hybrid': 'Hybrid (Grid Search + Levenberg-Marquardt)',
                'levenberg-marquardt': 'Levenberg-Marquardt',
                'nelder-mead': 'Nelder-Mead Simplex',
                'grid-search': 'Grid Search',
                'mle': 'Maximum Likelihood Estimation'
            };
            return names[method] || method;
        };

        return (
            <>
                <LoadingProgress
                    operation="Fitting Omori Law Parameters"
                    total={100}
                    progress={calculationProgress}
                    details={`Using ${getMethodName(appliedOptimizationMethod)} optimization${appliedMagnitudeCompleteness ? ` with Mc = ${appliedMagnitudeCompleteness}` : ''}`}
                    icon="📊"
                />
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200 opacity-50">
                    <h3 className="text-lg font-semibold mb-4">Omori&apos;s Law Analysis</h3>
                    <p className="text-gray-500">Calculating parameters...</p>
                </div>
            </>
        );
    }

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
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <label htmlFor="mc-input" className="text-sm text-gray-600">Mc (Optional):</label>
                        <input
                            id="mc-input"
                            type="number"
                            step="0.1"
                            placeholder="Optional"
                            value={inputMagnitudeCompleteness}
                            onChange={(e) => setInputMagnitudeCompleteness(e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1 w-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            title="Magnitude of completeness - only events with M ≥ Mc will be included"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="opt-method" className="text-sm text-gray-600">Optimization:</label>
                        <select
                            id="opt-method"
                            value={inputOptimizationMethod}
                            onChange={(e) => setInputOptimizationMethod(e.target.value as OptimizationMethod)}
                            className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="hybrid">Hybrid (Grid + LM)</option>
                            <option value="mle">MLE (with CI)</option>
                            <option value="levenberg-marquardt">Levenberg-Marquardt</option>
                            <option value="nelder-mead">Nelder-Mead</option>
                            <option value="grid-search">Grid Search</option>
                        </select>
                    </div>
                    <button
                        onClick={handleApply}
                        className="px-4 py-1 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        Apply
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-blue-50 p-3 rounded">
                    <p className="text-sm text-gray-600">K (Productivity)</p>
                    <p className="text-xl font-bold text-blue-700">{K.toFixed(2)}</p>
                    {omoriParams.uncertainty?.K_ci && (
                        <p className="text-xs text-gray-500 mt-1">
                            95% CI: [{omoriParams.uncertainty.K_ci[0].toFixed(2)}, {omoriParams.uncertainty.K_ci[1].toFixed(2)}]
                        </p>
                    )}
                    {omoriParams.uncertainty?.K_se && (
                        <p className="text-xs text-gray-500 mt-1">
                            SE: ±{omoriParams.uncertainty.K_se.toFixed(2)}
                        </p>
                    )}
                </div>
                <div className="bg-green-50 p-3 rounded">
                    <p className="text-sm text-gray-600">c (Time Offset)</p>
                    <p className="text-xl font-bold text-green-700">{c.toFixed(3)} days</p>
                    {omoriParams.uncertainty?.c_ci && (
                        <p className="text-xs text-gray-500 mt-1">
                            95% CI: [{omoriParams.uncertainty.c_ci[0].toFixed(3)}, {omoriParams.uncertainty.c_ci[1].toFixed(3)}]
                        </p>
                    )}
                    {omoriParams.uncertainty?.c_se && (
                        <p className="text-xs text-gray-500 mt-1">
                            SE: ±{omoriParams.uncertainty.c_se.toFixed(3)}
                        </p>
                    )}
                </div>
                <div className="bg-purple-50 p-3 rounded">
                    <p className="text-sm text-gray-600">p (Decay)</p>
                    <p className="text-xl font-bold text-purple-700">{p.toFixed(2)}</p>
                    {omoriParams.uncertainty?.p_ci && (
                        <p className="text-xs text-gray-500 mt-1">
                            95% CI: [{omoriParams.uncertainty.p_ci[0].toFixed(3)}, {omoriParams.uncertainty.p_ci[1].toFixed(3)}]
                        </p>
                    )}
                    {omoriParams.uncertainty?.p_se && (
                        <p className="text-xs text-gray-500 mt-1">
                            SE: ±{omoriParams.uncertainty.p_se.toFixed(3)}
                        </p>
                    )}
                </div>
                <div className="bg-orange-50 p-3 rounded">
                    <p className="text-sm text-gray-600">R²</p>
                    <p className="text-xl font-bold text-orange-700">{rSquared.toFixed(3)}</p>
                    {omoriParams.uncertainty?.aic && (
                        <p className="text-xs text-gray-500 mt-1">
                            AIC: {omoriParams.uncertainty.aic.toFixed(1)}
                        </p>
                    )}
                    {omoriParams.uncertainty?.bic && (
                        <p className="text-xs text-gray-500 mt-1">
                            BIC: {omoriParams.uncertainty.bic.toFixed(1)}
                        </p>
                    )}
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
            </div>

            <div className="space-y-6">
                {activeTab === 'fit' && (
                    <>
                        <div className="bg-white rounded-lg border border-gray-100 p-4">
                            <div className="h-[500px]">
                                <HighchartsReact highcharts={Highcharts} options={countsVsExpectedOptions} ref={chartRef1} />
                            </div>
                            <ChartExportButtons
                                chartRef={chartRef1}
                                data={earthquakes}
                                filename="omori-counts-vs-expected"
                            />
                        </div>
                        <div className="bg-white rounded-lg border border-gray-100 p-4">
                            <div className="h-[500px]">
                                <HighchartsReact highcharts={Highcharts} options={cumulativeOptions} ref={chartRef2} />
                            </div>
                            <ChartExportButtons
                                chartRef={chartRef2}
                                data={earthquakes}
                                filename="omori-cumulative"
                            />
                        </div>
                        <div className="bg-white rounded-lg border border-gray-100">
                            <h4 className="text-md font-semibold text-gray-700 mb-3 px-4 pt-4">Daily Aftershock Rate (Log-Log)</h4>
                            <div className="h-[500px] px-4">
                                <HighchartsReact highcharts={Highcharts} options={dailyRateOptions} ref={chartRef3} />
                            </div>
                            <div className="px-4 pb-4">
                                <ChartExportButtons
                                    chartRef={chartRef3}
                                    data={earthquakes}
                                    filename="omori-daily-rate"
                                />
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'residuals' && (
                    <div className="bg-white rounded-lg border border-gray-100 p-4">
                        <h4 className="text-md font-semibold text-gray-700 mb-3">Residual Analysis</h4>
                        <p className="text-xs text-gray-500 mb-2">Top: Standardized residuals (should be within ±2). Bottom: Cumulative residual process.</p>
                        <div className="h-[600px]">
                            <HighchartsReact highcharts={Highcharts} options={residualOptions} ref={chartRef4} />
                        </div>
                        <ChartExportButtons
                            chartRef={chartRef4}
                            data={earthquakes}
                            filename="omori-residual-analysis"
                        />
                    </div>
                )}

                {activeTab === 'stats' && (
                    <div className="bg-white rounded-lg border border-gray-100 p-4">
                        <h4 className="text-md font-semibold text-gray-700 mb-3">Time-Rescaling Q-Q Plot</h4>
                        <p className="text-xs text-gray-500 mb-2">Transformed inter-event times vs Exponential(1). Deviations from 1:1 line indicate model misfit.</p>
                        <div className="h-[500px]">
                            <HighchartsReact highcharts={Highcharts} options={qqOptions} ref={chartRef5} />
                        </div>
                        <ChartExportButtons
                            chartRef={chartRef5}
                            data={earthquakes}
                            filename="omori-qq-plot"
                        />
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
