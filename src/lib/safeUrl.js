/**
 * Bare http(s) slipper gjennom til en href.
 *
 * URL-ene i basen kommer fra tredjepart: Kassalapp, butikkenes nettsider,
 * kundeaviser tolket fra foto, og manuell import fra andre brukere. En
 * `javascript:`-URL i et slikt felt kjører på appens origin når noen
 * trykker på lenken, og sesjonen ligger i localStorage — det er kontoen
 * din. React sanerer ikke dette i produksjonsbygget; det gjør bare en
 * advarsel i utviklingsmodus.
 *
 * Returnerer undefined for alt annet, slik at <a> rendres uten href og
 * dermed ikke er klikkbar.
 */
export function safeUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  try {
    // Relative URL-er får en base for å kunne tolkes; protokollen etterpå
    // avgjør uansett.
    const u = new URL(raw, 'https://plukkelisten.no');
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}
