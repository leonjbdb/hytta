import * as React from 'react';
import { cn } from '@/lib/utils';

export const Badge = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs font-medium',
      className,
    )}
    {...props}
  />
);
