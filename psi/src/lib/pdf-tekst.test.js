import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { linjerFraBiter, bitAv, pdfTilLinjer } from './pdf-tekst.js';
import { parseHovedbok, gikkOpp } from './hovedbok.js';

describe('linjerFraBiter', () => {
  const b = (x, y, str) => ({ x, y, str });

  it('samler biter på samme høyde til én linje, fra venstre', () => {
    expect(linjerFraBiter([b(200, 700, 'verden'), b(40, 700, 'Hei')])).toEqual(['Hei verden']);
  });

  it('setter øverste linje først', () => {
    // I en PDF vokser y oppover; på skjermen leses den motsatt vei.
    expect(linjerFraBiter([b(40, 600, 'nederst'), b(40, 700, 'øverst')])).toEqual(['øverst', 'nederst']);
  });

  it('tåler at grunnlinja vipper litt', () => {
    expect(linjerFraBiter([b(40, 700, 'a'), b(60, 701.4, 'b')])).toEqual(['a b']);
    expect(linjerFraBiter([b(40, 700, 'a'), b(60, 690, 'b')])).toEqual(['a', 'b']);
  });

  it('bruker ETT mellomrom, uansett hvor langt fra hverandre bitene står', () => {
    // Tusenskillet i «2 490,00» er også et mellomrom. To mellomrom her
    // ville gjort beløpet uleselig for parseren.
    expect(linjerFraBiter([b(40, 700, '10'), b(480, 700, '2 490,00')])).toEqual(['10 2 490,00']);
  });

  it('hopper over tomme biter', () => {
    expect(linjerFraBiter([b(40, 700, '  '), b(60, 700, 'a'), b(80, 700, '')])).toEqual(['a']);
  });

  it('tåler søppel', () => {
    expect(linjerFraBiter([null, undefined, { str: 5 }])).toEqual([]);
    expect(linjerFraBiter([])).toEqual([]);
  });
});

describe('bitAv', () => {
  it('henter posisjonen ut av transform-matrisa', () => {
    expect(bitAv({ str: 'a', transform: [1, 0, 0, 1, 40, 700] })).toEqual({ x: 40, y: 700, str: 'a' });
  });
  it('tåler et element uten transform', () => {
    expect(bitAv({ str: 'a' })).toEqual({ x: 0, y: 0, str: 'a' });
  });
});

/* Hele veien: en PDF som ligner den ekte rapporten, gjennom pdf.js og
   parseren, og ut med de samme summene som står i rapporten. */
async function lagRapportPdf() {
  const linjer = readFileSync(new URL('./__fixtures__/hovedbok-2026-08.txt', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.trim());
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const KOL = [40, 78, 150, 185, 400, 440, 480, 545];
  let side = doc.addPage([612, 792]);
  let y = 750;
  for (const l of linjer) {
    if (y < 40) { side = doc.addPage([612, 792]); y = 750; }
    const biter = l.split(/ {2,}/).filter(Boolean);
    if (biter.length > 1) biter.forEach((b, i) => side.drawText(b, { x: KOL[Math.min(i, KOL.length - 1)], y, size: 7, font }));
    else side.drawText(l, { x: 40, y, size: 7, font });
    y -= 11;
  }
  return doc.save();
}

const pdfjs = async () => import('pdfjs-dist/legacy/build/pdf.mjs');

describe('PDF → linjer → parset rapport', () => {
  it('leser rapporten ut av en ekte PDF og lander på samme summer', async () => {
    const bytes = await lagRapportPdf();
    const linjer = await pdfTilLinjer(bytes, { hentPdfjs: pdfjs });
    const r = parseHovedbok(linjer);
    expect(r.linjer).toHaveLength(43);
    expect(r.sum).toBe(135043.17);
    expect(r.advarsler).toEqual([]);
    expect(gikkOpp(r)).toBe(true);
  }, 30000);

  it('holder kolonnene fra hverandre over to sider', async () => {
    const bytes = await lagRapportPdf();
    const linjer = await pdfTilLinjer(bytes, { hentPdfjs: pdfjs });
    expect(linjer.some((l) => l.includes('Side 2 av 2'))).toBe(true);
    expect(linjer.some((l) => /^9 13\.01\.2026 1 /.test(l))).toBe(true);
  }, 30000);
});
