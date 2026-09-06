import { getProjectWorkspaceData } from '@/lib/data/dashboard';
import { FremdriftClient } from '@/features/milestones/fremdrift-client';

export default async function FremdriftPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { filter?: string };
}) {
  const data = await getProjectWorkspaceData(params.projectId);

  return (
    <FremdriftClient
      projectId={params.projectId}
      milestones={data.milestones}
      members={data.members}
      tasks={data.tasks}
      timeEntries={data.timeEntries}
      calendarEvents={data.upcomingEvents}
      activityLog={data.activityLog}
      initialFilter={searchParams.filter}
    />
  );
}
