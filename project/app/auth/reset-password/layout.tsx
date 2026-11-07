import type { Metadata } from 'next';
import { privatePageMetadata } from '@/lib/seo/private-metadata';

export const metadata: Metadata = {
  title: 'Reset password | UniEco Ghana',
  ...privatePageMetadata,
};

export default function ResetPasswordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
