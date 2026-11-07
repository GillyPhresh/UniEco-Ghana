import type { Metadata } from 'next';
import { privatePageMetadata } from '@/lib/seo/private-metadata';

export const metadata: Metadata = { ...privatePageMetadata };

export default function ForgotPasswordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
