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

   `glyph` er idrettsmerket klippet ut av PSI-seglet. Det tegner det
   designede kortbildet så lenge `image` er tomt, i stedet for en tom
   plassholder. Rør det bare hvis en ny idrett skal ha eget merke.

   Bilder: legg originalen i assets/source-images/<slug>/ og kjør
   `npm run images`. Da lages responsive WebP- og JPG-varianter under
   public/images/psi/<slug>/, og `image` settes til basisstien
   '/images/psi/<slug>/card'. Alternativt kan `image` peke rett på én fil
   ('/images/noe.jpg'). Er `image` null, eller fila mangler, vises en
   tydelig plassholder. Bare bilder PSI har rett til å publisere, ingen
   genererte «medlemmer», ingen stockbilder utgitt som PSI.
   ============================================================ */

export const site = {
  domain: 'https://psiusn.no',
  currentSemester: { nb: 'Høst 2026', en: 'Autumn 2026' },
  lastUpdated: '2026-09-05',
  // Medlemskap går gjennom SiG. Endre lenken her hvis SiG flytter siden.
  membershipUrl: 'https://www.sig.no/informasjon/bli-medlem/',
  mainContact: 'leder@sig.no',
  // Sosiale kanaler. PSI har ingen egen verifisert konto; til da brukes
  // SiG sine kanaler, og de merkes som det. Får PSI egne kontoer: bytt url,
  // owner og sett isDedicatedPsiAccount: true. Ett sted, brukes overalt.
  social: {
    instagram: {
      url: 'https://www.instagram.com/studentsamfunnet_grenland/',
      handle: '@studentsamfunnet_grenland',
      owner: 'Studentsamfunnet i Grenland',
      label: { nb: 'Studentsamfunnet i Grenland på Instagram', en: 'Studentsamfunnet i Grenland on Instagram' },
      isDedicatedPsiAccount: false,
    },
    facebook: {
      url: 'https://www.facebook.com/StudentsamfunnetIGrenland',
      handle: 'StudentsamfunnetIGrenland',
      owner: 'Studentsamfunnet i Grenland',
      label: { nb: 'Studentsamfunnet i Grenland på Facebook', en: 'Studentsamfunnet i Grenland on Facebook' },
      isDedicatedPsiAccount: false,
    },
  },
  // PSI-logoene ligger i /public/logo. Hvit brukes på mørk flate (meny,
  // hero, fot), svart på lys flate og utskrift. Sett en til null for å
  // falle tilbake til tekstmerket «PSI».
  logo: '/logo/psi-wordmark-white.png',
  logoOnLight: '/logo/psi-wordmark-black.png',
  emblem: '/logo/psi-icons-white.png',      // de fem idrettene i én sirkel
  emblemOnLight: '/logo/psi-icons-black.png',
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
    en: 'Student sports at USN Campus Porsgrunn – by students, for students.',
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
    glyph: '/images/sports/fotball.png',
    image: null,
    imageAlt: { nb: 'PSI Fotball på trening på Kjølnes', en: 'PSI Football training at Kjølnes' },
    imageCredit: 'PSI',
    imageSourceDocument: 'PSI_Host_2026_treningstider_og_aktiviteter1.pdf',
    imageSourcePage: 4,
    imageSourceAlt: 'Søknad høst 2026 - PSI.pdf, s. 2 (bredt aktivitetsfoto)',
    leader: 'Michelle Christophersen',
    email: 'fotball@sig.no',
    spondCode: 'TYUQQ',
    spondInviteUrl: 'https://spond.com/invite/TYUQQ',
    shortDescription: {
      nb: 'Aktiv gruppe med høy etterspørsel. Faste økter i Porsgrunn Arena, ute på Kjølnes når været tillater.',
      en: 'Active group with high demand. Regular sessions at Porsgrunn Arena, outdoors at Kjølnes when weather allows.',
    },
    longDescription: {
      nb: 'PSI Fotball er en aktiv gruppe med høy etterspørsel, åpen for alle studenter uansett nivå. Faste økter i Porsgrunn Arena, og utendørsbanene på Kjølnes brukes utenfor innendørsperioden.\n\nEnkelte økter har maksantall og venteliste i Spond. Kan du ikke komme, meld deg av i Spond så plassen kan gå til noen andre.',
      en: 'PSI Football is an active group with high demand, open to all students at any level. Regular sessions at Porsgrunn Arena, and the outdoor pitches at Kjølnes are used outside the indoor season.\n\nSome sessions have a cap and a waiting list in Spond. If you cannot come, unregister in Spond so the spot can go to someone else.',
    },
    audience: {
      nb: 'Alle nivåer. Ingen erfaring nødvendig.',
      en: 'All levels. No experience needed.',
    },
    venue: 'Porsgrunn Arena / Kjølnes',
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
      nb: 'Høy etterspørsel. Enkelte økter har maksantall og venteliste.',
      en: 'High demand. Some sessions have a cap and a waiting list.',
    },
    equipmentNote: null,
  },
  {
    slug: 'volleyball',
    active: true,
    name: 'PSI Volleyball',
    shortName: { nb: 'Volleyball', en: 'Volleyball' },
    icon: '🏐',
    glyph: '/images/sports/volleyball.png',
    image: null,
    imageAlt: { nb: 'PSI Volleyball på trening i idrettshall', en: 'PSI Volleyball training in the sports hall' },
    imageCredit: 'PSI',
    imageSourceDocument: 'PSI_Host_2026_treningstider_og_aktiviteter1.pdf',
    imageSourcePage: 5,
    leader: 'Ehsan Sharifazar',
    email: 'volleyball@sig.no',
    spondCode: 'ZXQCB',
    spondInviteUrl: 'https://spond.com/invite/ZXQCB',
    shortDescription: {
      nb: 'Lavterskel for både nye og erfarne. To økter i uka, i Skien og Porsgrunn.',
      en: 'Low threshold for both new and experienced players. Two sessions a week, in Skien and Porsgrunn.',
    },
    longDescription: {
      nb: 'PSI Volleyball er lavterskel og sosialt, for både nye og erfarne spillere. Fra innendørsoppstart trener gruppa onsdager i Skien og fredager i Porsgrunn Arena. Aktuelle økter og eventuelle endringer står i Spond.',
      en: 'PSI Volleyball is low-threshold and social, for both new and experienced players. From the start of the indoor season the group trains Wednesdays in Skien and Fridays at Porsgrunn Arena. Current sessions and any changes are in Spond.',
    },
    audience: { nb: 'Nye og erfarne. Alle er velkomne.', en: 'New and experienced. Everyone is welcome.' },
    venue: 'Skien / Porsgrunn Arena',
    schedule: [
      { day: 3, from: '20:30', to: '22:00', venue: 'Skien' },
      { day: 5, from: '20:30', to: '22:00', venue: 'Porsgrunn Arena' },
    ],
    scheduleNote: { nb: 'Gjelder fra innendørsoppstart.', en: 'Applies from the start of the indoor season.' },
    capacityNote: null,
    equipmentNote: null,
  },
  {
    slug: 'klatring',
    active: true,
    name: 'PSI Klatregruppa',
    shortName: { nb: 'Klatring', en: 'Climbing' },
    icon: '🧗',
    glyph: '/images/sports/klatring.png',
    image: null,
    imageAlt: { nb: 'PSI Klatregruppa på klatreøkt', en: 'PSI climbing group at a climbing session' },
    imageCredit: 'PSI',
    imageSourceDocument: 'PSI_Host_2026_treningstider_og_aktiviteter1.pdf',
    imageSourcePage: 6,
    leader: 'Jacob Høyvik',
    email: 'klatre@sig.no',
    spondCode: 'YYMQL',
    spondInviteUrl: 'https://spond.com/invite/YYMQL',
    shortDescription: {
      nb: 'Ukentlig lavterskeltrening på Høyt Under Taket i Skien. Gruppa har eget utstyr du kan låne.',
      en: 'Weekly low-threshold session at Høyt Under Taket in Skien. The group has its own gear you can borrow.',
    },
    longDescription: {
      nb: 'PSI Klatregruppa har ukentlig lavterskeltrening på Høyt Under Taket i Skien. Gruppa har tilgang til eget utstyr, som gjør det lettere for nye å prøve. På grunn av høy interesse kan kapasitet og venteliste brukes i Spond.',
      en: 'PSI Klatregruppa has a weekly low-threshold session at Høyt Under Taket in Skien. The group has access to its own gear, which makes it easier for newcomers to try. Due to high interest, capacity limits and a waiting list may be used in Spond.',
    },
    audience: { nb: 'Alle nivåer. Ingen erfaring nødvendig.', en: 'All levels. No experience needed.' },
    venue: 'Høyt Under Taket, Skien',
    schedule: [{ day: 2, from: '18:00', to: '20:00', venue: 'Høyt Under Taket, Skien' }],
    scheduleNote: null,
    capacityNote: { nb: 'Høy interesse: kapasitet og venteliste kan brukes.', en: 'High interest: capacity limits and a waiting list may be used.' },
    equipmentNote: { nb: 'Utstyr er tilgjengelig gjennom gruppa.', en: 'Equipment is available through the group.' },
  },
  {
    slug: 'padel',
    active: true,
    name: 'PSI Padel',
    shortName: { nb: 'Padel', en: 'Padel' },
    icon: '🎾',
    glyph: '/images/sports/padel.png',
    image: null,
    imageAlt: { nb: 'PSI Padel på padelbane', en: 'PSI Padel on the padel court' },
    imageCredit: 'PSI',
    imageSourceDocument: 'PSI_Host_2026_treningstider_og_aktiviteter1.pdf',
    imageSourcePage: 7,
    leader: 'Petter Øster',
    email: 'padel@sig.no',
    spondCode: 'KFKGF',
    spondInviteUrl: 'https://spond.com/invite/KFKGF',
    shortDescription: {
      nb: 'Lav terskel og sosialt. Økter publiseres fortløpende i Spond. Utstyr og ballmaskin gjennom gruppa.',
      en: 'Low threshold and social. Sessions are posted continuously in Spond. Rackets and a ball machine through the group.',
    },
    longDescription: {
      nb: 'PSI Padel er en sosial lavterskelaktivitet. Gruppa har ikke ett fast ukeskjema; øktene publiseres fortløpende i Spond. Utstyr er tilgjengelig gjennom gruppa, og PSI har blant annet padelutstyr og ballmaskin.',
      en: 'PSI Padel is a social, low-threshold activity. The group has no fixed weekly schedule; sessions are posted continuously in Spond. Equipment is available through the group, and PSI has padel gear including a ball machine.',
    },
    audience: { nb: 'Alle. Ingen erfaring nødvendig.', en: 'Everyone. No experience needed.' },
    venue: { nb: 'Varierer, se Spond', en: 'Varies, see Spond' },
    schedule: [],
    scheduleNote: { nb: 'Ingen fast ukeplan. Øktene publiseres fortløpende i Spond.', en: 'No fixed weekly schedule. Sessions are posted continuously in Spond.' },
    capacityNote: null,
    equipmentNote: { nb: 'Utstyr er tilgjengelig gjennom gruppa. PSI har padelutstyr og ballmaskin.', en: 'Equipment is available through the group. PSI has padel gear and a ball machine.' },
  },
  {
    slug: 'sigrun',
    active: true,
    name: 'PSI SiGRUN',
    shortName: { nb: 'SiGRUN', en: 'SiGRUN' },
    icon: '🏃',
    glyph: '/images/sports/sigrun.png',
    image: null,
    imageAlt: { nb: 'PSI SiGRUN på felles løpeaktivitet', en: 'PSI SiGRUN group running activity' },
    imageCredit: 'PSI',
    imageSourceDocument: 'PSI_Host_2026_treningstider_og_aktiviteter1.pdf',
    imageSourcePage: 8,
    imageSourceNote: 'Kampanje-/løpsmateriale. Ikke verifisert som stort hero-foto; behold plassholder til PSI leverer original.',
    leader: 'Marita Dammen Olsen',
    email: 'psirun@sig.no',
    spondCode: 'SMJFZ',
    spondInviteUrl: 'https://spond.com/invite/SMJFZ',
    shortDescription: {
      nb: 'Fleksibelt løpe- og mosjonstilbud. Sosial trening, fellesløp og arrangementer.',
      en: 'Flexible running and exercise group. Social training, group runs and events.',
    },
    longDescription: {
      nb: 'PSI SiGRUN er et fleksibelt løpe- og mosjonstilbud med sosial trening, fellesløp og arrangementer. Du trenger ikke være erfaren løper. Aktuelle treninger og arrangementer publiseres i Spond.',
      en: 'PSI SiGRUN is a flexible running and exercise group with social training, group runs and events. You do not need to be an experienced runner. Current sessions and events are posted in Spond.',
    },
    audience: { nb: 'Alle tempo. Du trenger ikke være erfaren løper.', en: 'All paces. You do not need to be an experienced runner.' },
    venue: { nb: 'Varierer, se Spond', en: 'Varies, see Spond' },
    schedule: [],
    scheduleNote: { nb: 'Treninger og arrangementer publiseres i Spond.', en: 'Sessions and events are posted in Spond.' },
    capacityNote: null,
    equipmentNote: null,
  },
];

