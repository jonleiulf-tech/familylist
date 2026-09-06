'use client';

import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate } from '@/lib/utils/format';
import { isTaskOverdue } from '@/lib/calculations/tasks';
import type { Task, ProjectMember, Milestone } from '@/types/database';
import { PRIORITY_LABELS, TASK_STATUS, TASK_STATUS_LABELS, type TaskStatus } from '@/types/enums';
import { updateTaskStatus, deleteTask } from './actions';
import { ConvertToMilestoneDialog } from './convert-to-milestone-dialog';
import { Trash2 } from 'lucide-react';

export function TaskCard({
  projectId,
  task,
  assignee,
  milestone,
}: {
  projectId: string;
  task: Task;
  assignee?: ProjectMember;
  milestone?: Milestone;
}) {
  const overdue = isTaskOverdue(task);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium">{task.title}</span>
        <button
          onClick={() => deleteTask(projectId, task.id)}
          className="text-muted-foreground hover:text-destructive"
          title="Slett"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {assignee && <span>{assignee.first_name} {assignee.last_name}</span>}
        {task.due_date && <span className={overdue ? 'font-medium text-destructive' : ''}>Frist: {formatDate(task.due_date)}</span>}
        <Badge variant="outline">{PRIORITY_LABELS[task.priority]}</Badge>
        {milestone && <Badge variant="secondary">{milestone.title}</Badge>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Select value={task.status} onValueChange={(v) => updateTaskStatus(projectId, task.id, v as TaskStatus)}>
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TASK_STATUS.map((s) => (
              <SelectItem key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!task.milestone_id && <ConvertToMilestoneDialog projectId={projectId} task={task} />}
      </div>
    </div>
  );
}
