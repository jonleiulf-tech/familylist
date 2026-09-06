'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ComProMark } from '@/components/brand/logo';
import type { Milestone, ProjectMember } from '@/types/database';
import type { GanttResolution } from '@/types/enums';
import { GanttChart } from './gantt-chart';

export function GanttFullscreen({
  projectId,
  projectName,
  milestones,
  members,
}: {
  projectId: string;
  projectName: string;
  milestones: Milestone[];
  members: ProjectMember[];
}) {
  const [resolution, setResolution] = useState<GanttResolution>('week');
  const [hideCompleted, setHideCompleted] = useState(false);

  const visible = useMemo(
    () => (hideCompleted ? milestones.filter((m) => m.status !== 'completed') : milestones),
    [milestones, hideCompleted],
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 flex h-12 items-center justify-between gap-2 border-b border-border bg-card/95 px-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link href={`/prosjekter/${projectId}/fremdrift`} aria-label="Tilbake til fremdrift">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <ComProMark className="h-6 w-6" />
          <span className="truncate text-sm font-medium">{projectName}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant={hideCompleted ? 'default' : 'outline'} onClick={() => setHideCompleted((v) => !v)} className="hidden sm:inline-flex">
            Skjul ferdige
          </Button>
          {(['day', 'week', 'month'] as const).map((r) => (
            <Button key={r} size="sm" variant={resolution === r ? 'default' : 'outline'} onClick={() => setResolution(r)} className="px-2.5">
              {r === 'day' ? 'Dag' : r === 'week' ? 'Uke' : 'Mnd'}
            </Button>
          ))}
        </div>
      </header>

      <div className="flex-1 p-2 sm:p-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
          <RotateCcw className="h-3.5 w-3.5" /> Tips: snu telefonen for mer plass til tidslinjen.
        </p>
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Ingen milepæler å vise.
          </p>
        ) : (
          <GanttChart
            milestones={visible}
            members={members}
            resolution={resolution}
            onSelectMilestone={(m) => window.open(`/prosjekter/${projectId}/fremdrift?milestone=${m.id}`, '_self')}
          />
        )}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Legend className="bg-plan" label="Planlagt" />
          <Legend className="bg-actual" label="Faktisk" />
          <Legend className="bg-overdue" label="Utover plan" />
          <Legend className="bg-progress" label="Fullført del" />
          <Legend className="bg-today" label="I dag" />
        </div>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}
