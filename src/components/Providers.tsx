'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, ReactNode } from 'react';
import { ClusteringProvider } from '@/contexts/ClusteringContext';

export default function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());

    // Disable Highcharts animations globally.
    // Without this, rapid data updates (e.g. loading from IndexedDB) cause
    // "Cannot read properties of undefined (reading 'graphic')" errors because
    // Highcharts tries to animate points before their DOM elements are created.
    useEffect(() => {
        import('highcharts').then(({ default: Highcharts }) => {
            Highcharts.setOptions({
                chart: { animation: false },
                plotOptions: { series: { animation: false } },
            });
        });
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            <ClusteringProvider>
                {children}
            </ClusteringProvider>
        </QueryClientProvider>
    );
}
