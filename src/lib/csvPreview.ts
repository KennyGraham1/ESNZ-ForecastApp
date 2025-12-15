/**
 * CSV Preview and Custom Parsing Utilities
 * Provides functions for previewing CSV files, extracting headers,
 * and parsing with custom column mappings
 */

import { EarthquakeData } from '@/types/earthquake';
import {
    ColumnMapping,
    ImportOptions,
    PreviewStatistics,
    DateFormatOption,
    CoordinateFormatOption,
    REQUIRED_FIELDS,
    MappableField,
} from '@/types/csvUpload';

/**
 * Result of file preview extraction
 */
export interface FilePreviewResult {
    success: boolean;
    headers: string[];
    previewRows: string[][];
    totalRows: number;
    errors?: string[];
    detectedDelimiter: string;
    commentedLinesSkipped: number;
}

/**
 * Auto-detected column mapping suggestions
 */
export interface ColumnSuggestions {
    mappings: ColumnMapping[];
    suggestedDateFormat: DateFormatOption;
    hasSplitDateTime: boolean;
    splitDateTimeColumns?: {
        year?: string;
        month?: string;
        day?: string;
        hour?: string;
        minute?: string;
        second?: string;
    };
}

/**
 * Check if a line is a comment line
 */
function isCommentLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('#') || trimmed.startsWith('//');
}

/**
 * Detect the delimiter used in CSV (comma, semicolon, tab)
 */
function detectDelimiter(lines: string[]): string {
    const delimiters = [',', ';', '\t', '|'];
    const counts: Record<string, number[]> = {};
    
    delimiters.forEach(d => counts[d] = []);
    
    // Check first few non-comment lines
    const sampleLines = lines.filter(l => !isCommentLine(l) && l.trim()).slice(0, 5);
    
    for (const line of sampleLines) {
        for (const d of delimiters) {
            counts[d].push((line.match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length);
        }
    }
    
    // Find delimiter with most consistent non-zero count
    let bestDelimiter = ',';
    let bestScore = -1;
    
    for (const d of delimiters) {
        const c = counts[d];
        if (c.length === 0 || c[0] === 0) continue;
        
        // Check consistency (standard deviation)
        const avg = c.reduce((a, b) => a + b, 0) / c.length;
        const variance = c.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / c.length;
        const consistency = avg / (Math.sqrt(variance) + 1);
        
        if (consistency > bestScore) {
            bestScore = consistency;
            bestDelimiter = d;
        }
    }
    
    return bestDelimiter;
}

/**
 * Parse a CSV line handling quotes
 */
function parseCSVLine(line: string, delimiter: string = ','): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    values.push(current.trim());
    return values;
}

/**
 * Extract preview data from a file
 * Returns headers and first N rows for preview
 */
export async function extractFilePreview(
    file: File,
    maxPreviewRows: number = 10
): Promise<FilePreviewResult> {
    try {
        const text = await file.text();
        
        if (!text || text.trim().length === 0) {
            return {
                success: false,
                headers: [],
                previewRows: [],
                totalRows: 0,
                errors: ['File is empty'],
                detectedDelimiter: ',',
                commentedLinesSkipped: 0
            };
        }
        
        const allLines = text.split(/\r?\n/);
        const lines: string[] = [];
        let commentedLinesSkipped = 0;
        
        for (const line of allLines) {
            const trimmed = line.trim();
            if (trimmed.length === 0) continue;
            if (isCommentLine(trimmed)) {
                commentedLinesSkipped++;
                continue;
            }
            lines.push(line);
        }
        
        if (lines.length < 2) {
            return {
                success: false,
                headers: [],
                previewRows: [],
                totalRows: 0,
                errors: ['File must contain at least a header row and one data row'],
                detectedDelimiter: ',',
                commentedLinesSkipped
            };
        }
        
        const delimiter = detectDelimiter(lines);
        const headers = parseCSVLine(lines[0], delimiter);
        
        // Extract preview rows
        const previewRows: string[][] = [];
        const maxRows = Math.min(maxPreviewRows + 1, lines.length);
        
        for (let i = 1; i < maxRows; i++) {
            previewRows.push(parseCSVLine(lines[i], delimiter));
        }
        
        return {
            success: true,
            headers,
            previewRows,
            totalRows: lines.length - 1, // Exclude header
            detectedDelimiter: delimiter,
            commentedLinesSkipped
        };

    } catch (error) {
        return {
            success: false,
            headers: [],
            previewRows: [],
            totalRows: 0,
            errors: [`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`],
            detectedDelimiter: ',',
            commentedLinesSkipped: 0
        };
    }
}

