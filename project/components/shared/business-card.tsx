'use client';

import Link from 'next/link';
import { MapPin, Phone, MessageCircle, Navigation } from 'lucide-react';
import { RatingStars } from '@/components/shared/rating-stars';
import { VerificationBadge } from '@/components/shared/verification-badge';
import { OpenStatus } from '@/components/shared/open-status';
import { CATEGORY_ICONS } from '@/lib/constants/categories';
import type { VendorWithRelations } from '@/lib/types/extended';

interface BusinessCardProps {
  vendor: VendorWithRelations;
}

export function BusinessCard({ vendor }: BusinessCardProps) {
  const categoryIcon = vendor.business_type
    ? CATEGORY_ICONS[vendor.business_type] || '🏪'
    : '🏪';

  const whatsappUrl = vendor.contact_phone
    ? `https://wa.me/233${vendor.contact_phone.replace(/^0/, '')}`
    : null;
  const callUrl = vendor.contact_phone ? `tel:${vendor.contact_phone}` : null;
  const directionsUrl =
    vendor.location?.latitude != null && vendor.location?.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${vendor.location.latitude},${vendor.location.longitude}`
      : null;

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
      {/* Cover / logo area */}
      <Link href={`/business/${vendor.business_slug}`} className="relative flex h-32 items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10">
        {vendor.logo_url ? (
          <img
            src={vendor.logo_url}
            alt={vendor.business_name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-4xl opacity-80">{categoryIcon}</span>
        )}
        {vendor.is_verified && (
          <div className="absolute right-3 top-3">
            <VerificationBadge
              isVerified={vendor.is_verified}
              isStudentBusiness={vendor.is_student_business}
            />
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        <Link href={`/business/${vendor.business_slug}`}>
          <h3 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors">
            {vendor.business_name}
          </h3>
        </Link>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {vendor.business_type}
        </p>

        {vendor.description && (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {vendor.description}
          </p>
        )}

        <div className="mt-auto space-y-2 pt-3">
          <RatingStars
            rating={vendor.rating_avg || 0}
            count={vendor.rating_count || 0}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {vendor.location?.address_line || vendor.university?.short_name || 'Ghana'}
            </span>
          </div>
          <OpenStatus openingHours={vendor.opening_hours as Record<string, { open: string; close: string }> | null} />
        </div>

        {/* Action buttons */}
        <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-3">
          <Link
            href={`/business/${vendor.business_slug}`}
            className="flex-1 rounded-lg bg-primary/10 px-3 py-1.5 text-center text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            View Profile
          </Link>
          {callUrl && (
            <a
              href={callUrl}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              title="Call"
              onClick={(e) => e.stopPropagation()}
            >
              <Phone className="h-3.5 w-3.5" />
            </a>
          )}
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-success hover:text-success"
              title="WhatsApp"
              onClick={(e) => e.stopPropagation()}
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </a>
          )}
          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
              title="Directions"
              onClick={(e) => e.stopPropagation()}
            >
              <Navigation className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
