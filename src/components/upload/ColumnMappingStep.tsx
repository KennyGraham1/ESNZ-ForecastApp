'use client';

import { useState, useEffect, useMemo } from 'react';
import { Table, ArrowRight, Check, AlertCircle, Info } from 'lucide-react';
import {
    ColumnMapping,
    MappingConfiguration,
    MappableField,
    REQUIRED_FIELDS,
    OPTIONAL_FIELDS
} from '@/types/csvUpload';
import {
    FilePreviewResult,
    ColumnSuggestions,
    suggestColumnMappings,
    getMissingRequiredFields
} from '@/lib/csvPreview';

interface ColumnMappingStepProps {
    preview: FilePreviewResult;
    onMappingChange: (mapping: MappingConfiguration) => void;
    initialMapping?: MappingConfiguration;
}

const FIELD_LABELS: Record<MappableField, string> = {
    latitude: 'Latitude',
    longitude: 'Longitude',
    depth: 'Depth (km)',
    magnitude: 'Magnitude',
    time: 'Date/Time',
    eventID: 'Event ID',
    locality: 'Location/Locality',
    mmi: 'MMI (Intensity)',
};

const FIELD_DESCRIPTIONS: Record<MappableField, string> = {
    latitude: 'Geographic latitude (-90 to 90)',
    longitude: 'Geographic longitude (-180 to 180)',
    depth: 'Earthquake depth in kilometers',
    magnitude: 'Earthquake magnitude',
    time: 'Date and time of the earthquake',
    eventID: 'Unique identifier for the event',
    locality: 'Location description or place name',
    mmi: 'Modified Mercalli Intensity',
};

