import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* db.ps1 kjøres av styret på Windows. Windows PowerShell 5.1 leser filer
   uten BOM som Windows-1252, så æøå blir til søppel og skriptet nekter å
   starte med «The string is missing the terminator». Testen står her fordi
   feilen bare viser seg på en maskin vi ikke har i CI. */
const here = dirname(fileURLToPath(import.meta.url));
const bytes = readFileSync(join(here, 'db.ps1'));

describe('db.ps1', () => {
  it('er lagret som UTF-8 med BOM', () => {
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('bruker ingen syntaks som krever PowerShell 7', () => {
    const text = bytes.toString('utf8');
    for (const forbudt of ['??', '?.', 'ForEach-Object -Parallel', '-AsHashtable', '-SkipHttpErrorCheck', '$PSStyle', 'Join-String']) {
      expect(text).not.toContain(forbudt);
    }
  });

  it('setter TLS 1.2, som 5.1 trenger for å nå Supabase', () => {
    expect(bytes.toString('utf8')).toContain('Tls12');
  });
});
