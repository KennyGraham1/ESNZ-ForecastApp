'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useState, useMemo } from 'react';
import OmoriLawPlot from '@/components/OmoriLawPlot';
import AftershockSequencePlot from '@/components/AftershockSequencePlot';
import GutenbergRichterPlot from '@/components/GutenbergRichterPlot';
import CumulativeAftershockPlot from '@/components/CumulativeAftershockPlot';
import { MainEventInfo, OptimizationMethod } from '@/lib/analysis/omori';

const historicalEvents = [
    {
        name: "2016 Kaikōura Earthquake",
        time: "2016-11-13T11:02:56Z",
        magnitude: 7.8,
        latitude: -42.693,
        longitude: 173.022,
        description: "M7.8 earthquake that struck the northeast coast of the South Island"
    },
    {
        name: "2011 Christchurch Earthquake",
        time: "2011-02-22T23:51:42Z",
        magnitude: 6.3,
        latitude: -43.583,
        longitude: 172.680,
        description: "Devastating M6.3 earthquake that caused 185 fatalities"
    },
    {
        name: "2010 Canterbury Earthquake",
        time: "2010-09-03T16:35:46Z",
        magnitude: 7.1,
        latitude: -43.522,
        longitude: 172.170,
        description: "M7.1 earthquake near Darfield"
    },
    {
        name: "2009 Dusky Sound Earthquake",
        time: "2009-07-15T09:22:29Z",
        magnitude: 7.8,
        latitude: -45.762,
        longitude: 166.562,
        description: "Powerful M7.8 earthquake in Fiordland"
    },
    {
        name: "2007 Gisborne Earthquake",
        time: "2007-12-20T07:55:15Z",
        magnitude: 6.7,
        latitude: -38.425,
        longitude: 178.052,
        description: "M6.7 offshore earthquake"
    },
    {
        name: "2003 Fiordland Earthquake",
        time: "2003-08-21T12:12:49Z",
        magnitude: 7.2,
        latitude: -45.207,
        longitude: 166.838,
        description: "M7.2 earthquake on Secretary Island"
    }
];

interface AftershockSequenceProps {
    earthquakes: EarthquakeData[];
}

