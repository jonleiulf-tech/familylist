'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  GanttChartSquare,
  ListChecks,
  Clock,
  CalendarDays,
  Users,
  BarChart3,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const NAV_ITEMS = [
  { href: 'oversikt', label: 'Oversikt', icon: LayoutDashboard },
  { href: 'fremdrift', label: 'Fremdrift', icon: GanttChartSquare },
  { href: 'oppgaver', label: 'Oppgaver', icon: ListChecks },
  { href: 'timer', label: 'Timer', icon: Clock },
  { href: 'kalender', label: 'Kalender', icon: CalendarDays },
  { href: 'team', label: 'Team', icon: Users },
  { href: 'rapporter', label: 'Rapporter', icon: BarChart3 },
  { href: 'innstillinger', label: 'Innstillinger', icon: Settings },
] as const;

export function SidebarNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-2">
      {NAV_ITEMS.map((item) => {
        const href = `/prosjekter/${projectId}/${item.href}`;
        const isActive = pathname?.startsWith(href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
