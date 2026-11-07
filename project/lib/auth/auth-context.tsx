'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { AuthUser, Profile, StudentProfile, VendorProfile, UserRole } from '@/lib/types';

interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    meta: { full_name: string; registration_intent?: 'student' | 'external_vendor' }
  ) => Promise<{ error: string | null; session: Session | null }>;
  signInWithGoogle: (options?: { intent?: 'student' | 'external_vendor'; next?: string }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  signOutAll: () => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function roleFromProfile(profile: Profile | null): UserRole {
  const rolesById: Record<number, UserRole> = {
    1: 'visitor',
    2: 'student',
    3: 'student_vendor',
    4: 'external_vendor',
    5: 'moderator',
    6: 'super_admin',
    7: 'university_admin',
  };

  return rolesById[profile?.role_id ?? 2] ?? 'student';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const authRevision = useRef(0);

  const loadProfileData = useCallback(async (uid: string) => {
    const [profileResult, studentResult, vendorResult] = await Promise.all([
      supabase.from('profiles')
        .select('*, university:universities(id, name, short_name, slug)')
        .eq('id', uid)
        .maybeSingle(),
      supabase.from('student_profiles')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle(),
      supabase.from('vendor_profiles')
        .select('*')
        .eq('profile_id', uid)
        .maybeSingle(),
    ]);
    setProfile(profileResult.data as Profile | null);
    setStudentProfile(studentResult.data as StudentProfile | null);
    setVendorProfile(vendorResult.data as VendorProfile | null);
  }, []);

  useEffect(() => {
    let active = true;
    const clearProfile = () => {
      setProfile(null);
      setStudentProfile(null);
      setVendorProfile(null);
    };

    const initialRevision = authRevision.current;
    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      // Ignore a stale bootstrap result if a sign-in/sign-out event arrived first.
      if (!active || authRevision.current !== initialRevision) return;
      setSession(s);
      if (s?.user) {
        setLoading(true);
        void loadProfileData(s.user.id).catch(clearProfile).finally(() => {
          if (active && authRevision.current === initialRevision) setLoading(false);
        });
      } else {
        clearProfile();
        setLoading(false);
      }
    }).catch(() => {
      if (!active || authRevision.current !== initialRevision) return;
      setSession(null);
      clearProfile();
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      const revision = ++authRevision.current;
      setSession(s);
      if (s?.user) {
        // Do not expose a previous account's profile or let route guards run
        // until the new account's role and campus data have loaded.
        clearProfile();
        setLoading(true);
        // Start data requests after Supabase finishes its auth event callback;
        // issuing auth-backed requests inside that callback can stall refreshes.
        window.setTimeout(() => {
          if (!active || authRevision.current !== revision) return;
          void loadProfileData(s.user.id).catch(clearProfile).finally(() => {
            if (active && authRevision.current === revision) setLoading(false);
          });
        }, 0);
      } else {
        clearProfile();
        setLoading(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfileData]);

  const sessionUser = session?.user;
  const user = useMemo<AuthUser | null>(() => sessionUser
    ? {
        id: sessionUser.id,
        email: sessionUser.email ?? '',
        role: roleFromProfile(profile),
        profile,
        studentProfile,
        vendorProfile,
      }
    : null, [sessionUser, profile, studentProfile, vendorProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setLoading(false);
      return { error: error?.message ?? null };
    } catch {
      setLoading(false);
      return { error: 'We could not reach the sign-in service. Check your connection and try again.' };
    }
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      meta: { full_name: string; registration_intent?: 'student' | 'external_vendor' }
    ) => {
      setLoading(true);
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: meta.full_name,
              registration_intent: meta.registration_intent ?? 'student',
            },
          },
        });
        if (error || !data.session) setLoading(false);
        return { error: error?.message ?? null, session: data.session };
      } catch {
        setLoading(false);
        return { error: 'We could not reach the registration service. Check your connection and try again.', session: null };
      }
    },
    []
  );

  const signInWithGoogle = useCallback(async (options?: { intent?: 'student' | 'external_vendor'; next?: string }) => {
    const params = new URLSearchParams();
    if (options?.intent) params.set('intent', options.intent);
    if (options?.next) params.set('next', options.next);
    window.location.assign(`/auth/google-production${params.toString() ? `?${params.toString()}` : ''}`);
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setStudentProfile(null);
    setVendorProfile(null);
  }, []);

  const signOutAll = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    setProfile(null);
    setStudentProfile(null);
    setVendorProfile(null);
    return { error: error?.message ?? null };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    return { error: error?.message ?? null };
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: session?.user?.email ?? '',
        password: currentPassword,
      });
      if (signInError) {
        return { error: 'Your current password is incorrect' };
      }
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      return { error: updateError?.message ?? null };
    },
    [session?.user?.email]
  );

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfileData(session.user.id);
  }, [session?.user, loadProfileData]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    signOutAll,
    resetPassword,
    updatePassword,
    changePassword,
    refreshProfile,
  }), [user, session, loading, signIn, signUp, signInWithGoogle, signOut, signOutAll, resetPassword, updatePassword, changePassword, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