export default function AftershockSequence({ earthquakes }: AftershockSequenceProps) {
    const [mainEventTime, setMainEventTime] = useState('');
    const [mainEventMag, setMainEventMag] = useState(5.0);
    const [mainEventName, setMainEventName] = useState('');
    const [mainEventLat, setMainEventLat] = useState<number | undefined>(undefined);
    const [mainEventLon, setMainEventLon] = useState<number | undefined>(undefined);
    const [showHistoricalEvents, setShowHistoricalEvents] = useState(false);
    const [isMainEventSectionExpanded, setIsMainEventSectionExpanded] = useState(true);

    // Shared Omori optimization parameters
    const [optimizationMethod, setOptimizationMethod] = useState<OptimizationMethod>('hybrid');
    const [magnitudeCompleteness, setMagnitudeCompleteness] = useState<number | undefined>(undefined);

    // Gardner-Knopoff declustering algorithm
    // Based on Gardner & Knopoff (1974) space-time window method
    const declusterEarthquakes = (events: EarthquakeData[]): EarthquakeData[] => {
        if (events.length === 0) return [];

        // Sort by magnitude descending (largest events are mainshocks)
        const sorted = [...events].sort((a, b) => b.magnitude - a.magnitude);

        // Track which events are dependent (aftershocks/foreshocks)
        const isDependentEvent = new Set<number>();

        // Gardner-Knopoff spatial window (km) based on magnitude
        const spatialWindow = (mag: number): number => {
            return Math.pow(10, 0.1238 * mag + 0.983);
        };

        // Gardner-Knopoff temporal window (days) based on magnitude
        const temporalWindow = (mag: number): number => {
            return Math.pow(10, 0.032 * mag + 2.7389);
        };

        // Haversine distance formula (km)
        const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
            const R = 6371; // Earth's radius in km
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                     Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                     Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        };

        // For each event (starting with largest)
        for (let i = 0; i < sorted.length; i++) {
            const mainEvent = sorted[i];

            // Skip if this event is already marked as dependent
            if (isDependentEvent.has(i)) continue;

            const mainTime = mainEvent.time instanceof Date ? mainEvent.time : new Date(mainEvent.time);
            if (isNaN(mainTime.getTime())) continue;

            const spatialWindowKm = spatialWindow(mainEvent.magnitude);
            const temporalWindowDays = temporalWindow(mainEvent.magnitude);

            // Check all other events
            for (let j = 0; j < sorted.length; j++) {
                if (i === j || isDependentEvent.has(j)) continue;

                const otherEvent = sorted[j];
                const otherTime = otherEvent.time instanceof Date ? otherEvent.time : new Date(otherEvent.time);
                if (isNaN(otherTime.getTime())) continue;

                // Calculate spatial distance
                const distance = haversineDistance(
                    mainEvent.latitude,
                    mainEvent.longitude,
                    otherEvent.latitude,
                    otherEvent.longitude
                );

                // Calculate temporal distance (in days)
                const timeDiffMs = Math.abs(otherTime.getTime() - mainTime.getTime());
                const timeDiffDays = timeDiffMs / (1000 * 60 * 60 * 24);

                // Mark as dependent if within space-time window
                if (distance <= spatialWindowKm && timeDiffDays <= temporalWindowDays) {
                    isDependentEvent.add(j);
                }
            }
        }

        // Return only independent events (mainshocks)
        return sorted.filter((_, idx) => !isDependentEvent.has(idx));
    };

    // Find recent significant earthquakes (M >= 5.5) with declustering
    const recentSignificantEarthquakes = useMemo(() => {
        // First filter by magnitude
        const significantEvents = earthquakes.filter(eq => eq.magnitude >= 5.5);

        // Apply Gardner-Knopoff declustering to get only independent mainshocks
        const declusteredEvents = declusterEarthquakes(significantEvents);

        // Sort by magnitude descending and take top 10
        return declusteredEvents
            .sort((a, b) => b.magnitude - a.magnitude)
            .slice(0, 10)
            .map(eq => {
                try {
                    const eqTime = eq.time instanceof Date ? eq.time : new Date(eq.time);
                    if (isNaN(eqTime.getTime())) return null;

                    return {
                        ...eq,
                        timeString: eqTime.toISOString().slice(0, 16), // Format for datetime-local
                        dateString: eqTime.toISOString().split('T')[0]
                    };
                } catch (e) {
                    return null;
                }
            })
            .filter((eq): eq is typeof earthquakes[0] & { timeString: string; dateString: string } => eq !== null);
    }, [earthquakes]);

    // Create main event info
    const mainEvent: MainEventInfo | null = useMemo(() => {
        if (!mainEventTime || !mainEventMag) return null;

        try {
            const time = new Date(mainEventTime);
            if (isNaN(time.getTime())) return null;

            // Use state variables if set (from historical events), otherwise try to find in catalog
            let latitude: number | undefined = mainEventLat;
            let longitude: number | undefined = mainEventLon;
            let depth: number | undefined;

            // If coordinates not set, search for matching earthquake in catalog
            if (latitude === undefined || longitude === undefined) {
                const matchingEq = earthquakes.find(eq => {
                    try {
                        const eqTime = eq.time instanceof Date ? eq.time : new Date(eq.time);
                        if (isNaN(eqTime.getTime())) return false;

                        const timeDiff = Math.abs(eqTime.getTime() - time.getTime());
                        const magDiff = Math.abs(eq.magnitude - mainEventMag);

                        // Match if within 1 minute and 0.5 magnitude
                        return timeDiff < 60000 && magDiff < 0.5;
                    } catch (e) {
                        return false;
                    }
                });

                if (matchingEq) {
                    latitude = matchingEq.latitude;
                    longitude = matchingEq.longitude;
                    depth = matchingEq.depth;
                }
            }

            return {
                time,
                magnitude: mainEventMag,
                name: mainEventName || `M${mainEventMag.toFixed(1)} Earthquake`,
                latitude,
                longitude,
                depth
            };
        } catch (e) {
            return null;
        }
    }, [mainEventTime, mainEventMag, mainEventName, mainEventLat, mainEventLon, earthquakes]);

    const handleSelectRecent = (eq: any) => {
        setMainEventTime(eq.timeString);
        setMainEventMag(eq.magnitude);
        setMainEventName(`M${eq.magnitude.toFixed(1)} - ${eq.dateString}`);
        setMainEventLat(eq.latitude);
        setMainEventLon(eq.longitude);
    };

    return (
        <div className="space-y-6">
            {/* Header Section */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-xl border border-purple-200">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Aftershock Sequence Analysis</h2>
                <p className="text-gray-600">Analyze aftershock sequences using Omori&apos;s Law and temporal patterns.</p>
            </div>

            {/* Main Event Selection Card - Collapsible */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                {/* Collapsible Header */}
                <button
                    onClick={() => setIsMainEventSectionExpanded(!isMainEventSectionExpanded)}
                    className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors duration-200 rounded-t-xl"
                >
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-gray-800">Main Event Selection</h3>
                        {mainEvent && !isMainEventSectionExpanded && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-300">
                                {mainEvent.name} - M{mainEvent.magnitude.toFixed(1)}
                            </span>
                        )}
                    </div>
                    <svg
                        className={`w-6 h-6 text-gray-600 transition-transform duration-200 ${isMainEventSectionExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {/* Collapsible Content */}
                {isMainEventSectionExpanded && (
                    <div className="px-6 pb-6 border-t border-gray-100">
                        <div className="pt-5">

                {recentSignificantEarthquakes.length > 0 ? (
                    <div className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                            <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide">
                                Recent Significant Earthquakes (M ≥ 5.5)
                            </label>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                                Declustered
                            </span>
                        </div>
                        <p className="text-xs text-gray-600 mb-3 italic">
                            Independent mainshocks only (Gardner-Knopoff declustering applied)
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {recentSignificantEarthquakes.map((eq, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleSelectRecent(eq)}
                                    className="text-left px-4 py-3 border-2 border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-500 transition-all duration-200 hover:shadow-md"
                                >
                                    <div className="font-bold text-lg text-blue-600">M{eq.magnitude.toFixed(1)}</div>
                                    <div className="text-sm text-gray-600 font-medium">{eq.dateString}</div>
                                    <div className="text-xs text-gray-500 truncate mt-1">
                                        {eq.locality || 'Location data unavailable'}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                        <p className="text-sm text-yellow-800 font-medium">
                            ⚠️ No significant earthquakes (M ≥ 5.5) found in the current dataset.
                        </p>
                    </div>
                )}

                <div className="mb-6">
                    <button
                        onClick={() => setShowHistoricalEvents(!showHistoricalEvents)}
                        className="w-full flex items-center justify-between text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide hover:text-purple-600 transition-colors duration-200"
                    >
                        <span>Historical New Zealand Earthquakes</span>
                        <svg
                            className={`w-5 h-5 transition-transform duration-200 ${showHistoricalEvents ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {showHistoricalEvents && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fadeIn">
                            {historicalEvents.map((eq, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        setMainEventTime(eq.time);
                                        setMainEventMag(eq.magnitude);
                                        setMainEventName(eq.name);
                                        setMainEventLat(eq.latitude);
                                        setMainEventLon(eq.longitude);
                                    }}
                                    className="text-left px-4 py-3 border-2 border-gray-300 rounded-lg hover:bg-purple-50 hover:border-purple-500 transition-all duration-200 hover:shadow-md h-full"
                                >
                                    <div className="font-bold text-sm text-purple-600">{eq.name}</div>
                                    <div className="text-xs text-gray-600 mt-1 font-medium">M{eq.magnitude} - {eq.time.split('T')[0]}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Main Event Time (UTC)
                        </label>
                        <input
                            type="datetime-local"
                            value={mainEventTime}
                            onChange={(e) => setMainEventTime(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">Format: YYYY-MM-DD HH:MM</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Main Event Magnitude
                        </label>
                        <input
                            type="number"
                            min="2"
                            max="10"
                            step="0.1"
                            value={mainEventMag}
                            onChange={(e) => setMainEventMag(parseFloat(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">Typical range: 4.0 - 8.0</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Event Name (Optional)
                        </label>
                        <input
                            type="text"
                            value={mainEventName}
                            onChange={(e) => setMainEventName(e.target.value)}
                            placeholder="e.g., Kaikoura Earthquake"
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">For labeling plots</p>
                    </div>
                </div>
                        </div>
                    </div>
                )}
            </div>

            {mainEvent ? (
                <div className="grid grid-cols-1 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                        <div className="mb-4">
                            <h3 className="text-xl font-bold text-gray-800 mb-1">Aftershock Sequence</h3>
                            <p className="text-sm text-gray-500">Temporal distribution of aftershocks</p>
                        </div>
                        <AftershockSequencePlot earthquakes={earthquakes} mainEvent={mainEvent} />
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                        <div className="mb-4">
                            <h3 className="text-xl font-bold text-gray-800 mb-1">Omori&apos;s Law Analysis</h3>
                            <p className="text-sm text-gray-500">Decay rate of aftershock activity</p>
                        </div>
                        <OmoriLawPlot
                            earthquakes={earthquakes}
                            mainEvent={mainEvent}
                            optimizationMethod={optimizationMethod}
                            magnitudeCompleteness={magnitudeCompleteness}
                            onOptimizationMethodChange={setOptimizationMethod}
                            onMagnitudeCompletenessChange={setMagnitudeCompleteness}
                        />
                    </div>

                    {/* Frequency-Magnitude and Cumulative Analysis Section - Side by Side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <GutenbergRichterPlot earthquakes={earthquakes} />
                        <CumulativeAftershockPlot
                            earthquakes={earthquakes}
                            mainEvent={mainEvent}
                            optimizationMethod={optimizationMethod}
                            magnitudeCompleteness={magnitudeCompleteness}
                        />
                    </div>
                </div>
            ) : (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl p-8 text-center">
                    <div className="text-6xl mb-4">📊</div>
                    <p className="text-blue-800 font-medium text-lg">
                        Select a recent significant earthquake or enter main event details above to begin analysis
                    </p>
                </div>
            )}
        </div>
    );
}
