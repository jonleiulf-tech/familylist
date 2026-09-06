import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject, getCurrentMember } from '@/lib/data/projects';
import { createClient } from '@/lib/supabase/server';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { Topbar } from '@/components/layout/topbar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { ComProMark, ComProWordmark } from '@/components/brand/logo';
import { QuickTimeFab } from '@/features/time/quick-time-fab';

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
  const [{ data: members }, { data: milestones }, { data: deliverables }, currentMember] = await Promise.all([
    supabase.from('project_members').select('*').eq('project_id', params.projectId).eq('is_active', true).order('first_name'),
    supabase.from('milestones').select('*').eq('project_id', params.projectId).order('sort_order'),
    supabase.from('deliverables').select('*').eq('project_id', params.projectId).order('sort_order'),
    getCurrentMember(params.projectId),
  ]);

  const quickTimeProps = {
    projectId: project.id,
    members: members ?? [],
    milestones: milestones ?? [],
    deliverables: deliverables ?? [],
    currentMemberId: currentMember?.id ?? null,
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <Link href="/prosjekter" className="flex h-16 items-center gap-2.5 px-5" aria-label="Til prosjektlisten">
          <ComProMark className="h-8 w-8" />
          <ComProWordmark height={14} tone="light" />
        </Link>
        <div className="mx-5 mb-2 rounded-lg border border-sidebar-border bg-sidebar-active/50 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
            <span className="truncate text-sm font-medium">{project.name}</span>
          </div>
          {project.client_name && <p className="mt-0.5 truncate text-xs text-sidebar-muted">{project.client_name}</p>}
        </div>
        <SidebarNav projectId={params.projectId} />
      </aside>

      {/* min-w-0: uten den kan bredt innhold (Gantt, tabeller) dra hele siden
          bredere enn mobilskjermen i stedet for å skrolle internt. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar project={project} {...quickTimeProps} />
        {/* overflow-x-clip er et sikkerhetsnett mot utilsiktet sidescroll.
            «clip» (ikke «hidden») bevarer position: sticky i topplinjen. */}
        <main className="min-w-0 flex-1 overflow-x-clip p-3 pb-28 sm:p-4 md:p-6 md:pb-6 lg:p-8">{children}</main>
      </div>

      <QuickTimeFab {...quickTimeProps} />
      <MobileNav projectId={params.projectId} />
    </div>
  );
}
