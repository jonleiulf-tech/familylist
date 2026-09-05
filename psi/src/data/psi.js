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
  mainContact: 'jon.l.leiulfsrud@usn.no',
  // Nye idrettsgrupper opprettes gjennom SiG, ikke av PSI alene. Derfor går
  // «Start en ny idrett» til lederen i SiG, ikke til felles PSI-kontakt.
  newGroupContact: {
    email: 'leder@sig.no',
    role: { nb: 'Leder i Studentsamfunnet i Grenland', en: 'Head of Studentsamfunnet i Grenland' },
  },
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
  leader: { name: 'Jon L. Leiulfsrud', role: { nb: 'Leder, PSI', en: 'Head of PSI' }, email: 'jon.l.leiulfsrud@usn.no' },
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
     until_date: valgfri ISO-dato for siste økt i serien
     skip_dates: datoer uten trening (ingen hall, ferie, eksamen)
     note: kort merknad, f.eks. 'Maks 20, venteliste'

   Kildene er PSI-planen fram til sommeren 2027 (regnearket «PSI SSN
   kalender»), kontrollert mot hallbookingene. Spond er alltid fasiten:
   har gruppa et Spond-arrangement en dag, viker raden her for den.
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
      { day: 5, from: '18:00', to: '20:00', venue: 'Porsgrunn Arena', from_date: '2026-09-11', until_date: '2027-05-21', skip_dates: ['2026-09-25', '2026-12-25', '2027-01-01', '2027-03-12', '2027-03-26', '2027-04-16'], note: { nb: 'Innendørs, pulje 1 · maks 21', en: 'Indoors, group 1 · max 21' } },
      { day: 5, from: '20:00', to: '22:00', venue: 'Porsgrunn Arena', from_date: '2026-09-11', until_date: '2027-05-21', skip_dates: ['2026-09-25', '2026-12-25', '2027-01-01', '2027-03-12', '2027-03-26', '2027-04-16'], note: { nb: 'Innendørs, pulje 2 · maks 21', en: 'Indoors, group 2 · max 21' } },
      { day: 2, from: '20:30', to: '22:00', venue: 'Porsgrunn Arena', from_date: '2026-09-15', until_date: '2027-05-25', note: { nb: 'Innendørs · maks 21', en: 'Indoors · max 21' } },
    ],
    scheduleNote: {
      nb: 'Innendørssesongen starter 11. september. Fram til da trenes det utendørs, mandager og fredager, med tid og sted i Spond. Utendørsbanene på Kjølnes brukes også utenom innendørsperioden.',
      en: 'The indoor season starts on 11 September. Until then the group trains outdoors on Mondays and Fridays, with time and venue in Spond. The outdoor pitches at Kjølnes are also used outside the indoor season.',
    },
    capacityNote: {
      nb: 'PSIs største gruppe. Maks 21 deltakere per pulje, tre lag på sju. Blir det fullt, settes du på venteliste i Spond.',
      en: "PSI's largest group. Maximum 21 participants per session, three teams of seven. If it fills up, you go on the waiting list in Spond.",
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
      nb: 'PSI Volleyball er lavterskel og sosialt, for både nye og erfarne spillere. Du trenger lite eget utstyr. Gruppa har rundt 25 til 30 aktive medlemmer og trener onsdager i Skien Fritidspark og fredager i Porsgrunn Arena fra innendørssesongen starter. Aktuelle økter og eventuelle endringer står i Spond.',
      en: 'PSI Volleyball is low-threshold and social, for both new and experienced players. You need little gear of your own. The group has around 25 to 30 active members and trains Wednesdays at Skien Fritidspark and Fridays at Porsgrunn Arena once the indoor season starts. Current sessions and any changes are in Spond.',
    },
    audience: { nb: 'Nye og erfarne. Alle er velkomne.', en: 'New and experienced. Everyone is welcome.' },
    venue: 'Skien Fritidspark / Porsgrunn Arena',
    schedule: [
      { day: 3, from: '19:30', to: '22:00', venue: 'Skien Fritidspark', from_date: '2026-09-09', until_date: '2027-05-26', skip_dates: ['2026-09-30', '2026-10-07', '2026-10-14', '2026-12-30', '2027-01-13', '2027-02-03', '2027-02-24', '2027-03-17', '2027-03-24'], note: { nb: 'Skienshallen, bane C', en: 'Skienshallen, court C' } },
      { day: 5, from: '20:30', to: '22:00', venue: 'Porsgrunn Arena', from_date: '2026-09-11', until_date: '2027-05-21', skip_dates: ['2026-09-25', '2026-12-25', '2027-01-01', '2027-03-12', '2027-03-26', '2027-04-16'] },
    ],
    scheduleNote: { nb: 'Gjelder fra innendørssesongen starter 11. september. Fram til da trenes det utendørs, med tid og sted i Spond.', en: 'Applies from the start of the indoor season on 11 September. Until then the group trains outdoors, with time and venue in Spond.' },
    capacityNote: null,
    equipmentNote: null,
  },
  {
    slug: 'klatring',
    active: true,
    name: 'PSI Klatring',
    shortName: { nb: 'Klatring', en: 'Climbing' },
    icon: '🧗',
    glyph: '/images/sports/klatring.png',
    image: null,
    imageAlt: { nb: 'PSI Klatring på klatreøkt', en: 'PSI climbing group at a climbing session' },
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
      nb: 'PSI Klatring har fast lavterskeløkt hos Høyt Under Taket i Skien hver tirsdag. Gruppa har eget sikkerhetsutstyr, som gjør det lett for nye å prøve.\n\nGjennom semesteret kan det bli uteklatring, kurs og temakvelder i tillegg. Følg med i Spond.',
      en: 'PSI Klatring has a fixed low-threshold session at Høyt Under Taket in Skien every Tuesday. The group has its own safety gear, which makes it easy for newcomers to try.\n\nThrough the semester there may also be outdoor climbing, courses and theme evenings. Keep an eye on Spond.',
    },
    audience: { nb: 'Alle nivåer. Ingen erfaring nødvendig.', en: 'All levels. No experience needed.' },
    venue: 'Høyt Under Taket, Skien',
    schedule: [{ day: 2, from: '18:00', to: '20:00', venue: 'Høyt Under Taket, Skien', from_date: '2026-09-01', until_date: '2027-05-25', note: { nb: 'Maks 20', en: 'Max 20' } }],
    scheduleNote: null,
    capacityNote: { nb: 'Høy interesse: kapasitet og venteliste kan brukes.', en: 'High interest: capacity limits and a waiting list may be used.' },
    equipmentNote: {
      nb: 'PSI har eget sikkerhetsutstyr: sko, seler, hjelmer, tau og annet. Da slipper du store startkostnader for å prøve.',
      en: 'PSI has its own safety gear: shoes, harnesses, helmets, ropes and more. That means no big start-up cost just to try.',
    },
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
      nb: 'PSI Padel er et populært og sosialt tilbud uten krav om tidligere erfaring. Rundt 20 økter er planlagt i høst. Gruppa har ikke fast ukeskjema; tidspunktene avtales i Spond, ofte med avstemming.\n\nUtstyr er tilgjengelig gjennom gruppa, og PSI kjøpte inn ballmaskin våren 2026.',
      en: 'PSI Padel is a popular, social offer with no requirement for previous experience. Around 20 sessions are planned this autumn. The group has no fixed weekly schedule; times are agreed in Spond, often by a poll.\n\nEquipment is available through the group, and PSI bought a ball machine in spring 2026.',
    },
    audience: { nb: 'Alle. Ingen erfaring nødvendig.', en: 'Everyone. No experience needed.' },
    venue: { nb: 'Varierer, se Spond', en: 'Varies, see Spond' },
    schedule: [
      { day: 2, from: '19:30', to: '21:00', venue: 'Cage Grenland', from_date: '2026-09-01', until_date: '2026-12-17', note: { nb: 'Maks 14', en: 'Max 14' } },
      { day: 4, from: '17:30', to: '19:00', venue: 'Cage Grenland', from_date: '2026-09-03', until_date: '2026-12-17', note: { nb: 'Maks 14', en: 'Max 14' } },
    ],
    scheduleNote: { nb: 'Faste tider hos Cage Grenland ut 17. desember. Bane og eventuelle endringer står i Spond.', en: 'Fixed times at Cage Grenland until 17 December. Court and any changes are in Spond.' },
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
      nb: 'PSI SiGRUN er et fleksibelt løpe- og mosjonstilbud med både trening og arrangementer. Du trenger ikke være erfaren løper: sosial mosjon, fellestrening og konkurranser, og du velger nivået som passer.\n\nGruppa deltar blant annet på Porsgrunn halvmaraton og Geiteryggen-løpet, og arrangerer fellesløp gjennom semesteret. Aktuelle treninger og arrangementer publiseres i Spond.',
      en: 'PSI SiGRUN is a flexible running and exercise group with both training and events. You do not need to be an experienced runner: social exercise, group training and competitions, and you pick the level that suits you.\n\nThe group takes part in the Porsgrunn half marathon and the Geiteryggen run, among others, and organises group runs through the semester. Current sessions and events are posted in Spond.',
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
    logo: '/images/partners/ssn.png',   // offisiell sirkelmerke (SSN_Sirkel_Black.ai) levert av PSI 2026-09-05
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
