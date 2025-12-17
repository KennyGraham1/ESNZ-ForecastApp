import { FileParser } from './types';
import { FilePreviewResult, CustomParseResult } from '@/lib/csvPreview';
import { ImportOptions, PreviewStatistics } from '@/types/csvUpload';
import { EarthquakeData } from '@/types/earthquake';
import * as Utils from '@/lib/parserUtils';

export class CsvParser implements FileParser {
    canParse(file: File): boolean {
        const name = file.name.toLowerCase();
        return name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv') || name.endsWith('.tab');
    }

    async getPreview(file: File): Promise<FilePreviewResult> {
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
                // Skip empty lines
                if (trimmed.length === 0) continue;
                // Skip comments
                if (Utils.isCommentLine(trimmed)) {
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

            const delimiter = this.detectDelimiter(lines);
            const headers = this.parseCSVLine(lines[0], delimiter);

            // Extract preview rows
            const previewRows: string[][] = [];
            // Take up to 10 rows
            const maxRows = Math.min(11, lines.length);

            for (let i = 1; i < maxRows; i++) {
                previewRows.push(this.parseCSVLine(lines[i], delimiter));
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

    async parse(file: File, options: ImportOptions): Promise<CustomParseResult> {
        const warnings: string[] = [];

        // Statistics tracking
        const stats: PreviewStatistics = {
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

        const earthquakes: EarthquakeData[] = [];

        try {
            const text = await file.text();
            const allLines = text.split(/\r?\n/);
            const lines: string[] = [];

            // Filter out comments and empty lines
            for (const line of allLines) {
                const trimmed = line.trim();
                if (trimmed.length === 0) continue;
                if (Utils.isCommentLine(trimmed)) continue;
                lines.push(line);
            }

            if (lines.length < 2) {
                return {
                    success: false,
                    data: [],
                    statistics: stats,
                    errors: ['File must contain at least a header row and one data row'],
                    warnings
                };
            }

            // Detect delimiter
            const delimiter = this.detectDelimiter(lines);
            const headers = this.parseCSVLine(lines[0], delimiter);

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
            let splitDateIndices: any = {};
            if (options.mapping.useSplitDateTime) {
                splitDateIndices = {
                    year: options.mapping.yearColumn ? headers.findIndex(h => h === options.mapping.yearColumn) : -1,
                    month: options.mapping.monthColumn ? headers.findIndex(h => h === options.mapping.monthColumn) : -1,
                    day: options.mapping.dayColumn ? headers.findIndex(h => h === options.mapping.dayColumn) : -1,
                    hour: options.mapping.hourColumn ? headers.findIndex(h => h === options.mapping.hourColumn) : -1,
                    minute: options.mapping.minuteColumn ? headers.findIndex(h => h === options.mapping.minuteColumn) : -1,
                    second: options.mapping.secondColumn ? headers.findIndex(h => h === options.mapping.secondColumn) : -1,
                };
            }

            const { validationRules, dateFormat, coordinateFormat } = options;

            // Parse data rows
            for (let i = 1; i < lines.length; i++) {
                stats.totalRows++;
                const rowNumber = i + 1;
                const line = lines[i];
                if (!line.trim()) {
                    stats.skippedRows++;
                    continue;
                }

                try {
                    const values = this.parseCSVLine(line, delimiter);

                    // Parse time
                    let time: Date | null = null;

                    if (options.mapping.useSplitDateTime) {
                        // Build date from split columns
                        const year = splitDateIndices.year >= 0 ? parseInt(values[splitDateIndices.year], 10) : new Date().getFullYear();
                        const month = splitDateIndices.month >= 0 ? parseInt(values[splitDateIndices.month], 10) : 1;
                        const day = splitDateIndices.day >= 0 ? parseInt(values[splitDateIndices.day], 10) : 1;
                        const hour = splitDateIndices.hour >= 0 ? (parseInt(values[splitDateIndices.hour], 10) || 0) : 0;
                        const minute = splitDateIndices.minute >= 0 ? (parseInt(values[splitDateIndices.minute], 10) || 0) : 0;
                        const second = splitDateIndices.second >= 0 ? (parseFloat(values[splitDateIndices.second]) || 0) : 0;

                        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                            time = new Date(year, month - 1, day, hour, minute, Math.floor(second));
                            if (second % 1 !== 0) {
                                time.setMilliseconds(Math.round((second % 1) * 1000));
                            }
                        }
                    } else if (fieldIndices.time !== undefined) {
                        time = Utils.parseTimeValue(values[fieldIndices.time], dateFormat);
                    }

                    if (!time || isNaN(time.getTime())) {
                        if (validationRules.skipInvalidRows) {
                            stats.invalidRows++;
                            if (warnings.length < 10000) warnings.push(`Row ${rowNumber}: Invalid or missing time`);
                            continue;
                        } else {
                            throw new Error(`Row ${rowNumber}: Invalid or missing time`);
                        }
                    }

                    // Validate time
                    if (!validationRules.allowFutureDates && time > new Date(Date.now() + 86400000)) { // Allow 1 day buffer
                        if (validationRules.skipInvalidRows) {
                            stats.invalidRows++;
                            continue;
                        }
                        throw new Error(`Row ${rowNumber}: Future date not allowed`);
                    }

                    if (time.getFullYear() < validationRules.minYear) {
                        if (validationRules.skipInvalidRows) {
                            stats.invalidRows++;
                            continue;
                        }
                        throw new Error(`Row ${rowNumber}: Year before ${validationRules.minYear}`);
                    }

                    // Parse coordinates
                    const latValue = fieldIndices.latitude !== undefined ? values[fieldIndices.latitude] : '';
                    const lonValue = fieldIndices.longitude !== undefined ? values[fieldIndices.longitude] : '';

                    const latitude = Utils.parseCoordinate(latValue, coordinateFormat);
                    const longitude = Utils.parseCoordinate(lonValue, coordinateFormat);

                    if (latitude === null || longitude === null) {
                        if (validationRules.skipInvalidRows) {
                            stats.invalidRows++;
                            if (warnings.length < 10000) warnings.push(`Row ${rowNumber}: Invalid coordinates`);
                            continue;
                        }
                        throw new Error(`Row ${rowNumber}: Invalid coordinates`);
                    }

                    // Validate coordinates
                    if (latitude < validationRules.minLatitude || latitude > validationRules.maxLatitude ||
                        longitude < validationRules.minLongitude || longitude > validationRules.maxLongitude) {
                        if (validationRules.skipInvalidRows) {
                            stats.invalidRows++;
                            continue;
                        }
                        throw new Error(`Row ${rowNumber}: Coordinates outside bounds`);
                    }

                    // Parse depth
                    const depthValue = fieldIndices.depth !== undefined ? values[fieldIndices.depth] : '';
                    const depth = parseFloat(depthValue);

                    if (isNaN(depth)) {
                        if (validationRules.skipInvalidRows) {
                            stats.invalidRows++;
                            if (warnings.length < 10000) warnings.push(`Row ${rowNumber}: Invalid depth`);
                            continue;
                        }
                        throw new Error(`Row ${rowNumber}: Invalid depth`);
                    }

                    if (depth < 0) { // Depth is usually positive, but some catalogs allow negative (above sea level)
                        // For now assume standard seismology where depth >= 0, but maybe warn
                    }

                    // Parse magnitude
                    const magValue = fieldIndices.magnitude !== undefined ? values[fieldIndices.magnitude] : '';
                    const magnitude = parseFloat(magValue);

                    if (isNaN(magnitude)) {
                        if (validationRules.skipInvalidRows) {
                            stats.invalidRows++;
                            if (warnings.length < 10000) warnings.push(`Row ${rowNumber}: Invalid magnitude`);
                            continue;
                        }
                        throw new Error(`Row ${rowNumber}: Invalid magnitude`);
                    }

                    // Optional fields
                    const locality = fieldIndices.locality !== undefined ? values[fieldIndices.locality] : 'Unknown Location';
                    const eventID = fieldIndices.eventID !== undefined ? values[fieldIndices.eventID] : `csv_${rowNumber}_${Date.now()}`;
                    const mmi = fieldIndices.mmi !== undefined ? parseFloat(values[fieldIndices.mmi]) : undefined;

                    // Create earthquake object
                    const earthquake: EarthquakeData = {
                        eventID,
                        time,
                        timeMs: time.getTime(),
                        latitude,
                        longitude,
                        depth,
                        magnitude,
                        locality: locality || 'Unknown Location',
                        mmi: mmi && !isNaN(mmi) ? mmi : undefined
                    };

                    // Populate custom fields
                    for (const [field, index] of Object.entries(fieldIndices)) {
                        if (['latitude', 'longitude', 'time', 'depth', 'magnitude', 'eventID', 'locality', 'mmi'].includes(field)) {
                            continue;
                        }

                        const val = values[index];
                        // Try to parse as number if it looks like one
                        if (val && !isNaN(Number(val)) && val.trim() !== '') {
                            earthquake[field] = Number(val);
                        } else {
                            earthquake[field] = val;
                        }
                    }

                    earthquakes.push(earthquake);
                    stats.validRows++;

                    // Update stats
                    if (!stats.minDate || time < stats.minDate) stats.minDate = time;
                    if (!stats.maxDate || time > stats.maxDate) stats.maxDate = time;

                    if (stats.minMagnitude === null || magnitude < stats.minMagnitude) stats.minMagnitude = magnitude;
                    if (stats.maxMagnitude === null || magnitude > stats.maxMagnitude) stats.maxMagnitude = magnitude;

                    if (stats.minDepth === null || depth < stats.minDepth) stats.minDepth = depth;
                    if (stats.maxDepth === null || depth > stats.maxDepth) stats.maxDepth = depth;

                    if (stats.minLatitude === null || latitude < stats.minLatitude) stats.minLatitude = latitude;
                    if (stats.maxLatitude === null || latitude > stats.maxLatitude) stats.maxLatitude = latitude;

                    if (stats.minLongitude === null || longitude < stats.minLongitude) stats.minLongitude = longitude;
                    if (stats.maxLongitude === null || longitude > stats.maxLongitude) stats.maxLongitude = longitude;

                } catch (error) {
                    stats.invalidRows++;
                    if (warnings.length < 10000) {
                        warnings.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'Parse error'}`);
                    }
                }
            }

            // Populate sample warnings
            stats.sampleWarnings = warnings.slice(0, 5);

            Utils.sortEarthquakesIterative(earthquakes);

            return {
                success: earthquakes.length > 0,
                data: earthquakes,
                statistics: stats,
                errors: [], // Parse errors handled per row
                warnings
            };

        } catch (error) {
            return {
                success: false,
                data: [],
                statistics: stats,
                errors: [`Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`],
                warnings
            };
        }
    }

    private detectDelimiter(lines: string[]): string {
        const delimiters = [',', ';', '\t', '|'];
        const counts: Record<string, number[]> = {};

        delimiters.forEach(d => counts[d] = []);

        // Check first few non-comment lines
        const sampleLines = lines.filter(l => !Utils.isCommentLine(l) && l.trim()).slice(0, 5);

        for (const line of sampleLines) {
            for (const d of delimiters) {
                counts[d].push((line.match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length);
            }
        }

        let bestDelimiter = ',';
        let bestScore = -1;

        for (const d of delimiters) {
            const c = counts[d];
            if (c.length === 0 || c[0] === 0) continue;

            // Check consistency
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

    private parseCSVLine(line: string, delimiter: string): string[] {
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
}
