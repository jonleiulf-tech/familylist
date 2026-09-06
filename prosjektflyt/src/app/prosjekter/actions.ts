'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const createProjectSchema = z.object({
  name: z.string().min(2, 'Navn må ha minst 2 tegn'),
  project_number: z.string().optional(),
  client_name: z.string().optional(),
  start_date: z.string().optional(),
  planned_end_date: z.string().optional(),
  color: z.string().default('#2563eb'),
});

export async function createProject(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/logg-inn');

  const parsed = createProjectSchema.parse({
    name: formData.get('name'),
    project_number: formData.get('project_number') || undefined,
    client_name: formData.get('client_name') || undefined,
    start_date: formData.get('start_date') || undefined,
    planned_end_date: formData.get('planned_end_date') || undefined,
    color: formData.get('color') || '#2563eb',
  });

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      name: parsed.name,
      project_number: parsed.project_number ?? null,
      client_name: parsed.client_name ?? null,
      start_date: parsed.start_date ?? null,
      planned_end_date: parsed.planned_end_date ?? null,
      color: parsed.color,
      status: 'planning',
      created_by: user!.id,
      project_manager_id: user!.id,
    })
    .select('id')
    .single();

  if (error) throw error;

  // Oppretteren legges automatisk inn som owner av databasetriggeren
  // on_project_created (se supabase/migrations/0004). Det må skje i
  // databasen: før første medlem finnes har ingen rettigheter til å
  // legge inn medlemmer via RLS.

  revalidatePath('/prosjekter');
  redirect(`/prosjekter/${project.id}/oversikt`);
}
