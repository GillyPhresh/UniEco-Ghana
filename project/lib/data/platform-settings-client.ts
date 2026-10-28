import { supabase } from '@/lib/supabase/client';

export type AdminPlatformSetting = {
  setting_id: string;
  setting_key: string;
  label: string;
  description: string;
  value_type: 'boolean' | 'text' | 'number' | 'enum';
  value: boolean | number | string;
  validation: Record<string, unknown>;
  is_editable: boolean;
  updated_at: string;
  updated_by: string | null;
};

export type AdminPlatformSettingChange = {
  change_id: string;
  setting_key: string;
  label: string;
  old_value: boolean | number | string;
  new_value: boolean | number | string;
  reason: string;
  changed_by: string;
  changed_by_name: string;
  created_at: string;
};

export async function getAdminPlatformSettings(): Promise<AdminPlatformSetting[]> {
  const { data, error } = await supabase.rpc('get_admin_platform_settings');
  if (error) throw new Error('Unable to load platform settings.');
  return (data || []) as AdminPlatformSetting[];
}

export async function getAdminPlatformSettingHistory(limit = 50): Promise<AdminPlatformSettingChange[]> {
  const { data, error } = await supabase.rpc('get_admin_platform_setting_history', { p_limit: limit });
  if (error) throw new Error('Unable to load setting history.');
  return (data || []) as AdminPlatformSettingChange[];
}

export async function updateAdminPlatformSetting(settingKey: string, value: boolean | number | string, reason: string) {
  const { error } = await supabase.rpc('update_admin_platform_setting', {
    p_setting_key: settingKey,
    p_value: value,
    p_reason: reason,
  });
  return { error: error?.message || null };
}

export async function rollbackAdminPlatformSettingChange(changeId: string, reason: string) {
  const { error } = await supabase.rpc('rollback_admin_platform_setting_change', {
    p_change_id: changeId,
    p_reason: reason,
  });
  return { error: error?.message || null };
}
