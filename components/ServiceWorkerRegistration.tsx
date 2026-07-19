'use client';

import { useEffect } from 'react';

/** Registers public/sw.js on mount. Silently no-ops if the browser doesn't
 * support service workers (or in non-browser/test environments). */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[sw] Registration failed:', err);
    });
  }, []);

  return null;
}
