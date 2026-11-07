'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { getVendorProfile } from '@/lib/data/vendor-client';
import type { Vendor } from '@/lib/types';

export function useVendor() {
  const { user } = useAuth();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const userId = user?.id;

  const loadVendor = useCallback(async () => {
    const requestId = ++requestSequence.current;
    if (!userId) {
      setVendor(null);
      setError(null);
      setLoading(false);
      return;
    }

    // Never carry the previous account's private vendor record across a
    // session switch while the new account's profile is being loaded.
    setVendor(null);
    setLoading(true);
    setError(null);

    try {
      const v = await getVendorProfile();
      if (requestSequence.current !== requestId) return;
      setVendor(v);
    } catch (err) {
      if (requestSequence.current !== requestId) return;
      setError(err instanceof Error ? err.message : 'Failed to load vendor data');
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadVendor();
    return () => { requestSequence.current += 1; };
  }, [loadVendor]);

  return { vendor, loading, error, reload: loadVendor };
}
