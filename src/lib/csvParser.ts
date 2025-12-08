import { EarthquakeData } from '@/types/earthquake';
import * as DateFns from 'date-fns';
import { DATETIME_FORMAT } from '@/utils/dateFormat';

export interface CSVParseResult {
    success: boolean;
    data?: EarthquakeData[];
    errors?: string[];
    warnings?: string[];
    rowCount?: number;
    validCount?: number;
    commentedLinesSkipped?: number;
}

interface CSVRow {
    [key: string]: string;
}

/**
 * Check if a line is a comment line
 * Supports # and // comment formats
 */
function isCommentLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('#') || trimmed.startsWith('//');
}

/**
 * Parse a CSV file containing earthquake catalog data
 * Supports multiple date formats and validates required columns
 * Automatically skips commented lines (starting with # or //)
 */
export async function parseEarthquakeCSV(file: File): Promise<CSVParseResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let commentedLinesSkipped = 0;

    try {
        // Read file content
        const text = await file.text();

        if (!text || text.trim().length === 0) {
            return {
                success: false,
                errors: ['File is empty']
            };
        }

        // Parse CSV - filter out empty lines and commented lines
        const allLines = text.split(/\r?\n/);
        const lines: string[] = [];

        for (const line of allLines) {
            const trimmed = line.trim();

            // Skip empty lines
            if (trimmed.length === 0) continue;

            // Skip commented lines
            if (isCommentLine(trimmed)) {
                commentedLinesSkipped++;
                continue;
            }

            lines.push(line);
        }

        if (lines.length < 2) {
            return {
                success: false,
                errors: ['File must contain at least a header row and one data row (excluding comments)']
            };
        }

        // Parse header
        const headerLine = lines[0];
        const headers = parseCSVLine(headerLine);

        // Normalize headers (lowercase, trim)
        const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

        // Validate required columns
        const requiredColumns = ['time', 'latitude', 'longitude', 'depth', 'magnitude'];
        const missingColumns = requiredColumns.filter(col => !normalizedHeaders.includes(col));

        if (missingColumns.length > 0) {
            return {
                success: false,
                errors: [`Missing required columns: ${missingColumns.join(', ')}`]
            };
        }

        // Get column indices
        const columnIndices: { [key: string]: number } = {};
        normalizedHeaders.forEach((header, index) => {
            columnIndices[header] = index;
        });

        // Parse data rows
        const earthquakes: EarthquakeData[] = [];
        let rowNumber = 1; // Start from 1 (header is row 0)

        for (let i = 1; i < lines.length; i++) {
            rowNumber++;
            const line = lines[i].trim();

            if (!line) continue;

            try {
                const values = parseCSVLine(line);

                if (values.length !== headers.length) {
                    warnings.push(`Row ${rowNumber}: Column count mismatch (expected ${headers.length}, got ${values.length})`);
                    continue;
                }

                // Create row object
                const row: CSVRow = {};
                normalizedHeaders.forEach((header, index) => {
                    row[header] = values[index]?.trim() || '';
                });

                // Parse earthquake data
                const earthquake = parseEarthquakeRow(row, rowNumber, warnings);

                if (earthquake) {
                    earthquakes.push(earthquake);
                }
            } catch (error) {
                warnings.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'Parse error'}`);
            }
        }

        if (earthquakes.length === 0) {
            return {
                success: false,
                errors: ['No valid earthquake data found in file'],
                warnings,
                commentedLinesSkipped: commentedLinesSkipped > 0 ? commentedLinesSkipped : undefined
            };
        }

        // Sort by time (newest first) to match application convention
        earthquakes.sort((a, b) => b.time.getTime() - a.time.getTime());

        return {
            success: true,
            data: earthquakes,
            warnings: warnings.length > 0 ? warnings : undefined,
            rowCount: lines.length - 1, // Exclude header
            validCount: earthquakes.length,
            commentedLinesSkipped: commentedLinesSkipped > 0 ? commentedLinesSkipped : undefined
        };

    } catch (error) {
        return {
            success: false,
            errors: [`Failed to parse CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`]
        };
    }
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++; // Skip next quote
            } else {
                // Toggle quote state
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // End of value
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    // Add last value
    values.push(current);

    return values;
}

/**
 * Parse a single earthquake row from CSV data
 */
function parseEarthquakeRow(row: CSVRow, rowNumber: number, warnings: string[]): EarthquakeData | null {
    try {
        // Parse time - support multiple formats
        const timeStr = row['time'];
        if (!timeStr) {
            warnings.push(`Row ${rowNumber}: Missing time value`);
            return null;
        }

        // Use the enhanced parseTimeValue function that supports all date formats
        const time = parseTimeValue(timeStr, `Row ${rowNumber}`);
        if (!time) {
            warnings.push(`Row ${rowNumber}: Invalid time format "${timeStr}"`);
            return null;
        }

        // Parse latitude
        const latitude = parseFloat(row['latitude']);
        if (isNaN(latitude) || latitude < -90 || latitude > 90) {
            warnings.push(`Row ${rowNumber}: Invalid latitude "${row['latitude']}"`);
            return null;
        }

        // Parse longitude
        const longitude = parseFloat(row['longitude']);
        if (isNaN(longitude) || longitude < -180 || longitude > 180) {
            warnings.push(`Row ${rowNumber}: Invalid longitude "${row['longitude']}"`);
            return null;
        }

        // Parse depth
        const depth = parseFloat(row['depth']);
        if (isNaN(depth) || depth < 0) {
            warnings.push(`Row ${rowNumber}: Invalid depth "${row['depth']}"`);
            return null;
        }

        // Parse magnitude
        const magnitude = parseFloat(row['magnitude']);
        if (isNaN(magnitude)) {
            warnings.push(`Row ${rowNumber}: Invalid magnitude "${row['magnitude']}"`);
            return null;
        }

        // Optional fields
        const locality = row['locality'] || 'Unknown Location';
        const mmi = row['mmi'] ? parseFloat(row['mmi']) : undefined;
        const eventID = row['eventid'] || row['event_id'] || `uploaded_${rowNumber}_${Date.now()}`;

        // Pre-compute timestamp for performance
        const timeMs = time.getTime();

        return {
            eventID,
            time,
            timeMs,
            latitude,
            longitude,
            depth,
            magnitude,
            locality,
            mmi: mmi && !isNaN(mmi) ? mmi : undefined
        };

    } catch (error) {
        warnings.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'Parse error'}`);
        return null;
    }
}

