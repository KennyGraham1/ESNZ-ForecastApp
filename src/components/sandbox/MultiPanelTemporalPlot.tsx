'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, memo } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from '../ChartExportButtons';
import { stratifiedSample } from '@/utils/dataOptimization';
import { safeMin, safeMax } from '@/utils/arrayMath';
import { SAMPLING_CONFIG, getOptimalSamplingThreshold, HIGHCHARTS_CONFIG } from '@/config/performance';

interface MultiPanelTemporalPlotProps {
    earthquakes: EarthquakeData[];
    fullDataForExport?: EarthquakeData[];
    field1?: keyof EarthquakeData;
    field2?: keyof EarthquakeData;
    field3?: keyof EarthquakeData;
}

const MultiPanelTemporalPlot = memo(function MultiPanelTemporalPlot({
    earthquakes,
    fullDataForExport,
    field1 = 'longitude',
    field2 = 'latitude',
    field3 = 'depth'
}: MultiPanelTemporalPlotProps) {
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

        // Helper to get unit
        const getUnit = (field: string) => {
            const f = field.toString().toLowerCase();
            if (f.includes('depth')) return ' km';
            if (f.includes('mag')) return ' M';
            if (f.includes('lat') || f.includes('lon')) return '°';
            return '';
        };

        // Prepare data for 3 series
        const getData = (field: keyof EarthquakeData) => {
            return processedEarthquakes.map(eq => {
                const val = eq[field];
                return {
                    x: new Date(eq.time).getTime(),
                    y: typeof val === 'number' ? val : 0,
                    z: eq.magnitude,
                    custom: {
                        ...eq,
                        fieldLabel: field,
                        fieldUnit: getUnit(field.toString())
                    }
                };
            });
        };

        const data1 = getData(field1);
        const data2 = getData(field2);
        const data3 = getData(field3);

        return {
            chart: {
                zoomType: 'x',
                height: 800,
                backgroundColor: '#ffffff',
                style: {
                    fontFamily: '"Inter", "Segoe UI", Roboto, sans-serif'
                },
                marginLeft: 80,
                marginRight: 80,
                spacing: [20, 20, 40, 20]
            },
            title: {
                text: `Temporal Evolution of ${field1}, ${field2}, and ${field3}`,
                style: { fontSize: '18px', fontWeight: 'bold' }
            },
            credits: { enabled: false },
            exporting: { enabled: false },
            boost: { enabled: false },
            xAxis: {
                type: 'datetime',
                crosshair: true,
                labels: { style: { color: '#666' } },
                lineColor: '#ccd6eb',
                tickColor: '#ccd6eb'
            },
            yAxis: [
                { // Top
                    title: { text: field1.toString(), style: { color: '#333' } },
                    height: '28%',
                    top: '0%',
                    offset: 0,
                    lineWidth: 1,
                    gridLineColor: '#f0f0f0',
                    reversed: field1 === 'depth'
                },
                { // Middle
                    title: { text: field2.toString(), style: { color: '#333' } },
                    height: '28%',
                    top: '36%',
                    offset: 0,
                    lineWidth: 1,
                    gridLineColor: '#f0f0f0',
                    reversed: field2 === 'depth'
                },
                { // Bottom
                    title: { text: field3.toString(), style: { color: '#333' } },
                    height: '28%',
                    top: '72%',
                    offset: 0,
                    lineWidth: 1,
                    gridLineColor: '#f0f0f0',
                    reversed: field3 === 'depth'
                }
            ],
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
                    const dateStr = new Date(this.x).toISOString().slice(0, 19).replace('T', ' ');
                    const yVal = typeof this.y === 'number' ? this.y.toFixed(2) : this.y;
                    const eventID = this.custom?.eventID || 'N/A';
                    const fieldName = this.custom?.fieldLabel || 'Value';
                    const unit = this.custom?.fieldUnit || '';

                    return `<div style="font-family: inherit;">
                        <div style="font-weight: 600; color: #111827; margin-bottom: 2px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px;">Event Details</div>
                        <div style="font-size: 10px; color: #9CA3AF; margin-bottom: 6px;">ID: ${eventID}</div>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 2px 8px 2px 0; color: #6B7280;">Time:</td>
                                <td style="padding: 2px 0; font-weight: 500; text-align: right;">${dateStr}</td>
                            </tr>
                            <tr>
                                <td style="padding: 2px 8px 2px 0; color: #6B7280;">${fieldName}:</td>
                                <td style="padding: 2px 0; font-weight: 500; text-align: right;">${yVal}${unit}</td>
                            </tr>
                            <tr>
                                <td style="padding: 2px 8px 2px 0; color: #6B7280;">Magnitude:</td>
                                <td style="padding: 2px 0; font-weight: 500; text-align: right;">${this.z.toFixed(2)}</td>
                            </tr>
                        </table></div>`;
                }
            },
            plotOptions: {
                series: {
                    turboThreshold: 50000,
                    marker: {
                        radius: 3,
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
                    color: 'rgba(50, 100, 200, 0.6)',
                },
                {
                    type: 'scatter',
                    name: field2.toString(),
                    data: data2,
                    yAxis: 1,
                    color: 'rgba(50, 150, 100, 0.6)',
                },
                {
                    type: 'scatter',
                    name: field3.toString(),
                    data: data3,
                    yAxis: 2,
                    color: 'rgba(100, 50, 200, 0.6)',
                }
            ]
        };
    }, [earthquakes, field1, field2, field3]);

    if (earthquakes.length === 0) {
        return <div className="p-4 text-center text-gray-500">No data available</div>;
    }

    return (
        <div className="bg-white p-4 rounded-lg shadow-sm w-full h-full flex flex-col">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
                Temporal Evolution ({field1}, {field2}, {field3})
            </h3>
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

export default MultiPanelTemporalPlot;
