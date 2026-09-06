import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, format, subDays } from 'date-fns';
import type { Database } from '@/types/supabase';
import type { MilestoneStatus, TaskStatus } from '@/types/enums';

/**
 * Eksempelprosjektet «Nytt kontor i Skien» – Nordmann Eiendom AS.
 *
 * Opprettes PER BRUKER (brukeren blir eier, Ola og Kari Nordmann er
 * fiktive medlemmer uten konto), slik at alle kan utforske hvordan
 * milepæler, oppgaver, timer, kalender, team og rapporter henger sammen –
 * og slette det igjen uten å påvirke andre. Alle datoer er relative til
 * «i dag», så prosjektet ser alltid levende ut: noe er ferdig, noe er
 * forsinket, noe er foran plan, og én milepæl har timeoverskridelse.
 *
 * Brukes både av server action (RLS, brukerens klient) og seed-scriptet
 * (service-role) – derfor ren funksjon som tar klienten som parameter.
 */

export const DEMO_PROJECT_NUMBER = 'EKSEMPEL';

const d = (offsetDays: number, from: Date) =>
  format(offsetDays >= 0 ? addDays(from, offsetDays) : subDays(from, -offsetDays), 'yyyy-MM-dd');

type MemberKey = 'owner' | 'ola' | 'kari';
type DeliverableKey = 'prosjektering' | 'moter' | 'befaring' | 'utforelse' | 'dokumentasjon';

