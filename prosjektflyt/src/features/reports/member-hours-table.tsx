import Link from 'next/link';
import { formatHoursAndMinutes } from '@/lib/time/duration';
import { formatDate } from '@/lib/utils/format';
import type { MemberHoursSummary } from '@/lib/calculations/hours';
import type { ProjectMember } from '@/types/database';

export function MemberHoursSummaryTable({
  projectId,
  members,
  summary,
}: {
  projectId: string;
  members: ProjectMember[];
  summary: MemberHoursSummary[];
}) {
  const total = summary.reduce((sum, s) => sum + s.totalMinutes, 0);
  const totalIndividual = summary.reduce((sum, s) => sum + s.individualMinutes, 0);
  const totalGroup = summary.reduce((sum, s) => sum + s.groupMinutes, 0);
  const rows = members.map((member) => {
    const s = summary.find((x) => x.memberId === member.id);
    return {
      member,
      individual: s?.individualMinutes ?? 0,
      group: s?.groupMinutes ?? 0,
      totalMinutes: s?.totalMinutes ?? 0,
      share: total > 0 && s ? Math.round((s.totalMinutes / total) * 100) : 0,
      last: s?.lastEntryDate ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-2">
      {/* Mobil: kort per person */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {rows.map((r) => (
          <li key={r.member.id} className="rounded-md border border-border bg-card p-3">
            <Link
              href={`/prosjekter/${projectId}/team/${r.member.id}`}
              className="flex items-baseline justify-between gap-2"
            >
              <span className="text-sm font-medium">
                {r.member.first_name} {r.member.last_name}
                {!r.member.is_active && <span className="ml-1 text-xs text-muted-foreground">(inaktiv)</span>}
              </span>
              <span className="shrink-0 text-sm font-semibold">{formatHoursAndMinutes(r.totalMinutes)}</span>
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">
              Individuelt {formatHoursAndMinutes(r.individual)} · gruppe {formatHoursAndMinutes(r.group)} · {r.share} %
              av prosjektet
            </p>
            <p className="text-xs text-muted-foreground">Siste registrering: {formatDate(r.last)}</p>
          </li>
        ))}
        <li className="rounded-md border border-border bg-muted/40 p-3 text-sm font-medium">
          Totalt (arbeidsinnsats): {formatHoursAndMinutes(total)}
        </li>
      </ul>

      <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
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
            {rows.map((r) => (
              <tr key={r.member.id} className="border-t border-border">
                <td className="p-2">
                  <Link href={`/prosjekter/${projectId}/team/${r.member.id}`} className="hover:underline">
                    {r.member.first_name} {r.member.last_name}
                  </Link>
                  {!r.member.is_active && <span className="ml-2 text-xs text-muted-foreground">(inaktiv)</span>}
                </td>
                <td className="whitespace-nowrap p-2 text-right">{formatHoursAndMinutes(r.individual)}</td>
                <td className="whitespace-nowrap p-2 text-right">{formatHoursAndMinutes(r.group)}</td>
                <td className="whitespace-nowrap p-2 text-right font-medium">{formatHoursAndMinutes(r.totalMinutes)}</td>
                <td className="p-2 text-right text-muted-foreground">{r.share} %</td>
                <td className="whitespace-nowrap p-2 text-right text-muted-foreground">{formatDate(r.last)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-medium">
              <td className="p-2">Totalt (arbeidsinnsats)</td>
              <td className="whitespace-nowrap p-2 text-right">{formatHoursAndMinutes(totalIndividual)}</td>
              <td className="whitespace-nowrap p-2 text-right">{formatHoursAndMinutes(totalGroup)}</td>
              <td className="whitespace-nowrap p-2 text-right">{formatHoursAndMinutes(total)}</td>
              <td className="p-2" />
              <td className="p-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
