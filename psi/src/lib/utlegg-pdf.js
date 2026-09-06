/* Refusjon av personlige utlegg – SiG sitt skjema, fylt ut og med
   kvitteringene bakpå.

   Skjemaet er hentet fra «utlegg skjema SiG.docx»: navn, adresse, hva
   som kreves refundert, kryss for drift/styre/undergruppe, en tabell med
   vedleggsnummer, beskrivelse og beløp, sum, kontonummer, dato og
   underskrift. Side to og utover er kvitteringene.

   Det som spares her er ikke utfyllingen, men nummereringen: i dag
   eksporteres kvitteringene til PDF, nummereres for hånd (se «Utlegg Jon
   - PSI Fotball - nummerert 1-6.pdf») og limes inn bakerst. Her får hvert
   bilag sitt nummer, tabellen viser det samme nummeret, og vedleggene
   kommer i samme rekkefølge.

   Sort/hvitt og A4. Dette skal skrives ut og arkiveres, ikke trykkes. */
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

export const A4 = { bredde: 595.28, høyde: 841.89 };
const MARG = 56;
const SORT = rgb(0.08, 0.08, 0.07);
const GRÅ = rgb(0.45, 0.45, 0.43);
const STREK = rgb(0.78, 0.76, 0.72);

/* Beløp slik en regnskapsfører vil ha det: to desimaler, komma, og
   mellomrom mellom tusen. Ingen «kr» inni tabellen – kolonnen sier det. */
