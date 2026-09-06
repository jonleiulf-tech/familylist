import { notFound } from 'next/navigation';
import { getProject } from '@/lib/data/projects';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectSettingsForm } from '@/features/projects/project-settings-form';
import { DeliverablesManager } from '@/features/deliverables/deliverables-manager';

export default async function ProjectSettingsPage({ params }: { params: { projectId: string } }) {
  const project = await getProject(params.projectId);
  if (!project) notFound();

  const supabase = createClient();
  const { data: deliverables, error } = await supabase
    .from('deliverables')
    .select('*')
    .eq('project_id', params.projectId)
    .order('sort_order');
  if (error) throw error;

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
    </div>
  );
}
