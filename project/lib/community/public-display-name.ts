/** Use with the signed-in user's profile. Public clients receive only the resolved name. */
export function publicDisplayName(profile?: { public_nickname?: string | null; full_name?: string | null; show_registered_name?: boolean } | null) {
  if (profile?.public_nickname?.trim()) return profile.public_nickname.trim();
  if (!profile?.show_registered_name) return 'UniEco user';
  const registered = profile?.full_name?.trim();
  return registered && !registered.includes('@') && !/^[+()\d\s.-]+$/.test(registered) ? registered : 'Unnamed user';
}
