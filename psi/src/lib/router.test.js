import { describe, it, expect } from 'vitest';
import { matchPath, registerLeaveGuard } from './router.jsx';
import { splitLang, withLang, pickLang } from './i18n.jsx';

describe('matchPath', () => {
  it('matcher faste og variable segmenter', () => {
    expect(matchPath('/nyheter', '/nyheter')).toEqual({});
    expect(matchPath('/idretter/:slug', '/idretter/fotball')).toEqual({ slug: 'fotball' });
    expect(matchPath('/nyheter', '/nyheter/en-sak')).toBe(null);
  });

  it('en sti med spørrestreng er ikke en gyldig sti', () => {
    // Ruteren må skille dem før matching. Gjør den ikke det, havner
    // /nyheter?gruppe=fotball på «fant ikke siden».
    expect(matchPath('/nyheter', '/nyheter?gruppe=fotball')).toBe(null);
  });
});

describe('språkprefiks med spørrestreng', () => {
  it('splitLang ser bare på stien', () => {
    expect(splitLang('/en/nyheter')).toEqual({ lang: 'en', path: '/nyheter' });
    expect(splitLang('/nyheter')).toEqual({ lang: 'nb', path: '/nyheter' });
  });

  it('withLang på den rene stien, spørrestrengen legges på etterpå', () => {
    const to = '/nyheter?gruppe=fotball';
    const [rent] = to.split('?');
    expect(withLang(rent, 'en') + to.slice(rent.length)).toBe('/en/nyheter?gruppe=fotball');
    expect(withLang(rent, 'nb') + to.slice(rent.length)).toBe('/nyheter?gruppe=fotball');
  });
});

describe('sperre mot å forlate en side med ulagrede endringer', () => {
  it('avregistrering fjerner vakten igjen', () => {
    const slipp = registerLeaveGuard(() => 'ulagret');
    expect(typeof slipp).toBe('function');
    expect(slipp()).toBe(true);
    // Andre gang finnes den ikke lenger.
    expect(slipp()).toBe(false);
  });
});

describe('pickLang', () => {
  it('sier ifra når teksten faller tilbake til norsk', () => {
    expect(pickLang({ nb: 'Hei', en: 'Hi' }, 'en')).toBe(null);
    expect(pickLang({ nb: 'Hei' }, 'en')).toBe('nb');
    expect(pickLang({ nb: 'Hei', en: '' }, 'en')).toBe('nb');
    expect(pickLang({ en: 'Hi' }, 'nb')).toBe('en');
  });

  it('vanlige strenger trenger ingen merking', () => {
    expect(pickLang('Fotball', 'en')).toBe(null);
    expect(pickLang(null, 'en')).toBe(null);
    expect(pickLang(['a'], 'en')).toBe(null);
  });
});
