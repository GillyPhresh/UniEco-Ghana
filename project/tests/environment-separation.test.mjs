import assert from 'node:assert/strict';
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
  assert.deepEqual(wrongProject, ['NEXT_PUBLIC_SUPABASE_URL does not target the approved staging project']);
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
    assert.deepEqual(invalid, ['NEXT_PUBLIC_SUPABASE_URL does not target the approved production project']);
  }
});

test('staging command validates before invoking Next.js', async () => {
  const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  assert.match(packageJson, /"dev:staging": "node scripts\/run-staging\.mjs dev"/);
  assert.match(packageJson, /"build:staging": "node scripts\/run-staging\.mjs build"/);
});
