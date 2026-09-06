import Link from 'next/link';
import { getUserProjects } from '@/lib/data/projects';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/format';
import { PROJECT_STATUS_LABELS } from '@/types/enums';
import { NewProjectDialog } from './new-project-dialog';

export default async function ProsjekterPage() {
  const projects = await getUserProjects();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Prosjekter</h1>
          <p className="text-sm text-muted-foreground">Velg et prosjekt for å åpne arbeidsområdet</p>
        </div>
        <NewProjectDialog />
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <p>Du har ingen prosjekter ennå.</p>
            <p className="text-sm">Opprett ditt første prosjekt for å komme i gang.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/prosjekter/${project.id}/oversikt`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    <span
                      className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                  </div>
                  {project.client_name && <CardDescription>{project.client_name}</CardDescription>}
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                  <Badge variant="outline">{PROJECT_STATUS_LABELS[project.status]}</Badge>
                  <span>{formatDate(project.planned_end_date)}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
