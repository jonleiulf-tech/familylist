import { notFound } from 'next/navigation';
import { getProject, getCurrentMember } from '@/lib/data/projects';
import { createClient } from '@/lib/supabase/server';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { Topbar } from '@/components/layout/topbar';

export default async function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  const project = await getProject(params.projectId);
  if (!project) notFound();

  const supabase = createClient();
  const [{ data: members }, { data: milestones }, currentMember] = await Promise.all([
    supabase.from('project_members').select('*').eq('project_id', params.projectId).order('first_name'),
    supabase.from('milestones').select('*').eq('project_id', params.projectId).order('sort_order'),
    getCurrentMember(params.projectId),
  ]);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-border md:block">
        <div className="p-4 text-lg font-semibold">ProsjektFlyt</div>
        <SidebarNav projectId={params.projectId} />
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar
          project={project}
          members={members ?? []}
          milestones={milestones ?? []}
          currentMemberId={currentMember?.id ?? null}
        />
        <main className="flex-1 bg-muted/20 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