/**
 * Column name variations for auto-detection
 */
const COLUMN_ALIASES: Record<MappableField, string[]> = {
    latitude: ['latitude', 'lat', 'lat_gn', 'lat_jr', 'lat_sm', 'y'],
    longitude: ['longitude', 'lon', 'long', 'lng', 'lon_gn', 'lon_jr', 'lon_sm', 'x'],
    depth: ['depth', 'depth_gn', 'depth_jr', 'depth_sm', 'dep', 'z'],
    magnitude: ['magnitude', 'mag', 'mag_gn', 'mag_sm', 'mag_jr', 'ml', 'mw', 'mb', 'ms'],
    time: ['time', 'datetime', 'date', 'origin_time', 'origintime', 'timestamp'],
    eventID: ['eventid', 'event_id', 'id', 'publicid', 'public_id', 'quakeid', 'earthquake_id'],
    locality: ['locality', 'location', 'place', 'region', 'area', 'description'],
    mmi: ['mmi', 'intensity', 'modified_mercalli'],
};

/**
 * Suggest column mappings based on header names
 */
export function suggestColumnMappings(headers: string[]): ColumnSuggestions {
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
    const mappings: ColumnMapping[] = [];
    const usedFields = new Set<MappableField>();

    // Check for split date/time columns
    const hasYear = normalizedHeaders.some(h => h === 'year' || h === 'yr');
    const hasMonth = normalizedHeaders.some(h => h === 'month' || h === 'mon' || h === 'mo');
    const hasDay = normalizedHeaders.some(h => h === 'day' || h === 'dy');
    const hasSplitDateTime = hasYear && hasMonth && hasDay;

    let splitDateTimeColumns: ColumnSuggestions['splitDateTimeColumns'];

    if (hasSplitDateTime) {
        splitDateTimeColumns = {
            year: headers[normalizedHeaders.findIndex(h => h === 'year' || h === 'yr')],
            month: headers[normalizedHeaders.findIndex(h => h === 'month' || h === 'mon' || h === 'mo')],
            day: headers[normalizedHeaders.findIndex(h => h === 'day' || h === 'dy')],
            hour: normalizedHeaders.includes('hour') || normalizedHeaders.includes('hr')
                ? headers[normalizedHeaders.findIndex(h => h === 'hour' || h === 'hr' || h === 'h')]
                : undefined,
            minute: normalizedHeaders.includes('min') || normalizedHeaders.includes('minute')
                ? headers[normalizedHeaders.findIndex(h => h === 'min' || h === 'minute' || h === 'minutes')]
                : undefined,
            second: normalizedHeaders.includes('sec') || normalizedHeaders.includes('second')
                ? headers[normalizedHeaders.findIndex(h => h === 'sec' || h === 'second' || h === 'seconds')]
                : undefined,
        };
    }

    // Match each header to a field
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        const normalized = normalizedHeaders[i];

        let matchedField: MappableField | null = null;

        // Find matching field
        for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [MappableField, string[]][]) {
            if (usedFields.has(field)) continue;

            if (aliases.includes(normalized)) {
                matchedField = field;
                usedFields.add(field);
                break;
            }
        }

        // Skip split datetime columns from individual mapping if using split mode
        const isSplitDateColumn = hasSplitDateTime && (
            normalized === 'year' || normalized === 'yr' ||
            normalized === 'month' || normalized === 'mon' || normalized === 'mo' ||
            normalized === 'day' || normalized === 'dy' ||
            normalized === 'hour' || normalized === 'hr' || normalized === 'h' ||
            normalized === 'min' || normalized === 'minute' || normalized === 'minutes' ||
            normalized === 'sec' || normalized === 'second' || normalized === 'seconds'
        );

        mappings.push({
            sourceColumn: header,
            targetField: isSplitDateColumn ? null : matchedField,
            isSelected: matchedField !== null || isSplitDateColumn,
        });
    }

    // If split datetime is used, mark time as mapped
    if (hasSplitDateTime) {
        usedFields.add('time');
    }

    return {
        mappings,
        suggestedDateFormat: 'auto',
        hasSplitDateTime,
        splitDateTimeColumns,
    };
}

