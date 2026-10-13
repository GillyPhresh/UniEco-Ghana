'use client';

import Link from 'next/link';
import { Section, SectionHeading, Reveal } from '@/components/landing/section';
import { CATEGORY_ICONS } from '@/lib/constants/categories';
import { ArrowRight } from 'lucide-react';

interface CategorySectionProps {
  categoryCounts: Record<string, number>;
}

const DISPLAY_CATEGORIES = [
  'Food & Drinks',
  'Printing & Photocopy',
  'Fashion',
  'Hair & Beauty',
  'Phone Accessories',
  'Repairs',
  'Transportation',
  'Photography',
  'Tutoring',
  'Technology Services',
  'Accommodation',
  'Student Freelancers',
];

export function CategorySection({ categoryCounts }: CategorySectionProps) {
  const categories = DISPLAY_CATEGORIES.filter((c) => (categoryCounts[c] || 0) > 0);

  if (categories.length === 0) return null;

  return (
    <Section id="categories">
      <SectionHeading
        eyebrow="Categories"
        title="What are you looking for?"
        description="From waakye near Hall 4 to a print shop by the library — find it by category."
      />

      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((category, i) => (
          <Reveal key={category} delay={i * 0.05}>
            <Link
              href={`/discover?category=${encodeURIComponent(category)}`}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-2xl">
                {CATEGORY_ICONS[category] || '🏪'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {category}
                </p>
                <p className="text-xs text-muted-foreground">
                  {categoryCounts[category]} {categoryCounts[category] === 1 ? 'business' : 'businesses'}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
            </Link>
          </Reveal>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Link
          href="/categories"
          className="inline-flex items-center text-sm font-medium text-primary hover:underline"
        >
          View all categories
          <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </div>
    </Section>
  );
}
