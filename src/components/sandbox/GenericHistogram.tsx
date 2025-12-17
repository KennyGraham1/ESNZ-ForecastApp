'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, memo } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import { safeMin, safeMax } from '@/utils/arrayMath';

interface GenericHistogramProps {
    earthquakes: EarthquakeData[];
    fields: ('magnitude' | 'depth' | 'time' | 'latitude' | 'longitude' | 'hour' | 'gap')[];
    bins?: number;
    title?: string;
}

const GenericHistogram = memo(function GenericHistogram({
    earthquakes,
    fields,
    bins = 20,
    title
}: GenericHistogramProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);

    const chartOptions: Highcharts.Options = useMemo(() => {
        if (!earthquakes.length || fields.length === 0) return { title: { text: '' } };

        const series: Highcharts.SeriesOptionsType[] = [];

        // Define premium colors for overlay (Indigo, Emerald, Amber, Rose)
        const colors = [
            { fill: 'rgba(79, 70, 229, 0.7)', border: '#4338ca' },  // Indigo
            { fill: 'rgba(5, 150, 105, 0.7)', border: '#047857' },  // Emerald
            { fill: 'rgba(217, 119, 6, 0.7)', border: '#b45309' },  // Amber
            { fill: 'rgba(225, 29, 72, 0.7)', border: '#be123c' }   // Rose
        ];

        fields.forEach((field, fIndex) => {
            let values: number[] = [];
            let name = field.charAt(0).toUpperCase() + field.slice(1);

            if (field === 'time') {
                values = earthquakes.map(eq => new Date(eq.time).getTime()).filter(v => !isNaN(v));
            } else if (field === 'hour') {
                values = earthquakes.map(eq => new Date(eq.time).getHours());
                name = 'Hour of Day';
            } else if (field === 'gap') {
                const sortedTimes = earthquakes
                    .map(eq => new Date(eq.time).getTime())
                    .sort((a, b) => a - b);
                values = [];
                for (let i = 1; i < sortedTimes.length; i++) {
                    values.push((sortedTimes[i] - sortedTimes[i - 1]) / 60000);
                }
                name = 'Inter-event Time (min)';
            } else {
                values = earthquakes.map(eq => eq[field]).filter(v => typeof v === 'number' && !isNaN(v)) as number[];
            }

            if (!values.length) return;

            const min = safeMin(values);
            const max = safeMax(values);

            // For 'hour', we want exactly integers 0..23
            const isDiscrete = field === 'hour';
            const numBins = isDiscrete ? 24 : bins;
            const binSize = isDiscrete ? 1 : (max - min) / numBins;

            const histogramData = new Array(numBins).fill(0);
            const binEdges = new Array(numBins + 1).fill(0).map((_, i) => min + i * binSize);

            values.forEach(v => {
                const binIndex = Math.min(
                    Math.floor((v - min) / binSize),
                    numBins - 1
                );
                if (binIndex >= 0) histogramData[binIndex]++;
            });

            const seriesData = histogramData.map((count, i) => {
                let binName = `${binEdges[i].toFixed(1)} - ${binEdges[i + 1].toFixed(1)}`;

                if (field === 'hour') {
                    binName = `${Math.floor(binEdges[i])}:00 - ${Math.floor(binEdges[i]) + 1}:00`;
                } else if (field === 'time') {
                    const d1 = new Date(binEdges[i]);
                    const d2 = new Date(binEdges[i + 1]);
                    // Format as "Jan 1, 2024" or shorter depending on range
                    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                    binName = `${fmt(d1)} - ${fmt(d2)}`;
                }

                return {
                    x: binEdges[i] + binSize / 2,
                    y: count,
                    name: binName
                };
            });

            const colorSet = colors[fIndex % colors.length];

            series.push({
                type: 'column',
                name: name,
                data: seriesData,
                color: colorSet.fill,
                borderColor: colorSet.border,
                borderWidth: 1,
                pointPadding: 0,
                groupPadding: 0,
                shadow: false
            });
        });

        // Helper to get units
        const getUnit = (field: string) => {
            const f = field.toString().toLowerCase();
            if (f.includes('depth')) return ' km';
            if (f.includes('mag')) return ' M';
            if (f.includes('lat') || f.includes('lon')) return '°';
            if (f.includes('gap')) return ' min';
            return '';
        };

        const isTime = fields.includes('time');

        return {
            chart: {
                type: 'column',
                height: 400,
                backgroundColor: 'transparent',
                style: { fontFamily: 'Instrument Sans, sans-serif' },
                spacing: [20, 20, 20, 20]
            },
            title: { text: title || 'Distribution Analysis', style: { fontSize: '18px', fontWeight: '600', color: '#111827' } },
            credits: { enabled: false },
            xAxis: {
                type: isTime && fields.length === 1 ? 'datetime' : 'linear',
                title: {
                    text: fields.length > 1 ? 'Value' : `${fields[0].charAt(0).toUpperCase() + fields[0].slice(1)}${getUnit(fields[0])}`,
                    style: { color: '#4B5563', fontWeight: '500' }
                },
                crosshair: {
                    color: '#9CA3AF',
                    dashStyle: 'Dash',
                    width: 1
                },
                gridLineWidth: 0,
                lineColor: '#E5E7EB',
                tickColor: '#E5E7EB',
                labels: { style: { color: '#6B7280' } }
            },
            yAxis: {
                title: { text: 'Count', style: { color: '#4B5563', fontWeight: '500' } },
                gridLineWidth: 0,
                labels: { style: { color: '#6B7280' } }
            },
            legend: {
                enabled: true,
                itemStyle: { color: '#374151', fontSize: '13px', fontWeight: '500' },
                itemHoverStyle: { color: '#111827' }
            },
            tooltip: {
                shared: true,
                useHTML: true,
                backgroundColor: 'rgba(255, 255, 255, 0.96)',
                borderColor: '#E5E7EB',
                borderRadius: 8,
                shadow: true,
                padding: 12,
                style: { color: '#374151', fontSize: '13px' },
                headerFormat: '<div style="font-weight: 600; color: #111827; padding-bottom: 4px; border-bottom: 1px solid #E5E7EB; margin-bottom: 6px;">Bin: {point.key}</div>',
                pointFormat: `<div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 4px;">
                    <span style="color:{point.color}">● {series.name}</span>
                    <span style="font-weight: 600; font-variant-numeric: tabular-nums;">{point.y}</span>
                </div>`
            },
            plotOptions: {
                column: {
                    grouping: false,
                    shadow: false,
                    borderRadius: 2,
                    pointPadding: 0,
                    groupPadding: 0,
                    borderWidth: 1
                }
            },
            series: series
        };
    }, [earthquakes, fields, bins, title]);

    return (
        <div className="w-full h-full">
            <HighchartsReact
                highcharts={Highcharts}
                options={chartOptions}
                ref={chartRef}
                key={`${fields.join('-')}-${bins}`} // Force remount on config change
            />
        </div>
    );
});

export default GenericHistogram;
