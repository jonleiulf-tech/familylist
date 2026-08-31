import { describe, it, expect } from 'vitest';
import { safeUrl } from './safeUrl.js';

describe('safeUrl', () => {
  it('slipper gjennom vanlige lenker', () => {
    expect(safeUrl('https://kassal.app/p/123')).toBe('https://kassal.app/p/123');
    expect(safeUrl('http://meny.no/tilbud')).toBe('http://meny.no/tilbud');
  });

  it('stopper javascript: — den kjører på vår origin og kan stjele sesjonen', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('  JavaScript:fetch("//evil")  ')).toBeUndefined();
    expect(safeUrl('java\tscript:alert(1)')).toBeUndefined();
  });

  it('stopper data: og andre protokoller', () => {
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeUrl('vbscript:msgbox(1)')).toBeUndefined();
    expect(safeUrl('file:///etc/passwd')).toBeUndefined();
  });

  it('tomt eller ugyldig gir undefined, ikke en død lenke', () => {
    expect(safeUrl('')).toBeUndefined();
    expect(safeUrl(null)).toBeUndefined();
    expect(safeUrl(undefined)).toBeUndefined();
  });
});
