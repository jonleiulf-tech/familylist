'use client';

import { useMemo, useState } from 'react';
import { formatHoursAndMinutes } from '@/lib/time/duration';
import { cn } from '@/lib/utils/cn';
import type { MilestoneSummaryRow } from '@/lib/calculations/milestone-summary';
import { MILESTONE_STATUS_LABELS } from '@/types/enums';
import { Button } from '@/components/ui/button';

export function MilestoneSummaryTable({ rows }: { rows: MilestoneSummaryRow[] }) {
  const [sortByVariance, setSortByVariance] = useState(false);

  const sorted = useMemo(() => {
    if (!sortByVariance) return rows;
    return [...rows].sort((a, b) => Math.abs(b.plannedVarianceMinutes) - Math.abs(a.plannedVarianceMinutes));
  }, [rows, sortByVariance]);

  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" variant="outline" className="w-fit" onClick={() => setSortByVariance((v) => !v)}>
        {sortByVariance ? 'Standard rekkefølge' : 'Sorter etter størst avvik'}
      </Button>
      <div className="overflow-x-auto rounded-md border border-border">
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
                  <td className="p-2 text-muted-foreground">{MILESTONE_STATUS_LABELS[row.milestone.status]}</td>
                  <td className="p-2 text-right">
                    {row.plannedEstimatedMinutes != null ? formatHoursAndMinutes(row.plannedEstimatedMinutes) : '–'}
                  </td>
                  <td className="p-2 text-right">{formatHoursAndMinutes(row.loggedMinutes)}</td>
                  <td className={cn('p-2 text-right font-medium', bigOverrun && 'text-destructive')}>
                    {row.plannedVarianceMinutes >= 0 ? '+' : ''}
                    {formatHoursAndMinutes(Math.abs(row.plannedVarianceMinutes))}
                    {row.plannedVariancePercent != null && ` (${row.plannedVariancePercent >= 0 ? '+' : ''}${row.plannedVariancePercent}%)`}
                  </td>
                  <td className={cn('p-2 text-right', row.delayDays != null && row.delayDays > 0 && 'text-destructive')}>
                    {row.delayDays != null ? `${row.delayDays} d` : '–'}
                  </td>
                  <td className="p-2 text-right text-muted-foreground">
                    {row.openTaskCount}/{row.taskCount}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-muted-foreground">
                  Ingen milepæler ennå.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
