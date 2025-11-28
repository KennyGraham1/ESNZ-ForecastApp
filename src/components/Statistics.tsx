import { EarthquakeData } from '@/types/earthquake';
import { Activity, Layers, MapPin } from 'lucide-react';
import { memo } from 'react';

interface StatisticsProps {
    earthquakes: EarthquakeData[];
}

const Statistics = memo(function Statistics({ earthquakes }: StatisticsProps) {
    const totalCount = earthquakes.length;

    const maxMagnitude = earthquakes.length > 0
        ? Math.max(...earthquakes.map(eq => eq.magnitude))
        : 0;

    const avgDepth = earthquakes.length > 0
        ? earthquakes.reduce((sum, eq) => sum + eq.depth, 0) / earthquakes.length
        : 0;

    const stats = [
        {
            label: 'Total Earthquakes',
            value: totalCount.toLocaleString(),
            icon: Activity,
            color: 'text-blue-600',
            bgColor: 'bg-blue-100'
        },
        {
            label: 'Max Magnitude',
            value: `M${maxMagnitude.toFixed(1)}`,
            icon: Layers,
            color: 'text-red-600',
            bgColor: 'bg-red-100'
        },
        {
            label: 'Avg Depth',
            value: `${avgDepth.toFixed(1)} km`,
            icon: MapPin,
            color: 'text-green-600',
            bgColor: 'bg-green-100'
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {stats.map((stat) => (
                <div
                    key={stat.label}
                    className="bg-white rounded-xl shadow-md border border-gray-200 p-6 flex items-center hover:shadow-lg transition-all duration-200 hover:scale-105"
                >
                    <div className={`p-4 rounded-xl ${stat.bgColor} mr-5 shadow-sm`}>
                        <stat.icon className={`w-7 h-7 ${stat.color}`} />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm text-gray-500 font-semibold uppercase tracking-wide mb-1">{stat.label}</p>
                        <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                    </div>
                </div>
            ))}
        </div>
    );
});

// Export memoized version to prevent unnecessary re-renders
export default Statistics;
