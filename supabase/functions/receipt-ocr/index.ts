// Edge Function: OCR av kvitteringer.
//
// POST /receipt-ocr  { file: <base64>, mime: "image/jpeg" | "application/pdf" }
//   -> { text: string, source: "pdf" | "ocr" }
//
// PDF-er med tekstlag (Coop, Meny) leses direkte og gir best kvalitet.
// Bilder må gjennom OCR, som er merkbart dårligere — derfor merkes kilden
// i svaret, slik at klienten kan gi observasjonene lavere confidence.
//
// Krever OCR_SPACE_API_KEY (gratisnivå: ocr.space). Uten nøkkel svarer
// funksjonen 501, og klienten faller tilbake til manuell inntasting.
//
// Deploy: supabase functions deploy receipt-ocr

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.11.0';
import { linesFromTextItems } from '../_shared/pdfLines.ts';

const MAX_BYTES = 8 * 1024 * 1024;   // 8 MB

/** Kvitteringer per bruker per døgn. En storhandler laster opp noen få. */
const MAX_RECEIPTS_PER_DAY = 40;

const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

const json = (body: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * PDF med tekstlag — ingen OCR nødvendig, og langt mer presist.
 *
 * LINJENE MÅ BEVARES. extractText() slår alle tekstbitene sammen med
 * mellomrom, så en hel kvittering kom ut som ÉN linje — og
 * kvitteringsparseren, som står og faller på linjeskift, fant ingen
 * varelinjer. Her hentes bitene med koordinater og grupperes tilbake til
 * linjer etter y-posisjon.
 */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocumentProxy(bytes);
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(linesFromTextItems(content.items as never[]).join('\n'));
  }
  const text = pages.join('\n').trim();
  if (text) return text;
  // Reserve: klarer vi ikke koordinatene, er sammenslått tekst bedre enn
  // ingenting — da kan i det minste butikk og dato leses.
  const { text: merged } = await extractText(doc, { mergePages: true });
  return String(merged ?? '');
}

/** Bilde -> tekst via ocr.space. Norsk språkmodell. */
async function imageText(bytes: Uint8Array, mime: string, apiKey: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), 'receipt');
  form.append('language', 'nor');
  form.append('isTable', 'true');       // kvitteringer er kolonneoppsett
  form.append('OCREngine', '2');
  form.append('scale', 'true');

  const r = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: apiKey },
    body: form,
  });
  if (!r.ok) throw new Error(`OCR svarte ${r.status}`);

  const j = await r.json();
  if (j.IsErroredOnProcessing) {
    throw new Error(Array.isArray(j.ErrorMessage) ? j.ErrorMessage.join(' ') : String(j.ErrorMessage));
  }
  return (j.ParsedResults ?? []).map((p: { ParsedText?: string }) => p.ParsedText ?? '').join('\n');
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') ?? '*';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'Kun POST er støttet.' }, 405, origin);

  // Innlogget bruker kreves — OCR koster kvote.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: 'Ikke innlogget.' }, 401, origin);

  let payload: { file?: string; mime?: string };
  try { payload = await req.json(); }
  catch { return json({ error: 'Ugyldig forespørsel.' }, 400, origin); }

  const { file, mime } = payload;
  if (!file || !mime) return json({ error: 'Mangler fil.' }, 400, origin);

  // STØRRELSEN SJEKKES FØR DEKODINGEN. Før ble en 100 MB base64-streng
  // først parset som JSON, så atob-et til en binærstreng, så kopiert byte
  // for byte til en Uint8Array — flere hundre megabyte på topp — og FØRST
  // da ble grensen lest. Resultatet var en isolat drept av minnemangel og
  // 503 for alle andre som lastet opp samtidig, for ett billig kall.
  // Base64 er 4 tegn per 3 byte.
  if (file.length > Math.ceil((MAX_BYTES * 4) / 3) + 128) {
    return json({ error: 'Filen er for stor. Maks 8 MB.' }, 413, origin);
  }

  let bytes: Uint8Array;
  try { bytes = base64ToBytes(file); }
  catch { return json({ error: 'Kunne ikke lese filen.' }, 400, origin); }

  if (bytes.byteLength > MAX_BYTES) {
    return json({ error: 'Filen er for stor. Maks 8 MB.' }, 413, origin);
  }

  // Kvote, som på kundeavis-skanningen: hvert bildekall koster OCR-kvote.
  const serviceKey = Deno.env.get('SB_SECRET_KEY')
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (serviceKey) {
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    const { count } = await db.from('ai_scan_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('kind', 'kvittering').gte('created_at', since);
    if ((count ?? 0) >= MAX_RECEIPTS_PER_DAY) {
      return json({
        error: `Du har lest ${MAX_RECEIPTS_PER_DAY} kvitteringer i dag. Prøv igjen i morgen, eller lim inn teksten.`,
      }, 429, origin);
    }
    await db.from('ai_scan_log').insert({ user_id: user.id, kind: 'kvittering' });
  }

  try {
    if (mime === 'application/pdf') {
      const text = await pdfText(bytes);
      // Et tekstlag på under ~40 tegn betyr i praksis at PDF-en er et bilde.
      if (text.trim().length >= 40) {
        return json({ text, source: 'pdf' }, 200, origin);
      }
      const apiKey = Deno.env.get('OCR_SPACE_API_KEY');
      if (!apiKey) {
        return json({
          error: 'PDF-en har ikke tekstlag, og OCR er ikke satt opp.',
        }, 501, origin);
      }
      return json({ text: await imageText(bytes, mime, apiKey), source: 'ocr' }, 200, origin);
    }

    const apiKey = Deno.env.get('OCR_SPACE_API_KEY');
    if (!apiKey) {
      return json({
        error: 'OCR er ikke satt opp. Lim inn kvitteringsteksten manuelt.',
      }, 501, origin);
    }
    return json({ text: await imageText(bytes, mime, apiKey), source: 'ocr' }, 200, origin);
  } catch (e) {
    console.error('Kvitteringslesing feilet:', (e as Error)?.message);
    return json({ error: 'Kunne ikke lese kvitteringen.' }, 502, origin);
  }
});
