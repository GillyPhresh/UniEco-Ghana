import { resolve } from 'node:path';
import { loadEnvironmentFile, validateBoltEnvironment } from './environment-validation.mjs';

const errors = validateBoltEnvironment(loadEnvironmentFile(resolve(process.cwd(), '.env')));
if (errors.length > 0) {
  console.error(`Default environment check failed: ${errors.join('; ')}`);
  process.exit(1);
}

console.log('Default environment check passed for the protected Bolt project.');
