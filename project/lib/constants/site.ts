export const siteConfig = {
  name: 'UniEco Ghana',
  shortName: 'UniEco',
  tagline: 'Your Campus. Your Marketplace. Your Community.',
  description:
    'UniEco Ghana is a campus marketplace and community platform built for Ghanaian tertiary communities. Discover campus businesses, student services, events, and opportunities.',
  url: (process.env.UNIECO_PUBLIC_APP_URL?.replace(/\/+$/, '') || 'https://www.uniecoghana.com').replace(
    /^https:\/\/uniecoghana\.com$/,
    'https://www.uniecoghana.com',
  ),
  locale: 'en_GH',
  keywords: [
    'UniEco Ghana',
    'campus marketplace Ghana',
    'university students Ghana',
    'student businesses Ghana',
    'UENR marketplace',
    'campus commerce',
    'tertiary Ghana',
    'student vendors Ghana',
    'discover businesses Ghana',
    'campus events Ghana',
  ],
  links: {
    twitter: 'https://twitter.com/uniecoghana',
    facebook: 'https://facebook.com/uniecoghana',
    instagram: 'https://instagram.com/uniecoghana',
  },
};

export const navLinks = [
  { label: 'Marketplace', href: '/marketplace' },
  { label: 'Discover', href: '/discover' },
  { label: 'Categories', href: '/categories' },
  { label: 'Events', href: '/events' },
  { label: 'Universities', href: '/universities' },
  { label: 'For students', href: '/for-students' },
] as const;

export const footerLinks = {
  Discover: [
    { label: 'Marketplace', href: '/marketplace' },
    { label: 'Browse Businesses', href: '/discover' },
    { label: 'Categories', href: '/categories' },
    { label: 'Events', href: '/events' },
    { label: 'Universities', href: '/universities' },
  ],
  Community: [
    { label: 'For Students', href: '/for-students' },
    { label: 'For Vendors', href: '/for-vendors' },
    { label: 'For Universities', href: '/for-universities' },
    { label: 'University network', href: '/for-universities' },
    { label: 'University Administrator opportunity', href: '/university-admin/apply' },
  ],
  Account: [
    { label: 'Sign in', href: '/signin' },
    { label: 'Create an account', href: '/signup' },
    { label: 'Profile', href: '/profile' },
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'My orders', href: '/orders' },
    { label: 'Wishlist', href: '/wishlist' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy-policy' },
    { label: 'Terms of Service', href: '/terms-of-service' },
    { label: 'Code of Conduct', href: '/code-of-conduct' },
    { label: 'Campus image credits', href: '/campus-image-credits' },
  ],
} as const;
