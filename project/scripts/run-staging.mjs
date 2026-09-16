import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { loadEnvironmentFile, STAGING_PROJECT_REF, validateStagingEnvironment } from './environment-validation.mjs';

const action = process.argv[2];
const allowedActions = new Set(['check', 'dev', 'build', 'start']);
const environmentFile = resolve(process.cwd(), '.env.staging.local');

if (!allowedActions.has(action)) {
  console.error('Usage: node scripts/run-staging.mjs <check|dev|build|start>');
  process.exit(1);
}

if (!existsSync(environmentFile)) {
  console.error('Staging environment validation failed: .env.staging.local is missing');
  process.exit(1);
}

const stagingValues = loadEnvironmentFile(environmentFile);
const validationErrors = validateStagingEnvironment(stagingValues);
if (validationErrors.length > 0) {
  console.error(`Staging environment validation failed: ${validationErrors.join('; ')}`);
  process.exit(1);
}

if (action === 'check') {
  console.log(`Staging environment validation passed for project ${STAGING_PROJECT_REF}.`);
  process.exit(0);
}

const environment = { ...process.env };
for (const key of [
  'UNIECO_ENV',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_URL',
]) delete environment[key];
Object.assign(environment, stagingValues);

let nextBinary;
try {
  const require = createRequire(import.meta.url);
  nextBinary = require.resolve('next/dist/bin/next');
} catch {
  console.error('Staging startup requires installed dependencies. Run npm.cmd ci before using this command.');
  process.exit(1);
}

const child = spawn(process.execPath, [nextBinary, action], {
  cwd: process.cwd(),
  env: environment,
  stdio: 'inherit',
});
child.on('error', (error) => {
  console.error(`Unable to start Next.js for staging: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
