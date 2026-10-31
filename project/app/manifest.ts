import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'UniEco Ghana — Connecting Students, Businesses & Opportunities',
    short_name: 'UniEco',
    description:
      'The campus marketplace and community platform for every tertiary institution in Ghana.',
    start_url: '/?source=pwa',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: '#ffffff',
    theme_color: '#10b981',
    orientation: 'portrait-primary',
    scope: '/',
    categories: ['shopping', 'education', 'social'],
    lang: 'en-GH',
    dir: 'ltr',
    icons: [
      { src: '/unieco-main-logo.png', sizes: '1280x1280', type: 'image/png', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'Discover Businesses', url: '/discover?source=pwa_shortcut', description: 'Find campus businesses near you' },
      { name: 'Campus Mate', url: '/campus-mate?source=pwa_shortcut', description: 'Find places and get directions around campus' },
      { name: 'Marketplace', url: '/marketplace?source=pwa_shortcut', description: 'Browse products and services' },
      { name: 'My Orders', url: '/orders?source=pwa_shortcut', description: 'Track your orders' },
      { name: 'Sign in', url: '/signin?source=pwa_shortcut' },
    ],
    screenshots: [],
    prefer_related_applications: false,
  };
}
