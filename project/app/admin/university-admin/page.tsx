'use client';

import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { UniversityAdminWorkspaceContent } from '@/components/admin/university-admin-workspace-content';

export default function UniversityAdminManagementPage() {
  return <AdminRouteGuard><AdminLayout><UniversityAdminWorkspaceContent /></AdminLayout></AdminRouteGuard>;
}
