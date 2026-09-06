'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { calculateDurationFromStartEnd, hoursAndMinutesToMinutes } from '@/lib/time/duration';
import type { ParticipantMode } from '@/types/enums';

const baseSchema = z.object({
  project_id: z.string().uuid(),
  member_id: z.string().uuid(),
  milestone_id: z.string().uuid().optional(),
  task_id: z.string().uuid().optional(),
  deliverable_id: z.string().uuid().optional(),
  work_date: z.string(),
  description: z.string().optional(),
  participant_mode: z.enum(['single', 'selected', 'all']),
  participant_ids: z.array(z.string().uuid()).default([]),
});

function resolveDurationMinutes(formData: FormData): number {
  const mode = String(formData.get('duration_mode') ?? 'hm');
  if (mode === 'start_end') {
    const start = String(formData.get('start_time') ?? '');
    const end = String(formData.get('end_time') ?? '');
    return calculateDurationFromStartEnd(start, end);
  }
  const hours = Number(formData.get('hours') ?? 0);
  const minutes = Number(formData.get('minutes') ?? 0);
  return hoursAndMinutesToMinutes(hours, minutes);
}

export async function createTimeEntry(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Ikke innlogget');

  const raw = {
    project_id: String(formData.get('project_id')),
    member_id: String(formData.get('member_id')),
    milestone_id: formData.get('milestone_id') ? String(formData.get('milestone_id')) : undefined,
    task_id: formData.get('task_id') ? String(formData.get('task_id')) : undefined,
    deliverable_id: formData.get('deliverable_id') ? String(formData.get('deliverable_id')) : undefined,
    work_date: String(formData.get('work_date')),
    description: formData.get('description') ? String(formData.get('description')) : undefined,
    participant_mode: String(formData.get('participant_mode') ?? 'single') as ParticipantMode,
    participant_ids: formData.getAll('participant_ids').map(String),
  };
  const parsed = baseSchema.parse(raw);
  const durationMinutes = resolveDurationMinutes(formData);

  const { data: entry, error } = await supabase
    .from('time_entries')
    .insert({
      project_id: parsed.project_id,
      member_id: parsed.member_id,
      milestone_id: parsed.milestone_id ?? null,
      task_id: parsed.task_id ?? null,
      deliverable_id: parsed.deliverable_id ?? null,
      work_date: parsed.work_date,
      description: parsed.description ?? null,
      duration_minutes: durationMinutes,
      participant_mode: parsed.participant_mode,
    })
    .select('id')
    .single();
  if (error) throw error;

  if (parsed.participant_mode !== 'single' && parsed.participant_ids.length > 0) {
    const rows = parsed.participant_ids
      .filter((id) => id !== parsed.member_id)
      .map((memberId) => ({ time_entry_id: entry.id, member_id: memberId }));
    if (rows.length > 0) {
      const { error: participantsError } = await supabase.from('time_entry_participants').insert(rows);
      if (participantsError) throw participantsError;
    }
  }

  await supabase.from('activity_log').insert({
    project_id: parsed.project_id,
    actor_id: user.id,
    entity_type: 'time_entry',
    entity_id: entry.id,
    action: 'created',
    metadata: { duration_minutes: durationMinutes },
  });

  revalidatePath(`/prosjekter/${parsed.project_id}`, 'layout');
}

export async function deleteTimeEntry(projectId: string, entryId: string) {
  const supabase = createClient();
  const { error } = await supabase.from('time_entries').delete().eq('id', entryId);
  if (error) throw error;
  revalidatePath(`/prosjekter/${projectId}`, 'layout');
}
