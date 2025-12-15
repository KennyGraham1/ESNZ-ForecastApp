'use client';

import { BarChart3, Calendar, MapPin, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import { PreviewStatistics } from '@/types/csvUpload';
import { formatDate } from '@/utils/dateFormat';

interface DataPreviewStepProps {
    statistics: PreviewStatistics;
    isLoading?: boolean;
    filename: string;
}

export default function DataPreviewStep({ 
    statistics, 
    isLoading = false,
    filename 
}: DataPreviewStepProps) {
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-600">Analyzing file and generating preview...</p>
            </div>
        );
    }
    
    const hasData = statistics.validRows > 0;
    const successRate = statistics.totalRows > 0 
        ? ((statistics.validRows / statistics.totalRows) * 100).toFixed(1) 
        : '0';
    
    return (
        <div className="space-y-6">
            {/* Summary Header */}
            <div className="flex items-center gap-2 text-gray-700">
                <BarChart3 className="w-5 h-5" />
                <h3 className="font-semibold">Data Preview & Statistics</h3>
            </div>
            
            {/* File info */}
            <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">
                    File: <span className="font-medium text-gray-800">{filename}</span>
                </p>
            </div>
            
            {/* Row Statistics */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-blue-700">{statistics.totalRows.toLocaleString()}</p>
                    <p className="text-sm text-blue-600">Total Rows</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-green-700">{statistics.validRows.toLocaleString()}</p>
                    <p className="text-sm text-green-600">Valid Events</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-red-700">{statistics.invalidRows.toLocaleString()}</p>
                    <p className="text-sm text-red-600">Invalid Rows</p>
                </div>
                <div className="bg-gray-100 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-gray-700">{successRate}%</p>
                    <p className="text-sm text-gray-600">Success Rate</p>
                </div>
            </div>
            
            {/* Import Status */}
            {hasData ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                    <div>
                        <p className="font-medium text-green-800">Ready to Import</p>
                        <p className="text-sm text-green-700">
                            {statistics.validRows.toLocaleString()} earthquake events will be imported.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                    <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                    <div>
                        <p className="font-medium text-red-800">Cannot Import</p>
                        <p className="text-sm text-red-700">
                            No valid earthquake data found. Please check your column mappings and settings.
                        </p>
                    </div>
                </div>
            )}
            
            {/* Date Range */}
            {statistics.minDate && statistics.maxDate && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Calendar className="w-4 h-4 text-gray-600" />
                        <h4 className="font-medium text-gray-700">Date Range</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-gray-500">Earliest Event</p>
                            <p className="text-sm font-medium text-gray-800">
                                {formatDate(statistics.minDate)}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Latest Event</p>
                            <p className="text-sm font-medium text-gray-800">
                                {formatDate(statistics.maxDate)}
                            </p>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Magnitude & Depth Stats */}
            <div className="grid grid-cols-2 gap-4">
                {/* Magnitude */}
                {statistics.minMagnitude !== null && statistics.maxMagnitude !== null && (
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <h4 className="font-medium text-gray-700 mb-2">Magnitude Range</h4>
                        <div className="flex items-center justify-between">
                            <div className="text-center">
                                <p className="text-xl font-bold text-orange-600">
                                    M{statistics.minMagnitude.toFixed(1)}
                                </p>
                                <p className="text-xs text-gray-500">Minimum</p>
                            </div>
                            <div className="flex-1 mx-4 h-2 bg-gradient-to-r from-yellow-300 via-orange-400 to-red-500 rounded"></div>
                            <div className="text-center">
                                <p className="text-xl font-bold text-red-600">
                                    M{statistics.maxMagnitude.toFixed(1)}
                                </p>
                                <p className="text-xs text-gray-500">Maximum</p>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Depth */}
                {statistics.minDepth !== null && statistics.maxDepth !== null && (
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <h4 className="font-medium text-gray-700 mb-2">Depth Range</h4>
                        <div className="flex items-center justify-between">
                            <div className="text-center">
                                <p className="text-xl font-bold text-blue-600">
                                    {statistics.minDepth.toFixed(1)} km
                                </p>
                                <p className="text-xs text-gray-500">Shallowest</p>
                            </div>
                            <div className="flex-1 mx-4 h-2 bg-gradient-to-r from-blue-300 to-blue-600 rounded"></div>
                            <div className="text-center">
                                <p className="text-xl font-bold text-blue-800">
                                    {statistics.maxDepth.toFixed(1)} km
                                </p>
                                <p className="text-xs text-gray-500">Deepest</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Geographic Bounds */}
            {statistics.minLatitude !== null && statistics.maxLatitude !== null &&
             statistics.minLongitude !== null && statistics.maxLongitude !== null && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <MapPin className="w-4 h-4 text-gray-600" />
                        <h4 className="font-medium text-gray-700">Geographic Bounds</h4>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-center">
                        <div>
                            <p className="text-xs text-gray-500">Min Latitude</p>
                            <p className="text-sm font-medium text-gray-800">
                                {statistics.minLatitude.toFixed(3)}°
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Max Latitude</p>
                            <p className="text-sm font-medium text-gray-800">
                                {statistics.maxLatitude.toFixed(3)}°
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Min Longitude</p>
                            <p className="text-sm font-medium text-gray-800">
                                {statistics.minLongitude.toFixed(3)}°
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Max Longitude</p>
                            <p className="text-sm font-medium text-gray-800">
                                {statistics.maxLongitude.toFixed(3)}°
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Warnings */}
            {statistics.sampleWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <h4 className="font-medium text-amber-800">
                            Warnings ({statistics.invalidRows} rows skipped)
                        </h4>
                    </div>
                    <ul className="text-sm text-amber-700 space-y-1 max-h-32 overflow-y-auto">
                        {statistics.sampleWarnings.map((warning, index) => (
                            <li key={index} className="flex items-start gap-1">
                                <span className="text-amber-500">•</span>
                                {warning}
                            </li>
                        ))}
                        {statistics.invalidRows > statistics.sampleWarnings.length && (
                            <li className="text-amber-600 italic">
                                ... and {statistics.invalidRows - statistics.sampleWarnings.length} more issues
                            </li>
                        )}
                    </ul>
                </div>
            )}

            {/* Info note */}
            <div className="flex items-start gap-2 text-xs text-gray-500">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                    Data will be enhanced with computed fields (depth category, magnitude bin, year)
                    and localities will be improved based on coordinates where possible.
                </p>
            </div>
        </div>
    );
}

