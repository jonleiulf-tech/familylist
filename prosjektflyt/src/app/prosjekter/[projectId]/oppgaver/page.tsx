import { getProjectWorkspaceData } from '@/lib/data/dashboard';
import { getCurrentMember } from '@/lib/data/projects';
import { OppgaverClient } from '@/features/tasks/oppgaver-client';

export default async function OppgaverPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { filter?: string };
}) {
  const [data, currentMember] = await Promise.all([
    getProjectWorkspaceData(params.projectId),
    getCurrentMember(params.projectId),
  ]);

  return (
    <OppgaverClient
      projectId={params.projectId}
      tasks={data.tasks}
      members={data.members}
      milestones={data.milestones}
      currentMemberId={currentMember?.id ?? null}
      initialFilter={searchParams.filter}
    />
  );
}
