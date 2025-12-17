'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, memo } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import { HIGHCHARTS_CONFIG } from '@/config/performance';

interface GenericScatterPlotProps {
    earthquakes: EarthquakeData[];
    xAxisField: keyof EarthquakeData;
    yAxisField: keyof EarthquakeData;
    colorField?: keyof EarthquakeData;
    colorPalette?: string[];
    pointSize?: number;
    sizeField?: keyof EarthquakeData; // NEW: Field to control bubble size
    fullDataForExport?: EarthquakeData[]; // NEW: Full dataset for high-res export
    xLabel?: string;
    yLabel?: string;
    title?: string;
}

const GenericScatterPlot = memo(function GenericScatterPlot({
    earthquakes,
    xAxisField,
    yAxisField,
    colorField,
    colorPalette,
    pointSize = 3,
    sizeField,
    fullDataForExport,
    xLabel,
    yLabel,
    title = 'Scatter Plot'
}: GenericScatterPlotProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);

    const chartOptions: Highcharts.Options = useMemo(() => {
        // Pre-calculate size scaling if sizeField is present
        let getSize = (val: number) => pointSize;
        if (sizeField) {
            const values = earthquakes.map(eq => {
                const v = eq[sizeField];
                return typeof v === 'number' ? v : 0;
            });
            const minS = Math.min(...values);
            const maxS = Math.max(...values);
            // Linear scaling logic: map min-max value to 2px-20px radius
            getSize = (val: number) => {
                const norm = (val - minS) / (maxS - minS || 1);
                return 2 + norm * 18;
            };
        }

        // Helper to get units
        const getUnit = (field: string) => {
            const f = field.toString().toLowerCase();
            if (f.includes('depth')) return ' km';
            if (f.includes('mag')) return ' M';
            if (f.includes('lat') || f.includes('lon')) return '°';
            return '';
        };

        // Helper to safely get numeric value (handling dates)
        const getNumericValue = (val: any): number | null => {
            if (typeof val === 'number') return isNaN(val) ? null : val;
            if (val instanceof Date) return val.getTime();
            if (typeof val === 'string' && !isNaN(Date.parse(val))) return new Date(val).getTime();
            return null;
        };

        // Helper to check if field is time-related
        const isTimeField = (field: string) => {
            const f = field.toString().toLowerCase();
            return f === 'time' || f.includes('date') || f.includes('timems');
        };

        const isXTime = isTimeField(xAxisField.toString());
        const isYTime = isTimeField(yAxisField.toString());
        const isColorTime = colorField ? isTimeField(colorField.toString()) : false;

        const xUnit = getUnit(xAxisField.toString());
        const yUnit = getUnit(yAxisField.toString());

        // Generate series data
        const data = earthquakes.map(eq => {
            const x = eq[xAxisField];
            const y = eq[yAxisField];

            // Handle different types of values (dates, numbers)
            const xVal = getNumericValue(x);
            const yVal = getNumericValue(y);

            // Basic validation
            if (xVal === null || yVal === null) {
                return null;
            }

            const point: any = {
                x: xVal,
                y: yVal,
                custom: { eventID: eq.eventID }
            };

            // Optional color by value
            if (colorField) {
                const cVal = getNumericValue(eq[colorField]);
                if (cVal !== null) {
                    point.colorValue = cVal;
                }
            }

            // Optional size by value
            if (sizeField) {
                const s = eq[sizeField];
                const sVal = typeof s === 'number' ? s : 0;
                point.z = sVal; // Use 'z' for size usually in bubble charts, but for scatter marker radius:
                point.marker = { radius: getSize(sVal) };
            }

            return point;
        }).filter((p): p is any => p !== null);

        // Calculate ranges for color axis if needed
        let minColorVal: number | undefined;
        let maxColorVal: number | undefined;

        if (colorField) {
            const colorValues = earthquakes
                .map(eq => getNumericValue(eq[colorField]))
                .filter(v => v !== null) as number[];

            if (colorValues.length > 0) {
                minColorVal = Math.min(...colorValues);
                maxColorVal = Math.max(...colorValues);
            }
        }

        return {
            chart: {
                type: 'scatter',
                zoomType: 'xy',
                height: 600,
                backgroundColor: '#ffffff',
                style: { fontFamily: 'Instrument Sans, sans-serif' },
                spacing: [20, 20, 40, 20] // Increased bottom spacing for legend
            },
            exporting: {
                enabled: true,
                sourceWidth: 2400,
                sourceHeight: 1600,
                scale: 2, // Resulting image will be 4800x3200 (approx 15MP)
                chartOptions: {
                    style: { fontFamily: 'Arial, Helvetica, sans-serif' }, // Standard fonts for portable export
                    title: { style: { fontSize: '36px' } }, // Scale up title
                    legend: { itemStyle: { fontSize: '24px' }, title: { style: { fontSize: '24px' } } }, // Scale up legend
                    xAxis: {
                        labels: { style: { fontSize: '20px' } },
                        title: { style: { fontSize: '24px' } }
                    },
                    yAxis: {
                        labels: { style: { fontSize: '20px' } },
                        title: { style: { fontSize: '24px' } }
                    },
                    plotOptions: {
                        scatter: {
                            marker: {
                                // Scale up fixed points slightly for high-res
                                radius: pointSize * 2
                            }
                        }
                    },
                    ...(fullDataForExport ? {
                        series: [{
                            type: 'scatter',
                            data: fullDataForExport.map(eq => {
                                const xVal = getNumericValue(eq[xAxisField]);
                                const yVal = getNumericValue(eq[yAxisField]);
                                if (xVal === null || yVal === null) return null;

                                const point: any = { x: xVal, y: yVal };
                                if (colorField) {
                                    const cVal = getNumericValue(eq[colorField]);
                                    if (cVal !== null) point.colorValue = cVal;
                                }
                                if (sizeField) {
                                    const sVal = typeof eq[sizeField] === 'number' ? eq[sizeField] : 0;
                                    point.z = sVal;
                                    point.marker = { radius: getSize(sVal as number) };
                                }
                                return point;
                            }).filter(p => p !== null) as any
                        }]
                    } : {})
                }
            },
            title: { text: title, style: { fontSize: '18px', fontWeight: '600', color: '#111827' } },
            credits: { enabled: false },
            xAxis: {
                type: isXTime ? 'datetime' : 'linear',
                title: { text: xLabel || `${xAxisField.toString()}${xUnit ? ` (${xUnit.trim()})` : ''}`, style: { color: '#4B5563', fontWeight: '500' } },
                gridLineWidth: 0,
                gridLineColor: '#F3F4F6',
                lineColor: '#E5E7EB',
                tickColor: '#E5E7EB',
                startOnTick: true,
                endOnTick: true,
                showLastLabel: true,
                labels: { style: { color: '#6B7280' } },
                crosshair: {
                    width: 1,
                    color: '#9ca3af',
                    dashStyle: 'Dash'
                }
            },
            yAxis: {
                type: isYTime ? 'datetime' : 'linear',
                title: { text: yLabel || `${yAxisField.toString()}${yUnit ? ` (${yUnit.trim()})` : ''}`, style: { color: '#4B5563', fontWeight: '500' } },
                gridLineWidth: 0,
                gridLineColor: '#F3F4F6',
                labels: { style: { color: '#6B7280' } },
                reversed: yAxisField === 'depth',
                crosshair: {
                    width: 1,
                    color: '#9ca3af',
                    dashStyle: 'Dash'
                }
            },
            legend: {
                enabled: !!colorField,
                title: { text: colorField ? `${colorField.toString()}${getUnit(colorField.toString())}` : '' },
                align: 'right',
                verticalAlign: 'middle',
                layout: 'vertical',
                itemStyle: { fontSize: '12px' },
                symbolHeight: 300
            },
            colorAxis: colorField ? {
                type: (isColorTime ? 'datetime' : 'linear') as any,
                min: minColorVal,
                max: maxColorVal,
                minColor: colorPalette ? undefined : '#4ADE80',
                maxColor: colorPalette ? undefined : '#EF4444',
                stops: colorPalette ? colorPalette.map((color, i) => [i / (colorPalette.length - 1), color]) : undefined,
                labels: {
                    format: isColorTime ? undefined : `{value}${getUnit(colorField.toString())}`,
                    style: { color: '#6B7280' }
                },
                showsInLegend: true // Explicitly show this color axis in the legend
            } : undefined,
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
                    let xStr = this.x?.toString() || '';
                    if (isXTime && typeof this.x === 'number') {
                        xStr = new Date(this.x).toISOString().slice(0, 19).replace('T', ' ');
                    } else if (typeof this.x === 'number') {
                        xStr = this.x.toFixed(2) + xUnit;
                    }


                    let yStr = '';
                    if (isYTime && typeof this.y === 'number') {
                        yStr = new Date(this.y).toISOString().slice(0, 19).replace('T', ' ');
                    } else {
                        yStr = (typeof this.y === 'number' ? this.y.toFixed(2) : this.y) + yUnit;
                    }

                    const cVal = this.colorValue;
                    const cStr = typeof cVal === 'number' ? cVal.toFixed(2) + (colorField ? getUnit(colorField.toString()) : '') : '';
                    const eventID = this.custom?.eventID || 'N/A';

                    let tooltipHtml = `<div style="font-family: inherit;">
                        <div style="font-weight: 600; color: #111827; margin-bottom: 2px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px;">Example Event</div>
                        <div style="font-size: 10px; color: #9CA3AF; margin-bottom: 6px;">ID: ${eventID}</div>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 2px 8px 2px 0; color: #6B7280;">${xLabel || xAxisField}:</td>
                                <td style="padding: 2px 0; font-weight: 500; text-align: right;">${xStr}</td>
                            </tr>
                            <tr>
                                <td style="padding: 2px 8px 2px 0; color: #6B7280;">${yLabel || yAxisField}:</td>
                                <td style="padding: 2px 0; font-weight: 500; text-align: right;">${yStr}</td>
                            </tr>`;

                    if (colorField && cStr) {
                        tooltipHtml += `<tr>
                                <td style="padding: 2px 8px 2px 0; color: #6B7280;">${colorField}:</td>
                                <td style="padding: 2px 0; font-weight: 500; text-align: right;">${cStr}</td>
                            </tr>`;
                    }

                    if (sizeField && typeof this.z === 'number') {
                        tooltipHtml += `<tr>
                                <td style="padding: 2px 8px 2px 0; color: #6B7280;">${sizeField}:</td>
                                <td style="padding: 2px 0; font-weight: 500; text-align: right;">${this.z.toFixed(2)}${getUnit(sizeField.toString())}</td>
                            </tr>`;
                    }

                    tooltipHtml += `</table></div>`;
                    return tooltipHtml;
                }
            },
            plotOptions: {
                scatter: {
                    marker: {
                        radius: pointSize,
                        symbol: 'circle',
                        lineColor: '#FFFFFF',
                        lineWidth: 0.5,
                        states: {
                            hover: {
                                enabled: true,
                                lineColor: '#111827',
                                lineWidth: 1
                            }
                        }
                    }
                },
                series: {
                    boostThreshold: HIGHCHARTS_CONFIG.BOOST_THRESHOLD,
                    turboThreshold: 50000
                }
            },
            boost: {
                useGPUTranslations: true,
                usePreallocated: true
            },
            series: [{
                type: 'scatter',
                name: 'Events',
                data: data,
                colorKey: 'colorValue',
                color: !colorField ? 'rgba(79, 70, 229, 0.6)' : undefined, // Indigo-600 with opacity
                marker: {
                    symbol: 'circle'
                }
            }]
        };
    }, [earthquakes, xAxisField, yAxisField, colorField, colorPalette, pointSize, sizeField, xLabel, yLabel, title]);

    return (
        <div className="w-full h-full">
            <HighchartsReact
                highcharts={Highcharts}
                options={chartOptions}
                ref={chartRef}
            />
        </div>
    );
});

export default GenericScatterPlot;
