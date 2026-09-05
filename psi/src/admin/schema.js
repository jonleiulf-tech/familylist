/* Hva som kan redigeres i /admin, felt for felt. Typer:
   text | email | url | number | checkbox | bi (nb+en, én linje) |
   bitext (nb+en, flere linjer) | schedule | partners */

export const SPORT_FIELDS = [
  { key: 'name', label: 'Navn', type: 'text', required: true, hint: 'F.eks. PSI Fotball' },
  { key: 'shortName', label: 'Kort navn', type: 'bi' },
  { key: 'icon', label: 'Ikon (emoji)', type: 'text' },
  { key: 'image', label: 'Bilde', type: 'text', hint: 'Basissti fra npm run images, f.eks. /images/psi/fotball/card, eller én fil. Tom = plassholder.' },
  { key: 'imageAlt', label: 'Alt-tekst til bildet', type: 'bi' },
  { key: 'imageCredit', label: 'Bildekreditering', type: 'text' },
  { key: 'imageSourceDocument', label: 'Kildedokument for bildet', type: 'text' },
  { key: 'imageSourcePage', label: 'Side i kildedokumentet', type: 'number' },
  { key: 'leader', label: 'Gruppeleder', type: 'text', required: true },
  { key: 'email', label: 'Gruppe-e-post', type: 'email', required: true },
  { key: 'spondCode', label: 'Spond-kode', type: 'text', required: true },
  { key: 'spondInviteUrl', label: 'Spond-invitasjonslenke', type: 'url', hint: 'https://spond.com/invite/<kode>. Tom = bare koden vises.' },
  { key: 'spondGroupId', label: 'Spond-gruppe-ID (for automatisk synk)', type: 'text', hint: 'Valgfritt. Settes den, henter synken kamper og arrangementer fra Spond hver time. Se Innstillinger → Spond.' },
  { key: 'shortDescription', label: 'Kort beskrivelse (kort)', type: 'bitext' },
  { key: 'longDescription', label: 'Lang beskrivelse (idrettssiden)', type: 'bitext', hint: 'Tom linje gir nytt avsnitt.' },
  { key: 'audience', label: 'Passer for', type: 'bi' },
  { key: 'venue', label: 'Sted', type: 'bi' },
  { key: 'schedule', label: 'Treningstider', type: 'schedule' },
  { key: 'scheduleNote', label: 'Merknad til tidene', type: 'bitext' },
  { key: 'capacityNote', label: 'Kapasitet / venteliste', type: 'bi' },
  { key: 'equipmentNote', label: 'Utstyr', type: 'bi' },
  { key: 'sort_order', label: 'Rekkefølge', type: 'number' },
  { key: 'active', label: 'Aktiv gruppe (vises på siden)', type: 'checkbox' },
];

export const SITE_FIELDS = [
  { key: 'currentSemester', label: 'Semester', type: 'bi' },
  { key: 'lastUpdated', label: 'Sist oppdatert (ÅÅÅÅ-MM-DD)', type: 'text' },
  { key: 'membershipUrl', label: 'Lenke til medlemskap (SiG)', type: 'url', required: true },
  { key: 'mainContact', label: 'Felles kontakt-e-post', type: 'email', required: true },
  { key: 'newGroupContact.email', label: 'Nye idretter: e-post (SiG)', type: 'email', required: true },
  { key: 'newGroupContact.role', label: 'Nye idretter: hvem det er', type: 'bi' },
  { key: 'social.instagram.url', label: 'Instagram-lenke', type: 'url' },
  { key: 'social.instagram.handle', label: 'Instagram-brukernavn', type: 'text' },
  { key: 'social.instagram.label', label: 'Instagram: synlig lenketekst', type: 'bi' },
  { key: 'social.instagram.owner', label: 'Instagram: hvem eier kontoen', type: 'text', hint: 'Skriv PSI hvis det er PSI sin egen.' },
  { key: 'social.instagram.isDedicatedPsiAccount', label: 'Instagram-kontoen er PSI sin egen', type: 'checkbox' },
  { key: 'social.facebook.url', label: 'Facebook-lenke', type: 'url' },
  { key: 'social.facebook.handle', label: 'Facebook-navn', type: 'text' },
  { key: 'social.facebook.label', label: 'Facebook: synlig lenketekst', type: 'bi' },
  { key: 'social.facebook.owner', label: 'Facebook: hvem eier kontoen', type: 'text' },
  { key: 'social.facebook.isDedicatedPsiAccount', label: 'Facebook-kontoen er PSI sin egen', type: 'checkbox' },
  { key: 'logo', label: 'Logo', type: 'text', hint: 'Sti under public/, f.eks. /psi-logo.svg' },
];

