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
] as const;

const SECONDARY = [{ href: 'innstillinger', label: 'Innstillinger', icon: Settings }] as const;

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-sidebar-active text-sidebar-foreground'
          : 'text-sidebar-muted hover:bg-sidebar-active/60 hover:text-sidebar-foreground',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary-foreground/90' : '')} />
      {label}
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
    </Link>
  );
}

export function SidebarNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname?.startsWith(`/prosjekter/${projectId}/${href}`) ?? false;

  return (
    <nav className="flex flex-1 flex-col justify-between p-3">
      <div className="flex flex-col gap-0.5">
        <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted/80">Prosjekt</p>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} href={`/prosjekter/${projectId}/${item.href}`} label={item.label} icon={item.icon} active={isActive(item.href)} />
        ))}
      </div>
      <div className="flex flex-col gap-0.5 border-t border-sidebar-border pt-3">
        {SECONDARY.map((item) => (
          <NavLink key={item.href} href={`/prosjekter/${projectId}/${item.href}`} label={item.label} icon={item.icon} active={isActive(item.href)} />
        ))}
      </div>
    </nav>
  );
}
