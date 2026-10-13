-- Narrow catalog reads and database-authoritative coupon management. Coupon
-- redemption counters and redemption history are never browser-mutable.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_category_directory(p_limit integer DEFAULT 100,p_offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid,name text,slug text,description text,icon text,parent_id uuid,sort_order integer,
  is_visible boolean,created_at timestamptz,updated_at timestamptz,total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_limit integer:=COALESCE(p_limit,100); v_offset integer:=COALESCE(p_offset,0);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT category.id,category.name,category.slug,category.description,category.icon,category.parent_id,
    category.sort_order,category.is_visible,category.created_at,category.updated_at,count(*) OVER()
  FROM public.categories category ORDER BY category.sort_order,category.name LIMIT v_limit OFFSET v_offset;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_coupons(p_limit integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid,code text,description text,discount_type text,discount_value numeric,min_order_amount numeric,
  max_discount_amount numeric,student_only boolean,vendor_id uuid,university_id uuid,usage_limit integer,
  usage_count integer,per_user_limit integer,starts_at timestamptz,ends_at timestamptz,is_active boolean,
  created_at timestamptz,total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_limit integer:=COALESCE(p_limit,50); v_offset integer:=COALESCE(p_offset,0);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT coupon.id,coupon.code,coupon.description,coupon.discount_type,coupon.discount_value,coupon.min_order_amount,
    coupon.max_discount_amount,coupon.student_only,coupon.vendor_id,coupon.university_id,coupon.usage_limit,coupon.usage_count,
    coupon.per_user_limit,coupon.starts_at,coupon.ends_at,coupon.is_active,coupon.created_at,count(*) OVER()
  FROM public.coupons coupon ORDER BY coupon.created_at DESC LIMIT v_limit OFFSET v_offset;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_create_coupon(
  p_code text,p_description text,p_discount_type text,p_discount_value numeric,p_min_order_amount numeric,
  p_max_discount_amount numeric,p_student_only boolean,p_usage_limit integer,p_per_user_limit integer,
  p_is_active boolean,p_reason text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid; v_code text:=upper(btrim(COALESCE(p_code,''))); v_value numeric:=COALESCE(p_discount_value,0);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF NULLIF(btrim(p_reason),'') IS NULL OR length(btrim(p_reason)) < 10 OR length(btrim(p_reason)) > 500 THEN RAISE EXCEPTION 'A reason between 10 and 500 characters is required' USING ERRCODE='22023'; END IF;
  IF v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$' THEN RAISE EXCEPTION 'Coupon code must be 3 to 40 letters, digits, hyphens, or underscores' USING ERRCODE='22023'; END IF;
  IF p_discount_type NOT IN ('percentage','fixed') OR v_value <= 0 OR (p_discount_type='percentage' AND v_value > 100) OR (p_discount_type='fixed' AND v_value > 1000000) THEN RAISE EXCEPTION 'Invalid coupon discount' USING ERRCODE='22023'; END IF;
  IF COALESCE(p_min_order_amount,0) < 0 OR (p_max_discount_amount IS NOT NULL AND p_max_discount_amount < 0) OR COALESCE(p_per_user_limit,1) NOT BETWEEN 1 AND 1000 OR (p_usage_limit IS NOT NULL AND p_usage_limit < 1) THEN RAISE EXCEPTION 'Invalid coupon limits' USING ERRCODE='22023'; END IF;
  IF NULLIF(btrim(COALESCE(p_description,'')),'') IS NOT NULL AND length(btrim(p_description)) > 300 THEN RAISE EXCEPTION 'Coupon description is too long' USING ERRCODE='22023'; END IF;
  INSERT INTO public.coupons(code,description,discount_type,discount_value,min_order_amount,max_discount_amount,student_only,usage_limit,per_user_limit,is_active,starts_at,ends_at)
  VALUES(v_code,NULLIF(btrim(p_description),''),p_discount_type,v_value,COALESCE(p_min_order_amount,0),p_max_discount_amount,COALESCE(p_student_only,false),p_usage_limit,COALESCE(p_per_user_limit,1),COALESCE(p_is_active,true),now(),now()+interval '30 days')
  RETURNING id INTO v_id;
  PERFORM public.record_trusted_admin_action('coupon.created','coupons','coupon',v_id,jsonb_build_object('reason',btrim(p_reason),'discount_type',p_discount_type));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_coupon(
  p_coupon_id uuid,p_code text,p_description text,p_discount_type text,p_discount_value numeric,p_min_order_amount numeric,
  p_max_discount_amount numeric,p_student_only boolean,p_usage_limit integer,p_per_user_limit integer,p_is_active boolean,p_reason text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_code text:=upper(btrim(COALESCE(p_code,''))); v_value numeric:=COALESCE(p_discount_value,0); v_usage_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF NULLIF(btrim(p_reason),'') IS NULL OR length(btrim(p_reason)) < 10 OR length(btrim(p_reason)) > 500 THEN RAISE EXCEPTION 'A reason between 10 and 500 characters is required' USING ERRCODE='22023'; END IF;
  IF v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$' THEN RAISE EXCEPTION 'Coupon code must be 3 to 40 letters, digits, hyphens, or underscores' USING ERRCODE='22023'; END IF;
  IF p_discount_type NOT IN ('percentage','fixed') OR v_value <= 0 OR (p_discount_type='percentage' AND v_value > 100) OR (p_discount_type='fixed' AND v_value > 1000000) THEN RAISE EXCEPTION 'Invalid coupon discount' USING ERRCODE='22023'; END IF;
  IF COALESCE(p_min_order_amount,0) < 0 OR (p_max_discount_amount IS NOT NULL AND p_max_discount_amount < 0) OR COALESCE(p_per_user_limit,1) NOT BETWEEN 1 AND 1000 OR (p_usage_limit IS NOT NULL AND p_usage_limit < 1) THEN RAISE EXCEPTION 'Invalid coupon limits' USING ERRCODE='22023'; END IF;
  IF NULLIF(btrim(COALESCE(p_description,'')),'') IS NOT NULL AND length(btrim(p_description)) > 300 THEN RAISE EXCEPTION 'Coupon description is too long' USING ERRCODE='22023'; END IF;
  SELECT coupon.usage_count INTO v_usage_count FROM public.coupons coupon WHERE coupon.id=p_coupon_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coupon not found' USING ERRCODE='P0002'; END IF;
  IF p_usage_limit IS NOT NULL AND p_usage_limit < v_usage_count THEN RAISE EXCEPTION 'Usage limit cannot be lower than recorded redemptions' USING ERRCODE='22023'; END IF;
  UPDATE public.coupons SET code=v_code,description=NULLIF(btrim(p_description),''),discount_type=p_discount_type,discount_value=v_value,
    min_order_amount=COALESCE(p_min_order_amount,0),max_discount_amount=p_max_discount_amount,student_only=COALESCE(p_student_only,false),
    usage_limit=p_usage_limit,per_user_limit=COALESCE(p_per_user_limit,1),is_active=COALESCE(p_is_active,true)
  WHERE id=p_coupon_id;
  PERFORM public.record_trusted_admin_action('coupon.updated','coupons','coupon',p_coupon_id,jsonb_build_object('reason',btrim(p_reason),'is_active',COALESCE(p_is_active,true)));
END; $$;

-- Coupon deletion cascades redemption history. Retire by setting is_active=false;
-- never hard-delete a financial promotion or its audit trail from management.
DROP POLICY IF EXISTS super_admin_insert_coupons ON public.coupons;
DROP POLICY IF EXISTS super_admin_update_coupons ON public.coupons;
DROP POLICY IF EXISTS super_admin_delete_coupons ON public.coupons;
REVOKE INSERT,UPDATE,DELETE ON public.coupons FROM authenticated;

REVOKE ALL ON FUNCTION public.get_admin_category_directory(integer,integer),public.get_admin_coupons(integer,integer),public.admin_create_coupon(text,text,text,numeric,numeric,numeric,boolean,integer,integer,boolean,text),public.admin_update_coupon(uuid,text,text,text,numeric,numeric,numeric,boolean,integer,integer,boolean,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_category_directory(integer,integer),public.get_admin_coupons(integer,integer),public.admin_create_coupon(text,text,text,numeric,numeric,numeric,boolean,integer,integer,boolean,text),public.admin_update_coupon(uuid,text,text,text,numeric,numeric,numeric,boolean,integer,integer,boolean,text) TO authenticated;

COMMIT;
