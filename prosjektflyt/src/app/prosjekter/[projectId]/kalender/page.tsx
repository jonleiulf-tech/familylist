import { getProjectWorkspaceData } from '@/lib/data/dashboard';
import { CalendarClient } from '@/features/calendar/calendar-client';

export default async function KalenderPage({ params }: { params: { projectId: string } }) {
  const data = await getProjectWorkspaceData(params.projectId);

  return (
    <CalendarClient
      projectId={params.projectId}
      events={data.upcomingEvents}
      members={data.members}
      milestones={data.milestones}
      tasks={data.tasks}
    />
  );
}
