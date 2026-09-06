'use client';

import Link from 'next/link';
import { ChevronLeft, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Milestone, Project, ProjectMember } from '@/types/database';
import { QuickTaskDialog } from '@/features/tasks/quick-task-dialog';
import { QuickTimeDialog } from '@/features/time/quick-time-dialog';
import { signOut } from '@/app/logg-inn/actions';

interface Props {
  project: Project;
  members: ProjectMember[];
  milestones: Milestone[];
  currentMemberId: string | null;
}

export function Topbar({ project, members, milestones, currentMemberId }: Props) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <Link href="/prosjekter" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
        <span className="font-medium">{project.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <QuickTimeDialog
          projectId={project.id}
          members={members}
          milestones={milestones}
          currentMemberId={currentMemberId}
        />
        <QuickTaskDialog projectId={project.id} members={members} milestones={milestones} />
        <form action={signOut}>
          <Button variant="ghost" size="icon" type="submit" title="Logg ut">
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}