interface MilestoneDef {
  key: string;
  title: string;
  description: string;
  responsible: MemberKey;
  plannedStart: number;
  plannedEnd: number;
  actualStart: number | null;
  actualEnd: number | null;
  hoursPerWeek: number;
  progress: number;
  status: MilestoneStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

const MILESTONES: MilestoneDef[] = [
  {
    key: 'forprosjekt',
    title: 'Forprosjekt og behovsanalyse',
    description: 'Kartlegge behov for 40 arbeidsplasser, 4 møterom og sosial sone. Skisser og kostnadsramme.',
    responsible: 'kari',
    plannedStart: -70,
    plannedEnd: -56,
    actualStart: -70,
    actualEnd: -58, // 2 dager foran plan
    hoursPerWeek: 12,
    progress: 100,
    status: 'completed',
    priority: 'high',
  },
  {
    key: 'rammesoknad',
    title: 'Rammesøknad til kommunen',
    description: 'Søknad om bruksendring og fasadeendring. Nabovarsel og ansvarsrett.',
    responsible: 'kari',
    plannedStart: -55,
    plannedEnd: -42,
    actualStart: -55,
    actualEnd: -33, // 9 dager forsinket – kommunen ba om tilleggsdokumentasjon
    hoursPerWeek: 6,
    progress: 100,
    status: 'completed',
    priority: 'critical',
  },
  {
    key: 'riving',
    title: 'Riving og klargjøring',
    description: 'Rive lettvegger og gammelt kjøkken, fjerne teppegulv, klargjøre for nye føringer.',
    responsible: 'ola',
    plannedStart: -35,
    plannedEnd: -22,
    actualStart: -32,
    actualEnd: -21,
    hoursPerWeek: 30,
    progress: 100,
    status: 'completed',
    priority: 'medium',
  },
  {
    key: 'elektro',
    title: 'Elektro og datakabling',
    description: 'Nye kurser til alle arbeidsplasser, belysning, nettverkspunkter og AV i møterom.',
    responsible: 'ola',
    plannedStart: -20,
    plannedEnd: 3,
    actualStart: -20,
    actualEnd: null, // pågår – og har brukt langt mer tid enn planlagt
    hoursPerWeek: 20,
    progress: 65,
    status: 'in_progress',
    priority: 'high',
  },
  {
    key: 'vegger',
    title: 'Nye skillevegger og glassfronter',
    description: 'Møterom med glassfronter, stillerom og telefonbokser. Lydkrav 44 dB mellom møterom.',
    responsible: 'ola',
    plannedStart: -12,
    plannedEnd: 12,
    actualStart: -10,
    actualEnd: null,
    hoursPerWeek: 25,
    progress: 40,
    status: 'in_progress',
    priority: 'medium',
  },
  {
    key: 'overflater',
    title: 'Maling og gulv',
    description: 'Male alle vegger, legge nytt gulvbelegg i åpent landskap og parkett i sosial sone.',
    responsible: 'ola',
    plannedStart: 8,
    plannedEnd: 24,
    actualStart: null,
    actualEnd: null,
    hoursPerWeek: 20,
    progress: 0,
    status: 'not_started',
    priority: 'medium',
  },
  {
    key: 'mobler',
    title: 'Møbler og innredning',
    description: 'Bestilling og montering av hev/senk-pulter, stoler, møteromsbord og kjøkkeninnredning.',
    responsible: 'kari',
    plannedStart: 20,
    plannedEnd: 38,
    actualStart: null,
    actualEnd: null,
    hoursPerWeek: 8,
    progress: 0,
    status: 'not_started',
    priority: 'medium',
  },
  {
    key: 'it',
    title: 'IT, AV og adgangskontroll',
    description: 'Nettverk, wifi, møteromsskjermer, printere og nøkkelkortsystem.',
    responsible: 'owner',
    plannedStart: 30,
    plannedEnd: 44,
    actualStart: null,
    actualEnd: null,
    hoursPerWeek: 10,
    progress: 0,
    status: 'not_started',
    priority: 'high',
  },
  {
    key: 'overtakelse',
    title: 'Sluttbefaring, overtakelse og innflytting',
    description: 'Ferdigbefaring med utleier, mangelliste, rengjøring og flyttehelg.',
    responsible: 'owner',
    plannedStart: 45,
    plannedEnd: 52,
    actualStart: null,
    actualEnd: null,
    hoursPerWeek: 6,
    progress: 0,
    status: 'not_started',
    priority: 'critical',
  },
];

interface TaskDef {
  title: string;
  description?: string;
  assignee: MemberKey;
  start?: number;
  due: number | null;
  status: TaskStatus;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  milestone?: string;
  completedOffset?: number;
}

const TASKS: TaskDef[] = [
  // Ferdige (viser historikk og ukesrapport)
  { title: 'Måle opp lokalet og lage plantegning', assignee: 'kari', start: -70, due: -64, status: 'done', milestone: 'forprosjekt', completedOffset: -65 },
  { title: 'Sende inn rammesøknad', assignee: 'kari', due: -50, status: 'done', milestone: 'rammesoknad', completedOffset: -50 },
  { title: 'Ettersende brannkonsept til kommunen', assignee: 'kari', due: -40, status: 'done', milestone: 'rammesoknad', completedOffset: -36, priority: 'high' },
  { title: 'Bestille container til riveavfall', assignee: 'ola', due: -34, status: 'done', milestone: 'riving', completedOffset: -34 },
  { title: 'Avstenge strøm i rivesonen', assignee: 'ola', due: -32, status: 'done', milestone: 'riving', completedOffset: -32 },
  { title: 'Bestille kabelgater og nettverkskabel', assignee: 'ola', due: -18, status: 'done', milestone: 'elektro', completedOffset: -19 },
  { title: 'Godkjenne fargeprøver med utleier', assignee: 'kari', due: -5, status: 'done', completedOffset: -4 },
  // Forfalte (rød på dashboard)
  { title: 'Avklare plassering av AV-utstyr i store møterom', assignee: 'kari', due: -3, status: 'in_progress', milestone: 'elektro', priority: 'high', description: 'Trenger svar fra IT før elektriker kan trekke kabler.' },
  { title: 'Bestille glassfronter (6 ukers leveringstid!)', assignee: 'ola', due: -2, status: 'not_started', milestone: 'vegger', priority: 'critical' },
  // Blokkert
  { title: 'Trekke kurser til kjøkkensone', assignee: 'ola', due: 2, status: 'blocked', milestone: 'elektro', description: 'Venter på at rørlegger flytter vannrør.' },
  // Forfaller snart
  { title: 'Kontrollmåling elektro og samsvarserklæring', assignee: 'ola', due: 3, status: 'not_started', milestone: 'elektro', priority: 'high' },
  { title: 'Bestille gulvbelegg og parkett', assignee: 'ola', due: 5, status: 'in_progress', milestone: 'overflater' },
  { title: 'Lydtest av ferdig møterom 1', assignee: 'ola', due: 6, status: 'not_started', milestone: 'vegger' },
  { title: 'Innhente tilbud på kontormøbler (3 leverandører)', assignee: 'kari', due: 7, status: 'in_progress', milestone: 'mobler' },
  // Lenger frem
  { title: 'Velge wifi-leverandør og dekningskart', assignee: 'owner', due: 14, status: 'not_started', milestone: 'it' },
  { title: 'Bestille nøkkelkort til alle ansatte', assignee: 'owner', due: 28, status: 'not_started', milestone: 'it' },
  { title: 'Planlegge flyttehelg og informere ansatte', assignee: 'owner', due: 40, status: 'not_started', milestone: 'overtakelse' },
  { title: 'Bestille flyttebyrå', assignee: 'owner', due: 35, status: 'not_started', milestone: 'overtakelse' },
  // Frittstående TODO-er (kan gjøres om til milepæl)
  { title: 'Vurdere solavskjerming på sørfasaden', assignee: 'kari', due: 10, status: 'not_started', description: 'Kom opp på byggemøtet. Kanskje egen milepæl?' },
  { title: 'Skilt ved inngang og i resepsjon', assignee: 'kari', due: 30, status: 'not_started' },
];

interface TimeEntryDef {
  member: MemberKey;
  milestone?: string;
  deliverable?: DeliverableKey;
  day: number;
  minutes: number;
  description: string;
  /** Deltagere i tillegg til member – gir participant_mode 'selected'/'all'. */
  participants?: MemberKey[];
  mode?: 'selected' | 'all';
}

const TIME_ENTRIES: TimeEntryDef[] = [
  // Forprosjekt (Kari) – 12 t/uke × 2 uker = 24 t planlagt, ca. 21 t registrert (under plan)
  { member: 'kari', milestone: 'forprosjekt', deliverable: 'prosjektering', day: -69, minutes: 300, description: 'Oppmåling og plantegning' },
  { member: 'kari', milestone: 'forprosjekt', deliverable: 'prosjektering', day: -66, minutes: 360, description: 'Skisser 3 alternative planløsninger' },
  { member: 'kari', milestone: 'forprosjekt', deliverable: 'moter', day: -63, minutes: 90, description: 'Gjennomgang av skisser med ledelsen', participants: ['owner'], mode: 'selected' },
  { member: 'kari', milestone: 'forprosjekt', deliverable: 'prosjektering', day: -60, minutes: 420, description: 'Kostnadsramme og tegningsgrunnlag' },
  // Rammesøknad (Kari) – planlagt 6 t/uke × 2 uker = 12 t, faktisk 3 uker, ca. 15 t
  { member: 'kari', milestone: 'rammesoknad', deliverable: 'dokumentasjon', day: -54, minutes: 240, description: 'Søknadsskjema og nabovarsel' },
  { member: 'kari', milestone: 'rammesoknad', deliverable: 'dokumentasjon', day: -48, minutes: 180, description: 'Ansvarsrett og gjennomføringsplan' },
  { member: 'kari', milestone: 'rammesoknad', deliverable: 'dokumentasjon', day: -38, minutes: 300, description: 'Tilleggsdokumentasjon brannkonsept (etterspurt av kommunen)' },
  { member: 'kari', milestone: 'rammesoknad', deliverable: 'moter', day: -36, minutes: 60, description: 'Telefonmøte med saksbehandler' },
  // Riving (Ola) – 30 t/uke × 2 uker = 60 t, registrert ca. 56 t
  { member: 'ola', milestone: 'riving', deliverable: 'utforelse', day: -31, minutes: 480, description: 'Riving lettvegger sone A' },
  { member: 'ola', milestone: 'riving', deliverable: 'utforelse', day: -30, minutes: 480, description: 'Riving lettvegger sone B, bortkjøring' },
  { member: 'ola', milestone: 'riving', deliverable: 'utforelse', day: -28, minutes: 450, description: 'Fjerne kjøkkeninnredning' },
  { member: 'ola', milestone: 'riving', deliverable: 'utforelse', day: -27, minutes: 480, description: 'Fjerne teppegulv, avrette' },
  { member: 'ola', milestone: 'riving', deliverable: 'utforelse', day: -24, minutes: 420, description: 'Klargjøre føringsveier' },
  { member: 'ola', milestone: 'riving', deliverable: 'utforelse', day: -22, minutes: 360, description: 'Rydding og støvsuging før elektro' },
  { member: 'ola', milestone: 'riving', deliverable: 'befaring', day: -21, minutes: 90, description: 'Befaring etter riving', participants: ['owner', 'kari'], mode: 'all' },
  // Elektro (Ola) – 20 t/uke × ~3,5 uker ≈ 70–80 t planlagt, registrert ~105 t = STOR OVERSKRIDELSE
  { member: 'ola', milestone: 'elektro', deliverable: 'utforelse', day: -19, minutes: 480, description: 'Kabelgater sone A' },
  { member: 'ola', milestone: 'elektro', deliverable: 'utforelse', day: -18, minutes: 480, description: 'Kabelgater sone B' },
  { member: 'ola', milestone: 'elektro', deliverable: 'utforelse', day: -17, minutes: 510, description: 'Trekke kurser – flere skjulte hindringer i tak' },
  { member: 'ola', milestone: 'elektro', deliverable: 'utforelse', day: -14, minutes: 480, description: 'Trekke kurser sone B' },
  { member: 'ola', milestone: 'elektro', deliverable: 'utforelse', day: -13, minutes: 540, description: 'Omlegging – eksisterende føringer var ikke som tegnet' },
  { member: 'ola', milestone: 'elektro', deliverable: 'utforelse', day: -12, minutes: 480, description: 'Nettverkspunkter alle arbeidsplasser' },
  { member: 'ola', milestone: 'elektro', deliverable: 'utforelse', day: -10, minutes: 480, description: 'Belysning åpent landskap' },
  { member: 'ola', milestone: 'elektro', deliverable: 'utforelse', day: -7, minutes: 495, description: 'Belysning møterom, dimmere' },
  { member: 'ola', milestone: 'elektro', deliverable: 'utforelse', day: -6, minutes: 480, description: 'AV-kabling møterom 1–2' },
  { member: 'ola', milestone: 'elektro', deliverable: 'utforelse', day: -3, minutes: 450, description: 'Feilsøking jordfeil sone A' },
  { member: 'ola', milestone: 'elektro', deliverable: 'utforelse', day: -1, minutes: 420, description: 'Retting etter feilsøking, merking av kurser' },
  { member: 'owner', milestone: 'elektro', deliverable: 'moter', day: -5, minutes: 60, description: 'Avklaringsmøte AV-utstyr med IT', participants: ['kari'], mode: 'selected' },
  // Vegger (Ola) – 25 t/uke × ~3,5 uker, registrert ~30 t så langt (i rute)
  { member: 'ola', milestone: 'vegger', deliverable: 'utforelse', day: -9, minutes: 480, description: 'Stenderverk møterom 1 og 2' },
  { member: 'ola', milestone: 'vegger', deliverable: 'utforelse', day: -8, minutes: 480, description: 'Isolasjon og gips møterom 1' },
  { member: 'ola', milestone: 'vegger', deliverable: 'utforelse', day: -4, minutes: 420, description: 'Gips møterom 2, sparkling' },
  { member: 'ola', milestone: 'vegger', deliverable: 'utforelse', day: -2, minutes: 450, description: 'Stillerom og telefonbokser' },
  // Møbler (Kari) – forarbeid
  { member: 'kari', milestone: 'mobler', deliverable: 'prosjektering', day: -6, minutes: 180, description: 'Møbleringsplan og kravspesifikasjon' },
  // Faste møter (hele teamet) – gir gruppetid til alle
  { member: 'owner', deliverable: 'moter', day: -28, minutes: 60, description: 'Ukentlig byggemøte', participants: ['ola', 'kari'], mode: 'all' },
  { member: 'owner', deliverable: 'moter', day: -21, minutes: 60, description: 'Ukentlig byggemøte', participants: ['ola', 'kari'], mode: 'all' },
  { member: 'owner', deliverable: 'moter', day: -14, minutes: 75, description: 'Ukentlig byggemøte – gjennomgang av elektro-avvik', participants: ['ola', 'kari'], mode: 'all' },
  { member: 'owner', deliverable: 'moter', day: -7, minutes: 60, description: 'Ukentlig byggemøte', participants: ['ola', 'kari'], mode: 'all' },
  { member: 'owner', deliverable: 'dokumentasjon', day: -1, minutes: 120, description: 'Oppdatere fremdriftsplan og statusrapport til styret' },
];

interface EventDef {
  title: string;
  description?: string;
  day: number;
  hour: number;
  durationMinutes: number;
  location: string;
  milestone?: string;
  participants: MemberKey[];
}

const EVENTS: EventDef[] = [
  { title: 'Byggemøte', description: 'Fast ukentlig byggemøte. Agenda: fremdrift, avvik, neste uke.', day: -7, hour: 9, durationMinutes: 60, location: 'Byggeplassen, 2. etasje', participants: ['owner', 'ola', 'kari'] },
  { title: 'Byggemøte', description: 'Fast ukentlig byggemøte.', day: 0, hour: 9, durationMinutes: 60, location: 'Byggeplassen, 2. etasje', participants: ['owner', 'ola', 'kari'] },
  { title: 'Befaring elektro med eltilsyn', day: 2, hour: 13, durationMinutes: 90, location: 'Byggeplassen', milestone: 'elektro', participants: ['ola', 'owner'] },
  { title: 'Leverandørmøte glassfronter', description: 'Avklare mål og leveringstid. Kritisk for fremdrift.', day: 3, hour: 10, durationMinutes: 60, location: 'Teams', milestone: 'vegger', participants: ['ola', 'kari'] },
  { title: 'Byggemøte', day: 7, hour: 9, durationMinutes: 60, location: 'Byggeplassen, 2. etasje', participants: ['owner', 'ola', 'kari'] },
  { title: 'Møbelvisning hos leverandør', day: 9, hour: 12, durationMinutes: 120, location: 'Porsgrunn', milestone: 'mobler', participants: ['kari', 'owner'] },
  { title: 'Byggemøte', day: 14, hour: 9, durationMinutes: 60, location: 'Byggeplassen, 2. etasje', participants: ['owner', 'ola', 'kari'] },
  { title: 'Statusmøte styret', description: 'Presentere fremdrift, økonomi og risiko.', day: 16, hour: 14, durationMinutes: 45, location: 'Teams', participants: ['owner'] },
  { title: 'Leveranse og montering møbler', day: 33, hour: 8, durationMinutes: 480, location: 'Byggeplassen', milestone: 'mobler', participants: ['kari', 'ola'] },
  { title: 'Sluttbefaring med utleier', day: 46, hour: 10, durationMinutes: 120, location: 'Byggeplassen', milestone: 'overtakelse', participants: ['owner', 'ola', 'kari'] },
  { title: 'Flyttehelg', day: 50, hour: 8, durationMinutes: 600, location: 'Gammelt og nytt kontor', milestone: 'overtakelse', participants: ['owner', 'ola', 'kari'] },
];

const DELIVERABLES: Array<{ key: DeliverableKey; name: string; description: string }> = [
  { key: 'prosjektering', name: 'Prosjektering', description: 'Tegning, planlegging og kravspesifikasjon' },
  { key: 'moter', name: 'Møter', description: 'Byggemøter, avklaringsmøter, leverandørmøter' },
  { key: 'befaring', name: 'Befaring', description: 'Befaringer og kontroller på byggeplass' },
  { key: 'utforelse', name: 'Utførelse', description: 'Fysisk arbeid på byggeplassen' },
  { key: 'dokumentasjon', name: 'Dokumentasjon', description: 'Søknader, rapporter, FDV' },
];

function fail(msg: string, error: unknown): never {
  const detail = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '';
  throw new Error(`${msg}${detail ? `: ${detail}` : ''}`);
}

/**
 * Oppretter eksempelprosjektet for gitt bruker og returnerer prosjekt-id.
 * Brukeren blir owner via databasetriggeren on_project_created.
 */
export async function insertDemoProject(
  supabase: SupabaseClient<Database>,
  ownerUserId: string,
  today: Date = new Date(),
): Promise<string> {
  const day = (offset: number) => d(offset, today);

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      name: 'Eksempelprosjekt – Nytt kontor i Skien',
      project_number: DEMO_PROJECT_NUMBER,
      description:
        'Fiktivt eksempelprosjekt som viser hvordan ComPro henger sammen: ombygging av 600 m² til nytt kontor for 40 ansatte. ' +
        'Ola Nordmann er byggeleder, Kari Nordmann er arkitekt, og du er prosjektleder. Slett prosjektet under Innstillinger når du er ferdig med å utforske.',
      client_name: 'Nordmann Eiendom AS',
      project_manager_id: ownerUserId,
      start_date: day(-70),
      planned_end_date: day(52),
      status: 'active',
      color: '#0f766e',
      created_by: ownerUserId,
    })
    .select('id')
    .single();
  if (projectError || !project) fail('Kunne ikke opprette prosjektet', projectError);
  const projectId = project.id;

  // Eier (opprettet av trigger) – sett prosjektrolle
  const { data: ownerMember, error: ownerError } = await supabase
    .from('project_members')
    .update({ project_role_title: 'Prosjektleder' })
    .eq('project_id', projectId)
    .eq('user_id', ownerUserId)
    .select('id')
    .single();
  if (ownerError || !ownerMember) {
    fail('Fant ikke eier-medlemmet. Er migrasjon 0004 kjørt?', ownerError);
  }

  const { data: others, error: membersError } = await supabase
    .from('project_members')
    .insert([
      {
        project_id: projectId,
        invited_email: 'ola.nordmann@eksempel.no',
        email: 'ola.nordmann@eksempel.no',
        first_name: 'Ola',
        last_name: 'Nordmann',
        phone: '900 00 001',
        role: 'member',
        project_role_title: 'Byggeleder',
      },
      {
        project_id: projectId,
        invited_email: 'kari.nordmann@eksempel.no',
        email: 'kari.nordmann@eksempel.no',
        first_name: 'Kari',
        last_name: 'Nordmann',
        phone: '900 00 002',
        role: 'admin',
        project_role_title: 'Arkitekt',
      },
    ])
    .select('id, first_name');
  if (membersError || !others) fail('Kunne ikke legge til Ola og Kari', membersError);

  const memberId: Record<MemberKey, string> = {
    owner: ownerMember.id,
    ola: others.find((m) => m.first_name === 'Ola')!.id,
    kari: others.find((m) => m.first_name === 'Kari')!.id,
  };

  const { data: deliverables, error: deliverablesError } = await supabase
    .from('deliverables')
    .insert(DELIVERABLES.map((x, i) => ({ project_id: projectId, name: x.name, description: x.description, sort_order: i })))
    .select('id, name');
  if (deliverablesError || !deliverables) fail('Kunne ikke opprette leveranser', deliverablesError);
  const deliverableId = Object.fromEntries(
    DELIVERABLES.map((x) => [x.key, deliverables.find((r) => r.name === x.name)!.id]),
  ) as Record<DeliverableKey, string>;

  const { data: milestones, error: milestonesError } = await supabase
    .from('milestones')
    .insert(
      MILESTONES.map((m, i) => ({
        project_id: projectId,
        title: m.title,
        description: m.description,
        responsible_member_id: memberId[m.responsible],
        planned_start_date: day(m.plannedStart),
        planned_end_date: day(m.plannedEnd),
        actual_start_date: m.actualStart == null ? null : day(m.actualStart),
        actual_end_date: m.actualEnd == null ? null : day(m.actualEnd),
        estimated_hours_per_week: m.hoursPerWeek,
        progress_percent: m.progress,
        status: m.status,
        priority: m.priority,
        sort_order: i,
      })),
    )
    .select('id, title');
  if (milestonesError || !milestones) fail('Kunne ikke opprette milepæler', milestonesError);
  const milestoneId = Object.fromEntries(
    MILESTONES.map((m) => [m.key, milestones.find((r) => r.title === m.title)!.id]),
  ) as Record<string, string>;

  const { error: tasksError } = await supabase.from('tasks').insert(
    TASKS.map((t) => ({
      project_id: projectId,
      title: t.title,
      description: t.description ?? null,
      assignee_id: memberId[t.assignee],
      start_date: t.start == null ? null : day(t.start),
      due_date: t.due == null ? null : day(t.due),
      status: t.status,
      priority: t.priority ?? 'medium',
      milestone_id: t.milestone ? milestoneId[t.milestone]! : null,
      created_by: ownerUserId,
      completed_at: t.completedOffset == null ? null : `${day(t.completedOffset)}T14:00:00Z`,
    })),
  );
  if (tasksError) fail('Kunne ikke opprette oppgaver', tasksError);

  for (const e of TIME_ENTRIES) {
    const participants = e.participants ?? [];
    const { data: entry, error: entryError } = await supabase
      .from('time_entries')
      .insert({
        project_id: projectId,
        milestone_id: e.milestone ? milestoneId[e.milestone]! : null,
        deliverable_id: e.deliverable ? deliverableId[e.deliverable] : null,
        member_id: memberId[e.member],
        work_date: day(e.day),
        duration_minutes: e.minutes,
        description: e.description,
        participant_mode: participants.length === 0 ? 'single' : (e.mode ?? 'selected'),
      })
      .select('id')
      .single();
    if (entryError || !entry) fail('Kunne ikke registrere timer', entryError);
    if (participants.length > 0) {
      const { error: pError } = await supabase
        .from('time_entry_participants')
        .insert(participants.map((p) => ({ time_entry_id: entry.id, member_id: memberId[p] })));
      if (pError) fail('Kunne ikke registrere deltagere', pError);
    }
  }

  for (const ev of EVENTS) {
    const start = new Date(today);
    start.setDate(start.getDate() + ev.day);
    start.setHours(ev.hour, 0, 0, 0);
    const end = new Date(start.getTime() + ev.durationMinutes * 60_000);
    const { data: event, error: eventError } = await supabase
      .from('calendar_events')
      .insert({
        project_id: projectId,
        title: ev.title,
        description: ev.description ?? null,
        start_datetime: start.toISOString(),
        end_datetime: end.toISOString(),
        location: ev.location,
        milestone_id: ev.milestone ? milestoneId[ev.milestone]! : null,
        created_by: ownerUserId,
      })
      .select('id')
      .single();
    if (eventError || !event) fail('Kunne ikke opprette kalenderhendelse', eventError);
    const { error: pError } = await supabase
      .from('calendar_event_participants')
      .insert(ev.participants.map((p) => ({ event_id: event.id, member_id: memberId[p] })));
    if (pError) fail('Kunne ikke legge til deltagere på hendelse', pError);
  }

  // Litt historikk i aktivitetsloggen
  const logRows = [
    { entity_type: 'project' as const, entity_id: projectId, action: 'created' as const, metadata: { demo: true }, created_at: `${day(-70)}T08:00:00Z` },
    { entity_type: 'milestone' as const, entity_id: milestoneId.forprosjekt!, action: 'completed' as const, metadata: {}, created_at: `${day(-58)}T15:00:00Z` },
    { entity_type: 'milestone' as const, entity_id: milestoneId.rammesoknad!, action: 'completed' as const, metadata: {}, created_at: `${day(-33)}T12:00:00Z` },
    { entity_type: 'milestone' as const, entity_id: milestoneId.riving!, action: 'completed' as const, metadata: {}, created_at: `${day(-21)}T16:00:00Z` },
    { entity_type: 'milestone' as const, entity_id: milestoneId.elektro!, action: 'updated' as const, metadata: { progress_percent: 65 }, created_at: `${day(-1)}T16:30:00Z` },
    { entity_type: 'member' as const, entity_id: memberId.ola, action: 'invited' as const, metadata: { email: 'ola.nordmann@eksempel.no' }, created_at: `${day(-69)}T09:00:00Z` },
    { entity_type: 'member' as const, entity_id: memberId.kari, action: 'invited' as const, metadata: { email: 'kari.nordmann@eksempel.no' }, created_at: `${day(-69)}T09:05:00Z` },
  ];
  const { error: logError } = await supabase
    .from('activity_log')
    .insert(logRows.map((r) => ({ ...r, project_id: projectId, actor_id: ownerUserId })));
  if (logError) fail('Kunne ikke skrive aktivitetslogg', logError);

  return projectId;
}
