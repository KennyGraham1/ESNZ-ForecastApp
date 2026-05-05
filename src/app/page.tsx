import { Suspense } from 'react';
import PageClient from './PageClient';

export default function Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600" />
      </div>
    }>
      <PageClient />
    </Suspense>
  );
}
