import { ImportOptions } from '@/types/csvUpload';
import { EarthquakeData } from '@/types/earthquake';
import { FilePreviewResult, CustomParseResult } from '@/lib/csvPreview';

export interface FileParser {
    /**
     * Check if this parser handles the given file
     */
    canParse(file: File): boolean;

    /**
     * Get a preview of the file content (headers and first few rows)
     */
    getPreview(file: File): Promise<FilePreviewResult>;

    /**
     * Parse the full file with the given options
     */
    parse(file: File, options: ImportOptions): Promise<CustomParseResult>;
}

export type ParserFactory = (file: File) => FileParser | null;
