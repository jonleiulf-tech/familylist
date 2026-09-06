'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { TaskStatus } from '@/types/enums';

const createTaskSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  assignee_id: z.string().uuid().optional(),
  start_date: z.string().optional(),
  due_date: z.string().optional(),
  milestone_id: z.string().uuid().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
});

export async function createTask(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Ikke innlogget');

  const parsed = createTaskSchema.parse({
    project_id: String(formData.get('project_id')),
    title: String(formData.get('title')),
    description: formData.get('description') ? String(formData.get('description')) : undefined,
    assignee_id: formData.get('assignee_id') ? String(formData.get('assignee_id')) : undefined,
    start_date: formData.get('start_date') ? String(formData.get('start_date')) : undefined,
    due_date: formData.get('due_date') ? String(formData.get('due_date')) : undefined,
    milestone_id: formData.get('milestone_id') ? String(formData.get('milestone_id')) : undefined,
    priority: (formData.get('priority') as 'low' | 'medium' | 'high' | 'critical') || 'medium',
  });

  const { data: task, error } = await supabase
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
    .single();
  if (error) throw error;

  await supabase.from('activity_log').insert({
    project_id: parsed.project_id,
    actor_id: user.id,
    entity_type: 'task',
    entity_id: task.id,
    action: 'created',
    metadata: { title: parsed.title },
  });

  revalidatePath(`/prosjekter/${parsed.project_id}`, 'layout');
}

export async function updateTaskStatus(projectId: string, taskId: string, status: TaskStatus) {
  const supabase = createClient();
  const { error } = await supabase
    .from('tasks')
    .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
    .eq('id', taskId);
  if (error) throw error;
  revalidatePath(`/prosjekter/${projectId}`, 'layout');
}

export async function deleteTask(projectId: string, taskId: string) {
  const supabase = createClient();
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) throw error;
  revalidatePath(`/prosjekter/${projectId}`, 'layout');
}

const convertSchema = z.object({
  project_id: z.string().uuid(),
  task_id: z.string().uuid(),
  estimated_hours: z.coerce.number().min(0).optional(),
});

/**
 * "Gjør om til milepæl": gjenbruker tittel/beskrivelse/ansvarlig/datoer fra
 * oppgaven, spør kun om estimert timebruk, oppretter Milestone og kobler
 * oppgaven til den nye milepælen (title er fortsatt bare visningsnavn – all
 * kobling skjer via milestone_id).
 */
export async function convertTaskToMilestone(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Ikke innlogget');

  const parsed = convertSchema.parse({
    project_id: String(formData.get('project_id')),
    task_id: String(formData.get('task_id')),
    estimated_hours: formData.get('estimated_hours') || undefined,
  });

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', parsed.task_id)
    .single();
  if (taskError) throw taskError;

  const { data: milestone, error: milestoneError } = await supabase
    .from('milestones')
    .insert({
      project_id: parsed.project_id,
      title: task.title,
      description: task.description,
      responsible_member_id: task.assignee_id,
      planned_start_date: task.start_date,
      planned_end_date: task.due_date,
      estimated_hours: parsed.estimated_hours ?? null,
    })
    .select('id')
    .single();
  if (milestoneError) throw milestoneError;

  const { error: updateError } = await supabase
    .from('tasks')
    .update({ milestone_id: milestone.id })
    .eq('id', parsed.task_id);
  if (updateError) throw updateError;

  await supabase.from('activity_log').insert({
    project_id: parsed.project_id,
    actor_id: user.id,
    entity_type: 'task',
    entity_id: parsed.task_id,
    action: 'converted_to_milestone',
    metadata: { milestone_id: milestone.id },
  });

  revalidatePath(`/prosjekter/${parsed.project_id}`, 'layout');
}
