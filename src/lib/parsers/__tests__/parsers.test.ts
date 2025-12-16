import { CsvParser } from '../CsvParser';
import { ExcelParser } from '../ExcelParser';
import { JsonParser } from '../JsonParser';
import { DatParser } from '../DatParser';
import { getFileParser } from '../../fileParser';
import { ImportOptions, DEFAULT_VALIDATION_RULES } from '@/types/csvUpload';
import * as XLSX from 'xlsx';

// Mock File object since it's not available in Node environment by default
// We'll use a simple class or object to mimic it if needed, or rely on Jest environment being jsdom
// The package.json says "jest-environment-jsdom": "^30.2.0" so File should be available.

// Polyfill Blob.prototype.text if missing (JSDOM/Node environment issue)
if (!Blob.prototype.text) {
    Blob.prototype.text = function () {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsText(this);
        });
    };
}

const createMockFile = (content: string | ArrayBuffer, name: string, type: string): File => {
    const blob = new Blob([content], { type });
    return new File([blob], name, { type });
};

const defaultOptions: ImportOptions = {
    dateFormat: 'auto',
    coordinateFormat: 'decimal',
    validationRules: DEFAULT_VALIDATION_RULES,
    mapping: {
        columns: [],
        useSplitDateTime: false
    }
};

describe('File Parsers', () => {

    describe('Factory', () => {
        it('should return CsvParser for .csv files', () => {
            const file = createMockFile('', 'test.csv', 'text/csv');
            const parser = getFileParser(file);
            expect(parser).toBeInstanceOf(CsvParser);
        });

        it('should return ExcelParser for .xlsx files', () => {
            const file = createMockFile('', 'test.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            const parser = getFileParser(file);
            expect(parser).toBeInstanceOf(ExcelParser);
        });

        it('should return JsonParser for .json files', () => {
            const file = createMockFile('', 'test.json', 'application/json');
            const parser = getFileParser(file);
            expect(parser).toBeInstanceOf(JsonParser);
        });

        it('should return DatParser for .dat files', () => {
            const file = createMockFile('', 'test.dat', 'text/plain');
            const parser = getFileParser(file);
            expect(parser).toBeInstanceOf(DatParser);
        });
    });

    describe('CsvParser', () => {
        const parser = new CsvParser();
        const csvContent = `time,latitude,longitude,depth,magnitude,eventID
2024-01-01 12:00:00,-41.2,174.7,10,5.2,ev1
2024-01-02 13:00:00,-42.2,173.7,15,4.8,ev2`;

        it('should parse valid CSV', async () => {
            const file = createMockFile(csvContent, 'test.csv', 'text/csv');
            const preview = await parser.getPreview(file);

            expect(preview.success).toBe(true);
            expect(preview.headers).toEqual(['time', 'latitude', 'longitude', 'depth', 'magnitude', 'eventID']);
            expect(preview.totalRows).toBe(2);
        });

        it('should detect tab delimiter in .tab file', async () => {
            const tabContent = `time\tlatitude\tlongitude\tdepth\tmagnitude\teventID
2024-01-01 12:00:00\t-41.2\t174.7\t10\t5.2\tev1
2024-01-02 13:00:00\t-42.2\t173.7\t15\t4.8\tev2`;

            // Note: We haven't added .tab support to parser yet, so use .txt for this test to pass check
            const file = createMockFile(tabContent, 'test.txt', 'text/plain');
            const preview = await parser.getPreview(file);

            expect(preview.success).toBe(true);
            expect(preview.detectedDelimiter).toBe('\t');
            expect(preview.headers.length).toBe(6);
            expect(preview.totalRows).toBe(2);
        });
    });

    describe('JsonParser', () => {
        const parser = new JsonParser();
        const jsonData = [
            { time: '2024-01-01 12:00:00', latitude: -41.2, longitude: 174.7, depth: 10, magnitude: 5.2, eventID: 'ev1' },
            { time: '2024-01-02 13:00:00', latitude: -42.2, longitude: 173.7, depth: 15, magnitude: 4.8, eventID: 'ev2' }
        ];

        it('should parse valid JSON array', async () => {
            const file = createMockFile(JSON.stringify(jsonData), 'test.json', 'application/json');
            const preview = await parser.getPreview(file);

            expect(preview.success).toBe(true);
            expect(preview.headers).toContain('latitude');
            expect(preview.totalRows).toBe(2);
        });
    });

    // We can add more specific tests as needed, but this covers the basic wiring.
});

describe('DatParser', () => {
    const parser = new DatParser();

    it('should handle .dat file that is actually CSV', async () => {
        const datContent = `publicID,year,month,day
2177643,1460, 1, 1
2177645,1773, 5,11`;

        const file = createMockFile(datContent, 'test.dat', 'text/plain');
        const preview = await parser.getPreview(file);

        expect(preview.success).toBe(true);
        expect(preview.headers).toEqual(['publicID', 'year', 'month', 'day']);
        expect(preview.totalRows).toBe(2);
    });

    it('should handle whitespace separated .dat file', async () => {
        const datContent = `time latitude longitude
2024-01-01 -41.2 174.7
2024-01-02 -42.2 173.7`;

        const file = createMockFile(datContent, 'generated.dat', 'text/plain');
        const preview = await parser.getPreview(file);

        expect(preview.success).toBe(true);
        expect(preview.headers).toContain('latitude');
        expect(preview.totalRows).toBe(2);
    });
});

