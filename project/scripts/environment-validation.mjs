import { readFileSync } from 'node:fs';

export const STAGING_PROJECT_REF = 'nyrrhoufgpqpajutatfp';
export const BOLT_PROJECT_REF = 'elxlrojlnusvybnfwxum';
export const PRODUCTION_PROJECT_REF = 'inslzwciwhberfpljmod';

function matchesProjectUrl(value, projectRef) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === `${projectRef}.supabase.co`
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

export function loadEnvironmentFile(filePath) {
  const values = {};
  const content = readFileSync(filePath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    values[key] = rawValue.replace(/^("|')|("|')$/g, '');
  }

  return values;
}

export function validateStagingEnvironment(values) {
  const errors = [];
  const environment = values.UNIECO_ENV;
  const url = values.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = values.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!environment) errors.push('UNIECO_ENV is missing');
  else if (environment !== 'staging') errors.push('UNIECO_ENV must be staging');

  if (!url) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL is missing');
  } else {
    if (!matchesProjectUrl(url, STAGING_PROJECT_REF)) {
      errors.push('NEXT_PUBLIC_SUPABASE_URL must use the approved HTTPS staging project origin');
    }
  }

  if (!publishableKey) errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing');
  return errors;
}

export function validateProductionEnvironment(values) {
  const errors = [];
  const environment = values.UNIECO_ENV;
  const url = values.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = values.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (environment !== 'production') errors.push('UNIECO_ENV must be production');

  if (!url) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL is missing');
  } else {
    if (!matchesProjectUrl(url, PRODUCTION_PROJECT_REF)) {
      errors.push('NEXT_PUBLIC_SUPABASE_URL must use the approved HTTPS production project origin');
    }
  }

  if (!publishableKey) errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing');
  return errors;
}

export function validateBoltEnvironment(values) {
  const url = values.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return ['NEXT_PUBLIC_SUPABASE_URL is missing'];

  try {
    return new URL(url).hostname.split('.')[0] === BOLT_PROJECT_REF
      ? []
      : ['Default .env does not target the protected Bolt project'];
  } catch {
    return ['NEXT_PUBLIC_SUPABASE_URL is invalid'];
  }
}
