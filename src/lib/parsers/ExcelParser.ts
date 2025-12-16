import { FileParser } from './types';
import { FilePreviewResult, CustomParseResult } from '@/lib/csvPreview';
import { ImportOptions } from '@/types/csvUpload';
import * as XLSX from 'xlsx';
import { CsvParser } from './CsvParser';

export class ExcelParser implements FileParser {
    // Reuse CsvParser logic for the actual table parsing once converted to array of arrays
    private csvDelegate = new CsvParser();

    canParse(file: File): boolean {
        const name = file.name.toLowerCase();
        return name.endsWith('.xlsx') || name.endsWith('.xls');
    }

    async getPreview(file: File): Promise<FilePreviewResult> {
        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });

            if (workbook.SheetNames.length === 0) {
                return {
                    success: false,
                    headers: [],
                    previewRows: [],
                    totalRows: 0,
                    errors: ['No sheets found in Excel file'],
                    detectedDelimiter: ',',
                    commentedLinesSkipped: 0
                };
            }

            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const data: string[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, defval: '' });

            if (data.length === 0) {
                return {
                    success: false,
                    headers: [],
                    previewRows: [],
                    totalRows: 0,
                    errors: ['Sheet is empty'],
                    detectedDelimiter: ',',
                    commentedLinesSkipped: 0
                };
            }

            const headers = data[0].map(String);
            const previewRows = data.slice(1, 11).map(row => row.map(String));

            return {
                success: true,
                headers,
                previewRows,
                totalRows: data.length - 1,
                detectedDelimiter: ',', // Virtual
                commentedLinesSkipped: 0
            };

        } catch (error) {
            return {
                success: false,
                headers: [],
                previewRows: [],
                totalRows: 0,
                errors: [`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`],
                detectedDelimiter: ',',
                commentedLinesSkipped: 0
            };
        }
    }

    async parse(file: File, options: ImportOptions): Promise<CustomParseResult> {
        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });

            if (workbook.SheetNames.length === 0) {
                return {
                    success: false,
                    data: [],
                    statistics: this.createEmptyStats(),
                    errors: ['No sheets found in Excel file'],
                    warnings: []
                };
            }

            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

            // Convert to CSV string to reuse the robust CsvParser logic
            // providing a consistent path for mapping/validation
            const csvContent = XLSX.utils.sheet_to_csv(firstSheet);

            // Create a virtual file for the delegate
            const virtualFile = new File([csvContent], 'converted.csv', { type: 'text/csv' });

            return this.csvDelegate.parse(virtualFile, options);

        } catch (error) {
            return {
                success: false,
                data: [],
                statistics: this.createEmptyStats(),
                errors: [`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`],
                warnings: []
            };
        }
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

