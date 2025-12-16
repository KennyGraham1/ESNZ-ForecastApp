import { FileParser } from './types';
import { FilePreviewResult, CustomParseResult } from '@/lib/csvPreview';
import { ImportOptions } from '@/types/csvUpload';
import { CsvParser } from './CsvParser';
import Papa from 'papaparse'; // Using PapaParse for unparse to CSV conversion if convenient, or just map manually

export class JsonParser implements FileParser {
    private csvDelegate = new CsvParser();

    canParse(file: File): boolean {
        const name = file.name.toLowerCase();
        return name.endsWith('.json') || name.endsWith('.geojson');
    }

    async getPreview(file: File): Promise<FilePreviewResult> {
        try {
            const text = await file.text();
            let data: any;

            try {
                data = JSON.parse(text);
            } catch (e) {
                return {
                    success: false,
                    headers: [],
                    previewRows: [],
                    totalRows: 0,
                    errors: ['Invalid JSON format'],
                    detectedDelimiter: ',',
                    commentedLinesSkipped: 0
                };
            }

            const flattened = this.flattenData(data);

            if (flattened.length === 0) {
                return {
                    success: false,
                    headers: [],
                    previewRows: [],
                    totalRows: 0,
                    errors: ['JSON contains no array data or features'],
                    detectedDelimiter: ',',
                    commentedLinesSkipped: 0
                };
            }

            // Extract all possible keys from first 50 rows to form headers
            const allKeys = new Set<string>();
            const sample = flattened.slice(0, 50);
            sample.forEach(row => {
                Object.keys(row).forEach(k => allKeys.add(k));
            });

            const headers = Array.from(allKeys);
            const previewRows = sample.slice(0, 10).map(row => {
                return headers.map(h => {
                    const val = row[h];
                    return val === undefined || val === null ? '' : String(val);
                });
            });

            return {
                success: true,
                headers,
                previewRows,
                totalRows: flattened.length,
                detectedDelimiter: ',', // Virtual
                commentedLinesSkipped: 0
            };

        } catch (error) {
            return {
                success: false,
                headers: [],
                previewRows: [],
                totalRows: 0,
                errors: [`Failed to parse JSON file: ${error instanceof Error ? error.message : 'Unknown error'}`],
                detectedDelimiter: ',',
                commentedLinesSkipped: 0
            };
        }
    }

    async parse(file: File, options: ImportOptions): Promise<CustomParseResult> {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const flattened = this.flattenData(data);

            if (flattened.length === 0) {
                return {
                    success: false,
                    data: [],
                    statistics: this.createEmptyStats(),
                    errors: ['JSON contains no valid data'],
                    warnings: []
                };
            }

            // Convert to CSV string to reuse delegate
            const csv = Papa.unparse(flattened);
            const virtualFile = new File([csv], 'converted.csv', { type: 'text/csv' });

            return this.csvDelegate.parse(virtualFile, options);

        } catch (error) {
            return {
                success: false,
                data: [],
                statistics: this.createEmptyStats(),
                errors: [`Failed to parse JSON file: ${error instanceof Error ? error.message : 'Unknown error'}`],
                warnings: []
            };
        }
    }

    private flattenData(data: any): Record<string, any>[] {
        if (Array.isArray(data)) {
            // Standard JSON array
            return data.filter(item => typeof item === 'object' && item !== null);
        }

        if (typeof data === 'object' && data !== null) {
            // GeoJSON FeatureCollection
            if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
                return data.features.map((feature: any) => {
                    const row: Record<string, any> = { ...feature.properties };

                    if (feature.geometry && feature.geometry.type === 'Point' && Array.isArray(feature.geometry.coordinates)) {
                        row.longitude = feature.geometry.coordinates[0];
                        row.latitude = feature.geometry.coordinates[1];
                        if (feature.geometry.coordinates.length > 2) {
                            row.depth = feature.geometry.coordinates[2];
                        }
                    }

                    return row;
                });
            }

            // Single object wrapped in keys? Try to find first array property
            for (const key in data) {
                if (Array.isArray(data[key])) {
                    return data[key].filter((item: any) => typeof item === 'object' && item !== null);
                }
            }
        }

        return [];
    }

    private createEmptyStats() {
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
}
