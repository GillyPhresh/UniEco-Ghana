'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { getVendorProfile } from '@/lib/data/vendor-client';
import type { Vendor } from '@/lib/types';

export function useVendor() {
  const { user } = useAuth();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVendor = useCallback(async () => {
    if (!user) {
      setVendor(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const v = await getVendorProfile();
      setVendor(v);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vendor data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadVendor();
  }, [loadVendor]);

  return { vendor, loading, error, reload: loadVendor };
}
