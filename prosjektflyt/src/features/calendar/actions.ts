'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const eventSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  start_date: z.string(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  location: z.string().optional(),
  milestone_id: z.string().uuid().optional(),
  task_id: z.string().uuid().optional(),
  participant_ids: z.array(z.string().uuid()).default([]),
});

export async function createCalendarEvent(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Ikke innlogget');

  const parsed = eventSchema.parse({
    project_id: String(formData.get('project_id')),
    title: String(formData.get('title')),
    description: formData.get('description') ? String(formData.get('description')) : undefined,
    start_date: String(formData.get('start_date')),
    start_time: formData.get('start_time') ? String(formData.get('start_time')) : undefined,
    end_time: formData.get('end_time') ? String(formData.get('end_time')) : undefined,
    location: formData.get('location') ? String(formData.get('location')) : undefined,
    milestone_id: formData.get('milestone_id') ? String(formData.get('milestone_id')) : undefined,
    task_id: formData.get('task_id') ? String(formData.get('task_id')) : undefined,
    participant_ids: formData.getAll('participant_ids').map(String),
  });

  const startDatetime = `${parsed.start_date}T${parsed.start_time || '09:00'}:00`;
  const endDatetime = parsed.end_time ? `${parsed.start_date}T${parsed.end_time}:00` : null;

  const { data: event, error } = await supabase
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
    .single();
  if (error) throw error;

  if (parsed.participant_ids.length > 0) {
    const rows = parsed.participant_ids.map((memberId) => ({ event_id: event.id, member_id: memberId }));
    const { error: participantsError } = await supabase.from('calendar_event_participants').insert(rows);
    if (participantsError) throw participantsError;
  }

  revalidatePath(`/prosjekter/${parsed.project_id}`, 'layout');
}

export async function deleteCalendarEvent(projectId: string, eventId: string) {
  const supabase = createClient();
  const { error } = await supabase.from('calendar_events').delete().eq('id', eventId);
  if (error) throw error;
  revalidatePath(`/prosjekter/${projectId}`, 'layout');
}
