
import { parseEarthquakeCSV } from '@/lib/csvParser';

// Mock File
// Force overwrite because jsdom File might not have text() implemented in older versions
global.File = class {
    name: string;
    content: string;
    lastModified: number;
    size: number;
    type: string;
    webkitRelativePath: string;

    constructor([content]: [string], name: string) {
        this.name = name;
        this.content = content;
        this.lastModified = Date.now();
        this.size = content.length;
        this.type = 'text/csv';
        this.webkitRelativePath = '';
    }
    text() {
        return Promise.resolve(this.content);
    }
    arrayBuffer() { return Promise.resolve(new ArrayBuffer(0)); }
    slice() { return this as any; }
    stream() { return {} as any; }
} as unknown as typeof File;

describe('CSV Parser with Metadata', () => {
    it('should parse CSV with comment headers and dd/mm/yyyy dates', async () => {
        const csvContent = `
# Clustering Metadata
# Algorithm: st-dbscan
# Description: ST-DBSCAN
# Parameters: {"epsilon":25}
# Timestamp: 2025-12-08T21:20:03.718Z
#
eventID,time,latitude,longitude,depth,magnitude,locality,cluster_id,cluster_label,cluster_size
2025p922822,08/12/2025 23:40:31,-42.393,171.646,269.0,2.5,Unknown Location,-1,noise,0
2025p922454,08/12/2025 20:23:39,-41.580,171.648,5.0,2.0,Unknown Location,-1,noise,0`;

        const file = new File([csvContent.trim()], 'export.csv');
        const result = await parseEarthquakeCSV(file);

        if (!result.success) {
            console.error('Errors:', result.errors);
            console.error('Warnings:', result.warnings);
        }

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(2);

        // Check filtering of noise
        // Wait, filtering is done in UI, here we just want parsing success.

        expect(result.data![0].eventID).toBe('2025p922822');

        // data checks
        const e1 = result.data!.find(e => e.eventID === '2025p922822');
        expect(e1).toBeDefined();

        // Check date parsing
        // 08/12/2025 23:40:31
        // NZ/UK format: dd/MM/yyyy -> 8th December 2025
        const date = e1!.time;
        expect(date.getFullYear()).toBe(2025);
        expect(date.getDate()).toBe(8);
        expect(date.getMonth()).toBe(11); // 0-indexed, 11 is Dec
        expect(date.getHours()).toBe(23);
        expect(date.getMinutes()).toBe(40);
        expect(date.getSeconds()).toBe(31);
    });
});
