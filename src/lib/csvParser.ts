import { EarthquakeData } from '@/types/earthquake';
import { parse as dateFnsParse } from 'date-fns';
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
 * Iterative in-place sort for large datasets to avoid call stack overflow
 * Sorts earthquakes by time (newest first) using iterative merge sort
 */
function sortEarthquakesIterative(earthquakes: EarthquakeData[]): void {
    const n = earthquakes.length;

    // For small arrays, use built-in sort
    if (n < 10000) {
        earthquakes.sort((a, b) => b.timeMs! - a.timeMs!);
        return;
    }

    // Iterative merge sort to avoid stack overflow on large datasets
    const temp: EarthquakeData[] = new Array(n);

    // Start with merge subarrays of size 1, and merge to form size 2, then 4, 8, ...
    for (let size = 1; size < n; size *= 2) {
        for (let start = 0; start < n; start += 2 * size) {
            const mid = Math.min(start + size, n);
            const end = Math.min(start + 2 * size, n);

            // Merge earthquakes[start...mid-1] and earthquakes[mid...end-1]
            merge(earthquakes, temp, start, mid, end);
        }
    }
}

/**
 * Merge two sorted subarrays in descending order (newest first)
 */
function merge(
    arr: EarthquakeData[],
    temp: EarthquakeData[],
    start: number,
    mid: number,
    end: number
): void {
    let i = start;
    let j = mid;
    let k = start;

    // Merge in descending order (newest first: higher timeMs first)
    while (i < mid && j < end) {
        if (arr[i].timeMs! >= arr[j].timeMs!) {
            temp[k++] = arr[i++];
        } else {
            temp[k++] = arr[j++];
        }
    }

    // Copy remaining elements
    while (i < mid) {
        temp[k++] = arr[i++];
    }

    while (j < end) {
        temp[k++] = arr[j++];
    }

    // Copy back to original array
    for (let i = start; i < end; i++) {
        arr[i] = temp[i];
    }
}

/**
 * Parse a CSV file containing earthquake catalog data
 * Supports multiple date formats and validates required columns
 * Automatically skips commented lines (starting with # or //)
 * Supports scientific catalog formats with flexible column mappings
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

        // Detect file format and create column mapping
        const columnMapping = detectColumnMapping(normalizedHeaders);

        // Validate that we can extract required fields
        const canExtractTime = columnMapping.hasTime || columnMapping.hasSplitDateTime;
        const canExtractLat = columnMapping.latitude.length > 0;
        const canExtractLon = columnMapping.longitude.length > 0;
        const canExtractDepth = columnMapping.depth.length > 0;
        const canExtractMag = columnMapping.magnitude.length > 0;

        if (!canExtractTime) {
            return {
                success: false,
                errors: ['Cannot find time information. Need either a "time" column or year/month/day columns.']
            };
        }

        const missingFields: string[] = [];
        if (!canExtractLat) missingFields.push('latitude (tried: lat, latitude, lat_gn, lat_jr)');
        if (!canExtractLon) missingFields.push('longitude (tried: lon, longitude, lon_gn, lon_jr)');
        if (!canExtractDepth) missingFields.push('depth (tried: depth, depth_gn, depth_jr)');
        if (!canExtractMag) missingFields.push('magnitude (tried: mag, magnitude, mag_gn, mag_sm, mag_jr)');

        if (missingFields.length > 0) {
            return {
                success: false,
                errors: [`Missing required fields: ${missingFields.join(', ')}`]
            };
        }

        console.log(`📊 Detected format: ${columnMapping.hasSplitDateTime ? 'Scientific (split date/time)' : 'Standard'}`);
        console.log(`   Time: ${columnMapping.hasSplitDateTime ? 'year/month/day/hour/min/sec' : 'time column'}`);
        console.log(`   Lat sources: ${columnMapping.latitude.join(', ')}`);
        console.log(`   Lon sources: ${columnMapping.longitude.join(', ')}`);
        console.log(`   Mag sources: ${columnMapping.magnitude.join(', ')}`);

        // Get column indices for fast access
        const columnIndices: { [key: string]: number } = {};
        normalizedHeaders.forEach((header, index) => {
            columnIndices[header] = index;
        });

        // Parse data rows with progress logging for large files
        const earthquakes: EarthquakeData[] = [];
        let rowNumber = 1; // Start from 1 (header is row 0)
        const totalRows = lines.length - 1;
        const progressInterval = Math.max(1, Math.floor(totalRows / 10)); // Log every 10%

        for (let i = 1; i < lines.length; i++) {
            rowNumber++;
            const line = lines[i].trim();

            if (!line) continue;

            // Progress logging for large files
            if (totalRows > 10000 && i % progressInterval === 0) {
                const progress = Math.round((i / totalRows) * 100);
                console.log(`⏳ Parsing: ${progress}% (${earthquakes.length.toLocaleString()} events loaded)`);
            }

            try {
                const values = parseCSVLine(line);

                if (values.length !== headers.length) {
                    // Only warn if mismatch is significant (not just trailing commas)
                    if (Math.abs(values.length - headers.length) > 2) {
                        warnings.push(`Row ${rowNumber}: Column count mismatch (expected ${headers.length}, got ${values.length})`);
                    }
                    continue;
                }

                // Create row object
                const row: CSVRow = {};
                normalizedHeaders.forEach((header, index) => {
                    row[header] = values[index]?.trim() || '';
                });

                // Parse earthquake data with flexible column mapping
                const earthquake = parseEarthquakeRowFlexible(row, rowNumber, warnings, columnMapping);

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
        // Use iterative approach for large datasets to avoid stack overflow
        console.log(`🔄 Sorting ${earthquakes.length.toLocaleString()} earthquakes...`);
        sortEarthquakesIterative(earthquakes);
        console.log(`✅ Sorting complete`);

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
 * Column mapping configuration for flexible CSV parsing
 */
