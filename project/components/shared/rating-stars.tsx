import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RatingStarsProps {
  rating: number;
  size?: number;
  showValue?: boolean;
  count?: number;
  className?: string;
}

export function RatingStars({
  rating,
  size = 16,
  showValue = true,
  count,
  className,
}: RatingStarsProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            style={{ width: size, height: size }}
            className={
              star <= Math.round(rating)
                ? 'fill-secondary text-secondary'
                : 'fill-muted text-muted-foreground'
            }
          />
        ))}
      </div>
      {showValue && (
        <span className="text-sm font-medium text-foreground">
          {rating.toFixed(1)}
        </span>
      )}
      {count !== undefined && (
        <span className="text-xs text-muted-foreground">
          ({count})
        </span>
      )}
    </div>
  );
}
