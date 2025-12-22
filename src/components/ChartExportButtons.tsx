'use client';

import { EarthquakeData } from '@/types/earthquake';
import HighchartsReact from 'highcharts-react-official';
import { ClusteringMetadata } from '@/lib/analysis/clustering';
import { formatDateForCSV } from '@/utils/dateFormat';
import { safeMin, safeMax } from '@/utils/arrayMath';

interface ChartExportButtonsProps {
    chartRef: React.RefObject<HighchartsReact.RefObject>;
    data?: EarthquakeData[] | any[];
    filename?: string;
    clusteringMetadata?: ClusteringMetadata; // Clustering metadata for exports
    clusterLabels?: number[]; // Cluster labels for each data point
    metadata?: Record<string, any>; // General metadata for exports
}

export default function ChartExportButtons({
    chartRef,
    data,
    filename = 'chart-data',
    clusteringMetadata,
    clusterLabels,
    metadata
}: ChartExportButtonsProps) {
    const exportImage = (format: 'png' | 'jpeg' | 'svg') => {
        if (chartRef.current && chartRef.current.chart) {
            const chart = chartRef.current.chart as any; // Type assertion for exporting module
            const mimeType = format === 'svg' ? 'image/svg+xml' : `image/${format}`;

            // Export settings with proper dimensions and quality
            const exportOptions = {
                type: mimeType,
                filename: filename,
                sourceWidth: 1920,  // High resolution width (Full HD)
                sourceHeight: 1080, // High resolution height (Full HD)
                scale: 2,           // 2x scaling for crisp images
                allowHTML: true
            };

            // Chart options for export - improve styling and layout
            const chartOptions = {
                chart: {
                    backgroundColor: '#ffffff',
                    spacing: [20, 20, 20, 20]  // Add padding around chart
                },
                title: {
                    style: {
                        fontSize: '24px',
                        fontWeight: 'bold',
                        color: '#1f2937'
                    }
                },
                subtitle: {
                    style: {
                        fontSize: '16px',
                        color: '#6b7280'
                    }
                },
                legend: {
                    itemStyle: {
                        fontSize: '14px',
                        fontWeight: '500'
                    }
                },
                credits: {
                    enabled: true,
                    text: 'ESNZ-ForecastApp - NZ Earthquake Analysis',
                    style: {
                        fontSize: '12px',
                        color: '#9ca3af'
                    }
                }
            };

            if (chart.exportChart) {
                chart.exportChart(exportOptions, chartOptions);
            }
        }
    };

    // Calculate cluster sizes from cluster labels
    // Returns a Map where key is cluster ID and value is the count of events in that cluster
    const calculateClusterSizes = (labels: number[]): Map<number, number> => {
        const sizes = new Map<number, number>();
        for (const label of labels) {
            sizes.set(label, (sizes.get(label) || 0) + 1);
        }
        return sizes;
    };

    const exportCSV = () => {
        if (!data || data.length === 0) return;

        // CRITICAL FIX: Validate data and cluster labels alignment
        if (clusterLabels && data.length !== clusterLabels.length) {
            console.error(`❌ Data/cluster mismatch: ${data.length} data points vs ${clusterLabels.length} cluster labels`);
            alert(`Error: Data size mismatch. Cannot export cluster data.\nData points: ${data.length}\nCluster labels: ${clusterLabels.length}`);
            return;
        }

        // Calculate cluster sizes for the cluster_size column
        const clusterSizes = clusterLabels ? calculateClusterSizes(clusterLabels) : null;

        // Add cluster labels and cluster size to data if available
        const enrichedData = data.map((row, index) => {
            const enriched = { ...row };
            if (clusterLabels && index < clusterLabels.length) {
                const clusterId = clusterLabels[index];
                (enriched as any).cluster_id = clusterId;
                (enriched as any).cluster_label = clusterId === -1 ? 'noise' : `cluster_${clusterId}`;
                // Cluster size: 0 for noise points, actual size for clustered points
                (enriched as any).cluster_size = clusterId === -1 ? 0 : (clusterSizes?.get(clusterId) || 0);
            }
            return enriched;
        });

        // Build CSV with metadata header
        let csvContent = '';

        // Add clustering metadata as comments if available
        if (clusteringMetadata && clusterLabels && clusterSizes) {
            // FIXED: Use iterative approach to avoid stack overflow on large datasets
            let maxClusterLabel = -1;
            for (const label of clusterLabels) {
                if (label >= 0 && label > maxClusterLabel) {
                    maxClusterLabel = label;
                }
            }
            const nClusters = maxClusterLabel >= 0 ? maxClusterLabel + 1 : 0;
            const noiseCount = clusterLabels.filter(l => l === -1).length;
            const noisePercent = (noiseCount / clusterLabels.length) * 100;

            // Calculate cluster size statistics
            const sizes = Array.from(clusterSizes.entries())
                .filter(([id]) => id >= 0)
                .map(([, size]) => size);
            const avgClusterSize = sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;

            // FIXED: Use iterative approach for min/max
            let minClusterSize = Infinity;
            let maxClusterSize = -Infinity;
            for (const size of sizes) {
                if (size < minClusterSize) minClusterSize = size;
                if (size > maxClusterSize) maxClusterSize = size;
            }
            if (sizes.length === 0) {
                minClusterSize = 0;
                maxClusterSize = 0;
            }

            csvContent += `# Clustering Metadata\n`;
            csvContent += `# Algorithm: ${clusteringMetadata.algorithm}\n`;
            csvContent += `# Description: ${clusteringMetadata.algorithmDescription}\n`;
            csvContent += `# Parameters: ${JSON.stringify(clusteringMetadata.parameters)}\n`;
            csvContent += `# Dataset Size: ${clusteringMetadata.datasetSize}\n`;
            csvContent += `# Number of Clusters: ${nClusters}\n`;
            csvContent += `# Noise Points: ${noiseCount} (${noisePercent.toFixed(1)}%)\n`;
            csvContent += `# Cluster Size Stats: min=${minClusterSize}, max=${maxClusterSize}, avg=${avgClusterSize.toFixed(1)}\n`;
            csvContent += `# Computation Time: ${clusteringMetadata.computationTime?.toFixed(2)}ms\n`;
            csvContent += `# Timestamp: ${clusteringMetadata.timestamp}\n`;
            csvContent += `#\n`;
        }

        // Add generic metadata as comments
        if (metadata) {
            csvContent += `# Analysis Metadata\n`;
            for (const [key, value] of Object.entries(metadata)) {
                // Determine how to format the value
                let valueStr = value;
                if (typeof value === 'object' && value !== null) {
                    valueStr = JSON.stringify(value);
                }
                csvContent += `# ${key}: ${valueStr}\n`;
            }
            csvContent += `#\n`;
        }

        // Convert data to CSV
        if (enrichedData.length === 0) {
            console.warn('No data to export');
            return;
        }

        // CRITICAL FIX: Define explicit header order for consistent CSV structure
        // This ensures proper column ordering and handles all data types correctly
        const baseHeaders = ['eventID', 'time', 'latitude', 'longitude', 'depth', 'magnitude', 'locality'];
        // Include cluster_size column to show how many events are in each cluster
        const clusterHeaders = clusterLabels ? ['cluster_id', 'cluster_label', 'cluster_size'] : [];
        const headers = [...baseHeaders, ...clusterHeaders];

        // Build CSV header row
        csvContent += headers.join(',') + '\n';

        // Build CSV data rows
        csvContent += enrichedData.map(row => {
            return headers.map(header => {
                const value = (row as any)[header];

                // Handle undefined/null values
                if (value === undefined || value === null) {
                    return '';
                }

                // Handle dates - format as dd/mm/yyyy HH:mm:ss
                if (value instanceof Date) {
                    return formatDateForCSV(value);
                }

                // Handle date strings (ISO format)
                if (header === 'time' && typeof value === 'string') {
                    return formatDateForCSV(value);
                }

                // Handle strings with commas or quotes
                if (typeof value === 'string') {
                    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                        // Escape quotes and wrap in quotes
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                }

                // Handle numbers and other primitives
                return String(value);
            }).join(',');
        }).join('\n');

        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const exportJSON = () => {
        if (!data || data.length === 0) return;

        // CRITICAL FIX: Validate data and cluster labels alignment
        if (clusterLabels && data.length !== clusterLabels.length) {
            console.error(`❌ Data/cluster mismatch: ${data.length} data points vs ${clusterLabels.length} cluster labels`);
            alert(`Error: Data size mismatch. Cannot export cluster data.\nData points: ${data.length}\nCluster labels: ${clusterLabels.length}`);
            return;
        }

        // Calculate cluster sizes for the cluster_size field
        const clusterSizes = clusterLabels ? calculateClusterSizes(clusterLabels) : null;

        // Add cluster labels, cluster size, and format dates
        const enrichedData = data.map((row, index) => {
            const enriched = { ...row };

            // Format date fields to dd/mm/yyyy HH:mm:ss
            if ((enriched as any).time) {
                (enriched as any).time = formatDateForCSV((enriched as any).time);
            }

            if (clusterLabels && index < clusterLabels.length) {
                const clusterId = clusterLabels[index];
                (enriched as any).cluster_id = clusterId;
                (enriched as any).cluster_label = clusterId === -1 ? 'noise' : `cluster_${clusterId}`;
                // Cluster size: 0 for noise points, actual size for clustered points
                (enriched as any).cluster_size = clusterId === -1 ? 0 : (clusterSizes?.get(clusterId) || 0);
            }
            return enriched;
        });

        // Build JSON with metadata
        const exportData: any = {
            data: enrichedData
        };

        if (metadata) {
            exportData.metadata = metadata;
        }

        // Add clustering metadata if available
        if (clusteringMetadata && clusterLabels && clusterSizes) {
            const clusteredPoints = clusterLabels.filter(l => l >= 0);
            const nClusters = clusteredPoints.length > 0 ? safeMax(clusteredPoints) + 1 : 0;
            const noiseCount = clusterLabels.filter(l => l === -1).length;
            const clusteredCount = clusterLabels.length - noiseCount;
            const clusterPercent = (clusteredCount / clusterLabels.length) * 100;
            const noisePercent = (noiseCount / clusterLabels.length) * 100;

            // Build cluster size summary (sorted by cluster ID)
            const clusterSizeSummary: Record<string, number> = {};
            for (const [clusterId, size] of clusterSizes.entries()) {
                if (clusterId >= 0) { // Exclude noise from summary
                    clusterSizeSummary[`cluster_${clusterId}`] = size;
                }
            }

            // Calculate cluster size statistics
            const sizes = Array.from(clusterSizes.entries())
                .filter(([id]) => id >= 0)
                .map(([, size]) => size);
            const avgClusterSize = sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;

            // FIXED: Use iterative approach for min/max
            let minClusterSize = Infinity;
            let maxClusterSize = -Infinity;
            for (const size of sizes) {
                if (size < minClusterSize) minClusterSize = size;
                if (size > maxClusterSize) maxClusterSize = size;
            }
            if (sizes.length === 0) {
                minClusterSize = 0;
                maxClusterSize = 0;
            }

            exportData.clustering_metadata = {
                algorithm: clusteringMetadata.algorithm,
                algorithm_description: clusteringMetadata.algorithmDescription,
                parameters: clusteringMetadata.parameters,
                dataset_size: clusteringMetadata.datasetSize,
                statistics: {
                    n_clusters: nClusters,
                    clustered_points: clusteredCount,
                    cluster_percent: parseFloat(clusterPercent.toFixed(2)),
                    noise_points: noiseCount,
                    noise_percent: parseFloat(noisePercent.toFixed(2)),
                    avg_cluster_size: parseFloat(avgClusterSize.toFixed(2)),
                    min_cluster_size: minClusterSize,
                    max_cluster_size: maxClusterSize
                },
                cluster_sizes: clusterSizeSummary,
                computation_time_ms: clusteringMetadata.computationTime,
                timestamp: clusteringMetadata.timestamp
            };
        }

        const jsonContent = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    return (
        <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-200">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Export:</span>
            <div className="flex gap-2">
                <button
                    onClick={() => exportImage('png')}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-md hover:bg-blue-600 active:bg-blue-700 transition-colors shadow-sm hover:shadow-md"
                    title="Export as PNG"
                >
                    PNG
                </button>
                <button
                    onClick={() => exportImage('jpeg')}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-md hover:bg-blue-600 active:bg-blue-700 transition-colors shadow-sm hover:shadow-md"
                    title="Export as JPEG"
                >
                    JPEG
                </button>
                <button
                    onClick={() => exportImage('svg')}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-md hover:bg-blue-600 active:bg-blue-700 transition-colors shadow-sm hover:shadow-md"
                    title="Export as SVG"
                >
                    SVG
                </button>
            </div>
            {data && data.length > 0 && (
                <div className="flex gap-2">
                    <button
                        onClick={exportCSV}
                        className="px-3 py-1.5 text-xs font-medium bg-green-500 text-white rounded-md hover:bg-green-600 active:bg-green-700 transition-colors shadow-sm hover:shadow-md"
                        title="Export data as CSV"
                    >
                        CSV
                    </button>
                    <button
                        onClick={exportJSON}
                        className="px-3 py-1.5 text-xs font-medium bg-green-500 text-white rounded-md hover:bg-green-600 active:bg-green-700 transition-colors shadow-sm hover:shadow-md"
                        title="Export data as JSON"
                    >
                        JSON
                    </button>
                </div>
            )}
        </div>
    );
}

