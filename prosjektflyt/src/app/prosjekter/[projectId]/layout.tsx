import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject, getCurrentMember } from '@/lib/data/projects';
import { createClient } from '@/lib/supabase/server';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { Topbar } from '@/components/layout/topbar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { ComProLogo } from '@/components/brand/logo';

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

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-border md:block">
        <Link href="/prosjekter" className="flex h-14 items-center px-4" aria-label="Til prosjektlisten">
          <ComProLogo />
        </Link>
        <SidebarNav projectId={params.projectId} />
      </aside>
      {/* min-w-0: uten den kan bredt innhold (Gantt, tabeller) dra hele siden
          bredere enn mobilskjermen i stedet for å skrolle internt. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar
          project={project}
          members={members ?? []}
          milestones={milestones ?? []}
          deliverables={deliverables ?? []}
          currentMemberId={currentMember?.id ?? null}
        />
        {/* overflow-x-clip er et sikkerhetsnett mot utilsiktet sidescroll.
            «clip» (ikke «hidden») bevarer position: sticky i topplinjen. */}
        <main className="min-w-0 flex-1 overflow-x-clip bg-muted/20 p-3 pb-24 sm:p-4 md:p-6 md:pb-6">{children}</main>
      </div>
      <MobileNav projectId={params.projectId} />
    </div>
  );
}
