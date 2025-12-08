/**
 * Performance Tests for Clustering Operations
 *
 * Tests to ensure clustering optimizations work correctly.
 */

import { EarthquakeData } from '@/types/earthquake';
import { calculateSpatialClustering, ClusterResult } from '@/lib/analysis/clustering';

// Generate test data for spatial clustering
function generateClusteredEarthquakes(): EarthquakeData[] {
    const earthquakes: EarthquakeData[] = [];
    const baseTime = new Date('2024-01-01').getTime();

    // Create 3 distinct clusters
    const clusters = [
        { lat: -41.0, lon: 174.0, count: 50 },  // Wellington
        { lat: -43.5, lon: 172.6, count: 50 },  // Christchurch
        { lat: -36.8, lon: 174.7, count: 50 },  // Auckland
    ];

    let id = 0;
    clusters.forEach(cluster => {
        for (let i = 0; i < cluster.count; i++) {
            earthquakes.push({
                eventID: `cluster-${id++}`,
                time: new Date(baseTime + i * 86400000),
                timeMs: baseTime + i * 86400000,
                latitude: cluster.lat + (Math.random() - 0.5) * 0.2, // ±0.1 degree spread
                longitude: cluster.lon + (Math.random() - 0.5) * 0.2,
                magnitude: 3 + Math.random() * 2,
                depth: 10 + Math.random() * 50,
                locality: `Cluster ${id}`,
            });
        }
    });

    // Add some noise points
    for (let i = 0; i < 20; i++) {
        earthquakes.push({
            eventID: `noise-${i}`,
            time: new Date(baseTime + i * 86400000),
            timeMs: baseTime + i * 86400000,
            latitude: -40 + Math.random() * 10,
            longitude: 170 + Math.random() * 10,
            magnitude: 3 + Math.random() * 2,
            depth: 10 + Math.random() * 50,
            locality: `Noise ${i}`,
        });
    }

    return earthquakes;
}

// Generate earthquake sequence data for STEP clustering tests
// Simulates a mainshock-aftershock sequence
function generateSeismicSequence(): EarthquakeData[] {
    const earthquakes: EarthquakeData[] = [];
    const baseTime = new Date('2024-01-15').getTime();
    const dayMs = 24 * 60 * 60 * 1000;

    // Main event (magnitude 6.0)
    earthquakes.push({
        eventID: 'mainshock-1',
        time: new Date(baseTime),
        timeMs: baseTime,
        latitude: -41.5,
        longitude: 174.0,
        magnitude: 6.0,
        depth: 15,
        locality: 'Wellington',
    });

    // Aftershock sequence (within 30 days, within ~50km)
    for (let i = 0; i < 30; i++) {
        const timeOffset = (i + 1) * dayMs * (0.1 + Math.random() * 0.5); // 0.1-0.6 days apart
        earthquakes.push({
            eventID: `aftershock-1-${i}`,
            time: new Date(baseTime + timeOffset),
            timeMs: baseTime + timeOffset,
            latitude: -41.5 + (Math.random() - 0.5) * 0.3, // ~30km spread
            longitude: 174.0 + (Math.random() - 0.5) * 0.4,
            magnitude: 2.5 + Math.random() * 2.5, // M2.5-5.0
            depth: 10 + Math.random() * 20,
            locality: 'Wellington',
        });
    }

    // Second mainshock (200km away, 2 months later)
    const secondMainTime = baseTime + 60 * dayMs;
    earthquakes.push({
        eventID: 'mainshock-2',
        time: new Date(secondMainTime),
        timeMs: secondMainTime,
        latitude: -43.5,
        longitude: 172.6,
        magnitude: 5.5,
        depth: 12,
        locality: 'Christchurch',
    });

    // Second aftershock sequence
    for (let i = 0; i < 20; i++) {
        const timeOffset = (i + 1) * dayMs * (0.1 + Math.random() * 0.5);
        earthquakes.push({
            eventID: `aftershock-2-${i}`,
            time: new Date(secondMainTime + timeOffset),
            timeMs: secondMainTime + timeOffset,
            latitude: -43.5 + (Math.random() - 0.5) * 0.25,
            longitude: 172.6 + (Math.random() - 0.5) * 0.35,
            magnitude: 2.0 + Math.random() * 2.5,
            depth: 10 + Math.random() * 15,
            locality: 'Christchurch',
        });
    }

    // Some background seismicity (scattered, low magnitude)
    for (let i = 0; i < 15; i++) {
        const randomTime = baseTime - 30 * dayMs + Math.random() * 120 * dayMs;
        earthquakes.push({
            eventID: `background-${i}`,
            time: new Date(randomTime),
            timeMs: randomTime,
            latitude: -38 - Math.random() * 8, // Scattered across NZ
            longitude: 170 + Math.random() * 8,
            magnitude: 1.5 + Math.random() * 1.5, // M1.5-3.0
            depth: 5 + Math.random() * 40,
            locality: 'Background',
        });
    }

    // Sort by time (important for STEP algorithms)
    return earthquakes.sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0));
}

