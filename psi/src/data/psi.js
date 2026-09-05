/* ============================================================
   PSI – Porsgrunn Studentidrettslag: ALT INNHOLD SOM KAN ENDRES

   Dette er den ene fila et styremedlem trenger å redigere når
   - en gruppeleder byttes
   - en treningstid flyttes
   - en Spond-lenke eller -kode endres
   - kontaktinfo, medlemslenke eller statistikk oppdateres

   Tekst som vises til brukeren finnes på to språk: { nb: '…', en: '…' }.
   Rene fakta (koder, e-post, lenker, tider) står én gang.

   Spond er alltid fasit for den aktuelle uka. Det som står her er
   grunnskjemaet, og nettsiden sier det eksplisitt.

   Bilder: sett `image` til en sti under /public (f.eks. '/img/fotball.jpg')
   når ekte bilder fra PSI-aktivitet er på plass. Til da vises en tydelig
   plassholder. Ikke bruk genererte bilder av «medlemmer».
   ============================================================ */

export const site = {
  domain: 'https://psiusn.no',
  currentSemester: { nb: 'Høst 2026', en: 'Autumn 2026' },
  lastUpdated: '2026-09-05',
  // Medlemskap går gjennom SiG. Endre lenken her hvis SiG flytter siden.
  membershipUrl: 'https://www.sig.no/informasjon/bli-medlem/',
  mainContact: 'leder@sig.no',
  instagram: null,      // f.eks. 'https://www.instagram.com/psiusn'
  facebook: null,
  // PSI-logo: legg fila i /public og sett stien her, f.eks. '/psi-logo.svg'.
  // Er den null, vises en tekstbasert PSI-merkelapp.
  logo: null,
};

export const organization = {
  name: 'Porsgrunn Studentidrettslag',
  shortName: 'PSI',
  campus: 'USN Campus Porsgrunn',
  // Dagens struktur. Endres bare hvis noe faktisk er vedtatt.
  currentRelationToSiG: {
    nb: 'PSI er i dag en del av Studentsamfunnet i Grenland (SiG).',
    en: 'PSI is currently part of Studentsamfunnet i Grenland (SiG), the student society in Grenland.',
  },
  parent: { name: 'Studentsamfunnet i Grenland (SiG)', url: 'https://www.sig.no/' },
  leader: { name: 'Jon L. Leiulfsrud', role: { nb: 'Leder, PSI', en: 'Head of PSI' }, email: 'leder@sig.no' },
  tagline: {
    nb: 'Studentidrett ved USN Campus Porsgrunn – laget av studenter, for studenter.',
    en: 'Student sports at USN Campus Porsgrunn – made by students, for students.',
  },
  values: { nb: 'Lav terskel. Sosialt. Studentdrevet.', en: 'Low threshold. Social. Student-run.' },
};

/* Tall som vises på siden. Alltid datert, alltid herfra. */
export const stats = {
  asOf: { nb: 'september 2026', en: 'September 2026' },
  uniqueParticipants: '~250',
  activeSports: 5,
};

/* ------------------------------------------------------------
   IDRETTSGRUPPER. Kun aktive grupper har active: true.
   schedule: grunnskjema. Én rad per fast økt.
     day: 1 = mandag … 7 = søndag
     from/to: 'HH:MM'
     venue: sted for akkurat denne økta (overstyrer gruppas venue)
     from_date: valgfri ISO-dato for når økta starter
     note: kort merknad, f.eks. 'Maks 20, venteliste'
   ------------------------------------------------------------ */
