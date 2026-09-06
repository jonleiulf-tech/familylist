'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { runAction, unwrap, type ActionResult } from '@/lib/actions/result';
import { optionalString, requiredString, requireUser } from '@/lib/actions/auth';

const eventSchema = z
  .object({
    project_id: z.string().uuid('Ugyldig prosjekt'),
    title: z.string().min(1, 'Hendelsen må ha et navn').max(200, 'Navnet er for langt'),
    description: z.string().max(2000).optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dato mangler'),
    start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Ugyldig starttid').optional(),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Ugyldig sluttid').optional(),
    location: z.string().max(200).optional(),
    milestone_id: z.string().uuid('Ugyldig milepæl').optional(),
    task_id: z.string().uuid('Ugyldig oppgave').optional(),
    participant_ids: z.array(z.string().uuid()).default([]),
  })
  .refine((v) => !v.end_time || !v.start_time || v.end_time > v.start_time, {
    message: 'Sluttid må være etter starttid',
    path: ['end_time'],
  });

export async function createCalendarEvent(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, user } = await requireUser();

    const parsed = eventSchema.parse({
      project_id: requiredString(formData, 'project_id'),
      title: requiredString(formData, 'title'),
      description: optionalString(formData, 'description'),
      start_date: requiredString(formData, 'start_date'),
      start_time: optionalString(formData, 'start_time'),
      end_time: optionalString(formData, 'end_time'),
      location: optionalString(formData, 'location'),
      milestone_id: optionalString(formData, 'milestone_id'),
      task_id: optionalString(formData, 'task_id'),
      participant_ids: formData.getAll('participant_ids').map(String),
    });

    // Lagres som lokal tid uten tidssone-suffiks; Postgres tolker det i
    // databasens tidssone (UTC) – konsekvent for alle brukere i samme
    // prosjekt. Visning skjer via date-fns i klientens tidssone.
    const startDatetime = `${parsed.start_date}T${parsed.start_time ?? '09:00'}:00`;
    const endDatetime = parsed.end_time ? `${parsed.start_date}T${parsed.end_time}:00` : null;

    const event = unwrap(
      await supabase
        .from('calendar_events')
        .insert({
          project_id: parsed.project_id,
          title: parsed.title,
          description: parsed.description ?? null,
          start_datetime: startDatetime,
          end_datetime: endDatetime,
          location: parsed.location ?? null,
          milestone_id: parsed.milestone_id ?? null,
          task_id: parsed.task_id ?? null,
          created_by: user.id,
        })
        .select('id')
        .single(),
    );

    const participantIds = Array.from(new Set(parsed.participant_ids));
    if (participantIds.length > 0) {
      unwrap(
        await supabase
          .from('calendar_event_participants')
          .insert(participantIds.map((memberId) => ({ event_id: event.id, member_id: memberId }))),
      );
    }

    await supabase.from('activity_log').insert({
      project_id: parsed.project_id,
      actor_id: user.id,
      entity_type: 'calendar_event',
      entity_id: event.id,
      action: 'created',
      metadata: { title: parsed.title, start_datetime: startDatetime },
    });

    revalidatePath(`/prosjekter/${parsed.project_id}`, 'layout');
  });
}

export async function deleteCalendarEvent(projectId: string, eventId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    unwrap(await supabase.from('calendar_events').delete().eq('id', eventId));
    revalidatePath(`/prosjekter/${projectId}`, 'layout');
  });
}
