'use client';

import { useEffect, useState } from 'react';
import type { ClusteringComputeInfo, ClusteringRoute } from '@/hooks/useClusteringWorker';

// ── Algorithm display names ───────────────────────────────────────────────────

const ALGORITHM_LABELS: Record<string, string> = {
    'dbscan':           'DBSCAN',
    'optics':           'OPTICS',
    'kmeans':           'K-Means',
    'step-mag':         'STEP Magnitude',
    'step-time':        'STEP Time',
    'nearest-neighbor': 'Nearest-Neighbor',
    'st-dbscan':        'ST-DBSCAN',
    'tmc':              'TMC (Reasenberg)',
    'hardebeck-2019':   'Hardebeck (2019)',
    'hdbscan':          'HDBSCAN',
};

const ALGORITHM_DESCRIPTIONS: Record<string, string> = {
    'dbscan':           'Density-based spatial clustering',
    'optics':           'Hierarchical density ordering',
    'kmeans':           'Partition-based centroid clustering',
    'step-mag':         'Seismological magnitude window method',
    'step-time':        'Seismological time window method',
    'nearest-neighbor': 'Space-time-magnitude proximity',
    'st-dbscan':        'Spatio-temporal density clustering',
    'tmc':              'Time-magnitude interaction probability',
    'hardebeck-2019':   'Rupture-length aftershock windows',
    'hdbscan':          'Hierarchical density with soft membership',
};

// ── Route badge ───────────────────────────────────────────────────────────────

const ROUTE_CONFIG: Record<ClusteringRoute, { label: string; color: string; icon: string }> = {
    worker: { label: 'Web Worker',     color: 'bg-blue-100 text-blue-700 border-blue-200',   icon: '⚡' },
    server: { label: 'Server',         color: 'bg-purple-100 text-purple-700 border-purple-200', icon: '☁' },
    sync:   { label: 'Main Thread',    color: 'bg-amber-100 text-amber-700 border-amber-200', icon: '🔄' },
};

// ── Elapsed timer ─────────────────────────────────────────────────────────────

function useElapsed(startedAt: number | null): string {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (startedAt === null) {
            setElapsed(0);
            return;
        }
        setElapsed(Date.now() - startedAt);
        const id = setInterval(() => setElapsed(Date.now() - startedAt), 250);
        return () => clearInterval(id);
    }, [startedAt]);

    if (elapsed < 1000) return `${elapsed}ms`;
    return `${(elapsed / 1000).toFixed(1)}s`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ClusteringProgressPanelProps {
    computeInfo: ClusteringComputeInfo;
    onCancel?: () => void;
}

export default function ClusteringProgressPanel({
    computeInfo,
    onCancel,
}: ClusteringProgressPanelProps) {
    const elapsed = useElapsed(computeInfo.startedAt);
    const route = ROUTE_CONFIG[computeInfo.route];
    const label = ALGORITHM_LABELS[computeInfo.algorithm] ?? computeInfo.algorithm;
    const description = ALGORITHM_DESCRIPTIONS[computeInfo.algorithm] ?? '';

    return (
        /* Fixed overlay — centred on the viewport */
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(2px)' }}
            aria-modal="true"
            role="dialog"
            aria-label="Clustering in progress"
        >
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm mx-4 overflow-hidden">
                {/* Indeterminate progress bar at the very top */}
                <div className="h-1 w-full bg-gray-100 overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-500 animate-progress-slide"
                        style={{ width: '40%' }}
                    />
                </div>

                <div className="p-6">
                    {/* Title row */}
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            {/* Pulsing icon */}
                            <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50">
                                <div className="absolute h-10 w-10 rounded-full bg-indigo-100 animate-ping opacity-60" />
                                <svg className="h-5 w-5 text-indigo-600 relative" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-900">Computing clusters…</p>
                                <p className="text-xs text-gray-400 mt-0.5">{elapsed} elapsed</p>
                            </div>
                        </div>

                        {onCancel && (
                            <button
                                onClick={onCancel}
                                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
                                title="Cancel clustering"
                                aria-label="Cancel clustering"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {/* Algorithm card */}
                    <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 mb-4">
                        <p className="text-base font-bold text-gray-800">{label}</p>
                        {description && (
                            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                        )}
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-3">
                        {/* Route badge */}
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${route.color}`}>
                            <span>{route.icon}</span>
                            {route.label}
                        </span>

                        {/* Dataset size */}
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border bg-gray-50 text-gray-600 border-gray-200">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                            </svg>
                            {computeInfo.datasetSize.toLocaleString()} events
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
