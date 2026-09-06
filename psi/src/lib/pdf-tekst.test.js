import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { linjerFraBiter, bitAv, pdfTilLinjer, settSammen } from './pdf-tekst.js';
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
    expect(linjerFraBiter([{ ...b(40, 700, '10'), bredde: 8, høyde: 7 }, { ...b(480, 700, '2 490,00'), bredde: 30, høyde: 7 }]))
      .toEqual(['10 2 490,00']);
  });

  it('hopper over tomme biter', () => {
    expect(linjerFraBiter([b(40, 700, '  '), b(60, 700, 'a'), b(80, 700, '')])).toEqual(['a']);
  });

  it('tåler søppel', () => {
    expect(linjerFraBiter([null, undefined, { str: 5 }])).toEqual([]);
    expect(linjerFraBiter([])).toEqual([]);
  });
});

describe('settSammen – tegn for tegn', () => {
  /* Mange rapportgeneratorer skriver PDF-en ett tegn om gangen, uten
     mellomrom i det hele tatt: de plasserer bare neste tegn litt lenger
     til høyre. Limer man bitene sammen med mellomrom mellom hver, blir
     «13.01.2026» til «1 3 . 0 1 . 2 0 2 6», og ingenting lar seg lese. */
  const tegnvis = (tekst, { x0 = 40, str = 7, bredde = 3.9 } = {}) => {
    const ut = [];
    let x = x0;
    for (const t of tekst) {
      if (t !== ' ') ut.push({ x, y: 700, bredde, høyde: str, str: t });
      x += bredde;
    }
    return ut;
  };

  it('limer bokstaver i samme ord sammen uten mellomrom', () => {
    expect(settSammen(tegnvis('13.01.2026'))).toBe('13.01.2026');
  });

  it('setter inn mellomrom der det faktisk var et', () => {
    expect(settSammen(tegnvis('PING SERVICES AS'))).toBe('PING SERVICES AS');
  });

  it('holder tusenskillet i beløp', () => {
    expect(settSammen(tegnvis('2 490,00'))).toBe('2 490,00');
  });

  it('skiller kolonner som står langt fra hverandre', () => {
    const biter = [...tegnvis('10', { x0: 40 }), ...tegnvis('2 490,00', { x0: 300 })];
    expect(settSammen(biter)).toBe('10 2 490,00');
  });

  it('gjetter på mellomrom når bredden mangler', () => {
    // Uten bredde vet vi ikke hvor forrige bit sluttet. Heller ett
    // mellomrom for mye enn to kolonner limt til ett ord.
    expect(settSammen([{ x: 40, y: 700, str: 'a', høyde: 7 }, { x: 60, y: 700, str: 'b', høyde: 7 }])).toBe('a b');
  });
});

describe('bitAv', () => {
  it('henter posisjon, bredde og skriftstørrelse', () => {
    expect(bitAv({ str: 'a', transform: [7, 0, 0, 7, 40, 700], width: 4, height: 7 }))
      .toEqual({ x: 40, y: 700, bredde: 4, høyde: 7, str: 'a' });
  });

  it('faller tilbake på transform-matrisa når høyden mangler', () => {
    expect(bitAv({ str: 'a', transform: [7, 0, 0, 7, 40, 700], width: 4 }).høyde).toBe(7);
  });

  it('tåler et element uten transform', () => {
    expect(bitAv({ str: 'a' })).toMatchObject({ x: 0, y: 0, str: 'a' });
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

/* Den samme rapporten, men tegnet ett tegn om gangen. */
async function lagTegnvisPdf() {
  const linjer = readFileSync(new URL('./__fixtures__/hovedbok-2026-08.txt', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.trim());
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let side = doc.addPage([612, 792]);
  let y = 750;
  for (const l of linjer) {
    if (y < 40) { side = doc.addPage([612, 792]); y = 750; }
    let x = 40;
    for (const tegn of l) {
      if (tegn !== ' ') side.drawText(tegn, { x, y, size: 7, font });
      x += font.widthOfTextAtSize(tegn, 7);
    }
    y -= 11;
  }
  return doc.save();
}

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

  it('leser den også når PDF-en er skrevet ett tegn om gangen', async () => {
    // Dette var grunnen til at den ekte rapporten fra SiG ga «fant ingen
    // bokføringslinjer»: bitene ble limt sammen med mellomrom mellom
    // hvert eneste tegn.
    const linjer = await pdfTilLinjer(await lagTegnvisPdf(), { hentPdfjs: pdfjs });
    expect(linjer.some((l) => l.includes('13.01.2026'))).toBe(true);
    const r = parseHovedbok(linjer);
    expect(r.linjer).toHaveLength(43);
    expect(r.sum).toBe(135043.17);
    expect(gikkOpp(r)).toBe(true);
  }, 30000);

  it('holder kolonnene fra hverandre over to sider', async () => {
    const bytes = await lagRapportPdf();
    const linjer = await pdfTilLinjer(bytes, { hentPdfjs: pdfjs });
    expect(linjer.some((l) => l.includes('Side 2 av 2'))).toBe(true);
    expect(linjer.some((l) => /^9 13\.01\.2026 1 /.test(l))).toBe(true);
  }, 30000);
});