export const sports = [
  {
    slug: 'fotball',
    active: true,
    name: 'PSI Fotball',
    shortName: { nb: 'Fotball', en: 'Football' },
    icon: '⚽',
    image: null,
    leader: 'Michelle Christophersen',
    email: 'fotball@sig.no',
    spondCode: 'TYUQQ',
    spondInviteUrl: 'https://spond.com/invite/TYUQQ',
    shortDescription: {
      nb: 'Aktiv gruppe med høy etterspørsel. Faste økter i Porsgrunn Arena, ute på Kjølnes når været tillater.',
      en: 'Active group with high demand. Regular sessions at Porsgrunn Arena, outdoors at Kjølnes when weather allows.',
    },
    longDescription: {
      nb: 'Fotballgruppa er for alle studenter som vil spille, uansett om du har spilt i klubb eller bare i skolegården. Vi deler inn i jevne lag og spiller, uten prestasjonskrav.\n\nEnkelte økter har maksantall og venteliste i Spond. Husk å melde deg av hvis du ikke kan komme, så plassen går til noen andre.',
      en: 'The football group is for every student who wants to play, whether you played in a club or only in the schoolyard. We make even teams and play, no performance requirements.\n\nSome sessions have a cap and a waiting list in Spond. Remember to unregister if you cannot come, so the spot goes to someone else.',
    },
    audience: {
      nb: 'Alle nivåer. Ingen erfaring nødvendig.',
      en: 'All levels. No experience needed.',
    },
    venue: 'Porsgrunn Arena',
    schedule: [
      { day: 5, from: '18:00', to: '20:00', venue: 'Porsgrunn Arena', from_date: '2026-09-11' },
      { day: 5, from: '20:00', to: '22:00', venue: 'Porsgrunn Arena', from_date: '2026-09-11' },
      { day: 2, from: '20:30', to: '22:00', venue: 'Porsgrunn Arena', from_date: '2026-09-15', note: { nb: 'Innendørs', en: 'Indoors' } },
    ],
    scheduleNote: {
      nb: 'Før og utenfor innendørsperioden brukes også utendørsbanene på Kjølnes. Eksakt tid og aktivitet står i Spond.',
      en: 'Before and outside the indoor season the outdoor pitches at Kjølnes are also used. Exact time and activity are in Spond.',
    },
    capacityNote: {
      nb: 'Enkelte økter har maksantall og venteliste.',
      en: 'Some sessions have a cap and a waiting list.',
    },
    equipmentNote: {
      nb: 'Ta med fotballsko eller innesko og drikkeflaske. Baller og vester har gruppa.',
      en: 'Bring football boots or indoor shoes and a water bottle. The group has balls and bibs.',
    },
  },
  {
    slug: 'volleyball',
    active: true,
    name: 'PSI Volleyball',
    shortName: { nb: 'Volleyball', en: 'Volleyball' },
    icon: '🏐',
    image: null,
    leader: 'Ehsan Sharifazar',
    email: 'volleyball@sig.no',
    spondCode: 'ZXQCB',
    spondInviteUrl: 'https://spond.com/invite/ZXQCB',
    shortDescription: {
      nb: 'Lavterskel for både nye og erfarne. To økter i uka, i Skien og Porsgrunn.',
      en: 'Low threshold for both new and experienced players. Two sessions a week, in Skien and Porsgrunn.',
    },
    longDescription: {
      nb: 'Volleyballgruppa spiller for å ha det gøy og bli bedre sammen. Nye spillere får lære grunnteknikk, erfarne får spille kamper. Vi blander lagene så alle får spille med alle.',
      en: 'The volleyball group plays to have fun and improve together. New players learn the basics, experienced players get to play matches. We mix the teams so everyone plays with everyone.',
    },
    audience: { nb: 'Nye og erfarne. Alle er velkomne.', en: 'New and experienced. Everyone is welcome.' },
    venue: 'Skien / Porsgrunn Arena',
    schedule: [
      { day: 3, from: '20:30', to: '22:00', venue: 'Skien' },
      { day: 5, from: '20:30', to: '22:00', venue: 'Porsgrunn Arena' },
    ],
    scheduleNote: { nb: 'Gjelder fra innendørsoppstart.', en: 'Applies from the start of the indoor season.' },
    capacityNote: null,
    equipmentNote: { nb: 'Innesko. Baller har gruppa.', en: 'Indoor shoes. The group has balls.' },
  },
  {
    slug: 'klatring',
    active: true,
    name: 'PSI Klatregruppa',
    shortName: { nb: 'Klatring', en: 'Climbing' },
    icon: '🧗',
    image: null,
    leader: 'Jacob Høyvik',
    email: 'klatre@sig.no',
    spondCode: 'YYMQL',
    spondInviteUrl: 'https://spond.com/invite/YYMQL',
    shortDescription: {
      nb: 'Ukentlig lavterskeltrening på Høyt Under Taket i Skien. Gruppa har eget utstyr du kan låne.',
      en: 'Weekly low-threshold session at Høyt Under Taket in Skien. The group has its own gear you can borrow.',
    },
    longDescription: {
      nb: 'Klatregruppa møtes hver uke på Høyt Under Taket. Du trenger ikke ha klatret før; gruppa har tilgang til eget utstyr som gjør det lett for nye å prøve. På grunn av høy interesse brukes kapasitet og venteliste i Spond.',
      en: 'The climbing group meets every week at Høyt Under Taket. No previous climbing needed; the group has access to its own gear, which makes it easy for newcomers to try. Due to high interest, capacity limits and a waiting list are used in Spond.',
    },
    audience: { nb: 'Nybegynnere og erfarne.', en: 'Beginners and experienced climbers.' },
    venue: 'Høyt Under Taket, Skien',
    schedule: [{ day: 2, from: '18:00', to: '20:00', venue: 'Høyt Under Taket, Skien' }],
    scheduleNote: null,
    capacityNote: { nb: 'Høy interesse: kapasitet og venteliste kan brukes.', en: 'High interest: capacity limits and a waiting list may be used.' },
    equipmentNote: { nb: 'Gruppa har eget utstyr til utlån.', en: 'The group has its own gear to lend out.' },
  },
  {
    slug: 'padel',
    active: true,
    name: 'PSI Padel',
    shortName: { nb: 'Padel', en: 'Padel' },
    icon: '🎾',
    image: null,
    leader: 'Petter Øster',
    email: 'padel@sig.no',
    spondCode: 'KFKGF',
    spondInviteUrl: 'https://spond.com/invite/KFKGF',
    shortDescription: {
      nb: 'Lav terskel og sosialt. Økter publiseres fortløpende i Spond. Utstyr og ballmaskin gjennom gruppa.',
      en: 'Low threshold and social. Sessions are posted continuously in Spond. Rackets and a ball machine through the group.',
    },
    longDescription: {
      nb: 'Padel er lett å komme inn i og gøy fra første gang. Gruppa har ikke ett fast ukeskjema; øktene legges ut i Spond etter hvert som baner er booket. Racketer og baller er tilgjengelig gjennom gruppa, og PSI har egen ballmaskin.',
      en: 'Padel is easy to pick up and fun from the first session. The group has no fixed weekly schedule; sessions are posted in Spond as courts are booked. Rackets and balls are available through the group, and PSI has its own ball machine.',
    },
    audience: { nb: 'Alle. Ingen erfaring nødvendig.', en: 'Everyone. No experience needed.' },
    venue: { nb: 'Varierer, se Spond', en: 'Varies, see Spond' },
    schedule: [],
    scheduleNote: { nb: 'Ingen fast ukeplan. Øktene publiseres fortløpende i Spond.', en: 'No fixed weekly schedule. Sessions are posted continuously in Spond.' },
    capacityNote: null,
    equipmentNote: { nb: 'Racketer, baller og ballmaskin gjennom gruppa.', en: 'Rackets, balls and a ball machine through the group.' },
  },
  {
    slug: 'sigrun',
    active: true,
    name: 'PSI SiGRUN',
    shortName: { nb: 'SiGRUN', en: 'SiGRUN' },
    icon: '🏃',
    image: null,
    leader: 'Marita Dammen Olsen',
    email: 'psirun@sig.no',
    spondCode: 'SMJFZ',
    spondInviteUrl: 'https://spond.com/invite/SMJFZ',
    shortDescription: {
      nb: 'Fleksibelt løpe- og mosjonstilbud. Sosial trening, fellesløp og arrangementer.',
      en: 'Flexible running and exercise group. Social training, group runs and events.',
    },
    longDescription: {
      nb: 'SiGRUN er for deg som vil bevege deg sammen med andre, uten å måtte være erfaren løper. Vi løper i ulikt tempo, arrangerer fellesløp og drar på arrangementer sammen. Aktuelle treninger og arrangementer publiseres i Spond.',
      en: 'SiGRUN is for anyone who wants to move together with others, without having to be an experienced runner. We run at different paces, organise group runs and go to events together. Current sessions and events are posted in Spond.',
    },
    audience: { nb: 'Alle tempo. Du trenger ikke være erfaren løper.', en: 'All paces. You do not need to be an experienced runner.' },
    venue: { nb: 'Varierer, se Spond', en: 'Varies, see Spond' },
    schedule: [],
    scheduleNote: { nb: 'Treninger og arrangementer publiseres i Spond.', en: 'Sessions and events are posted in Spond.' },
    capacityNote: null,
    equipmentNote: { nb: 'Løpesko og klær etter været.', en: 'Running shoes and clothes for the weather.' },
  },
];

