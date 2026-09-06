/* Tekst ut av en PDF, linje for linje.

   Brukes til å lese hovedbokrapporten fra SiG. pdf.js gir oss biter av
   tekst med posisjon, ikke linjer, så de må settes sammen igjen: bitene
   grupperes etter hvor høyt de står på siden, og sorteres fra venstre.

   ETT mellomrom mellom bitene, aldri flere. Det er ikke en detalj:
   tusenskillet i «2 490,00» er også et mellomrom, og setter vi inn to
   der kolonnene står langt fra hverandre, blir beløpet uleselig for
   parseren. Kolonnene skilles fint nok av ett mellomrom, siden
   hovedbok.js ankrer radene i avdelingsnummeret og ikke i avstander.

   pdf.js lastes først når noen faktisk importerer noe – biblioteket er på
   halvannen megabyte, og skal ikke ligge i veien for en telefon som bare
   skal se treningstidene. */

/* Hvor mye to biter kan sprike i høyde og likevel høre til samme linje.
   Grunnlinjen vipper litt når skriftstørrelsen skifter midt i en rad. */
const SAMME_LINJE = 3;

export function linjerFraBiter(biter, { toleranse = SAMME_LINJE } = {}) {
  const grupper = [];
  for (const b of biter) {
    if (!b || typeof b.str !== 'string' || !b.str.trim()) continue;
    const g = grupper.find((x) => Math.abs(x.y - b.y) <= toleranse);
    if (g) { g.biter.push(b); g.y = (g.y * (g.biter.length - 1) + b.y) / g.biter.length; }
    else grupper.push({ y: b.y, biter: [b] });
  }
  // Øverst først: i PDF-en vokser y oppover.
  grupper.sort((a, b) => b.y - a.y);
  return grupper.map((g) =>
    g.biter
      .slice()
      .sort((a, b) => a.x - b.x)
      .map((b) => b.str.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

/* pdf.js sine tekstbiter → { x, y, str }. Posisjonen ligger i de to siste
   tallene i transform-matrisa. */
export const bitAv = (item) => ({
  x: item.transform?.[4] ?? 0,
  y: item.transform?.[5] ?? 0,
  str: item.str ?? '',
});

/* Hele dokumentet som linjer, side for side. */
export async function pdfTilLinjer(bytes, { hentPdfjs = standardPdfjs } = {}) {
  const pdfjs = await hentPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false }).promise;
  const alle = [];
  try {
    for (let n = 1; n <= doc.numPages; n += 1) {
      const side = await doc.getPage(n);
      const innhold = await side.getTextContent();
      alle.push(...linjerFraBiter(innhold.items.map(bitAv)));
      side.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return alle;
}

async function standardPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  // Arbeideren hentes fra samme bygg, ikke fra et fremmed CDN.
  const url = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = url;
  return pdfjs;
}
