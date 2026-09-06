/* Formater for trykk og sosiale medier.

   Målene for rollup kommer fra faktaarket til hustrykkeriet:
   850 × 2050 mm totalt, 5 mm kantavstand for tilskjæring, og et felt
   nederst som dekkes av klemskinnene eller ligger igjen på rullen i
   kassetten. Tekst og logo skal stå innenfor det synlige området.

   Alt regnes i millimeter, også skjermformatene: 1080 px ved 96 dpi er
   285,75 mm, og da kan samme utsnitt og samme utskriftsvei brukes for
   alle formatene. */

export const PX_MM = 25.4 / 96;

export const FORMATER = [
  {
    id: 'rollup85',
    navn: 'Rollup 85 cm',
    hint: 'Hustrykkeriet. 850 × 2050 mm, synlig høyde 2000 mm.',
    bredde: 850, høyde: 2050,
    trygg: { topp: 60, bunn: 110, side: 55 },
    stående: true,
  },
  {
    id: 'rollup80',
    navn: 'Rollup 80 cm',
    hint: '800 × 2050 mm, synlig høyde 2000 mm.',
    bredde: 800, høyde: 2050,
    trygg: { topp: 60, bunn: 110, side: 55 },
    stående: true,
  },
  {
    id: 'ig-post',
    navn: 'Instagram-innlegg',
    hint: '1080 × 1080 px.',
    ...pxFormat(1080, 1080),
  },
  {
    id: 'ig-story',
    navn: 'Instagram-story',
    hint: '1080 × 1920 px.',
    ...pxFormat(1080, 1920),
    stående: true,
  },
  {
    id: 'fb-arrangement',
    navn: 'Facebook-arrangement',
    hint: '1920 × 1005 px.',
    ...pxFormat(1920, 1005),
  },
];

function pxFormat(w, h) {
  const mm = (px) => Math.round(px * PX_MM * 100) / 100;
  const kant = Math.round(Math.min(w, h) * 0.06 * PX_MM);
  return { bredde: mm(w), høyde: mm(h), trygg: { topp: kant, bunn: kant, side: kant }, piksler: `${w} × ${h} px` };
}

export const finnFormat = (id) => FORMATER.find((f) => f.id === id) || FORMATER[0];

/* Skalering slik at forhåndsvisningen får plass i ruta den har.
   Returnerer faktoren, ikke nye mål: da holder alle avstander seg i mm
   og trykket blir identisk med det man ser. */
export function passeInn(format, maksBredde, maksHøyde) {
  const b = maksBredde / format.bredde;
  const h = maksHøyde / format.høyde;
  return Math.min(b, h, 1);
}

/* Skriftstørrelser vokser med formatet, ikke med skjermen. Én rollup og
   ett Instagram-bilde skal se like ut i forhold, ikke i millimeter. */
export function skala(format) {
  return format.bredde / 850;
}

/* Hvilket bilde som skal brukes til trykk. Nettversjonen er maks 1600 px
   og blir grøtete på 85 cm; originalen er som regel 3000-4000 px, og
   70-150 dpi er nok for storformat. */
export function trykkBilde(m) {
  if (!m) return null;
  return m.url || m.web_url || null;
}

/* Oppløsning i dpi hvis dette bildet fyller hele bredden. Under 70 er
   for lite for storformat, over 150 er bortkastet. */
export function dpi(m, format) {
  if (!m?.width || !format?.bredde) return null;
  return Math.round(m.width / (format.bredde / 25.4));
}