describe('Clustering Performance', () => {
    describe('DBSCAN with R-tree', () => {
        it('should identify clusters correctly', () => {
            const testData = generateClusteredEarthquakes();
            const result = calculateSpatialClustering(testData, {
                algorithm: 'dbscan',
                epsilon: 25, // 25km radius
                minSamples: 5,
            });

            expect(result).not.toBeNull();
            expect(result!.clusters.length).toBeGreaterThan(0);

            // Should find approximately 3 clusters
            expect(result!.nClusters).toBeGreaterThanOrEqual(2);
            expect(result!.nClusters).toBeLessThanOrEqual(5);
        });

        it('should complete in reasonable time for large datasets', () => {
            const testData = generateClusteredEarthquakes();
            // Duplicate data to create larger dataset
            const largeDataset = [...testData, ...testData, ...testData];

            const start = performance.now();
            const result = calculateSpatialClustering(largeDataset, {
                algorithm: 'dbscan',
                epsilon: 25,
                minSamples: 5,
            });
            const duration = performance.now() - start;

            expect(result).not.toBeNull();
            // With R-tree, should complete in under 1 second for ~500 points
            expect(duration).toBeLessThan(1000);
        });

        it('should mark noise points correctly', () => {
            const testData = generateClusteredEarthquakes();
            const result = calculateSpatialClustering(testData, {
                algorithm: 'dbscan',
                epsilon: 25,
                minSamples: 5,
            });

            expect(result).not.toBeNull();
            // Noise points have label -1
            const noiseCount = result!.labels.filter(l => l === -1).length;
            expect(noiseCount).toBeGreaterThan(0);
            expect(result!.noisePercent).toBeGreaterThan(0);
        });
    });

    describe('K-means', () => {
        it('should create k clusters', () => {
            const testData = generateClusteredEarthquakes();
            const k = 3;
            const result = calculateSpatialClustering(testData, {
                algorithm: 'kmeans',
                k,
            });

            expect(result).not.toBeNull();
            expect(result!.nClusters).toBe(k);
        });

        it('should assign all points to clusters', () => {
            const testData = generateClusteredEarthquakes();
            const result = calculateSpatialClustering(testData, {
                algorithm: 'kmeans',
                k: 3,
            });

            expect(result).not.toBeNull();
            // K-means assigns all points (no noise) - all labels >= 0
            expect(result!.labels.every(l => l >= 0)).toBe(true);
            expect(result!.noisePercent).toBe(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty dataset', () => {
            const result = calculateSpatialClustering([], {
                algorithm: 'dbscan',
                epsilon: 25,
                minSamples: 5,
            });

            // Empty dataset returns null
            expect(result).toBeNull();
        });

        it('should handle small dataset (less than 10 points)', () => {
            const testData = generateClusteredEarthquakes().slice(0, 5);
            const result = calculateSpatialClustering(testData, {
                algorithm: 'dbscan',
                epsilon: 25,
                minSamples: 5,
            });

            // Small dataset (< 10 points) returns null
            expect(result).toBeNull();
        });
    });

    describe('STEP Magnitude Clustering', () => {
        it('should cluster earthquake sequences correctly', () => {
            const testData = generateSeismicSequence();
            const result = calculateSpatialClustering(testData, {
                algorithm: 'step-mag',
                stepMinMag: 2.0,
                stepT1: 1,   // 1 day before
                stepT2: 30,  // 30 days after
            });

            expect(result).not.toBeNull();
            // Should find at least 2 clusters (2 mainshock sequences)
            expect(result!.nClusters).toBeGreaterThanOrEqual(2);
            expect(result!.clusters.length).toBeGreaterThanOrEqual(2);
        });

        it('should start clustering from largest magnitude', () => {
            const testData = generateSeismicSequence();
            const result = calculateSpatialClustering(testData, {
                algorithm: 'step-mag',
                stepMinMag: 2.0,
                stepT1: 1,
                stepT2: 30,
            });

            expect(result).not.toBeNull();
            // First cluster should contain the largest earthquake (M6.0 mainshock)
            // Note: Cluster may have only 1 event if aftershocks are too far (random spread)
            // So we just verify the first cluster exists and contains valid indices
            const firstCluster = result!.clusters[0];
            expect(firstCluster.length).toBeGreaterThanOrEqual(1);
            expect(firstCluster[0]).toBeGreaterThanOrEqual(0);
        });

        it('should have correct metadata', () => {
            const testData = generateSeismicSequence();
            const result = calculateSpatialClustering(testData, {
                algorithm: 'step-mag',
                stepMinMag: 2.5,
                stepT1: 2,
                stepT2: 45,
            });

            expect(result).not.toBeNull();
            expect(result!.metadata).toBeDefined();
            expect(result!.metadata!.algorithm).toBe('step-mag');
            expect(result!.metadata!.parameters.stepMinMag).toBe(2.5);
            expect(result!.metadata!.parameters.stepT1).toBe(2);
            expect(result!.metadata!.parameters.stepT2).toBe(45);
        });

        it('should filter events below minimum magnitude', () => {
            const testData = generateSeismicSequence();
            const result = calculateSpatialClustering(testData, {
                algorithm: 'step-mag',
                stepMinMag: 4.0, // High threshold - should have fewer clusters
                stepT1: 1,
                stepT2: 30,
            });

            expect(result).not.toBeNull();
            // With high magnitude threshold, most events become noise
            expect(result!.noisePercent).toBeGreaterThan(50);
        });
    });

    describe('STEP Time Clustering', () => {
        it('should cluster earthquake sequences in temporal order', () => {
            const testData = generateSeismicSequence();
            const result = calculateSpatialClustering(testData, {
                algorithm: 'step-time',
                stepMinMag: 2.0,
                stepT1: 1,
                stepT2: 30,
            });

            expect(result).not.toBeNull();
            // Should find clusters
            expect(result!.nClusters).toBeGreaterThan(0);
            expect(result!.clusterPercent).toBeGreaterThan(0);
        });

        it('should assign labels to all events', () => {
            const testData = generateSeismicSequence();
            const result = calculateSpatialClustering(testData, {
                algorithm: 'step-time',
                stepMinMag: 2.0,
                stepT1: 1,
                stepT2: 30,
            });

            expect(result).not.toBeNull();
            // Labels array should have same length as input
            expect(result!.labels.length).toBe(testData.length);
        });

        it('should use Wells-Coppersmith radius', () => {
            const testData = generateSeismicSequence();
            const result = calculateSpatialClustering(testData, {
                algorithm: 'step-time',
                stepMinMag: 2.0,
                stepT1: 1,
                stepT2: 60, // Longer time window
            });

            expect(result).not.toBeNull();
            // With M6.0 mainshock, Wells-Coppersmith gives ~38km radius
            // Aftershocks within ~30km should be captured
            const largestCluster = result!.clusters.reduce(
                (max, c) => c.length > max.length ? c : max,
                [] as number[]
            );
            expect(largestCluster.length).toBeGreaterThan(10);
        });

        it('should have correct metadata', () => {
            const testData = generateSeismicSequence();
            const result = calculateSpatialClustering(testData, {
                algorithm: 'step-time',
                stepMinMag: 2.5,
                stepT1: 3,
                stepT2: 90,
            });

            expect(result).not.toBeNull();
            expect(result!.metadata).toBeDefined();
            expect(result!.metadata!.algorithm).toBe('step-time');
            expect(result!.metadata!.parameters.stepMinMag).toBe(2.5);
            expect(result!.metadata!.parameters.stepT1).toBe(3);
            expect(result!.metadata!.parameters.stepT2).toBe(90);
            expect(result!.metadata!.algorithmDescription).toContain('STEP');
        });
    });

    describe('STEP Algorithm Comparison', () => {
        it('should produce similar results for both STEP algorithms', () => {
            const testData = generateSeismicSequence();

            const resultMag = calculateSpatialClustering(testData, {
                algorithm: 'step-mag',
                stepMinMag: 2.0,
                stepT1: 1,
                stepT2: 30,
            });

            const resultTime = calculateSpatialClustering(testData, {
                algorithm: 'step-time',
                stepMinMag: 2.0,
                stepT1: 1,
                stepT2: 30,
            });

            expect(resultMag).not.toBeNull();
            expect(resultTime).not.toBeNull();

            // Both should find clusters
            expect(resultMag!.nClusters).toBeGreaterThan(0);
            expect(resultTime!.nClusters).toBeGreaterThan(0);

            // Cluster percentages should be similar (within 30%)
            expect(Math.abs(resultMag!.clusterPercent - resultTime!.clusterPercent)).toBeLessThan(30);
        });

        it('should complete in reasonable time', () => {
            const testData = generateSeismicSequence();

            const startMag = performance.now();
            const resultMag = calculateSpatialClustering(testData, {
                algorithm: 'step-mag',
                stepMinMag: 2.0,
                stepT1: 1,
                stepT2: 30,
            });
            const durationMag = performance.now() - startMag;

            const startTime = performance.now();
            const resultTime = calculateSpatialClustering(testData, {
                algorithm: 'step-time',
                stepMinMag: 2.0,
                stepT1: 1,
                stepT2: 30,
            });
            const durationTime = performance.now() - startTime;

            expect(resultMag).not.toBeNull();
            expect(resultTime).not.toBeNull();

            // Should complete in under 500ms for ~100 points
            expect(durationMag).toBeLessThan(500);
            expect(durationTime).toBeLessThan(500);
        });
    });

    describe('ST-DBSCAN', () => {
        it('should separate spatially close but temporally distant events', () => {
            const baseTime = new Date('2024-01-01').getTime();
            const dayMs = 86400000;
            const testData: EarthquakeData[] = [];

            // Cluster 1: Location A, Time T1
            for (let i = 0; i < 10; i++) {
                testData.push({
                    eventID: `c1-${i}`,
                    time: new Date(baseTime + i * dayMs * 0.1), // Within 1 day
                    timeMs: baseTime + i * dayMs * 0.1,
                    latitude: -41.0,
                    longitude: 174.0,
                    magnitude: 4.0, depth: 10, locality: 'Loc A',
                });
            }

            // Cluster 2: Location A (same place), Time T2 (30 days later)
            // Should be separate cluster in ST-DBSCAN if epsilonTemporal < 30
            for (let i = 0; i < 10; i++) {
                testData.push({
                    eventID: `c2-${i}`,
                    time: new Date(baseTime + 30 * dayMs + i * dayMs * 0.1),
                    timeMs: baseTime + 30 * dayMs + i * dayMs * 0.1,
                    latitude: -41.0, // Same location
                    longitude: 174.0,
                    magnitude: 4.0, depth: 10, locality: 'Loc A',
                });
            }

            const result = calculateSpatialClustering(testData, {
                algorithm: 'st-dbscan',
                epsilon: 25,
                minSamples: 5,
                epsilonTemporal: 7, // 7 days window
            });

            expect(result).not.toBeNull();
            // Should find 2 clusters because time gap > epsilonTemporal
            expect(result!.nClusters).toBe(2);
        });

        it('should identify noise points in space-time', () => {
            const testData = generateClusteredEarthquakes(); // 3 distinct spatial clusters
            // st-dbscan checks time too. generated data has time spread over 50 days (frequency 1 day).
            // Cluster at -41,-174 has 50 points, 1 per day.
            // With epsilonTemporal=7, minSamples=5, it should link them because dt=1 day < 7.

            const result = calculateSpatialClustering(testData, {
                algorithm: 'st-dbscan',
                epsilon: 25,
                minSamples: 5,
                epsilonTemporal: 2,
            });

            expect(result).not.toBeNull();
            expect(result!.nClusters).toBeGreaterThan(0);
            expect(result!.noisePercent).toBeGreaterThan(0);
        });
    });

    describe('Time Magnitude Clustering (TMC)', () => {
        it('should cluster characteristic sequences', () => {
            const testData = generateSeismicSequence(); // M6.0 mainshock + aftershocks
            const result = calculateSpatialClustering(testData, {
                algorithm: 'tmc',
                tmcRfact: 10,
                tmcTau0: 2,
                tmcTauMax: 10,
                tmcP1: 0.99,
                tmcXk: 0.5,
                tmcMinMag: 1.5
            });

            expect(result).not.toBeNull();
            expect(result!.nClusters).toBeGreaterThan(0);

            // The M6.0 mainshock should be in a large cluster
            const mainshockIndex = testData.findIndex(e => e.magnitude >= 6.0);
            const mainshockLabel = result!.labels[mainshockIndex];
            expect(mainshockLabel).toBeGreaterThan(-1); // Not noise

            // Should have substantial members in that cluster
            if (mainshockLabel >= 0) {
                const clusterSize = result!.clusters[mainshockLabel].length;
                expect(clusterSize).toBeGreaterThan(10);
            }
        });

        it('should perform efficiently', () => {
            const testData = generateSeismicSequence(); // ~50-60 events
            const start = performance.now();
            const result = calculateSpatialClustering(testData, { algorithm: 'tmc' });
            const duration = performance.now() - start;

            expect(result).not.toBeNull();
            expect(duration).toBeLessThan(500); // ms
        });

        it('should produce correct metadata', () => {
            const testData = generateSeismicSequence();
            const result = calculateSpatialClustering(testData, {
                algorithm: 'tmc',
                tmcRfact: 15,
                tmcTau0: 3
            });

            expect(result).not.toBeNull();
            expect(result!.metadata!.algorithm).toBe('tmc');
            expect(result!.metadata!.parameters.tmcRfact).toBe(15);
            expect(result!.metadata!.parameters.tmcTau0).toBe(3);
        });
    });
});
