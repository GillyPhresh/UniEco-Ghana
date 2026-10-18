-- Production reset after registration testing.
-- Preserve exactly info.uniecoghana@gmail.com as the platform super administrator.
-- Remove all other Auth identities and user-owned/test records while retaining
-- platform configuration (roles, universities, categories, and provider settings).
BEGIN;

DO $$
DECLARE
  admin_id uuid;
  admin_count integer;
  admin_role text;
  constraint_id oid;
  table_id oid;
BEGIN
  SELECT count(*) INTO admin_count
  FROM auth.users
  WHERE lower(email) = lower('info.uniecoghana@gmail.com');

  IF admin_count <> 1 THEN
    RAISE EXCEPTION 'Cleanup stopped: expected exactly one super-admin email, found %', admin_count
      USING ERRCODE = 'P0001';
  END IF;

  SELECT u.id, r.name
  INTO admin_id, admin_role
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  JOIN public.user_roles r ON r.id = p.role_id
  WHERE lower(u.email) = lower('info.uniecoghana@gmail.com');

  IF admin_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Cleanup stopped: info.uniecoghana@gmail.com is not super_admin (role=%)', admin_role
      USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE purge_user_ids(id uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO purge_user_ids(id)
  SELECT id FROM auth.users WHERE id <> admin_id;

  -- Storage metadata is user-owned even when no relational FK exists.
  DELETE FROM storage.objects
  WHERE owner IN (SELECT id FROM purge_user_ids);

  -- Delete every row directly tied to a removed Auth/profile identity. This
  -- uses the live catalog so later migrations adding user FKs are covered too.
  FOR constraint_id IN
    SELECT c.oid
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
      AND array_length(c.conkey, 1) = 1
      AND c.conrelid NOT IN ('public.profiles'::regclass)
  LOOP
    DECLARE
      child_schema text;
      child_table text;
      child_column text;
    BEGIN
      SELECT n.nspname, cls.relname, att.attname
      INTO child_schema, child_table, child_column
      FROM pg_constraint c
      JOIN pg_class cls ON cls.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cls.relnamespace
      JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = c.conkey[1]
      WHERE c.oid = constraint_id;

      EXECUTE format(
        'DELETE FROM %I.%I WHERE %I IN (SELECT id FROM purge_user_ids)',
        child_schema, child_table, child_column
      );
    END;
  END LOOP;

  -- Remove user-owned operational rows without FKs (for example analytics,
  -- risk subjects, and audit target IDs) so no deleted person's details remain.
  FOR table_id IN
    SELECT c.oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    DECLARE
      table_name text;
      column_name text;
    BEGIN
      SELECT c.relname, a.attname
      INTO table_name, column_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE c.oid = table_id
        AND a.attnum > 0 AND NOT a.attisdropped
        AND a.atttypid = 'uuid'::regtype
        AND a.attname IN (
          'user_id','owner_id','profile_id','student_id','actor_id','target_user_id',
          'requested_by','reviewed_by','approved_by','assigned_by','assigned_to',
          'sender_id','recipient_id','participant_one','participant_two','buyer_id',
          'uploaded_by','author_id','reporter_id','reported_id','referrer_user_id',
          'referred_user_id','appellant_id','changed_by','closed_by','created_by'
        )
      LIMIT 1;

      IF table_name IS NOT NULL THEN
        EXECUTE format(
          'DELETE FROM public.%I WHERE %I IN (SELECT id FROM purge_user_ids)',
          table_name, column_name
        );
      END IF;
    END;
  END LOOP;

  -- Remove vendor-owned and order/payment records before deleting vendor rows.
  CREATE TEMP TABLE purge_vendor_ids(id uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO purge_vendor_ids(id)
  SELECT v.id FROM public.vendors v WHERE v.owner_id IN (SELECT id FROM purge_user_ids);

  DELETE FROM public.orders
  WHERE buyer_id IN (SELECT id FROM purge_user_ids)
     OR vendor_id IN (SELECT id FROM purge_vendor_ids);

  CREATE TEMP TABLE purge_payment_ids(id uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO purge_payment_ids(id)
  SELECT p.id
  FROM public.payments p
  WHERE p.user_id IN (SELECT id FROM purge_user_ids)
     OR p.vendor_id IN (SELECT id FROM purge_vendor_ids);

  -- Payment children include restrictive audit/referral/refund references.
  FOR constraint_id IN
    SELECT c.oid
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.payments'::regclass
      AND array_length(c.conkey, 1) = 1
      AND c.conrelid <> 'public.payments'::regclass
  LOOP
    DECLARE
      child_schema text;
      child_table text;
      child_column text;
    BEGIN
      SELECT n.nspname, cls.relname, att.attname
      INTO child_schema, child_table, child_column
      FROM pg_constraint c
      JOIN pg_class cls ON cls.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cls.relnamespace
      JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = c.conkey[1]
      WHERE c.oid = constraint_id;

      EXECUTE format(
        'DELETE FROM %I.%I WHERE %I IN (SELECT id FROM purge_payment_ids)',
        child_schema, child_table, child_column
      );
    END;
  END LOOP;

  DELETE FROM public.payments
  WHERE id IN (SELECT id FROM purge_payment_ids);

  -- Clear any remaining vendor references, including rows whose billing/user
  -- columns were not the removed owner (for example test receipts).
  FOR constraint_id IN
    SELECT c.oid
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.vendors'::regclass
      AND array_length(c.conkey, 1) = 1
      AND c.conrelid <> 'public.vendors'::regclass
  LOOP
    DECLARE
      child_schema text;
      child_table text;
      child_column text;
    BEGIN
      SELECT n.nspname, cls.relname, att.attname
      INTO child_schema, child_table, child_column
      FROM pg_constraint c
      JOIN pg_class cls ON cls.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cls.relnamespace
      JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = c.conkey[1]
      WHERE c.oid = constraint_id;

      EXECUTE format(
        'DELETE FROM %I.%I WHERE %I IN (SELECT id FROM purge_vendor_ids)',
        child_schema, child_table, child_column
      );
    END;
  END LOOP;

  DELETE FROM public.vendors
  WHERE id IN (SELECT id FROM purge_vendor_ids);

  -- Auth deletion cascades profiles and all remaining CASCADE-owned rows.
  DELETE FROM auth.users
  WHERE id IN (SELECT id FROM purge_user_ids);

  -- Fail closed if anything other than the named admin remains.
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) <> lower('info.uniecoghana@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Cleanup stopped: non-admin Auth identities remain' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.profiles) <> 1 THEN
    RAISE EXCEPTION 'Cleanup stopped: expected exactly one profile after cleanup' USING ERRCODE = 'P0001';
  END IF;
END $$;

COMMIT;
