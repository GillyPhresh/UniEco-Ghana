-- Super-admin control for clearing registration-test accounts from production.
-- This intentionally preserves the named platform administrator and all
-- platform configuration. Storage objects require a separate Storage API job.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_reset_non_admin_accounts(
  p_confirmation text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_admin_id uuid;
  v_admin_role text;
  v_deleted_users integer;
  v_constraint_id oid;
  v_table_id oid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501';
  END IF;
  IF p_confirmation IS DISTINCT FROM 'DELETE ALL NON-ADMIN USERS' THEN
    RAISE EXCEPTION 'Type DELETE ALL NON-ADMIN USERS to confirm' USING ERRCODE='22023';
  END IF;
  IF length(trim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'A reason between 10 and 1000 characters is required' USING ERRCODE='22023';
  END IF;

  SELECT p.id, r.name INTO v_admin_id, v_admin_role
  FROM public.profiles p
  JOIN public.user_roles r ON r.id=p.role_id
  JOIN auth.users u ON u.id=p.id
  WHERE lower(u.email)=lower('info.uniecoghana@gmail.com')
  FOR UPDATE OF p;
  IF v_admin_id IS NULL OR v_admin_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Protected administrator account was not found or is not super_admin' USING ERRCODE='42501';
  END IF;
  CREATE TEMP TABLE purge_user_ids(id uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO purge_user_ids(id) SELECT id FROM auth.users WHERE id<>v_admin_id;
  GET DIAGNOSTICS v_deleted_users = ROW_COUNT;

  -- Remove every direct profile/Auth dependent row, including restrictive FKs.
  FOR v_constraint_id IN
    SELECT c.oid FROM pg_constraint c
    WHERE c.contype='f'
      AND c.confrelid IN ('auth.users'::regclass,'public.profiles'::regclass)
      AND array_length(c.conkey,1)=1
      AND c.conrelid NOT IN (
        'public.profiles'::regclass,
        'public.vendors'::regclass,
        'public.payments'::regclass,
        'public.orders'::regclass
      )
  LOOP
    DECLARE v_schema text; v_table text; v_column text;
    BEGIN
      SELECT n.nspname, cls.relname, att.attname INTO v_schema,v_table,v_column
      FROM pg_constraint c
      JOIN pg_class cls ON cls.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=cls.relnamespace
      JOIN pg_attribute att ON att.attrelid=c.conrelid AND att.attnum=c.conkey[1]
      WHERE c.oid=v_constraint_id;
      EXECUTE format('DELETE FROM %I.%I WHERE %I IN (SELECT id FROM purge_user_ids)',v_schema,v_table,v_column);
    END;
  END LOOP;

  -- Remove unreferenced user-owned operational rows and identifier-based logs.
  FOR v_table_id IN
    SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
      AND c.relname NOT IN ('vendors','payments','orders')
  LOOP
    DECLARE v_table text; v_column text;
    BEGIN
      SELECT c.relname,a.attname INTO v_table,v_column
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
      WHERE c.oid=v_table_id AND a.attnum>0 AND NOT a.attisdropped
        AND a.atttypid='uuid'::regtype
        AND a.attname IN ('user_id','owner_id','profile_id','student_id','actor_id','target_user_id','requested_by','reviewed_by','approved_by','assigned_by','assigned_to','sender_id','recipient_id','participant_one','participant_two','buyer_id','uploaded_by','author_id','reporter_id','reported_id','referrer_user_id','referred_user_id','appellant_id','changed_by','closed_by','created_by')
      LIMIT 1;
      IF v_table IS NOT NULL THEN
        EXECUTE format('DELETE FROM public.%I WHERE %I IN (SELECT id FROM purge_user_ids)',v_table,v_column);
      END IF;
    END;
  END LOOP;

  CREATE TEMP TABLE purge_vendor_ids(id uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO purge_vendor_ids(id) SELECT id FROM public.vendors WHERE owner_id IN (SELECT id FROM purge_user_ids);
  DELETE FROM public.orders WHERE buyer_id IN (SELECT id FROM purge_user_ids) OR vendor_id IN (SELECT id FROM purge_vendor_ids);

  CREATE TEMP TABLE purge_payment_ids(id uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO purge_payment_ids(id)
  SELECT id FROM public.payments WHERE user_id IN (SELECT id FROM purge_user_ids) OR vendor_id IN (SELECT id FROM purge_vendor_ids);
  -- Re-scan immediately before deleting payment dependants. This protects
  -- against payment rows created or retained through a vendor-only link.
  INSERT INTO purge_payment_ids(id)
  SELECT id
  FROM public.payments
  WHERE vendor_id IN (SELECT id FROM purge_vendor_ids)
     OR user_id IN (SELECT id FROM purge_user_ids)
  ON CONFLICT (id) DO NOTHING;
  FOR v_constraint_id IN
    SELECT c.oid FROM pg_constraint c
    WHERE c.contype='f' AND c.confrelid='public.payments'::regclass
      AND array_length(c.conkey,1)=1 AND c.conrelid<>'public.payments'::regclass
  LOOP
    DECLARE v_schema text; v_table text; v_column text;
    BEGIN
      SELECT n.nspname,cls.relname,att.attname INTO v_schema,v_table,v_column
      FROM pg_constraint c JOIN pg_class cls ON cls.oid=c.conrelid JOIN pg_namespace n ON n.oid=cls.relnamespace JOIN pg_attribute att ON att.attrelid=c.conrelid AND att.attnum=c.conkey[1]
      WHERE c.oid=v_constraint_id;
      EXECUTE format('DELETE FROM %I.%I WHERE %I IN (SELECT id FROM purge_payment_ids)',v_schema,v_table,v_column);
    END;
  END LOOP;
  DELETE FROM public.payments WHERE id IN (SELECT id FROM purge_payment_ids);

  FOR v_constraint_id IN
    SELECT c.oid FROM pg_constraint c
    WHERE c.contype='f' AND c.confrelid='public.vendors'::regclass
      AND array_length(c.conkey,1)=1 AND c.conrelid<>'public.vendors'::regclass
  LOOP
    DECLARE v_schema text; v_table text; v_column text;
    BEGIN
      SELECT n.nspname,cls.relname,att.attname INTO v_schema,v_table,v_column
      FROM pg_constraint c JOIN pg_class cls ON cls.oid=c.conrelid JOIN pg_namespace n ON n.oid=cls.relnamespace JOIN pg_attribute att ON att.attrelid=c.conrelid AND att.attnum=c.conkey[1]
      WHERE c.oid=v_constraint_id;
      EXECUTE format('DELETE FROM %I.%I WHERE %I IN (SELECT id FROM purge_vendor_ids)',v_schema,v_table,v_column);
    END;
  END LOOP;
  DELETE FROM public.vendors WHERE id IN (SELECT id FROM purge_vendor_ids);
  DELETE FROM auth.users WHERE id IN (SELECT id FROM purge_user_ids);

  PERFORM public.record_trusted_admin_action(
    'accounts.bulk_reset','identity','auth_users',NULL,
    jsonb_build_object('reason',trim(p_reason),'deleted_user_count',v_deleted_users,'preserved_admin','info.uniecoghana@gmail.com')
  );
  RETURN jsonb_build_object('deleted_user_count',v_deleted_users,'preserved_admin','info.uniecoghana@gmail.com');
END $$;

REVOKE ALL ON FUNCTION public.admin_reset_non_admin_accounts(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_non_admin_accounts(text,text) TO authenticated;

COMMIT;
