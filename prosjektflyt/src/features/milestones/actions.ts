'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { MilestoneStatus, Priority } from '@/types/enums';

const milestoneSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  responsible_member_id: z.string().uuid().optional(),
  planned_start_date: z.string().optional(),
  planned_end_date: z.string().optional(),
  actual_start_date: z.string().optional(),
  actual_end_date: z.string().optional(),
  estimated_hours: z.coerce.number().min(0).optional(),
  estimated_hours_per_week: z.coerce.number().min(0).optional(),
  progress_percent: z.coerce.number().min(0).max(100).default(0),
  status: z.enum(['not_started', 'in_progress', 'completed', 'delayed']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
});

function extract(formData: FormData) {
  return milestoneSchema.parse({
    project_id: String(formData.get('project_id')),
    title: String(formData.get('title')),
    description: formData.get('description') ? String(formData.get('description')) : undefined,
    responsible_member_id: formData.get('responsible_member_id')
      ? String(formData.get('responsible_member_id'))
      : undefined,
    planned_start_date: formData.get('planned_start_date') ? String(formData.get('planned_start_date')) : undefined,
    planned_end_date: formData.get('planned_end_date') ? String(formData.get('planned_end_date')) : undefined,
    actual_start_date: formData.get('actual_start_date') ? String(formData.get('actual_start_date')) : undefined,
    actual_end_date: formData.get('actual_end_date') ? String(formData.get('actual_end_date')) : undefined,
    estimated_hours: formData.get('estimated_hours') || undefined,
    estimated_hours_per_week: formData.get('estimated_hours_per_week') || undefined,
    progress_percent: formData.get('progress_percent') || 0,
    status: (formData.get('status') as MilestoneStatus) || 'not_started',
    priority: (formData.get('priority') as Priority) || 'medium',
  });
}

export async function createMilestone(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Ikke innlogget');
  const parsed = extract(formData);

  const { data: milestone, error } = await supabase
    .from('milestones')
    .insert({
      project_id: parsed.project_id,
      title: parsed.title,
      description: parsed.description ?? null,
      responsible_member_id: parsed.responsible_member_id ?? null,
      planned_start_date: parsed.planned_start_date ?? null,
      planned_end_date: parsed.planned_end_date ?? null,
      actual_start_date: parsed.actual_start_date ?? null,
      actual_end_date: parsed.actual_end_date ?? null,
      estimated_hours: parsed.estimated_hours ?? null,
      estimated_hours_per_week: parsed.estimated_hours_per_week ?? null,
      progress_percent: parsed.progress_percent,
      status: parsed.status,
      priority: parsed.priority,
    })
    .select('id')
    .single();
  if (error) throw error;

  await supabase.from('activity_log').insert({
    project_id: parsed.project_id,
    actor_id: user.id,
    entity_type: 'milestone',
    entity_id: milestone.id,
    action: 'created',
    metadata: { title: parsed.title },
  });

  revalidatePath(`/prosjekter/${parsed.project_id}`, 'layout');
}

export async function updateMilestone(milestoneId: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Ikke innlogget');
  const parsed = extract(formData);

  const { error } = await supabase
    .from('milestones')
    .update({
      title: parsed.title,
      description: parsed.description ?? null,
      responsible_member_id: parsed.responsible_member_id ?? null,
      planned_start_date: parsed.planned_start_date ?? null,
      planned_end_date: parsed.planned_end_date ?? null,
      actual_start_date: parsed.actual_start_date ?? null,
      actual_end_date: parsed.actual_end_date ?? null,
      estimated_hours: parsed.estimated_hours ?? null,
      estimated_hours_per_week: parsed.estimated_hours_per_week ?? null,
      progress_percent: parsed.progress_percent,
      status: parsed.status,
      priority: parsed.priority,
    })
    .eq('id', milestoneId);
  if (error) throw error;

  await supabase.from('activity_log').insert({
    project_id: parsed.project_id,
    actor_id: user.id,
    entity_type: 'milestone',
    entity_id: milestoneId,
    action: 'updated',
    metadata: {},
  });

  revalidatePath(`/prosjekter/${parsed.project_id}`, 'layout');
}

export async function deleteMilestone(projectId: string, milestoneId: string) {
  const supabase = createClient();
  const { error } = await supabase.from('milestones').delete().eq('id', milestoneId);
  if (error) throw error;
  revalidatePath(`/prosjekter/${projectId}`, 'layout');
}
