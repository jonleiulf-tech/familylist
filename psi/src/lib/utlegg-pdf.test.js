import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { lagUtleggPdf, belop, summer, brytTekst, erPdf, erPng } from './utlegg-pdf.js';

const enSidePdf = async (tekst) => {
  const d = await PDFDocument.create();
  d.addPage([595, 842]).drawText(tekst, { x: 60, y: 700, size: 20 });
  return d.save();
};

describe('beløp', () => {
  it('to desimaler, komma og mellomrom mellom tusen', () => {
    expect(belop(2193.75)).toBe('2 193,75');
    expect(belop(860)).toBe('860,00');
    expect(belop(0)).toBe('0,00');
    expect(belop(1234567.5)).toBe('1 234 567,50');
  });

  it('markerer negative med minustegn, ikke bindestrek', () => {
    expect(belop(-500)).toBe('−500,00');
  });
});

describe('summer', () => {
  it('summerer uten flyttallsdrift', () => {
    // Regnskapsføreren skal ikke få 3153,6499999999996.
    expect(summer([{ belop: 2193.75 }, { belop: 860 }, { belop: 99.9 }])).toBe(3153.65);
  });

  it('tåler tom liste', () => {
    expect(summer([])).toBe(0);
    expect(summer()).toBe(0);
  });
});

describe('tekstbryting', () => {
  const mål = (t) => t.length * 6;
  it('bryter på ordgrenser', () => {
    expect(brytTekst(mål, 'ett to tre fire', 60)).toEqual(['ett to tre', 'fire']);
  });
  it('kutter og markerer når det er for langt', () => {
    const l = brytTekst(mål, 'ett to tre fire fem seks sju', 60, 1);
    expect(l).toHaveLength(1);
  });
  it('tåler tom tekst', () => {
    expect(brytTekst(mål, '', 60)).toEqual([]);
    expect(brytTekst(mål, null, 60)).toEqual([]);
  });
});

describe('filtyper kjennes på innholdet, ikke navnet', () => {
  it('kjenner PDF og PNG på de første bytene', () => {
    expect(erPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 1]))).toBe(true);
    expect(erPdf(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(erPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
    expect(erPdf(null)).toBe(false);
  });
});

describe('utleggsskjemaet', () => {
  const grunn = {
    navn: 'Jon L. Leiulfsrud',
    adresse: 'Borgeåsvegen 27, 3910 Porsgrunn',
    gjelder: 'Utlegg for PSI Fotball',
    type: 'undergruppe',
    gruppe: 'PSI Fotball',
    kontonummer: '2670 40 49659',
    dato: '06.09.2026',
    linjer: [
      { nummer: 1, beskrivelse: 'Scoreboard', belop: 2193.75 },
      { nummer: 2, beskrivelse: 'Leggskinn', belop: 860 },
    ],
  };

  it('lager ett A4-ark når det ikke er vedlegg', async () => {
    const d = await PDFDocument.load(await lagUtleggPdf(grunn));
    expect(d.getPageCount()).toBe(1);
    const { width, height } = d.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it('legger ett ark per bildevedlegg', async () => {
    const png = new Uint8Array(await (await PDFDocument.create()).save());   // ikke et bilde
    void png;
    const d = await PDFDocument.load(await lagUtleggPdf({
      ...grunn,
      vedlegg: [{ nummer: 1, bytes: await enSidePdf('Kvittering') }],
    }));
    expect(d.getPageCount()).toBe(2);
  });

  it('tar med alle sidene når et vedlegg selv er en flersides PDF', async () => {
    // En kvittering kan være to sider. Tar vi bare den første, mangler
    // regnskapsføreren halve bilaget.
    const to = await PDFDocument.create();
    to.addPage([595, 842]);
    to.addPage([595, 842]);
    const d = await PDFDocument.load(await lagUtleggPdf({ ...grunn, vedlegg: [{ nummer: 1, bytes: await to.save() }] }));
    expect(d.getPageCount()).toBe(3);   // skjema + to vedleggssider
  });

  it('hopper over et vedlegg vi ikke kan lese, i stedet for å krasje', async () => {
    // HEIC fra en iPhone, eller en ødelagt fil. Skjemaet skal komme ut
    // uansett – det er verre å stå uten skjema enn uten ett vedlegg.
    const d = await PDFDocument.load(await lagUtleggPdf({
      ...grunn,
      vedlegg: [{ nummer: 1, bytes: new Uint8Array([1, 2, 3, 4, 5]) }, { nummer: 2, bytes: await enSidePdf('Ok') }],
    }));
    expect(d.getPageCount()).toBe(2);   // skjema + det ene som lot seg lese
  });

  it('tåler et vedlegg uten innhold', async () => {
    const d = await PDFDocument.load(await lagUtleggPdf({ ...grunn, vedlegg: [{ nummer: 1, bytes: null }] }));
    expect(d.getPageCount()).toBe(1);
  });

  it('setter tittel så fila kan kjennes igjen i innboksen', async () => {
    const d = await PDFDocument.load(await lagUtleggPdf(grunn));
    expect(d.getTitle()).toContain('Jon L. Leiulfsrud');
  });

  it('klarer seg uten linjer', async () => {
    const d = await PDFDocument.load(await lagUtleggPdf({ ...grunn, linjer: [] }));
    expect(d.getPageCount()).toBe(1);
  });
});
