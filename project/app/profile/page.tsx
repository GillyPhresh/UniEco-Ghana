'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RouteGuard } from '@/lib/auth/route-guard';
import { useAuth } from '@/lib/auth/auth-context';
import { supabase } from '@/lib/supabase/client';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getPublicAvatarUrl } from '@/lib/storage/avatar-url';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User,
  Lock,
  Bell,
  ShieldCheck,
  LogOut,
  Loader2,
  Check,
  AlertCircle,
  Upload,
  Monitor,
  GraduationCap,
  Store,
  Heart,
  Sparkles,
} from 'lucide-react';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { STUDENT_INTERESTS } from '@/lib/types/student';
import { getStudentPreferences, upsertStudentPreferences, calculateProfileCompletion, updateStudentProfile } from '@/lib/data/student-client';
import type { StudentPreferences } from '@/lib/types/student';

export default function ProfilePage() {
  return (
    <RouteGuard requireAuth>
      <ProfileContent />
    </RouteGuard>
  );
}

function ProfileContent() {
  const { user, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState(user?.profile?.full_name || '');
  const [phone, setPhone] = useState(user?.profile?.phone || '');
  const [bio, setBio] = useState(user?.profile?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(getPublicAvatarUrl(user?.profile?.avatar_url));

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [notifSettings, setNotifSettings] = useState({
    email_orders: true,
    email_messages: true,
    email_events: true,
    email_promotions: false,
    push_orders: true,
    push_messages: true,
    push_events: false,
  });

  const [studentPrefs, setStudentPrefs] = useState<StudentPreferences | null>(null);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [academicForm, setAcademicForm] = useState({
    program_of_study: '',
    faculty: '',
    department: '',
    level: '',
    admission_year: undefined as number | undefined,
    graduation_year: undefined as number | undefined,
  });
  const [savingAcademic, setSavingAcademic] = useState(false);
  const [savingInterests, setSavingInterests] = useState(false);
  const [academicSaved, setAcademicSaved] = useState(false);
  const [interestsSaved, setInterestsSaved] = useState(false);
  const [profileCompletion, setProfileCompletion] = useState(0);

  useEffect(() => {
    if (user?.profile?.notification_settings) {
      setNotifSettings((prev) => ({ ...prev, ...user.profile!.notification_settings as object }));
    }
    if (user?.studentProfile) {
      setAcademicForm({
        program_of_study: user.studentProfile.program_of_study || '',
        faculty: user.studentProfile.faculty || '',
        department: user.studentProfile.department || '',
        level: user.studentProfile.level || '',
        admission_year: user.studentProfile.admission_year || undefined,
        graduation_year: user.studentProfile.graduation_year || undefined,
      });
    }
    (async () => {
      const prefs = await getStudentPreferences();
      setStudentPrefs(prefs);
      setSelectedInterests(prefs?.interests || []);
      const completion = calculateProfileCompletion(
        user?.profile || {},
        user?.studentProfile || null,
        prefs
      );
      setProfileCompletion(completion);
    })();
  }, [user]);

  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone,
        bio,
        avatar_url: avatarUrl || null,
      })
      .eq('id', user!.id);

    if (error) {
      setError(error.message);
    } else {
      setSaved(true);
      await refreshProfile();
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file);
    if (uploadError) {
      setError('Could not upload photo');
      return;
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    setPasswordSaving(true);
    const { error } = await changePassword(currentPassword, newPassword);
    if (error) {
      setPasswordError(error);
    } else {
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
    setPasswordSaving(false);
  };

  async function changePassword(current: string, next: string) {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user!.email,
      password: current,
    });
    if (signInError) return { error: 'Your current password is incorrect' };
    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    return { error: updateError?.message ?? null };
  }

  const handleSaveNotifications = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ notification_settings: notifSettings })
      .eq('id', user!.id);
    if (error) {
      setError(error.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const initials = (user?.profile?.full_name || user?.email || 'U')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <SiteHeader />
      <main className="container max-w-4xl py-8 sm:py-12">
        {/* Profile header card */}
        <div className="mb-8 flex flex-col items-start gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center">
          <Avatar className="h-20 w-20 border-2 border-primary/20">
            <AvatarImage src={avatarUrl} alt={user?.profile?.full_name || 'Profile'} />
            <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold text-foreground">
              {user?.profile?.full_name || user?.email}
            </h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary">
                {ROLE_LABELS[user?.role || 'student']}
              </Badge>
              {user?.studentProfile && (
                <Badge
                  variant={user.studentProfile.verification_status === 'verified' ? 'default' : 'outline'}
                >
                  <GraduationCap className="mr-1 h-3 w-3" />
                  {user.studentProfile.verification_status === 'verified'
                    ? 'Verified Student'
                    : 'Verification Pending'}
                </Badge>
              )}
              {user?.vendorProfile && (
                <Badge variant="outline">
                  <Store className="mr-1 h-3 w-3" />
                  {user.vendorProfile.verification_status === 'active'
                    ? 'Active Vendor'
                    : 'Vendor Pending'}
                </Badge>
              )}
            </div>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>

        {/* Profile completion banner */}
        {profileCompletion < 100 && (
          <div className="mb-6 flex items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <Sparkles className="h-5 w-5 shrink-0 text-primary" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Profile {profileCompletion}% complete</p>
                <span className="text-xs text-muted-foreground">{profileCompletion < 50 ? 'Getting started' : profileCompletion < 80 ? 'Almost there' : 'Nearly done'}</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary/15">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${profileCompletion}%` }}
                />
              </div>
            </div>
          </div>
        )}

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5">
            <TabsTrigger value="profile" className="gap-1.5">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="academic" className="gap-1.5">
              <GraduationCap className="h-4 w-4" />
              <span className="hidden sm:inline">Academic</span>
            </TabsTrigger>
            <TabsTrigger value="interests" className="gap-1.5">
              <Heart className="h-4 w-4" />
              <span className="hidden sm:inline">Interests</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5">
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Alerts</span>
            </TabsTrigger>
          </TabsList>

          {/* Profile tab */}
          <TabsContent value="profile" className="space-y-6">
            <SettingsCard title="Personal information" description="Update your profile details">
              {(error || saved) && (
                <StatusBanner error={error} success={saved} />
              )}
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={avatarUrl} alt="" />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary">
                    <Upload className="h-4 w-4" />
                    Change photo
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                  </label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={user?.email || ''} disabled className="bg-muted/50" />
                  <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio">Bio (optional)</Label>
                  <Textarea
                    id="bio"
                    rows={3}
                    maxLength={300}
                    placeholder="Tell other students about yourself..."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{bio.length}/300 characters</p>
                </div>

                <Button onClick={handleSaveProfile} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {saved && <Check className="mr-2 h-4 w-4" />}
                  {saving ? 'Saving...' : saved ? 'Saved!' : 'Save changes'}
                </Button>
              </div>
            </SettingsCard>
          </TabsContent>

          {/* Academic tab */}
          <TabsContent value="academic" className="space-y-6">
            <SettingsCard title="Academic information" description="Your university and programme details">
              {(academicSaved || error) && (
                <StatusBanner error={error} success={academicSaved} />
              )}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="program">Programme of study</Label>
                  <Input
                    id="program"
                    placeholder="e.g. BSc Computer Science"
                    value={academicForm.program_of_study}
                    onChange={(e) => setAcademicForm((p) => ({ ...p, program_of_study: e.target.value }))}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="faculty">Faculty</Label>
                    <Input
                      id="faculty"
                      placeholder="e.g. Faculty of Science"
                      value={academicForm.faculty}
                      onChange={(e) => setAcademicForm((p) => ({ ...p, faculty: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Input
                      id="department"
                      placeholder="e.g. Computer Science"
                      value={academicForm.department}
                      onChange={(e) => setAcademicForm((p) => ({ ...p, department: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="level">Level</Label>
                    <select
                      id="level"
                      value={academicForm.level}
                      onChange={(e) => setAcademicForm((p) => ({ ...p, level: e.target.value }))}
                      className="flex h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">Select level</option>
                      <option value="100">Level 100</option>
                      <option value="200">Level 200</option>
                      <option value="300">Level 300</option>
                      <option value="400">Level 400</option>
                      <option value="500">Level 500</option>
                      <option value="postgrad">Postgraduate</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admissionYear">Admission year</Label>
                    <Input
                      id="admissionYear"
                      type="number"
                      placeholder="e.g. 2023"
                      min={2000}
                      max={2030}
                      value={academicForm.admission_year || ''}
                      onChange={(e) => setAcademicForm((p) => ({ ...p, admission_year: e.target.value ? parseInt(e.target.value) : undefined }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="graduationYear">Expected graduation</Label>
                    <Input
                      id="graduationYear"
                      type="number"
                      placeholder="e.g. 2027"
                      min={2000}
                      max={2035}
                      value={academicForm.graduation_year || ''}
                      onChange={(e) => setAcademicForm((p) => ({ ...p, graduation_year: e.target.value ? parseInt(e.target.value) : undefined }))}
                    />
                  </div>
                </div>
                {user?.studentProfile && (
                  <Button
                    onClick={async () => {
                      setSavingAcademic(true);
                      setError(null);
                      const { error: err } = await updateStudentProfile(user.studentProfile!.id, academicForm);
                      if (err) {
                        setError(err);
                      } else {
                        setAcademicSaved(true);
                        await refreshProfile();
                        setTimeout(() => setAcademicSaved(false), 3000);
                      }
                      setSavingAcademic(false);
                    }}
                    disabled={savingAcademic}
                  >
                    {savingAcademic && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {academicSaved && <Check className="mr-2 h-4 w-4" />}
                    {savingAcademic ? 'Saving...' : academicSaved ? 'Saved!' : 'Save academic info'}
                  </Button>
                )}
              </div>
            </SettingsCard>
          </TabsContent>

          {/* Interests tab */}
          <TabsContent value="interests" className="space-y-6">
            <SettingsCard title="Your interests" description="Select what you care about — we use this to personalize your recommendations">
              {(interestsSaved || error) && (
                <StatusBanner error={error} success={interestsSaved} />
              )}
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {STUDENT_INTERESTS.map((interest) => {
                    const selected = selectedInterests.includes(interest);
                    return (
                      <button
                        key={interest}
                        onClick={() => {
                          setSelectedInterests((prev) =>
                            selected ? prev.filter((i) => i !== interest) : [...prev, interest]
                          );
                        }}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-foreground hover:border-primary/50'
                        }`}
                      >
                        {interest}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedInterests.length} interest{selectedInterests.length !== 1 ? 's' : ''} selected
                </p>
                <Button
                  onClick={async () => {
                    setSavingInterests(true);
                    setError(null);
                    const { error: err } = await upsertStudentPreferences({ interests: selectedInterests });
                    if (err) {
                      setError(err);
                    } else {
                      setInterestsSaved(true);
                      setTimeout(() => setInterestsSaved(false), 3000);
                    }
                    setSavingInterests(false);
                  }}
                  disabled={savingInterests}
                >
                  {savingInterests && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {interestsSaved && <Check className="mr-2 h-4 w-4" />}
                  {savingInterests ? 'Saving...' : interestsSaved ? 'Saved!' : 'Save interests'}
                </Button>
              </div>
            </SettingsCard>
          </TabsContent>

          {/* Security tab */}
          <TabsContent value="security" className="space-y-6">
            <SettingsCard title="Change password" description="Update your account password">
              {(passwordError || passwordSuccess) && (
                <StatusBanner error={passwordError} success={passwordSuccess} />
              )}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">
                    At least 8 characters with an uppercase, lowercase, and number
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmNewPassword">Confirm new password</Label>
                  <Input
                    id="confirmNewPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <Button onClick={handleChangePassword} disabled={passwordSaving}>
                  {passwordSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {passwordSuccess && <Check className="mr-2 h-4 w-4" />}
                  {passwordSaving ? 'Updating...' : passwordSuccess ? 'Updated!' : 'Update password'}
                </Button>
              </div>
            </SettingsCard>

            <SettingsCard title="Sign out all devices" description="Sign out from every device where you are logged in">
              <SignOutAllButton />
            </SettingsCard>
          </TabsContent>

          {/* Notifications tab */}
          <TabsContent value="notifications" className="space-y-6">
            <SettingsCard title="Notification preferences" description="Choose how you want to be notified">
              {saved && <StatusBanner success={saved} />}
              <div className="space-y-6">
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-foreground">Email notifications</h4>
                  <div className="space-y-3">
                    <NotifToggle
                      label="Order updates"
                      description="When your order status changes"
                      checked={notifSettings.email_orders}
                      onCheckedChange={(v) => setNotifSettings((p) => ({ ...p, email_orders: v }))}
                    />
                    <NotifToggle
                      label="Messages"
                      description="When you receive a new message"
                      checked={notifSettings.email_messages}
                      onCheckedChange={(v) => setNotifSettings((p) => ({ ...p, email_messages: v }))}
                    />
                    <NotifToggle
                      label="Events"
                      description="New campus events and reminders"
                      checked={notifSettings.email_events}
                      onCheckedChange={(v) => setNotifSettings((p) => ({ ...p, email_events: v }))}
                    />
                    <NotifToggle
                      label="Promotions"
                      description="Deals and promotions from vendors"
                      checked={notifSettings.email_promotions}
                      onCheckedChange={(v) => setNotifSettings((p) => ({ ...p, email_promotions: v }))}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="mb-3 text-sm font-semibold text-foreground">Push notifications</h4>
                  <div className="space-y-3">
                    <NotifToggle
                      label="Order updates"
                      description="When your order status changes"
                      checked={notifSettings.push_orders}
                      onCheckedChange={(v) => setNotifSettings((p) => ({ ...p, push_orders: v }))}
                    />
                    <NotifToggle
                      label="Messages"
                      description="When you receive a new message"
                      checked={notifSettings.push_messages}
                      onCheckedChange={(v) => setNotifSettings((p) => ({ ...p, push_messages: v }))}
                    />
                    <NotifToggle
                      label="Events"
                      description="Event reminders before they start"
                      checked={notifSettings.push_events}
                      onCheckedChange={(v) => setNotifSettings((p) => ({ ...p, push_events: v }))}
                    />
                  </div>
                </div>

                <Button onClick={handleSaveNotifications} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {saved && <Check className="mr-2 h-4 w-4" />}
                  {saving ? 'Saving...' : saved ? 'Saved!' : 'Save preferences'}
                </Button>
              </div>
            </SettingsCard>
          </TabsContent>

          {/* Account tab */}
          <TabsContent value="account" className="space-y-6">
            <SettingsCard title="Account information" description="Your role and verification status">
              <div className="space-y-4">
                <InfoRow label="Role" value={ROLE_LABELS[user?.role || 'student']} />
                <InfoRow label="Account status" value={user?.profile?.status || 'active'} />
                <Separator />
                {user?.studentProfile && (
                  <>
                    <InfoRow
                      label="Student verification"
                      value={user.studentProfile.verification_status}
                    />
                    <InfoRow
                      label="University"
                      value={user.profile?.university?.name || 'Not set'}
                    />
                    <InfoRow
                      label="Programme"
                      value={user.studentProfile.program_of_study || 'Not set'}
                    />
                    <InfoRow label="Level" value={user.studentProfile.level || 'Not set'} />
                  </>
                )}
                {user?.vendorProfile && (
                  <>
                    <Separator />
                    <InfoRow
                      label="Vendor type"
                      value={user.vendorProfile.vendor_type === 'student_vendor' ? 'Student Vendor' : 'External Vendor'}
                    />
                    <InfoRow
                      label="Vendor status"
                      value={user.vendorProfile.verification_status}
                    />
                  </>
                )}
              </div>
            </SettingsCard>

            <SettingsCard title="Danger zone" description="Sign out of your account">
              <Button variant="outline" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </SettingsCard>
          </TabsContent>
        </Tabs>
      </main>
      <SiteFooter />
    </>
  );
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-6">
        <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function NotifToggle({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground capitalize">{value}</span>
    </div>
  );
}

function StatusBanner({ error, success }: { error?: string | null; success?: boolean }) {
  if (error) {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }
  if (success) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
        <Check className="h-4 w-4" />
        <span>Saved successfully</span>
      </div>
    );
  }
  return null;
}

function SignOutAllButton() {
  const { signOutAll } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignOutAll = async () => {
    setLoading(true);
    const { error } = await signOutAll();
    if (!error) {
      router.push('/');
    }
    setLoading(false);
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        This will sign you out from every device where you are currently logged in,
        including this one.
      </p>
      <Button variant="destructive" onClick={handleSignOutAll} disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Sign out from all devices
      </Button>
    </div>
  );
}
