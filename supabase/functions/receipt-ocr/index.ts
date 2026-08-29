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

const MAX_BYTES = 8 * 1024 * 1024;   // 8 MB

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

/** PDF med tekstlag — ingen OCR nødvendig, og langt mer presist. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocumentProxy(bytes);
  const { text } = await extractText(doc, { mergePages: true });
  return String(text ?? '');
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

  let bytes: Uint8Array;
  try { bytes = base64ToBytes(file); }
  catch { return json({ error: 'Kunne ikke lese filen.' }, 400, origin); }

  if (bytes.byteLength > MAX_BYTES) {
    return json({ error: 'Filen er for stor. Maks 8 MB.' }, 413, origin);
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
