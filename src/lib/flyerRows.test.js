import { describe, it, expect } from 'vitest';
import { classifyFlyerRow, filterFlyerRows } from './flyerRows.js';

const keep = (name, price = 39) => classifyFlyerRow({ name, price }).keep;
const why = (name, price = 39) => classifyFlyerRow({ name, price }).reason;

describe('kampanjetekst er ikke en vare', () => {
  it('luker bort overskriftene avisen er full av', () => {
    expect(keep('TAKKNEMLIG TORSDAG')).toBe(false);
    expect(keep('UKENS TILBUD')).toBe(false);
    expect(keep('SPAR 30% PÅ ALT KJØTT')).toBe(false);
    expect(keep('Dagens kupp')).toBe(false);
    expect(keep('KNALLKJØP')).toBe(false);
    expect(keep('Kun for medlemmer')).toBe(false);
    expect(keep('Gjelder t.o.m. søndag')).toBe(false);
    expect(keep('Maks 3 per kunde')).toBe(false);
    expect(keep('Last ned appen')).toBe(false);
    expect(keep('Vi tar forbehold om trykkfeil')).toBe(false);
  });

  it('sier hvorfor, slik at brukeren kan overprøve oss', () => {
    expect(why('UKENS TILBUD')).toBe('kampanjetekst');
    expect(why('kr/kg')).toBe('ikke et navn');
  });
});

describe('men ekte varer slipper gjennom', () => {
  it('vanlige varenavn', () => {
    for (const n of ['Laks', 'Kjøttdeig 400g', 'Norvegia 700g', 'Gilde kjøttdeig',
                     'Tine lettmelk 1,5 l', 'Bananer', 'Egg 12 stk']) {
      expect(keep(n), n).toBe(true);
    }
  });

  it('rene merkevarenavn — de har ingen matord i seg i det hele tatt', () => {
    // Dette er lærepengen fra tilbudsmatchingen: et krav om at navnet må
    // bekreftes som mat kaster «Evergood» og «Salma».
    expect(keep('Evergood')).toBe(true);
    expect(keep('Salma Ryggfilet')).toBe(true);
    expect(keep('Grandiosa')).toBe(true);
    expect(keep('Idun ketchup')).toBe(true);
  });

  it('et kampanjeord inni et matord feller ikke raden', () => {
    // «fredagstaco» inneholder «fredag», men løser til taco.
    expect(keep('Fredagstaco')).toBe(true);
    expect(keep('Helgekylling')).toBe(true);
  });
});

describe('tall som ikke er priser', () => {
  it('avviser det som umulig kan være prisen på en matvare', () => {
    expect(keep('Laks', 0)).toBe(false);
    expect(keep('Laks', -5)).toBe(false);
    expect(keep('Laks', 4999)).toBe(false);
    expect(keep('Laks', '')).toBe(false);
    expect(keep('Laks', 'to hundre')).toBe(false);
  });

  it('godtar komma som desimalskilletegn — avisen skriver 24,90', () => {
    expect(keep('Laks', '24,90')).toBe(true);
    expect(keep('Laks', '189,00')).toBe(true);
  });
});

describe('rader som ikke er rader', () => {
  it('mål og enheter alene', () => {
    expect(keep('kr/kg')).toBe(false);
    expect(keep('2 pk')).toBe(false);
    expect(keep('3 for 2')).toBe(false);
    expect(keep('500 g')).toBe(false);
    expect(keep('%')).toBe(false);
  });

  it('tomt og tegnsuppe', () => {
    expect(keep('')).toBe(false);
    expect(keep('   ')).toBe(false);
    expect(keep('!!! ***')).toBe(false);
    expect(classifyFlyerRow(null).keep).toBe(false);
    expect(classifyFlyerRow({}).keep).toBe(false);
  });

  it('en hel setning er en overskrift, ikke et varenavn', () => {
    expect(keep('Alt du trenger til en skikkelig god søndagsmiddag hjemme')).toBe(false);
  });
});

describe('filterFlyerRows — hele avisen', () => {
  it('deler i beholdt og luket, og forteller hva som gikk', () => {
    const { rows, dropped } = filterFlyerRows([
      { name: 'TAKKNEMLIG TORSDAG', price: 39 },
      { name: 'Kjøttdeig 400g', price: 39 },
      { name: 'Laks', price: 99 },
      { name: 'kr/kg', price: 12 },
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Kjøttdeig 400g', 'Laks']);
    expect(dropped).toHaveLength(2);
    expect(dropped[0]).toEqual({ name: 'TAKKNEMLIG TORSDAG', reason: 'kampanjetekst' });
  });

  it('samme vare til samme pris tas bare med én gang', () => {
    const { rows, dropped } = filterFlyerRows([
      { name: 'Laks', price: 99 },
      { name: 'laks', price: '99' },
      { name: 'Laks', price: 79 },   // annen pris = annet tilbud, beholdes
    ]);
    expect(rows).toHaveLength(2);
    expect(dropped[0].reason).toBe('samme vare to ganger');
  });

  it('en tom avis gir tomme lister, ikke krasj', () => {
    expect(filterFlyerRows([])).toEqual({ rows: [], dropped: [] });
    expect(filterFlyerRows()).toEqual({ rows: [], dropped: [] });
  });

  it('beholder feltene på radene urørt', () => {
    const { rows } = filterFlyerRows([{ name: 'Laks', price: 99, original_price: 149, checked: true }]);
    expect(rows[0]).toMatchObject({ original_price: 149, checked: true });
  });
});
