/**
 * Seed-script for demoprosjektet "Eksempelprosjekt – nytt kontor".
 *
 * Kjøres med: npm run seed
 * Krever SUPABASE_SERVICE_ROLE_KEY i .env.local (service-rollen omgår RLS
 * og skal ALDRI brukes i klientkode – kun her og i andre server-only
 * administrasjonsskript).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { addDays, formatISO, subDays } from 'date-fns';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const today = new Date();
const iso = (d: Date) => formatISO(d, { representation: 'date' });

async function main() {
  console.log('Oppretter demobruker...');
  const demoEmail = 'demo@prosjektflyt.no';
  const { data: existing } = await supabase.auth.admin.listUsers();
  let ownerUserId = existing.users.find((u) => u.email === demoEmail)?.id;

  if (!ownerUserId) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: demoEmail,
      password: 'ProsjektFlyt123!',
      email_confirm: true,
      user_metadata: { full_name: 'Jon Prosjektleder' },
    });
    if (error) throw error;
    ownerUserId = created.user.id;
  }

  console.log('Oppretter demoprosjekt...');
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      name: 'Eksempelprosjekt – nytt kontor',
      project_number: 'DEMO-001',
      description: 'Ombygging og innredning av nytt kontorlokale for 40 ansatte.',
      client_name: 'Acme Eiendom AS',
      project_manager_id: ownerUserId,
      start_date: iso(subDays(today, 60)),
      planned_end_date: iso(addDays(today, 90)),
      status: 'active',
      color: '#2563eb',
      created_by: ownerUserId,
    })
    .select('id')
    .single();
  if (projectError) throw projectError;
  const projectId = project.id as string;

  console.log('Legger til medlemmer...');
  const memberDefs = [
    { first_name: 'Jon', last_name: 'Prosjektleder', role: 'owner', title: 'Prosjektleder', user_id: ownerUserId },
    { first_name: 'Kari', last_name: 'Arkitekt', role: 'admin', title: 'Arkitekt' },
    { first_name: 'Per', last_name: 'Byggeleder', role: 'member', title: 'Byggeleder' },
    { first_name: 'Nina', last_name: 'Elektriker', role: 'member', title: 'Elektriker' },
    { first_name: 'Ola', last_name: 'Snekker', role: 'member', title: 'Snekker' },
  ];
  const { data: members, error: membersError } = await supabase
    .from('project_members')
    .insert(
      memberDefs.map((m) => ({
        project_id: projectId,
        user_id: m.user_id ?? null,
        invited_email: m.user_id ? null : `${m.first_name.toLowerCase()}@eksempel.no`,
        email: `${m.first_name.toLowerCase()}@eksempel.no`,
        first_name: m.first_name,
        last_name: m.last_name,
        role: m.role,
        project_role_title: m.title,
      })),
    )
    .select('id, first_name');
  if (membersError) throw membersError;

  const memberId = (firstName: string) => members.find((m) => m.first_name === firstName)!.id as string;

  console.log('Legger til leveransekategorier...');
  const { data: deliverables, error: deliverablesError } = await supabase
    .from('deliverables')
    .insert(
      ['Prosjektering', 'Møter', 'Befaring', 'Elektro', 'Snekkerarbeid', 'Dokumentasjon'].map((name, i) => ({
        project_id: projectId,
        name,
        sort_order: i,
      })),
    )
    .select('id, name');
  if (deliverablesError) throw deliverablesError;
  const deliverableId = (name: string) => deliverables.find((d) => d.name === name)!.id as string;

  console.log('Oppretter milepæler...');
  const milestoneDefs = [
    {
      title: 'Forprosjekt og skisser',
      responsible: 'Kari',
      plannedStart: subDays(today, 60),
      plannedEnd: subDays(today, 45),
      actualStart: subDays(today, 60),
      actualEnd: subDays(today, 44),
      hoursPerWeek: 15,
      progress: 100,
      status: 'completed',
    },
    {
      title: 'Rammesøknad',
      responsible: 'Kari',
      plannedStart: subDays(today, 44),
      plannedEnd: subDays(today, 30),
      actualStart: subDays(today, 44),
      actualEnd: subDays(today, 20), // forsinket
      hoursPerWeek: 8,
      progress: 100,
      status: 'completed',
    },
    {
      title: 'Riving og klargjøring',
      responsible: 'Per',
      plannedStart: subDays(today, 30),
      plannedEnd: subDays(today, 16),
      actualStart: subDays(today, 28),
      actualEnd: subDays(today, 14),
      hoursPerWeek: 20,
      progress: 100,
      status: 'completed',
    },
    {
      title: 'Elektrisk grunnarbeid',
      responsible: 'Nina',
      plannedStart: subDays(today, 14),
      plannedEnd: addDays(today, 7),
      actualStart: subDays(today, 14),
      actualEnd: null,
      hoursPerWeek: 25, // stort timeoverskritt vs registrert, se time entries
      progress: 60,
      status: 'in_progress',
    },
    {
      title: 'Snekkerarbeid – innredning',
      responsible: 'Ola',
      plannedStart: subDays(today, 7),
      plannedEnd: addDays(today, 21),
      actualStart: subDays(today, 5),
      actualEnd: null,
      hoursPerWeek: 30,
      progress: 30,
      status: 'in_progress',
    },
    {
      title: 'Møbler og innredning',
      responsible: 'Kari',
      plannedStart: addDays(today, 10),
      plannedEnd: addDays(today, 30),
      actualStart: null,
      actualEnd: null,
      hoursPerWeek: 10,
      progress: 0,
      status: 'not_started',
    },
    {
      title: 'IT og nettverk',
      responsible: 'Nina',
      plannedStart: addDays(today, 20),
      plannedEnd: addDays(today, 35),
      actualStart: null,
      actualEnd: null,
      hoursPerWeek: 12,
      progress: 0,
      status: 'not_started',
    },
    {
      title: 'Sluttbefaring og overtakelse',
      responsible: 'Jon',
      plannedStart: addDays(today, 80),
      plannedEnd: addDays(today, 90),
      actualStart: null,
      actualEnd: null,
      hoursPerWeek: 5,
      progress: 0,
      status: 'not_started',
    },
    {
      // Milepæl foran plan
      title: 'Brannsikring – forprosjekt',
      responsible: 'Per',
      plannedStart: subDays(today, 20),
      plannedEnd: addDays(today, 5),
      actualStart: subDays(today, 20),
      actualEnd: subDays(today, 2),
      hoursPerWeek: 6,
      progress: 100,
      status: 'completed',
    },
  ];

  const { data: milestones, error: milestonesError } = await supabase
    .from('milestones')
    .insert(
      milestoneDefs.map((m, i) => ({
        project_id: projectId,
        title: m.title,
        responsible_member_id: memberId(m.responsible),
        planned_start_date: iso(m.plannedStart),
        planned_end_date: iso(m.plannedEnd),
        actual_start_date: m.actualStart ? iso(m.actualStart) : null,
        actual_end_date: m.actualEnd ? iso(m.actualEnd) : null,
        estimated_hours_per_week: m.hoursPerWeek,
        progress_percent: m.progress,
        status: m.status,
        sort_order: i,
      })),
    )
    .select('id, title');
  if (milestonesError) throw milestonesError;
  const milestoneId = (title: string) => milestones.find((m) => m.title === title)!.id as string;

  console.log('Oppretter oppgaver...');
  const taskDefs: Array<{
    title: string;
    assignee: string;
    due: Date | null;
    status: 'not_started' | 'in_progress' | 'blocked' | 'done';
    milestone?: string;
  }> = [
    { title: 'Bestille armaturer', assignee: 'Nina', due: addDays(today, 3), status: 'in_progress', milestone: 'Elektrisk grunnarbeid' },
    { title: 'Bestille gulvbelegg', assignee: 'Ola', due: addDays(today, 5), status: 'not_started', milestone: 'Snekkerarbeid – innredning' },
    { title: 'Avklare fargevalg med kunde', assignee: 'Kari', due: subDays(today, 2), status: 'not_started' }, // forfalt
    { title: 'Bestille kontorstoler', assignee: 'Kari', due: addDays(today, 25), status: 'not_started', milestone: 'Møbler og innredning' },
    { title: 'Kontrollere brannvarslingsanlegg', assignee: 'Per', due: subDays(today, 1), status: 'not_started' }, // forfalt
    { title: 'Montere downlights møterom', assignee: 'Nina', due: addDays(today, 2), status: 'in_progress', milestone: 'Elektrisk grunnarbeid' },
    { title: 'Sette opp skillevegger', assignee: 'Ola', due: addDays(today, 10), status: 'not_started', milestone: 'Snekkerarbeid – innredning' },
    { title: 'Bestille nettverksswitcher', assignee: 'Nina', due: addDays(today, 22), status: 'not_started', milestone: 'IT og nettverk' },
    { title: 'Planlegge flyttedag', assignee: 'Jon', due: addDays(today, 85), status: 'not_started', milestone: 'Sluttbefaring og overtakelse' },
    { title: 'Sende inn rammesøknad', assignee: 'Kari', due: subDays(today, 30), status: 'done', milestone: 'Rammesøknad' },
    { title: 'Rive gammel kjøkkeninnredning', assignee: 'Per', due: subDays(today, 20), status: 'done', milestone: 'Riving og klargjøring' },
    { title: 'Trekke nye kurser til møterom', assignee: 'Nina', due: addDays(today, 1), status: 'blocked', milestone: 'Elektrisk grunnarbeid' },
    { title: 'Male vegger fellesareal', assignee: 'Ola', due: addDays(today, 12), status: 'not_started', milestone: 'Snekkerarbeid – innredning' },
    { title: 'Bestille skilting', assignee: 'Kari', due: addDays(today, 40), status: 'not_started' },
    { title: 'Avtale renhold etter ferdigstillelse', assignee: 'Jon', due: addDays(today, 88), status: 'not_started' },
    { title: 'Kontrollmåling elektro', assignee: 'Nina', due: addDays(today, 8), status: 'not_started', milestone: 'Elektrisk grunnarbeid' },
    { title: 'Montere kjøkkeninnredning', assignee: 'Ola', due: addDays(today, 15), status: 'in_progress', milestone: 'Snekkerarbeid – innredning' },
    { title: 'Godkjenne fargeprøver', assignee: 'Kari', due: addDays(today, 4), status: 'not_started' },
    { title: 'Bestille prosjektskilt byggeplass', assignee: 'Per', due: subDays(today, 25), status: 'done' },
    { title: 'Sluttdokumentasjon elektro', assignee: 'Nina', due: addDays(today, 6), status: 'not_started', milestone: 'Elektrisk grunnarbeid' },
  ];

  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .insert(
      taskDefs.map((t) => ({
        project_id: projectId,
        title: t.title,
        assignee_id: memberId(t.assignee),
        due_date: t.due ? iso(t.due) : null,
        status: t.status,
        milestone_id: t.milestone ? milestoneId(t.milestone) : null,
        created_by: ownerUserId,
        completed_at: t.status === 'done' ? iso(subDays(today, 25)) : null,
      })),
    )
    .select('id');
  if (tasksError) throw tasksError;

  console.log('Registrerer timer...');
  const timeEntryDefs = [
    { member: 'Nina', milestone: 'Elektrisk grunnarbeid', date: subDays(today, 10), minutes: 480, desc: 'Legge kabelgater' },
    { member: 'Nina', milestone: 'Elektrisk grunnarbeid', date: subDays(today, 8), minutes: 420, desc: 'Trekke kabler' },
    { member: 'Nina', milestone: 'Elektrisk grunnarbeid', date: subDays(today, 6), minutes: 390, desc: 'Montere kurser' },
    { member: 'Nina', milestone: 'Elektrisk grunnarbeid', date: subDays(today, 3), minutes: 300, desc: 'Feilsøking' },
    { member: 'Nina', milestone: 'Elektrisk grunnarbeid', date: subDays(today, 1), minutes: 255, desc: 'Kontrollmåling' },
    { member: 'Ola', milestone: 'Snekkerarbeid – innredning', date: subDays(today, 4), minutes: 480, desc: 'Sette opp skillevegger' },
    { member: 'Ola', milestone: 'Snekkerarbeid – innredning', date: subDays(today, 2), minutes: 360, desc: 'Måling' },
    { member: 'Per', milestone: 'Riving og klargjøring', date: subDays(today, 25), minutes: 480, desc: 'Riving' },
    { member: 'Kari', milestone: 'Forprosjekt og skisser', date: subDays(today, 55), minutes: 600, desc: 'Skisseprosjekt' },
  ];
  for (const e of timeEntryDefs) {
    const { error } = await supabase.from('time_entries').insert({
      project_id: projectId,
      milestone_id: milestoneId(e.milestone),
      member_id: memberId(e.member),
      work_date: iso(e.date),
      duration_minutes: e.minutes,
      description: e.desc,
      participant_mode: 'single',
      deliverable_id: deliverableId('Elektro') && e.milestone.includes('Elektrisk') ? deliverableId('Elektro') : null,
    });
    if (error) throw error;
  }

  // Gruppetid: prosjekteringsmøte med hele teamet
  const { data: groupEntry, error: groupEntryError } = await supabase
    .from('time_entries')
    .insert({
      project_id: projectId,
      member_id: memberId('Jon'),
      work_date: iso(subDays(today, 7)),
      duration_minutes: 90,
      description: 'Ukentlig prosjekteringsmøte',
      participant_mode: 'all',
      deliverable_id: deliverableId('Møter'),
    })
    .select('id')
    .single();
  if (groupEntryError) throw groupEntryError;
  const otherMembers = members.filter((m) => m.first_name !== 'Jon');
  const { error: participantsError } = await supabase
    .from('time_entry_participants')
    .insert(otherMembers.map((m) => ({ time_entry_id: groupEntry.id, member_id: m.id })));
  if (participantsError) throw participantsError;

  console.log('Legger inn kalenderhendelser...');
  const eventDefs = [
    { title: 'Ukentlig prosjekteringsmøte', start: subDays(today, 7), hour: 9, location: 'Teams' },
    { title: 'Befaring elektro', start: addDays(today, 2), hour: 13, location: 'Byggeplass', milestone: 'Elektrisk grunnarbeid' },
    { title: 'Kundemøte – fargevalg', start: addDays(today, 4), hour: 10, location: 'Kontor Acme' },
    { title: 'Byggemøte', start: addDays(today, 7), hour: 9, location: 'Byggeplass' },
    { title: 'Leveranse møbler', start: addDays(today, 25), hour: 8, location: 'Byggeplass', milestone: 'Møbler og innredning' },
    { title: 'Sluttbefaring', start: addDays(today, 89), hour: 9, location: 'Byggeplass', milestone: 'Sluttbefaring og overtakelse' },
    { title: 'Statusmøte IT', start: addDays(today, 21), hour: 14, location: 'Teams', milestone: 'IT og nettverk' },
    { title: 'Vernerunde', start: addDays(today, 12), hour: 11, location: 'Byggeplass' },
  ];
  for (const e of eventDefs) {
    const start = new Date(e.start);
    start.setHours(e.hour, 0, 0, 0);
    const { error } = await supabase.from('calendar_events').insert({
      project_id: projectId,
      title: e.title,
      start_datetime: start.toISOString(),
      location: e.location,
      created_by: ownerUserId,
      milestone_id: e.milestone ? milestoneId(e.milestone) : null,
    });
    if (error) throw error;
  }

  console.log(`\nFerdig! Demoprosjekt opprettet: ${projectId}`);
  console.log(`Logg inn med: ${demoEmail} / ProsjektFlyt123!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
