'use client';

import { memo } from 'react';

interface LoadingProgressProps {
    /** Operation being performed (e.g., "Clustering events", "Loading data") */
    operation: string;

    /** Total number of items being processed */
    total: number;

    /** Number of items processed so far */
    current?: number;

    /** Progress percentage (0-100). If not provided, calculated from current/total */
    progress?: number;

    /** Additional details to show */
    details?: string;

    /** Show as overlay (default: true) */
    overlay?: boolean;

    /** Custom icon or emoji */
    icon?: string;
}

const LoadingProgress = memo(function LoadingProgress({
    operation,
    total,
    current,
    progress: providedProgress,
    details,
    overlay = true,
    icon = '⚙️',
}: LoadingProgressProps) {
    // Calculate progress if not provided
    const progress = providedProgress !== undefined
        ? providedProgress
        : current !== undefined
            ? (current / total) * 100
            : 0;

    const progressClamped = Math.min(100, Math.max(0, progress));
    const showPercentage = progressClamped > 0;

    const content = (
        <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md w-full">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="text-3xl animate-spin">{icon}</div>
                <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{operation}</h3>
                    {details && (
                        <p className="text-sm text-gray-600 mt-1">{details}</p>
                    )}
                </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out"
                        style={{ width: `${progressClamped}%` }}
                    />
                </div>

                {/* Progress Stats */}
                <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">
                        {current !== undefined ? (
                            <>
                                {current.toLocaleString()} / {total.toLocaleString()}
                            </>
                        ) : (
                            <>{total.toLocaleString()} events</>
                        )}
                    </span>

                    {showPercentage && (
                        <span className="font-semibold text-blue-600">
                            {progressClamped.toFixed(0)}%
                        </span>
                    )}
                </div>
            </div>

            {/* Indeterminate progress for when we don't have exact numbers */}
            {!showPercentage && (
                <div className="mt-3">
                    <div className="flex space-x-1">
                        {[0, 1, 2].map(i => (
                            <div
                                key={i}
                                className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
                                style={{
                                    animationDelay: `${i * 0.15}s`,
                                    animationDuration: '0.6s',
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    if (!overlay) {
        return content;
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
            {content}
        </div>
    );
});

export default LoadingProgress;

/**
 * Simplified loading spinner for smaller operations
 */
export const LoadingSpinner = memo(function LoadingSpinner({
    size = 'md',
    message,
}: {
    size?: 'sm' | 'md' | 'lg';
    message?: string;
}) {
    const sizeClasses = {
        sm: 'w-4 h-4',
        md: 'w-8 h-8',
        lg: 'w-12 h-12',
    };

    return (
        <div className="flex flex-col items-center justify-center gap-3">
            <div className={`${sizeClasses[size]} border-4 border-blue-600 border-t-transparent rounded-full animate-spin`} />
            {message && (
                <p className="text-sm text-gray-600">{message}</p>
            )}
        </div>
    );
});

/**
 * Skeleton loader for content placeholders
 */
export const SkeletonLoader = memo(function SkeletonLoader({
    type = 'chart',
    count = 1,
}: {
    type?: 'chart' | 'table' | 'card' | 'text';
    count?: number;
}) {
    const renderSkeleton = () => {
        switch (type) {
            case 'chart':
                return (
                    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 animate-pulse">
                        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
                        <div className="h-64 bg-gray-100 rounded" />
                    </div>
                );

            case 'table':
                return (
                    <div className="bg-white rounded-xl shadow-md border border-gray-200 animate-pulse">
                        <div className="p-4 border-b border-gray-200">
                            <div className="h-6 bg-gray-200 rounded w-1/4" />
                        </div>
                        <div className="p-4 space-y-3">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="flex gap-4">
                                    <div className="h-4 bg-gray-100 rounded flex-1" />
                                    <div className="h-4 bg-gray-100 rounded flex-1" />
                                    <div className="h-4 bg-gray-100 rounded flex-1" />
                                </div>
                            ))}
                        </div>
                    </div>
                );

            case 'card':
                return (
                    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 animate-pulse">
                        <div className="h-6 bg-gray-200 rounded w-2/3 mb-4" />
                        <div className="space-y-2">
                            <div className="h-4 bg-gray-100 rounded w-full" />
                            <div className="h-4 bg-gray-100 rounded w-5/6" />
                            <div className="h-4 bg-gray-100 rounded w-4/6" />
                        </div>
                    </div>
                );

            case 'text':
                return (
                    <div className="animate-pulse space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-full" />
                        <div className="h-4 bg-gray-200 rounded w-5/6" />
                        <div className="h-4 bg-gray-200 rounded w-4/6" />
                    </div>
                );
        }
    };

    return (
        <div className="space-y-4">
            {[...Array(count)].map((_, i) => (
                <div key={i}>{renderSkeleton()}</div>
            ))}
        </div>
    );
});
