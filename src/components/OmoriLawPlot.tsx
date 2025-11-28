'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, memo } from 'react';
import { MainEventInfo, calculateOmoriParameters } from '@/lib/analysis/omori';
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

    const omoriParams = useMemo(() => {
        return calculateOmoriParameters(earthquakes, mainEvent, 365);
    }, [earthquakes, mainEvent]);

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
                height: 350
            },
            title: {
                text: '',
                style: {
                    fontSize: '14px'
                }
            },
            credits: {
                enabled: false
            },
            xAxis: {
                type: 'logarithmic',
                title: {
                    text: 'Days Since Mainshock'
                }
            },
            yAxis: {
                type: 'logarithmic',
                title: {
                    text: 'Aftershocks per Day'
                }
            },
            legend: {
                enabled: true,
                align: 'right',
                verticalAlign: 'top'
            },
            tooltip: {
                shared: false
            },
            series: [
                {
                    type: 'scatter',
                    name: 'Observed',
                    data: dailyCounts.map(d => [d.day, d.count]),
                    color: 'steelblue',
                    marker: {
                        radius: 4
                    }
                },
                {
                    type: 'line',
                    name: 'Omori Fit',
                    data: fittedCounts.map(d => [d.day, d.count]),
                    color: 'red',
                    lineWidth: 2,
                    marker: {
                        enabled: false
                    }
                }
            ],
            accessibility: {
                enabled: true,
                description: 'Log-log plot of daily aftershock rate with Omori law fit'
            }
        };
    }, [omoriParams]);

    const cumulativeOptions: Highcharts.Options = useMemo(() => {
        // Validate data before processing
        if (!omoriParams || !omoriParams.cumulativeCounts || omoriParams.cumulativeCounts.length === 0) {
            return {
                chart: { type: 'line', height: 350 },
                title: { text: '' },
                credits: { enabled: false },
                series: []
            };
        }

        const { cumulativeCounts } = omoriParams;

        return {
            chart: {
                type: 'line',
                height: 350
            },
            title: {
                text: '',
                style: {
                    fontSize: '14px'
                }
            },
            credits: {
                enabled: false
            },
            xAxis: {
                title: {
                    text: 'Days Since Mainshock'
                }
            },
            yAxis: {
                title: {
                    text: 'Cumulative Count'
                }
            },
            legend: {
                enabled: false
            },
            tooltip: {
                shared: false
            },
            series: [
                {
                    type: 'line',
                    name: 'Cumulative',
                    data: cumulativeCounts.map(d => [d.day, d.count]),
                    color: 'green',
                    lineWidth: 2,
                    marker: {
                        enabled: false
                    }
                }
            ],
            accessibility: {
                enabled: true,
                description: 'Cumulative count of aftershocks over time'
            }
        };
    }, [omoriParams]);

    if (!omoriParams) {
        return (
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Omori&apos;s Law Analysis</h3>
                <p className="text-gray-500">Insufficient aftershock data for analysis (minimum 10 events required)</p>
            </div>
        );
    }

    const { K, c, p, rSquared } = omoriParams;

    return (
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Omori&apos;s Law Analysis</h3>

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

            <div className="space-y-6">
                {/* Daily Rate Panel */}
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                    <h4 className="text-md font-semibold text-gray-700 mb-3">Daily Aftershock Rate</h4>
                    <div className="h-[350px]">
                        <HighchartsReact
                            highcharts={Highcharts}
                            options={dailyRateOptions}
                            ref={chartRef1}
                        />
                    </div>
                    <ChartExportButtons
                        chartRef={chartRef1}
                        data={earthquakes}
                        filename="omori-daily-rate"
                    />
                </div>

                {/* Cumulative Count Panel */}
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                    <h4 className="text-md font-semibold text-gray-700 mb-3">Cumulative Aftershocks</h4>
                    <div className="h-[350px]">
                        <HighchartsReact
                            highcharts={Highcharts}
                            options={cumulativeOptions}
                            ref={chartRef2}
                        />
                    </div>
                    <ChartExportButtons
                        chartRef={chartRef2}
                        data={earthquakes}
                        filename="omori-cumulative"
                    />
                </div>
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
