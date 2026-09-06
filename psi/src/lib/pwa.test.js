import { describe, it, expect } from 'vitest';
import { plattform, nettleser, oppskrift, sortertEtter, erInstallert, kontrollerbytte, OPPSKRIFTER } from './pwa.js';

/* Ekte user agent-strenger. De er stygge med vilje: det er det de er. */
const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.61',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
};

describe('plattform', () => {
  it('kjenner igjen de vanlige', () => {
    expect(plattform(UA.iphoneSafari)).toBe('ios');
    expect(plattform(UA.androidChrome)).toBe('android');
    expect(plattform(UA.windowsEdge)).toBe('windows');
    expect(plattform(UA.macSafari)).toBe('mac');
    expect(plattform('')).toBe('annet');
  });

  it('skiller iPad fra Mac på berøringspunktene', () => {
    // iPadOS 13 og nyere sier «Macintosh» om seg selv. Uten
    // berøringspunktene ville iPad fått Mac-oppskriften, og der står det
    // «velg Arkiv i menylinja» – en menylinje iPaden ikke har.
    expect(plattform(UA.ipadOS, 5)).toBe('ios');
    expect(plattform(UA.macSafari, 0)).toBe('mac');
  });
});

describe('nettleser', () => {
  it('lar seg ikke lure av at alle utgir seg for å være hverandre', () => {
    // Edge sier «Chrome» og «Safari», Samsung sier «Chrome», Chrome sier
    // «Safari». Rekkefølgen i sjekken er hele poenget.
    expect(nettleser(UA.windowsEdge)).toBe('edge');
    expect(nettleser(UA.androidSamsung)).toBe('samsung');
    expect(nettleser(UA.windowsChrome)).toBe('chrome');
    expect(nettleser(UA.macSafari)).toBe('safari');
    expect(nettleser(UA.iphoneChrome)).toBe('chrome');
    expect(nettleser(UA.androidFirefox)).toBe('firefox');
  });
});

describe('oppskrift', () => {
  const forUa = (ua, touch = 0) => oppskrift(plattform(ua, touch), nettleser(ua));

  it('gir Safari-oppskriften på iPhone', () => {
    expect(forUa(UA.iphoneSafari)).toBe('ios');
  });

  it('ber deg bytte til Safari når du er i Chrome på iPhone', () => {
    // Chrome på iOS har ikke «Legg til på Hjem-skjerm» i menyen sin.
    expect(forUa(UA.iphoneChrome)).toBe('iosAnnen');
  });

  it('gir iPad Safari-oppskriften, ikke Mac-oppskriften', () => {
    expect(forUa(UA.ipadOS, 5)).toBe('ios');
  });

  it('skiller Safari på Mac fra Chrome på Mac', () => {
    expect(forUa(UA.macSafari, 0)).toBe('mac');
    expect(forUa(UA.macChrome, 0)).toBe('skrivebord');
  });

  it('samler Chrome, Edge og Samsung på Android', () => {
    expect(forUa(UA.androidChrome)).toBe('android');
    expect(forUa(UA.androidSamsung)).toBe('android');
  });

  it('gir Firefox sin egen beskjed på begge plattformer', () => {
    expect(forUa(UA.androidFirefox)).toBe('firefox');
    expect(forUa(UA.windowsFirefox)).toBe('firefox');
  });

  it('faller til skrivebordsoppskriften når vi ikke vet', () => {
    expect(forUa('')).toBe('skrivebord');
  });

  it('peker alltid på en oppskrift som finnes', () => {
    for (const ua of Object.values(UA)) expect(OPPSKRIFTER).toContain(forUa(ua));
  });
});

describe('sortertEtter', () => {
  it('løfter den valgte øverst og beholder resten', () => {
    const r = sortertEtter('android');
    expect(r[0]).toBe('android');
    expect(r).toHaveLength(OPPSKRIFTER.length);
    expect([...r].sort()).toEqual([...OPPSKRIFTER].sort());
  });

  it('dupliserer ikke om den valgte ikke finnes', () => {
    expect(sortertEtter('finnesikke')).toEqual(OPPSKRIFTER);
  });
});

describe('erInstallert', () => {
  const vindu = (standalone, iosFlagg) => ({
    matchMedia: () => ({ matches: standalone }),
    navigator: { standalone: iosFlagg },
  });

  it('ser display-mode', () => {
    expect(erInstallert(vindu(true, undefined))).toBe(true);
    expect(erInstallert(vindu(false, undefined))).toBe(false);
  });

  it('ser iOS sitt eget flagg', () => {
    // Safari på iPhone svarer ikke på display-mode: standalone, men
    // setter navigator.standalone. Uten denne ville /app påstå at appen
    // ikke er installert mens den kjører i den.
    expect(erInstallert(vindu(false, true))).toBe(true);
  });

  it('svarer nei uten vindu', () => {
    expect(erInstallert(null)).toBe(false);
  });
});

describe('kontrollerbytte', () => {
  it('laster ikke på førstebesøk', () => {
    // Første gang finnes ingen worker. Den nye kaller clients.claim(),
    // og controllerchange fyrer selv om ingenting er oppdatert. Lastet vi
    // der, ville hvert eneste førstebesøk blinke og starte om.
    let lastet = 0;
    const h = kontrollerbytte({ haddeKontroller: false, last: () => { lastet += 1; } });
    expect(h()).toBe(false);
    expect(lastet).toBe(0);
  });

  it('laster når en versjon faktisk byttes ut', () => {
    let lastet = 0;
    const h = kontrollerbytte({ haddeKontroller: true, last: () => { lastet += 1; } });
    expect(h()).toBe(true);
    expect(lastet).toBe(1);
  });

  it('laster bare én gang, uansett hvor mange ganger den fyrer', () => {
    let lastet = 0;
    const h = kontrollerbytte({ haddeKontroller: true, last: () => { lastet += 1; } });
    h(); h(); h();
    expect(lastet).toBe(1);
  });

  it('laster ved neste bytte etter at den første har tatt over', () => {
    // Førstebesøk: claim (ingen omlasting). Så en utrulling: da skal den.
    let lastet = 0;
    const h = kontrollerbytte({ haddeKontroller: false, last: () => { lastet += 1; } });
    expect(h()).toBe(false);
    expect(h()).toBe(true);
    expect(lastet).toBe(1);
  });
});