/* ------------------------------------------------------------
   SAMARBEIDSPARTNERE. Ingen beløp, ingen juridiske påstander.
   logo: sti under /public, eller null for tekstplassholder.
   ------------------------------------------------------------ */
export const partners = [
  {
    name: 'Studentsamfunnet i Grenland (SiG)',
    shortName: 'SiG',
    logo: null,
    url: 'https://www.sig.no/',
    description: { nb: 'Studentsamfunnet PSI er en del av.', en: 'The student society PSI is part of.' },
    status: 'parent',
  },
  {
    name: 'Studentsamskipnaden i Sørøst-Norge (SSN)',
    shortName: 'SSN',
    logo: null,
    url: 'https://www.ssn.no/',
    description: { nb: 'Studentsamskipnaden ved USN.', en: 'The student welfare organisation at USN.' },
    status: 'partner',
  },
  {
    name: 'USN – Campus Porsgrunn',
    shortName: 'USN',
    logo: null,
    url: 'https://www.usn.no/om-usn/campusene/porsgrunn/',
    description: { nb: 'Universitetet i Sørøst-Norge, campus Porsgrunn.', en: 'University of South-Eastern Norway, Porsgrunn campus.' },
    status: 'partner',
  },
  {
    name: 'BEHA Sport',
    shortName: 'BEHA Sport',
    logo: null,
    url: null,
    description: { nb: 'Viktig samarbeidspartner for PSI.', en: 'An important partner for PSI.' },
    status: 'partner',
  },
  {
    name: 'Høyt Under Taket',
    shortName: 'Høyt Under Taket',
    logo: null,
    url: 'https://www.hoytundertaket.no/',
    description: { nb: 'Klatresenteret i Skien der klatregruppa trener.', en: 'The climbing centre in Skien where the climbing group trains.' },
    status: 'venue',
  },
];

/* Hjelpere som alle sider bruker, så ingen dupliserer logikk. */
export const activeSports = sports.filter((s) => s.active);
export const findSport = (slug) => activeSports.find((s) => s.slug === slug) || null;

/* Alle økter samlet, sortert etter dag og tid. Brukes av /treningstider
   og forsiden. Legg til tider i sports[].schedule, ikke her. */
export function weeklySchedule() {
  const rows = [];
  for (const s of activeSports) {
    for (const slot of s.schedule) rows.push({ ...slot, sport: s });
  }
  return rows.sort((a, b) => a.day - b.day || a.from.localeCompare(b.from));
}
