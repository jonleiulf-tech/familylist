import { describe, it, expect } from 'vitest';
import { detectStore, detectDate, parseLines, detectTotal, validateReceipt } from './receipt.js';

const TODAY = new Date('2026-08-29T12:00:00');

const GOOD = `COOP EXTRA DR. MUNK
Org.nr 123456789
Dato: 27.08.2026  Kasse 3

Lettmelk 1,2% 1l        24,90
Kneippbrød 750g         34,90
Norvegia 1kg           119,90
Kjøttdeig 400g          64,90
Agurk                   27,90

SUM                    272,50
Bankkort               272,50
Takk for handelen`;

describe('detectStore', () => {
  it('finner Coop Extra', () => {
    expect(detectStore(GOOD).code).toBe('COOP_EXTRA');
  });
  it('finner Meny', () => {
    expect(detectStore('MENY MAJORSTUEN\nDato 01.01.2026').code).toBe('MENY_NO');
  });
  it('finner Rema', () => {
    expect(detectStore('REMA 1000 STORO').code).toBe('REMA_1000');
  });
  it('returnerer null for ukjent butikk', () => {
    expect(detectStore('KOLONIAL EN ELLER ANNEN')).toBeNull();
  });
  it('leter bare i toppen av kvitteringen', () => {
    const late = `${'x\n'.repeat(30)}MENY`;
    expect(detectStore(late)).toBeNull();
  });
});

describe('detectDate', () => {
  it('leser dd.mm.yyyy', () => expect(detectDate('Dato: 27.08.2026')).toBe('2026-08-27'));
  it('leser dd.mm.yy', () => expect(detectDate('27.08.26')).toBe('2026-08-27'));
  it('leser ISO', () => expect(detectDate('2026-08-27')).toBe('2026-08-27'));
  it('leser skråstrek', () => expect(detectDate('27/08/2026')).toBe('2026-08-27'));
  it('returnerer null uten dato', () => expect(detectDate('ingen dato her')).toBeNull());
});

describe('parseLines', () => {
  it('finner alle varelinjene', () => {
    const lines = parseLines(GOOD);
    expect(lines).toHaveLength(5);
    // Radene bærer nå også mengde og enhetspris — «1 stk» er det
    // kvitteringen sier når den ikke sier noe annet.
    expect(lines[0]).toMatchObject({ name: 'Lettmelk 1,2% 1l', price: 24.9, qty: 1, unit_price: 24.9 });
  });
  it('hopper over sum, betaling og støy', () => {
    const names = parseLines(GOOD).map((l) => l.name.toLowerCase());
    expect(names.some((n) => n.includes('sum'))).toBe(false);
    expect(names.some((n) => n.includes('bankkort'))).toBe(false);
  });
  it('hopper over pant og rabatt', () => {
    const lines = parseLines('Brus 1,5l     32,90\nPant             3,00\nRabatt          -5,00');
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe('Brus 1,5l');
  });
  it('takler «kr» etter beløpet', () => {
    expect(parseLines('Melk    24,90 kr')[0].price).toBe(24.9);
  });
  it('takler punktum som desimalskille', () => {
    expect(parseLines('Melk    24.90')[0].price).toBe(24.9);
  });
  it('ignorerer linjer uten beløp', () => {
    expect(parseLines('Bare tekst uten pris')).toHaveLength(0);
  });
});

describe('detectTotal', () => {
  it('finner SUM', () => expect(detectTotal(GOOD)).toBe(272.5));
  it('finner «Å betale»', () => expect(detectTotal('Å betale   150,00')).toBe(150));
  it('returnerer null uten sum', () => expect(detectTotal('Melk 24,90')).toBeNull());
});

