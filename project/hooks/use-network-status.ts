'use client';

import { useEffect, useState, useCallback } from 'react';

interface NetworkState {
  online: boolean;
  connectionType: string | null;
  effectiveType: string | null;
  downlink: number | null;
  saveData: boolean;
}

export function useNetworkStatus(): NetworkState {
  const [state, setState] = useState<NetworkState>({
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    connectionType: null,
    effectiveType: null,
    downlink: null,
    saveData: false,
  });

  useEffect(() => {
    const updateFromConnection = () => {
      const conn = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
      if (conn) {
        setState((prev) => ({
          ...prev,
          effectiveType: conn.effectiveType || null,
          downlink: conn.downlink ?? null,
          saveData: conn.saveData ?? false,
        }));
      }
    };

    const goOnline = () => setState((prev) => ({ ...prev, online: true }));
    const goOffline = () => setState((prev) => ({ ...prev, online: false }));

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    const conn = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
    if (conn?.addEventListener) {
      conn.addEventListener('change', updateFromConnection);
    }

    updateFromConnection();

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      if (conn?.removeEventListener) {
        conn.removeEventListener('change', updateFromConnection);
      }
    };
  }, []);

  return state;
}

interface ConnectionInfo {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
  type?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

export function isSlowConnection(state: NetworkState): boolean {
  if (!state.effectiveType) return false;
  return state.effectiveType === 'slow-2g' || state.effectiveType === '2g' || state.effectiveType === '3g';
}

export function shouldReduceData(state: NetworkState): boolean {
  return state.saveData || isSlowConnection(state);
}
