import { Badge } from '@/components/ui/badge';
import { ShieldCheck, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VerificationBadgeProps {
  isVerified: boolean;
  isStudentBusiness?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function VerificationBadge({
  isVerified,
  isStudentBusiness,
  size = 'sm',
  className,
}: VerificationBadgeProps) {
  if (!isVerified) return null;

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';

  if (isStudentBusiness) {
    return (
      <Badge
        variant="secondary"
        className={cn('gap-1 bg-primary/10 text-primary hover:bg-primary/15', className)}
      >
        <GraduationCap className={iconSize} />
        Verified Student Business
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className={cn('gap-1 bg-accent/10 text-accent hover:bg-accent/15', className)}
    >
      <ShieldCheck className={iconSize} />
      Verified Business
    </Badge>
  );
}
