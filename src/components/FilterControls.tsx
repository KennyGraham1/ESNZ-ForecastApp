'use client';

import { useState, useEffect } from 'react';
import { Filter, X, Check } from 'lucide-react';

export interface FilterOptions {
    minMagnitude: number;
    maxMagnitude: number;
    depthCategory: 'all' | 'shallow' | 'intermediate' | 'deep';
    startDate: string;
    endDate: string;
}

interface FilterControlsProps {
    filters: FilterOptions;
    onFilterChange: (filters: FilterOptions) => void;
    dataDateRange: { min: string; max: string };
}

export default function FilterControls({ filters, onFilterChange, dataDateRange }: FilterControlsProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Local state for pending filter changes (not yet applied)
    const [pendingFilters, setPendingFilters] = useState<FilterOptions>(filters);

    // Track if there are unapplied changes
    const hasUnappliedChanges = JSON.stringify(pendingFilters) !== JSON.stringify(filters);

    // Sync pending filters when applied filters change externally
    useEffect(() => {
        setPendingFilters(filters);
    }, [filters]);

    const handleApply = () => {
        onFilterChange(pendingFilters);
    };

    const handleReset = () => {
        const resetFilters = {
            minMagnitude: 0,
            maxMagnitude: 10,
            depthCategory: 'all' as const,
            startDate: dataDateRange.min,
            endDate: dataDateRange.max
        };
        setPendingFilters(resetFilters);
        onFilterChange(resetFilters);
    };

    const depthCategories = [
        { value: 'all', label: 'All Depths', description: 'All earthquakes' },
        { value: 'shallow', label: 'Shallow', description: '0-70 km' },
        { value: 'intermediate', label: 'Intermediate', description: '70-300 km' },
        { value: 'deep', label: 'Deep', description: '> 300 km' }
    ];

    return (
        <div className="bg-white rounded-lg shadow border border-gray-200 mb-6">
            <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <Filter className="w-5 h-5 text-gray-600" />
                    <h3 className="text-lg font-semibold">Filters</h3>
                </div>
                <button className="text-gray-600 hover:text-gray-900">
                    {isExpanded ? '▼' : '▶'}
                </button>
            </div>

            {isExpanded && (
                <div className="p-4 border-t border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* Magnitude Range */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Magnitude Range
                            </label>
                            <div className="flex gap-2 items-center">
                                <input
                                    type="number"
                                    min="0"
                                    max="10"
                                    step="0.1"
                                    value={pendingFilters.minMagnitude}
                                    onChange={(e) => setPendingFilters({ ...pendingFilters, minMagnitude: parseFloat(e.target.value) })}
                                    className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <span className="text-gray-500">to</span>
                                <input
                                    type="number"
                                    min="0"
                                    max="10"
                                    step="0.1"
                                    value={pendingFilters.maxMagnitude}
                                    onChange={(e) => setPendingFilters({ ...pendingFilters, maxMagnitude: parseFloat(e.target.value) })}
                                    className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                        </div>

                        {/* Depth Category */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Depth Category
                            </label>
                            <select
                                value={pendingFilters.depthCategory}
                                onChange={(e) => setPendingFilters({ ...pendingFilters, depthCategory: e.target.value as any })}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                {depthCategories.map(cat => (
                                    <option key={cat.value} value={cat.value}>
                                        {cat.label} ({cat.description})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Date Range */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Start Date
                            </label>
                            <input
                                type="date"
                                value={pendingFilters.startDate}
                                min={dataDateRange.min}
                                max={dataDateRange.max}
                                onChange={(e) => setPendingFilters({ ...pendingFilters, startDate: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                End Date
                            </label>
                            <input
                                type="date"
                                value={pendingFilters.endDate}
                                min={dataDateRange.min}
                                max={dataDateRange.max}
                                onChange={(e) => setPendingFilters({ ...pendingFilters, endDate: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="mt-4 flex justify-between items-center">
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                        >
                            <X className="w-4 h-4" />
                            Reset Filters
                        </button>

                        <button
                            onClick={handleApply}
                            disabled={!hasUnappliedChanges}
                            className={`flex items-center gap-2 px-6 py-2 text-sm font-medium rounded transition-colors ${
                                hasUnappliedChanges
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                        >
                            <Check className="w-4 h-4" />
                            Apply Filters
                            {hasUnappliedChanges && (
                                <span className="ml-1 px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                                    •
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
