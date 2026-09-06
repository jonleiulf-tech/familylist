'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { runAction, unwrap, type ActionResult } from '@/lib/actions/result';
import { optionalString, requiredString, requireUser } from '@/lib/actions/auth';
import { DELIVERABLE_TEMPLATES, type DeliverableTemplateKey } from './templates';

const createSchema = z.object({
  project_id: z.string().uuid('Ugyldig prosjekt'),
  name: z.string().min(1, 'Navn på kategori mangler').max(120, 'Navnet er for langt'),
  description: z.string().max(500).optional(),
});

export async function createDeliverable(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const parsed = createSchema.parse({
      project_id: requiredString(formData, 'project_id'),
      name: requiredString(formData, 'name'),
      description: optionalString(formData, 'description'),
    });

    const existing = unwrap(
      await supabase.from('deliverables').select('sort_order').eq('project_id', parsed.project_id),
    );
    const nextSort = existing.reduce((max, d) => Math.max(max, d.sort_order), -1) + 1;

    unwrap(
      await supabase.from('deliverables').insert({
        project_id: parsed.project_id,
        name: parsed.name,
        description: parsed.description ?? null,
        sort_order: nextSort,
      }),
    );
    revalidatePath(`/prosjekter/${parsed.project_id}`, 'layout');
  });
}

export async function deleteDeliverable(projectId: string, deliverableId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    unwrap(await supabase.from('deliverables').delete().eq('id', deliverableId));
    revalidatePath(`/prosjekter/${projectId}`, 'layout');
  });
}

/**
 * Oppretter alle kategoriene i en mal (f.eks. «USN rapport»). Kategorier som
 * allerede finnes med samme navn hoppes over, så malen kan brukes flere ganger.
 */
export async function applyDeliverableTemplate(
  projectId: string,
  templateKey: DeliverableTemplateKey,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const template = DELIVERABLE_TEMPLATES[templateKey];
    if (!template) throw new Error('Ukjent mal');

    const existing = unwrap(
      await supabase.from('deliverables').select('name, sort_order').eq('project_id', projectId),
    );
    const existingNames = new Set(existing.map((d) => d.name.toLowerCase()));
    let sort = existing.reduce((max, d) => Math.max(max, d.sort_order), -1) + 1;

    const rows = template.items
      .filter((name) => !existingNames.has(name.toLowerCase()))
      .map((name) => ({ project_id: projectId, name, sort_order: sort++ }));

    if (rows.length > 0) {
      unwrap(await supabase.from('deliverables').insert(rows));
    }
    revalidatePath(`/prosjekter/${projectId}`, 'layout');
  });
}
