"use client";

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error fully to the console
    console.error('AlphaTrade Global Error Boundary caught:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] text-white p-6">
      <div className="w-full max-w-md bg-[#1a1a1a] border border-red-500/20 rounded-xl p-8 text-center space-y-6 shadow-2xl">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto text-red-500 text-3xl font-bold">
          !
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Client-Side Runtime Error</h2>
          <p className="text-sm text-gray-400">
            AlphaTrade captured a hydration crash in your browser. This is typically due to React 19/Next.js version mismatch or local file conflicts.
          </p>
        </div>
        
        {error.message && (
          <div className="p-4 bg-black/30 rounded-lg text-left text-xs font-mono text-red-400 border border-red-500/10 max-h-40 overflow-y-auto">
            {error.message}
          </div>
        )}

        <div className="flex space-x-4">
          <button
            onClick={() => reset()}
            className="flex-1 bg-[#10b981] hover:bg-[#10b981]/80 text-[#0a0a0a] font-bold py-2.5 px-4 rounded-lg transition-colors cursor-pointer"
          >
            TRY RE-MOUNTING
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white font-semibold py-2.5 px-4 rounded-lg border border-gray-800 transition-colors cursor-pointer"
          >
            FORCE REFRESH
          </button>
        </div>
      </div>
    </div>
  );
}
