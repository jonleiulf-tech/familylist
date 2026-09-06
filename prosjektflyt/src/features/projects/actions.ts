'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { PROJECT_STATUS } from '@/types/enums';

const updateSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(2),
  project_number: z.string().optional(),
  description: z.string().optional(),
  client_name: z.string().optional(),
  start_date: z.string().optional(),
  planned_end_date: z.string().optional(),
  actual_end_date: z.string().optional(),
  status: z.enum(PROJECT_STATUS),
  color: z.string(),
});

export async function updateProject(formData: FormData) {
  const supabase = createClient();
  const parsed = updateSchema.parse({
    project_id: String(formData.get('project_id')),
    name: String(formData.get('name')),
    project_number: formData.get('project_number') || undefined,
    description: formData.get('description') || undefined,
    client_name: formData.get('client_name') || undefined,
    start_date: formData.get('start_date') || undefined,
    planned_end_date: formData.get('planned_end_date') || undefined,
    actual_end_date: formData.get('actual_end_date') || undefined,
    status: formData.get('status'),
    color: String(formData.get('color') || '#2563eb'),
  });

  const { project_id, ...rest } = parsed;
  const { error } = await supabase
    .from('projects')
    .update({
      ...rest,
      project_number: rest.project_number ?? null,
      description: rest.description ?? null,
      client_name: rest.client_name ?? null,
      start_date: rest.start_date ?? null,
      planned_end_date: rest.planned_end_date ?? null,
      actual_end_date: rest.actual_end_date ?? null,
      archived_at: rest.status === 'archived' ? new Date().toISOString() : null,
    })
    .eq('id', project_id);
  if (error) throw error;

  revalidatePath(`/prosjekter/${project_id}`, 'layout');
}
