'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { runAction, unwrap, type ActionResult } from '@/lib/actions/result';
import { optionalString, requiredString, requireUser } from '@/lib/actions/auth';
import { PROJECT_STATUS } from '@/types/enums';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ugyldig dato');

const updateSchema = z
  .object({
    project_id: z.string().uuid('Ugyldig prosjekt'),
    name: z.string().min(2, 'Navn må ha minst 2 tegn').max(200),
    project_number: z.string().max(50).optional(),
    description: z.string().max(4000).optional(),
    client_name: z.string().max(200).optional(),
    start_date: isoDate.optional(),
    planned_end_date: isoDate.optional(),
    actual_end_date: isoDate.optional(),
    status: z.enum(PROJECT_STATUS),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Ugyldig farge'),
  })
  .refine((v) => !v.start_date || !v.planned_end_date || v.planned_end_date >= v.start_date, {
    message: 'Planlagt slutt kan ikke være før start',
    path: ['planned_end_date'],
  });

export async function updateProject(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, user } = await requireUser();
    const parsed = updateSchema.parse({
      project_id: requiredString(formData, 'project_id'),
      name: requiredString(formData, 'name'),
      project_number: optionalString(formData, 'project_number'),
      description: optionalString(formData, 'description'),
      client_name: optionalString(formData, 'client_name'),
      start_date: optionalString(formData, 'start_date'),
      planned_end_date: optionalString(formData, 'planned_end_date'),
      actual_end_date: optionalString(formData, 'actual_end_date'),
      status: optionalString(formData, 'status') ?? 'planning',
      color: optionalString(formData, 'color') ?? '#2563eb',
    });

    const { project_id, ...rest } = parsed;
    unwrap(
      await supabase
        .from('projects')
        .update({
          name: rest.name,
          project_number: rest.project_number ?? null,
          description: rest.description ?? null,
          client_name: rest.client_name ?? null,
          start_date: rest.start_date ?? null,
          planned_end_date: rest.planned_end_date ?? null,
          actual_end_date: rest.actual_end_date ?? null,
          status: rest.status,
          color: rest.color,
          archived_at: rest.status === 'archived' ? new Date().toISOString() : null,
        })
        .eq('id', project_id),
    );

    await supabase.from('activity_log').insert({
      project_id,
      actor_id: user.id,
      entity_type: 'project',
      entity_id: project_id,
      action: 'updated',
      metadata: { status: rest.status },
    });

    revalidatePath(`/prosjekter/${project_id}`, 'layout');
    revalidatePath('/prosjekter');
  });
}
