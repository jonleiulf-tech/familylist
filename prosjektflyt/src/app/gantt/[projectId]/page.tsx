import { notFound } from 'next/navigation';
import { getProject } from '@/lib/data/projects';
import { getProjectWorkspaceData } from '@/lib/data/dashboard';
import { GanttFullscreen } from '@/features/milestones/gantt-fullscreen';

export const metadata = { title: 'Gantt' };

/**
 * Gantt i fullskjerm – egen rute utenfor prosjektlayouten, uten sidemeny
 * og bunnmeny. Åpnes i ny fane fra Fremdrift; på mobil fungerer den best
 * i liggende format.
 */
export default async function GanttFullscreenPage({ params }: { params: { projectId: string } }) {
  const project = await getProject(params.projectId);
  if (!project) notFound();
  const data = await getProjectWorkspaceData(params.projectId);

  return (
    <GanttFullscreen
      projectId={params.projectId}
      projectName={project.name}
      milestones={data.milestones}
      members={data.members.filter((m) => m.is_active)}
    />
  );
}