/* ------------------------------------------------------------
   SAMARBEIDSPARTNERE. Ingen beløp, ingen juridiske påstander.
   logo: sti under /public/images/partners/, eller null for tekst.
   logoBackground: 'dark' når logoen er hvit og trenger mørk flate.
   Bruk bare offisielle logofiler (se logoSourcePage), aldri omtegnet.
   status: parent | supporter | partner | venue (styrer etiketten).
   ------------------------------------------------------------ */
export const partners = [
  {
    name: 'Studentsamfunnet i Grenland (SiG)',
    shortName: 'SiG',
    logo: '/images/partners/sig.svg',    // offisiell hvit vektorlogo levert av PSI 2026-09-05
    logoBackground: 'dark',              // hvit logo: kortet gir den mørk bakgrunn
    logoSourcePage: 'https://www.sig.no/',
    url: 'https://www.sig.no/',
    description: { nb: 'Studentsamfunnet PSI er en del av.', en: 'The student society PSI is part of.' },
    status: 'parent',
  },
  {
    name: 'Studentsamskipnaden i Sørøst-Norge (SSN)',
    shortName: 'SSN',
    logo: null,
    logoSourcePage: 'https://www.ssn.no/',
    url: 'https://www.ssn.no/',
    description: { nb: 'Viktig støttespiller for studentaktivitet ved USN.', en: 'An important supporter of student activity at USN.' },
    status: 'supporter',
  },
  {
    name: 'Universitetet i Sørøst-Norge (USN)',
    shortName: 'USN',
    logo: '/images/partners/usn.png',   // offisiell logo levert av PSI 2026-09-05
    logoSourcePage: 'https://www.usn.no/om-usn/presserom/logo-design-og-grafiske-elementer/',
    url: 'https://www.usn.no/',
    description: { nb: 'PSI er studentidretten ved USN Campus Porsgrunn.', en: 'PSI is the student sport at USN Campus Porsgrunn.' },
    status: 'partner',
  },
  {
    name: 'BEHA Sport',
    shortName: 'BEHA Sport',
    logo: null,          // Bare offisiell logofil fra BEHA. Til da vises navnet som tekst.
    logoSourcePage: 'https://behasport.no/',
    url: 'https://behasport.no/',
    description: { nb: 'Viktig samarbeidspartner for PSI.', en: 'An important partner for PSI.' },
    status: 'partner',
  },
  {
    name: 'Høyt Under Taket Skien',
    shortName: 'Høyt Under Taket',
    logo: null,
    logoSourcePage: 'https://hoytundertaket.no/',
    url: 'https://hoytundertaket.no/skien/',
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
