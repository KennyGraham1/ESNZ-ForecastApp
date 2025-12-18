/**
 * Types for CSV Upload with Column Selection and Mapping
 */

// Required earthquake fields that must be mapped
export const REQUIRED_FIELDS = ['latitude', 'longitude', 'depth', 'magnitude', 'time', 'eventID'] as const;
export type RequiredField = typeof REQUIRED_FIELDS[number];

// Optional earthquake fields
export const OPTIONAL_FIELDS = ['locality', 'mmi', 'azimuthalGap', 'magnitudeType', 'evaluationStatus', 'usedStationCount', 'minimumDistance', 'standardError'] as const;
export type OptionalField = typeof OPTIONAL_FIELDS[number];

// All mappable fields
export type MappableField = RequiredField | OptionalField | (string & {});

/**
 * Column mapping from source column to earthquake field
 */
export interface ColumnMapping {
    sourceColumn: string;
    targetField: MappableField | null;
    isSelected: boolean;
}

/**
 * Complete mapping configuration
 */
export interface MappingConfiguration {
    columns: ColumnMapping[];
    // For split date/time columns
    useSplitDateTime: boolean;
    yearColumn?: string;
    monthColumn?: string;
    dayColumn?: string;
    hourColumn?: string;
    minuteColumn?: string;
    secondColumn?: string;
}

/**
 * Supported date format options
 */
export type DateFormatOption =
    | 'auto'           // Auto-detect
    | 'dd/mm/yyyy'     // Day/Month/Year (NZ/UK format)
    | 'mm/dd/yyyy'     // Month/Day/Year (US format)
    | 'yyyy-mm-dd'     // ISO format
    | 'yyyy/mm/dd'     // Year/Month/Day
    | 'unix'           // Unix timestamp (seconds)
    | 'unix_ms'        // Unix timestamp (milliseconds)
    | 'iso8601';       // Full ISO 8601

export const DATE_FORMAT_OPTIONS: { value: DateFormatOption; label: string; example: string }[] = [
    { value: 'auto', label: 'Auto-detect', example: 'Automatically detect format' },
    { value: 'dd/mm/yyyy', label: 'DD/MM/YYYY', example: '25/12/2024 14:30:00' },
    { value: 'mm/dd/yyyy', label: 'MM/DD/YYYY', example: '12/25/2024 14:30:00' },
    { value: 'yyyy-mm-dd', label: 'YYYY-MM-DD', example: '2024-12-25 14:30:00' },
    { value: 'yyyy/mm/dd', label: 'YYYY/MM/DD', example: '2024/12/25 14:30:00' },
    { value: 'iso8601', label: 'ISO 8601', example: '2024-12-25T14:30:00.000Z' },
    { value: 'unix', label: 'Unix Timestamp (seconds)', example: '1735135800' },
    { value: 'unix_ms', label: 'Unix Timestamp (milliseconds)', example: '1735135800000' },
];

/**
 * Coordinate format options
 */
export type CoordinateFormatOption =
    | 'decimal'        // Decimal degrees (e.g., -41.2865)
    | 'dms'            // Degrees/Minutes/Seconds (e.g., 41°17'11"S)
    | 'dm';            // Degrees/Decimal Minutes (e.g., 41°17.183'S)

export const COORDINATE_FORMAT_OPTIONS: { value: CoordinateFormatOption; label: string; example: string }[] = [
    { value: 'decimal', label: 'Decimal Degrees', example: '-41.2865, 174.7762' },
    { value: 'dms', label: 'Degrees/Minutes/Seconds', example: '41°17\'11"S, 174°46\'34"E' },
    { value: 'dm', label: 'Degrees/Decimal Minutes', example: '41°17.183\'S, 174°46.572\'E' },
];

/**
 * Validation rules configuration
 */
export interface ValidationRules {
    // Magnitude validation
    minMagnitude: number;
    maxMagnitude: number;

    // Depth validation (km)
    minDepth: number;
    maxDepth: number;

    // Geographic bounds
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;

    // Time validation
    allowFutureDates: boolean;
    minYear: number;

    // Skip invalid rows or fail on first error
    skipInvalidRows: boolean;
}

export const DEFAULT_VALIDATION_RULES: ValidationRules = {
    minMagnitude: -2,
    maxMagnitude: 10,
    minDepth: 0,
    maxDepth: 1000,
    minLatitude: -90,
    maxLatitude: 90,
    minLongitude: -180,
    maxLongitude: 180,
    allowFutureDates: false,
    minYear: 1800,
    skipInvalidRows: true,
};

// New Zealand specific validation preset
export const NZ_VALIDATION_RULES: ValidationRules = {
    minMagnitude: -2,
    maxMagnitude: 10,
    minDepth: 0,
    maxDepth: 700,
    minLatitude: -52,
    maxLatitude: -29,
    minLongitude: 165,
    maxLongitude: 180,
    allowFutureDates: false,
    minYear: 1800,
    skipInvalidRows: true,
};

/**
 * Import options combining all settings
 */
export interface ImportOptions {
    dateFormat: DateFormatOption;
    coordinateFormat: CoordinateFormatOption;
    validationRules: ValidationRules;
    mapping: MappingConfiguration;
}

/**
 * Preview statistics for data summary
 */
export interface PreviewStatistics {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    skippedRows: number;

    // Date range
    minDate: Date | null;
    maxDate: Date | null;

    // Magnitude range
    minMagnitude: number | null;
    maxMagnitude: number | null;

    // Depth range
    minDepth: number | null;
    maxDepth: number | null;

    // Geographic bounds
    minLatitude: number | null;
    maxLatitude: number | null;
    minLongitude: number | null;
    maxLongitude: number | null;

    // Sample issues/warnings
    sampleWarnings: string[];
}

