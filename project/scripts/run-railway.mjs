import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { BOLT_PROJECT_REF, STAGING_PROJECT_REF } from './environment-validation.mjs';

const environment = process.env.UNIECO_ENV;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!environment || !supabaseUrl || !anonKey) {
  console.error('Deployment startup requires UNIECO_ENV, NEXT_PUBLIC_SUPABASE_URL, and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  process.exit(1);
}

let projectRef;
try {
  projectRef = new URL(supabaseUrl).hostname.split('.')[0];
} catch {
  console.error('Deployment startup rejected an invalid NEXT_PUBLIC_SUPABASE_URL.');
  process.exit(1);
}

if (projectRef === BOLT_PROJECT_REF) {
  console.error('Deployment startup rejected the protected Bolt Supabase project.');
  process.exit(1);
}
if (environment === 'staging' && projectRef !== STAGING_PROJECT_REF) {
  console.error('Staging deployment must use the approved staging Supabase project.');
  process.exit(1);
}
if (environment === 'production' && projectRef === STAGING_PROJECT_REF) {
  console.error('Production deployment must use a dedicated production Supabase project.');
  process.exit(1);
}
if (!['staging', 'production'].includes(environment)) {
  console.error('UNIECO_ENV must be staging or production for a Railway deployment.');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const nextBinary = require.resolve('next/dist/bin/next');
const child = spawn(process.execPath, [nextBinary, 'start'], { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
child.on('error', (error) => { console.error(`Unable to start Next.js: ${error.message}`); process.exit(1); });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