/**
 * Check which required fields are missing from mapping
 */
export function getMissingRequiredFields(
    mappings: ColumnMapping[],
    useSplitDateTime: boolean
): string[] {
    const mappedFields = new Set(
        mappings
            .filter(m => m.isSelected && m.targetField)
            .map(m => m.targetField)
    );

    // If using split datetime, time is covered
    if (useSplitDateTime) {
        mappedFields.add('time');
    }

    const missing: string[] = [];
    for (const field of REQUIRED_FIELDS) {
        if (!mappedFields.has(field)) {
            missing.push(field);
        }
    }

    return missing;
}

/**
 * Convert DMS (Degrees/Minutes/Seconds) to decimal degrees
 * Handles formats like: 41°17'11"S, 41 17 11 S, 41:17:11S
 */
export function dmsToDecimal(dmsString: string): number | null {
    if (!dmsString || typeof dmsString !== 'string') return null;

    const cleaned = dmsString.trim().toUpperCase();

    // Try to match DMS pattern
    const dmsPattern = /(-?)(\d+)[°:\s]+(\d+)[\':\s]+(\d+\.?\d*)[\":\s]*([NSEW])?/;
    const match = cleaned.match(dmsPattern);

    if (match) {
        const sign = match[1] === '-' ? -1 : 1;
        const degrees = parseFloat(match[2]);
        const minutes = parseFloat(match[3]);
        const seconds = parseFloat(match[4]);
        const direction = match[5];

        let decimal = degrees + minutes / 60 + seconds / 3600;

        // Apply direction
        if (direction === 'S' || direction === 'W') {
            decimal = -Math.abs(decimal);
        } else {
            decimal = sign * decimal;
        }

        return decimal;
    }

    // Try decimal minutes format (41°17.183'S)
    const dmPattern = /(-?)(\d+)[°:\s]+(\d+\.?\d*)[\':\s]*([NSEW])?/;
    const dmMatch = cleaned.match(dmPattern);

    if (dmMatch) {
        const sign = dmMatch[1] === '-' ? -1 : 1;
        const degrees = parseFloat(dmMatch[2]);
        const minutes = parseFloat(dmMatch[3]);
        const direction = dmMatch[4];

        let decimal = degrees + minutes / 60;

        if (direction === 'S' || direction === 'W') {
            decimal = -Math.abs(decimal);
        } else {
            decimal = sign * decimal;
        }

        return decimal;
    }

    // Try plain decimal
    const plainDecimal = parseFloat(cleaned.replace(/[NSEW]/g, ''));
    if (!isNaN(plainDecimal)) {
        if (cleaned.includes('S') || cleaned.includes('W')) {
            return -Math.abs(plainDecimal);
        }
        return plainDecimal;
    }

    return null;
}

/**
 * Parse a coordinate value based on format option
 */
export function parseCoordinate(
    value: string,
    format: CoordinateFormatOption
): number | null {
    if (!value || value.trim() === '') return null;

    const trimmed = value.trim();

    switch (format) {
        case 'decimal':
            const decimal = parseFloat(trimmed);
            return isNaN(decimal) ? null : decimal;

        case 'dms':
        case 'dm':
            return dmsToDecimal(trimmed);

        default:
            // Try decimal first, then DMS
            const dec = parseFloat(trimmed);
            if (!isNaN(dec)) return dec;
            return dmsToDecimal(trimmed);
    }
}

/**
 * Parse a date value based on format option
 */
export function parseDateTime(
    value: string,
    format: DateFormatOption
): Date | null {
    if (!value || value.trim() === '') return null;

    const trimmed = value.trim();

    try {
        switch (format) {
            case 'unix':
                const unixSec = parseInt(trimmed, 10);
                if (isNaN(unixSec)) return null;
                return new Date(unixSec * 1000);

            case 'unix_ms':
                const unixMs = parseInt(trimmed, 10);
                if (isNaN(unixMs)) return null;
                return new Date(unixMs);

            case 'iso8601':
                const isoDate = new Date(trimmed);
                return isNaN(isoDate.getTime()) ? null : isoDate;

            case 'dd/mm/yyyy':
                return parseDateWithFormat(trimmed, 'dmy');

            case 'mm/dd/yyyy':
                return parseDateWithFormat(trimmed, 'mdy');

            case 'yyyy-mm-dd':
            case 'yyyy/mm/dd':
                return parseDateWithFormat(trimmed, 'ymd');

            case 'auto':
            default:
                return autoParseDate(trimmed);
        }
    } catch {
        return null;
    }
}

/**
 * Parse date with specific component order
 */
function parseDateWithFormat(
    dateStr: string,
    order: 'dmy' | 'mdy' | 'ymd'
): Date | null {
    // Split date and time parts
    const parts = dateStr.split(/[\sT]+/);
    const datePart = parts[0];
    const timePart = parts[1] || '00:00:00';

    // Parse date components
    const dateComponents = datePart.split(/[-\/\.]/);
    if (dateComponents.length < 3) return null;

    let year: number, month: number, day: number;

    switch (order) {
        case 'dmy':
            day = parseInt(dateComponents[0], 10);
            month = parseInt(dateComponents[1], 10);
            year = parseInt(dateComponents[2], 10);
            break;
        case 'mdy':
            month = parseInt(dateComponents[0], 10);
            day = parseInt(dateComponents[1], 10);
            year = parseInt(dateComponents[2], 10);
            break;
        case 'ymd':
            year = parseInt(dateComponents[0], 10);
            month = parseInt(dateComponents[1], 10);
            day = parseInt(dateComponents[2], 10);
            break;
    }

    // Handle 2-digit years
    if (year < 100) {
        year += year < 50 ? 2000 : 1900;
    }

    // Parse time components
    const timeComponents = timePart.split(':');
    const hours = parseInt(timeComponents[0], 10) || 0;
    const minutes = parseInt(timeComponents[1], 10) || 0;
    const seconds = parseFloat(timeComponents[2]) || 0;

    // Validate
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    const date = new Date(year, month - 1, day, hours, minutes, Math.floor(seconds));
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Auto-detect and parse date format
 */
function autoParseDate(dateStr: string): Date | null {
    // Try ISO format first
    if (dateStr.includes('T') || dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
        const isoDate = new Date(dateStr);
        if (!isNaN(isoDate.getTime())) return isoDate;
    }

    // Try to detect format from the date string
    const parts = dateStr.split(/[\sT]+/);
    const datePart = parts[0];
    const dateComponents = datePart.split(/[-\/\.]/);

    if (dateComponents.length >= 3) {
        const first = parseInt(dateComponents[0], 10);
        const second = parseInt(dateComponents[1], 10);
        // third component is parsed but not used for format detection
        // since we can determine format from first two components

        // If first component is > 31, it's likely a year (yyyy-mm-dd)
        if (first > 31) {
            return parseDateWithFormat(dateStr, 'ymd');
        }

        // If first component is > 12, it's likely a day (dd/mm/yyyy)
        if (first > 12) {
            return parseDateWithFormat(dateStr, 'dmy');
        }

        // If second component is > 12, it's likely a day (mm/dd/yyyy)
        if (second > 12) {
            return parseDateWithFormat(dateStr, 'mdy');
        }

        // Default to dd/mm/yyyy (NZ/UK format) as per user preference
        return parseDateWithFormat(dateStr, 'dmy');
    }

    // Last resort: try native Date parsing
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Result of custom CSV parsing
 */
export interface CustomParseResult {
    success: boolean;
    data: EarthquakeData[];
    statistics: PreviewStatistics;
    errors: string[];
    warnings: string[];
}

/**
 * Parse CSV file with custom column mapping and options
 */
export async function parseCSVWithCustomMapping(
    file: File,
    options: ImportOptions
): Promise<CustomParseResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const earthquakes: EarthquakeData[] = [];

    // Statistics tracking
    let totalRows = 0;
    let validRows = 0;
    let invalidRows = 0;
    let skippedRows = 0;
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    let minMag: number | null = null;
    let maxMag: number | null = null;
    let minDepth: number | null = null;
    let maxDepth: number | null = null;
    let minLat: number | null = null;
    let maxLat: number | null = null;
    let minLon: number | null = null;
    let maxLon: number | null = null;

    try {
        const text = await file.text();
        const allLines = text.split(/\r?\n/);
        const lines: string[] = [];

        // Filter out comments and empty lines
        for (const line of allLines) {
            const trimmed = line.trim();
            if (trimmed.length === 0) continue;
            if (isCommentLine(trimmed)) continue;
            lines.push(line);
        }

        if (lines.length < 2) {
            return {
                success: false,
                data: [],
                statistics: createEmptyStatistics(),
                errors: ['File must contain at least a header row and one data row'],
                warnings
            };
        }

        // Detect delimiter
        const delimiter = detectDelimiter(lines);
        const headers = parseCSVLine(lines[0], delimiter);

        // Build field index map from mapping configuration
        const fieldIndices: Record<string, number> = {};
        for (const mapping of options.mapping.columns) {
            if (mapping.isSelected && mapping.targetField) {
                const index = headers.findIndex(h => h === mapping.sourceColumn);
                if (index >= 0) {
                    fieldIndices[mapping.targetField] = index;
                }
            }
        }

        // Split datetime column indices
        let splitDateIndices: {
            year?: number;
            month?: number;
            day?: number;
            hour?: number;
            minute?: number;
            second?: number;
        } = {};

        if (options.mapping.useSplitDateTime) {
            splitDateIndices = {
                year: options.mapping.yearColumn
                    ? headers.findIndex(h => h === options.mapping.yearColumn)
                    : undefined,
                month: options.mapping.monthColumn
                    ? headers.findIndex(h => h === options.mapping.monthColumn)
                    : undefined,
                day: options.mapping.dayColumn
                    ? headers.findIndex(h => h === options.mapping.dayColumn)
                    : undefined,
                hour: options.mapping.hourColumn
                    ? headers.findIndex(h => h === options.mapping.hourColumn)
                    : undefined,
                minute: options.mapping.minuteColumn
                    ? headers.findIndex(h => h === options.mapping.minuteColumn)
                    : undefined,
                second: options.mapping.secondColumn
                    ? headers.findIndex(h => h === options.mapping.secondColumn)
                    : undefined,
            };
        }

        const { validationRules, dateFormat, coordinateFormat } = options;

        // Parse data rows
        for (let i = 1; i < lines.length; i++) {
            totalRows++;
            const rowNumber = i + 1;
            const line = lines[i].trim();
            if (!line) {
                skippedRows++;
                continue;
            }

            try {
                const values = parseCSVLine(line, delimiter);

                // Parse time
                let time: Date | null = null;

                if (options.mapping.useSplitDateTime) {
                    // Build date from split columns
                    const year = splitDateIndices.year !== undefined
                        ? parseInt(values[splitDateIndices.year], 10)
                        : new Date().getFullYear();
                    const month = splitDateIndices.month !== undefined
                        ? parseInt(values[splitDateIndices.month], 10)
                        : 1;
                    const day = splitDateIndices.day !== undefined
                        ? parseInt(values[splitDateIndices.day], 10)
                        : 1;
                    const hour = splitDateIndices.hour !== undefined
                        ? parseInt(values[splitDateIndices.hour], 10) || 0
                        : 0;
                    const minute = splitDateIndices.minute !== undefined
                        ? parseInt(values[splitDateIndices.minute], 10) || 0
                        : 0;
                    const second = splitDateIndices.second !== undefined
                        ? parseFloat(values[splitDateIndices.second]) || 0
                        : 0;

                    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                        time = new Date(year, month - 1, day, hour, minute, Math.floor(second));
                    }
                } else if (fieldIndices.time !== undefined) {
                    time = parseDateTime(values[fieldIndices.time], dateFormat);
                }

                if (!time || isNaN(time.getTime())) {
                    if (validationRules.skipInvalidRows) {
                        invalidRows++;
                        if (warnings.length < 20) {
                            warnings.push(`Row ${rowNumber}: Invalid or missing time`);
                        }
                        continue;
                    } else {
                        throw new Error(`Row ${rowNumber}: Invalid or missing time`);
                    }
                }

                // Validate time
                if (!validationRules.allowFutureDates && time > new Date()) {
                    if (validationRules.skipInvalidRows) {
                        invalidRows++;
                        continue;
                    }
                    throw new Error(`Row ${rowNumber}: Future date not allowed`);
                }

                if (time.getFullYear() < validationRules.minYear) {
                    if (validationRules.skipInvalidRows) {
                        invalidRows++;
                        continue;
                    }
                    throw new Error(`Row ${rowNumber}: Year before ${validationRules.minYear}`);
                }

                // Parse coordinates
                const latValue = fieldIndices.latitude !== undefined
                    ? values[fieldIndices.latitude]
                    : '';
                const lonValue = fieldIndices.longitude !== undefined
                    ? values[fieldIndices.longitude]
                    : '';

                const latitude = parseCoordinate(latValue, coordinateFormat);
                const longitude = parseCoordinate(lonValue, coordinateFormat);

                if (latitude === null || longitude === null) {
                    if (validationRules.skipInvalidRows) {
                        invalidRows++;
                        if (warnings.length < 20) {
                            warnings.push(`Row ${rowNumber}: Invalid coordinates`);
                        }
                        continue;
                    }
                    throw new Error(`Row ${rowNumber}: Invalid coordinates`);
                }

                // Validate coordinates
                if (latitude < validationRules.minLatitude || latitude > validationRules.maxLatitude ||
                    longitude < validationRules.minLongitude || longitude > validationRules.maxLongitude) {
                    if (validationRules.skipInvalidRows) {
                        invalidRows++;
                        continue;
                    }
                    throw new Error(`Row ${rowNumber}: Coordinates outside bounds`);
                }

                // Parse depth
                const depthValue = fieldIndices.depth !== undefined
                    ? values[fieldIndices.depth]
                    : '';
                const depth = parseFloat(depthValue);

                if (isNaN(depth)) {
                    if (validationRules.skipInvalidRows) {
                        invalidRows++;
                        if (warnings.length < 20) {
                            warnings.push(`Row ${rowNumber}: Invalid depth`);
                        }
                        continue;
                    }
                    throw new Error(`Row ${rowNumber}: Invalid depth`);
                }

                if (depth < validationRules.minDepth || depth > validationRules.maxDepth) {
                    if (validationRules.skipInvalidRows) {
                        invalidRows++;
                        continue;
                    }
                    throw new Error(`Row ${rowNumber}: Depth outside bounds`);
                }

                // Parse magnitude
                const magValue = fieldIndices.magnitude !== undefined
                    ? values[fieldIndices.magnitude]
                    : '';
                const magnitude = parseFloat(magValue);

                if (isNaN(magnitude)) {
                    if (validationRules.skipInvalidRows) {
                        invalidRows++;
                        if (warnings.length < 20) {
                            warnings.push(`Row ${rowNumber}: Invalid magnitude`);
                        }
                        continue;
                    }
                    throw new Error(`Row ${rowNumber}: Invalid magnitude`);
                }

                if (magnitude < validationRules.minMagnitude || magnitude > validationRules.maxMagnitude) {
                    if (validationRules.skipInvalidRows) {
                        invalidRows++;
                        continue;
                    }
                    throw new Error(`Row ${rowNumber}: Magnitude outside bounds`);
                }

                // Parse optional fields
                const eventID = fieldIndices.eventID !== undefined
                    ? values[fieldIndices.eventID] || `uploaded_${rowNumber}_${Date.now()}`
                    : `uploaded_${rowNumber}_${Date.now()}`;

                const locality = fieldIndices.locality !== undefined
                    ? values[fieldIndices.locality] || 'Unknown Location'
                    : 'Unknown Location';

                const mmi = fieldIndices.mmi !== undefined
                    ? parseFloat(values[fieldIndices.mmi])
                    : undefined;

                // Create earthquake record
                const earthquake: EarthquakeData = {
                    eventID,
                    time,
                    timeMs: time.getTime(),
                    latitude,
                    longitude,
                    depth,
                    magnitude,
                    locality,
                    mmi: mmi && !isNaN(mmi) ? mmi : undefined
                };

                earthquakes.push(earthquake);
                validRows++;

                // Update statistics
                if (!minDate || time < minDate) minDate = time;
                if (!maxDate || time > maxDate) maxDate = time;
                if (minMag === null || magnitude < minMag) minMag = magnitude;
                if (maxMag === null || magnitude > maxMag) maxMag = magnitude;
                if (minDepth === null || depth < minDepth) minDepth = depth;
                if (maxDepth === null || depth > maxDepth) maxDepth = depth;
                if (minLat === null || latitude < minLat) minLat = latitude;
                if (maxLat === null || latitude > maxLat) maxLat = latitude;
                if (minLon === null || longitude < minLon) minLon = longitude;
                if (maxLon === null || longitude > maxLon) maxLon = longitude;

            } catch (error) {
                if (!validationRules.skipInvalidRows) {
                    errors.push(error instanceof Error ? error.message : `Row ${rowNumber}: Parse error`);
                    break;
                }
                invalidRows++;
            }
        }

        // Sort by time (newest first)
        earthquakes.sort((a, b) => (b.timeMs || 0) - (a.timeMs || 0));

        const statistics: PreviewStatistics = {
            totalRows,
            validRows,
            invalidRows,
            skippedRows,
            minDate,
            maxDate,
            minMagnitude: minMag,
            maxMagnitude: maxMag,
            minDepth,
            maxDepth,
            minLatitude: minLat,
            maxLatitude: maxLat,
            minLongitude: minLon,
            maxLongitude: maxLon,
            sampleWarnings: warnings.slice(0, 10)
        };

        return {
            success: earthquakes.length > 0,
            data: earthquakes,
            statistics,
            errors,
            warnings
        };

    } catch (error) {
        return {
            success: false,
            data: [],
            statistics: createEmptyStatistics(),
            errors: [`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`],
            warnings
        };
    }
}

/**
 * Create empty statistics object
 */
function createEmptyStatistics(): PreviewStatistics {
    return {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        skippedRows: 0,
        minDate: null,
        maxDate: null,
        minMagnitude: null,
        maxMagnitude: null,
        minDepth: null,
        maxDepth: null,
        minLatitude: null,
        maxLatitude: null,
        minLongitude: null,
        maxLongitude: null,
        sampleWarnings: []
    };
}

/**
 * Generate preview statistics from a sample of rows
 * Used before full parsing to show user what to expect
 */
export async function generatePreviewStatistics(
    file: File,
    options: ImportOptions
): Promise<PreviewStatistics> {
    // Parse all rows to generate statistics
    const result = await parseCSVWithCustomMapping(file, options);
    return result.statistics;
}