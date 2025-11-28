'use client';

import { EarthquakeData } from '@/types/earthquake';
import { Download } from 'lucide-react';
import { exportToCSV, exportToJSON, exportToGeoJSON, exportToZip } from '@/lib/export';
import { useState, useRef, useEffect } from 'react';

interface ExportButtonProps {
    earthquakes: EarthquakeData[];
}

export default function ExportButton({ earthquakes }: ExportButtonProps) {
    const [isOpen, setIsOpen] = useState(false);

    const handleExport = async (format: 'csv' | 'json' | 'geojson' | 'zip') => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `earthquakes_${timestamp}.${format}`;

        switch (format) {
            case 'csv':
                exportToCSV(earthquakes, filename);
                break;
            case 'json':
                exportToJSON(earthquakes, filename);
                break;
            case 'geojson':
                exportToGeoJSON(earthquakes, filename);
                break;
            case 'zip':
                await exportToZip(earthquakes, filename);
                break;
        }

        setIsOpen(false);
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
            >
                <Download className="w-4 h-4" />
                Export Data
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                        <div className="py-1">
                            <button
                                onClick={() => handleExport('csv')}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors"
                            >
                                CSV Format
                            </button>
                            <button
                                onClick={() => handleExport('json')}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors"
                            >
                                JSON Format
                            </button>
                            <button
                                onClick={() => handleExport('geojson')}
                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                                role="menuitem"
                            >
                                GeoJSON
                            </button>
                            <div className="border-t border-gray-100 my-1"></div>
                            <button
                                onClick={() => handleExport('zip')}
                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                                role="menuitem"
                            >
                                ZIP Archive (All Formats)
                            </button>
                        </div>
                        <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
                            {earthquakes.length.toLocaleString()} earthquakes
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
