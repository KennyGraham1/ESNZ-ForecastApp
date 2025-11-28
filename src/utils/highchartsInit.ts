import Highcharts from 'highcharts';
import proj4 from 'proj4';

// Initialize Highcharts modules only once
let initialized = false;

export function initializeHighcharts() {
    if (initialized || typeof window === 'undefined') return;

    try {
        // Set proj4 FIRST before loading Maps module
        if (typeof window !== 'undefined') {
            (window as any).proj4 = proj4;
        }

        // Highcharts More module (required for some chart types)
        const HighchartsMore = require('highcharts/highcharts-more');
        if (typeof HighchartsMore === 'function') {
            HighchartsMore(Highcharts);
        }

        // Highcharts 3D module
        const Highcharts3D = require('highcharts/highcharts-3d');
        if (typeof Highcharts3D === 'function') {
            Highcharts3D(Highcharts);
        }

        // Highcharts Maps module (load AFTER proj4 is set)
        const HighchartsMap = require('highcharts/modules/map');
        if (typeof HighchartsMap === 'function') {
            HighchartsMap(Highcharts);
        }

        // Exporting module
        const HighchartsExporting = require('highcharts/modules/exporting');
        if (typeof HighchartsExporting === 'function') {
            HighchartsExporting(Highcharts);
        }

        // Export data module
        const HighchartsExportData = require('highcharts/modules/export-data');
        if (typeof HighchartsExportData === 'function') {
            HighchartsExportData(Highcharts);
        }

        // Offline exporting module
        const HighchartsOfflineExporting = require('highcharts/modules/offline-exporting');
        if (typeof HighchartsOfflineExporting === 'function') {
            HighchartsOfflineExporting(Highcharts);
        }

        // Boost module for performance
        const HighchartsBoost = require('highcharts/modules/boost');
        if (typeof HighchartsBoost === 'function') {
            HighchartsBoost(Highcharts);
        }

        initialized = true;
    } catch (error) {
        console.error('Failed to initialize Highcharts modules:', error);
    }
}

// Auto-initialize on import
if (typeof window !== 'undefined') {
    initializeHighcharts();
}

export default Highcharts;

