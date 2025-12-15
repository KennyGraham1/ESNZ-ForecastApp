'use client';

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import {
    Upload, FileUp, AlertCircle, CheckCircle, X,
    ChevronRight, ChevronLeft, Zap, Settings
} from 'lucide-react';
import { getSupportedFileExtensions } from '@/lib/csvParser';
import {
    extractFilePreview,
    suggestColumnMappings,
    parseCSVWithCustomMapping,
    getMissingRequiredFields,
    FilePreviewResult
} from '@/lib/csvPreview';
import { EarthquakeData } from '@/types/earthquake';
import { enhanceEarthquakeData } from '@/utils/earthquakeEnhancement';
import {
    MappingConfiguration,
    ImportOptions,
    PreviewStatistics,
    DateFormatOption,
    CoordinateFormatOption,
    ValidationRules,
    DEFAULT_VALIDATION_RULES
} from '@/types/csvUpload';
import ColumnMappingStep from './upload/ColumnMappingStep';
import ImportOptionsStep from './upload/ImportOptionsStep';
import DataPreviewStep from './upload/DataPreviewStep';

interface CatalogUploadProps {
    onDataLoaded: (data: EarthquakeData[], filename: string) => void;
    onClose?: () => void;
}

type UploadStep = 'select' | 'mapping' | 'options' | 'preview';

const STEPS: { id: UploadStep; label: string }[] = [
    { id: 'select', label: 'Select File' },
    { id: 'mapping', label: 'Map Columns' },
    { id: 'options', label: 'Import Options' },
    { id: 'preview', label: 'Preview & Import' },
];

