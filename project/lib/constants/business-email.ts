export const businessEmail = {
  support: 'support@uniecoghana.com',
  general: 'info@uniecoghana.com',
  managingDirector: 'director@uniecoghana.com',
  marketingDirector: 'marketing@uniecoghana.com',
  authentication: 'auth@uniecoghana.com',
  notifications: 'notifications@uniecoghana.com',
  noReply: 'noreply@uniecoghana.com',
} as const;

export const publicBusinessContacts = [
  { role: 'Customer support', email: businessEmail.support, purpose: 'Account, payment, order, and safety help' },
  { role: 'General enquiries', email: businessEmail.general, purpose: 'General and official enquiries' },
  { role: 'Managing Director', email: businessEmail.managingDirector, purpose: 'Executive and partnership matters' },
  { role: 'Marketing Director', email: businessEmail.marketingDirector, purpose: 'Marketing, media, and collaboration' },
] as const;