export default function ColumnMappingStep({
    preview,
    onMappingChange,
    initialMapping
}: ColumnMappingStepProps) {
    // Initialize with suggestions
    const suggestions = useMemo(() =>
        suggestColumnMappings(preview.headers),
        [preview.headers]
    );

    const [mappings, setMappings] = useState<ColumnMapping[]>(
        initialMapping?.columns || suggestions.mappings
    );

    const [useSplitDateTime, setUseSplitDateTime] = useState(
        initialMapping?.useSplitDateTime ?? suggestions.hasSplitDateTime
    );

    const [splitDateColumns, setSplitDateColumns] = useState({
        year: initialMapping?.yearColumn || suggestions.splitDateTimeColumns?.year || '',
        month: initialMapping?.monthColumn || suggestions.splitDateTimeColumns?.month || '',
        day: initialMapping?.dayColumn || suggestions.splitDateTimeColumns?.day || '',
        hour: initialMapping?.hourColumn || suggestions.splitDateTimeColumns?.hour || '',
        minute: initialMapping?.minuteColumn || suggestions.splitDateTimeColumns?.minute || '',
        second: initialMapping?.secondColumn || suggestions.splitDateTimeColumns?.second || '',
    });

    // Custom field state
    const [customField, setCustomField] = useState<string>('');
    const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);

    // Calculate missing fields
    const missingFields = useMemo(() =>
        getMissingRequiredFields(mappings, useSplitDateTime),
        [mappings, useSplitDateTime]
    );

    // Get list of already-mapped fields
    const mappedFields = useMemo(() => {
        const fields = new Set<MappableField>();
        mappings.forEach(m => {
            if (m.isSelected && m.targetField) {
                fields.add(m.targetField);
            }
        });
        if (useSplitDateTime) {
            fields.add('time');
        }
        return fields;
    }, [mappings, useSplitDateTime]);

    // Update parent when mappings change
    useEffect(() => {
        const config: MappingConfiguration = {
            columns: mappings,
            useSplitDateTime,
            yearColumn: splitDateColumns.year,
            monthColumn: splitDateColumns.month,
            dayColumn: splitDateColumns.day,
            hourColumn: splitDateColumns.hour,
            minuteColumn: splitDateColumns.minute,
            secondColumn: splitDateColumns.second,
        };
        onMappingChange(config);
    }, [mappings, useSplitDateTime, splitDateColumns, onMappingChange]);

    // Handle column selection toggle
    const handleToggleSelect = (index: number) => {
        setMappings(prev => prev.map((m, i) =>
            i === index ? { ...m, isSelected: !m.isSelected } : m
        ));
    };



    // Handle field mapping change
    const handleFieldChange = (index: number, field: string | null) => {
        if (field === '__custom__') {
            setActiveRowIndex(index);
            setCustomField(mappings[index].sourceColumn); // Default to source name
            return;
        }

        setMappings(prev => prev.map((m, i) =>
            i === index ? { ...m, targetField: field as MappableField, isSelected: field !== null || m.isSelected } : m
        ));
    };

    // Confirm custom field
    const handleCustomFieldConfirm = () => {
        if (activeRowIndex !== null && customField.trim()) {
            const fieldName = customField.trim();
            setMappings(prev => prev.map((m, i) =>
                i === activeRowIndex ? { ...m, targetField: fieldName, isSelected: true } : m
            ));
            setActiveRowIndex(null);
            setCustomField('');
        }
    };

    // Get available fields for dropdown (excluding already-mapped ones)
    const getAvailableFields = (currentField: MappableField | null) => {
        const allFields: (MappableField | null)[] = [null, ...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
        return allFields.filter(f =>
            f === null ||
            f === currentField ||
            !mappedFields.has(f) ||
            (f === 'time' && useSplitDateTime)
        );
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2 text-gray-700">
                <Table className="w-5 h-5" />
                <h3 className="font-semibold">Map Columns to Earthquake Fields</h3>
            </div>

            {/* Missing fields warning */}
            {missingFields.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-amber-800">Missing required fields:</p>
                        <p className="text-sm text-amber-700">{missingFields.join(', ')}</p>
                    </div>
                </div>
            )}

            {/* Split DateTime option */}
            {suggestions.hasSplitDateTime && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={useSplitDateTime}
                            onChange={(e) => setUseSplitDateTime(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-blue-800">
                            Use split date/time columns (year, month, day, etc.)
                        </span>
                    </label>

                    {/* Split column selectors */}
                    {useSplitDateTime && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                            {(['year', 'month', 'day', 'hour', 'minute', 'second'] as const).map(field => (
                                <div key={field}>
                                    <label className="text-xs text-blue-700 capitalize">{field}</label>
                                    <select
                                        value={splitDateColumns[field]}
                                        onChange={(e) => setSplitDateColumns(prev => ({ ...prev, [field]: e.target.value }))}
                                        className="w-full text-xs p-1 border rounded border-blue-300 focus:ring-blue-500"
                                    >
                                        <option value="">-- Select --</option>
                                        {preview.headers.map(h => (
                                            <option key={h} value={h}>{h}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Data Preview Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium text-gray-700 w-8">
                                    <span className="sr-only">Select</span>
                                </th>
                                <th className="px-3 py-2 text-left font-medium text-gray-700">
                                    Source Column
                                </th>
                                <th className="px-3 py-2 text-center font-medium text-gray-700 w-8">
                                    <ArrowRight className="w-4 h-4 mx-auto" />
                                </th>
                                <th className="px-3 py-2 text-left font-medium text-gray-700">
                                    Map To Field
                                </th>
                                <th className="px-3 py-2 text-left font-medium text-gray-700">
                                    Sample Values
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {mappings.map((mapping, index) => {
                                const isRequired = mapping.targetField &&
                                    (REQUIRED_FIELDS as readonly string[]).includes(mapping.targetField);

                                return (
                                    <tr
                                        key={mapping.sourceColumn}
                                        className={`${mapping.isSelected
                                            ? 'bg-green-50'
                                            : 'bg-white hover:bg-gray-50'
                                            }`}
                                    >
                                        {/* Selection checkbox */}
                                        <td className="px-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={mapping.isSelected}
                                                onChange={() => handleToggleSelect(index)}
                                                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                            />
                                        </td>

                                        {/* Source column name */}
                                        <td className="px-3 py-2 font-mono text-gray-800">
                                            {mapping.sourceColumn}
                                        </td>

                                        {/* Arrow */}
                                        <td className="px-3 py-2 text-center">
                                            {mapping.targetField ? (
                                                <Check className="w-4 h-4 mx-auto text-green-600" />
                                            ) : (
                                                <ArrowRight className="w-4 h-4 mx-auto text-gray-300" />
                                            )}
                                        </td>

                                        {/* Target field dropdown */}
                                        <td className="px-3 py-2">
                                            {activeRowIndex === index ? (
                                                <div className="flex gap-1">
                                                    <input
                                                        type="text"
                                                        value={customField}
                                                        onChange={(e) => setCustomField(e.target.value)}
                                                        className="w-full text-sm p-1.5 border rounded focus:ring-2 border-blue-300 focus:ring-blue-500"
                                                        placeholder="Field name"
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleCustomFieldConfirm();
                                                            if (e.key === 'Escape') setActiveRowIndex(null);
                                                        }}
                                                    />
                                                    <button
                                                        onClick={handleCustomFieldConfirm}
                                                        className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                                                    >
                                                        Add
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <select
                                                        value={mapping.targetField || ''}
                                                        onChange={(e) => handleFieldChange(
                                                            index,
                                                            e.target.value
                                                        )}
                                                        className={`w-full text-sm p-1.5 border rounded focus:ring-2 ${isRequired
                                                            ? 'border-green-300 bg-green-50 focus:ring-green-500'
                                                            : 'border-gray-300 focus:ring-blue-500'
                                                            }`}
                                                    >
                                                        <option value="">-- Not mapped --</option>
                                                        {getAvailableFields(mapping.targetField).filter(f => f !== null).map(field => (
                                                            <option key={field} value={field!}>
                                                                {FIELD_LABELS[field!] || field!}
                                                                {(REQUIRED_FIELDS as readonly string[]).includes(field!) ? ' *' : ''}
                                                            </option>
                                                        ))}
                                                        <option value="__custom__" className="font-semibold text-blue-600">
                                                            + Add custom field...
                                                        </option>
                                                    </select>
                                                    {mapping.targetField && FIELD_DESCRIPTIONS[mapping.targetField] && (
                                                        <p className="text-xs text-gray-500 mt-0.5">
                                                            {FIELD_DESCRIPTIONS[mapping.targetField]}
                                                        </p>
                                                    )}
                                                </>
                                            )}
                                        </td>

                                        {/* Sample values */}
                                        <td className="px-3 py-2 text-gray-600">
                                            <div className="flex flex-wrap gap-1">
                                                {preview.previewRows.slice(0, 3).map((row, rowIdx) => (
                                                    <span
                                                        key={rowIdx}
                                                        className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono truncate max-w-24"
                                                        title={row[index]}
                                                    >
                                                        {row[index] || '—'}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-green-50 border border-green-200 rounded"></span>
                    <span>Selected for import</span>
                </div>
                <div className="flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    <span>Fields marked with * are required</span>
                </div>
            </div>

            {/* Row count info */}
            <div className="text-sm text-gray-600">
                <strong>{preview.totalRows.toLocaleString()}</strong> data rows detected
                {preview.commentedLinesSkipped > 0 && (
                    <span className="text-gray-500"> ({preview.commentedLinesSkipped} comment lines skipped)</span>
                )}
            </div>
        </div>
    );
}

