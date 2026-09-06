import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';

/**
 * Klikkbart nøkkeltall på dashboardet. Lange verdier («207 t 30 min») får
 * mindre skrift på mobil, ellers brekker de i to linjer i et smalt kort.
 */
export function KpiCard({
  label,
  value,
  tone,
  href,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  tone?: 'destructive' | 'warning' | 'success';
  href: string;
  icon?: LucideIcon;
}) {
  const isLong = typeof value === 'string' && value.length > 8;
  return (
    <Link href={href} className="group h-full">
      <Card className="h-full transition-shadow group-hover:shadow-card-hover">
        <CardContent className="flex h-full flex-col justify-between gap-2 p-3 sm:p-4">
          {Icon && (
            <span
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-md',
                tone === 'destructive' && 'bg-destructive/10 text-destructive',
                tone === 'warning' && 'bg-warning/10 text-warning',
                tone === 'success' && 'bg-success/10 text-success',
                !tone && 'bg-accent text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div>
            <div
              className={cn(
                'font-semibold leading-tight tabular-nums',
                isLong ? 'text-sm sm:text-xl' : 'text-xl sm:text-2xl',
                tone === 'destructive' && 'text-destructive',
              )}
            >
              {value}
            </div>
            <div className="mt-0.5 text-xs leading-tight text-muted-foreground">{label}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