/**
 * Validate that the parsed earthquakes are reasonable
 */
export function validateEarthquakeData(earthquakes: EarthquakeData[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (earthquakes.length === 0) {
        errors.push('No earthquake data to validate');
        return { valid: false, errors };
    }

    // Check for reasonable magnitude range
    const magnitudes = earthquakes.map(eq => eq.magnitude);
    const minMag = Math.min(...magnitudes);
    const maxMag = Math.max(...magnitudes);

    if (minMag < -2 || maxMag > 10) {
        errors.push(`Magnitude range (${minMag.toFixed(1)} - ${maxMag.toFixed(1)}) is outside reasonable bounds (-2 to 10)`);
    }

    // Check for reasonable depth range
    const depths = earthquakes.map(eq => eq.depth);
    const minDepth = Math.min(...depths);
    const maxDepth = Math.max(...depths);

    if (minDepth < 0 || maxDepth > 1000) {
        errors.push(`Depth range (${minDepth.toFixed(1)} - ${maxDepth.toFixed(1)} km) is outside reasonable bounds (0 to 1000 km)`);
    }

    // Check for valid time range
    const times = earthquakes.map(eq => eq.time.getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const now = Date.now();

    if (maxTime > now + 86400000) { // Allow 1 day in future for timezone issues
        errors.push('Some earthquake times are in the future');
    }

    if (minTime < new Date('1900-01-01').getTime()) {
        errors.push('Some earthquake times are before 1900');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Supported date/time formats for parsing earthquake catalog data
 */
const SUPPORTED_DATE_FORMATS = [
    'dd/MM/yyyy HH:mm:ss',      // New Zealand/UK format (preferred)
    'dd/MM/yyyy HH:mm:ss.SSS',  // With milliseconds
    'MM/dd/yyyy HH:mm:ss',      // US format
    'MM/dd/yyyy HH:mm:ss.SSS',  // US format with milliseconds
    'yyyy-MM-dd HH:mm:ss',      // SQL/database format
    'yyyy-MM-dd HH:mm:ss.SSS',  // SQL format with milliseconds
    'dd-MM-yyyy HH:mm:ss',      // Dash-separated format
    'dd-MM-yyyy HH:mm:ss.SSS',  // Dash-separated with milliseconds
    'yyyy/MM/dd HH:mm:ss',      // ISO-like with slashes
    'yyyy/MM/dd HH:mm:ss.SSS',  // ISO-like with slashes and milliseconds
    'dd/MM/yyyy',               // Date only (assumes 00:00:00)
    'MM/dd/yyyy',               // US date only
    'yyyy-MM-dd',               // SQL date only
    'dd-MM-yyyy',               // Dash-separated date only
];

/**
 * Parse a time value from various formats
 * Supports multiple date formats, ISO 8601, and Unix timestamps
 */
function parseTimeValue(timeValue: any, context: string): Date | null {
    if (!timeValue) {
        return null;
    }

    // If already a Date object
    if (timeValue instanceof Date) {
        return isNaN(timeValue.getTime()) ? null : timeValue;
    }

    // If it's a number (Unix timestamp)
    if (typeof timeValue === 'number') {
        // Handle both milliseconds and seconds timestamps
        // Timestamps in seconds are typically < 10000000000 (before year 2286)
        // Timestamps in milliseconds are typically > 10000000000
        let timestamp = timeValue;

        // If timestamp appears to be in seconds, convert to milliseconds
        if (timestamp < 10000000000) {
            timestamp = timestamp * 1000;
        }

        const parsed = new Date(timestamp);
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }
        return null;
    }

    // If it's a string
    if (typeof timeValue === 'string') {
        const trimmed = timeValue.trim();

        // Try parsing as numeric timestamp (string representation)
        // Only if purely numeric to avoid confusing with other formats
        if (/^\d+$/.test(trimmed)) {
            const numericValue = parseInt(trimmed, 10);
            return parseTimeValue(numericValue, context);
        }

        // IMPROVED: Try each supported format FIRST to handle ambiguous dates (e.g. 08/12/2025)
        // correctly according to NZ/UK preference over US defaults.
        for (const format of SUPPORTED_DATE_FORMATS) {
            try {
                // Handle potential ESM/CJS interop issues with date-fns in test environment
                const parseFunc = DateFns.parse || (DateFns as any).default?.parse;

                if (typeof parseFunc === 'function') {
                    const parsed = parseFunc(trimmed, format, new Date());
                    if (!isNaN(parsed.getTime())) {
                        // Additional validation: check if the parsed date is reasonable
                        const year = parsed.getFullYear();
                        // Basic sanity check year range
                        if (year >= 1700 && year <= 2100) {
                            return parsed;
                        }
                    }
                }
            } catch (e) {
                // Continue to next format
            }
        }

        // Fallback: Try ISO 8601 / Browser default last
        // This handles standard ISO strings that might not hit the formats above
        try {
            const isoDate = new Date(trimmed);
            if (!isNaN(isoDate.getTime())) {
                const year = isoDate.getFullYear();
                if (year >= 1700 && year <= 2100) {
                    return isoDate;
                }
            }
        } catch {
            // Failed
        }
    }

    return null;
}

/**
 * Get list of supported date formats for display
 */
export function getSupportedDateFormats(): string[] {
    return [
        'dd/mm/yyyy HH:mm:ss (NZ/UK format)',
        'mm/dd/yyyy HH:mm:ss (US format)',
        'yyyy-mm-dd HH:mm:ss (SQL/database format)',
        'dd-mm-yyyy HH:mm:ss (dash-separated)',
        'ISO 8601 (e.g., 2024-11-25T14:30:00.000Z)',
        'Unix timestamp (seconds or milliseconds)',
    ];
}

/**
 * Parse earthquake data from JSON format
 */
export async function parseEarthquakeJSON(file: File): Promise<CSVParseResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const earthquakes: EarthquakeData[] = [];

    try {
        const text = await file.text();
        let jsonData: any;

        try {
            jsonData = JSON.parse(text);
        } catch (parseError) {
            errors.push('Invalid JSON format: ' + (parseError instanceof Error ? parseError.message : 'Parse error'));
            return { success: false, errors, warnings, data: [], validCount: 0, rowCount: 0 };
        }

        // Handle both array and single object
        const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];

        if (dataArray.length === 0) {
            errors.push('JSON file contains no data');
            return { success: false, errors, warnings, data: [], validCount: 0, rowCount: 0 };
        }

        // Parse each earthquake record
        dataArray.forEach((record, index) => {
            const rowNumber = index + 1;

            try {
                // Parse time
                const time = parseTimeValue(record.time, `Row ${rowNumber}`);
                if (!time) {
                    warnings.push(`Row ${rowNumber}: Invalid or missing time value`);
                    return;
                }

                // Parse required fields
                const latitude = parseFloat(record.latitude);
                if (isNaN(latitude) || latitude < -90 || latitude > 90) {
                    warnings.push(`Row ${rowNumber}: Invalid latitude "${record.latitude}"`);
                    return;
                }

                const longitude = parseFloat(record.longitude);
                if (isNaN(longitude) || longitude < -180 || longitude > 180) {
                    warnings.push(`Row ${rowNumber}: Invalid longitude "${record.longitude}"`);
                    return;
                }

                const depth = parseFloat(record.depth);
                if (isNaN(depth) || depth < 0) {
                    warnings.push(`Row ${rowNumber}: Invalid depth "${record.depth}"`);
                    return;
                }

                const magnitude = parseFloat(record.magnitude);
                if (isNaN(magnitude)) {
                    warnings.push(`Row ${rowNumber}: Invalid magnitude "${record.magnitude}"`);
                    return;
                }

                // Optional fields
                const locality = record.locality || 'Unknown Location';
                const mmi = record.mmi ? parseFloat(record.mmi) : undefined;
                const eventID = record.eventID || record.publicID || record.event_id || `uploaded_json_${rowNumber}_${Date.now()}`;

                // Pre-compute timestamp
                const timeMs = time.getTime();

                earthquakes.push({
                    eventID,
                    time,
                    timeMs,
                    latitude,
                    longitude,
                    depth,
                    magnitude,
                    locality,
                    mmi: mmi && !isNaN(mmi) ? mmi : undefined
                });

            } catch (error) {
                warnings.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'Parse error'}`);
            }
        });

        if (earthquakes.length === 0) {
            errors.push('No valid earthquake records found in JSON file');
            return { success: false, errors, warnings, data: [], validCount: 0, rowCount: dataArray.length };
        }

        // Sort by time descending (newest first)
        earthquakes.sort((a, b) => b.timeMs! - a.timeMs!);

        return {
            success: true,
            data: earthquakes,
            validCount: earthquakes.length,
            rowCount: dataArray.length,
            errors,
            warnings
        };

    } catch (error) {
        errors.push('Error reading JSON file: ' + (error instanceof Error ? error.message : 'Unknown error'));
        return { success: false, errors, warnings, data: [], validCount: 0, rowCount: 0 };
    }
}

/**
 * Parse earthquake data from GeoJSON format
 */
export async function parseEarthquakeGeoJSON(file: File): Promise<CSVParseResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const earthquakes: EarthquakeData[] = [];

    try {
        const text = await file.text();
        let geoJSON: any;

        try {
            geoJSON = JSON.parse(text);
        } catch (parseError) {
            errors.push('Invalid GeoJSON format: ' + (parseError instanceof Error ? parseError.message : 'Parse error'));
            return { success: false, errors, warnings, data: [], validCount: 0, rowCount: 0 };
        }

        // Validate GeoJSON structure
        if (geoJSON.type !== 'FeatureCollection') {
            errors.push('GeoJSON must be a FeatureCollection');
            return { success: false, errors, warnings, data: [], validCount: 0, rowCount: 0 };
        }

        if (!Array.isArray(geoJSON.features)) {
            errors.push('GeoJSON FeatureCollection must have a features array');
            return { success: false, errors, warnings, data: [], validCount: 0, rowCount: 0 };
        }

        if (geoJSON.features.length === 0) {
            errors.push('GeoJSON file contains no features');
            return { success: false, errors, warnings, data: [], validCount: 0, rowCount: 0 };
        }

        // Parse each feature
        geoJSON.features.forEach((feature: any, index: number) => {
            const rowNumber = index + 1;

            try {
                // Validate feature structure
                if (feature.type !== 'Feature') {
                    warnings.push(`Row ${rowNumber}: Invalid feature type "${feature.type}"`);
                    return;
                }

                if (!feature.geometry || feature.geometry.type !== 'Point') {
                    warnings.push(`Row ${rowNumber}: Feature must have Point geometry`);
                    return;
                }

                if (!Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length < 2) {
                    warnings.push(`Row ${rowNumber}: Invalid coordinates array`);
                    return;
                }

                // Extract coordinates [longitude, latitude, elevation/depth]
                const [longitude, latitude, elevation] = feature.geometry.coordinates;

                // Validate coordinates
                if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
                    warnings.push(`Row ${rowNumber}: Invalid latitude ${latitude}`);
                    return;
                }

                if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
                    warnings.push(`Row ${rowNumber}: Invalid longitude ${longitude}`);
                    return;
                }

                // Extract properties
                const props = feature.properties || {};

                // Parse time
                const time = parseTimeValue(props.time, `Row ${rowNumber}`);
                if (!time) {
                    warnings.push(`Row ${rowNumber}: Invalid or missing time in properties`);
                    return;
                }

                // Parse depth (can be from elevation or depth property)
                let depth: number;
                if (props.depth !== undefined) {
                    depth = parseFloat(props.depth);
                } else if (elevation !== undefined) {
                    // In GeoJSON, elevation is typically negative for depth below surface
                    depth = -parseFloat(elevation);
                } else {
                    warnings.push(`Row ${rowNumber}: Missing depth information`);
                    return;
                }

                if (isNaN(depth) || depth < 0) {
                    warnings.push(`Row ${rowNumber}: Invalid depth ${depth}`);
                    return;
                }

                // Parse magnitude
                const magnitude = parseFloat(props.magnitude);
                if (isNaN(magnitude)) {
                    warnings.push(`Row ${rowNumber}: Invalid or missing magnitude`);
                    return;
                }

                // Optional fields
                const locality = props.locality || props.location || props.place || 'Unknown Location';
                const mmi = props.mmi ? parseFloat(props.mmi) : undefined;
                const eventID = props.eventID || props.publicID || props.id || `uploaded_geojson_${rowNumber}_${Date.now()}`;

                // Pre-compute timestamp
                const timeMs = time.getTime();

                earthquakes.push({
                    eventID,
                    time,
                    timeMs,
                    latitude,
                    longitude,
                    depth,
                    magnitude,
                    locality,
                    mmi: mmi && !isNaN(mmi) ? mmi : undefined
                });

            } catch (error) {
                warnings.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'Parse error'}`);
            }
        });

        if (earthquakes.length === 0) {
            errors.push('No valid earthquake features found in GeoJSON file');
            return { success: false, errors, warnings, data: [], validCount: 0, rowCount: geoJSON.features.length };
        }

        // Sort by time descending (newest first)
        earthquakes.sort((a, b) => b.timeMs! - a.timeMs!);

        return {
            success: true,
            data: earthquakes,
            validCount: earthquakes.length,
            rowCount: geoJSON.features.length,
            errors,
            warnings
        };

    } catch (error) {
        errors.push('Error reading GeoJSON file: ' + (error instanceof Error ? error.message : 'Unknown error'));
        return { success: false, errors, warnings, data: [], validCount: 0, rowCount: 0 };
    }
}

