/* Rollup som PDF, laget her – ikke gjennom nettleserens utskrift.

   To grunner. Nettleseren overstyrer arkstørrelsen fra @page og deler
   850 × 2050 mm i A4-sider, og den kan bare skrive RGB. Hustrykkeriet vil
   ha ett ark i riktig mål, og helst CMYK.

   Her settes hver eneste farge i DeviceCMYK, og skriftene legges inn i
   fila. Fotografiet blir liggende som RGB: en konvertering uten ICC-profil
   gjør mer skade enn nytte, og trykkeriet gjør den jobben med sin egen
   profil. Alt annet – flatene, teksten, den oransje streken – er CMYK og
   flytter seg ikke. */
import { PDFDocument, cmyk, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export const MM = 72 / 25.4;
export const mm = (v) => v * MM;

/* PSI-fargene som trykkverdier. Den oransje er den som flytter seg mest
   ved automatisk konvertering, så den er låst her. */
export const FARGER = {
  svart: cmyk(0.60, 0.50, 0.50, 1),      // dyp sort, ikke bare K100
  kull: cmyk(0.55, 0.45, 0.45, 0.95),
  krem: cmyk(0.02, 0.03, 0.07, 0),
  oransje: cmyk(0, 0.70, 0.90, 0),
  dempet: cmyk(0.12, 0.12, 0.18, 0.20),
  hvit: cmyk(0, 0, 0, 0),
};

/* Bryter tekst til linjer som får plass. Rene tall inn og ut, så den kan
   prøves uten PDF. */
export function brytTekst(mål, tekst, maksBredde, maksLinjer = 99) {
  const ord = String(tekst || '').split(/\s+/).filter(Boolean);
  const linjer = [];
  let linje = '';
  for (const o of ord) {
    const forsøk = linje ? `${linje} ${o}` : o;
    if (mål(forsøk) > maksBredde && linje) { linjer.push(linje); linje = o; } else { linje = forsøk; }
  }
  if (linje) linjer.push(linje);
  if (linjer.length <= maksLinjer) return linjer;
  // Kuttet tekst skal se kuttet ut, ikke ødelagt.
  const vist = linjer.slice(0, maksLinjer);
  vist[vist.length - 1] = `${vist[vist.length - 1]} …`;
  return vist;
}

/* Utsnitt som object-fit: cover, i kildepiksler. */
export function dekk(bB, bH, boksB, boksH, fx = 50, fy = 50) {
  const skala = Math.max(boksB / bB, boksH / bH);
  return { b: bB * skala, h: bH * skala, dx: -(bB * skala - boksB) * (fx / 100), dy: -(bH * skala - boksH) * (fy / 100) };
}

/* Typografien regnes ut fra bredden, så 80 og 85 cm ser like ut.
   Målene er i mm og satt for lesing på to–fem meter. */
export function typografi(breddeMm) {
  const k = breddeMm / 850;
  return {
    eyebrow: 30 * k,
    tittel: 130 * k,
    tittelLinje: 124 * k,
    lead: 40 * k,
    dag: 34 * k,
    sted: 22 * k,
    bunnStor: 42 * k,
    bunnLiten: 30 * k,
    adresse: 44 * k,
    qr: 130 * k,
    kant: 55 * k,
  };
}

/* PNG starter alltid med 89 50 4E 47. Alt annet behandles som JPEG. */
export function erPng(bytes) {
  return Boolean(bytes && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47);
}

export async function lagRollupPdf(spec) {
  const { bredde, høyde, trygg } = spec;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${spec.tittel} – rollup ${Math.round(bredde / 10)} cm`);
  doc.setProducer('psiusn.no');
  doc.setCreator('PSI – Porsgrunn Studentidrettslag');

  const [condensed, bold, medium] = await Promise.all([
    doc.embedFont(spec.fonter.condensed, { subset: true }),
    doc.embedFont(spec.fonter.bold, { subset: true }),
    doc.embedFont(spec.fonter.medium, { subset: true }),
  ]);

  const side = doc.addPage([mm(bredde), mm(høyde)]);
  const T = typografi(bredde);
  const k = bredde / 850;
  const H = (v) => mm(høyde - v);            // mm fra toppen → PDF-koordinat

  side.drawRectangle({ x: 0, y: 0, width: mm(bredde), height: mm(høyde), color: FARGER.svart });

  // Teksten måles før bildet plasseres. Da får bildet akkurat den plassen
  // som blir til overs, i stedet for at teksten renner ned i Spond-kortet
  // når en gruppe har mange treningstider.
  const kortH = T.qr + 44 * k;
  const kortBunn = høyde - trygg.bunn - T.adresse - 52 * k;
  const kortTopp = kortBunn - kortH;

  const tittelLinjer = brytTekst((t) => condensed.widthOfTextAtSize(t, mm(T.tittel)), String(spec.tittel || '').toUpperCase(), mm(bredde - T.kant * 2), 2);
  const leadLinjer = brytTekst((t) => medium.widthOfTextAtSize(t, mm(T.lead)), spec.lead, mm(bredde - T.kant * 2) * 0.9, 2);
  // Plassen er knapp: innholdet må slutte 620 mm over bunnen. Bildet skal
  // ikke krympes til en stripe, så treningstidene ryker først – de står på
  // nettsiden uansett, og en rollup med fem rader tider leses ikke på fem
  // meters hold. Vi tar bort én rad om gangen til det går opp.
  const fastHøyde =
    (spec.merke ? 100 * k + 26 * k : 0)
    + T.eyebrow * 1.6
    + tittelLinjer.length * T.tittelLinje
    + T.lead * 1.5
    + leadLinjer.length * T.lead * 1.4;
  // På rollup står bare dag og klokkeslett: stedet står i Spond, og en
  // ekstra linje per økt spiser 40 mm vi ikke har.
  const radHøyde = () => T.dag * 1.5;
  // Bildet får krympe mer når tidene er med – ellers falt de alltid ut.
  const minstBilde = høyde * ((spec.tider || []).length ? 0.22 : 0.28);

  let tider = (spec.tider || []).slice(0, 3);
  const plass = () => kortTopp - 50 * k - fastHøyde
    - (tider.length ? T.lead * 0.6 + tider.length * radHøyde() : 0);
  while (tider.length && plass() < minstBilde) tider = tider.slice(0, -1);

  const bildeHøyde = Math.max(minstBilde, Math.min(høyde * 0.46, plass()));
  if (spec.foto) {
    // Filendelsen lyver: en «original.jpg» kan være en PNG. Vi ser på de
    // første bytene i stedet, ellers svarer PDF-en «SOI not found».
    const bilde = erPng(spec.foto) ? await doc.embedPng(spec.foto) : await doc.embedJpg(spec.foto);
    const d = dekk(bilde.width, bilde.height, mm(bredde), mm(bildeHøyde), spec.fokusX, spec.fokusY);
    side.drawImage(bilde, { x: d.dx, y: H(bildeHøyde) + d.dy, width: d.b, height: d.h });
    // pdf-lib klipper ikke bilder, så et høyt foto stikker ut under
    // båndet. Vi maler bakgrunnen over alt under båndet igjen.
    side.drawRectangle({ x: 0, y: 0, width: mm(bredde), height: H(bildeHøyde), color: FARGER.svart });
    // Mykt slør ned mot sort, tegnet som striper: PDF har ingen gradient
    // i pdf-lib, og 40 striper er nok til at overgangen ikke ses.
    const slørH = bildeHøyde * 0.4;
    for (let i = 0; i < 40; i += 1) {
      side.drawRectangle({
        x: 0, y: H(bildeHøyde) + (slørH * MM * i) / 40,
        width: mm(bredde), height: (slørH * MM) / 40 + 1,
        color: FARGER.svart, opacity: 1 - i / 40,
      });
    }
  }

  if (spec.logo) {
    const logo = await doc.embedPng(spec.logo);
    const b = mm(160 * (bredde / 850));
    const h = (logo.height / logo.width) * b;
    side.drawImage(logo, { x: mm(bredde - T.kant) - b, y: H(trygg.topp) - h, width: b, height: h });
  }

  const midt = mm(bredde) / 2;
  const sentrer = (tekst, font, størrelse, sperring = 0) =>
    midt - (font.widthOfTextAtSize(tekst, størrelse) + sperring * Math.max(0, tekst.length - 1)) / 2;

  let y = bildeHøyde + 40 * k;

  // Idrettsmerket over overskriften, som på malen fra PSI SiGRun.
  if (spec.merke) {
    const merke = await doc.embedPng(spec.merke);
    const h = mm(100 * k);
    const b = (merke.width / merke.height) * h;
    side.drawImage(merke, { x: midt - b / 2, y: H(y) - h, width: b, height: h });
    y += 100 * k + 26 * k;
  }

  const eyebrow = String(spec.eyebrow || '').toUpperCase();
  const eSperring = mm(T.eyebrow) * 0.08;
  side.drawText(eyebrow, {
    x: sentrer(eyebrow, condensed, mm(T.eyebrow), eSperring),
    y: H(y), size: mm(T.eyebrow), font: condensed, color: FARGER.oransje, characterSpacing: eSperring,
  });
  y += T.eyebrow * 1.6;

  for (const linje of tittelLinjer) {
    y += T.tittelLinje;
    side.drawText(linje, { x: sentrer(linje, condensed, mm(T.tittel)), y: H(y), size: mm(T.tittel), font: condensed, color: FARGER.krem });
  }
  y += T.lead * 1.5;

  for (const linje of leadLinjer) {
    side.drawText(linje, { x: sentrer(linje, medium, mm(T.lead)), y: H(y), size: mm(T.lead), font: medium, color: FARGER.dempet });
    y += T.lead * 1.4;
  }

  if (tider.length) {
    y += T.lead * 0.6;
    const tabellB = mm(bredde - T.kant * 2) * 0.82;
    const tx0 = midt - tabellB / 2;
    for (const t of tider) {
      side.drawLine({
        start: { x: tx0, y: H(y) + mm(T.dag) * 0.95 }, end: { x: tx0 + tabellB, y: H(y) + mm(T.dag) * 0.95 },
        thickness: mm(0.8 * k), color: FARGER.dempet, opacity: 0.45,
      });
      side.drawText(t.dag.toUpperCase(), { x: tx0, y: H(y), size: mm(T.dag), font: condensed, color: FARGER.krem });
      const tb = medium.widthOfTextAtSize(t.tid, mm(T.dag));
      side.drawText(t.tid, { x: tx0 + tabellB - tb, y: H(y), size: mm(T.dag), font: medium, color: FARGER.krem });
      y += radHøyde();
    }
  }

  // «Skann og bli med» i et hvitt kort. Det ankres til bunnen i stedet for
  // å flyte etter teksten: da står QR-en i samme høyde på alle rollupene,
  // godt over gulvet og lett å skanne stående, og adressen under får plass.
  const kortB = mm(bredde - T.kant * 2);
  const kortX = midt - kortB / 2;
  const kortY = H(kortBunn);
  const r = mm(14 * k);
  side.drawSvgPath(rundetRekt(kortB, mm(kortH), r), { x: kortX, y: kortY + mm(kortH), color: FARGER.hvit, borderWidth: 0 });

  const qrX = kortX + mm(22 * k);
  const qrY = kortY + (mm(kortH) - mm(T.qr)) / 2;
  if (spec.qr) {
    const bilde = await doc.embedPng(spec.qr);
    side.drawImage(bilde, { x: qrX, y: qrY, width: mm(T.qr), height: mm(T.qr) });
  }

  const kx = qrX + mm(T.qr + 30 * k);
  let ky = kortY + mm(kortH) - mm(52 * k);
  side.drawText('SKANN OG', { x: kx, y: ky, size: mm(T.bunnStor), font: condensed, color: FARGER.svart });
  ky -= mm(T.bunnStor * 1.05);
  side.drawText('BLI MED', { x: kx, y: ky, size: mm(T.bunnStor), font: condensed, color: FARGER.svart });
  ky -= mm(T.bunnLiten * 1.5);
  const lenke = spec.spondTekst || (spec.kode ? `Spond-kode ${spec.kode}` : '');
  if (lenke) side.drawText(lenke, { x: kx, y: ky, size: mm(T.bunnLiten), font: medium, color: FARGER.dempet });

  // Adressen nederst, over feltet kassetten dekker.
  const adresse = String(spec.url || '').toUpperCase();
  const aSperring = mm(T.adresse) * 0.05;
  side.drawText(adresse, {
    x: sentrer(adresse, condensed, mm(T.adresse), aSperring),
    y: H(høyde - trygg.bunn) + mm(T.adresse) * 0.2,
    size: mm(T.adresse), font: condensed, color: FARGER.oransje, characterSpacing: aSperring,
  });

  return doc.save();
}

export { degrees };


/* Avrundet rektangel som SVG-bane. pdf-lib tegner ikke runde hjørner selv. */
export function rundetRekt(b, h, r) {
  const rr = Math.min(r, b / 2, h / 2);
  return [
    `M ${rr} 0`,
    `H ${b - rr}`, `A ${rr} ${rr} 0 0 1 ${b} ${rr}`,
    `V ${h - rr}`, `A ${rr} ${rr} 0 0 1 ${b - rr} ${h}`,
    `H ${rr}`, `A ${rr} ${rr} 0 0 1 0 ${h - rr}`,
    `V ${rr}`, `A ${rr} ${rr} 0 0 1 ${rr} 0`,
    'Z',
  ].join(' ');
}