describe('validateReceipt', () => {
  it('godtar en gyldig kvittering', () => {
    const r = validateReceipt(GOOD, { today: TODAY });
    expect(r.valid).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.store.code).toBe('COOP_EXTRA');
    expect(r.date).toBe('2026-08-27');
    expect(r.lines).toHaveLength(5);
  });

  it('avviser ukjent butikk', () => {
    const r = validateReceipt(GOOD.replace('COOP EXTRA DR. MUNK', 'UKJENT BUTIKK'), { today: TODAY });
    expect(r.valid).toBe(false);
    expect(r.problems.join(' ')).toMatch(/butikk/i);
  });

  it('avviser dato fram i tid', () => {
    const r = validateReceipt(GOOD.replace('27.08.2026', '27.08.2027'), { today: TODAY });
    expect(r.valid).toBe(false);
    expect(r.problems.join(' ')).toMatch(/fram i tid/i);
  });

  it('avviser kvittering eldre enn 12 måneder', () => {
    const r = validateReceipt(GOOD.replace('27.08.2026', '27.08.2024'), { today: TODAY });
    expect(r.valid).toBe(false);
    expect(r.problems.join(' ')).toMatch(/eldre enn/i);
  });

  it('avviser færre enn to varelinjer', () => {
    const r = validateReceipt('COOP EXTRA\n27.08.2026\nMelk   24,90\nSUM    24,90', { today: TODAY });
    expect(r.valid).toBe(false);
    expect(r.problems.join(' ')).toMatch(/to varelinjer/i);
  });

  it('avviser når totalsum avviker mer enn 15 %', () => {
    const r = validateReceipt(GOOD.replace('SUM                    272,50', 'SUM                    500,00'), { today: TODAY });
    expect(r.valid).toBe(false);
    expect(r.problems.join(' ')).toMatch(/avviker/i);
  });

  it('godtar avvik innenfor 15 %', () => {
    // 272,50 -> 290,00 er ca. 6 %
    const r = validateReceipt(GOOD.replace('SUM                    272,50', 'SUM                    290,00'), { today: TODAY });
    expect(r.valid).toBe(true);
  });

  it('samler opp flere problemer samtidig', () => {
    const r = validateReceipt('UKJENT\nMelk 24,90', { today: TODAY });
    expect(r.problems.length).toBeGreaterThan(1);
  });

  it('avviser tom input uten å krasje', () => {
    const r = validateReceipt('', { today: TODAY });
    expect(r.valid).toBe(false);
    expect(r.lines).toEqual([]);
  });

  it('regner ut linjesummen', () => {
    expect(validateReceipt(GOOD, { today: TODAY }).lineSum).toBe(272.5);
  });
});

describe('sjekkliste-status', () => {
  it('alle sjekker bestått på gyldig kvittering', () => {
    const { checks } = validateReceipt(GOOD, { today: TODAY });
    expect(checks).toEqual({ store: true, date: true, lines: true, total: true });
  });
  it('bare butikksjekken feiler ved ukjent butikk', () => {
    const { checks } = validateReceipt(GOOD.replace('COOP EXTRA DR. MUNK', 'X'), { today: TODAY });
    expect(checks.store).toBe(false);
    expect(checks.date).toBe(true);
    expect(checks.lines).toBe(true);
  });
  it('datosjekken feiler på framtidsdato', () => {
    const { checks } = validateReceipt(GOOD.replace('27.08.2026', '27.08.2027'), { today: TODAY });
    expect(checks.date).toBe(false);
  });
  it('totalsjekken er null når kvitteringen ikke oppgir sum', () => {
    const noSum = GOOD.replace('SUM                    272,50\n', '');
    const { checks } = validateReceipt(noSum, { today: TODAY });
    expect(checks.total).toBeNull();
  });
});

describe('pant, poser og rabatt er ikke varer', () => {
  const bong = `COOP EXTRA
BAEREPOSE                 2,00
MILJOAVGIFT POSE          1,50
KJØTTDEIG 400G           59,90
Flaskepant               -6,00
MEDLEMSRABATT            -8,00
KUNDEKORT               -15,00
MELK LETT 1,75           25,90
SUM                      59,30`;

  it('bare de ekte varene blir igjen', () => {
    const names = parseLines(bong).map((l) => l.name.toLowerCase());
    expect(names.some((n) => n.includes('kjøttdeig'))).toBe(true);
    expect(names.some((n) => n.includes('melk'))).toBe(true);
    for (const junk of ['baerepose', 'miljoavgift', 'flaskepant', 'medlemsrabatt', 'kundekort']) {
      expect(names.some((n) => n.includes(junk))).toBe(false);
    }
  });

  it('negative beløp slipper aldri gjennom, uansett navn', () => {
    expect(parseLines('COOP\nGAVEKORT INNLØST   -200,00')).toHaveLength(0);
  });
});

