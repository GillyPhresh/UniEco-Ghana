export type Locale = 'en' | 'pcm';

export interface LocaleConfig {
  label: string;
  nativeLabel: string;
  dir: 'ltr';
}

export const locales: Record<Locale, LocaleConfig> = {
  en: { label: 'English', nativeLabel: 'English', dir: 'ltr' },
  pcm: { label: 'Ghanaian Pidgin', nativeLabel: 'Pidgin', dir: 'ltr' },
};

export const defaultLocale: Locale = 'en';

type Dictionary = Record<string, string>;

const en: Dictionary = {
  'nav.platform': 'Platform',
  'nav.features': 'Features',
  'nav.discover': 'Discover',
  'nav.benefits': 'Benefits',
  'nav.faq': 'FAQ',
  'nav.signin': 'Sign in',
  'nav.getStarted': 'Get started',
  'hero.badge': 'Now live at UENR',
  'hero.title': 'Connecting Students, Businesses & Opportunities',
  'hero.subtitle':
    'The campus marketplace built for every tertiary institution in Ghana. Discover local businesses, grow your hustle, and connect with your campus community.',
  'cta.explore': 'Explore the platform',
  'cta.createAccount': 'Create your free account',
};

const pcm: Dictionary = {
  'nav.platform': 'Platform',
  'nav.features': 'Features',
  'nav.discover': 'Discover',
  'nav.benefits': 'Benefits',
  'nav.faq': 'FAQ',
  'nav.signin': 'Enter',
  'nav.getStarted': 'Start now',
  'hero.badge': 'Now dey for UENR',
  'hero.title': 'We dey connect Students, Businesses & Opportunities',
  'hero.subtitle':
    'The campus marketplace wey dem build for every tertiary school for Ghana. Find local businesses, grow your hustle, and connect with your campus people.',
  'cta.explore': 'Check the platform',
  'cta.createAccount': 'Open your free account',
};

const dictionaries: Record<Locale, Dictionary> = { en, pcm };

export function t(key: string, locale: Locale = defaultLocale): string {
  return dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key;
}
