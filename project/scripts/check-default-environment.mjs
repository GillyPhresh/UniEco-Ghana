import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvironmentFile, validateStagingEnvironment } from './environment-validation.mjs';

const defaultEnvironment = resolve(process.cwd(), '.env');
if (!existsSync(defaultEnvironment)) {
  console.log('No implicit .env is configured. Use the explicit staging wrapper for local development.');
  process.exit(0);
}

const values = loadEnvironmentFile(defaultEnvironment);
if (values.UNIECO_ENV !== 'staging') {
  console.error('Default .env must not target production or the protected legacy project; use .env.staging.local with the staging wrapper.');
  process.exit(1);
}

const errors = validateStagingEnvironment(values);
if (errors.length > 0) {
  console.error(`Default environment check failed: ${errors.join('; ')}`);
  process.exit(1);
}

console.log('Default environment check passed for the approved staging project.');