/**
 * Detect file format based on extension and content
 */
function detectFileFormat(file: File): 'csv' | 'json' | 'geojson' | 'unknown' {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.csv')) {
        return 'csv';
    } else if (fileName.endsWith('.geojson')) {
        return 'geojson';
    } else if (fileName.endsWith('.json')) {
        return 'json';
    }

    return 'unknown';
}

/**
 * Unified parser that detects format and routes to appropriate parser
 */
export async function parseEarthquakeFile(file: File): Promise<CSVParseResult & { format?: string }> {
    const format = detectFileFormat(file);

    console.log(`📄 Detected file format: ${format} for file: ${file.name}`);

    switch (format) {
        case 'csv':
            const csvResult = await parseEarthquakeCSV(file);
            return { ...csvResult, format: 'CSV' };

        case 'json':
            const jsonResult = await parseEarthquakeJSON(file);
            return { ...jsonResult, format: 'JSON' };

        case 'geojson':
            const geoJsonResult = await parseEarthquakeGeoJSON(file);
            return { ...geoJsonResult, format: 'GeoJSON' };

        default:
            return {
                success: false,
                errors: [`Unsupported file format. Please upload a .csv, .json, or .geojson file.`],
                warnings: [],
                data: [],
                validCount: 0,
                rowCount: 0,
                format: 'Unknown'
            };
    }
}

/**
 * Get supported file extensions
 */
export function getSupportedFileExtensions(): string[] {
    return ['.csv', '.json', '.geojson'];
}

/**
 * Get supported MIME types
 */
export function getSupportedMimeTypes(): string[] {
    return [
        'text/csv',
        'application/json',
        'application/geo+json',
        'application/vnd.geo+json'
    ];
}

