'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, memo } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';
import { MainEventInfo, calculateOmoriParameters, OptimizationMethod } from '@/lib/analysis/omori';

interface CumulativeAftershockPlotProps {
    earthquakes: EarthquakeData[];
    mainEvent?: MainEventInfo;
    optimizationMethod?: OptimizationMethod;
    magnitudeCompleteness?: number;
}

const CumulativeAftershockPlot = memo(function CumulativeAftershockPlot({
    earthquakes,
    mainEvent: providedMainEvent,
    optimizationMethod = 'hybrid',
    magnitudeCompleteness
}: CumulativeAftershockPlotProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);

    const { cumulativeData, mainEvent, totalEvents, omoriParams, fittedData } = useMemo(() => {
        if (!earthquakes || earthquakes.length === 0) {
            return { cumulativeData: [], mainEvent: null, totalEvents: 0, omoriParams: null, fittedData: [] };
        }

        // Determine the main event
        let mainEventInfo: MainEventInfo;
        let mainEventTime: number;

        if (providedMainEvent) {
            // Use the provided main event
            mainEventInfo = providedMainEvent;
            mainEventTime = providedMainEvent.time.getTime();
        } else {
            // Find main event (largest magnitude) if not provided
            const sorted = [...earthquakes].sort((a, b) => {
                const timeA = a.timeMs ?? a.time.getTime();
                const timeB = b.timeMs ?? b.time.getTime();
                return timeA - timeB;
            });

            let mainEventIndex = 0;
            let maxMagnitude = sorted[0].magnitude;

            sorted.forEach((eq, idx) => {
                if (eq.magnitude > maxMagnitude) {
                    maxMagnitude = eq.magnitude;
                    mainEventIndex = idx;
                }
            });

            const mainEventEq = sorted[mainEventIndex];
            mainEventTime = mainEventEq.timeMs ?? mainEventEq.time.getTime();

            mainEventInfo = {
                time: mainEventEq.time,
                magnitude: mainEventEq.magnitude,
                name: `M${mainEventEq.magnitude.toFixed(1)} at ${mainEventEq.time.toISOString().split('T')[0]}`,
                latitude: mainEventEq.latitude,
                longitude: mainEventEq.longitude
            };
        }

        // Calculate cumulative counts and days since main event
        // Filter and collect aftershocks (events after mainshock)
        const aftershocks: { day: number }[] = [];

        earthquakes.forEach(eq => {
            const eqTime = eq.timeMs ?? eq.time.getTime();
            const daysSinceMain = (eqTime - mainEventTime) / (1000 * 60 * 60 * 24);

            // Only count events after the main event (aftershocks only)
            if (daysSinceMain > 0) {
                aftershocks.push({ day: daysSinceMain });
            }
        });

        // Sort aftershocks by time
        aftershocks.sort((a, b) => a.day - b.day);

        // Build cumulative count: number of aftershocks observed up to time t
        const cumulative: [number, number][] = [];
        aftershocks.forEach((as, i) => {
            cumulative.push([as.day, i + 1]); // i+1 because we start counting from 1
        });

        const count = aftershocks.length;

        // Calculate Omori parameters using the proper method
        const omoriResult = calculateOmoriParameters(earthquakes, mainEventInfo, 365, optimizationMethod, magnitudeCompleteness);

        // Generate fitted curve using Omori parameters
        const fitted: [number, number][] = [];
        if (cumulative.length > 0 && omoriResult) {
            const { K, c, p } = omoriResult;
            const maxDay = cumulative[cumulative.length - 1][0];
            const numPoints = 100;

            for (let i = 0; i <= numPoints; i++) {
                const t = (maxDay * i) / numPoints;
                let N;

                if (Math.abs(p - 1) > 0.001) {
                    const oneMinusP = 1 - p;
                    N = (K / oneMinusP) * (Math.pow(t + c, oneMinusP) - Math.pow(c, oneMinusP));
                } else {
                    N = K * Math.log((t + c) / c);
                }

                fitted.push([t, Math.max(1, N)]);
            }
        }

        return {
            cumulativeData: cumulative,
            mainEvent: mainEventInfo,
            totalEvents: count,
            omoriParams: omoriResult ? { K: omoriResult.K, c: omoriResult.c, p: omoriResult.p } : null,
            fittedData: fitted
        };
    }, [earthquakes, providedMainEvent, optimizationMethod, magnitudeCompleteness]);

    const chartOptions: Highcharts.Options = useMemo(() => {
        if (cumulativeData.length === 0) {
            return {
                chart: { type: 'line', height: 400 },
                title: { text: '' },
                credits: { enabled: false },
                series: []
            };
        }

        return {
            chart: {
                type: 'line',
                height: 500,
                backgroundColor: '#FFFFFF',
                style: {
                    fontFamily: '"DejaVu Sans", Arial, sans-serif'
                }
            },
            title: {
                text: ''
            },
            credits: {
                enabled: false
            },
            xAxis: {
                title: {
                    text: 'Time [Days after mainshock]',
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
                title: {
                    text: 'Number of events',
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
                style: { fontSize: '11px' },
                formatter: function(this: any) {
                    return `<b>Days:</b> ${this.x?.toFixed(1)}<br/><b>Events:</b> ${this.y?.toFixed(0)}`;
                }
            },
            plotOptions: {
                line: {
                    marker: {
                        enabled: false
                    },
                    lineWidth: 2
                }
            },
            series: [
                {
                    type: 'line',
                    name: 'Observed Data',
                    data: cumulativeData,
                    color: '#4169E1', // Royal blue
                    lineWidth: 2.5,
                    zIndex: 2
                },
                {
                    type: 'line',
                    name: 'Modified Omori Law',
                    data: fittedData,
                    color: '#DC143C', // Crimson red
                    lineWidth: 2.5,
                    dashStyle: 'Dash',
                    marker: { enabled: false },
                    zIndex: 1
                }
            ],
            accessibility: {
                enabled: true,
                description: 'Cumulative number of earthquakes over time since mainshock with Modified Omori Law fit'
            }
        };
    }, [cumulativeData, fittedData]);

    if (!mainEvent) {
        return (
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Cumulative Aftershocks</h3>
                <p className="text-gray-500">Insufficient data for analysis</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Cumulative Aftershocks</h3>

            <div className="h-[500px] w-full">
                <HighchartsReact
                    highcharts={Highcharts}
                    options={chartOptions}
                    ref={chartRef}
                />
            </div>

            <div className="mt-4 text-sm text-gray-600">
                {/* <p>
                    Cumulative number of observed aftershocks versus time (in days) elapsed from the main shock
                    {mainEvent.latitude !== undefined && mainEvent.longitude !== undefined &&
                        ` at (${mainEvent.latitude.toFixed(2)}°, ${mainEvent.longitude.toFixed(2)}°)`
                    }.
                </p> */}
                {omoriParams && (
                    <div className="mt-3 bg-gray-50 p-3 rounded border border-gray-200">
                        <p className="font-semibold mb-2">Fitted Modified Omori Law Parameters:</p>
                        <p className="mb-1">
                            <strong>K</strong> = {omoriParams.K.toFixed(2)},
                            <strong> c</strong> = {omoriParams.c.toFixed(3)} days,
                            <strong> p</strong> = {omoriParams.p.toFixed(2)}
                        </p>
                        <p className="text-xs mt-2 text-gray-600">
                            N(t) = K/(1-p) × [(t+c)^(1-p) - c^(1-p)]
                        </p>
                    </div>
                )}
            </div>

            <ChartExportButtons
                chartRef={chartRef}
                data={earthquakes}
                filename="cumulative-aftershocks"
            />
        </div>
    );
});

export default CumulativeAftershockPlot;
