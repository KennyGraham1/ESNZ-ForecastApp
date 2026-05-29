'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, memo } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';
import { calculateGutenbergRichter } from '@/lib/analysis/gutenbergRichter';

interface TemporalCompletenessPlotProps {
    earthquakes: EarthquakeData[];
}

/**
 * Rolling-window magnitude of completeness Mc(t) and Gutenberg-Richter b-value
 * b(t) over time. Each window's b is the Aki-Utsu MLE with a Shi & Bolt (1982)
 * uncertainty band; Mc is the maximum-curvature estimate. Useful for spotting
 * catalog-quality changes (network upgrades, aftershock incompleteness) and
 * temporal b-value variations.
 */
const TemporalCompletenessPlot = memo(function TemporalCompletenessPlot({ earthquakes }: TemporalCompletenessPlotProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);

    const options: Highcharts.Options | null = useMemo(() => {
        const sorted = [...earthquakes]
            .map(eq => ({
                t: eq.timeMs !== undefined ? eq.timeMs : (eq.time instanceof Date ? eq.time.getTime() : new Date(eq.time).getTime()),
                eq,
            }))
            .filter(d => Number.isFinite(d.t))
            .sort((a, b) => a.t - b.t);

        const n = sorted.length;
        // Need enough events to form several stable windows.
        if (n < 200) return null;

        const windowSize = Math.min(500, Math.max(100, Math.floor(n / 10)));
        const step = Math.max(1, Math.floor(windowSize / 4));

        const bBand: [number, number, number][] = []; // [time, b-σ, b+σ]
        const bLine: [number, number][] = [];
        const mcLine: [number, number][] = [];

        for (let start = 0; start + windowSize <= n; start += step) {
            const windowSlice = sorted.slice(start, start + windowSize);
            const gr = calculateGutenbergRichter(windowSlice.map(d => d.eq), { completenessMethod: 'maximum_curvature' });
            if (!gr) continue;
            const centerTime = windowSlice[Math.floor(windowSize / 2)].t;
            bLine.push([centerTime, gr.bValue]);
            mcLine.push([centerTime, gr.magnitudeOfCompleteness]);
            if (Number.isFinite(gr.bUncertainty)) {
                bBand.push([centerTime, gr.bValue - gr.bUncertainty, gr.bValue + gr.bUncertainty]);
            }
        }

        if (bLine.length < 2) return null;

        return {
            chart: { type: 'line', height: 380, zooming: { type: 'x' } },
            title: { text: '' },
            credits: { enabled: false },
            exporting: { enabled: false },
            xAxis: { type: 'datetime', title: { text: 'Date (window center)' } },
            yAxis: [
                { title: { text: 'b-value' }, gridLineColor: '#E5E7EB' },
                { title: { text: 'Mc (magnitude of completeness)' }, opposite: true },
            ],
            tooltip: { shared: true, xDateFormat: '%Y-%m-%d', valueDecimals: 2 },
            series: [
                {
                    type: 'arearange',
                    name: 'b ± σ (Shi & Bolt 1982)',
                    data: bBand,
                    yAxis: 0,
                    color: 'rgba(70, 130, 180, 0.25)',
                    lineWidth: 0,
                    marker: { enabled: false },
                    enableMouseTracking: false,
                    zIndex: 0,
                },
                {
                    type: 'line',
                    name: 'b-value (Aki MLE)',
                    data: bLine,
                    yAxis: 0,
                    color: '#4682B4',
                    lineWidth: 2,
                    marker: { enabled: false },
                    zIndex: 1,
                },
                {
                    type: 'line',
                    name: 'Mc (max curvature)',
                    data: mcLine,
                    yAxis: 1,
                    color: '#DC143C',
                    lineWidth: 2,
                    dashStyle: 'ShortDash',
                    marker: { enabled: false },
                    zIndex: 1,
                },
            ],
        };
    }, [earthquakes]);

    if (!options) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500 text-lg">Insufficient data for temporal completeness</p>
                <p className="text-gray-400 text-sm mt-2">At least 200 events are required for rolling-window b/Mc estimates</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <div className="h-[400px] w-full">
                <HighchartsReact
                    key={`temporal-completeness-${earthquakes.length}`}
                    highcharts={Highcharts}
                    options={options}
                    ref={chartRef}
                />
            </div>
            <ChartExportButtons chartRef={chartRef} data={earthquakes} filename="temporal-completeness-b-stability" />
        </div>
    );
});

export default TemporalCompletenessPlot;
