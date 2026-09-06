'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, GanttChartSquare, ListChecks, Clock, CalendarDays, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const PRIMARY = [
  { href: 'oversikt', label: 'Oversikt', icon: LayoutDashboard },
  { href: 'fremdrift', label: 'Fremdrift', icon: GanttChartSquare },
  { href: 'oppgaver', label: 'Oppgaver', icon: ListChecks },
  { href: 'timer', label: 'Timer', icon: Clock },
  { href: 'kalender', label: 'Kalender', icon: CalendarDays },
] as const;

const MORE = [
  { href: 'team', label: 'Team' },
  { href: 'rapporter', label: 'Rapporter' },
  { href: 'innstillinger', label: 'Innstillinger' },
] as const;

/**
 * Bunnmeny for mobil (sidemenyen er skjult under md-breakpoint).
 * De fem viktigste mobilflatene får egne knapper; resten ligger under «Mer».
 */
export function MobileNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/prosjekter/${projectId}`;
  const moreActive = MORE.some((m) => pathname?.startsWith(`${base}/${m.href}`));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-border bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
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
              'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
            moreActive ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          Mer
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          {MORE.map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={`${base}/${item.href}`}>{item.label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
