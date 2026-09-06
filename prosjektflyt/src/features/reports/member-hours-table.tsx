import Link from 'next/link';
import { formatHoursAndMinutes } from '@/lib/time/duration';
import { formatDate } from '@/lib/utils/format';
import type { MemberHoursSummary } from '@/lib/calculations/hours';
import type { ProjectMember } from '@/types/database';

export function MemberHoursSummaryTable({ members, summary }: { members: ProjectMember[]; summary: MemberHoursSummary[] }) {
  const total = summary.reduce((sum, s) => sum + s.totalMinutes, 0);

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="p-2">Navn</th>
            <th className="p-2 text-right">Individuelt</th>
            <th className="p-2 text-right">Gruppetid</th>
            <th className="p-2 text-right">Totalt</th>
            <th className="p-2 text-right">Andel</th>
            <th className="p-2 text-right">Siste registrering</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const s = summary.find((x) => x.memberId === member.id);
            const share = total > 0 && s ? Math.round((s.totalMinutes / total) * 100) : 0;
            return (
              <tr key={member.id} className="border-t border-border">
                <td className="p-2">
                  <Link href={`../team/${member.id}`} className="hover:underline">
                    {member.first_name} {member.last_name}
                  </Link>
                </td>
                <td className="p-2 text-right">{formatHoursAndMinutes(s?.individualMinutes ?? 0)}</td>
                <td className="p-2 text-right">{formatHoursAndMinutes(s?.groupMinutes ?? 0)}</td>
                <td className="p-2 text-right font-medium">{formatHoursAndMinutes(s?.totalMinutes ?? 0)}</td>
                <td className="p-2 text-right text-muted-foreground">{share}%</td>
                <td className="p-2 text-right text-muted-foreground">{formatDate(s?.lastEntryDate ?? null)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-medium">
            <td className="p-2">Totalt</td>
            <td className="p-2" />
            <td className="p-2" />
            <td className="p-2 text-right">{formatHoursAndMinutes(total)}</td>
            <td className="p-2" />
            <td className="p-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
