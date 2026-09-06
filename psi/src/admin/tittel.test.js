import { describe, it, expect } from 'vitest';
import { tittel, reinTittel } from './pages/Access.jsx';

/* members.title lå som ren tekst før migrasjon 0011 og som { nb, en }
   etter. Admin må takle begge, ellers står styret uten titler i det
   vinduet der migrasjonen ikke er kjørt ennå. */
describe('tittel på styremedlem', () => {
  it('leser gammel og ny form', () => {
    expect(tittel('Leder, PSI')).toEqual({ nb: 'Leder, PSI', en: '' });
    expect(tittel({ nb: 'Kasserer', en: 'Treasurer' })).toEqual({ nb: 'Kasserer', en: 'Treasurer' });
    expect(tittel(null)).toEqual({ nb: '', en: '' });
    expect(tittel({ nb: 'Kasserer' })).toEqual({ nb: 'Kasserer', en: '' });
  });

  it('tomt felt lagres som null, ikke som to tomme strenger', () => {
    expect(reinTittel({ nb: '  ', en: '' })).toBe(null);
    expect(reinTittel('')).toBe(null);
    expect(reinTittel({ nb: ' Leder, PSI ', en: ' Chair ' })).toEqual({ nb: 'Leder, PSI', en: 'Chair' });
    // Bare engelsk er lov: da er det den som vises begge steder.
    expect(reinTittel({ nb: '', en: 'Chair' })).toEqual({ nb: '', en: 'Chair' });
  });
});
