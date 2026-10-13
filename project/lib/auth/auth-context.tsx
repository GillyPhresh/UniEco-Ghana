'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
    meta: { full_name: string }
  ) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
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

  const loadProfileData = useCallback(async (uid: string) => {
    const { data: prof } = await supabase
      .from('profiles')
      .select('*, university:universities(id, name, short_name, slug)')
      .eq('id', uid)
      .maybeSingle();
    setProfile(prof as Profile | null);

    const { data: sp } = await supabase
      .from('student_profiles')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();
    setStudentProfile(sp as StudentProfile | null);

    const { data: vp } = await supabase
      .from('vendor_profiles')
      .select('*')
      .eq('profile_id', uid)
      .maybeSingle();
    setVendorProfile(vp as VendorProfile | null);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!active) return;
      setSession(s);
      if (s?.user) {
        loadProfileData(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        (async () => {
          await loadProfileData(s.user.id);
          setLoading(false);
        })();
      } else {
        setProfile(null);
        setStudentProfile(null);
        setVendorProfile(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfileData]);

  const user: AuthUser | null = session?.user
    ? {
        id: session.user.id,
        email: session.user.email ?? '',
        role: roleFromProfile(profile),
        profile,
        studentProfile,
        vendorProfile,
      }
    : null;

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      meta: { full_name: string }
    ) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: meta.full_name,
          },
        },
      });
      return { error: error?.message ?? null };
    },
    []
  );

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    return { error: error?.message ?? null };
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

  const value: AuthContextValue = {
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