export default function CatalogUpload({ onDataLoaded, onClose }: CatalogUploadProps) {
    // File selection state
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [filePreview, setFilePreview] = useState<FilePreviewResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Wizard state
    const [currentStep, setCurrentStep] = useState<UploadStep>('select');
    const [useAdvancedMode, setUseAdvancedMode] = useState(false);

    // Mapping configuration
    const [mappingConfig, setMappingConfig] = useState<MappingConfiguration | null>(null);

    // Import options
    const [dateFormat, setDateFormat] = useState<DateFormatOption>('auto');
    const [coordinateFormat, setCoordinateFormat] = useState<CoordinateFormatOption>('decimal');
    const [validationRules, setValidationRules] = useState<ValidationRules>(DEFAULT_VALIDATION_RULES);

    // Processing state
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [previewStats, setPreviewStats] = useState<PreviewStatistics | null>(null);
    const [parsedData, setParsedData] = useState<EarthquakeData[] | null>(null);

    // Drag and drop handlers
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
            handleFileSelect(files[0]);
        }
    };

    const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            handleFileSelect(files[0]);
        }
    };

    // Handle file selection
    const handleFileSelect = async (file: File) => {
        setError(null);
        setSuccess(null);

        // Validate file type
        const supportedExtensions = getSupportedFileExtensions();
        const fileName = file.name.toLowerCase();
        const isCSV = fileName.endsWith('.csv');
        const isSupported = supportedExtensions.some(ext => fileName.endsWith(ext));

        if (!isSupported) {
            setError(`Unsupported file type. Please select a ${supportedExtensions.join(', ')} file`);
            return;
        }

        // Validate file size (max 200MB)
        const maxSize = 200 * 1024 * 1024;
        if (file.size > maxSize) {
            setError('File size exceeds 200MB limit');
            return;
        }

        setSelectedFile(file);

        // For CSV files, extract preview for column mapping
        if (isCSV) {
            setIsProcessing(true);
            try {
                const preview = await extractFilePreview(file);
                if (!preview.success) {
                    setError(preview.errors?.join('; ') || 'Failed to read file');
                    setIsProcessing(false);
                    return;
                }
                setFilePreview(preview);

                // Auto-suggest mappings
                const suggestions = suggestColumnMappings(preview.headers);
                setMappingConfig({
                    columns: suggestions.mappings,
                    useSplitDateTime: suggestions.hasSplitDateTime,
                    yearColumn: suggestions.splitDateTimeColumns?.year,
                    monthColumn: suggestions.splitDateTimeColumns?.month,
                    dayColumn: suggestions.splitDateTimeColumns?.day,
                    hourColumn: suggestions.splitDateTimeColumns?.hour,
                    minuteColumn: suggestions.splitDateTimeColumns?.minute,
                    secondColumn: suggestions.splitDateTimeColumns?.second,
                });
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to read file');
            }
            setIsProcessing(false);
        }
    };

    const handleBrowseClick = () => {
        fileInputRef.current?.click();
    };

    // Handle mapping change
    const handleMappingChange = useCallback((mapping: MappingConfiguration) => {
        setMappingConfig(mapping);
    }, []);

    // Quick import (skip advanced options)
    const handleQuickImport = async () => {
        if (!selectedFile || !filePreview || !mappingConfig) return;

        // Validate required fields
        const missing = getMissingRequiredFields(mappingConfig.columns, mappingConfig.useSplitDateTime);
        if (missing.length > 0) {
            setError(`Missing required fields: ${missing.join(', ')}`);
            return;
        }

        setIsProcessing(true);
        setError(null);

        try {
            const options: ImportOptions = {
                dateFormat: 'auto',
                coordinateFormat: 'decimal',
                validationRules: DEFAULT_VALIDATION_RULES,
                mapping: mappingConfig,
            };

            const result = await parseCSVWithCustomMapping(selectedFile, options);

            if (!result.success || result.data.length === 0) {
                setError(result.errors.join('; ') || 'No valid data found');
                setIsProcessing(false);
                return;
            }

            // Enhance and import
            const enhancedData = enhanceEarthquakeData(result.data);
            setSuccess(`Successfully imported ${enhancedData.length.toLocaleString()} earthquakes`);
            onDataLoaded(enhancedData, selectedFile.name);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed');
        }
        setIsProcessing(false);
    };

    // Advanced import with preview
    const handleAdvancedImport = async () => {
        if (!selectedFile || !mappingConfig) return;

        setIsProcessing(true);
        setError(null);

        try {
            const options: ImportOptions = {
                dateFormat,
                coordinateFormat,
                validationRules,
                mapping: mappingConfig,
            };

            const result = await parseCSVWithCustomMapping(selectedFile, options);

            if (!result.success && result.data.length === 0) {
                setError(result.errors.join('; ') || 'No valid data found');
                setIsProcessing(false);
                return;
            }

            // Store parsed data and statistics
            setParsedData(result.data);
            setPreviewStats(result.statistics);
            setCurrentStep('preview');

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to process file');
        }
        setIsProcessing(false);
    };

    // Final import
    const handleFinalImport = () => {
        if (!parsedData || !selectedFile) return;

        const enhancedData = enhanceEarthquakeData(parsedData);
        setSuccess(`Successfully imported ${enhancedData.length.toLocaleString()} earthquakes`);
        onDataLoaded(enhancedData, selectedFile.name);
    };

    // Reset wizard
    const handleReset = () => {
        setSelectedFile(null);
        setFilePreview(null);
        setMappingConfig(null);
        setCurrentStep('select');
        setUseAdvancedMode(false);
        setError(null);
        setSuccess(null);
        setPreviewStats(null);
        setParsedData(null);
        setDateFormat('auto');
        setCoordinateFormat('decimal');
        setValidationRules(DEFAULT_VALIDATION_RULES);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Navigation
    const goToNextStep = () => {
        const currentIndex = STEPS.findIndex(s => s.id === currentStep);
        if (currentIndex < STEPS.length - 1) {
            if (currentStep === 'options') {
                handleAdvancedImport();
            } else {
                setCurrentStep(STEPS[currentIndex + 1].id);
            }
        }
    };

    const goToPrevStep = () => {
        const currentIndex = STEPS.findIndex(s => s.id === currentStep);
        if (currentIndex > 0) {
            setCurrentStep(STEPS[currentIndex - 1].id);
        }
    };

    // Check if can proceed
    const canProceed = (): boolean => {
        if (currentStep === 'select') {
            return !!selectedFile && !!filePreview;
        }
        if (currentStep === 'mapping') {
            if (!mappingConfig) return false;
            const missing = getMissingRequiredFields(mappingConfig.columns, mappingConfig.useSplitDateTime);
            return missing.length === 0;
        }
        if (currentStep === 'options') {
            return true;
        }
        if (currentStep === 'preview') {
            return !!parsedData && parsedData.length > 0;
        }
        return false;
    };

    // Render step content
    const renderStepContent = () => {
        switch (currentStep) {
            case 'select':
                return (
                    <div className="space-y-4">
                        {/* Drag and Drop Area */}
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                                isDragging
                                    ? 'border-blue-500 bg-blue-50'
                                    : selectedFile
                                        ? 'border-green-400 bg-green-50'
                                        : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                            }`}
                        >
                            {isProcessing ? (
                                <div className="flex flex-col items-center gap-3">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                                    <p className="text-sm text-gray-600">Reading file...</p>
                                </div>
                            ) : selectedFile ? (
                                <div className="flex flex-col items-center gap-2">
                                    <CheckCircle className="w-10 h-10 text-green-500" />
                                    <p className="text-sm font-medium text-green-700">{selectedFile.name}</p>
                                    <p className="text-xs text-gray-500">
                                        {(selectedFile.size / 1024).toFixed(1)} KB • {filePreview?.headers.length || 0} columns • {filePreview?.previewRows.length || 0}+ rows
                                    </p>
                                    <button
                                        onClick={handleReset}
                                        className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                                    >
                                        Choose different file
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <FileUp className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                    <p className="text-sm text-gray-600 mb-2">
                                        Drag and drop a CSV file here, or
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
                                        accept=".csv"
                                        onChange={handleFileInput}
                                        className="hidden"
                                    />
                                    <p className="text-xs text-gray-500 mt-3">
                                        Supported format: CSV (with column mapping)
                                    </p>
                                </>
                            )}
                        </div>

                        {/* Quick vs Advanced mode selection */}
                        {selectedFile && filePreview && (
                            <div className="flex gap-3">
                                <button
                                    onClick={() => { setUseAdvancedMode(false); setCurrentStep('mapping'); }}
                                    className="flex-1 p-4 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Zap className="w-5 h-5 text-blue-600" />
                                        <span className="font-medium text-gray-800">Quick Import</span>
                                    </div>
                                    <p className="text-xs text-gray-600">
                                        Map columns and import immediately with default settings
                                    </p>
                                </button>
                                <button
                                    onClick={() => { setUseAdvancedMode(true); setCurrentStep('mapping'); }}
                                    className="flex-1 p-4 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Settings className="w-5 h-5 text-blue-600" />
                                        <span className="font-medium text-gray-800">Advanced Import</span>
                                    </div>
                                    <p className="text-xs text-gray-600">
                                        Configure date format, validation rules, and preview before import
                                    </p>
                                </button>
                            </div>
                        )}
                    </div>
                );

            case 'mapping':
                return filePreview ? (
                    <ColumnMappingStep
                        preview={filePreview}
                        onMappingChange={handleMappingChange}
                        initialMapping={mappingConfig || undefined}
                    />
                ) : null;

            case 'options':
                return (
                    <ImportOptionsStep
                        dateFormat={dateFormat}
                        coordinateFormat={coordinateFormat}
                        validationRules={validationRules}
                        onDateFormatChange={setDateFormat}
                        onCoordinateFormatChange={setCoordinateFormat}
                        onValidationRulesChange={setValidationRules}
                        useSplitDateTime={mappingConfig?.useSplitDateTime}
                    />
                );

            case 'preview':
                return previewStats && selectedFile ? (
                    <DataPreviewStep
                        statistics={previewStats}
                        filename={selectedFile.name}
                        isLoading={isProcessing}
                    />
                ) : null;

            default:
                return null;
        }
    };

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
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

            {/* Step indicator (only show in advanced mode after file selection) */}
            {useAdvancedMode && currentStep !== 'select' && (
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        {STEPS.map((step, index) => {
                            const isActive = step.id === currentStep;
                            const isPast = STEPS.findIndex(s => s.id === currentStep) > index;
                            return (
                                <div key={step.id} className="flex items-center">
                                    <div className={`flex items-center gap-2 ${
                                        isActive ? 'text-blue-600' : isPast ? 'text-green-600' : 'text-gray-400'
                                    }`}>
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                                            isActive ? 'bg-blue-600 text-white' :
                                            isPast ? 'bg-green-600 text-white' :
                                            'bg-gray-200 text-gray-500'
                                        }`}>
                                            {isPast ? '✓' : index + 1}
                                        </div>
                                        <span className="text-xs font-medium hidden sm:inline">{step.label}</span>
                                    </div>
                                    {index < STEPS.length - 1 && (
                                        <ChevronRight className="w-4 h-4 text-gray-300 mx-2" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="p-4 max-h-[60vh] overflow-y-auto">
                {renderStepContent()}

                {/* Error Message */}
                {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm text-red-800 font-medium">{error}</p>
                        </div>
                    </div>
                )}

                {/* Success Message */}
                {success && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm text-green-800 font-medium">{success}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer with navigation */}
            {currentStep !== 'select' && (
                <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={currentStep === 'mapping' ? handleReset : goToPrevStep}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        {currentStep === 'mapping' ? 'Change File' : 'Back'}
                    </button>

                    <div className="flex gap-2">
                        {/* Quick import button (only on mapping step in quick mode) */}
                        {currentStep === 'mapping' && !useAdvancedMode && (
                            <button
                                onClick={handleQuickImport}
                                disabled={!canProceed() || isProcessing}
                                className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                            >
                                {isProcessing ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        Importing...
                                    </>
                                ) : (
                                    <>
                                        <Zap className="w-4 h-4" />
                                        Quick Import
                                    </>
                                )}
                            </button>
                        )}

                        {/* Next/Import button */}
                        {(useAdvancedMode || currentStep === 'mapping') && currentStep !== 'preview' && (
                            <button
                                onClick={useAdvancedMode ? goToNextStep : () => { setUseAdvancedMode(true); goToNextStep(); }}
                                disabled={!canProceed() || isProcessing}
                                className={`flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                                    useAdvancedMode
                                        ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300'
                                        : 'border border-gray-300 text-gray-700 hover:bg-gray-100'
                                } disabled:cursor-not-allowed`}
                            >
                                {isProcessing ? 'Processing...' : (
                                    <>
                                        {useAdvancedMode ? 'Next' : 'Advanced Options'}
                                        <ChevronRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        )}

                        {/* Final import button */}
                        {currentStep === 'preview' && (
                            <button
                                onClick={handleFinalImport}
                                disabled={!canProceed()}
                                className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                            >
                                <CheckCircle className="w-4 h-4" />
                                Import Data
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
