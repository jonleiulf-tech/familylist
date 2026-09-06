'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { ProjectMemberRole } from '@/types/enums';

const inviteSchema = z.object({
  project_id: z.string().uuid(),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
  project_role_title: z.string().optional(),
});

/**
 * Inviterer et prosjektmedlem via e-post. MVP oppretter en "pending"
 * medlemsrad (invited_email satt, user_id null); når personen registrerer
 * seg med samme e-post kobles kontoen til raden (se docs/ARCHITECTURE.md
 * for hvordan dette utvides med et ekte invitasjonsflow/e-post senere).
 */
export async function inviteMember(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Ikke innlogget');

  const parsed = inviteSchema.parse({
    project_id: String(formData.get('project_id')),
    first_name: String(formData.get('first_name')),
    last_name: formData.get('last_name') ? String(formData.get('last_name')) : undefined,
    email: String(formData.get('email')),
    role: (formData.get('role') as ProjectMemberRole) || 'member',
    project_role_title: formData.get('project_role_title') ? String(formData.get('project_role_title')) : undefined,
  });

  const { data: member, error } = await supabase
    .from('project_members')
    .insert({
      project_id: parsed.project_id,
      invited_email: parsed.email,
      email: parsed.email,
      first_name: parsed.first_name,
      last_name: parsed.last_name ?? '',
      role: parsed.role,
      project_role_title: parsed.project_role_title ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;

  await supabase.from('activity_log').insert({
    project_id: parsed.project_id,
    actor_id: user.id,
    entity_type: 'member',
    entity_id: member.id,
    action: 'invited',
    metadata: { email: parsed.email },
  });

  revalidatePath(`/prosjekter/${parsed.project_id}`, 'layout');
}

export async function setMemberActive(projectId: string, memberId: string, isActive: boolean) {
  const supabase = createClient();
  const { error } = await supabase.from('project_members').update({ is_active: isActive }).eq('id', memberId);
  if (error) throw error;
  revalidatePath(`/prosjekter/${projectId}`, 'layout');
}

export async function updateMemberRole(projectId: string, memberId: string, role: ProjectMemberRole) {
  const supabase = createClient();
  const { error } = await supabase.from('project_members').update({ role }).eq('id', memberId);
  if (error) throw error;
  revalidatePath(`/prosjekter/${projectId}`, 'layout');
}
