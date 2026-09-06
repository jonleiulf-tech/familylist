import { notFound } from 'next/navigation';
import { getProject, getCurrentMember } from '@/lib/data/projects';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectSettingsForm } from '@/features/projects/project-settings-form';
import { DeliverablesManager } from '@/features/deliverables/deliverables-manager';
import { DeleteProjectButton } from '@/features/projects/delete-project-button';
import { DEMO_PROJECT_NUMBER } from '@/features/demo/demo-project';

export default async function ProjectSettingsPage({ params }: { params: { projectId: string } }) {
  const [project, currentMember] = await Promise.all([getProject(params.projectId), getCurrentMember(params.projectId)]);
  if (!project) notFound();

  const supabase = createClient();
  const { data: deliverables, error } = await supabase
    .from('deliverables')
    .select('*')
    .eq('project_id', params.projectId)
    .order('sort_order');
  if (error) throw error;

  const isOwner = currentMember?.role === 'owner';
  const isDemo = project.project_number === DEMO_PROJECT_NUMBER;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Prosjektinnstillinger</h1>
      <Card>
        <CardHeader>
          <CardTitle>Grunnleggende informasjon</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectSettingsForm project={project} />
        </CardContent>
      </Card>
      <DeliverablesManager projectId={params.projectId} deliverables={deliverables ?? []} />

      {isOwner && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>{isDemo ? 'Ferdig med å utforske?' : 'Slett prosjekt'}</CardTitle>
            <CardDescription>
              {isDemo
                ? 'Eksempelprosjektet kan slettes når som helst. Du kan opprette det igjen fra prosjektlisten.'
                : 'Sletter prosjektet med alle milepæler, oppgaver, timer og hendelser. Dette kan ikke angres – vurder å arkivere i stedet (Status → Arkivert).'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteProjectButton projectId={project.id} projectName={project.name} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
