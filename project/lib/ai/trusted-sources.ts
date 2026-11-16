import { officialPublisherUrl } from './public-source-url';

export function safeOfficialWebsite(value: string | null | undefined): string | null {
  return officialPublisherUrl(value)?.href ?? null;
}
