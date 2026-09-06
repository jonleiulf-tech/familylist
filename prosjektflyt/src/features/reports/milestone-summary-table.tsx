'use client';

import { useMemo, useState } from 'react';
import { formatHoursAndMinutes } from '@/lib/time/duration';
import { cn } from '@/lib/utils/cn';
import type { MilestoneSummaryRow } from '@/lib/calculations/milestone-summary';
import { MILESTONE_STATUS_LABELS } from '@/types/enums';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * «-52 d» for en milepæl som ikke er startet ennå er forvirrende. Vi viser
 * bare reell forsinkelse, eller hvor mange dager før plan noe ble ferdig.
 */
function delayLabel(row: MilestoneSummaryRow) {
  const d = row.delayDays;
  if (d == null) return '–';
  if (d > 0) return `${d} d forsinket`;
  if (row.milestone.status === 'completed' && d < 0) return `${Math.abs(d)} d før plan`;
  return '–';
}

function variance(row: MilestoneSummaryRow) {
  const sign = row.plannedVarianceMinutes >= 0 ? '+' : '-';
  const hours = formatHoursAndMinutes(Math.abs(row.plannedVarianceMinutes));
  const percent =
    row.plannedVariancePercent != null
      ? ` (${sign}${Math.abs(row.plannedVariancePercent)} %)`
      : '';
  return `${sign}${hours}${percent}`;
}

export function MilestoneSummaryTable({ rows }: { rows: MilestoneSummaryRow[] }) {
  const [sortByVariance, setSortByVariance] = useState(false);

  const sorted = useMemo(() => {
    if (!sortByVariance) return rows;
    return [...rows].sort((a, b) => Math.abs(b.plannedVarianceMinutes) - Math.abs(a.plannedVarianceMinutes));
  }, [rows, sortByVariance]);

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Ingen milepæler ennå.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" variant="outline" className="w-fit" onClick={() => setSortByVariance((v) => !v)}>
        {sortByVariance ? 'Standard rekkefølge' : 'Sorter etter størst avvik'}
      </Button>

      {/* Mobil: kort i stedet for en tabell som må skrolles sideveis */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {sorted.map((row) => {
          const bigOverrun = row.plannedVariancePercent != null && row.plannedVariancePercent >= 20;
          return (
            <li key={row.milestone.id} className="rounded-md border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{row.milestone.title}</span>
                <Badge variant="outline" className="shrink-0">
                  {MILESTONE_STATUS_LABELS[row.milestone.status]}
                </Badge>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <dt className="text-muted-foreground">Planlagt</dt>
                  <dd>{row.plannedEstimatedMinutes != null ? formatHoursAndMinutes(row.plannedEstimatedMinutes) : '–'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Registrert</dt>
                  <dd>{formatHoursAndMinutes(row.loggedMinutes)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Avvik</dt>
                  <dd className={cn('font-medium', bigOverrun && 'text-destructive')}>{variance(row)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Forsinkelse</dt>
                  <dd className={cn(row.delayDays != null && row.delayDays > 0 && 'text-destructive')}>
                    {delayLabel(row)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">TODO (åpne/totalt)</dt>
                  <dd>
                    {row.openTaskCount}/{row.taskCount}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Milepæl</th>
              <th className="p-2">Status</th>
              <th className="p-2 text-right">Planlagt</th>
              <th className="p-2 text-right">Registrert</th>
              <th className="p-2 text-right">Avvik</th>
              <th className="p-2 text-right">Forsinkelse</th>
              <th className="p-2 text-right">TODO (åpne/totalt)</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const bigOverrun = row.plannedVariancePercent != null && row.plannedVariancePercent >= 20;
              return (
                <tr key={row.milestone.id} className="border-t border-border">
                  <td className="p-2">{row.milestone.title}</td>
                  <td className="whitespace-nowrap p-2 text-muted-foreground">
                    {MILESTONE_STATUS_LABELS[row.milestone.status]}
                  </td>
                  <td className="whitespace-nowrap p-2 text-right">
                    {row.plannedEstimatedMinutes != null ? formatHoursAndMinutes(row.plannedEstimatedMinutes) : '–'}
                  </td>
                  <td className="whitespace-nowrap p-2 text-right">{formatHoursAndMinutes(row.loggedMinutes)}</td>
                  <td className={cn('whitespace-nowrap p-2 text-right font-medium', bigOverrun && 'text-destructive')}>
                    {variance(row)}
                  </td>
                  <td
                    className={cn(
                      'whitespace-nowrap p-2 text-right',
                      row.delayDays != null && row.delayDays > 0 && 'text-destructive',
                    )}
                  >
                    {delayLabel(row)}
                  </td>
                  <td className="whitespace-nowrap p-2 text-right text-muted-foreground">
                    {row.openTaskCount}/{row.taskCount}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