export function belop(n) {
  const v = Number(n || 0);
  const [hel, des] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '−' : ''}${hel.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${des}`;
}

export function summer(linjer = []) {
  return Math.round(linjer.reduce((t, l) => t + Math.round(Number(l.belop || 0) * 100), 0)) / 100;
}

/* Bryter en tekst til linjer som får plass. Samme framgangsmåte som i
   rollup-pdf.js, men med Helvetica sine egne bredder. */
export function brytTekst(mål, tekst, maksBredde, maksLinjer = 99) {
  const ord = String(tekst || '').split(/\s+/).filter(Boolean);
  const linjer = [];
  let nå = '';
  for (const o of ord) {
    const forsøk = nå ? `${nå} ${o}` : o;
    if (mål(forsøk) <= maksBredde || !nå) { nå = forsøk; continue; }
    linjer.push(nå);
    nå = o;
    if (linjer.length === maksLinjer) break;
  }
  if (nå && linjer.length < maksLinjer) linjer.push(nå);
  if (linjer.length === maksLinjer && ord.length) {
    const siste = linjer[maksLinjer - 1];
    if (mål(`${siste} …`) > maksBredde) linjer[maksLinjer - 1] = `${siste.slice(0, -2)}…`;
  }
  return linjer;
}

/* Er dette en PDF? Filendelsen lyver like ofte her som for bilder. */
export const erPdf = (b) => Boolean(b && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46);
export const erPng = (b) => Boolean(b && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47);

/* Ett vedlegg per side, skalert til å fylle arket med god marg, og med
   vedleggsnummeret stemplet i hjørnet. Er vedlegget selv en PDF, tas
   alle sidene med – en kvittering kan være to sider. */
async function leggVedlegg(doc, font, vedlegg) {
  for (const v of vedlegg) {
    if (!v.bytes) continue;
    if (erPdf(v.bytes)) {
      let kilde;
      try { kilde = await PDFDocument.load(v.bytes, { ignoreEncryption: true }); } catch { continue; }
      const sider = await doc.copyPages(kilde, kilde.getPageIndices());
      sider.forEach((side, i) => {
        doc.addPage(side);
        stempel(side, font, i === 0 ? `Vedlegg ${v.nummer}` : `Vedlegg ${v.nummer} (${i + 1})`);
      });
      continue;
    }
    let bilde;
    try {
      bilde = erPng(v.bytes) ? await doc.embedPng(v.bytes) : await doc.embedJpg(v.bytes);
    } catch {
      continue;   // HEIC og annet vi ikke kan lese: hopp over, ikke krasj
    }
    const side = doc.addPage([A4.bredde, A4.høyde]);
    const plassB = A4.bredde - MARG * 2;
    const plassH = A4.høyde - MARG * 2 - 24;
    const skala = Math.min(plassB / bilde.width, plassH / bilde.height);
    const b = bilde.width * skala;
    const h = bilde.height * skala;
    side.drawImage(bilde, { x: (A4.bredde - b) / 2, y: (A4.høyde - 24 - h) / 2, width: b, height: h });
    stempel(side, font, `Vedlegg ${v.nummer}`);
  }
}

function stempel(side, font, tekst) {
  const { width, height } = side.getSize();
  side.drawText(tekst, { x: 28, y: height - 34, size: 11, font, color: SORT, rotate: degrees(0) });
  void width;
}

/* ---------- Selve skjemaet ---------- */

export async function lagUtleggPdf(spec) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Refusjon av personlige utlegg – ${spec.navn}`);
  doc.setProducer('psiusn.no');
  doc.setCreator('PSI – Porsgrunn Studentidrettslag');

  const vanlig = await doc.embedFont(StandardFonts.Helvetica);
  const fet = await doc.embedFont(StandardFonts.HelveticaBold);
  const side = doc.addPage([A4.bredde, A4.høyde]);
  const B = A4.bredde - MARG * 2;
  let y = A4.høyde - MARG;

  const tekst = (t, { x = MARG, størrelse = 10, font = vanlig, farge = SORT } = {}) => {
    side.drawText(String(t ?? ''), { x, y, size: størrelse, font, color: farge });
  };
  const linje = (tykk = 0.75, farge = STREK) => {
    side.drawLine({ start: { x: MARG, y }, end: { x: MARG + B, y }, thickness: tykk, color: farge });
  };

  // Avsender. Skjemaet er SiG sitt, ikke PSI sitt – topptekst som i malen.
  tekst('Studentsamfunnet i Grenland', { font: fet, størrelse: 9 });
  y -= 11;
  tekst('Kjølnes ring 56, 3918 Porsgrunn · Org.nr. 971 321 822 · post@sig.no', { størrelse: 8, farge: GRÅ });
  y -= 8;
  linje();
  y -= 28;

  tekst('REFUSJON AV PERSONLIGE UTLEGG', { font: fet, størrelse: 16 });
  y -= 26;

  const felt = (etikett, verdi, { bredde = B } = {}) => {
    tekst(etikett, { størrelse: 8, farge: GRÅ });
    y -= 13;
    tekst(verdi || '—', { størrelse: 11 });
    y -= 6;
    side.drawLine({ start: { x: MARG, y }, end: { x: MARG + bredde, y }, thickness: 0.5, color: STREK });
    y -= 18;
  };

  felt('Navn', spec.navn);
  felt('Adresse', spec.adresse);

  // «En beskrivelse av hva som kreves refundert og hvem som har godkjent
  // innkjøpet» – malens egen formulering.
  tekst('Hva som kreves refundert, og hvem som har godkjent innkjøpet', { størrelse: 8, farge: GRÅ });
  y -= 13;
  for (const l of brytTekst((t) => vanlig.widthOfTextAtSize(t, 11), spec.gjelder, B, 3)) {
    tekst(l, { størrelse: 11 });
    y -= 14;
  }
  y -= 2;
  linje(0.5);
  y -= 22;

  // Krysset.
  tekst('Utleggene gjelder', { størrelse: 8, farge: GRÅ });
  y -= 16;
  const valg = [
    ['drift', 'Driftsutgifter (bar, arrangement o.l.)'],
    ['styre', 'Styreutgifter (penner, papir osv.)'],
    ['undergruppe', `Undergruppe: ${spec.gruppe || ''}`.trim()],
  ];
  for (const [k, merke] of valg) {
    const på = spec.type === k;
    side.drawRectangle({ x: MARG, y: y - 2, width: 11, height: 11, borderColor: SORT, borderWidth: 0.9, color: rgb(1, 1, 1) });
    if (på) side.drawText('X', { x: MARG + 2.4, y: y + 0.5, size: 9, font: fet, color: SORT });
    tekst(merke, { x: MARG + 19, størrelse: 10 });
    y -= 17;
  }
  y -= 12;

  // Tabellen.
  const kolNr = MARG;
  const kolTekst = MARG + 54;
  const kolBelop = MARG + B;
  tekst('Spesifikasjon av utlegg', { størrelse: 8, farge: GRÅ });
  y -= 15;
  tekst('Vedlegg', { x: kolNr, størrelse: 8, font: fet });
  tekst('Beskrivelse', { x: kolTekst, størrelse: 8, font: fet });
  side.drawText('Beløp', { x: kolBelop - fet.widthOfTextAtSize('Beløp', 8), y, size: 8, font: fet, color: SORT });
  y -= 6;
  linje(0.75, SORT);
  y -= 15;

  const bredde = kolBelop - kolTekst - 80;
  for (const l of spec.linjer || []) {
    const linjer = brytTekst((t) => vanlig.widthOfTextAtSize(t, 10), l.beskrivelse, bredde, 2);
    tekst(String(l.nummer), { x: kolNr + 12, størrelse: 10 });
    const b = belop(l.belop);
    side.drawText(b, { x: kolBelop - vanlig.widthOfTextAtSize(b, 10), y, size: 10, font: vanlig, color: SORT });
    for (const t of linjer) {
      tekst(t, { x: kolTekst, størrelse: 10 });
      y -= 13;
    }
    if (!linjer.length) y -= 13;
    y -= 5;
    side.drawLine({ start: { x: MARG, y: y + 6 }, end: { x: MARG + B, y: y + 6 }, thickness: 0.4, color: STREK });
  }

  y -= 6;
  linje(0.75, SORT);
  y -= 17;
  tekst('Totalt', { x: kolTekst, størrelse: 11, font: fet });
  const total = belop(summer(spec.linjer));
  side.drawText(`kr ${total}`, { x: kolBelop - fet.widthOfTextAtSize(`kr ${total}`, 11), y, size: 11, font: fet, color: SORT });
  y -= 34;

  felt('Utgiftene er betalt av meg og bes overført til kontonummer', spec.kontonummer, { bredde: 220 });
  y -= 6;
  felt('Dato og underskrift', `${spec.dato || ''}${spec.navn ? `      ${spec.navn}` : ''}`);

  y -= 6;
  tekst('Dokumentet godkjennes digitalt ved attestering i regnskapsprogrammet.', { størrelse: 8, farge: GRÅ });

  // Bunntekst: hvor det skal sendes, og hvor det kom fra.
  side.drawText('Sendes som PDF til michael@sig.no. Originalkvitteringer er vedlagt.', {
    x: MARG, y: MARG - 16, size: 8, font: vanlig, color: GRÅ,
  });
  side.drawText('psiusn.no', { x: MARG + B - vanlig.widthOfTextAtSize('psiusn.no', 8), y: MARG - 16, size: 8, font: vanlig, color: GRÅ });

  await leggVedlegg(doc, fet, spec.vedlegg || []);
  return doc.save();
}
