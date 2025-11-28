'use client';

import { EarthquakeData } from '@/types/earthquake';
import HighchartsReact from 'highcharts-react-official';
import { ClusteringMetadata } from '@/lib/analysis/clustering';

interface ChartExportButtonsProps {
    chartRef: React.RefObject<HighchartsReact.RefObject>;
    data?: EarthquakeData[] | any[];
    filename?: string;
    clusteringMetadata?: ClusteringMetadata; // Clustering metadata for exports
    clusterLabels?: number[]; // Cluster labels for each data point
}

export default function ChartExportButtons({
    chartRef,
    data,
    filename = 'chart-data',
    clusteringMetadata,
    clusterLabels
}: ChartExportButtonsProps) {
    const exportImage = (format: 'png' | 'jpeg' | 'svg') => {
        if (chartRef.current && chartRef.current.chart) {
            const chart = chartRef.current.chart as any; // Type assertion for exporting module
            const mimeType = format === 'svg' ? 'image/svg+xml' : `image/${format}`;

            // Professional export settings with proper dimensions and quality
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

    const exportCSV = () => {
        if (!data || data.length === 0) return;

        // Add cluster labels to data if available
        const enrichedData = data.map((row, index) => {
            const enriched = { ...row };
            if (clusterLabels && index < clusterLabels.length) {
                (enriched as any).cluster_id = clusterLabels[index];
                (enriched as any).cluster_label = clusterLabels[index] === -1 ? 'noise' : `cluster_${clusterLabels[index]}`;
            }
            return enriched;
        });

        // Build CSV with metadata header
        let csvContent = '';

        // Add clustering metadata as comments if available
        if (clusteringMetadata && clusterLabels) {
            const clusteredPoints = clusterLabels.filter(l => l >= 0);
            const nClusters = clusteredPoints.length > 0 ? Math.max(...clusteredPoints) + 1 : 0;
            const noiseCount = clusterLabels.filter(l => l === -1).length;
            const noisePercent = (noiseCount / clusterLabels.length) * 100;

            csvContent += `# Clustering Metadata\n`;
            csvContent += `# Algorithm: ${clusteringMetadata.algorithm}\n`;
            csvContent += `# Description: ${clusteringMetadata.algorithmDescription}\n`;
            csvContent += `# Parameters: ${JSON.stringify(clusteringMetadata.parameters)}\n`;
            csvContent += `# Dataset Size: ${clusteringMetadata.datasetSize}\n`;
            csvContent += `# Number of Clusters: ${nClusters}\n`;
            csvContent += `# Noise Points: ${noiseCount} (${noisePercent.toFixed(1)}%)\n`;
            csvContent += `# Computation Time: ${clusteringMetadata.computationTime?.toFixed(2)}ms\n`;
            csvContent += `# Timestamp: ${clusteringMetadata.timestamp}\n`;
            csvContent += `#\n`;
        }

        // Convert data to CSV
        if (enrichedData.length === 0) {
            console.warn('No data to export');
            return;
        }

        const headers = Object.keys(enrichedData[0]);
        csvContent += [
            headers.join(','),
            ...enrichedData.map(row =>
                headers.map(header => {
                    const value = (row as any)[header];
                    // Handle dates and strings with commas
                    if (value instanceof Date) {
                        return value.toISOString();
                    }
                    if (typeof value === 'string' && value.includes(',')) {
                        return `"${value}"`;
                    }
                    return value;
                }).join(',')
            )
        ].join('\n');

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

        // Add cluster labels to data if available
        const enrichedData = data.map((row, index) => {
            const enriched = { ...row };
            if (clusterLabels && index < clusterLabels.length) {
                (enriched as any).cluster_id = clusterLabels[index];
                (enriched as any).cluster_label = clusterLabels[index] === -1 ? 'noise' : `cluster_${clusterLabels[index]}`;
            }
            return enriched;
        });

        // Build JSON with metadata
        const exportData: any = {
            data: enrichedData
        };

        // Add clustering metadata if available
        if (clusteringMetadata && clusterLabels) {
            const clusteredPoints = clusterLabels.filter(l => l >= 0);
            const nClusters = clusteredPoints.length > 0 ? Math.max(...clusteredPoints) + 1 : 0;
            const noiseCount = clusterLabels.filter(l => l === -1).length;
            const clusteredCount = clusterLabels.length - noiseCount;
            const clusterPercent = (clusteredCount / clusterLabels.length) * 100;
            const noisePercent = (noiseCount / clusterLabels.length) * 100;

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
                    noise_percent: parseFloat(noisePercent.toFixed(2))
                },
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

