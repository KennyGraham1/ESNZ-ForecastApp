'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, ReactNode } from 'react';
import { ClusteringProvider } from '@/contexts/ClusteringContext';

export default function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());

    return (
        <QueryClientProvider client={queryClient}>
            <ClusteringProvider>
                {children}
            </ClusteringProvider>
        </QueryClientProvider>
    );
}
