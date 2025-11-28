'use client';

/**
 * Performance Debug Panel
 * 
 * Development-only component that displays real-time performance metrics.
 * Shows average times, percentiles, and success rates for tracked operations.
 */

import { useState, useEffect } from 'react';
import { perfMonitor } from '@/lib/monitoring/performance';
import { errorTracker } from '@/lib/monitoring/errors';

export function PerformanceDebugPanel() {
    const [isVisible, setIsVisible] = useState(false);
    const [stats, setStats] = useState<any[]>([]);
    const [errors, setErrors] = useState<any[]>([]);

    useEffect(() => {
        if (!isVisible) return;

        const interval = setInterval(() => {
            const operations = perfMonitor.getOperations();
            const newStats = operations
                .map(op => perfMonitor.getStats(op))
                .filter(s => s !== null)
                .sort((a, b) => (b?.avgDuration || 0) - (a?.avgDuration || 0));
            
            setStats(newStats);
            setErrors(errorTracker.getErrors().slice(-5)); // Last 5 errors
        }, 1000);

        return () => clearInterval(interval);
    }, [isVisible]);

    // Only show in development
    if (process.env.NODE_ENV !== 'development') {
        return null;
    }

    if (!isVisible) {
        return (
            <button
                onClick={() => setIsVisible(true)}
                className="fixed bottom-4 right-4 bg-gray-800 text-white px-3 py-2 rounded-lg shadow-lg text-xs font-mono hover:bg-gray-700 z-50"
                title="Show Performance Metrics"
            >
                📊 Perf
            </button>
        );
    }

    return (
        <div className="fixed bottom-0 right-0 bg-gray-900 text-white p-4 rounded-tl-lg shadow-2xl max-w-2xl max-h-96 overflow-auto z-50 font-mono text-xs">
            <div className="flex justify-between items-center mb-3 border-b border-gray-700 pb-2">
                <h4 className="font-bold text-sm">⚡ Performance Metrics</h4>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            perfMonitor.clear();
                            errorTracker.clear();
                            setStats([]);
                            setErrors([]);
                        }}
                        className="px-2 py-1 bg-red-600 rounded hover:bg-red-700"
                        title="Clear all metrics"
                    >
                        Clear
                    </button>
                    <button
                        onClick={() => {
                            const data = perfMonitor.export();
                            const blob = new Blob([data], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `perf-metrics-${Date.now()}.json`;
                            a.click();
                        }}
                        className="px-2 py-1 bg-blue-600 rounded hover:bg-blue-700"
                        title="Export metrics as JSON"
                    >
                        Export
                    </button>
                    <button
                        onClick={() => setIsVisible(false)}
                        className="px-2 py-1 bg-gray-700 rounded hover:bg-gray-600"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {stats.length === 0 ? (
                <p className="text-gray-400">No metrics recorded yet. Interact with the app to see performance data.</p>
            ) : (
                <div className="space-y-3">
                    <div>
                        <h5 className="font-semibold mb-2 text-yellow-400">Operations</h5>
                        <table className="w-full text-xs">
                            <thead className="text-gray-400 border-b border-gray-700">
                                <tr>
                                    <th className="text-left py-1">Operation</th>
                                    <th className="text-right py-1">Count</th>
                                    <th className="text-right py-1">Avg</th>
                                    <th className="text-right py-1">P95</th>
                                    <th className="text-right py-1">Success</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.map((stat, i) => (
                                    <tr key={i} className="border-b border-gray-800">
                                        <td className="py-1 text-blue-300">{stat.operation}</td>
                                        <td className="text-right">{stat.count}</td>
                                        <td className="text-right text-green-400">{stat.avgDuration.toFixed(1)}ms</td>
                                        <td className="text-right text-yellow-400">{stat.p95Duration.toFixed(1)}ms</td>
                                        <td className="text-right">{stat.successRate.toFixed(0)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {errors.length > 0 && (
                        <div>
                            <h5 className="font-semibold mb-2 text-red-400">Recent Errors</h5>
                            <div className="space-y-1">
                                {errors.map((err, i) => (
                                    <div key={i} className="bg-red-900/20 border border-red-800 rounded p-2">
                                        <div className="text-red-300 font-semibold">{err.error.message}</div>
                                        <div className="text-gray-400 text-xs mt-1">
                                            {err.context.component && `[${err.context.component}] `}
                                            {new Date(err.timestamp).toLocaleTimeString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

