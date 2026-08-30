// Edge Function: administrasjon av Plukkelisten.
//
// Gir plattformeieren det som trengs for support: oversiktstall,
// brukerliste med bruk, send passord-reset og slett bruker. Ikke noe
// snoking i innhold — funksjonen leser aldri selve handlelistene, bare
// tellere og medlemskap.
//
// Tilgang: innlogget bruker hvis e-post står i ADMIN_EMAILS-secreten
// (kommaseparert). Uten secreten er panelet stengt for alle.
//
//   supabase functions deploy admin
//   supabase secrets set ADMIN_EMAILS=jon@varmehus.no,jon.leiulfsrud@gmail.com

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

const json = (body: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') ?? '*';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'Bruk POST.' }, 405, origin);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  // Nye API-nøkler (sb_publishable_/sb_secret_ via secrets) foretrekkes;
  // de gamle (anon/service_role) er reserve til legacy-nøklene skrus av.
  const anonKey = Deno.env.get('SB_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // 1) Hvem spør? (vanlig bruker-JWT)
  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await asUser.auth.getUser();
  if (authError || !user) return json({ error: 'Ikke innlogget.' }, 401, origin);

  // 2) Er de admin? Stengt for alle hvis ADMIN_EMAILS ikke er satt.
  // Splitt på komma OG vanlige komma-lookalikes (limt inn fra chat kan gi
  // f.eks. U+00B8 cedilla) — en feiltastet skilletegn skal ikke stenge panelet.
  const admins = (Deno.env.get('ADMIN_EMAILS') ?? '')
    .split(/[,;\s¸‚，]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = admins.includes((user.email ?? '').toLowerCase());
  // Feilsøkingsspor — synlig i dashbordet under Edge Functions → admin → Logs.
  console.log(`admin-sjekk: ${user.email} → ${isAdmin} (${admins.length} adresser i ADMIN_EMAILS)`);

  let body: { action?: string; user_id?: string; email?: string; feedback_id?: string; suggestion_id?: string } = {};
  try { body = await req.json(); } catch { /* tomt body er greit for ping */ }
  const action = body.action ?? 'ping';

  if (action === 'ping') return json({ admin: isAdmin }, 200, origin);
  if (!isAdmin) return json({ error: 'Du har ikke administratortilgang.' }, 403, origin);

  const db = createClient(url, serviceKey);

  if (action === 'stats') {
    const count = async (table: string, filter?: (q: any) => any) => {
      let q = db.from(table).select('*', { count: 'exact', head: true });
      if (filter) q = filter(q);
      const { count: c } = await q;
      return c ?? 0;
    };
    const { data: usersPage } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const users = usersPage?.users ?? [];
    const weekAgo = Date.now() - 7 * 864e5;
    return json({
      stats: {
        users: users.length,
        active_7d: users.filter((u) => u.last_sign_in_at && Date.parse(u.last_sign_in_at) > weekAgo).length,
        households: await count('households'),
        shopping_items: await count('shopping_items'),
        custom_lists: await count('custom_lists'),
        meals: await count('meals'),
        price_observations: await count('price_observations'),
        open_reports: await count('item_reports', (q) => q.eq('status', 'ny')),
      },
    }, 200, origin);
  }

  if (action === 'users') {
    const { data: usersPage, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return json({ error: error.message }, 500, origin);
    const { data: memberships } = await db
      .from('members')
      .select('user_id, display_name, role, households(name)');
    const byUser = new Map<string, { name: string | null; lists: string[] }>();
    (memberships ?? []).forEach((m: any) => {
      const entry = byUser.get(m.user_id) ?? { name: null, lists: [] };
      entry.name = entry.name ?? m.display_name;
      entry.lists.push(`${m.households?.name ?? '?'}${m.role === 'owner' ? ' (admin)' : ''}`);
      byUser.set(m.user_id, entry);
    });
    return json({
      users: (usersPage?.users ?? []).map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        display_name: byUser.get(u.id)?.name ?? null,
        lists: byUser.get(u.id)?.lists ?? [],
      })).sort((a, b) => (b.last_sign_in_at ?? '').localeCompare(a.last_sign_in_at ?? '')),
    }, 200, origin);
  }

  if (action === 'suggestions') {
    const { data, error } = await db
      .from('catalog_suggestions')
      .select('id, suggested_by, name, category, price_estimate, store, status, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return json({ error: error.message }, 500, origin);
    const { data: usersPage } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emailOf = new Map((usersPage?.users ?? []).map((u) => [u.id, u.email]));
    return json({
      suggestions: (data ?? []).map((s) => ({ ...s, email: emailOf.get(s.suggested_by) ?? null })),
    }, 200, origin);
  }

  if (action === 'suggestion_approve' || action === 'suggestion_reject') {
    if (!body.suggestion_id) return json({ error: 'Mangler suggestion_id.' }, 400, origin);
    const { data: sug, error: sugErr } = await db
      .from('catalog_suggestions').select('*').eq('id', body.suggestion_id).single();
    if (sugErr || !sug) return json({ error: 'Fant ikke forslaget.' }, 404, origin);

    let resolution = 'Avvist av administrator.';
    if (action === 'suggestion_approve') {
      // Publiser i fellesdatabasen — finnes navnet fra før røres ingenting.
      const { error: insErr } = await db.from('item_catalog').insert({
        name: sug.name,
        category: sug.category,
        major_category: sug.category,
        is_food: true,
        avg_price: sug.price_estimate,
        price_low: sug.price_estimate,
        price_high: sug.price_estimate,
        primary_store: sug.store,
        frequency_sig: '',
        score: 1,
      });
      if (insErr && !/duplicate|unique/i.test(insErr.message)) {
        return json({ error: insErr.message }, 500, origin);
      }
      resolution = insErr ? 'Fantes allerede i fellesdatabasen.' : 'Publisert i fellesdatabasen.';
    }
    const { error } = await db.from('catalog_suggestions')
      .update({
        status: action === 'suggestion_approve' ? 'godkjent' : 'avvist',
        resolution,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', sug.id);
    if (error) return json({ error: error.message }, 500, origin);
    return json({ ok: true, message: resolution }, 200, origin);
  }

  if (action === 'feedback') {
    const { data, error } = await db
      .from('app_feedback')
      .select('id, user_id, message, kind, context, status, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return json({ error: error.message }, 500, origin);
    // E-post til avsenderne, så admin vet hvem som meldte.
    const { data: usersPage } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emailOf = new Map((usersPage?.users ?? []).map((u) => [u.id, u.email]));
    return json({
      feedback: (data ?? []).map((f) => ({ ...f, email: emailOf.get(f.user_id) ?? null })),
    }, 200, origin);
  }

  if (action === 'feedback_done') {
    if (!body.feedback_id) return json({ error: 'Mangler feedback_id.' }, 400, origin);
    const { error } = await db
      .from('app_feedback')
      .update({ status: 'løst', resolved_at: new Date().toISOString() })
      .eq('id', body.feedback_id);
    if (error) return json({ error: error.message }, 500, origin);
    return json({ ok: true, message: 'Merket som løst.' }, 200, origin);
  }

  if (action === 'reset_password') {
    if (!body.email) return json({ error: 'Mangler e-post.' }, 400, origin);
    const { error } = await asUser.auth.resetPasswordForEmail(body.email, {
      redirectTo: 'https://plukkelisten.no/app/',
    });
    if (error) return json({ error: error.message }, 500, origin);
    return json({ ok: true, message: `Passord-reset sendt til ${body.email}.` }, 200, origin);
  }

  if (action === 'delete_user') {
    if (!body.user_id) return json({ error: 'Mangler user_id.' }, 400, origin);
    if (body.user_id === user.id) return json({ error: 'Du kan ikke slette deg selv herfra.' }, 400, origin);
    // Delte lister der brukeren er alene igjen slettes (ellers ville
    // eierskaps-vernet stoppe slettingen); lister med andre medlemmer består.
    const { data: theirRows } = await db
      .from('members').select('household_id').eq('user_id', body.user_id);
    for (const row of theirRows ?? []) {
      const { count } = await db
        .from('members').select('*', { count: 'exact', head: true })
        .eq('household_id', row.household_id);
      if ((count ?? 0) <= 1) {
        await db.from('households').delete().eq('id', row.household_id);
      }
    }
    const { error } = await db.auth.admin.deleteUser(body.user_id);
    if (error) return json({ error: error.message }, 500, origin);
    return json({ ok: true, message: 'Brukeren er slettet.' }, 200, origin);
  }

  return json({ error: `Ukjent handling: ${action}` }, 400, origin);
});
