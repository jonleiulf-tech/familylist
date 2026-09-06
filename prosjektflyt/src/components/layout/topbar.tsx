'use client';

import Link from 'next/link';
import { ChevronLeft, LogOut, Plus, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Deliverable, Milestone, Project, ProjectMember } from '@/types/database';
import { QuickTaskDialog } from '@/features/tasks/quick-task-dialog';
import { QuickTimeDialog } from '@/features/time/quick-time-dialog';
import { signOut } from '@/app/logg-inn/actions';
import { ComProMark } from '@/components/brand/logo';

interface Props {
  project: Project;
  members: ProjectMember[];
  milestones: Milestone[];
  deliverables: Deliverable[];
  currentMemberId: string | null;
}

export function Topbar({ project, members, milestones, deliverables, currentMemberId }: Props) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/95 px-3 backdrop-blur md:px-4">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <Link href="/prosjekter" className="text-muted-foreground hover:text-foreground" aria-label="Til prosjektlisten">
          <ChevronLeft className="hidden h-5 w-5 md:block" />
          <ComProMark className="h-7 w-7 md:hidden" />
        </Link>
        <span className="hidden h-2.5 w-2.5 shrink-0 rounded-full md:block" style={{ backgroundColor: project.color }} />
        <span className="truncate font-medium">{project.name}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
        <QuickTimeDialog
          projectId={project.id}
          members={members}
          milestones={milestones}
          deliverables={deliverables}
          currentMemberId={currentMemberId}
          trigger={
            <Button variant="secondary" size="sm" className="md:h-9 md:px-4 md:text-sm">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Registrer tid</span>
            </Button>
          }
        />
        <QuickTaskDialog
          projectId={project.id}
          members={members}
          milestones={milestones}
          trigger={
            <Button size="sm" className="md:h-9 md:px-4 md:text-sm">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Oppgave</span>
            </Button>
          }
        />
        <form action={signOut}>
          <Button variant="ghost" size="icon" type="submit" title="Logg ut" aria-label="Logg ut">
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}
