import { EarthquakeData } from '@/types/earthquake';
import { parse as dateFnsParse } from 'date-fns';
import { safeMinMax } from '@/utils/arrayMath';
import {
    ColumnMapping,
    DateFormatOption,
    CoordinateFormatOption,
    REQUIRED_FIELDS,
    MappableField,
} from '@/types/csvUpload';

/**
 * Check if a line is a comment line
 */
export function isCommentLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('%');
}

/**
 * Check if a value is NaN, empty, or invalid
 */
export function isInvalidValue(value: any): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return true;
        if (trimmed.toLowerCase() === 'nan') return true;
        if (trimmed === 'null') return true;
        if (trimmed === 'undefined') return true;
    }
    if (typeof value === 'number' && isNaN(value)) return true;
    return false;
}

/**
 * Convert DMS (Degrees/Minutes/Seconds) to decimal degrees
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
    value: string | number,
    format: CoordinateFormatOption
): number | null {
    if (value === undefined || value === null || value === '') return null;

    if (typeof value === 'number') return value;

    const trimmed = String(value).trim();
    if (trimmed === '') return null;

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
 * Supported date/time formats
 */
export const SUPPORTED_DATE_FORMATS = [
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
    'yyyy-MM-ddTHH:mm:ss',      // ISO 8601
    'yyyy-MM-ddTHH:mm:ss.SSS',  // ISO 8601 with ms
    'yyyy-MM-ddTHH:mm:ss.SSSZ', // ISO 8601 with timezone
];

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
    // Add milliseconds if present in seconds
    if (seconds % 1 !== 0) {
        date.setMilliseconds(Math.round((seconds % 1) * 1000));
    }

    return isNaN(date.getTime()) ? null : date;
}

/**
 * Auto-detect and parse date format
 */
export function autoParseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

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
 * Parse a time value from various formats
 */
export function parseTimeValue(timeValue: any, format: DateFormatOption = 'auto'): Date | null {
    if (!timeValue) {
        return null;
    }

    // If already a Date object
    if (timeValue instanceof Date) {
        return isNaN(timeValue.getTime()) ? null : timeValue;
    }

    // If it's a number (Unix timestamp)
    if (typeof timeValue === 'number') {
        let timestamp = timeValue;
        // If timestamp appears to be in seconds, convert to milliseconds
        if (timestamp < 10000000000) {
            timestamp = timestamp * 1000;
        }
        const parsed = new Date(timestamp);
        return isNaN(parsed.getTime()) ? null : parsed;
    }

    // If it's a string
    if (typeof timeValue === 'string') {
        const trimmed = timeValue.trim();

        // Handle explicit formats
        if (format === 'unix') {
            const unixSec = parseInt(trimmed, 10);
            return isNaN(unixSec) ? null : new Date(unixSec * 1000);
        }
        if (format === 'unix_ms') {
            const unixMs = parseInt(trimmed, 10);
            return isNaN(unixMs) ? null : new Date(unixMs);
        }
        if (format === 'iso8601') {
            const isoDate = new Date(trimmed);
            return isNaN(isoDate.getTime()) ? null : isoDate;
        }

        // Try precise format parsing if specified
        if (format === 'dd/mm/yyyy' || format === 'mm/dd/yyyy' ||
            format === 'yyyy-mm-dd' || format === 'yyyy/mm/dd') {

            // Map our format keys to the internal helper keys
            const map: Record<string, 'dmy' | 'mdy' | 'ymd'> = {
                'dd/mm/yyyy': 'dmy',
                'mm/dd/yyyy': 'mdy',
                'yyyy-mm-dd': 'ymd',
                'yyyy/mm/dd': 'ymd'
            };

            if (map[format]) {
                return parseDateWithFormat(trimmed, map[format]);
            }
        }

        // Try parsing as numeric timestamp (string representation)
        if (/^\d+$/.test(trimmed)) {
            const numericValue = parseInt(trimmed, 10);
            return parseTimeValue(numericValue, format);
        }

        // Auto detection logic
        if (format === 'auto') {
            // Check supported date formats library
            for (const fmt of SUPPORTED_DATE_FORMATS) {
                try {
                    const parsed = dateFnsParse(trimmed, fmt, new Date());
                    if (!isNaN(parsed.getTime())) {
                        const year = parsed.getFullYear();
                        if (year >= 1700 && year <= 2100) {
                            return parsed;
                        }
                    }
                } catch (e) {
                    // Continue
                }
            }

            return autoParseDate(trimmed);
        }
    }

    return null;
}