// En elektronisk Coop-kvittering setter navnet og beløpet på HVER SIN
// linje, med mengde og rabatt under. Formatet ga null varelinjer, og
// opplastingen ble avvist med «Fant færre enn to varelinjer» — det var
// parseren som tok feil, ikke kvitteringen.
const ELEKTRONISK = `ELEKTRONISK
KVITTERING
Åpent 7 - 23 alle dager
COOP SØRØST SA
Org.nr 947 456 415 MVA
Butikk 2691-1, Kasserer 51
Salgskvittering 519804 02.09.2026 21:34
AGURK STK
33.48
Antall: 2 stk  16.74 kr/stk
Rabatt: NOK  22.32 (40% av  55.80)
BANAN X-TRA KG
27.39
1.100 kg  24.90 kr/kg
¤ÄNGLAMARK HAK.TOMAT
37.80
Antall: 2 stk  18.90 kr/stk
Coop Syltetøy 500 gr. 2 for
COOP J.BÆRSYLT.500G
( 38.50)
COOP J.BÆRSYLT.500G
( 38.50)
Sum
( 77.00)
Mixrabatt
(- 17.00)
Sum mix
60.00
Totalt (5 Artikler)
158.67
Bank:
158.67
Herav
Dagligvarer
158.67
¤Miljømerket varer:
37.80
Utbytte MVA-grun
MVA-%
MVA
Sum
1.02
25%
0.26
1.28
Summer
67.23
10.19
77.42`;

describe('elektronisk kvittering: navn og beløp på hver sin linje', () => {
  it('finner varene', () => {
    // Kvitteringen sier selv «Totalt (5 Artikler)», og det er fem linjer:
    // syltetøyet står TO ganger i mikstilbudet. Før ble hele miksummen
    // lagt på den siste av dem, og den første forsvant — samme feil som
    // gjorde 93 artikler til 46 linjer i piloten.
    const lines = parseLines(ELEKTRONISK);
    expect(lines.map((l) => l.name)).toEqual([
      'AGURK STK', 'BANAN X-TRA KG', 'ÄNGLAMARK HAK.TOMAT',
      'COOP J.BÆRSYLT.500G', 'COOP J.BÆRSYLT.500G',
    ]);
    expect(lines.map((l) => l.price)).toEqual([33.48, 27.39, 37.8, 30, 30]);
    // 60 kroner delt på to like glass. Ordinærprisen står i parentesen, og
    // det er DEN som skal læres — ikke tilbudsprisen.
    expect(lines.slice(3).map((l) => l.regular_price)).toEqual([38.5, 38.5]);
  });

  it('vektlinjer regnes om til kilo, ikke gram', () => {
    // «876 g» til 21,81 ga 0,02 kr/g. Riktig regnet, og ubrukelig: et
    // estimat på 500 g epler ble 4 øre.
    const [row] = parseLines('COOP EXTRA\nEPLER\n21.81\n876 g');
    expect(row.unit).toBe('kg');
    expect(row.qty).toBe(0.876);
    expect(row.unit_price).toBeCloseTo(24.9, 1);
  });

  it('en rabatt uten parentes gir også ordinærprisen', () => {
    const [row] = parseLines('COOP EXTRA\nBROKKOLI\n9.90\nMEDLEMSRABATT -5.00');
    expect(row.regular_price).toBe(14.9);
  });

  it('en umulig mengde forkastes i stedet for å bli en pris', () => {
    const [row] = parseLines('COOP EXTRA\nMELON\n21.81\n1450 stk');
    expect(row.qty).toBe(1);
    expect(row.unit_price).toBe(21.81);
  });

  it('miljømerket «¤» er ikke en del av navnet', () => {
    expect(parseLines(ELEKTRONISK).some((l) => l.name.startsWith('¤'))).toBe(false);
  });

  it('mengde- og rabattlinjer blir ikke varer', () => {
    const names = parseLines(ELEKTRONISK).map((l) => l.name).join(' ');
    expect(names).not.toMatch(/antall|rabatt|mixrabatt/i);
  });

  it('oppsummeringer blir ikke varer', () => {
    const names = parseLines(ELEKTRONISK).map((l) => l.name).join(' ');
    expect(names).not.toMatch(/total|summer|herav|dagligvarer|miljømerket|utbytte|bank/i);
  });

  it('totalsummen leses fra den sterkeste merkelappen', () => {
    // «Summer» står også i MVA-tabellen nederst. Tok vi den siste, ble
    // totalen 67,23 på en kvittering på 158,67 — og alt ble avvist.
    expect(detectTotal(ELEKTRONISK)).toBe(158.67);
  });

  it('linjesummen stemmer med totalen, så kvitteringen godtas', () => {
    const res = validateReceipt(ELEKTRONISK, { today: new Date('2026-09-02') });
    expect(res.checks.total).toBe(true);
    expect(res.valid).toBe(true);
    expect(res.store.name).toBe('Coop');
  });
});

