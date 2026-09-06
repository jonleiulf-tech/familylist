'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import { formatHoursAndMinutes } from '@/lib/time/duration';
import { FormError } from '@/components/ui/form-error';
import type { Deliverable, Milestone, ProjectMember, TimeEntry } from '@/types/database';
import { PARTICIPANT_MODE_LABELS } from '@/types/enums';
import { deleteTimeEntry } from './actions';

export function TimeEntriesTable({
  projectId,
  entries,
  members,
  milestones,
  deliverables = [],
  participants = {},
}: {
  projectId: string;
  entries: TimeEntry[];
  members: ProjectMember[];
  milestones: Milestone[];
  deliverables?: Deliverable[];
  participants?: Record<string, string[]>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const memberName = (id: string) => {
    const m = members.find((mm) => mm.id === id);
    return m ? `${m.first_name} ${m.last_name}` : '–';
  };

  return (
    <div className="flex flex-col gap-2">
      <FormError message={error} />
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Dato</th>
              <th className="p-2">Person</th>
              <th className="p-2">Milepæl</th>
              <th className="p-2">Hva</th>
              <th className="p-2">Kategori</th>
              <th className="p-2">Deltagere</th>
              <th className="p-2 text-right">Varighet</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody className={pending ? 'opacity-60' : undefined}>
            {entries.slice(0, 100).map((entry) => {
              const milestone = milestones.find((m) => m.id === entry.milestone_id);
              const deliverable = deliverables.find((d) => d.id === entry.deliverable_id);
              const extra = participants[entry.id] ?? [];
              return (
                <tr key={entry.id} className="border-t border-border">
                  <td className="whitespace-nowrap p-2">{formatDate(entry.work_date)}</td>
                  <td className="p-2">{memberName(entry.member_id)}</td>
                  <td className="p-2">{milestone?.title ?? '–'}</td>
                  <td className="p-2 text-muted-foreground">{entry.description ?? '–'}</td>
                  <td className="p-2 text-muted-foreground">{deliverable?.name ?? '–'}</td>
                  <td className="p-2 text-muted-foreground" title={extra.map(memberName).join(', ')}>
                    {entry.participant_mode === 'single'
                      ? PARTICIPANT_MODE_LABELS.single
                      : `${PARTICIPANT_MODE_LABELS[entry.participant_mode]} (${extra.length + 1})`}
                  </td>
                  <td className="whitespace-nowrap p-2 text-right font-medium">{formatHoursAndMinutes(entry.duration_minutes)}</td>
                  <td className="p-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm('Slette denne timeregistreringen?')) return;
                        startTransition(async () => {
                          setError(null);
                          const result = await deleteTimeEntry(projectId, entry.id);
                          if (!result.ok) setError(result.error);
                        });
                      }}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Slett timeregistrering"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-muted-foreground">
                  Ingen timeregistreringer ennå.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {entries.length > 100 && (
        <p className="text-xs text-muted-foreground">Viser de 100 siste av {entries.length} registreringer.</p>
      )}
    </div>
  );
}
