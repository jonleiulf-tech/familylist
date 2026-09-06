import { getProjectWorkspaceData } from '@/lib/data/dashboard';
import { getCurrentMember } from '@/lib/data/projects';
import { FremdriftClient } from '@/features/milestones/fremdrift-client';

export default async function FremdriftPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { filter?: string; milestone?: string };
}) {
  const [data, currentMember] = await Promise.all([
    getProjectWorkspaceData(params.projectId),
    getCurrentMember(params.projectId),
  ]);

  return (
    <FremdriftClient
      projectId={params.projectId}
      milestones={data.milestones}
      members={data.members.filter((m) => m.is_active)}
      tasks={data.tasks}
      timeEntries={data.timeEntries}
      calendarEvents={data.upcomingEvents}
      activityLog={data.activityLog}
      initialFilter={searchParams.filter}
      initialMilestoneId={searchParams.milestone}
      currentMemberId={currentMember?.id ?? null}
    />
  );
}
