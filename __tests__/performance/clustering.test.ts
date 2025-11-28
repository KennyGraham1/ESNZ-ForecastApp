/**
 * Performance Tests for Clustering Operations
 * 
 * Tests to ensure clustering optimizations work correctly.
 */

import { EarthquakeData } from '@/types/earthquake';
import { calculateSpatialClustering } from '@/lib/analysis/clustering';

// Generate test data
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

describe('Clustering Performance', () => {
    describe('DBSCAN with R-tree', () => {
        it('should identify clusters correctly', () => {
            const testData = generateClusteredEarthquakes();
            const result = calculateSpatialClustering(testData, {
                algorithm: 'dbscan',
                epsilon: 25, // 25km radius
                minSamples: 5,
            });

            expect(result).toBeDefined();
            expect(result.clusters.length).toBeGreaterThan(0);
            
            // Should find approximately 3 clusters
            const clusterIds = new Set(result.clusters.map(c => c.cluster));
            expect(clusterIds.size).toBeGreaterThanOrEqual(2);
            expect(clusterIds.size).toBeLessThanOrEqual(5);
        });

        it('should handle small datasets', () => {
            const testData = generateClusteredEarthquakes().slice(0, 10);
            const result = calculateSpatialClustering(testData, {
                algorithm: 'dbscan',
                epsilon: 25,
                minSamples: 3,
            });

            expect(result).toBeDefined();
            expect(result.clusters.length).toBe(testData.length);
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

            expect(result).toBeDefined();
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

            const noisePoints = result.clusters.filter(c => c.cluster === -1);
            expect(noisePoints.length).toBeGreaterThan(0);
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

            expect(result).toBeDefined();
            const clusterIds = new Set(result.clusters.map(c => c.cluster));
            expect(clusterIds.size).toBe(k);
        });

        it('should assign all points to clusters', () => {
            const testData = generateClusteredEarthquakes();
            const result = calculateSpatialClustering(testData, {
                algorithm: 'kmeans',
                k: 3,
            });

            // K-means assigns all points (no noise)
            expect(result.clusters.every(c => c.cluster >= 0)).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty dataset', () => {
            const result = calculateSpatialClustering([], {
                algorithm: 'dbscan',
                epsilon: 25,
                minSamples: 5,
            });

            expect(result.clusters).toEqual([]);
        });

        it('should handle single point', () => {
            const testData = generateClusteredEarthquakes().slice(0, 1);
            const result = calculateSpatialClustering(testData, {
                algorithm: 'dbscan',
                epsilon: 25,
                minSamples: 5,
            });

            expect(result.clusters.length).toBe(1);
            expect(result.clusters[0].cluster).toBe(-1); // Noise
        });
    });
});

