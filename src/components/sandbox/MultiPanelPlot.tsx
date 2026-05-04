'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, memo } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from '../ChartExportButtons';
import { stratifiedSample } from '@/utils/dataOptimization';
import { safeMin, safeMax } from '@/utils/arrayMath';
import { SAMPLING_CONFIG, getOptimalSamplingThreshold, HIGHCHARTS_CONFIG } from '@/config/performance';

interface MultiPanelPlotProps {
    earthquakes: EarthquakeData[];
    fullDataForExport?: EarthquakeData[];
    field1?: keyof EarthquakeData;
    field2?: keyof EarthquakeData;
    field3?: keyof EarthquakeData;
    xAxisField?: keyof EarthquakeData;
    colorField?: keyof EarthquakeData; // NEW
    colorPalette?: string[]; // NEW
    sizeField?: keyof EarthquakeData; // NEW
}

const MultiPanelPlot = memo(function MultiPanelPlot({
    earthquakes,
    fullDataForExport,
    field1 = 'longitude',
    field2 = 'latitude',
    field3 = 'depth',
    xAxisField = 'time',
    colorField,
    colorPalette,
    sizeField
}: MultiPanelPlotProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);

    const chartOptions: Highcharts.Options = useMemo(() => {
        // Validate data
        if (!earthquakes || earthquakes.length === 0) {
            return {
                chart: { type: 'scatter', height: 800 },
                title: { text: '' },
                series: []
            };
        }

        // Sampling: Stricter threshold for multi-panel
        const MAX_MULTI_PANEL_POINTS = 2000;
        let processedEarthquakes = earthquakes;

        if (earthquakes.length > MAX_MULTI_PANEL_POINTS) {
            processedEarthquakes = stratifiedSample(earthquakes, MAX_MULTI_PANEL_POINTS);
            console.log(`📊 Multi-Panel: Stratified sample ${processedEarthquakes.length} points (limit: ${MAX_MULTI_PANEL_POINTS})`);
        }

        // Helper to check if axis is time
        const isTimeAxis = xAxisField === 'time' || xAxisField === 'timeMs';
        const isColorTime = colorField ? (colorField === 'time' || colorField === 'timeMs') : false;

        // Helper to get unit
        const getUnit = (field: string) => {
            const f = field.toString().toLowerCase();
            if (f.includes('depth')) return ' km';
            if (f.includes('mag')) return ' M';
            if (f.includes('lat') || f.includes('lon')) return '°';
            return '';
        };

        // --- SIZE SCALING LOGIC ---
        let getSize = (val: number) => 3; // Default size 3
        if (sizeField) {
            const values = processedEarthquakes.map(eq => {
                const v = eq[sizeField];
                return typeof v === 'number' ? v : 0;
            });
            const minS = safeMin(values);
            const maxS = safeMax(values);
            getSize = (val: number) => {
                const norm = (val - minS) / (maxS - minS || 1);
                return 2 + norm * 10; // Scale 2px to 12px for multi-panel (smaller than scatter)
            };
        }

        // --- COLOR SCALING LOGIC ---
        let minColorVal: number | undefined;
        let maxColorVal: number | undefined;

        if (colorField) {
            const colorValues = processedEarthquakes
                .map(eq => {
                    const val = eq[colorField];
                    if (typeof val === 'number') return val;
                    if (val instanceof Date) return val.getTime();
                    // if (typeof val === 'string' && !isNaN(Date.parse(val))) return new Date(val).getTime();
                    return null;
                })
                .filter(v => v !== null) as number[];

            if (colorValues.length > 0) {
                minColorVal = safeMin(colorValues);
                maxColorVal = safeMax(colorValues);
            }
        }


        // Prepare data for 3 series
        const getData = (field: keyof EarthquakeData) => {
            return processedEarthquakes.map(eq => {
                const yVal = eq[field];
                let xVal: number;

                if (xAxisField === 'time') {
                    xVal = new Date(eq.time).getTime();
                } else if (typeof eq[xAxisField] === 'number') {
                    xVal = eq[xAxisField] as number;
                } else {
                    xVal = 0;
                }

                const point: any = {
                    x: xVal,
                    y: typeof yVal === 'number' ? yVal : 0,
                    z: eq.magnitude,
                    custom: {
                        ...eq,
                        fieldLabel: field,
                        fieldUnit: getUnit(field.toString()),
                        xLabel: xAxisField,
                        xUnit: getUnit(xAxisField.toString())
                    }
                };

                // Add Color Value
                if (colorField) {
                    const cVal = eq[colorField];
                    if (typeof cVal === 'number') point.colorValue = cVal;
                    else if (cVal instanceof Date) point.colorValue = cVal.getTime();
                }

                // Add Size
                if (sizeField) {
                    const sVal = typeof eq[sizeField] === 'number' ? eq[sizeField] : 0;
                    point.marker = { radius: getSize(sVal) };
                }

                return point;
            });
        };

        const data1 = getData(field1);
        const data2 = getData(field2);
        const data3 = getData(field3);

        const xTitle = xAxisField === 'time' ? 'Time' : xAxisField.toString();

        return {
            chart: {
                zooming: { type: 'x' },
                height: 800,
                backgroundColor: '#ffffff',
                style: {
                    fontFamily: '"Inter", "Segoe UI", Roboto, sans-serif'
                },
                marginLeft: 80,
                marginRight: 160, // Increased for vertical legend
                marginBottom: 60, // Reduced as legend is now on side
                spacing: [20, 20, 20, 20]
            },
            title: {
                text: `${field1}, ${field2}, ${field3} vs ${xTitle}`,
                style: { fontSize: '18px', fontWeight: 'bold' }
            },
            credits: { enabled: false },
            exporting: { enabled: false }, // Keeping export external for now
            boost: { enabled: false }, // Disabled for better SVG features support

            // --- X AXIS ---
            xAxis: {
                type: isTimeAxis ? 'datetime' : 'linear',
                title: { text: xTitle, style: { color: '#333' } },
                crosshair: true,
                labels: { style: { color: '#666' } },
                lineColor: '#ccd6eb',
                tickColor: '#ccd6eb',
                gridLineWidth: 1,
                gridLineColor: '#f7f7f7'
            },

            // --- Y AXES ---
            yAxis: [
                { // Top
                    title: { text: field1.toString(), style: { color: '#333' } },
                    height: '25%', // Adjusted height to fit 3 panels + bottom legend
                    top: '0%',
                    offset: 0,
                    lineWidth: 1,
                    gridLineColor: '#f0f0f0',
                    reversed: field1 === 'depth'
                },
                { // Middle
                    title: { text: field2.toString(), style: { color: '#333' } },
                    height: '25%',
                    top: '32%',
                    offset: 0,
                    lineWidth: 1,
                    gridLineColor: '#f0f0f0',
                    reversed: field2 === 'depth'
                },
                { // Bottom
                    title: { text: field3.toString(), style: { color: '#333' } },
                    height: '25%',
                    top: '64%',
                    offset: 0,
                    lineWidth: 1,
                    gridLineColor: '#f0f0f0',
                    reversed: field3 === 'depth'
                }
            ],

            // --- COLOR AXIS & LEGEND ---
            legend: {
                enabled: !!colorField,
                title: {
                    text: colorField ? `<span style="font-size: 14px; color: #4b5563; font-weight: 500">${colorField.toString()}</span>` : '',
                    style: { textAlign: 'center' }
                },
                align: 'right',
                verticalAlign: 'middle',
                layout: 'vertical',
                itemStyle: { fontSize: '12px', color: '#666' },
                symbolWidth: 12, // Standard width
                symbolHeight: 360, // Taller bar
                x: 0,
                floating: false,
                navigation: { enabled: false }
            },
            colorAxis: colorField ? {
                type: (isColorTime ? 'datetime' : 'linear') as any,
                min: minColorVal,
                max: maxColorVal,
                minColor: colorPalette ? undefined : '#4ADE80',
                maxColor: colorPalette ? undefined : '#EF4444',
                stops: colorPalette ? colorPalette.map((color, i) => [i / (colorPalette.length - 1), color]) : undefined,
                labels: {
                    style: { color: '#666', fontSize: '11px' },
                    x: 5 // push labels right
                },
                layout: 'vertical'
            } : undefined,

            // --- TOOLTIP ---
            tooltip: {
                useHTML: true,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderColor: '#E5E7EB',
                borderRadius: 8,
                shadow: true,
                padding: 12,
                style: { color: '#374151', fontSize: '13px' },
                headerFormat: '',
                pointFormatter: function (this: any) {
                    const isTime = this.series.xAxis.options.type === 'datetime';
                    const xStr = isTime
                        ? new Date(this.x).toISOString().slice(0, 19).replace('T', ' ')
                        : (typeof this.x === 'number' ? this.x.toFixed(2) : this.x);

                    const yVal = typeof this.y === 'number' ? this.y.toFixed(2) : this.y;
                    const eventID = this.custom?.eventID || 'N/A';
                    const fieldName = this.custom?.fieldLabel || 'Value';
                    const unit = this.custom?.fieldUnit || '';
                    const xLabel = this.custom?.xLabel || 'X';
                    const xUnit = this.custom?.xUnit || '';

                    // Color string
                    const cVal = this.colorValue;
                    // formatting cVal can be complex if it's date, but keeping simple for now
                    const cStr = typeof cVal === 'number' ? cVal.toFixed(2) : '';

                    let html = `<div style="font-family: inherit;">
                        <div style="font-weight: 600; color: #111827; margin-bottom: 2px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px;">Event Details</div>
                        <div style="font-size: 10px; color: #9CA3AF; margin-bottom: 6px;">ID: ${eventID}</div>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 2px 8px 2px 0; color: #6B7280;">${xLabel}:</td>
                                <td style="padding: 2px 0; font-weight: 500; text-align: right;">${xStr}${xUnit}</td>
                            </tr>
                            <tr>
                                <td style="padding: 2px 8px 2px 0; color: #6B7280;">${fieldName}:</td>
                                <td style="padding: 2px 0; font-weight: 500; text-align: right;">${yVal}${unit}</td>
                            </tr>
                            <tr>
                                <td style="padding: 2px 8px 2px 0; color: #6B7280;">Magnitude:</td>
                                <td style="padding: 2px 0; font-weight: 500; text-align: right;">${this.z.toFixed(2)}</td>
                            </tr>`;

                    if (colorField && cStr) {
                        html += `<tr>
                                <td style="padding: 2px 8px 2px 0; color: #6B7280;">${colorField}:</td>
                                <td style="padding: 2px 0; font-weight: 500; text-align: right;">${cStr}</td>
                            </tr>`;
                    }
                    if (sizeField) {
                        const sVal = typeof this.options?.marker?.radius === 'number' ? 'Dynamic' : '';
                        //  html += ... 
                    }

                    html += `</table></div>`;
                    return html;
                }
            },
            plotOptions: {
                series: {
                    turboThreshold: 50000,
                    marker: {
                        radius: 3, // Default if no sizeField
                        symbol: 'circle',
                        lineColor: '#FFFFFF',
                        lineWidth: 0.5,
                        states: {
                            hover: {
                                enabled: true,
                                lineColor: '#111827',
                                lineWidth: 1,
                                radiusPlus: 2
                            }
                        }
                    }
                }
            },
            series: [
                {
                    type: 'scatter',
                    name: field1.toString(),
                    data: data1,
                    yAxis: 0,
                    // Use colorAxis if available, otherwise default color
                    colorKey: 'colorValue',
                    color: !colorField ? 'rgba(50, 100, 200, 0.6)' : undefined,
                },
                {
                    type: 'scatter',
                    name: field2.toString(),
                    data: data2,
                    yAxis: 1,
                    colorKey: 'colorValue',
                    color: !colorField ? 'rgba(50, 150, 100, 0.6)' : undefined,
                },
                {
                    type: 'scatter',
                    name: field3.toString(),
                    data: data3,
                    yAxis: 2,
                    colorKey: 'colorValue',
                    color: !colorField ? 'rgba(100, 50, 200, 0.6)' : undefined,
                }
            ]
        };
    }, [earthquakes, field1, field2, field3, xAxisField, colorField, colorPalette, sizeField]); // Fixed deps

    if (earthquakes.length === 0) {
        return <div className="p-4 text-center text-gray-500">No data available</div>;
    }

    return (
        <div className="bg-white p-4 rounded-lg shadow-sm w-full h-full flex flex-col">
            <div className="flex-grow">
                <HighchartsReact
                    highcharts={Highcharts}
                    options={chartOptions}
                    ref={chartRef}
                    containerProps={{ style: { height: '100%', width: '100%' } }}
                />
            </div>
            <div className="mt-2 flex justify-end">
                <ChartExportButtons
                    chartRef={chartRef}
                    data={fullDataForExport || earthquakes}
                    filename="temporal-evolution-plots"
                />
            </div>
        </div>
    );
});

export default MultiPanelPlot;
