'use client';

import { useState, useEffect } from 'react';
import { formatDateTime } from '@/utils/dateFormat';

interface CacheIndicatorProps {
    lastUpdated: string;
    initialFetchDate: string;
    totalEvents: number;
    onRefresh: () => void;
    isRefreshing?: boolean;
    newEventsAdded?: number;
    filteredCount?: number;
    returnedCount?: number;
}

export default function CacheIndicator({
    lastUpdated,
    initialFetchDate,
    totalEvents,
    onRefresh,
    isRefreshing = false,
    newEventsAdded = 0,
    filteredCount,
    returnedCount
}: CacheIndicatorProps) {
    const [timeSinceUpdate, setTimeSinceUpdate] = useState(0);

    // Update time since last update every minute
    useEffect(() => {
        const updateTime = () => {
            const age = Date.now() - new Date(lastUpdated).getTime();
            setTimeSinceUpdate(age);
        };

        updateTime();
        const interval = setInterval(updateTime, 60000); // Update every minute

        return () => clearInterval(interval);
    }, [lastUpdated]);

    const formatAge = (ageMs: number) => {
        const minutes = Math.floor(ageMs / 1000 / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        const remainingMinutes = minutes % 60;

        if (days > 0) {
            return remainingHours > 0
                ? `${days}d ${remainingHours}h ago`
                : `${days}d ago`;
        } else if (hours > 0) {
            return remainingMinutes > 0
                ? `${hours}h ${remainingMinutes}m ago`
                : `${hours}h ago`;
        } else {
            return `${minutes}m ago`;
        }
    };

    const formatTimestamp = (ts: string) => {
        try {
            // Format as dd/mm/yyyy HH:mm:ss
            return formatDateTime(ts);
        } catch {
            return ts;
        }
    };

    const formatDate = (ts: string) => {
        try {
            const date = new Date(ts);
            return date.toLocaleDateString('en-NZ', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return ts;
        }
    };

    return (
        <div className="flex flex-col gap-3 bg-gradient-to-r from-slate-50 to-blue-50 px-4 py-3 rounded-lg border border-slate-200 shadow-sm">
            {/* Top Row: Cache Info and Refresh Button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 flex-wrap">
                    {/* Status Icon */}
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Full Catalog</span>
                    </div>

                    {/* Total Events */}
                    <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 rounded-md border border-blue-200">
                        <span className="text-xs text-slate-600 font-medium">
                            {filteredCount !== undefined && filteredCount < totalEvents ? 'Filtered:' : 'Total Events:'}
                        </span>
                        <span className="text-sm font-bold text-blue-700">
                            {filteredCount !== undefined && filteredCount < totalEvents ? (
                                <>
                                    {filteredCount.toLocaleString()}
                                    <span className="text-xs text-slate-500 ml-1">/ {totalEvents.toLocaleString()}</span>
                                </>
                            ) : (
                                totalEvents.toLocaleString()
                            )}
                        </span>
                    </div>

                    {/* Last Updated */}
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-600">Last updated:</span>
                        <span className="font-medium text-slate-800">{formatTimestamp(lastUpdated)}</span>
                        <span className="text-xs text-slate-500">({formatAge(timeSinceUpdate)})</span>
                    </div>
                </div>

                {/* Refresh Button */}
                <button
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className={`
                        flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm
                        transition-all duration-200 shadow-sm whitespace-nowrap
                        ${isRefreshing
                            ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md active:scale-95'
                        }
                    `}
                >
                    <svg
                        className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                    </svg>
                    {isRefreshing ? 'Updating...' : 'Check for New Events'}
                </button>
            </div>

            {/* Bottom Row: Additional Info */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-xs text-slate-600 border-t border-slate-200 pt-2">
                <div className="flex items-center gap-2">
                    <span>📅 Catalog start:</span>
                    <span className="font-medium text-slate-700">{formatDate(initialFetchDate)}</span>
                </div>
                {newEventsAdded > 0 && (
                    <>
                        <span className="hidden sm:inline text-slate-400">•</span>
                        <div className="flex items-center gap-2 px-2 py-1 bg-green-100 rounded border border-green-200">
                            <span className="text-green-700 font-semibold">✨ {newEventsAdded} new event{newEventsAdded !== 1 ? 's' : ''} added</span>
                        </div>
                    </>
                )}
                <span className="hidden sm:inline text-slate-400 ml-auto">💡 Use &ldquo;Load&rdquo; button to filter by time range and magnitude</span>
            </div>
        </div>
    );
}

