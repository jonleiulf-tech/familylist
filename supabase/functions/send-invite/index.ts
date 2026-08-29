// Edge Function: send invitasjon til delt liste på e-post.
//
// POST { email, list_id }  →  { ok, code, expires_at }
//
// Lager engangskoden via create_invite() MED brukerens egen JWT, slik at
// medlemskontrollen skjer i databasen — denne funksjonen tar ingen egne
// avgjørelser om hvem som får invitere.
//
// Sender via Resend (samme konto som SMTP-oppsettet). Secret:
//   supabase secrets set RESEND_API_KEY=<re_...>
// Uten nøkkelen svarer den 501, og appen faller tilbake til å vise lenken.

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inviteHtml(inviter: string, listName: string, link: string, code: string) {
  // Tabellbasert og inline-stilt, som de andre e-postmalene —
  // e-postklienter er ikke nettlesere.
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e6e4e4;margin:0;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#f3f2f2;border:2px solid #201e1d;">
<tr><td style="padding:22px 24px 18px;border-bottom:2px solid #201e1d;">
  <div style="font-family:Archivo,'Helvetica Neue',Arial,sans-serif;font-weight:800;font-size:20px;letter-spacing:-0.015em;color:#201e1d;line-height:1;">PLUKKELISTEN<span style="color:#ec3013;">.</span></div>
</td></tr>
<tr><td style="padding:28px 24px 24px;">
  <h1 style="margin:0 0 14px;font-family:Archivo,'Helvetica Neue',Arial,sans-serif;font-weight:800;font-size:23px;line-height:1.15;color:#201e1d;">Invitasjon til delt liste</h1>
  <p style="margin:0 0 22px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:#201e1d;">
    <strong>${esc(inviter)}</strong> har invitert deg til
    «<strong>${esc(listName)}</strong>» på Plukkelisten. Dere deler handleliste
    i sanntid — legger den ene til noe, ser den andre det med én gang.
  </p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
    <tr><td style="background:#ec3013;">
      <a href="${esc(link)}" style="display:inline-block;padding:14px 22px;font-family:Archivo,'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Bli med i listen</a>
    </td></tr>
  </table>
  <p style="margin:0 0 6px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#625c59;">Virker ikke knappen, bruk koden i appen:</p>
  <p style="margin:0 0 20px;font-family:'Courier New',monospace;font-size:15px;letter-spacing:2px;color:#201e1d;">${esc(code)}</p>
  <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.5;color:#625c59;">Invitasjonen kan brukes én gang og utløper etter 7 dager. Var den ikke ment for deg, kan du bare slette denne e-posten.</p>
</td></tr>
<tr><td style="padding:16px 24px;border-top:2px solid #201e1d;background:#e6e4e4;">
  <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#625c59;">Plukkelisten · <a href="https://plukkelisten.no" style="color:#ec3013;text-decoration:none;">plukkelisten.no</a></p>
</td></tr>
</table>
</td></tr></table>`;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') ?? '*';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'Kun POST er støttet.' }, 405, origin);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: 'Ikke innlogget.' }, 401, origin);

  let body: { email?: string; list_id?: string };
  try { body = await req.json(); }
  catch { return json({ error: 'Ugyldig forespørsel.' }, 400, origin); }

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json({ error: 'Det ligner ikke på en e-postadresse.' }, 400, origin);
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    return json({ error: 'E-postutsending er ikke satt opp ennå.', code: 'NO_MAILER' }, 501, origin);
  }

  // Koden lages under brukerens identitet: create_invite avviser selv
  // alle som ikke er medlem av listen.
  const { data: inviteData, error: invErr } = await supabase.rpc('create_invite', {
    list_id: body.list_id ?? null,
  });
  if (invErr) return json({ error: invErr.message }, 403, origin);
  const invite = Array.isArray(inviteData) ? inviteData[0] : inviteData;
  if (!invite?.code) return json({ error: 'Kunne ikke lage invitasjon.' }, 500, origin);

  // Navn på liste og avsender, til e-postteksten.
  const [{ data: list }, { data: profile }] = await Promise.all([
    supabase.from('households').select('name').eq('id', body.list_id).maybeSingle(),
    supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
  ]);
  const inviter = profile?.display_name ?? 'Noen';
  const listName = list?.name ?? 'en delt liste';
  const link = `https://plukkelisten.no/app/?invite=${invite.code}`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Plukkelisten <noreply@plukkelisten.no>',
      to: [email],
      subject: `${inviter} har invitert deg til «${listName}»`,
      html: inviteHtml(inviter, listName, link, invite.code),
    }),
  });

  if (!r.ok) {
    console.error(`Resend svarte ${r.status}`);
    return json({ error: 'Kunne ikke sende e-posten akkurat nå.' }, 502, origin);
  }

  return json({ ok: true, code: invite.code, expires_at: invite.expires_at }, 200, origin);
});
