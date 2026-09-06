import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Task } from '@/types/database';
import type { TaskStatus } from '@/types/enums';
import { TASK_STATUS } from '@/types/enums';

export type TaskStatusCounts = Record<TaskStatus, number>;

/**
 * Teller status FRA FAKTISKE databaseverdier – ingen av de opprinnelige
 * Excel-formlene som (feilaktig) lot "Ikke startet" telle med "Ferdig".
 */
export function countTasksByStatus(tasks: Array<Pick<Task, 'status'>>): TaskStatusCounts {
  const counts = Object.fromEntries(TASK_STATUS.map((s) => [s, 0])) as TaskStatusCounts;
  for (const task of tasks) {
    counts[task.status] += 1;
  }
  return counts;
}

export function isTaskOverdue(
  task: Pick<Task, 'due_date' | 'status'>,
  today: string | Date = new Date(),
): boolean {
  if (!task.due_date || task.status === 'done') return false;
  const due = parseISO(task.due_date);
  const t = typeof today === 'string' ? parseISO(today) : today;
  return differenceInCalendarDays(due, t) < 0;
}

export function isDueSoon(
  task: Pick<Task, 'due_date' | 'status'>,
  today: string | Date = new Date(),
  withinDays = 7,
): boolean {
  if (!task.due_date || task.status === 'done') return false;
  const due = parseISO(task.due_date);
  const t = typeof today === 'string' ? parseISO(today) : today;
  const diff = differenceInCalendarDays(due, t);
  return diff >= 0 && diff <= withinDays;
}
