'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Upload, FileUp, AlertCircle, CheckCircle, X } from 'lucide-react';
import { parseEarthquakeFile, validateEarthquakeData, getSupportedFileExtensions, getSupportedDateFormats } from '@/lib/csvParser';
import { EarthquakeData } from '@/types/earthquake';

interface CatalogUploadProps {
    onDataLoaded: (data: EarthquakeData[], filename: string) => void;
    onClose?: () => void;
}

export default function CatalogUpload({ onDataLoaded, onClose }: CatalogUploadProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFile(files[0]);
        }
    };

    const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            handleFile(files[0]);
        }
    };

    const handleFile = async (file: File) => {
        // Reset state
        setError(null);
        setSuccess(null);
        setWarnings([]);
        setIsProcessing(true);

        try {
            // Validate file type
            const supportedExtensions = getSupportedFileExtensions();
            const fileName = file.name.toLowerCase();
            const isSupported = supportedExtensions.some(ext => fileName.endsWith(ext));

            if (!isSupported) {
                throw new Error(`Unsupported file type. Please select a ${supportedExtensions.join(', ')} file`);
            }

            // Validate file size (max 50MB)
            const maxSize = 50 * 1024 * 1024; // 50MB
            if (file.size > maxSize) {
                throw new Error('File size exceeds 50MB limit');
            }

            console.log(`📂 Processing file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

            // Parse file (auto-detects format)
            const result = await parseEarthquakeFile(file);

            if (!result.success) {
                throw new Error(result.errors?.join('; ') || 'Failed to parse CSV file');
            }

            if (!result.data || result.data.length === 0) {
                throw new Error('No valid earthquake data found in file');
            }

            // Validate data
            const validation = validateEarthquakeData(result.data);
            if (!validation.valid) {
                throw new Error(`Data validation failed: ${validation.errors.join('; ')}`);
            }

            // Set warnings if any
            if (result.warnings && result.warnings.length > 0) {
                setWarnings(result.warnings.slice(0, 10)); // Show first 10 warnings
            }

            // Success!
            const formatInfo = result.format ? ` (${result.format} format)` : '';
            const validCount = result.validCount ?? 0;
            let successMsg = `Successfully loaded ${validCount} earthquakes from ${file.name}${formatInfo}`;

            // Add information about skipped rows and commented lines
            const additionalInfo: string[] = [];

            if (result.rowCount && result.rowCount > validCount) {
                const skipped = result.rowCount - validCount;
                additionalInfo.push(`${skipped} rows skipped due to errors`);
            }

            if (result.commentedLinesSkipped && result.commentedLinesSkipped > 0) {
                additionalInfo.push(`${result.commentedLinesSkipped} commented lines skipped`);
            }

            if (additionalInfo.length > 0) {
                successMsg += ` (${additionalInfo.join(', ')})`;
            }

            setSuccess(successMsg);
            console.log(`✅ ${successMsg}`);

            // Call the callback with the loaded data
            onDataLoaded(result.data, file.name);

        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
            setError(errorMsg);
            console.error('❌ Error loading catalog:', errorMsg);
        } finally {
            setIsProcessing(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleBrowseClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Load Catalog from File
                </h3>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        title="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Drag and Drop Area */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    isDragging
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                }`}
            >
                {isProcessing ? (
                    <div className="flex flex-col items-center gap-3">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                        <p className="text-sm text-gray-600">Processing file...</p>
                    </div>
                ) : (
                    <>
                        <FileUp className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-sm text-gray-600 mb-2">
                            Drag and drop a file here, or
                        </p>
                        <button
                            onClick={handleBrowseClick}
                            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                        >
                            Browse Files
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.json,.geojson"
                            onChange={handleFileInput}
                            className="hidden"
                        />
                        <p className="text-xs text-gray-500 mt-3">
                            Supported formats: CSV, JSON, GeoJSON
                        </p>
                    </>
                )}
            </div>

            {/* Success Message */}
            {success && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-sm text-green-800 font-medium">{success}</p>
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-sm text-red-800 font-medium">{error}</p>
                    </div>
                </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <div className="flex items-start gap-2 mb-2">
                        <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-yellow-800 font-medium">
                            Warnings ({warnings.length} issues found):
                        </p>
                    </div>
                    <ul className="text-xs text-yellow-700 ml-7 space-y-1 max-h-32 overflow-y-auto">
                        {warnings.map((warning, index) => (
                            <li key={index}>{warning}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Format Information */}
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-xs text-blue-800 font-medium mb-2">Supported File Formats:</p>
                <div className="text-xs text-blue-700 space-y-2">
                    <div>
                        <p className="font-semibold">CSV Format:</p>
                        <p><strong>Required columns:</strong> time, latitude, longitude, depth, magnitude</p>
                        <p><strong>Optional:</strong> locality, mmi, eventID</p>
                        <p><strong>Comments:</strong> Lines starting with # or // are automatically skipped</p>
                        <p><strong>Example:</strong> 25/11/2024 14:30:00,-41.5,174.2,25.5,4.2,Wellington,5</p>
                    </div>
                    <div>
                        <p className="font-semibold">JSON Format:</p>
                        <p>Array of objects with required fields: time, latitude, longitude, depth, magnitude</p>
                    </div>
                    <div>
                        <p className="font-semibold">GeoJSON Format:</p>
                        <p>FeatureCollection with Point geometries and earthquake properties</p>
                    </div>
                    <div className="pt-1 border-t border-blue-300">
                        <p className="font-semibold mb-1">Supported Date/Time Formats:</p>
                        <ul className="list-disc list-inside space-y-0.5 ml-2">
                            {getSupportedDateFormats().map((format, index) => (
                                <li key={index}>{format}</li>
                            ))}
                        </ul>
                        <p className="mt-1 text-blue-600 italic">
                            Note: All dates will be displayed in dd/mm/yyyy HH:mm:ss format in the app
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

