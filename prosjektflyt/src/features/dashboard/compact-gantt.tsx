'use client';

import { useRouter } from 'next/navigation';
import { GanttChart } from '@/features/milestones/gantt-chart';
import type { Milestone, ProjectMember } from '@/types/database';

/**
 * Kompakt Gantt på dashboardet. Egen klientkomponent fordi en Server
 * Component ikke kan sende funksjoner (onSelectMilestone) til en
 * klientkomponent – klikk navigerer i stedet til fremdriftssiden.
 */
export function CompactGantt({
  projectId,
  milestones,
  members,
}: {
  projectId: string;
  milestones: Milestone[];
  members: ProjectMember[];
}) {
  const router = useRouter();
  return (
    <GanttChart
      milestones={milestones}
      members={members}
      resolution="week"
      onSelectMilestone={(m) => router.push(`/prosjekter/${projectId}/fremdrift?milestone=${m.id}`)}
    />
  );
}
