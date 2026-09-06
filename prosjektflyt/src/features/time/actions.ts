'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { calculateDurationFromStartEnd, hoursAndMinutesToMinutes } from '@/lib/time/duration';
import { runAction, unwrap, type ActionResult } from '@/lib/actions/result';
import { optionalString, requiredString, requireUser } from '@/lib/actions/auth';
import { PARTICIPANT_MODE } from '@/types/enums';

const uuid = (label: string) => z.string().uuid(`${label} må velges`);

const baseSchema = z.object({
  project_id: uuid('Prosjekt'),
  member_id: uuid('Person'),
  milestone_id: uuid('Milepæl').optional(),
  task_id: uuid('Oppgave').optional(),
  deliverable_id: uuid('Leveranse').optional(),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dato mangler'),
  description: z.string().max(1000, 'Beskrivelsen er for lang').optional(),
  participant_mode: z.enum(PARTICIPANT_MODE),
  participant_ids: z.array(z.string().uuid()).default([]),
});

function resolveDurationMinutes(formData: FormData): number {
  const mode = String(formData.get('duration_mode') ?? 'hm');
  let minutes: number;
  if (mode === 'start_end') {
    const start = requiredString(formData, 'start_time');
    const end = requiredString(formData, 'end_time');
    if (!start || !end) throw new RangeError('Fyll inn både start- og sluttidspunkt');
    minutes = calculateDurationFromStartEnd(start, end);
  } else {
    const hours = Number(formData.get('hours') ?? 0);
    const mins = Number(formData.get('minutes') ?? 0);
    if (!Number.isFinite(hours) || !Number.isFinite(mins)) throw new RangeError('Ugyldig varighet');
    if (mins >= 60) throw new RangeError('Minutter må være mellom 0 og 59');
    minutes = hoursAndMinutesToMinutes(hours, mins);
  }
  if (minutes <= 0) throw new RangeError('Varigheten må være mer enn 0 minutter');
  if (minutes > 24 * 60) throw new RangeError('Varigheten kan ikke være mer enn 24 timer');
  return minutes;
}

export async function createTimeEntry(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, user } = await requireUser();

    const parsed = baseSchema.parse({
      project_id: requiredString(formData, 'project_id'),
      member_id: requiredString(formData, 'member_id'),
      milestone_id: optionalString(formData, 'milestone_id'),
      task_id: optionalString(formData, 'task_id'),
      deliverable_id: optionalString(formData, 'deliverable_id'),
      work_date: requiredString(formData, 'work_date'),
      description: optionalString(formData, 'description'),
      participant_mode: String(formData.get('participant_mode') ?? 'single'),
      participant_ids: formData.getAll('participant_ids').map(String),
    });
    const durationMinutes = resolveDurationMinutes(formData);

    const participantIds =
      parsed.participant_mode === 'single'
        ? []
        : Array.from(new Set(parsed.participant_ids)).filter((id) => id !== parsed.member_id);

    if (parsed.participant_mode !== 'single' && participantIds.length === 0) {
      throw new RangeError('Velg minst én deltager i tillegg til deg selv, eller bruk «Individuelt»');
    }

    const entry = unwrap(
      await supabase
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
        .single(),
    );

    if (participantIds.length > 0) {
      unwrap(
        await supabase
          .from('time_entry_participants')
          .insert(participantIds.map((memberId) => ({ time_entry_id: entry.id, member_id: memberId }))),
      );
    }

    await supabase.from('activity_log').insert({
      project_id: parsed.project_id,
      actor_id: user.id,
      entity_type: 'time_entry',
      entity_id: entry.id,
      action: 'created',
      metadata: { duration_minutes: durationMinutes, milestone_id: parsed.milestone_id ?? null },
    });

    revalidatePath(`/prosjekter/${parsed.project_id}`, 'layout');
  });
}

export async function deleteTimeEntry(projectId: string, entryId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    unwrap(await supabase.from('time_entries').delete().eq('id', entryId));
    revalidatePath(`/prosjekter/${projectId}`, 'layout');
  });
}
