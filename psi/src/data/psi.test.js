import { describe, it, expect } from 'vitest';
import { sports, activeSports, partners, weeklySchedule, site, organization, stats } from './psi.js';

/* Akseptansekriteriene fra spesifikasjonen, som tester. Endrer noen
   datafila slik at noe av dette brytes, sier testen fra. */

const EXPECTED = {
  fotball: { leader: 'Michelle Christophersen', email: 'fotball@sig.no', code: 'TYUQQ' },
  volleyball: { leader: 'Ehsan Sharifazar', email: 'volleyball@sig.no', code: 'ZXQCB' },
  klatring: { leader: 'Jacob Høyvik', email: 'klatre@sig.no', code: 'YYMQL' },
  padel: { leader: 'Petter Øster', email: 'padel@sig.no', code: 'KFKGF' },
  sigrun: { leader: 'Marita Dammen Olsen', email: 'psirun@sig.no', code: 'SMJFZ' },
};

describe('idrettsgrupper', () => {
  it('har nøyaktig de fem aktive gruppene', () => {
    expect(activeSports.map((s) => s.slug).sort()).toEqual(Object.keys(EXPECTED).sort());
  });
  it('har riktige ledere, e-poster og Spond-koder', () => {
    for (const s of activeSports) {
      const e = EXPECTED[s.slug];
      expect(s.leader).toBe(e.leader);
      expect(s.email).toBe(e.email);
      expect(s.spondCode).toBe(e.code);
      expect(s.spondInviteUrl).toBe(`https://spond.com/invite/${e.code}`);
    }
  });
  it('har gyldige slugs og tekst på begge språk', () => {
    for (const s of sports) {
      expect(s.slug).toMatch(/^[a-z0-9-]+$/);
      for (const k of ['shortName', 'shortDescription', 'longDescription', 'audience']) {
        expect(s[k].nb, `${s.slug}.${k}.nb`).toBeTruthy();
        expect(s[k].en, `${s.slug}.${k}.en`).toBeTruthy();
      }
    }
  });
  it('har gyldige treningstider', () => {
    for (const s of sports) {
      for (const slot of s.schedule) {
        expect(slot.day).toBeGreaterThanOrEqual(1);
        expect(slot.day).toBeLessThanOrEqual(7);
        expect(slot.from).toMatch(/^\d\d:\d\d$/);
        expect(slot.to).toMatch(/^\d\d:\d\d$/);
        expect(slot.from < slot.to).toBe(true);
      }
    }
  });
  it('samler alle økter i én sortert ukeplan', () => {
    const rows = weeklySchedule();
    const total = activeSports.reduce((n, s) => n + s.schedule.length, 0);
    expect(rows.length).toBe(total);
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      expect(a.day < b.day || (a.day === b.day && a.from <= b.from)).toBe(true);
    }
  });
});

describe('organisasjon og innstillinger', () => {
  it('peker medlemskap til SiG og bruker felles kontakt', () => {
    expect(site.membershipUrl).toBe('https://www.sig.no/informasjon/bli-medlem/');
    expect(site.mainContact).toBe('leder@sig.no');
    expect(site.domain).toBe('https://psiusn.no');
    expect(organization.leader.name).toBe('Jon L. Leiulfsrud');
  });
  it('har daterte statistikkverdier', () => {
    expect(stats.asOf.nb).toBeTruthy();
    expect(stats.uniqueParticipants).toBeTruthy();
    expect(stats.activeSports).toBe(activeSports.length);
  });
  it('har riktige partnerlenker og sosiale kanaler merket med eier', () => {
    const byShort = Object.fromEntries(partners.map((p) => [p.shortName, p]));
    expect(byShort['BEHA Sport'].url).toBe('https://behasport.no/');
    expect(byShort['Høyt Under Taket'].url).toBe('https://hoytundertaket.no/skien/');
    expect(byShort['SSN'].url).toBe('https://www.ssn.no/');
    expect(byShort['USN'].url).toBe('https://www.usn.no/');
    expect(byShort['SiG'].url).toBe('https://www.sig.no/');
    expect(site.social.instagram.url).toBe('https://www.instagram.com/studentsamfunnet_grenland/');
    expect(site.social.facebook.url).toBe('https://www.facebook.com/StudentsamfunnetIGrenland');
    for (const c of Object.values(site.social)) if (!c.isDedicatedPsiAccount) expect(c.owner).toBeTruthy();
  });
  it('har alt-tekst på begge språk for hvert bilde, og ingen påstått SiGRUN-foto', () => {
    for (const s of sports) { expect(s.imageAlt.nb).toBeTruthy(); expect(s.imageAlt.en).toBeTruthy(); }
    expect(sports.find((s) => s.slug === 'sigrun').image).toBe(null);
  });
  it('har partnere med navn og beskrivelse på begge språk', () => {
    expect(partners.some((p) => p.shortName === 'BEHA Sport')).toBe(true);
    for (const p of partners) {
      expect(p.name).toBeTruthy();
      expect(p.description.nb).toBeTruthy();
      expect(p.description.en).toBeTruthy();
    }
  });
});
