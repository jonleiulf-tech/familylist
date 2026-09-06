'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { runAction, unwrap, type ActionResult } from '@/lib/actions/result';
import { optionalString, requiredString, requireUser } from '@/lib/actions/auth';
import { MILESTONE_STATUS, PRIORITY } from '@/types/enums';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ugyldig dato');

const milestoneSchema = z
  .object({
    project_id: z.string().uuid('Ugyldig prosjekt'),
    title: z.string().min(1, 'Milepælen må ha en tittel').max(200, 'Tittelen er for lang'),
    description: z.string().max(4000).optional(),
    responsible_member_id: z.string().uuid('Ugyldig ansvarlig').optional(),
    planned_start_date: isoDate.optional(),
    planned_end_date: isoDate.optional(),
    actual_start_date: isoDate.optional(),
    actual_end_date: isoDate.optional(),
    estimated_hours: z.coerce.number().min(0, 'Estimerte timer kan ikke være negativt').optional(),
    estimated_hours_per_week: z.coerce.number().min(0, 'Timer/uke kan ikke være negativt').optional(),
    progress_percent: z.coerce.number().int().min(0).max(100, 'Prosent må være 0–100').default(0),
    status: z.enum(MILESTONE_STATUS).default('not_started'),
    priority: z.enum(PRIORITY).default('medium'),
  })
  .refine((v) => !v.planned_start_date || !v.planned_end_date || v.planned_end_date >= v.planned_start_date, {
    message: 'Planlagt slutt kan ikke være før planlagt start',
    path: ['planned_end_date'],
  })
  .refine((v) => !v.actual_start_date || !v.actual_end_date || v.actual_end_date >= v.actual_start_date, {
    message: 'Faktisk slutt kan ikke være før faktisk start',
    path: ['actual_end_date'],
  })
  .refine((v) => !v.actual_end_date || v.actual_start_date, {
    message: 'Faktisk slutt krever at faktisk start er satt',
    path: ['actual_start_date'],
  });

function extract(formData: FormData) {
  return milestoneSchema.parse({
    project_id: requiredString(formData, 'project_id'),
    title: requiredString(formData, 'title'),
    description: optionalString(formData, 'description'),
    responsible_member_id: optionalString(formData, 'responsible_member_id'),
    planned_start_date: optionalString(formData, 'planned_start_date'),
    planned_end_date: optionalString(formData, 'planned_end_date'),
    actual_start_date: optionalString(formData, 'actual_start_date'),
    actual_end_date: optionalString(formData, 'actual_end_date'),
    estimated_hours: optionalString(formData, 'estimated_hours'),
    estimated_hours_per_week: optionalString(formData, 'estimated_hours_per_week'),
    progress_percent: optionalString(formData, 'progress_percent') ?? 0,
    status: optionalString(formData, 'status') ?? 'not_started',
    priority: optionalString(formData, 'priority') ?? 'medium',
  });
}

/**
 * Holder status og fremdrift konsistente: 100 % ⇒ fullført, fullført ⇒ 100 %.
 * Alt annet lar vi brukeren styre – status «forsinket» er et manuelt flagg,
 * mens den *beregnede* forsinkelsen (lib/calculations) alltid går på datoer.
 */
function reconcile(parsed: ReturnType<typeof extract>) {
  let { status, progress_percent } = parsed;
  if (status === 'completed' && progress_percent < 100) progress_percent = 100;
  if (progress_percent === 100 && status !== 'completed') status = 'completed';
  if (status === 'not_started' && progress_percent > 0) status = 'in_progress';
  return { ...parsed, status, progress_percent };
}

function toRow(p: ReturnType<typeof reconcile>) {
  return {
    title: p.title,
    description: p.description ?? null,
    responsible_member_id: p.responsible_member_id ?? null,
    planned_start_date: p.planned_start_date ?? null,
    planned_end_date: p.planned_end_date ?? null,
    actual_start_date: p.actual_start_date ?? null,
    actual_end_date: p.actual_end_date ?? null,
    estimated_hours: p.estimated_hours ?? null,
    estimated_hours_per_week: p.estimated_hours_per_week ?? null,
    progress_percent: p.progress_percent,
    status: p.status,
    priority: p.priority,
  };
}

export async function createMilestone(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, user } = await requireUser();
    const parsed = reconcile(extract(formData));

    const existing = unwrap(
      await supabase.from('milestones').select('sort_order').eq('project_id', parsed.project_id),
    );
    const nextSort = existing.reduce((max, m) => Math.max(max, m.sort_order), -1) + 1;

    const milestone = unwrap(
      await supabase
        .from('milestones')
        .insert({ project_id: parsed.project_id, sort_order: nextSort, ...toRow(parsed) })
        .select('id')
        .single(),
    );

    await supabase.from('activity_log').insert({
      project_id: parsed.project_id,
      actor_id: user.id,
      entity_type: 'milestone',
      entity_id: milestone.id,
      action: 'created',
      metadata: { title: parsed.title },
    });

    revalidatePath(`/prosjekter/${parsed.project_id}`, 'layout');
  });
}

export async function updateMilestone(milestoneId: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, user } = await requireUser();
    const parsed = reconcile(extract(formData));

    const before = unwrap(
      await supabase.from('milestones').select('status, progress_percent').eq('id', milestoneId).single(),
    );

    unwrap(await supabase.from('milestones').update(toRow(parsed)).eq('id', milestoneId));

    const becameCompleted = before.status !== 'completed' && parsed.status === 'completed';
    await supabase.from('activity_log').insert({
      project_id: parsed.project_id,
      actor_id: user.id,
      entity_type: 'milestone',
      entity_id: milestoneId,
      action: becameCompleted ? 'completed' : before.status !== parsed.status ? 'status_changed' : 'updated',
      metadata: { status: parsed.status, progress_percent: parsed.progress_percent },
    });

    revalidatePath(`/prosjekter/${parsed.project_id}`, 'layout');
  });
}

export async function deleteMilestone(projectId: string, milestoneId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, user } = await requireUser();
    unwrap(await supabase.from('milestones').delete().eq('id', milestoneId));
    await supabase.from('activity_log').insert({
      project_id: projectId,
      actor_id: user.id,
      entity_type: 'milestone',
      entity_id: milestoneId,
      action: 'deleted',
      metadata: {},
    });
    revalidatePath(`/prosjekter/${projectId}`, 'layout');
  });
}
