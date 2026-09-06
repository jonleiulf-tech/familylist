import { cn } from '@/lib/utils/cn';
import type { ProjectHealth } from '@/types/enums';

const STYLES: Record<ProjectHealth, { box: string; dot: string }> = {
  green: { box: 'bg-success/10 text-success border-success/25', dot: 'bg-success' },
  yellow: { box: 'bg-warning/10 text-warning border-warning/25', dot: 'bg-warning' },
  red: { box: 'bg-destructive/10 text-destructive border-destructive/25', dot: 'bg-destructive' },
};

export function HealthBadge({ health, explanation }: { health: ProjectHealth; explanation: string }) {
  const s = STYLES[health];
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm font-medium', s.box)}>
      <span className="relative mt-1.5 flex h-2.5 w-2.5 shrink-0">
        {health !== 'green' && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-50', s.dot)} />}
        <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', s.dot)} />
      </span>
      <span>{explanation}</span>
    </div>
  );
}
