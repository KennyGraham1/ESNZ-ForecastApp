'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useState, useMemo } from 'react';
import OmoriLawPlot from '@/components/OmoriLawPlot';
import AftershockSequencePlot from '@/components/AftershockSequencePlot';
import ThreeDVisualization from '@/components/ThreeDVisualization';
import GutenbergRichterPlot from '@/components/GutenbergRichterPlot';
import CumulativeAftershockPlot from '@/components/CumulativeAftershockPlot';
import { MainEventInfo, OptimizationMethod } from '@/lib/analysis/omori';
import RBush from 'rbush';
import { getLocalityFromCoordinates } from '@/utils/nzRegions';
import { REFERENCE_MODELS, ReferenceModel } from '@/lib/analysis/referenceModels';
import { generateAnalysisReport } from '@/utils/generateAnalysisReport';
import { GutenbergRichterResult } from '@/lib/analysis/gutenbergRichter';

import { OmoriParameters } from '@/lib/analysis/omori';

const historicalEvents = [
    {
        name: "1855 Wairarapa Earthquake",
        time: "1855-01-23T09:17:00Z",
        magnitude: 8.2,
        latitude: -41.40,
        longitude: 175.30,
        description: "Mw 8.2 earthquake - New Zealand's most powerful recorded earthquake"
    },
    {
        name: "1888 North Canterbury (Amuri) Earthquake",
        time: "1888-09-01T10:30:00Z",
        magnitude: 7.3,
        latitude: -42.60,
        longitude: 172.70,
        description: "M 7.3 earthquake in North Canterbury region"
    },
    {
        name: "1901 Cheviot Earthquake",
        time: "1901-11-16T03:45:00Z",
        magnitude: 6.9,
        latitude: -42.65,
        longitude: 173.10,
        description: "M 6.9 earthquake near Cheviot"
    },
    {
        name: "1929 Arthur's Pass Earthquake",
        time: "1929-03-09T10:50:00Z",
        magnitude: 7.1,
        latitude: -42.90,
        longitude: 171.60,
        description: "M 7.1 earthquake in the Southern Alps"
    },
    {
        name: "1929 Murchison Earthquake",
        time: "1929-06-17T10:17:00Z",
        magnitude: 7.8,
        latitude: -41.73,
        longitude: 172.20,
        description: "M 7.8 earthquake that caused 17 fatalities"
    },
    {
        name: "1931 Hawke's Bay (Napier) Earthquake",
        time: "1931-02-03T10:46:00Z",
        magnitude: 7.8,
        latitude: -39.50,
        longitude: 176.85,
        description: "Mw 7.8 earthquake that caused 256 fatalities and reshaped Napier"
    },
    {
        name: "1968 Inangahua Earthquake",
        time: "1968-05-24T05:24:00Z",
        magnitude: 7.1,
        latitude: -41.80,
        longitude: 172.10,
        description: "Mw 7.1 earthquake in the Buller region"
    },
    {
        name: "2009 Dusky Sound Earthquake",
        time: "2009-07-15T09:22:29Z",
        magnitude: 7.8,
        latitude: -45.762,
        longitude: 166.562,
        description: "Mw 7.8 earthquake in Fiordland"
    },
    {
        name: "2010 Darfield (Canterbury) Earthquake",
        time: "2010-09-03T16:35:46Z",
        magnitude: 7.1,
        latitude: -43.522,
        longitude: 172.170,
        description: "Mw 7.1 earthquake near Darfield"
    },
    {
        name: "2011 Christchurch Earthquake",
        time: "2011-02-22T23:51:42Z",
        magnitude: 6.3,
        latitude: -43.583,
        longitude: 172.680,
        description: "Mw 6.3 earthquake that caused 185 fatalities"
    },
    {
        name: "2014 Eketāhuna Earthquake",
        time: "2014-01-20T02:52:00Z",
        magnitude: 6.2,
        latitude: -40.62,
        longitude: 175.88,
        description: "Ml 6.2 earthquake in the southern Wairarapa"
    },
    {
        name: "2016 Kaikōura Earthquake",
        time: "2016-11-13T11:02:56Z",
        magnitude: 7.8,
        latitude: -42.693,
        longitude: 173.022,
        description: "Mw 7.8 earthquake that struck the northeast coast of the South Island"
    }
];

interface AftershockSequenceProps {
    earthquakes: EarthquakeData[];
}

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

// Wells and Coppersmith (1994) Rupture Length (Subsurface Rupture Length - RLD)
// Log(RL) = -2.44 + 0.59 * M
const getWellsCoppersmithRuptureLength = (magnitude: number): number => {
    return Math.pow(10, -2.44 + 0.59 * magnitude);
};


