'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/actions/auth';
import { toUserMessage } from '@/lib/actions/result';
import { insertDemoProject } from './demo-project';

/**
 * Oppretter eksempelprosjektet for innlogget bruker og går rett til
 * dashboardet. Feil returneres som melding (redirect kan ikke ligge inne
 * i try/catch – Next signaliserer redirect ved å kaste).
 */
export async function createDemoProject(): Promise<{ ok: false; error: string } | never> {
  let projectId: string;
  try {
    const { supabase, user } = await requireUser();
    projectId = await insertDemoProject(supabase, user.id);
  } catch (err) {
    return { ok: false, error: toUserMessage(err) };
  }
  revalidatePath('/prosjekter');
  redirect(`/prosjekter/${projectId}/oversikt`);
}
