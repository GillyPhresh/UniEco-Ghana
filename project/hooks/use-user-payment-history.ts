'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { getUserPayments } from '@/lib/data/payment-client';
import type { PaymentRecord } from '@/lib/types/payment';

export function useUserPaymentHistory(search: string, status: string) {
  const { user } = useAuth();
  const userId = user?.id;
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setPayments([]);
    setError(null);

    if (!userId) {
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    void getUserPayments({ limit: 50, search: search || undefined, status })
      .then(({ payments: rows }) => {
        if (active) setPayments(rows);
      })
      .catch(() => {
        if (active) setError('Could not load your payment history. Try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [userId, search, status, reloadKey]);

  const retry = useCallback(() => setReloadKey((value) => value + 1), []);

  return { payments, loading, error, retry };
}
