import { describe, it, expect } from 'vitest';
import { linesFromTextItems } from './pdfLines.js';

// pdf.js gir hver tekstbit en transform-matrise; [4] er x, [5] er y.
const bit = (str, x, y, width = 0) => ({ str, transform: [1, 0, 0, 1, x, y], width });

describe('linesFromTextItems', () => {
  it('grupperer biter på samme høyde til én linje', () => {
    expect(linesFromTextItems([
      bit('AGURK', 20, 700, 40), bit('STK', 62, 700, 20),
      bit('33.48', 500, 700, 30),
    ])).toEqual(['AGURK STK  33.48']);
  });

  it('sorterer linjene ovenfra og ned', () => {
    expect(linesFromTextItems([
      bit('33.48', 500, 680), bit('AGURK STK', 20, 700),
      bit('BANAN', 20, 660),
    ])).toEqual(['AGURK STK', '33.48', 'BANAN']);
  });

  it('tåler at biter ligger en halv piksel fra hverandre', () => {
    expect(linesFromTextItems([
      bit('COOP', 20, 700.4, 30), bit('EGG', 52, 699.8, 20),
    ])).toEqual(['COOP EGG']);
  });

  it('kolonneskift blir doble mellomrom, ordmellomrom enkelt', () => {
    // Navnet og beløpet står i hver sin kolonne — det doble mellomrommet
    // er det parseren kjenner igjen som «navn  beløp».
    const [line] = linesFromTextItems([
      bit('TINE', 20, 700, 25), bit('LETTMELK', 47, 700, 55),
      bit('29.90', 480, 700, 30),
    ]);
    expect(line).toBe('TINE LETTMELK  29.90');
  });

  it('hopper over tomme biter', () => {
    expect(linesFromTextItems([
      bit('  ', 10, 700), bit('MELK', 20, 700, 25), bit('', 60, 700),
    ])).toEqual(['MELK']);
  });

  it('tåler søppel og tomt inn', () => {
    expect(linesFromTextItems([])).toEqual([]);
    expect(linesFromTextItems(null)).toEqual([]);
    expect(linesFromTextItems([{ str: 'x' }])).toEqual(['x']);
    expect(linesFromTextItems([{ str: 'x', transform: [1, 0, 0, 1, NaN, 5] }])).toEqual([]);
  });

  it('leser en tofelts kvittering slik parseren trenger den', () => {
    // Coops elektroniske kvittering: navn og beløp under hverandre.
    const items = [
      bit('AGURK STK', 20, 700), bit('33.48', 500, 700),
      bit('Antall: 2 stk', 30, 686), bit('16.74 kr/stk', 120, 686),
      bit('BANAN X-TRA KG', 20, 672), bit('27.39', 500, 672),
    ];
    expect(linesFromTextItems(items)).toEqual([
      'AGURK STK  33.48',
      'Antall: 2 stk  16.74 kr/stk',
      'BANAN X-TRA KG  27.39',
    ]);
  });
});
