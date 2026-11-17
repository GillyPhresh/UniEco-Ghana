-- Isolated database only. Synthetic transactions are rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions,pg_catalog;
SELECT plan(23);

INSERT INTO public.user_roles(id,name) VALUES (2,'student'),(6,'super_admin') ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('848a0000-0000-4000-8000-000000000071','docs-buyer@example.test',now(),'{"full_name":"Fixture Buyer"}'),
 ('848a0000-0000-4000-8000-000000000072','docs-seller@example.test',now(),'{}'),
 ('848a0000-0000-4000-8000-000000000073','docs-outsider@example.test',now(),'{}');
-- Eligible accounts for fixture Paystack payments; the document RPC must
-- still decide by relationship, not by the application role.
UPDATE public.profiles SET role_id=(SELECT id FROM public.user_roles WHERE name='super_admin'), status='active'
WHERE id IN ('848a0000-0000-4000-8000-000000000071','848a0000-0000-4000-8000-000000000072');
INSERT INTO public.vendors(id,owner_id,business_name,business_slug,is_verified,is_active) VALUES
 ('848a0000-0000-4000-8000-000000000074','848a0000-0000-4000-8000-000000000072','Fixture Shop','fixture-doc-shop',true,true);
INSERT INTO public.businesses(id,vendor_id,name,slug) VALUES
 ('848a0000-0000-4000-8000-000000000082','848a0000-0000-4000-8000-000000000074','Fixture business','fixture-doc-business');
INSERT INTO public.products(id,business_id,name,slug,price) VALUES
 ('848a0000-0000-4000-8000-000000000083','848a0000-0000-4000-8000-000000000082','Fixture product','fixture-doc-product',20);
INSERT INTO public.orders(id,buyer_id,vendor_id,status,order_type,delivery_method,delivery_fee,coupon_discount,total_amount,currency,order_number) VALUES
 ('848a0000-0000-4000-8000-000000000075','848a0000-0000-4000-8000-000000000071','848a0000-0000-4000-8000-000000000074','processing','product','delivery',6,3,43,'GHS','QA-DOC-PAID'),
 ('848a0000-0000-4000-8000-000000000076','848a0000-0000-4000-8000-000000000071','848a0000-0000-4000-8000-000000000074','completed','product','pickup',0,0,25,'GHS','QA-DOC-CASH');
INSERT INTO public.order_items(order_id,product_id,item_name,quantity,unit_price) VALUES
 ('848a0000-0000-4000-8000-000000000075','848a0000-0000-4000-8000-000000000083','Campus notebook',2,20);
INSERT INTO public.payments(id,user_id,vendor_id,order_id,provider,status,payment_type,payment_reference,paid_at,amount,currency) VALUES
 ('848a0000-0000-4000-8000-000000000077','848a0000-0000-4000-8000-000000000071','848a0000-0000-4000-8000-000000000074','848a0000-0000-4000-8000-000000000075','paystack','success','marketplace','QA-DOC-PAY1',now(),43,'GHS'),
 ('848a0000-0000-4000-8000-000000000078','848a0000-0000-4000-8000-000000000071','848a0000-0000-4000-8000-000000000074','848a0000-0000-4000-8000-000000000076','manual','cash_on_delivery','marketplace','QA-DOC-CASH1',NULL,25,'GHS'),
 ('848a0000-0000-4000-8000-000000000079','848a0000-0000-4000-8000-000000000072','848a0000-0000-4000-8000-000000000074',NULL,'paystack','success','subscription','QA-DOC-SUB1',now(),30,'GHS');
INSERT INTO public.receipts(order_id,payment_id,user_id,vendor_id,receipt_type,receipt_number,amount,currency) VALUES
 ('848a0000-0000-4000-8000-000000000075','848a0000-0000-4000-8000-000000000077','848a0000-0000-4000-8000-000000000071','848a0000-0000-4000-8000-000000000074','marketplace','QA-REC-ORDER',43,'GHS'),
 (NULL,'848a0000-0000-4000-8000-000000000079','848a0000-0000-4000-8000-000000000072','848a0000-0000-4000-8000-000000000074','subscription','QA-REC-SUB',30,'GHS');
INSERT INTO public.invoices(id,user_id,vendor_id,payment_id,invoice_number,invoice_type,status,currency,amount,total_amount,tax_amount) VALUES
 ('848a0000-0000-4000-8000-000000000080','848a0000-0000-4000-8000-000000000072','848a0000-0000-4000-8000-000000000074','848a0000-0000-4000-8000-000000000079','QA-INV-SUB','subscription','paid','GHS',30,30,0),
 ('848a0000-0000-4000-8000-000000000081','848a0000-0000-4000-8000-000000000072','848a0000-0000-4000-8000-000000000074',NULL,'QA-INV-LEGACY','subscription','paid','GHS',30,30,0);
