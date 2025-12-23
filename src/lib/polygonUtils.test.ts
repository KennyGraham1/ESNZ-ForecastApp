import { parsePolygonString, isPointInPolygon } from './polygonUtils';

describe('polygonUtils', () => {
    describe('parsePolygonString', () => {
        it('should parse WKT format', () => {
            const wkt = 'POLYGON((30 10, 40 40, 20 40, 10 20, 30 10))';
            const result = parsePolygonString(wkt);
            expect(result.polygon).not.toBeNull();
            expect(result.error).toBeNull();
            expect(result.polygon).toHaveLength(5);
        });

        it('should parse simple line-based format with comments', () => {
            const input = `
             # This is a comment
             30 10
             40 40
             # Another comment
             20 40
             10 20
             30 10
             `;
            const result = parsePolygonString(input);
            expect(result.polygon).not.toBeNull();
            expect(result.error).toBeNull();
            expect(result.polygon).toHaveLength(5);
            expect(result.polygon![0]).toEqual([30, 10]);
        });

        it('should return error for invalid WKT', () => {
            expect(parsePolygonString('POLYGON(INVALID)').error).toContain('Error parsing WKT');
        });

        it('should return error for invalid simple format', () => {
            // Missing a coordinate
            const input = `
            30 10
            INVALID 40
            `;
            const result = parsePolygonString(input);
            expect(result.error).toContain('Invalid format');
        });

        it('should validate coordinates', () => {
            // Out of bounds lat
            const result = parsePolygonString('30 95');
            expect(result.polygon).toBeNull();
            expect(result.error).toContain('Lat 95 out of bounds');
        });
    });

    describe('isPointInPolygon', () => {
        const square = [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0]
        ] as [number, number][];

        it('should return true for a point inside', () => {
            expect(isPointInPolygon([5, 5], square)).toBe(true);
        });

        it('should return false for a point outside', () => {
            expect(isPointInPolygon([15, 5], square)).toBe(false);
            expect(isPointInPolygon([5, 15], square)).toBe(false);
        });
    });
});