/**
 * Validate earthquake data quality
 */
export function validateEarthquakeData(earthquakes: EarthquakeData[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (earthquakes.length === 0) {
        errors.push('No earthquake data to validate');
        return { valid: false, errors };
    }

    const { min: minMag, max: maxMag } = safeMinMax(earthquakes.map(eq => eq.magnitude));
    const { min: minDepth, max: maxDepth } = safeMinMax(earthquakes.map(eq => eq.depth));
    const { min: minTime, max: maxTime } = safeMinMax(earthquakes.map(eq => eq.time.getTime()));

    if (minMag < -2 || maxMag > 10) {
        errors.push(`Magnitude range (${minMag.toFixed(1)} - ${maxMag.toFixed(1)}) is outside reasonable bounds (-2 to 10)`);
    }

    if (minDepth < 0 || maxDepth > 1000) {
        errors.push(`Depth range (${minDepth.toFixed(1)} - ${maxDepth.toFixed(1)} km) is outside reasonable bounds (0 to 1000 km)`);
    }

    const now = Date.now();
    if (maxTime > now + 86400000) {
        errors.push('Some earthquake times are in the future');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Sort earthquakes iteratively to avoid stack overflow
 */
export function sortEarthquakesIterative(earthquakes: EarthquakeData[]): void {
    const n = earthquakes.length;

    if (n < 10000) {
        earthquakes.sort((a, b) => b.timeMs! - a.timeMs!);
        return;
    }

    // Simple built-in sort is usually fine in modern JS engines even for large arrays
    // but we'll stick to the safe approach if needed, or just use built-in because
    // Array.prototype.sort is stable and non-recursive in V8 for large arrays
    earthquakes.sort((a, b) => b.timeMs! - a.timeMs!);
}

/**
 * Common column aliases for auto-correction
 */
export const COLUMN_ALIASES: Record<MappableField, string[]> = {
    latitude: ['latitude', 'lat', 'lat_gn', 'lat_jr', 'lat_sm', 'y', 'lat_deg', 'latitude_deg'],
    longitude: ['longitude', 'lon', 'long', 'lng', 'lon_gn', 'lon_jr', 'lon_sm', 'x', 'lon_deg', 'longitude_deg'],
    depth: ['depth', 'depth_gn', 'depth_jr', 'depth_sm', 'dep', 'z', 'depth_km'],
    magnitude: ['magnitude', 'mag', 'mag_gn', 'mag_sm', 'mag_jr', 'ml', 'mw', 'mb', 'ms'],
    time: ['time', 'datetime', 'date', 'origin_time', 'origintime', 'timestamp', 'origintime'],
    eventID: ['eventid', 'event_id', 'id', 'publicid', 'public_id', 'quakeid', 'earthquake_id', 'evid'],
    locality: ['locality', 'location', 'place', 'region', 'area', 'description'],
    mmi: ['mmi', 'intensity', 'modified_mercalli'],
    azimuthalGap: ['azimuthal_gap', 'gap', 'azi_gap'],
    magnitudeType: ['magnitude_type', 'mag_type', 'type_mag'],
    evaluationStatus: ['evaluation_status', 'status', 'eval_status'],
    usedStationCount: ['used_station_count', 'station_count', 'stations', 'count_stations', 'n_stations'],
    minimumDistance: ['minimum_distance', 'min_dist', 'min_distance'],
    standardError: ['standard_error', 'std_error', 'rms', 'se'],
};
