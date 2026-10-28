# UniEco Ghana safe change control

The Super Admin can use `/admin/settings` for allowlisted feature flags and small platform controls. Each change requires a reason, is written to an immutable history table, and can be rolled back by creating a new audited change.

The panel is intentionally not a generic code editor, SQL editor, payment editor, authentication editor, or role editor. Those areas remain protected by source control, migrations, Supabase RLS/RPC authority, and deployment review.

For larger work:

1. Make the code or migration change in GitHub.
2. Deploy to staging and verify the mobile experience.
3. Take a recovery point before production database changes.
4. Deploy to Railway production.
5. Keep the previous deployment available for rollback.

This gives UniEco Ghana ongoing flexibility without turning the management console into an unrestricted production-destructive tool.
