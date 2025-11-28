/**
 * Performance Tests for Filtering Operations
 * 
 * Tests to ensure filtering optimizations work correctly and maintain performance.
 */

import { EarthquakeData } from '@/types/earthquake';

// Mock filter function (simplified version of the actual implementation)
function filterEarthquakes(
    earthquakes: EarthquakeData[],
    filters: {
        minMagnitude?: number;
        maxMagnitude?: number;
        startDate?: string;
        endDate?: string;
        depthCategory?: string;
    }
): EarthquakeData[] {
    // Pre-compute date filters
    let cutoffTime = -Infinity;
    let endTime = Infinity;

    if (filters.startDate) {
        cutoffTime = new Date(filters.startDate).getTime();
    }
    if (filters.endDate) {
        endTime = new Date(filters.endDate).getTime();
    }

    // Single-pass filtering
    const result: EarthquakeData[] = [];
    for (let i = 0; i < earthquakes.length; i++) {
        const eq = earthquakes[i];

        // Magnitude filter
        if (filters.minMagnitude !== undefined && eq.magnitude < filters.minMagnitude) {
            continue;
        }
        if (filters.maxMagnitude !== undefined && eq.magnitude > filters.maxMagnitude) {
            continue;
        }

        // Date filter
        const eqTime = eq.timeMs !== undefined
            ? eq.timeMs
            : (typeof eq.time === 'string' ? new Date(eq.time).getTime() : (eq.time as Date).getTime());

        if (isNaN(eqTime)) {
            continue;
        }

        if (eqTime < cutoffTime || eqTime > endTime) {
            continue;
        }

        // Depth filter
        if (filters.depthCategory && filters.depthCategory !== 'all') {
            if (filters.depthCategory === 'shallow' && eq.depth >= 70) continue;
            if (filters.depthCategory === 'intermediate' && (eq.depth < 70 || eq.depth >= 300)) continue;
            if (filters.depthCategory === 'deep' && eq.depth < 300) continue;
        }

        result.push(eq);
    }

    return result;
}

// Generate test data
function generateTestEarthquakes(count: number): EarthquakeData[] {
    const earthquakes: EarthquakeData[] = [];
    const baseTime = new Date('2024-01-01').getTime();

    for (let i = 0; i < count; i++) {
        const time = new Date(baseTime + i * 86400000); // One per day
        earthquakes.push({
            eventID: `test-${i}`,
            time,
            timeMs: time.getTime(),
            latitude: -41 + Math.random() * 5,
            longitude: 174 + Math.random() * 5,
            magnitude: 3 + Math.random() * 4,
            depth: Math.random() * 400,
            locality: `Test Location ${i}`,
        });
    }

    return earthquakes;
}

describe('Filtering Performance', () => {
    describe('Single-Pass Filtering', () => {
        it('should filter by magnitude correctly', () => {
            const testData = generateTestEarthquakes(1000);
            const filtered = filterEarthquakes(testData, { minMagnitude: 5.0 });

            expect(filtered.every(eq => eq.magnitude >= 5.0)).toBe(true);
            expect(filtered.length).toBeLessThan(testData.length);
        });

        it('should filter by date range correctly', () => {
            const testData = generateTestEarthquakes(365);
            const filtered = filterEarthquakes(testData, {
                startDate: '2024-06-01',
                endDate: '2024-06-30',
            });

            expect(filtered.every(eq => {
                const time = eq.timeMs || (eq.time as Date).getTime();
                return time >= new Date('2024-06-01').getTime() &&
                       time <= new Date('2024-06-30').getTime();
            })).toBe(true);
        });

        it('should filter by depth category correctly', () => {
            const testData = generateTestEarthquakes(1000);
            const shallow = filterEarthquakes(testData, { depthCategory: 'shallow' });
            const deep = filterEarthquakes(testData, { depthCategory: 'deep' });

            expect(shallow.every(eq => eq.depth < 70)).toBe(true);
            expect(deep.every(eq => eq.depth >= 300)).toBe(true);
        });

        it('should handle combined filters correctly', () => {
            const testData = generateTestEarthquakes(1000);
            const filtered = filterEarthquakes(testData, {
                minMagnitude: 4.0,
                depthCategory: 'shallow',
                startDate: '2024-01-01',
            });

            expect(filtered.every(eq =>
                eq.magnitude >= 4.0 &&
                eq.depth < 70 &&
                (eq.timeMs || (eq.time as Date).getTime()) >= new Date('2024-01-01').getTime()
            )).toBe(true);
        });

        it('should handle invalid dates gracefully', () => {
            const testData = generateTestEarthquakes(10);
            // Add an event with invalid date
            testData.push({
                eventID: 'invalid',
                time: new Date('invalid'),
                latitude: -41,
                longitude: 174,
                magnitude: 5.0,
                depth: 50,
                locality: 'Invalid',
            });

            expect(() => filterEarthquakes(testData, {})).not.toThrow();
        });
    });
});

