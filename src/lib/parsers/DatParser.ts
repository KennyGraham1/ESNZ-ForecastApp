import { FileParser } from './types';
import { FilePreviewResult, CustomParseResult } from '@/lib/csvPreview';
import { ImportOptions } from '@/types/csvUpload';
import { CsvParser } from './CsvParser';

export class DatParser implements FileParser {
    private csvDelegate = new CsvParser();

    canParse(file: File): boolean {
        const name = file.name.toLowerCase();
        return name.endsWith('.dat');
    }

    async getPreview(file: File): Promise<FilePreviewResult> {
        // Convert whitespace to tabs or commas to help the CSV parser
        const transformedFile = await this.preprocessFile(file);
        return this.csvDelegate.getPreview(transformedFile);
    }

    async parse(file: File, options: ImportOptions): Promise<CustomParseResult> {
        const transformedFile = await this.preprocessFile(file);
        return this.csvDelegate.parse(transformedFile, options);
    }

    private async preprocessFile(file: File): Promise<File> {
        const text = await file.text();
        const lines = text.split(/\r?\n/);

        // Take a sample of non-empty lines
        const sampleLines = lines.filter(line => line.trim().length > 0).slice(0, 5);

        if (sampleLines.length === 0) {
            return new File([text], file.name + '.csv', { type: 'text/csv' });
        }

        // Check if common delimiters already exist
        const delimiters = [',', '\t', ';', '|'];
        let hasDelimiter = false;

        for (const delimiter of delimiters) {
            // Check if every sample line has the delimiter
            const allHaveDelimiter = sampleLines.every(line => line.includes(delimiter));
            if (allHaveDelimiter) {
                hasDelimiter = true;
                break;
            }
        }

        if (hasDelimiter) {
            // It's likely already a CSV/TSV, just pass it through with .csv extension
            // to ensure CsvParser accepts it if it checks extensions
            return new File([text], file.name + '.csv', { type: 'text/csv' });
        }

        // Fallback: Assume it's whitespace separated (space aligned columns)
        // Replace multiple spaces with a single comma
        const processedLines = lines.map(line => {
            const trimmed = line.trim();
            if (trimmed.length === 0) return '';
            return trimmed.replace(/\s+/g, ',');
        });

        const newContent = processedLines.join('\n');
        return new File([newContent], file.name + '.csv', { type: 'text/csv' });
    }
}