interface ColumnMapping {
    hasTime: boolean;
    hasSplitDateTime: boolean;
    timeColumn?: string;
    yearColumn?: string;
    monthColumn?: string;
    dayColumn?: string;
    hourColumn?: string;
    minColumn?: string;
    secColumn?: string;
    latitude: string[];      // Priority-ordered list of latitude columns
    longitude: string[];     // Priority-ordered list of longitude columns
    depth: string[];         // Priority-ordered list of depth columns
    magnitude: string[];     // Priority-ordered list of magnitude columns
    locality: string[];      // Optional locality columns
    eventID: string[];       // Optional event ID columns
}

/**
 * Detect column mapping from headers
 * Supports both standard and scientific catalog formats
 */
function detectColumnMapping(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {
        hasTime: false,
        hasSplitDateTime: false,
        latitude: [],
        longitude: [],
        depth: [],
        magnitude: [],
        locality: [],
        eventID: []
    };

    // Check for standard time column
    if (headers.includes('time') || headers.includes('datetime') || headers.includes('date')) {
        mapping.hasTime = true;
        mapping.timeColumn = headers.find(h => h === 'time' || h === 'datetime' || h === 'date');
    }

    // Check for split date/time columns (scientific format)
    const hasYear = headers.some(h => h === 'year' || h === 'yr');
    const hasMonth = headers.some(h => h === 'month' || h === 'mon' || h === 'mo');
    const hasDay = headers.some(h => h === 'day' || h === 'dy');

    if (hasYear && hasMonth && hasDay) {
        mapping.hasSplitDateTime = true;
        mapping.yearColumn = headers.find(h => h === 'year' || h === 'yr');
        mapping.monthColumn = headers.find(h => h === 'month' || h === 'mon' || h === 'mo');
        mapping.dayColumn = headers.find(h => h === 'day' || h === 'dy');
        mapping.hourColumn = headers.find(h => h === 'hour' || h === 'hr' || h === 'h');
        mapping.minColumn = headers.find(h => h === 'min' || h === 'minute' || h === 'minutes');
        mapping.secColumn = headers.find(h => h === 'sec' || h === 'second' || h === 'seconds');
    }

    // Latitude columns (priority order: standard -> GeoNet -> JR catalog)
    const latCandidates = ['latitude', 'lat', 'lat_gn', 'lat_jr', 'lat_sm'];
    mapping.latitude = latCandidates.filter(col => headers.includes(col));

    // Longitude columns (priority order)
    const lonCandidates = ['longitude', 'lon', 'long', 'lon_gn', 'lon_jr', 'lon_sm'];
    mapping.longitude = lonCandidates.filter(col => headers.includes(col));

    // Depth columns (priority order)
    const depthCandidates = ['depth', 'depth_gn', 'depth_jr', 'depth_sm', 'dep'];
    mapping.depth = depthCandidates.filter(col => headers.includes(col));

    // Magnitude columns (priority: GeoNet -> SM -> JR -> generic)
    const magCandidates = ['magnitude', 'mag', 'mag_gn', 'mag_sm', 'mag_jr', 'ml', 'mw', 'mb', 'ms'];
    mapping.magnitude = magCandidates.filter(col => headers.includes(col));

    // Locality/location columns
    const localityCandidates = ['locality', 'location', 'place', 'region', 'area'];
    mapping.locality = localityCandidates.filter(col => headers.includes(col));

    // Event ID columns
    const idCandidates = ['eventid', 'event_id', 'id', 'publicid', 'public_id'];
    mapping.eventID = idCandidates.filter(col => headers.includes(col));

    return mapping;
}