export const ORG_FIELDS = [
  { key: 'tagline', label: 'Profiltekst', type: 'bi' },
  { key: 'values', label: 'Kjernebudskap', type: 'bi' },
  { key: 'currentRelationToSiG', label: 'Forhold til SiG (dagens)', type: 'bitext' },
  { key: 'leader.name', label: 'PSI-leder: navn', type: 'text', required: true },
  { key: 'leader.email', label: 'PSI-leder: e-post', type: 'email', required: true },
  { key: 'leader.role', label: 'PSI-leder: rolle', type: 'bi' },
];

export const STATS_FIELDS = [
  { key: 'asOf', label: 'Tallene gjelder per', type: 'bi' },
  { key: 'uniqueParticipants', label: 'Registrert i Spond', type: 'text', hint: 'F.eks. ~250' },
  { key: 'activeSports', label: 'Antall aktive grupper', type: 'number' },
];

export const PARTNER_FIELDS = [
  { key: 'name', label: 'Navn', type: 'text', required: true },
  { key: 'shortName', label: 'Kort navn (vises der logo mangler)', type: 'text' },
  { key: 'logo', label: 'Logo', type: 'text', hint: 'Offisiell fil under public/images/partners/. Tom = navnet som tekst.' },
  { key: 'logoSourcePage', label: 'Hvor logoen hentes fra', type: 'url' },
  { key: 'logoBackground', label: 'Logobakgrunn (tom = hvit, dark = svart for hvit logo)', type: 'text' },
  { key: 'url', label: 'Lenke', type: 'url' },
  { key: 'description', label: 'Beskrivelse', type: 'bi' },
  { key: 'status', label: 'Type (parent, supporter, partner, venue)', type: 'text' },
  { key: 'offer.title', label: 'Medlemsfordel – overskrift', type: 'bi', hint: 'F.eks. «Rabatt for SiG-medlemmer». Tom = ingen fordel vises.' },
  { key: 'offer.body', label: 'Medlemsfordel – hva de støtter med', type: 'bitext', hint: 'Én linje per punkt. Linjeskift blir egne avsnitt på siden.' },
];

/* Gruppesiden i admin: feltene gruppert i seksjoner. Bilde og bildekilde
   styres under «Bilder», så de er ikke med her. */
const F = Object.fromEntries(SPORT_FIELDS.map((f) => [f.key, f]));
export const SPORT_SECTIONS = [
  { title: 'Navn og kontakt', fields: [F.name, F.shortName, F.icon, F.leader, F.email] },
  { title: 'Spond', intro: 'Spond er alltid fasiten. Koden og lenken herfra vises på alle sider for gruppa.', fields: [F.spondCode, F.spondInviteUrl, F.spondGroupId] },
  { title: 'Tekster', fields: [F.shortDescription, F.longDescription, F.audience, F.venue] },
  { title: 'Praktisk', fields: [F.capacityNote, F.equipmentNote] },
];
export const SPORT_ADMIN_FIELDS = [F.sort_order, F.active];
export const SPORT_TIME_FIELDS = [F.schedule, F.scheduleNote];

export const MEMBER_ROLES = [['psi_admin', 'PSI-admin'], ['group_leader', 'Gruppeleder'], ['group_member', 'Gruppemedlem']];
export const EVENT_KINDS = [['event', 'Arrangement'], ['match', 'Kamp / turnering'], ['social', 'Sosialt'], ['training', 'Ekstra trening'], ['meeting', 'Møte']];
export const EVENT_KIND_LABEL = Object.fromEntries(EVENT_KINDS);

export const BLANK_NEWS = { slug: '', sport_slug: null, title: { nb: '', en: '' }, lead: { nb: '', en: '' }, body: { nb: '', en: '' }, image_id: null, link_url: null, status: 'draft', published_at: new Date().toISOString(), show_on_home: true };
export const BLANK_EVENT = { sport_slug: null, kind: 'event', title: { nb: '', en: '' }, description: { nb: '', en: '' }, starts_at: null, ends_at: null, all_day: false, venue: '', link_url: null, status: 'published' };
export const BLANK_MEMBER = { email: '', name: '', role: 'group_leader', sport_slug: null, title: '', show_public: true, sort_order: 100 };

export const BLANK_SPORT = {
  name: '', shortName: { nb: '', en: '' }, icon: '🏅', image: null, leader: '', email: '', spondCode: '', spondInviteUrl: null,
  shortDescription: { nb: '', en: '' }, longDescription: { nb: '', en: '' }, audience: { nb: '', en: '' }, venue: { nb: '', en: '' },
  schedule: [], scheduleNote: null, capacityNote: null, equipmentNote: null, sort_order: 10, active: false,
};

export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
export function setPath(obj, path, value) {
  const keys = path.split('.');
  const out = { ...obj };
  let cur = out;
  keys.slice(0, -1).forEach((k) => { cur[k] = { ...(cur[k] || {}) }; cur = cur[k]; });
  cur[keys[keys.length - 1]] = value;
  return out;
}
