import { cn } from '@/lib/utils/cn';
import { initials } from '@/lib/utils/format';

export function Avatar({
  firstName,
  lastName,
  className,
}: {
  firstName: string;
  lastName: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary',
        className,
      )}
    >
      {initials(firstName, lastName)}
    </div>
  );
}
