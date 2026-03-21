import { FileParser } from './parsers/types';
import { CsvParser } from './parsers/CsvParser';
import { ExcelParser } from './parsers/ExcelParser';
import { JsonParser } from './parsers/JsonParser';
import { DatParser } from './parsers/DatParser';
import { QmlParser } from './parsers/QmlParser';

const parsers: FileParser[] = [
    new QmlParser(),
    new CsvParser(),
    new ExcelParser(),
    new JsonParser(),
    new DatParser()
];

export function getFileParser(file: File): FileParser | null {
    for (const parser of parsers) {
        if (parser.canParse(file)) {
            return parser;
        }
    }
    return null;
}

export function getSupportedFileExtensions(): string[] {
    return [
        '.csv', '.txt', '.tsv', '.tab', // CSV/Tab
        '.xlsx', '.xls',        // Excel
        '.json', '.geojson',    // JSON
        '.dat',                 // DAT
        '.qml', '.quakeml',     // QuakeML
    ];
}

// Re-export common types for convenience
export type { FileParser } from './parsers/types';