INSERT INTO public.invoice_items(invoice_id,description,quantity,unit_price,total_price) VALUES
 ('848a0000-0000-4000-8000-000000000080','Fixture plan',1,30,30);

SELECT ok(NOT has_function_privilege('anon','public.get_transaction_document(text,uuid)','EXECUTE'),'Anonymous document RPC is denied');
SELECT ok(NOT has_function_privilege('anon','public.get_transaction_document_index(text,integer)','EXECUTE'),'Anonymous document index is denied');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='848a0000-0000-4000-8000-000000000073';
SELECT is(get_transaction_document('order-invoice','848a0000-0000-4000-8000-000000000075'),NULL::jsonb,'Outsider gets no order invoice');
SELECT is(get_transaction_document('receipt','848a0000-0000-4000-8000-000000000077'),NULL::jsonb,'Outsider gets no payment receipt');
SELECT is((SELECT count(*) FROM get_transaction_document_index('sales')),0::bigint,'Outsider has no sales documents');

SET LOCAL "request.jwt.claim.sub"='848a0000-0000-4000-8000-000000000071';
SELECT is(get_transaction_document('order-invoice','848a0000-0000-4000-8000-000000000075')->>'status','paid','Invoice reflects verified payment');
SELECT is(get_transaction_document('order-invoice','848a0000-0000-4000-8000-000000000075')->'items'->0->>'label','Campus notebook','Trusted order item is available');
SELECT is((get_transaction_document('order-invoice','848a0000-0000-4000-8000-000000000075')->>'subtotal')::numeric,40::numeric,'Subtotal balances with verified adjustments');
SELECT is(get_transaction_document('order-receipt','848a0000-0000-4000-8000-000000000075')->>'number','QA-REC-ORDER','Receipt available before fulfillment');
SELECT is(get_transaction_document('receipt','848a0000-0000-4000-8000-000000000077')->>'number','QA-REC-ORDER','Payment history uses the same receipt number');
SELECT is(get_transaction_document('order-invoice','848a0000-0000-4000-8000-000000000076')->>'status','cash_unconfirmed','Completed cash-on-delivery does not imply payment');
SELECT is(get_transaction_document('order-receipt','848a0000-0000-4000-8000-000000000076'),NULL::jsonb,'No receipt is issued for completed unverified cash');
SELECT is((SELECT count(*) FROM get_transaction_document_index('purchases')),2::bigint,'Buyer sees own purchase invoices');
SELECT is((SELECT count(*) FROM get_transaction_document_index('receipts')),1::bigint,'Buyer list excludes unverified cash');
SELECT is(get_transaction_document('invoice','848a0000-0000-4000-8000-000000000080'),NULL::jsonb,'Buyer cannot access another account invoice');

SET LOCAL "request.jwt.claim.sub"='848a0000-0000-4000-8000-000000000072';
SELECT is(get_transaction_document('order-receipt','848a0000-0000-4000-8000-000000000075')->>'billedTo','Order customer','Seller receipt omits buyer profile name');
SELECT is((SELECT count(*) FROM get_transaction_document_index('sales')),2::bigint,'Seller sees own sales invoices');
SELECT is(get_transaction_document('receipt','848a0000-0000-4000-8000-000000000079')->>'number','QA-REC-SUB','Subscription receipt is available to the payer');
SELECT is(get_transaction_document('invoice','848a0000-0000-4000-8000-000000000080')->'items'->0->>'label','Fixture plan','Account invoice prints stored line items');
SELECT is(get_transaction_document('invoice','848a0000-0000-4000-8000-000000000081')->>'status','unconfirmed','Legacy paid label alone does not prove payment');
RESET ROLE;
UPDATE public.payments SET status='partially_refunded' WHERE id='848a0000-0000-4000-8000-000000000077';
SET LOCAL ROLE authenticated;
SELECT is(get_transaction_document('order-receipt','848a0000-0000-4000-8000-000000000075')->>'status','partially_refunded','Receipt reflects a partial refund');
RESET ROLE;
UPDATE public.payments SET provider_environment='test' WHERE id='848a0000-0000-4000-8000-000000000077';
SET LOCAL ROLE authenticated;
SELECT is(get_transaction_document('order-receipt','848a0000-0000-4000-8000-000000000075'),NULL::jsonb,'Sandbox payments cannot produce real receipts');
RESET ROLE;
UPDATE public.payments SET provider_environment='live' WHERE id='848a0000-0000-4000-8000-000000000077';
UPDATE public.receipts SET amount=42 WHERE receipt_number='QA-REC-ORDER';
SET LOCAL ROLE authenticated;
SELECT is(get_transaction_document('order-receipt','848a0000-0000-4000-8000-000000000075'),NULL::jsonb,'Currency and amount must reconcile to verified payment');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
