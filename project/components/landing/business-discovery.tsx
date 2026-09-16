'use client';

import { motion } from 'framer-motion';
import { Search, Filter, MapPin, Star } from 'lucide-react';
import { Section, Reveal, SectionHeading } from '@/components/landing/section';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const categories = [
  'Food &amp; Drinks',
  'Fashion',
  'Electronics',
  'Printing',
  'Services',
  'Books',
];

const discoveryImages = [
  'https://images.pexels.com/photos/35255487/pexels-photo-35255487.jpeg?auto=compress&cs=tinysrgb&w=400',
  'https://images.pexels.com/photos/37323272/pexels-photo-37323272.jpeg?auto=compress&cs=tinysrgb&w=400',
  'https://images.pexels.com/photos/33640838/pexels-photo-33640838.jpeg?auto=compress&cs=tinysrgb&w=400',
];

export function BusinessDiscovery() {
  return (
    <Section id="business-discovery">
      <SectionHeading
        eyebrow="Business Discovery"
        title="Find what you need, right on your campus"
        description="Search and filter through verified student and local businesses. From the quick snack between lectures to the printing service for your project — discover it all in seconds."
      />

      <div className="mt-14 grid gap-10 lg:grid-cols-2 lg:items-center">
        {/* Search mockup */}
        <Reveal>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search businesses, products, services..."
                  className="pl-9"
                  aria-label="Search businesses"
                />
              </div>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent"
                aria-label="Filter results"
              >
                <Filter className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {categories.map((cat) => (
                <Badge key={cat} variant="secondary" className="cursor-default">
                  <span dangerouslySetInnerHTML={{ __html: cat }} />
                </Badge>
              ))}
            </div>

            <div className="mt-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-4 rounded-xl border border-border p-3 transition-colors hover:border-primary/40"
                >
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      Campus Snack Hub{i === 1 ? ' 2' : i === 2 ? ' Prints' : ''}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> UENR, Sunyani
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-sm font-medium text-secondary">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    4.{8 - i}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Image collage */}
        <Reveal delay={0.15}>
          <div className="grid grid-cols-2 gap-4">
            {discoveryImages.map((src, i) => (
              <motion.div
                key={src}
                whileHover={{ scale: 1.03 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className={`overflow-hidden rounded-2xl border border-border shadow-md ${
                  i === 0 ? 'col-span-2 aspect-[16/10]' : 'aspect-[3/4]'
                }`}
              >
                <img
                  src={src}
                  alt="Local campus vendor"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </motion.div>
            ))}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
