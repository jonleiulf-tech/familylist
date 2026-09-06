'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { runAction, unwrap, type ActionResult } from '@/lib/actions/result';
import { optionalString, requiredString, requireUser } from '@/lib/actions/auth';
import { PROJECT_MEMBER_ROLE, type ProjectMemberRole } from '@/types/enums';

const inviteSchema = z.object({
  project_id: z.string().uuid('Ugyldig prosjekt'),
  first_name: z.string().min(1, 'Fornavn mangler').max(100),
  last_name: z.string().max(100).optional(),
  email: z.string().email('Ugyldig e-postadresse'),
  role: z.enum(PROJECT_MEMBER_ROLE),
  project_role_title: z.string().max(100).optional(),
});

/**
 * Inviterer et prosjektmedlem via e-post. Oppretter en medlemsrad med
 * invited_email; finnes det allerede en konto med e-posten kobles user_id
 * straks, ellers kobles raden automatisk av databasetriggeren
 * handle_new_user når personen registrerer seg (migrasjon 0004).
 * Det sendes ingen e-post ennå – se docs/ARCHITECTURE.md.
 */
export async function inviteMember(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, user } = await requireUser();

    const parsed = inviteSchema.parse({
      project_id: requiredString(formData, 'project_id'),
      first_name: requiredString(formData, 'first_name'),
      last_name: optionalString(formData, 'last_name'),
      email: requiredString(formData, 'email').toLowerCase(),
      role: optionalString(formData, 'role') ?? 'member',
      project_role_title: optionalString(formData, 'project_role_title'),
    });

    const { data: existingUserId } = await supabase.rpc('find_user_id_by_email', { p_email: parsed.email });

    const member = unwrap(
      await supabase
        .from('project_members')
        .insert({
          project_id: parsed.project_id,
          user_id: existingUserId ?? null,
          invited_email: parsed.email,
          email: parsed.email,
          first_name: parsed.first_name,
          last_name: parsed.last_name ?? '',
          role: parsed.role,
          project_role_title: parsed.project_role_title ?? null,
        })
        .select('id')
        .single(),
    );

    await supabase.from('activity_log').insert({
      project_id: parsed.project_id,
      actor_id: user.id,
      entity_type: 'member',
      entity_id: member.id,
      action: 'invited',
      metadata: { email: parsed.email, linked: Boolean(existingUserId) },
    });

    revalidatePath(`/prosjekter/${parsed.project_id}`, 'layout');
  });
}

export async function setMemberActive(projectId: string, memberId: string, isActive: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    unwrap(await supabase.from('project_members').update({ is_active: isActive }).eq('id', memberId));
    revalidatePath(`/prosjekter/${projectId}`, 'layout');
  });
}

export async function updateMemberRole(projectId: string, memberId: string, role: ProjectMemberRole): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (!PROJECT_MEMBER_ROLE.includes(role)) throw new RangeError('Ugyldig rolle');
    unwrap(await supabase.from('project_members').update({ role }).eq('id', memberId));
    revalidatePath(`/prosjekter/${projectId}`, 'layout');
  });
}
