export const siteConfig = {
  name: 'UniEco Ghana',
  shortName: 'UniEco',
  tagline: 'Connecting Students, Businesses & Opportunities.',
  description:
    'UniEco Ghana is the campus commerce and community platform connecting students, businesses, and opportunities across every tertiary institution in Ghana.',
  url: 'https://unieco.gh',
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
  { label: 'Universities', href: '/#universities' },
  { label: 'Benefits', href: '/#student-benefits' },
  { label: 'FAQ', href: '/#faq' },
] as const;

export const footerLinks = {
  Discover: [
    { label: 'Marketplace', href: '/marketplace' },
    { label: 'Browse Businesses', href: '/discover' },
    { label: 'Categories', href: '/categories' },
    { label: 'Events', href: '/events' },
    { label: 'Universities', href: '/#universities' },
  ],
  Community: [
    { label: 'For Students', href: '/#student-benefits' },
    { label: 'For Vendors', href: '/#vendor-benefits' },
    { label: 'For Universities', href: '/#university-benefits' },
  ],
  Account: [
    { label: 'Sign In', href: '/signin' },
    { label: 'Create Account', href: '/signup' },
    { label: 'Profile', href: '/profile' },
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'My Orders', href: '/orders' },
    { label: 'Wishlist', href: '/wishlist' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms of Service', href: '#' },
    { label: 'Code of Conduct', href: '#' },
  ],
} as const;
