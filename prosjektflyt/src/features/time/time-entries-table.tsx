'use client';

import { Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import { formatHoursAndMinutes } from '@/lib/time/duration';
import type { Milestone, ProjectMember, TimeEntry } from '@/types/database';
import { PARTICIPANT_MODE_LABELS } from '@/types/enums';
import { deleteTimeEntry } from './actions';

export function TimeEntriesTable({
  projectId,
  entries,
  members,
  milestones,
}: {
  projectId: string;
  entries: TimeEntry[];
  members: ProjectMember[];
  milestones: Milestone[];
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="p-2">Dato</th>
            <th className="p-2">Person</th>
            <th className="p-2">Milepæl</th>
            <th className="p-2">Hva</th>
            <th className="p-2">Deltagere</th>
            <th className="p-2 text-right">Varighet</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {entries.slice(0, 50).map((entry) => {
            const member = members.find((m) => m.id === entry.member_id);
            const milestone = milestones.find((m) => m.id === entry.milestone_id);
            return (
              <tr key={entry.id} className="border-t border-border">
                <td className="p-2">{formatDate(entry.work_date)}</td>
                <td className="p-2">{member ? `${member.first_name} ${member.last_name}` : '–'}</td>
                <td className="p-2">{milestone?.title ?? '–'}</td>
                <td className="p-2 text-muted-foreground">{entry.description ?? '–'}</td>
                <td className="p-2 text-muted-foreground">{PARTICIPANT_MODE_LABELS[entry.participant_mode]}</td>
                <td className="p-2 text-right font-medium">{formatHoursAndMinutes(entry.duration_minutes)}</td>
                <td className="p-2 text-right">
                  <button
                    onClick={() => deleteTimeEntry(projectId, entry.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
          {entries.length === 0 && (
            <tr>
              <td colSpan={7} className="p-4 text-center text-muted-foreground">
                Ingen timeregistreringer ennå.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
