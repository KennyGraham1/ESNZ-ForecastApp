'use client';

import { useState, useEffect } from 'react';
import { Settings, Calendar, MapPin, Shield, RotateCcw } from 'lucide-react';
import {
    DateFormatOption,
    CoordinateFormatOption,
    ValidationRules,
    DATE_FORMAT_OPTIONS,
    COORDINATE_FORMAT_OPTIONS,
    DEFAULT_VALIDATION_RULES,
    NZ_VALIDATION_RULES,
} from '@/types/csvUpload';

interface ImportOptionsStepProps {
    dateFormat: DateFormatOption;
    coordinateFormat: CoordinateFormatOption;
    validationRules: ValidationRules;
    onDateFormatChange: (format: DateFormatOption) => void;
    onCoordinateFormatChange: (format: CoordinateFormatOption) => void;
    onValidationRulesChange: (rules: ValidationRules) => void;
    useSplitDateTime?: boolean;
}

type ValidationPreset = 'default' | 'nz' | 'custom';

export default function ImportOptionsStep({
    dateFormat,
    coordinateFormat,
    validationRules,
    onDateFormatChange,
    onCoordinateFormatChange,
    onValidationRulesChange,
    useSplitDateTime = false,
}: ImportOptionsStepProps) {
    const [validationPreset, setValidationPreset] = useState<ValidationPreset>('default');
    const [showAdvancedValidation, setShowAdvancedValidation] = useState(false);
    
    // Handle preset change
    const handlePresetChange = (preset: ValidationPreset) => {
        setValidationPreset(preset);
        if (preset === 'default') {
            onValidationRulesChange(DEFAULT_VALIDATION_RULES);
        } else if (preset === 'nz') {
            onValidationRulesChange(NZ_VALIDATION_RULES);
        }
    };
    
    // Handle individual rule change
    const handleRuleChange = <K extends keyof ValidationRules>(
        key: K, 
        value: ValidationRules[K]
    ) => {
        setValidationPreset('custom');
        onValidationRulesChange({ ...validationRules, [key]: value });
    };
    
    return (
        <div className="space-y-6">
            {/* Date Format Section */}
            {!useSplitDateTime && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-gray-700">
                        <Calendar className="w-5 h-5" />
                        <h3 className="font-semibold">Date/Time Format</h3>
                    </div>
                    
                    <p className="text-sm text-gray-600">
                        Select the date format used in your file. This ensures dates are parsed correctly.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-2">
                        {DATE_FORMAT_OPTIONS.map(option => (
                            <label
                                key={option.value}
                                className={`flex flex-col p-3 border rounded-lg cursor-pointer transition-colors ${
                                    dateFormat === option.value
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="dateFormat"
                                        value={option.value}
                                        checked={dateFormat === option.value}
                                        onChange={() => onDateFormatChange(option.value)}
                                        className="w-4 h-4 text-blue-600"
                                    />
                                    <span className="font-medium text-sm">{option.label}</span>
                                </div>
                                <span className="text-xs text-gray-500 mt-1 ml-6">
                                    {option.example}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
            
            {/* Coordinate Format Section */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-gray-700">
                    <MapPin className="w-5 h-5" />
                    <h3 className="font-semibold">Coordinate Format</h3>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                    {COORDINATE_FORMAT_OPTIONS.map(option => (
                        <label
                            key={option.value}
                            className={`flex flex-col p-3 border rounded-lg cursor-pointer transition-colors ${
                                coordinateFormat === option.value
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="coordinateFormat"
                                    value={option.value}
                                    checked={coordinateFormat === option.value}
                                    onChange={() => onCoordinateFormatChange(option.value)}
                                    className="w-4 h-4 text-blue-600"
                                />
                                <span className="font-medium text-sm">{option.label}</span>
                            </div>
                            <span className="text-xs text-gray-500 mt-1 ml-6">
                                {option.example}
                            </span>
                        </label>
                    ))}
                </div>
            </div>
            
            {/* Validation Rules Section */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-700">
                        <Shield className="w-5 h-5" />
                        <h3 className="font-semibold">Validation Rules</h3>
                    </div>
                    <button
                        onClick={() => setShowAdvancedValidation(!showAdvancedValidation)}
                        className="text-sm text-blue-600 hover:text-blue-700"
                    >
                        {showAdvancedValidation ? 'Hide Advanced' : 'Show Advanced'}
                    </button>
                </div>

                {/* Preset buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={() => handlePresetChange('default')}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                            validationPreset === 'default'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                        Global Default
                    </button>
                    <button
                        onClick={() => handlePresetChange('nz')}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                            validationPreset === 'nz'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                        New Zealand Region
                    </button>
                    <button
                        onClick={() => setValidationPreset('custom')}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                            validationPreset === 'custom'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                        Custom
                    </button>
                </div>

                {/* Basic validation options */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                    {/* Skip invalid rows toggle */}
                    <label className="flex items-center gap-2 col-span-2">
                        <input
                            type="checkbox"
                            checked={validationRules.skipInvalidRows}
                            onChange={(e) => handleRuleChange('skipInvalidRows', e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600"
                        />
                        <span className="text-sm text-gray-700">
                            Skip invalid rows (instead of failing on first error)
                        </span>
                    </label>

                    {/* Allow future dates toggle */}
                    <label className="flex items-center gap-2 col-span-2">
                        <input
                            type="checkbox"
                            checked={validationRules.allowFutureDates}
                            onChange={(e) => handleRuleChange('allowFutureDates', e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600"
                        />
                        <span className="text-sm text-gray-700">
                            Allow future dates
                        </span>
                    </label>
                </div>

                {/* Advanced validation options */}
                {showAdvancedValidation && (
                    <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">Advanced Validation Settings</span>
                            <button
                                onClick={() => handlePresetChange('default')}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                            >
                                <RotateCcw className="w-3 h-3" />
                                Reset to defaults
                            </button>
                        </div>

                        {/* Magnitude range */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Min Magnitude</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={validationRules.minMagnitude}
                                    onChange={(e) => handleRuleChange('minMagnitude', parseFloat(e.target.value))}
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Max Magnitude</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={validationRules.maxMagnitude}
                                    onChange={(e) => handleRuleChange('maxMagnitude', parseFloat(e.target.value))}
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>

                        {/* Depth range */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Min Depth (km)</label>
                                <input
                                    type="number"
                                    value={validationRules.minDepth}
                                    onChange={(e) => handleRuleChange('minDepth', parseFloat(e.target.value))}
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Max Depth (km)</label>
                                <input
                                    type="number"
                                    value={validationRules.maxDepth}
                                    onChange={(e) => handleRuleChange('maxDepth', parseFloat(e.target.value))}
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>

                        {/* Geographic bounds */}
                        <div>
                            <label className="block text-xs text-gray-600 mb-2">Geographic Bounds</label>
                            <div className="grid grid-cols-4 gap-2">
                                <div>
                                    <label className="block text-xs text-gray-500">Min Lat</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={validationRules.minLatitude}
                                        onChange={(e) => handleRuleChange('minLatitude', parseFloat(e.target.value))}
                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500">Max Lat</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={validationRules.maxLatitude}
                                        onChange={(e) => handleRuleChange('maxLatitude', parseFloat(e.target.value))}
                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500">Min Lon</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={validationRules.minLongitude}
                                        onChange={(e) => handleRuleChange('minLongitude', parseFloat(e.target.value))}
                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500">Max Lon</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={validationRules.maxLongitude}
                                        onChange={(e) => handleRuleChange('maxLongitude', parseFloat(e.target.value))}
                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Min year */}
                        <div className="w-1/2">
                            <label className="block text-xs text-gray-600 mb-1">Minimum Year</label>
                            <input
                                type="number"
                                value={validationRules.minYear}
                                onChange={(e) => handleRuleChange('minYear', parseInt(e.target.value))}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

