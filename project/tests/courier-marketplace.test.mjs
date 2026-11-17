import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

function load(filename, imports = {}) {
  const output = ts.transpileModule(read(filename), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', output)(mod, mod.exports, name => {
    assert.ok(Object.hasOwn(imports, name), 'Unexpected dependency: ' + name);
    return imports[name];
  });
  return mod.exports;
}

function gateway(reply) {
  const calls = [];
  const supabase = { async rpc(name, args) { calls.push([name, args]); return reply; } };
  return { calls, ...load('lib/data/courier-client.ts', { '@/lib/supabase/client': { supabase } }) };
}

test('courier input normalizes supported Ghana phones and budget-bound fee options', () => {
  const { COURIER_VEHICLES, normalizeCourierPhone, courierFeeChoices, showCourierFee, needsMotorVerification } = load('lib/courier/domain.ts');
  assert.deepEqual(Object.keys(COURIER_VEHICLES), ['walking', 'bicycle', 'motorbike', 'car']);
  assert.equal(normalizeCourierPhone('024 123 4567'), '+233241234567');
  assert.equal(normalizeCourierPhone('+233 (24) 123-4567'), '+233241234567');
  assert.equal(normalizeCourierPhone('0241234567?bad=1'), null);
  assert.equal(normalizeCourierPhone('+15005550001'), null);
  assert.equal(showCourierFee(850), 'GH₵8.50');
  assert.deepEqual(courierFeeChoices(350), [100, 200, 300, 350]);
  assert.deepEqual(courierFeeChoices(99), []);
  assert.equal(courierFeeChoices(300000).at(-1), 100000);
  assert.equal(needsMotorVerification('motorbike'), true);
  assert.equal(needsMotorVerification('car'), true);
  assert.equal(needsMotorVerification('walking'), false);
});

test('the courier gateway binds acceptance to the amount shown and cannot write to payments', async () => {
  const { courierGateway, calls } = gateway({ data: null, error: null });
  await courierGateway.claim('parcel-1', 850);
  await courierGateway.release('parcel-1');
  assert.deepEqual(calls, [
    ['courier_claim_job', { p_order_id: 'parcel-1', p_expected_fee_pesewas: 850 }],
    ['courier_release_job', { p_order_id: 'parcel-1' }],
  ]);
});

test('courier enrolment and order panel fail closed before the database is ready', async () => {
  const { courierGateway, CourierProgramUnavailable } = gateway({ error: { code: 'PGRST202' } });
  assert.equal(await courierGateway.availability(), false);
  assert.equal(await courierGateway.tracking('parcel-1'), null);
  await assert.rejects(courierGateway.workspace(), CourierProgramUnavailable);
});

test('courier workspace stays private and recruitment photo is real, local, and credited', () => {
  const sw = read('public/sw.js').split('const NEVER_CACHE_PATTERNS = ')[1].split('];')[0];
  assert.ok(sw.includes("'/delivery/work'"));
  assert.match(read('lib/supabase/middleware.ts'), /\/checkout', COURIER_WORK_PATH/);
  assert.match(read('app/auth/callback/route.ts'), /destination === COURIER_WORK_PATH/);
  assert.match(read('app/robots.ts'), /disallow: \[[\s\S]*?COURIER_WORK_PATH/);
  assert.match(read('lib/courier/photography.ts'), /pexels\.com\/photo\//);
  const img = readFileSync(new URL('../public/assets/marketplace/fresh/courier.webp', import.meta.url));
  assert.equal(img.subarray(8, 12).toString(), 'WEBP');
});
