const julyNotice = 'https://gtec.edu.gh/unaccredited-centres/';
const datedNotice = {
  message: 'GTEC’s July 2026 notice named this institution in its expired-accreditation list. Confirm the current position directly with GTEC before applying.',
  href: julyNotice,
};
const notices: Record<string, { message: string; href: string }> = {
  'holy-spirit-college-of-education': datedNotice,
  'jayee-university-college': datedNotice,
  'nursing-and-midwifery-training-college-cape-coast': datedNotice,
  'university-college-agriculture-environmental-studies': datedNotice,
  'zenith-university-college': datedNotice,
  'bibiani-college-of-health-sciences': {
    message: 'GTEC lists a similarly named college in Bibiani in a separate register. Confirm the exact institution and programme with GTEC before applying.',
    href: 'https://gtec.edu.gh/unaccredited-institutions/',
  },
};

export function getCampusRegulatorNotice(slug: string) {
  return Object.hasOwn(notices, slug) ? notices[slug] : undefined;
}
