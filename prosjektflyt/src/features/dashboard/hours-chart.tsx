'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { minutesToDecimalHours } from '@/lib/time/duration';

export function HoursChart({ data }: { data: { name: string; planlagt: number; registrert: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value: number) => `${value} t`}
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
        />
        <Bar dataKey="planlagt" fill="hsl(var(--gantt-plan))" radius={[3, 3, 0, 0]} />
        <Bar dataKey="registrert" fill="hsl(var(--gantt-actual))" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export { minutesToDecimalHours };
