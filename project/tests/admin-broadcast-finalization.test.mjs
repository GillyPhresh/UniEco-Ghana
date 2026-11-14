import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20261114120000_0198_finalize_admin_broadcasts.sql', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/admin/broadcasts/page.tsx', import.meta.url), 'utf8');

test('broadcast completion is reconciled only after the queue transaction finishes', () => {
  assert.match(migration, /CREATE CONSTRAINT TRIGGER reconcile_admin_broadcast_after_queue_count[\s\S]*DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /CREATE CONSTRAINT TRIGGER reconcile_admin_broadcast_after_event_status[\s\S]*DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /event\.status = 'delivered'/);
  assert.match(migration, /event\.attempt_count >= 3 OR event\.next_attempt_at IS NULL/);
  assert.match(migration, /UPDATE public\.admin_broadcasts AS broadcast[\s\S]*SET status = 'sent'[\s\S]*AND broadcast\.status = 'sending'/);
});

test('broadcast finalization does not grant callers new queue or send privileges', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reconcile_admin_broadcast_delivery\(uuid\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reconcile_admin_broadcast_after_queue_change\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /GRANT EXECUTE/);
  assert.doesNotMatch(migration, /INSERT INTO public\.notifications|enqueue_trusted_communication_event/);
});

test('admin broadcasts distinguish a queued delivery from completed delivery', () => {
  assert.match(page, /statusInfo\.label/);
  assert.match(page, /b\.status === 'sending' \? 'Recipients queued:' : 'Delivered:'/);
});
