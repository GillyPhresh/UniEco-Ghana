import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { BOLT_PROJECT_REF, PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF } from './environment-validation.mjs';
import { scheduleCampusResearch } from './run-campus-research-schedule.mjs';
import { verifyCampusMatePilot } from './campus-mate-pilot-smoke.mjs';

const environment = process.env.UNIECO_ENV;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!environment || !supabaseUrl || !anonKey) {
  console.error('Deployment startup requires UNIECO_ENV, NEXT_PUBLIC_SUPABASE_URL, and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  process.exit(1);
}

let parsedSupabaseUrl;
try {
  parsedSupabaseUrl = new URL(supabaseUrl);
} catch {
  console.error('Deployment startup rejected an invalid NEXT_PUBLIC_SUPABASE_URL.');
  process.exit(1);
}

const expectedProjectRef = environment === 'staging' ? STAGING_PROJECT_REF : PRODUCTION_PROJECT_REF;
if (parsedSupabaseUrl.protocol !== 'https:' || parsedSupabaseUrl.hostname !== `${expectedProjectRef}.supabase.co` || parsedSupabaseUrl.username || parsedSupabaseUrl.password) {
  console.error('Deployment startup rejected a Supabase URL outside the approved HTTPS project origin.');
  process.exit(1);
}

const projectRef = parsedSupabaseUrl.hostname.split('.')[0];
if (projectRef === BOLT_PROJECT_REF) {
  console.error('Deployment startup rejected the protected Bolt Supabase project.');
  process.exit(1);
}
if (environment === 'staging' && projectRef !== STAGING_PROJECT_REF) {
  console.error('Staging deployment must use the approved staging Supabase project.');
  process.exit(1);
}
if (environment === 'production' && projectRef !== PRODUCTION_PROJECT_REF) {
  console.error('Production deployment must use the approved dedicated production Supabase project.');
  process.exit(1);
}
if (!['staging', 'production'].includes(environment)) {
  console.error('UNIECO_ENV must be staging or production for a Railway deployment.');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const nextBinary = require.resolve('next/dist/bin/next');
const port = Number(process.env.PORT || '3000');
const canRunResearch = environment === 'production' && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  && process.env.UNIECO_DISABLE_CAMPUS_RESEARCH !== 'true' && Number.isInteger(port) && port > 0 && port <= 65535;
// A per-process loopback credential, not a provider key or deploy secret.
const researchNonce = canRunResearch ? randomBytes(32).toString('hex') : '';
const child = spawn(process.execPath, [nextBinary, 'start'], {
  cwd: process.cwd(), env: { ...process.env, UNIECO_RESEARCH_SCHEDULER_NONCE: researchNonce }, stdio: 'inherit',
});
void verifyCampusMatePilot().catch(() => console.warn('[campus-mate] private pilot smoke could not run'));
const stopResearch = researchNonce ? scheduleCampusResearch(port, researchNonce) : () => undefined;
child.on('error', (error) => { console.error(`Unable to start Next.js: ${error.message}`); process.exit(1); });
child.on('exit', (code, signal) => { stopResearch(); process.exit(code ?? (signal ? 1 : 0)); });
