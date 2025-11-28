/**
 * Error Tracking and Logging System
 * 
 * Centralized error handling with support for external error tracking services.
 * Provides structured error logging with context and metadata.
 */

export interface ErrorContext {
    component?: string;
    operation?: string;
    userId?: string;
    sessionId?: string;
    url?: string;
    userAgent?: string;
}

export interface ErrorMetadata {
    [key: string]: any;
}

export interface TrackedError {
    error: Error;
    context: ErrorContext;
    metadata?: ErrorMetadata;
    timestamp: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
}

class ErrorTracker {
    private errors: TrackedError[] = [];
    private maxErrors = 100; // Prevent memory leak

    /**
     * Track an error with context and metadata
     */
    track(
        error: Error | string,
        context: ErrorContext,
        metadata?: ErrorMetadata,
        severity: TrackedError['severity'] = 'medium'
    ): void {
        const errorObj = typeof error === 'string' ? new Error(error) : error;
        
        const trackedError: TrackedError = {
            error: errorObj,
            context: {
                ...context,
                url: typeof window !== 'undefined' ? window.location.href : undefined,
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            },
            metadata,
            timestamp: Date.now(),
            severity,
        };

        // Store error
        this.errors.push(trackedError);
        if (this.errors.length > this.maxErrors) {
            this.errors = this.errors.slice(-this.maxErrors);
        }

        // Log to console with appropriate level
        this.logToConsole(trackedError);

        // Send to external service if available
        this.sendToExternalService(trackedError);
    }

    /**
     * Log error to console with formatting
     */
    private logToConsole(trackedError: TrackedError): void {
        const { error, context, metadata, severity } = trackedError;
        
        const emoji = {
            low: '⚠️',
            medium: '❌',
            high: '🔥',
            critical: '💥',
        }[severity];

        const contextStr = context.component 
            ? `[${context.component}${context.operation ? `:${context.operation}` : ''}]`
            : '';

        console.error(
            `${emoji} Error ${contextStr}:`,
            error.message,
            '\nContext:', context,
            metadata ? '\nMetadata:' : '', metadata || ''
        );

        // Log stack trace for high/critical errors
        if (severity === 'high' || severity === 'critical') {
            console.error('Stack trace:', error.stack);
        }
    }

    /**
     * Send error to external tracking service (Sentry, etc.)
     */
    private sendToExternalService(trackedError: TrackedError): void {
        // Check if Sentry is available
        if (typeof window !== 'undefined' && (window as any).Sentry) {
            const { error, context, metadata, severity } = trackedError;
            
            (window as any).Sentry.captureException(error, {
                level: severity === 'critical' ? 'fatal' : severity,
                tags: {
                    component: context.component,
                    operation: context.operation,
                },
                extra: {
                    ...metadata,
                    context,
                },
            });
        }

        // Add other error tracking services here (e.g., LogRocket, Rollbar)
    }

    /**
     * Get all tracked errors
     */
    getErrors(): TrackedError[] {
        return [...this.errors];
    }

    /**
     * Get errors by severity
     */
    getErrorsBySeverity(severity: TrackedError['severity']): TrackedError[] {
        return this.errors.filter(e => e.severity === severity);
    }

    /**
     * Get errors by component
     */
    getErrorsByComponent(component: string): TrackedError[] {
        return this.errors.filter(e => e.context.component === component);
    }

    /**
     * Clear all errors
     */
    clear(): void {
        this.errors = [];
    }

    /**
     * Export errors as JSON
     */
    export(): string {
        return JSON.stringify({
            errors: this.errors.map(e => ({
                message: e.error.message,
                stack: e.error.stack,
                context: e.context,
                metadata: e.metadata,
                timestamp: new Date(e.timestamp).toISOString(),
                severity: e.severity,
            })),
            exportedAt: new Date().toISOString(),
        }, null, 2);
    }
}

// Singleton instance
export const errorTracker = new ErrorTracker();

/**
 * Convenience function to track errors
 */
export function trackError(
    error: Error | string,
    context: ErrorContext,
    metadata?: ErrorMetadata,
    severity?: TrackedError['severity']
): void {
    errorTracker.track(error, context, metadata, severity);
}

