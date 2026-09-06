import { notFound } from 'next/navigation';
import { getProjectWorkspaceData } from '@/lib/data/dashboard';
import { formatHoursAndMinutes } from '@/lib/time/duration';
import { formatDate } from '@/lib/utils/format';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TASK_STATUS_LABELS } from '@/types/enums';

export default async function MemberDetailPage({
  params,
}: {
  params: { projectId: string; memberId: string };
}) {
  const { members, timeEntries, tasks, milestones } = await getProjectWorkspaceData(params.projectId);
  const member = members.find((m) => m.id === params.memberId);
  if (!member) notFound();

  const memberEntries = timeEntries.filter((e) => e.member_id === params.memberId);
  const memberTasks = tasks.filter((t) => t.assignee_id === params.memberId);
  const totalMinutes = memberEntries.reduce((sum, e) => sum + e.duration_minutes, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-4">
        <Avatar firstName={member.first_name} lastName={member.last_name} className="h-12 w-12 text-base" />
        <div>
          <h1 className="text-xl font-semibold">
            {member.first_name} {member.last_name}
          </h1>
          <p className="text-sm text-muted-foreground">{member.email}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold">{formatHoursAndMinutes(totalMinutes)}</div>
            <div className="text-xs text-muted-foreground">Totalt registrert</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold">{memberTasks.length}</div>
            <div className="text-xs text-muted-foreground">Tildelte oppgaver</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold">{memberEntries.length}</div>
            <div className="text-xs text-muted-foreground">Timeregistreringer</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Oppgaver</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {memberTasks.length === 0 && <p className="text-sm text-muted-foreground">Ingen tildelte oppgaver.</p>}
          {memberTasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between text-sm">
              <span>{task.title}</span>
              <Badge variant="outline">{TASK_STATUS_LABELS[task.status]}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Siste timeregistreringer</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {memberEntries.length === 0 && <p className="text-sm text-muted-foreground">Ingen registreringer ennå.</p>}
          {memberEntries.slice(0, 15).map((entry) => {
            const milestone = milestones.find((m) => m.id === entry.milestone_id);
            return (
              <div key={entry.id} className="flex items-center justify-between text-sm">
                <div>
                  <div>{entry.description || milestone?.title || 'Uten beskrivelse'}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(entry.work_date)}</div>
                </div>
                <span className="font-medium">{formatHoursAndMinutes(entry.duration_minutes)}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
