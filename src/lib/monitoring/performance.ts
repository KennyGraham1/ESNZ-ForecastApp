/**
 * Performance Monitoring System
 * 
 * Tracks performance metrics for data-driven optimization decisions.
 * Provides insights into bottlenecks and performance regressions.
 */

import { MONITORING_CONFIG } from '@/config/performance';

export interface PerformanceMetric {
    operation: string;
    duration: number;
    dataSize: number;
    timestamp: number;
    success: boolean;
    error?: string;
    metadata?: Record<string, any>;
}

export interface PerformanceStats {
    operation: string;
    count: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    p50Duration: number;
    p95Duration: number;
    p99Duration: number;
    successRate: number;
    totalDataSize: number;
}

class PerformanceMonitor {
    private metrics: PerformanceMetric[] = [];
    private enabled: boolean;

    constructor() {
        this.enabled = MONITORING_CONFIG.ENABLED;
    }

    /**
     * Track a synchronous operation
     */
    track<T>(operation: string, dataSize: number, fn: () => T, metadata?: Record<string, any>): T {
        if (!this.enabled) {
            return fn();
        }

        const start = performance.now();
        let success = true;
        let error: string | undefined;

        try {
            return fn();
        } catch (e) {
            success = false;
            error = e instanceof Error ? e.message : 'Unknown error';
            throw e;
        } finally {
            const duration = performance.now() - start;
            this.recordMetric({
                operation,
                duration,
                dataSize,
                timestamp: Date.now(),
                success,
                error,
                metadata,
            });

            // Log slow operations
            if (duration > MONITORING_CONFIG.SLOW_OPERATION_THRESHOLD) {
                console.warn(
                    `⚠️ Slow operation: ${operation} took ${duration.toFixed(2)}ms ` +
                    `(${dataSize.toLocaleString()} items)`
                );
            }
        }
    }

    /**
     * Track an async operation
     */
    async trackAsync<T>(
        operation: string,
        dataSize: number,
        fn: () => Promise<T>,
        metadata?: Record<string, any>
    ): Promise<T> {
        if (!this.enabled) {
            return fn();
        }

        const start = performance.now();
        let success = true;
        let error: string | undefined;

        try {
            return await fn();
        } catch (e) {
            success = false;
            error = e instanceof Error ? e.message : 'Unknown error';
            throw e;
        } finally {
            const duration = performance.now() - start;
            this.recordMetric({
                operation,
                duration,
                dataSize,
                timestamp: Date.now(),
                success,
                error,
                metadata,
            });

            // Log slow operations
            if (duration > MONITORING_CONFIG.SLOW_OPERATION_THRESHOLD) {
                console.warn(
                    `⚠️ Slow async operation: ${operation} took ${duration.toFixed(2)}ms ` +
                    `(${dataSize.toLocaleString()} items)`
                );
            }
        }
    }

    /**
     * Record a metric manually
     */
    recordMetric(metric: PerformanceMetric): void {
        if (!this.enabled) return;

        this.metrics.push(metric);

        // Prevent memory leak by limiting stored metrics
        if (this.metrics.length > MONITORING_CONFIG.MAX_METRICS) {
            this.metrics = this.metrics.slice(-MONITORING_CONFIG.MAX_METRICS);
        }
    }

    /**
     * Get all metrics
     */
    getMetrics(): PerformanceMetric[] {
        return [...this.metrics];
    }

    /**
     * Get metrics for a specific operation
     */
    getMetricsForOperation(operation: string): PerformanceMetric[] {
        return this.metrics.filter(m => m.operation === operation);
    }

    /**
     * Get average duration for an operation
     */
    getAverageTime(operation: string): number {
        const ops = this.metrics.filter(m => m.operation === operation && m.success);
        if (ops.length === 0) return 0;
        return ops.reduce((sum, m) => sum + m.duration, 0) / ops.length;
    }

    /**
     * Get detailed statistics for an operation
     */
    getStats(operation: string): PerformanceStats | null {
        const ops = this.metrics.filter(m => m.operation === operation);
        if (ops.length === 0) return null;

        const successOps = ops.filter(m => m.success);
        const durations = successOps.map(m => m.duration).sort((a, b) => a - b);

        const percentile = (p: number) => {
            const index = Math.ceil((p / 100) * durations.length) - 1;
            return durations[Math.max(0, index)] || 0;
        };

        return {
            operation,
            count: ops.length,
            avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length || 0,
            minDuration: durations[0] || 0,
            maxDuration: durations[durations.length - 1] || 0,
            p50Duration: percentile(50),
            p95Duration: percentile(95),
            p99Duration: percentile(99),
            successRate: (successOps.length / ops.length) * 100,
            totalDataSize: ops.reduce((sum, m) => sum + m.dataSize, 0),
        };
    }

    /**
     * Get all operation names
     */
    getOperations(): string[] {
        const operations = new Set(this.metrics.map(m => m.operation));
        return Array.from(operations);
    }

    /**
     * Clear all metrics
     */
    clear(): void {
        this.metrics = [];
    }

    /**
     * Export metrics as JSON
     */
    export(): string {
        return JSON.stringify({
            metrics: this.metrics,
            summary: this.getOperations().map(op => this.getStats(op)),
            exportedAt: new Date().toISOString(),
        }, null, 2);
    }

    /**
     * Enable/disable monitoring
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Check if monitoring is enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }
}

// Singleton instance
export const perfMonitor = new PerformanceMonitor();

// Convenience functions
export const trackPerformance = perfMonitor.track.bind(perfMonitor);
export const trackPerformanceAsync = perfMonitor.trackAsync.bind(perfMonitor);


