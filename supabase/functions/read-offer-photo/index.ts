// Edge Function: «Skann en kundeavis» — Claude leser varer og priser ut av
// et foto brukeren tar av en kundeavis-side (papir eller skjermbilde).
//
// Kjøres av innloggede brukere (verify_jwt = true — gatewayen krever gyldig
// bruker). Resultatet er KUN et forslag: radene går til en redigerbar
// gjennomgang i appen før noe lagres, akkurat som manuell import.
//
// Krever secret: ANTHROPIC_API_KEY (samme som den nattlige gjennomgangen):
//   supabase secrets set ANTHROPIC_API_KEY="sk-ant-…"

import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';

const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-media-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const json = (body: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin) },
  });

/** Første balanserte JSON-liste i teksten — tolerant for prat rundt. */
function extractJsonArray(text: string): unknown[] | null {
  const start = text.indexOf('[');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') ?? '*';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'Bruk POST.' }, 405, origin);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({
      error: 'Kundeavis-skanning er ikke aktivert ennå — ANTHROPIC_API_KEY '
        + 'mangler som secret. Sett den med `supabase secrets set`.',
    }, 501, origin);
  }

  // Fila sendes RÅTT (Blob) med typen i x-media-type — halve størrelsen av
  // base64-i-JSON, og ingen kjempestreng å parse. JSON-formen støttes
  // fortsatt som reserve for eldre klienter.
  let image = '';
  let requestedType = req.headers.get('x-media-type') ?? '';
  const contentType = req.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const body = await req.json();
      image = String(body.image ?? '');
      requestedType = String(body.media_type ?? requestedType);
    } else {
      const buf = new Uint8Array(await req.arrayBuffer());
      // PDF-er (hele kundeaviser) får romsligere tak enn enkeltbilder.
      const maxBytes = requestedType === 'application/pdf' ? 9_500_000 : 4_500_000;
      if (buf.length > maxBytes) {
        return json({
          error: requestedType === 'application/pdf'
            ? 'PDF-en er for stor (over ca. 9 MB) — prøv en mindre utgave, eller ta skjermbilder av sidene.'
            : 'Bildet er for stort — prøv igjen.',
        }, 413, origin);
      }
      let bin = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < buf.length; i += CHUNK) {
        bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
      }
      image = btoa(bin);
    }
  } catch (e) {
    return json({ error: `Fikk ikke lest filen: ${(e as Error)?.message ?? e}` }, 400, origin);
  }

  const isPdf = requestedType === 'application/pdf';
  const mediaType = isPdf ? 'application/pdf'
    : (requestedType === 'image/png' ? 'image/png' : 'image/jpeg');
  if (image.length < 100) return json({ error: 'Mangler bilde.' }, 400, origin);
  if (image.length > 13_000_000) {
    return json({ error: 'Filen er for stor — prøv en mindre.' }, 413, origin);
  }

  const client = new Anthropic({ apiKey });
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    system:
      'Du leser norske kundeaviser for dagligvarer. Du får ett foto av en '
      + 'avis-side eller en hel kundeavis som PDF, og skal ut med varene og '
      + 'prisene som faktisk står der. '
      + 'Svar KUN med en JSON-liste, ingen annen tekst: '
      + '[{"name": "...", "price": 39.9, "original_price": 54.9}] '
      + 'Regler: name er varenavnet slik det står (med størrelse hvis oppgitt, '
      + 'f.eks. «Norvegia 1 kg»). price er tilbudsprisen i kroner som desimaltall. '
      + 'original_price er førprisen hvis den står, ellers null. '
      + 'Mengderabatter som «2 for 50» regnes om til stykkpris (25) og navnet '
      + 'får «(2 for 50)» bakerst. Ta bare med rader der du tydelig ser både '
      + 'navn og pris — dropp alt du er usikker på. Uleselig bilde: svar [].',
    messages: [{
      role: 'user',
      content: [
        isPdf
          ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: image } }
          : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png', data: image } },
        {
          type: 'text' as const,
          text: isPdf
            ? 'Les ut varene og prisene fra ALLE sidene i denne kundeavisen.'
            : 'Les ut varene og prisene fra denne kundeavis-siden.',
        },
      ],
    }],
    });
  } catch (e) {
    // Alltid et JSON-svar MED CORS-hoder — en ubehandlet feil her ser ut
    // som «Failed to send a request» i nettleseren og er umulig å feilsøke.
    const status = (e as { status?: number })?.status;
    console.error(`kundeavis-skann feilet: ${status ?? ''} ${(e as Error)?.message ?? e}`);
    if (status === 401) {
      return json({ error: 'Anthropic-nøkkelen er ugyldig — sjekk ANTHROPIC_API_KEY-secreten.' }, 502, origin);
    }
    if (status === 429) {
      return json({ error: 'KI-tjenesten er opptatt akkurat nå — prøv igjen om et minutt.' }, 502, origin);
    }
    return json({ error: `Klarte ikke å lese avisen: ${(e as Error)?.message ?? 'ukjent feil'}` }, 502, origin);
  }

  if (response.stop_reason === 'refusal') {
    return json({ error: 'Kunne ikke lese dette bildet.' }, 422, origin);
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const raw = extractJsonArray(text) ?? [];
  const rows = raw
    .map((r: any) => ({
      name: String(r?.name ?? '').replace(/\s+/g, ' ').trim(),
      price: Number(r?.price),
      original_price: r?.original_price != null && Number(r.original_price) > Number(r?.price)
        ? Number(r.original_price)
        : null,
    }))
    .filter((r) => r.name.length >= 2 && r.name.length <= 90
      && Number.isFinite(r.price) && r.price >= 1 && r.price <= 3000)
    .slice(0, isPdf ? 200 : 60);   // en hel avis rommer flere varer enn én side

  console.log(`kundeavis-skann: ${rows.length} rader lest`);
  return json({ ok: true, rows }, 200, origin);
});
