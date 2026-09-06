import Link from 'next/link';
import { getProjectWorkspaceData } from '@/lib/data/dashboard';
import { summarizeMemberHours } from '@/lib/calculations/hours';
import { formatHoursAndMinutes } from '@/lib/time/duration';
import { formatDate } from '@/lib/utils/format';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PROJECT_MEMBER_ROLE_LABELS } from '@/types/enums';
import { InviteMemberDialog } from '@/features/team/invite-member-dialog';

export default async function TeamPage({ params }: { params: { projectId: string } }) {
  const { members, timeEntries, timeEntryParticipants } = await getProjectWorkspaceData(params.projectId);

  const entriesForCalc = timeEntries.map((entry) => ({
    duration_minutes: entry.duration_minutes,
    participant_mode: entry.participant_mode,
    member_id: entry.member_id,
    participantMemberIds: timeEntryParticipants[entry.id] ?? [],
    work_date: entry.work_date,
  }));
  const hoursSummary = summarizeMemberHours(entriesForCalc);
  const totalMinutes = hoursSummary.reduce((sum, m) => sum + m.totalMinutes, 0);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="text-sm text-muted-foreground">{members.length} prosjektmedlemmer</p>
        </div>
        <InviteMemberDialog projectId={params.projectId} />
      </div>

      <div className="flex flex-col gap-3">
        {members.map((member) => {
          const hours = hoursSummary.find((h) => h.memberId === member.id);
          const share = totalMinutes > 0 && hours ? Math.round((hours.totalMinutes / totalMinutes) * 100) : 0;
          return (
            <Link key={member.id} href={`/prosjekter/${params.projectId}/team/${member.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-wrap items-center gap-4 py-4">
                  <Avatar firstName={member.first_name} lastName={member.last_name} />
                  <div className="min-w-[10rem] flex-1">
                    <div className="font-medium">
                      {member.first_name} {member.last_name}
                      {!member.is_active && (
                        <Badge variant="outline" className="ml-2">
                          Inaktiv
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {member.project_role_title || PROJECT_MEMBER_ROLE_LABELS[member.role]}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <div>Individuelt: {formatHoursAndMinutes(hours?.individualMinutes ?? 0)}</div>
                    <div>Gruppe: {formatHoursAndMinutes(hours?.groupMinutes ?? 0)}</div>
                  </div>
                  <div className="text-sm">
                    <div className="font-medium">{formatHoursAndMinutes(hours?.totalMinutes ?? 0)} totalt</div>
                    <div className="text-muted-foreground">{share}% av prosjektet</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Siste reg.: {formatDate(hours?.lastEntryDate ?? null)}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
