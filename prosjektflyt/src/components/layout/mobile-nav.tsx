'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, GanttChartSquare, ListChecks, CalendarDays, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Bunnmeny for mobil. «Timer» er bevisst ikke her – timeføring har egen
 * flytende knapp (QuickTimeFab) som alltid er tilgjengelig, og Timer-siden
 * ligger under «Mer».
 */
const PRIMARY = [
  { href: 'oversikt', label: 'Oversikt', icon: LayoutDashboard },
  { href: 'fremdrift', label: 'Fremdrift', icon: GanttChartSquare },
  { href: 'oppgaver', label: 'Oppgaver', icon: ListChecks },
  { href: 'kalender', label: 'Kalender', icon: CalendarDays },
] as const;

const MORE = [
  { href: 'timer', label: 'Timer og oppsummering' },
  { href: 'team', label: 'Team' },
  { href: 'rapporter', label: 'Rapporter' },
  { href: 'innstillinger', label: 'Innstillinger' },
] as const;

export function MobileNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/prosjekter/${projectId}`;
  const moreActive = MORE.some((m) => pathname?.startsWith(`${base}/${m.href}`));

  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card/95 shadow-[0_-4px_16px_-8px_hsl(222_24%_12%/0.15)] backdrop-blur md:hidden"
      aria-label="Hovedmeny"
    >
      {PRIMARY.map((item) => {
        const href = `${base}/${item.href}`;
        const isActive = pathname?.startsWith(href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-1 py-2 text-[11px] font-medium',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <span className={cn('rounded-full px-3 py-0.5 transition-colors', isActive && 'bg-accent')}>
              <Icon className="h-5 w-5" />
            </span>
            {item.label}
          </Link>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'flex flex-col items-center gap-1 py-2 text-[11px] font-medium',
            moreActive ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <span className={cn('rounded-full px-3 py-0.5', moreActive && 'bg-accent')}>
            <MoreHorizontal className="h-5 w-5" />
          </span>
          Mer
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="min-w-[12rem]">
          {MORE.map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={`${base}/${item.href}`} className="py-2">
                {item.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
