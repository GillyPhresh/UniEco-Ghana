import { marketPhotography } from '@/lib/marketplace/photography';

const photo = (key: string, slug: string, creator: string) => ({
  image: `/assets/campus-mate/${key}.webp`, source: `https://www.pexels.com/photo/${slug}/`, creator,
});

export const campusMateCategories = [
  { id: 'Food & Drinks', label: 'Food & drinks', query: 'food', photo: marketPhotography.food },
  { id: 'Accommodation', label: 'Hostels', query: 'hostel', photo: photo('hostels', 'women-walking-into-their-hostel-room-with-bunk-beds-and-smiling-4907181', 'Ketut Subiyanto') },
  { id: 'Pharmacy', label: 'Pharmacies', query: 'pharmacy', photo: photo('pharmacy', 'pharmacist-with-medicament-8657301', 'cottonbro studio') },
  { id: 'Transport', label: 'Transport', query: 'transport', photo: photo('transport', 'modern-bus-on-city-street-at-sundown-5036526', 'Thom Gonzalez') },
  { id: 'Banks & ATMs', label: 'Banks & ATMs', query: 'bank', photo: photo('banks', 'modern-atm-machine-in-quiet-bank-lobby-36328523', 'Alec Adriano') },
  { id: 'Supermarkets', label: 'Groceries', query: 'supermarket', photo: marketPhotography.shop },
  { id: 'Printing & Photocopy', label: 'Printing', query: 'printing', photo: marketPhotography.print },
  { id: 'Repairs', label: 'Repairs', query: 'repairs', photo: marketPhotography.tech },
] as const;

const categoryWords = [
  /\b(food|restaurant|cafe|eatery|canteen|bar|drinks|fast food)\b/i,
  /\b(hostel|accommodation|hotel|guest house|dormitory)\b/i,
  /\b(pharmacy|pharmacies|chemist)\b/i,
  /\b(transport|bus|taxi)\b/i,
  /\b(bank|banks|atm|atms)\b/i,
  /\b(supermarket|supermarkets|grocery|groceries|convenience)\b/i,
  /\b(printing|photocopy|stationery|copyshop)\b/i,
  /\b(repair|repairs)\b/i,
] as const;

export function findCampusMateCategory(category: string) {
  const words = category.replaceAll('_', ' ').trim();
  const direct = campusMateCategories.find(item => item.id.toLowerCase() === words.toLowerCase());
  const index = categoryWords.findIndex(pattern => pattern.test(words));
  return direct ?? (index === -1 ? undefined : campusMateCategories[index]);
}

export function secureCampusPhoto(input?: string | null) {
  if (!input) return null;
  if (/^\/assets\/[^%\\\s?#]+\.(webp|png|jpe?g|avif)$/i.test(input) && !input.split('/').includes('..')) return input;
  return campusPlaceWebsite(input);
}

export function campusPlaceWebsite(input?: string | null) {
  if (!input) return null;
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}

export function campusPlaceTelephone(input?: string | null) {
  if (!input || !/^\+?[0-9().\s-]+$/.test(input.trim())) return null;
  const number = input.trim().replace(/[().\s-]/g, '');
  return /^\+?[0-9]{7,15}$/.test(number) ? `tel:${number}` : null;
}