/**
 * Check if a value is NaN, empty, or invalid
 */
function isInvalidValue(value: string | undefined): boolean {
    if (!value) return true;
    const trimmed = value.trim();
    if (trimmed === '') return true;
    if (trimmed.toLowerCase() === 'nan') return true;
    if (trimmed === 'null') return true;
    if (trimmed === 'undefined') return true;
    return false;
}

/**
 * Get first valid numeric value from priority-ordered list of columns
 */
function getFirstValidNumber(row: CSVRow, columns: string[]): number | null {
    for (const col of columns) {
        const value = row[col];
        if (isInvalidValue(value)) continue;

        const num = parseFloat(value);
        if (!isNaN(num)) {
            // Special handling: -9 is often used as missing data marker in catalogs
            if (num === -9) continue;
            return num;
        }
    }
    return null;
}

/**
 * Get first valid string value from priority-ordered list of columns
 */
function getFirstValidString(row: CSVRow, columns: string[]): string | null {
    for (const col of columns) {
        const value = row[col];
        if (!isInvalidValue(value)) {
            return value;
        }
    }
    return null;
}

/**
 * Parse earthquake row with flexible column mapping
 */
function parseEarthquakeRowFlexible(
    row: CSVRow,
    rowNumber: number,
    warnings: string[],
    mapping: ColumnMapping
): EarthquakeData | null {
    try {
        // Parse time
        let time: Date | null = null;

        if (mapping.hasTime && mapping.timeColumn) {
            // Standard format with time column
            const timeStr = row[mapping.timeColumn];
            if (!isInvalidValue(timeStr)) {
                time = parseTimeValue(timeStr, `Row ${rowNumber}`);
            }
        } else if (mapping.hasSplitDateTime) {
            // Scientific format with split date/time columns
            const year = row[mapping.yearColumn!];
            const month = row[mapping.monthColumn!];
            const day = row[mapping.dayColumn!];
            const hour = row[mapping.hourColumn!] || '0';
            const min = row[mapping.minColumn!] || '0';
            const sec = row[mapping.secColumn!] || '0';

            // Validate date components
            if (isInvalidValue(year) || isInvalidValue(month) || isInvalidValue(day)) {
                warnings.push(`Row ${rowNumber}: Missing date components`);
                return null;
            }

            // Parse components
            const yearNum = parseInt(year);
            const monthNum = parseInt(month);
            const dayNum = parseInt(day);
            const hourNum = parseInt(hour) || 0;
            const minNum = parseInt(min) || 0;
            const secNum = parseFloat(sec) || 0;

            // Validate ranges
            if (yearNum < 1000 || yearNum > 2100) {
                warnings.push(`Row ${rowNumber}: Invalid year ${yearNum}`);
                return null;
            }
            if (monthNum < 1 || monthNum > 12) {
                warnings.push(`Row ${rowNumber}: Invalid month ${monthNum}`);
                return null;
            }
            if (dayNum < 1 || dayNum > 31) {
                warnings.push(`Row ${rowNumber}: Invalid day ${dayNum}`);
                return null;
            }

            // Create date (month is 0-indexed in JavaScript Date)
            time = new Date(yearNum, monthNum - 1, dayNum, hourNum, minNum, secNum);
        }

        if (!time || isNaN(time.getTime())) {
            warnings.push(`Row ${rowNumber}: Invalid time value`);
            return null;
        }

        // Parse latitude with fallback sources
        const latitude = getFirstValidNumber(row, mapping.latitude);
        if (latitude === null || latitude < -90 || latitude > 90) {
            warnings.push(`Row ${rowNumber}: Invalid or missing latitude`);
            return null;
        }

        // Parse longitude with fallback sources
        const longitude = getFirstValidNumber(row, mapping.longitude);
        if (longitude === null || longitude < -180 || longitude > 180) {
            warnings.push(`Row ${rowNumber}: Invalid or missing longitude`);
            return null;
        }

        // Parse depth with fallback sources
        const depth = getFirstValidNumber(row, mapping.depth);
        if (depth === null || depth < 0) {
            warnings.push(`Row ${rowNumber}: Invalid or missing depth`);
            return null;
        }

        // Parse magnitude with fallback sources (priority: mag_gn > mag_sm > mag_jr > mag)
        const magnitude = getFirstValidNumber(row, mapping.magnitude);
        if (magnitude === null) {
            warnings.push(`Row ${rowNumber}: Invalid or missing magnitude`);
            return null;
        }

        // Optional: locality
        const locality = getFirstValidString(row, mapping.locality) || 'Unknown Location';

        // Optional: event ID
        const eventID = getFirstValidString(row, mapping.eventID) || `uploaded_${rowNumber}_${Date.now()}`;

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
            mmi: undefined
        };

    } catch (error) {
        warnings.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'Parse error'}`);
        return null;
    }
}

/**
 * Parse a single earthquake row from CSV data (legacy standard format)
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

    // FIXED: Use iterative approach instead of spread operator to avoid stack overflow on large datasets
    // Check for reasonable magnitude range
    let minMag = Infinity;
    let maxMag = -Infinity;
    for (const eq of earthquakes) {
        if (eq.magnitude < minMag) minMag = eq.magnitude;
        if (eq.magnitude > maxMag) maxMag = eq.magnitude;
    }

    if (minMag < -2 || maxMag > 10) {
        errors.push(`Magnitude range (${minMag.toFixed(1)} - ${maxMag.toFixed(1)}) is outside reasonable bounds (-2 to 10)`);
    }

    // Check for reasonable depth range
    let minDepth = Infinity;
    let maxDepth = -Infinity;
    for (const eq of earthquakes) {
        if (eq.depth < minDepth) minDepth = eq.depth;
        if (eq.depth > maxDepth) maxDepth = eq.depth;
    }

    if (minDepth < 0 || maxDepth > 1000) {
        errors.push(`Depth range (${minDepth.toFixed(1)} - ${maxDepth.toFixed(1)} km) is outside reasonable bounds (0 to 1000 km)`);
    }

    // Check for valid time range
    let minTime = Infinity;
    let maxTime = -Infinity;
    for (const eq of earthquakes) {
        const time = eq.time.getTime();
        if (time < minTime) minTime = time;
        if (time > maxTime) maxTime = time;
    }
    const now = Date.now();

    if (maxTime > now + 86400000) { // Allow 1 day in future for timezone issues
        errors.push('Some earthquake times are in the future');
    }

    // Allow historical earthquake data (no lower bound on time)
    // New Zealand has earthquake records dating back to the 1800s and earlier

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
                const parsed = dateFnsParse(trimmed, format, new Date());
                if (!isNaN(parsed.getTime())) {
                    // Additional validation: check if the parsed date is reasonable
                    const year = parsed.getFullYear();
                    // Basic sanity check year range
                    if (year >= 1700 && year <= 2100) {
                        return parsed;
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
        sortEarthquakesIterative(earthquakes);

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
        sortEarthquakesIterative(earthquakes);

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

