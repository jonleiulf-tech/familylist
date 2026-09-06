import Link from 'next/link';
import { LogOut, Plus, Compass } from 'lucide-react';
import { getUserProjects } from '@/lib/data/projects';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ComProLogo } from '@/components/brand/logo';
import { formatDate } from '@/lib/utils/format';
import { PROJECT_STATUS_LABELS } from '@/types/enums';
import { signOut } from '@/app/logg-inn/actions';
import { DemoProjectButton } from '@/features/demo/demo-project-button';
import { DEMO_PROJECT_NUMBER } from '@/features/demo/demo-project';
import { NewProjectDialog } from './new-project-dialog';

export default async function ProsjekterPage() {
  const projects = await getUserProjects();
  const active = projects.filter((p) => p.status !== 'archived');
  const archived = projects.filter((p) => p.status === 'archived');
  const hasDemo = projects.some((p) => p.project_number === DEMO_PROJECT_NUMBER);

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
        {active.length === 0 ? (
          <div className="mx-auto max-w-3xl">
            <h1 className="text-2xl font-semibold">Velkommen til ComPro</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Hva vi skulle gjøre, hva vi faktisk har gjort, hvem som gjør hva, hvor mye tid vi bruker, hva som er
              forsinket – og hva som skjer videre. Hvordan vil du starte?
            </p>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card className="flex flex-col">
                <CardHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Plus className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">Opprett nytt prosjekt</CardTitle>
                  <CardDescription>
                    Start med blanke ark. Legg til team, milepæler og oppgaver etter hvert – du trenger bare et navn for
                    å komme i gang.
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <NewProjectDialog />
                </CardContent>
              </Card>
              <Card className="flex flex-col border-primary/30 bg-primary/5">
                <CardHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Compass className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">Utforsk eksempelprosjektet</CardTitle>
                  <CardDescription>
                    «Nytt kontor i Skien» med Ola og Kari Nordmann: 9 milepæler i ulike faser, 20 oppgaver, timer,
                    møter og rapporter – ferdig utfylt så du ser hvordan alt henger sammen. Kan slettes når som helst.
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <DemoProjectButton variant="default" />
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">Prosjekter</h1>
                <p className="text-sm text-muted-foreground">Velg et prosjekt for å åpne arbeidsområdet</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!hasDemo && <DemoProjectButton variant="outline" label="Legg til eksempelprosjekt" />}
                <NewProjectDialog />
              </div>
            </div>
            <ProjectGrid projects={active} />
          </>
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
      {projects.map((project) => {
        const isDemo = project.project_number === DEMO_PROJECT_NUMBER;
        return (
          <Link key={project.id} href={`/prosjekter/${project.id}/oversikt`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{project.name}</CardTitle>
                  <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                </div>
                {(project.client_name || project.project_number) && (
                  <CardDescription>
                    {[isDemo ? null : project.project_number, project.client_name].filter(Boolean).join(' · ')}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex gap-2">
                  <Badge variant="outline">{PROJECT_STATUS_LABELS[project.status]}</Badge>
                  {isDemo && <Badge variant="secondary">Eksempel</Badge>}
                </div>
                <span>{formatDate(project.planned_end_date)}</span>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
