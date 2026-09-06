'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { runAction, unwrap, type ActionResult } from '@/lib/actions/result';
import { optionalString, requiredString, requireUser } from '@/lib/actions/auth';
import { PRIORITY, TASK_STATUS, type TaskStatus } from '@/types/enums';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ugyldig dato');

const createTaskSchema = z
  .object({
    project_id: z.string().uuid('Ugyldig prosjekt'),
    title: z.string().min(1, 'Oppgaven må ha en tittel').max(200, 'Tittelen er for lang'),
    description: z.string().max(2000).optional(),
    assignee_id: z.string().uuid('Ugyldig person').optional(),
    start_date: isoDate.optional(),
    due_date: isoDate.optional(),
    milestone_id: z.string().uuid('Ugyldig milepæl').optional(),
    priority: z.enum(PRIORITY).default('medium'),
  })
  .refine((v) => !v.start_date || !v.due_date || v.due_date >= v.start_date, {
    message: 'Fristen kan ikke være før startdatoen',
    path: ['due_date'],
  });

export async function createTask(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, user } = await requireUser();

    const parsed = createTaskSchema.parse({
      project_id: requiredString(formData, 'project_id'),
      title: requiredString(formData, 'title'),
      description: optionalString(formData, 'description'),
      assignee_id: optionalString(formData, 'assignee_id'),
      start_date: optionalString(formData, 'start_date'),
      due_date: optionalString(formData, 'due_date'),
      milestone_id: optionalString(formData, 'milestone_id'),
      priority: optionalString(formData, 'priority') ?? 'medium',
    });

    const task = unwrap(
      await supabase
        .from('tasks')
        .insert({
          project_id: parsed.project_id,
          title: parsed.title,
          description: parsed.description ?? null,
          assignee_id: parsed.assignee_id ?? null,
          start_date: parsed.start_date ?? null,
          due_date: parsed.due_date ?? null,
          milestone_id: parsed.milestone_id ?? null,
          priority: parsed.priority,
          created_by: user.id,
        })
        .select('id')
        .single(),
    );

    await supabase.from('activity_log').insert({
      project_id: parsed.project_id,
      actor_id: user.id,
      entity_type: 'task',
      entity_id: task.id,
      action: 'created',
      metadata: { title: parsed.title },
    });

    revalidatePath(`/prosjekter/${parsed.project_id}`, 'layout');
  });
}

export async function updateTaskStatus(projectId: string, taskId: string, status: TaskStatus): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, user } = await requireUser();
    if (!TASK_STATUS.includes(status)) throw new RangeError('Ugyldig status');

    unwrap(
      await supabase
        .from('tasks')
        .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
        .eq('id', taskId),
    );

    await supabase.from('activity_log').insert({
      project_id: projectId,
      actor_id: user.id,
      entity_type: 'task',
      entity_id: taskId,
      action: status === 'done' ? 'completed' : 'status_changed',
      metadata: { status },
    });

    revalidatePath(`/prosjekter/${projectId}`, 'layout');
  });
}

export async function deleteTask(projectId: string, taskId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    unwrap(await supabase.from('tasks').delete().eq('id', taskId));
    revalidatePath(`/prosjekter/${projectId}`, 'layout');
  });
}

const convertSchema = z.object({
  project_id: z.string().uuid('Ugyldig prosjekt'),
  task_id: z.string().uuid('Ugyldig oppgave'),
  estimated_hours: z.coerce.number().min(0, 'Estimert tid kan ikke være negativ').optional(),
});

/**
 * "Gjør om til milepæl": gjenbruker tittel/beskrivelse/ansvarlig/datoer fra
 * oppgaven, spør kun om estimert timebruk, oppretter Milestone og kobler
 * oppgaven til den nye milepælen (title er fortsatt bare visningsnavn – all
 * kobling skjer via milestone_id).
 */
export async function convertTaskToMilestone(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, user } = await requireUser();

    const parsed = convertSchema.parse({
      project_id: requiredString(formData, 'project_id'),
      task_id: requiredString(formData, 'task_id'),
      estimated_hours: optionalString(formData, 'estimated_hours'),
    });

    const task = unwrap(await supabase.from('tasks').select('*').eq('id', parsed.task_id).single());
    if (task.milestone_id) throw new Error('Oppgaven er allerede knyttet til en milepæl');

    const existing = unwrap(
      await supabase.from('milestones').select('sort_order').eq('project_id', parsed.project_id),
    );
    const nextSort = existing.reduce((max, m) => Math.max(max, m.sort_order), -1) + 1;

    const milestone = unwrap(
      await supabase
        .from('milestones')
        .insert({
          project_id: parsed.project_id,
          title: task.title,
          description: task.description,
          responsible_member_id: task.assignee_id,
          planned_start_date: task.start_date,
          planned_end_date: task.due_date,
          estimated_hours: parsed.estimated_hours ?? null,
          sort_order: nextSort,
        })
        .select('id')
        .single(),
    );

    unwrap(await supabase.from('tasks').update({ milestone_id: milestone.id }).eq('id', parsed.task_id));

    await supabase.from('activity_log').insert({
      project_id: parsed.project_id,
      actor_id: user.id,
      entity_type: 'task',
      entity_id: parsed.task_id,
      action: 'converted_to_milestone',
      metadata: { milestone_id: milestone.id },
    });

    revalidatePath(`/prosjekter/${parsed.project_id}`, 'layout');
  });
}
