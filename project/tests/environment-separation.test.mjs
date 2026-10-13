import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF, validateProductionEnvironment, validateStagingEnvironment } from '../scripts/environment-validation.mjs';

test('staging environment accepts only the approved staging project', () => {
  const valid = validateStagingEnvironment({
    UNIECO_ENV: 'staging',
    NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-test-key',
  });
  assert.deepEqual(valid, []);

  const wrongProject = validateStagingEnvironment({
    UNIECO_ENV: 'staging',
    NEXT_PUBLIC_SUPABASE_URL: 'https://elxlrojlnusvybnfwxum.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-test-key',
  });
  assert.deepEqual(wrongProject, ['NEXT_PUBLIC_SUPABASE_URL must use the approved HTTPS staging project origin']);

  for (const url of [
    `http://${STAGING_PROJECT_REF}.supabase.co`,
    `https://${STAGING_PROJECT_REF}.supabase.co.attacker.example`,
  ]) {
    const invalidOrigin = validateStagingEnvironment({
      UNIECO_ENV: 'staging',
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-test-key',
    });
    assert.deepEqual(invalidOrigin, ['NEXT_PUBLIC_SUPABASE_URL must use the approved HTTPS staging project origin']);
  }
});

test('production environment accepts only the approved production project', () => {
  const valid = validateProductionEnvironment({
    UNIECO_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-test-key',
  });
  assert.deepEqual(valid, []);

  for (const projectRef of [STAGING_PROJECT_REF, 'elxlrojlnusvybnfwxum']) {
    const invalid = validateProductionEnvironment({
      UNIECO_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-test-key',
    });
    assert.deepEqual(invalid, ['NEXT_PUBLIC_SUPABASE_URL must use the approved HTTPS production project origin']);
  }

  for (const url of [
    `http://${PRODUCTION_PROJECT_REF}.supabase.co`,
    `https://${PRODUCTION_PROJECT_REF}.supabase.co.attacker.example`,
  ]) {
    const invalidOrigin = validateProductionEnvironment({
      UNIECO_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-test-key',
    });
    assert.deepEqual(invalidOrigin, ['NEXT_PUBLIC_SUPABASE_URL must use the approved HTTPS production project origin']);
  }
});

test('staging command validates before invoking Next.js', async () => {
  const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const stagingRunner = await readFile(new URL('../scripts/run-staging.mjs', import.meta.url), 'utf8');
  assert.match(packageJson, /"dev:staging": "node scripts\/run-staging\.mjs dev"/);
  assert.match(packageJson, /"build:staging": "node scripts\/run-staging\.mjs build"/);
  assert.match(stagingRunner, /NEXT_PUBLIC_\|SUPABASE_\|PAYSTACK_\|FLUTTERWAVE_/);
  assert.match(stagingRunner, /Object\.assign\(environment, stagingValues\)/);
});

test('default environment check rejects Bolt and production instead of treating Bolt as the safe default', () => {
  const checker = fileURLToPath(new URL('../scripts/check-default-environment.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [checker], { encoding: 'utf8', env: process.env });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No implicit \.env is configured|approved staging project/);
  assert.doesNotMatch(result.stdout, /protected Bolt project/);
});

test('Railway production startup rejects staging and legacy Supabase origins before starting Next.js', () => {
  const starter = fileURLToPath(new URL('../scripts/run-railway.mjs', import.meta.url));
  for (const projectRef of [STAGING_PROJECT_REF, 'elxlrojlnusvybnfwxum']) {
    const result = spawnSync(process.execPath, [starter], {
      encoding: 'utf8',
      env: {
        ...process.env,
        UNIECO_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-test-key',
      },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /rejected a Supabase URL outside the approved HTTPS project origin/);
  }
});
