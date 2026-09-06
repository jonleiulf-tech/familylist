'use client';

import { Clock } from 'lucide-react';
import type { Deliverable, Milestone, ProjectMember } from '@/types/database';
import { QuickTimeDialog } from './quick-time-dialog';

/**
 * Flytende «Registrer tid»-knapp på mobil. Timeføring er den vanligste
 * handlingen i felt, så den skal være ett trykk unna fra hvilken som helst
 * side – uten å lete i menyer.
 */
export function QuickTimeFab(props: {
  projectId: string;
  members: ProjectMember[];
  milestones: Milestone[];
  deliverables: Deliverable[];
  currentMemberId: string | null;
}) {
  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 md:hidden">
      <QuickTimeDialog
        {...props}
        trigger={
          <button
            type="button"
            className="flex h-14 items-center gap-2 rounded-full bg-primary pl-4 pr-5 text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_-6px_hsl(var(--primary)/0.6)] transition-transform active:scale-95"
            aria-label="Registrer tid"
          >
            <Clock className="h-5 w-5" />
            Registrer tid
          </button>
        }
      />
    </div>
  );
}
