import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { getUserProjects } from '@/lib/data/projects';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ComProLogo } from '@/components/brand/logo';
import { formatDate } from '@/lib/utils/format';
import { PROJECT_STATUS_LABELS } from '@/types/enums';
import { signOut } from '@/app/logg-inn/actions';
import { NewProjectDialog } from './new-project-dialog';

export default async function ProsjekterPage() {
  const projects = await getUserProjects();
  const active = projects.filter((p) => p.status !== 'archived');
  const archived = projects.filter((p) => p.status === 'archived');

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <ComProLogo />
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">
            <LogOut className="h-4 w-4" /> Logg ut
          </Button>
        </form>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Prosjekter</h1>
            <p className="text-sm text-muted-foreground">Velg et prosjekt for å åpne arbeidsområdet</p>
          </div>
          <NewProjectDialog />
        </div>

        {active.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
              <p>Du har ingen aktive prosjekter.</p>
              <p className="text-sm">Opprett ditt første prosjekt for å komme i gang – eller be prosjektlederen invitere deg.</p>
            </CardContent>
          </Card>
        ) : (
          <ProjectGrid projects={active} />
        )}

        {archived.length > 0 && (
          <details className="mt-10">
            <summary className="cursor-pointer text-sm text-muted-foreground">Arkiverte prosjekter ({archived.length})</summary>
            <div className="mt-4">
              <ProjectGrid projects={archived} />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function ProjectGrid({ projects }: { projects: Awaited<ReturnType<typeof getUserProjects>> }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <Link key={project.id} href={`/prosjekter/${project.id}/oversikt`}>
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{project.name}</CardTitle>
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
              </div>
              {(project.client_name || project.project_number) && (
                <CardDescription>
                  {[project.project_number, project.client_name].filter(Boolean).join(' · ')}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
              <Badge variant="outline">{PROJECT_STATUS_LABELS[project.status]}</Badge>
              <span>{formatDate(project.planned_end_date)}</span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
