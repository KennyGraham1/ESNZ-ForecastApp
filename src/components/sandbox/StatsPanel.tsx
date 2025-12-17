'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo } from 'react';

interface StatsPanelProps {
    earthquakes: EarthquakeData[];
}

export default function StatsPanel({ earthquakes }: StatsPanelProps) {
    const stats = useMemo(() => {
        if (!earthquakes || earthquakes.length === 0) {
            return null;
        }

        const count = earthquakes.length;
        const magnitudes = earthquakes.map(eq => eq.magnitude);
        const depths = earthquakes.map(eq => eq.depth);
        const maxMag = Math.max(...magnitudes);
        const minDepth = Math.min(...depths);
        const maxDepth = Math.max(...depths);

        return {
            count: count.toLocaleString(),
            maxMag: maxMag.toFixed(1),
            depthRange: `${minDepth.toFixed(0)} - ${maxDepth.toFixed(0)} km`
        };
    }, [earthquakes]);

    if (!stats) return null;

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-4">
            <div className="p-3 bg-blue-50 rounded-lg text-center">
                <div className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Events</div>
                <div className="text-2xl font-bold text-blue-900">{stats.count}</div>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg text-center">
                <div className="text-xs text-purple-600 font-semibold uppercase tracking-wider">Max Mag</div>
                <div className="text-2xl font-bold text-purple-900">{stats.maxMag}</div>
            </div>
            <div className="p-3 bg-teal-50 rounded-lg text-center">
                <div className="text-xs text-teal-600 font-semibold uppercase tracking-wider">Depth Range</div>
                <div className="text-lg font-bold text-teal-900 mt-1">{stats.depthRange}</div>
            </div>
        </div>
    );
}
