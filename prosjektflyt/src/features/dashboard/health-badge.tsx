import { cn } from '@/lib/utils/cn';
import type { ProjectHealth } from '@/types/enums';

const STYLES: Record<ProjectHealth, string> = {
  green: 'bg-success/15 text-success border-success/30',
  yellow: 'bg-warning/15 text-warning border-warning/30',
  red: 'bg-destructive/15 text-destructive border-destructive/30',
};

export function HealthBadge({ health, explanation }: { health: ProjectHealth; explanation: string }) {
  return (
    <div className={cn('rounded-md border px-3 py-2 text-sm font-medium', STYLES[health])}>{explanation}</div>
  );
}
