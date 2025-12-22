/**
 * Chart Registry for PDF Export
 * 
 * Stores references to Highcharts chart instances for high-quality export.
 * Charts register themselves on mount and unregister on unmount.
 */

import Highcharts from '@/utils/highchartsInit';

// Global registry of chart instances by ID
const chartRegistry: Map<string, Highcharts.Chart> = new Map();

/**
 * Register a chart instance for PDF export
 */
export const registerChart = (id: string, chart: Highcharts.Chart) => {
    chartRegistry.set(id, chart);
};

/**
 * Unregister a chart instance
 */
export const unregisterChart = (id: string) => {
    chartRegistry.delete(id);
};

/**
 * Get a chart instance by ID
 */
export const getChart = (id: string): Highcharts.Chart | undefined => {
    return chartRegistry.get(id);
};

/**
 * Export a chart to high-quality PNG data URL using Highcharts native export
 * @param chartId - The ID of the registered chart
 * @param scale - Export scale factor (default 2 for balanced quality/size)
 * @returns Promise<string> - PNG data URL
 */
export const exportChartToImage = async (chartId: string, scale: number = 1.0): Promise<string | null> => {
    const chart = chartRegistry.get(chartId);

    if (!chart) {
        console.warn(`Chart not found in registry: ${chartId}`);
        return null;
    }

    return new Promise((resolve) => {
        try {
            // Calculate standard dimensions for export to ensure consistent readability
            // Using a fixed width (e.g. 1000px) makes font sizes (24px) proportional and readable on PDF
            // rather than depending on the user's screen width (which might be very large)
            const aspectRatio = chart.chartWidth / chart.chartHeight;
            const exportWidth = 1000;
            const exportHeight = exportWidth / aspectRatio;

            // Use getSVG to get chart as SVG string, then convert to canvas
            // Cast to any since getSVG options are not fully typed
            // Enhanced styling for PDF readability - larger fonts for axis labels and ticks
            const svg = (chart as any).getSVG({
                chart: {
                    width: exportWidth,
                    height: exportHeight,
                    backgroundColor: '#FFFFFF'
                },
                // Enhanced axis styling for PDF
                xAxis: {
                    labels: {
                        style: {
                            fontSize: '20px',
                            fontWeight: '500'
                        }
                    },
                    title: {
                        style: {
                            fontSize: '24px',
                            fontWeight: '600'
                        }
                    }
                },
                yAxis: {
                    labels: {
                        style: {
                            fontSize: '20px',
                            fontWeight: '500'
                        }
                    },
                    title: {
                        style: {
                            fontSize: '24px',
                            fontWeight: '600'
                        }
                    }
                },
                legend: {
                    itemStyle: {
                        fontSize: '18px',
                        fontWeight: '500'
                    }
                }
            });

            // Create an image from the SVG
            const img = new Image();
            // Prefix with data URI scheme if not present
            const svgUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));

            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Use the standardized export dimensions scaled by the resolution factor
                canvas.width = exportWidth * scale;
                canvas.height = exportHeight * scale;

                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    // Return high quality PNG
                    resolve(canvas.toDataURL('image/png', 0.95));
                } else {
                    resolve(null);
                }
            };

            img.onerror = (e) => {
                console.error('Error loading SVG image for export:', e);
                resolve(null);
            };

            img.src = svgUrl;

        } catch (error) {
            console.error('Error exporting chart to image:', error);
            resolve(null);
        }
    });
};