export default function AftershockSequence({ earthquakes }: AftershockSequenceProps) {
    const [mainEventTime, setMainEventTime] = useState('');
    const [mainEventMag, setMainEventMag] = useState(5.0);
    const [mainEventName, setMainEventName] = useState('');
    const [mainEventLat, setMainEventLat] = useState<number | undefined>(undefined);
    const [mainEventLon, setMainEventLon] = useState<number | undefined>(undefined);
    const [showHistoricalEvents, setShowHistoricalEvents] = useState(false);
    const [isMainEventSectionExpanded, setIsMainEventSectionExpanded] = useState(true);
    const [useSRLMethod, setUseSRLMethod] = useState(true);
    const [showDeclusteringHelp, setShowDeclusteringHelp] = useState(false);

    // SRL Configurable Parameters
    const [srlMainshockTimeWindow, setSrlMainshockTimeWindow] = useState<number>(3); // Years
    const [srlMainshockSpatialFactor, setSrlMainshockSpatialFactor] = useState<number>(5); // x Rupture Length
    const [srlAftershockTimeWindow, setSrlAftershockTimeWindow] = useState<number>(10); // Days
    const [srlAftershockSpatialFactor, setSrlAftershockSpatialFactor] = useState<number>(3); // x Rupture Length

    // Gardner-Knopoff Configurable Parameters
    // Spatial: 10^(a*M + b)
    const [gkSpatialA, setGkSpatialA] = useState<number>(0.1238);
    const [gkSpatialB, setGkSpatialB] = useState<number>(0.983);
    // Temporal: 10^(c*M + d)
    const [gkTemporalC, setGkTemporalC] = useState<number>(0.032);
    const [gkTemporalD, setGkTemporalD] = useState<number>(2.7389);

    // Shared Omori optimization parameters
    const [optimizationMethod, setOptimizationMethod] = useState<OptimizationMethod>('mle');
    const [magnitudeCompleteness, setMagnitudeCompleteness] = useState<number | undefined>(undefined);
    const [selectedReferenceModelId, setSelectedReferenceModelId] = useState<string>('');

    const selectedReferenceModel = useMemo(() =>
        REFERENCE_MODELS.find(m => m.id === selectedReferenceModelId) || null,
        [selectedReferenceModelId]
    );

    // Filtered aftershock sequence data from AftershockSequencePlot
    const [filteredSequenceData, setFilteredSequenceData] = useState<EarthquakeData[]>([]);

    // SHARED OMORI STATE: Lifted up from OmoriLawPlot to synchronize Cumulative plot
    const [sharedOmoriParams, setSharedOmoriParams] = useState<OmoriParameters | null>(null);
    // SHARED GR STATE: Lifted up for Report Generation
    const [grResult, setGrResult] = useState<GutenbergRichterResult | null>(null);

    // COLOR PALETTE STATE: For consistent coloring across plots
    const [colorPalette, setColorPalette] = useState<string>('default');

    // REPORT GENERATION STATE
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);

    // Handler for when Omori calculation completes in OmoriLawPlot
    const handleOmoriCalculationComplete = (params: OmoriParameters | null) => {
        console.log('Omori calculation completed, syncing parameters to shared state');
        setSharedOmoriParams(params);
    };

    // Gardner-Knopoff declustering algorithm
    const declusterGardnerKnopoff = (events: EarthquakeData[]): EarthquakeData[] => {
        if (events.length === 0) return [];
        const sorted = [...events].sort((a, b) => b.magnitude - a.magnitude);
        const isDependentEvent = new Set<number>();

        const spatialWindow = (mag: number) => Math.pow(10, gkSpatialA * mag + gkSpatialB);
        const temporalWindow = (mag: number) => Math.pow(10, gkTemporalC * mag + gkTemporalD);

        for (let i = 0; i < sorted.length; i++) {
            if (isDependentEvent.has(i)) continue;
            const mainEvent = sorted[i];
            const mainTime = new Date(mainEvent.time).getTime();

            const sWin = spatialWindow(mainEvent.magnitude);
            const tWin = temporalWindow(mainEvent.magnitude) * 24 * 60 * 60 * 1000; // to ms

            for (let j = 0; j < sorted.length; j++) {
                if (i === j || isDependentEvent.has(j)) continue;
                const other = sorted[j];

                const otherTime = new Date(other.time).getTime();
                const tDiff = Math.abs(otherTime - mainTime);
                if (tDiff > tWin) continue;

                const dist = haversineDistance(mainEvent.latitude, mainEvent.longitude, other.latitude, other.longitude);
                if (dist <= sWin) {
                    isDependentEvent.add(j);
                }
            }
        }
        return sorted.filter((_, idx) => !isDependentEvent.has(idx));
    };

    // SRL Paper Method Declustering (Configurable)
    const declusterSRL = (events: EarthquakeData[]): EarthquakeData[] => {
        // Configurable implementation of Hardebeck et al. method

        const sorted = [...events].sort((a, b) => b.magnitude - a.magnitude); // Largest first
        const isDependentEvent = new Set<number>();

        for (let i = 0; i < sorted.length; i++) {
            const mainEvent = sorted[i];
            const mainTime = new Date(mainEvent.time).getTime();
            const rl = getWellsCoppersmithRuptureLength(mainEvent.magnitude);

            // Influence zone defined by user parameters
            const timeWindow = srlMainshockTimeWindow * 365.25 * 24 * 60 * 60 * 1000; // Years to ms
            const distLimit = srlMainshockSpatialFactor * rl; // Factor * Rupture Length

            for (let j = 0; j < sorted.length; j++) {
                if (i === j) continue;
                const other = sorted[j];
                if (isDependentEvent.has(j)) continue;

                const otherTime = new Date(other.time).getTime();

                // Logic: "excluding events that occur ... following a larger event"
                if (otherTime > mainTime && otherTime <= mainTime + timeWindow) {
                    const dist = haversineDistance(mainEvent.latitude, mainEvent.longitude, other.latitude, other.longitude);
                    if (dist <= distLimit) {
                        isDependentEvent.add(j);
                    }
                }
            }
        }

        return sorted.filter((_, idx) => !isDependentEvent.has(idx));
    }


    // Find recent significant earthquakes (M >= 5.5) with declustering
    const recentSignificantEarthquakes = useMemo(() => {
        // First filter by magnitude
        const significantEvents = earthquakes.filter(eq => eq.magnitude >= 5.5);

        // Apply selected declustering
        let declusteredEvents = useSRLMethod
            ? declusterSRL(significantEvents)
            : declusterGardnerKnopoff(significantEvents);

        // Filter: Number of AFTERSHOCKS > 2
        declusteredEvents = declusteredEvents.filter(mainEvent => {
            const mainTime = new Date(mainEvent.time).getTime();
            let aftershockCount = 0;

            // SRL Paper Aftershock Definition for counting (Configurable)
            const rl = getWellsCoppersmithRuptureLength(mainEvent.magnitude);
            const timeWindow = srlAftershockTimeWindow * 24 * 60 * 60 * 1000; // Days to ms
            const spatialWindow = srlAftershockSpatialFactor * rl;

            for (const eq of earthquakes) {
                const t = new Date(eq.time).getTime();
                if (t > mainTime && t <= mainTime + timeWindow) {
                    const d = haversineDistance(mainEvent.latitude, mainEvent.longitude, eq.latitude, eq.longitude);
                    if (d <= spatialWindow) {
                        aftershockCount++;
                    }
                }
                if (aftershockCount > 2) break;
            }

            return aftershockCount > 2;
        });

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
    }, [earthquakes, useSRLMethod, srlMainshockTimeWindow, srlMainshockSpatialFactor, srlAftershockTimeWindow, srlAftershockSpatialFactor, gkSpatialA, gkSpatialB, gkTemporalC, gkTemporalD]);

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

                            {/* Declustering Methodology Toggle & Configuration */}
                            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="text-sm font-medium text-gray-700">
                                            Declustering Method
                                        </div>
                                        <button
                                            onClick={() => setShowDeclusteringHelp(!showDeclusteringHelp)}
                                            className="text-gray-400 hover:text-blue-600 transition-colors"
                                            title="About this method"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </button>
                                    </div>
                                    <label className="flex items-center cursor-pointer">
                                        <div className="mr-3 text-sm font-medium text-gray-600">
                                            {useSRLMethod ? 'Hardebeck et al. 2019 (SRL Paper)' : 'Gardner-Knopoff'}
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="checkbox"
                                                className="sr-only"
                                                checked={useSRLMethod}
                                                onChange={() => setUseSRLMethod(!useSRLMethod)}
                                            />
                                            <div className={`block w-10 h-6 rounded-full transition-colors ${useSRLMethod ? 'bg-indigo-600' : 'bg-gray-400'}`}></div>
                                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${useSRLMethod ? 'transform translate-x-4' : ''}`}></div>
                                        </div>
                                    </label>
                                </div>

                                {showDeclusteringHelp && (
                                    <div className="mb-4 p-3 bg-blue-50 text-blue-800 text-xs rounded-md border border-blue-100 italic animate-fadeIn">
                                        {useSRLMethod
                                            ? "Hardebeck et al. (SRL): Physically motivated method using Wells & Coppersmith rupture lengths to define exclusion zones (typically 3 years, 5x RL for mainshocks)."
                                            : "Gardner-Knopoff: Standard windowing algorithm where aftershocks are defined by magnitude-dependent spatial (10^(aM+b)) and temporal (10^(cM+d)) zones."}
                                    </div>
                                )}

                                {/* SRL Configuration Panel */}
                                {useSRLMethod && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 pt-3 border-t border-gray-200 animate-fadeIn">
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Mainshock Definition</h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">Window (Years)</label>
                                                    <input
                                                        type="number"
                                                        value={srlMainshockTimeWindow}
                                                        onChange={(e) => setSrlMainshockTimeWindow(Number(e.target.value))}
                                                        className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                        min="0.1" step="0.1"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">Spatial (x Rupture Len)</label>
                                                    <input
                                                        type="number"
                                                        value={srlMainshockSpatialFactor}
                                                        onChange={(e) => setSrlMainshockSpatialFactor(Number(e.target.value))}
                                                        className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                        min="1" step="0.5"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Aftershock Counting</h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">Window (Days)</label>
                                                    <input
                                                        type="number"
                                                        value={srlAftershockTimeWindow}
                                                        onChange={(e) => setSrlAftershockTimeWindow(Number(e.target.value))}
                                                        className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                        min="1" step="1"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">Spatial (x Rupture Len)</label>
                                                    <input
                                                        type="number"
                                                        value={srlAftershockSpatialFactor}
                                                        onChange={(e) => setSrlAftershockSpatialFactor(Number(e.target.value))}
                                                        className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                        min="1" step="0.5"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Gardner-Knopoff Configuration Panel */}
                                {!useSRLMethod && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 pt-3 border-t border-gray-200 animate-fadeIn">
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Spatial Window: 10^(aM + b)</h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">Coeff a</label>
                                                    <input
                                                        type="number"
                                                        value={gkSpatialA}
                                                        onChange={(e) => setGkSpatialA(Number(e.target.value))}
                                                        className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                        step="0.001"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">Coeff b</label>
                                                    <input
                                                        type="number"
                                                        value={gkSpatialB}
                                                        onChange={(e) => setGkSpatialB(Number(e.target.value))}
                                                        className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                        step="0.001"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Temporal Window: 10^(cM + d)</h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">Coeff c</label>
                                                    <input
                                                        type="number"
                                                        value={gkTemporalC}
                                                        onChange={(e) => setGkTemporalC(Number(e.target.value))}
                                                        className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                        step="0.001"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">Coeff d</label>
                                                    <input
                                                        type="number"
                                                        value={gkTemporalD}
                                                        onChange={(e) => setGkTemporalD(Number(e.target.value))}
                                                        className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                        step="0.001"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {recentSignificantEarthquakes.length > 0 ? (
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-3">
                                        <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide">
                                            Recent Significant Earthquakes (M ≥ 5.5)
                                        </label>
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${useSRLMethod ? 'bg-indigo-100 text-indigo-800 border-indigo-300' : 'bg-green-100 text-green-800 border-green-300'}`}>
                                            Declustered
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-600 mb-3 italic">
                                        Independent mainshocks with {'>'}2 aftershocks ({useSRLMethod ? 'Hardebeck et al. 2019' : 'Gardner-Knopoff'} applied)
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
                                                    {eq.locality && eq.locality !== 'Unknown Location'
                                                        ? eq.locality
                                                        : getLocalityFromCoordinates(eq.latitude, eq.longitude)}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                                    <p className="text-sm text-yellow-800 font-medium">
                                        ⚠️ No significant earthquakes (M ≥ 5.5) with {'>'}2 aftershocks found.
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
                        <AftershockSequencePlot
                            earthquakes={earthquakes}
                            mainEvent={mainEvent}
                            onSequenceDataChange={setFilteredSequenceData}
                            colorPalette={colorPalette}
                            onColorPaletteChange={setColorPalette}
                        />
                    </div>

                    {/* 3D Visualization Section */}
                    <div id="report-3d" className="bg-white p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                        <div className="mb-4">
                            <h3 className="text-xl font-bold text-gray-800 mb-1">3D Aftershock Distribution</h3>
                            <p className="text-sm text-gray-500">Interactive 3D view of the aftershock sequence</p>
                        </div>
                        <ThreeDVisualization
                            earthquakes={filteredSequenceData.length > 0 ? filteredSequenceData : earthquakes}
                            xAxisField="longitude"
                            yAxisField="latitude"
                            zAxisField="depth"
                            colorField="daysSince"
                            colorPalette={colorPalette as any} // Cast if needed, but the type should match
                        />
                    </div>
                    <div id="report-omori" className="bg-white p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                        <div className="mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">Omori-Utsu Law Analysis</h3>
                            <p className="text-sm text-gray-500 mb-4">Decay rate of aftershock activity</p>

                            {/* Reference Model Selector */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 bg-gray-50 p-4 rounded-lg">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Reference Model
                                    </label>
                                    <select
                                        value={selectedReferenceModelId}
                                        onChange={(e) => setSelectedReferenceModelId(e.target.value)}
                                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                    >
                                        <option value="">None</option>
                                        {REFERENCE_MODELS.map(model => (
                                            <option key={model.id} value={model.id}>
                                                {model.name}
                                            </option>
                                        ))}
                                    </select>
                                    {selectedReferenceModel && (
                                        <p className="mt-1 text-xs text-gray-500">
                                            {selectedReferenceModel.description}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                        <OmoriLawPlot
                            earthquakes={filteredSequenceData}
                            mainEvent={mainEvent}
                            optimizationMethod={optimizationMethod}
                            onOptimizationMethodChange={setOptimizationMethod}
                            magnitudeCompleteness={magnitudeCompleteness}
                            onMagnitudeCompletenessChange={setMagnitudeCompleteness}
                            referenceModel={selectedReferenceModel}
                            onCalculationComplete={handleOmoriCalculationComplete}
                        />
                    </div>

                    {/* Frequency-Magnitude and Cumulative Analysis Section - Side by Side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div id="report-gr">
                            <GutenbergRichterPlot
                                earthquakes={filteredSequenceData.length > 0 ? filteredSequenceData : earthquakes}
                                onCalculationComplete={setGrResult}
                            />
                        </div>
                        <div id="report-cumulative">
                            <CumulativeAftershockPlot
                                earthquakes={filteredSequenceData.length > 0 ? filteredSequenceData : earthquakes}
                                mainEvent={mainEvent}
                                optimizationMethod={optimizationMethod}
                                magnitudeCompleteness={magnitudeCompleteness}
                                omoriParams={sharedOmoriParams} // Use shared params instead of re-calculating
                            />
                        </div>
                    </div>

                    {/* Report Generation Button */}
                    <div className="flex flex-col items-center gap-4 pt-6 pb-12">
                        <button
                            onClick={async () => {
                                if (!mainEvent) return;
                                setIsGeneratingReport(true);
                                try {
                                    await generateAnalysisReport({
                                        mainEvent,
                                        earthquakeCount: filteredSequenceData.length > 0 ? filteredSequenceData.length : earthquakes.length,
                                        omoriParams: sharedOmoriParams,
                                        grResult: grResult,
                                        plotIds: {
                                            timeline: 'report-timeline',
                                            gr: 'report-gr',
                                            omori: 'report-omori',
                                            cumulative: 'report-cumulative',
                                            threeD: 'report-3d'
                                        },
                                        declusteringMethod: useSRLMethod ? 'Hardebeck et al. 2019 (SRL Paper)' : 'Gardner-Knopoff',
                                        declusteringParams: useSRLMethod ? {
                                            'Mainshock Window': `${srlMainshockTimeWindow} years`,
                                            'Mainshock Zone': `${srlMainshockSpatialFactor}x Rupture Len`,
                                            'Aftershock Window': `${srlAftershockTimeWindow} days`,
                                            'Aftershock Zone': `${srlAftershockSpatialFactor}x Rupture Len`
                                        } : {
                                            'Spatial Window': `10^(${gkSpatialA}M + ${gkSpatialB})`,
                                            'Temporal Window': `10^(${gkTemporalC}M + ${gkTemporalD})`
                                        }
                                    });
                                } catch (error) {
                                    console.error('Report generation failed:', error);
                                    alert('Failed to generate report. Please try again.');
                                } finally {
                                    setIsGeneratingReport(false);
                                }
                            }}
                            disabled={isGeneratingReport}
                            className={`${isGeneratingReport
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 hover:scale-105'
                                } text-white font-bold py-3 px-8 rounded-full shadow-lg flex items-center gap-3 transition-all`}
                        >
                            {isGeneratingReport ? (
                                <>
                                    <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Generating Report...
                                </>
                            ) : (
                                <>
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Generate Analysis Report (PDF)
                                </>
                            )}
                        </button>
                        {isGeneratingReport && (
                            <p className="text-sm text-gray-600 animate-pulse">
                                Please wait while we capture plots and compile your report...
                            </p>
                        )}
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
