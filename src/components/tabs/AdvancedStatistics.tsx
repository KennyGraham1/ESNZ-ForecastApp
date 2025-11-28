'use client';

import { EarthquakeData } from '@/types/earthquake';
import GutenbergRichterPlot from '@/components/GutenbergRichterPlot';
import DepthProfilePlot from '@/components/DepthProfilePlot';
import ThreeDVisualization from '@/components/ThreeDVisualization';
import MagnitudeDistribution from '@/components/MagnitudeDistribution';
import SpatialClusteringPlot from '@/components/SpatialClusteringPlot';
import TemporalStatistics from '@/components/TemporalStatistics';

interface AdvancedStatisticsProps {
    earthquakes: EarthquakeData[];
}

export default function AdvancedStatistics({ earthquakes }: AdvancedStatisticsProps) {
    return (
        <div className="space-y-6">
            {/* Header Section */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-200 shadow-sm">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Advanced Statistical Analysis</h2>
                <p className="text-gray-600">Explore advanced seismological analysis tools and statistical methods. Each panel is independently scrollable.</p>
            </div>

            {/* Panel 1: Gutenberg-Richter Relationship */}
            <div className="bg-white rounded-xl shadow-lg border-2 border-gray-300 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 border-b-2 border-gray-300">
                    <h3 className="text-2xl font-bold text-white mb-1">📊 Gutenberg-Richter Relationship</h3>
                    <p className="text-sm text-blue-100">Frequency-magnitude distribution analysis</p>
                </div>
                <div className="p-6 max-h-[600px] overflow-y-auto">
                    <GutenbergRichterPlot earthquakes={earthquakes} />
                </div>
            </div>

            {/* Panel 2: Depth Profile */}
            <div className="bg-white rounded-xl shadow-lg border-2 border-gray-300 overflow-hidden">
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4 border-b-2 border-gray-300">
                    <h3 className="text-2xl font-bold text-white mb-1">🌊 Depth Profile</h3>
                    <p className="text-sm text-green-100">Earthquake depth distribution vs. latitude</p>
                </div>
                <div className="p-6 max-h-[600px] overflow-y-auto">
                    <DepthProfilePlot earthquakes={earthquakes} />
                </div>
            </div>

            {/* Panel 3: Magnitude Distribution */}
            <div className="bg-white rounded-xl shadow-lg border-2 border-gray-300 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-500 to-violet-600 px-6 py-4 border-b-2 border-gray-300">
                    <h3 className="text-2xl font-bold text-white mb-1">📈 Magnitude Distribution</h3>
                    <p className="text-sm text-purple-100">Histogram of earthquake magnitudes</p>
                </div>
                <div className="p-6 max-h-[600px] overflow-y-auto">
                    <MagnitudeDistribution earthquakes={earthquakes} />
                </div>
            </div>

            {/* Panel 4: Spatial Clustering */}
            <div className="bg-white rounded-xl shadow-lg border-2 border-gray-300 overflow-hidden">
                <div className="bg-gradient-to-r from-orange-500 to-red-600 px-6 py-4 border-b-2 border-gray-300">
                    <h3 className="text-2xl font-bold text-white mb-1">🗺️ Spatial Clustering</h3>
                    <p className="text-sm text-orange-100">DBSCAN cluster analysis of earthquake locations</p>
                </div>
                <div className="p-6 max-h-[600px] overflow-y-auto">
                    <SpatialClusteringPlot earthquakes={earthquakes} />
                </div>
            </div>

            {/* Panel 5: Temporal Statistics (contains multiple sub-plots) */}
            <div className="bg-white rounded-xl shadow-lg border-2 border-gray-300 overflow-hidden">
                <div className="bg-gradient-to-r from-pink-500 to-rose-600 px-6 py-4 border-b-2 border-gray-300">
                    <h3 className="text-2xl font-bold text-white mb-1">⏱️ Temporal Analysis</h3>
                    <p className="text-sm text-pink-100">Time-based statistics and frequency analysis</p>
                </div>
                <div className="p-6 max-h-[800px] overflow-y-auto">
                    <TemporalStatistics earthquakes={earthquakes} />
                </div>
            </div>

            {/* Panel 6: 3D Visualization */}
            <div className="bg-white rounded-xl shadow-lg border-2 border-gray-300 overflow-hidden">
                <div className="bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-4 border-b-2 border-gray-300">
                    <h3 className="text-2xl font-bold text-white mb-1">🌍 3D Visualization</h3>
                    <p className="text-sm text-cyan-100">Interactive 3D scatter plot of earthquake locations</p>
                </div>
                <div className="p-6 max-h-[700px] overflow-y-auto">
                    <ThreeDVisualization earthquakes={earthquakes} />
                </div>
            </div>
        </div>
    );
}
