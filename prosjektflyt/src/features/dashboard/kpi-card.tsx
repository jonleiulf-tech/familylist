import Link from 'next/link';
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
}: {
  label: string;
  value: number | string;
  tone?: 'destructive';
  href: string;
}) {
  const isLong = typeof value === 'string' && value.length > 8;
  return (
    <Link href={href} className="h-full">
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="flex h-full flex-col justify-center p-3 sm:p-4">
          <div
            className={cn(
              'font-semibold leading-tight',
              isLong ? 'text-sm sm:text-xl' : 'text-lg sm:text-2xl',
              tone === 'destructive' && 'text-destructive',
            )}
          >
            {value}
          </div>
          <div className="mt-0.5 text-xs leading-tight text-muted-foreground">{label}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
