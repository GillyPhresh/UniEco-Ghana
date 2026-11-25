/** Use with the signed-in user's profile. Public clients receive only the resolved name. */
export function publicDisplayName(profile?: { public_nickname?: string | null; full_name?: string | null } | null) {
  const registered = profile?.full_name?.trim();
  return profile?.public_nickname?.trim() || (registered && !registered.includes('@') && !/^[+()\d\s.-]+$/.test(registered) ? registered : 'Unnamed user');
}
