'use client';

import { EarthquakeData } from '@/types/earthquake';
import Statistics from '@/components/Statistics';
import TemporalAnalysis from '@/components/TemporalAnalysis';
import dynamic from 'next/dynamic';

const MapComponent = dynamic(() => import('@/components/Map'), {
    ssr: false,
    loading: () => <div className="h-[600px] w-full bg-gray-100 animate-pulse rounded-lg flex items-center justify-center">Loading Map...</div>
});

interface BasicDashboardProps {
    earthquakes: EarthquakeData[];
}

export default function BasicDashboard({ earthquakes }: BasicDashboardProps) {
    return (
        <div className="space-y-6">
            {/* Statistics Cards */}
            <Statistics earthquakes={earthquakes} />

            {/* Map Section - Full Width Panel */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                <div className="mb-4">
                    <h2 className="text-2xl font-bold text-gray-800 mb-1">Earthquake Map</h2>
                    <p className="text-sm text-gray-500">Interactive map showing earthquake locations across New Zealand</p>
                </div>
                <MapComponent earthquakes={earthquakes} />
            </div>

            {/* Temporal Analysis Section - Each chart in its own panel */}
            <TemporalAnalysis earthquakes={earthquakes} />
        </div>
    );
}
