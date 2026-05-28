/**
 * Performance Tests for Stratified Sampling
 * 
 * Tests to ensure sampling preserves data distribution.
 */

import { EarthquakeData } from '@/types/earthquake';
import { stratifiedSample } from '@/utils/dataOptimization';

// Generate test data with known distribution
function generateTestEarthquakes(count: number): EarthquakeData[] {
    const earthquakes: EarthquakeData[] = [];
    const baseTime = new Date('2024-01-01').getTime();

    for (let i = 0; i < count; i++) {
        // Create bimodal magnitude distribution (lots of small, some large)
        const magnitude = Math.random() < 0.8
            ? 3 + Math.random() * 2  // 80% small (3-5)
            : 6 + Math.random() * 2; // 20% large (6-8)

        earthquakes.push({
            eventID: `test-${i}`,
            time: new Date(baseTime + i * 86400000),
            timeMs: baseTime + i * 86400000,
            latitude: -41 + Math.random() * 5,
            longitude: 174 + Math.random() * 5,
            magnitude,
            depth: Math.random() * 400,
            locality: `Test Location ${i}`,
        });
    }

    return earthquakes;
}

describe('Stratified Sampling', () => {
    describe('Distribution Preservation', () => {
        it('should preserve magnitude distribution', () => {
            const testData = generateTestEarthquakes(10000);
            const sampled = stratifiedSample(testData, 1000);

            // Count large earthquakes (>= 6.0) in both datasets
            const originalLargeCount = testData.filter(eq => eq.magnitude >= 6.0).length;
            const sampledLargeCount = sampled.filter(eq => eq.magnitude >= 6.0).length;

            const originalRatio = originalLargeCount / testData.length;
            const sampledRatio = sampledLargeCount / sampled.length;

            // Ratios should be similar (within 5%)
            expect(Math.abs(originalRatio - sampledRatio)).toBeLessThan(0.05);
        });

        it('should return requested sample size', () => {
            const testData = generateTestEarthquakes(10000);
            const targetSize = 1000;
            const sampled = stratifiedSample(testData, targetSize);

            expect(sampled.length).toBe(targetSize);
        });

        it('should return all data if sample size >= data size', () => {
            const testData = generateTestEarthquakes(100);
            const sampled = stratifiedSample(testData, 200);

            expect(sampled.length).toBe(testData.length);
            expect(sampled).toEqual(testData);
        });

        it('should preserve temporal distribution', () => {
            const testData = generateTestEarthquakes(10000);
            const sampled = stratifiedSample(testData, 1000);

            // Check that sampled data spans the full time range
            const originalMinTime = Math.min(...testData.map(eq => eq.timeMs || 0));
            const originalMaxTime = Math.max(...testData.map(eq => eq.timeMs || 0));
            const sampledMinTime = Math.min(...sampled.map(eq => eq.timeMs || 0));
            const sampledMaxTime = Math.max(...sampled.map(eq => eq.timeMs || 0));

            // Sampled range should be close to original range
            expect(sampledMinTime).toBeLessThanOrEqual(originalMinTime + 86400000 * 100); // Within 100 days
            expect(sampledMaxTime).toBeGreaterThanOrEqual(originalMaxTime - 86400000 * 100);
        });

        it('should preserve depth distribution', () => {
            const testData = generateTestEarthquakes(10000);
            const sampled = stratifiedSample(testData, 1000);

            // Count shallow earthquakes (0-70 km, inclusive) in both datasets
            const originalShallowCount = testData.filter(eq => eq.depth <= 70).length;
            const sampledShallowCount = sampled.filter(eq => eq.depth <= 70).length;

            const originalRatio = originalShallowCount / testData.length;
            const sampledRatio = sampledShallowCount / sampled.length;

            // Ratios should be similar (within 10% for random data)
            expect(Math.abs(originalRatio - sampledRatio)).toBeLessThan(0.1);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty array', () => {
            const sampled = stratifiedSample([], 100);
            expect(sampled).toEqual([]);
        });

        it('should handle single element', () => {
            const testData = generateTestEarthquakes(1);
            const sampled = stratifiedSample(testData, 100);
            expect(sampled).toEqual(testData);
        });

        it('should handle zero sample size', () => {
            const testData = generateTestEarthquakes(100);
            const sampled = stratifiedSample(testData, 0);
            expect(sampled).toEqual([]);
        });

        it('should handle negative sample size', () => {
            const testData = generateTestEarthquakes(100);
            const sampled = stratifiedSample(testData, -10);
            expect(sampled).toEqual([]);
        });
    });

    describe('Performance', () => {
        it('should complete quickly for large datasets', () => {
            const testData = generateTestEarthquakes(50000);
            
            const start = performance.now();
            const sampled = stratifiedSample(testData, 5000);
            const duration = performance.now() - start;

            expect(sampled.length).toBe(5000);
            // Should complete in under 100ms
            expect(duration).toBeLessThan(100);
        });
    });
});