describe('beløp med tusenskille', () => {
  it('leser «2 776.35» som ett beløp', () => {
    expect(detectTotal('Totalt (86 Artikler)\n2 776.35')).toBe(2776.35);
  });
});

describe('generisk Coop', () => {
  it('en elektronisk Coop-kvittering navngir samvirkelaget, ikke formatet', () => {
    // Bedre å godta kvitteringen som «Coop» enn å gjette Extra når det
    // kan ha vært Prix.
    expect(detectStore('ELEKTRONISK\nKVITTERING\nCOOP SØRØST SA').name).toBe('Coop');
    // Står formatet der, vinner det spesifikke treffet.
    expect(detectStore('COOP EXTRA HOVENGA').name).toBe('Coop Extra');
  });
});

describe('mengde, enhetspris og ordinær pris', () => {
  it('«Antall: 2 stk  16.74 kr/stk» gir antall og enhetspris', () => {
    const [row] = parseLines('AGURK STK\n33.48\nAntall: 2 stk  16.74 kr/stk');
    expect(row).toMatchObject({ name: 'AGURK STK', price: 33.48, qty: 2, unit: 'stk', unit_price: 16.74 });
  });

  it('rabattlinja gir ORDINÆR pris — en tilbudspris er ikke vanlig pris', () => {
    // Dette er hele poenget: lærer vi 16,74 som prisen på agurk, blir
    // neste ukes estimat for lavt. Kvitteringen oppgir begge.
    const [row] = parseLines(
      'AGURK STK\n33.48\nAntall: 2 stk  16.74 kr/stk\nRabatt: NOK  22.32 (40% av  55.80)',
    );
    expect(row.unit_price).toBe(16.74);
    expect(row.regular_price).toBe(55.8);
    expect(row.regular_unit_price).toBe(27.9);
  });

  it('enkeltvare på tilbud teller som én', () => {
    const [row] = parseLines('BROKKOLI STK\n9.90\nRabatt: NOK  5.00 (33.6% av  14.90)');
    expect(row.qty).toBe(1);
    expect(row.regular_unit_price).toBe(14.9);
  });

  it('vekt gir kilopris', () => {
    const [row] = parseLines('BANAN X-TRA KG\n27.39\n1.100 kg  24.90 kr/kg');
    expect(row).toMatchObject({ qty: 1.1, unit: 'kg', unit_price: 24.9 });
  });

  it('MENY skriver mengden uten merkelapp', () => {
    const rows = parseLines(
      'MENY Hovenga\n02.09.2026\nHavredrikk 1,5% fett 1l oatly\n66.99 kr\n3 stk\n1 % Trumf-Bonus'
      + '\nGryr til matlaging kokos/raps 3dl tine\n89.70 kr\n3 stk\n1 % Trumf-Bonus',
    );
    expect(rows.map((r) => [r.name.slice(0, 9), r.qty, r.unit_price]))
      .toEqual([['Havredrik', 3, 22.33], ['Gryr til ', 3, 29.9]]);
  });

  it('«1 % Trumf-Bonus» er ikke en mengde', () => {
    const [row] = parseLines('Coca-cola 1,5lx8 fl\n129.00 kr\n1 stk\n1 % Trumf-Bonus');
    expect(row.qty).toBe(1);
    expect(row.unit_price).toBe(129);
  });
});
